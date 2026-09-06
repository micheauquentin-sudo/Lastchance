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
 * Les familles de jetons du dépôt, et la seule liste qui les énumère.
 *
 * Chacune est le nom d'une variable d'environnement passée à `signingSecret`
 * quelque part dans `src/lib` (spin/claim, invitation d'équipe, désabonnement,
 * check-in fidélité, check-in cagnotte, défi d'adresse). `token-secrets.test.ts`
 * relit les sources et fait rougir la CI si une famille naît sans entrer ici :
 * une liste recopiée à la main serait fausse au premier module suivant, et une
 * sonde qui énumère une liste incomplète ment par omission.
 */
export const FAMILLES_DE_JETONS = [
  "CLAIM_TOKEN_SECRET",
  "TEAM_INVITE_TOKEN_SECRET",
  "UNSUBSCRIBE_TOKEN_SECRET",
  "LOYALTY_CHECKIN_TOKEN_SECRET",
  "JACKPOT_CHECKIN_TOKEN_SECRET",
  "SKILL_CHALLENGE_TOKEN_SECRET",
] as const;

/**
 * Familles SANS clé dédiée, donc adossées au repli `SPIN_TOKEN_SECRET`.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ──────────────────────────
 *
 * Le repli de `signingSecret` est SILENCIEUX : un déploiement où
 * `CLAIM_TOKEN_SECRET` n'a jamais été provisionné fonctionne parfaitement, et
 * rien, nulle part, ne dit que quatre familles signent en réalité avec la même
 * clé. Les préfixes de domaine empêchent la confusion inter-familles — ce
 * n'est pas une faille — mais la conséquence reste réelle : la compromission
 * ou la rotation de `SPIN_TOKEN_SECRET` touche alors TOUTES ces familles d'un
 * coup, et l'exploitant l'ignore.
 *
 * Rendre l'état lisible ne coûte rien et se lit dans `/api/health`. C'est un
 * CONSTAT d'exploitation, pas un défaut : le repli est documenté et
 * légitime — voir `checkTokenSecrets` côté sonde pour pourquoi il ne fait pas
 * rougir la santé.
 */
export function famillesSurRepli(): string[] {
  return FAMILLES_DE_JETONS.filter((name) => !process.env[name]);
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
