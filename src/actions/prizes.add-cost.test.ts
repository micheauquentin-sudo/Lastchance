import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// addPrize — LE COÛT NE SE SAISISSAIT QU'AU SECOND TEMPS
//
// `addPrizeSchema` acceptait déjà `cost_cents` (il étend `prizeFieldsSchema`,
// où le champ est facultatif) : seule la lecture du FormData l'oubliait,
// alors qu'`updatePrize`, vingt lignes plus bas, la faisait. Tout lot naissait
// donc à `cost_cents = null`, et le coût ne se renseignait qu'en rouvrant le
// lot dans le formulaire de modification.
//
// Ce n'est pas cosmétique : `claim_winning_spin` impute
// `budget_spent_cents += coalesce(p.cost_cents, 0)` (20260723110000:137-145).
// Le commerçant qui pose un plafond de dépense sans repasser sur chaque lot
// lit « 0 € dépensés sur 250 € » indéfiniment. Le plafond EST armé et la
// suite pgTAP le prouve (`automation.test.sql:34-37`) — il n'a simplement
// rien à compter.
//
// Le test porte sur l'ACTION, pas sur le schéma : c'est la lecture du
// FormData qui manquait, et un test de schéma serait resté vert pendant tout
// le temps où le défaut vivait.
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";

const { state } = vi.hoisted(() => ({
  state: {
    /** Charge utile réellement passée à `.insert()`. */
    inserted: null as Record<string, unknown> | null,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/play-cache", () => ({ revalidatePlaySlugs: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "wheels") {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          maybeSingle: async () => ({
            data: { id: WHEEL_ID, campaign_id: "camp-1" },
          }),
        };
        return c;
      }
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => Promise.resolve({ count: 0 }),
        insert: (payload: Record<string, unknown>) => {
          state.inserted = payload;
          return Promise.resolve({ error: null });
        },
      };
      return c;
    },
  })),
}));

const { addPrize } = await import("./prizes");

function form(champs: Record<string, string>) {
  const fd = new FormData();
  fd.set("wheel_id", WHEEL_ID);
  fd.set("label", "Café offert");
  fd.set("weight", "10");
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

describe("addPrize — le coût est pris dès la création", () => {
  beforeEach(() => {
    state.inserted = null;
  });

  it("enregistre le coût saisi à l'ajout, en centimes", async () => {
    const res = await addPrize(null, form({ cost: "1,50" }));

    expect(res.ok).toBe(true);
    // Virgule décimale française : `eurosToCents` la normalise. Un lot à
    // 1,50 € doit peser 150 centimes au plafond, pas 1 ni 150 euros.
    expect(state.inserted?.cost_cents).toBe(150);
  });

  it("enregistre aussi la valeur commerciale", async () => {
    const res = await addPrize(null, form({ value: "3" }));

    expect(res.ok).toBe(true);
    expect(state.inserted?.value_cents).toBe(300);
  });

  it("laisse null quand le commerçant ne renseigne rien", async () => {
    // CONTRÔLE NÉGATIF DU CORRECTIF : le champ reste FACULTATIF. Le rendre
    // obligatoire transformerait l'ajout d'un lot — geste le plus banal du
    // produit — en formulaire à remplir, et un vide n'a pas le même sens
    // qu'un zéro : « je ne suis pas ce lot au budget » n'est pas
    // « ce lot me coûte 0 € ».
    const res = await addPrize(null, form({}));

    expect(res.ok).toBe(true);
    expect(state.inserted?.cost_cents).toBeNull();
    expect(state.inserted?.value_cents).toBeNull();
  });

  it("refuse un montant illisible plutôt que de le compter pour zéro", async () => {
    const res = await addPrize(null, form({ cost: "beaucoup" }));

    // Silencieusement retomber sur null ferait exactement le défaut qu'on
    // vient de fermer : un plafond qui ne compte rien, sans que personne
    // sache pourquoi.
    expect(res.ok).toBe(false);
    expect(state.inserted).toBeNull();
  });
});
