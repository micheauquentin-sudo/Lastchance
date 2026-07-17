import { describe, expect, it } from "vitest";
import {
  hasSchedule,
  selectActiveWheel,
  wheelMatchesNow,
  type ScheduledWheel,
} from "./wheel-schedule";

function wheel(over: Partial<ScheduledWheel>): ScheduledWheel {
  return {
    id: over.id ?? "w",
    position: over.position ?? 0,
    created_at: over.created_at ?? "2026-01-01T00:00:00Z",
    schedule_start_hour: over.schedule_start_hour ?? null,
    schedule_end_hour: over.schedule_end_hour ?? null,
    schedule_days: over.schedule_days ?? null,
  };
}

// Instants UTC explicites : tests identiques quel que soit le fuseau de la CI.
const monday18 = new Date("2026-07-13T18:00:00Z");
const monday10 = new Date("2026-07-13T10:00:00Z");
const sunday18 = new Date("2026-07-12T18:00:00Z");

describe("hasSchedule", () => {
  it("faux si aucune borne", () => {
    expect(hasSchedule(wheel({}))).toBe(false);
  });
  it("vrai si une heure ou des jours sont posés", () => {
    expect(hasSchedule(wheel({ schedule_start_hour: 17 }))).toBe(true);
    expect(hasSchedule(wheel({ schedule_days: [1, 2] }))).toBe(true);
  });
});

describe("wheelMatchesNow", () => {
  it("roue sans créneau : toujours active", () => {
    expect(wheelMatchesNow(wheel({}), monday18)).toBe(true);
  });
  it("plage horaire simple 17→19", () => {
    const w = wheel({ schedule_start_hour: 17, schedule_end_hour: 19 });
    expect(wheelMatchesNow(w, monday18)).toBe(true);
    expect(wheelMatchesNow(w, monday10)).toBe(false);
  });
  it("borne de fin exclusive", () => {
    const w = wheel({ schedule_start_hour: 17, schedule_end_hour: 18 });
    expect(wheelMatchesNow(w, monday18)).toBe(false); // 18h exclu
  });
  it("créneau de nuit 22→2", () => {
    const w = wheel({ schedule_start_hour: 22, schedule_end_hour: 2 });
    expect(wheelMatchesNow(w, new Date("2026-07-13T23:00:00Z"))).toBe(true);
    expect(wheelMatchesNow(w, new Date("2026-07-13T01:00:00Z"))).toBe(true);
    expect(wheelMatchesNow(w, new Date("2026-07-13T12:00:00Z"))).toBe(false);
  });
  it("filtre par jours (lundi=1)", () => {
    const w = wheel({ schedule_days: [1, 2, 3, 4, 5] });
    expect(wheelMatchesNow(w, monday18)).toBe(true);
    expect(wheelMatchesNow(w, sunday18)).toBe(false);
  });
  it("jours + heures combinés", () => {
    const w = wheel({ schedule_days: [1], schedule_start_hour: 17, schedule_end_hour: 19 });
    expect(wheelMatchesNow(w, monday18)).toBe(true);
    expect(wheelMatchesNow(w, monday10)).toBe(false);
    expect(wheelMatchesNow(w, sunday18)).toBe(false);
  });
});

describe("selectActiveWheel", () => {
  it("null si aucune roue", () => {
    expect(selectActiveWheel([])).toBeNull();
  });

  it("la roue planifiée prime sur la roue par défaut pendant son créneau", () => {
    const dflt = wheel({ id: "default", position: 0 });
    const happy = wheel({ id: "happy", position: 1, schedule_start_hour: 17, schedule_end_hour: 19 });
    expect(selectActiveWheel([dflt, happy], monday18)?.id).toBe("happy");
  });

  it("retombe sur la roue par défaut hors créneau", () => {
    const dflt = wheel({ id: "default", position: 0 });
    const happy = wheel({ id: "happy", position: 1, schedule_start_hour: 17, schedule_end_hour: 19 });
    expect(selectActiveWheel([dflt, happy], monday10)?.id).toBe("default");
  });

  it("entre deux roues planifiées qui matchent, la position tranche", () => {
    const a = wheel({ id: "a", position: 2, schedule_start_hour: 8, schedule_end_hour: 20 });
    const b = wheel({ id: "b", position: 1, schedule_start_hour: 17, schedule_end_hour: 19 });
    expect(selectActiveWheel([a, b], monday18)?.id).toBe("b");
  });

  it("aucune ne matche et pas de roue par défaut : jeu indisponible", () => {
    const a = wheel({ id: "a", position: 1, schedule_start_hour: 8, schedule_end_hour: 9 });
    const b = wheel({ id: "b", position: 0, schedule_start_hour: 10, schedule_end_hour: 11 });
    expect(selectActiveWheel([a, b], monday18)).toBeNull();
  });
});
