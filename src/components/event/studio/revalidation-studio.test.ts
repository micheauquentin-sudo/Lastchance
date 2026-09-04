import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION DE L'ATELIER A SON JUMEAU DE STUDIO (VIT-47).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ CINQ FOIS ──
 *
 * Le studio de la soirée vit à `/studio/soiree/[id]`, HORS de `/dashboard`.
 * Aucun `revalidatePath("/dashboard/events/…")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran afficher
 * la version d'avant — et sur un studio, où l'on règle en regardant, c'est
 * exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, VIT-41,
 * VIT-42 et VIT-45, mot pour mot. Il a coûté un lot à trouver, parce que rien ne
 * casse — l'action répond « enregistré », et elle dit vrai.
 *
 * ── POURQUOI ELLE COMPTE PAR FONCTION, ET NON PAR CHEMIN ──
 *
 * La forme « ce chemin figure-t-il ailleurs dans le fichier ? » suffit quand
 * chaque revalidation vise un identifiant différent. Ici elle ne suffit PAS :
 * `createEventQuestion`, `genererQuestionsEvenement`, `updateEventQuestion` et
 * `deleteEventQuestion` revalident toutes `/dashboard/events/${…game_id}` avec
 * des EXPRESSIONS différentes mais des chemins de même forme, et deux fonctions
 * partagent même l'expression exacte `parsed.data.game_id`. Une garde
 * d'appartenance serait donc vraie dès le premier jumelage et resterait vraie en
 * oubliant les sept autres — verte, et aveugle.
 *
 * Elle découpe donc le fichier PAR FONCTION EXPORTÉE et exige, dans chaque bloc
 * qui revalide un chemin d'atelier DÉTAILLÉ, au moins autant de revalidations de
 * studio. Une action ajoutée demain entre dans la garde toute seule ; c'est la
 * seule protection qui tienne contre l'oubli.
 *
 * ── CE QU'ELLE NE COMPTE PAS ──
 *
 * `revalidatePath("/dashboard/events")` — la LISTE — n'a pas de jumeau : il
 * n'existe pas de page `/studio/soiree` sans identifiant. Le filtre ne retient
 * donc que les chemins qui portent un `${…}`.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau EXISTE dans la
 * fonction, jamais qu'il s'exécute sur le même chemin de code. C'est néanmoins la
 * mesure exacte du défaut — un oubli d'appel, pas un appel mal placé.
 */

const ACTION = join(__dirname, "..", "..", "..", "actions", "events.ts");

/** Une revalidation d'atelier DÉTAILLÉE (avec identifiant), telle qu'écrite. */
const ATELIER = /revalidatePath\(`\/dashboard\/events\/\$\{[^}]+\}`\)/g;
const STUDIO = /revalidatePath\(`\/studio\/soiree\/\$\{[^}]+\}`\)/g;

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

function compter(corps: string, motif: RegExp): number {
  return (corps.match(new RegExp(motif.source, "g")) ?? []).length;
}

describe("le studio de la soirée est revalidé partout où l'atelier l'est", () => {
  const blocs = fonctions();

  it("l'action revalide bien des chemins d'atelier — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle ci-dessous
    // vide : elle passerait au vert sans avoir rien regardé.
    const revalidantes = blocs.filter(([, corps]) => compter(corps, ATELIER) > 0);
    expect(revalidantes.length).toBeGreaterThanOrEqual(8);
  });

  it("chaque fonction qui revalide /dashboard/events/${…} revalide /studio/soiree/${…}", () => {
    const manquants: string[] = [];

    for (const [nom, corps] of blocs) {
      const atelier = compter(corps, ATELIER);
      if (atelier === 0) continue;
      const studio = compter(corps, STUDIO);
      // Le COMPTE, et pas la présence : une fonction qui revalide deux fois
      // l'atelier sur deux chemins de code doit jumeler les deux.
      if (studio < atelier) {
        manquants.push(`${nom} : ${atelier} atelier, ${studio} studio`);
      }
    }

    // Le message NOMME la fonction : un compte seul ne dirait pas laquelle, et
    // le fichier en porte plusieurs identiques.
    expect(manquants).toEqual([]);
  });
});
