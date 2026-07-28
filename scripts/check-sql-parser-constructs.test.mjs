import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LEGACY_ALLOWLIST,
  findParserConstructViolations,
  findQualifiedConstructs,
  stripSqlComments,
} from "./check-sql-parser-constructs.mjs";

test("signale les quatre constructions du parseur", () => {
  const findings = findQualifiedConstructs(
    [
      "select pg_catalog.coalesce(a, b);",
      "select pg_catalog.greatest(a, b);",
      "select pg_catalog.least(a, b);",
      "select pg_catalog.nullif(a, b);",
    ].join("\n")
  );

  assert.deepEqual(
    findings.map((finding) => finding.construct),
    ["coalesce", "greatest", "least", "nullif"]
  );
});

test("laisse passer les vraies fonctions du catalogue", () => {
  // Ces quatre-là ont bien une entrée pg_proc : les qualifier est correct et
  // même nécessaire sous `set search_path = ''`.
  //
  // `strpos(a, b)` et non `position(a in b)` : `position` EXISTE bien dans le
  // catalogue, mais sa forme à `IN` est du sucre du parseur réservé au nom NON
  // qualifié — `pg_catalog.position(a in b)` est une erreur de syntaxe (cf.
  // a5b732e, qui tuait meta_progression.test.sql). Cette garde ne couvre pas
  // ce piège : elle ne balaye que supabase/migrations/ et ne juge que le nom,
  // pas la forme d'appel.
  assert.deepEqual(
    findQualifiedConstructs(
      "select pg_catalog.btrim(x), pg_catalog.array_length(y, 1)," +
        " pg_catalog.char_length(z), pg_catalog.strpos(a, b);"
    ),
    []
  );
});

test("ignore un motif cité dans un commentaire de ligne", () => {
  assert.deepEqual(
    findQualifiedConstructs(
      "-- 20260721150000 qualifiait `pg_catalog.nullif(...)` : NULLIF est une\n" +
        "-- construction du parseur.\nselect nullif(a, b);"
    ),
    []
  );
});

test("ignore un motif cité dans un commentaire de bloc imbriqué", () => {
  assert.deepEqual(
    findQualifiedConstructs(
      "/* historique /* imbriqué pg_catalog.least(a,b) */ encore */\n" +
        "select least(a, b);"
    ),
    []
  );
});

test("ne prend pas un tiret double dans une chaîne pour un commentaire", () => {
  const findings = findQualifiedConstructs(
    "select 'texte -- pas un commentaire', pg_catalog.coalesce(a, b);"
  );

  assert.deepEqual(
    findings.map((finding) => finding.construct),
    ["coalesce"]
  );
});

test("signale le SQL dynamique dans un corps dollar-quoté", () => {
  // Une chaîne exécutée casse tout autant à l'exécution : on la garde.
  const findings = findQualifiedConstructs(
    "create function f() returns int language plpgsql as $$\n" +
      "begin return pg_catalog.greatest(1, 2); end;\n$$;"
  );

  assert.deepEqual(
    findings.map((finding) => finding.construct),
    ["greatest"]
  );
});

test("reporte la ligne réelle malgré les commentaires retirés", () => {
  const findings = findQualifiedConstructs(
    "-- ligne 1\n-- ligne 2\nselect pg_catalog.nullif(a, b);"
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("tolère les espaces autour du point de qualification", () => {
  assert.equal(findQualifiedConstructs("select pg_catalog . coalesce(a,b);").length, 1);
});

test("balaye le dossier des migrations et épargne l'allowlist", async () => {
  const migrationsDirectory = await mkdtemp(path.join(os.tmpdir(), "lc-sql-"));
  await writeFile(
    path.join(migrationsDirectory, "20260101000000_neuve.sql"),
    "select pg_catalog.coalesce(a, b);\n"
  );
  await writeFile(
    path.join(migrationsDirectory, "20260102000000_legacy.sql"),
    "select pg_catalog.nullif(a, b);\n"
  );

  const violations = await findParserConstructViolations({
    migrationsDirectory,
    allowlist: new Map([["20260102000000_legacy.sql", "immuable, déjà corrigée"]]),
  });

  assert.deepEqual(violations, [
    {
      file: "20260101000000_neuve.sql",
      line: 1,
      construct: "coalesce",
      text: "select pg_catalog.coalesce(a, b);",
    },
  ]);
});

test("l'allowlist ne couvre que des migrations réellement corrigées", () => {
  // Verrou d'intention : l'allowlist est une dette historique fermée, pas une
  // porte ouverte. Toute nouvelle entrée doit être un choix conscient.
  assert.deepEqual(
    [...LEGACY_ALLOWLIST.keys()].sort(),
    [
      "20260721150000_contest_rules_and_awards.sql",
      "20260728120000_calendar_campaigns.sql",
    ]
  );
});

test("le dépôt réel ne contient aucune violation", async () => {
  assert.deepEqual(await findParserConstructViolations(), []);
});

test("stripSqlComments préserve le nombre de lignes", () => {
  assert.equal(
    stripSqlComments("select 1;\n-- commentaire\nselect 2;").split("\n").length,
    3
  );
});
