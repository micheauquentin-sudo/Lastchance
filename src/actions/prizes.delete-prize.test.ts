import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deletePrize — SUPPRIMER LE DERNIER LOT GAGNANT RENDAIT LA ROUE INJOUABLE
//
// L'action parsait, résolvait l'organisation et supprimait : aucune lecture
// d'état. Retirer le dernier lot gagnant TIRABLE d'une campagne ACTIVE laissait
// une roue où chaque client repart bredouille — exactement l'état que l'étape
// « Vérification » de l'atelier décrit comme bloquant, et qu'aucun serveur
// n'opposait. L'écran promettait un refus qui n'existait pas.
//
// ── UN REFUS SEC, PAS UNE CASE À COCHER (arbitrage 2026-08-17) ──
//
// Les deux formes coexistent dans ce fichier d'actions (`deleteWheel` porte les
// deux). Le refus sec l'emporte ici parce que le geste de sortie est disponible
// et évident : créer le lot de remplacement AVANT de supprimer l'ancien. Une
// confirmation cochable aurait coûté un marqueur, un champ, une case et une
// entrée de registre pour autoriser un état que le produit décrit lui-même
// comme cassé.
//
// ── CE QUE CE FICHIER NE COUVRE PAS, ET C'EST CONSIGNÉ ──
//
// `updatePrize` atteint le MÊME état injouable par `weight: 0`, `stock: 0` ou
// « Segment perdant », sans rien supprimer. Fermer la seule porte nommée laisse
// les trois autres ouvertes ; c'est une entrée de `docs/bugs.md`, pas un oubli.
// ────────────────────────────────────────────────────────────

const PRIZE_ID = "33333333-3333-4333-8333-333333333333";
const WHEEL_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

/** Un lot gagnant parfaitement tirable : actif, poids > 0, stock disponible. */
const GAGNANT = {
  is_active: true,
  is_losing: false,
  weight: 40,
  stock: 5 as number | null,
};

const { state } = vi.hoisted(() => ({
  state: {
    /** Statut de la campagne au-dessus de la roue. */
    statutCampagne: "active" as string,
    /** Le lot visé, tel que la relecture le rend (`null` = introuvable). */
    lot: null as Record<string, unknown> | null,
    /** Les AUTRES lots de la même roue. */
    autres: null as Array<Record<string, unknown>> | null,
    /** La lecture des autres lots échoue-t-elle ? */
    lectureAutresEnPanne: false,
    /** Les suppressions réellement parties en base. */
    deletes: [] as string[],
    /** La lecture des autres lots a-t-elle été tentée ? */
    lecturesAutres: 0,
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
    from() {
      let operation: "lecture" | "autres" | "delete" = "lecture";
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.delete = () => {
        operation = "delete";
        return c;
      };
      c.eq = (col: string, val: unknown) => {
        if (operation === "delete" && col === "id") state.deletes.push(String(val));
        // `.eq("wheel_id", …)` ne se pose QUE sur la lecture des lots frères.
        if (col === "wheel_id") operation = "autres";
        return c;
      };
      c.neq = () => {
        // Dernier maillon de la chaîne « autres lots » : elle est thenable.
        state.lecturesAutres += 1;
        return Promise.resolve(
          state.lectureAutresEnPanne
            ? { data: null, error: { message: "timeout PostgREST" } }
            : { data: state.autres, error: null },
        );
      };
      c.maybeSingle = () =>
        Promise.resolve(
          operation === "delete"
            ? {
                data: {
                  wheel_id: WHEEL_ID,
                  wheels: { campaign_id: CAMPAIGN_ID },
                },
                error: null,
              }
            : {
                data: state.lot && {
                  id: PRIZE_ID,
                  wheel_id: WHEEL_ID,
                  ...state.lot,
                  wheels: {
                    campaign_id: CAMPAIGN_ID,
                    campaigns: { status: state.statutCampagne },
                  },
                },
                error: null,
              },
        );
      return c;
    },
  })),
}));

const { deletePrize } = await import("./prizes");

function form() {
  const fd = new FormData();
  fd.set("id", PRIZE_ID);
  return fd;
}

beforeEach(() => {
  state.statutCampagne = "active";
  state.lot = { ...GAGNANT };
  state.autres = [];
  state.lectureAutresEnPanne = false;
  state.deletes = [];
  state.lecturesAutres = 0;
});

describe("deletePrize — le dernier lot gagnant d'une campagne ouverte", () => {
  it("REFUSE, avec la phrase de l'atelier, et rien ne part en base", async () => {
    // Les autres lots de la roue existent mais aucun n'est GAGNANT-TIRABLE :
    // un perdant, un désactivé, un épuisé, un à poids nul. C'est bien le
    // dernier lot que l'on gagnait encore.
    state.autres = [
      { is_active: true, is_losing: true, weight: 30, stock: null },
      { is_active: false, is_losing: false, weight: 40, stock: null },
      { is_active: true, is_losing: false, weight: 20, stock: 0 },
      { is_active: true, is_losing: false, weight: 0, stock: null },
    ];

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(false);
    // La phrase EXACTE du contrôle « Au moins un lot peut être gagné » —
    // importée, pas recopiée : l'écran et le serveur doivent dire la même
    // chose, et le mot « bredouilles » est celui que le commerçant a déjà lu.
    expect(res.ok === false && res.error).toContain("bredouilles");
    expect(state.deletes).toEqual([]);
  });

  it("un AUTRE lot gagnant tirable subsiste : la suppression passe", async () => {
    // CONTRÔLE DE NON-VACUITÉ. Sans lui, une garde trop large interdirait de
    // remanier ses lots sur une campagne ouverte — un geste banal.
    state.autres = [{ ...GAGNANT, weight: 10 }];

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([PRIZE_ID]);
  });

  it("campagne en BROUILLON : on remanie librement, aucune lecture des frères", async () => {
    // Une roue qu'aucun client ne peut jouer n'a personne à décevoir, et
    // interdire ici transformerait la préparation en parcours d'obstacles. Le
    // comptage n'est même pas lancé : c'est la garde la moins chère du dépôt.
    state.statutCampagne = "draft";
    state.autres = [];

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([PRIZE_ID]);
    expect(state.lecturesAutres).toBe(0);
  });

  it("supprimer un lot PERDANT ne déclenche jamais la garde", async () => {
    // Le prédicat vise les lots GAGNANTS tirables. Un segment « Pas de
    // chance » retiré ne prive personne d'un gain.
    state.lot = { is_active: true, is_losing: true, weight: 30, stock: null };
    state.autres = [];

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(true);
    expect(state.lecturesAutres).toBe(0);
  });

  it("supprimer un lot DÉJÀ ÉPUISÉ ne déclenche pas la garde non plus", async () => {
    // Il ne sortait plus : le retirer ne change rien à ce que les clients
    // peuvent gagner. Le prédicat est le miroir de `perform_atomic_spin`, pas
    // une lecture optimiste du libellé.
    state.lot = { is_active: true, is_losing: false, weight: 40, stock: 0 };
    state.autres = [];

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(true);
    expect(state.lecturesAutres).toBe(0);
  });

  it("LECTURE EN PANNE : refuse plutôt que de supprimer à l'aveugle", async () => {
    // Fail-closed, règle déjà écrite pour `deleteWheel` : « je n'ai pas pu
    // savoir » ne vaut pas « il n'y a rien à perdre ». Une garde qui échoue
    // ouvert protège exactement les jours où quelque chose ne va pas.
    state.lectureAutresEnPanne = true;

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(false);
    expect(state.deletes).toEqual([]);
  });

  it("lot INTROUVABLE : refus nommé, aucune suppression", async () => {
    state.lot = null;

    const res = await deletePrize(null, form());

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("Lot introuvable");
    expect(state.deletes).toEqual([]);
  });
});
