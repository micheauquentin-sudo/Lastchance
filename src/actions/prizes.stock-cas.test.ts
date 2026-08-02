import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updatePrize — ENREGISTRER UN LIBELLÉ RECRÉDITAIT LE STOCK CONSOMMÉ
//
// `prizes.stock` n'est pas un total mais le RESTANT : huit RPC de tirage font
// `update public.prizes set stock = stock - 1`. Le champ « Stock » de
// l'éditeur est un input NON CONTRÔLÉ dont le `defaultValue` fige le restant
// AU CHARGEMENT de la page, et l'action réécrivait la colonne en bloc.
//
// Le commerçant tient son comptoir, sa page reste ouverte une heure, huit
// cafés sont gagnés. Il corrige la coquille « Café ofert » → « Café offert »
// et clique Enregistrer : le stock repart à sa valeur d'il y a une heure, la
// roue redistribue huit lots qu'il n'a plus, et rien à l'écran ne le dit. Le
// client se les fait refuser au comptoir.
//
// PRINCIPE : compare-and-swap sur TROIS valeurs et non deux — ce que le champ
// AFFICHAIT (`stock_seen`), ce qu'il POSTE, et ce que la base porte
// MAINTENANT. Sans le témoin d'affichage, « il a saisi 12 » et « 12 traînait
// dans le champ » arrivent au serveur sous la même forme : c'est précisément
// pour cela que le défaut était muet.
// ────────────────────────────────────────────────────────────

const PRIZE_ID = "33333333-3333-4333-8333-333333333333";

const { state } = vi.hoisted(() => ({
  state: {
    /** Le restant réellement en base au moment de l'enregistrement. */
    stockBase: null as number | null,
    /** La charge utile réellement passée à `.update()`. */
    payload: null as Record<string, unknown> | null,
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
    // `updatePrize` ne touche qu'à `prizes` : la relecture et l'écriture
    // partagent la même table, on ne discrimine donc pas par son nom.
    from() {
      const c: Record<string, unknown> = {
        estEcriture: false,
        select: () => c,
        update: (payload: Record<string, unknown>) => {
          state.payload = payload;
          c.estEcriture = true;
          return c;
        },
        eq: () => c,
        // La relecture et l'écriture terminent toutes deux par `maybeSingle` :
        // c'est `update()` qui les distingue, pas un compteur d'appels.
        maybeSingle: async () =>
          c.estEcriture
            ? {
                data: { wheel_id: "w-1", wheels: { campaign_id: "camp-1" } },
                error: null,
              }
            : { data: { stock: state.stockBase }, error: null },
      };
      return c;
    },
  })),
}));

const { updatePrize } = await import("./prizes");

/** Le formulaire de la ligne de lot, tel que l'éditeur le poste. */
function form(champs: { stock: string; stockVu?: string; label?: string }) {
  const fd = new FormData();
  fd.set("id", PRIZE_ID);
  fd.set("label", champs.label ?? "Café offert");
  fd.set("weight", "10");
  fd.set("stock", champs.stock);
  if (champs.stockVu !== undefined) fd.set("stock_seen", champs.stockVu);
  return fd;
}

describe("updatePrize — le stock est un compteur, pas un champ de saisie", () => {
  beforeEach(() => {
    state.stockBase = null;
    state.payload = null;
  });

  it("n'écrase PAS le compteur quand le champ n'a pas été touché", async () => {
    // LE DÉFAUT LUI-MÊME : la page affichait 12, le jeu en a consommé 8, le
    // commerçant corrige un libellé. Le stock ne doit pas repartir à 12.
    state.stockBase = 4;
    const res = await updatePrize(null, form({ stock: "12", stockVu: "12" }));

    expect(res.ok).toBe(true);
    expect(state.payload).not.toBeNull();
    expect("stock" in state.payload!).toBe(false);
    // Le reste de la ligne s'enregistre normalement : le commerçant venait
    // corriger son libellé, pas toucher au stock.
    expect(state.payload!.label).toBe("Café offert");
  });

  it("écrit le stock quand le commerçant le change VRAIMENT et que rien n'a bougé", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : réapprovisionner un lot est un geste
    // légitime et quotidien. Une garde qui le bloquerait rendrait le champ
    // inutilisable et serait pire que le défaut qu'elle ferme.
    state.stockBase = 12;
    const res = await updatePrize(null, form({ stock: "50", stockVu: "12" }));

    expect(res.ok).toBe(true);
    expect(state.payload!.stock).toBe(50);
  });

  it("refuse en NOMMANT l'écart quand le commerçant saisit sur un compteur périmé", async () => {
    // Il a bien tapé une valeur (30 ≠ 12 affiché) mais la base est à 4 : on ne
    // sait pas s'il voulait 30 en partant de 12 ou en partant de 4. Écraser
    // recréditerait ; deviner mentirait. On refuse et on donne les deux
    // chiffres, seuls capables de faire arbitrer.
    state.stockBase = 4;
    const res = await updatePrize(null, form({ stock: "30", stockVu: "12" }));

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("4");
      expect(res.error).toContain("30");
    }
    // Rien n'est parti en base : ni le stock, ni le libellé.
    expect(state.payload).toBeNull();
  });

  it("laisse passer une sauvegarde ordinaire quand le compteur n'a pas bougé", async () => {
    state.stockBase = 12;
    const res = await updatePrize(null, form({ stock: "12", stockVu: "12" }));

    expect(res.ok).toBe(true);
    expect(state.payload!.stock).toBe(12);
  });

  it("traite le stock ILLIMITÉ comme une valeur, pas comme une absence", async () => {
    // Champ vide = illimité, un état légitime du produit. Le témoin vaut ""
    // et non « pas de témoin » : confondre les deux ferait refuser toute
    // sauvegarde d'un lot à stock illimité.
    state.stockBase = null;
    const res = await updatePrize(null, form({ stock: "", stockVu: "" }));

    expect(res.ok).toBe(true);
    expect(state.payload!.stock).toBeNull();
  });

  it("passer d'illimité à un stock fini reste possible", async () => {
    state.stockBase = null;
    const res = await updatePrize(null, form({ stock: "25", stockVu: "" }));

    expect(res.ok).toBe(true);
    expect(state.payload!.stock).toBe(25);
  });

  it("sans témoin, une valeur périmée est refusée plutôt qu'écrite", async () => {
    // Page servie AVANT ce correctif : aucune intention n'est démontrable. On
    // choisit le refus nommé plutôt que l'écriture silencieusement fausse —
    // le cas ne dure qu'un déploiement, et un refus se lit.
    state.stockBase = 4;
    const res = await updatePrize(null, form({ stock: "12" }));

    expect(res.ok).toBe(false);
    expect(state.payload).toBeNull();
  });

  it("sans témoin, une sauvegarde qui ne touche pas au stock passe quand même", async () => {
    // CONTRÔLE NÉGATIF du repli ci-dessus : il ne doit pas bloquer TOUTE
    // sauvegarde d'une page ancienne, seulement celles qui écriraient une
    // valeur de stock différente de la base.
    state.stockBase = 4;
    const res = await updatePrize(null, form({ stock: "4" }));

    expect(res.ok).toBe(true);
    expect(state.payload!.stock).toBe(4);
  });
});
