/** Offres affichées sur /tarifs — miroir éditorial des plans Stripe de l'app. */

export interface PricingPlan {
  id: string;
  name: string;
  priceMonthly: number | null;
  trialDays: number;
  description: string;
  features: string[];
  highlighted: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "core",
    name: "Core",
    priceMonthly: 29,
    trialDays: 7,
    description:
      "Tout ce qu'il faut pour lancer votre roue et fidéliser vos clients.",
    features: [
      "Campagnes et jeux instantanés",
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
  {
    id: "engagement",
    name: "Engagement",
    priceMonthly: null,
    trialDays: 7,
    description:
      "Pour installer des rendez-vous et fidéliser au fil des visites.",
    features: [
      "Tout Core",
      "Passeport de fidélité",
      "Calendriers et rendez-vous récurrents",
      "Parrainage ludique",
      "Chasses au trésor",
      "Quiz et parcours engageants",
    ],
    highlighted: false,
  },
  {
    id: "live",
    name: "Live & Events",
    priceMonthly: null,
    trialDays: 7,
    description:
      "Pour animer une salle, une communauté ou une compétition en direct.",
    features: [
      "Tout Core",
      "Événements live sur écran et mobile",
      "Pronostics et classements",
      "Jackpots collectifs",
      "Quiz avec classements",
      "Capacité événement adaptée à l'offre",
    ],
    highlighted: false,
  },
  {
    id: "full",
    name: "Full Platform",
    priceMonthly: null,
    trialDays: 7,
    description:
      "Toute la plateforme pour combiner acquisition, fidélité, live et trafic.",
    features: [
      "Tous les modules Engagement",
      "Tous les modules Live & Events",
      "Caisse et récompenses multi-expériences",
      "Analytics consolidés",
      "Accès aux futurs parcours multi-jeux",
      "Accompagnement au déploiement",
    ],
    highlighted: false,
  },
];

export const PRICING_NOTES = [
  "Essai gratuit de 7 jours, sans carte bancaire.",
  "Sans engagement : annulable à tout moment depuis le portail de facturation.",
  "Paiement sécurisé par Stripe.",
];
