import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deriveRpsServerMove,
  evaluateSkill,
  hashPlayerKey,
  playerKeyHashMatches,
  resolveSkillSeed,
  rpsBeats,
  signSkillChallenge,
  isSkillAttemptTimingPlausible,
  minimumSkillSuccessElapsedMs,
  toPublicChallenge,
  verifySkillChallenge,
  SKILL_CHALLENGE_TTL_MS,
} from "./skill";
import { signClaimToken } from "./spin";
import {
  parseSkillAttempt,
  parseSkillConfig,
  RPS_MOVES,
  type RpsMove,
  type SkillAttempt,
} from "./validations/skill";

const PLAYER_HASH = hashPlayerKey("device-abc");

/** Coup qui bat STRICTEMENT un coup serveur donné. */
function beatingMove(server: RpsMove): RpsMove {
  const table: Record<RpsMove, RpsMove> = {
    scissors: "rock",
    rock: "paper",
    paper: "scissors",
  };
  return table[server];
}

// ────────────────────────────────────────────────────────────
// evaluateSkill — par jeu (PUR, sans secret)
// ────────────────────────────────────────────────────────────

describe("evaluateSkill · rps", () => {
  const seed = resolveSkillSeed("seedfor-rps-test");
  const serverMove = deriveRpsServerMove(seed);

  it("le coup serveur est déterministe pour un même seed résolu", () => {
    expect(deriveRpsServerMove(seed)).toBe(serverMove);
    expect(RPS_MOVES).toContain(serverMove);
  });

  it("succès si le coup joueur bat STRICTEMENT le serveur", () => {
    const attempt: SkillAttempt = { gameType: "rps", move: beatingMove(serverMove) };
    expect(evaluateSkill("rps", attempt, {}, seed).succeeded).toBe(true);
  });

  it("égalité = ÉCHEC (le joueur doit battre le serveur)", () => {
    const attempt: SkillAttempt = { gameType: "rps", move: serverMove };
    expect(evaluateSkill("rps", attempt, {}, seed).succeeded).toBe(false);
  });

  it("coup perdant = échec", () => {
    const losing = beatingMove(beatingMove(serverMove)); // 2 crans = perd
    const attempt: SkillAttempt = { gameType: "rps", move: losing };
    expect(evaluateSkill("rps", attempt, {}, seed).succeeded).toBe(false);
  });
});

describe("rpsBeats", () => {
  it("respecte la règle et rejette l'égalité", () => {
    expect(rpsBeats("rock", "scissors")).toBe(true);
    expect(rpsBeats("paper", "rock")).toBe(true);
    expect(rpsBeats("scissors", "paper")).toBe(true);
    expect(rpsBeats("rock", "rock")).toBe(false);
    expect(rpsBeats("rock", "paper")).toBe(false);
  });
});

describe("evaluateSkill · mystery_word", () => {
  const config = { word: "Café", hint: "boisson" };

  it("succès si accents/casse/espaces normalisés coïncident", () => {
    for (const guess of ["cafe", "CAFÉ", "  Café ", "café"]) {
      const attempt: SkillAttempt = { gameType: "mystery_word", guess };
      expect(evaluateSkill("mystery_word", attempt, config, "").succeeded).toBe(true);
    }
  });

  it("échec si le mot diffère", () => {
    const attempt: SkillAttempt = { gameType: "mystery_word", guess: "thé" };
    expect(evaluateSkill("mystery_word", attempt, config, "").succeeded).toBe(false);
  });
});

describe("evaluateSkill · estimate", () => {
  const config = { target: 42, tolerance: 5, question: null, unit: null, imageUrl: null };

  it("succès si |valeur - cible| <= tolérance (bornes comprises)", () => {
    for (const value of [42, 45, 39, 47, 37]) {
      const attempt: SkillAttempt = { gameType: "estimate", value };
      expect(evaluateSkill("estimate", attempt, config, "").succeeded).toBe(true);
    }
  });

  it("échec hors tolérance", () => {
    for (const value of [48, 36, 100]) {
      const attempt: SkillAttempt = { gameType: "estimate", value };
      expect(evaluateSkill("estimate", attempt, config, "").succeeded).toBe(false);
    }
  });
});

describe("evaluateSkill · puzzle", () => {
  const config = { fragments: ["a", "b", "c"], order: [2, 0, 1] };

  it("succès si l'ordre soumis == la solution", () => {
    const attempt: SkillAttempt = { gameType: "puzzle", order: [2, 0, 1] };
    expect(evaluateSkill("puzzle", attempt, config, "").succeeded).toBe(true);
  });

  it("échec sur tout autre ordre", () => {
    const attempt: SkillAttempt = { gameType: "puzzle", order: [0, 1, 2] };
    expect(evaluateSkill("puzzle", attempt, config, "").succeeded).toBe(false);
  });
});

describe("evaluateSkill · reflex / gauge (client-reported, borné par l'économie)", () => {
  it("recopie le booléen rapporté par le client", () => {
    expect(
      evaluateSkill("reflex", { gameType: "reflex", succeeded: true }, { durationMs: 800 }, "")
        .succeeded,
    ).toBe(true);
    expect(
      evaluateSkill("reflex", { gameType: "reflex", succeeded: false }, { durationMs: 800 }, "")
        .succeeded,
    ).toBe(false);
    expect(
      evaluateSkill("gauge", { gameType: "gauge", succeeded: true }, { tolerancePct: 10 }, "")
        .succeeded,
    ).toBe(true);
  });
});

describe("temps minimal signé · reflex / gauge", () => {
  it("refuse un succès réflexe avant que le signal puisse apparaître", () => {
    const attempt = { gameType: "reflex" as const, succeeded: true };
    const config = { durationMs: 800 };
    expect(minimumSkillSuccessElapsedMs("reflex", config)).toBe(1_400);
    expect(
      isSkillAttemptTimingPlausible("reflex", attempt, config, 10_000, 11_399),
    ).toBe(false);
    expect(
      isSkillAttemptTimingPlausible("reflex", attempt, config, 10_000, 11_400),
    ).toBe(true);
  });

  it("dérive la première position atteignable de la jauge", () => {
    const attempt = { gameType: "gauge" as const, succeeded: true };
    const config = { tolerancePct: 10 };
    expect(minimumSkillSuccessElapsedMs("gauge", config)).toBe(460);
    expect(
      isSkillAttemptTimingPlausible("gauge", attempt, config, 2_000, 2_459),
    ).toBe(false);
    expect(
      isSkillAttemptTimingPlausible("gauge", attempt, config, 2_000, 2_460),
    ).toBe(true);
  });

  it("une tolérance large ne ramène JAMAIS le plancher à zéro", () => {
    // Régression fermée ici (SEC-2) : à tolerancePct = 50 la cible est
    // atteignable dès 0 % du balayage, la borne dérivée tombait donc à 0 ms —
    // un script pouvait déclarer « réussi » dans la milliseconde suivant
    // l'émission du jeton. Le plancher absolu (300 ms) reprend la main.
    const attempt = { gameType: "gauge" as const, succeeded: true };
    const config = { tolerancePct: 50 };
    expect(minimumSkillSuccessElapsedMs("gauge", config)).toBe(300);
    expect(
      isSkillAttemptTimingPlausible("gauge", attempt, config, 2_000, 2_299),
    ).toBe(false);
    expect(
      isSkillAttemptTimingPlausible("gauge", attempt, config, 2_000, 2_300),
    ).toBe(true);
  });

  it("le plancher absolu ne mord pas sur les bornes dérivées plus hautes", () => {
    // Non-régression : dès que la tolérance laisse la borne au-dessus de
    // 300 ms, c'est la valeur DÉRIVÉE du balayage qui s'applique, inchangée.
    //
    // 389 et non 390 : 0,35 × 1 400 vaut 489,999… en binaire, et le `floor`
    // retient 489. La milliseconde perdue est sans effet (la marge humaine en
    // absorbe cent), mais elle est ÉPINGLÉE ici pour que le chiffre attendu
    // reste celui que la fonction rend vraiment.
    expect(minimumSkillSuccessElapsedMs("gauge", { tolerancePct: 15 })).toBe(389);
    expect(minimumSkillSuccessElapsedMs("gauge", { tolerancePct: 10 })).toBe(460);
    expect(minimumSkillSuccessElapsedMs("reflex", { durationMs: 800 })).toBe(1_400);
  });

  it("ne pénalise jamais un échec rapporté", () => {
    expect(
      isSkillAttemptTimingPlausible(
        "reflex",
        { gameType: "reflex", succeeded: false },
        { durationMs: 800 },
        10_000,
        10_001,
      ),
    ).toBe(true);
  });
});

describe("evaluateSkill · garde-fou de cohérence", () => {
  it("une tentative d'un autre jeu échoue toujours", () => {
    const wrong = { gameType: "rps", move: "rock" } as SkillAttempt;
    expect(evaluateSkill("estimate", wrong, { target: 1, tolerance: 0, question: null, unit: null, imageUrl: null }, "").succeeded).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// toPublicChallenge — NON-EXPOSITION des secrets
// ────────────────────────────────────────────────────────────

describe("toPublicChallenge n'expose JAMAIS de secret", () => {
  it("mystery_word : longueur + indice, jamais le mot", () => {
    const pub = toPublicChallenge("mystery_word", { word: "Château", hint: "monument" });
    expect(pub).toEqual({ gameType: "mystery_word", length: 7, hint: "monument" });
    const json = JSON.stringify(pub).toLowerCase();
    expect(json).not.toContain("château");
    expect(json).not.toContain("chateau");
  });

  it("estimate : habillage public, jamais target/tolerance", () => {
    const pub = toPublicChallenge("estimate", {
      target: 1234,
      tolerance: 7,
      question: "Combien de bonbons ?",
      unit: "bonbons",
      imageUrl: "https://x/y.png",
    });
    expect(pub).not.toHaveProperty("target");
    expect(pub).not.toHaveProperty("tolerance");
    const json = JSON.stringify(pub);
    expect(json).not.toContain("1234");
    expect(json).not.toContain('"7"');
  });

  it("puzzle : fragments publics, jamais l'ordre secret", () => {
    const pub = toPublicChallenge("puzzle", { fragments: ["x", "y", "z"], order: [2, 0, 1] });
    expect(pub).toEqual({ gameType: "puzzle", fragments: ["x", "y", "z"] });
    expect(pub).not.toHaveProperty("order");
  });

  it("rps : aucune donnée secrète", () => {
    expect(toPublicChallenge("rps", {})).toEqual({ gameType: "rps" });
  });
});

// ────────────────────────────────────────────────────────────
// Jeton de défi — signature / vérification
// ────────────────────────────────────────────────────────────

const signInput = {
  playerKeyHash: PLAYER_HASH,
  organizationId: "org-1",
  campaignId: "camp-1",
  wheelId: "wheel-1",
  gameType: "rps" as const,
  seed: "0123456789abcdef",
  // 32 hex : la forme EXACTE que `generateSkillSeed` produit, et que la
  // vérification exige désormais (le nonce franchit la frontière SQL comme clé
  // d'idempotence — il n'est plus un champ opaque).
  nonce: "fedcba9876543210fedcba9876543210",
};

describe("jeton de défi", () => {
  it("round-trip sign → verify (champs préservés)", () => {
    const payload = verifySkillChallenge(signSkillChallenge(signInput));
    expect(payload).not.toBeNull();
    expect(payload?.playerKeyHash).toBe(PLAYER_HASH);
    expect(payload?.gameType).toBe("rps");
    expect(payload?.seed).toBe(signInput.seed);
    expect(payload?.wheelId).toBe("wheel-1");
  });

  it("rejette un corps falsifié", () => {
    const token = signSkillChallenge(signInput);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...signInput, gameType: "estimate", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifySkillChallenge(`${forged}.${sig}`)).toBeNull();
    expect(verifySkillChallenge(`${body}.AAAA`)).toBeNull();
    expect(verifySkillChallenge("nimporte-quoi")).toBeNull();
  });

  it("rejette un jeton expiré", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const token = signSkillChallenge(signInput, past);
    expect(verifySkillChallenge(token)).toBeNull();
    expect(verifySkillChallenge(token, past)?.gameType).toBe("rps");
  });

  it("rejette un exp trop lointain (jeton mal émis)", () => {
    const secret = process.env.SKILL_CHALLENGE_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const body = Buffer.from(
      JSON.stringify({ ...signInput, iat: Date.now(), exp: Date.now() + 24 * 3600 * 1000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", secret)
      .update(`skill-challenge:${body}`)
      .digest("base64url");
    expect(verifySkillChallenge(`${body}.${sig}`)).toBeNull();
  });

  it("rejette un iat futur ou absent même avec une signature valide", () => {
    const secret = process.env.SKILL_CHALLENGE_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const now = Date.now();
    for (const extra of [
      { iat: now + 60_000, exp: now + 120_000 },
      { exp: now + 60_000 },
    ]) {
      const body = Buffer.from(
        JSON.stringify({ ...signInput, ...extra }),
      ).toString("base64url");
      const sig = createHmac("sha256", secret)
        .update(`skill-challenge:${body}`)
        .digest("base64url");
      expect(verifySkillChallenge(`${body}.${sig}`, new Date(now))).toBeNull();
    }
  });

  it("rejette un nonce difforme, signature valide ou non (MOYEN-2)", () => {
    // Le nonce n'est plus un champ opaque : depuis JOB-8 il est la clé
    // d'idempotence passée à `perform_atomic_spin`, sous contrainte d'unicité
    // GLOBALE. Sa forme est donc vérifiée comme celle du seed, et pas seulement
    // son type — la signature HMAC interdit déjà de le choisir, mais la borne ne
    // doit pas dépendre du seul secret.
    for (const nonce of [
      "",
      "pas-un-nonce",
      // Trop court / trop long : ni l'un ni l'autre n'est émis par le serveur.
      "fedcba9876543210",
      "fedcba9876543210fedcba98765432100",
      // Hors alphabet hexadécimal minuscule.
      "FEDCBA9876543210FEDCBA9876543210",
      "fedcba9876543210fedcba987654321;",
    ]) {
      // Jeton SIGNÉ pour de vrai : ce n'est pas la signature qui le refuse.
      const token = signSkillChallenge({ ...signInput, nonce });
      expect(verifySkillChallenge(token)).toBeNull();
    }
    // Témoin : la forme nominale passe toujours.
    expect(verifySkillChallenge(signSkillChallenge(signInput))).not.toBeNull();
  });

  it("un claim n'est pas vérifiable comme défi (séparation de domaine)", () => {
    const claim = signClaimToken("spin-1");
    expect(verifySkillChallenge(claim)).toBeNull();
  });

  it("TTL nominal borné à 10 min", () => {
    expect(SKILL_CHALLENGE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("identité device (hashPlayerKey / playerKeyHashMatches)", () => {
  it("hash 64-hex déterministe, jamais la clé brute", () => {
    expect(PLAYER_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPlayerKey("device-abc")).toBe(PLAYER_HASH);
    expect(hashPlayerKey("device-xyz")).not.toBe(PLAYER_HASH);
    expect(PLAYER_HASH).not.toContain("device-abc");
  });

  it("comparaison à temps constant : égal true, différent false", () => {
    expect(playerKeyHashMatches(PLAYER_HASH, PLAYER_HASH)).toBe(true);
    expect(playerKeyHashMatches(PLAYER_HASH, hashPlayerKey("autre"))).toBe(false);
  });
});

describe("resolveSkillSeed", () => {
  it("déterministe et distinct du seed brut (nécessite le secret serveur)", () => {
    const raw = "0123456789abcdef";
    expect(resolveSkillSeed(raw)).toBe(resolveSkillSeed(raw));
    expect(resolveSkillSeed(raw)).not.toBe(raw);
  });
});

// ────────────────────────────────────────────────────────────
// Schémas (config / tentative) — bornes et non-taggage
// ────────────────────────────────────────────────────────────

describe("parseSkillConfig", () => {
  it("mystery_word exige un mot non vide", () => {
    expect(parseSkillConfig("mystery_word", { word: "" }).ok).toBe(false);
    expect(parseSkillConfig("mystery_word", { word: "chat" }).ok).toBe(true);
  });

  it("estimate exige target entier et tolerance >= 0", () => {
    expect(parseSkillConfig("estimate", { target: 10, tolerance: -1 }).ok).toBe(false);
    expect(parseSkillConfig("estimate", { target: 10.5, tolerance: 1 }).ok).toBe(false);
    expect(parseSkillConfig("estimate", { target: 10, tolerance: 2 }).ok).toBe(true);
  });

  it("puzzle exige un ordre = permutation des fragments", () => {
    expect(parseSkillConfig("puzzle", { fragments: ["a", "b"], order: [0, 0] }).ok).toBe(false);
    expect(parseSkillConfig("puzzle", { fragments: ["a", "b"], order: [1, 0] }).ok).toBe(true);
  });

  it("rps tolère une config vide/nulle", () => {
    expect(parseSkillConfig("rps", null).ok).toBe(true);
    expect(parseSkillConfig("rps", {}).ok).toBe(true);
  });
});

describe("parseSkillAttempt", () => {
  it("produit une tentative TAGGÉE par gameType", () => {
    const r = parseSkillAttempt("rps", { move: "rock" });
    expect(r.ok && r.attempt).toEqual({ gameType: "rps", move: "rock" });
  });

  it("rejette un coup rps inconnu", () => {
    expect(parseSkillAttempt("rps", { move: "spock" }).ok).toBe(false);
  });
});
