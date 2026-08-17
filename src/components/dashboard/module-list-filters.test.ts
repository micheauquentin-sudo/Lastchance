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
