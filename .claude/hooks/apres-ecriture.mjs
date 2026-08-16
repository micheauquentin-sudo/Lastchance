#!/usr/bin/env node
// Hook PostToolUse (Write|Edit) — les réflexes d'après-écriture.
//
// POURQUOI UN HOOK PLUTÔT QU'UNE LIGNE DE PLUS DANS CLAUDE.md : une consigne
// écrite doit être relue et appliquée à chaque passage, et le jour où elle ne
// l'est pas, personne ne le sait avant la CI. Ce fichier s'exécute, lui.
//
// Deux réflexes, tirés de défauts réellement payés sur ce dépôt :
//
//  1. Une migration touchée → les DEUX gardes statiques sont jouées sur-le-champ
//     (`check-sql-parser-constructs`, `check-migration-order`). Elles ne
//     demandent ni Docker ni base : elles échouent en secondes là où la CI met
//     huit minutes. COALESCE/GREATEST/LEAST/NULLIF qualifiés en `pg_catalog.`
//     passent l'application de la migration et cassent au premier appel réel —
//     c'est exactement le genre d'erreur qu'on ne veut pas découvrir en ligne.
//
//  2. Une migration touchée → rappel de régénérer les types. `npm run
//     types:generate` interroge la PRODUCTION (--linked), où les migrations de
//     la branche ne sont pas appliquées ; la bonne commande est
//     `node scripts/generate-db-types.mjs --local`. Sans ça, les clients
//     serveur deviennent non typés et seule la CI l'attrape.
//
// Le hook n'échoue JAMAIS bruyamment : toute erreur interne sort en silence,
// code 0. Un hook cassé qui bloque le travail est pire que pas de hook.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function lireEntree() {
  return new Promise((resoudre) => {
    let brut = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (brut += c));
    process.stdin.on("end", () => resoudre(brut));
    process.stdin.on("error", () => resoudre(""));
  });
}

function garde(script) {
  const r = spawnSync(process.execPath, [path.join("scripts", script)], {
    cwd: RACINE,
    encoding: "utf8",
    timeout: 45_000,
  });
  if (r.status === 0) return null;
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return sortie.slice(0, 1500) || `${script} a échoué (code ${r.status}).`;
}

try {
  const entree = JSON.parse((await lireEntree()) || "{}");
  const chemin =
    entree?.tool_response?.filePath ?? entree?.tool_input?.file_path ?? "";
  if (!chemin) process.exit(0);

  const relatif = path.relative(RACINE, path.resolve(chemin)).split(path.sep).join("/");
  const messages = [];

  if (/^supabase\/migrations\/.+\.sql$/i.test(relatif)) {
    for (const script of [
      "check-sql-parser-constructs.mjs",
      "check-migration-order.mjs",
    ]) {
      const echec = garde(script);
      if (echec) messages.push(`❌ \`${script}\` échoue déjà en local :\n${echec}`);
    }
    messages.push(
      "Migration touchée — régénérer les types AVANT de pousser : " +
        "`node scripts/generate-db-types.mjs --local` (pas `npm run types:generate`, " +
        "qui interroge la production), puis commiter `src/types/database.generated.ts`. " +
        "Sans ça, la dérive n'est vue qu'en CI.",
    );
  }

  if (relatif === "CLAUDE.md") {
    messages.push(
      "CLAUDE.md modifié — le plafond de tokens est gardé mécaniquement : " +
        "jouer `npx vitest run src/lib/claude-md-budget.test.ts` avant de pousser.",
    );
  }

  if (messages.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: messages.join("\n\n"),
        },
      }),
    );
  }
} catch {
  // Silence délibéré : voir l'en-tête.
}
process.exit(0);
