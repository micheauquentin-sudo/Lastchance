import type { EventSessionPhase } from "@/types/database";

/** Public Broadcast topic used only as an untrusted invalidation signal. */
export function eventChannelName(sessionId: string): string {
  return `event:${sessionId}`;
}

export const EVENT_REALTIME_REFRESH = "refresh";

/** A hostile/public broadcaster must not trigger more traffic than fallback polling. */
export const EVENT_REFRESH_COALESCE_MS = 2_500;
export const EVENT_POLL_MAX_MS = 30_000;

/** Decode the only accepted payload field. Business state is always re-read server-side. */
export function eventRefreshRevision(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const revision = (payload as Record<string, unknown>).revision;
  return typeof revision === "number" &&
    Number.isSafeInteger(revision) &&
    revision >= 0
    ? revision
    : null;
}

/**
 * BUDGET DE REQUÊTES D'UNE SALLE EN LOBBY, en requêtes par seconde.
 *
 * Le lobby est le seul écran dont la fraîcheur ne dépend PAS d'une diffusion :
 * l'arrivée d'un joueur n'émet aucun broadcast (et ne doit pas en émettre —
 * mille arrivées × mille destinataires feraient un million de messages pour un
 * seul remplissage, quand l'offre Supabase en donne deux millions par MOIS).
 * Le démarrage de la partie, lui, est bien diffusé : le poll du lobby ne sert
 * donc qu'à rafraîchir la liste des présents, jamais le départ du jeu.
 *
 * À cadence fixe, le trafic d'un lobby croît avec la salle : 1 000 joueurs
 * toutes les 5 s font 200 req/s, au-delà de ce que la pile encaisse
 * (`docs/perf-report.md` §7). D'où ce budget : la cadence s'ajuste pour que le
 * total reste borné, quelle que soit la jauge vendue.
 */
export const EVENT_LOBBY_BUDGET_RPS = 50;

/** Cadence du lobby historique, plancher pour les petites salles. */
const EVENT_LOBBY_BASE_MS = 5_000;

/**
 * Cadence de rafraîchissement du lobby pour une jauge donnée.
 *
 * Une salle de 100 garde les 5 s d'origine — la fraîcheur voulue par le
 * `it("keeps lobby participants fresh…")` n'est pas sacrifiée là où elle ne
 * coûte rien. Une salle de 1 000 passe à 20 s : voir la liste des présents
 * bouger toutes les vingt secondes est un moindre mal comparé à une salle qui
 * ne répond plus du tout.
 */
export function eventLobbyDelay(maxParticipants: number): number {
  const jauge =
    Number.isFinite(maxParticipants) && maxParticipants > 0
      ? Math.trunc(maxParticipants)
      : 100;
  const requis = Math.ceil(jauge / EVENT_LOBBY_BUDGET_RPS) * 1_000;
  return Math.min(Math.max(requis, EVENT_LOBBY_BASE_MS), EVENT_POLL_MAX_MS);
}

/**
 * Adaptive fallback interval. Realtime only relaxes phases whose public data
 * changes on state transitions; the lobby keeps polling for new participants —
 * mais à une cadence désormais dérivée de la jauge (voir `eventLobbyDelay`).
 *
 * `maxParticipants` par défaut à 100 : un appelant qui l'ignore obtient
 * exactement le comportement historique.
 */
export function eventPollDelay(
  phase: EventSessionPhase,
  realtimeConnected: boolean,
  consecutiveFailures: number,
  maxParticipants = 100,
): number {
  const base =
    phase === "lobby"
      ? eventLobbyDelay(maxParticipants)
      : realtimeConnected
        ? EVENT_POLL_MAX_MS
        : phase === "question_active" || phase === "question_locked"
          ? 2_500
          : phase === "reveal" || phase === "leaderboard"
            ? 5_000
            : EVENT_POLL_MAX_MS;
  const failures = Math.max(0, Math.min(Math.trunc(consecutiveFailures), 4));
  return Math.min(base * 2 ** failures, EVENT_POLL_MAX_MS);
}
