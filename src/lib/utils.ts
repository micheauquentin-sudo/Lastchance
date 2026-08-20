/** Concatène des classes CSS conditionnelles. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Slug URL-safe à partir d'un nom (ex: "Chez Marco" → "chez-marco"). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I/O/0/1 (lisibilité)

/** Code court aléatoire (redeem codes, slugs QR). Utilise crypto. */
export function randomCode(length: number, prefix = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return prefix ? `${prefix}-${out}` : out;
}

/**
 * Fuseau par défaut : celui de la COLONNE en base (`organizations.timezone`,
 * 00019, défaut `Europe/Paris`), et surtout PAS celui de l'hôte.
 *
 * Sans option `timeZone`, `Intl.DateTimeFormat` retombe sur le fuseau du
 * processus — UTC en production. Toutes les dates du panneau et de la caisse
 * étaient donc affichées en UTC : deux heures de décalage à Paris en été, dix
 * à Tahiti, et très souvent le mauvais JOUR. Le commerçant règle pourtant son
 * fuseau dans ses réglages, et ce réglage n'était lu nulle part à l'affichage.
 *
 * Les composants CLIENT n'étaient pas touchés — le navigateur du commerçant
 * porte déjà son fuseau. Le défaut ne concernait que le rendu serveur.
 */
const FUSEAU_DEFAUT = "Europe/Paris";

// Construire un Intl.DateTimeFormat est coûteux : on les réutilise, désormais
// un par fuseau (la page participations formate jusqu'à 400 dates par rendu,
// toutes dans le même fuseau — le cache reste donc efficace).
const FORMATS = new Map<string, Intl.DateTimeFormat>();

function formatPour(timeZone: string): Intl.DateTimeFormat {
  const connu = FORMATS.get(timeZone);
  if (connu) return connu;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    // Fuseau inconnu du runtime : on n'affiche pas une erreur à la place d'une
    // date. Le défaut vaut mieux qu'un écran cassé.
    format = formatPour(FUSEAU_DEFAUT);
  }
  FORMATS.set(timeZone, format);
  return format;
}

/**
 * Format date FR courte, dans le fuseau de l'ÉTABLISSEMENT.
 *
 * `timeZone` est optionnel pour que les 42 appels serveur existants soient
 * corrigés d'emblée : ils passaient tous en UTC, ils passent tous à
 * `Europe/Paris`. Le passer explicitement reste nécessaire pour les
 * commerçants hors métropole — Tahiti, La Réunion, la Guadeloupe sont dans le
 * sélecteur.
 */
export function formatDate(
  iso: string | Date,
  timeZone: string = FUSEAU_DEFAUT,
): string {
  return formatPour(timeZone).format(new Date(iso));
}

/**
 * Centimes → euros affichables (« 250 € », « 99,90 € »). Déterministe (pas
 * d'`Intl`) : le rendu doit être le même sur le serveur et dans le navigateur.
 *
 * Ce format existait en privé dans `campaign-automation.tsx` (la bannière du
 * budget de gains) ; il est ici parce qu'un refus d'action doit désormais
 * nommer le MÊME montant que la bannière, et qu'un refus serveur n'importe pas
 * un composant.
 */
export function formatEuros(cents: number): string {
  const value = cents / 100;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(".", ",");
  return `${text} €`;
}

/**
 * Neutralise un terme de recherche utilisateur avant interpolation dans un
 * filtre PostgREST `.or()` (virgules, parenthèses, % et backslash retirés).
 * Retourne "" si rien d'exploitable ne reste.
 */
export function sanitizeSearchTerm(input: string): string {
  return input.trim().replace(/[%,()\\]/g, "").slice(0, 80);
}

/**
 * Normalise un code de gain saisi en caisse :
 * "gain abc2", "ABC2", "gain-abc2" → "GAIN-ABC2". "" si vide.
 */
export function normalizeRedeemCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_]/g, "")
    .replace(/^GAIN-?/, "");
  return cleaned ? `GAIN-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de chasse au trésor saisi en caisse :
 * "chasse abcd2345", "ABCD2345", "chasse-abcd2345" → "CHASSE-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1).
 */
export function normalizeHuntCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^CHASSE/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `CHASSE-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de fidélité saisi en caisse :
 * "fidelite abcd2345", "ABCD2345", "fidelite-abcd2345" → "FIDELITE-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeHuntCode : rejette les codes GAIN-… / CHASSE-… (préfixe distinct).
 */
export function normalizeLoyaltyCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^FIDELITE/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `FIDELITE-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de jackpot saisi en caisse :
 * "jackpot abcd2345", "ABCD2345", "jackpot-abcd2345" → "JACKPOT-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeLoyaltyCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-…
 * (préfixe distinct).
 */
export function normalizeJackpotCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^JACKPOT/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `JACKPOT-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de mode événement saisi en caisse :
 * "event abcd2345", "ABCD2345", "event-abcd2345" → "EVENT-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeJackpotCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… (préfixe distinct).
 */
export function normalizeEventCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^EVENT/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `EVENT-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de calendrier saisi en caisse :
 * "cadeau abcd2345", "ABCD2345", "cadeau-abcd2345" → "CADEAU-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeEventCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… / EVENT-… (préfixe distinct).
 */
export function normalizeCalendarCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^CADEAU/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `CADEAU-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de parrainage saisi en caisse :
 * "parrain abcd2345", "ABCD2345", "parrain-abcd2345" → "PARRAIN-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeCalendarCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… / EVENT-… / CADEAU-… (préfixe distinct).
 */
export function normalizeReferralCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^PARRAIN/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `PARRAIN-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de quiz saisi en caisse :
 * "quiz abcd2345", "ABCD2345", "quiz-abcd2345" → "QUIZ-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeReferralCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… / EVENT-… / CADEAU-… / PARRAIN-… (préfixe distinct).
 */
export function normalizeQuizCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^QUIZ/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `QUIZ-${cleaned}` : "";
}

/**
 * Normalise un code de retrait de pronostics saisi en caisse :
 * "prono abcd2345", "ABCD2345", "prono-abcd2345" → "PRONO-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict
 * de normalizeQuizCode : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… / EVENT-… / CADEAU-… / PARRAIN-… / QUIZ-… (préfixe distinct).
 */
export function normalizeContestCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^PRONO/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `PRONO-${cleaned}` : "";
}

/**
 * Normalise un code de RETRAIT D'UNE UNITÉ DE STOCK saisie en caisse (RES-5) :
 * "resa abcd2345", "ABCD2345", "resa-abcd2345" → "RESA-ABCD2345".
 * "" si la forme ne correspond pas (8 caractères sans I/O/0/1). Miroir strict de
 * `normalizeContestCode` : rejette les codes GAIN-… / CHASSE-… / FIDELITE-… /
 * JACKPOT-… / EVENT-… / CADEAU-… / PARRAIN-… / QUIZ-… / PRONO- (préfixe
 * distinct).
 *
 * L'alphabet est celui que le trigger `reservation_stock_holds_set_code` tire :
 * un sous-ensemble de [A-Z0-9], donc la forme normalisée satisfait d'office
 * `reward_issuances_code_shape` et le filtre d'entrée du routeur universel.
 */
export function normalizeStockHoldCode(input: string): string {
  const cleaned = sanitizeSearchTerm(input)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/^RESA/, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(cleaned) ? `RESA-${cleaned}` : "";
}

/** Résultat standard des Server Actions. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
