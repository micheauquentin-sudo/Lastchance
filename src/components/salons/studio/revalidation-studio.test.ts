import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION D'ATELIER A SON JUMEAU DE STUDIO (VIT-48).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ CINQ FOIS ──
 *
 * Le studio des salons vit à `/studio/salon/[jeu]`, HORS de `/dashboard`. Aucun
 * `revalidatePath("/dashboard/salons/…")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran
 * afficher la version d'avant — et sur un studio, où l'on règle en regardant,
 * c'est exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, VIT-41,
 * VIT-42, VIT-45, mot pour mot. Il a coûté un lot à trouver, parce que rien ne
 * casse — l'action répond « enregistré », et elle dit vrai.
 *
 * ── POURQUOI ELLE COMPTE PAR FONCTION, ET NON PAR CHEMIN ──
 *
 * Les studios à identifiant ont des chemins TOUS DIFFÉRENTS (`/studio/chasse/${id}`)
 * : y vérifier qu'un jumeau existe dans le fichier suffit. Ici les chemins sont
 * des chaînes LITTÉRALES, répétées. « `/studio/salon/duo` figure dans le
 * fichier » serait donc vrai dès la première action jumelée, et resterait vrai
 * en oubliant les suivantes — une garde vacante, verte, qui n'aurait rien
 * regardé.
 *
 * ── ET POURQUOI ELLE DÉCOUPE SUR `function`, ET NON `export async function` ──
 *
 * C'est l'écart de ce module avec le Ticket d'Or, et il aurait rendu la garde
 * VACANTE sur le Duo. `duo.ts` ne revalide pas dans ses actions exportées : il
 * appelle `revalideEcransDuo()`, un helper NON exporté, depuis trois endroits.
 * Découper sur `export async function` aurait donc compté zéro revalidation
 * d'atelier dans `setDuoOptions` et `setDuoSuggestion`, zéro dans le helper —
 * qui n'aurait été le corps d'aucun bloc — et la garde serait passée au vert
 * sur un fichier entièrement dépourvu de jumeaux.
 *
 * Le découpage se fait donc sur TOUTE déclaration de fonction. Le helper est un
 * bloc comme un autre, et c'est le bon grain : c'est là que l'appel vit, donc
 * là que son oubli se produirait.
 *
 * ── LE CAS PARTICULIER DE L'HABILLAGE, ET IL EST LE PLUS IMPORTANT ──
 *
 * `setHabillageSalons` écrit UNE ligne par organisation : le réglage est COMMUN
 * aux deux jeux. Il revalide donc les deux ateliers par une boucle sur
 * `LOBBY_KINDS`, et il doit revalider les DEUX studios de la même manière. Ne
 * jumeler que le jeu d'où part le geste laisserait le studio de l'autre afficher
 * l'ancien décor — c'est-à-dire produirait exactement le malentendu que tout cet
 * écran travaille à empêcher : croire à deux réglages distincts.
 *
 * La garde le mesure sur la forme RÉELLE de l'appel, gabarit compris, et non sur
 * un chemin résolu : c'est la boucle qui est la promesse.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans la
 * fonction, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins
 * la mesure exacte du défaut — un oubli d'appel, pas un appel mal placé.
 *
 * Elle ne compte QUE des appels : les motifs portent `revalidatePath(`, si bien
 * qu'un chemin cité dans un commentaire — et ce fichier-ci en cite — ne peut pas
 * gonfler le compte du jumeau et rendre la garde complaisante.
 */

const DOSSIER_ACTIONS = join(__dirname, "..", "..", "..", "actions");

/**
 * Les trois fichiers, avec la FORME EXACTE de leurs deux appels. Rien n'est
 * énuméré au-delà : les fonctions, elles, sont lues dans le fichier, et une
 * action ajoutée demain entre dans la garde toute seule.
 */
const SURVEILLES = [
  {
    fichier: "duo.ts",
    atelier: 'revalidatePath("/dashboard/salons/duo")',
    studio: 'revalidatePath("/studio/salon/duo")',
    /** `revalideEcransDuo`, appelé par `setDuoOptions` et `setDuoSuggestion`. */
    blocsAttendus: 1,
  },
  {
    fichier: "bande.ts",
    atelier: 'revalidatePath("/dashboard/salons/bande")',
    studio: 'revalidatePath("/studio/salon/bande")',
    /** `setBandePack`. */
    blocsAttendus: 1,
  },
  {
    fichier: "salon-habillage.ts",
    // LA BOUCLE, telle qu'écrite : c'est elle qui porte « les deux jeux ».
    atelier: "revalidatePath(`/dashboard/salons/${cle}`)",
    studio: "revalidatePath(`/studio/salon/${cle}`)",
    /** `setHabillageSalons`. */
    blocsAttendus: 1,
  },
] as const;

/**
 * Le fichier découpé par fonction : `[nom, corps]`.
 *
 * `function (\w+)` et non `export async function (\w+)` — voir l'en-tête : le
 * Duo revalide depuis un helper non exporté, et le manquer viderait la garde.
 */
function fonctions(fichier: string): Array<[string, string]> {
  const source = readFileSync(join(DOSSIER_ACTIONS, fichier), "utf8");
  const morceaux = source.split(/function (\w+)/);
  const sortie: Array<[string, string]> = [];
  // `split` avec un groupe capturant rend [avant, nom1, corps1, nom2, corps2…].
  for (let i = 1; i < morceaux.length; i += 2) {
    sortie.push([morceaux[i], morceaux[i + 1]]);
  }
  return sortie;
}

describe.each(SURVEILLES)(
  "le studio des salons est revalidé partout où l'atelier l'est — $fichier",
  ({ fichier, atelier, studio, blocsAttendus }) => {
    const blocs = fonctions(fichier);

    it("l'action revalide bien le chemin d'atelier — sinon la garde est vacante", () => {
      // Sans cette assertion, un renommage du chemin (ou un découpage qui
      // manquerait le helper du Duo) rendrait la boucle ci-dessous vide : elle
      // passerait au vert sans avoir rien regardé.
      const revalidantes = blocs.filter(([, corps]) => corps.includes(atelier));
      expect(revalidantes.length).toBeGreaterThanOrEqual(blocsAttendus);
    });

    it("chaque fonction qui revalide l'atelier revalide le studio", () => {
      const manquants: string[] = [];

      for (const [nom, corps] of blocs) {
        const compteAtelier = corps.split(atelier).length - 1;
        if (compteAtelier === 0) continue;
        const compteStudio = corps.split(studio).length - 1;
        // Le COMPTE, et pas la présence : une fonction qui revalide deux fois
        // l'atelier sur deux chemins de code doit jumeler les deux.
        if (compteStudio < compteAtelier) {
          manquants.push(
            `${nom} : ${compteAtelier} atelier, ${compteStudio} studio`,
          );
        }
      }

      // Le message NOMME la fonction : un compte seul ne dirait pas laquelle.
      expect(manquants).toEqual([]);
    });
  },
);

/**
 * L'HABILLAGE JUMELLE SA BOUCLE, ET NON UN SEUL JEU.
 *
 * Assertion séparée, parce que le comptage ci-dessus serait satisfait par un
 * `revalidatePath("/studio/salon/duo")` posé en dur à côté de la boucle : un
 * jumeau existerait, le compte tiendrait, et le studio de la Bande resterait
 * périmé après un changement de décor. Ce qu'il faut prouver n'est pas qu'un
 * appel existe, c'est qu'il porte sur LES DEUX JEUX.
 */
describe("l'habillage, commun aux deux jeux, revalide les DEUX studios", () => {
  const source = readFileSync(
    join(DOSSIER_ACTIONS, "salon-habillage.ts"),
    "utf8",
  );

  it("le jumeau du studio est bien une boucle sur `LOBBY_KINDS`", () => {
    expect(source).toContain(
      "for (const cle of LOBBY_KINDS) revalidatePath(`/studio/salon/${cle}`)",
    );
  });

  it("aucun studio n'est revalidé en dur pour un seul jeu", () => {
    // Un chemin figé ici serait le signe qu'on a jumelé le jeu d'où part le
    // geste, et lui seul — la panne exacte que la boucle existe pour éviter.
    expect(source).not.toContain('revalidatePath("/studio/salon/duo")');
    expect(source).not.toContain('revalidatePath("/studio/salon/bande")');
  });
});
