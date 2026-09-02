import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildOcrWorkerCsp,
} from "@/lib/security-headers";

/** Extrait une directive nommée d'une politique assemblée. */
function directive(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

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

/**
 * LA LECTURE D'IMAGE PEUT RÉELLEMENT DÉMARRER (VIT-29).
 *
 * ── LE DÉFAUT QUE CE BLOC FERME, ET IL A ÉTÉ LIVRÉ ──
 *
 * VIT-18 a livré la reconnaissance de caractères. Elle n'a jamais fonctionné en
 * production : `'wasm-unsafe-eval'` avait été retiré de la CSP par MORT-2 —
 * pour une bonne raison, le décodeur d'une mascotte 3D supprimée — et rien
 * n'a rougi. Ni le typecheck ni les tests ne lisent une politique de sécurité,
 * et les gardes du dessus vérifient l'ORIGINE des fichiers, pas le droit de les
 * exécuter.
 *
 * ── TROIS PIÈCES, ET IL SUFFIT D'UNE POUR TOUT ÉTEINDRE ──
 *
 * 1. `workerBlobURL: false` ici — sinon le fil naît d'un `blob:` et hérite de
 *    la politique de la PAGE, qui n'autorise rien.
 * 2. La réponse de `/ocr/` porte `'wasm-unsafe-eval'` (`next.config.ts`).
 * 3. `/ocr` reste hors du matcher du proxy — sinon deux politiques coexistent,
 *    le navigateur les intersecte, et la plus stricte gagne.
 *
 * Chacune se garde chez elle. Celle-ci tient la première, et elle lit la SOURCE
 * pour la même raison que ses voisines : à `true`, le moteur échoue simplement
 * à démarrer et l'écran affiche son refus poli. Aucune erreur, aucune trace —
 * exactement l'état dans lequel la fonctionnalité a vécu jusqu'ici.
 */
describe("lecture d'image — le moteur a le droit de démarrer", () => {
  it("le fil ne naît PAS d'une URL blob, qui hériterait de la CSP de la page", () => {
    expect(
      SOURCE,
      "sans `workerBlobURL: false`, le fil hérite de la politique du tableau de bord et le moteur ne démarre jamais",
    ).toContain("workerBlobURL: false");
  });

  it("la politique du fil autorise le WebAssembly, et rien de superflu", () => {
    const politique = buildOcrWorkerCsp();

    expect(politique).toContain("'wasm-unsafe-eval'");
    // `'unsafe-eval'` autoriserait en plus l'évaluation de JavaScript
    // arbitraire : bien plus large, et inutile ici.
    expect(politique).not.toContain("'unsafe-eval' ");
    expect(politique).not.toContain("'unsafe-inline'");
    // Ce fil ne rend rien et ne parle à personne d'autre qu'à notre domaine.
    expect(politique).toContain("default-src 'none'");
    expect(politique).toContain("connect-src 'self'");
    for (const hote of ["supabase", "posthog", "sentry", "cloudflare"]) {
      expect(politique, `${hote} n'a rien à faire dans la politique du fil`)
        .not.toContain(hote);
    }
  });

  it("AUCUNE surface de PAGE ne gagne cette permission au passage", () => {
    // C'est la moitié qui compte : la permission est portée par la réponse des
    // fichiers `/ocr/`, pas par les écrans. La rouvrir dans
    // `buildContentSecurityPolicy` la rendrait au back-office, à
    // l'administration et aux pages d'authentification — c'est-à-dire défaire
    // MORT-2 pour un besoin qui tient dans un fichier.
    for (const surface of ["static", "public", "sensitive"] as const) {
      const politique = buildContentSecurityPolicy({ surface, nonce: "abc" });
      // LA POLITIQUE ENTIÈRE, ET NON LE SEUL `script-src`.
      //
      // Une première version de cette garde ne regardait que `script-src`.
      // Une manipulation ratée a alors posé `'wasm-unsafe-eval'` dans le
      // `default-src` de cette même politique — c'est-à-dire accordé la
      // permission aux trois régimes — et le test est resté VERT.
      //
      // `default-src` sert de repli à toutes les directives absentes : y
      // glisser une permission la distribue plus largement qu'en la posant
      // dans `script-src`. Une garde qui ne surveille qu'une directive nommée
      // laisse donc ouverte la porte la plus large.
      expect(
        politique,
        `le régime ${surface} ne doit porter 'wasm-unsafe-eval' dans AUCUNE directive`,
      ).not.toContain("'wasm-unsafe-eval'");
      expect(directive(politique, "script-src")).toBeDefined();
    }
  });

  it("`/ocr` est hors du matcher du proxy, sinon l'en-tête serait intersecté", () => {
    // Deux politiques sur une même réponse ne se remplacent pas : le navigateur
    // exige que TOUTES soient satisfaites. Celle du proxy n'autorisant pas le
    // WebAssembly, sa seule présence suffirait à rendre l'autre inutile — sans
    // aucun signe.
    const proxy = readFileSync(join(RACINE, "src/proxy.ts"), "utf8");
    const matcher = proxy.slice(proxy.indexOf("matcher: ["));
    expect(matcher).toContain("ocr(?:/|$)");
    // Borné, jamais nu : un `ocr` seul ferait aussi sortir un futur
    // `/ocrisation`, qui perdrait session et redirection de connexion.
    expect(matcher).not.toMatch(/\|ocr\|/);
  });
});
