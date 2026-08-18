import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  countUnjustifiedCasts,
  findUnsafeCastRegressions,
} from "./check-unsafe-casts.mjs";

test("compte les doubles casts sans justification", () => {
  assert.equal(
    countUnjustifiedCasts(
      "const first = value as unknown as Foo;\nconst second = value as Bar;"
    ),
    1
  );
});

test("compte aussi les `as any`, sans double compte du composé", () => {
  assert.equal(
    countUnjustifiedCasts(
      "const first = value as any;\n" +
        "const second = value as unknown as any;\n" +
        "// unsafe-cast-justification: mock volontairement partiel\n" +
        "const third = value as any;"
    ),
    2
  );
});

test("ignore une justification explicite sur la ligne précédente", () => {
  assert.equal(
    countUnjustifiedCasts(
      "// unsafe-cast-justification: mock volontairement partiel\n" +
        "const value = partial as unknown as Complete;"
    ),
    0
  );
});

test("signale un nouveau fichier qui introduit un double cast", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "lc-casts-"));
  const sourceDirectory = path.join(repositoryRoot, "src");
  const baselineFile = path.join(repositoryRoot, "baseline.json");
  await mkdir(sourceDirectory);
  await writeFile(
    path.join(sourceDirectory, "new.ts"),
    "const value = partial as unknown as Complete;\n"
  );
  await writeFile(baselineFile, "{}\n");

  assert.deepEqual(
    await findUnsafeCastRegressions({
      sourceDirectory,
      baselineFile,
      repositoryRoot,
    }),
    [{ file: "src/new.ts", baseline: 0, current: 1 }]
  );
});

test("accepte une réduction progressive de la dette existante", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "lc-casts-"));
  const sourceDirectory = path.join(repositoryRoot, "src");
  const baselineFile = path.join(repositoryRoot, "baseline.json");
  await mkdir(sourceDirectory);
  await writeFile(
    path.join(sourceDirectory, "legacy.ts"),
    "const value = partial as unknown as Complete;\n"
  );
  await writeFile(
    baselineFile,
    `${JSON.stringify({ "src/legacy.ts": 2 }, null, 2)}\n`
  );

  assert.deepEqual(
    await findUnsafeCastRegressions({
      sourceDirectory,
      baselineFile,
      repositoryRoot,
    }),
    []
  );
});
