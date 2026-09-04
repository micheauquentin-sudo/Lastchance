import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION D'ÉCRAN DE CONFIGURATION A SON JUMEAU DE STUDIO (VIT-50).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ SIX FOIS ──
 *
 * Le studio de la méta-progression vit à `/studio/progression`, HORS de
 * `/dashboard`. Aucun `revalidatePath("/dashboard/progression")` ne l'atteint :
 * Next revalide un CHEMIN, pas une ressource. Une mutation qui réussit laisse
 * donc l'écran afficher la version d'avant — et sur un studio, où l'on règle en
 * regardant, c'est exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, VIT-41,
 * VIT-42, VIT-45, VIT-48, mot pour mot. Rien ne casse — l'action répond
 * « enregistré », et elle dit vrai.
 *
 * ── POURQUOI ELLE COMPTE PAR FONCTION, ET NON PAR CHEMIN ──
 *
 * Les studios à identifiant ont des chemins TOUS DIFFÉRENTS
 * (`/studio/chasse/${id}`) : y vérifier qu'un jumeau existe dans le fichier
 * suffit. Ici le chemin est une chaîne LITTÉRALE. « `/studio/progression` figure
 * dans le fichier » serait donc vrai dès la première fonction jumelée, et
 * resterait vrai en oubliant toutes les suivantes — une garde vacante, verte,
 * qui n'aurait rien regardé (ADR-161).
 *
 * ── ET POURQUOI ELLE DÉCOUPE SUR `function`, ET NON `export async function` ──
 *
 * C'est le cas du Duo (VIT-48), et il est ici encore plus marqué : les ~20
 * mutations de ce fichier ne revalident PAS chez elles. Elles appellent
 * `revalidateProgression()`, un helper NON exporté — directement, ou par
 * `runProgressionEditorRpc`, qui ne l'est pas davantage. Découper sur
 * `export async function` aurait compté ZÉRO revalidation partout, et la garde
 * serait passée au vert sur un fichier entièrement dépourvu de jumeaux.
 *
 * Le découpage se fait donc sur TOUTE déclaration de fonction. Le helper est un
 * bloc comme un autre, et c'est le bon grain : c'est là que l'appel vit, donc là
 * que son oubli se produirait — le jour où une mutation revalidera en propre au
 * lieu de passer par le helper.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans la
 * fonction, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins
 * la mesure exacte du défaut — un oubli d'appel, pas un appel mal placé.
 *
 * Elle ne compte QUE des appels : les motifs portent `revalidatePath(`, si bien
 * qu'un chemin cité dans un commentaire — et l'action en cite — ne peut pas
 * gonfler le compte du jumeau et rendre la garde complaisante.
 */

const ACTION = join(__dirname, "..", "..", "..", "actions", "meta-progression.ts");

const ATELIER = 'revalidatePath("/dashboard/progression")';
const STUDIO = 'revalidatePath("/studio/progression")';

/**
 * Le fichier découpé par fonction : `[nom, corps]`.
 *
 * `function (\w+)` et non `export async function (\w+)` — voir l'en-tête.
 */
function fonctions(): Array<[string, string]> {
  const source = readFileSync(ACTION, "utf8");
  const morceaux = source.split(/function (\w+)/);
  const sortie: Array<[string, string]> = [];
  // `split` avec un groupe capturant rend [avant, nom1, corps1, nom2, corps2…].
  for (let i = 1; i < morceaux.length; i += 2) {
    sortie.push([morceaux[i], morceaux[i + 1]]);
  }
  return sortie;
}

describe("le studio de la progression est revalidé partout où le tableau de bord l'est", () => {
  const blocs = fonctions();

  it("l'action revalide bien le chemin du tableau de bord — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin (ou un découpage qui
    // manquerait le helper) rendrait la boucle ci-dessous vide : elle passerait
    // au vert sans avoir rien regardé.
    const revalidantes = blocs.filter(([, corps]) => corps.includes(ATELIER));
    expect(revalidantes.length).toBeGreaterThanOrEqual(1);
  });

  it("chaque fonction qui revalide le tableau de bord revalide le studio", () => {
    const manquants: string[] = [];

    for (const [nom, corps] of blocs) {
      const compteAtelier = corps.split(ATELIER).length - 1;
      if (compteAtelier === 0) continue;
      const compteStudio = corps.split(STUDIO).length - 1;
      // Le COMPTE, et pas la présence : une fonction qui revalide deux fois le
      // tableau de bord sur deux chemins de code doit jumeler les deux.
      if (compteStudio < compteAtelier) {
        manquants.push(
          `${nom} : ${compteAtelier} tableau de bord, ${compteStudio} studio`,
        );
      }
    }

    // Le message NOMME la fonction : un compte seul ne dirait pas laquelle.
    expect(manquants).toEqual([]);
  });
});
