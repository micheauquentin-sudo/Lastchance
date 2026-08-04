import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RESSOURCE_MODULE, publicationBooleenne } from "./module-resources";
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

describe("parité RESSOURCE_MODULE ↔ triggers de publication", () => {
  it("les neuf triggers ont été trouvés", () => {
    // Assertion de NON-VACUITÉ, et elle n'est pas décorative : une regex qui
    // ne mord plus rendrait un tableau vide, et le `it.each` ci-dessous ne
    // jouerait AUCUN cas tout en affichant du vert. « 0 rouge » et « rien
    // mesuré » se ressemblent trop pour qu'on s'en remette au hasard.
    expect(DECLARATIONS).toHaveLength(GRANTABLE_MODULES.length);
  });

  it("les modules gardés en base sont exactement ceux que l'application connaît", () => {
    expect(DECLARATIONS.map((d) => d.module).sort()).toEqual(
      [...GRANTABLE_MODULES].sort(),
    );
  });

  it.each(GRANTABLE_MODULES)("%s : table, colonne et valeurs concordent", (nom) => {
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
    const booleens = GRANTABLE_MODULES.filter(publicationBooleenne);
    expect(booleens).toEqual(["referral"]);
  });
});
