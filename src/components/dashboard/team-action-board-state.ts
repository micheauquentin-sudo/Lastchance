import type { MemberRole } from "@/types/database";

export type TeamAction = {
  key: string;
  label: string;
  description: string;
  assigneeRole: MemberRole;
  status: "ready" | "done" | "blocked";
  /** Rôles auxquels le parent serveur a confirmé cette action. */
  availableTo: readonly MemberRole[];
  /** Le parent ne le passe que si la page cible est réellement autorisée. */
  href?: string;
  blockedReason?: string;
};

export type TeamActionBoardSnapshot = {
  total: number;
  done: number;
  /**
   * Actions que ce rôle ne peut pas accomplir. Elles ne s'affichent PLUS ligne
   * par ligne en rouge : un employé arrivait sur un écran d'alertes qu'il
   * n'avait aucun moyen de résoudre. Elles se résument en une ligne neutre.
   */
  blocked: number;
  /** Les seules lignes réellement affichées : ce qu'il reste à faire. */
  aFaire: TeamAction[];
  nextAction: (TeamAction & { href: string }) | null;
};

/**
 * LE SEUL ENDROIT QUI DÉCIDE QU'UNE ACTION DEVIENT UN LIEN.
 *
 * Exporté, et non privé : le composant recopiait ce prédicat mot pour mot pour
 * savoir s'il devait rendre un `<Link>`. Deux copies d'une règle d'affichage de
 * droits, c'est deux endroits où la corriger — et un jour un seul des deux le
 * sera. Le tableau n'accorde toujours aucun droit : il se contente de ne pas
 * proposer un lien qui mènerait à un refus.
 */
export function isNavigableAction(
  action: TeamAction,
  actorRole: MemberRole | null,
): action is TeamAction & { href: string } {
  return (
    action.status === "ready" &&
    actorRole !== null &&
    action.availableTo.includes(actorRole) &&
    Boolean(action.href)
  );
}

/**
 * Le tableau ne décide aucun rôle : le parent calcule les actions et ne donne
 * un lien qu'à une destination déjà autorisée. Cette vue rend seulement
 * visible qui doit agir, et évite un appel à l'action qui serait bloqué.
 */
export function getTeamActionBoardSnapshot(
  actions: TeamAction[],
  actorRole: MemberRole | null,
): TeamActionBoardSnapshot {
  return {
    total: actions.length,
    done: actions.filter((action) => action.status === "done").length,
    blocked: actions.filter((action) => action.status === "blocked").length,
    aFaire: actions.filter((action) => action.status === "ready"),
    nextAction: actions.find((action): action is TeamAction & { href: string } =>
      isNavigableAction(action, actorRole),
    ) ?? null,
  };
}

export function roleLabel(role: MemberRole): string {
  switch (role) {
    case "owner":
      return "Propriétaire";
    case "editor":
      return "Éditeur";
    case "cashier":
      return "Caisse";
  }
}
