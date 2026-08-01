/* ════════════════════════════════════════════════════════════
 * LE DÉCOUPAGE D'UN SMS EN SEGMENTS (3GPP TS 23.038)
 *
 * ── POURQUOI CE MODULE EXISTE ───────────────────────────────
 *
 * `claim_sms_delivery` débite désormais N unités et non plus une
 * (`20260827120000`), mais elle ne sait pas compter : c'est l'appelant qui lui
 * dit combien. Tant que ce compte était le littéral `1`, un message de trois
 * segments coûtait un crédit au commerçant et trois au produit — l'écart que
 * `sms.multipart` mesurait sans pouvoir le corriger.
 *
 * ── AUCUN ACCÈS AU RÉSEAU, AUCUN ACCÈS À LA BASE ────────────
 *
 * Fonction pure, éprouvable seule. Elle décide de ce qui est FACTURÉ : la
 * rendre dépendante de quoi que ce soit d'extérieur, c'est rendre le prix
 * d'un envoi impossible à rejouer.
 *
 * ── CE QU'ELLE NE PROMET PAS ────────────────────────────────
 *
 * Que le prestataire compte pareil. C'est une norme, pas un contrat : Brevo
 * rend `smsCount` dans sa réponse, et le worker compare les deux comptes
 * (`sms.segment_mismatch`). Ce compteur est la SEULE chose qui dira un jour si
 * ce fichier colle à la facturation réelle, plutôt que de le supposer.
 * ════════════════════════════════════════════════════════════ */

/** L'alphabet dans lequel le message sera encodé sur le fil. */
export type SmsEncoding = "gsm7" | "ucs2";

export interface SmsSegmentation {
  /** Nombre de SMS réellement émis — donc d'unités facturées. */
  segments: number;
  encoding: SmsEncoding;
  /** Septets (GSM-7) ou unités UTF-16 (UCS-2). Exposé pour le diagnostic. */
  units: number;
}

/**
 * L'alphabet GSM-7 de base, dans l'ordre de la table 3GPP (0x00 → 0x7F).
 *
 * Le caractère d'échappement 0x1B n'y figure pas : il n'est jamais écrit tel
 * quel, il PRÉFIXE les caractères de la table d'extension — et c'est très
 * exactement ce qui les fait coûter deux septets.
 */
const GSM7_BASIC: ReadonlySet<string> = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
      " !\"#¤%&'()*+,-./0123456789:;<=>?" +
      "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
      "¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);

/**
 * La table d'extension : représentable en GSM-7, mais à DEUX septets (ESC +
 * code). Dix caractères, dont trois qu'un commerçant tape sans y penser —
 * l'euro, les crochets, la barre verticale.
 *
 * La barre verticale et le saut de page en font partie alors que l'énoncé du
 * chantier ne les citait pas : la table normative les contient, et les
 * omettre aurait fait basculer en UCS-2 un message qui n'en a pas besoin —
 * donc facturé plus cher qu'il ne coûte.
 */
const GSM7_EXTENDED: ReadonlySet<string> = new Set(Array.from("\f^{}\\[~]|€"));

/** Un seul segment : l'en-tête de concaténation n'existe pas. */
const GSM7_SINGLE = 160;
const UCS2_SINGLE = 70;
/** Plusieurs segments : l'en-tête UDH mange 6 septets (ou 3 caractères). */
const GSM7_MULTI = 153;
const UCS2_MULTI = 67;

/**
 * Compte les segments d'un message.
 *
 * ── LE POINT DÉLICAT : un caractère ne chevauche jamais une frontière ──
 *
 * Un caractère qui coûte DEUX unités — un « € » en GSM-7, une emoji en
 * UCS-2 — ne peut pas être coupé en deux par la limite d'un segment. Les
 * implémentations réelles, dont celle du prestataire, le poussent ENTIER dans
 * le segment suivant, et le segment précédent part avec une place perdue.
 *
 * D'où un remplissage segment par segment, et surtout PAS une division du
 * total par la capacité. La division se trompe exactement dans le cas qui
 * coûte de l'argent : `'a'.repeat(152) + '€' + 'a'.repeat(152)` fait 306
 * unités, que `ceil(306 / 153)` annonce à 2 segments alors qu'il en part 3.
 * Un test le grave (`sms-segments.test.ts`) ; il rougit sur toute
 * réimplémentation par division.
 *
 * Un message vide vaut 1 segment : c'est la borne basse de la facturation, et
 * rendre 0 ferait débiter zéro unité pour un envoi réellement tenté. Le
 * worker refuse de toute façon un contenu vide bien avant d'arriver ici.
 */
export function smsSegments(content: string): SmsSegmentation {
  // `Array.from` découpe par POINT DE CODE : une paire de substitution donne
  // une seule entrée, dont `length` vaut 2 — c'est-à-dire son coût exact en
  // unités UTF-16. Un `split("")` aurait coupé la paire en deux et compté
  // deux caractères dont aucun n'existe.
  const chars = Array.from(content);

  const gsm7 = chars.every(
    (char) => GSM7_BASIC.has(char) || GSM7_EXTENDED.has(char),
  );
  const encoding: SmsEncoding = gsm7 ? "gsm7" : "ucs2";

  const costs = gsm7
    ? chars.map((char) => (GSM7_EXTENDED.has(char) ? 2 : 1))
    : chars.map((char) => char.length);

  const units = costs.reduce((total, cost) => total + cost, 0);

  const single = gsm7 ? GSM7_SINGLE : UCS2_SINGLE;
  if (units <= single) return { segments: 1, encoding, units };

  const multi = gsm7 ? GSM7_MULTI : UCS2_MULTI;
  let segments = 1;
  let used = 0;
  for (const cost of costs) {
    if (used + cost > multi) {
      // Le caractère ne tient pas dans ce qu'il reste : il part ENTIER au
      // segment suivant, et la place laissée derrière lui est perdue.
      segments += 1;
      used = cost;
    } else {
      used += cost;
    }
  }

  return { segments, encoding, units };
}
