import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upstashRateLimit } from "./upstash";

const RULE = { limit: 3, windowSeconds: 60 };

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe("upstashRateLimit", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retourne null si Upstash n'est pas configuré (fallback base)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    expect(await upstashRateLimit("b", RULE)).toBeNull();
  });

  it("autorise sous la limite, bloque au-delà", async () => {
    vi.stubGlobal("fetch", mockFetchResponse([{ result: 3 }, { result: 1 }]));
    expect(await upstashRateLimit("b", RULE)).toBe(true);

    vi.stubGlobal("fetch", mockFetchResponse([{ result: 4 }, { result: 0 }]));
    expect(await upstashRateLimit("b", RULE)).toBe(false);
  });

  it("aligne la clé sur la fenêtre fixe (même découpage que le SQL)", async () => {
    const fetchMock = mockFetchResponse([{ result: 1 }, { result: 1 }]);
    vi.stubGlobal("fetch", fetchMock);

    // 1 000 000 000 s → fenêtre 60 s → départ à 999999960
    await upstashRateLimit("spin:abc", RULE, 1_000_000_000_000);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body[0]).toEqual(["INCR", "rl:spin:abc:999999960"]);
    // TTL posé uniquement à la création (NX), fenêtre + marge
    expect(body[1]).toEqual(["EXPIRE", "rl:spin:abc:999999960", "120", "NX"]);
  });

  it("retourne null (fallback) sur erreur HTTP ou réponse inattendue", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({}, false, 500));
    expect(await upstashRateLimit("b", RULE)).toBeNull();

    vi.stubGlobal("fetch", mockFetchResponse([{ error: "oops" }]));
    expect(await upstashRateLimit("b", RULE)).toBeNull();
  });

  it("retourne null (fallback) sur panne réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await upstashRateLimit("b", RULE)).toBeNull();
  });

  it("laisse passer une règle désactivée sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await upstashRateLimit("b", { limit: 0, windowSeconds: 60 })).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
