"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEventState } from "@/actions/events";
import type { EventPublicState } from "@/lib/event";
import {
  EVENT_REALTIME_REFRESH,
  EVENT_REFRESH_COALESCE_MS,
  eventChannelName,
  eventPollDelay,
  eventRefreshRevision,
} from "@/lib/event-realtime-contract";
import { createClient } from "@/lib/supabase/client";

/**
 * Supabase Broadcast lowers transition latency, while adaptive polling remains
 * authoritative and fully functional when Realtime is disabled or unavailable.
 * Broadcast payloads are public/untrusted: they only request a coalesced re-read
 * through getEventState, which applies the server-side security boundary.
 */
/**
 * Nombre d'échecs consécutifs à partir duquel l'écran se DÉCLARE désynchronisé.
 *
 * Un échec isolé est la vie normale d'un téléphone en salle (réseau saturé) et
 * le poll suivant le rattrape : l'annoncer serait du bruit. Deux d'affilée, en
 * revanche, veulent dire que l'écran affiche un état périmé sans le dire — le
 * joueur croit la question toujours ouverte alors que la salle est passée à la
 * suivante.
 */
const EVENT_DESYNC_FAILURES = 2;

export function useEventPoll(
  sessionId: string,
  initial: EventPublicState,
  realtimeEnabled = false,
): { state: EventPublicState; refresh: () => void; desynchronise: boolean } {
  const [state, setState] = useState<EventPublicState>(initial);
  // Miroir en STATE du compteur d'échecs : `failureCountRef` pilote la cadence
  // du poll et ne provoque aucun rendu — un bandeau branché dessus ne
  // s'afficherait jamais.
  const [desynchronise, setDesynchronise] = useState(false);
  const stateRef = useRef(initial);
  const mountedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const failureCountRef = useRef(0);
  const realtimeConnectedRef = useRef(false);
  const lastFetchStartedAtRef = useRef(0);
  const pendingRevisionRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const schedulePollRef = useRef<(immediate?: boolean) => void>(() => undefined);

  const noteFailure = useCallback(() => {
    failureCountRef.current = Math.min(failureCountRef.current + 1, 4);
    if (failureCountRef.current >= EVENT_DESYNC_FAILURES && mountedRef.current) {
      setDesynchronise(true);
    }
  }, []);

  const fetchOnce = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;

    const task = (async () => {
      lastFetchStartedAtRef.current = Date.now();
      try {
        const next = await getEventState({ sessionId });
        if (next.state === "ok") {
          failureCountRef.current = 0;
          if (mountedRef.current) setDesynchronise(false);
          stateRef.current = next;
          const revision = next.session?.revision ?? 0;
          if (
            pendingRevisionRef.current !== null &&
            revision >= pendingRevisionRef.current
          ) {
            pendingRevisionRef.current = null;
          }
          if (mountedRef.current) setState(next);
        } else {
          noteFailure();
        }
      } catch {
        noteFailure();
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, [noteFailure, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;

    const schedule = (immediate = false) => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
      }
      if (disposed) return;

      const phase = stateRef.current.session?.phase ?? "lobby";
      // La jauge pilote la cadence du lobby : une salle vendue pour 1 000 ne
      // peut pas se rafraîchir au même rythme qu'une salle de 100 sans saturer
      // la pile (`docs/perf-report.md` §7). 100 par défaut = comportement
      // historique tant que l'état n'est pas encore chargé.
      const jauge = stateRef.current.session?.maxParticipants ?? 100;
      const delay = immediate
        ? 0
        : eventPollDelay(
            phase,
            realtimeConnectedRef.current,
            failureCountRef.current,
            jauge,
          );
      pollTimerRef.current = window.setTimeout(async () => {
        pollTimerRef.current = null;
        if (!document.hidden) await fetchOnce();
        schedule();
      }, delay);
    };

    schedulePollRef.current = schedule;
    schedule(true);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void fetchOnce().finally(() => schedule());
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      mountedRef.current = false;
      schedulePollRef.current = () => undefined;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchOnce]);

  useEffect(() => {
    if (!realtimeEnabled) return;

    // Realtime raccourcit le délai de rafraîchissement, mais le polling reste
    // la source de vérité. Une configuration navigateur incomplète (URL/clé
    // publique absente) ne doit donc jamais faire tomber la télécommande après
    // son premier rendu : `createBrowserClient` lève dans ce cas précis.
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    let disposed = false;
    let refreshTimer: number | null = null;

    const queueRefresh = () => {
      if (disposed || document.hidden || refreshTimer !== null) return;
      const elapsed = Date.now() - lastFetchStartedAtRef.current;
      const delay = Math.max(0, EVENT_REFRESH_COALESCE_MS - elapsed);

      refreshTimer = window.setTimeout(async () => {
        refreshTimer = null;
        if (pendingRevisionRef.current === null) return;
        await fetchOnce();
        schedulePollRef.current();

        // A forged/future revision can keep the safe fallback active, but never
        // faster than the normal 2.5 s poll and never with concurrent requests.
        if (pendingRevisionRef.current !== null) queueRefresh();
      }, delay);
    };

    try {
      const channel = supabase
        .channel(eventChannelName(sessionId), {
          config: { broadcast: { self: false } },
        })
        .on(
          "broadcast",
          { event: EVENT_REALTIME_REFRESH },
          ({ payload }: { payload: unknown }) => {
            const revision = eventRefreshRevision(payload);
            const currentRevision = stateRef.current.session?.revision ?? 0;
            if (
              revision === null ||
              revision <= currentRevision ||
              (pendingRevisionRef.current !== null &&
                revision <= pendingRevisionRef.current)
            ) {
              return;
            }
            pendingRevisionRef.current = revision;
            queueRefresh();
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          const connected = status === "SUBSCRIBED";
          if (connected !== realtimeConnectedRef.current) {
            realtimeConnectedRef.current = connected;
            schedulePollRef.current(!connected);
          }
        });

      const onVisibilityChange = () => {
        if (!document.hidden && pendingRevisionRef.current !== null) queueRefresh();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        disposed = true;
        realtimeConnectedRef.current = false;
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        void supabase.removeChannel(channel);
      };
    } catch {
      return;
    }
  }, [fetchOnce, realtimeEnabled, sessionId]);

  const refresh = useCallback(() => {
    void fetchOnce().finally(() => schedulePollRef.current());
  }, [fetchOnce]);

  return { state, refresh, desynchronise };
}
