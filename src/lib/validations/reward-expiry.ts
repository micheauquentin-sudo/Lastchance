import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Échéance du code de retrait — réglage COMMUN aux sept familles
//
// `hunts`, `loyalty_programs`, `jackpot_campaigns`, `event_sessions`,
// `calendars`, `referral_programs` et `quizzes` portent toutes la MÊME
// colonne `code_ttl_days integer` (migration 20260904120000), avec les
// mêmes bornes et la même sémantique : le trigger `set_reward_redeem_expiry`
// grave `redeem_expires_at = now() + N jours` sur le lot À SON ÉMISSION.
//
// Module DÉDIÉ, et non un schéma recopié sept fois ni hébergé chez l'une des
// sept : les sept fichiers de validation sont des pairs, faire importer
// `hunts.ts` depuis `quiz.ts` (ou l'inverse) créerait un couplage arbitraire
// entre deux modules qui n'ont rien à voir, et le premier choisi deviendrait
// par accident le propriétaire d'une règle qui n'appartient à aucun des sept.
// Sept copies, elles, se seraient désynchronisées à la première borne revue.
// ────────────────────────────────────────────────────────────

/**
 * Durée de validité du code de retrait, en JOURS — miroir applicatif du
 * CHECK SQL (`code_ttl_days is null or code_ttl_days between 1 and 365`).
 * '' = pas d'expiration (null), valeur LÉGITIME et non un champ vide à
 * ignorer.
 *
 * L'unité est le jour et non la seconde (comme `contests.code_ttl_seconds`)
 * parce que ces sept lots ne se jouent pas devant la caisse : le gagnant est
 * prévenu, puis se déplace. Un réglage en heures n'aurait aucun usage ici.
 *
 * ⚠️ Côté action, ce champ se lit TOUJOURS par
 * `formData.has("code_ttl_days") ? formData.get("code_ttl_days") : undefined`
 * (jamais `formData.get(...) ?? ""`) : sans cette garde, la sauvegarde d'un
 * AUTRE formulaire de la même page remettrait l'échéance à « sans limite »
 * sans que le commerçant ait touché au champ.
 */
export const codeTtlDaysSchema = z
  .union(
    [
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Nombre entier de jours requis")
        .min(1, "Minimum 1 jour")
        .max(365, "Maximum 365 jours"),
    ],
    // Message de l'échec d'UNION (aucune branche ne prend : "abc", "3.5").
    // Sans lui zod rend « Invalid input » — les bornes, elles, gardent leur
    // propre message, la branche numérique ayant alors réussi à coercer.
    { error: "Nombre entier de jours requis" },
  )
  .nullable();
