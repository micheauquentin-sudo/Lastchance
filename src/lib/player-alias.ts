/**
 * Contrat applicatif des alias publics. La base réapplique les mêmes bornes :
 * cette couche fournit un retour immédiat à l'UI, jamais l'unique garde.
 */

const BLOCKED_WORDS = new Set([
  "con",
  "connard",
  "connasse",
  "encule",
  "enculee",
  "enculer",
  "fdp",
  "hitler",
  "merde",
  "nazi",
  "nique",
  "putain",
  "pute",
  "salope",
  "suicide",
]);

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const CONTROL_OR_FORMAT_GLOBAL = /[\p{Cc}\p{Cf}]/gu;

/** Borne d'affichage commune : celle qu'`isAllowedPlayerAlias` applique déjà. */
export const PLAYER_ALIAS_MAX_LENGTH = 24;

/** Forme affichée : Unicode canonique, espaces homogènes, 24 caractères max. */
export function formatPlayerAlias(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

/** Forme de comparaison/modération, sans accent ni ponctuation décorative. */
export function normalizePlayerAlias(value: string): string {
  return formatPlayerAlias(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Projection d'AFFICHAGE d'un alias DÉJÀ STOCKÉ — la contrepartie en lecture
 * de `isAllowedPlayerAlias`, qui ne garde que les écritures.
 *
 * ── POURQUOI `formatPlayerAlias` NE SUFFIT PAS ──
 *
 * Il normalise (NFKC), rogne et replie les espaces. Un U+202E n'étant NI un
 * espace NI décomposé par NFKC, il lui survit intact. Ce qui protège l'écran
 * n'est donc pas le formateur : c'est le retrait explicite de \p{Cc}\p{Cf}.
 *
 * ── L'ORDRE, ET CE QU'IL PRÉSERVE ──
 *
 * Le formateur passe D'ABORD, pour que les contrôles qui SONT des espaces
 * (\n, \t) deviennent des espaces avant d'être retirés — sans quoi
 * « Jean\nLuc » se recollerait en « JeanLuc ». Le retrait ensuite, puis un
 * second repli : ôter un caractère au milieu peut laisser une double espace.
 *
 * La troncature compte en POINTS DE CODE, comme `char_length` en base, et non
 * en unités UTF-16 : couper au milieu d'une paire de substitution rendrait un
 * demi-caractère à l'écran.
 *
 * `repli` couvre le cas où il ne reste rien d'affichable. La base le rend
 * théorique (`repair_player_alias`, migration 20261205120000, garantit un
 * pseudo non vide au repos) — cette couche est la ceinture, pas la seule.
 */
export function sanitizePlayerAlias(value: string | null | undefined, repli = "Joueur"): string {
  const sansInvisible = formatPlayerAlias(value ?? "").replace(CONTROL_OR_FORMAT_GLOBAL, "");
  const affichable = [...formatPlayerAlias(sansInvisible)]
    .slice(0, PLAYER_ALIAS_MAX_LENGTH)
    .join("")
    .trim();
  return affichable === "" ? repli : affichable;
}

/** Refuse contrôles invisibles et injures explicites, sans filtrage par sous-chaîne. */
export function isAllowedPlayerAlias(value: string): boolean {
  const display = formatPlayerAlias(value);
  if (display.length < 1 || display.length > 24 || CONTROL_OR_FORMAT.test(display)) {
    return false;
  }

  const normalized = normalizePlayerAlias(display);
  const words = normalized.split(" ").filter(Boolean);
  if (words.some((word) => BLOCKED_WORDS.has(word))) return false;

  // Capture aussi une obfuscation uniquement séparée par espaces ("c o n"),
  // sans refuser un mot innocent qui contient la séquence ("Dominique").
  return !BLOCKED_WORDS.has(words.join(""));
}

