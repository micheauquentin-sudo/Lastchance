import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// consumeLoyaltySpin — raccord du tour de roue offert au flux de gain
//
// On mocke le contexte (loadLoyaltyContext → admin stateful) et le moteur de
// jeton (signClaimToken) pour vérifier :
//   · un gain non perdant produit un claimToken signé sur spin_id (rebranché
//     sur claimPrize → code GAIN-…) et un index de lot pour l'animation ;
//   · un tirage perdant ne signe rien ;
//   · la reprise already_consumed relit resulting_spin_id et re-signe ;
//   · no_prize / unavailable / cookie absent se comportent proprement.
// ────────────────────────────────────────────────────────────

const { state, makeAdmin, signClaimTokenMock } = vi.hoisted(() => {
  const state = {
    grantResponse: null as unknown,
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
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    reset() {
      state.grantResponse = null;
      state.spinRow = null;
      state.prizes = [];
      state.cookieToken = "player-token";
      state.rpcCalls = [];
    },
  };

  const signClaimTokenMock = vi.fn((spinId: string) => `claim:${spinId}`);

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        return Promise.resolve({ data: state.grantResponse, error: null });
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

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  RATE_LIMITS: {
    loyaltyStampIp: { limit: 300, windowSeconds: 600 },
    loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
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
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

import { consumeLoyaltySpin } from "./loyalty";

const WINNING_PRIZES = [
  { id: "prize-1", label: "Stylo", description: "", position: 1, created_at: "2026-01-01T00:00:00Z" },
  { id: "prize-2", label: "Café offert", description: "Un espresso", position: 2, created_at: "2026-01-01T00:00:00Z" },
];

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
