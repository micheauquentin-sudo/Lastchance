import { describe, expect, it } from "vitest";
import {
  comptesGroupes,
  comptesParParent,
  type RequeteComptee,
  type RequeteGroupee,
} from "@/components/dashboard/module-list-counts";

/**
 * AUCUNE REQUÊTE ENFANT NE PART SANS BORNE DE PAGE.
 *
 * Les quatre listes de modules bornaient leur requête PARENTE (`range`) et
 * laissaient les requêtes ENFANTS balayer toute l'organisation : la borne
 * n'existait que dans la boucle d'agrégation, côté JavaScript, après le
 * transfert. Ces tests tiennent le contraire — le `in` et le `eq` sont posés
 * par le module, avec les identifiants de la page COUPÉE, et jamais avec la
 * ligne excédentaire que `couperPage` retire.
 *
 * Faux builder PostgREST : il enregistre les appels et se rend lui-même, comme
 * le vrai. Même sémantique que `app/dashboard/participations/filters.test.ts`.
 */

const PAGE = Array.from({ length: 20 }, (_, i) => `quiz-${i + 1}`);
/** Le 21ᵉ parent de l'organisation : il ne doit JAMAIS être interrogé. */
const HORS_PAGE = "quiz-21";

function fauxGroupee(lignes: Array<Record<string, unknown>>) {
  const appels: string[] = [];
  const requete = (): RequeteGroupee => ({
    in(colonne, valeurs) {
      appels.push(`in:${colonne}:${valeurs.join("|")}`);
      return Promise.resolve({ data: lignes });
    },
  });
  return { requete, appels };
}

function fauxComptee(parId: Record<string, number>) {
  const appels: string[] = [];
  const requete = (): RequeteComptee => ({
    eq(colonne, valeur) {
      appels.push(`eq:${colonne}:${valeur}`);
      return Promise.resolve({ count: parId[valeur] ?? null });
    },
  });
  return { requete, appels };
}

describe("comptesGroupes — une requête, bornée à la page", () => {
  it("borne le `in` sur les vingt identifiants affichés", async () => {
    const { requete, appels } = fauxGroupee([
      { quiz_id: "quiz-1" },
      { quiz_id: "quiz-1" },
      { quiz_id: "quiz-3" },
    ]);

    const comptes = await comptesGroupes(PAGE, "quiz_id", requete);

    expect(appels).toEqual([`in:quiz_id:${PAGE.join("|")}`]);
    expect(appels[0]).not.toContain(HORS_PAGE);
    expect(comptes.get("quiz-1")).toBe(2);
    expect(comptes.get("quiz-3")).toBe(1);
    // Un parent sans enfant n'a pas d'entrée : l'écran affiche `?? 0`.
    expect(comptes.get("quiz-2")).toBeUndefined();
  });

  it("n'émet AUCUNE requête sur une page vide", async () => {
    const { requete, appels } = fauxGroupee([]);
    const comptes = await comptesGroupes([], "quiz_id", requete);
    expect(appels).toEqual([]);
    expect(comptes.size).toBe(0);
  });
});

describe("comptesParParent — un compte par parent, zéro ligne transférée", () => {
  it("interroge exactement les parents de la page", async () => {
    const { requete, appels } = fauxComptee({ "quiz-1": 20000, "quiz-2": 3 });

    const comptes = await comptesParParent(PAGE, "quiz_id", requete);

    expect(appels).toHaveLength(20);
    expect(appels).toContain("eq:quiz_id:quiz-1");
    expect(appels).not.toContain(`eq:quiz_id:${HORS_PAGE}`);
    expect(comptes.get("quiz-1")).toBe(20000);
    expect(comptes.get("quiz-2")).toBe(3);
  });

  it("rend 0 pour un compte indisponible, et rien du tout sans page", async () => {
    const { requete, appels } = fauxComptee({});
    expect((await comptesParParent(["quiz-1"], "quiz_id", requete)).get("quiz-1")).toBe(0);

    const vide = await comptesParParent([], "quiz_id", requete);
    expect(vide.size).toBe(0);
    expect(appels).toHaveLength(1);
  });
});
