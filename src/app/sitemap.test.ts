// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  APP_URL: "https://simplecommeqr.fr",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

import sitemap from "./sitemap";

describe("sitemap", () => {
  it("inclut toujours les pages vitrine commerciales même si la base échoue", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "down" } });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toEqual([
      "https://simplecommeqr.fr",
      "https://simplecommeqr.fr/modules",
      "https://simplecommeqr.fr/jeux-pronostics",
      "https://simplecommeqr.fr/fidelite-communaute",
      "https://simplecommeqr.fr/vitrine-reservation",
      "https://simplecommeqr.fr/abonnements",
      "https://simplecommeqr.fr/studio",
    ]);
  });

  it("ajoute les vitrines commerçants valides avec leurs alternatives FR/EN", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { slug: "chez-leo", mise_a_jour: "2026-11-20T10:00:00.000Z" },
        { slug: "INVALID SLUG!", mise_a_jour: "2026-11-20T10:00:00.000Z" },
      ],
      error: null,
    });

    const entries = await sitemap();
    const merchant = entries.find((e) => e.url === "https://simplecommeqr.fr/v/chez-leo");

    expect(entries).toHaveLength(8);
    expect(merchant).toBeDefined();
    expect(merchant?.alternates?.languages).toEqual({
      fr: "https://simplecommeqr.fr/v/chez-leo",
      en: "https://simplecommeqr.fr/v/chez-leo/en",
    });
  });
});
