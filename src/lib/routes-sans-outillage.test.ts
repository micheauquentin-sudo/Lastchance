import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AUCUN OUTILLAGE DE POSTE DE TRAVAIL DANS UN ARBRE SERVI PAR NEXT.
 *
 * ── Le défaut que ce fichier existe pour empêcher ──
 *
 * Le 2026-09-05, deux audits indépendants ont trouvé le même lot : de
 * l'outillage local de génération d'images de fond, écrit sous `src/app/api/`
 * et `site/src/app/api/`. Next ne fait pas la différence entre un prototype et
 * un produit — il compile ce qu'il trouve. Les deux builds passaient au vert
 * avec, à l'intérieur :
 *
 *   /api/scan        →  `powershell 1..254 | ForEach-Object` sur 192.168.1.x,
 *                       puis `arp -a`, puis une sonde HTTPS de chaque hôte
 *                       trouvé avec `rejectUnauthorized: false`.
 *   /api/save-frame  →  `path.join(FRAMES_DIR, \`frame-${index}.webp\`)` où
 *                       `index` venait du corps JSON. `path.join` normalise
 *                       les « .. » : l'écriture sortait du répertoire.
 *   /api/test-tools  →  cinq `execSync`, stdout ET stderr renvoyés au client.
 *
 * Aucune n'était authentifiée. Aucune n'était dans `.gitignore` : un
 * `git add .` les emportait, un `vercel deploy` depuis l'arbre les publiait.
 *
 * ── Pourquoi le SYSTÈME DE FICHIERS et non l'index git ──
 *
 * Une garde qui ne lirait que `git ls-files` serait aveugle au scénario
 * exact que les audits ont nommé : le fichier n'était PAS suivi, et c'est
 * précisément ce qui le rendait invisible. Ce qui se déploie, c'est ce qui est
 * sur le disque. On balaie donc le disque — un prototype réinstallé sous
 * `src/app/` fait rougir ce test, et c'est le comportement voulu.
 *
 * `tools/backdrop/` existe pour ça : hors des deux arbres Next, ignoré par
 * git, et donc jamais compilé ni déployé.
 */

const RACINE = path.resolve(__dirname, "..", "..");

const ARBRES_SERVIS = ["src/app", "site/src/app"];

/**
 * Chaque motif porte SA raison. Un test qui dit « motif interdit » sans dire
 * lequel ni pourquoi se fait contourner par la première réécriture venue.
 */
const MOTIFS_INTERDITS: ReadonlyArray<{
  readonly motif: RegExp;
  readonly quoi: string;
  readonly pourquoi: string;
}> = [
  {
    motif: /\bfrom\s+["']node:child_process["']|\bfrom\s+["']child_process["']|\brequire\(\s*["'](?:node:)?child_process["']\s*\)/,
    quoi: "child_process",
    pourquoi:
      "exécuter un processus depuis une route donne au visiteur la ligne de commande de l'hôte (/api/scan, /api/test-tools).",
  },
  {
    motif: /rejectUnauthorized\s*:\s*false/,
    quoi: "rejectUnauthorized: false",
    pourquoi:
      "désactiver la vérification TLS transforme la route en sonde de réseau interne (/api/scan).",
  },
  {
    motif: /\b(?:writeFileSync|createWriteStream|mkdirSync|appendFileSync|rmSync|unlinkSync)\s*\(/,
    quoi: "écriture sur le système de fichiers",
    pourquoi:
      "le disque d'une invocation serverless est éphémère et partagé ; une écriture dont le chemin vient de la requête sort du répertoire (/api/save-frame).",
  },
];

function fichiersSources(racine: string): string[] {
  const absolu = path.join(RACINE, racine);
  const trouves: string[] = [];
  const descendre = (dossier: string) => {
    let entrees: string[];
    try {
      entrees = readdirSync(dossier);
    } catch {
      return; // l'arbre `site/` peut ne pas exister selon la checkout
    }
    for (const entree of entrees) {
      if (entree === "node_modules" || entree.startsWith(".")) continue;
      const chemin = path.join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        descendre(chemin);
      } else if (/\.tsx?$/.test(entree)) {
        trouves.push(chemin);
      }
    }
  };
  descendre(absolu);
  return trouves;
}

describe("aucun outillage de poste de travail dans un arbre servi par Next", () => {
  for (const arbre of ARBRES_SERVIS) {
    it(`${arbre} — ni processus, ni écriture disque, ni TLS désactivé`, () => {
      const fautes: string[] = [];

      for (const fichier of fichiersSources(arbre)) {
        const source = readFileSync(fichier, "utf8");
        for (const { motif, quoi, pourquoi } of MOTIFS_INTERDITS) {
          if (!motif.test(source)) continue;
          const relatif = path.relative(RACINE, fichier).split(path.sep).join("/");
          fautes.push(`${relatif} : ${quoi} — ${pourquoi}`);
        }
      }

      expect(
        fautes,
        fautes.length === 0
          ? ""
          : [
              "",
              "Outillage détecté dans un arbre que Next compile et déploie :",
              ...fautes.map((f) => `  • ${f}`),
              "",
              "Si c'est de l'outillage local, sa place est `tools/` (hors des",
              "arbres Next, ignoré par git). Si c'est une vraie route produit,",
              "elle a besoin d'une authentification et d'une revue sécurité.",
              "",
            ].join("\n"),
      ).toEqual([]);
    });
  }

  it("balaie un nombre de fichiers plausible (la garde n'est pas muette)", () => {
    // Une garde qui ne lit rien passe au vert pour la pire des raisons.
    expect(fichiersSources("src/app").length).toBeGreaterThan(50);
  });
});
