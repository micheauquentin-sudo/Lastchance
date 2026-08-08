import { describe, expect, it } from "vitest";
import {
  EVENT_LOBBY_BUDGET_RPS,
  EVENT_POLL_MAX_MS,
  EVENT_REFRESH_COALESCE_MS,
  eventChannelName,
  eventLobbyDelay,
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

  // ────────────────────────────────────────────────────────────
  // La cadence du lobby suit la JAUGE, parce qu'à cadence fixe le trafic
  // d'une salle croît avec elle. Une salle de 1 000 toutes les 5 s fait
  // 200 req/s — au-delà de ce que la pile encaisse (perf-report §7), et le
  // lobby est justement le moment où toute la salle est présente.
  //
  // Ce n'est PAS un abandon de la fraîcheur voulue par le test ci-dessus :
  // une salle de 100 garde ses 5 s. On ne relâche que là où ne pas relâcher
  // signifierait ne pas répondre du tout.
  // ────────────────────────────────────────────────────────────
  it("garde 5 s pour une petite salle : la fraîcheur n'y coûte rien", () => {
    expect(eventLobbyDelay(100)).toBe(5_000);
    expect(eventPollDelay("lobby", true, 0, 100)).toBe(5_000);
  });

  it("relâche la cadence des grandes salles pour tenir le budget", () => {
    // 500 / 50 req/s = 10 s ; 1000 / 50 = 20 s.
    expect(eventLobbyDelay(500)).toBe(10_000);
    expect(eventLobbyDelay(1_000)).toBe(20_000);
  });

  it("borne le trafic agrégé du lobby, quelle que soit la jauge", () => {
    for (const jauge of [100, 500, 1_000]) {
      const debit = jauge / (eventLobbyDelay(jauge) / 1_000);
      expect(debit).toBeLessThanOrEqual(EVENT_LOBBY_BUDGET_RPS);
    }
  });

  it("ne descend jamais sous le plancher ni au-dessus du plafond", () => {
    // Jauge absurde ou absente : on retombe sur le comportement historique.
    expect(eventLobbyDelay(0)).toBe(5_000);
    expect(eventLobbyDelay(Number.NaN)).toBe(5_000);
    // Une jauge démesurée reste bornée par l'intervalle de sûreté.
    expect(eventLobbyDelay(10_000_000)).toBe(EVENT_POLL_MAX_MS);
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
