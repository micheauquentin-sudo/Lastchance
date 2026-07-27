/** Contenu des sections de la page d'accueil — éditable sans toucher aux composants. */

export interface Step {
  title: string;
  description: string;
  icon: string;
}

/** Fonctionnement en 3 étapes (parcours vécu par le client final). */
export const HOW_IT_WORKS: Step[] = [
  {
    icon: "📱",
    title: "Vos clients scannent",
    description:
      "Un QR code sur une table, un comptoir, une vitrine ou une étape de parcours. Aucune application à installer.",
  },
  {
    icon: "✨",
    title: "Ils vivent votre expérience",
    description:
      "Jeu instantané, fidélité, chasse, quiz, pronostics ou événement live : vous activez le format adapté à votre objectif.",
  },
  {
    icon: "📈",
    title: "Vous mesurez ce qui fonctionne",
    description:
      "Participation, retour, gain et remise en caisse sont reliés dans un tableau de bord commun, avec consentement et isolation par établissement.",
  },
];

export interface Benefit {
  title: string;
  description: string;
}

/** Pourquoi LastChance — bénéfices commerçant, chacun répond à une objection. */
export const BENEFITS: Benefit[] = [
  {
    title: "Des clients qui reviennent",
    description:
      "Calendriers, passeports, missions et rendez-vous récurrents donnent une vraie raison de revenir, au-delà d'un jeu isolé.",
  },
  {
    title: "Des emails réellement qualifiés",
    description:
      "Chaque adresse est collectée avec consentement explicite, en conformité RGPD. Exportez-les en un clic pour vos campagnes.",
  },
  {
    title: "Prêt en 10 minutes",
    description:
      "Choisissez une expérience, personnalisez-la puis diffusez son QR. Les modules actifs restent accessibles depuis une navigation claire.",
  },
  {
    title: "Vous gardez la main",
    description:
      "Règles, stocks, horaires, limites de jeu et publication se pilotent depuis le tableau de bord, avec effet immédiat.",
  },
  {
    title: "Anti-triche intégré",
    description:
      "Résultats et transitions sensibles sont validés côté serveur, avec limites par joueur, contrôles de cohérence et protection anti-bots.",
  },
  {
    title: "Conforme et responsable",
    description:
      "RGPD by design, bonnes pratiques Google respectées : le gain n'est jamais conditionné à un avis en ligne.",
  },
];

export interface UseCase {
  icon: string;
  title: string;
  example: string;
}

/** Cas d'usage par type de commerce. */
export const USE_CASES: UseCase[] = [
  {
    icon: "🍕",
    title: "Restaurants & bars",
    example: "Un dessert ou un café offert pendant l'attente du plat.",
  },
  {
    icon: "💇",
    title: "Salons & instituts",
    example: "Une réduction sur le prochain soin pour faire revenir.",
  },
  {
    icon: "🛍️",
    title: "Boutiques",
    example: "-10 % à valoir aujourd'hui : le jeu déclenche l'achat.",
  },
  {
    icon: "🏋️",
    title: "Salles de sport & loisirs",
    example: "Une séance découverte à offrir à un ami.",
  },
];
