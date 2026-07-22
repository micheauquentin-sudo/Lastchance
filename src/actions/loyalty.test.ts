import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions du Passeport de fidélité
//
// consumeLoyaltySpin — raccord du tour de roue offert au flux de gain.
//
// stampLoyaltyVisitStaff — la caisse n'accepte QUE le jeton de check-in signé
// et éphémère (jamais le jeton d'identité du passeport).
//
// stampLoyaltyVisit / getLoyaltyCheckinToken — contrôle d'abus du parcours
// public. Le code à 6 chiffres est AFFICHÉ au comptoir : le lire est légitime
// et gratuit, l'abus est de le rejouer avec une IDENTITÉ NEUVE à chaque
// requête. Ce que ces tests attestent :
//   · une identité inconnue est un acte de CRÉATION : challenge Turnstile
//     d'abord (sans consommer aucun compteur), puis deux plafonds atomiques
//     (par IP, par programme) ;
//   · un passeport FRAIS (visit_count 1, ou tampon trop récent) n'est pas
//     exempté — il reste dans l'agrégat par programme ;
//   · un passeport ÉTABLI (>= 2 visites, dernier tampon vieux d'un cooldown)
//     ne touche plus aucun seau mutualisé : la saturation d'une clé
//     (programme, IP) ne le coupe plus ;
//   · toutes les décisions passent par un compteur atomique (incrément +
//     verdict dans le même appel) : une rafale concurrente ne traverse pas.
// ────────────────────────────────────────────────────────────

const PROGRAM_ID = "00000000-0000-4000-8000-000000000001";
const GRANT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"; // 48 hex

/** Cooldown du programme mocké (plancher SQL en mode code tournant). */
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
  loadLoyaltyContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      program: {
        id: PROGRAM_ID,
        min_stamp_interval_seconds: COOLDOWN_SECONDS,
      },
      organization: {},
      milestones: [],
      passport: {},
    }),
}));

vi.mock("@/lib/spin", () => ({ signClaimToken: signClaimTokenMock }));

const {
  getUserAndOrgMock,
  verifyTurnstileMock,
  turnstileEnabledMock,
  reportSecurityEventMock,
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
    loyaltyPassportCreateIp: { limit: 15, windowSeconds: 600 },
    loyaltyPassportCreateProgram: { limit: 60, windowSeconds: 600 },
    loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
    loyaltyStampCodeNoviceProgram: { limit: 60, windowSeconds: 600 },
    loyaltyCounter: { limit: 60, windowSeconds: 60 },
    cashier: { limit: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
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

  it("sans cookie passeport : refus avant tout seau et tout appel RPC", async () => {
    state.cookieToken = null;
    state.grantResponse = { state: "spun", spin_id: "spin-1", wheel_id: "w", prize_id: "p", is_losing: false };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("entrée invalide (grant non hex) : rejet Zod", async () => {
    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: "nope" });
    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("passeport ÉTABLI : le seau (programme, IP) saturé ne le coupe pas", async () => {
    establishPassport("player-token");
    state.counters.set(`loyalty:spin:ip:${PROGRAM_ID}:203.0.113.7`, 99_999);
    state.grantResponse = {
      state: "spun",
      spin_id: "spin-1",
      wheel_id: "wheel-1",
      prize_id: null,
      is_losing: true,
    };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).not.toContain(
      `loyalty:spin:ip:${PROGRAM_ID}:203.0.113.7`,
    );
  });

  it("passeport non établi : le seau (programme, IP) saturé refuse et alerte", async () => {
    state.counters.set(`loyalty:spin:ip:${PROGRAM_ID}:203.0.113.7`, 99_999);

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_spin_ip_rate_limited",
      { program_id: PROGRAM_ID },
    );
  });
});

// ────────────────────────────────────────────────────────────
// stampLoyaltyVisitStaff — la caisse n'accepte que le jeton de check-in
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

  it("jeton valide : tamponne avec le hash porté par le jeton signé", async () => {
    state.stampResponse = stampedResponse;
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM_ID,
      memberTokenHash: MEMBER_HASH,
    });

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: token });

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
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM_ID,
      memberTokenHash: MEMBER_HASH,
    });
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
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM_ID,
      memberTokenHash: MEMBER_HASH,
    });

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: token });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("programme hors organisation active : refus (multi-tenant)", async () => {
    state.programFound = false;
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM_ID,
      memberTokenHash: MEMBER_HASH,
    });

    const res = await stampLoyaltyVisitStaff({ programId: PROGRAM_ID, checkinToken: token });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// stampLoyaltyVisit — bornage de la CRÉATION d'identités
// ────────────────────────────────────────────────────────────

const STAMPED_RESPONSE = {
  state: "stamped",
  program: { id: PROGRAM_ID, name: "Fidélité", validation_mode: "rotating_code" },
  visit_count: 4,
  tier: "bronze",
  tier_thresholds: { silver: 5, gold: 10 },
  milestones_reached: [],
};

const CREATE_IP_BUCKET = (ip: string) => `loyalty:stamp:new:ip:${PROGRAM_ID}:${ip}`;
const CREATE_PROGRAM_BUCKET = `loyalty:stamp:new:program:${PROGRAM_ID}`;
const NOVICE_PROGRAM_BUCKET = `loyalty:stamp:code:novice:${PROGRAM_ID}`;

describe("stampLoyaltyVisit — création d'identité (frappe de masse)", () => {
  it("identité inconnue : challenge exigé AVANT de consommer le moindre seau", async () => {
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.challengeRequired).toBe(true);
    expect(state.rpcCalls).toHaveLength(0);
    // Décisif : une rafale sans jeton anti-robot ne draine PAS le budget de
    // création des vrais nouveaux clients.
    expect(state.rateLimitCalls).toHaveLength(0);
  });

  it("challenge résolu : le tampon reprend et consomme les deux plafonds", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({
      programId: PROGRAM_ID,
      code: "123456",
      turnstileToken: "captcha-ok",
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rateLimitCalls).toEqual([
      CREATE_IP_BUCKET("203.0.113.7"),
      CREATE_PROGRAM_BUCKET,
    ]);
    expect(verifyTurnstileMock).toHaveBeenLastCalledWith(
      "captcha-ok",
      "203.0.113.7",
      "loyalty-stamp",
    );
  });

  it("FRAPPE DE MASSE : cookie neuf à chaque requête → challengée ET bornée", async () => {
    // Scénario nominal de l'attaque : le code affiché au comptoir est lu
    // légitimement, puis rejoué avec une identité neuve à chaque requête.
    state.stampResponse = STAMPED_RESPONSE;

    // 1. Sans jeton anti-robot, rien ne passe et rien n'est consommé.
    for (let i = 0; i < 50; i += 1) {
      state.cookieToken = `cookie-neuf-${i}`;
      const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.challengeRequired).toBe(true);
    }
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.rateLimitCalls).toHaveLength(0);

    // 2. Même avec un captcha résolu à chaque coup, le seau de création par IP
    //    (15/10 min) plafonne la frappe : 15 identités, pas une de plus.
    verifyTurnstileMock.mockResolvedValue(true);
    let accepted = 0;
    for (let i = 0; i < 40; i += 1) {
      state.cookieToken = `cookie-neuf-${i}`;
      const res = await stampLoyaltyVisit({
        programId: PROGRAM_ID,
        code: "123456",
        turnstileToken: `captcha-${i}`,
      });
      if (res.ok) accepted += 1;
    }
    expect(accepted).toBe(15);
    expect(state.rpcCalls).toHaveLength(15);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_passport_creation_capped",
      { program_id: PROGRAM_ID, scope: "ip", challenge_available: true },
    );
  });

  it("POOL D'IP : le plafond par programme borne le total, toutes IP confondues", async () => {
    // Le coût d'un attaquant décroît en 1/N avec le nombre d'IP — sauf face à
    // un seau agrégé par programme, que le pool ne dilue pas.
    verifyTurnstileMock.mockResolvedValue(true);
    state.stampResponse = STAMPED_RESPONSE;

    let accepted = 0;
    for (let i = 0; i < 80; i += 1) {
      state.ip = `198.51.100.${i}`; // une IP neuve à chaque requête
      state.cookieToken = `cookie-neuf-${i}`;
      const res = await stampLoyaltyVisit({
        programId: PROGRAM_ID,
        code: "123456",
        turnstileToken: `captcha-${i}`,
      });
      if (res.ok) accepted += 1;
    }

    expect(accepted).toBe(60); // loyaltyPassportCreateProgram
    expect(state.counters.get(CREATE_PROGRAM_BUCKET)).toBe(80);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_passport_creation_capped",
      { program_id: PROGRAM_ID, scope: "program", challenge_available: true },
    );
  });

  it("Turnstile non provisionné : le parcours reste ouvert, les plafonds tiennent", async () => {
    // Compromis documenté : sans clés Turnstile on ne bloque pas les vrais
    // nouveaux clients ; la frappe reste bornée par les seaux de création.
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
    expect(accepted).toBe(15);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_passport_creation_capped",
      { program_id: PROGRAM_ID, scope: "ip", challenge_available: false },
    );
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

describe("stampLoyaltyVisit — ancienneté d'un passeport", () => {
  it("passeport FRAIS (visit_count 1) : PAS exempté, il reste dans l'agrégat", async () => {
    // Une identité frappée à l'instant ne doit pas s'auto-exempter à vie.
    freshPassport("player-token", {
      visit_count: 1,
      last_stamp_at: ago(COOLDOWN_SECONDS * 10),
    });
    state.counters.set(NOVICE_PROGRAM_BUCKET, 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.rateLimitCalls).toContain(NOVICE_PROGRAM_BUCKET);
    expect(reportSecurityEventMock).toHaveBeenCalledWith("loyalty_stamp_novice_capped", {
      program_id: PROGRAM_ID,
    });
  });

  it("passeport tamponné à l'instant : FRAIS malgré un visit_count élevé", async () => {
    // Le second critère : le dernier tampon doit être antérieur d'au moins une
    // période de cooldown, sinon une identité fraîchement frappée passerait.
    freshPassport("player-token", { visit_count: 9, last_stamp_at: ago(10) });
    state.counters.set(NOVICE_PROGRAM_BUCKET, 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("passeport jamais tampé (last_stamp_at null) : FRAIS", async () => {
    freshPassport("player-token", { visit_count: 3, last_stamp_at: null });
    state.counters.set(NOVICE_PROGRAM_BUCKET, 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
  });

  it("passeport ÉTABLI : passe malgré TOUS les seaux mutualisés saturés", async () => {
    establishPassport("player-token");
    state.counters.set(CREATE_IP_BUCKET("203.0.113.7"), 99_999);
    state.counters.set(CREATE_PROGRAM_BUCKET, 99_999);
    state.counters.set(NOVICE_PROGRAM_BUCKET, 99_999);
    state.counters.set(`loyalty:stamp:ip:${PROGRAM_ID}:203.0.113.7`, 99_999);
    state.stampResponse = STAMPED_RESPONSE;

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.state).toBe("stamped");
    expect(state.rpcCalls).toHaveLength(1);
    expect(verifyTurnstileMock).not.toHaveBeenCalled();
    // Seuls des seaux clés sur SON passeport sont consultés.
    expect(state.rateLimitCalls).toEqual([
      `loyalty:stamp:code:${PROGRAM_ID}:hash:player-token`,
      `loyalty:stamp:member:${PROGRAM_ID}:hash:player-token`,
    ]);
    // L'ancienneté est vérifiée sur (programme, hash) — jamais sur le cookie nu.
    expect(state.memberLookups[0]).toEqual({
      program_id: PROGRAM_ID,
      token_hash: "hash:player-token",
    });
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
  it("rafale concurrente : un seul crédit restant ne laisse passer qu'un appel", async () => {
    // Une garde « lire le compteur puis l'incrémenter après la RPC » laissait
    // les deux appels lire la même valeur et passer tous les deux. Ici
    // l'incrément et le verdict tiennent dans le même appel.
    freshPassport("player-token", {
      visit_count: 1,
      last_stamp_at: ago(COOLDOWN_SECONDS * 10),
    });
    state.counters.set(NOVICE_PROGRAM_BUCKET, 59); // 60/600 → 1 crédit restant
    state.stampResponse = STAMPED_RESPONSE;

    const results = await Promise.all([
      stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" }),
      stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.counters.get(NOVICE_PROGRAM_BUCKET)).toBe(61);
  });

  it("rafale concurrente sur la création : le plafond par IP tient", async () => {
    verifyTurnstileMock.mockResolvedValue(true);
    state.counters.set(CREATE_IP_BUCKET("203.0.113.7"), 14); // 15/600
    state.stampResponse = STAMPED_RESPONSE;

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        state.cookieToken = `cookie-neuf-${i}`;
        return stampLoyaltyVisit({
          programId: PROGRAM_ID,
          code: "123456",
          turnstileToken: `captcha-${i}`,
        });
      }),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// getLoyaltyCheckinToken — le seau (programme, IP) ne coupe plus les fidèles
// ────────────────────────────────────────────────────────────

describe("getLoyaltyCheckinToken", () => {
  const CHECKIN_IP_BUCKET = `loyalty:checkin:ip:${PROGRAM_ID}:203.0.113.7`;

  it("passeport ÉTABLI : jeton délivré malgré la saturation du seau IP", async () => {
    // Mode caisse par défaut + aucune saisie de repli côté écran : saturer
    // cette clé partagée coupait TOUT tampon derrière la même box.
    establishPassport("player-token");
    state.counters.set(CHECKIN_IP_BUCKET, 99_999);

    const res = await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls).not.toContain(CHECKIN_IP_BUCKET);
  });

  it("identité non établie : refus sur seau saturé, avec signal de sécurité", async () => {
    state.counters.set(CHECKIN_IP_BUCKET, 99_999);

    const res = await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(res.ok).toBe(false);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_checkin_ip_rate_limited",
      { program_id: PROGRAM_ID },
    );
  });

  it("l'identité est résolue AVANT le seau IP (le cookie est posé d'abord)", async () => {
    state.cookieToken = null;
    state.counters.set(CHECKIN_IP_BUCKET, 99_999);

    await getLoyaltyCheckinToken({ programId: PROGRAM_ID });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
  });
});
