#!/usr/bin/env node

// Garde anti-régression : COALESCE, GREATEST, LEAST et NULLIF ne sont PAS des
// fonctions du catalogue. Le parseur les transforme en nœuds dédiés
// (CoalesceExpr, MinMaxExpr, NullIfExpr) et il n'existe aucune entrée pg_proc
// correspondante. Les qualifier en `pg_catalog.` produit
//   ERROR: function pg_catalog.coalesce(integer, integer) does not exist
// À L'EXÉCUTION seulement : le DDL s'applique sans broncher, la migration part
// en production, et la fonction casse au premier appel réel.
//
// Ces constructions n'ont pas besoin d'être qualifiées sous
// `set search_path = ''` : elles ne sont jamais résolues via le search_path,
// contrairement aux vraies fonctions (btrim, array_length, char_length,
// position, substring…) qui doivent, elles, rester qualifiées.
//
// Trois occurrences en trois chantiers avant cette garde : 20260721190000 et
// 20260728130000 (correctifs NULLIF), puis six sites dans les migrations
// 20260805*.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDirectory = path.join(root, "supabase", "migrations");

// Uniquement les constructions sans entrée pg_proc. `position`, `substring`,
// `overlay` et `btrim` en ont une (la grammaire les mappe dessus) : elles sont
// légitimement qualifiables et ne doivent pas être signalées.
const CONSTRUCTS = ["coalesce", "greatest", "least", "nullif"];

/**
 * LA SECONDE FAMILLE, trouvée le 2026-08-29 — et que la liste ci-dessus ne
 * pouvait pas attraper.
 *
 * `extract`, `substring`, `position` et `overlay` ONT une entrée pg_proc : les
 * qualifier est légitime, et l'en-tête de ce fichier le dit déjà. Mais chacune
 * a DEUX écritures — la forme fonction, à virgules, et la FORME GRAMMATICALE, à
 * mot-clé interne :
 *
 *     pg_catalog.date_part('dow', j.jour)      ✅  fonction, qualifiable
 *     pg_catalog.extract(dow from j.jour)      ❌  syntax error at or near "from"
 *
 * La seconde n'est pas un appel de fonction : c'est une règle de grammaire, et
 * un nom qualifié devant elle fait échouer l'ANALYSE. L'erreur arrive donc plus
 * tôt que celle des quatre constructions ci-dessus — à l'application de la
 * migration, pas au premier appel — mais elle coûte le même aller-retour de CI.
 *
 * On ne signale donc pas le NOM, on signale le nom SUIVI de son mot-clé interne.
 * `trim` est là aussi : `pg_catalog.trim(…)` échoue quelle que soit la forme,
 * la fonction s'appelant `btrim`.
 */
const KEYWORD_FORMS = new Map([
  ["extract", ["from"]],
  ["substring", ["from", "for"]],
  ["position", ["in"]],
  ["overlay", ["placing", "from", "for"]],
  ["trim", ["from", "both", "leading", "trailing"]],
]);
const pattern = new RegExp(
  String.raw`\bpg_catalog\s*\.\s*(${CONSTRUCTS.join("|")})\b`,
  "gi"
);

// Migrations déjà appliquées en production, donc immuables, et déjà corrigées
// par une migration ultérieure qui redéfinit la fonction fautive. Elles
// conservent le motif dans leur corps historique : on ne peut ni les éditer ni
// les laisser faire échouer la garde.
export const LEGACY_ALLOWLIST = new Map([
  [
    "20260721150000_contest_rules_and_awards.sql",
    "corrigée par 20260721190000_fix_nullif_qualification.sql",
  ],
  [
    "20260728120000_calendar_campaigns.sql",
    "corrigée par 20260728130000_fix_calendar_join_nullif.sql",
  ],
]);

// Retire commentaires de ligne et de bloc en respectant les littéraux : un
// `--` dans une chaîne n'ouvre pas un commentaire. Le contenu des chaînes est
// conservé — du SQL dynamique qui appelle `pg_catalog.coalesce(...)` casserait
// tout autant à l'exécution, il doit être signalé.
export function stripSqlComments(source) {
  let out = "";
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);

    if (rest.startsWith("--")) {
      const end = source.indexOf("\n", index);
      if (end === -1) break;
      out += "\n";
      index = end + 1;
      continue;
    }

    if (rest.startsWith("/*")) {
      // Les commentaires de bloc SQL s'imbriquent.
      let depth = 0;
      let cursor = index;
      while (cursor < source.length) {
        if (source.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (source.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
          if (depth === 0) break;
        } else {
          if (source[cursor] === "\n") out += "\n";
          cursor += 1;
        }
      }
      index = cursor;
      continue;
    }

    if (source[index] === "'") {
      const end = source.indexOf("'", index + 1);
      const stop = end === -1 ? source.length : end + 1;
      out += source.slice(index, stop);
      index = stop;
      continue;
    }

    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = source.indexOf(tag, index + tag.length);
      const stop = end === -1 ? source.length : end + tag.length;
      out += source.slice(index, stop);
      index = stop;
      continue;
    }

    out += source[index];
    index += 1;
  }

  return out;
}

export function findQualifiedConstructs(source) {
  const sansCommentaires = stripSqlComments(source);
  const lines = sansCommentaires.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, offset) => {
    for (const match of line.matchAll(pattern)) {
      findings.push({
        line: offset + 1,
        construct: match[1].toLowerCase(),
        text: line.trim(),
      });
    }
  });

  // La seconde famille se cherche sur le SOURCE ENTIER et non ligne à ligne :
  // `pg_catalog.extract(\n  dow from x\n)` est parfaitement courant, et une
  // recherche par ligne ne verrait jamais le mot-clé.
  for (const finding of findQualifiedKeywordForms(sansCommentaires)) {
    findings.push(finding);
  }

  return findings;
}

/**
 * La FORME GRAMMATICALE qualifiée : `pg_catalog.extract(dow from …)`.
 *
 * On ne peut pas se contenter d'un motif plat — le mot-clé peut être à
 * n'importe quelle profondeur d'un argument, et un `from` appartenant à une
 * sous-requête imbriquée ne concerne pas cet appel. On lit donc jusqu'à la
 * parenthèse fermante correspondante, et on ne retient le mot-clé que s'il est
 * au PREMIER niveau : `pg_catalog.substring(x, (select 1 from t))` est un
 * appel de fonction parfaitement légal.
 */
export function findQualifiedKeywordForms(source) {
  const noms = [...KEYWORD_FORMS.keys()].join("|");
  const ouverture = new RegExp(
    String.raw`\bpg_catalog\s*\.\s*(${noms})\s*\(`,
    "gi",
  );
  const trouves = [];

  for (const match of source.matchAll(ouverture)) {
    const nom = match[1].toLowerCase();
    const debut = match.index + match[0].length;
    let profondeur = 1;
    let index = debut;
    while (index < source.length && profondeur > 0) {
      const c = source[index];
      if (c === "(") profondeur += 1;
      else if (c === ")") profondeur -= 1;
      index += 1;
    }
    // Les arguments, sous-parenthèses APLATIES : ce qui reste est le niveau 1.
    const bruts = source.slice(debut, Math.max(debut, index - 1));
    let niveau = 0;
    let surface = "";
    for (const c of bruts) {
      if (c === "(") niveau += 1;
      else if (c === ")") niveau -= 1;
      else if (niveau === 0) surface += c;
      if (niveau > 0 && (c === "(" || c === ")")) surface += " ";
    }

    const motsCles = KEYWORD_FORMS.get(nom) ?? [];
    const fautif = motsCles.find((mot) =>
      new RegExp(String.raw`\b${mot}\b`, "i").test(surface),
    );
    // `trim` n'a AUCUNE forme fonction : elle est fautive même sans mot-clé.
    if (!fautif && nom !== "trim") continue;

    trouves.push({
      line: source.slice(0, match.index).split("\n").length,
      construct: fautif ? `${nom} … ${fautif}` : nom,
      text: source
        .slice(match.index, Math.min(source.length, index))
        .replace(/\s+/g, " ")
        .slice(0, 120),
    });
  }

  return trouves;
}

export async function findParserConstructViolations({
  migrationsDirectory = defaultDirectory,
  allowlist = LEGACY_ALLOWLIST,
} = {}) {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const violations = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    if (allowlist.has(entry.name)) continue;

    const source = await readFile(
      path.join(migrationsDirectory, entry.name),
      "utf8"
    );
    for (const finding of findQualifiedConstructs(source)) {
      violations.push({ file: entry.name, ...finding });
    }
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line
  );
}

async function main() {
  const violations = await findParserConstructViolations();

  if (violations.length === 0) {
    console.log(
      "Aucune construction du parseur qualifiée en pg_catalog. dans les migrations."
    );
    return;
  }

  console.error(
    "Constructions du parseur qualifiées en `pg_catalog.` : elles n'existent " +
      "pas dans pg_proc et échouent À L'EXÉCUTION, pas à l'application de la " +
      "migration. Retirez le préfixe (elles ignorent le search_path).\n"
  );
  for (const violation of violations) {
    console.error(
      `- supabase/migrations/${violation.file}:${violation.line} ` +
        `→ pg_catalog.${violation.construct}\n    ${violation.text}`
    );
  }
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
