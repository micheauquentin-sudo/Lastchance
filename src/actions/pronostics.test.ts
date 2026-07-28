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

const { state, makeAdmin, makeServer } = vi.hoisted(() => {
  const state = {
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    // Écritures directes du client session (dashboard commerçant).
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    // Session dashboard + réponses du client session (peuplées par reset()).
    session: null as Record<string, unknown> | null,
    contestRow: null as Record<string, unknown> | null,
    rpcOk: true as unknown,
    rpcError: null as { message: string } | null,
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
      state.inserts = [];
      state.updates = [];
      state.session = {
        user: { id: "user-1" },
        organization: { id: "org-1", timezone: "Europe/Paris" },
        role: "owner",
      };
      state.contestRow = { id: "contest-1", slug: "ligue-1" };
      state.rpcOk = true;
      state.rpcError = null;
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

  /**
   * Client Supabase de session (dashboard commerçant) : capture les
   * INSERT et les appels RPC, rend les lignes pilotées par le test.
   */
  function makeServer() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        return Promise.resolve({ data: state.rpcOk, error: state.rpcError });
      },
      from(table: string) {
        let op = "select";
        const builder = {
          insert: (payload: Record<string, unknown>) => {
            op = "insert";
            state.inserts.push({ table, payload });
            return builder;
          },
          update: (payload: Record<string, unknown>) => {
            op = "update";
            state.updates.push({ table, payload });
            return builder;
          },
          select: () => builder,
          eq: () => builder,
          single: () =>
            Promise.resolve({ data: { id: "contest-1" }, error: null }),
          maybeSingle: () =>
            Promise.resolve({
              data: op === "insert" ? { id: "contest-1" } : state.contestRow,
              error: null,
            }),
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin, makeServer };
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

// Le module réel est PUR (barème, validation de forme des réponses, bornes) :
// on le garde tel quel et on ne simule QUE le non-déterministe (jeton joueur)
// et l'horloge de verrouillage. Énumérer les exports à la main cassait le test
// à chaque nouvel export (ex. QUESTION_PROMPT_MAX du moteur générique).
vi.mock("@/lib/pronostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pronostics")>()),
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "fresh-token",
  isPredictionOpen: () => true,
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeServer()),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () => Promise.resolve(state.session),
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
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { syncContestFixtures } from "@/lib/contest-sync";
import {
  confirmContestRecovery,
  createContest,
  joinContestLeague,
  leaveContestLeague,
  registerContestPlayer,
  requestContestRecovery,
  submitPrediction,
  updateContest,
  updateContestEventSettings,
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

// ────────────────────────────────────────────────────────────
// Dashboard commerçant — événements génériques
//
// `event_kind` est le pivot des modèles préconfigurés (cérémonie,
// élection, remise de prix…). Le FOOTBALL reste le défaut strict : sans
// champ supplémentaire, la création se comporte comme avant (compétition
// du catalogue + import automatique du calendrier). Un événement
// générique n'a PAS de compétition du catalogue : aucun fournisseur ne
// doit être interrogé.
// ────────────────────────────────────────────────────────────

function contestForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createContest — modèle d'événement et synchro fournisseur", () => {
  it("football (défaut) : champs d'origine seuls, synchro déclenchée", async () => {
    await createContest(
      null,
      contestForm({ name: "Pronos du comptoir", competition_key: "ligue1" }),
    );

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("contests");
    expect(state.inserts[0].payload).toMatchObject({
      name: "Pronos du comptoir",
      competition_key: "ligue1",
      event_kind: "football",
      default_locks_at: null,
    });
    expect(syncContestFixtures).toHaveBeenCalledTimes(1);
  });

  it("événement générique : aucune synchro, verrouillage par défaut posé", async () => {
    const locksAt = "2026-09-01T20:00";
    await createContest(
      null,
      contestForm({
        name: "Cérémonie des trophées",
        event_kind: "ceremony",
        default_locks_at: locksAt,
      }),
    );

    expect(state.inserts[0].payload).toMatchObject({
      event_kind: "ceremony",
      // Pas de compétition du catalogue hors football : saisie libre.
      competition_key: "custom",
      default_locks_at: "2026-09-01T18:00:00.000Z",
    });
    expect(syncContestFixtures).not.toHaveBeenCalled();
  });

  it("générique : une compétition auto envoyée ne déclenche RIEN", async () => {
    await createContest(
      null,
      contestForm({
        name: "Élection du village",
        event_kind: "election",
        competition_key: "ligue1",
      }),
    );

    expect(state.inserts[0].payload).toMatchObject({
      event_kind: "election",
      competition_key: "custom",
    });
    expect(syncContestFixtures).not.toHaveBeenCalled();
  });

  it("modèle hors format (miroir du CHECK SQL) : refus avant écriture", async () => {
    const res = await createContest(
      null,
      contestForm({ name: "Gala", event_kind: "Remise-Prix" }),
    );

    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toContain("Modèle d'événement");
    expect(state.inserts).toEqual([]);
  });

  it("football sans compétition connue : refus (parcours d'origine)", async () => {
    const res = await createContest(null, contestForm({ name: "Pronos" }));

    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toBe("Compétition inconnue");
    expect(state.inserts).toEqual([]);
  });
});

describe("updateContestEventSettings — réglages après création", () => {
  const rpcCall = () =>
    state.rpcCalls.find((c) => c.name === "update_contest_event_settings");

  it("rôle non éditeur : refus avant tout appel", async () => {
    state.session = {
      user: { id: "user-1" },
      organization: { id: "org-1" },
      role: "cashier",
    };
    const res = await updateContestEventSettings(
      null,
      contestForm({ id: "00000000-0000-4000-8000-0000000000cc", event_kind: "ceremony" }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Action non autorisée");
    expect(rpcCall()).toBeUndefined();
  });

  it("met à jour le modèle et la date de verrouillage", async () => {
    const locksAt = "2026-10-12T19:30";
    const res = await updateContestEventSettings(
      null,
      contestForm({
        id: "00000000-0000-4000-8000-0000000000cc",
        event_kind: "ceremony",
        default_locks_at: locksAt,
        reason: "Cérémonie reportée d'une semaine",
      }),
    );

    expect(res.ok).toBe(true);
    expect(rpcCall()?.args).toMatchObject({
      p_organization_id: "org-1",
      p_contest_id: "00000000-0000-4000-8000-0000000000cc",
      p_event_kind: "ceremony",
      p_default_locks_at: "2026-10-12T17:30:00.000Z",
      p_reason: "Cérémonie reportée d'une semaine",
    });
  });

  it("efface la date (champ vide) sans toucher au modèle", async () => {
    const res = await updateContestEventSettings(
      null,
      contestForm({
        id: "00000000-0000-4000-8000-0000000000cc",
        event_kind: "",
        default_locks_at: "",
      }),
    );

    expect(res.ok).toBe(true);
    // '' = « ne change pas » pour le modèle (colonne NOT NULL), « efface »
    // pour la date : le verrouillage retombe sur chaque question.
    expect(rpcCall()?.args).toMatchObject({
      p_event_kind: null,
      p_default_locks_at: null,
      p_reason: null,
    });
  });

  it("modèle figé par la base : message lisible", async () => {
    state.rpcError = { message: "locked: event kind frozen" };
    const res = await updateContestEventSettings(
      null,
      contestForm({
        id: "00000000-0000-4000-8000-0000000000cc",
        event_kind: "election",
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("ne peut plus changer");
  });
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

// ────────────────────────────────────────────────────────────
// updateContest — expiration du code de retrait (code_ttl_seconds)
//
// Sans ce réglage atteignable, l'expiration serveur posée à l'émission des
// lots PRONO-… serait du code mort. Le champ a son PROPRE gate (`has`) : il
// n'est écrit que si le formulaire le porte réellement, sinon la sauvegarde
// d'un autre formulaire (nom, statut, collecte) remettrait silencieusement
// tous les championnats en « sans limite ».
// ────────────────────────────────────────────────────────────

describe("updateContest — code_ttl_seconds", () => {
  const ID = "00000000-0000-4000-8000-0000000000cc";
  /** Ce qui atteint réellement PostgREST (JSON.stringify élague `undefined`). */
  const sentPayload = () =>
    JSON.parse(
      JSON.stringify(state.updates.find((u) => u.table === "contests")?.payload ?? {}),
    ) as Record<string, unknown>;

  it("champ absent du formulaire : le réglage n'est PAS touché", async () => {
    const res = await updateContest(null, contestForm({ id: ID, name: "Pronos" }));

    expect(res.ok).toBe(true);
    expect(sentPayload()).not.toHaveProperty("code_ttl_seconds");
    expect(sentPayload()).toMatchObject({ name: "Pronos" });
  });

  it("valeur en secondes : écrite telle quelle", async () => {
    const res = await updateContest(
      null,
      contestForm({ id: ID, code_ttl_seconds: "86400" }),
    );

    expect(res.ok).toBe(true);
    expect(sentPayload()).toMatchObject({ code_ttl_seconds: 86400 });
  });

  it("champ vidé : expiration retirée (null), pas ignorée", async () => {
    const res = await updateContest(
      null,
      contestForm({ id: ID, code_ttl_seconds: "" }),
    );

    expect(res.ok).toBe(true);
    expect(sentPayload()).toMatchObject({ code_ttl_seconds: null });
  });

  it("hors bornes (miroir du CHECK SQL 1 h à 90 j) : refus AVANT écriture", async () => {
    // 600 s est la borne HAUTE de la roue : elle doit être refusée ici, la
    // divergence des bornes entre les deux modules est volontaire.
    for (const value of ["600", "3599", "7776001", "abc"]) {
      const res = await updateContest(
        null,
        contestForm({ id: ID, code_ttl_seconds: value }),
      );
      expect(res.ok).toBe(false);
    }
    expect(state.updates).toEqual([]);
  });
});
