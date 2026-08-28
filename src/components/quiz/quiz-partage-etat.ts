/**
 * OÙ ET COMMENT LE PARTAGE S'AFFICHE, selon où en est le joueur.
 *
 * ── Pourquoi cette décision vit ici et pas dans le JSX ──
 *
 * Elle s'est trompée deux fois de suite, dans les deux sens opposés :
 *  1. le bloc était rendu à TOUS les états, collé sous la carte de question —
 *     il ressemblait à un bouton de cette question et disputait l'attention à
 *     « Valider ma réponse » ;
 *  2. corrigé en le MASQUANT pendant la partie — le joueur qui voulait faire
 *     tourner le quiz au moment où il s'amusait ne trouvait plus rien.
 *
 * La bonne réponse n'est ni « toujours » ni « jamais » mais « toujours, à un
 * autre endroit » : en pied de page pendant la partie, en bloc plein quand le
 * partage est le sujet de l'écran. Une fonction pure la porte désormais, avec
 * ses tests — un `&&` dans le rendu n'en avait aucun, et c'est exactement ce
 * qui a laissé passer les deux erreurs.
 *
 * Cœur PUR, sans dépendance de rendu — miroir de `event-view-state.ts`.
 */

export interface VuePartageQuiz {
  /** `carte` : le partage est le sujet. `discret` : pied de page. */
  variante: "carte" | "discret";
  /** Phrase d'accroche, accordée au moment. */
  intro: string;
  /** Libellé du bouton. */
  libelle: string;
}

export interface EtatJoueurQuiz {
  /** Le commerçant propose-t-il le partage (`quizzes.share_enabled`) ? */
  shareEnabled: boolean;
  /** Le joueur a-t-il rejoint la partie ? */
  aRejoint: boolean;
  /** Sa participation est-elle close ? */
  termine: boolean;
}

/**
 * `null` UNIQUEMENT si le commerçant a coupé le partage. Aucun état de jeu ne
 * fait disparaître le bloc : c'est l'invariant que ces tests gardent.
 */
export function vuePartageQuiz(etat: EtatJoueurQuiz): VuePartageQuiz | null {
  if (!etat.shareEnabled) return null;

  // Partie en cours : présent, mais en pied de page.
  if (etat.aRejoint && !etat.termine) {
    return {
      variante: "discret",
      intro: "Ce quiz vous plaît ? Faites-le tourner.",
      libelle: "Défier un ami",
    };
  }

  // Partie finie : le défi, une fois le score connu.
  if (etat.termine) {
    return {
      variante: "carte",
      intro: "Défiez un ami : envoyez-lui le lien, il jouera au même quiz.",
      libelle: "Défier un ami",
    };
  }

  // Avant de commencer : l'invitation — le seul chemin qui ne passe pas par le
  // QR du comptoir, et donc le seul qui permette de jouer entre amis un soir.
  return {
    variante: "carte",
    intro:
      "Jouez à plusieurs : envoyez ce lien à vos amis, ils rejoignent depuis leur téléphone.",
    libelle: "Inviter des amis",
  };
}
