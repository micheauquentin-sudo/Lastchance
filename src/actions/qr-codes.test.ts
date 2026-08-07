import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// createQrCode / updateQrStyle / deleteQrCode — LE REFUS QUI SE DISAIT « PANNE »
//
// `saveQrPoster` vérifiait le rôle (owner/editor) ; ses trois voisines s'en
// remettaient entièrement à la RLS. Le mur tenait — un caissier n'a jamais pu
// créer, styler ni supprimer un QR — mais l'échec de policy revenait dans
// `error`, donc en « Impossible de créer le QR code » ET en `reportError` :
// l'utilisateur lisait une panne technique là où il y avait un refus
// d'autorisation, et le signalait comme un bug.
//
// Ce fichier fixe le comportement des deux côtés : refus net pour la caisse,
// AVANT toute écriture ; parcours inchangé pour le propriétaire et l'éditeur.
// ────────────────────────────────────────────────────────────

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const QR = "00000000-0000-4000-8000-0000000000d1";

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    /** Toute écriture atteinte en base : doit rester vide sur un refus. */
    ecritures: [] as Array<{ table: string; verbe: string }>,
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
    user: { id: "00000000-0000-4000-8000-0000000000a1" },
    organization: { id: "org-1", name: "Ma boutique" },
    role: state.role,
  })),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/poster-storage", () => ({
  materializePosterImages: vi.fn(),
  posterImagePaths: vi.fn(() => []),
  removePosterImages: vi.fn(),
  PosterImageError: class PosterImageError extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      const chaine: Record<string, unknown> = {
        select: () => chaine,
        eq: () => chaine,
        update: () => {
          state.ecritures.push({ table, verbe: "update" });
          return chaine;
        },
        delete: () => {
          state.ecritures.push({ table, verbe: "delete" });
          return chaine;
        },
        insert: () => {
          state.ecritures.push({ table, verbe: "insert" });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "campaigns"
                ? { id: CAMPAIGN }
                : { id: QR, campaign_id: CAMPAIGN, slug: "abcd1234", poster: null },
            error: null,
          }),
      };
      return chaine;
    },
  })),
}));

const { createQrCode, deleteQrCode, updateQrStyle } = await import("./qr-codes");

function createForm() {
  const fd = new FormData();
  fd.set("campaign_id", CAMPAIGN);
  fd.set("label", "Comptoir");
  return fd;
}

function deleteForm() {
  const fd = new FormData();
  fd.set("id", QR);
  return fd;
}

/** Style minimal valide : tout le reste porte un défaut, `logo` non. */
const style = { id: QR, logo: null };

beforeEach(() => {
  state.role = "owner";
  state.ecritures = [];
});

describe("QR — un caissier reçoit un refus net, pas une erreur technique", () => {
  it("createQrCode refuse la caisse AVANT d'écrire", async () => {
    state.role = "cashier";

    const res = await createQrCode(null, createForm());

    expect(res).toEqual({ ok: false, error: "Action non autorisée" });
    expect(state.ecritures).toEqual([]);
  });

  it("updateQrStyle refuse la caisse AVANT d'écrire", async () => {
    state.role = "cashier";

    const res = await updateQrStyle(style);

    expect(res).toEqual({ ok: false, error: "Action non autorisée" });
    expect(state.ecritures).toEqual([]);
  });

  it("deleteQrCode refuse la caisse AVANT d'écrire", async () => {
    // Le geste le plus lourd des trois : un QR supprimé, c'est une affiche
    // déjà collée en vitrine qui cesse de fonctionner.
    state.role = "cashier";

    const res = await deleteQrCode(null, deleteForm());

    expect(res).toEqual({ ok: false, error: "Action non autorisée" });
    expect(state.ecritures).toEqual([]);
  });

  it("le même refus pour un rôle inconnu (défense en profondeur)", async () => {
    state.role = "visiteur-inconnu";

    expect(await createQrCode(null, createForm())).toMatchObject({ ok: false });
    expect(state.ecritures).toEqual([]);
  });
});

describe("QR — le propriétaire et l'éditeur passent, comme avant", () => {
  // CONTRÔLE NÉGATIF DE LA GARDE : sans ces trois cas, une garde trop stricte
  // fermerait le studio QR à tout le monde et les tests ci-dessus resteraient
  // verts.
  for (const role of ["owner", "editor"]) {
    it(`${role} : crée, style et supprime`, async () => {
      state.role = role;

      expect(await createQrCode(null, createForm())).toEqual({
        ok: true,
        data: undefined,
      });
      expect(await updateQrStyle(style)).toEqual({ ok: true, data: undefined });
      expect(await deleteQrCode(null, deleteForm())).toEqual({
        ok: true,
        data: undefined,
      });
      expect(state.ecritures.map((e) => e.verbe)).toEqual([
        "insert",
        "update",
        "delete",
      ]);
    });
  }
});
