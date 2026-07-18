/**
 * Déduplique les membres et exclut tous les comptes administrateurs ainsi
 * que l'acteur. Un compte Auth n'est ensuite supprimé que s'il n'appartient
 * plus à aucune organisation.
 */
export function selectAuthCleanupCandidates(
  memberUserIds: readonly string[],
  actorUserId: string,
  adminUserIds: readonly string[],
): string[] {
  const protectedIds = new Set([actorUserId, ...adminUserIds]);
  return [...new Set(memberUserIds)].filter((userId) => !protectedIds.has(userId));
}

export function cleanupErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Erreur inconnue";
}
