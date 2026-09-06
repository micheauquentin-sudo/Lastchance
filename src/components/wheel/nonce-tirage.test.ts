import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GARDE MÉCANIQUE — tout parcours qui lance un tirage doit porter le nonce de
 * sa tentative, et l'oublier au bon endroit.
 *
 * ── Le défaut ──
 * La base valide un tirage, la réponse réseau se perd, le joueur recharge et
 * rejoue : sur une roue `play_limit = 'unlimited'`, un SECOND tirage est créé,
 * un second décrément de stock avec, et le premier gain reste orphelin.
 * `spinWheel` sait reconnaître ce rejeu — à condition que la seconde tentative
 * porte LE MÊME nonce (src/lib/spin-nonce.ts, src/actions/play.ts).
 *
 * ── Les trois façons de le rater ──
 *  · ne pas transmettre le nonce : le serveur retombe sur son comportement
 *    d'avant, et rien n'est fermé ;
 *  · l'oublier DANS le `catch` : l'unique cas que le nonce couvre — l'appel
 *    rompu sans réponse — repartirait avec une clé neuve ;
 *  · ne jamais l'oublier : chaque partie suivante serait servie comme le rejeu
 *    de la précédente, et le joueur ne pourrait plus jamais jouer.
 *
 * La garde suit la POPULATION, pas trois fichiers nommés : un quatrième shell
 * qui appellerait `spinWheel` sans nonce fera rougir la suite.
 */

const DOSSIER = "src/components/wheel";

/** Source amputée de ses commentaires : une prose n'a jamais fermé un défaut. */
function source(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (ligne, avant: string) =>
      avant + " ".repeat(ligne.length - avant.length),
    );
}

/** Tout composant du parcours joueur qui lance un tirage direct. */
const SHELLS = readdirSync(DOSSIER)
  .filter((nom) => nom.endsWith(".tsx") && !nom.endsWith(".test.tsx"))
  .map((nom) => `${DOSSIER}/${nom}`)
  .filter((chemin) => /await spinWheel\(/.test(source(chemin)));

describe("nonce de tirage — garde des parcours joueur", () => {
  it("couvre bien les trois shells connus", () => {
    // Si cette liste maigrit, c'est un appelant qui a changé de forme : la
    // garde deviendrait muette sans que rien ne rougisse.
    expect(SHELLS).toEqual(
      expect.arrayContaining([
        "src/components/wheel/game-shell.tsx",
        "src/components/wheel/play-experience.tsx",
        "src/components/wheel/scratch-experience.tsx",
      ]),
    );
  });

  it.each(SHELLS)("%s transmet le nonce de la tentative", (chemin) => {
    const src = source(chemin);
    const lecture = src.search(/lireOuCreerNonceTirage\(slug\)/);
    const appel = src.search(/await spinWheel\(/);

    expect(lecture, "le nonce doit être lu").toBeGreaterThan(-1);
    // Lu APRÈS l'appel, il n'aurait rien à y faire.
    expect(lecture).toBeLessThan(appel);
    expect(
      src.slice(appel),
      "le nonce doit être le 4e argument de spinWheel",
    ).toMatch(/await spinWheel\(\s*slug,[\s\S]{0,200}?nonce,?\s*\)/);
  });

  it.each(SHELLS)("%s oublie la tentative une fois répondue", (chemin) => {
    const src = source(chemin);
    const oubli = src.search(/oublierNonceTirage\(slug\)/);
    const refus = src.search(/if \(!result\.ok\) \{/);

    expect(oubli, "la tentative doit être close").toBeGreaterThan(-1);
    // Avant la branche de refus : succès et refus métier sont l'un et l'autre
    // une réponse, et closent donc l'un et l'autre la tentative.
    expect(oubli).toBeLessThan(refus);
  });

  it.each(SHELLS)("%s garde le nonce quand l'appel se rompt", (chemin) => {
    const src = source(chemin);
    const appel = src.search(/await spinWheel\(/);
    const debutCatch = src.indexOf("} catch {", appel);
    const oubli = src.indexOf("oublierNonceTirage(slug)", debutCatch);

    expect(debutCatch).toBeGreaterThan(-1);
    expect(oubli).toBeGreaterThan(debutCatch);
    // La sortie anticipée du `catch` doit se trouver ENTRE ce catch et
    // l'oubli : c'est ce qui prouve que le chemin « aucune réponse » ne
    // l'atteint jamais.
    expect(
      src.slice(debutCatch, oubli),
      "le catch doit sortir avant d'atteindre l'oubli",
    ).toMatch(/return;/);
  });
});
