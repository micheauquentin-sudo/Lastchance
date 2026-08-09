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
    /**
     * Toute écriture atteinte en base : doit rester vide sur un refus.
     * `charge` porte le payload réel de l'`insert` — le style dérivé du jeu s'y
     * lit, et un harnais qui ne capture pas la charge utile resterait vert quoi
     * qu'on écrive.
     */
    ecritures: [] as Array<{
      table: string;
      verbe: string;
      charge?: Record<string, unknown>;
    }>,
    /** Roues renvoyées à `createQrCode` pour la dérivation du style. */
    roues: [] as Array<Record<string, unknown>>,
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
        insert: (charge: Record<string, unknown>) => {
          state.ecritures.push({ table, verbe: "insert", charge });
          return Promise.resolve({ data: null, error: null });
        },
        // Terminal de la lecture des roues (`createQrCode`) : seule requête du
        // fichier qui ne finit pas par `maybeSingle`.
        order: () =>
          Promise.resolve({
            data: table === "wheels" ? state.roues : null,
            error: null,
          }),
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

/** Une roue « toujours active » portant le style passé. */
function roue(style: Record<string, unknown>) {
  return {
    id: "00000000-0000-4000-8000-0000000000e1",
    position: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    schedule_start_hour: null,
    schedule_end_hour: null,
    schedule_days: null,
    style,
  };
}

/** Le style réellement inséré dans `qr_codes` (undefined si aucun). */
function styleInsere() {
  const insert = state.ecritures.find((e) => e.verbe === "insert");
  return insert?.charge?.style as Record<string, unknown> | undefined;
}

beforeEach(() => {
  state.role = "owner";
  state.ecritures = [];
  state.roues = [];
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

// ────────────────────────────────────────────────────────────
// LE QR NAÎT HABILLÉ COMME LE JEU
//
// `createQrCode` insérait sans colonne `style` : le jsonb tombait sur `'{}'`,
// donc sur un QR noir et blanc, sur la page même d'un jeu que le commerçant
// venait d'habiller. La dérivation est 100 % SERVEUR — le formulaire n'a pas
// gagné un champ, `createQrSchema` ne prend toujours que campagne + libellé.
// ────────────────────────────────────────────────────────────
describe("createQrCode — le style vient du jeu, jamais du client", () => {
  it("écrit le style dérivé du fond de la roue active", async () => {
    state.roues = [roue({ fond: "noel", buttonFrom: "#7c3aed", pageTheme: "nuit" })];

    expect(await createQrCode(null, createForm())).toEqual({
      ok: true,
      data: undefined,
    });
    // Lavis « Noël » en fond, accent du commerçant en modules et en yeux.
    expect(styleInsere()).toEqual({
      dark: "#7c3aed",
      light: "#e6f2e6",
      eyeColor: "#7c3aed",
    });
  });

  it("n'écrit AUCUN style quand la roue n'a ni fond ni ambiance kermesse", async () => {
    state.roues = [roue({ pageTheme: "nuit", buttonFrom: "#7c3aed" })];

    expect(await createQrCode(null, createForm())).toMatchObject({ ok: true });
    // Le champ est absent, pas vide : le jsonb garde son défaut `'{}'`, donc
    // exactement le rendu d'avant.
    expect(styleInsere()).toBeUndefined();
  });

  it("n'écrit aucun style quand la campagne n'a pas encore de roue", async () => {
    state.roues = [];

    expect(await createQrCode(null, createForm())).toMatchObject({ ok: true });
    expect(styleInsere()).toBeUndefined();
  });

  it("ignore un style de roue corrompu sans faire échouer la création", async () => {
    // `resolveWheelStyle` replie sur les défauts ; le QR naît sans style plutôt
    // que de refuser un geste que le commerçant ne saurait pas réparer.
    state.roues = [roue({ bgFrom: "pas-une-couleur" } as Record<string, unknown>)];

    expect(await createQrCode(null, createForm())).toMatchObject({ ok: true });
    expect(styleInsere()).toBeUndefined();
  });

  it("un caissier n'atteint même pas la lecture des roues", async () => {
    state.role = "cashier";
    state.roues = [roue({ fond: "noel" })];

    expect(await createQrCode(null, createForm())).toMatchObject({ ok: false });
    expect(state.ecritures).toEqual([]);
  });
});
