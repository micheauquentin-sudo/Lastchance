// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUserAndOrg: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () => mocks.getUserAndOrg(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.createClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

import { GET } from "./route";

const CALENDAR_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function singleQuery(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  return query;
}

function countQuery(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    then: <TResult1 = unknown, TResult2 = never>(
      resolve: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null | undefined,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserAndOrg.mockResolvedValue({
    user: { id: "user-1" },
    organization: { id: ORG_ID },
    role: "owner",
  });
});

describe("GET /api/dashboard/qr-distribution — gains attribués", () => {
  it("lit seulement le compteur agrégé avec le client admin après avoir vérifié le calendrier du tenant", async () => {
    const userTables: string[] = [];
    const adminTables: string[] = [];
    mocks.createClient.mockResolvedValue({
      from: (table: string) => {
        userTables.push(table);
        if (table === "calendars") return singleQuery({ data: { id: CALENDAR_ID }, error: null });
        if (table === "qr_distribution_assets") return singleQuery({ data: null, error: null });
        throw new Error(`table utilisateur inattendue: ${table}`);
      },
    });
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => {
        adminTables.push(table);
        return countQuery({ count: 3, error: null });
      },
    });

    const response = await GET(new NextRequest(`https://app.test/api/dashboard/qr-distribution?kind=calendar&id=${CALENDAR_ID}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ asset: null, rewardCount: 3 });
    expect(userTables).toEqual(["calendars", "qr_distribution_assets"]);
    expect(adminTables).toEqual(["experience_events"]);
  });

  it("n'ouvre jamais le client admin pour un rôle non autorisé", async () => {
    mocks.getUserAndOrg.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: ORG_ID },
      role: "viewer",
    });

    const response = await GET(new NextRequest(`https://app.test/api/dashboard/qr-distribution?kind=calendar&id=${CALENDAR_ID}`));

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
