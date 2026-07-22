import "server-only";

import { requiredEnv } from "@/lib/env";

/**
 * Chaque usage possède sa clé. SPIN_TOKEN_SECRET reste un repli de migration
 * pour les déploiements (et la CI) qui n'ont pas encore provisionné la clé
 * dédiée : dans ce cas seulement, c'est LUI la clé courante de la famille.
 */
export function signingSecret(name: string): string {
  return process.env[name] || requiredEnv("SPIN_TOKEN_SECRET");
}

/**
 * Secrets acceptés en VÉRIFICATION : la clé courante de la famille, plus les
 * clés listées dans `<NAME>_PREVIOUS` (rotation, séparées par des virgules).
 *
 * Le repli SPIN_TOKEN_SECRET est désormais CONDITIONNEL — il n'entre dans la
 * liste que via `signingSecret`, c'est-à-dire uniquement quand la clé dédiée
 * est absente. Auparavant il était ajouté systématiquement : la clé historique
 * restait alors acceptée pour toujours (aucune rotation ne pouvait la retirer)
 * et sa compromission aurait suffi à forger des jetons de TOUTES les familles
 * (claim, invitation, check-in fidélité). Pour retirer un secret historique
 * après avoir provisionné la clé dédiée, on le place le temps de la transition
 * dans `<NAME>_PREVIOUS`.
 *
 * Complément indispensable : chaque famille préfixe son message signé (voir
 * `unsubscribe.ts`, `spin.ts`, `team-invite.ts`, `loyalty-checkin.ts`) pour
 * qu'un jeton d'une famille ne soit jamais vérifiable par une autre, même
 * lorsque toutes partagent le repli SPIN_TOKEN_SECRET.
 */
export function verificationSecrets(name: string): string[] {
  const current = signingSecret(name);
  const previous = (process.env[`${name}_PREVIOUS`] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([current, ...previous])];
}
