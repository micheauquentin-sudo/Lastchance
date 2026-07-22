import { describe, expect, it } from "vitest";
import {
  loyaltyTierForVisits,
  mapLoyaltySpinGrant,
  mapLoyaltyStampResult,
} from "./loyalty";
import { normalizeLoyaltyCode } from "./utils";
import {
  consumeLoyaltySpinSchema,
  createLoyaltyMilestoneSchema,
  createLoyaltyProgramSchema,
  loyaltyRedeemCodeSchema,
  loyaltyRotatingCodeSchema,
  setLoyaltyProgramStatusSchema,
  stampLoyaltyVisitSchema,
  updateLoyaltyProgramSchema,
} from "./validations/loyalty";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";
const WHEEL = "00000000-0000-4000-8000-0000000000aa";
const GRANT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"; // 48 hex

// ────────────────────────────────────────────────────────────
// mapLoyaltyStampResult — mapping du jsonb record_loyalty_stamp
// ────────────────────────────────────────────────────────────

describe("mapLoyaltyStampResult", () => {
  const programJson = { id: UUID, name: "Fidélité Chez Marco", validation_mode: "rotating_code" };

  it("mappe un tampon simple (stamped) avec niveau et prochain palier", () => {
    const result = mapLoyaltyStampResult({
      state: "stamped",
      program: programJson,
      visit_count: 3,
      tier: "silver",
      tier_thresholds: { silver: 3, gold: 8 },
      milestones_reached: [],
      next_milestone: { visit_count: 5, reward_type: "lot" },
    });
    expect(result.state).toBe("stamped");
    expect(result.program).toEqual({
      id: UUID,
      name: "Fidélité Chez Marco",
      validationMode: "rotating_code",
    });
    expect(result.visitCount).toBe(3);
    expect(result.tier).toBe("silver");
    expect(result.tierThresholds).toEqual({ silver: 3, gold: 8 });
    expect(result.milestonesReached).toEqual([]);
    expect(result.nextMilestone).toEqual({ visitCount: 5, rewardType: "lot" });
    expect(result.retryInSeconds).toBeNull();
  });

  it("mappe un palier lot atteint (code de retrait émis)", () => {
    const result = mapLoyaltyStampResult({
      state: "stamped",
      program: programJson,
      visit_count: 5,
      tier: "silver",
      tier_thresholds: { silver: 3, gold: 8 },
      milestones_reached: [
        {
          milestone_id: UUID2,
          visit_count: 5,
          reward_type: "lot",
          code: "FIDELITE-ABCD2345",
          reward_label: "Un dessert offert",
          reward_details: "Au choix",
        },
      ],
      next_milestone: null,
    });
    expect(result.milestonesReached).toHaveLength(1);
    const m = result.milestonesReached[0];
    expect(m.rewardType).toBe("lot");
    expect(m.code).toBe("FIDELITE-ABCD2345");
    expect(m.rewardLabel).toBe("Un dessert offert");
    expect(m.rewardDetails).toBe("Au choix");
    expect(m.grantToken).toBeNull();
    expect(m.targetWheelId).toBeNull();
    expect(m.outOfStock).toBe(false);
    expect(result.nextMilestone).toBeNull();
  });

  it("mappe un palier lot en rupture de stock (out_of_stock)", () => {
    const result = mapLoyaltyStampResult({
      state: "stamped",
      program: programJson,
      visit_count: 10,
      tier: "gold",
      tier_thresholds: { silver: 3, gold: 8 },
      milestones_reached: [
        {
          milestone_id: UUID2,
          visit_count: 10,
          reward_type: "lot",
          out_of_stock: true,
          reward_label: "Un tote bag",
        },
      ],
    });
    const m = result.milestonesReached[0];
    expect(m.outOfStock).toBe(true);
    expect(m.code).toBeNull();
    expect(m.rewardLabel).toBe("Un tote bag");
  });

  it("mappe un palier spin offert (grant_token + roue cible)", () => {
    const result = mapLoyaltyStampResult({
      state: "stamped",
      program: programJson,
      visit_count: 8,
      tier: "gold",
      tier_thresholds: { silver: 3, gold: 8 },
      milestones_reached: [
        {
          milestone_id: UUID2,
          visit_count: 8,
          reward_type: "spin",
          target_wheel_id: WHEEL,
          grant_token: GRANT,
        },
      ],
    });
    const m = result.milestonesReached[0];
    expect(m.rewardType).toBe("spin");
    expect(m.grantToken).toBe(GRANT);
    expect(m.targetWheelId).toBe(WHEEL);
    expect(m.code).toBeNull();
    expect(result.tier).toBe("gold");
  });

  it("expose retry_in_seconds et le passeport sur too_soon", () => {
    const result = mapLoyaltyStampResult({
      state: "too_soon",
      retry_in_seconds: 3600,
      program: programJson,
      visit_count: 2,
      tier: "bronze",
      tier_thresholds: { silver: 3, gold: 8 },
    });
    expect(result.state).toBe("too_soon");
    expect(result.retryInSeconds).toBe(3600);
    expect(result.visitCount).toBe(2);
    expect(result.tier).toBe("bronze");
  });

  it("retombe sur des défauts sûrs pour unavailable / invalid_code", () => {
    for (const state of ["unavailable", "invalid_code"] as const) {
      const result = mapLoyaltyStampResult({ state });
      expect(result.state).toBe(state);
      expect(result.program).toBeNull();
      expect(result.visitCount).toBe(0);
      expect(result.tier).toBe("bronze");
      expect(result.milestonesReached).toEqual([]);
    }
  });

  it("un jsonb non reconnu retombe sur unavailable", () => {
    expect(mapLoyaltyStampResult(null).state).toBe("unavailable");
    expect(mapLoyaltyStampResult({ state: "bogus" }).state).toBe("unavailable");
    expect(mapLoyaltyStampResult("nope").state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// mapLoyaltySpinGrant — mapping du jsonb consume_loyalty_spin_grant
// ────────────────────────────────────────────────────────────

describe("mapLoyaltySpinGrant", () => {
  it("mappe un tirage gagnant (spun)", () => {
    const r = mapLoyaltySpinGrant({
      state: "spun",
      spin_id: "spin-1",
      wheel_id: "wheel-1",
      prize_id: "prize-1",
      is_losing: false,
    });
    expect(r.state).toBe("spun");
    expect(r.spinId).toBe("spin-1");
    expect(r.wheelId).toBe("wheel-1");
    expect(r.prizeId).toBe("prize-1");
    expect(r.isLosing).toBe(false);
  });

  it("mappe un tirage perdant (spun, is_losing)", () => {
    const r = mapLoyaltySpinGrant({
      state: "spun",
      spin_id: "spin-2",
      wheel_id: "wheel-1",
      prize_id: null,
      is_losing: true,
    });
    expect(r.isLosing).toBe(true);
    expect(r.prizeId).toBeNull();
  });

  it("mappe already_consumed (spin_id de reprise)", () => {
    const r = mapLoyaltySpinGrant({ state: "already_consumed", spin_id: "spin-9" });
    expect(r.state).toBe("already_consumed");
    expect(r.spinId).toBe("spin-9");
  });

  it("mappe no_prize et unavailable, jsonb inconnu → unavailable", () => {
    expect(mapLoyaltySpinGrant({ state: "no_prize" }).state).toBe("no_prize");
    expect(mapLoyaltySpinGrant({ state: "unavailable" }).state).toBe("unavailable");
    expect(mapLoyaltySpinGrant(null).state).toBe("unavailable");
    expect(mapLoyaltySpinGrant({ state: "x" }).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// loyaltyTierForVisits — niveau dérivé du compteur
// ────────────────────────────────────────────────────────────

describe("loyaltyTierForVisits", () => {
  it("applique les seuils (bornes incluses)", () => {
    expect(loyaltyTierForVisits(0, 5, 10)).toBe("bronze");
    expect(loyaltyTierForVisits(4, 5, 10)).toBe("bronze");
    expect(loyaltyTierForVisits(5, 5, 10)).toBe("silver");
    expect(loyaltyTierForVisits(9, 5, 10)).toBe("silver");
    expect(loyaltyTierForVisits(10, 5, 10)).toBe("gold");
    expect(loyaltyTierForVisits(50, 5, 10)).toBe("gold");
  });
});

// ────────────────────────────────────────────────────────────
// normalizeLoyaltyCode — routage caisse (miroir normalizeHuntCode)
// ────────────────────────────────────────────────────────────

describe("normalizeLoyaltyCode", () => {
  it("normalise une saisie fidélité tolérante", () => {
    for (const raw of [
      "FIDELITE-ABCD2345",
      "fidelite abcd2345",
      "  FIDELITE-abcd2345 ",
      "fideliteabcd2345",
    ]) {
      expect(normalizeLoyaltyCode(raw)).toBe("FIDELITE-ABCD2345");
    }
  });

  it("accepte un code nu de 8 caractères de l'alphabet", () => {
    expect(normalizeLoyaltyCode("ABCD2345")).toBe("FIDELITE-ABCD2345");
  });

  it("rejette les formes GAIN-… / CHASSE-… et l'alphabet interdit", () => {
    expect(normalizeLoyaltyCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeLoyaltyCode("CHASSE-ABCD2345")).toBe("");
    expect(normalizeLoyaltyCode("ABCI2345")).toBe(""); // I interdit
    expect(normalizeLoyaltyCode("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// Schémas Zod
// ────────────────────────────────────────────────────────────

describe("validations/loyalty", () => {
  it("createLoyaltyProgramSchema : nom requis, borné", () => {
    expect(createLoyaltyProgramSchema.safeParse({ name: "Fidélité" }).success).toBe(true);
    expect(createLoyaltyProgramSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createLoyaltyProgramSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  it("updateLoyaltyProgramSchema : refuse un seuil or ≤ argent", () => {
    const base = {
      id: UUID,
      name: "Fidélité",
      validation_mode: "rotating_code",
      rotating_period_seconds: 60,
      min_stamp_interval_seconds: 86400,
      silver_threshold: 5,
      gold_threshold: 10,
    };
    expect(updateLoyaltyProgramSchema.safeParse(base).success).toBe(true);
    expect(
      updateLoyaltyProgramSchema.safeParse({ ...base, gold_threshold: 5 }).success,
    ).toBe(false);
    expect(
      updateLoyaltyProgramSchema.safeParse({ ...base, gold_threshold: 3 }).success,
    ).toBe(false);
  });

  it("updateLoyaltyProgramSchema : bornes du code tournant et du cooldown", () => {
    const base = {
      id: UUID,
      name: "Fidélité",
      validation_mode: "staff",
      rotating_period_seconds: 60,
      min_stamp_interval_seconds: 0,
      silver_threshold: 5,
      gold_threshold: 10,
    };
    expect(
      updateLoyaltyProgramSchema.safeParse({ ...base, rotating_period_seconds: 10 }).success,
    ).toBe(false); // < 15
    expect(
      updateLoyaltyProgramSchema.safeParse({ ...base, rotating_period_seconds: 5000 }).success,
    ).toBe(false); // > 3600
    expect(
      updateLoyaltyProgramSchema.safeParse({ ...base, min_stamp_interval_seconds: 999999 }).success,
    ).toBe(false); // > 7 j
  });

  it("setLoyaltyProgramStatusSchema : enum de statut", () => {
    expect(setLoyaltyProgramStatusSchema.safeParse({ id: UUID, status: "active" }).success).toBe(true);
    expect(setLoyaltyProgramStatusSchema.safeParse({ id: UUID, status: "paused" }).success).toBe(false);
  });

  it("createLoyaltyMilestoneSchema : un lot exige un libellé, pas de roue", () => {
    const lotOk = createLoyaltyMilestoneSchema.safeParse({
      program_id: UUID,
      visit_count: 5,
      reward_type: "lot",
      reward_label: "Un café",
      reward_details: "",
      reward_stock: "",
      target_wheel_id: "",
    });
    expect(lotOk.success).toBe(true);

    const lotNoLabel = createLoyaltyMilestoneSchema.safeParse({
      program_id: UUID,
      visit_count: 5,
      reward_type: "lot",
      reward_label: "",
      reward_details: "",
      reward_stock: "",
      target_wheel_id: "",
    });
    expect(lotNoLabel.success).toBe(false);

    const lotWithWheel = createLoyaltyMilestoneSchema.safeParse({
      program_id: UUID,
      visit_count: 5,
      reward_type: "lot",
      reward_label: "Un café",
      reward_details: "",
      reward_stock: "",
      target_wheel_id: WHEEL,
    });
    expect(lotWithWheel.success).toBe(false);
  });

  it("createLoyaltyMilestoneSchema : un spin exige une roue cible", () => {
    const spinOk = createLoyaltyMilestoneSchema.safeParse({
      program_id: UUID,
      visit_count: 8,
      reward_type: "spin",
      reward_label: "",
      reward_details: "",
      reward_stock: "",
      target_wheel_id: WHEEL,
    });
    expect(spinOk.success).toBe(true);

    const spinNoWheel = createLoyaltyMilestoneSchema.safeParse({
      program_id: UUID,
      visit_count: 8,
      reward_type: "spin",
      reward_label: "",
      reward_details: "",
      reward_stock: "",
      target_wheel_id: "",
    });
    expect(spinNoWheel.success).toBe(false);
  });

  it("createLoyaltyMilestoneSchema : visit_count borné 1..1000", () => {
    const make = (visit_count: number) =>
      createLoyaltyMilestoneSchema.safeParse({
        program_id: UUID,
        visit_count,
        reward_type: "lot",
        reward_label: "Un café",
        reward_details: "",
        reward_stock: "",
        target_wheel_id: "",
      });
    expect(make(0).success).toBe(false);
    expect(make(1).success).toBe(true);
    expect(make(1001).success).toBe(false);
  });

  it("code tournant : exactement 6 chiffres", () => {
    expect(loyaltyRotatingCodeSchema.safeParse("123456").success).toBe(true);
    expect(loyaltyRotatingCodeSchema.safeParse("12345").success).toBe(false);
    expect(loyaltyRotatingCodeSchema.safeParse("12345a").success).toBe(false);
    expect(stampLoyaltyVisitSchema.safeParse({ programId: UUID, code: "000000" }).success).toBe(true);
  });

  it("code de retrait caisse : forme FIDELITE-XXXXXXXX (casse tolérée)", () => {
    expect(loyaltyRedeemCodeSchema.safeParse(" fidelite-abcd2345 ").success).toBe(true);
    expect(loyaltyRedeemCodeSchema.safeParse("FIDELITE-ABCD2345").success).toBe(true);
    expect(loyaltyRedeemCodeSchema.safeParse("GAIN-ABCD2345").success).toBe(false);
    expect(loyaltyRedeemCodeSchema.safeParse("FIDELITE-ABCI2345").success).toBe(false); // I interdit
  });

  it("grant token : 48 hex", () => {
    expect(consumeLoyaltySpinSchema.safeParse({ programId: UUID, grantToken: GRANT }).success).toBe(true);
    expect(consumeLoyaltySpinSchema.safeParse({ programId: UUID, grantToken: "abc" }).success).toBe(false);
    expect(
      consumeLoyaltySpinSchema.safeParse({ programId: UUID, grantToken: "Z".repeat(48) }).success,
    ).toBe(false); // non hex
  });
});
