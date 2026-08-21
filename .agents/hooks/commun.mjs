// Fond commun aux hooks Antigravity — lecture d'entrée, chemins, état, git.
//
// RÈGLE ABSOLUE DE CES HOOKS : ne jamais échouer bruyamment. Ils tournent
// SYNCHRONEMENT et BLOQUENT la boucle de l'agent (limitation documentée
// d'Antigravity). Un hook qui plante ou qui traîne ne protège de rien : il
// arrête le travail. Toute erreur interne sort en silence, code 0.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// cwd d'un hook Antigravity = le dossier qui contient hooks.json, donc
// `.agents/`. La racine du dépôt est un cran au-dessus.
export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ETAT = path.join(RACINE, ".agents", ".etat");

export function lireEntree() {
  return new Promise((resoudre) => {
    let brut = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (brut += c));
    process.stdin.on("end", () => resoudre(brut));
    process.stdin.on("error", () => resoudre(""));
    // Filet : si rien n'arrive, on ne bloque pas la boucle de l'agent.
    setTimeout(() => resoudre(brut), 3000).unref?.();
  });
}

export async function entree() {
  try {
    return JSON.parse((await lireEntree()) || "{}");
  } catch {
    return {};
  }
}

/** Écrit la réponse JSON et sort. `{}` = « rien à dire », comportement par défaut. */
export function repondre(objet) {
  try {
    process.stdout.write(JSON.stringify(objet ?? {}));
  } catch {
    /* silence délibéré */
  }
  process.exit(0);
}

export const git = (...args) =>
  spawnSync("git", args, { cwd: RACINE, encoding: "utf8", timeout: 15_000 });

export function lireEtat(nom) {
  try {
    return JSON.parse(readFileSync(path.join(ETAT, nom), "utf8"));
  } catch {
    return null;
  }
}

export function ecrireEtat(nom, valeur) {
  try {
    mkdirSync(ETAT, { recursive: true });
    writeFileSync(path.join(ETAT, nom), JSON.stringify(valeur), "utf8");
  } catch {
    /* silence délibéré */
  }
}

export function effacerEtat(nom) {
  try {
    const p = path.join(ETAT, nom);
    if (existsSync(p)) writeFileSync(p, "null", "utf8");
  } catch {
    /* silence délibéré */
  }
}
