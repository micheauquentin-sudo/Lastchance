import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODULE_PAGE_SIZE,
  couperPage,
  litFiltresModule,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import { PLAFOND_PAGE, parsePageParam } from "@/lib/pagination";

/**
 * UN NUMÉRO DE PAGE EST BORNÉ DES DEUX CÔTÉS.
 *
 * Les cinq écrans qui lisent `?page=` appliquaient un `Math.max(1, …)` et rien
 * de plus : `?page=1000000` demandait à PostgREST un `range` à vingt millions
 * de lignes — une requête que personne n'a voulue, déclenchée par une URL
 * tapée à la main ou un robot. Au-dessus du plafond, la page est ramenée
 * silencieusement, comme le sont déjà un statut inconnu ou une date illisible.
 *
 * `litFiltresModule` n'avait aucun test unitaire : c'est pourtant lui qui
 * calcule les bornes des sept listes de modules.
 */

const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
];

describe("parsePageParam — la même borne pour les cinq écrans", () => {
  it("replie une page absurde sur le plafond, sans erreur", () => {
    expect(parsePageParam("1000000")).toBe(PLAFOND_PAGE);
    expect(parsePageParam(String(PLAFOND_PAGE + 1))).toBe(PLAFOND_PAGE);
    expect(parsePageParam(String(PLAFOND_PAGE))).toBe(PLAFOND_PAGE);
  });

  it("garde la borne basse et les entrées illisibles à 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("3")).toBe(3);
  });
});

describe("litFiltresModule — les bornes du `range`", () => {
  it("ne demande jamais un `range` au-delà du plafond", () => {
    const filtres = litFiltresModule({ page: "1000000" }, STATUTS);
    expect(filtres.page).toBe(PLAFOND_PAGE);
    expect(filtres.from).toBe((PLAFOND_PAGE - 1) * MODULE_PAGE_SIZE);
    expect(filtres.to).toBe(filtres.from + MODULE_PAGE_SIZE);
  });

  it("demande une ligne de plus que la page, pour savoir s'il y a une suite", () => {
    const filtres = litFiltresModule({ page: "2" }, STATUTS);
    expect(filtres.from).toBe(MODULE_PAGE_SIZE);
    expect(filtres.to - filtres.from).toBe(MODULE_PAGE_SIZE);
  });

  it("ignore un statut hors de la table, et retient les autres filtres", () => {
    expect(litFiltresModule({ statut: "finished" }, STATUTS).statut).toBe("");
    expect(litFiltresModule({ statut: "draft" }, STATUTS).statut).toBe("draft");
    expect(litFiltresModule({ q: "  Roue  " }, STATUTS).q).toBe("Roue");
    expect(litFiltresModule({ q: "Roue" }, STATUTS).actif).toBe(true);
    expect(litFiltresModule({}, STATUTS).actif).toBe(false);
  });
});

/**
 * LE RECENSEMENT DES SITES, TENU PAR LA SUITE ET NON PAR UN BRIEF.
 *
 * Le constat CNT-1 en désignait cinq. Il y en avait SIX : le classement d'un
 * championnat (`pronostics/[id]`) lisait son `?page=` avec un plancher seul et
 * le passait en `p_offset` à `contest_leaderboard`. Un recensement écrit à la
 * main dans un document ne peut pas rester vrai ; celui-ci relit l'arbre.
 *
 * Les deux assertions se complètent : la première nomme les sites connus (un
 * écran neuf qui lit une page doit s'y déclarer), la seconde interdit le
 * clamp fait maison — c'est elle qui aurait rougi sur le sixième site.
 */
const RACINES = ["src/app/dashboard", "src/components/dashboard"];

function fichiersSources(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersSources(chemin));
    else if (/\.tsx?$/.test(entree.name) && !/\.test\.tsx?$/.test(entree.name)) {
      trouves.push(chemin.replace(/\\/g, "/"));
    }
  }
  return trouves;
}

const SOURCES = RACINES.flatMap(fichiersSources).map((chemin) => ({
  chemin,
  contenu: readFileSync(chemin, "utf8"),
}));

describe("le numéro de page se lit au même endroit, partout", () => {
  it("recense SIX sites, pas cinq", () => {
    const sites = SOURCES.filter((f) => f.contenu.includes("parsePageParam("))
      .map((f) => f.chemin)
      .sort();

    expect(sites).toEqual([
      "src/app/dashboard/campaigns/page.tsx",
      "src/app/dashboard/customers/page.tsx",
      "src/app/dashboard/participations/page.tsx",
      "src/app/dashboard/pronostics/[id]/page.tsx",
      "src/app/dashboard/qr-codes/page.tsx",
      "src/components/dashboard/module-list-filters.tsx",
    ]);
  });

  it("aucun écran ne borne un numéro de page pour son compte", () => {
    // Les deux formes trouvées dans l'arbre avant ce wagon : le
    // `Math.max(1, parseInt(…))` des cinq sites recensés, et le
    // `Number.isFinite(…) && rawPage >= 1` du classement pronostics.
    const clampsMaison = SOURCES.filter(
      (f) =>
        /Math\.max\(\s*1\s*,[^\n]*[Pp]age/.test(f.contenu) ||
        /[Pp]age\s*>=\s*1/.test(f.contenu),
    ).map((f) => f.chemin);

    expect(clampsMaison).toEqual([]);
  });
});

describe("couperPage — la ligne excédentaire, à deux tailles de page", () => {
  it("coupe sur la taille de module par défaut", () => {
    const lignes = Array.from({ length: MODULE_PAGE_SIZE + 1 }, (_, i) => i);
    const { lignes: page, hasNext } = couperPage(lignes);
    expect(hasNext).toBe(true);
    expect(page).toHaveLength(MODULE_PAGE_SIZE);
  });

  it("accepte une taille propre à l'écran (participations : 50)", () => {
    const { lignes, hasNext } = couperPage(
      Array.from({ length: 51 }, (_, i) => i),
      50,
    );
    expect(hasNext).toBe(true);
    expect(lignes).toHaveLength(50);

    const court = couperPage(Array.from({ length: 50 }, (_, i) => i), 50);
    expect(court.hasNext).toBe(false);
    expect(court.lignes).toHaveLength(50);
  });
});
