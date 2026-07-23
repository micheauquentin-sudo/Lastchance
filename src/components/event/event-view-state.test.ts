import { describe, expect, it } from "vitest";
import type {
  EventDistributionEntry,
  EventLeaderboardEntry,
} from "@/lib/event";
import {
  computeCountdown,
  computeDistribution,
  eventQuestionTypeMeta,
  podiumEntries,
  sortLeaderboard,
  viewForPhase,
} from "./event-view-state";

describe("viewForPhase", () => {
  it("réduit chaque phase à sa vue", () => {
    expect(viewForPhase("lobby")).toBe("lobby");
    expect(viewForPhase("question_active")).toBe("question");
    expect(viewForPhase("question_locked")).toBe("locked");
    expect(viewForPhase("reveal")).toBe("reveal");
    expect(viewForPhase("leaderboard")).toBe("leaderboard");
    expect(viewForPhase("ended")).toBe("ended");
  });
});

describe("computeCountdown", () => {
  it("calcule secondes et fractions restantes en cours de question", () => {
    const start = "2026-07-23T20:00:00.000Z";
    const now = Date.parse(start) + 10_000; // 10 s écoulées sur 30 s
    const c = computeCountdown(start, 30, now);
    expect(c.secondsLeft).toBe(20);
    expect(c.remainingRatio).toBeCloseTo(20 / 30);
    expect(c.elapsedRatio).toBeCloseTo(10 / 30);
    expect(c.expired).toBe(false);
  });

  it("borne à zéro une fois le temps écoulé", () => {
    const start = "2026-07-23T20:00:00.000Z";
    const now = Date.parse(start) + 45_000; // au-delà des 30 s
    const c = computeCountdown(start, 30, now);
    expect(c.secondsLeft).toBe(0);
    expect(c.msLeft).toBe(0);
    expect(c.remainingRatio).toBe(0);
    expect(c.expired).toBe(true);
  });

  it("startedAt absent → chrono plein, non expiré (pas de barre trompeuse)", () => {
    const c = computeCountdown(null, 30, Date.now());
    expect(c.secondsLeft).toBe(30);
    expect(c.remainingRatio).toBe(1);
    expect(c.expired).toBe(false);
  });

  it("startedAt illisible → repli plein sans NaN", () => {
    const c = computeCountdown("pas une date", 20, Date.now());
    expect(Number.isNaN(c.secondsLeft)).toBe(false);
    expect(c.remainingRatio).toBe(1);
    expect(c.expired).toBe(false);
  });

  it("timeLimit nul → aucune division par zéro", () => {
    const c = computeCountdown("2026-07-23T20:00:00.000Z", 0, Date.now());
    expect(c.secondsLeft).toBe(0);
    expect(Number.isNaN(c.remainingRatio)).toBe(false);
    expect(c.expired).toBe(false);
  });
});

function dist(
  over: Array<Partial<EventDistributionEntry>>,
): EventDistributionEntry[] {
  return over.map((o, i) => ({
    optionId: o.optionId ?? `opt-${i}`,
    label: o.label ?? `Option ${i}`,
    position: o.position ?? i,
    votes: o.votes ?? 0,
  }));
}

describe("computeDistribution", () => {
  it("calcule les pourcentages et repère le maximum", () => {
    const d = computeDistribution(
      dist([
        { optionId: "a", votes: 3, position: 0 },
        { optionId: "b", votes: 1, position: 1 },
      ]),
    );
    expect(d.totalVotes).toBe(4);
    expect(d.bars[0].percent).toBe(75);
    expect(d.bars[0].isTop).toBe(true);
    expect(d.bars[1].percent).toBe(25);
    expect(d.bars[1].isTop).toBe(false);
  });

  it("total nul → tous à 0 %, aucun top, pas de NaN", () => {
    const d = computeDistribution(
      dist([{ optionId: "a", votes: 0 }, { optionId: "b", votes: 0 }]),
    );
    expect(d.totalVotes).toBe(0);
    expect(d.bars.every((b) => b.percent === 0)).toBe(true);
    expect(d.bars.every((b) => b.isTop === false)).toBe(true);
  });

  it("répartition null → aucune barre", () => {
    const d = computeDistribution(null);
    expect(d.bars).toHaveLength(0);
    expect(d.totalVotes).toBe(0);
  });

  it("trie par position quel que soit l'ordre d'entrée", () => {
    const d = computeDistribution(
      dist([
        { optionId: "b", votes: 1, position: 2 },
        { optionId: "a", votes: 1, position: 0 },
      ]),
    );
    expect(d.bars.map((b) => b.optionId)).toEqual(["a", "b"]);
  });

  it("ex æquo au sommet → toutes les options en tête marquées", () => {
    const d = computeDistribution(
      dist([{ optionId: "a", votes: 2 }, { optionId: "b", votes: 2 }]),
    );
    expect(d.bars.every((b) => b.isTop)).toBe(true);
  });
});

function board(
  over: Array<Partial<EventLeaderboardEntry>>,
): EventLeaderboardEntry[] {
  return over.map((o, i) => ({
    pseudo: o.pseudo ?? `J${i}`,
    avatar: o.avatar ?? "renard",
    score: o.score ?? 0,
    rank: o.rank ?? i + 1,
  }));
}

describe("sortLeaderboard", () => {
  it("trie par rang croissant", () => {
    const sorted = sortLeaderboard(
      board([
        { pseudo: "C", rank: 3 },
        { pseudo: "A", rank: 1 },
        { pseudo: "B", rank: 2 },
      ]),
    );
    expect(sorted.map((e) => e.pseudo)).toEqual(["A", "B", "C"]);
  });

  it("départage un rang égal par score décroissant", () => {
    const sorted = sortLeaderboard(
      board([
        { pseudo: "A", rank: 1, score: 10 },
        { pseudo: "B", rank: 1, score: 30 },
      ]),
    );
    expect(sorted[0].pseudo).toBe("B");
  });

  it("n'altère pas la liste d'entrée", () => {
    const input = board([{ pseudo: "B", rank: 2 }, { pseudo: "A", rank: 1 }]);
    const snapshot = input.map((e) => e.pseudo);
    sortLeaderboard(input);
    expect(input.map((e) => e.pseudo)).toEqual(snapshot);
  });
});

describe("podiumEntries", () => {
  it("renvoie au plus trois entrées, triées", () => {
    const podium = podiumEntries(
      board([
        { pseudo: "D", rank: 4 },
        { pseudo: "A", rank: 1 },
        { pseudo: "C", rank: 3 },
        { pseudo: "B", rank: 2 },
      ]),
    );
    expect(podium.map((e) => e.pseudo)).toEqual(["A", "B", "C"]);
  });
});

describe("eventQuestionTypeMeta", () => {
  it("donne un libellé, un indice et un emoji par type", () => {
    expect(eventQuestionTypeMeta("quiz").label).toBe("Quiz");
    expect(eventQuestionTypeMeta("poll").label).toBe("Sondage");
    expect(eventQuestionTypeMeta("prono").label).toBe("Pronostic");
    expect(eventQuestionTypeMeta("quiz").hint.length).toBeGreaterThan(0);
  });
});
