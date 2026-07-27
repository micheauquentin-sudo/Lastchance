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
 * Adaptive fallback interval. Realtime only relaxes phases whose public data
 * changes on state transitions; the lobby keeps polling for new participants.
 */
export function eventPollDelay(
  phase: EventSessionPhase,
  realtimeConnected: boolean,
  consecutiveFailures: number,
): number {
  const base =
    phase === "lobby"
      ? 5_000
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
