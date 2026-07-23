import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// stampHuntStep / claimHuntReward — ORDRE DES GARDES et DÉSHARDAGE
//
// Régression fermée ici (ADR-032) : les deux actions publiques de la chasse
// s'ouvraient sur un seau `failClosed` porté par la clé PARTAGÉE (IP × chasse),
// consommé AVANT la résolution du cookie joueur. Sur le Wi-Fi partagé d'un
// mall/festival (le cas d'usage cible), un bot à faible débit sur une seule IP
// épuisait le budget commun et empêchait TOUS les joueurs de tamponner /
// d'obtenir leur code.
//
// PRINCIPE appliqué : identité joueur (cookie httpOnly) résolue D'ABORD ; le
// `failClosed` porte sur l'IDENTITÉ (hash du jeton pour le scan, complétion
// pour le claim) ; la clé IP ne porte plus qu'un compteur LARGE et fail-OPEN,
// à valeur d'observabilité — il alerte, il ne refuse jamais.
//
// Harnais calqué sur play.test.ts : compteur de seaux fidèle à
// `check_rate_limit` (incrément + verdict dans le même appel), cookie et
// résultats de lookup pilotés par `state`.
// ────────────────────────────────────────────────────────────

const HUNT_ID = "00000000-0000-4000-8000-000000000001";
const STEP_TOKEN = "STEPTOKEN12345678"; // 17 car., matche ^[A-Za-z0-9-]{16,64}$
const COMPLETION_ID = "completion-1";

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    ip: "203.0.113.7",
    /** Jeton du cookie joueur (undefined = pas de cookie sur cet appareil). */
    cookieToken: "player-cookie" as string | undefined,
    /** Lignes renvoyées par les lookups du claim (null = introuvable).
     *  NB : `vi.hoisted` tourne AVANT les `const` du module — on inline les
     *  littéraux ici (COMPLETION_ID n'est pas encore initialisé). */
    player: { id: "player-1" } as { id: string } | null,
    completion: { id: "completion-1", code: "CHASSE-ABCD2345" } as
      | { id: string; code: string }
      | null,
    /** Résultat brut de record_hunt_scan (mappé en passthrough). */
    scanResult: { state: "stamped" } as Record<string, unknown>,
    reset() {
      state.counters = new Map();
      state.rateLimitCalls = [];
      state.rateLimitDenied = [];
      state.rpcCalls = [];
      state.ip = "203.0.113.7";
      state.cookieToken = "player-cookie";
      state.player = { id: "player-1" };
      state.completion = { id: "completion-1", code: "CHASSE-ABCD2345" };
      state.scanResult = { state: "stamped" };
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name === "record_hunt_scan") {
          return Promise.resolve({ data: state.scanResult, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        const builder = {
          select: () => builder,
          update: () => builder,
          upsert: () => builder,
          insert: () => builder,
          eq: () => builder,
          is: () => builder,
          maybeSingle: () => {
            if (table === "hunt_players") {
              return Promise.resolve({ data: state.player, error: null });
            }
            if (table === "hunt_completions") {
              return Promise.resolve({ data: state.completion, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin };
});

const { reportSecurityEventMock } = vi.hoisted(() => ({
  reportSecurityEventMock:
    vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
}));

vi.mock("@/lib/rate-limit", () => {
  const rateLimit = (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    const allowed = next <= rule.limit;
    if (!allowed) state.rateLimitDenied.push(bucket);
    return Promise.resolve(allowed);
  };
  return {
    rateLimit,
    rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
    observeSharedKey: async (
      bucket: string,
      rule: { limit: number; windowSeconds: number },
      event: string,
      extra: Record<string, unknown> = {},
    ) => {
      if (!(await rateLimit(bucket, rule))) {
        reportSecurityEventMock(event, { ...extra, bucket });
      }
    },
    RATE_LIMITS: {
      claim: { limit: 15, windowSeconds: 60 },
      claimIp: { limit: 600, windowSeconds: 600 },
      huntScanIp: { limit: 200, windowSeconds: 600 },
      huntScanPlayer: { limit: 30, windowSeconds: 3600 },
    },
  };
});

const HUNT = {
  id: HUNT_ID,
  organization_id: "org-1",
  name: "Chasse de l'été",
  reward_label: "Un café offert",
  reward_details: null,
};

vi.mock("@/lib/hunt-context", () => ({
  huntTokenCookieName: (id: string) => `lc-hunt-${id}`,
  loadHuntStepContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      hunt: HUNT,
      step: { id: "step-1", hunt_id: HUNT_ID },
      organization: { name: "Ma boutique" },
      progress: { hasPlayer: false, total: 3, done: 0, stamped: [], completedCode: null },
    }),
  loadHuntClaimContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      hunt: HUNT,
      organization: { name: "Ma boutique" },
    }),
}));

// mapHuntScanResult : passthrough du résultat brut (le mapping réel est couvert
// par src/lib/hunts.test.ts ; ici seul l'ordonnancement des seaux compte).
vi.mock("@/lib/hunts", () => ({
  mapHuntScanResult: (data: unknown) => data ?? { state: "unavailable" },
  firstFreeStepPosition: vi.fn(),
  planReorder: vi.fn(),
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "fresh-token",
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => state.ip }));
vi.mock("@/lib/resend", () => ({
  sendHuntRewardEmail: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () =>
        state.cookieToken !== undefined ? { value: state.cookieToken } : undefined,
      set: vi.fn(),
    }),
  headers: () => Promise.resolve({}),
}));

// Effets de bord non pertinents pour le parcours public.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

import { claimHuntReward, stampHuntStep } from "./hunts";

const SCAN_PLAYER = (hash: string) => `hunt:scan:player:${HUNT_ID}:${hash}`;
const SCAN_IP = (ip: string) => `hunt:scan:ip:${HUNT_ID}:${ip}`;
const CLAIM_COMPLETION = (id: string) => `hunt:claim:completion:${id}`;
const CLAIM_IP = (ip: string) => `hunt:claim:ip:${HUNT_ID}:${ip}`;

function saturate(bucket: string) {
  state.counters.set(bucket, 99_999);
}

beforeEach(() => {
  state.reset();
});
afterEach(() => {
  vi.clearAllMocks();
});

// ── Tampon d'étape (action centrale de la chasse) ──
describe("stampHuntStep — l'identité passe avant, la clé IP n'est qu'observée", () => {
  it("(d) parcours nominal : identité D'ABORD, puis observabilité IP", async () => {
    const res = await stampHuntStep({ stepToken: STEP_TOKEN });

    expect(res.ok).toBe(true);
    // Ordre exact : seau d'IDENTITÉ (fail-closed) puis seau PARTAGÉ (fail-open).
    expect(state.rateLimitCalls).toEqual([
      SCAN_PLAYER("hash:player-cookie"),
      SCAN_IP("203.0.113.7"),
    ]);
    expect(state.rpcCalls.some((c) => c.name === "record_hunt_scan")).toBe(true);
  });

  it("(a) un tiers qui sature hunt:scan:ip n'empêche PAS un joueur de tamponner", async () => {
    // Bot mono-IP sur le Wi-Fi du mall : budget IP épuisé.
    saturate(SCAN_IP("203.0.113.7"));

    const res = await stampHuntStep({ stepToken: STEP_TOKEN });

    // Le tampon passe : la clé partagée alerte, elle ne refuse pas.
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([SCAN_IP("203.0.113.7")]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "hunt_scan_ip_pressure",
      expect.objectContaining({ hunt_id: HUNT_ID }),
    );
  });

  it("(b) le rejeu d'une MÊME empreinte reste borné (seau d'identité)", async () => {
    saturate(SCAN_PLAYER("hash:player-cookie"));

    const res = await stampHuntStep({ stepToken: STEP_TOKEN });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Trop de scans récents");
    expect(state.rateLimitDenied).toEqual([SCAN_PLAYER("hash:player-cookie")]);
    // Le refus tombe AVANT le seau d'observabilité IP (jamais atteint).
    expect(state.rateLimitCalls).not.toContain(SCAN_IP("203.0.113.7"));
  });

  it("(c) premier joueur sans cookie : une empreinte fraîche porte le seau d'identité", async () => {
    // Aucun cookie encore posé → jeton frais généré ; le seau d'identité est
    // celui de CE joueur, jamais un seau partagé consommé en amont.
    state.cookieToken = undefined;

    const res = await stampHuntStep({ stepToken: STEP_TOKEN });

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([
      SCAN_PLAYER("hash:fresh-token"),
      SCAN_IP("203.0.113.7"),
    ]);
  });
});

// ── Claim du code de retrait ──
describe("claimHuntReward — l'identité du gain passe avant, la clé IP est observée", () => {
  it("(d) parcours nominal : complétion (fail-closed) puis observabilité IP", async () => {
    const res = await claimHuntReward({ huntId: HUNT_ID });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.code).toBe("CHASSE-ABCD2345");
    expect(state.rateLimitCalls).toEqual([
      CLAIM_COMPLETION(COMPLETION_ID),
      CLAIM_IP("203.0.113.7"),
    ]);
  });

  it("(a) un tiers qui sature hunt:claim:ip n'empêche PAS l'obtention du code", async () => {
    saturate(CLAIM_IP("203.0.113.7"));

    const res = await claimHuntReward({ huntId: HUNT_ID });

    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([CLAIM_IP("203.0.113.7")]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "hunt_claim_ip_pressure",
      expect.objectContaining({ hunt_id: HUNT_ID, completion_id: COMPLETION_ID }),
    );
  });

  it("(b) le rejeu d'une MÊME complétion reste borné (seau d'identité du gain)", async () => {
    saturate(CLAIM_COMPLETION(COMPLETION_ID));

    const res = await claimHuntReward({ huntId: HUNT_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toEqual([CLAIM_COMPLETION(COMPLETION_ID)]);
    // Le refus interrompt la chaîne AVANT le seau d'observabilité IP.
    expect(state.rateLimitCalls).not.toContain(CLAIM_IP("203.0.113.7"));
  });

  it("(c) sans cookie joueur : NEED_COMPLETE renvoyé AVANT tout seau", async () => {
    state.cookieToken = undefined;

    const res = await claimHuntReward({ huntId: HUNT_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Terminez la chasse");
    // Aucun seau consommé : l'identité est vérifiée en premier.
    expect(state.rateLimitCalls).toEqual([]);
  });

  it("complétion absente : NEED_COMPLETE renvoyé AVANT tout seau", async () => {
    state.completion = null;

    const res = await claimHuntReward({ huntId: HUNT_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Terminez la chasse");
    expect(state.rateLimitCalls).toEqual([]);
  });
});
