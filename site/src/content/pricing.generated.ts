/**
 * GÉNÉRÉ par `scripts/sync-site-pricing.mjs` — NE PAS ÉDITER À LA MAIN.
 *
 * Source de vérité : `src/lib/plans.ts` et
 * `src/platform/experiences/catalog.ts` dans l'application. Le site vitrine
 * est un projet Next séparé : il ne peut pas importer l'application sans
 * coupler les deux builds, d'où cette copie GÉNÉRÉE et committée.
 *
 * Pour le régénérer : `npm run site:pricing` à la racine du dépôt.
 * Une garde de la suite racine (`src/lib/site-pricing.test.ts`) régénère ce
 * fichier en mémoire et échoue si le fichier committé en diverge.
 *
 * Ce qui reste éditorial (description commerciale, ordre, mise en avant, notes)
 * vit dans `site/src/content/pricing.ts`, qui consomme ce fichier pour les faits.
 */

export type GeneratedPlanId = "core" | "engagement" | "place" | "live" | "full";

export interface GeneratedPlan {
  id: GeneratedPlanId;
  /** Nom commercial de l'offre. L'`id` est technique et ne s'affiche jamais. */
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
export const PACKAGING_VERSION = "2026-08-c";

export const GENERATED_PLANS: readonly GeneratedPlan[] = [
  {
    "id": "core",
    "name": "Coup d'envoi",
    "tagline": "Lancer une animation : le jeu qui fait revenir vos clients, en libre-service.",
    "priceMonthly": 29,
    "priceLabel": "29 €/mois",
    "trialDays": 7,
    "experiences": [
      "Jeux instantanés",
      "Duo Miroir",
      "Portrait de la Bande"
    ],
    "highlights": [
      "QR codes et roues illimités",
      "Duo Miroir et Portrait de la Bande, jouables à table",
      "Lots remis en caisse avec code",
      "Studio créatif et affiches",
      "Emails automatiques et webhooks sortants"
    ],
    "limits": []
  },
  {
    "id": "engagement",
    "name": "Le Club",
    "tagline": "Fidéliser : installer l'habitude — fidélité, rendez-vous, bouche-à-oreille.",
    "priceMonthly": 59,
    "priceLabel": "59 €/mois",
    "trialDays": 7,
    "experiences": [
      "Jeux instantanés",
      "Parrainage",
      "Passeport fidélité",
      "Calendrier",
      "Quiz",
      "Chasse au trésor",
      "Duo Miroir",
      "Portrait de la Bande"
    ],
    "highlights": [
      "Tout Coup d'envoi",
      "Campagnes multi-modules sur la même clientèle"
    ],
    "limits": []
  },
  {
    "id": "place",
    "name": "Sur Place",
    "tagline": "Se faire lire et réserver : votre carte au QR code et votre agenda, dans un seul abonnement.",
    "priceMonthly": 79,
    "priceLabel": "79 €/mois",
    "trialDays": 7,
    "experiences": [
      "Jeux instantanés",
      "Quiz",
      "Vitrine",
      "Réserver",
      "Duo Miroir",
      "Portrait de la Bande"
    ],
    "highlights": [
      "Tout Coup d'envoi",
      "Carte publique bilingue et agenda dans la même offre"
    ],
    "limits": []
  },
  {
    "id": "live",
    "name": "Le Grand Jeu",
    "tagline": "Animer régulièrement : soirées, compétitions, temps réel dans votre salle.",
    "priceMonthly": 89,
    "priceLabel": "89 €/mois",
    "trialDays": 7,
    "experiences": [
      "Jeux instantanés",
      "Événements live",
      "Pronostics",
      "Jackpot collectif",
      "Quiz",
      "Duo Miroir",
      "Portrait de la Bande"
    ],
    "highlights": [
      "Tout Coup d'envoi",
      "Écran de salle et télécommande organisateur"
    ],
    "limits": [
      "500 participants par session live"
    ]
  },
  {
    "id": "full",
    "name": "La Totale",
    "tagline": "Réunir toutes les briques : toute la plateforme, sans arbitrage entre modules.",
    "priceMonthly": 129,
    "priceLabel": "129 €/mois",
    "trialDays": 7,
    "experiences": [
      "Jeux instantanés",
      "Parrainage",
      "Passeport fidélité",
      "Calendrier",
      "Événements live",
      "Pronostics",
      "Jackpot collectif",
      "Quiz",
      "Chasse au trésor",
      "Vitrine",
      "Réserver",
      "Duo Miroir",
      "Portrait de la Bande"
    ],
    "highlights": [
      "Le Club + Le Grand Jeu + Sur Place réunis",
      "Accès à tout nouveau module inclus"
    ],
    "limits": [
      "500 participants par session live"
    ]
  }
];

export const GENERATED_ADDONS: readonly GeneratedAddon[] = [
  {
    "entitlement": "vitrine",
    "name": "Vitrine",
    "priceLabel": "20 €/mois",
    "model": "recurring-monthly",
    "cadence": "Abonnement mensuel",
    "duration": "Sans engagement, actif jusqu'à la fin de la période déjà payée.",
    "steps": [],
    "rules": [
      "S'ajoute à une offre en cours, comme ligne du même abonnement.",
      "Récurrent, sans engagement, actif jusqu'à la fin de la période payée."
    ]
  },
  {
    "entitlement": "reserver",
    "name": "Réserver",
    "priceLabel": "30 €/mois",
    "model": "recurring-monthly",
    "cadence": "Abonnement mensuel",
    "duration": "Sans engagement, actif jusqu'à la fin de la période déjà payée.",
    "steps": [],
    "rules": [
      "S'ajoute à une offre en cours, comme ligne du même abonnement.",
      "Récurrent, sans engagement, actif jusqu'à la fin de la période payée."
    ]
  },
  {
    "entitlement": "loyalty",
    "name": "Passeport des habitués",
    "priceLabel": "19 €/mois",
    "model": "recurring-monthly",
    "cadence": "Abonnement mensuel",
    "duration": "Sans engagement, actif jusqu'à la fin de la période déjà payée.",
    "steps": [],
    "rules": [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée."
    ]
  },
  {
    "entitlement": "referral",
    "name": "Bouche-à-oreille / Parrainage",
    "priceLabel": "12 €/mois",
    "model": "recurring-monthly",
    "cadence": "Abonnement mensuel",
    "duration": "Sans engagement, actif jusqu'à la fin de la période déjà payée.",
    "steps": [],
    "rules": [
      "Récurrent, sans engagement.",
      "Actif jusqu'à la fin de la période payée."
    ]
  },
  {
    "entitlement": "hunts",
    "name": "Chasse au trésor",
    "priceLabel": "29 € / 30 jours",
    "model": "one-off-window",
    "cadence": "Achat unique",
    "duration": "30 jours d'usage. À activer dans les 90 jours suivant l'achat.",
    "steps": [],
    "rules": [
      "Achat unique ouvrant 30 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat."
    ]
  },
  {
    "entitlement": "calendar",
    "name": "Calendrier à surprises",
    "priceLabel": "29 € / une campagne jusqu'à 31 jours",
    "model": "one-off-window",
    "cadence": "Achat unique",
    "duration": "Pour une campagne, jusqu'à 31 jours d'usage. À activer dans les 90 jours suivant l'achat.",
    "steps": [],
    "rules": [
      "Achat unique pour une seule campagne, d'une durée maximale de 31 jours.",
      "Activable dans les 90 jours suivant l'achat."
    ]
  },
  {
    "entitlement": "quiz",
    "name": "Quiz express",
    "priceLabel": "15 € / 7 jours",
    "model": "one-off-window",
    "cadence": "Achat unique",
    "duration": "7 jours d'usage. À activer dans les 90 jours suivant l'achat.",
    "steps": [],
    "rules": [
      "Achat unique ouvrant 7 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat."
    ]
  },
  {
    "entitlement": "jackpot",
    "name": "Cagnotte collective",
    "priceLabel": "29 € / 30 jours",
    "model": "one-off-window",
    "cadence": "Achat unique",
    "duration": "30 jours d'usage. À activer dans les 90 jours suivant l'achat.",
    "steps": [],
    "rules": [
      "Achat unique ouvrant 30 jours d'usage.",
      "Activable dans les 90 jours suivant l'achat."
    ]
  },
  {
    "entitlement": "pronostics",
    "name": "Saison de pronostics",
    "priceLabel": "39 € / une compétition",
    "model": "single-competition",
    "cadence": "Achat unique, pour une seule compétition",
    "duration": "De l'activation jusqu'à 7 jours après la finale ou la clôture, dans la limite de 12 mois. Données consultables et exportables 30 jours après la fin.",
    "steps": [],
    "rules": [
      "Une seule compétition identifiée, un seul contest_id.",
      "Le droit court de l'activation jusqu'à sept jours après la finale ou la clôture manuelle.",
      "Plafond dur de douze mois, quelle que soit la durée de la compétition.",
      "Ligue 1 et Ligue des champions ne doivent jamais être coupées artificiellement à 90 jours.",
      "Les données restent consultables et exportables 30 jours après la fin ; le droit de jouer ne continue pas."
    ]
  },
  {
    "entitlement": "events",
    "name": "Soirée en jeu",
    "priceLabel": "9 € (10 joueurs) · 19 € (30 joueurs) · 29 € (50 joueurs)",
    "model": "capacity-pass",
    "cadence": "Pass à jauge, capacité choisie avant paiement",
    "duration": "7 jours de préparation puis 24 heures de jeu. À activer dans les 30 jours suivant l'achat.",
    "steps": [
      {
        "maxPlayers": 10,
        "price": 9
      },
      {
        "maxPlayers": 30,
        "price": 19
      },
      {
        "maxPlayers": 50,
        "price": 29
      }
    ],
    "rules": [
      "Pass autonome incluant temporairement Coup d'envoi, Événements et Quiz.",
      "Jauge choisie avant paiement, enregistrée, jamais ajustée ni facturée rétroactivement.",
      "Sept jours de préparation, puis 24 heures de jeu.",
      "Activation dans les 30 jours suivant l'achat.",
      "Ne pas vendre de jauge supérieure avant un benchmark de capacité live concluant."
    ]
  }
];

/** Aucun essai sur les add-ons : l'essai reste celui de l'offre principale. */
export const ADDON_TRIAL_DAYS = 0;

/** Tout add-on est achetable seul, sans abonnement. */
export const ADDONS_PURCHASABLE_STANDALONE = false;

export const ADDON_EXPIRY_RULES: readonly string[] = [
  "À l'expiration d'un pass, la ressource est mise en pause de façon sûre.",
  "Les données et exports restent lisibles après l'expiration.",
  "Ne jamais prolonger silencieusement un droit expiré."
];

/**
 * Abonnement mensuel de l'offre d'entrée, en euros. Hypothèse « abonnement par
 * établissement » du simulateur de ROI — dérivée, jamais saisie.
 */
export const ENTRY_SUBSCRIPTION_MONTHLY = 29;

export function findGeneratedPlan(id: string): GeneratedPlan | null {
  return GENERATED_PLANS.find((plan) => plan.id === id) ?? null;
}
