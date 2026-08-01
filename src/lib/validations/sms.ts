import { z } from "zod";

/* ════════════════════════════════════════════════════════════
 * SMS — expéditeur (AF2M) et consentement
 *
 * Deux objets sans rapport de forme, réunis parce qu'ils partagent une
 * contrainte : ce sont les deux endroits où une saisie humaine entre dans le
 * canal SMS, et où une erreur ne se voit qu'au moment de l'envoi — trop tard,
 * puisque sur ce canal l'envoi est facturé.
 * ════════════════════════════════════════════════════════════ */

/**
 * Version du texte de consentement RÉELLEMENT affiché à la personne.
 *
 * Versionné et non booléen : la preuve d'un consentement n'est pas « la case
 * était cochée », c'est « voici la phrase qu'elle a lue en la cochant ». Le
 * jour où cette phrase change, l'ancienne version doit rester lisible pour
 * les consentements déjà recueillis — sans quoi on ne peut plus dire à quoi
 * les gens ont consenti.
 *
 * Le libellé est stocké ici, pas en base : c'est du texte de produit, il suit
 * le code qui l'affiche.
 */
export const SMS_CONSENT_VERSION = "sms.v1";

/**
 * LE TEXTE ARCHIVÉ EST LA PREUVE DU CONSENTEMENT. On n'édite pas une version
 * déjà servie — on en publie une nouvelle, sans quoi la trace ne dit plus à
 * quoi la personne a réellement dit oui.
 *
 * `sms.v1` a pourtant été RÉÉCRIT sur place, et une seule fois : avant tout
 * déploiement, alors qu'aucun consentement n'existe — les tables SMS ne sont
 * pas encore appliquées en production. Publier un `v2` qui corrige un `v1`
 * que personne n'a jamais vu n'aurait laissé qu'une version morte dans le
 * dossier. **Ce raccourci est fermé dès la première ligne enregistrée.**
 *
 * Ce que la rédaction d'origine ne disait pas, et pourquoi ça compte :
 *
 * · « ce commerce » ne NOMME personne. Un consentement doit désigner le
 *   responsable du traitement ; « ce commerce » ne permet pas, six mois plus
 *   tard, de dire à qui la personne a consenti. D'où l'interpolation du nom.
 *
 * · « en répondant STOP » ne disait pas À QUI, et la réponse est
 *   contre-intuitive : l'expéditeur porte le nom du commerçant, mais un
 *   expéditeur ALPHANUMÉRIQUE ne peut pas recevoir de réponse (charte AF2M).
 *   Le STOP part vers un NUMÉRO COURT de l'opérateur, jamais chez le
 *   commerçant. Le texte promettait donc un geste qui n'aurait pas abouti —
 *   c'est-à-dire un droit de retrait que la personne aurait cru exercer.
 */
export const SMS_CONSENT_TEXTS: Readonly<Record<string, string>> = {
  "sms.v1":
    "J'accepte de recevoir des offres et actualités de {commerce} par SMS. " +
    "Je peux me désinscrire à tout moment en envoyant STOP au numéro court " +
    "indiqué dans chaque message.",
};

/** Marque du nom de l'établissement dans les textes de consentement. */
export const SMS_CONSENT_MERCHANT_TOKEN = "{commerce}";

/**
 * Le texte ARCHIVÉ d'une version, marque intacte. C'est lui qui prouve quelle
 * formulation a été servie, indépendamment de l'établissement.
 *
 * Signature inchangée : j'ai d'abord ajouté le nom du commerce en PREMIER
 * argument, ce qui a silencieusement retourné le sens de tous les appels
 * passant une version — un test l'a dit tout de suite. Deux usages distincts
 * méritaient deux fonctions, pas un paramètre de plus.
 */
export function smsConsentText(version: string = SMS_CONSENT_VERSION): string {
  return SMS_CONSENT_TEXTS[version] ?? SMS_CONSENT_TEXTS[SMS_CONSENT_VERSION];
}

/**
 * Le texte tel que la PERSONNE le lit, avec le nom du responsable du
 * traitement à la place de la marque.
 *
 * Séparé de `smsConsentText` parce que les deux répondent à deux questions :
 * « qu'a-t-on archivé ? » et « qu'a-t-elle lu ? ». Les confondre ferait
 * archiver un nom d'établissement dans un texte de version, et deux
 * commerçants n'auraient plus la même `sms.v1`.
 */
export function smsConsentLabel(
  commerce: string | undefined,
  version: string = SMS_CONSENT_VERSION,
): string {
  const brut = smsConsentText(version);
  // Sans nom connu, on ne laisse pas la marque à l'écran : la personne
  // lirait une accolade. « ce commerce » est moins précis, mais lisible.
  return brut.replaceAll(SMS_CONSENT_MERCHANT_TOKEN, commerce || "ce commerce");
}

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

/**
 * Le consentement lui-même.
 *
 * `opt_in` est REFUSÉ quand il vaut `false` : ce schéma ne sait valider qu'un
 * consentement donné. Une case décochée n'est pas un formulaire invalide —
 * c'est l'absence de consentement, et l'appelant doit s'arrêter avant
 * d'écrire quoi que ce soit plutôt que d'enregistrer un « non ».
 *
 * Le format du numéro reprend le CHECK des colonnes existantes
 * (`participations.phone`, `00004`) : quatre séparateurs tolérés. AUCUNE
 * normalisation ici — elle appartient à `sms_phone_e164` en base, et un
 * second site de normalisation est exactement le défaut que
 * `20260826120000` vient de fermer.
 */
export const smsConsentSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 .()\-]{6,20}$/, "Numéro de téléphone invalide"),
  opt_in: z
    .boolean()
    .refine((value) => value === true, "Le consentement SMS doit être coché"),
});

export type SmsConsentInput = z.infer<typeof smsConsentSchema>;
