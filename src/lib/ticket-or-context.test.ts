// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, createClientMock, createAdminClientMock } = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcData: null as unknown,
  };
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: state.rpcData, error: null };
    },
  };
  return {
    state,
    createClientMock: vi.fn(async () => client),
    createAdminClientMock: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  getUserAndOrg: async () => ({
    user: { id: "00000000-0000-4000-8000-000000000001" },
    organization: {
      id: "00000000-0000-4000-8000-000000000002",
      subscription_status: "active",
    },
    role: "owner",
  }),
}));
vi.mock("@/lib/subscription", () => ({ droitEffectifModule: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));

import { loadTicketOr } from "./ticket-or-context";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcData = {
    state: "ok",
    lots: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        libelle: "Un café offert",
        poids: 1,
        stock: null,
        actif: true,
        ordre: 0,
      },
    ],
    mesures: { emis: 0, tires: 0, remis: 0, a_remettre: 0 },
  };
  vi.clearAllMocks();
});

describe("loadTicketOr", () => {
  it("lit l'état avec la session commerçant et restitue le lot", async () => {
    const contexte = await loadTicketOr();

    expect(createClientMock).toHaveBeenCalledOnce();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([
      { name: "tickets_or_state", args: { p_organization_id: ORGANIZATION_ID } },
    ]);
    expect(contexte).toMatchObject({
      ok: true,
      organizationId: ORGANIZATION_ID,
      etat: { lots: [{ libelle: "Un café offert", stock: null, actif: true }] },
    });
  });
});
