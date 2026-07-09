/**
 * Génération CSV des exports du dashboard.
 * Convention Excel FR : séparateur ';', BOM UTF-8 en tête de fichier.
 */

const SEPARATOR = ";";
const BOM = "﻿";

/** Entoure de guillemets les valeurs contenant séparateur, quote ou saut de ligne. */
export function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Assemble le fichier complet ; chaque cellule est échappée. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((cells) =>
    cells.map(csvEscape).join(SEPARATOR),
  );
  return BOM + lines.join("\n");
}
