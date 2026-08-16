#!/usr/bin/env node
// Hook Stop — le rappel du journal partagé.
//
// CE QU'IL GARDE : `docs/codex-handoff.md` est le journal partagé unique du
// dépôt, et la règle de travail veut qu'une entrée datée y soit ajoutée à chaque
// avancée significative d'un lot. C'est la première chose oubliée en fin de
// chantier, et la seule qu'aucun test ne rattrape — un chantier livré sans
// entrée de journal ne se voit qu'à la relecture suivante, quand le contexte est
// déjà perdu.
//
// CE QU'IL NE FAIT PAS : il ne bloque rien (pas de `decision: block`) et ne
// regarde PAS l'arbre de travail — sinon il crierait à chaque édition en cours
// de route. Il ne parle que lorsqu'il existe des COMMITS au-dessus de
// `origin/main` touchant `src/` ou `supabase/` sans que le journal ait bougé
// dans ces mêmes commits : à ce moment-là, du travail réel existe sans trace.
//
// Silencieux sur toute erreur (dépôt en état inhabituel, pas de remote…).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const JOURNAL = "docs/codex-handoff.md";

// Surchargeable — d'abord pour que ce hook soit TESTABLE au tuyau sans fabriquer
// un faux origin/main, ensuite pour un dépôt dont la base porte un autre nom.
const BASE = process.env.LASTCHANCE_HOOK_BASE || "origin/main";

const git = (...args) =>
  spawnSync("git", args, { cwd: RACINE, encoding: "utf8", timeout: 15_000 });

try {
  // Pas de base de comparaison utilisable → on se tait.
  if (git("rev-parse", "--verify", "--quiet", BASE).status !== 0) {
    process.exit(0);
  }

  const r = git("diff", "--name-only", `${BASE}...HEAD`);
  if (r.status !== 0) process.exit(0);

  const fichiers = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (fichiers.length === 0) process.exit(0); // rien au-dessus de main

  const codeTouche = fichiers.some((f) => /^(src|supabase)\//.test(f));
  const journalTouche = fichiers.includes(JOURNAL);

  if (codeTouche && !journalTouche) {
    const branche = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim() || "?";
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          `📓 ${fichiers.length} fichier(s) modifiés sur \`${branche}\` au-dessus ` +
          `de ${BASE}, dont du code, mais ${JOURNAL} n'a pas bougé. ` +
          "La règle du dépôt demande une entrée datée (lot, branche/commits, état, " +
          "validations réellement exécutées, risque, prochaine action).",
      }),
    );
  }
} catch {
  // Silence délibéré : voir l'en-tête.
}
process.exit(0);
