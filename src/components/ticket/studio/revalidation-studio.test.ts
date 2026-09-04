import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION DE L'ATELIER A SON JUMEAU DE STUDIO (VIT-45).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ QUATRE FOIS ──
 *
 * Le studio du Ticket d'Or vit à `/studio/ticket-or`, HORS de `/dashboard`.
 * Aucun `revalidatePath("/dashboard/ticket-or")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran afficher
 * la version d'avant — et sur un studio, où l'on règle en regardant, c'est
 * exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, puis VIT-41,
 * puis VIT-42, mot pour mot. Il a coûté un lot à trouver, parce que rien ne
 * casse — l'action répond « enregistré », et elle dit vrai.
 *
 * ── POURQUOI ELLE COMPTE PAR FONCTION, ET NON PAR CHEMIN ──
 *
 * Les studios à identifiant ont des chemins TOUS DIFFÉRENTS (`/studio/chasse/${id}`)
 * : y vérifier qu'un jumeau existe dans le fichier suffit. Ici les quatre
 * revalidations sont la MÊME chaîne littérale. « `/studio/ticket-or` figure dans
 * le fichier » serait donc vrai dès la première action jumelée, et resterait vrai
 * en oubliant les trois autres — une garde vacante, verte, qui n'aurait rien
 * regardé.
 *
 * Elle découpe donc le fichier PAR FONCTION EXPORTÉE et exige, dans chaque bloc
 * qui revalide l'atelier, la revalidation du studio. Une action ajoutée demain
 * entre dans la garde toute seule ; c'est la seule protection qui tienne contre
 * l'oubli.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans la
 * fonction, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins la
 * mesure exacte du défaut — un oubli d'appel, pas un appel mal placé.
 */

const ACTION = join(__dirname, "..", "..", "..", "actions", "ticket-or.ts");

const ATELIER = 'revalidatePath("/dashboard/ticket-or")';
const STUDIO = 'revalidatePath("/studio/ticket-or")';

/** Le fichier découpé par fonction exportée : `[nom, corps]`. */
function fonctions(): Array<[string, string]> {
  const source = readFileSync(ACTION, "utf8");
  const morceaux = source.split(/export async function (\w+)/);
  const sortie: Array<[string, string]> = [];
  // `split` avec un groupe capturant rend [avant, nom1, corps1, nom2, corps2…].
  for (let i = 1; i < morceaux.length; i += 2) {
    sortie.push([morceaux[i], morceaux[i + 1]]);
  }
  return sortie;
}

describe("le studio du Ticket d'Or est revalidé partout où l'atelier l'est", () => {
  const blocs = fonctions();

  it("l'action revalide bien le chemin d'atelier — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle ci-dessous
    // vide : elle passerait au vert sans avoir rien regardé.
    const revalidantes = blocs.filter(([, corps]) => corps.includes(ATELIER));
    expect(revalidantes.length).toBeGreaterThanOrEqual(4);
  });

  it("chaque fonction qui revalide /dashboard/ticket-or revalide /studio/ticket-or", () => {
    const manquants: string[] = [];

    for (const [nom, corps] of blocs) {
      const atelier = corps.split(ATELIER).length - 1;
      if (atelier === 0) continue;
      const studio = corps.split(STUDIO).length - 1;
      // Le COMPTE, et pas la présence : une fonction qui revalide deux fois
      // l'atelier sur deux chemins de code doit jumeler les deux.
      if (studio < atelier) {
        manquants.push(`${nom} : ${atelier} atelier, ${studio} studio`);
      }
    }

    // Le message NOMME la fonction : un compte seul ne dirait pas laquelle,
    // et le fichier en porte plusieurs identiques.
    expect(manquants).toEqual([]);
  });
});
