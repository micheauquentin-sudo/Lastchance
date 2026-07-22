import { describe, expect, it } from "vitest";
import {
  createLoyaltyMilestoneSchema,
  updateLoyaltyProgramSchema,
} from "@/lib/validations/loyalty";
import {
  LOYALTY_COOLDOWN_PRESETS,
  LOYALTY_DEFAULT_LOT_STOCK,
  LOYALTY_MAX_LOT_STOCK,
  LOYALTY_MILESTONE_MAX_VISITS,
  LOYALTY_MILESTONE_MIN_VISITS,
  LOYALTY_PERIOD_PRESETS,
  loyaltyCooldownFloor,
  loyaltyPeriodOptions,
  resolveLoyaltyCooldown,
} from "./loyalty-settings-presets";

describe("préréglages de rotation", () => {
  it("ne propose que des valeurs acceptées par la base (15..300 s)", () => {
    for (const preset of LOYALTY_PERIOD_PRESETS) {
      expect(preset.value).toBeGreaterThanOrEqual(15);
      expect(preset.value).toBeLessThanOrEqual(300);
    }
  });

  it("ajoute la valeur courante si atypique mais valide", () => {
    expect(loyaltyPeriodOptions(45)[0]).toEqual({
      value: 45,
      label: "45 s (personnalisé)",
    });
  });

  it("n'expose pas une valeur héritée hors bornes", () => {
    expect(loyaltyPeriodOptions(3600).map((o) => o.value)).toEqual(
      LOYALTY_PERIOD_PRESETS.map((p) => p.value),
    );
  });
});

describe("loyaltyCooldownFloor", () => {
  it("plancher de 5 min en validation caisse (marge sur la TTL du jeton)", () => {
    // La base garantit 180 s (TTL du jeton) ; l'UI propose 300 s pour ne
    // pas dépendre de la synchro d'horloge app↔Postgres.
    expect(loyaltyCooldownFloor("staff", 300)).toBe(300);
    // Indépendant de la période de rotation, inutilisée dans ce mode.
    expect(loyaltyCooldownFloor("staff", 30)).toBe(300);
  });

  it("plancher de 5 min en code tournant", () => {
    // 2 × 30 s = 60 s < 300 s : le plancher absolu l'emporte.
    expect(loyaltyCooldownFloor("rotating_code", 30)).toBe(300);
    expect(loyaltyCooldownFloor("rotating_code", 120)).toBe(300);
  });

  it("vaut deux périodes dès que le double dépasse le plancher", () => {
    // Un code est accepté sur DEUX fenêtres (record_loyalty_stamp) : le
    // cooldown doit couvrir toute sa durée de validité, sinon un code lu une
    // fois vaut deux tampons. Miroir du CHECK durci (20260725180000).
    expect(loyaltyCooldownFloor("rotating_code", 300)).toBe(600);
    expect(loyaltyCooldownFloor("rotating_code", 200)).toBe(400);
  });
});

describe("resolveLoyaltyCooldown", () => {
  it("mode caisse : « aucune limite » retirée, correction vers 5 min", () => {
    const r = resolveLoyaltyCooldown({
      mode: "staff",
      periodSeconds: 60,
      cooldownSeconds: 0,
    });
    expect(r.adjusted).toBe(true);
    expect(r.value).toBe(300);
    expect(r.floorSeconds).toBe(300);
    expect(r.options.some((o) => o.value === 0)).toBe(false);
    // « Aucune limite » (0) et « 3 minutes » (180) passent sous le plancher.
    expect(r.options.some((o) => o.value === 180)).toBe(false);
    expect(r.options).toHaveLength(LOYALTY_COOLDOWN_PRESETS.length - 2);
  });

  it("mode code tournant : « aucune limite » retirée des options", () => {
    const r = resolveLoyaltyCooldown({
      mode: "rotating_code",
      periodSeconds: 60,
      cooldownSeconds: 86400,
    });
    expect(r.options.some((o) => o.value === 0)).toBe(false);
    expect(r.options.every((o) => o.value >= 300)).toBe(true);
    expect(r.adjusted).toBe(false);
    expect(r.value).toBe(86400);
  });

  it("corrige une valeur devenue invalide après bascule vers le code tournant", () => {
    const r = resolveLoyaltyCooldown({
      mode: "rotating_code",
      periodSeconds: 60,
      cooldownSeconds: 0,
    });
    expect(r.adjusted).toBe(true);
    expect(r.value).toBe(300);
    expect(r.floorSeconds).toBe(300);
  });

  it("rotation la plus lente : le plancher passe à 10 min, pas à 1 h", () => {
    // Période 300 s ⇒ plancher 600 s. Le préréglage de 10 min existe pour que
    // la correction d'office ne projette pas le commerçant à l'heure pleine.
    const r = resolveLoyaltyCooldown({
      mode: "rotating_code",
      periodSeconds: 300,
      cooldownSeconds: 300,
    });
    expect(r.floorSeconds).toBe(600);
    expect(r.adjusted).toBe(true);
    expect(r.value).toBe(600);
    expect(r.options.every((o) => o.value >= 600)).toBe(true);
  });

  it("conserve une valeur personnalisée conforme dans les options", () => {
    const r = resolveLoyaltyCooldown({
      mode: "rotating_code",
      periodSeconds: 60,
      cooldownSeconds: 7200,
    });
    expect(r.value).toBe(7200);
    expect(r.options[0].value).toBe(7200);
  });
});

describe("bornes des paliers (verrous économiques)", () => {
  const PROGRAM_ID = "00000000-0000-4000-8000-000000000002";
  const WHEEL_ID = "00000000-0000-4000-8000-000000000003";

  /** Palier « lot » tel que le formulaire le poste (FormData → chaînes). */
  const lot = (over: Record<string, unknown> = {}) => ({
    program_id: PROGRAM_ID,
    visit_count: String(LOYALTY_MILESTONE_MIN_VISITS),
    reward_type: "lot",
    reward_label: "Un café offert",
    reward_details: "",
    reward_stock: String(LOYALTY_DEFAULT_LOT_STOCK),
    target_wheel_id: "",
    ...over,
  });

  it("les valeurs par défaut du formulaire passent le schéma serveur", () => {
    // Ce que voit le commerçant à l'ouverture d'« Ajouter un palier » doit
    // être acceptable tel quel : sinon le premier envoi part en erreur.
    expect(createLoyaltyMilestoneSchema.safeParse(lot()).success).toBe(true);
  });

  it("le plancher du champ « visites » est celui que la base impose", () => {
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({ visit_count: String(LOYALTY_MILESTONE_MIN_VISITS - 1) }),
      ).success,
    ).toBe(false);
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({ visit_count: String(LOYALTY_MILESTONE_MAX_VISITS) }),
      ).success,
    ).toBe(true);
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({ visit_count: String(LOYALTY_MILESTONE_MAX_VISITS + 1) }),
      ).success,
    ).toBe(false);
  });

  it("un lot sans stock est refusé — le champ ne peut plus rester vide", () => {
    // Miroir du CHECK SQL : « illimité » n'existe plus, le stock borne la
    // perte maximale du programme.
    expect(
      createLoyaltyMilestoneSchema.safeParse(lot({ reward_stock: "" })).success,
    ).toBe(false);
    // 0 reste valide : « épuisé / en pause », sans toucher aux codes émis.
    expect(
      createLoyaltyMilestoneSchema.safeParse(lot({ reward_stock: "0" })).success,
    ).toBe(true);
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({ reward_stock: String(LOYALTY_MAX_LOT_STOCK) }),
      ).success,
    ).toBe(true);
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({ reward_stock: String(LOYALTY_MAX_LOT_STOCK + 1) }),
      ).success,
    ).toBe(false);
  });

  it("un palier « spin » ne porte pas de stock (le champ n'est pas rendu)", () => {
    // L'UI démonte le champ stock en mode spin : rien n'est posté, donc null.
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({
          reward_type: "spin",
          reward_label: "",
          reward_stock: "",
          target_wheel_id: WHEEL_ID,
        }),
      ).success,
    ).toBe(true);
    expect(
      createLoyaltyMilestoneSchema.safeParse(
        lot({
          reward_type: "spin",
          reward_label: "",
          reward_stock: "10",
          target_wheel_id: WHEEL_ID,
        }),
      ).success,
    ).toBe(false);
  });
});

describe("cohérence avec la validation serveur", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Café du coin",
    silver_threshold: 5,
    gold_threshold: 10,
  };

  it("chaque couple (période, cooldown) proposé passe le schéma Zod", () => {
    for (const mode of ["rotating_code", "staff"] as const) {
      for (const period of LOYALTY_PERIOD_PRESETS) {
        const resolved = resolveLoyaltyCooldown({
          mode,
          periodSeconds: period.value,
          cooldownSeconds: 0,
        });
        for (const option of resolved.options) {
          const parsed = updateLoyaltyProgramSchema.safeParse({
            ...base,
            validation_mode: mode,
            rotating_period_seconds: period.value,
            min_stamp_interval_seconds: option.value,
          });
          expect(parsed.success).toBe(true);
        }
      }
    }
  });

  it("refuse un cooldown plus court que la validité du code (2 × période)", () => {
    // Le CHECK SQL durci (20260725180000) refuserait 300 s pour une rotation
    // de 300 s ; sans ce miroir Zod le commerçant récolterait une 23514 brute.
    const payload = {
      ...base,
      validation_mode: "rotating_code" as const,
      rotating_period_seconds: 300,
    };
    expect(
      updateLoyaltyProgramSchema.safeParse({
        ...payload,
        min_stamp_interval_seconds: 300,
      }).success,
    ).toBe(false);
    expect(
      updateLoyaltyProgramSchema.safeParse({
        ...payload,
        min_stamp_interval_seconds: 600,
      }).success,
    ).toBe(true);
  });

  it("la valeur corrigée est acceptée là où l'ancienne était refusée", () => {
    const payload = {
      ...base,
      validation_mode: "rotating_code" as const,
      rotating_period_seconds: 60,
    };
    expect(
      updateLoyaltyProgramSchema.safeParse({
        ...payload,
        min_stamp_interval_seconds: 0,
      }).success,
    ).toBe(false);
    expect(
      updateLoyaltyProgramSchema.safeParse({
        ...payload,
        min_stamp_interval_seconds: resolveLoyaltyCooldown({
          mode: "rotating_code",
          periodSeconds: 60,
          cooldownSeconds: 0,
        }).value,
      }).success,
    ).toBe(true);
  });
});
