/**
 * Offres affichées sur /tarifs.
 *
 * FRONTIÈRE À TENIR : ce fichier ne porte QUE de l'éditorial — description
 * commerciale, ordre d'affichage, mise en avant, notes de bas de page. Tous les
 * FAITS (nom d'offre, prix, jours d'essai, modules inclus, limite de
 * participants live, et pour les add-ons nom, prix, modèle et durée) viennent
 * de `./pricing.generated.ts`, projeté depuis `src/lib/plans.ts` de
 * l'application par `npm run site:pricing`.
 *
 * Recopier ici un chiffre ou un nom d'offre recréerait la seconde source de
 * vérité que ce fichier a portée jusqu'au 2026-08-04 — il annonçait encore
 * « Core / Engagement / Live & Events / Full Platform » et « Sur devis » sur
 * trois offres qui ont un prix.
 */

import {
  ADDON_EXPIRY_RULES,
  ADDON_TRIAL_DAYS,
  ADDONS_PURCHASABLE_STANDALONE,
  GENERATED_ADDONS,
  GENERATED_PLANS,
  findGeneratedPlan,
  type GeneratedAddon,
  type GeneratedPlan,
} from "./pricing.generated";

export type { GeneratedAddon, GeneratedPlan };

/** Angle commercial d'une offre — la seule chose que le site décide. */
interface PlanEditorial {
  id: string;
  description: string;
  highlighted: boolean;
}

/** Ordre d'affichage et mise en avant : décision du site, pas du packaging. */
const PLAN_EDITORIAL: PlanEditorial[] = [
  {
    id: "core",
    description:
      "Tout ce qu'il faut pour lancer votre premier jeu et faire revenir vos clients, sans rien installer chez eux.",
    highlighted: true,
  },
  {
    id: "engagement",
    description:
      "Pour installer une habitude : des rendez-vous réguliers et des clients qui parlent de vous.",
    highlighted: false,
  },
  {
    id: "place",
    description:
      "Pour tout lieu qui reçoit : votre carte se lit au QR code, vos créneaux se réservent, et une table qui attend a de quoi jouer.",
    highlighted: false,
  },
  {
    id: "live",
    description:
      "Pour animer une salle, une soirée ou une compétition, avec l'écran et les téléphones de vos clients.",
    highlighted: false,
  },
  {
    id: "full",
    description:
      "Toute la plateforme, sans avoir à choisir entre fidéliser et animer.",
    highlighted: false,
  },
];

export interface PricingPlan extends GeneratedPlan {
  description: string;
  highlighted: boolean;
}

/**
 * Un identifiant éditorial sans offre correspondante est ignoré plutôt que de
 * faire planter la page ; une offre AJOUTÉE au packaging sans entrée éditoriale
 * reste affichée, avec son `tagline` pour description — mieux vaut une offre
 * décrite sobrement qu'une offre invisible sur la page des tarifs.
 */
export const PRICING_PLANS: PricingPlan[] = PLAN_EDITORIAL.flatMap(
  (editorial) => {
    const plan = findGeneratedPlan(editorial.id);
    if (!plan) return [];
    return [
      {
        ...plan,
        description: editorial.description,
        highlighted: editorial.highlighted,
      },
    ];
  },
).concat(
  GENERATED_PLANS.filter(
    (plan) => !PLAN_EDITORIAL.some((editorial) => editorial.id === plan.id),
  ).map((plan) => ({
    ...plan,
    description: plan.tagline,
    highlighted: false,
  })),
);

/**
 * Jours d'essai de l'abonnement, dérivés de l'offre d'entrée. Le hero et le CTA
 * final l'annonçaient chacun en dur : trois endroits à changer pour un seul
 * fait, donc trois occasions d'en oublier un.
 */
export const TRIAL_DAYS = PRICING_PLANS[0]?.trialDays ?? 0;

/** Add-ons vendables, dans l'ordre du packaging (mensuels puis achats uniques). */
export const PRICING_ADDONS: readonly GeneratedAddon[] = GENERATED_ADDONS;

/**
 * Notes de bas de page. Les deux premières sont des faits du packaging, donc
 * DÉRIVÉES : l'essai vient de l'offre d'entrée et le zéro essai des add-ons de
 * `ADDON_TRIAL_DAYS`.
 */
export const PRICING_NOTES = [
  `Essai gratuit de ${TRIAL_DAYS} jours sur l'abonnement, sans carte bancaire.`,
  ADDON_TRIAL_DAYS === 0
    ? "Les options ne comportent pas d'essai : l'essai reste celui de l'abonnement."
    : `Essai de ${ADDON_TRIAL_DAYS} jours sur les options.`,
  "Sans engagement : annulable à tout moment depuis le portail de facturation.",
  "Paiement sécurisé par Stripe.",
];

/** Phrase d'introduction de la section options — dérivée, pas retapée. */
export const ADDONS_INTRO = ADDONS_PURCHASABLE_STANDALONE
  ? "Chaque option s'achète seule, sans abonnement : elle embarque le strict nécessaire (organisation, QR, lots, caisse) sans déverrouiller les autres modules. Vous pouvez aussi en cumuler plusieurs."
  : "Chaque option vient compléter un abonnement en cours.";

export const ADDON_NOTES: readonly string[] = ADDON_EXPIRY_RULES;

export {
  ADDON_TRIAL_DAYS,
  ADDONS_PURCHASABLE_STANDALONE,
} from "./pricing.generated";
