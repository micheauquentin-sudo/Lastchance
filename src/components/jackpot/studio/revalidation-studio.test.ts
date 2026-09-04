import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION DE L'ATELIER A SON JUMEAU DE STUDIO (VIT-44).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ QUATRE FOIS ──
 *
 * Le studio de la cagnotte vit à `/studio/cagnotte/[id]`, HORS de `/dashboard`.
 * Aucun `revalidatePath("/dashboard/jackpot/…")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran afficher
 * la version d'avant — et sur un studio, où l'on enregistre en regardant, c'est
 * exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, puis VIT-41,
 * puis VIT-42, mot pour mot. Il a coûté un lot à trouver la première fois, parce
 * que rien ne casse — l'action répond « enregistré », et elle dit vrai.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans le
 * fichier, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins la
 * mesure exacte du défaut — un oubli d'appel, pas un appel mal placé — et la
 * seule forme qui survit à l'ajout d'une action demain.
 *
 * Elle se DÉRIVE : rien n'est énuméré ici, la liste des revalidations est lue
 * dans l'action. Une action ajoutée entre dans la garde toute seule, ce qui est
 * la seule protection qui tienne contre l'oubli.
 */

const ACTION = join(__dirname, "..", "..", "..", "actions", "jackpot.ts");

/** Les expressions revalidées par l'action, telles qu'écrites. */
function cheminsRevalides(): string[] {
  const source = readFileSync(ACTION, "utf8");
  return [...source.matchAll(/revalidatePath\(\s*`([^`]+)`/g)].map((m) => m[1]);
}

describe("le studio de la cagnotte est revalidé partout où l'atelier l'est", () => {
  const chemins = cheminsRevalides();

  it("l'action revalide bien des chemins d'atelier — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle ci-dessous
    // vide : elle passerait au vert sans avoir rien regardé.
    const atelier = chemins.filter((c) => c.startsWith("/dashboard/jackpot/"));
    expect(atelier.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * ON COMPTE LES OCCURRENCES, ON NE TESTE PAS L'APPARTENANCE — et cette
   * nuance a été trouvée en jouant la mutation, pas en relisant le code.
   *
   * Une garde écrite en `chemins.includes(jumeau)` passe au VERT quand on
   * supprime un jumeau, dès lors qu'un AUTRE endroit du fichier écrit le même
   * chemin littéral. C'est précisément le cas ici : les trois revalidations
   * détaillées de la cagnotte s'écrivent toutes `${id}`, donc deux suffisent à
   * couvrir la troisième. La garde aurait alors gardé deux appels sur trois en
   * annonçant qu'elle les gardait tous — et le troisième est celui de
   * l'ouverture, c'est-à-dire le geste après lequel le commerçant revient
   * regarder son écran.
   *
   * Le comptage ferme cela : autant de `/studio/cagnotte/${x}` que de
   * `/dashboard/jackpot/${x}`, pour chaque expression `x`.
   */
  it("chaque `/dashboard/jackpot/${…}` a son `/studio/cagnotte/${…}`", () => {
    const compter = (liste: string[]) => {
      const compte = new Map<string, number>();
      for (const c of liste) compte.set(c, (compte.get(c) ?? 0) + 1);
      return compte;
    };
    const compte = compter(chemins);
    const manquants: string[] = [];

    for (const [chemin, attendus] of compte) {
      const suffixe = chemin.replace(/^\/dashboard\/jackpot\//, "");
      if (suffixe === chemin) continue; // pas un chemin d'atelier détaillé
      const jumeau = `/studio/cagnotte/${suffixe}`;
      const presents = compte.get(jumeau) ?? 0;
      if (presents < attendus) {
        manquants.push(`${chemin} → ${jumeau} (${presents} sur ${attendus})`);
      }
    }

    // Le message nomme le chemin, son jumeau attendu ET le compte : un simple
    // « il en manque un » ne dirait pas lequel, l'action en portant plusieurs
    // identiques.
    expect(manquants).toEqual([]);
  });
});
