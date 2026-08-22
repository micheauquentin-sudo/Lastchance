import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GRANTABLE_MODULES,
  MODULE_ADDON_COLUMN,
  type GrantableModule,
} from "./subscription";

/**
 * GARDE DE PARITÉ — quelle colonne `addon_*` conditionne quel module.
 *
 * `org_has_module_access` (migration 20260907120000) porte un `case p_module`
 * qui associe chaque module à sa colonne. `MODULE_ADDON_COLUMN` porte la même
 * table côté TypeScript. Deux tables écrites à la main, c'est deux tables qui
 * divergeront : le jour où un module change d'add-on en base, rien ne dirait
 * que l'application continue de lire l'ancien — et le symptôme serait un droit
 * accordé par Postgres et refusé par l'écran, ou l'inverse.
 *
 * ── CE FICHIER NE CONTIENT PAS LA TABLE, IL LA LIT ──
 *
 * Il PARSE le `case` de la migration et le compare à la constante. Il n'existe
 * donc pas de second exemplaire à tenir synchronisé : modifier le SQL fait
 * rougir ce test tant que la constante ne suit pas. Même méthode que
 * `subscription-parity.test.ts`, qui rejoue la matrice d'accès depuis son
 * fichier pgTAP.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle prouve que les deux tables d'association sont identiques, et que la
 * liste des modules est la même des deux côtés. Elle ne prouve RIEN sur
 * l'ordre des branches (octroi avant abonnement), ni sur le comportement à
 * l'échéance : ce sont `subscription.test.ts` et pgTAP qui s'en chargent.
 * C'est une garde TEXTUELLE au sens d'ADR-074 — elle lit un fichier, elle ne
 * fait rien exécuter.
 */

/**
 * L'ANCRE SUIT LA DÉFINITION VIVANTE, PAS SA PREMIÈRE ÉCRITURE.
 *
 * Elle a pointé `20260907120000_p0_lot2_octrois_dates.sql` jusqu'au 2026-08-16 :
 * `org_has_module_access` y a été créée, puis REDÉFINIE par
 * `20260925120000_droits_stripe.sql` (SD-4). La garde continuait de comparer la
 * constante à une version que Postgres n'exécute plus — c'est-à-dire qu'elle
 * gardait du mort, exactement le piège « lire le catalogue vivant, pas la
 * migration d'origine » déjà payé deux fois sur ce dépôt.
 *
 * Déplacée une seconde fois le 2026-08-19 : `20261001120000_droit_vitrine.sql`
 * redéfinit à son tour la fonction pour y faire entrer `vitrine`. Même geste,
 * même motif — l'ancre suit la dernière redéfinition, jamais la première.
 *
 * Déplacée une TROISIÈME fois le 2026-08-22 :
 * `20261020120000_cle_par_produit.sql` redéfinit `org_has_module_access` pour
 * détacher `reserver`, `duo` et `bande` de `vitrine`. Et cette fois la garde a
 * été prise en flagrant délit de garder du mort — elle rendait QUINZE TESTS
 * VERTS pendant que le SQL déclarait treize modules et le TypeScript dix : elle
 * comparait la constante à la version de `20261001120000`, où les dix
 * concordaient encore. Un écart de trois clés, invisible, dans le fichier dont
 * c'est l'unique métier de le voir.
 *
 * LA LEÇON N'EST PAS « penser à déplacer l'ancre » — on l'a pensé deux fois et
 * oublié la troisième. C'est que ce chemin est la SEULE ligne de ce fichier qui
 * ne se dérive de rien, et qu'il faut donc la relire à chaque migration qui
 * touche à la fonction.
 */
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261020120000_cle_par_produit.sql",
);

/**
 * Extrait le corps du `case p_module … end` de `org_has_module_access`.
 *
 * Ancré sur la fonction et non sur le premier `case` du fichier : la migration
 * en contient d'autres (`org_module_grant_state`), et se tromper de bloc
 * rendrait une table vide — donc un test qui passe en ne comparant rien.
 */
function extraireCaseSql(source: string): string {
  const debutFonction = source.indexOf(
    "create or replace function public.org_has_module_access(",
  );
  if (debutFonction < 0) {
    throw new Error(
      "org_has_module_access introuvable dans la migration : la garde ne " +
        "mesure plus rien, corriger le chemin ou le nom avant de continuer.",
    );
  }
  const debutCase = source.indexOf("case p_module", debutFonction);
  // `\r?\n` et non `\n` : ce dépôt est cloné sous Windows et la migration
  // porte des fins de ligne CRLF. Un `indexOf("end\n  into")` ne trouve rien,
  // et sans le `throw` ci-dessous il aurait rendu une table VIDE — donc un
  // test vert qui ne compare rien. C'est le piège CRLF déjà payé au chantier
  // « échéance des lots », repris ici du bon côté.
  const finCase = /end\r?\n\s*into v_addon/.exec(source.slice(debutCase));
  if (debutCase < 0 || !finCase) {
    throw new Error(
      "Le `case p_module … end into v_addon` d'org_has_module_access n'a pas " +
        "la forme attendue : garde à réécrire, pas à contourner.",
    );
  }
  return source.slice(debutCase, debutCase + finCase.index);
}

/** `when 'hunts' then o.addon_hunts` → hunts ⇒ addon_hunts ; `then true` ⇒ null. */
function tableDepuisSql(bloc: string): Map<string, string | null> {
  const table = new Map<string, string | null>();
  const motif = /when\s+'([a-z]+)'\s*then\s+(o\.(addon_[a-z_]+)|true)/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = motif.exec(bloc)) !== null) {
    table.set(trouve[1], trouve[3] ?? null);
  }
  return table;
}

const SOURCE = readFileSync(MIGRATION, "utf8");
const TABLE_SQL = tableDepuisSql(extraireCaseSql(SOURCE));

describe("parité MODULE_ADDON_COLUMN ↔ org_has_module_access", () => {
  it("le parsing a effectivement trouvé des lignes", () => {
    // Sans cette assertion, une regex devenue muette rendrait une table vide
    // et TOUTES les comparaisons ci-dessous passeraient en ne comparant rien.
    // C'est le défaut « le détecteur ment » que ce dépôt a payé douze fois :
    // un zéro rouge y est indistinguable d'un succès.
    expect(TABLE_SQL.size).toBe(GRANTABLE_MODULES.length);
  });

  it("les deux côtés couvrent exactement les mêmes modules", () => {
    expect([...TABLE_SQL.keys()].sort()).toEqual([...GRANTABLE_MODULES].sort());
    expect(Object.keys(MODULE_ADDON_COLUMN).sort()).toEqual(
      [...GRANTABLE_MODULES].sort(),
    );
  });

  it.each(GRANTABLE_MODULES)(
    "%s est conditionné par la même colonne des deux côtés",
    (module: GrantableModule) => {
      expect(TABLE_SQL.get(module)).toBe(MODULE_ADDON_COLUMN[module]);
    },
  );

  it("la roue n'est conditionnée par aucun add-on, des deux côtés", () => {
    // Épinglé à part parce qu'un `null` se lirait comme « pas d'entrée »
    // plutôt que comme un écart — une divergence y serait invisible.
    expect(TABLE_SQL.get("wheel")).toBeNull();
    expect(MODULE_ADDON_COLUMN.wheel).toBeNull();
  });

  it("vitrine EST conditionnée par addon_vitrine, des deux côtés", () => {
    // ÉPINGLÉ À PART, et l'assertion a été RETOURNÉE le 2026-08-19 (revue
    // sécurité du lot L2, MOYEN-1). Elle disait « vitrine n'est conditionnée
    // par aucun add-on », ce qui était le miroir fidèle d'un `then true` — donc
    // d'un module ouvert à TOUT abonné, sans que personne le lui ait vendu.
    // La décision produit est que Vitrine est une offre DISTINCTE : elle porte
    // sa colonne comme les huit add-ons, et `default false` laisse les abonnés
    // existants exactement où ils étaient.
    expect(TABLE_SQL.get("vitrine")).toBe("addon_vitrine");
    expect(MODULE_ADDON_COLUMN.vitrine).toBe("addon_vitrine");
  });

  it("les quatre clés de la Vitrine ont chacune SA colonne", () => {
    // ÉPINGLÉ À PART parce que le `it.each` ci-dessus ne peut pas voir ce
    // défaut-ci : il compare le SQL au TypeScript, et quatre clés pointant
    // toutes `addon_vitrine` des DEUX côtés lui paraîtraient parfaitement
    // d'accord. Ce serait pourtant le détachement de 20261020120000 rendu
    // décoratif — un opérateur croyant vendre l'agenda seul rouvrirait les
    // quatre produits d'un coup.
    const colonnes = ["vitrine", "reserver", "duo", "bande"].map((m) =>
      TABLE_SQL.get(m),
    );
    expect(colonnes).toEqual([
      "addon_vitrine",
      "addon_reserver",
      "addon_duo",
      "addon_bande",
    ]);
    expect(new Set(colonnes).size).toBe(4);
  });

  it("un SEUL module est sans add-on, des deux côtés", () => {
    // Contrôle de CARDINALITÉ, sans lequel les deux tests ci-dessus passeraient
    // aussi si un `then true` s'était glissé sur un module vendu — un add-on
    // deviendrait gratuit pour tout abonné, et aucune assertion ne bougerait.
    //
    // Ce « un seul » n'est pas qu'une garde de parité : `MODULES_PORTANT_LE_SOCLE`
    // (src/lib/subscription.ts) DÉRIVE le produit de base de cette unicité —
    // « le module sans colonne addon ». Un second `null` y ferait entrer un
    // module que personne n'a payé.
    const sansAddonSql = [...TABLE_SQL.entries()]
      .filter(([, colonne]) => colonne === null)
      .map(([nom]) => nom)
      .sort();
    const sansAddonTs = Object.entries(MODULE_ADDON_COLUMN)
      .filter(([, colonne]) => colonne === null)
      .map(([nom]) => nom)
      .sort();
    expect(sansAddonSql).toEqual(["wheel"]);
    expect(sansAddonTs).toEqual(["wheel"]);
  });
});
