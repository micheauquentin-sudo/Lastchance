import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ADMIN_HOSTS;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

describe("GET /api/health", () => {
  it("200 et status ok quand la base répond", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.database.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof body.uptime_s).toBe("number");
    expect(body.version).toBeTruthy();
    // Le drapeau Realtime est CONSTATABLE de l'extérieur : c'est le seul moyen
    // de vérifier qu'une variable posée chez l'hébergeur a bien pris — elle y
    // est stockée « Sensitive », donc illisible même par son propriétaire, et
    // la prop côté page n'existe que sur une session réelle.
    expect(typeof body.features.events_realtime).toBe("boolean");
  });

  it("503 quand la base est injoignable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connexion refusée")),
    );

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.error).toBe("connexion refusée");
  });

  it("503 quand la base répond en erreur HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.checks.database.error).toBe("HTTP 500");
  });

  it("503 quand Supabase n'est pas configuré", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.checks.database.error).toBe("Supabase non configuré");
  });

  it("200 en production uniquement quand les deux workers sont sains", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: true },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.workers.status).toBe("ok");
  });

  it("503 en production sans exposer le détail du worker défaillant", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_HOSTS = "admin.example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/rest/v1/rpc/ops_workers_health")) {
          return Promise.resolve(
            Response.json([
              { worker: "jobs", healthy: true },
              { worker: "sync-contests", healthy: false },
            ]),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.workers).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Workers non opérationnels",
      }),
    );
    expect(JSON.stringify(body)).not.toContain("sync-contests");
  });
});
