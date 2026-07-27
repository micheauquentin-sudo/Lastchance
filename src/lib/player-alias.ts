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

