// @vitest-environment node
import { readFileSync } from "node:fs";
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
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260911120000_compteur_ouvertures_modules.sql",
);

function sql(): string {
  return readFileSync(MIGRATION, "utf8");
}

describe("vocabulaire des modules comptés", () => {
  it("coïncide avec le CHECK de module_page_opens.module", () => {
    const bloc = /module in \(([^)]*)\)/.exec(sql());
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
    const corps = sql();
    const sansBranche = MODULE_PAGE_OPEN_KEYS.filter(
      (cle) => !corps.includes(`when '${cle}' then`),
    );
    expect(sansBranche).toEqual([]);
  });

  it("n'inclut ni la roue, ni le parrainage, ni la chasse", () => {
    // Les trois exclusions sont des DÉCISIONS, pas des oublis, et chacune a sa
    // raison : la roue compte déjà dans `qr_codes.scan_count`, le parrainage
    // n'a pas de QR commerçant, la chasse affiche une affiche par étape.
    // Ajouter l'une des trois ici sans traiter sa cause produirait soit un
    // double comptage, soit un compteur qui confond des étapes distinctes.
    for (const absent of ["wheel", "referral", "hunts"]) {
      expect(MODULE_PAGE_OPEN_KEYS as readonly string[]).not.toContain(absent);
    }
  });

  it("compte les six modules qui exposent un QR par PublicShare", () => {
    expect([...MODULE_PAGE_OPEN_KEYS].sort()).toEqual([
      "calendar",
      "events",
      "jackpot",
      "loyalty",
      "pronostics",
      "quiz",
    ]);
  });
});

describe("isModulePageOpenKey", () => {
  it("accepte les clés du vocabulaire et rien d'autre", () => {
    for (const cle of MODULE_PAGE_OPEN_KEYS) {
      expect(isModulePageOpenKey(cle), cle).toBe(true);
    }
    // `null` et les voisins des trois vocabulaires du dépôt : ce sont les
    // fautes réellement probables, pas des chaînes aléatoires.
    for (const faux of [null, "", "wheel", "hunt", "event", "contest", "Quiz"]) {
      expect(isModulePageOpenKey(faux), String(faux)).toBe(false);
    }
  });
});
