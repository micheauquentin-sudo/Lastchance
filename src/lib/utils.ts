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

// Construire un Intl.DateTimeFormat est coûteux : on le réutilise
// (la page participations formate jusqu'à 400 dates par rendu).
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Format date FR courte. */
export function formatDate(iso: string | Date): string {
  return DATE_FORMAT.format(new Date(iso));
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

/** Résultat standard des Server Actions. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
