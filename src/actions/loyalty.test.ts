import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions du Passeport de fidélité
//
// consumeLoyaltySpin — raccord du tour de roue offert au flux de gain.
//
// stampLoyaltyVisitStaff — la caisse n'accepte QUE le jeton de check-in signé
// et éphémère (jamais le jeton d'identité du passeport), classe l'identité et
// ne compte que des créations RÉELLES.
//
// stampLoyaltyVisit / getLoyaltyCheckinToken — contrôle d'abus du parcours
// public. Ce que ces tests attestent, et qui est le cœur du module :
//
//   · AUCUN refus n'est jamais émis à cause d'une clé PARTAGÉE (IP, programme).
//     Un tiers qui sature une clé mutualisée ne coupe personne — les seaux
//     fail-closed posés sur ces clés étaient des interrupteurs (« déni
//     d'inscription d'un programme entier »), ils ont été retirés ;
//   · les clés partagées ne portent plus que des compteurs d'OBSERVABILITÉ :
//     ils émettent reportSecurityEvent au dépassement, et laissent passer ;
//   · le `failClosed` subsiste uniquement sur une clé d'IDENTITÉ (hash du
//     cookie) ou d'OPÉRATEUR authentifié (user.id) ;
//   · ce premier rempart est consulté AVANT toute requête SQL et avant
//     l'instrumentation (`monitored` insère une ligne ops_metrics par appel) ;
//   · un code INVALIDE ne consomme aucun budget de création : le compteur de
//     créations n'avance que sur `is_new_member = true` ;
//   · un passeport ÉTABLI ne touche plus aucune clé partagée, même pour
//     consommer un tour offert (où `last_stamp_at` est frais par construction).
// ────────────────────────────────────────────────────────────

const PROGRAM_ID = "00000000-0000-4000-8000-000000000001";
const GRANT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"; // 48 hex

/** Cooldown du programme mocké (plancher SQL dans les deux modes). */
const COOLDOWN_SECONDS = 300;

const { state, makeAdmin, signClaimTokenMock, cookieSetMock } = vi.hoisted(() => {
  interface PassportRow {
    visit_count: number;
    last_stamp_at: string | null;
  }

  const state = {
    grantResponse: null as unknown,
    stampResponse: null as unknown,
    spinRow: null as
      | { wheel_id: string; prize_id: string | null; is_losing: boolean }
      | null,
    prizes: [] as Array<{
      id: string;
      label: string;
      description: string;
      position: number;
      created_at: string;
    }>,
    cookieToken: "player-token" as string | null,
    ip: "203.0.113.7",
    /** Le programme visé appartient à l'organisation active (garde caisse). */
    programFound: true,
    /** Lignes `loyalty_members` existantes, indexées par hash de jeton. */
    passports: new Map<string, PassportRow>(),
    /** Filtres .eq() vus par les requêtes loyalty_members. */
    memberLookups: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Compteurs de seaux — modèle fidèle de `check_rate_limit`. */
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    reset() {
      state.grantResponse = null;
      state.stampResponse = null;
      state.spinRow = null;
      state.prizes = [];
      state.cookieToken = "player-token";
      state.ip = "203.0.113.7";
      state.programFound = true;
      state.passports = new Map();
      state.memberLookups = [];
      state.rpcCalls = [];
      state.counters = new Map();
      state.rateLimitCalls = [];
    },
  };

  const signClaimTokenMock = vi.fn((spinId: string) => `claim:${spinId}`);
  const cookieSetMock =
    vi.fn<(name: string, value: string, options?: unknown) => void>();

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        const data =
          name === "record_loyalty_stamp" ? state.stampResponse : state.grantResponse;
        return Promise.resolve({ data, error: null });
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
            if (table === "loyalty_members") {
              state.memberLookups.push({ ...filters });
              const hash = String(filters.token_hash ?? "");
              return Promise.resolve({
                data: state.passports.get(hash) ?? null,
                error: null,
              });
            }
            return Promise.resolve({
              data: table === "spins" ? state.spinRow : null,
              error: null,
            });
          },
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: table === "prizes" ? state.prizes : null,
              error: null,
            }).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin, signClaimTokenMock, cookieSetMock };
});

vi.mock("@/lib/loyalty-context", () => ({
  loyaltyTokenCookieName: (id: string) => `lc-loyalty-${id}`,
  loadLoyaltyActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      program: {
        id: PROGRAM_ID,
        min_stamp_interval_seconds: COOLDOWN_SECONDS,
      },
    }),
}));

vi.mock("@/lib/spin", () => ({ signClaimToken: signClaimTokenMock }));

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
      (
        token: string | undefined | null,
        ip?: string,
        action?: string,
      ) => Promise<boolean>
    >(),
  turnstileEnabledMock: vi.fn<() => boolean>(),
  reportSecurityEventMock:
    vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
  // `monitored` porte l'instrumentation : un appel = une ligne ops_metrics.
  // L'espionner permet d'attester qu'aucune écriture ne précède la 1re garde.
  monitoredMock: vi.fn((_name: string, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: verifyTurnstileMock,
  turnstileEnabled: turnstileEnabledMock,
}));

/**
 * Compteur de seaux calqué sur `public.check_rate_limit` : l'incrément et le
 * verdict tiennent dans le MÊME appel, et l'incrément est fait AVANT tout
 * `await`. Deux appels concurrents voient donc forcément deux valeurs
 * distinctes — c'est exactement la propriété qu'une garde « lire puis écrire »
 * n'avait pas (les deux lisaient `count = 0` et passaient toutes les deux).
 */
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    return Promise.resolve(next <= rule.limit);
  },
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  // Valeurs RÉELLES de src/lib/rate-limit.ts (épinglées par rate-limit.test.ts).
  RATE_LIMITS: {
    loyaltyStampIp: { limit: 1200, windowSeconds: 600 },
    loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
    loyaltyCheckinMember: { limit: 120, windowSeconds: 3600 },
    loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
    loyaltyPassportCreationBurst: { limit: 60, windowSeconds: 600 },
    loyaltyStaffPassportCreation: { limit: 120, windowSeconds: 3600 },
    loyaltyStaffKnownVisit: { limit: 120, windowSeconds: 3600 },
    loyaltyCounter: { limit: 60, windowSeconds: 60 },
    cashier: { limit: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: monitoredMock,
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

// Empreinte joueur déterministe (le mock admin l'ignore, on l'assert).
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

// Effets de bord non pertinents pour la consommation du spin.
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
              data: state.programFound ? { id: PROGRAM_ID } : null,
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
import { signLoyaltyCheckin } from "@/lib/loyalty-checkin";
import {
  consumeLoyaltySpin,
  getLoyaltyCheckinToken,
  stampLoyaltyVisit,
  stampLoyaltyVisitStaff,
} from "./loyalty";

const WINNING_PRIZES = [
  { id: "prize-1", label: "Stylo", description: "", position: 1, created_at: "2026-01-01T00:00:00Z" },
  { id: "prize-2", label: "Café offert", description: "Un espresso", position: 2, created_at: "2026-01-01T00:00:00Z" },
];

const MEMBER_HASH = "b".repeat(64);

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

// ── Seaux du parcours public ──
const CODE_BUCKET = (token: string) => `loyalty:stamp:code:${PROGRAM_ID}:hash:${token}`;
const MEMBER_BUCKET = (token: string) => `loyalty:stamp:member:${PROGRAM_ID}:hash:${token}`;
const SPIN_MEMBER_BUCKET = (token: string) => `loyalty:spin:member:${PROGRAM_ID}:hash:${token}`;
const CHECKIN_MEMBER_BUCKET = (token: string) =>
  `loyalty:checkin:member:${PROGRAM_ID}:hash:${token}`;
/** Clé PARTAGÉE : observabilité seule, ne doit jamais refuser. */
const SHARED_IP_BUCKET = (ip: string) => `loyalty:public:ip:${PROGRAM_ID}:${ip}`;
/** Clé PARTAGÉE : créations réelles, observabilité seule. */
const SHARED_NEW_BUCKET = `loyalty:new:program:${PROGRAM_ID}`;
// ── Seaux de caisse (clé d'opérateur authentifié) ──
const STAFF_NEW_BUCKET = "loyalty:staff:new:org-1:user-1";
const STAFF_KNOWN_BUCKET = "loyalty:staff:known:org-1:user-1";

/** Toutes les clés PARTAGÉES entre utilisateurs du parcours public. */
const SHARED_BUCKETS = [SHARED_IP_BUCKET("203.0.113.7"), SHARED_NEW_BUCKET];

/** Sature toutes les clés partagées : aucun refus ne doit en découler. */
function saturateSharedKeys() {
  for (const bucket of SHARED_BUCKETS) state.counters.set(bucket, 99_999);
}

/** Passeport ÉTABLI : >= 2 visites et dernier tampon vieux d'un cooldown. */
function establishPassport(token: string, visitCount = 4) {
  state.passports.set(`hash:${token}`, {
    visit_count: visitCount,
    last_stamp_at: ago(COOLDOWN_SECONDS * 4),
  });
}

/** Passeport FRAIS : la ligne existe, l'ancienneté n'est pas acquise. */
function freshPassport(
  token: string,
  row: { visit_count: number; last_stamp_at: string | null },
) {
  state.passports.set(`hash:${token}`, row);
}

beforeEach(() => {
  // Caisse : un éditeur authentifié de l'organisation propriétaire.
  getUserAndOrgMock.mockResolvedValue({
    user: { id: "user-1" },
    organization: { id: "org-1" },
    role: "editor",
  } as never);
  // Turnstile provisionné des deux côtés (secret + clé de site).
  turnstileEnabledMock.mockReturnValue(true);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
  // Par défaut : aucun challenge résolu (le jeton anti-robot manque).
  verifyTurnstileMock.mockResolvedValue(false);
});

afterEach(() => {
  state.reset();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("consumeLoyaltySpin", () => {
  it("gain non perdant : signe un claimToken sur spin_id + index de lot", async () => {
    state.grantResponse = {
      state: "spun",
      spin_id: "spin-1",
      wheel_id: "wheel-1",
      prize_id: "prize-2",
      is_losing: false,
    };
    state.prizes = WINNING_PRIZES;

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("spun");
      expect(res.data.isLosing).toBe(false);
      expect(res.data.prizeId).toBe("prize-2");
      expect(res.data.prizeIndex).toBe(1);
      expect(res.data.label).toBe("Café offert");
      expect(res.data.description).toBe("Un espresso");
      expect(res.data.claimToken).toBe("claim:spin-1");
    }
    expect(signClaimTokenMock).toHaveBeenCalledWith("spin-1");
    // RPC appelée avec le hash du cookie passeport et le grant fourni.
    expect(state.rpcCalls[0]).toMatchObject({
      name: "consume_loyalty_spin_grant",
      args: {
        p_program_id: PROGRAM_ID,
        p_member_token_hash: "hash:player-token",
        p_grant_token: GRANT,
      },
    });
  });

  it("tirage perdant : aucun claimToken, aucun lot", async () => {
    state.grantResponse = {
      state: "spun",
      spin_id: "spin-2",
      wheel_id: "wheel-1",
      prize_id: null,
      is_losing: true,
    };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("spun");
      expect(res.data.isLosing).toBe(true);
      expect(res.data.claimToken).toBeNull();
      expect(res.data.prizeIndex).toBeNull();
    }
    expect(signClaimTokenMock).not.toHaveBeenCalled();
  });

  it("no_prize : issue propre sans claimToken (grant rejouable)", async () => {
    state.grantResponse = { state: "no_prize" };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("no_prize");
      expect(res.data.claimToken).toBeNull();
    }
    expect(signClaimTokenMock).not.toHaveBeenCalled();
  });

  it("already_consumed : reprise via resulting_spin_id (re-signe le claim)", async () => {
    state.grantResponse = { state: "already_consumed", spin_id: "spin-9" };
    state.spinRow = { wheel_id: "wheel-1", prize_id: "prize-2", is_losing: false };
    state.prizes = WINNING_PRIZES;

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("already_consumed");
      expect(res.data.prizeId).toBe("prize-2");
      expect(res.data.prizeIndex).toBe(1);
      expect(res.data.claimToken).toBe("claim:spin-9");
    }
    expect(signClaimTokenMock).toHaveBeenCalledWith("spin-9");
  });

  it("unavailable : échec propre (aucun oracle)", async () => {
    state.grantResponse = { state: "unavailable" };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(signClaimTokenMock).not.toHaveBeenCalled();
  });

  it("sans cookie passeport : refus avant tout seau, toute RPC et toute mesure", async () => {
    state.cookieToken = null;
    state.grantResponse = { state: "spun", spin_id: "spin-1", wheel_id: "w", prize_id: "p", is_losing: false };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.rateLimitCalls).toHaveLength(0);
    expect(monitoredMock).not.toHaveBeenCalled();
  });

  it("entrée invalide (grant non hex) : rejet Zod", async () => {
    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: "nope" });
    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("client ÉTABLI tamponné À L'INSTANT : consomme son tour sans clé partagée", async () => {
    // Régression fermée : le grant est émis PAR le tampon qui l'attribue, donc
    // `last_stamp_at` est frais par construction. Exiger l'ancienneté rendait
    // `established` inatteignable ici — tout client, même or, repassait par la
    // clé mutualisée par IP.
    freshPassport("player-token", { visit_count: 7, last_stamp_at: ago(3) });
    saturateSharedKeys();
    state.grantResponse = {
      state: "spun",
      spin_id: "spin-1",
      wheel_id: "wheel-1",
      prize_id: null,
      is_losing: true,
    };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).toEqual([SPIN_MEMBER_BUCKET("player-token")]);
    expect(state.rateLimitCalls).not.toContain(SHARED_IP_BUCKET("203.0.113.7"));
  });

  it("passeport non établi : la clé partagée saturée ALERTE mais ne refuse pas", async () => {
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);
    state.grantResponse = {
      state: "spun",
      spin_id: "spin-1",
      wheel_id: "wheel-1",
      prize_id: null,
      is_losing: true,
    };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_public_pressure",
      expect.objectContaining({ program_id: PROGRAM_ID, scope: "spin" }),
    );
  });

  it("seau d'IDENTITÉ saturé : refus avant SQL, RPC et mesure", async () => {
    state.counters.set(SPIN_MEMBER_BUCKET("player-token"), 99_999);

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.memberLookups).toHaveLength(0);
    expect(monitoredMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// stampLoyaltyVisitStaff — mode par DÉFAUT en base : la caisse est le seul
// chemin où un compte authentifié fait naître des passeports.
// ────────────────────────────────────────────────────────────

describe("stampLoyaltyVisitStaff", () => {
  const stampedResponse = {
    state: "stamped",
    program: { id: PROGRAM_ID, name: "Fidélité", validation_mode: "staff" },
    visit_count: 1,
    tier: "bronze",
    tier_thresholds: { silver: 5, gold: 10 },
    milestones_reached: [],
  };

  const validToken = () =>
    signLoyaltyCheckin({ programId: PROGRAM_ID, memberTokenHash: MEMBER_HASH }).token;

  it("jeton valide : tamponne avec le hash porté par le jeton signé", async () => {
    state.stampResponse = stampedResponse;

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.state).toBe("stamped");
    // Le hash vient du payload signé : le jeton d'identité du passeport n'a
    // jamais transité par le client de caisse.
    expect(state.rpcCalls[0]).toMatchObject({
      name: "record_loyalty_stamp",
      args: {
        p_program_id: PROGRAM_ID,
        p_member_token_hash: MEMBER_HASH,
        p_validated_by: "user-1",
      },
    });
  });

  it("jeton d'identité brut (ancien QR) : REFUSÉ, aucune RPC", async () => {
    state.stampResponse = stampedResponse;

    // Ancien contrat : le QR portait la valeur du cookie (bearer 180 j).
    for (const legacy of ["player-token", "aGVsbG8td29ybGQtdG9rZW4tMjQ", MEMBER_HASH]) {
      const res = await stampLoyaltyVisitStaff({
        programId: PROGRAM_ID,
        checkinToken: legacy,
      });
      expect(res.ok).toBe(false);
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("jeton expiré : refus (un QR photographié devient inerte)", async () => {
    state.stampResponse = stampedResponse;
    const { token } = signLoyaltyCheckin(
      { programId: PROGRAM_ID, memberTokenHash: MEMBER_HASH },
      new Date(Date.now() - 60 * 60 * 1000),
    );

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: token });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("jeton d'un AUTRE programme : refus (pas de rejeu inter-programmes)", async () => {
    state.stampResponse = stampedResponse;
    const { token } = signLoyaltyCheckin({
      programId: "00000000-0000-4000-8000-0000000000ff",
      memberTokenHash: MEMBER_HASH,
    });

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: token });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("signature forgée : refus", async () => {
    state.stampResponse = stampedResponse;
    const token = validToken();
    const forged = `${token.slice(0, token.lastIndexOf("."))}.AAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: forged });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rôle non autorisé : refus avant toute vérification de jeton", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "user-2" },
      organization: { id: "org-1" },
      role: "viewer",
    } as never);

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("programme hors organisation active : refus (multi-tenant)", async () => {
    state.programFound = false;

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("création RÉELLE : isNewMember exposé + compteur d'opérateur consommé", async () => {
    state.stampResponse = { ...stampedResponse, is_new_member: true };

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(true);
    // L'écran de caisse distingue « nouveau passeport » de « client connu ».
    if (res.ok) expect(res.data.isNewMember).toBe(true);
    expect(state.rateLimitCalls).toContain(STAFF_NEW_BUCKET);
    expect(state.rateLimitCalls).not.toContain(STAFF_KNOWN_BUCKET);
    // L'identité est classée AVANT la RPC, sur (programme, hash du jeton signé).
    expect(state.memberLookups[0]).toEqual({
      program_id: PROGRAM_ID,
      token_hash: MEMBER_HASH,
    });
  });

  it("client CONNU : compteur jumeau consommé, aucun budget de création", async () => {
    state.passports.set(MEMBER_HASH, { visit_count: 3, last_stamp_at: ago(9_000) });
    state.stampResponse = { ...stampedResponse, visit_count: 4, is_new_member: false };

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.isNewMember).toBe(false);
    expect(state.rateLimitCalls).toContain(STAFF_KNOWN_BUCKET);
    expect(state.rateLimitCalls).not.toContain(STAFF_NEW_BUCKET);
  });

  it("le compteur de créations n'avance QUE sur is_new_member = true", async () => {
    // `too_soon` sur une identité inconnue en base (jeton rejoué juste après
    // une création) : aucune création, donc aucun budget consommé.
    state.stampResponse = { state: "too_soon", retry_in_seconds: 120, is_new_member: false };

    for (let i = 0; i < 5; i += 1) {
      await stampLoyaltyVisitStaff({
        programId: PROGRAM_ID,
        checkinToken: validToken(),
      });
    }

    expect(state.counters.get(STAFF_NEW_BUCKET)).toBeUndefined();

    // Une seule création réelle → exactement un crédit consommé.
    state.stampResponse = { ...stampedResponse, is_new_member: true };
    await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });
    expect(state.counters.get(STAFF_NEW_BUCKET)).toBe(1);
  });

  it("frappe de caisse : ALERTE au dépassement, jamais de refus", async () => {
    state.stampResponse = { ...stampedResponse, is_new_member: true };
    state.counters.set(STAFF_NEW_BUCKET, 120); // limite atteinte

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    // Une caisse bridée est une caisse en panne : on signale, on n'étrangle pas.
    expect(res.ok).toBe(true);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_staff_passport_burst",
      expect.objectContaining({
        program_id: PROGRAM_ID,
        organization_id: "org-1",
        validated_by: "user-1",
        // Le dénominateur du ratio nouveaux/connus, pour le même opérateur.
        known_visits_bucket: STAFF_KNOWN_BUCKET,
      }),
    );
  });

  it("seau d'OPÉRATEUR saturé : refus (clé non partagée, failClosed légitime)", async () => {
    state.counters.set("loyalty:staff:org-1:user-1", 99_999);
    state.stampResponse = stampedResponse;

    const res = await stampLoyaltyVisitStaff({
      programId: PROGRAM_ID,
      checkinToken: validToken(),
    });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// stampLoyaltyVisit — parcours public
// ────────────────────────────────────────────────────────────

const STAMPED_RESPONSE = {
  state: "stamped",
  program: { id: PROGRAM_ID, name: "Fidélité", validation_mode: "rotating_code" },
  visit_count: 4,
  tier: "bronze",
  tier_thresholds: { silver: 5, gold: 10 },
  milestones_reached: [],
};

describe("stampLoyaltyVisit — aucune clé partagée ne refuse", () => {
  it("un tiers a saturé TOUTES les clés partagées : le client passe quand même", async () => {
    // Le cœur du principe : une clé mutualisée (IP de la box, programme entier)
    // ne peut pas devenir un interrupteur. Ici l'identité est NEUVE — le cas le
    // plus défavorable, celui que les seaux de création coupaient.
    verifyTurnstileMock.mockResolvedValue(true);
    saturateSharedKeys();
    state.stampResponse = { ...STAMPED_RESPONSE, is_new_member: true };

    const res = await stampLoyaltyVisit({
      programId: PROGRAM_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    // Le dépassement a bien été SIGNALÉ (observabilité), sans rien refuser.
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_public_pressure",
      expect.objectContaining({ program_id: PROGRAM_ID, scope: "stamp" }),
    );
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_passport_creation_burst",
      expect.objectContaining({ program_id: PROGRAM_ID }),
    );
  });

  it("saturation soutenue d'une clé partagée : 60 clients neufs, 60 acceptés", async () => {
    // L'ancien plafond de création (fail-closed, par programme) rendait ce
    // scénario impossible : le 16e client d'une même box, puis le 61e du
    // programme, se voyaient refuser l'ouverture d'un passeport.
    verifyTurnstileMock.mockResolvedValue(true);
    saturateSharedKeys();
    state.stampResponse = { ...STAMPED_RESPONSE, is_new_member: true };

    let accepted = 0;
    for (let i = 0; i < 60; i += 1) {
      state.cookieToken = `client-neuf-${i}`;
      const res = await stampLoyaltyVisit({
        programId: PROGRAM_ID,
        code: "123456",
        turnstileToken: `captcha-${i}`,
      });
      if (res.ok) accepted += 1;
    }

    expect(accepted).toBe(60);
    expect(state.rpcCalls).toHaveLength(60);
  });

  it("identité inconnue : challenge exigé, sans toucher la moindre clé partagée", async () => {
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.challengeRequired).toBe(true);
    expect(state.rpcCalls).toHaveLength(0);
    // Seules les clés d'IDENTITÉ (premier rempart) ont été consultées.
    expect(state.rateLimitCalls).toEqual([
      CODE_BUCKET("player-token"),
      MEMBER_BUCKET("player-token"),
    ]);
  });

  it("challenge résolu : le tampon reprend", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({
      programId: PROGRAM_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(verifyTurnstileMock).toHaveBeenLastCalledWith(
      "captcha-ok",
      "203.0.113.7",
      "loyalty-stamp",
    );
  });

  it("Turnstile non provisionné : le parcours reste ouvert", async () => {
    // Compromis documenté : sans clés Turnstile on ne bloque pas les vrais
    // nouveaux clients. Ce que cela coûte est borné par le PRODUIT (stock fini,
    // rien avant la visite 2), plus par un seau.
    turnstileEnabledMock.mockReturnValue(false);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    state.stampResponse = STAMPED_RESPONSE;

    let accepted = 0;
    for (let i = 0; i < 20; i += 1) {
      state.cookieToken = `cookie-neuf-${i}`;
      const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });
      if (res.ok) accepted += 1;
    }

    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    expect(accepted).toBe(20);
  });

  it("secret Turnstile sans clé de site : pas de challenge insoluble", async () => {
    // Provisionner une seule des deux clés brique l'inscription : le serveur
    // refuserait un jeton que le client ne peut pas produire (aucun widget).
    turnstileEnabledMock.mockReturnValue(true);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
  });

  it("le cookie est posé dès la première tentative, même refusée", async () => {
    state.cookieToken = null;
    state.stampResponse = STAMPED_RESPONSE;

    await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(cookieSetMock.mock.calls[0][0]).toBe(`lc-loyalty-${PROGRAM_ID}`);
    expect(cookieSetMock.mock.calls[0][1]).toBe("generated-token");
    // Sans cookie il n'y a pas d'identité à interroger : aucun aller-retour base.
    expect(state.memberLookups).toHaveLength(0);
  });
});

describe("stampLoyaltyVisit — budget de création et ordre des gardes", () => {
  it("un code INVALIDE ne consomme aucun budget de création", async () => {
    // Le compteur de créations ne bouge que sur `is_new_member = true` : une
    // rafale de codes faux ne peut plus drainer le budget d'inscription des
    // vrais nouveaux clients (c'était le défaut du plafond « par tentative »).
    verifyTurnstileMock.mockResolvedValue(true);
    state.stampResponse = { state: "invalid_code" };

    for (let i = 0; i < 6; i += 1) {
      await stampLoyaltyVisit({
        programId: PROGRAM_ID,
        code: "000000",
        turnstileToken: `captcha-${i}`,
      });
    }

    expect(state.rpcCalls.length).toBeGreaterThan(0);
    expect(state.counters.get(SHARED_NEW_BUCKET)).toBeUndefined();
  });

  it("le compteur de créations n'avance que sur is_new_member = true", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.stampResponse = { ...STAMPED_RESPONSE, is_new_member: true };

    state.cookieToken = "client-a";
    await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456", turnstileToken: "c" });
    expect(state.counters.get(SHARED_NEW_BUCKET)).toBe(1);

    // Le même client revient : la RPC ne signale plus de création.
    establishPassport("client-a");
    state.stampResponse = { ...STAMPED_RESPONSE, is_new_member: false };
    await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });
    expect(state.counters.get(SHARED_NEW_BUCKET)).toBe(1);
  });

  it("premier rempart AVANT toute requête SQL et toute écriture de mesure", async () => {
    // `monitored` insère une ligne ops_metrics par appel : aucune amplification
    // d'écriture ne doit précéder la première garde.
    state.counters.set(CODE_BUCKET("player-token"), 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    expect(monitoredMock).not.toHaveBeenCalled();
    expect(state.memberLookups).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    // Une seule clé consultée : celle du demandeur.
    expect(state.rateLimitCalls).toEqual([CODE_BUCKET("player-token")]);
  });
});

describe("stampLoyaltyVisit — ancienneté d'un passeport", () => {
  it("passeport ÉTABLI : aucune clé partagée consultée, aucun challenge", async () => {
    establishPassport("player-token");
    saturateSharedKeys();
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.state).toBe("stamped");
    expect(state.rpcCalls).toHaveLength(1);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    // Seuls des seaux clés sur SON passeport sont consultés.
    expect(state.rateLimitCalls).toEqual([
      CODE_BUCKET("player-token"),
      MEMBER_BUCKET("player-token"),
    ]);
    // L'ancienneté est vérifiée sur (programme, hash) — jamais sur le cookie nu.
    expect(state.memberLookups[0]).toEqual({
      program_id: PROGRAM_ID,
      token_hash: "hash:player-token",
    });
  });

  it("passeport FRAIS : passe par l'observabilité partagée, sans jamais être refusé", async () => {
    freshPassport("player-token", {
      visit_count: 1,
      last_stamp_at: ago(COOLDOWN_SECONDS * 10),
    });
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rateLimitCalls).toContain(SHARED_IP_BUCKET("203.0.113.7"));
  });

  it("passeport tamponné à l'instant : FRAIS malgré un visit_count élevé", async () => {
    // Un tampon ne s'auto-exempte pas : il faut visit_count >= 2 ET un dernier
    // tampon antérieur d'au moins un cooldown.
    freshPassport("player-token", { visit_count: 9, last_stamp_at: ago(10) });
    state.stampResponse = STAMPED_RESPONSE;

    await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(state.rateLimitCalls).toContain(SHARED_IP_BUCKET("203.0.113.7"));
  });

  it("passeport ÉTABLI : son propre seau d'évaluations le borne quand même", async () => {
    establishPassport("player-token");
    state.stampResponse = { state: "invalid_code" };

    let accepted = 0;
    for (let i = 0; i < 12; i += 1) {
      const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });
      if (res.ok) accepted += 1;
    }

    expect(accepted).toBe(6); // loyaltyStampCodeMember
    expect(state.rpcCalls).toHaveLength(6);
  });
});

describe("stampLoyaltyVisit — atomicité des décisions", () => {
  it("rafale concurrente : un seul crédit d'identité ne laisse passer qu'un appel", async () => {
    // Une garde « lire le compteur puis l'incrémenter après la RPC » laissait
    // les deux appels lire la même valeur et passer tous les deux. Ici
    // l'incrément et le verdict tiennent dans le même appel.
    establishPassport("player-token");
    state.counters.set(CODE_BUCKET("player-token"), 5); // 6/300 → 1 crédit restant
    state.stampResponse = STAMPED_RESPONSE;

    const results = await Promise.all([
      stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" }),
      stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.counters.get(CODE_BUCKET("player-token"))).toBe(7);
  });
});

// ────────────────────────────────────────────────────────────
// getLoyaltyCheckinToken — mode caisse : aucune saisie de repli côté écran,
// un refus sur clé partagée coupait TOUT tampon derrière une même box.
// ────────────────────────────────────────────────────────────

describe("getLoyaltyCheckinToken", () => {
  it("passeport ÉTABLI : jeton délivré sans toucher la clé partagée", async () => {
    establishPassport("player-token");
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);

    const res = await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).not.toContain(SHARED_IP_BUCKET("203.0.113.7"));
  });

  it("identité non établie : clé partagée saturée → jeton délivré + alerte", async () => {
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);

    const res = await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(res.ok).toBe(true);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_public_pressure",
      expect.objectContaining({ program_id: PROGRAM_ID, scope: "checkin" }),
    );
  });

  it("seau d'IDENTITÉ saturé : refus avant SQL et avant toute mesure", async () => {
    state.counters.set(CHECKIN_MEMBER_BUCKET("player-token"), 99_999);

    const res = await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(res.ok).toBe(false);
    expect(monitoredMock).not.toHaveBeenCalled();
    expect(state.memberLookups).toHaveLength(0);
  });

  it("l'identité est résolue AVANT tout seau (le cookie est posé d'abord)", async () => {
    state.cookieToken = null;
    state.counters.set(SHARED_IP_BUCKET("203.0.113.7"), 99_999);

    await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
  });
});
