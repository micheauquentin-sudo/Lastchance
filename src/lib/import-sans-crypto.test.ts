import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LES CHAÎNES D'IMPORTS QUI DESCENDENT DANS LE NAVIGATEUR.
 *
 * ── Le défaut que ce fichier existe pour empêcher ──
 *
 * Un composant client qui atteint `node:crypto` ne casse pas. Next.js
 * substitue un polyfill (`crypto-browserify` et sa suite) et la page marche —
 * elle pèse simplement ~121 Ko gzip de plus. Rien ne le signale : pas
 * d'avertissement au build, pas de rouge en CI, rien à voir en revue.
 *
 * Et jamais par un import direct, qu'on remarquerait. Deux fois de suite, par
 * une CHAÎNE :
 *
 *   quiz-editor.tsx  →  validations/quiz.ts  →  lib/pronostics.ts  →  node:crypto
 *   (un littéral de     (cinq bornes)           (deux fonctions d'identité,
 *    message)                                    500 lignes plus bas)
 *
 *   progression-season-card.tsx  →  lib/meta-progression.ts  →  node:crypto
 *   (vingt-six constantes)          (dont l'en-tête PROMETTAIT l'inverse)
 *
 * La règle ESLint `no-restricted-imports` posée sur `src/components/**` attrape
 * l'import DIRECT. Elle ne peut rien contre une chaîne : aucune règle standard
 * ne suit un graphe d'imports. C'est le travail de ce test.
 *
 * ── Ce qu'il vérifie, et pourquoi par la SOURCE ──
 *
 * On part des modules de `src/lib` qu'un composant client atteint réellement,
 * et on marche le graphe des imports internes (`@/…` et relatifs) jusqu'au
 * bout. Un seul `node:` dans la fermeture transitive, et c'est rouge — avec le
 * CHEMIN qui y mène, parce qu'un « ça importe crypto » sans le chemin fait
 * chercher pendant vingt minutes ce que l'assertion connaissait déjà.
 *
 * Lire les fichiers plutôt que les importer est délibéré : `import()` d'un
 * module ne dit pas d'où vient ce qu'il a chargé, et un module marqué
 * `server-only` refuserait de se charger ici alors qu'on veut justement
 * l'inspecter.
 */

const RACINE = path.resolve(process.cwd(), "src");

/** Les imports statiques et les `export … from` d'un fichier source. */
function specificateurs(source: string): string[] {
  const trouves: string[] = [];
  const motif = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) trouves.push(m[1]);
  // `import "server-only";` — pas de `from`, mais c'est un import quand même.
  const nus = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((m = nus.exec(source)) !== null) trouves.push(m[1]);
  return trouves;
}

/** Résout un spécificateur interne en fichier réel ; `null` s'il est externe. */
function resoudre(depuis: string, specificateur: string): string | null {
  let base: string;
  if (specificateur.startsWith("@/")) base = path.join(RACINE, specificateur.slice(2));
  else if (specificateur.startsWith(".")) base = path.resolve(path.dirname(depuis), specificateur);
  else return null;

  for (const suffixe of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const candidat = base + suffixe;
    if (existsSync(candidat) && candidat.match(/\.tsx?$/)) return candidat;
  }
  return null;
}

/**
 * Le premier chemin d'imports qui mène de `entree` à un module `node:…`, ou
 * `null` si la fermeture transitive en est indemne.
 */
function cheminVersNode(entree: string): string[] | null {
  const vus = new Set<string>();
  const file: Array<{ fichier: string; chemin: string[] }> = [
    { fichier: path.resolve(entree), chemin: [entree] },
  ];
  while (file.length > 0) {
    const { fichier, chemin } = file.shift()!;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    const source = readFileSync(fichier, "utf8");
    for (const spec of specificateurs(source)) {
      if (spec.startsWith("node:")) return [...chemin, spec];
      const cible = resoudre(fichier, spec);
      if (cible && !vus.has(cible)) {
        file.push({ fichier: cible, chemin: [...chemin, path.relative(process.cwd(), cible)] });
      }
    }
  }
  return null;
}

function lire(relatif: string): string {
  return readFileSync(path.resolve(process.cwd(), relatif), "utf8");
}

/**
 * Les modules de `src/lib` qu'un composant CLIENT atteint. Cette liste est la
 * frontière : y ajouter une entrée, c'est promettre qu'elle reste légère.
 */
const ENTREES_CLIENT = [
  // La chaîne du Créateur de quiz (quiz-editor.tsx).
  "src/lib/validations/quiz.ts",
  "src/lib/pronostics-bornes.ts",
  "src/lib/quiz.ts",
  // La chaîne de la méta-progression (progression-season-card.tsx).
  "src/lib/meta-progression.ts",
  // La chaîne du formulaire de réclamation (claim-form.tsx).
  "src/lib/claim-libelles.ts",
  // Fonds d'écran : servis sur toutes les pages joueur.
  "src/lib/fonds-ecran.ts",
  // Les deux hooks d'enregistrement automatique.
  "src/lib/use-auto-save.ts",
  "src/lib/use-auto-save-manuel.ts",
];

describe("aucun module Node dans ce qu'un composant client atteint", () => {
  it.each(ENTREES_CLIENT)("%s n'atteint aucun `node:…`", (entree) => {
    const chemin = cheminVersNode(entree);
    expect(
      chemin,
      chemin ? `chaîne fautive :\n  ${chemin.join("\n  → ")}` : "",
    ).toBeNull();
  });

  /**
   * Le test ci-dessus n'a de valeur que s'il sait dire non. On lui donne une
   * entrée dont on SAIT qu'elle porte `node:crypto` : si elle passait, c'est
   * la marche du graphe qui serait cassée, pas le dépôt qui serait propre.
   */
  it("sait détecter une chaîne fautive (sinon il ne prouve rien)", () => {
    const chemin = cheminVersNode("src/lib/validations/pronostics.ts");
    expect(chemin).not.toBeNull();
    expect(chemin!.at(-1)).toBe("node:crypto");
    expect(chemin!.join(" ")).toContain("pronostics.ts");
  });
});

describe("les modules sans import, et pourquoi ils le restent", () => {
  /**
   * `pronostics-bornes.ts` n'existe QUE pour être importable de partout. Un
   * seul import — fût-il un type — le rendrait solidaire d'un autre fichier, et
   * la chaîne se reformerait par le voisin.
   */
  it("pronostics-bornes.ts n'importe rien du tout", () => {
    expect(specificateurs(lire("src/lib/pronostics-bornes.ts"))).toEqual([]);
  });

  /** Même raison : `claim-libelles.ts` est ce que le formulaire joueur lit. */
  it("claim-libelles.ts n'importe rien du tout", () => {
    expect(specificateurs(lire("src/lib/claim-libelles.ts"))).toEqual([]);
  });

  it("claim-libelles.ts porte bien les deux noms du contrat", () => {
    const source = lire("src/lib/claim-libelles.ts");
    expect(source).toMatch(/export function isPlausibleBirthDate\(/);
    expect(source).toMatch(/export function smsConsentLabel\(/);
  });
});

describe("les deux chaînes fermées, nommément", () => {
  /**
   * L'assertion vise le SPÉCIFICATEUR et non la fermeture transitive : le test
   * de graphe dirait « quelque chose atteint crypto », celui-ci dit lequel des
   * deux modules a été rebranché par erreur.
   */
  it("validations/quiz.ts importe les bornes, jamais `@/lib/pronostics`", () => {
    const source = lire("src/lib/validations/quiz.ts");
    expect(source).toContain('from "@/lib/pronostics-bornes"');
    expect(specificateurs(source)).not.toContain("@/lib/pronostics");
  });

  it("meta-progression.ts n'a plus de `node:crypto` (il vit dans son module)", () => {
    // Sur les IMPORTS, pas sur le texte : l'en-tête du fichier RACONTE cette
    // histoire et cite `node:crypto` — l'y interdire ferait payer au commentaire
    // qui explique la règle le prix de la règle elle-même.
    expect(specificateurs(lire("src/lib/meta-progression.ts"))).not.toContain(
      "node:crypto",
    );
    expect(lire("src/lib/progression-request-id.ts")).toContain(
      'import { createHash } from "node:crypto"',
    );
  });

  /**
   * L'inverse compte autant : la fonction déplacée doit rester APPELÉE. Un
   * `request_id` qui ne serait plus dérivé rendrait l'ouverture de coffre
   * sensible au double-clic — un allègement de bundle payé d'une double
   * dépense de clés.
   */
  it("l'action d'ouverture appelle toujours la dérivation déplacée", () => {
    const source = lire("src/actions/meta-progression.ts");
    expect(source).toContain('from "@/lib/progression-request-id"');
    expect(source).toContain("deriveProgressionRequestId(");
  });

  it("validations/play.ts et validations/sms.ts n'hébergent plus les libellés", () => {
    const play = lire("src/lib/validations/play.ts");
    expect(play).not.toMatch(/export function isPlausibleBirthDate/);
    expect(play).toContain('from "@/lib/claim-libelles"');
    const sms = lire("src/lib/validations/sms.ts");
    expect(sms).not.toMatch(/export function smsConsentLabel/);
    expect(sms).toContain('from "@/lib/claim-libelles"');
  });
});
