import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions du Jackpot collectif — contrôle d'abus du parcours public (ADR-032).
//
// Ce que ces tests attestent, et qui est le CŒUR du module :
//   · la jauge est une clé PARTAGÉE (campagne / IP) — AUCUN seau `failClosed`
//     ne porte dessus. Un tiers qui sature une clé mutualisée ne coupe
//     personne : la remplir vite est un objectif, pas un abus ;
//   · les clés partagées ne portent que des compteurs d'OBSERVABILITÉ : ils
//     émettent reportSecurityEvent au dépassement, et laissent passer ;
//   · le `failClosed` subsiste uniquement sur une clé d'IDENTITÉ (hash du
//     cookie) ou d'OPÉRATEUR authentifié (user.id) ;
//   · ce premier rempart est consulté AVANT toute requête SQL et avant
//     l'instrumentation (`monitored` insère une ligne ops_metrics par appel) ;
//   · un joueur ÉTABLI ne touche plus aucune clé partagée.
// ────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "00000000-0000-4000-8000-000000000001";
const COOLDOWN = 300;

const { state, makeAdmin, cookieSetMock } = vi.hoisted(() => {
  interface PlayerRow {
    participation_count: number;
    last_participation_at: string | null;
  }
  const state = {
    participationResponse: null as unknown,
    counterCode: null as string | null,
    cookieToken: "player-token" as string | null,
    ip: "203.0.113.7",
    campaignFound: true,
    validationMode: "rotating_code" as string,
    players: new Map<string, PlayerRow>(),
    playerLookups: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    counters: new Map<string, number>(),
    /** Chaque appel rateLimit avec son mode (partagé ⇒ failClosed doit être false). */
    rateLimitCalls: [] as Array<{ bucket: string; failClosed: boolean }>,
    reset() {
      state.participationResponse = null;
      state.counterCode = null;
      state.cookieToken = "player-token";
      state.ip = "203.0.113.7";
      state.campaignFound = true;
      state.validationMode = "rotating_code";
      state.players = new Map();
      state.playerLookups = [];
      state.rpcCalls = [];
      state.counters = new Map();
      state.rateLimitCalls = [];
    },
  };

  const cookieSetMock =
    vi.fn<(name: string, value: string, options?: unknown) => void>();

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name === "current_jackpot_code") {
          return Promise.resolve({ data: state.counterCode, error: null });
        }
        return Promise.resolve({ data: state.participationResponse, error: null });
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          maybeSingle: () => {
            if (table === "jackpot_players") {
              state.playerLookups.push({ ...filters });
              const hash = String(filters.token_hash ?? "");
              return Promise.resolve({ data: state.players.get(hash) ?? null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin, cookieSetMock };
});

vi.mock("@/lib/jackpot-context", () => ({
  jackpotTokenCookieName: (id: string) => `lc-jackpot-${id}`,
  loadJackpotActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      campaign: {
        id: CAMPAIGN_ID,
        validation_mode: state.validationMode,
        min_participation_interval_seconds: COOLDOWN,
      },
    }),
}));

const {
  getUserAndOrgMock,
  verifyTurnstileMock,
  turnstileEnabledMock,
  reportSecurityEventMock,
  monitoredMock,
} = vi.hoisted(() => ({
  getUserAndOrgMock: vi.fn(),
  verifyTurnstileMock:
    vi.fn<
      (token: string | undefined | null, ip?: string, action?: string) => Promise<boolean>
    >(),
  turnstileEnabledMock: vi.fn<() => boolean>(),
  reportSecurityEventMock:
    vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
  monitoredMock: vi.fn((_name: string, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
  turnstileEnabled: turnstileEnabledMock,
}));

// Compteur de seaux calqué sur `check_rate_limit` : incrément ET verdict dans le
// MÊME appel. On MÉMORISE le mode (failClosed) de chaque appel — c'est ce qui
// prouve qu'aucune clé partagée n'est fail-closed.
vi.mock("@/lib/rate-limit", () => {
  const rateLimit = (
    bucket: string,
    rule: { limit: number },
    options: { failClosed?: boolean } = {},
  ) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push({ bucket, failClosed: options.failClosed === true });
    return Promise.resolve(next <= rule.limit);
  };
  return {
    rateLimit,
    rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
    // Clé PARTAGÉE : même compteur, alerte au dépassement, ne refuse jamais
    // (appel SANS failClosed → enregistré failClosed:false).
    observeSharedKey: async (
      bucket: string,
      rule: { limit: number; windowSeconds: number },
      event: string,
      extra: Record<string, unknown> = {},
    ) => {
      if (!(await rateLimit(bucket, rule))) {
        reportSecurityEventMock(event, {
          ...extra,
          bucket,
          limit: rule.limit,
          window_seconds: rule.windowSeconds,
        });
      }
    },
    RATE_LIMITS: {
      jackpotParticipateIp: { limit: 1200, windowSeconds: 600 },
      jackpotParticipateMember: { limit: 30, windowSeconds: 3600 },
      jackpotParticipateCodeMember: { limit: 6, windowSeconds: 300 },
      jackpotCheckinMember: { limit: 120, windowSeconds: 3600 },
      jackpotNewPlayerBurst: { limit: 60, windowSeconds: 600 },
      jackpotStaffPlayerCreation: { limit: 120, windowSeconds: 3600 },
      jackpotCounter: { limit: 60, windowSeconds: 60 },
      cashier: { limit: 30, windowSeconds: 60 },
    },
  };
});

vi.mock("@/lib/monitoring", () => ({
  monitored: monitoredMock,
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "generated-token",
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => state.ip }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (state.cookieToken ? { value: state.cookieToken } : undefined),
      set: cookieSetMock,
    }),
  headers: () => Promise.resolve({}),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              data: state.campaignFound
                ? {
                    id: CAMPAIGN_ID,
                    validation_mode: state.validationMode,
                    rotating_period_seconds: 60,
                  }
                : null,
              error: null,
            }),
        };
        return builder;
      },
    }),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: getUserAndOrgMock }));

// Le moteur de jeton de check-in n'est PAS mocké : les tests signent et
// vérifient de vrais jetons HMAC (secret fourni par vitest.config).
import { signJackpotCheckin } from "@/lib/jackpot-checkin";
import {
  getJackpotCounterCode,
  participateJackpot,
  participateJackpotStaff,
} from "./jackpot";

const PLAYER_HASH = "b".repeat(64);
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

// ── Seaux du parcours public ──
const CODE_BUCKET = `jackpot:participate:code:${CAMPAIGN_ID}:hash:player-token`;
const MEMBER_BUCKET = `jackpot:participate:member:${CAMPAIGN_ID}:hash:player-token`;
const SHARED_IP_BUCKET = `jackpot:public:ip:${CAMPAIGN_ID}:203.0.113.7`;
const SHARED_NEW_BUCKET = `jackpot:new:campaign:${CAMPAIGN_ID}`;
// ── Seaux de caisse (clé d'opérateur authentifié) ──
const STAFF_OP_BUCKET = "jackpot:staff:org-1:user-1";
const STAFF_NEW_BUCKET = "jackpot:staff:new:org-1:user-1";
const COUNTER_BUCKET = "jackpot:counter:org-1:user-1";

const RECORDED = {
  state: "recorded",
  campaign: {
    id: CAMPAIGN_ID,
    name: "Jackpot",
    draw_mode: "threshold_draw",
    validation_mode: "rotating_code",
  },
  current_count: 5,
  threshold: 100,
  cycle: 1,
  is_new_player: false,
  is_winner: false,
  code: null,
  out_of_stock: false,
  armed: false,
  display_amount_cents: 0,
  draw_at: null,
};

/** Joueur ÉTABLI : a déjà participé et sa dernière participation est ancienne. */
function establishPlayer(token = "player-token", count = 5) {
  state.players.set(`hash:${token}`, {
    participation_count: count,
    last_participation_at: ago(COOLDOWN * 4),
  });
}

function bucketsOf(): string[] {
  return state.rateLimitCalls.map((c) => c.bucket);
}

beforeEach(() => {
  getUserAndOrgMock.mockResolvedValue({
    user: { id: "user-1" },
    organization: { id: "org-1" },
    role: "editor",
  } as never);
  turnstileEnabledMock.mockReturnValue(true);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
  verifyTurnstileMock.mockResolvedValue(false);
});

afterEach(() => {
  state.reset();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// participateJackpot — aucune clé PARTAGÉE ne refuse (ADR-032)
// ════════════════════════════════════════════════════════════

describe("participateJackpot — la jauge partagée ne devient jamais un interrupteur", () => {
  it("un tiers a saturé TOUTES les clés partagées : le joueur passe quand même", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.counters.set(SHARED_IP_BUCKET, 99_999);
    state.counters.set(SHARED_NEW_BUCKET, 99_999);
    state.participationResponse = { ...RECORDED, is_new_player: true };

    const res = await participateJackpot({
      campaignId: CAMPAIGN_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    // Le dépassement a été SIGNALÉ (observabilité), sans rien refuser.
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "jackpot_public_pressure",
      expect.objectContaining({ campaign_id: CAMPAIGN_ID }),
    );
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "jackpot_player_creation_burst",
      expect.objectContaining({ campaign_id: CAMPAIGN_ID }),
    );
  });

  it("PREUVE ADR-032 : aucun seau failClosed ne porte sur la clé campagne/IP partagée", async () => {
    // Joueur NEUF (cas le plus défavorable), challenge résolu, création réelle :
    // les DEUX clés partagées (IP + campagne) sont touchées.
    verifyTurnstileMock.mockResolvedValue(true);
    state.participationResponse = { ...RECORDED, is_new_player: true };

    const res = await participateJackpot({
      campaignId: CAMPAIGN_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });
    expect(res.ok).toBe(true);

    const sharedCalls = state.rateLimitCalls.filter(
      (c) =>
        c.bucket.startsWith(`jackpot:public:ip:`) ||
        c.bucket.startsWith(`jackpot:new:campaign:`),
    );
    // Les clés partagées ONT bien été consultées…
    expect(sharedCalls.map((c) => c.bucket)).toEqual(
      expect.arrayContaining([SHARED_IP_BUCKET, SHARED_NEW_BUCKET]),
    );
    // …et AUCUNE n'est fail-closed.
    expect(sharedCalls.every((c) => c.failClosed === false)).toBe(true);

    // Les seuls seaux fail-closed sont les clés d'IDENTITÉ (cookie du joueur).
    const closedCalls = state.rateLimitCalls.filter((c) => c.failClosed);
    expect(closedCalls.map((c) => c.bucket)).toEqual([CODE_BUCKET, MEMBER_BUCKET]);
  });

  it("60 joueurs neufs derrière une clé saturée : 60 acceptés", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.counters.set(SHARED_IP_BUCKET, 99_999);
    state.counters.set(SHARED_NEW_BUCKET, 99_999);
    state.participationResponse = { ...RECORDED, is_new_player: true };

    let accepted = 0;
    for (let i = 0; i < 60; i += 1) {
      state.cookieToken = `joueur-neuf-${i}`;
      const res = await participateJackpot({
        campaignId: CAMPAIGN_ID,
        code: "123456",
        turnstileToken: `captcha-${i}`,
      });
      if (res.ok) accepted += 1;
    }
    expect(accepted).toBe(60);
    expect(state.rpcCalls).toHaveLength(60);
  });
});

describe("participateJackpot — clés d'identité et ordre des gardes", () => {
  it("seau d'IDENTITÉ saturé : refus AVANT SQL, RPC et instrumentation", async () => {
    state.counters.set(CODE_BUCKET, 99_999);

    const res = await participateJackpot({ campaignId: CAMPAIGN_ID, code: "123456" });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.playerLookups).toHaveLength(0);
    expect(monitoredMock).not.toHaveBeenCalled();
    // Une seule clé consultée : celle du demandeur.
    expect(bucketsOf()).toEqual([CODE_BUCKET]);
  });

  it("identité inconnue (rotating) : challenge exigé, sans toucher de clé partagée", async () => {
    state.participationResponse = RECORDED;

    const res = await participateJackpot({ campaignId: CAMPAIGN_ID, code: "123456" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.challengeRequired).toBe(true);
    expect(state.rpcCalls).toHaveLength(0);
    expect(bucketsOf()).toEqual([CODE_BUCKET, MEMBER_BUCKET]);
  });

  it("challenge résolu : la participation reprend", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.participationResponse = RECORDED;

    const res = await participateJackpot({
      campaignId: CAMPAIGN_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });

    expect(res.ok).toBe(true);
    expect(verifyTurnstileMock).toHaveBeenLastCalledWith(
      "captcha-ok",
      "203.0.113.7",
      "jackpot-participate",
    );
  });

  it("joueur ÉTABLI : aucune clé partagée consultée, aucun challenge", async () => {
    establishPlayer();
    state.counters.set(SHARED_IP_BUCKET, 99_999);
    state.participationResponse = RECORDED;

    const res = await participateJackpot({ campaignId: CAMPAIGN_ID, code: "123456" });

    expect(res.ok).toBe(true);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    expect(bucketsOf()).toEqual([CODE_BUCKET, MEMBER_BUCKET]);
    // L'ancienneté est vérifiée sur (campagne, hash), jamais sur le cookie nu.
    expect(state.playerLookups[0]).toEqual({
      campaign_id: CAMPAIGN_ID,
      token_hash: "hash:player-token",
    });
  });

  it("le cookie est posé dès la première tentative, même refusée", async () => {
    state.cookieToken = null;
    state.participationResponse = RECORDED;

    await participateJackpot({ campaignId: CAMPAIGN_ID, code: "123456" });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(cookieSetMock.mock.calls[0][0]).toBe(`lc-jackpot-${CAMPAIGN_ID}`);
    expect(cookieSetMock.mock.calls[0][1]).toBe("generated-token");
  });

  it("gagnant : is_winner + code JACKPOT-… remontés à l'UI", async () => {
    establishPlayer();
    state.participationResponse = {
      ...RECORDED,
      is_winner: true,
      code: "JACKPOT-ABCD2345",
      current_count: 0,
    };

    const res = await participateJackpot({ campaignId: CAMPAIGN_ID, code: "123456" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.isWinner).toBe(true);
      expect(res.data.code).toBe("JACKPOT-ABCD2345");
    }
    // La RPC a bien reçu le hash du cookie et le code saisi.
    expect(state.rpcCalls[0]).toMatchObject({
      name: "record_jackpot_participation",
      args: {
        p_campaign_id: CAMPAIGN_ID,
        p_player_token_hash: "hash:player-token",
        p_rotating_code: "123456",
      },
    });
  });

  it("mode staff : un joueur inconnu N'est PAS challengé (création réservée à la caisse)", async () => {
    state.validationMode = "staff";
    state.participationResponse = RECORDED;

    const res = await participateJackpot({ campaignId: CAMPAIGN_ID });

    // Pas de challenge (le challenge public ne concerne que le mode rotating) ;
    // la RPC ferme d'elle-même le chemin staff public (p_validated_by requis).
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// participateJackpotStaff — authentifiée, jeton de check-in signé
// ════════════════════════════════════════════════════════════

describe("participateJackpotStaff", () => {
  const validToken = () =>
    signJackpotCheckin({ campaignId: CAMPAIGN_ID, playerTokenHash: PLAYER_HASH }).token;

  it("jeton valide : participe avec le hash porté par le jeton signé + p_validated_by", async () => {
    state.participationResponse = RECORDED;

    const res = await participateJackpotStaff({
      campaignId: CAMPAIGN_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "record_jackpot_participation",
      args: {
        p_campaign_id: CAMPAIGN_ID,
        p_player_token_hash: PLAYER_HASH,
        p_validated_by: "user-1",
      },
    });
  });

  it("jeton d'identité brut (ancien QR) : REFUSÉ, aucune RPC", async () => {
    state.participationResponse = RECORDED;
    for (const legacy of ["player-token", PLAYER_HASH, "aGVsbG8td29ybGQtdG9rZW4tMjQ"]) {
      const res = await participateJackpotStaff({
        campaignId: CAMPAIGN_ID,
        checkinToken: legacy,
      });
      expect(res.ok).toBe(false);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("jeton d'une AUTRE campagne : refus (pas de rejeu inter-campagnes)", async () => {
    state.participationResponse = RECORDED;
    const { token } = signJackpotCheckin({
      campaignId: "00000000-0000-4000-8000-0000000000ff",
      playerTokenHash: PLAYER_HASH,
    });

    const res = await participateJackpotStaff({ campaignId: CAMPAIGN_ID, checkinToken: token });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rôle non autorisé (viewer) : refus avant toute vérification", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "user-2" },
      organization: { id: "org-1" },
      role: "viewer",
    } as never);

    const res = await participateJackpotStaff({
      campaignId: CAMPAIGN_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("campagne hors organisation active : refus (multi-tenant)", async () => {
    state.campaignFound = false;

    const res = await participateJackpotStaff({
      campaignId: CAMPAIGN_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("création RÉELLE : compteur d'opérateur consommé (observabilité, jamais un refus)", async () => {
    state.participationResponse = { ...RECORDED, is_new_player: true };
    state.counters.set(STAFF_NEW_BUCKET, 120); // limite atteinte

    const res = await participateJackpotStaff({
      campaignId: CAMPAIGN_ID,
      checkinToken: validToken(),
    });

    // Une caisse bridée est une caisse en panne : on signale, on n'étrangle pas.
    expect(res.ok).toBe(true);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "jackpot_staff_player_burst",
      expect.objectContaining({
        campaign_id: CAMPAIGN_ID,
        organization_id: "org-1",
        validated_by: "user-1",
      }),
    );
  });

  it("seau d'OPÉRATEUR saturé : refus (clé non partagée, failClosed légitime)", async () => {
    state.counters.set(STAFF_OP_BUCKET, 99_999);
    state.participationResponse = RECORDED;

    const res = await participateJackpotStaff({
      campaignId: CAMPAIGN_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// getJackpotCounterCode — écran comptoir (owner/editor uniquement, INFO-2)
// ════════════════════════════════════════════════════════════

describe("getJackpotCounterCode", () => {
  it("owner/editor en mode rotating : renvoie le code courant", async () => {
    state.counterCode = "482913";

    const res = await getJackpotCounterCode(CAMPAIGN_ID);

    expect(res).toEqual({ code: "482913", periodSeconds: 60 });
    expect(bucketsOf()).toContain(COUNTER_BUCKET);
  });

  it("rôle cashier : REFUSÉ (le code vaut une participation, INFO-2)", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "user-3" },
      organization: { id: "org-1" },
      role: "cashier",
    } as never);

    const res = await getJackpotCounterCode(CAMPAIGN_ID);

    expect(res).toBeNull();
    // Le code tournant n'est jamais lu pour un cashier.
    expect(state.rpcCalls.some((c) => c.name === "current_jackpot_code")).toBe(false);
  });

  it("mode staff : pas de code tournant (null), sans appeler la RPC", async () => {
    state.validationMode = "staff";

    const res = await getJackpotCounterCode(CAMPAIGN_ID);

    expect(res).toEqual({ code: null, periodSeconds: 60 });
    expect(state.rpcCalls.some((c) => c.name === "current_jackpot_code")).toBe(false);
  });

  it("seau d'OPÉRATEUR saturé : refus (failClosed légitime)", async () => {
    state.counters.set(COUNTER_BUCKET, 99_999);

    const res = await getJackpotCounterCode(CAMPAIGN_ID);

    expect(res).toBeNull();
  });
});
