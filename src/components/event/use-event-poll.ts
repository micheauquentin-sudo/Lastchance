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
export function useEventPoll(
  sessionId: string,
  initial: EventPublicState,
  realtimeEnabled = false,
): { state: EventPublicState; refresh: () => void } {
  const [state, setState] = useState<EventPublicState>(initial);
  const stateRef = useRef(initial);
  const mountedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const failureCountRef = useRef(0);
  const realtimeConnectedRef = useRef(false);
  const lastFetchStartedAtRef = useRef(0);
  const pendingRevisionRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const schedulePollRef = useRef<(immediate?: boolean) => void>(() => undefined);

  const fetchOnce = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;

    const task = (async () => {
      lastFetchStartedAtRef.current = Date.now();
      try {
        const next = await getEventState({ sessionId });
        if (next.state === "ok") {
          failureCountRef.current = 0;
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
          failureCountRef.current = Math.min(failureCountRef.current + 1, 4);
        }
      } catch {
        failureCountRef.current = Math.min(failureCountRef.current + 1, 4);
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;

    const schedule = (immediate = false) => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
      }
      if (disposed) return;

      const phase = stateRef.current.session?.phase ?? "lobby";
      const delay = immediate
        ? 0
        : eventPollDelay(
            phase,
            realtimeConnectedRef.current,
            failureCountRef.current,
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

    const supabase = createClient();
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
  }, [fetchOnce, realtimeEnabled, sessionId]);

  const refresh = useCallback(() => {
    void fetchOnce().finally(() => schedulePollRef.current());
  }, [fetchOnce]);

  return { state, refresh };
}
