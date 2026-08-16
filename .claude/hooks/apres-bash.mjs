#!/usr/bin/env node
// Hook PostToolUse (Bash|PowerShell) — la parade du cache .vite (piège 12).
//
// LE DÉFAUT QU'IL GARDE : une suite Vitest qui rapporte « no tests » sur des
// dizaines de fichiers alors qu'elle est verte isolément. Cause : le cache
// `node_modules/.vite` corrompu — d'abord constaté après deux runs concurrents
// sur le même arbre Windows (261 fichiers « no tests »), puis réapparu SANS run
// concurrent l'après-midi du même jour. La consigne du CLAUDE.md est « au
// moindre "no tests", purger node_modules/.vite et rejouer AVANT de conclure
// quoi que ce soit sur l'état de la suite ».
//
// Le piège de ce symptôme est qu'il ressemble à un succès : la suite se termine
// sans erreur rouge, et on en tire « rien à exécuter, tout va bien ». D'où ce
// hook — il lit la SORTIE de la commande, pas son code de retour.
//
// Le hook n'échoue jamais bruyamment (code 0 quoi qu'il arrive).

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

try {
  const entree = JSON.parse((await lireEntree()) || "{}");
  const commande = String(entree?.tool_input?.command ?? "");

  // Seules les commandes de test nous intéressent : `npm test`, `npm run test…`,
  // `npx vitest run…`, `vitest`.
  if (!/\b(vitest|npm\s+(run\s+)?test)\b/i.test(commande)) process.exit(0);

  const reponse = entree?.tool_response ?? {};
  const sortie = [
    reponse.stdout,
    reponse.stderr,
    reponse.output,
    typeof reponse === "string" ? reponse : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!/no test (files )?found|no tests/i.test(sortie)) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "⚠️ « no tests » dans la sortie Vitest — c'est le symptôme du cache " +
          "`node_modules/.vite` corrompu (piège 12 du CLAUDE.md), pas forcément " +
          "une suite vide. NE PAS conclure sur l'état de la suite avant d'avoir " +
          `purgé et rejoué : \`rm -rf ${RACINE.split(path.sep).join("/")}/node_modules/.vite\` ` +
          "puis relancer la même commande. Si le second run est normal, le " +
          "premier résultat n'était qu'un artefact de cache.",
      },
    }),
  );
} catch {
  // Silence délibéré : voir l'en-tête.
}
process.exit(0);
