import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — UN VERROU DE RENTRÉE DOIT ÊTRE RELÂCHÉ MÊME QUAND L'APPEL
 * SERVEUR N'AVAIT PAS PRÉVU D'ÉCHOUER.
 *
 * ── Le défaut, et pourquoi il s'est écrit quatre fois ────────────────
 *
 * Chaque écran « tour offert » (calendrier, fidélité, quiz, parrainage) ouvre
 * sa partie ainsi :
 *
 *     if (busyRef.current) return;
 *     busyRef.current = true;
 *     const result = await consumeXSpin(…);   // ← non enveloppé
 *     if (!result.ok) { busyRef.current = false; … }
 *
 * Le verrou n'était relâché que sur les chemins que l'auteur avait imaginés :
 * refus du serveur, `no_prize`, roue indisponible, fin d'animation. Or un rejet
 * de la promesse — réseau coupé pendant l'aller-retour, ce qui est le cas
 * ORDINAIRE d'un téléphone au comptoir — saute tout ce qui suit le `await`.
 * `busyRef.current` reste alors à `true` POUR TOUJOURS : le bouton demeure à
 * l'écran, cliquable, et la garde de rentrée le renvoie en silence à chaque
 * appui. Aucun message, aucune phase d'erreur, aucune sortie. Le joueur qui
 * avait mérité ce tour croit le jeu cassé, et il a raison.
 *
 * `game-shell.tsx` avait la bonne formule dès l'origine (`let result; try { … }
 * catch { verrou = false; setError(…); return; }`) ; les quatre tours offerts,
 * écrits ensuite en se recopiant l'un l'autre, l'ont tous manquée. Une
 * correction propagée à la main aurait sauté le cinquième écran de demain.
 *
 * ── D'où cette garde, qui suit la POPULATION ─────────────────────────
 *
 * Elle ne liste pas les fichiers corrigés : elle DÉCOUVRE tout composant qui
 * pose un verrou `busyRef` et exige que le chemin d'échec le relâche. Le
 * prochain écran qui recopiera le défaut fera rougir la suite à l'endroit même
 * où on l'écrira.
 *
 * Elle est textuelle et l'assume : `progression-panel.tsx` relâche son verrou
 * dans un `finally` plutôt que dans le `catch`, forme parfaitement correcte —
 * l'assertion porte donc sur « un bloc de récupération relâche le verrou », pas
 * sur une formule unique.
 */

const COMPOSANTS = join(process.cwd(), "src", "components");
const VERROU = "busyRef.current = true";
const RELACHE = "busyRef.current = false";

/**
 * Source AMPUTÉE DE SES COMMENTAIRES — même précaution que
 * `reprise-gain.test.ts` : les fichiers corrigés RACONTENT le défaut en prose,
 * en citant `busyRef.current = true` et le `catch`. Sans cela un fichier dont
 * on aurait retiré le code mais gardé le commentaire passerait au vert. Les
 * commentaires sont remplacés par des espaces, pour que les positions
 * relatives restent comparables.
 */
function source(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (ligne, avant: string) =>
      avant + " ".repeat(ligne.length - avant.length),
    );
}

/**
 * Corps du bloc ouvert par l'accolade en `ouvrant`, par comptage d'accolades.
 * Approximation assumée (une accolade dans une chaîne de caractères la
 * tromperait) : elle ne peut que RENDRE LA GARDE PLUS PERMISSIVE, jamais
 * produire un rouge injustifié.
 */
function corps(src: string, ouvrant: number): string {
  let profondeur = 0;
  for (let i = ouvrant; i < src.length; i += 1) {
    if (src[i] === "{") profondeur += 1;
    else if (src[i] === "}") {
      profondeur -= 1;
      if (profondeur === 0) return src.slice(ouvrant + 1, i);
    }
  }
  return src.slice(ouvrant + 1);
}

/** Tout `.tsx` de `src/components` qui pose un verrou de rentrée `busyRef`. */
function porteursDuVerrou(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (
        e.name.endsWith(".tsx") &&
        readFileSync(chemin, "utf8").includes(VERROU)
      ) {
        trouves.push(chemin);
      }
    }
  };
  parcourir(COMPOSANTS);
  return trouves.sort();
}

const PORTEURS = porteursDuVerrou();
const nom = (chemin: string) =>
  chemin.slice(COMPOSANTS.length + 1).split(sep).join("/");

describe("verrou de rentrée — le chemin d'échec doit le relâcher", () => {
  it("au moins un composant pose un verrou (la découverte fonctionne)", () => {
    // Sans cela, un renommage de `busyRef` viderait la population et cette
    // suite passerait au vert en ne vérifiant plus rien du tout.
    expect(PORTEURS.length).toBeGreaterThan(0);
  });

  it.each(PORTEURS.map((c) => [nom(c), c] as const))(
    "%s enveloppe son appel serveur",
    (_nom, chemin) => {
      const src = source(chemin);
      const verrou = src.indexOf(VERROU);
      const appel = src.indexOf("await", verrou);
      const essai = src.indexOf("try {", verrou);

      expect(appel, "un appel serveur doit suivre la prise du verrou").toBeGreaterThan(-1);
      expect(essai, "l'appel doit être enveloppé dans un try").toBeGreaterThan(-1);
      // Un `try` ouvert APRÈS le `await` n'en couvre pas le rejet : c'est
      // exactement l'état des quatre tours offerts avant correction.
      expect(essai).toBeLessThan(appel);
    },
  );

  it.each(PORTEURS.map((c) => [nom(c), c] as const))(
    "%s relâche le verrou sur le chemin d'échec",
    (_nom, chemin) => {
      const src = source(chemin);
      const essai = src.indexOf("try {", src.indexOf(VERROU));
      // `catch` ou `finally` : les deux relâchent valablement le verrou.
      const recuperation = /\}\s*(?:catch\s*(?:\([^)]*\)\s*)?|finally\s*)\{/g;
      recuperation.lastIndex = essai;

      const relachants: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = recuperation.exec(src)) !== null) {
        const bloc = corps(src, m.index + m[0].length - 1);
        if (bloc.includes(RELACHE)) relachants.push(bloc);
      }

      expect(
        relachants.length,
        "un catch ou un finally doit remettre le verrou à false",
      ).toBeGreaterThan(0);
    },
  );
});
