import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mapReferralPublicState,
  mapReferralSpinGrant,
  mapReferralSponsor,
  mapReferralValidation,
} from "./referral";
import { normalizeReferralCode } from "./utils";
import {
  consumeReferralSpinSchema,
  ensureReferralSponsorSchema,
  referralCodeSchema,
  referralRedeemCodeSchema,
  saveReferralProgramSchema,
  validateReferralSchema,
} from "./validations/referral";

const UUID = "00000000-0000-4000-8000-000000000001";
const SPIN = "00000000-0000-4000-8000-0000000000bb";
const CODE = "PR-ABCD2345";
const GRANT = "a".repeat(48);

const PROGRAM = {
  sponsor_reward_kind: "spin",
  sponsor_reward_label: "",
  filleul_reward_kind: "lot",
  filleul_reward_label: "Un café offert",
  chest_reward_kind: "none",
  chest_reward_label: "",
};

// ────────────────────────────────────────────────────────────
// mapReferralSponsor — jsonb ensure_referral_sponsor
// ────────────────────────────────────────────────────────────

describe("mapReferralSponsor", () => {
  it("mappe un parrain prêt (ready) avec sa config publique", () => {
    const result = mapReferralSponsor({
      state: "ready",
      referral_code: CODE,
      validated_count: 2,
      chest_threshold: 3,
      chest_rewarded: false,
      gauge: 2,
      has_email: true,
      program: { chest_threshold: 3, ...PROGRAM },
    });
    expect(result.state).toBe("ready");
    expect(result.referralCode).toBe(CODE);
    expect(result.gauge).toBe(2);
    expect(result.validatedCount).toBe(2);
    expect(result.chestThreshold).toBe(3);
    expect(result.chestRewarded).toBe(false);
    expect(result.hasEmail).toBe(true);
    expect(result.program).toEqual({
      sponsorRewardKind: "spin",
      sponsorRewardLabel: "",
      filleulRewardKind: "lot",
      filleulRewardLabel: "Un café offert",
      chestRewardKind: "none",
      chestRewardLabel: "",
    });
  });

  it("unavailable / jsonb non reconnu → défauts sûrs (aucun oracle)", () => {
    for (const raw of [{ state: "unavailable" }, null, 42, {}, { state: "bogus" }]) {
      const result = mapReferralSponsor(raw);
      expect(result.state).toBe("unavailable");
      expect(result.referralCode).toBeNull();
      expect(result.program).toBeNull();
      expect(result.gauge).toBe(0);
    }
  });

  it("kind inconnu dans le programme → défaut 'none'", () => {
    const result = mapReferralSponsor({
      state: "ready",
      referral_code: CODE,
      program: { ...PROGRAM, sponsor_reward_kind: "???" },
    });
    expect(result.program?.sponsorRewardKind).toBe("none");
  });
});

// ────────────────────────────────────────────────────────────
// mapReferralPublicState — jsonb referral_public_state
// ────────────────────────────────────────────────────────────

describe("mapReferralPublicState", () => {
  it("mappe l'état d'un parrain avec SES versements", () => {
    const result = mapReferralPublicState({
      state: "ok",
      campaign_id: UUID,
      gauge: 1,
      validated_count: 1,
      chest_threshold: 3,
      chest_rewarded: false,
      referral_code: CODE,
      program: PROGRAM,
      rewards: [
        {
          beneficiary: "sponsor",
          kind: "lot",
          code: "PARRAIN-ABCD2345",
          spin_grant_token: null,
          grant_consumed_at: null,
          resulting_spin_id: null,
          redeemed_at: null,
          out_of_stock: false,
          created_at: "2026-07-24T10:00:00Z",
        },
        {
          beneficiary: "chest",
          kind: "spin",
          code: null,
          spin_grant_token: GRANT,
          grant_consumed_at: null,
          resulting_spin_id: null,
          redeemed_at: null,
          out_of_stock: false,
          created_at: "2026-07-24T11:00:00Z",
        },
      ],
    });
    expect(result.state).toBe("ok");
    expect(result.campaignId).toBe(UUID);
    expect(result.gauge).toBe(1);
    expect(result.referralCode).toBe(CODE);
    expect(result.rewards).toHaveLength(2);
    expect(result.rewards[0]).toEqual({
      beneficiary: "sponsor",
      kind: "lot",
      code: "PARRAIN-ABCD2345",
      spinGrantToken: null,
      grantConsumedAt: null,
      resultingSpinId: null,
      redeemedAt: null,
      outOfStock: false,
      createdAt: "2026-07-24T10:00:00Z",
    });
    expect(result.rewards[1].kind).toBe("spin");
    expect(result.rewards[1].spinGrantToken).toBe(GRANT);
  });

  it("parrain inconnu (jauge 0, pas de code)", () => {
    const result = mapReferralPublicState({
      state: "ok",
      campaign_id: UUID,
      gauge: 0,
      validated_count: 0,
      chest_threshold: 3,
      chest_rewarded: false,
      referral_code: null,
      program: PROGRAM,
      rewards: [],
    });
    expect(result.state).toBe("ok");
    expect(result.gauge).toBe(0);
    expect(result.referralCode).toBeNull();
    expect(result.rewards).toEqual([]);
  });

  it("state ≠ ok / jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, {}, { state: "unavailable" }, 42]) {
      const result = mapReferralPublicState(raw);
      expect(result.state).toBe("unavailable");
      expect(result.rewards).toEqual([]);
      expect(result.referralCode).toBeNull();
    }
  });
});

// ────────────────────────────────────────────────────────────
// mapReferralValidation — jsonb validate_referral (LE CŒUR)
// ────────────────────────────────────────────────────────────

describe("mapReferralValidation", () => {
  it("mappe une validation réussie avec les 3 versements (coffre débloqué)", () => {
    const result = mapReferralValidation({
      state: "validated",
      gauge: 3,
      chest_threshold: 3,
      sponsor_rewarded: true,
      chest_unlocked: true,
      sponsor_reward: { kind: "spin", rewarded: true, grant: GRANT },
      filleul_reward: { kind: "lot", rewarded: true, code: "PARRAIN-WXYZ2345" },
      chest_reward: { kind: "lot", rewarded: false, out_of_stock: true },
    });
    expect(result.state).toBe("validated");
    expect(result.gauge).toBe(3);
    expect(result.sponsorRewarded).toBe(true);
    expect(result.chestUnlocked).toBe(true);
    expect(result.sponsorReward).toEqual({
      kind: "spin",
      rewarded: true,
      code: null,
      grant: GRANT,
      outOfStock: false,
    });
    expect(result.filleulReward).toEqual({
      kind: "lot",
      rewarded: true,
      code: "PARRAIN-WXYZ2345",
      grant: null,
      outOfStock: false,
    });
    // Coffre en rupture : rewarded false, out_of_stock true, aucun code.
    expect(result.chestReward).toEqual({
      kind: "lot",
      rewarded: false,
      code: null,
      grant: null,
      outOfStock: true,
    });
  });

  it("versement 'none' → rewarded false, ni code ni grant", () => {
    const result = mapReferralValidation({
      state: "validated",
      gauge: 1,
      chest_threshold: 3,
      sponsor_rewarded: false,
      chest_unlocked: false,
      sponsor_reward: { kind: "none", rewarded: false },
      filleul_reward: { kind: "none", rewarded: false },
      chest_reward: null,
    });
    expect(result.sponsorReward).toEqual({
      kind: "none",
      rewarded: false,
      code: null,
      grant: null,
      outOfStock: false,
    });
    // chest_reward null (coffre non atteint) → null, jamais un objet fabriqué.
    expect(result.chestReward).toBeNull();
  });

  it("tous les états de refus sont préservés, sans récompense (aucun oracle inversé)", () => {
    for (const state of [
      "unavailable",
      "invalid",
      "expired",
      "capped",
      "self_referral",
      "duplicate",
      "loop",
      "no_participation",
    ]) {
      const result = mapReferralValidation({ state });
      expect(result.state).toBe(state);
      expect(result.sponsorReward).toBeNull();
      expect(result.filleulReward).toBeNull();
      expect(result.chestReward).toBeNull();
      expect(result.gauge).toBe(0);
    }
  });

  it("jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, 42, {}, { state: "bogus" }]) {
      expect(mapReferralValidation(raw).state).toBe("unavailable");
    }
  });
});

// ────────────────────────────────────────────────────────────
// mapReferralSpinGrant — jsonb consume_referral_spin_grant
// ────────────────────────────────────────────────────────────

describe("mapReferralSpinGrant", () => {
  it("mappe un tirage gagnant (spun)", () => {
    const result = mapReferralSpinGrant({
      state: "spun",
      spin_id: SPIN,
      wheel_id: UUID,
      prize_id: "prize-1",
      is_losing: false,
    });
    expect(result.state).toBe("spun");
    expect(result.spinId).toBe(SPIN);
    expect(result.isLosing).toBe(false);
  });

  it("mappe already_consumed / no_prize / unavailable", () => {
    expect(mapReferralSpinGrant({ state: "already_consumed", spin_id: SPIN }).spinId).toBe(SPIN);
    expect(mapReferralSpinGrant({ state: "no_prize", wheel_id: UUID }).wheelId).toBe(UUID);
    expect(mapReferralSpinGrant({ state: "bogus" }).state).toBe("unavailable");
    expect(mapReferralSpinGrant(null).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// normalizeReferralCode — routage caisse (préfixe distinct PARRAIN-)
// ────────────────────────────────────────────────────────────

describe("normalizeReferralCode", () => {
  it("normalise une saisie tolérante vers PARRAIN-XXXXXXXX", () => {
    for (const raw of ["parrain abcd2345", "  PARRAIN-abcd2345 ", "parrainabcd2345", "ABCD2345"]) {
      expect(normalizeReferralCode(raw)).toBe("PARRAIN-ABCD2345");
    }
  });

  it("rejette les codes d'autres familles et les formes invalides", () => {
    expect(normalizeReferralCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeReferralCode("CHASSE-ABCD2345")).toBe("");
    expect(normalizeReferralCode("FIDELITE-ABCD2345")).toBe("");
    expect(normalizeReferralCode("JACKPOT-ABCD2345")).toBe("");
    expect(normalizeReferralCode("EVENT-ABCD2345")).toBe("");
    expect(normalizeReferralCode("CADEAU-ABCD2345")).toBe("");
    // Alphabet exclut I/O/0/1 et exige 8 caractères.
    expect(normalizeReferralCode("PARRAIN-ABCI2345")).toBe("");
    expect(normalizeReferralCode("PARRAIN-ABCD234")).toBe("");
    expect(normalizeReferralCode("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// Schémas Zod — formats miroir des CHECK SQL
// ────────────────────────────────────────────────────────────

describe("schémas du parcours public / caisse", () => {
  it("referralCodeSchema : PR-XXXXXXXX, casse tolérée", () => {
    expect(referralCodeSchema.safeParse("pr-abcd2345").success).toBe(true);
    expect(referralCodeSchema.safeParse("  PR-ABCD2345 ").success).toBe(true);
    expect(referralCodeSchema.safeParse("PR-ABCI2345").success).toBe(false); // I interdit
    expect(referralCodeSchema.safeParse("PARRAIN-ABCD2345").success).toBe(false);
    expect(referralCodeSchema.safeParse("PR-ABCD234").success).toBe(false);
  });

  it("ensureReferralSponsorSchema : slug requis, email opt-in facultatif (RGPD)", () => {
    expect(ensureReferralSponsorSchema.safeParse({ slug: "boutique" }).success).toBe(true);
    expect(ensureReferralSponsorSchema.safeParse({ slug: "" }).success).toBe(false);
    const noEmail = ensureReferralSponsorSchema.safeParse({ slug: "boutique", email: "" });
    expect(noEmail.success).toBe(true);
    if (noEmail.success) expect(noEmail.data.email).toBeUndefined();
    const withEmail = ensureReferralSponsorSchema.safeParse({
      slug: "boutique",
      email: "Parrain@Exemple.FR",
    });
    expect(withEmail.success).toBe(true);
    if (withEmail.success) expect(withEmail.data.email).toBe("parrain@exemple.fr");
    expect(
      ensureReferralSponsorSchema.safeParse({ slug: "boutique", email: "invalide" }).success,
    ).toBe(false);
  });

  it("validateReferralSchema : slug + ref + preuve (uuid) + email opt-in", () => {
    expect(
      validateReferralSchema.safeParse({ slug: "boutique", ref: CODE, proofSpinId: SPIN }).success,
    ).toBe(true);
    // ref invalide.
    expect(
      validateReferralSchema.safeParse({ slug: "boutique", ref: "PR-ABCI2345", proofSpinId: SPIN })
        .success,
    ).toBe(false);
    // preuve non-uuid.
    expect(
      validateReferralSchema.safeParse({ slug: "boutique", ref: CODE, proofSpinId: "pas-un-uuid" })
        .success,
    ).toBe(false);
  });

  it("consumeReferralSpinSchema : grant 48 hex", () => {
    expect(
      consumeReferralSpinSchema.safeParse({ slug: "boutique", grantToken: "a".repeat(48) }).success,
    ).toBe(true);
    expect(
      consumeReferralSpinSchema.safeParse({ slug: "boutique", grantToken: "a".repeat(47) }).success,
    ).toBe(false);
    expect(
      consumeReferralSpinSchema.safeParse({ slug: "boutique", grantToken: "Z".repeat(48) }).success,
    ).toBe(false);
  });

  it("referralRedeemCodeSchema : PARRAIN-XXXXXXXX, casse tolérée", () => {
    expect(referralRedeemCodeSchema.safeParse("parrain-abcd2345").success).toBe(true);
    expect(referralRedeemCodeSchema.safeParse("  PARRAIN-ABCD2345 ").success).toBe(true);
    expect(referralRedeemCodeSchema.safeParse("CADEAU-ABCD2345").success).toBe(false);
    expect(referralRedeemCodeSchema.safeParse("PARRAIN-ABCI2345").success).toBe(false); // I interdit
  });
});

// ────────────────────────────────────────────────────────────
// saveReferralProgramSchema — cohérence par kind + bornes (dashboard)
// ────────────────────────────────────────────────────────────

describe("saveReferralProgramSchema — config commerçant", () => {
  const reward = (o: Record<string, unknown> = {}) => ({ kind: "none", ...o });
  const base = {
    campaignId: UUID,
    enabled: false,
    chestThreshold: 3,
    sponsorMaxFilleuls: 20,
    windowDays: 30,
    sponsor: reward(),
    filleul: reward(),
    chest: reward(),
  };
  const parse = (o: Record<string, unknown>) => saveReferralProgramSchema.safeParse({ ...base, ...o });

  it("accepte une config 'none'/'spin' sans lot ('' stock → null)", () => {
    const res = parse({ sponsor: reward({ kind: "spin" }), filleul: reward({ kind: "none" }) });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.sponsor.stock).toBeNull();
      expect(res.data.enabled).toBe(false);
    }
  });

  it("lot : libellé non vide ET stock FINI obligatoires (verrou économique)", () => {
    // stock manquant → refusé.
    expect(
      parse({ sponsor: reward({ kind: "lot", label: "Un café", stock: "" }) }).success,
    ).toBe(false);
    // libellé manquant → refusé.
    expect(
      parse({ chest: reward({ kind: "lot", label: "", stock: "10" }) }).success,
    ).toBe(false);
    // lot complet → accepté (stock 0 admis = épuisé / en pause).
    const ok = parse({ filleul: reward({ kind: "lot", label: "Un dessert", stock: "0" }) });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.filleul.kind).toBe("lot");
      expect(ok.data.filleul.stock).toBe(0);
    }
  });

  it("bornes miroir des CHECK SQL", () => {
    expect(parse({ chestThreshold: 1 }).success).toBe(false);
    expect(parse({ chestThreshold: 51 }).success).toBe(false);
    expect(parse({ chestThreshold: 2 }).success).toBe(true);
    expect(parse({ sponsorMaxFilleuls: 0 }).success).toBe(false);
    expect(parse({ sponsorMaxFilleuls: 1001 }).success).toBe(false);
    expect(parse({ windowDays: 0 }).success).toBe(false);
    expect(parse({ windowDays: 366 }).success).toBe(false);
    expect(parse({ windowDays: 365 }).success).toBe(true);
  });

  it("kind inconnu refusé", () => {
    expect(parse({ sponsor: reward({ kind: "cashback" }) }).success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// ADR-032 — AUCUN failClosed sur une clé PARTAGÉE (garde de conception)
// ────────────────────────────────────────────────────────────

describe("ADR-032 — contrôle d'abus du parcours public parrainage", () => {
  const source = readFileSync(new URL("../actions/referral.ts", import.meta.url), "utf8");
  // Espaces normalisés : robuste au formatage (retours à la ligne de Prettier).
  const flat = source.replace(/\s+/g, " ");

  it("la clé PARTAGÉE (IP) passe par observeSharedKey (fail-OPEN), jamais par un refus", () => {
    expect(flat).toMatch(/observeSharedKey\(\s*rateLimitBucket\(\s*"referral:public:ip"/);
  });

  it("la clé IP partagée n'est JAMAIS remise à un rateLimit failClosed", () => {
    expect(/"referral:public:ip"[^;]*failClosed/.test(flat)).toBe(false);
  });

  it("le failClosed n'est employé QUE sur la clé d'IDENTITÉ device (referral:player)", () => {
    expect(flat).toMatch(/"referral:player"[^;]*failClosed:\s*true/);
    const failClosedCount = (flat.match(/failClosed:\s*true/g) ?? []).length;
    const playerFailClosed = (flat.match(/"referral:player"[\s\S]*?failClosed:\s*true/g) ?? []).length;
    expect(failClosedCount).toBeGreaterThan(0);
    expect(playerFailClosed).toBe(failClosedCount);
  });
});
