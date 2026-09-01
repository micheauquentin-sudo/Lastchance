import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LA RECONNAISSANCE DE CARACTÈRES NE SORT PAS DU COMMERCE (VIT-18).
 *
 * ── CE QUE CE FICHIER GARDE, ET POURQUOI IL LIT DU TEXTE ──
 *
 * `import-fichier.ts` porte depuis toujours une promesse : « le PDF d'un
 * restaurant reste chez le restaurant ; seul le texte qu'il contient remonte ».
 * La lecture d'image est le premier endroit où cette promesse pouvait se perdre
 * SANS QUE RIEN NE CASSE : `tesseract.js` va chercher son moteur et son
 * dictionnaire sur un CDN public **par défaut**. Oublier un seul des trois
 * chemins ne produit aucune erreur — ça marche, simplement l'image du
 * commerçant a fait un aller-retour chez un tiers, et personne ne le voit.
 *
 * C'est exactement la classe de défaut qu'un test d'exécution ne trouve pas :
 * le comportement est identique, seule la destination change. On lit donc la
 * SOURCE, comme les gardes de parité SQL de ce dépôt.
 *
 * ── ET LE POIDS EST GARDÉ AUSSI ──
 *
 * 4,1 Mo au premier import, c'est le prix accepté. Quinze le seraient beaucoup
 * moins, et la substitution est facile : un `fra.traineddata` complet porte le
 * même nom que le rapide. Le plancher attrape aussi le cas inverse — un fichier
 * tronqué par un téléchargement interrompu, qui se lirait comme un dictionnaire
 * valide jusqu'à l'échec en production.
 */

const RACINE = process.cwd();
const SOURCE = readFileSync(
  join(RACINE, "src/components/vitrine/import-ocr.ts"),
  "utf8",
);

describe("lecture d'image — rien ne part vers un hôte tiers", () => {
  it("les trois chemins du moteur pointent sur NOTRE domaine", () => {
    // Les trois, et pas un de moins : `workerPath` charge le script, `corePath`
    // le WebAssembly, `langPath` le dictionnaire. Chacun a son propre repli
    // CDN dans la bibliothèque.
    for (const cle of ["workerPath", "corePath", "langPath"]) {
      const trouve = new RegExp(`${cle}:\\s*"(/[^"]*)"`).exec(SOURCE);
      expect(trouve, `${cle} absent ou ne pointant pas sur un chemin absolu`)
        .not.toBeNull();
      expect(trouve![1].startsWith("/ocr")).toBe(true);
    }
  });

  it("aucune adresse extérieure n'apparaît dans le module", () => {
    // Une garde large et volontairement bête : n'importe quel `https://` ici
    // serait un appel sortant, y compris glissé dans une option que la revue
    // n'attend pas.
    const externes = SOURCE.match(/https?:\/\/[^\s"')]+/g) ?? [];
    expect(externes).toEqual([]);
  });

  it("le dictionnaire est demandé NON compressé", () => {
    // `gzip: false` n'est pas un détail de performance. `public/` ne sert pas
    // de `.gz` : laisser la bibliothèque en chercher un produirait un 404 muet
    // suivi d'un repli sur le CDN — la fuite exacte que ce fichier garde.
    expect(SOURCE).toMatch(/gzip:\s*false/);
  });

  it("le moteur est importé DYNAMIQUEMENT, pas en tête de fichier", () => {
    // 4,1 Mo ne doivent pas peser sur l'import d'un `.csv`. Un `import` statique
    // les ferait entrer dans le paquet de l'écran, pour tout le monde.
    expect(SOURCE).toMatch(/await import\(\s*"tesseract\.js"\s*\)/);
    expect(SOURCE).not.toMatch(/^import .* from "tesseract\.js"/m);
  });

  it("le worker est toujours terminé", () => {
    // Il tient le moteur entier en mémoire. Un onglet qui en garde trois finit
    // tué par le navigateur, sans message.
    expect(SOURCE).toMatch(/finally\s*\{[\s\S]*terminate\(\)/);
  });
});

describe("les fichiers du moteur sont bien chez nous", () => {
  const attendus = [
    { nom: "fra.traineddata", minMo: 0.9, maxMo: 3 },
    { nom: "tesseract-core-lstm.wasm", minMo: 2, maxMo: 4 },
    { nom: "tesseract-core-lstm.js", minMo: 0.02, maxMo: 0.5 },
    { nom: "worker.min.js", minMo: 0.02, maxMo: 0.5 },
  ];

  it("les quatre fichiers existent dans public/ocr", () => {
    for (const { nom } of attendus) {
      expect(existsSync(join(RACINE, "public/ocr", nom)), nom).toBe(true);
    }
  });

  it("chacun tient dans son ordre de grandeur", () => {
    for (const { nom, minMo, maxMo } of attendus) {
      const mo = statSync(join(RACINE, "public/ocr", nom)).size / 1048576;
      expect(mo, `${nom} : ${mo.toFixed(2)} Mo`).toBeGreaterThan(minMo);
      expect(mo, `${nom} : ${mo.toFixed(2)} Mo`).toBeLessThan(maxMo);
    }
  });

  it("l'ensemble reste sous le budget accepté de 5 Mo", () => {
    const total = attendus.reduce(
      (n, { nom }) => n + statSync(join(RACINE, "public/ocr", nom)).size,
      0,
    );
    expect(total / 1048576).toBeLessThan(5);
  });
});
