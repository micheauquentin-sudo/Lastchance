import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  construireCiblesCadence,
  evaluerMetriquesObligatoires,
  lireArgs,
  qualifierRapport,
  sembleProduction,
  validerReponseEvenement,
} from "./capacity-bench.mjs";

const scriptPath = fileURLToPath(new URL("./capacity-bench.mjs", import.meta.url));

test("parse les options booléennes et valorisées", () => {
  assert.deepEqual(lireArgs(["--ecrire", "--mode", "cadence", "reste"]), {
    _: ["reste"],
    ecrire: true,
    mode: "cadence",
  });
});

test("dérive un débit open-loop de la population et de la cadence", () => {
  assert.deepEqual(
    construireCiblesCadence({ joueurs: "100,500", intervalleMs: 2_500 }),
    [
      { joueurs: 100, cibleReqParS: 40, intervalleMs: 2_500 },
      { joueurs: 500, cibleReqParS: 200, intervalleMs: 2_500 },
    ],
  );
  assert.throws(
    () => construireCiblesCadence({ joueurs: "100", rps: "50", intervalleMs: 2_500 }),
    /contredit/,
  );
});

test("refuse un HTTP 200 dont l'état événement est faux", () => {
  const sessionId = "e2ed0000-0000-4000-8000-000000000021";
  assert.deepEqual(
    validerReponseEvenement({
      status: 200,
      body: `1:{"state":"ok","session":{"id":"${sessionId}","phase":"question_active"}}`,
      sessionId,
      phaseAttendue: "question_active",
    }),
    { ok: true, raison: null },
  );
  assert.equal(
    validerReponseEvenement({
      status: 200,
      body: '1:{"state":"unavailable"}',
      sessionId,
      phaseAttendue: "question_active",
    }).raison,
    "etat_non_ok",
  );
});

test("ne transforme jamais quatre métriques déclarées en GO automatique", () => {
  const runId = "capacity-1";
  assert.equal(evaluerMetriquesObligatoires(null, runId).verdict, "NON_QUALIFIABLE");
  const metrics = Object.fromEntries(
    ["realtime", "cpu", "ram", "database"].map((name) => [
      name,
      { status: "go", source: `provider:${name}` },
    ]),
  );
  assert.equal(
    evaluerMetriquesObligatoires({ run_id: runId, ...metrics }, runId).verdict,
    "EVIDENCE_COMPLETE",
  );
  metrics.database.status = "no_go";
  assert.equal(
    evaluerMetriquesObligatoires({ run_id: runId, ...metrics }, runId).verdict,
    "NO_GO",
  );
});

test("refuse un faux GO si le débit cadencé n'est pas réellement tenu", () => {
  const runId = "capacity-2";
  const metrics = Object.fromEntries(
    ["realtime", "cpu", "ram", "database"].map((name) => [
      name,
      { status: "go", source: `https://provider.example/${name}` },
    ]),
  );
  const palier = {
    mode: "cadence",
    cibleReqParS: 40,
    reqParS: 20,
    tauxErreur: 0,
    abandonnees: 0,
    latence: { p95: 100, p99: 200 },
    retardEmission: { p95: 2 },
  };

  assert.equal(
    qualifierRapport(
      { scenarios: { event: [palier] } },
      { run_id: runId, ...metrics },
      runId,
    ).verdict,
    "NO_GO",
  );

  const tenu = { ...palier, reqParS: 40 };
  const qualification = qualifierRapport(
    { scenarios: { event: [tenu] } },
    { run_id: runId, ...metrics },
    runId,
  );
  assert.equal(qualification.verdict, "NON_QUALIFIABLE");
  assert.equal(qualification.raison, "revue_humaine_soak_multicampagne_requise");
});

test("reconnaît les alias de production et le scénario event les refuse avant réseau", () => {
  assert.equal(sembleProduction("https://lastchance-mu.vercel.app"), true);
  assert.equal(sembleProduction("https://lastchance-feature-micheau.vercel.app"), false);

  const run = spawnSync(process.execPath, [
    scriptPath,
    "--url", "https://lastchance-mu.vercel.app",
    "--scenarios", "event",
    "--ecrire",
    "--production",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      BENCH_EVENT_ACTION_ID: "action-id",
      BENCH_EVENT_SESSION_ID: "e2ed0000-0000-4000-8000-000000000021",
    },
  });
  assert.equal(run.status, 2);
  assert.match(`${run.stdout}\n${run.stderr}`, /ne se joue JAMAIS contre la production/);
});
