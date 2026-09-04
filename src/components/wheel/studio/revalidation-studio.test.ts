import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAQUE REVALIDATION D'ATELIER A SON JUMEAU DE STUDIO (VIT-46).
 *
 * ── LE DÉFAUT QUE CETTE GARDE FERME, ET IL A DÉJÀ ÉTÉ LIVRÉ QUATRE FOIS ──
 *
 * Le studio de la roue vit à `/studio/roue/[id]`, HORS de `/dashboard`. Aucun
 * `revalidatePath("/dashboard/campaigns/…")` ne l'atteint : Next revalide un
 * CHEMIN, pas une ressource. Une action qui réussit laisse donc l'écran
 * afficher la version d'avant — et sur un studio, où l'on enregistre en
 * regardant, c'est exactement l'endroit où le commerçant vient vérifier.
 *
 * Ce n'est pas une hypothèse : c'est le défaut VIT-37, puis VIT-39, VIT-41 et
 * VIT-42, mot pour mot. Il a coûté un lot à trouver, parce que rien ne casse —
 * l'action répond « enregistré », et elle dit vrai.
 *
 * ── ELLE COMPTE PAR FONCTION, ELLE NE TESTE PAS L'APPARTENANCE AU FICHIER ──
 *
 * C'est la seule différence avec les gardes des six modules déjà portés, et
 * elle est nécessaire ICI. Les leurs demandent « le fichier contient-il le
 * jumeau ? » (`chemins.includes(jumeau)`). Sur un module dont chaque action
 * revalide une expression DIFFÉRENTE, cela suffit. Pas sur celui-ci :
 * `prizes.ts` porte QUATRE fonctions qui revalident `${campaignId}` ou
 * `${updated.campaign_id}`, et `campaigns.ts` en porte CINQ qui revalident
 * `${id}`. Un jumeau oublié dans l'une d'elles resterait invisible dès lors
 * qu'une autre écrit le même littéral — la garde serait verte, et aveugle.
 *
 * Elle découpe donc la source par FONCTION EXPORTÉE et compte, dans chaque
 * bloc, les revalidations d'atelier d'un côté et leurs jumelles de l'autre.
 * Une fonction qui revalide `/dashboard/campaigns/${E}` (avec ou sans `/wheel`)
 * doit revalider `/studio/roue/${E}` dans le MÊME bloc.
 *
 * ── CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS ──
 *
 * Elle est TEXTUELLE (ADR-074) : elle prouve qu'un appel jumeau existe dans la
 * même fonction, jamais qu'il s'exécute sur le même chemin de code. C'est
 * néanmoins la mesure exacte du défaut — un oubli d'appel, pas un appel mal
 * placé — et la seule forme qui survit à l'ajout d'une douzième action demain.
 *
 * Elle se DÉRIVE : rien n'est énuméré ici, la liste des revalidations est lue
 * dans les actions. Une action ajoutée entre dans la garde toute seule.
 */

const ACTIONS = join(__dirname, "..", "..", "..", "actions");

/** Les trois fichiers d'actions que le studio de la roue fait écrire. */
const FICHIERS = ["prizes.ts", "campaigns.ts", "referral.ts"] as const;

interface Bloc {
  fichier: string;
  fonction: string;
  source: string;
}

/**
 * Découpe un fichier d'actions en blocs, un par fonction exportée.
 *
 * Le découpage est textuel et grossier — de `export async function X(` jusqu'au
 * suivant — et c'est suffisant : les `revalidatePath` d'une action vivent dans
 * son corps, et une action n'en délègue aucune à une autre dans ces trois
 * fichiers. Ce qui précède la première fonction (imports, schémas) forme un
 * bloc « préambule » qui ne porte aucune revalidation.
 */
function blocsParFonction(fichier: string): Bloc[] {
  const source = readFileSync(join(ACTIONS, fichier), "utf8");
  const marques = [
    ...source.matchAll(/^export async function ([A-Za-z0-9_]+)\s*\(/gm),
  ];

  const blocs: Bloc[] = [];
  for (let i = 0; i < marques.length; i += 1) {
    const debut = marques[i].index!;
    const fin = i + 1 < marques.length ? marques[i + 1].index! : source.length;
    blocs.push({
      fichier,
      fonction: marques[i][1],
      source: source.slice(debut, fin),
    });
  }
  return blocs;
}

/** Les expressions revalidées dans un bloc, telles qu'écrites. */
function cheminsRevalides(bloc: Bloc): string[] {
  return [...bloc.source.matchAll(/revalidatePath\(\s*`([^`]+)`/g)].map(
    (m) => m[1],
  );
}

/**
 * L'expression d'identifiant de campagne d'un chemin d'atelier, ou `null`.
 *
 * `/dashboard/campaigns/${X}` et `/dashboard/campaigns/${X}/wheel` mènent tous
 * deux à la MÊME page de studio : les deux rendent donc `X`.
 */
function campagneVisee(chemin: string): string | null {
  const m = chemin.match(/^\/dashboard\/campaigns\/(\$\{[^}]+\})(?:\/wheel)?$/);
  return m ? m[1] : null;
}

const TOUS = FICHIERS.flatMap(blocsParFonction);

describe("le studio de la roue est revalidé partout où l'atelier l'est", () => {
  it("les actions revalident bien des chemins d'atelier — sinon la garde est vacante", () => {
    // Sans cette assertion, un renommage du chemin rendrait la boucle ci-dessous
    // vide : elle passerait au vert sans avoir rien regardé.
    const atelier = TOUS.flatMap(cheminsRevalides).filter(
      (c) => campagneVisee(c) !== null,
    );
    expect(atelier.length).toBeGreaterThanOrEqual(14);
  });

  it("chaque fonction qui revalide un chemin d'atelier revalide AUSSI le studio", () => {
    const manquants: string[] = [];

    for (const bloc of TOUS) {
      const chemins = cheminsRevalides(bloc);

      // COMPTAGE, ET NON APPARTENANCE : on compte, expression par expression,
      // les revalidations d'atelier de CE bloc et les jumelles de CE bloc. Un
      // jumeau écrit dans une AUTRE fonction ne compte pas — c'est exactement
      // le trou qu'une garde par appartenance au fichier laisse ouvert.
      const parExpression = new Map<string, { atelier: number; studio: number }>();
      const compteur = (expression: string) => {
        const actuel = parExpression.get(expression) ?? { atelier: 0, studio: 0 };
        parExpression.set(expression, actuel);
        return actuel;
      };

      for (const chemin of chemins) {
        const expression = campagneVisee(chemin);
        if (expression) {
          compteur(expression).atelier += 1;
          continue;
        }
        const studio = chemin.match(/^\/studio\/roue\/(\$\{[^}]+\})$/);
        if (studio) compteur(studio[1]).studio += 1;
      }

      for (const [expression, compte] of parExpression) {
        if (compte.atelier > 0 && compte.studio === 0) {
          manquants.push(
            `${bloc.fichier} · ${bloc.fonction} : ${compte.atelier} revalidation(s) ` +
              `/dashboard/campaigns/${expression} sans /studio/roue/${expression}`,
          );
        }
      }
    }

    // Le message nomme le FICHIER, la FONCTION et l'expression attendue : un
    // compte seul ne dirait pas laquelle manque, et trois fichiers portent
    // plusieurs appels identiques.
    expect(manquants).toEqual([]);
  });

  it("aucun jumeau de studio n'est posé sans son chemin d'atelier", () => {
    // La réciproque : un `/studio/roue/${X}` seul signalerait qu'un chemin
    // d'atelier a été RETIRÉ sans que son jumeau le soit — le studio se
    // rafraîchirait alors que la page de suivi resterait figée, ce qui est le
    // même défaut vu de l'autre côté.
    const orphelins: string[] = [];

    for (const bloc of TOUS) {
      const chemins = cheminsRevalides(bloc);
      const atelier = new Set(
        chemins.map(campagneVisee).filter((e): e is string => e !== null),
      );
      for (const chemin of chemins) {
        const studio = chemin.match(/^\/studio\/roue\/(\$\{[^}]+\})$/);
        if (studio && !atelier.has(studio[1])) {
          orphelins.push(`${bloc.fichier} · ${bloc.fonction} : ${chemin}`);
        }
      }
    }

    expect(orphelins).toEqual([]);
  });
});
