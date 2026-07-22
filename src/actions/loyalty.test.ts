import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions du Passeport de fidélité
//
// consumeLoyaltySpin — raccord du tour de roue offert au flux de gain.
// On mocke le contexte (loadLoyaltyContext → admin stateful) et le moteur de
// jeton (signClaimToken) pour vérifier :
//   · un gain non perdant produit un claimToken signé sur spin_id (rebranché
//     sur claimPrize → code GAIN-…) et un index de lot pour l'animation ;
//   · un tirage perdant ne signe rien ;
//   · la reprise already_consumed relit resulting_spin_id et re-signe ;
//   · no_prize / unavailable / cookie absent se comportent proprement.
//
// stampLoyaltyVisitStaff — la caisse n'accepte QUE le jeton de check-in signé
// et éphémère (jamais le jeton d'identité du passeport).
//
// stampLoyaltyVisit — le seau d'échecs de code ne compte que les invalid_code
// et barre la route avant la RPC quand il est saturé.
// ────────────────────────────────────────────────────────────

const { state, makeAdmin, signClaimTokenMock } = vi.hoisted(() => {
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
    /** Le programme visé appartient à l'organisation active (garde caisse). */
    programFound: true,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    reset() {
      state.grantResponse = null;
      state.stampResponse = null;
      state.spinRow = null;
      state.prizes = [];
      state.cookieToken = "player-token";
      state.programFound = true;
      state.rpcCalls = [];
    },
  };

  const signClaimTokenMock = vi.fn((spinId: string) => `claim:${spinId}`);

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        const data =
          name === "record_loyalty_stamp" ? state.stampResponse : state.grantResponse;
        return Promise.resolve({ data, error: null });
      },
      from(table: string) {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              data: table === "spins" ? state.spinRow : null,
              error: null,
            }),
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

  return { state, makeAdmin, signClaimTokenMock };
});

const PROGRAM_ID = "00000000-0000-4000-8000-000000000001";
const GRANT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"; // 48 hex

vi.mock("@/lib/loyalty-context", () => ({
  loyaltyTokenCookieName: (id: string) => `lc-loyalty-${id}`,
  loadLoyaltyContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      program: { id: PROGRAM_ID },
      organization: {},
      milestones: [],
      passport: {},
    }),
}));

vi.mock("@/lib/spin", () => ({ signClaimToken: signClaimTokenMock }));

const { failureExceededMock, recordFailureMock, getUserAndOrgMock } = vi.hoisted(
  () => ({
    failureExceededMock: vi.fn(() => Promise.resolve(false)),
    recordFailureMock:
      vi.fn<(bucket: string, rule: unknown) => Promise<void>>(),
    getUserAndOrgMock: vi.fn(),
  }),
);

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  rateLimitFailureExceeded: failureExceededMock,
  recordRateLimitFailure: recordFailureMock,
  RATE_LIMITS: {
    loyaltyStampIp: { limit: 300, windowSeconds: 600 },
    loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
    loyaltyStampCodeFailure: { limit: 15, windowSeconds: 300 },
    loyaltyCounter: { limit: 60, windowSeconds: 60 },
    cashier: { limit: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
}));

// Empreinte joueur déterministe (le mock admin l'ignore, on l'assert).
vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "generated-token",
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => "203.0.113.7" }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (state.cookieToken ? { value: state.cookieToken } : undefined),
      set: vi.fn(),
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
  stampLoyaltyVisit,
  stampLoyaltyVisitStaff,
} from "./loyalty";

const WINNING_PRIZES = [
  { id: "prize-1", label: "Stylo", description: "", position: 1, created_at: "2026-01-01T00:00:00Z" },
  { id: "prize-2", label: "Café offert", description: "Un espresso", position: 2, created_at: "2026-01-01T00:00:00Z" },
];

const MEMBER_HASH = "b".repeat(64);

beforeEach(() => {
  // Caisse : un éditeur authentifié de l'organisation propriétaire.
  getUserAndOrgMock.mockResolvedValue({
    user: { id: "user-1" },
    organization: { id: "org-1" },
    role: "editor",
  } as never);
  failureExceededMock.mockResolvedValue(false);
});

afterEach(() => {
  state.reset();
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

  it("sans cookie passeport : refus avant tout appel RPC", async () => {
    state.cookieToken = null;
    state.grantResponse = { state: "spun", spin_id: "spin-1", wheel_id: "w", prize_id: "p", is_losing: false };

    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("entrée invalide (grant non hex) : rejet Zod", async () => {
    const res = await consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: "nope" });
    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
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
// stampLoyaltyVisit — seau d'échecs dédié au code tournant
// ────────────────────────────────────────────────────────────

describe("stampLoyaltyVisit — seau d'échecs de code", () => {
  it("code faux : incrémente le seau d'échecs", async () => {
    state.stampResponse = { state: "invalid_code" };

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
    expect(recordFailureMock.mock.calls[0][0]).toContain("loyalty:stamp:codefail");
  });

  it("tampon réussi : n'incrémente PAS le seau (clients légitimes d'une même IP)", async () => {
    state.stampResponse = {
      state: "stamped",
      program: { id: PROGRAM_ID, name: "Fidélité", validation_mode: "rotating_code" },
      visit_count: 2,
      tier: "bronze",
      tier_thresholds: { silver: 5, gold: 10 },
      milestones_reached: [],
    };

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(true);
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("cooldown (too_soon) : n'incrémente PAS le seau", async () => {
    state.stampResponse = { state: "too_soon", retry_in_seconds: 600 };

    await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(recordFailureMock).not.toHaveBeenCalled();
  });

  it("seau saturé : refus AVANT la RPC, message générique", async () => {
    failureExceededMock.mockResolvedValue(true);
    state.stampResponse = { state: "invalid_code" };

    const res = await stampLoyaltyVisit({ programId: PROGRAM_ID, code: "123456" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Trop de tentatives. Patientez un instant avant de retamponner.");
    expect(state.rpcCalls).toHaveLength(0);
    expect(recordFailureMock).not.toHaveBeenCalled();
  });
});
