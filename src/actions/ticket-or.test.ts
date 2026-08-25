// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, createClientMock, createAdminClientMock, rateLimitMock } = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcData: null as unknown,
  };
  const sessionClient = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: state.rpcData, error: null };
    },
  };
  return {
    state,
    createClientMock: vi.fn(async () => sessionClient),
    createAdminClientMock: vi.fn(),
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

import { emettreTicketOr } from "./ticket-or";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcData = {
    state: "ok",
    code: "ABCDEFGHJK",
    expire_le: "2026-09-24T12:00:00.000Z",
  };
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
});
