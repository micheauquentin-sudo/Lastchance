import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toute page rendue à un humain doit avoir une frontière au-dessus d'elle.
 *
 * ── CE QUE CETTE GARDE EMPÊCHE DE REVENIR ───────────────────────────
 *
 * `find src/app -name loading.tsx -o -name error.tsx` ne rendait que TROIS
 * fichiers — `dashboard/`, `admin/(protected)/`, `play/[slug]/` — pour une
 * trentaine de routes. Conséquences mesurées à l'audit du 2026-08-16 :
 *
 *  • sans `error.tsx`, une exception de rendu serveur remonte jusqu'à
 *    `global-error.tsx`, qui REMPLACE le layout racine — le joueur perd la
 *    police, la DA Kermesse et le logo du commerçant pour lire un « Une
 *    erreur est survenue » gris, sans `reset()` ;
 *  • sans `loading.tsx`, une route `force-dynamic` (les neuf modules joueur
 *    le sont) n'envoie AUCUN octet avant la fin de ses requêtes : l'écran
 *    reste blanc, en boutique, sur un réseau mobile.
 *
 * ── POURQUOI UNE GARDE DÉRIVÉE DU SYSTÈME DE FICHIERS ───────────────
 *
 * Le défaut ne vient pas d'une inattention isolée mais du fait qu'ajouter une
 * route ne coûte rien et qu'oublier sa frontière ne casse RIEN de visible en
 * développement — l'erreur ne se produit qu'en production, le chargement est
 * instantané en local. Une liste de routes recopiée ici aurait le même défaut
 * que le code qu'elle garde : elle vieillirait en silence. La liste est donc
 * relue du disque à chaque exécution, et une route neuve est couverte le jour
 * où elle est écrite.
 *
 * Les groupes `(player)`, `(public)`, `(auth)` existent exactement pour ça :
 * un groupe ne consomme aucun segment d'URL, la frontière s'y pose UNE fois
 * et couvre tout son sous-arbre.
 *
 * ── CE QUE CE TEST NE PROUVE PAS ────────────────────────────────────
 *
 * Que la frontière soit la BONNE : un `error.tsx` au ton commerçant posé
 * au-dessus d'un parcours joueur passerait ici. C'est une garde contre
 * l'absence, pas contre l'inadéquation.
 */

const RACINE_APP = join("src", "app");

/** Segments dont le sous-arbre ne rend rien à un humain. */
const HORS_PERIMETRE = ["api"];

type Route = { dossier: string; fichier: string };

/** Chaque dossier de `src/app` portant un `page.tsx` ou un `route.ts`. */
function routes(dossier: string): Route[] {
  const trouvees: Route[] = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (dossier === RACINE_APP && HORS_PERIMETRE.includes(e.name)) continue;
      trouvees.push(...routes(join(dossier, e.name)));
    } else if (e.name === "page.tsx" || e.name === "route.ts") {
      trouvees.push({ dossier, fichier: join(dossier, e.name) });
    }
  }
  return trouvees;
}

/** Les fichiers du dossier et de tous ses ancêtres, jusqu'à `src/app`. */
function fichiersDesAncetres(dossier: string): Set<string> {
  const vus = new Set<string>();
  let courant = dossier;
  for (;;) {
    for (const e of readdirSync(courant, { withFileTypes: true })) {
      if (e.isFile()) vus.add(e.name);
    }
    if (courant === RACINE_APP) break;
    courant = courant.split(sep).slice(0, -1).join(sep);
  }
  return vus;
}

describe("frontières de rendu des routes", () => {
  const toutes = routes(RACINE_APP);

  it("recense bien l'arbre des routes", () => {
    // Filet contre un test qui passerait sur zéro route après un
    // déplacement de dossier — le mode d'échec le plus discret d'une
    // garde dérivée du disque.
    expect(toutes.length).toBeGreaterThan(20);
  });

  for (const frontiere of ["error.tsx", "loading.tsx"] as const) {
    it(`chaque route a un ${frontiere} à portée`, () => {
      const sansFrontiere = toutes
        .filter((r) => !fichiersDesAncetres(r.dossier).has(frontiere))
        .map((r) => relative(RACINE_APP, r.fichier).split(sep).join("/"));
      expect(
        sansFrontiere,
        `ces routes n'ont aucun ${frontiere} au-dessus d'elles : ajoutez-en un ` +
          `sur leur segment, ou rangez la route sous un groupe qui en porte déjà un`,
      ).toEqual([]);
    });
  }
});

/**
 * Une frontière qui AVALE l'erreur sans la signaler est pire que pas de
 * frontière.
 *
 * `global-error.tsx` était le seul écran d'erreur du produit, et le seul à
 * appeler `Sentry.captureException`. Poser des `error.tsx` de segment
 * au-dessus de lui améliore ce que voit l'utilisateur — il garde le layout,
 * la police, le logo — et, sans précaution, ÉTEINT le signal : une exception
 * de rendu client interceptée par un segment n'atteint plus jamais Sentry.
 *
 * Le prix est payé exactement là où il coûte le plus : sur les parcours
 * publics `(player)` et `(public)`, ceux qu'un inconnu peut sonder et dont
 * personne ne remonte les incidents par téléphone.
 */
describe("chaque frontière d'erreur remonte ce qu'elle intercepte", () => {
  it("appelle captureException sur l'erreur reçue", () => {
    const frontieres = routes(RACINE_APP)
      .map((r) => r.dossier)
      .concat(RACINE_APP);
    const vues = new Set<string>();
    const muettes: string[] = [];
    for (const dossier of frontieres) {
      let courant = dossier;
      for (;;) {
        const fichier = join(courant, "error.tsx");
        if (!vues.has(fichier) && existsSync(fichier)) {
          vues.add(fichier);
          const source = readFileSync(fichier, "utf8");
          // Les deux moitiés : capturer, et capturer L'ERREUR REÇUE — un
          // `captureException` sur une variable inventée passerait la
          // première et raterait tout.
          if (!/Sentry\.captureException\(error\)/.test(source)) {
            muettes.push(relative(RACINE_APP, fichier).split(sep).join("/"));
          }
        }
        if (courant === RACINE_APP) break;
        courant = courant.split(sep).slice(0, -1).join(sep);
      }
    }
    expect(vues.size, "aucun error.tsx trouvé — la garde ne prouve rien").toBeGreaterThan(5);
    expect(
      muettes,
      "ces frontières interceptent une erreur sans la remonter à Sentry : " +
        "ajoutez le `useEffect(() => { Sentry.captureException(error); }, [error])` " +
        "de `global-error.tsx`",
    ).toEqual([]);
  });
});

/**
 * Le 404 d'une page STREAMÉE se décide avant le premier octet.
 *
 * ── LE DÉFAUT, ET POURQUOI IL ÉTAIT INVISIBLE ───────────────────────
 *
 * Poser un `loading.tsx` sur le groupe `(player)` a fait passer les dix
 * parcours joueur en rendu STREAMÉ. Next envoie alors l'en-tête HTTP — donc
 * le statut — dès que la coquille est prête, et le `notFound()` du corps,
 * qui vient après des lectures asynchrones, n'arrive que dans un chunk
 * ultérieur. Un calendrier, un événement ou un jackpot inconnu répondait
 * **200** avec un digest 404 enfoui dans le flux.
 *
 * À l'œil, rien ne change : le visiteur voit bien la page « introuvable ».
 * Tout ce qui LIT UN STATUT, en revanche, était trompé — moteurs
 * d'indexation, sondes de supervision, et les trois specs E2E qui l'ont
 * attrapé. C'est le mode de défaillance le plus coûteux : correct en
 * apparence, faux pour les machines, et introduit par une amélioration.
 *
 * ── CE QUE CETTE GARDE EXIGE ────────────────────────────────────────
 *
 * `generateMetadata` s'exécute AVANT le premier octet : c'est le dernier
 * endroit où le statut est encore négociable. Toute page joueur qui sait
 * répondre 404 doit donc le décider LÀ AUSSI — le `notFound()` du corps
 * reste en filet, il n'est simplement plus le seul.
 *
 * Les pages qui répondent 200 avec un écran d'explication (`/play`,
 * `/pronos/[slug]`) ne sont pas concernées et se désignent elles-mêmes :
 * elles n'appellent jamais `notFound()`.
 */
describe("statut 404 des routes joueur streamées", () => {
  const JOUEUR = join(RACINE_APP, "(player)");

  /** Corps de `generateMetadata`, ou `null` si la page n'en a pas. */
  function corpsDeGenerateMetadata(source: string): string | null {
    const debut = source.indexOf("export async function generateMetadata");
    if (debut === -1) return null;
    // Une LIGNE réduite à `}`, et pas le premier `\n}` venu : la signature
    // contient `}: {` en colonne zéro (le type des `params`), qui coupait la
    // fonction juste avant son corps — la garde accusait alors des pages
    // parfaitement correctes.
    const fin = source.slice(debut).search(/\n\}\s*(\r?\n|$)/);
    return fin === -1 ? source.slice(debut) : source.slice(debut, debut + fin);
  }

  it("décide le 404 dans generateMetadata, pas seulement dans le corps", () => {
    const pages = routes(JOUEUR)
      .map((r) => r.fichier)
      .filter((f) => f.endsWith("page.tsx"));
    expect(pages.length, "aucune page joueur trouvée").toBeGreaterThan(8);

    const tardives: string[] = [];
    for (const fichier of pages) {
      const source = readFileSync(fichier, "utf8");
      if (!/\bnotFound\(\)/.test(source)) continue;
      const metadata = corpsDeGenerateMetadata(source);
      if (!metadata || !/\bnotFound\(\)/.test(metadata)) {
        tardives.push(relative(RACINE_APP, fichier).split(sep).join("/"));
      }
    }
    expect(
      tardives,
      "ces pages ne rendent leur 404 qu'APRÈS le début du streaming, donc " +
        "avec un statut 200 déjà envoyé : faites résoudre le contexte par " +
        "`generateMetadata` (chargeur mémoïsé par `cache()` pour ne pas " +
        "doubler la requête) et appelez-y `notFound()`",
    ).toEqual([]);
  });
});
