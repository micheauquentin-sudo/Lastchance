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
    detailPresent: true,
  });
});

test("porte CRON_SECRET en Bearer quand il est fourni, rien sinon", () => {
  // Depuis SEC-3, `/api/health` ne rend `checks` qu'à un appelant authentifié.
  return (async () => {
    let avec;
    await verifyProductionHealth("https://app.example.com", {
      cronSecret: "secret-de-supervision",
      fetchImpl: async (_url, init) => {
        avec = init.headers;
        return Response.json(healthyBody);
      },
    });
    assert.equal(avec.authorization, "Bearer secret-de-supervision");

    let sans;
    await verifyProductionHealth("https://app.example.com", {
      cronSecret: "",
      fetchImpl: async (_url, init) => {
        sans = init.headers;
        return Response.json(healthyBody);
      },
    });
    assert.equal("authorization" in sans, false);
  })();
});

test("conclut sur le verdict global quand le détail n'est pas servi", async () => {
  // Sonde lancée sans `CRON_SECRET` : le corps public ne porte plus `checks`.
  // La détection SUBSISTE — la route calcule `status: "ok"` comme la
  // conjonction des trois contrôles — mais on ne prétend plus les avoir lus.
  const result = await verifyProductionHealth("https://app.example.com", {
    fetchImpl: async () => Response.json({ status: "ok", version: "0.1.0" }),
  });
  assert.deepEqual(result, {
    version: "0.1.0",
    checks: [],
    detailPresent: false,
  });
});

test("un corps public `unhealthy` échoue même sans détail", async () => {
  await assert.rejects(
    verifyProductionHealth("https://app.example.com", {
      fetchImpl: async () =>
        Response.json({ status: "unhealthy", version: "0.1.0" }, { status: 503 }),
    }),
    /Production non saine/,
  );
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

test("n'ajoute pas l'en-tête de contournement quand le secret est absent ou vide", async () => {
  const seenHeaders = [];
  await verifyProductionHealth("https://app.example.com", {
    fetchImpl: async (_url, init) => {
      seenHeaders.push(init.headers);
      return Response.json(healthyBody);
    },
  });
  await verifyProductionHealth("https://app.example.com", {
    bypassSecret: "",
    fetchImpl: async (_url, init) => {
      seenHeaders.push(init.headers);
      return Response.json(healthyBody);
    },
  });
  for (const headers of seenHeaders) {
    assert.equal("x-vercel-protection-bypass" in headers, false);
  }
});

test("ajoute l'en-tête de contournement quand le secret est fourni", async () => {
  let seenHeaders;
  await verifyProductionHealth("https://app.example.com", {
    bypassSecret: "un-secret-de-test",
    fetchImpl: async (_url, init) => {
      seenHeaders = init.headers;
      return Response.json(healthyBody);
    },
  });
  assert.equal(seenHeaders["x-vercel-protection-bypass"], "un-secret-de-test");
});
