#!/usr/bin/env node
/**
 * `npm audit` QUI SAIT DISTINGUER UNE PANNE D'UNE VULNÉRABILITÉ.
 *
 * ── LE DÉFAUT QUE CE SCRIPT FERME ──
 *
 * `npm audit` sort en 1 dans DEUX cas que rien ne sépare côté CI :
 *
 *  1. il a trouvé une vulnérabilité — c'est le but de la garde ;
 *  2. il n'a pas pu joindre le service d'avis de npm.
 *
 * Le 2026-09-04, le second cas a bloqué toutes les livraisons, avec trois
 * symptômes différents pour une seule panne : `400 Bad Request — Invalid
 * package tree`, `{ error: 'Service Unavailable' }`, et un `npm notice`
 * annonçant le retrait du point d'entrée hérité. Les deux lockfiles étaient
 * intacts, les dépendances déclarées correspondaient au verrou, et l'audit de
 * la racine passait pendant que celui du site échouait — puis l'inverse.
 *
 * Le coût de la confusion est asymétrique et il va dans les DEUX sens : croire
 * à une vulnérabilité fait poser un override inutile, qui devient à son tour le
 * plancher de la prochaine fausse alerte (`docs/supply-chain.md` §2bis) ;
 * croire à une panne fait ignorer une vraie alerte.
 *
 * ── CE QUE CE SCRIPT NE FAIT PAS ──
 *
 * Il ne laisse JAMAIS passer une vulnérabilité. Une sortie non nulle
 * accompagnée d'un rapport reste un échec IMMÉDIAT, sans reprise : rejouer une
 * commande qui a correctement répondu « il y a un problème » ne ferait que
 * retarder la mauvaise nouvelle.
 *
 * Il ne « passe » pas non plus quand le service reste injoignable après toutes
 * les reprises. Une panne prolongée demande une décision humaine — attendre, ou
 * livrer en connaissance de cause — et un contournement automatique la
 * retirerait à celui qui doit la prendre. Le script échoue donc, mais en DISANT
 * pourquoi : c'est toute la différence à trois heures du matin.
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Signatures d'une panne du SERVICE, jamais d'un verdict sur le code. */
export const PANNES = [
  "audit endpoint returned an error",
  "Service Unavailable",
  "Invalid package tree",
  "Bad Request",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "network timeout",
  "socket hang up",
];

export const REPRISES = 3;
const ATTENTE_MS = [15_000, 45_000];

export function estUnePanne(sortie) {
  return PANNES.some((signature) => sortie.includes(signature));
}

/**
 * Ce qu'il faut faire d'un résultat d'audit. Séparé de l'exécution pour être
 * testable sans réseau — une garde dont le test dépendrait du service qu'elle
 * surveille ne prouverait rien le jour où ce service tombe.
 */
export function verdict({ code, sortie, essai, reprises = REPRISES }) {
  if (code === 0) return "propre";
  if (!estUnePanne(sortie)) return "vulnerabilite";
  return essai < reprises ? "reprendre" : "panne";
}

function dormir(ms) {
  // Pause synchrone : ce script est un gardien de CI, il n'a rien à faire
  // pendant l'attente, et une boucle asynchrone n'ajouterait ici que du bruit.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function auditer(dossier) {
  const r = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["audit", "--audit-level=moderate"],
    { cwd: dossier, encoding: "utf8" },
  );
  return { code: r.status ?? 1, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * Le corps ne s'exécute que si le script est APPELÉ, jamais s'il est importé.
 * Sans cette garde, son test lancerait un vrai audit réseau à l'import.
 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dossier = process.argv[2] ?? ".";

  for (let essai = 1; essai <= REPRISES; essai++) {
    const { code, sortie } = auditer(dossier);
    process.stdout.write(sortie);

    const suite = verdict({ code, sortie, essai });

    if (suite === "propre") process.exit(0);

    if (suite === "vulnerabilite") {
      console.error(
        `\n❌ Vulnérabilité signalée dans « ${dossier} ». Ce n'est PAS une panne du service : aucune reprise.`,
      );
      process.exit(1);
    }

    if (suite === "reprendre") {
      const attente = ATTENTE_MS[essai - 1] ?? ATTENTE_MS.at(-1);
      console.error(
        `\n⚠️  Service d'avis npm injoignable (essai ${essai}/${REPRISES}) — nouvelle tentative dans ${attente / 1000} s.`,
      );
      dormir(attente);
    }
  }

  console.error(
    `\n❌ Le service d'avis de npm est resté injoignable après ${REPRISES} tentatives sur « ${dossier} ».\n` +
      `   Ce n'est PAS un verdict sur les dépendances : le lockfile n'a pas été jugé.\n` +
      `   Relancer ce job plus tard, ou décider sciemment de livrer sans cette garde.`,
  );
  process.exit(1);
}
