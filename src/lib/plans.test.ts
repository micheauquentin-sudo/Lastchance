// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADDON_EXPIRY_RULES,
  ADDON_OFFERS,
  ADDON_TRIAL_DAYS,
  ADDONS_LIGNE_ABONNEMENT,
  ADDONS_PURCHASABLE_STANDALONE,
  ADDONS_STANDALONE,
  cheapestTierFor,
  describeTier,
  entitlementsGainedBy,
  findAddonOffer,
  findPlanTier,
  formatAddonPrice,
  formatMonthlyPrice,
  getPlanTier,
  PACKAGING_VERSION,
  PLAN_TIERS,
  planRank,
  recommendedTierFor,
  tierIncludes,
  upgradeTargetsFor,
  type AddonOffer,
  type PlanTier,
} from "./plans";
import { SELLABLE_ENTITLEMENTS } from "@/platform/experiences/catalog";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * DÉRIVÉ DES DEUX CATALOGUES depuis le 2026-08-22, et non plus du seul
 * catalogue d'expériences. Une offre peut contenir des modules qui ne sont pas
 * jouables — Vitrine, Réserver, Duo Miroir, Portrait de la Bande — et la garde
 * « aucun droit hors du catalogue produit » les refusait justement parce
 * qu'elle ne connaissait qu'une moitié du vocabulaire.
 */
const ALL_ENTITLEMENTS: readonly Entitlement[] = SELLABLE_ENTITLEMENTS;

function tier(id: string): PlanTier {
  const found = findPlanTier(id);
  if (!found) throw new Error(`offre absente du catalogue : ${id}`);
  return found;
}

describe("proposition tarifaire — valeurs figées", () => {
  it("porte une version de packaging", () => {
    expect(PACKAGING_VERSION).toMatch(/^\d{4}-\d{2}-[a-z]$/);
    // Renommage des offres + catalogue d'add-ons du 2026-08-04 : changer le
    // packaging sans changer sa version doit être impossible par inadvertance.
    expect(PACKAGING_VERSION).toBe("2026-09-a");
  });

  /**
   * Ce test EST la proposition commerciale. Le faire tomber doit être un
   * acte délibéré (nouveau PACKAGING_VERSION), jamais un effet de bord.
   */
  it("29 / 59 / 79 / 89 / 129 € par mois", () => {
    expect(
      PLAN_TIERS.map((plan) => [plan.id, plan.priceMonthly, plan.currency]),
    ).toEqual([
      ["core", 29, "EUR"],
      ["engagement", 59, "EUR"],
      // « Sur Place » (2026-08-22) : 29 + 20 + 30, sans remise. L'addition
      // reste calculable de tête, ce qui était la demande.
      ["place", 79, "EUR"],
      ["live", 89, "EUR"],
      // La Totale ne bouge pas alors qu'elle gagne quatre droits : décision
      // propriétaire, et c'est ce qui rend son sous-titre à nouveau vrai.
      ["full", 129, "EUR"],
    ]);
  });

  it("met le prix en forme au même endroit", () => {
    expect(formatMonthlyPrice(tier("core"))).toBe("29 €/mois");
    expect(formatMonthlyPrice(tier("full"))).toBe("129 €/mois");
  });

  /**
   * Noms validés le 2026-08-04 (docs/codex-handoff.md, §1). Les `id` restent
   * techniques : ils sont stockés dans `organizations.plan` et servent de clé
   * aux price IDs Stripe, les renommer casserait les abonnements existants.
   */
  it("porte les noms commerciaux validés sans toucher aux id techniques", () => {
    expect(PLAN_TIERS.map((plan) => [plan.id, plan.name])).toEqual([
      ["core", "Coup d'envoi"],
      ["engagement", "Le Club"],
      // Nom commercial arrêté le 2026-08-22 ; l'id technique `place` est
      // définitif — il part dans `organizations.plan` et dans le price Stripe.
      ["place", "Sur Place"],
      ["live", "Le Grand Jeu"],
      ["full", "La Totale"],
    ]);
    expect(PLAN_TIERS.map((plan) => [...plan.legacyIds])).toEqual([
      ["starter"],
      [],
      [],
      [],
      [],
    ]);
  });

  /**
   * Le cahier exige que l'objectif reste un sous-titre EXPLICITE : il ne doit
   * pas être déduit du seul nom de l'offre. La promesse ouvre donc la tagline.
   */
  it("laisse lire la promesse de chaque offre en sous-titre", () => {
    const promesses: Record<string, string> = {
      core: "lancer une animation",
      engagement: "fidéliser",
      place: "se faire lire et réserver",
      live: "animer régulièrement",
      full: "réunir toutes les briques",
    };
    for (const plan of PLAN_TIERS) {
      expect(plan.tagline.toLowerCase()).toContain(promesses[plan.id]);
      // « explicite » = en tête, pas noyé en fin de phrase.
      expect(plan.tagline.toLowerCase().startsWith(promesses[plan.id])).toBe(
        true,
      );
    }
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
      "place",
      "live",
      "full",
    ]);
    // Sur Place est PARALLÈLE au Club et au Grand Jeu, jamais au-dessus : y
    // monter depuis Le Club retirerait fidélité, calendrier, parrainage et
    // chasses. Seule La Totale reste proposable — exactement la relation qui
    // existe entre Le Club et Le Grand Jeu depuis le premier jour.
    expect(upgradeTargetsFor("place").map((plan) => plan.id)).toEqual(["full"]);
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
      "vitrine",
      "reserver",
      "rendez_vous",
    ]);
    // Ce que Sur Place apporte à qui vient du socle : le lieu, plus le quiz
    // que sa porte Vitrine exige — et rien d'autre du jeu.
    // Les deux salons ne sont plus gagnés en montant : ils sont déjà du socle.
    expect(entitlementsGainedBy("core", "place")).toEqual([
      "vitrine",
      // Les DEUX moitiés de l'ancien « Réserver » (2026-08-29). Sur Place les
      // incluait toutes deux quand elles ne formaient qu'un produit : n'en
      // garder qu'une lui ferait promettre moins qu'hier, à prix inchangé.
      "reserver",
      "rendez_vous",
      "quiz",
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
      "250 participants par session live",
    ]);
    // VEN-2 : 250 et non plus 500 — la jauge vendue passe SOUS la capacité
    // mesurée au lieu de s'asseoir dessus. Dérivation sur `PlanLimits`.
    expect(describeTier(tier("full")).limits).toEqual([
      "250 participants par session live",
    ]);
  });

  it("ne laisse aucune offre sans expérience listée", () => {
    for (const plan of PLAN_TIERS) {
      expect(describeTier(plan).experiences.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Garde anti-divergence : la limite de participants affichée au commerçant ne
 * doit JAMAIS dépasser celle qu'`event_participant_capacity()` applique en
 * base — sinon la vitrine promet une capacité que le serveur refuse.
 *
 * ── POURQUOI UNE INÉGALITÉ ET NON PLUS UNE ÉGALITÉ (VEN-2) ──
 *
 * Ce test exigeait l'égalité stricte, ce qui interdisait de faire redescendre
 * la promesse commerciale SEULE. Or les deux sens ne sont pas symétriques :
 * promettre moins que la base n'accorde est sans danger — un commerçant vend
 * 250 places, le serveur en aurait laissé passer 500 — tandis que promettre
 * plus est un mensonge à l'écran. La garde tient donc le sens dangereux, et
 * seulement lui. Le jour où la base redescendra à son tour, l'inégalité
 * redeviendra une égalité sans qu'on touche à ce test.
 */
describe("limites — plafond du SQL", () => {
  /** La jauge que la base accorde par plan, lue dans la migration en vigueur. */
  function capaciteSql(): { full: number; live: number; autre: number } {
    // La DERNIÈRE migration qui redéfinit la fonction fait foi :
    // `create or replace` remplace le corps entier, donc lire l'ancienne
    // (20260805190000) mesurerait un texte que la base n'exécute plus.
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260929120000_soiree_live.sql",
      ),
      "utf8",
    );
    const body = sql.slice(sql.indexOf("function public.event_participant_capacity"));
    const capacity = body.slice(0, body.indexOf("$$", body.indexOf("$$") + 2));

    // VEN-1 : 1000 SURVIT en base, mais sur la seule branche `comp_access`.
    // Un accès offert n'est pas une vente — c'est toute la distinction, et
    // c'est aussi pourquoi `PlanLimits` ne sait pas exprimer 1000.
    expect(capacity).toContain("then 1000");
    expect(capacity).toContain("o.comp_access");

    const lire = (motif: RegExp): number => {
      const trouve = motif.exec(capacity);
      if (!trouve) throw new Error(`branche introuvable dans le SQL : ${motif}`);
      return Number(trouve[1]);
    };
    return {
      full: lire(/when o\.plan = 'full' then (\d+)/),
      live: lire(/o\.plan = 'live' then (\d+)/),
      // Les offres non citées par le SQL tombent dans le `else`.
      autre: lire(/else (\d+)/),
    };
  }

  it("ne promet jamais plus que ce que la base accorde", () => {
    const sql = capaciteSql();
    expect(tier("full").limits.eventParticipants).toBeLessThanOrEqual(sql.full);
    expect(tier("live").limits.eventParticipants).toBeLessThanOrEqual(sql.live);
    expect(tier("core").limits.eventParticipants).toBeLessThanOrEqual(sql.autre);
    expect(tier("engagement").limits.eventParticipants).toBeLessThanOrEqual(
      sql.autre,
    );
  });

  /**
   * VEN-2 : la jauge vendue est une DÉRIVATION de la capacité mesurée
   * (`docs/perf-report.md` §7 : ~150 req/s disponibles, 0,4 req/s par joueur
   * à 2 500 ms de sondage, deux tiers de marge ⇒ 250). Figer la valeur ici ne
   * prouve rien sur la dérivation, mais empêche qu'elle remonte par
   * inadvertance : la remonter demande un banc neuf, donc un acte délibéré
   * qui passera par ce test.
   */
  it("vend 250 sur les offres live, 100 ailleurs", () => {
    expect(tier("live").limits.eventParticipants).toBe(250);
    expect(tier("full").limits.eventParticipants).toBe(250);
    expect(tier("core").limits.eventParticipants).toBe(100);
    expect(tier("engagement").limits.eventParticipants).toBe(100);
    expect(tier("place").limits.eventParticipants).toBe(100);
  });
});

/**
 * Garde « une seule source pour la jauge affichée » — dérivée du MESSAGE
 * RENDU, jamais d'une liste de fichiers.
 *
 * La phrase affichée au commerçant est fabriquée par `describeTier()` à
 * partir de `limits.eventParticipants`. Le risque n'est pas qu'elle soit
 * fausse aujourd'hui : c'est qu'une deuxième copie apparaisse quelque part —
 * une carte d'offre, un email, un argumentaire — et survive au prochain
 * changement de jauge. C'est exactement ce qui est arrivé au « 1000 ».
 *
 * On prend donc la phrase telle qu'elle est RENDUE, on en extrait le nombre
 * et le libellé, puis on cherche ce libellé précédé d'un nombre écrit en dur
 * dans tout le code. Si la formulation change un jour, la garde suit toute
 * seule — elle ne connaît aucun fichier par son nom.
 */
describe("jauge affichée — une seule source", () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "node_modules" || entry.name.startsWith(".")
          ? []
          : walkTs(full);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("dérive la ligne d'offre de limits.eventParticipants", () => {
    for (const plan of PLAN_TIERS) {
      const rendu = describeTier(plan).limits;
      if (!tierIncludes(plan, "events")) {
        expect(rendu).toEqual([]);
        continue;
      }
      expect(rendu).toHaveLength(1);
      const decoupe = /^(\d+) (.+)$/.exec(rendu[0]);
      expect(decoupe, `ligne d'offre illisible : ${rendu[0]}`).not.toBeNull();
      expect(Number(decoupe![1])).toBe(plan.limits.eventParticipants);
    }
  });

  it("n'est recopiée nulle part ailleurs", () => {
    // Le libellé vient du RENDU, pas d'une chaîne recopiée dans ce test.
    const rendu = describeTier(tier("live")).limits[0];
    const libelle = /^\d+ (.+)$/.exec(rendu)![1];
    const enDur = new RegExp(
      `\\d+\\s*${libelle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );

    const racines = [
      join(process.cwd(), "src"),
      join(process.cwd(), "site", "src"),
    ];
    const coupables = racines
      .flatMap((racine) => walkTs(racine))
      .filter((file) => {
        // Ce fichier PORTE la phrase attendue : c'est sa raison d'être.
        if (file.endsWith("plans.test.ts")) return false;
        // `pricing.generated.ts` est une PROJECTION de `describeTier()`,
        // écrite par `npm run site:pricing` et gardée par
        // `site-pricing.test.ts` : le site vitrine étant un projet Next
        // séparé, il ne peut pas importer le catalogue (ADR-074). Une copie
        // générée ET gardée n'est pas une seconde source de vérité.
        if (file.endsWith("pricing.generated.ts")) return false;
        return enDur.test(readFileSync(file, "utf8"));
      });
    expect(coupables).toEqual([]);
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
      // `price_data` reste interdit PARTOUT : c'est lui qui invente un prix
      // au moment de facturer.
      if (source.includes("price_data")) return true;
      // `unit_amount` ne se juge pas au mot mais a la POSITION. En CLÉ
      // (`unit_amount:`), on compose un montant a envoyer — c'est ce que
      // l'invariant refuse. En LECTURE (`item.price.unit_amount`), on rapporte
      // ce que Stripe dit deja, et l'interdire empechait d'AFFICHER un prix
      // qu'on n'a pas choisi : la projection de facturation du back-office
      // (2026-08-23) s'y est heurtee. Le suffixe `_cents` de nos propres
      // champs ne matche pas, faute de deux-points colles.
      const construit = source.includes("unit_amount:")
        || source.includes("unit_amount :");
      // Une fixture de test ne facture personne.
      const estUnTest =
        file.endsWith(".test.ts") || file.endsWith(".test.tsx");
      return construit && !estUnTest;
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

/**
 * Couverture du catalogue d'add-ons — DÉRIVÉE, jamais retapée.
 *
 * La liste de référence est `ADDON_PRICE_ENV` (`src/lib/stripe.ts`) : c'est
 * elle qui dit quels add-ons Stripe peut réellement accorder. Un neuvième
 * add-on câblé là-bas fait rougir ce fichier tant qu'il n'est pas décrit ici,
 * et l'échec le NOMME. Une liste écrite à la main dans ce test aurait
 * exactement l'angle mort qu'on cherche à fermer.
 *
 * `ADDON_PRICE_ENV` n'est pas exportée : on lit la source. Le parseur est donc
 * lui-même un point de panne silencieuse — d'où la garde de non-vacuité
 * ci-dessous, sans laquelle un parseur cassé rendrait une liste vide et ce
 * fichier passerait au vert sans rien mesurer.
 */
describe("catalogue d'add-ons — couverture dérivée de Stripe", () => {
  const stripeSource = readFileSync(
    join(process.cwd(), "src", "lib", "stripe.ts"),
    "utf8",
  );

  function addonEntitlementsWiredInStripe(): string[] {
    const start = stripeSource.indexOf("const ADDON_PRICE_ENV");
    expect(start).toBeGreaterThan(-1);
    const block = stripeSource.slice(start, stripeSource.indexOf("];", start));
    // `[a-z_]+` : même angle mort que la garde de parité — `rendez_vous` est le
    // premier droit à porter un underscore, et `[a-z]+` le sautait en silence,
    // faisant croire que Stripe ne le connaissait pas alors qu'il est déclaré.
    return [...block.matchAll(/entitlement:\s*"([a-z_]+)"/g)].map(
      (match) => match[1],
    );
  }

  const wired = addonEntitlementsWiredInStripe();

  it("lit réellement ADDON_PRICE_ENV (garde de non-vacuité)", () => {
    expect(wired.length).toBeGreaterThan(0);
    for (const entitlement of wired) {
      expect(ALL_ENTITLEMENTS).toContain(entitlement as Entitlement);
      expect(entitlement).not.toBe("core");
    }
  });

  it("décrit chaque add-on que Stripe peut accorder", () => {
    const undescribed = wired.filter(
      (entitlement) =>
        !ADDON_OFFERS.some((addon) => addon.entitlement === entitlement),
    );
    expect(undescribed).toEqual([]);
  });

  it("ne décrit aucun add-on que Stripe ne connaît pas", () => {
    const unwired = ADDON_OFFERS.map((addon) => addon.entitlement).filter(
      (entitlement) => !wired.includes(entitlement),
    );
    expect(unwired).toEqual([]);
  });

  it("ne décrit pas deux fois le même droit", () => {
    const entitlements = ADDON_OFFERS.map((addon) => addon.entitlement);
    expect(new Set(entitlements).size).toBe(entitlements.length);
  });

  it("retrouve un add-on par son droit, et rien d'autre", () => {
    expect(findAddonOffer("loyalty")?.name).toBe("Passeport des habitués");
    expect(findAddonOffer("core")).toBeNull();
  });
});

describe("catalogue d'add-ons — prix et modèles validés", () => {
  function addon(entitlement: Entitlement): AddonOffer {
    const found = findAddonOffer(entitlement);
    if (!found) throw new Error(`add-on absent du catalogue : ${entitlement}`);
    return found;
  }

  it("nomme les treize options, les trois de lieu en tête", () => {
    expect(ADDON_OFFERS.map((item) => [item.entitlement, item.name])).toEqual([
      // Les TROIS options de ligne d'abonnement (2026-08-22, plus la
      // Réservation le 2026-08-29). En tête parce qu'elles ouvrent le
      // catalogue commercial, pas par ancienneté.
      ["vitrine", "Vitrine"],
      // « Réserver » à 30 € est devenu DEUX produits à 20 € : la clé
      // `reserver` garde les Moments, `rendez_vous` prend la prise de
      // rendez-vous. La clé ne suit pas le nom — les octrois déjà posés
      // continuent d'ouvrir ce qu'ils ouvraient.
      ["reserver", "Moments"],
      ["rendez_vous", "Réservation"],
      ["loyalty", "Passeport des habitués"],
      ["referral", "Bouche-à-oreille / Parrainage"],
      // LES DEUX SALONS (DUO-2). Ils restent dans les CINQ offres — la garde
      // « met Duo Miroir et Portrait de la Bande dans toutes les offres »
      // plus bas l'épingle — et entrent AUSSI au catalogue, à 12 € chacun.
      // Le seul acheteur possible est donc celui qui n'a pas d'abonnement.
      ["duo", "Duo Miroir"],
      ["bande", "Portrait de la Bande"],
      ["hunts", "Chasse au QR"],
      ["calendar", "Calendrier à surprises"],
      ["quiz", "Quiz express"],
      ["jackpot", "Cagnotte collective"],
      ["pronostics", "Saison de pronostics"],
      ["events", "Soirée en jeu"],
    ]);
  });

  it("facture les mécaniques continues au mois, sans engagement", () => {
    const attendu: Array<[Entitlement, number]> = [
      ["loyalty", 19],
      ["referral", 12],
    ];
    for (const [entitlement, priceMonthly] of attendu) {
      const billing = addon(entitlement).billing;
      expect(billing.model).toBe("recurring-monthly");
      if (billing.model !== "recurring-monthly") continue;
      expect(billing.priceMonthly).toBe(priceMonthly);
      expect(billing.commitment).toBe("none");
      expect(billing.endsAt).toBe("end-of-paid-period");
    }
  });

  it("borne les achats uniques en durée ET en fenêtre d'activation", () => {
    const attendu: Array<[Entitlement, number, number, string | null]> = [
      ["hunts", 29, 30, null],
      ["calendar", 29, 31, "une campagne"],
      ["quiz", 15, 7, null],
      ["jackpot", 29, 30, null],
    ];
    for (const [entitlement, price, activeDays, bound] of attendu) {
      const billing = addon(entitlement).billing;
      expect(billing.model).toBe("one-off-window");
      if (billing.model !== "one-off-window") continue;
      expect(billing.price).toBe(price);
      expect(billing.activeDays).toBe(activeDays);
      expect(billing.boundResource).toBe(bound);
      // Les quatre achats uniques partagent la même fenêtre d'activation.
      expect(billing.activationWindowDays).toBe(90);
    }
  });

  /**
   * Règle longue du cahier : la saison de pronostics se borne à UNE
   * compétition, pas à un nombre de jours — couper à 90 jours découperait une
   * Ligue 1 en plein milieu. Les trois bornes sont donc portées séparément.
   */
  it("borne la saison de pronostics à une compétition, pas à 90 jours", () => {
    const billing = addon("pronostics").billing;
    expect(billing.model).toBe("single-competition");
    if (billing.model !== "single-competition") return;
    expect(billing.price).toBe(39);
    expect(billing.boundResource).toContain("contest_id");
    expect(billing.graceDaysAfterEnd).toBe(7);
    expect(billing.hardCapMonths).toBe(12);
    expect(billing.dataReadableDaysAfterEnd).toBe(30);
    expect(billing.hardCapMonths * 30).toBeGreaterThan(90);
    const regles = addon("pronostics").rules.join(" ");
    expect(regles).toContain("clôture manuelle");
    expect(regles).toContain("le droit de jouer ne continue pas");
  });

  /**
   * Règle longue du cahier : la jauge de la soirée est choisie AVANT paiement
   * et jamais ajustée rétroactivement.
   */
  it("fige la jauge de la soirée avant paiement", () => {
    const billing = addon("events").billing;
    expect(billing.model).toBe("capacity-pass");
    if (billing.model !== "capacity-pass") return;
    expect(billing.steps.map((step) => [step.maxPlayers, step.price])).toEqual([
      [10, 9],
      [30, 19],
      [50, 29],
    ]);
    for (let i = 1; i < billing.steps.length; i += 1) {
      expect(billing.steps[i].maxPlayers).toBeGreaterThan(
        billing.steps[i - 1].maxPlayers,
      );
      expect(billing.steps[i].price).toBeGreaterThan(billing.steps[i - 1].price);
    }
    expect(billing.capacityFixedBeforePayment).toBe(true);
    expect(billing.preparationDays).toBe(7);
    expect(billing.playHours).toBe(24);
    expect(billing.activationWindowDays).toBe(30);
    expect([...billing.temporarilyIncludes]).toEqual(["core", "events", "quiz"]);
    const regles = addon("events").rules.join(" ");
    expect(regles).toContain("jamais ajustée ni facturée rétroactivement");
    expect(regles).toContain("benchmark de capacité live");
  });

  it("n'accorde aucun essai sur les add-ons", () => {
    expect(ADDON_TRIAL_DAYS).toBe(0);
    // L'essai reste celui de l'offre principale.
    for (const plan of PLAN_TIERS) {
      expect(plan.trialDays).toBeGreaterThan(ADDON_TRIAL_DAYS);
    }
  });

  /**
   * LE BOOLÉEN GLOBAL A CESSÉ D'ÊTRE VRAI, ET C'EST LE POINT DU LOT.
   *
   * « Tout add-on est achetable seul » valait des huit premiers. Vitrine et
   * Réserver ne se vendent qu'en ligne d'un abonnement en cours : les vendre
   * seules donnerait le socle à 20 €, alors qu'il en coûte 29. Le booléen est
   * désormais DÉRIVÉ, donc il dit la vérité au lieu de la promettre.
   */
  it("distingue les options achetables seules de celles qui sont des lignes", () => {
    expect(ADDONS_PURCHASABLE_STANDALONE).toBe(false);
    expect(ADDONS_STANDALONE).toHaveLength(10);
    expect(ADDONS_LIGNE_ABONNEMENT.map((o) => o.entitlement)).toEqual([
      "vitrine",
      "reserver",
      "rendez_vous",
    ]);
    for (const offre of ADDONS_STANDALONE) {
      expect(offre.soldStandalone).toBe(true);
    }
  });

  /**
   * LES DEUX SALONS SONT DU SOCLE, DONC DANS LES CINQ OFFRES.
   *
   * Ils ont d'abord été vendus avec la Vitrine — un prix, trois colonnes. Ce
   * n'était pas un modèle de vente, c'était leur histoire : ils sont nés sous
   * son droit. Ce sont des jeux, et un jeu ne se vend pas avec une carte de
   * restaurant. Le test vaut donc sur les CINQ offres, pas sur une option.
   */
  it("met Duo Miroir et Portrait de la Bande dans toutes les offres", () => {
    for (const plan of PLAN_TIERS) {
      expect(tierIncludes(plan, "duo"), plan.id).toBe(true);
      expect(tierIncludes(plan, "bande"), plan.id).toBe(true);
    }
    // Et l'offre d'entrée les liste bien au commerçant.
    const vue = describeTier(tier("core")).experiences;
    expect(vue).toContain("Duo Miroir");
    expect(vue).toContain("Portrait de la Bande");
  });

  it("écrit la mise en pause sûre à l'échéance", () => {
    expect(ADDON_EXPIRY_RULES.length).toBeGreaterThan(0);
    const regles = ADDON_EXPIRY_RULES.join(" ");
    expect(regles).toContain("mise en pause");
    expect(regles).toContain("prolonger silencieusement");
  });

  it("ne laisse aucun add-on sans règle écrite", () => {
    for (const item of ADDON_OFFERS) {
      expect(item.rules.length).toBeGreaterThan(0);
      expect(item.currency).toBe("EUR");
    }
  });

  it("met en forme les quatre modèles de prix, chacun à sa façon", () => {
    expect(formatAddonPrice(addon("loyalty"))).toBe("19 €/mois");
    expect(formatAddonPrice(addon("hunts"))).toBe("29 € / 30 jours");
    expect(formatAddonPrice(addon("calendar"))).toBe(
      "29 € / une campagne jusqu'à 31 jours",
    );
    expect(formatAddonPrice(addon("pronostics"))).toBe(
      "39 € / une compétition",
    );
    expect(formatAddonPrice(addon("events"))).toBe(
      "9 € (10 joueurs) · 19 € (30 joueurs) · 29 € (50 joueurs)",
    );
  });
});

/**
 * Le catalogue d'add-ons est DESCRIPTIF : il ne borne rien aujourd'hui. Son
 * en-tête doit le dire, parce qu'un prix lu ici se prend spontanément pour un
 * droit appliqué — or `organizations.addon_*` sont des booléens permanents.
 */
describe("catalogue d'add-ons — l'en-tête avoue ce qu'il n'applique pas", () => {
  it("prévient que rien n'est borné ni facturé depuis ce fichier", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "plans.ts"),
      "utf8",
    );
    const header = source.slice(source.indexOf("CATALOGUE D'ADD-ONS"));
    expect(header).toContain("DESCRIPTIF");
    expect(header).toContain("booléens permanents");
    expect(header).toContain("P0");
  });
});
