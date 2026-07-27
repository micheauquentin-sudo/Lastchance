import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MigrationOrderError,
  checkMigrationOrder,
  extractExpectedMigration,
  parseMigrationFilename,
  validateMigrationInventory,
} from "./check-migration-order.mjs";

const OLD_HEAD = "20260804120000";
const NEXT_HEAD = "20260805120000";

function git(repoRoot, ...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function writeMigration(repoRoot, fileName, body = "select 1;\n") {
  writeFileSync(
    join(repoRoot, "supabase", "migrations", fileName),
    body,
    "utf8",
  );
}

function writeExpectedMigration(repoRoot, id) {
  writeFileSync(
    join(repoRoot, "src", "lib", "release.ts"),
    `export const EXPECTED_MIGRATION = "${id}";\n`,
    "utf8",
  );
}

function createRepository() {
  const repoRoot = mkdtempSync(join(tmpdir(), "lastchance-migrations-"));
  mkdirSync(join(repoRoot, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(repoRoot, "src", "lib"), { recursive: true });
  writeMigration(repoRoot, `${OLD_HEAD}_baseline.sql`);
  writeExpectedMigration(repoRoot, OLD_HEAD);
  git(repoRoot, "init");
  git(repoRoot, "config", "core.autocrlf", "false");
  git(repoRoot, "config", "user.email", "migration-test@example.invalid");
  git(repoRoot, "config", "user.name", "Migration Test");
  git(repoRoot, "add", ".");
  git(repoRoot, "commit", "-m", "baseline");
  return { repoRoot, base: git(repoRoot, "rev-parse", "HEAD") };
}

function withRepository(run) {
  const fixture = createRepository();
  try {
    run(fixture);
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
}

test("parse un nom de migration et rejette un identifiant non numérique", () => {
  assert.deepEqual(parseMigrationFilename("00024_comp_access.sql"), {
    fileName: "00024_comp_access.sql",
    id: "00024",
    description: "comp_access",
  });
  assert.throws(
    () => parseMigrationFilename("migration_sans_version.sql"),
    MigrationOrderError,
  );
  assert.throws(
    () => parseMigrationFilename("00025_nom avec espace.sql"),
    MigrationOrderError,
  );
});

test("rejette les identifiants numériques et noms dupliqués", () => {
  assert.throws(
    () =>
      validateMigrationInventory([
        "00001_initial.sql",
        "1_duplicate.sql",
      ]),
    /identifiant numérique 1 dupliqué/,
  );
  assert.throws(
    () =>
      validateMigrationInventory([
        "00001_initial.sql",
        "00001_INITIAL.SQL",
      ]),
    /noms de migration non uniques/,
  );
});

test("exige une unique EXPECTED_MIGRATION numérique", () => {
  assert.equal(
    extractExpectedMigration(
      'export const EXPECTED_MIGRATION = "20260804120000";',
    ),
    OLD_HEAD,
  );
  assert.throws(
    () => extractExpectedMigration("export const EXPECTED_MIGRATION = latest;"),
    /exactement une constante numérique/,
  );
});

test("accepte uniquement une nouvelle migration après l'ancien head", () => {
  withRepository(({ repoRoot, base }) => {
    writeMigration(repoRoot, `${NEXT_HEAD}_next.sql`);
    writeExpectedMigration(repoRoot, NEXT_HEAD);

    const result = checkMigrationOrder({ repoRoot, baseRef: base });
    assert.equal(result.latest, NEXT_HEAD);
    assert.equal(result.expectedMigration, NEXT_HEAD);
    assert.equal(result.baseCommit, base);
  });
});

test("rejette une nouvelle migration antérieure à l'ancien head", () => {
  withRepository(({ repoRoot, base }) => {
    const lowerId = "20260803130000";
    writeMigration(repoRoot, `${lowerId}_late_backfill.sql`);

    assert.throws(
      () => checkMigrationOrder({ repoRoot, baseRef: base }),
      new RegExp(
        `identifiant ${lowerId} n'est pas strictement supérieur à l'ancien head ${OLD_HEAD}`,
      ),
    );
  });
});

test("rejette la modification d'une migration existante", () => {
  withRepository(({ repoRoot, base }) => {
    writeMigration(
      repoRoot,
      `${OLD_HEAD}_baseline.sql`,
      "select 'modified';\n",
    );

    assert.throws(
      () => checkMigrationOrder({ repoRoot, baseRef: base }),
      /existait dans la base et a été modifiée/,
    );
  });
});

test("rejette la suppression d'une migration existante", () => {
  withRepository(({ repoRoot, base }) => {
    unlinkSync(
      join(repoRoot, "supabase", "migrations", `${OLD_HEAD}_baseline.sql`),
    );
    writeMigration(repoRoot, `${NEXT_HEAD}_replacement.sql`);
    writeExpectedMigration(repoRoot, NEXT_HEAD);

    assert.throws(
      () => checkMigrationOrder({ repoRoot, baseRef: base }),
      /a été supprimée ou renommée/,
    );
  });
});

test("rejette le renommage d'une migration existante", () => {
  withRepository(({ repoRoot, base }) => {
    renameSync(
      join(repoRoot, "supabase", "migrations", `${OLD_HEAD}_baseline.sql`),
      join(repoRoot, "supabase", "migrations", `${OLD_HEAD}_renamed.sql`),
    );

    assert.throws(
      () => checkMigrationOrder({ repoRoot, baseRef: base }),
      /a été supprimée ou renommée/,
    );
  });
});

test("rejette un EXPECTED_MIGRATION désynchronisé", () => {
  withRepository(({ repoRoot }) => {
    writeMigration(repoRoot, `${NEXT_HEAD}_next.sql`);

    assert.throws(
      () => checkMigrationOrder({ repoRoot }),
      new RegExp(
        `EXPECTED_MIGRATION vaut ${OLD_HEAD}, mais la dernière migration est ${NEXT_HEAD}`,
      ),
    );
  });
});
