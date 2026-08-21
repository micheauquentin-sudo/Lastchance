#!/usr/bin/env node
// Hook PreToolUse (run_command) — la garde de concurrence sur les runs de test.
//
// LE DÉFAUT QU'IL GARDE (piège 12 du dépôt) : deux runs Vitest concurrents sur
// le même arbre Windows corrompent `node_modules/.vite` et rendent
// **261 fichiers « no tests »** alors que la suite est verte isolément. Le
// symptôme ressemble à un succès — la suite finit sans rouge — et on en tire
// « rien à exécuter, tout va bien ». Côté WSL, le même télescopage sur `.next`
// donne `ENOENT _buildManifest` / `TurbopackInternalError` (piège 9).
//
// CE QU'IL NE FAIT PAS, délibérément : il n'émet JAMAIS `decision: "allow"`.
// Un hook qui approuve d'office élargirait la politique de permissions de
// l'utilisateur à toutes les commandes qu'il croise — un `rm -rf` inclus. Il ne
// sait dire que deux choses : « demande confirmation » (`ask`) quand un run
// semble déjà en cours, ou rien du tout (`{}`, comportement par défaut).
//
// PORTÉE HONNÊTE : le verrou ne voit que les commandes passées par CET agent.
// Une session Claude Code ou un terminal humain qui lance Vitest en parallèle
// reste invisible — d'où le rappel du piège 12 en toutes lettres dans le motif.

import { entree, repondre, lireEtat, ecrireEtat } from "./commun.mjs";

const VERROU = "verrou-tests.json";
const FRAICHEUR_MS = 30 * 60 * 1000; // au-delà, on considère le run mort

const EST_TEST = /\b(vitest|playwright|npm\s+(run\s+)?test|run-e2e-local)\b/i;

try {
  const e = await entree();
  const commande = String(e?.toolCall?.args?.CommandLine ?? e?.toolCall?.args?.commandLine ?? "");

  if (!commande || !EST_TEST.test(commande)) repondre({});

  const verrou = lireEtat(VERROU);
  const age = verrou?.ts ? Date.now() - verrou.ts : Infinity;

  if (verrou?.ts && age < FRAICHEUR_MS) {
    repondre({
      decision: "ask",
      reason:
        "⚠️ Un run de test semble DÉJÀ en cours sur cet arbre depuis " +
        `${Math.round(age / 1000)} s : \`${String(verrou.commande).slice(0, 120)}\`.\n\n` +
        "Deux runs concurrents sur le même arbre corrompent le cache " +
        "`node_modules/.vite` — la suite rend alors « no tests » sur des dizaines " +
        "de fichiers tout en paraissant verte (piège 12 du dépôt). Attendre la fin " +
        "du premier run, ou utiliser l'autre arbre (`~/workspaces/lastchance` en WSL " +
        "si celui-ci est l'arbre Windows).\n\n" +
        "Si le run précédent est mort, poursuivre est sans risque.",
    });
  }

  ecrireEtat(VERROU, { ts: Date.now(), commande: commande.slice(0, 200) });
} catch {
  // Silence délibéré : voir l'en-tête de commun.mjs.
}
repondre({});
