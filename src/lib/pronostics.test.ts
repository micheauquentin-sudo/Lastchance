import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORING,
  generatePlayerToken,
  hashPlayerToken,
  isPredictionOpen,
  parseRewards,
  parseScoring,
  rankPlayers,
  rewardForRank,
  scorePrediction,
} from "./pronostics";
import {
  registerPlayerSchema,
  updateContestRewardsSchema,
} from "./validations/pronostics";

describe("parseScoring", () => {
  it("retourne le barème par défaut sur une valeur invalide", () => {
    expect(parseScoring(null)).toEqual(DEFAULT_SCORING);
    expect(parseScoring("junk")).toEqual(DEFAULT_SCORING);
    expect(parseScoring([])).toEqual({ exact: 3, diff: 2, winner: 1 });
  });

  it("lit un barème valide", () => {
    expect(parseScoring({ exact: 5, diff: 3, winner: 1 })).toEqual({
      exact: 5,
      diff: 3,
      winner: 1,
    });
  });

  it("remplace champ par champ les valeurs invalides", () => {
    expect(parseScoring({ exact: -1, diff: 2.5, winner: 4 })).toEqual({
      exact: 3,
      diff: 2,
      winner: 4,
    });
  });
});

describe("scorePrediction", () => {
  const scoring = { exact: 3, diff: 2, winner: 1 };

  it("paie le score exact", () => {
    expect(scorePrediction(scoring, { home: 2, away: 1 }, { home: 2, away: 1 })).toBe(3);
    expect(scorePrediction(scoring, { home: 0, away: 0 }, { home: 0, away: 0 })).toBe(3);
  });

  it("paie la bonne différence sans le score exact", () => {
    // prono 2-1, réel 3-2 : diff +1 des deux côtés
    expect(scorePrediction(scoring, { home: 3, away: 2 }, { home: 2, away: 1 })).toBe(2);
    // nul prédit avec le mauvais score
    expect(scorePrediction(scoring, { home: 2, away: 2 }, { home: 0, away: 0 })).toBe(2);
  });

  it("paie le bon vainqueur sans la différence", () => {
    expect(scorePrediction(scoring, { home: 3, away: 0 }, { home: 1, away: 0 })).toBe(1);
    expect(scorePrediction(scoring, { home: 0, away: 2 }, { home: 0, away: 1 })).toBe(1);
  });

  it("ne paie rien sur un mauvais vainqueur", () => {
    expect(scorePrediction(scoring, { home: 2, away: 0 }, { home: 0, away: 1 })).toBe(0);
    expect(scorePrediction(scoring, { home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0);
  });
});

describe("parseRewards / rewardForRank", () => {
  it("ignore les entrées invalides", () => {
    expect(parseRewards(null)).toEqual([]);
    expect(
      parseRewards([
        { from: 1, to: 3, label: "Repas offert" },
        { from: 0, to: 2, label: "invalide (from < 1)" },
        { from: 3, to: 1, label: "invalide (to < from)" },
        { from: 4, to: 4, label: "   " },
        "junk",
      ]),
    ).toEqual([{ from: 1, to: 3, label: "Repas offert" }]);
  });

  it("associe un rang à sa récompense", () => {
    const rewards = parseRewards([
      { from: 1, to: 1, label: "Champagne" },
      { from: 2, to: 3, label: "Café offert" },
    ]);
    expect(rewardForRank(rewards, 1)).toBe("Champagne");
    expect(rewardForRank(rewards, 2)).toBe("Café offert");
    expect(rewardForRank(rewards, 3)).toBe("Café offert");
    expect(rewardForRank(rewards, 4)).toBeNull();
  });
});

describe("rankPlayers", () => {
  it("classe par points décroissants", () => {
    const ranked = rankPlayers(
      [{ n: "a", p: 1 }, { n: "b", p: 5 }, { n: "c", p: 3 }],
      (x) => x.p,
    );
    expect(ranked.map((r) => [r.player.n, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("partage le rang entre ex æquo (1, 2, 2, 4)", () => {
    const ranked = rankPlayers(
      [{ n: "a", p: 9 }, { n: "b", p: 5 }, { n: "c", p: 5 }, { n: "d", p: 1 }],
      (x) => x.p,
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("gère un triple ex æquo en tête", () => {
    const ranked = rankPlayers(
      [{ p: 5 }, { p: 5 }, { p: 5 }, { p: 2 }],
      (x) => x.p,
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it("liste vide → classement vide", () => {
    expect(rankPlayers([], () => 0)).toEqual([]);
  });
});

describe("jeton joueur", () => {
  it("génère des jetons uniques et url-safe", () => {
    const a = generatePlayerToken();
    const b = generatePlayerToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hash stable et distinct du jeton", () => {
    const token = generatePlayerToken();
    expect(hashPlayerToken(token)).toBe(hashPlayerToken(token));
    expect(hashPlayerToken(token)).not.toBe(token);
    expect(hashPlayerToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isPredictionOpen", () => {
  const now = new Date("2026-07-18T15:00:00Z");

  it("ouvert avant le coup d'envoi", () => {
    expect(isPredictionOpen("2026-07-18T20:00:00Z", now)).toBe(true);
  });

  it("fermé au coup d'envoi et après", () => {
    expect(isPredictionOpen("2026-07-18T15:00:00Z", now)).toBe(false);
    expect(isPredictionOpen("2026-07-18T12:00:00Z", now)).toBe(false);
  });
});

describe("inscription au championnat", () => {
  const input = {
    slug: "TESTPRONO",
    first_name: "Camille",
    email: "",
    phone: "",
  };

  it("exige un consentement explicite", () => {
    expect(registerPlayerSchema.safeParse({ ...input, accepted_terms: false }).success).toBe(false);
    expect(registerPlayerSchema.safeParse({ ...input, accepted_terms: true }).success).toBe(true);
  });
});

describe("récompenses du championnat", () => {
  it("refuse deux paliers qui se chevauchent", () => {
    const result = updateContestRewardsSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      rewards: JSON.stringify([
        { from: 1, to: 3, label: "Lot A" },
        { from: 3, to: 5, label: "Lot B" },
      ]),
    });
    expect(result.success).toBe(false);
  });
});
