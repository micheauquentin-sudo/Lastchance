import { describe, expect, it } from "vitest";
import {
  EVENT_POLL_MAX_MS,
  EVENT_REFRESH_COALESCE_MS,
  eventChannelName,
  eventPollDelay,
  eventRefreshRevision,
} from "./event-realtime-contract";

describe("event realtime contract", () => {
  it("scopes every channel to one session", () => {
    expect(eventChannelName("session-id")).toBe("event:session-id");
  });

  it("accepts only a non-negative safe integer revision", () => {
    expect(eventRefreshRevision({ revision: 0 })).toBe(0);
    expect(eventRefreshRevision({ revision: 42 })).toBe(42);

    for (const payload of [
      null,
      {},
      { revision: "42" },
      { revision: -1 },
      { revision: 1.5 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(eventRefreshRevision(payload)).toBeNull();
    }
  });

  it("keeps lobby participants fresh even when Realtime is connected", () => {
    expect(eventPollDelay("lobby", true, 0)).toBe(5_000);
    expect(eventPollDelay("question_active", true, 0)).toBe(EVENT_POLL_MAX_MS);
  });

  it("backs off failures without exceeding the safety interval", () => {
    expect(eventPollDelay("question_active", false, 0)).toBe(2_500);
    expect(eventPollDelay("question_active", false, 2)).toBe(10_000);
    expect(eventPollDelay("question_active", false, 99)).toBe(EVENT_POLL_MAX_MS);
    expect(eventPollDelay("ended", false, 0)).toBe(EVENT_POLL_MAX_MS);
  });

  it("caps broadcast-triggered refreshes at the fastest fallback rate", () => {
    expect(EVENT_REFRESH_COALESCE_MS).toBeGreaterThanOrEqual(
      eventPollDelay("question_active", false, 0),
    );
  });
});
