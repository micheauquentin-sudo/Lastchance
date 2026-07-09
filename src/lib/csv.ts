/**
 * Sérialisation CSV sûre.
 *
 * Deux protections distinctes :
 *  1. Échappement CSV standard (RFC 4180) : les champs contenant un
 *     séparateur, un guillemet ou un saut de ligne sont entre guillemets,
 *     les guillemets internes doublés.
 *  2. Neutralisation de l'injection de formule (CSV / formula injection) :
 *     un champ commençant par `= + - @` (ou tabulation / retour chariot)
 *     est interprété comme une formule par Excel / Google Sheets / LibreOffice.
 *     Comme prénom, email, libellé de lot… proviennent d'entrées joueur
 *     non fiables, on préfixe ces valeurs d'une apostrophe pour forcer le
 *     tableur à les traiter comme du texte.
 */
export function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);

  // Neutralise l'injection de formule sur le premier caractère (après
  // d'éventuels espaces, que les tableurs ignorent avant d'évaluer).
  const trimmedStart = raw.replace(/^[\s]+/, "");
  const dangerous = /^[=+\-@\t\r]/.test(trimmedStart);
  const safe = dangerous ? `'${raw}` : raw;

  // Échappement CSV : ; et , sont des séparateurs possibles selon la locale.
  if (/[",\n\r;]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}
