/**
 * Projection du packaging de l'application vers le site vitrine.
 *
 * CE MODULE NE CONNAÎT AUCUN CHIFFRE. Il reçoit le namespace de
 * `src/lib/plans.ts` et n'en fait qu'une mise en forme : tout nom, tout prix,
 * toute durée, toute limite et tout libellé de module vient de l'objet passé
 * en paramètre. Une valeur recopiée ici serait une seconde source de vérité —
 * exactement ce que ce chantier existe pour supprimer.
 *
 * Séparé de `sync-site-pricing.mjs` pour une raison précise : le script
 * d'écriture installe des hooks de résolution de modules (`@/…`) dont la suite
 * de tests n'a pas besoin, Vitest résolvant déjà l'alias. La garde
 * (`src/lib/site-pricing.test.ts`) importe donc ce module-ci, jamais l'autre.
 */

/** En-tête du fichier généré. Toute modification fait rougir la garde. */
const HEADER = `/**
 * GÉNÉRÉ par \`scripts/sync-site-pricing.mjs\` — NE PAS ÉDITER À LA MAIN.
 *
 * Source de vérité : \`src/lib/plans.ts\` et
 * \`src/platform/experiences/catalog.ts\` dans l'application. Le site vitrine
 * est un projet Next séparé : il ne peut pas importer l'application sans
 * coupler les deux builds, d'où cette copie GÉNÉRÉE et committée.
 *
 * Pour le régénérer : \`npm run site:pricing\` à la racine du dépôt.
 * Une garde de la suite racine (\`src/lib/site-pricing.test.ts\`) régénère ce
 * fichier en mémoire et échoue si le fichier committé en diverge.
 *
 * Ce qui reste éditorial (description commerciale, ordre, mise en avant, notes)
 * vit dans \`site/src/content/pricing.ts\`, qui consomme ce fichier pour les faits.
 */`;

/** Modèle de facturation rendu lisible par un commerçant, sans chiffre retapé. */
function describeBilling(billing) {
  switch (billing.model) {
    case "recurring-monthly":
      return {
        model: billing.model,
        cadence: "Abonnement mensuel",
        duration:
          "Sans engagement, actif jusqu'à la fin de la période déjà payée.",
        steps: [],
      };
    case "one-off-window":
      return {
        model: billing.model,
        cadence: "Achat unique",
        duration: billing.boundResource
          ? `Pour ${billing.boundResource}, jusqu'à ${billing.activeDays} jours d'usage. À activer dans les ${billing.activationWindowDays} jours suivant l'achat.`
          : `${billing.activeDays} jours d'usage. À activer dans les ${billing.activationWindowDays} jours suivant l'achat.`,
        steps: [],
      };
    case "single-competition":
      return {
        model: billing.model,
        cadence: "Achat unique, pour une seule compétition",
        duration: `De l'activation jusqu'à ${billing.graceDaysAfterEnd} jours après la finale ou la clôture, dans la limite de ${billing.hardCapMonths} mois. Données consultables et exportables ${billing.dataReadableDaysAfterEnd} jours après la fin.`,
        steps: [],
      };
    case "capacity-pass":
      return {
        model: billing.model,
        cadence: "Pass à jauge, capacité choisie avant paiement",
        duration: `${billing.preparationDays} jours de préparation puis ${billing.playHours} heures de jeu. À activer dans les ${billing.activationWindowDays} jours suivant l'achat.`,
        steps: billing.steps.map((step) => ({
          maxPlayers: step.maxPlayers,
          price: step.price,
        })),
      };
    default:
      throw new Error(`Modèle de facturation inconnu : ${billing.model}`);
  }
}

/**
 * Données projetées, avant sérialisation. Exportée pour que la garde puisse
 * assertion par assertion nommer un écart, plutôt que de ne comparer que du texte.
 */
export function buildSitePricingPayload(plans) {
  const tiers = plans.PLAN_TIERS.map((tier) => {
    const view = plans.describeTier(tier);
    return {
      id: view.id,
      name: view.name,
      tagline: view.tagline,
      priceMonthly: view.priceMonthly,
      priceLabel: view.priceLabel,
      trialDays: view.trialDays,
      experiences: view.experiences,
      highlights: view.highlights,
      limits: view.limits,
    };
  });

  const addons = plans.ADDON_OFFERS.map((addon) => {
    const billing = describeBilling(addon.billing);
    return {
      entitlement: addon.entitlement,
      name: addon.name,
      priceLabel: plans.formatAddonPrice(addon),
      model: billing.model,
      cadence: billing.cadence,
      duration: billing.duration,
      steps: billing.steps,
      rules: [...addon.rules],
    };
  });

  return {
    packagingVersion: plans.PACKAGING_VERSION,
    tiers,
    addons,
    addonTrialDays: plans.ADDON_TRIAL_DAYS,
    addonsPurchasableStandalone: plans.ADDONS_PURCHASABLE_STANDALONE,
    addonExpiryRules: [...plans.ADDON_EXPIRY_RULES],
    /**
     * Abonnement mensuel le moins cher : l'hypothèse par établissement du
     * simulateur de ROI du site. Dérivée de l'offre d'entrée, jamais saisie.
     */
    entrySubscriptionMonthly: tiers[0].priceMonthly,
  };
}

function literal(value) {
  return JSON.stringify(value, null, 2);
}

/** Texte complet du module TypeScript généré, terminé par un saut de ligne. */
export function renderSitePricingModule(plans) {
  const payload = buildSitePricingPayload(plans);

  return `${HEADER}

export type GeneratedPlanId = ${payload.tiers
    .map((tier) => JSON.stringify(tier.id))
    .join(" | ")};

export interface GeneratedPlan {
  id: GeneratedPlanId;
  /** Nom commercial de l'offre. L'\`id\` est technique et ne s'affiche jamais. */
  name: string;
  tagline: string;
  priceMonthly: number;
  priceLabel: string;
  trialDays: number;
  /** Libellés des modules inclus, tirés du catalogue produit. */
  experiences: readonly string[];
  highlights: readonly string[];
  /** Limites affichables déjà formulées (capacité live), vide si non pertinent. */
  limits: readonly string[];
}

export type GeneratedAddonModel =
  | "recurring-monthly"
  | "one-off-window"
  | "single-competition"
  | "capacity-pass";

export interface GeneratedAddonStep {
  maxPlayers: number;
  price: number;
}

export interface GeneratedAddon {
  entitlement: string;
  name: string;
  /** Prix mis en forme selon le modèle : mensuel, unique, à la compétition, à la jauge. */
  priceLabel: string;
  model: GeneratedAddonModel;
  /** Nature de l'achat, en clair pour un commerçant. */
  cadence: string;
  /** Ce que la durée couvre exactement. */
  duration: string;
  /** Paliers d'un pass à jauge, vide pour les autres modèles. */
  steps: readonly GeneratedAddonStep[];
  rules: readonly string[];
}

/** Version du packaging côté application au moment de la génération. */
export const PACKAGING_VERSION = ${JSON.stringify(payload.packagingVersion)};

export const GENERATED_PLANS: readonly GeneratedPlan[] = ${literal(payload.tiers)};

export const GENERATED_ADDONS: readonly GeneratedAddon[] = ${literal(payload.addons)};

/** Aucun essai sur les add-ons : l'essai reste celui de l'offre principale. */
export const ADDON_TRIAL_DAYS = ${JSON.stringify(payload.addonTrialDays)};

/** Tout add-on est achetable seul, sans abonnement. */
export const ADDONS_PURCHASABLE_STANDALONE = ${JSON.stringify(
    payload.addonsPurchasableStandalone,
  )};

export const ADDON_EXPIRY_RULES: readonly string[] = ${literal(
    payload.addonExpiryRules,
  )};

/**
 * Abonnement mensuel de l'offre d'entrée, en euros. Hypothèse « abonnement par
 * établissement » du simulateur de ROI — dérivée, jamais saisie.
 */
export const ENTRY_SUBSCRIPTION_MONTHLY = ${JSON.stringify(
    payload.entrySubscriptionMonthly,
  )};

export function findGeneratedPlan(id: string): GeneratedPlan | null {
  return GENERATED_PLANS.find((plan) => plan.id === id) ?? null;
}
`;
}

/** Chemin du fichier généré, relatif à la racine du dépôt. */
export const GENERATED_FILE_RELATIVE_PATH =
  "site/src/content/pricing.generated.ts";
