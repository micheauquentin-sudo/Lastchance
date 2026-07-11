/** Offres affichées sur /tarifs — miroir éditorial des plans Stripe de l'app. */

export interface PricingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  trialDays: number;
  description: string;
  features: string[];
  highlighted: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    trialDays: 7,
    description:
      "Tout ce qu'il faut pour lancer votre roue et fidéliser vos clients.",
    features: [
      "Campagnes et roues illimitées",
      "QR codes et affiches personnalisables",
      "Roue à vos couleurs (logo, polices, fond)",
      "Collecte d'emails conforme RGPD",
      "Limites de jeu et stocks de lots",
      "Tableau de bord et statistiques en temps réel",
      "Export CSV des participations",
      "Validation des gains en caisse",
    ],
    highlighted: true,
  },
];

export const PRICING_NOTES = [
  "Essai gratuit de 7 jours, sans carte bancaire.",
  "Sans engagement : annulable à tout moment depuis le portail de facturation.",
  "Paiement sécurisé par Stripe.",
];
