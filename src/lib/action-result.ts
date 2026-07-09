import type { ZodError } from "zod";

/**
 * Convention de retour des Server Actions : succès typé ou message
 * d'erreur affichable tel quel dans le formulaire.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Premier message d'erreur d'une validation Zod échouée. */
export function firstIssue(
  error: ZodError,
  fallback = "Données invalides",
): string {
  return error.issues[0]?.message ?? fallback;
}
