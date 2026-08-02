import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — la reprise d'un gain ne doit écraser ni le tour en cours,
 * ni le lot qu'elle vient justement de retrouver.
 *
 * ── Le défaut, et pourquoi il s'est propagé à trois parcours sur quatre ──
 *
 * Chaque parcours joueur ouvre la page par la même chaîne asynchrone :
 * `prepareAnonymousPlayer()` puis `recoverPendingWin(slug)`, DEUX allers-retours
 * serveur. Un joueur pressé — celui qui vient de scanner le QR au comptoir —
 * appuie sur le bouton de jeu avant qu'elle n'ait répondu. Les deux ordres
 * d'arrivée détruisaient chacun quelque chose :
 *
 *  · la reprise arrive APRÈS le lancement accordé → elle écrase le résultat
 *    frais par l'ancien gain, et le formulaire de réclamation remonté
 *    auto-réclame ce dernier avant de disparaître avec son code ;
 *  · la reprise arrive APRÈS un refus du serveur → l'écran « bloqué » remplace
 *    le gain retrouvé. Le lot est déjà décrémenté du stock et plus rien à
 *    l'écran n'y mène : ni bouton, ni retour.
 *
 * Le second ordre est le cas ORDINAIRE de la roue : `play_limit` vaut « weekly »
 * par défaut, donc un joueur qui revient dans la semaine se voit refuser son
 * tour — c'est-à-dire exactement la situation où il a un gain à reprendre.
 *
 * Corrigé le 2026-07-29 sur `game-shell.tsx`, puis recopié à la main sur
 * `scratch-experience.tsx` et `skill-game-shell.tsx`. La roue — le parcours PAR
 * DÉFAUT, le repli de `play/[slug]/page.tsx` — ne l'a jamais reçu : une
 * correction propagée à la main saute le fichier qu'on ne pense pas à ouvrir.
 * D'où cette garde, qui suit la POPULATION et non les trois fichiers déjà
 * corrigés : tout nouveau shell qui reprend un gain devra la satisfaire.
 */

/**
 * Population : tout composant de parcours joueur qui appelle `recoverPendingWin`.
 * La liste est en dur, mais un contrôle plus bas vérifie qu'aucun fichier
 * appelant n'y manque — le nouveau shell de demain fera donc rougir la suite.
 */
const SHELLS = [
  "src/components/wheel/play-experience.tsx",
  "src/components/wheel/game-shell.tsx",
  "src/components/wheel/scratch-experience.tsx",
  "src/components/wheel/skill-game-shell.tsx",
] as const;

/**
 * Source AMPUTÉE DE SES COMMENTAIRES.
 *
 * Sans cela la garde se serait mentie à elle-même : les quatre fichiers
 * expliquent le défaut en prose, en citant `setPhase("blocked")` et
 * `startedRef` — un fichier dont on aurait retiré tout le code mais gardé le
 * commentaire serait passé au vert. Les commentaires remplacés par des espaces
 * pour que les positions relatives restent comparables.
 */
function source(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (ligne, avant: string) =>
      avant + " ".repeat(ligne.length - avant.length),
    );
}

/** Index de la première occurrence, ou `-1`. */
function index(src: string, motif: RegExp): number {
  return src.search(motif);
}

describe("reprise d'un gain en attente — garde des parcours joueur", () => {
  it.each(SHELLS)("%s mémorise le gain repris avant d'en décider", (chemin) => {
    const src = source(chemin);
    // Le nom de la variable diffère d'un shell à l'autre (`pending`,
    // `repris`…) : c'est l'affectation qui compte, pas son étiquette.
    const memorise = index(src, /pendingWinRef\.current = (?!null\b)\w/);
    const garde = index(src, /if \(startedRef\.current\) return;/);
    const affiche = index(src, /setPhase\("won"\)/);

    expect(memorise, "le gain repris doit être mémorisé").toBeGreaterThan(-1);
    expect(garde, "la reprise doit céder au tour déjà lancé").toBeGreaterThan(-1);
    // L'ORDRE fait tout : mémoriser APRÈS la sortie anticipée reviendrait à
    // perdre le lot exactement dans le cas que la garde sert à couvrir.
    expect(memorise).toBeLessThan(garde);
    expect(garde).toBeLessThan(affiche);
  });

  it.each(SHELLS)("%s pose le drapeau avant l'appel serveur", (chemin) => {
    const src = source(chemin);
    const drapeau = index(src, /startedRef\.current = true/);
    // Le PREMIER `await` du fichier est l'appel qui ouvre la partie
    // (`spinWheel`, `startSkillChallenge`…). Viser la fonction par son nom
    // aurait fait passer au vert le shell suivant, qui en appellera une autre.
    const appel = index(src, /\bawait\b/);

    expect(drapeau, "le lancement doit être marqué").toBeGreaterThan(-1);
    expect(appel, "un appel serveur doit ouvrir la partie").toBeGreaterThan(-1);
    // Posé APRÈS la réponse, le drapeau ne couvrirait plus la fenêtre — qui est
    // précisément la durée de l'aller-retour.
    expect(drapeau).toBeLessThan(appel);
  });

  it.each(SHELLS)(
    "%s préfère le gain repris à l'écran bloqué",
    (chemin) => {
      const src = source(chemin);
      const refus = index(src, /if \(!result\.ok\) \{/);
      const bloque = index(src, /setPhase\("blocked"\)/);
      const consulte = src.indexOf("pendingWinRef.current;", refus);

      expect(refus, "la branche de refus doit exister").toBeGreaterThan(-1);
      expect(bloque).toBeGreaterThan(refus);
      expect(
        consulte,
        "le refus doit consulter le gain repris",
      ).toBeGreaterThan(refus);
      // Consulté APRÈS `setPhase("blocked")`, le gain ne servirait à rien : la
      // sortie anticipée n'aurait plus lieu.
      expect(consulte).toBeLessThan(bloque);
    },
  );

  it("aucun parcours appelant ne manque à la population", async () => {
    const { readdirSync } = await import("node:fs");
    const { join, sep } = await import("node:path");
    const trouves: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (
          e.name.endsWith(".tsx") &&
          readFileSync(chemin, "utf8").includes("recoverPendingWin(")
        ) {
          trouves.push(chemin.split(sep).join("/"));
        }
      }
    };
    parcourir("src/components");
    expect(trouves.sort()).toEqual([...SHELLS].sort());
  });
});
