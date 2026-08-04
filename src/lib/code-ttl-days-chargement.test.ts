import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LE FORMULAIRE DOIT LIRE CE QU'IL RÉÉCRIT.
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A ÉTÉ LIVRÉ ──────────────
 *
 * `CodeTtlDaysField` porte un champ CACHÉ toujours posé : côté serveur,
 * `formData.has("code_ttl_days")` est la seule chose qui distingue « efface le
 * réglage » (valeur `''`, légitime : sans limite) de « ne touche pas à ce
 * réglage » (clé absente). Cette garde d'écriture a été écrite, testée, et
 * elle tient.
 *
 * Elle ne protège de rien si la page n'a jamais CHARGÉ la colonne. Trois des
 * sept pages sélectionnaient des colonnes une par une sans `code_ttl_days` :
 * le champ s'affichait vide, le commerçant lisait « Sans limite » là où il
 * avait réglé 30 jours, et le premier enregistrement du même formulaire
 * reposait `''` — donc effaçait réellement le réglage, sans message et sans
 * trace. La garde d'écriture était intacte pendant tout ce temps : elle
 * recevait une clé présente et une valeur vide, ce qui est exactement le
 * geste « efface », indistinguable du geste volontaire.
 *
 * ── POURQUOI `tsc` NE PEUT PAS L'ATTRAPER ───────────────────────────
 *
 * Les pages castent le résultat PostgREST vers `Calendar`, `JackpotCampaign`,
 * `LoyaltyProgram` — qui déclarent tous `code_ttl_days: number | null`.
 * TypeScript ne relie pas une chaîne de `select()` à une interface : il croit
 * la colonne présente, l'exécution rend `undefined`, et `codeTtlDaysInitial`
 * confond légitimement `undefined` (jamais chargée) avec `null` (pas
 * d'échéance) — les deux donnent un champ vide. Aucun type ne sépare ces deux
 * cas, puisque c'est l'interface elle-même qui ment.
 *
 * ── CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──────────
 *
 * Elle est TEXTUELLE. Conformément à ADR-074, elle prouve qu'une colonne est
 * DEMANDÉE dans le `select()` d'une page — jamais qu'elle atteint le champ,
 * ni qu'elle est rendue. C'est néanmoins la mesure exacte du défaut trouvé :
 * les trois pages fautives ne la demandaient pas.
 *
 * ── ELLE SE DÉRIVE, ELLE NE S'ÉNUMÈRE PAS ───────────────────────────
 *
 * Rien ici n'est écrit à la main : les sept tables viennent de la migration,
 * les éditeurs de qui importe le composant, les pages de qui importe un
 * éditeur. Une huitième famille branchée demain entre dans la garde toute
 * seule — c'est la seule forme qui survit à l'oubli, et l'oubli est
 * précisément ce qui a produit le défaut.
 */

const RACINE = join(__dirname, "..", "..");
const MIGRATION = join(
  RACINE,
  "supabase",
  "migrations",
  "20260904120000_reward_expiry_days.sql",
);
const COMPOSANT = "code-ttl-days-field";

/** Les sept tables portant `code_ttl_days`, lues dans la migration. */
function tablesPortantLeReglage(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const tables = [
    ...sql.matchAll(
      /alter table public\.(\w+)\s+add column if not exists code_ttl_days\b/g,
    ),
  ].map((m) => m[1]);
  return [...new Set(tables)];
}

function fichiersSous(dir: string, suffixe: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersSous(chemin, suffixe));
    else if (entree.name.endsWith(suffixe)) out.push(chemin);
  }
  return out;
}

/** Les éditeurs qui rendent le champ — dérivés de l'import, pas listés. */
function editeursPortantLeChamp(): string[] {
  return fichiersSous(join(RACINE, "src", "components", "dashboard"), ".tsx")
    .filter((f) => readFileSync(f, "utf8").includes(`/${COMPOSANT}"`))
    .map((f) => f.split(/[\\/]/).pop()!.replace(/\.tsx$/, ""));
}

/** Les pages qui alimentent un de ces éditeurs — dérivées de l'import. */
function pagesAlimentantes(editeurs: string[]): string[] {
  return fichiersSous(join(RACINE, "src", "app", "dashboard"), ".tsx").filter(
    (f) => {
      const src = readFileSync(f, "utf8");
      return editeurs.some((e) => src.includes(`dashboard/${e}"`));
    },
  );
}

/**
 * Extrait l'argument de `select(...)` équilibré en parenthèses. Un simple
 * « jusqu'au premier `)` » suffirait aujourd'hui, mais casserait sur le
 * premier `select("id", { count: "exact" })` imbriqué qu'on écrira.
 */
function argumentSelect(source: string, depuis: number): string | null {
  const debut = source.indexOf(".select(", depuis);
  if (debut === -1) return null;
  let profondeur = 0;
  for (let i = debut + ".select(".length - 1; i < source.length; i += 1) {
    if (source[i] === "(") profondeur += 1;
    else if (source[i] === ")") {
      profondeur -= 1;
      if (profondeur === 0)
        return source.slice(debut + ".select(".length, i).trim();
    }
  }
  return null;
}

/**
 * Les colonnes réellement demandées : soit une chaîne littérale, soit une
 * constante du même fichier (`CAMPAIGN_COLUMNS`, `CALENDAR_COLUMNS`…) —
 * deux des trois pages fautives passaient précisément par une constante.
 */
function colonnesDemandees(source: string, argument: string): string {
  const litteral = argument.match(/^["'`]([^"'`]*)["'`]/);
  if (litteral) return litteral[1];
  const identifiant = argument.match(/^([A-Za-z_$][\w$]*)/);
  if (!identifiant) return argument;
  const constante = source.match(
    new RegExp(`\\b${identifiant[1]}\\s*=\\s*["'\`]([^"'\`]*)["'\`]`),
  );
  return constante ? constante[1] : argument;
}

describe("chargement de code_ttl_days par les pages qui le règlent", () => {
  const tables = tablesPortantLeReglage();
  const editeurs = editeursPortantLeChamp();
  const pages = pagesAlimentantes(editeurs);

  it("dérive sept tables, sept éditeurs et sept pages", () => {
    // Les trois comptes ensemble : un zéro quelque part rendrait toutes les
    // assertions suivantes VACANTES — elles boucleraient sur du vide et
    // passeraient au vert sans avoir rien regardé.
    expect(tables).toHaveLength(7);
    expect(editeurs.length).toBeGreaterThanOrEqual(7);
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it("chaque page qui règle l'échéance charge la colonne qu'elle réécrit", () => {
    const manquants: string[] = [];

    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      const nom = page.slice(RACINE.length + 1).replace(/\\/g, "/");

      for (const table of tables) {
        const ancre = `.from("${table}")`;
        let curseur = source.indexOf(ancre);
        while (curseur !== -1) {
          const argument = argumentSelect(source, curseur);
          if (argument) {
            const colonnes = colonnesDemandees(source, argument);
            const toutes = colonnes.trim().startsWith("*");
            if (!toutes && !colonnes.includes("code_ttl_days")) {
              manquants.push(`${nom} → ${table}`);
            }
          }
          curseur = source.indexOf(ancre, curseur + ancre.length);
        }
      }
    }

    // Le message nomme la page ET la table : un compte seul ne dirait pas
    // laquelle des sept a bougé.
    expect(manquants).toEqual([]);
  });
});
