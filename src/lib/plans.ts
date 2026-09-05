import {
  EXPERIENCE_CATALOG,
  MODULE_CATALOG,
} from "@/platform/experiences/catalog";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * CATALOGUE D'OFFRES — source de vérité du packaging.
 *
 * Ce module est **descriptif**, jamais monétaire : il dit ce qu'une offre
 * contient, ce qu'elle vaut à l'affichage et vers quoi elle mène. Le montant
 * réellement facturé vient toujours du `price` Stripe désigné par les
 * variables d'environnement (voir `getPlanPriceId` dans `@/lib/stripe`) —
 * aucun chemin de code ne construit un montant à partir d'ici : les
 * paramètres Stripe qui permettraient de facturer un montant ad hoc sont
 * interdits dans `src/`, garde exécutable dans plans.test.ts.
 *
 * `priceMonthly` est donc un prix **de vitrine** : il sert à afficher l'offre
 * au commerçant et à estimer le MRR au back-office. S'il diverge du price
 * Stripe, c'est l'affichage qui ment, pas la facture.
 *
 * Pur (aucun accès env, aucun `server-only`) : importable depuis un composant
 * serveur comme depuis un composant client.
 */

/**
 * Version du packaging. À incrémenter à chaque changement de prix, de
 * périmètre ou de limite — les tests figent la proposition associée, et un
 * changement non intentionnel casse la suite au lieu de passer inaperçu.
 */
export const PACKAGING_VERSION = "2026-09-a";

export type PlanTierId = "core" | "engagement" | "place" | "live" | "full";

export interface PlanLimits {
  /**
   * Participants simultanés d'une session d'événement live.
   *
   * ── D'OÙ VIENT 250, ET COMMENT LE RECALCULER (VEN-2) ──
   *
   * Ce chiffre est une DÉRIVATION, pas un vœu. Il se recalcule, et il doit
   * l'être dès qu'un banc neuf existe : c'est faute de l'avoir été que
   * « 1000 » est resté vendable des mois après la mesure qui le niait, puis
   * que « 500 » lui a succédé sans jamais passer sous la capacité mesurée.
   *
   * 1. CAPACITÉ MESURÉE — `docs/perf-report.md` §7 : ~150 req/s disponibles
   *    en production sur `getEventState`. Obtenu en transposant la meilleure
   *    mesure locale (61 req/s, A/B du 2026-08-08) au rapport local→prod
   *    observé sur le chemin d'écriture (160 → 409, soit ×2,5).
   *
   * 2. BESOIN PAR JOUEUR — un participant n'est pas une requête, c'est un
   *    sondage continu. `eventPollDelay` rend 2 500 ms en question active
   *    lorsque Realtime est coupé (`src/lib/event-realtime-contract.ts`),
   *    soit 0,4 req/s par joueur. HYPOTHÈSE : le besoin est LINÉAIRE en
   *    nombre de joueurs. C'est celle du document, qui pose 1 000 ⇒ 400
   *    req/s, 500 ⇒ 200 req/s, 100 ⇒ 40 req/s.
   *
   * 3. REALTIME SUPPOSÉ COUPÉ. `EVENTS_REALTIME_ENABLED` n'est pas posé en
   *    production et son activation reste non cochée dans `docs/roadmap.md`.
   *    Actif, il diviserait le besoin par douze — mais dimensionner une
   *    promesse commerciale dessus, c'est vendre un geste d'exploitation qui
   *    n'a pas eu lieu.
   *
   * 4. LE CACHE D'1 s DU WAGON 5 N'EST PAS COMPTÉ. Il est livré (migration
   *    20260929120000) et `docs/perf-report.md` dit lui-même qu'il n'a
   *    jamais été re-mesuré dos à dos. Un gain non mesuré ne se vend pas.
   *
   * 5. MARGE — on retient les DEUX TIERS de la capacité mesurée, soit un
   *    budget de 100 req/s : 100 / 0,4 = 250 joueurs. Le tiers laissé de côté
   *    n'est pas décoratif — le même rapport mesure un facteur DEUX entre
   *    deux campagnes du même code sur la même machine (26 puis 61 req/s), et
   *    les ~150 transposent la plus favorable des deux.
   *
   * 100 reste tenable sur la même mesure — 40 req/s, soit 27 % de la
   * capacité, très en dessous du budget. Inchangé.
   *
   * POUR RÉVISER : rejouer `npm run capacity:bench`
   * (`scripts/capacity-bench.mjs`), mettre à jour `docs/perf-report.md` §7,
   * puis refaire les cinq points ci-dessus. Sans banc neuf, ne pas remonter
   * la jauge.
   *
   * ── LA BASE, ELLE, EN ACCORDE ENCORE PLUS ──
   *
   * `event_participant_capacity()` (migration 20260929120000_soiree_live.sql)
   * rend toujours 500 pour `live`/`full`, et 1000 pour la seule branche
   * `comp_access` — un accès OFFERT n'est pas une vente, c'est au contraire
   * la population sur laquelle le banc se fera. Le catalogue promet donc
   * MOINS que ce que le serveur laisse passer : c'est le seul sens sûr, et
   * `plans.test.ts` garde désormais l'INÉGALITÉ dans ce sens-là plutôt que
   * l'égalité. Promettre plus que la base n'accorde reste une erreur.
   *
   * Le type porte l'interdit : écrire 500 ou 1000 ici ne compile plus.
   * Élargir l'union redevient un acte délibéré, à justifier par une mesure.
   */
  eventParticipants: 100 | 250;
}

export interface PlanTier {
  id: PlanTierId;
  /** Identifiants historiques encore stockés dans `organizations.plan`. */
  legacyIds: readonly string[];
  name: string;
  tagline: string;
  /** Prix de vitrine mensuel en euros. Voir l'avertissement en tête. */
  priceMonthly: number;
  currency: "EUR";
  trialDays: number;
  /** Droits ouverts par l'offre — `core` est le socle commun. */
  entitlements: readonly Entitlement[];
  limits: PlanLimits;
  /** Capacités incluses qui ne passent pas par un droit (socle commun). */
  highlights: readonly string[];
}

/**
 * Ordre = ordre de prix croissant. `resolveStripeEntitlements` s'en sert
 * aussi comme ordre de précédence quand un abonnement porte plusieurs prix
 * d'offre : le plus haut gagne pour l'étiquette `organizations.plan`.
 *
 * L'échelle n'est PAS linéaire : Le Club (asynchrone, fidélisation) et
 * Le Grand Jeu (temps réel, animation) sont deux offres parallèles, pas deux
 * paliers. Passer de l'une à l'autre retirerait des modules — d'où
 * `upgradeTargetsFor`, qui ne propose que des offres strictement plus
 * complètes ET plus chères.
 *
 * Les `id` (`core`, `engagement`, `live`, `full`) sont des identifiants
 * TECHNIQUES : ils sont stockés dans `organizations.plan` et servent de clé
 * aux price IDs Stripe (`PLAN_PRICE_ENV`). Les renommer casserait les
 * abonnements existants — seuls `name` et `tagline` portent le vocabulaire
 * commercial, et ils ont été renommés le 2026-08-04 (voir
 * `docs/codex-handoff.md`, « décisions produit utilisateur », §1).
 *
 * Chaque `tagline` commence par la promesse validée dans ce §1 : le cahier
 * exige que l'objectif reste un sous-titre explicite et ne soit pas déduit du
 * seul nom de l'offre. Une garde de plans.test.ts le vérifie.
 */
export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: "core",
    legacyIds: ["starter"],
    name: "Coup d'envoi",
    tagline:
      "Lancer une animation : le jeu qui fait revenir vos clients, en libre-service.",
    priceMonthly: 29,
    currency: "EUR",
    trialDays: 7,
    /**
     * LES DEUX SALONS SONT DU SOCLE (2026-08-22), ET C'EST UN CHANGEMENT DE
     * NATURE, PAS DE PÉRIMÈTRE.
     *
     * Duo Miroir et Portrait de la Bande sont nés attachés à la Vitrine — même
     * droit, même écran, même adresse publique. Ils n'y avaient leur place que
     * par leur histoire : ce sont des JEUX, au même titre que les quinze jeux
     * rapides, et un jeu ne se vend pas avec une carte de restaurant.
     *
     * Les mettre dans `core` les met dans les cinq offres d'un coup, puisque
     * toutes s'assoient sur le socle. Le détachement technique — garde SQL et
     * adresse publique — vit dans la migration 20261022120000.
     */
    entitlements: ["core", "duo", "bande"],
    limits: { eventParticipants: 100 },
    highlights: [
      "QR codes et roues illimités",
      "Duo Miroir et Portrait de la Bande, jouables à table",
      "Lots remis en caisse avec code",
      "Studio créatif et affiches",
      "Emails automatiques et webhooks sortants",
    ],
  },
  {
    id: "engagement",
    legacyIds: [],
    name: "Le Club",
    tagline:
      "Fidéliser : installer l'habitude — fidélité, rendez-vous, bouche-à-oreille.",
    priceMonthly: 59,
    currency: "EUR",
    trialDays: 7,
    entitlements: ["core", "duo", "bande", "loyalty", "calendar", "referral", "hunts", "quiz"],
    limits: { eventParticipants: 100 },
    highlights: [
      "Tout Coup d'envoi",
      "Campagnes multi-modules sur la même clientèle",
    ],
  },
  {
    /**
     * L'IDENTIFIANT EST `place` ET NON `surplace`, DÉLIBÉRÉMENT.
     *
     * Il part dans `organizations.plan` et sert de clé au price Stripe : le
     * renommer casserait les abonnements en cours, comme le dit l'en-tête de
     * `PLAN_TIERS`. « Sur Place » est un nom COMMERCIAL, arrêté le 2026-08-22
     * après trois candidats — il vit donc dans `name`, où il peut changer sans
     * qu'une ligne de facturation bouge.
     */
    id: "place",
    legacyIds: [],
    name: "Sur Place",
    tagline:
      "Se faire lire et réserver : votre carte au QR code et votre agenda, dans un seul abonnement.",
    priceMonthly: 79,
    currency: "EUR",
    trialDays: 7,
    /**
     * `quiz` EST ICI, ET CE N'EST PAS UNE GÉNÉROSITÉ.
     *
     * La Vitrine porte une porte quiz depuis le lot L13 : le commerçant
     * l'ouvre en opt-in depuis une rubrique. Vendre la Vitrine sans le droit
     * quiz aurait livré une page dont un bouton configurable mène à un refus —
     * le commerçant l'aurait ouvert, pas le joueur. Un module qu'on affiche et
     * qu'on ferme coûte plus cher en confiance qu'il ne rapporte en upsell.
     *
     * Sans conséquence sur l'échelle : `cheapestTierFor("quiz")` reste
     * Le Club, à 59 €.
     */
    entitlements: [
      "core",
      "duo",
      "bande",
      "vitrine",
      // LES DEUX MOITIÉS de l'ancien « Réserver ». L'offre les incluait
      // toutes deux quand elles ne formaient qu'un produit : n'en garder
      // qu'une lui ferait promettre moins qu'hier.
      "reserver",
      "rendez_vous",
      "quiz",
    ],
    // Aucun temps réel dans cette offre : la jauge reste celle du socle.
    limits: { eventParticipants: 100 },
    highlights: [
      "Tout Coup d'envoi",
      "Carte publique bilingue et agenda dans la même offre",
    ],
  },
  {
    id: "live",
    legacyIds: [],
    name: "Le Grand Jeu",
    tagline:
      "Animer régulièrement : soirées, compétitions, temps réel dans votre salle.",
    priceMonthly: 89,
    currency: "EUR",
    trialDays: 7,
    entitlements: ["core", "duo", "bande", "events", "pronostics", "jackpot", "quiz"],
    // VEN-2 : 250 et non 500 — la jauge vendue redescend sous la capacité
    // MESURÉE, dérivation complète sur `PlanLimits`.
    limits: { eventParticipants: 250 },
    // La capacité live n'est PAS répétée ici : `describeTier()` la dérive de
    // `limits.eventParticipants`, et la recopier affichait la même limite deux
    // fois sur la carte, avec deux typographies différentes.
    highlights: ["Tout Coup d'envoi", "Écran de salle et télécommande organisateur"],
  },
  {
    id: "full",
    legacyIds: [],
    name: "La Totale",
    tagline:
      "Réunir toutes les briques : toute la plateforme, sans arbitrage entre modules.",
    priceMonthly: 129,
    currency: "EUR",
    trialDays: 7,
    entitlements: [
      "core",
      "duo",
      "bande",
      "pronostics",
      "hunts",
      "loyalty",
      "jackpot",
      "events",
      "calendar",
      "quiz",
      "referral",
      // Les CINQ droits du lieu (2026-08-22, plus la Réservation le 2026-08-29). Ils entrent SANS que le prix
      // bouge : décision propriétaire, assumée comme une baisse relative. Ce
      // qu'ils rendent surtout, c'est la vérité du sous-titre — « toute la
      // plateforme » serait devenu faux le jour où Sur Place a existé, et une
      // offre qui promet tout doit contenir tout.
      "vitrine",
      "reserver",
      // La prise de rendez-vous (2026-08-29). Même raison que les quatre
      // au-dessus : une offre qui promet tout doit contenir tout, et
      // l'ancien « Réserver » qu'elle incluait couvrait déjà ce produit.
      "rendez_vous",
    ],
    // VEN-2 : 250 et non 500. Même geste que VEN-1, poussé jusqu'au bout :
    // le wagon 5 avait ramené 1000 à 500 sans passer sous la capacité
    // mesurée — 500 joueurs demandent 200 req/s pour ~150 disponibles. La
    // Totale ne perd toujours rien d'ÉPROUVÉ. Voir `PlanLimits`.
    limits: { eventParticipants: 250 },
    // Même raison qu'au-dessus : la capacité vient de `limits`, pas d'ici.
    highlights: [
      "Le Club + Le Grand Jeu + Sur Place réunis",
      "Accès à tout nouveau module inclus",
    ],
  },
] as const;

const DEFAULT_TIER = PLAN_TIERS[0];

/** Rang de l'offre dans l'échelle de prix (0 = la moins chère). */
export function planRank(tierId: PlanTierId): number {
  return PLAN_TIERS.findIndex((tier) => tier.id === tierId);
}

/** Offre correspondant à un identifiant courant ou historique, sinon null. */
export function findPlanTier(planId: string): PlanTier | null {
  return (
    PLAN_TIERS.find(
      (tier) => tier.id === planId || tier.legacyIds.includes(planId),
    ) ?? null
  );
}

/**
 * Même résolution, mais jamais nulle : un `organizations.plan` inconnu
 * (offre retirée du catalogue) retombe sur l'offre d'entrée plutôt que de
 * faire disparaître l'abonnement de l'écran.
 */
export function getPlanTier(planId: string): PlanTier {
  return findPlanTier(planId) ?? DEFAULT_TIER;
}

export function tierIncludes(tier: PlanTier, entitlement: Entitlement): boolean {
  return tier.entitlements.includes(entitlement);
}

/** L'offre `candidate` couvre-t-elle tout ce que couvre `reference` ? */
function coversAllOf(candidate: PlanTier, reference: readonly Entitlement[]): boolean {
  return reference.every((entitlement) => candidate.entitlements.includes(entitlement));
}

/** Offre la moins chère ouvrant ce droit — la cible d'upsell d'un module. */
export function cheapestTierFor(entitlement: Entitlement): PlanTier | null {
  return PLAN_TIERS.find((tier) => tierIncludes(tier, entitlement)) ?? null;
}

/**
 * Offre la moins chère couvrant l'ensemble des droits déjà détenus : sert à
 * proposer le regroupement quand un commerçant cumule des options plus cher
 * que l'offre qui les contient toutes.
 */
export function recommendedTierFor(
  entitlements: readonly Entitlement[],
): PlanTier | null {
  return PLAN_TIERS.find((tier) => coversAllOf(tier, entitlements)) ?? null;
}

/**
 * Montées en gamme proposables depuis une offre : strictement plus chères ET
 * strictement plus complètes. La double condition interdit de vendre comme
 * « upgrade » un changement qui ferait perdre un module (Engagement → Live).
 */
export function upgradeTargetsFor(tierId: PlanTierId): PlanTier[] {
  const current = getPlanTier(tierId);
  return PLAN_TIERS.filter(
    (candidate) =>
      candidate.id !== current.id &&
      candidate.priceMonthly > current.priceMonthly &&
      coversAllOf(candidate, current.entitlements),
  );
}

/** Droits gagnés en passant de `from` à `to` (vide si `to` n'apporte rien). */
export function entitlementsGainedBy(
  from: PlanTierId,
  to: PlanTierId,
): Entitlement[] {
  const source = getPlanTier(from);
  const target = getPlanTier(to);
  return target.entitlements.filter(
    (entitlement) => !source.entitlements.includes(entitlement),
  );
}

/** « 29 €/mois » — un seul endroit met le prix en forme. */
export function formatMonthlyPrice(tier: PlanTier): string {
  return `${tier.priceMonthly} €/mois`;
}

export interface PlanTierView {
  id: PlanTierId;
  name: string;
  tagline: string;
  priceLabel: string;
  priceMonthly: number;
  trialDays: number;
  /** Libellés des expériences incluses, dans l'ordre du catalogue produit. */
  experiences: string[];
  highlights: string[];
  /** Limites affichables, déjà formulées (vide si non pertinent). */
  limits: string[];
}

/**
 * Projection sérialisable d'une offre pour l'UI : les libellés d'expériences
 * viennent du catalogue produit (EXPERIENCE_CATALOG), jamais d'une liste
 * recopiée — un module ajouté au catalogue apparaît ici sans retouche.
 */
export function describeTier(tier: PlanTier): PlanTierView {
  // LES DEUX CATALOGUES, ET NON LE SEUL PREMIER. Une offre peut contenir des
  // expériences jouables ET des modules qui n'en sont pas — Vitrine, Réserver,
  // les deux salons. N'en lire qu'un revenait à vendre « Sur Place » en
  // n'affichant que la roue. L'ordre reste stable : expériences dans l'ordre
  // produit, puis modules dans l'ordre de vente.
  const experiences = [
    ...EXPERIENCE_CATALOG.filter((entry) =>
      tier.entitlements.includes(entry.entitlement),
    ),
    ...MODULE_CATALOG.filter((entry) =>
      tier.entitlements.includes(entry.entitlement),
    ),
  ].map((entry) => entry.label);

  const limits: string[] = [];
  if (tierIncludes(tier, "events")) {
    limits.push(
      `${tier.limits.eventParticipants} participants par session live`,
    );
  }

  return {
    id: tier.id,
    name: tier.name,
    tagline: tier.tagline,
    priceLabel: formatMonthlyPrice(tier),
    priceMonthly: tier.priceMonthly,
    trialDays: tier.trialDays,
    experiences,
    highlights: [...tier.highlights],
    limits,
  };
}

/* -------------------------------------------------------------------------
 * CATALOGUE D'ADD-ONS — DESCRIPTIF, ET RIEN DE PLUS
 *
 * ⚠️ CE QUI SUIT N'ACCORDE AUCUN DROIT ET NE FACTURE RIEN. C'est au catalogue
 * d'add-ons ce que `PLAN_TIERS` est aux offres : une description de ce qu'on
 * vend, pas un mécanisme d'accès.
 *
 * CE QUE LE PRODUIT SAIT FAIRE AUJOURD'HUI, mesuré et non supposé : les
 * add-ons sont **huit booléens permanents** (`organizations.addon_*`),
 * accordés par le webhook Stripe via `ADDON_PRICE_ENV` (`@/lib/stripe`). Le
 * produit ne sait borner NI une durée, NI une fenêtre d'activation, NI une
 * jauge de joueurs, NI un pass : une fois un `addon_*` posé à `true`, il le
 * reste jusqu'à ce que quelque chose le repasse à `false`.
 *
 * DONC : un prix, une durée ou une jauge écrits ici ne sont PAS appliqués.
 * Les valeurs viennent des décisions produit du 2026-08-04
 * (`docs/codex-handoff.md`, « décisions produit utilisateur », §2), sont des
 * tarifs de RÉFÉRENCE à revalider commercialement, et aucun produit Stripe ni
 * price ID ne doit être créé à partir d'elles. Leur application effective
 * (expiration, fenêtre d'activation, pass à jauge, mise en pause sûre à
 * l'échéance) est le **P0 du §9 du cahier** — un autre chantier que celui-ci.
 *
 * Si vous lisez ceci en cherchant « pourquoi l'add-on n'expire pas » : il
 * n'expire pas, personne ne l'a encore écrit.
 * ------------------------------------------------------------------------- */

/** Add-on facturé au mois. */
export interface AddonRecurringMonthly {
  model: "recurring-monthly";
  /** Prix de vitrine mensuel en euros. Voir l'avertissement ci-dessus. */
  priceMonthly: number;
  /** Aucune durée minimale : la résiliation vaut pour la période suivante. */
  commitment: "none";
  /** Le droit court jusqu'au terme de la période déjà payée, pas au-delà. */
  endsAt: "end-of-paid-period";
}

/**
 * Achat unique ouvrant une fenêtre d'usage de durée fixe, à activer dans un
 * délai lui aussi borné (le client achète, puis choisit quand ça démarre).
 */
export interface AddonOneOffWindow {
  model: "one-off-window";
  /** Prix de vitrine en euros, payé une fois. */
  price: number;
  /** Durée d'usage en jours, décomptée depuis l'activation. */
  activeDays: number;
  /** Délai en jours, depuis l'achat, pour activer le droit. */
  activationWindowDays: number;
  /**
   * Ressource unique couverte quand l'achat en borne une (« une campagne »),
   * `null` quand seule la durée borne l'usage.
   */
  boundResource: string | null;
}

/**
 * Achat unique borné à UNE compétition et non à un nombre de jours : couper à
 * 90 jours découperait une Ligue 1 ou une Ligue des champions en plein milieu.
 */
export interface AddonSingleCompetition {
  model: "single-competition";
  /** Prix de vitrine en euros, payé une fois, pour une seule compétition. */
  price: number;
  /** Ressource unique couverte : une compétition identifiée, un `contest_id`. */
  boundResource: string;
  /** Jours de droit après la finale OU la clôture manuelle. */
  graceDaysAfterEnd: number;
  /** Plafond dur, quoi qu'il arrive à la compétition. */
  hardCapMonths: number;
  /**
   * Jours pendant lesquels les données restent consultables et exportables
   * après la fin. Le droit de JOUER, lui, ne continue pas.
   */
  dataReadableDaysAfterEnd: number;
}

/** Un palier de jauge d'un pass : une capacité, un prix. */
export interface AddonCapacityStep {
  /** Joueurs simultanés couverts par ce palier. */
  maxPlayers: number;
  /** Prix de vitrine en euros pour ce palier. */
  price: number;
}

/**
 * Pass autonome à jauge : la capacité est choisie AVANT paiement, enregistrée,
 * et jamais ajustée ni facturée rétroactivement.
 */
export interface AddonCapacityPass {
  model: "capacity-pass";
  /** Paliers vendus, par capacité croissante. */
  steps: readonly AddonCapacityStep[];
  /** La jauge est figée au paiement — aucun ajustement rétroactif. */
  capacityFixedBeforePayment: true;
  /** Jours de préparation ouverts par l'activation. */
  preparationDays: number;
  /** Heures de jeu après la préparation. */
  playHours: number;
  /** Délai en jours, depuis l'achat, pour activer le pass. */
  activationWindowDays: number;
  /**
   * Droits temporairement embarqués par le pass, le temps de sa fenêtre.
   * Descriptif : rien ne les accorde ni ne les retire aujourd'hui.
   */
  temporarilyIncludes: readonly Entitlement[];
}

export type AddonBilling =
  | AddonRecurringMonthly
  | AddonOneOffWindow
  | AddonSingleCompetition
  | AddonCapacityPass;

export interface AddonOffer {
  /**
   * Droit visé. C'est la clé de jointure avec `ADDON_PRICE_ENV`
   * (`@/lib/stripe`) : un add-on câblé côté Stripe sans entrée ici fait
   * rougir plans.test.ts.
   */
  entitlement: Exclude<Entitlement, "core">;
  /** Nom commercial validé au §2 du cahier. */
  name: string;
  currency: "EUR";
  billing: AddonBilling;
  /**
   * CETTE OPTION S'ACHÈTE-T-ELLE SANS ABONNEMENT ?
   *
   * Le champ n'est pas décoratif : c'est lui qui décide si un octroi vivant de
   * ce module IMPLIQUE que le socle a été payé (`MODULES_PORTANT_LE_SOCLE`,
   * src/lib/subscription.ts). Les huit options historiques s'achètent seules et
   * « embarquent les briques communes » — un octroi vaut donc socle payé.
   *
   * Vitrine et Réserver, non : elles ne se vendent qu'en LIGNE d'un abonnement
   * existant. Un octroi vivant sur elles peut donc parfaitement venir du
   * back-office, gratuitement, et n'achète rien. Les faire porter le socle
   * rouvrirait exactement le défaut MOYEN-2 que le lot L2 a fermé.
   */
  soldStandalone: boolean;
  /**
   * Règles validées, écrites en clair. Elles ne sont appliquées par aucun
   * code : elles disent ce que le P0 devra faire respecter.
   */
  rules: readonly string[];
}

/**
 * Aucun essai sur les add-ons (cahier §2). L'essai, s'il est conservé, reste
 * celui de l'offre principale — d'où `0` ici et `trialDays: 7` sur les offres.
 */
export const ADDON_TRIAL_DAYS = 0;

/**
 * Tout add-on est achetable SEUL, sans abonnement (décision confirmée, §2). Il
 * embarque les briques communes strictement nécessaires (organisation,
 * QR/publication, lots, caisse et gardes) sans déverrouiller les autres
 * modules ; plusieurs droits peuvent coexister, chacun borné à son module et,
 * pour un pass, à sa ressource propre.
 *
 * Descriptif : aucun chemin de code ne dérive aujourd'hui de droit d'ici.
 */

/**
 * Règles d'échéance communes à tous les add-ons à durée (cahier §2, dernier
 * point). Portées ici parce qu'elles ne dépendent pas d'un add-on précis.
 */
export const ADDON_EXPIRY_RULES: readonly string[] = [
  "À l'expiration d'un pass, la ressource est mise en pause de façon sûre.",
  "Les données et exports restent lisibles après l'expiration.",
  "Ne jamais prolonger silencieusement un droit expiré.",
];

/**
 * Les huit add-ons vendables. L'ordre est celui du §2 du cahier : mécaniques
 * continues (mensuelles) d'abord, puis mécaniques de campagne ou d'événement
 * (achats uniques à durée fixe).
 */
export const ADDON_OFFERS: readonly AddonOffer[] = [
  {
    entitlement: "vitrine",
    name: "Vitrine",
    currency: "EUR",
    /**
     * PAS ACHETABLE SEULE, et c'est ce qui la distingue des huit autres.
     * Elle s'ajoute en ligne d'un abonnement en cours — 29 + 20 pour le socle
     * le moins cher. La vendre seule à 20 € donnerait le socle à 20 €.
     */
    soldStandalone: false,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 20,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "S'ajoute à une offre en cours, comme ligne du même abonnement.",
      "Récurrent, sans engagement, actif jusqu'à la fin de la période payée.",
    ],
  },
  {
    /**
     * LES MOMENTS — ateliers, dégustations, files d'accueil, invitations,
     * offres de dernière minute.
     *
     * La CLÉ ne bouge pas (`reserver`), le NOM et le PRIX si : décision
     * propriétaire du 2026-08-29, qui scinde l'ancien « Réserver » à 30 € en
     * deux produits à 20 € — celui-ci et « Réservation » juste en dessous.
     * Faire suivre la clé au nom aurait obligé à recopier les octrois déjà
     * posés, sous peine de retirer l'accès à qui l'utilise déjà.
     */
    entitlement: "reserver",
    name: "Moments",
    currency: "EUR",
    soldStandalone: false,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 20,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "S'ajoute à une offre en cours, comme ligne du même abonnement.",
      "Récurrent, sans engagement, actif jusqu'à la fin de la période payée.",
    ],
  },
  {
    /**
     * LA RÉSERVATION — prise de rendez-vous : horaires récurrents, créneaux
     * engendrés, agenda du commerçant, ajout à l'agenda du client.
     *
     * Le produit et le prix Stripe existent depuis le 2026-09-02
     * (`STRIPE_PRICE_ID_ADDON_RENDEZ_VOUS`, voir `ADDON_PRICE_ENV` dans
     * `@/lib/stripe`) : elle se vend en ligne, comme LIGNE d'abonnement.
     *
     * ── « VENDABLE SEULE » A DEUX SENS, ET CE CHAMP N'EN PORTE QU'UN ──
     *
     * Le lot F2 rend la Réservation vendable SANS LES MOMENTS : ce sont deux
     * produits, et jusqu'à lui les quatre gardes applicatives du module
     * exigeaient `reserver` en dur — un commerçant qui payait la Réservation
     * seule obtenait une salle que la base servait et que l'écran refusait.
     * Ce qui le fermait vivait dans `reserver-context.ts` et `actions/
     * reserver.ts`, pas ici : la clé DÉRIVE désormais du `booking_mode`
     * (`cleModuleReservation`), miroir de la fonction SQL homonyme.
     *
     * `soldStandalone`, LUI, DIT AUTRE CHOSE : « s'achète-t-elle sans
     * ABONNEMENT ? ». Il reste `false`, et le passer à `true` serait une
     * régression, non un aboutissement :
     *
     *   · il bascule l'écran des modules d'`OptionAbonnement` — qui lit
     *     `STRIPE_PRICE_ID_ADDON_RENDEZ_VOUS`, posée en production — vers
     *     `AchatAddon`, qui lit `STRIPE_PRICE_ID_PASS_RENDEZ_VOUS`, laquelle
     *     n'existe pas. Un produit qui se vend aujourd'hui afficherait « pas
     *     encore en vente en ligne » ;
     *   · il ferait entrer la clé dans `MODULES_PORTANT_LE_SOCLE`
     *     (`@/lib/subscription`), donc un octroi back-office GRATUIT y
     *     ouvrirait la roue et les campagnes : mot pour mot le défaut MOYEN-2
     *     que le lot L2 a fermé ;
     *   · créer le prix de pass qui le rendrait cohérent est une mutation
     *     financière Stripe, qui exige une demande explicite du propriétaire
     *     (AGENTS.md).
     *
     * Vendue en ligne d'abonnement, elle n'a de toute façon jamais besoin de
     * porter le socle : l'abonnement qui l'accueille le porte déjà.
     */
    entitlement: "rendez_vous",
    name: "Réservation",
    currency: "EUR",
    soldStandalone: false,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 20,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "S'ajoute à une offre en cours, comme ligne du même abonnement.",
      "Récurrent, sans engagement, actif jusqu'à la fin de la période payée.",
    ],
  },
  {
    entitlement: "loyalty",
    name: "Passeport des habitués",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 19,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée.",
    ],
  },
  {
    entitlement: "referral",
    name: "Bouche-à-oreille / Parrainage",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 12,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée.",
    ],
  },
  /**
   * LES DEUX SALONS, VENDUS SÉPARÉMENT — ET LE PARADOXE ASSUMÉ.
   *
   * Ils RESTENT dans les cinq offres (`PLAN_TIERS`) : ce sont des jeux du
   * socle, et la garde « met Duo Miroir et Portrait de la Bande dans toutes
   * les offres » de plans.test.ts l'épingle. Leur entrée ici ne les en retire
   * pas — elle ouvre le SEUL public qui ne les a pas encore : celui qui n'a
   * aucun abonnement.
   *
   * D'où `soldStandalone: true`, qui n'est pas un détail de présentation :
   * il fait entrer les deux clés dans `MODULES_PORTANT_LE_SOCLE`
   * (src/lib/subscription.ts), donc un octroi vivant vaut socle payé. C'est
   * exactement ce qu'on vend — un commerçant sans offre qui paie 12 € doit
   * pouvoir publier son salon — et c'est déjà le régime des huit autres
   * options autonomes.
   *
   * Conséquence à l'écran : tout abonné les possède déjà par son offre, et la
   * carte doit le dire au lieu de lui revendre ce qu'il a. Voir
   * `src/app/dashboard/settings/modules/page.tsx`.
   */
  {
    entitlement: "duo",
    name: "Duo Miroir",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 12,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée.",
      "Déjà compris dans les cinq offres : ne s'achète que sans abonnement.",
    ],
  },
  {
    entitlement: "bande",
    name: "Portrait de la Bande",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "recurring-monthly",
      priceMonthly: 12,
      commitment: "none",
      endsAt: "end-of-paid-period",
    },
    rules: [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée.",
      "Déjà compris dans les cinq offres : ne s'achète que sans abonnement.",
    ],
  },
  {
    entitlement: "hunts",
    name: "Chasse au QR",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "one-off-window",
      price: 29,
      activeDays: 30,
      activationWindowDays: 90,
      boundResource: null,
    },
    rules: [
      "Achat unique ouvrant 30 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat.",
    ],
  },
  {
    entitlement: "calendar",
    name: "Calendrier à surprises",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "one-off-window",
      price: 29,
      activeDays: 31,
      activationWindowDays: 90,
      boundResource: "une campagne",
    },
    rules: [
      "Achat unique pour une seule campagne, d'une durée maximale de 31 jours.",
      "Activable dans les 90 jours suivant l'achat.",
    ],
  },
  {
    entitlement: "quiz",
    name: "Quiz express",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "one-off-window",
      price: 15,
      activeDays: 7,
      activationWindowDays: 90,
      boundResource: null,
    },
    rules: [
      "Achat unique ouvrant 7 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat.",
    ],
  },
  {
    entitlement: "jackpot",
    name: "Cagnotte collective",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "one-off-window",
      price: 29,
      activeDays: 30,
      activationWindowDays: 90,
      boundResource: null,
    },
    rules: [
      "Achat unique ouvrant 30 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat.",
    ],
  },
  {
    entitlement: "pronostics",
    name: "Saison de pronostics",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "single-competition",
      price: 39,
      boundResource: "une compétition identifiée, un seul contest_id",
      graceDaysAfterEnd: 7,
      hardCapMonths: 12,
      dataReadableDaysAfterEnd: 30,
    },
    rules: [
      "Une seule compétition identifiée, un seul contest_id.",
      "Le droit court de l'activation jusqu'à sept jours après la finale ou la clôture manuelle.",
      "Plafond dur de douze mois, quelle que soit la durée de la compétition.",
      "Ligue 1 et Ligue des champions ne doivent jamais être coupées artificiellement à 90 jours.",
      "Les données restent consultables et exportables 30 jours après la fin ; le droit de jouer ne continue pas.",
    ],
  },
  {
    entitlement: "events",
    name: "Soirée en jeu",
    currency: "EUR",
    soldStandalone: true,
    billing: {
      model: "capacity-pass",
      steps: [
        { maxPlayers: 10, price: 9 },
        { maxPlayers: 30, price: 19 },
        { maxPlayers: 50, price: 29 },
      ],
      capacityFixedBeforePayment: true,
      preparationDays: 7,
      playHours: 24,
      activationWindowDays: 30,
      temporarilyIncludes: ["core", "events", "quiz"],
    },
    rules: [
      "Pass autonome incluant temporairement Coup d'envoi, Événements et Quiz.",
      "Jauge choisie avant paiement, enregistrée, jamais ajustée ni facturée rétroactivement.",
      "Sept jours de préparation, puis 24 heures de jeu.",
      "Activation dans les 30 jours suivant l'achat.",
      "Ne pas vendre de jauge supérieure avant un benchmark de capacité live concluant.",
    ],
  },
] as const;

export const ADDONS_PURCHASABLE_STANDALONE: boolean = ADDON_OFFERS.every(
  (offre) => offre.soldStandalone,
);

/** Les options vendables SANS abonnement — celles qui embarquent le socle. */
export const ADDONS_STANDALONE: readonly AddonOffer[] = ADDON_OFFERS.filter(
  (offre) => offre.soldStandalone,
);

/**
 * Les options qui ne se vendent qu'en LIGNE d'un abonnement en cours.
 *
 * Elles n'ont pas de prix `STRIPE_PRICE_ID_PASS_*` et ne doivent jamais passer
 * par le tunnel d'achat autonome : celui-ci ouvre un SECOND abonnement Stripe,
 * donc un second prélèvement à une seconde date.
 */
export const ADDONS_LIGNE_ABONNEMENT: readonly AddonOffer[] = ADDON_OFFERS.filter(
  (offre) => !offre.soldStandalone,
);



/** Add-on décrivant ce droit, sinon `null`. */
export function findAddonOffer(entitlement: Entitlement): AddonOffer | null {
  return ADDON_OFFERS.find((addon) => addon.entitlement === entitlement) ?? null;
}

/**
 * Étiquette de prix d'un add-on, dérivée du modèle : un seul endroit met en
 * forme, et les quatre formes ne se lisent pas de la même façon.
 */
export function formatAddonPrice(addon: AddonOffer): string {
  switch (addon.billing.model) {
    case "recurring-monthly":
      return `${addon.billing.priceMonthly} €/mois`;
    case "one-off-window":
      return addon.billing.boundResource
        ? `${addon.billing.price} € / ${addon.billing.boundResource} jusqu'à ${addon.billing.activeDays} jours`
        : `${addon.billing.price} € / ${addon.billing.activeDays} jours`;
    case "single-competition":
      return `${addon.billing.price} € / une compétition`;
    case "capacity-pass":
      return addon.billing.steps
        .map((step) => `${step.price} € (${step.maxPlayers} joueurs)`)
        .join(" · ");
  }
}
