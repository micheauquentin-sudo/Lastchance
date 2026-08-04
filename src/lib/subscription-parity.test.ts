import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hasActiveAccess } from "./subscription";

/**
 * GARDE DE PARITÉ — `hasActiveAccess` (TS) vs `org_has_active_access` (SQL).
 *
 * La migration 20260905120000 descend en base la règle « cette organisation
 * a-t-elle un accès complet ? », pour que la publication d'un module puisse
 * être refusée par Postgres et pas seulement par une server action. Le danger
 * n'est pas d'écrire un bug : c'est de fabriquer une SECONDE SOURCE DE VÉRITÉ,
 * deux prédicats qui se ressemblent aujourd'hui et divergent le jour où
 * quelqu'un corrigera l'un des deux.
 *
 * ── CE FICHIER NE CONTIENT PAS LA MATRICE, IL LA LIT ──
 *
 * Les cas vivent dans `supabase/tests/access_parity.test.sql`, où pgTAP les
 * joue contre le vrai Postgres. Ce test-ci PARSE ce même bloc et rejoue chaque
 * ligne contre le TypeScript. Il n'existe donc aucun second exemplaire à tenir
 * synchronisé — ajouter un cas là-bas l'ajoute ici, mécaniquement.
 *
 * C'est ce qui distingue cette garde d'une simple table de cas recopiée : deux
 * copies prouvent que chaque côté est d'accord avec lui-même ; une seule source
 * lue deux fois prouve qu'ils sont d'accord ENTRE EUX.
 *
 * ── CE QUE LA GARDE PROUVE ──
 * Que les deux implémentations rendent le même verdict sur les cas énumérés,
 * bornes de l'impayé comprises (13,9 j et 14,1 j).
 *
 * ── CE QU'ELLE NE PROUVE PAS ──
 * Rien sur un cas absent de la matrice. Ce n'est pas une preuve d'équivalence,
 * c'est un accord sur un échantillon écrit à la main : une divergence
 * introduite sur une combinaison que personne n'a listée (un statut neuf, une
 * colonne neuve) passerait au vert des deux côtés. Le jour où
 * `subscription_status` gagne une valeur, la ligne s'ajoute dans le .sql —
 * le vert de ce fichier ne le signalera pas tout seul.
 */

const SQL_PATH = join(
  process.cwd(),
  "supabase",
  "tests",
  "access_parity.test.sql",
);

const DEBUT = "┌──────── MATRICE DE PARITÉ";
const FIN = "└──────── FIN MATRICE";

/** Une ligne de la matrice, telle qu'écrite dans le fichier SQL. */
interface CasParite {
  cas: string;
  subStatus: string;
  trialDays: number;
  pastDueDays: number | null;
  comp: boolean;
  compDays: number | null;
  attendu: boolean;
}

const NOMBRE = String.raw`-?\d+(?:\.\d+)?`;
const LIGNE = new RegExp(
  String.raw`^\s*\('([^']*)',\s*'([a-z_]+)',\s*(${NOMBRE}),\s*(null|${NOMBRE}),`
    + String.raw`\s*(true|false),\s*(null|${NOMBRE}),\s*(true|false)\)`,
);

function lireSql(): string {
  return readFileSync(SQL_PATH, "utf8");
}

/** Instant de référence, extrait du littéral `timestamptz '…'` du fichier SQL. */
function lireT0(sql: string): Date {
  const m = /insert into tap_t0 values \(timestamptz '([^']+)'\)/.exec(sql);
  if (!m) throw new Error("T0 introuvable dans access_parity.test.sql");
  // Postgres écrit « 2026-06-15 12:00:00+00 » ; Date veut un T et un fuseau
  // explicite. Sans le remplacement, Date() interpréterait la chaîne en heure
  // LOCALE et toute la matrice se décalerait du décalage horaire de la machine
  // — les cas à ±0,1 jour des bornes tomberaient selon le poste.
  return new Date(m[1].replace(" ", "T").replace(/\+00$/, "Z"));
}

function lireMatrice(sql: string): CasParite[] {
  const debut = sql.indexOf(DEBUT);
  const fin = sql.indexOf(FIN);
  if (debut < 0 || fin < 0 || fin <= debut) {
    throw new Error(
      "Bloc de matrice introuvable : les marqueurs de access_parity.test.sql "
      + "ont changé. Corriger le parseur, ne pas relâcher les marqueurs.",
    );
  }
  const cas: CasParite[] = [];
  for (const ligne of sql.slice(debut, fin).split("\n")) {
    const m = LIGNE.exec(ligne);
    if (!m) continue;
    cas.push({
      cas: m[1],
      subStatus: m[2],
      trialDays: Number(m[3]),
      pastDueDays: m[4] === "null" ? null : Number(m[4]),
      comp: m[5] === "true",
      compDays: m[6] === "null" ? null : Number(m[6]),
      attendu: m[7] === "true",
    });
  }
  return cas;
}

const MS_PAR_JOUR = 86_400_000;

function instant(t0: Date, jours: number): string {
  return new Date(t0.getTime() + jours * MS_PAR_JOUR).toISOString();
}

describe("parité hasActiveAccess (TS) / org_has_active_access (SQL)", () => {
  const sql = lireSql();
  const t0 = lireT0(sql);
  const matrice = lireMatrice(sql);

  /**
   * LE CONTRÔLE QUI REND LES AUTRES CRÉDIBLES.
   *
   * Un parseur qui ne matche plus rien rend un tableau vide, donc zéro
   * assertion, donc ZÉRO ROUGE — indistinguable d'une parité parfaite. C'est
   * exactement la forme de détecteur muet que ce dépôt s'est déjà fait prendre
   * plusieurs fois. Le compte attendu est donc épinglé, et il est confronté au
   * nombre de lignes ouvrantes réellement présentes dans le bloc : si
   * quelqu'un ajoute un cas au SQL sans que le parseur le comprenne, ce test
   * rougit au lieu de l'ignorer en silence.
   */
  it("lit réellement la matrice du fichier SQL", () => {
    const debut = sql.indexOf(DEBUT);
    const fin = sql.indexOf(FIN);
    const lignesOuvrantes = sql
      .slice(debut, fin)
      .split("\n")
      .filter((l) => /^\s*\('/.test(l)).length;

    expect(matrice.length).toBe(lignesOuvrantes);
    expect(matrice.length).toBe(16);
    // Le fichier SQL épingle le même 16 de son côté : les deux suites
    // tomberaient ensemble si le bloc était vidé.
  });

  it.each(matrice.map((c) => [c.cas, c] as const))(
    "%s",
    (_nom, c) => {
      const verdict = hasActiveAccess(
        {
          subscription_status: c.subStatus as never,
          trial_ends_at: instant(t0, c.trialDays),
          past_due_since:
            c.pastDueDays === null ? null : instant(t0, c.pastDueDays),
          comp_access: c.comp,
          comp_access_until:
            c.compDays === null ? null : instant(t0, c.compDays),
        },
        t0,
      );
      expect(verdict).toBe(c.attendu);
    },
  );
});
