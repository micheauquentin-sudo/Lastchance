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

/** Résultat standard des Server Actions. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
