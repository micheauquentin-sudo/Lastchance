import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Parcours public /pronos — ORDRE DES GARDES et DÉSHARDAGE (ADR-032)
//
// Régression fermée ici : chaque action publique du championnat portait un seau
// `failClosed` sur la clé PARTAGÉE (IP × championnat) — pour plusieurs d'entre
// elles consommé AVANT même la résolution du cookie joueur. Sur le Wi-Fi
// partagé d'un commerce (CGNAT), un tiers saturait le budget commun et refusait
// le service (inscription, pronostic, récupération, ligue) à tous les autres.
//
// PRINCIPE appliqué : le `failClosed` ne porte plus que sur une clé d'IDENTITÉ
// (cookie joueur / jeton de récupération) ou de CIBLE (email destinataire) ;
// la clé IP devient un compteur LARGE et fail-OPEN (observabilité). L'identité
// est résolue AVANT tout seau. L'inscription — première action, sans cookie —
// s'appuie sur Turnstile + l'index unique email, sans borne d'identité.
// ────────────────────────────────────────────────────────────

const CONTEST_ID = "contest-1";
const MATCH_ID = "00000000-0000-4000-8000-0000000000aa";
const SLUG = "ligue-1";

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    ip: "203.0.113.7",
    cookieToken: undefined as string | undefined,
    // Lookups pilotables par test (null = introuvable).
    player: null as { id: string } | null,
    recoverPlayer: null as { id: string; first_name: string } | null,
    consumed: null as { player_id: string } | null,
    predictSaved: true as unknown,
    // Contexte championnat (peuplé par reset() : littéraux hors hoist).
    contest: null as Record<string, unknown> | null,
    matches: [] as Array<Record<string, unknown>>,
    reset() {
      state.counters = new Map();
      state.rateLimitCalls = [];
      state.rateLimitDenied = [];
      state.rpcCalls = [];
      state.ip = "203.0.113.7";
      state.cookieToken = "device-token";
      state.player = { id: "player-1" };
      state.recoverPlayer = { id: "player-1", first_name: "Alice" };
      state.consumed = { player_id: "player-1" };
      state.predictSaved = true;
      state.contest = {
        id: "contest-1",
        organization_id: "org-1",
        slug: "ligue-1",
        name: "Championnat",
        status: "active",
        collect_email: false,
        collect_phone: false,
        tiebreaker_question: null,
      };
      state.matches = [
        {
          id: "00000000-0000-4000-8000-0000000000aa",
          status: "scheduled",
          kickoff_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ];
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name === "submit_contest_prediction") {
          return Promise.resolve({ data: state.predictSaved, error: null });
        }
        if (name === "join_contest_league") {
          return Promise.resolve({
            data: [{ league_id: "L1", name: "Ma ligue", code: "ABC123" }],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        let op = "select";
        let cols = "";
        const builder = {
          select: (c?: string) => {
            cols = c ?? "";
            return builder;
          },
          insert: () => {
            op = "insert";
            return builder;
          },
          update: () => {
            op = "update";
            return builder;
          },
          upsert: () => builder,
          delete: () => {
            op = "delete";
            return builder;
          },
          eq: () => builder,
          is: () => builder,
          gt: () => builder,
          order: () => builder,
          maybeSingle: () => {
            if (table === "contest_players") {
              if (op === "update") {
                return Promise.resolve({
                  data: { id: "player-1", first_name: "Alice" },
                  error: null,
                });
              }
              if (cols.includes("first_name")) {
                return Promise.resolve({ data: state.recoverPlayer, error: null });
              }
              return Promise.resolve({ data: state.player, error: null });
            }
            if (table === "contest_recovery_tokens") {
              return Promise.resolve({ data: state.consumed, error: null });
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
      pronoRegisterIp: { limit: 120, windowSeconds: 3600 },
      pronoRecover: { limit: 10, windowSeconds: 3600 },
      pronoRecoverEmail: { limit: 3, windowSeconds: 3600 },
      pronoPredictIp: { limit: 300, windowSeconds: 60 },
      pronoPredictPlayer: { limit: 40, windowSeconds: 60 },
      pronoLeagueJoin: { limit: 10, windowSeconds: 600 },
      pronoLeagueCreatePlayer: { limit: 5, windowSeconds: 3600 },
      contestSync: { limit: 6, windowSeconds: 300 },
    },
  };
});

vi.mock("@/lib/pronostics-context", () => ({
  contestTokenCookieName: (id: string) => `lc-prono-${id}`,
  loadContestContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      contest: state.contest,
      organization: { name: "Ma boutique" },
      matches: state.matches,
    }),
}));

vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "fresh-token",
  isPredictionOpen: () => true,
  MAX_SCORE: 99,
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: () => Promise.resolve(true),
}));
vi.mock("@/lib/resend", () => ({
  sendContestRecoveryEmail: () => Promise.resolve(true),
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => state.ip }));
vi.mock("@/lib/env", () => ({ APP_URL: "https://app.test" }));
vi.mock("@/lib/contest-sync", () => ({ syncContestFixtures: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ hasPronosticsAccess: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () =>
        state.cookieToken !== undefined ? { value: state.cookieToken } : undefined,
      set: vi.fn(),
    }),
  headers: () => Promise.resolve({}),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  confirmContestRecovery,
  joinContestLeague,
  leaveContestLeague,
  registerContestPlayer,
  requestContestRecovery,
  submitPrediction,
  updateContestPlayer,
} from "./pronostics";

// Seaux (contest.id = "contest-1", ip = "203.0.113.7", cookie hashé → hash:X).
const REGISTER_IP = `prono:register:ip:${CONTEST_ID}:203.0.113.7`;
const PROFILE_PLAYER = `prono:profile:player:${CONTEST_ID}:hash:device-token`;
const PROFILE_IP = `prono:profile:ip:${CONTEST_ID}:203.0.113.7`;
const PREDICT_PLAYER = `prono:predict:player:${CONTEST_ID}:player-1`;
const PREDICT_IP = `prono:predict:ip:${CONTEST_ID}:203.0.113.7`;
const RECOVER_EMAIL = `prono:recover:email:${CONTEST_ID}:alice@example.com`;
const RECOVER_IP = `prono:recover:ip:${CONTEST_ID}:203.0.113.7`;
const CONFIRM_TOKEN = `prono:recover:confirm:${CONTEST_ID}:hash:recovery-token-abcdefghij`;
const CONFIRM_IP = `prono:recover:confirm:ip:${CONTEST_ID}:203.0.113.7`;
const JOIN_PLAYER = `prono:league:join:${CONTEST_ID}:player-1`;
const JOIN_IP = `prono:league:join:ip:${CONTEST_ID}:203.0.113.7`;
const LEAVE_PLAYER = `prono:league:leave:${CONTEST_ID}:player-1`;
const LEAVE_IP = `prono:league:leave:ip:${CONTEST_ID}:203.0.113.7`;

const RECOVERY_TOKEN = "recovery-token-abcdefghij"; // 25 car. (20..80)

function saturate(bucket: string) {
  state.counters.set(bucket, 99_999);
}

beforeEach(() => {
  state.reset();
});
afterEach(() => {
  vi.clearAllMocks();
});

// ── Inscription : première action, aucune identité → IP en observabilité ──
describe("registerContestPlayer — la clé IP ne refuse jamais l'inscription", () => {
  const nominal = () =>
    registerContestPlayer({ slug: SLUG, firstName: "Alice", acceptedTerms: true });

  it("(d) parcours nominal : inscription acceptée, IP en observabilité seule", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([REGISTER_IP]);
  });

  it("(a) un tiers qui sature prono:register:ip n'empêche PAS l'inscription", async () => {
    saturate(REGISTER_IP);
    const res = await nominal();
    // La clé partagée alerte, elle ne refuse pas l'inscription d'un championnat.
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([REGISTER_IP]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "prono_register_ip_pressure",
      expect.objectContaining({ contest_id: CONTEST_ID }),
    );
  });
});

// ── Modification de profil : cookie résolu, failClosed sur l'identité ──
describe("updateContestPlayer — failClosed sur l'identité, IP observée", () => {
  const nominal = () =>
    updateContestPlayer({ slug: SLUG, firstName: "Bob", avatar: "" });

  it("(d) parcours nominal : identité (joueur) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([PROFILE_PLAYER, PROFILE_IP]);
  });

  it("(a) saturer prono:profile:ip ne bloque pas la modification", async () => {
    saturate(PROFILE_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([PROFILE_IP]);
  });

  it("(b) le rejeu d'une même identité reste borné", async () => {
    saturate(PROFILE_PLAYER);
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitDenied).toEqual([PROFILE_PLAYER]);
    expect(state.rateLimitCalls).not.toContain(PROFILE_IP);
  });

  it("(c) sans cookie : refus AVANT tout seau", async () => {
    state.cookieToken = undefined;
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });
});

// ── Pronostic : réordonné (cookie → joueur → seau), IP observée ──
describe("submitPrediction — identité d'abord, IP partagée observée", () => {
  const nominal = () =>
    submitPrediction({ slug: SLUG, matchId: MATCH_ID, homeScore: 1, awayScore: 0 });

  it("(d) parcours nominal : joueur (fail-closed) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([PREDICT_PLAYER, PREDICT_IP]);
    expect(state.rpcCalls.some((c) => c.name === "submit_contest_prediction")).toBe(true);
  });

  it("(a) un tiers qui sature prono:predict:ip n'empêche PAS de pronostiquer", async () => {
    saturate(PREDICT_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([PREDICT_IP]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "prono_predict_ip_pressure",
      expect.objectContaining({ contest_id: CONTEST_ID }),
    );
  });

  it("(b) le rejeu d'un même joueur reste borné (seau d'identité)", async () => {
    saturate(PREDICT_PLAYER);
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitDenied).toEqual([PREDICT_PLAYER]);
    // Le refus tombe AVANT le seau d'observabilité IP.
    expect(state.rateLimitCalls).not.toContain(PREDICT_IP);
  });

  it("(c) sans cookie : refus AVANT tout seau", async () => {
    state.cookieToken = undefined;
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });
});

// ── Récupération : borne sur l'EMAIL cible (conservée), IP observée ──
describe("requestContestRecovery — failClosed sur l'email cible, IP observée", () => {
  const nominal = () =>
    requestContestRecovery({ slug: SLUG, email: "alice@example.com" });

  it("(d) parcours nominal : email (fail-closed) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([RECOVER_EMAIL, RECOVER_IP]);
  });

  it("(a) un tiers qui sature prono:recover:ip ne bloque pas la demande", async () => {
    saturate(RECOVER_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([RECOVER_IP]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "prono_recover_ip_pressure",
      expect.objectContaining({ contest_id: CONTEST_ID }),
    );
  });

  it("(b) l'email-bombing d'UNE adresse reste borné (clé cible conservée)", async () => {
    saturate(RECOVER_EMAIL);
    const res = await nominal();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Trop de demandes");
    expect(state.rateLimitDenied).toEqual([RECOVER_EMAIL]);
    // Le refus tombe AVANT le seau d'observabilité IP.
    expect(state.rateLimitCalls).not.toContain(RECOVER_IP);
  });
});

// ── Confirmation du lien : failClosed sur le JETON, IP observée ──
describe("confirmContestRecovery — failClosed sur le jeton, IP observée", () => {
  const nominal = () =>
    confirmContestRecovery({ slug: SLUG, token: RECOVERY_TOKEN });

  it("(d) parcours nominal : jeton (fail-closed) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.firstName).toBe("Alice");
    expect(state.rateLimitCalls).toEqual([CONFIRM_TOKEN, CONFIRM_IP]);
  });

  it("(a) un tiers qui sature l'IP ne bloque pas la confirmation", async () => {
    saturate(CONFIRM_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([CONFIRM_IP]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "prono_recover_confirm_ip_pressure",
      expect.objectContaining({ contest_id: CONTEST_ID }),
    );
  });

  it("(b) le martèlement d'UN même jeton reste borné", async () => {
    saturate(CONFIRM_TOKEN);
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitDenied).toEqual([CONFIRM_TOKEN]);
    expect(state.rateLimitCalls).not.toContain(CONFIRM_IP);
  });
});

// ── Rejoindre une ligue : réordonné (cookie → joueur → seau), IP observée ──
describe("joinContestLeague — anti-bruteforce PAR JOUEUR, IP observée", () => {
  const nominal = () => joinContestLeague({ slug: SLUG, code: "ABC123" });

  it("(d) parcours nominal : joueur (fail-closed) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([JOIN_PLAYER, JOIN_IP]);
    expect(state.rpcCalls.some((c) => c.name === "join_contest_league")).toBe(true);
  });

  it("(a) un tiers qui sature prono:league:join:ip ne bloque pas la rejointe", async () => {
    saturate(JOIN_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([JOIN_IP]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "prono_league_join_ip_pressure",
      expect.objectContaining({ contest_id: CONTEST_ID }),
    );
  });

  it("(b) le bruteforce d'un même joueur reste borné (seau d'identité)", async () => {
    saturate(JOIN_PLAYER);
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitDenied).toEqual([JOIN_PLAYER]);
    expect(state.rateLimitCalls).not.toContain(JOIN_IP);
  });

  it("(c) sans cookie : refus AVANT tout seau", async () => {
    state.cookieToken = undefined;
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });
});

// ── Quitter une ligue : réordonné (cookie → joueur → seau), IP observée ──
describe("leaveContestLeague — identité d'abord, IP observée", () => {
  const nominal = () =>
    leaveContestLeague({ slug: SLUG, leagueId: "00000000-0000-4000-8000-0000000000bb" });

  it("(d) parcours nominal : joueur (fail-closed) puis observabilité IP", async () => {
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([LEAVE_PLAYER, LEAVE_IP]);
  });

  it("(a) saturer prono:league:leave:ip ne bloque pas le départ", async () => {
    saturate(LEAVE_IP);
    const res = await nominal();
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([LEAVE_IP]);
  });

  it("(c) sans cookie : refus AVANT tout seau", async () => {
    state.cookieToken = undefined;
    const res = await nominal();
    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });
});
