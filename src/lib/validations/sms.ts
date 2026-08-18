import { z } from "zod";

/* ════════════════════════════════════════════════════════════
 * SMS — expéditeur (AF2M) et consentement
 *
 * Deux objets sans rapport de forme, réunis parce qu'ils partagent une
 * contrainte : ce sont les deux endroits où une saisie humaine entre dans le
 * canal SMS, et où une erreur ne se voit qu'au moment de l'envoi — trop tard,
 * puisque sur ce canal l'envoi est facturé.
 * ════════════════════════════════════════════════════════════ */

/*
 * Les textes de consentement et leurs deux lecteurs vivent dans
 * `@/lib/claim-libelles` — un module SANS aucun import. La case à cocher est
 * rendue par `claim-form.tsx` (client) : la chercher ici tirait Zod entier dans
 * l'écran de réclamation pour une phrase. Ré-exportés pour les appelants
 * serveur qui les archivent (`sms-prize.ts`) ; `smsConsentLabel` ne l'est PAS,
 * il n'a qu'un appelant et c'est le composant.
 */
export {
  SMS_CONSENT_MERCHANT_TOKEN,
  SMS_CONSENT_TEXTS,
  SMS_CONSENT_VERSION,
  smsConsentText,
} from "@/lib/claim-libelles";

/**
 * L'expéditeur alphanumérique, tel que la charte AF2M l'admet : 1 à 11
 * caractères, majuscules non accentuées et chiffres. Aucun espace, aucun
 * tiret, aucun accent.
 *
 * Miroir EXACT du CHECK de `sms_senders.sender_id` (20260824120000). Le
 * doublon est voulu : la base est le rempart, Zod est le message d'erreur.
 * Sans le second, un commerçant qui saisit « Café Léon » reçoit une violation
 * de contrainte Postgres au lieu d'une phrase qui lui dit quoi corriger.
 *
 * La mise en majuscules est faite ICI plutôt que refusée : « monresto » et
 * « MONRESTO » sont le même nom commercial, et rejeter le premier serait une
 * dureté sans objet. Ce qui reste refusé est ce qui change le nom — les
 * accents, les espaces, la ponctuation — parce que l'opérateur, lui, les
 * refuse.
 */
export const smsSenderIdSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z0-9]{1,11}$/.test(value),
    "1 à 11 caractères : lettres non accentuées et chiffres uniquement, sans espace",
  );

export const smsSenderRequestSchema = z.object({
  sender_id: smsSenderIdSchema,
});

export type SmsSenderRequest = z.infer<typeof smsSenderRequestSchema>;

/*
 * `smsConsentSchema` / `SmsConsentInput` ont été RETIRÉS ici.
 *
 * Ils validaient l'entrée de `submitSmsConsent`, l'action que le joueur
 * appelait séparément pour déposer son consentement SMS. Cette action a
 * disparu quand le consentement est passé DANS le claim lui-même
 * (`claimPrize` → `recordPrizeSmsConsent`), l'ordre inverse ne déposant jamais
 * rien au premier gain d'un couple (organisation, numéro).
 *
 * Ce module est importé par des surfaces serveur ; un schéma exporté sans
 * appelant se relit comme une entrée encore validée quelque part, et invite le
 * prochain écrivain à la réutiliser au lieu de valider là où la donnée entre
 * réellement. Le numéro est aujourd'hui validé par `claimSchema`, et la
 * normalisation appartient à `sms_phone_e164` en base — un second site de
 * normalisation en TypeScript est exactement ce que `20260826120000` a fermé.
 */
