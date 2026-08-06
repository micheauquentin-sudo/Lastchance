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
