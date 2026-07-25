#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = path.join(root, "src");
const defaultBaseline = path.join(root, "scripts", "unsafe-casts-baseline.json");
const castPattern = /\bas\s+unknown\s+as\b/g;
const justificationPattern = /unsafe-cast-justification:\s*\S/i;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(absolute)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function normalizedRelative(base, file) {
  return path.relative(base, file).split(path.sep).join("/");
}

export function countUnjustifiedCasts(source) {
  const lines = source.split(/\r?\n/);
  let count = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const matches = lines[index].match(castPattern)?.length ?? 0;
    if (matches === 0) continue;

    const preceding = lines[index - 1] ?? "";
    const justified =
      justificationPattern.test(lines[index]) ||
      justificationPattern.test(preceding);
    if (!justified) count += matches;
  }

  return count;
}

export async function findUnsafeCastRegressions({
  sourceDirectory = defaultSource,
  baselineFile = defaultBaseline,
  repositoryRoot = root,
} = {}) {
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  const current = {};

  for (const file of await sourceFiles(sourceDirectory)) {
    const count = countUnjustifiedCasts(await readFile(file, "utf8"));
    if (count > 0) current[normalizedRelative(repositoryRoot, file)] = count;
  }

  return Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({
      file,
      baseline: baseline[file] ?? 0,
      current: count,
    }));
}

async function main() {
  const regressions = await findUnsafeCastRegressions();
  if (regressions.length === 0) {
    console.log("Aucun nouveau double cast TypeScript non justifié.");
    return;
  }

  console.error(
    "Nouveaux `as unknown as` détectés. Supprimez-les ou ajoutez " +
      "`unsafe-cast-justification: <raison>` sur la ligne précédente."
  );
  for (const regression of regressions) {
    console.error(
      `- ${regression.file}: ${regression.current} (baseline ${regression.baseline})`
    );
  }
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
