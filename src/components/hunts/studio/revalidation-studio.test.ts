import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION DE L'ATELIER A SON JUMEAU DE STUDIO (VIT-40).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ DEUX FOIS ──
 *
 * Le studio de la chasse vit à `/studio/chasse/[id]`, HORS de `/dashboard`.
 * Aucun `revalidatePath("/dashboard/hunts/…")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran
 * afficher la version d'avant — et sur un studio, où l'on enregistre en
 * regardant, c'est exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, mot pour mot
 * (`revalidatePath("/dashboard", "layout")` n'atteignait pas
 * `/vitrine-studio`, et un lien Instagram enregistré n'apparaissait jamais),
 * repayé en VIT-39. Il coûte un lot à trouver, parce que rien ne casse —
 * l'action répond « enregistré », et elle dit vrai.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans le
 * fichier, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins
 * la mesure exacte du défaut — un oubli d'appel, pas un appel mal placé — et
 * la seule forme qui survit à l'ajout d'une action de plus demain.
 *
 * Elle se DÉRIVE : rien n'est énuméré ici, la liste des revalidations est lue
 * dans l'action. Une action ajoutée entre dans la garde toute seule, ce qui est
 * la seule protection qui tienne contre l'oubli.
 */

const ACTION = join(__dirname, "..", "..", "..", "actions", "hunts.ts");

/** Les expressions revalidées par l'action, telles qu'écrites. */
function cheminsRevalides(): string[] {
  const source = readFileSync(ACTION, "utf8");
  return [...source.matchAll(/revalidatePath\(\s*`([^`]+)`/g)].map((m) => m[1]);
}

describe("le studio de la chasse est revalidé partout où l'atelier l'est", () => {
  const chemins = cheminsRevalides();

  it("l'action revalide bien des chemins d'atelier — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle
    // ci-dessous vide : elle passerait au vert sans avoir rien regardé.
    const atelier = chemins.filter((c) => c.startsWith("/dashboard/hunts/"));
    expect(atelier.length).toBeGreaterThanOrEqual(6);
  });

  it("chaque `/dashboard/hunts/${…}` a son `/studio/chasse/${…}`", () => {
    const manquants: string[] = [];

    for (const chemin of chemins) {
      const suffixe = chemin.replace(/^\/dashboard\/hunts\//, "");
      if (suffixe === chemin) continue; // pas un chemin d'atelier détaillé
      const jumeau = `/studio/chasse/${suffixe}`;
      if (!chemins.includes(jumeau)) manquants.push(`${chemin} → ${jumeau}`);
    }

    // Le message nomme le chemin ET son jumeau attendu : un compte seul ne
    // dirait pas lequel manque, et l'action en porte plusieurs identiques.
    expect(manquants).toEqual([]);
  });
});
