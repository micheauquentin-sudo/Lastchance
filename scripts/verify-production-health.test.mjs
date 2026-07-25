import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProductionUrl,
  verifyProductionHealth,
} from "./verify-production-health.mjs";

const healthyBody = {
  status: "ok",
  version: "0.1.0",
  checks: {
    database: { status: "ok" },
    workers: { status: "ok" },
    security_configuration: { status: "ok" },
  },
};

test("normalise toujours vers l'endpoint public de santé", () => {
  assert.equal(
    normalizeProductionUrl("https://app.example.com/other?q=1").href,
    "https://app.example.com/api/health",
  );
});

test("refuse HTTP hors environnement local", () => {
  assert.throws(
    () => normalizeProductionUrl("http://app.example.com"),
    /exige HTTPS/,
  );
});

test("accepte uniquement une production et tous ses contrôles au vert", async () => {
  const result = await verifyProductionHealth("https://app.example.com", {
    fetchImpl: async () => Response.json(healthyBody),
  });
  assert.deepEqual(result, {
    version: "0.1.0",
    checks: ["database", "workers", "security_configuration"],
  });
});

test("échoue si les workers sont absents ou non sains", async () => {
  await assert.rejects(
    verifyProductionHealth("https://app.example.com", {
      fetchImpl: async () =>
        Response.json(
          {
            ...healthyBody,
            status: "unhealthy",
            checks: {
              ...healthyBody.checks,
              workers: { status: "error" },
            },
          },
          { status: 503 },
        ),
    }),
    /Production non saine/,
  );
});

test("échoue sur une réponse non JSON", async () => {
  await assert.rejects(
    verifyProductionHealth("https://app.example.com", {
      fetchImpl: async () => new Response("maintenance", { status: 503 }),
    }),
    /Healthcheck illisible/,
  );
});
