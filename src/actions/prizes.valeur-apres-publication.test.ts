import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOT_IDENTITE_FAIBLE_INTERDIT } from "@/lib/lot-forte-valeur";

// ────────────────────────────────────────────────────────────
// updatePrize — PUBLIER À 5 €, PUIS REVALORISER À 50 €
//
// `updateCampaign` refuse d'ouvrir aux joueurs une campagne portant un lot
// gagnant de 20 € ou plus — ou dont la valeur n'est pas renseignée — parce que
// la participation publique repose sur une identité navigateur que le joueur
// peut effacer (`src/lib/lot-forte-valeur.ts`, ADR du release gate).
//
// `updatePrize` n'avait AUCUNE garde de valeur : un compare-and-swap sur le
// seul `stock`, puis `update()` en bloc. Le contrôle de publication ne repasse
// jamais tant que la campagne reste `active` — publier sous le seuil puis
// porter `value_cents` à 5000 rendait donc `{ ok: true }` et servait le lot
// cher sur une roue déjà ouverte. C'est le scénario d'attaque nommé par le
// release gate, et il n'était couvert par aucun test.
//
// ── CE QUE CE FICHIER MESURE, ET CE QU'IL REFUSE DE MESURER ──
//
// La garde compare DEUX états — celui qui sortira de l'écriture et celui que
// la base porte déjà — et ne refuse que l'AGGRAVATION. La moitié des tests
// ci-dessous sont donc des contrôles négatifs : baisser une valeur, corriger un
// libellé, remanier un brouillon, éditer un lot perdant. Une garde écrite sur
// le seul état d'arrivée resterait verte sur le scénario d'attaque tout en
// enfermant le commerçant qui vient réparer.
// ────────────────────────────────────────────────────────────

const PRIZE_ID = "33333333-3333-4333-8333-333333333333";

/** La ligne telle que la relecture la rend, embed de campagne compris. */
type LigneLot = {
  stock: number | null;
  is_active: boolean;
  is_losing: boolean;
  weight: number;
  value_cents: number | null;
  wheels: { campaigns: { status: string } };
};

const { state } = vi.hoisted(() => ({
  state: {
    lot: null as unknown,
    /** La charge utile réellement passée à `.update()` (`null` = rien n'est parti). */
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
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    // `updatePrize` ne touche qu'à `prizes` : la relecture et l'écriture
    // partagent la même table, c'est `update()` qui les distingue.
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
        maybeSingle: async () =>
          c.estEcriture
            ? {
                data: { wheel_id: "w-1", wheels: { campaign_id: "camp-1" } },
                error: null,
              }
            : { data: state.lot, error: null },
      };
      return c;
    },
  })),
}));

const { updatePrize } = await import("./prizes");

/** Un lot gagnant parfaitement tirable, à 5 € — sous le seuil de 20 €. */
function lot(patch: Partial<LigneLot> = {}): LigneLot {
  return {
    stock: 10,
    is_active: true,
    is_losing: false,
    weight: 40,
    value_cents: 500,
    wheels: { campaigns: { status: "active" } },
    ...patch,
  };
}

/**
 * Le formulaire de la ligne de lot, tel que `prize-editor.tsx` le poste : il
 * rend TOUJOURS `value`, d'où l'absence de cas « champ non rendu » ici.
 */
function form(champs: {
  value: string;
  label?: string;
  weight?: string;
  stock?: string;
  stockVu?: string;
  perdant?: boolean;
}) {
  const fd = new FormData();
  fd.set("id", PRIZE_ID);
  fd.set("label", champs.label ?? "Café offert");
  fd.set("weight", champs.weight ?? "40");
  fd.set("stock", champs.stock ?? "10");
  fd.set("stock_seen", champs.stockVu ?? champs.stock ?? "10");
  fd.set("value", champs.value);
  if (champs.perdant) fd.set("is_losing", "on");
  return fd;
}

beforeEach(() => {
  state.lot = lot();
  state.payload = null;
});

describe("updatePrize — la valeur d'un lot publié ne se relève pas en douce", () => {
  it("LE SCÉNARIO DU RELEASE GATE : 5 € publiés, 50 € enregistrés, refus", async () => {
    // Campagne ACTIVE, lot gagnant tirable à 500 centimes : la publication est
    // passée, le contrôle ne repassera plus. Le porter à 5000 est exactement le
    // geste que la garde de publication existait pour empêcher.
    const res = await updatePrize(null, form({ value: "50" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(LOT_IDENTITE_FAIBLE_INTERDIT);
    // Rien n'est parti en base : ni la valeur, ni le reste de la ligne.
    expect(state.payload).toBeNull();
  });

  it("EFFACER la valeur est refusé comme la relever", async () => {
    // Une valeur absente n'est pas « un lot sans valeur » mais un lot dont on
    // NE SAIT RIEN : `lotInterditAvecIdentiteFaible` la traite en défaut fermé,
    // et le tirage refuse déjà de servir un tel lot. Laisser passer l'effacement
    // ici offrirait la même sortie que la revalorisation, en un caractère.
    const res = await updatePrize(null, form({ value: "" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(LOT_IDENTITE_FAIBLE_INTERDIT);
    expect(state.payload).toBeNull();
  });

  it("le seuil est INCLUSIF : 20 € pile est refusé", async () => {
    // `SEUIL_LOT_FORTE_VALEUR_CENTS` est testé `>=` — un lot calibré pile sur
    // la limite est le cas le plus probable, pas le plus rare. Si cette garde
    // avait recopié un `>` , elle aurait ouvert la porte la plus empruntée.
    const res = await updatePrize(null, form({ value: "20" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(LOT_IDENTITE_FAIBLE_INTERDIT);
  });

  it("REMETTRE AU TIRAGE un lot cher mis en réserve est refusé aussi", async () => {
    // L'attaque en DEUX TEMPS : poser 50 € sur un lot à poids nul (inoffensif,
    // donc accepté), puis relever le poids. La garde compare la TIRABILITÉ des
    // deux états, pas seulement la valeur : le second temps est l'aggravation.
    state.lot = lot({ value_cents: 5000, weight: 0 });

    const res = await updatePrize(null, form({ value: "50", weight: "40" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(LOT_IDENTITE_FAIBLE_INTERDIT);
    expect(state.payload).toBeNull();
  });
});

describe("updatePrize — ce que la garde laisse passer, et doit laisser passer", () => {
  it("BAISSER une valeur interdite est le geste qui répare : il passe", async () => {
    // Des campagnes tournent avec de tels lots — la garde de publication leur
    // est postérieure. Refuser ici retirerait au commerçant la seule sortie.
    state.lot = lot({ value_cents: 5000 });

    const res = await updatePrize(null, form({ value: "5" }));

    expect(res.ok).toBe(true);
    expect(state.payload?.value_cents).toBe(500);
  });

  it("corriger le LIBELLÉ d'un lot déjà au-dessus du seuil passe", async () => {
    // L'aggravation est nulle : l'état d'arrivée vaut l'état de départ. Une
    // garde écrite sur le seul état d'arrivée aurait enfermé ce lot-là.
    state.lot = lot({ value_cents: 5000 });

    const res = await updatePrize(
      null,
      form({ value: "50", label: "Panier garni" }),
    );

    expect(res.ok).toBe(true);
    expect(state.payload?.label).toBe("Panier garni");
  });

  it("une sauvegarde ordinaire sous le seuil n'est pas ralentie", async () => {
    const res = await updatePrize(
      null,
      form({ value: "5", label: "Café offert" }),
    );

    expect(res.ok).toBe(true);
    expect(state.payload?.value_cents).toBe(500);
  });

  it("changer le STOCK d'un lot sous le seuil passe", async () => {
    const res = await updatePrize(
      null,
      form({ value: "5", stock: "50", stockVu: "10" }),
    );

    expect(res.ok).toBe(true);
    expect(state.payload?.stock).toBe(50);
  });

  it("BROUILLON : on remanie librement, y compris vers 50 €", async () => {
    // Une roue qu'aucun client ne peut jouer n'a personne à léser, et le
    // contrôle de publication repassera — sur toutes les roues — à l'ouverture.
    // Interdire ici transformerait la préparation en parcours d'obstacles.
    state.lot = lot({ wheels: { campaigns: { status: "draft" } } });

    const res = await updatePrize(null, form({ value: "50" }));

    expect(res.ok).toBe(true);
    expect(state.payload?.value_cents).toBe(5000);
  });

  it("un lot PERDANT n'est pas concerné, quelle que soit sa valeur", async () => {
    // Un segment perdant ne fait rien gagner : sa valeur ne décrit aucun
    // préjudice possible. `lotInterditAvecIdentiteFaible` les sort du champ.
    state.lot = lot({ is_losing: true, value_cents: 500 });

    const res = await updatePrize(null, form({ value: "50", perdant: true }));

    expect(res.ok).toBe(true);
    expect(state.payload?.value_cents).toBe(5000);
  });

  it("un lot DÉSACTIVÉ ne distribue rien : le relever ne franchit aucune garde", async () => {
    // `is_active` n'appartient pas à `updatePrizeSchema` : cette action ne peut
    // pas le rallumer. Le rallumage passe par un autre chemin, qui a sa propre
    // lecture — et le tirage, lui, ne sert jamais un lot inactif.
    state.lot = lot({ is_active: false });

    const res = await updatePrize(null, form({ value: "50" }));

    expect(res.ok).toBe(true);
    expect(state.payload?.value_cents).toBe(5000);
  });
});
