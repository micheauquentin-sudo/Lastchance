#!/usr/bin/env node
// ============================================================
// Génération déterministe de src/types/database.generated.ts
//
// Utilisé par `npm run types:generate` (mode --linked, PROD) ET
// par le step CI « Types TypeScript — dérive schéma vs snapshot »
// (mode --local, migrations). La sortie de `supabase gen types
// typescript` est normalisée pour que la comparaison CI soit un
// diff byte à byte, sans exclusion `-I` :
//   1. suppression du bloc `__InternalSupabase` et de ses deux
//      lignes de commentaire — il décrit la version du serveur
//      PostgREST (prod vs image locale), pas le schéma ;
//   2. fins de ligne LF, UTF-8 sans BOM ;
//   3. exactement une newline finale.
//
// Usage :
//   node scripts/generate-db-types.mjs           # --linked (défaut)
//   node scripts/generate-db-types.mjs --local   # CI, base locale
// ============================================================

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "types", "database.generated.ts");
const mode = process.argv.includes("--local") ? "--local" : "--linked";
const genArgs = ["gen", "types", "typescript", mode];
const isWindows = process.platform === "win32";

// CI : `supabase` sur le PATH (supabase/setup-cli). Local : CLI
// disponible uniquement via `npx --no-install supabase`.
function resolveCli() {
  const candidates = [
    ["supabase", []],
    ["npx", ["--no-install", "supabase"]],
  ];
  for (const [cmd, prefix] of candidates) {
    const probe = spawnSync(cmd, [...prefix, "--version"], {
      cwd: root,
      encoding: "utf8",
      shell: isWindows,
    });
    if (!probe.error && probe.status === 0) return [cmd, prefix];
  }
  return null;
}

const cli = resolveCli();
if (!cli) {
  console.error(
    "CLI Supabase introuvable (ni `supabase` sur le PATH, ni via `npx --no-install supabase`)."
  );
  process.exit(1);
}

const [cmd, prefix] = cli;
const result = spawnSync(cmd, [...prefix, ...genArgs], {
  cwd: root,
  encoding: "utf8",
  shell: isWindows,
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error || result.status !== 0 || !result.stdout) {
  console.error(`Échec de \`supabase ${genArgs.join(" ")}\`.`);
  if (result.stderr) console.error(result.stderr);
  if (result.error) console.error(String(result.error));
  process.exit(1);
}

let out = result.stdout;

// UTF-8 sans BOM, fins de ligne LF.
if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

// Suppression du bloc __InternalSupabase et des lignes de
// commentaire `//` qui le précèdent immédiatement.
const lines = out.split("\n");
const start = lines.findIndex((line) =>
  line.trim().startsWith("__InternalSupabase:")
);
if (start !== -1) {
  let from = start;
  while (from > 0 && lines[from - 1].trim().startsWith("//")) from -= 1;
  let end = start;
  let depth = 0;
  for (let i = start; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) ?? []).length;
    depth -= (lines[i].match(/\}/g) ?? []).length;
    if (depth <= 0) {
      end = i;
      break;
    }
  }
  lines.splice(from, end - from + 1);
  out = lines.join("\n");
}

// Exactement une newline finale.
out = out.replace(/\s+$/u, "") + "\n";

writeFileSync(target, out, { encoding: "utf8" });
console.log(`Types générés (${mode}) → ${path.relative(root, target)}`);
