"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEventState } from "@/actions/events";
import type { EventPublicState } from "@/lib/event";
import { EVENT_POLL_MS } from "./event-view-state";

/**
 * Repli POLLING primaire (cf. brief backend) : interroge getEventState toutes
 * les ~2,5 s pour rafraîchir l'EventPublicState d'une session. Le Realtime est
 * optionnel et désactivé par défaut — ce hook fait TOUT fonctionner sans lui.
 *
 * Robustesse d'écran de salle : une réponse `unavailable` ponctuelle (réseau
 * instable) ne remplace PAS le dernier état sain — on garde la dernière photo à
 * l'écran plutôt que d'effacer la partie en cours. Le polling est suspendu quand
 * l'onglet est masqué et relancé immédiatement au retour au premier plan.
 *
 * Renvoie l'état courant + un `refresh()` impératif (à appeler après une action
 * joueur/organisateur pour resynchroniser sans attendre le prochain tick).
 */
export function useEventPoll(
  sessionId: string,
  initial: EventPublicState,
): { state: EventPublicState; refresh: () => void } {
  const [state, setState] = useState<EventPublicState>(initial);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await getEventState({ sessionId });
      // On ne pise une partie en cours pour une indispo passagère : seul un état
      // sain remplace la dernière photo (miroir mode TV pronos).
      if (next.state === "ok") setState(next);
    } catch {
      // Réseau coupé : la dernière photo reste à l'écran.
    } finally {
      inFlight.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void fetchOnce();
    };
    const id = window.setInterval(tick, EVENT_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Premier tick amorcé hors du corps synchrone de l'effet (aucun setState
    // synchrone en montage) : l'écran ne reste pas sur les props initiales.
    const kickoff = window.setTimeout(tick, 0);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { state, refresh };
}
