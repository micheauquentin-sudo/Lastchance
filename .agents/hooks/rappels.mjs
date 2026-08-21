#!/usr/bin/env node
// Hook PreInvocation — les réflexes d'après-écriture, portés sur Antigravity.
//
// POURQUOI ICI ET PAS DANS PostToolUse. Le portage direct du hook Claude
// `apres-ecriture.mjs` est impossible : le contrat PostToolUse d'Antigravity ne
// transmet pas le chemin du fichier écrit, et n'admet qu'une sortie vide. Seul
// `PreInvocation` peut injecter du contexte (`injectSteps`).
//
// Ce détour rend le garde MEILLEUR que l'original, et c'est le point : il ne
// déclenche plus sur « l'outil Edit a touché tel chemin » mais sur l'état réel
// de l'arbre lu par `git status`. Une migration modifiée à la main, par un
// script, ou par une autre session est donc couverte aussi — l'original ne
// voyait que ses propres écritures.
//
// Deux réflexes, tirés de défauts réellement payés sur ce dépôt :
//
//  1. Migration touchée → les DEUX gardes statiques jouées sur-le-champ. Elles
//     ne demandent ni Docker ni base : elles échouent en secondes là où la CI
//     met huit minutes. `pg_catalog.COALESCE(...)` passe l'application de la
//     migration et casse au premier appel réel.
//  2. Migration touchée → régénérer les types avec `--local`. `npm run
//     types:generate` interroge la PRODUCTION, où les migrations de la branche
//     ne sont pas appliquées ; sans cela les clients serveur deviennent non
//     typés et seule la CI l'attrape.
//
// ANTI-HARCÈLEMENT. `PreInvocation` se déclenche avant CHAQUE appel au modèle.
// Répéter le même rappel à chaque tour le rendrait invisible à force. On ne
// réinjecte donc que lorsque la SIGNATURE de la situation change (liste des
// fichiers concernés + verdict des gardes), mémorisée par conversation.

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { entree, repondre, git, RACINE, lireEtat, ecrireEtat } from "./commun.mjs";

const BUDGET_CLAUDE_MD = 22_000; // doit suivre src/lib/claude-md-budget.test.ts

function garde(script) {
  const r = spawnSync(process.execPath, [path.join("scripts", script)], {
    cwd: RACINE,
    encoding: "utf8",
    timeout: 45_000,
  });
  if (r.status === 0) return null;
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return sortie.slice(0, 1200) || `${script} a échoué (code ${r.status}).`;
}

try {
  const e = await entree();
  const conversation = String(e?.conversationId ?? "sans-id").replace(/[^a-zA-Z0-9_-]/g, "");

  const statut = git("status", "--porcelain");
  if (statut.status !== 0) repondre({});

  const modifies = statut.stdout
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ").pop() : l));

  const migrations = modifies.filter((f) => /^supabase\/migrations\/.+\.sql$/i.test(f));
  const claudeMdTouche = modifies.includes("CLAUDE.md");

  if (migrations.length === 0 && !claudeMdTouche) repondre({});

  const messages = [];

  if (migrations.length > 0) {
    for (const script of ["check-sql-parser-constructs.mjs", "check-migration-order.mjs"]) {
      const echec = garde(script);
      if (echec) messages.push(`❌ \`${script}\` échoue DÉJÀ en local :\n${echec}`);
    }
    messages.push(
      `📐 ${migrations.length} migration(s) modifiée(s) — régénérer les types AVANT de pousser : ` +
        "`node scripts/generate-db-types.mjs --local` (surtout pas `npm run types:generate`, " +
        "qui interroge la production), puis commiter `src/types/database.generated.ts`. " +
        "Sans ça, la dérive n'est vue qu'en CI.",
    );
  }

  if (claudeMdTouche) {
    let octets = 0;
    try {
      octets = statSync(path.join(RACINE, "CLAUDE.md")).size;
    } catch {
      /* ignoré */
    }
    const reste = BUDGET_CLAUDE_MD - octets;
    messages.push(
      `📏 CLAUDE.md modifié — ${octets} octets sur un plafond de ${BUDGET_CLAUDE_MD} ` +
        `(${reste >= 0 ? `${reste} de marge` : `DÉPASSEMENT de ${-reste}`}). ` +
        "Jouer `npx vitest run src/lib/claude-md-budget.test.ts` avant de pousser. " +
        "Ne pas relever le plafond pour faire passer un ajout : le dernier chantier " +
        "REMPLACE le précédent, qui part en tête de `docs/journal.md`.",
    );
  }

  if (messages.length === 0) repondre({});

  // Même situation qu'au tour précédent → on se tait.
  const signature = `${migrations.sort().join("|")}::${claudeMdTouche}::${messages.length}::${messages.join("").length}`;
  const nomEtat = `rappels-${conversation}.json`;
  if (lireEtat(nomEtat)?.signature === signature) repondre({});
  ecrireEtat(nomEtat, { signature, ts: Date.now() });

  repondre({ injectSteps: [{ ephemeralMessage: messages.join("\n\n") }] });
} catch {
  // Silence délibéré : voir l'en-tête de commun.mjs.
}
repondre({});
