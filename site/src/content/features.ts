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
      "Un QR code sur la table, au comptoir ou en vitrine. Pas d'application à installer : l'appareil photo suffit.",
  },
  {
    icon: "🎡",
    title: "Ils tournent la roue",
    description:
      "Une roue de la fortune à vos couleurs, avec vos lots. Le résultat est calculé côté serveur — vous gardez le contrôle des probabilités et des stocks.",
  },
  {
    icon: "🎁",
    title: "Vous récupérez tout",
    description:
      "Gain remis en caisse, email collecté avec consentement, statistiques en temps réel dans votre tableau de bord.",
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
      "La limite de jeu (1 fois par jour, par semaine…) transforme le jeu en rendez-vous : on revient tenter sa chance, on consomme au passage.",
  },
  {
    title: "Des emails réellement qualifiés",
    description:
      "Chaque adresse est collectée avec consentement explicite, en conformité RGPD. Exportez-les en un clic pour vos campagnes.",
  },
  {
    title: "Prêt en 10 minutes",
    description:
      "Créez une campagne, personnalisez la roue, imprimez l'affiche générée automatiquement. Aucune compétence technique requise.",
  },
  {
    title: "Vous gardez la main",
    description:
      "Probabilités, stocks de lots, limites de jeu, pause instantanée : tout se pilote depuis le tableau de bord, effet immédiat.",
  },
  {
    title: "Anti-triche intégré",
    description:
      "Tirage côté serveur, limite par joueur, protection anti-bots : impossible de relancer la roue jusqu'au gros lot.",
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
