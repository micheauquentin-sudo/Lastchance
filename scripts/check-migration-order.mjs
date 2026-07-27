#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const MIGRATIONS_DIRECTORY = "supabase/migrations";
const RELEASE_FILE = "src/lib/release.ts";
const MIGRATION_NAME = /^(\d+)_([A-Za-z0-9][A-Za-z0-9_-]*)\.sql$/;
const EXPECTED_MIGRATION_DECLARATION =
  /export\s+const\s+EXPECTED_MIGRATION\s*=\s*["'](\d+)["']\s*;/g;

export class MigrationOrderError extends Error {
  constructor(messages) {
    const details = Array.isArray(messages) ? messages : [messages];
    super(
      [
        "Contrôle de l'ordre des migrations en échec :",
        ...details.map((message) => `- ${message}`),
      ].join("\n"),
    );
    this.name = "MigrationOrderError";
    this.details = details;
  }
}

function canonicalNumericId(id) {
  return id.replace(/^0+(?=\d)/, "");
}

function compareNumericIds(left, right) {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function parseMigrationFilename(fileName) {
  const match = MIGRATION_NAME.exec(fileName);
  if (!match) {
    throw new MigrationOrderError(
      `${fileName} doit respecter <identifiant_numérique>_<nom>.sql.`,
    );
  }

  const [, id, description] = match;
  if (BigInt(id) === 0n) {
    throw new MigrationOrderError(
      `${fileName} utilise l'identifiant nul, qui n'est pas une version valide.`,
    );
  }

  return { fileName, id, description };
}

export function validateMigrationInventory(fileNames, label = "dossier courant") {
  const errors = [];
  const entries = [];
  const names = new Map();
  const ids = new Map();

  for (const fileName of fileNames) {
    const normalizedName = fileName.toLocaleLowerCase("en-US");
    const duplicateName = names.get(normalizedName);
    if (duplicateName) {
      errors.push(
        `noms de migration non uniques dans ${label} : ${duplicateName} et ${fileName}.`,
      );
    } else {
      names.set(normalizedName, fileName);
    }

    try {
      const entry = parseMigrationFilename(fileName);
      entries.push(entry);

      const canonicalId = canonicalNumericId(entry.id);
      const duplicateId = ids.get(canonicalId);
      if (duplicateId) {
        errors.push(
          `identifiant numérique ${entry.id} dupliqué dans ${label} : ${duplicateId} et ${fileName}.`,
        );
      } else {
        ids.set(canonicalId, fileName);
      }
    } catch (error) {
      if (error instanceof MigrationOrderError) {
        errors.push(...error.details);
      } else {
        throw error;
      }
    }
  }

  if (entries.length === 0) {
    errors.push(`aucune migration SQL trouvée dans ${label}.`);
  }

  if (errors.length > 0) {
    throw new MigrationOrderError(errors);
  }

  entries.sort((left, right) => compareNumericIds(left.id, right.id));
  return {
    entries,
    latest: entries.at(-1),
  };
}

export function extractExpectedMigration(releaseSource) {
  const matches = [...releaseSource.matchAll(EXPECTED_MIGRATION_DECLARATION)];
  if (matches.length !== 1) {
    throw new MigrationOrderError(
      `${RELEASE_FILE} doit déclarer exactement une constante numérique EXPECTED_MIGRATION.`,
    );
  }
  return matches[0][1];
}

export function validateExpectedMigration(releaseSource, inventory) {
  const expected = extractExpectedMigration(releaseSource);
  const latest = inventory.latest.id;
  if (expected !== latest) {
    throw new MigrationOrderError(
      `EXPECTED_MIGRATION vaut ${expected}, mais la dernière migration est ${latest} (${inventory.latest.fileName}).`,
    );
  }
  return expected;
}

function runGit(repoRoot, args, acceptedStatuses = [0]) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new MigrationOrderError(
      `impossible d'exécuter git ${args.join(" ")} : ${result.error.message}`,
    );
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new MigrationOrderError(
      `git ${args.join(" ")} a échoué${detail ? ` : ${detail}` : "."}`,
    );
  }
  return result;
}

function readCurrentMigrationNames(repoRoot) {
  const directory = join(repoRoot, MIGRATIONS_DIRECTORY);
  const entries = readdirSync(directory, { withFileTypes: true });
  const errors = [];
  const names = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      errors.push(
        `${MIGRATIONS_DIRECTORY}/${entry.name} n'est pas un fichier de migration ordinaire.`,
      );
      continue;
    }
    if (!entry.name.endsWith(".sql")) {
      errors.push(
        `${MIGRATIONS_DIRECTORY}/${entry.name} n'est pas une migration .sql.`,
      );
      continue;
    }
    names.push(entry.name);
  }

  if (errors.length > 0) {
    throw new MigrationOrderError(errors);
  }
  return names;
}

function resolveBaseCommit(repoRoot, baseRef) {
  const revision = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    `${baseRef}^{commit}`,
  ]).stdout.trim();

  const ancestorCheck = runGit(
    repoRoot,
    ["merge-base", "--is-ancestor", revision, "HEAD"],
    [0, 1],
  );
  if (ancestorCheck.status !== 0) {
    throw new MigrationOrderError(
      `la base ${baseRef} (${revision}) n'est pas un ancêtre de HEAD ; fournissez le SHA de base de la PR ou github.event.before pour un push.`,
    );
  }
  return revision;
}

function readBaseMigrationNames(repoRoot, baseCommit) {
  const output = runGit(repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    baseCommit,
    "--",
    MIGRATIONS_DIRECTORY,
  ]).stdout;
  const prefix = `${MIGRATIONS_DIRECTORY}/`;
  const errors = [];
  const names = [];

  for (const path of output.split(/\r?\n/).filter(Boolean)) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const relativePath = path.slice(prefix.length);
    if (relativePath.includes("/")) {
      errors.push(`${path} est imbriqué ; les migrations doivent être à plat.`);
      continue;
    }
    if (!relativePath.endsWith(".sql")) {
      errors.push(`${path} n'est pas une migration .sql.`);
      continue;
    }
    names.push(relativePath);
  }

  if (errors.length > 0) {
    throw new MigrationOrderError(errors);
  }
  return names;
}

export function validateChangesSinceBase({
  baseInventory,
  baseNames,
  currentInventory,
  currentNames,
  isModified,
}) {
  const errors = [];
  const baseSet = new Set(baseNames);
  const currentSet = new Set(currentNames);

  for (const fileName of baseNames) {
    if (!currentSet.has(fileName)) {
      errors.push(
        `${fileName} existait dans la base et a été supprimée ou renommée ; une migration appliquée est immuable.`,
      );
    } else if (isModified(fileName)) {
      errors.push(
        `${fileName} existait dans la base et a été modifiée ; ajoutez une nouvelle migration corrective.`,
      );
    }
  }

  const oldHead = baseInventory.latest.id;
  for (const entry of currentInventory.entries) {
    if (
      !baseSet.has(entry.fileName) &&
      compareNumericIds(entry.id, oldHead) <= 0
    ) {
      errors.push(
        `${entry.fileName} est nouvelle mais son identifiant ${entry.id} n'est pas strictement supérieur à l'ancien head ${oldHead}.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new MigrationOrderError(errors);
  }
}

export function checkMigrationOrder({ repoRoot = process.cwd(), baseRef } = {}) {
  const resolvedRoot = resolve(repoRoot);
  const currentNames = readCurrentMigrationNames(resolvedRoot);
  const currentInventory = validateMigrationInventory(currentNames);
  const releaseSource = readFileSync(join(resolvedRoot, RELEASE_FILE), "utf8");
  const expectedMigration = validateExpectedMigration(
    releaseSource,
    currentInventory,
  );

  let baseCommit;
  if (baseRef) {
    baseCommit = resolveBaseCommit(resolvedRoot, baseRef);
    const baseNames = readBaseMigrationNames(resolvedRoot, baseCommit);
    const baseInventory = validateMigrationInventory(
      baseNames,
      `base Git ${baseCommit}`,
    );

    validateChangesSinceBase({
      baseInventory,
      baseNames,
      currentInventory,
      currentNames,
      isModified(fileName) {
        const result = runGit(
          resolvedRoot,
          [
            "diff",
            "--quiet",
            "--no-ext-diff",
            baseCommit,
            "--",
            `${MIGRATIONS_DIRECTORY}/${fileName}`,
          ],
          [0, 1],
        );
        return result.status === 1;
      },
    });
  }

  return {
    count: currentInventory.entries.length,
    latest: currentInventory.latest.id,
    expectedMigration,
    baseCommit,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new MigrationOrderError("--base attend un SHA ou une ref Git.");
      }
      options.baseRef = value;
      index += 1;
    } else if (argument.startsWith("--base=")) {
      options.baseRef = argument.slice("--base=".length);
      if (!options.baseRef) {
        throw new MigrationOrderError("--base attend un SHA ou une ref Git.");
      }
    } else {
      throw new MigrationOrderError(`argument inconnu : ${argument}.`);
    }
  }
  return options;
}

function main() {
  try {
    const result = checkMigrationOrder(parseArguments(process.argv.slice(2)));
    const baseMessage = result.baseCommit
      ? ` Base comparée : ${result.baseCommit}.`
      : "";
    console.log(
      `Migrations valides : ${result.count} fichiers, head ${result.latest}, EXPECTED_MIGRATION synchronisée.${baseMessage}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Erreur inconnue : ${error}`;
    console.error(message);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main();
}
