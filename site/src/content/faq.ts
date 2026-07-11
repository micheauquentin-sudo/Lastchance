/** Questions fréquentes — chaque entrée répond à une objection réelle. */

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Combien de temps faut-il pour être opérationnel ?",
    answer:
      "Moins de 10 minutes : créez votre compte, nommez votre campagne (une roue prête à jouer est générée avec des lots par défaut), personnalisez vos lots, imprimez l'affiche avec son QR code. Vos clients peuvent jouer immédiatement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    answer:
      "Non. Ils scannent le QR code avec l'appareil photo de leur téléphone et jouent directement dans le navigateur. Aucun téléchargement, aucun compte à créer côté client.",
  },
  {
    question: "Est-ce que je contrôle ce que je distribue ?",
    answer:
      "Totalement. Vous définissez les lots, leur probabilité (poids), leur stock, et la limite de jeu par client (une fois, par jour, par semaine). Le tirage est calculé sur nos serveurs : personne ne peut relancer la roue jusqu'au lot désiré, et un stock épuisé n'est jamais distribué.",
  },
  {
    question: "Est-ce conforme au RGPD ?",
    answer:
      "Oui, par conception : consentement explicite obligatoire avant toute collecte, opt-in marketing séparé et jamais pré-coché, données visibles uniquement par votre établissement, aucune adresse IP stockée en clair. Vous pouvez aussi ne rien collecter du tout.",
  },
  {
    question: "Et les avis Google ?",
    answer:
      "LastChance respecte les règles de Google : le gain n'est jamais conditionné à un avis. Vous pouvez proposer plusieurs actions au choix avant de jouer (newsletter, Instagram, TikTok, avis) — le client choisit librement.",
  },
  {
    question: "Comment mes clients récupèrent-ils leur gain ?",
    answer:
      "Le gagnant reçoit un code unique (à l'écran et par email si vous collectez l'adresse). En caisse, votre équipe tape le code dans l'espace « Caisse » et valide la remise en un geste. Chaque gain n'est utilisable qu'une fois.",
  },
  {
    question: "Puis-je arrêter ou mettre en pause quand je veux ?",
    answer:
      "Oui. Une campagne se met en pause en un clic, effet immédiat sur la page de jeu. L'abonnement est sans engagement, annulable à tout moment depuis le portail de facturation Stripe.",
  },
  {
    question: "Est-ce rentable pour mon commerce ?",
    answer:
      "Un lot offert coûte quelques euros ; une visite supplémentaire ou un email qualifié en rapporte davantage. Vous pilotez le coût exactement : probabilités, stocks et valeur des lots sont sous votre contrôle. Un simulateur de retour sur investissement arrive prochainement sur ce site.",
  },
];

/** Sous-ensemble affiché en teaser sur la page d'accueil. */
export const FAQ_HOME_COUNT = 4;
