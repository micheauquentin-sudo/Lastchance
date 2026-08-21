// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODULE_PAGE_OPEN_KEYS,
  isModulePageOpenKey,
} from "@/lib/module-page-opens";

/**
 * Garde d'invariant : le vocabulaire des modules comptés est écrit à TROIS
 * endroits — cette liste TypeScript, le `check` de `module_page_opens.module`,
 * et les branches `when` de la RPC `increment_module_page_open`. Les trois
 * doivent coïncider, et rien ne le dit à l'exécution :
 *
 *  - une clé ici absente du CHECK ferait LEVER la RPC (contrainte violée) ;
 *  - une clé ici absente des branches `when` ferait rendre la RPC sans rien
 *    compter — silencieusement, pour toujours ;
 *  - une clé du CHECK absente d'ici serait un module simplement jamais compté.
 *
 * Aucun de ces trois cas ne produit d'erreur visible en production : le
 * commerçant lit 0 et croit que personne ne scanne son affiche. C'est
 * exactement le genre de divergence que ce dépôt garde par un test plutôt que
 * par une relecture — comme `release.test.ts` (constante ⇄ dossier de
 * migrations) et `pgtap-coverage.test.ts` (fichiers pgTAP ⇄ commande CI).
 *
 * ── POURQUOI ON NE POINTE PLUS UN NOM DE MIGRATION EN DUR ──
 *
 * Ce fichier lisait `20260911120000` par son nom. `20260912120000` a élargi le
 * CHECK à `hunts` et réécrit la RPC : la migration d'origine ne décrivait plus
 * l'état du schéma, et le test aurait été vert en lisant une archive périmée.
 * On cherche donc la DERNIÈRE migration qui redéfinit chaque objet, comme la
 * base elle-même : la définition qui gagne est la plus récente.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** Contenu de la dernière migration (ordre lexicographique = chronologique)
 *  dont le corps satisfait `predicat`. Lève si aucune ne le fait — un test qui
 *  ne trouve pas son autorité doit rougir, pas s'abstenir. */
function derniereMigration(predicat: (sql: string) => boolean): string {
  const fichiers = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = fichiers.length - 1; i >= 0; i -= 1) {
    const corps = readFileSync(join(MIGRATIONS, fichiers[i]), "utf8");
    if (predicat(corps)) return corps;
  }
  throw new Error("aucune migration ne définit cet objet");
}

/** L'autorité du vocabulaire : la dernière migration qui pose un `module in
 *  (…)` sur `module_page_opens`. */
function sqlDuCheck(): string {
  return derniereMigration(
    (sql) => sql.includes("module_page_opens") && /module in \(/.test(sql),
  );
}

/** L'autorité des branches de résolution : la dernière migration qui crée ou
 *  remplace la RPC. */
function sqlDeLaRpc(): string {
  return derniereMigration((sql) =>
    sql.includes("function public.increment_module_page_open("),
  );
}

describe("vocabulaire des modules comptés", () => {
  it("coïncide avec le CHECK de module_page_opens.module", () => {
    const bloc = /module in \(([^)]*)\)/.exec(sqlDuCheck());
    expect(bloc, "le CHECK sur module est introuvable dans la migration")
      .not.toBeNull();

    const duCheck = [...(bloc?.[1] ?? "").matchAll(/'([a-z]+)'/g)]
      .map((m) => m[1])
      .sort();

    expect(duCheck).toEqual([...MODULE_PAGE_OPEN_KEYS].sort());
  });

  it("a une branche de résolution dans la RPC pour CHAQUE clé", () => {
    // La faute la plus coûteuse du lot, parce qu'elle est muette : la clé
    // existe, le CHECK l'accepte, la RPC ne la reconnaît pas et tombe dans le
    // `else return` — zéro erreur, zéro comptage.
    const corps = sqlDeLaRpc();
    const sansBranche = MODULE_PAGE_OPEN_KEYS.filter(
      (cle) => !corps.includes(`when '${cle}' then`),
    );
    expect(sansBranche).toEqual([]);
  });

  it("n'inclut ni la roue, ni le parrainage", () => {
    // Les deux exclusions sont des DÉCISIONS, pas des oublis : la roue compte
    // déjà dans `qr_codes.scan_count` (deux sources de vérité pour un même
    // chiffre valent moins qu'une), le parrainage n'a pas de QR commerçant
    // (son lien est fabriqué côté joueur). Ajouter l'une des deux ici sans
    // traiter sa cause produirait un double comptage ou un compteur mort.
    for (const absent of ["wheel", "referral"]) {
      expect(MODULE_PAGE_OPEN_KEYS as readonly string[]).not.toContain(absent);
    }
  });

  it("compte les huit modules qui exposent un QR commerçant", () => {
    // `vitrine` est la huitième depuis VIT-4 (20261015120000). Son grain est la
    // LIGNE DE RÉGLAGES — une par commerce — et non un sous-objet : `/v/[slug]`
    // est une page unique, là où `events` et `hunts` impriment une affiche par
    // session et par étape.
    expect([...MODULE_PAGE_OPEN_KEYS].sort()).toEqual([
      "calendar",
      "events",
      "hunts",
      "jackpot",
      "loyalty",
      "pronostics",
      "quiz",
      "vitrine",
    ]);
  });

  it("résout `hunts` contre les ÉTAPES, jamais contre la chasse", () => {
    // LE point du lot chasse, et une régression silencieuse s'il tombe :
    // résoudre `hunts` contre la table `hunts` rendrait un compteur unique par
    // chasse — le chiffre qui confond la boulangerie et le fleuriste, et pour
    // lequel la chasse avait justement été écartée du premier lot. Rien à
    // l'exécution ne signalerait le changement de grain : la RPC compterait,
    // l'écran afficherait un nombre, simplement le mauvais.
    const branche = /when 'hunts' then([\s\S]*?)when '/.exec(sqlDeLaRpc());
    expect(branche, "la branche `hunts` de la RPC est introuvable")
      .not.toBeNull();
    const corps = branche?.[1] ?? "";
    expect(corps).toContain("public.hunt_steps");
    expect(corps).not.toMatch(/from public\.hunts\b/);
  });
});

describe("isModulePageOpenKey", () => {
  it("accepte les clés du vocabulaire et rien d'autre", () => {
    for (const cle of MODULE_PAGE_OPEN_KEYS) {
      expect(isModulePageOpenKey(cle), cle).toBe(true);
    }
    // `null` et les voisins des trois vocabulaires du dépôt : ce sont les
    // fautes réellement probables, pas des chaînes aléatoires. `hunt` au
    // singulier reste faux — c'est `hunts` qui compte, et le dépôt fait
    // cohabiter les deux formes.
    for (const faux of [null, "", "wheel", "hunt", "event", "contest", "Quiz"]) {
      expect(isModulePageOpenKey(faux), String(faux)).toBe(false);
    }
  });
});
