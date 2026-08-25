// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gardeEditeurVitrine: vi.fn(),
  createClient: vi.fn(),
  revaliderVitrinePublique: vi.fn(),
}));

vi.mock("@/lib/vitrine-context", () => ({
  gardeEditeurVitrine: () => mocks.gardeEditeurVitrine(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.createClient(),
}));
vi.mock("@/lib/revalidate-vitrine", () => ({
  revaliderVitrinePublique: (...args: unknown[]) =>
    mocks.revaliderVitrinePublique(...args),
}));

import { POST } from "./route";

describe("POST /api/vitrine/revalidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ client: "session" });
    mocks.revaliderVitrinePublique.mockResolvedValue(undefined);
  });

  it("refuse avant toute lecture sans la garde éditeur", async () => {
    mocks.gardeEditeurVitrine.mockResolvedValue({
      ok: false,
      error: "Action non autorisée",
    });

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revaliderVitrinePublique).not.toHaveBeenCalled();
  });

  it("purge uniquement l'adresse de l'organisation de la session", async () => {
    mocks.gardeEditeurVitrine.mockResolvedValue({
      ok: true,
      organizationId: "00000000-0000-4000-8000-0000000000a1",
      userId: "00000000-0000-4000-8000-0000000000f1",
    });

    const response = await POST();

    expect(response.status).toBe(204);
    expect(mocks.revaliderVitrinePublique).toHaveBeenCalledWith(
      { client: "session" },
      "00000000-0000-4000-8000-0000000000a1",
    );
  });
});
