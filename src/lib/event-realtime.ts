import "server-only";

import { optionalEnv } from "@/lib/env";
import {
  EVENT_REALTIME_REFRESH,
  eventChannelName,
  eventRefreshRevision,
} from "@/lib/event-realtime-contract";
import { reportError } from "@/lib/monitoring";

export { EVENT_REALTIME_REFRESH, eventChannelName };

/**
 * Realtime is only a latency optimization. Public Broadcast messages are
 * untrusted invalidations; every client re-reads the filtered server RPC and
 * retains adaptive polling as its safety net.
 */
export function eventRealtimeEnabled(): boolean {
  const flag = optionalEnv("EVENTS_REALTIME_ENABLED");
  return flag === "1" || flag === "true";
}

/**
 * Broadcast one monotonic revision after a public state transition.
 *
 * Best effort by design: a Realtime failure never fails the organizer action.
 * No question, answer, score, token or other business state enters the payload.
 */
export async function broadcastEventRefresh(
  sessionId: string,
  revision: number,
): Promise<void> {
  if (!eventRealtimeEnabled() || eventRefreshRevision({ revision }) === null) return;

  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: eventChannelName(sessionId),
            event: EVENT_REALTIME_REFRESH,
            payload: { revision },
            private: false,
          },
        ],
      }),
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) reportError("event.broadcast", `HTTP ${res.status}`);
  } catch (err) {
    reportError("event.broadcast", err);
  }
}
