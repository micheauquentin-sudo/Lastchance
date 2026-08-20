import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RESSOURCE_MODULE,
  estPubliable,
  publicationBooleenne,
  type ModulePubliable,
} from "./module-resources";
import { GRANTABLE_MODULES } from "./subscription";

/**
 * GARDE DE PARITÉ — `RESSOURCE_MODULE` ↔ les neuf triggers de publication.
 *
 * La migration 20260905120000 déclare, pour chaque module, la table gardée, la
 * colonne qui décide de la publication et les valeurs qui la signifient :
 *
 *   create trigger hunts_guard_publication
 *     before insert or update on public.hunts
 *     for each row execute function
 *       public.guard_module_publication('hunts', 'status', '{active}');
 *
 * Ce test PARSE ces neuf déclarations et les compare à la constante. La table
 * TypeScript n'est donc pas une seconde copie à tenir à jour : renommer une
 * table ou changer une valeur publiée en base fait rougir ce fichier.
 *
 * ── CE QUE LA DIVERGENCE COÛTERAIT ──
 *
 * `RESSOURCE_MODULE` sert à compter les brouillons. Compter comme brouillon
 * une ressource que la base tient pour publiée laisserait créer indéfiniment ;
 * l'inverse bloquerait un commerçant qui n'a rien fait de mal. Aucun des deux
 * ne produirait d'erreur visible — juste un chiffre faux dans une phrase.
 *
 * ── CE QU'ELLE NE PROUVE PAS ──
 *
 * Garde TEXTUELLE (ADR-074) : elle lit un fichier de migration, pas
 * `pg_trigger`. Un trigger redéfini par une migration ULTÉRIEURE passerait
 * inaperçu ici. Elle prouve que les deux déclarations sont d'accord, pas que
 * celle-ci est la dernière.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260905120000_p0_gardes_publication.sql",
);

interface DeclarationTrigger {
  module: string;
  table: string;
  colonne: string;
  valeurs: string[];
}

function declarationsDepuisMigration(source: string): DeclarationTrigger[] {
  // `[\s\S]` et non `.` : la déclaration tient sur trois lignes, et les fins
  // de ligne sont CRLF sous Windows.
  const motif =
    /create trigger \w+_guard_publication[\s\S]{0,120}?on public\.(\w+)[\s\S]{0,120}?guard_module_publication\('(\w+)',\s*'(\w+)',\s*'\{([^}]*)\}'\)/g;
  const trouvees: DeclarationTrigger[] = [];
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) {
    trouvees.push({
      table: m[1],
      module: m[2],
      colonne: m[3],
      valeurs: m[4].split(",").map((v) => v.trim()).filter(Boolean),
    });
  }
  return trouvees;
}

const DECLARATIONS = declarationsDepuisMigration(readFileSync(MIGRATION, "utf8"));

/**
 * Les modules qui DOIVENT avoir un trigger DANS CE FICHIER DE MIGRATION.
 *
 * ── L'EXEMPTION DE `vitrine` A CHANGÉ DE RAISON (VIT-1a, 20261011120000) ──
 *
 * Elle disait « pas de table, donc rien à publier, donc rien à garder », ce qui
 * était vrai du lot L2 — qui livrait le droit serveur et rien d'autre. Ce n'est
 * PLUS le cas : `vitrine_settings` existe, elle porte `published`, et un dixième
 * trigger `guard_module_publication` la garde. Il vit simplement dans SA
 * migration, pas dans les neuf de 20260905120000 que ce fichier parse.
 *
 * Ce qui reste vrai, et qui est la raison ACTUELLE de l'exemption : `vitrine`
 * n'a pas d'entrée dans `RESSOURCE_MODULE`, parce qu'aucun QUOTA DE BROUILLONS
 * ne s'applique à elle — une organisation a une vitrine, pas N brouillons de
 * vitrine. C'est cela qu'`estPubliable` mesure, et pas l'existence d'un trigger.
 *
 * Le jour où la vitrine devient contingentée, elle entre dans `RESSOURCE_MODULE`
 * et l'assertion d'exemption ci-dessous rougit — ce qui est le bon sens de
 * l'échec.
 *
 * DÉRIVÉE de `GRANTABLE_MODULES` par le prédicat `estPubliable`, jamais
 * recopiée : le onzième module ajouté demain entre ici tout seul et fait
 * rougir la comparaison tant que son trigger n'existe pas. C'est l'inverse
 * d'une liste écrite à la main, qui l'aurait laissé passer en silence.
 */
const MODULES_PUBLIABLES: ModulePubliable[] =
  GRANTABLE_MODULES.filter(estPubliable);

describe("parité RESSOURCE_MODULE ↔ triggers de publication", () => {
  it("les neuf triggers ont été trouvés", () => {
    // Assertion de NON-VACUITÉ, et elle n'est pas décorative : une regex qui
    // ne mord plus rendrait un tableau vide, et le `it.each` ci-dessous ne
    // jouerait AUCUN cas tout en affichant du vert. « 0 rouge » et « rien
    // mesuré » se ressemblent trop pour qu'on s'en remette au hasard.
    expect(DECLARATIONS).toHaveLength(MODULES_PUBLIABLES.length);
  });

  it("vitrine est le seul module hors RESSOURCE_MODULE, et il est nommé", () => {
    // L'EXEMPTION EST ÉPINGLÉE, pas déduite du vide. Sans cette assertion, un
    // module dont quelqu'un retirerait le trigger par erreur pourrait être
    // « réparé » en l'ajoutant à l'exemption, et les deux tests ci-dessus
    // redeviendraient verts sans que rien ne soit gardé en base.
    //
    // Elle ne dit PAS « vitrine n'est pas gardée » : elle l'est, par le trigger
    // de sa propre migration (20261011120000). Elle dit qu'aucun quota de
    // brouillons ne s'y applique — voir le commentaire de MODULES_PUBLIABLES.
    const exemptes = GRANTABLE_MODULES.filter((m) => !estPubliable(m));
    expect(exemptes).toEqual(["vitrine"]);
  });

  it("les modules gardés en base sont exactement ceux que l'application connaît", () => {
    expect(DECLARATIONS.map((d) => d.module).sort()).toEqual(
      [...MODULES_PUBLIABLES].sort(),
    );
  });

  it.each(MODULES_PUBLIABLES)("%s : table, colonne et valeurs concordent", (nom) => {
    const declaration = DECLARATIONS.find((d) => d.module === nom);
    expect(declaration).toBeDefined();
    const attendu = RESSOURCE_MODULE[nom];
    expect(declaration!.table).toBe(attendu.table);
    expect(declaration!.colonne).toBe(attendu.colonnePublication);
    expect(declaration!.valeurs).toEqual([...attendu.valeursPubliees]);
  });

  it("le parrainage est le seul module dont la publication est un booléen", () => {
    // Épinglé parce que cette singularité change la REQUÊTE de comptage :
    // PostgREST ne filtre pas un booléen comme un texte, et se tromper rend un
    // compte vide au lieu d'une erreur — donc un quota qui ne borne rien.
    const booleens = MODULES_PUBLIABLES.filter(publicationBooleenne);
    expect(booleens).toEqual(["referral"]);
  });
});
