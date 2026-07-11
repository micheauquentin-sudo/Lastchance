import { afterEach, describe, expect, it, vi } from "vitest";

// Capture les purges ISR sans runtime Next réel.
const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { revalidatePlaySlugs } from "./revalidate-play";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Client Supabase minimal : enregistre le filtre reçu, renvoie `rows`. */
function fakeSupabase(rows: Array<{ slug: string }> | null) {
  const calls: Array<{ column: string; value: string }> = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("qr_codes");
      return {
        select: (columns: string) => {
          expect(columns).toBe("slug");
          return {
            eq: async (column: string, value: string) => {
              calls.push({ column, value });
              return { data: rows, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

afterEach(() => {
  revalidatePathMock.mockReset();
});

describe("revalidatePlaySlugs — purge ISR des pages /play", () => {
  it("purge chaque slug d'une campagne", async () => {
    const { client, calls } = fakeSupabase([{ slug: "AAAA" }, { slug: "BBBB" }]);
    await revalidatePlaySlugs(client, { campaignId: "camp-1" });

    expect(calls).toEqual([{ column: "campaign_id", value: "camp-1" }]);
    expect(revalidatePathMock.mock.calls.map((c) => c[0])).toEqual([
      "/play/AAAA",
      "/play/BBBB",
    ]);
  });

  it("filtre par organisation quand demandé (logo : tous les QR de l'org)", async () => {
    const { client, calls } = fakeSupabase([{ slug: "CCCC" }]);
    await revalidatePlaySlugs(client, { organizationId: "org-9" });

    expect(calls).toEqual([{ column: "organization_id", value: "org-9" }]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/play/CCCC");
  });

  it("ne purge rien et ne jette pas quand la lecture ne renvoie rien", async () => {
    const { client } = fakeSupabase(null);
    await expect(
      revalidatePlaySlugs(client, { campaignId: "camp-vide" }),
    ).resolves.toBeUndefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
