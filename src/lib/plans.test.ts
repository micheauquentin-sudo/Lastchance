// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cheapestTierFor,
  describeTier,
  entitlementsGainedBy,
  findPlanTier,
  formatMonthlyPrice,
  getPlanTier,
  PACKAGING_VERSION,
  PLAN_TIERS,
  planRank,
  recommendedTierFor,
  tierIncludes,
  upgradeTargetsFor,
  type PlanTier,
} from "./plans";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { Entitlement } from "@/platform/experiences/contract";

const ALL_ENTITLEMENTS: Entitlement[] = [
  ...new Set<Entitlement>([
    "core",
    ...EXPERIENCE_CATALOG.map((entry) => entry.entitlement),
  ]),
];

function tier(id: string): PlanTier {
  const found = findPlanTier(id);
  if (!found) throw new Error(`offre absente du catalogue : ${id}`);
  return found;
}

describe("proposition tarifaire — valeurs figées", () => {
  it("porte une version de packaging", () => {
    expect(PACKAGING_VERSION).toMatch(/^\d{4}-\d{2}-[a-z]$/);
  });

  /**
   * Ce test EST la proposition commerciale. Le faire tomber doit être un
   * acte délibéré (nouveau PACKAGING_VERSION), jamais un effet de bord.
   */
  it("29 / 59 / 89 / 129 € par mois", () => {
    expect(
      PLAN_TIERS.map((plan) => [plan.id, plan.priceMonthly, plan.currency]),
    ).toEqual([
      ["core", 29, "EUR"],
      ["engagement", 59, "EUR"],
      ["live", 89, "EUR"],
      ["full", 129, "EUR"],
    ]);
  });

  it("met le prix en forme au même endroit", () => {
    expect(formatMonthlyPrice(tier("core"))).toBe("29 €/mois");
    expect(formatMonthlyPrice(tier("full"))).toBe("129 €/mois");
  });

  it("classe les offres par prix strictement croissant", () => {
    for (let i = 1; i < PLAN_TIERS.length; i += 1) {
      expect(PLAN_TIERS[i].priceMonthly).toBeGreaterThan(
        PLAN_TIERS[i - 1].priceMonthly,
      );
      expect(planRank(PLAN_TIERS[i].id)).toBe(i);
    }
  });

  it("accorde le même essai partout", () => {
    for (const plan of PLAN_TIERS) {
      expect(plan.trialDays).toBe(7);
    }
  });
});

describe("cohérence du périmètre", () => {
  it("assoit chaque offre sur le socle core", () => {
    for (const plan of PLAN_TIERS) {
      expect(tierIncludes(plan, "core")).toBe(true);
    }
  });

  it("rend chaque droit accessible par au moins une offre", () => {
    for (const entitlement of ALL_ENTITLEMENTS) {
      expect(cheapestTierFor(entitlement)).not.toBeNull();
    }
  });

  it("fait de Full le sur-ensemble de toutes les autres", () => {
    const full = tier("full");
    for (const entitlement of ALL_ENTITLEMENTS) {
      expect(tierIncludes(full, entitlement)).toBe(true);
    }
    for (const plan of PLAN_TIERS) {
      expect(entitlementsGainedBy(plan.id, "full").length).toBeGreaterThanOrEqual(
        0,
      );
      for (const entitlement of plan.entitlements) {
        expect(tierIncludes(full, entitlement)).toBe(true);
      }
    }
  });

  it("ne déclare aucun droit hors du catalogue produit", () => {
    for (const plan of PLAN_TIERS) {
      for (const entitlement of plan.entitlements) {
        expect(ALL_ENTITLEMENTS).toContain(entitlement);
      }
      expect(new Set(plan.entitlements).size).toBe(plan.entitlements.length);
    }
  });

  it("désigne l'offre la moins chère qui ouvre un module", () => {
    expect(cheapestTierFor("loyalty")?.id).toBe("engagement");
    expect(cheapestTierFor("hunts")?.id).toBe("engagement");
    expect(cheapestTierFor("referral")?.id).toBe("engagement");
    // Quiz est dans Engagement ET Live : l'upsell doit citer le moins cher.
    expect(cheapestTierFor("quiz")?.id).toBe("engagement");
    expect(cheapestTierFor("events")?.id).toBe("live");
    expect(cheapestTierFor("pronostics")?.id).toBe("live");
    expect(cheapestTierFor("jackpot")?.id).toBe("live");
  });
});

describe("transitions et upsell", () => {
  it("ne propose que des montées plus chères ET plus complètes", () => {
    for (const plan of PLAN_TIERS) {
      for (const target of upgradeTargetsFor(plan.id)) {
        expect(target.priceMonthly).toBeGreaterThan(plan.priceMonthly);
        for (const entitlement of plan.entitlements) {
          expect(tierIncludes(target, entitlement)).toBe(true);
        }
      }
    }
  });

  it("établit le chemin d'upgrade attendu", () => {
    expect(upgradeTargetsFor("core").map((plan) => plan.id)).toEqual([
      "engagement",
      "live",
      "full",
    ]);
    // Live coûte plus cher qu'Engagement mais retirerait fidélité, calendrier,
    // parrainage et chasses : ce n'est pas une montée en gamme.
    expect(upgradeTargetsFor("engagement").map((plan) => plan.id)).toEqual([
      "full",
    ]);
    expect(upgradeTargetsFor("live").map((plan) => plan.id)).toEqual(["full"]);
    expect(upgradeTargetsFor("full")).toEqual([]);
  });

  it("énumère les modules gagnés par une montée", () => {
    expect(entitlementsGainedBy("core", "engagement")).toEqual([
      "loyalty",
      "calendar",
      "referral",
      "hunts",
      "quiz",
    ]);
    expect(entitlementsGainedBy("engagement", "full")).toEqual([
      "pronostics",
      "jackpot",
      "events",
    ]);
    expect(entitlementsGainedBy("full", "core")).toEqual([]);
  });

  it("regroupe Engagement + Live sous Full, moins cher que leur somme", () => {
    const cumul = [
      ...tier("engagement").entitlements,
      ...tier("live").entitlements,
    ];
    const recommended = recommendedTierFor(cumul);
    expect(recommended?.id).toBe("full");
    expect(recommended!.priceMonthly).toBeLessThan(
      tier("engagement").priceMonthly + tier("live").priceMonthly,
    );
  });

  it("recommande l'offre la moins chère qui couvre les droits détenus", () => {
    expect(recommendedTierFor(["core"])?.id).toBe("core");
    expect(recommendedTierFor(["core", "loyalty"])?.id).toBe("engagement");
    expect(recommendedTierFor(["events"])?.id).toBe("live");
  });
});

describe("résolution d'un plan stocké", () => {
  it("traduit l'identifiant historique starter", () => {
    expect(getPlanTier("starter").id).toBe("core");
    expect(findPlanTier("starter")?.id).toBe("core");
  });

  it("distingue l'inconnu (null) du repli d'affichage (core)", () => {
    expect(findPlanTier("offre-retiree")).toBeNull();
    expect(getPlanTier("offre-retiree").id).toBe("core");
    expect(getPlanTier("").id).toBe("core");
  });
});

describe("projection d'affichage", () => {
  it("nomme les expériences depuis le catalogue produit", () => {
    const view = describeTier(tier("engagement"));
    expect(view.experiences).toContain("Passeport fidélité");
    expect(view.experiences).toContain("Jeux instantanés");
    expect(view.experiences).not.toContain("Événements live");
    expect(view.priceLabel).toBe("59 €/mois");
  });

  it("n'affiche la limite de participants que si le live est inclus", () => {
    expect(describeTier(tier("core")).limits).toEqual([]);
    expect(describeTier(tier("engagement")).limits).toEqual([]);
    expect(describeTier(tier("live")).limits).toEqual([
      "500 participants par session live",
    ]);
    expect(describeTier(tier("full")).limits).toEqual([
      "1000 participants par session live",
    ]);
  });

  it("ne laisse aucune offre sans expérience listée", () => {
    for (const plan of PLAN_TIERS) {
      expect(describeTier(plan).experiences.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Garde anti-divergence : la limite de participants affichée au commerçant
 * est appliquée en base par `event_participant_capacity()`. Si l'une bouge
 * sans l'autre, la vitrine promet une capacité que le serveur refuse.
 */
describe("limites — miroir du SQL", () => {
  it("aligne le catalogue sur event_participant_capacity()", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260805190000_security_equity.sql",
      ),
      "utf8",
    );
    const body = sql.slice(sql.indexOf("function public.event_participant_capacity"));
    const capacity = body.slice(0, body.indexOf("$$", body.indexOf("$$") + 2));

    expect(capacity).toContain("o.plan = 'full' then 1000");
    expect(capacity).toContain("o.plan = 'live' then 500");
    expect(capacity).toContain("else 100");

    expect(tier("full").limits.eventParticipants).toBe(1000);
    expect(tier("live").limits.eventParticipants).toBe(500);
    // Les offres non citées par le SQL tombent dans le `else`.
    expect(tier("core").limits.eventParticipants).toBe(100);
    expect(tier("engagement").limits.eventParticipants).toBe(100);
  });
});

/**
 * Invariant « aucun prix réel engagé depuis le code » : le montant facturé
 * vient toujours d'un `price` Stripe désigné par variable d'environnement.
 * `price_data` / `unit_amount` permettraient d'inventer un montant à la
 * volée depuis les valeurs de vitrine — ils sont interdits dans src/.
 */
describe("aucun montant construit dans le code", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("n'utilise ni price_data ni unit_amount dans src/", () => {
    const offenders = walk(join(process.cwd(), "src")).filter((file) => {
      if (file.endsWith("plans.test.ts")) return false;
      const source = readFileSync(file, "utf8");
      return source.includes("price_data") || source.includes("unit_amount");
    });
    expect(offenders).toEqual([]);
  });

  it("ne fait pas transiter le prix de vitrine par l'action de checkout", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "actions", "billing.ts"),
      "utf8",
    );
    expect(source).not.toContain("priceMonthly");
    expect(source).toContain("resolveCheckoutPlan");
  });
});
