import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updateWheelStyle — « ENREGISTRÉ » POUR UNE VALEUR JETÉE EN SILENCE
//
// `wheelStyleSchema.fond` porte `.catch(undefined)` : une clé hors catalogue
// relue en base doit rendre une page SANS fond plutôt que d'emporter les vingt
// couleurs du commerçant. C'est une tolérance de LECTURE, et le dépôt écrit
// deux fois qu'elle ne doit pas déborder sur l'écriture (`seasonal-theme.ts`,
// `fonds-ecran.ts`).
//
// Or le MÊME schéma validait l'écriture ici : un POST `{"fond":"../../x"}`
// passait, le `.catch` jetait la valeur, l'action répondait « Enregistré ». Le
// commerçant croyait avoir choisi un fond qu'il ne reverrait jamais, et rien
// dans l'écran ne le démentait.
//
// Le test porte sur l'ACTION, pas seulement sur le schéma : c'est le point
// d'appel qui choisissait le mauvais des deux sens, et un test de schéma serait
// resté vert tout le temps où le défaut vivait.
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";

const { state } = vi.hoisted(() => ({
  state: {
    /** Charge utile réellement passée à `.update()` — null si rien n'est parti. */
    updated: null as Record<string, unknown> | null,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1" },
    organization: { id: "org-1" },
    role: "owner",
  })),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/revalidate-play", () => ({ revalidatePlaySlugs: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from() {
      const c: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          state.updated = payload;
          return c;
        },
        eq: () => c,
        select: () => c,
        maybeSingle: async () => ({
          data: { campaign_id: "camp-1" },
          error: null,
        }),
      };
      return c;
    },
  })),
}));

const { updateWheelStyle } = await import("./prizes");

function form(style: Record<string, unknown>) {
  const fd = new FormData();
  fd.set("id", WHEEL_ID);
  fd.set("style", JSON.stringify(style));
  return fd;
}

describe("updateWheelStyle — l'écriture refuse ce que la lecture replie", () => {
  beforeEach(() => {
    state.updated = null;
  });

  it("REFUSE un fond hors catalogue, sans rien écrire", async () => {
    const res = await updateWheelStyle(null, form({ fond: "../../x" }));

    expect(res.ok).toBe(false);
    // Rien ne part en base : le refus est complet, pas un enregistrement
    // amputé du seul champ fautif.
    expect(state.updated).toBeNull();
  });

  it("refuse aussi une clé du prototype et une clé retirée du catalogue", async () => {
    for (const inconnu of ["constructor", "halloween"]) {
      state.updated = null;
      const res = await updateWheelStyle(null, form({ fond: inconnu }));
      expect(res.ok, inconnu).toBe(false);
      expect(state.updated).toBeNull();
    }
  });

  it("accepte et enregistre une clé du catalogue", async () => {
    const res = await updateWheelStyle(null, form({ fond: "football" }));

    expect(res.ok).toBe(true);
    expect(
      (state.updated?.style as Record<string, unknown> | undefined)?.fond,
    ).toBe("football");
  });

  it("laisse enregistrer un style SANS fond (le cas le plus courant)", async () => {
    const res = await updateWheelStyle(null, form({ pointerColor: "#ff0000" }));

    expect(res.ok).toBe(true);
    const style = state.updated?.style as Record<string, unknown> | undefined;
    expect(style?.fond).toBeUndefined();
    expect(style?.pointerColor).toBe("#ff0000");
  });

  /**
   * CONTRÔLE NÉGATIF : le durcissement porte sur le SEUL champ `fond`. Les
   * autres refus du schéma étaient déjà en place et le restent.
   */
  it("continue de refuser une couleur non hexadécimale", async () => {
    const res = await updateWheelStyle(null, form({ bgFrom: "red" }));

    expect(res.ok).toBe(false);
    expect(state.updated).toBeNull();
  });
});
