import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION D'ÉCRAN A SON JUMEAU DE STUDIO (VIT-49).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ SEPT FOIS ──
 *
 * Le studio de réservation vit à `/studio/reservation/[activityId]`, HORS de
 * `/dashboard`. Aucun `revalidatePath("/dashboard/reservations/…")` ne
 * l'atteint : Next revalide un CHEMIN, pas une ressource. Une action qui
 * réussit laisse donc l'écran afficher la version d'avant — et sur un studio,
 * où l'on règle en regardant, c'est exactement l'endroit où le commerçant vient
 * vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, VIT-41,
 * VIT-42, VIT-44, VIT-45 et VIT-48, mot pour mot. Il a coûté un lot à trouver
 * la première fois, parce que rien ne casse — l'action répond « enregistré », et
 * elle dit vrai.
 *
 * ── POURQUOI ELLE COMPTE PAR FONCTION (ADR-161) ──
 *
 * Une garde écrite en `chemins.includes(jumeau)` passe au VERT quand on
 * supprime un jumeau, dès lors qu'un AUTRE endroit du fichier écrit le même
 * chemin. Ici l'expression est LITTÉRALEMENT la même partout (`${activityId}`),
 * si bien qu'un seul appel jumelé couvrirait tous les autres. Le comptage par
 * fonction ferme cela : autant de `/studio/reservation/${…}` que de
 * `/dashboard/reservations/${…}`, dans CHAQUE fonction.
 *
 * ── ET POURQUOI ELLE DÉCOUPE SUR `function`, ET NON `export async function` ──
 *
 * C'est le cas du Duo des salons, en plus marqué encore. `reserver.ts` ne
 * revalide pas l'écran d'activité depuis ses actions exportées : les DIX
 * actions de réglage du module — les plages, les fermetures, les réglages de
 * rendez-vous, la génération, les quatre gestes de la salle et la durée de
 * service — appellent toutes `revaliderActivite()`, un helper NON exporté.
 *
 * Découper sur `export async function` aurait donc compté zéro revalidation
 * d'écran dans les dix, zéro dans le helper — qui n'aurait été le corps
 * d'aucun bloc — et la garde serait passée au vert sur un fichier entièrement
 * dépourvu de jumeaux. Le découpage se fait sur TOUTE déclaration de fonction :
 * le helper est un bloc comme un autre, et c'est le bon grain, parce que c'est
 * là que l'appel vit, donc là que son oubli se produirait.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans la
 * fonction, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins
 * la mesure exacte du défaut — un oubli d'appel, pas un appel mal placé.
 *
 * Elle ne compte QUE des appels : les motifs portent `revalidatePath(`, si bien
 * qu'un chemin cité dans un commentaire — et le helper en cite un — ne peut pas
 * gonfler le compte du jumeau et rendre la garde complaisante.
 *
 * ── CE QU'ELLE NE COUVRE PAS, SCIEMMENT ──
 *
 * Les DIX-SEPT autres actions du fichier revalident la chaîne LITTÉRALE
 * `"/dashboard/reservations"` — la LISTE, pas l'écran d'une activité. Elles ne
 * sont pas jumelées, et ce n'est pas un oubli : la plupart sont des gestes
 * d'EXPLOITATION (appeler le suivant dans la file, annuler la réservation d'un
 * client, retirer quelqu'un d'une liste d'attente) qui n'ont pas d'activité
 * sous la main, et dont le studio ne montre rien. Les jumeler aurait exigé de
 * résoudre un identifiant d'activité là où il n'en existe pas, pour revalider
 * un écran qui n'affiche pas la donnée changée.
 *
 * La garde le VÉRIFIE plutôt que de l'affirmer, en fin de fichier : aucune de
 * ces fonctions ne doit se mettre à toucher l'écran d'activité sans passer par
 * le helper — c'est par là que le prochain oubli entrerait.
 */

const DOSSIER_ACTIONS = join(__dirname, "..", "..", "..", "actions");
const FICHIER = "reserver.ts";

/** La forme EXACTE des deux appels, telle qu'écrite dans le helper. */
const ECRAN = "revalidatePath(`/dashboard/reservations/${activityId}`)";
const STUDIO = "revalidatePath(`/studio/reservation/${activityId}`)";

/**
 * Le fichier découpé par fonction : `[nom, corps]`.
 *
 * `function (\w+)` et non `export async function (\w+)` — voir l'en-tête : les
 * dix actions de réglage revalident depuis un helper non exporté, et le manquer
 * viderait la garde.
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

describe("le studio de réservation est revalidé partout où l'écran d'activité l'est", () => {
  const blocs = fonctions(FICHIER);

  it("l'action revalide bien le chemin d'écran — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin (ou un découpage qui
    // manquerait le helper) rendrait la boucle ci-dessous vide : elle passerait
    // au vert sans avoir rien regardé.
    const revalidantes = blocs.filter(([, corps]) => corps.includes(ECRAN));
    expect(revalidantes.length).toBeGreaterThanOrEqual(1);
  });

  it("chaque fonction qui revalide l'écran d'activité revalide le studio", () => {
    const manquants: string[] = [];

    for (const [nom, corps] of blocs) {
      const compteEcran = corps.split(ECRAN).length - 1;
      if (compteEcran === 0) continue;
      const compteStudio = corps.split(STUDIO).length - 1;
      // Le COMPTE, et pas la présence : une fonction qui revalide deux fois
      // l'écran sur deux chemins de code doit jumeler les deux.
      if (compteStudio < compteEcran) {
        manquants.push(
          `${nom} : ${compteEcran} écran, ${compteStudio} studio`,
        );
      }
    }

    // Le message NOMME la fonction : un compte seul ne dirait pas laquelle.
    expect(manquants).toEqual([]);
  });

  /**
   * LE HELPER RESTE LE SEUL PORTEUR, ET C'EST CE QUI REND LA GARDE TENABLE.
   *
   * Tant que `revaliderActivite` est le seul endroit du fichier où l'écran
   * d'activité est revalidé, jumeler UNE ligne suffit et une action ajoutée
   * demain hérite du jumeau sans que personne n'y pense. Le jour où quelqu'un
   * écrira l'appel à la main ailleurs, cette assertion rougit — et c'est le bon
   * moment pour le dire, parce que c'est exactement là que le jumeau se
   * perdrait.
   */
  it("l'écran d'activité n'est revalidé QUE depuis `revaliderActivite`", () => {
    const porteurs = blocs
      .filter(([, corps]) => corps.includes(ECRAN))
      .map(([nom]) => nom);
    expect(porteurs).toEqual(["revaliderActivite"]);
  });

  /**
   * LE STUDIO N'EST PAS REVALIDÉ EN DUR AILLEURS.
   *
   * Un `revalidatePath("/studio/reservation/…")` posé à côté du helper
   * satisferait le comptage ci-dessus tout en laissant croire que le jumelage
   * est fait, alors qu'il ne couvrirait qu'une action sur dix.
   */
  it("aucun jumeau de studio n'est écrit hors du helper", () => {
    const porteurs = blocs
      .filter(([, corps]) => corps.includes(STUDIO))
      .map(([nom]) => nom);
    expect(porteurs).toEqual(["revaliderActivite"]);
  });
});
