/**
 * Les textes et les vérifications que le FORMULAIRE DE RÉCLAMATION affiche —
 * et rien d'autre.
 *
 * ── POURQUOI UN MODULE POUR DEUX FONCTIONS ──
 *
 * `claim-form.tsx` est un composant client du parcours joueur, servi sur mobile
 * juste après le tour de roue. Il n'a besoin que de deux choses hors de
 * lui-même : la phrase de consentement SMS à afficher, et le contrôle de
 * plausibilité d'une date de naissance saisie.
 *
 * Ces deux-là vivaient dans `src/lib/validations/play.ts` et
 * `src/lib/validations/sms.ts`, qui importent Zod en première ligne. Le bundler
 * suit un import, pas une intention : chercher un libellé dans un module de
 * schémas tirait Zod entier dans l'écran de réclamation, pour une chaîne de
 * caractères et une comparaison de dates. Ni l'une ni l'autre n'a jamais eu
 * besoin d'un validateur.
 *
 * **Ce module N'IMPORTE RIEN, et ne doit jamais rien importer** — c'est sa
 * seule raison d'être. Les schémas Zod, eux, importent d'ICI : le sens de la
 * dépendance est inversé exprès, parce qu'un schéma peut se permettre de
 * connaître un libellé, alors qu'un libellé ne doit rien connaître.
 *
 * Garde de source : `src/lib/import-sans-crypto.test.ts`.
 */

// ────────────────────────────────────────────────────────────
// Date de naissance
// ────────────────────────────────────────────────────────────

/**
 * Date de naissance plausible : date calendaire réelle (YYYY-MM-DD) et
 * âge entre 13 et 120 ans. Pure et exportée pour les tests.
 */
export function isPlausibleBirthDate(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejette les dates « déroulées » par JS (2020-02-31 → 2 mars).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 86_400_000);
  return ageYears >= 13 && ageYears <= 120;
}

// ────────────────────────────────────────────────────────────
// Consentement SMS — la phrase, et sa version
// ────────────────────────────────────────────────────────────

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
 * le code qui l'affiche. `@/lib/validations/sms` le ré-exporte pour les
 * appelants serveur qui l'archivent (`sms-prize.ts`).
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
