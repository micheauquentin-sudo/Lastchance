import { describe, expect, it } from "vitest";
import { updateLoyaltyProgramSchema } from "@/lib/validations/loyalty";
import {
  LOYALTY_COOLDOWN_PRESETS,
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
    expect(loyaltyCooldownFloor("rotating_code", 30)).toBe(300);
  });

  it("suit la période quand elle dépasse le plancher", () => {
    expect(loyaltyCooldownFloor("rotating_code", 300)).toBe(300);
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
