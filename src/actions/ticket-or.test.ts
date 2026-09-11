// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, createClientMock, createAdminClientMock, rateLimitMock } = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcData: null as unknown,
    rpcError: null as { message: string } | null,
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    return { data: state.rpcData, error: state.rpcError };
  };
  const sessionClient = {
    rpc,
  };
  const adminClient = { rpc };
  return {
    state,
    createClientMock: vi.fn(async () => sessionClient),
    createAdminClientMock: vi.fn(() => adminClient),
    rateLimitMock: vi.fn(async () => true),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { ticketOrEmission: { limit: 10, windowSeconds: 60 } },
  rateLimit: rateLimitMock,
  rateLimitBucket: (...parts: string[]) => parts.join(":"),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/ticket-or-context", () => ({
  gardeTicketOr: async () => ({
    ok: true,
    organizationId: "00000000-0000-4000-8000-000000000002",
    userId: "00000000-0000-4000-8000-000000000001",
    peutRegler: true,
  }),
  TICKET_PAS_LE_ROLE: "Accès refusé",
}));

import { emettreTicketOr, tirerTicketOr } from "./ticket-or";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcData = {
    state: "ok",
    code: "ABCDEFGHJK",
    expire_le: "2026-09-24T12:00:00.000Z",
  };
  state.rpcError = null;
  vi.clearAllMocks();
});

describe("emettreTicketOr", () => {
  it("émet avec la session commerçant, sur son organisation et les jours validés", async () => {
    const formData = new FormData();
    formData.set("jours", "14");

    const resultat = await emettreTicketOr(null, formData);

    expect(rateLimitMock).toHaveBeenCalledOnce();
    expect(createClientMock).toHaveBeenCalledOnce();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([
      {
        name: "emettre_ticket_or",
        args: { p_organization_id: ORGANIZATION_ID, p_jours: 14 },
      },
    ]);
    expect(resultat).toEqual({
      ok: true,
      data: {
        code: "ABCDEFGHJK",
        expireLe: "2026-09-24T12:00:00.000Z",
      },
    });
  });

  it("traduit le plafond transactionnel de la RPC", async () => {
    state.rpcData = { state: "rate_limited" };
    const formData = new FormData();

    const resultat = await emettreTicketOr(null, formData);

    expect(resultat).toEqual({
      ok: false,
      error: "Trop de tickets émis en peu de temps. Réessayez dans un instant.",
    });
  });
});

describe("tirerTicketOr", () => {
  const NONCE = "b7f4c2a1-9d3e-4f58-8a6c-0e2b1d4c7f93";

  it("transmet le nonce UUIDv4 à la RPC idempotente", async () => {
    state.rpcData = {
      state: "ok",
      lot: "Un dîner",
      code_retrait: "TICKET-ABCD2345",
      expire_le: null,
    };

    const resultat = await tirerTicketOr("ABCDEFGHJK", NONCE);

    expect(resultat).toEqual({
      state: "ok",
      lot: "Un dîner",
      codeRetrait: "TICKET-ABCD2345",
      expireLe: null,
    });
    expect(state.rpcCalls).toEqual([
      {
        name: "tirer_ticket_or",
        args: { p_code: "ABCDEFGHJK", p_nonce: NONCE },
      },
    ]);
  });

  it.each(["", "pas-un-uuid", "b7f4c2a1-9d3e-3f58-8a6c-0e2b1d4c7f93"])(
    "refuse un nonce malformé sans appeler la base (%s)",
    async (nonce) => {
      expect(await tirerTicketOr("ABCDEFGHJK", nonce)).toEqual({
        state: "introuvable",
      });
      expect(state.rpcCalls).toEqual([]);
    },
  );

  it("conserve une issue indéterminée quand la RPC échoue après un commit possible", async () => {
    state.rpcError = { message: "réponse perdue après commit" };

    await expect(tirerTicketOr("ABCDEFGHJK", NONCE)).rejects.toThrow(
      "ticket_or_tirage_indetermine",
    );
    expect(state.rpcCalls).toEqual([
      {
        name: "tirer_ticket_or",
        args: { p_code: "ABCDEFGHJK", p_nonce: NONCE },
      },
    ]);
  });
});
