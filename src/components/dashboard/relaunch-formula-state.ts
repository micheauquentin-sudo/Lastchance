export type RelaunchFormulaInput = {
  /** Une relance ne part que d'une animation achevée. */
  sourceState: "completed" | "not_completed";
  /** Calculé côté serveur : rôle owner/editor et source dans l'organisation. */
  canCreateDraft: boolean;
  /** L'éditeur sait-il copier ce type d'animation sans perte trompeuse ? */
  isSupported: boolean;
};

export type RelaunchFormulaState =
  | {
      kind: "eligible";
      copiedItems: string[];
      reviewItems: string[];
      notCopiedItems: string[];
    }
  | { kind: "blocked"; reason: string };

/**
 * État informatif de la carte de relance.
 *
 * Elle ne duplique rien et ne fournit ni identifiant ni lien : la carte se
 * contente de dire ce qu'une relance reprendrait, et à quoi il faudrait
 * ensuite regarder de près. L'action de création elle-même est un `ReactNode`
 * passé par l'intégration, et elle n'est rendue qu'à l'état « eligible ».
 */
export function getRelaunchFormulaState({
  sourceState,
  canCreateDraft,
  isSupported,
}: RelaunchFormulaInput): RelaunchFormulaState {
  if (!isSupported) {
    return {
      kind: "blocked",
      reason: "Cette formule ne peut pas encore être relancée en brouillon.",
    };
  }

  if (sourceState !== "completed") {
    return {
      kind: "blocked",
      reason: "Terminez ou clôturez d'abord cette animation avant de la relancer.",
    };
  }

  if (!canCreateDraft) {
    return {
      kind: "blocked",
      reason: "Seul un propriétaire ou un éditeur autorisé peut créer ce brouillon.",
    };
  }

  return {
    kind: "eligible",
    copiedItems: ["La structure et les réglages compatibles"],
    reviewItems: [
      "Le nom et les dates",
      "Les lots et les stocks",
      "Les contenus",
      "Le QR et la diffusion",
    ],
    notCopiedItems: [
      "Les participants",
      "Les gains et les codes",
      "Les scans",
      "L'historique et les données joueur",
    ],
  };
}

/**
 * LA CARTE A-T-ELLE QUELQUE CHOSE À MONTRER ?
 *
 * `RelaunchFormulaCard` se tait dans deux cas — une animation qui n'est pas
 * terminée, et un type d'animation que l'éditeur ne sait pas copier — et rend
 * alors `null`. C'est une décision assumée : un refus n'a de sens qu'après
 * une tentative, et il n'y en a eu aucune sur un brouillon créé dix secondes
 * plus tôt.
 *
 * Mais les six pages détail enveloppent cette carte dans une
 * `CarteRepliable` repliée par défaut, qui n'en savait rien : le titre
 * « Relancer la formule », sa pastille de checklist, son résumé et son « + »
 * restaient à l'écran. Le commerçant dépliait et trouvait un bloc vide — le
 * bouton paraissait cassé, et le silence voulu par la carte devenait un
 * défaut visible.
 *
 * Le verdict est donc rendu lisible ICI plutôt que déduit deux fois : la
 * carte s'en sert pour se taire, la page pour ne pas poser l'enveloppe, et
 * les deux ne peuvent plus diverger.
 */
export function relanceADeQuoiSAfficher(input: RelaunchFormulaInput): boolean {
  if (getRelaunchFormulaState(input).kind !== "blocked") return true;
  // Seul le refus de RÔLE reste affiché : un éditeur qui voit la carte sur une
  // animation clôturée doit savoir pourquoi le bouton lui manque.
  return input.sourceState === "completed" && input.isSupported;
}
