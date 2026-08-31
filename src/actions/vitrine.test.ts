import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// VITRINE — GARDES D'INNOCUITÉ DES ACTIONS (VIT-1a, lot L10)
//
// `src/lib/vitrine.test.ts` couvre les fonctions PURES (lecture des jsonb).
// Ce fichier couvre l'autre bout : ce qui ÉCRIT. Trois invariants, vérifiés sur
// le comportement RÉEL de l'action et non sur ses commentaires.
//
//   1. AUCUNE ÉCRITURE SANS LA GARDE. Le caissier, la session expirée et
//      l'absence de droit `vitrine` refusent AVANT toute requête — vérifié par
//      le compte de requêtes émises, qui doit rester à zéro. Un refus qui écrit
//      d'abord et refuse ensuite n'est pas un refus.
//
//   2. L'ORGANISATION VIENT DE LA SESSION, JAMAIS DU FORMULAIRE. Chaque
//      écriture porte un filtre ou une colonne `organization_id` valant celle
//      de la session, et le CRUD passe par le client de SESSION (donc sous RLS)
//      — jamais par `createAdminClient`, qui court-circuiterait les policies
//      « vitrine_* : editors ». Le service_role n'apparaît QUE sur
//      `set_vitrine_slug`, qui l'exige et revérifie l'acteur en SQL.
//
//   3. CE QUE LE LOT NE FAIT PAS, IL NE L'ÉCRIT PAS. Aucune action n'envoie de
//      `cover_path` ni de `photo_path` autrement qu'à `null` : le pipeline
//      d'images n'existe pas dans ce lot, et une colonne écrite « au cas où »
//      serait un chemin que rien ne sert.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
const USER_ID = "00000000-0000-4000-8000-0000000000f1";
const CARTE_ID = "00000000-0000-4000-8000-0000000000b1";
const RUBRIQUE_ID = "00000000-0000-4000-8000-0000000000c1";
const FICHE_ID = "00000000-0000-4000-8000-0000000000d1";
/** La VERSION VUE : ce que l'écran a reçu, ce qu'il reposte. */
const VERSION_SOURCE = "2026-08-20T10:00:00+00:00";

interface DbCall {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: Record<string, unknown>;
}

const { state, makeClient } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{
      table: string;
      op: "select" | "insert" | "update" | "delete";
      payload: unknown;
      filters: Record<string, unknown>;
    }>,
    /** Ligne rendue par un `.select().maybeSingle()` après écriture. */
    row: { id: "row-1", slug: "le-comptoir", published: true } as unknown,
    /** Erreur simulée sur l'écriture suivante. */
    error: null as { message: string; code?: string } | null,
    /**
     * Erreur simulée sur les seules INSERTIONS.
     *
     * `setVitrineContenu` écrit en deux temps (mise à jour, puis insertion si
     * la place était vide) : sans ce second canal, la course d'unicité serait
     * intestable — `state.error` ferait échouer la mise à jour, donc l'insertion
     * n'aurait jamais lieu.
     */
    erreurInsert: null as { message: string; code?: string } | null,
    reset() {
      state.calls = [];
      state.row = { id: "row-1", slug: "le-comptoir", published: true };
      state.error = null;
      state.erreurInsert = null;
    },
  };

  function makeClient() {
    return {
      from(table: string) {
        const call = {
          table,
          op: "select" as "select" | "insert" | "update" | "delete",
          payload: undefined as unknown,
          filters: {} as Record<string, unknown>,
        };
        state.calls.push(call);

        const settle = () => {
          const erreur =
            call.op === "insert" ? (state.erreurInsert ?? state.error) : state.error;
          return erreur
            ? { data: null, error: erreur }
            : { data: state.row, error: null };
        };

        const builder = {
          select: () => builder,
          insert: (payload: unknown) => {
            call.op = "insert";
            call.payload = payload;
            return builder;
          },
          update: (payload: unknown) => {
            call.op = "update";
            call.payload = payload;
            return builder;
          },
          delete: () => {
            call.op = "delete";
            return builder;
          },
          eq: (column: string, value: unknown) => {
            call.filters[column] = value;
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve(settle()),
          single: () => Promise.resolve(settle()),
          then: (
            onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(settle()).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeClient };
});

const { gardeMock, rpcMock, adminFromMock, revalidateMock, rateLimitMock } =
  vi.hoisted(() => ({
    gardeMock: vi.fn(),
    rpcMock: vi.fn(),
    adminFromMock: vi.fn(),
    revalidateMock: vi.fn(),
    rateLimitMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeClient()),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock, from: adminFromMock }),
}));
vi.mock("@/lib/vitrine-context", () => ({ gardeEditeurVitrine: gardeMock }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  // Valeur RÉELLE de src/lib/rate-limit.ts (bornes épinglées là-bas).
  RATE_LIMITS: {
    vitrineSlug: { limit: 20, windowSeconds: 3600 },
    vitrineImport: { limit: 10, windowSeconds: 3600 },
  },
}));

import {
  createVitrineCarte,
  createVitrineFiche,
  createVitrineRubrique,
  activerExperiencesVitrine,
  deleteVitrineCarte,
  deleteVitrineContenu,
  deleteVitrineTraduction,
  importVitrineCarte,
  publishVitrine,
  reorderVitrineFiches,
  saveVitrineSettings,
  setVitrineContenu,
  setVitrineSlug,
  setVitrineTraduction,
  toggleVitrineFicheDisponibilite,
  unpublishVitrine,
  updateVitrineFiche,
} from "./vitrine";

function gardeOk() {
  gardeMock.mockResolvedValue({
    ok: true,
    organizationId: ORG_ID,
    userId: USER_ID,
  });
}

function gardeRefusee(error = "Action non autorisée") {
  gardeMock.mockResolvedValue({ ok: false, error });
}

function fd(champs: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (Array.isArray(valeur)) {
      for (const v of valeur) form.append(cle, v);
    } else {
      form.set(cle, valeur);
    }
  }
  return form;
}

function callsTo(table: string): DbCall[] {
  return state.calls.filter((call) => call.table === table);
}

afterEach(() => {
  state.reset();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Le seau laisse passer par défaut : chaque test qui veut le voir refuser le
  // dit explicitement.
  rateLimitMock.mockResolvedValue(true);
});

/** Les chemins passés à `revalidatePath`, dans l'ordre. */
function cheminsRevalides(): string[] {
  return revalidateMock.mock.calls.map((appel) => String(appel[0]));
}

// Les créations servent désormais l'éditeur local : il peut insérer la ligne
// créée sans recharger la page ni relire toute la vitrine.
describe("les créations rendent l'état local minimal", () => {
  it("une carte rend ses champs éditables, sans métadonnée interne", async () => {
    gardeOk();
    state.row = { id: CARTE_ID, nom: "Carte du midi", ordre: 2, active: true };

    const res = await createVitrineCarte(null, fd({ nom: "Carte du midi" }));

    expect(res).toEqual({
      ok: true,
      data: { id: CARTE_ID, nom: "Carte du midi", ordre: 2, active: true },
    });
    expect(res.ok && res.data).not.toHaveProperty("organization_id");
  });

  it("une rubrique rend son identité et son rang", async () => {
    gardeOk();
    state.row = { id: RUBRIQUE_ID, nom: "Entrées", ordre: 1 };

    const res = await createVitrineRubrique(
      null,
      fd({ menu_id: CARTE_ID, nom: "Entrées" }),
    );

    expect(res).toEqual({
      ok: true,
      data: { id: RUBRIQUE_ID, nom: "Entrées", ordre: 1 },
    });
  });

  it("une fiche rend aussi les valeurs par défaut attendues par l'éditeur", async () => {
    gardeOk();
    state.row = { id: FICHE_ID, nom: "Soupe", ordre: 4 };

    const res = await createVitrineFiche(
      null,
      fd({ categorie_id: RUBRIQUE_ID, nom: "Soupe" }),
    );

    expect(res).toEqual({
      ok: true,
      data: {
        id: FICHE_ID,
        nom: "Soupe",
        ordre: 4,
        description: null,
        prix_affiche: null,
        photo_path: null,
        photo_alt: null,
        facettes: [],
        action: null,
        badges: [],
        allergenes: [],
        disponible: true,
      },
    });
  });

  it("ne revalide pas dans la réponse de création", async () => {
    gardeOk();

    await createVitrineCarte(null, fd({ nom: "Carte du midi" }));
    await createVitrineRubrique(null, fd({ menu_id: CARTE_ID, nom: "Entrées" }));
    await createVitrineFiche(null, fd({ categorie_id: RUBRIQUE_ID, nom: "Soupe" }));

    // Le routeur Next transforme une revalidation dans une Server Action en
    // navigation RSC. La purge publique est donc faite par la route POST
    // authentifiée, après que l'éditeur a affiché le retour canonique.
    expect(cheminsRevalides()).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// Invariant 1 — aucune écriture sans la garde
// ────────────────────────────────────────────────────────────

describe("la garde refuse AVANT d'écrire", () => {
  const gestes: Array<[string, () => Promise<{ ok: boolean }>]> = [
    ["createVitrineCarte", () => createVitrineCarte(null, fd({ nom: "Midi" }))],
    [
      "createVitrineRubrique",
      () =>
        createVitrineRubrique(
          null,
          fd({ menu_id: CARTE_ID, nom: "Entrées" }),
        ),
    ],
    [
      "createVitrineFiche",
      () =>
        createVitrineFiche(
          null,
          fd({ categorie_id: RUBRIQUE_ID, nom: "Soupe" }),
        ),
    ],
    ["deleteVitrineCarte", () => deleteVitrineCarte(null, fd({ id: CARTE_ID }))],
    [
      "toggleVitrineFicheDisponibilite",
      () =>
        toggleVitrineFicheDisponibilite(
          null,
          fd({ id: FICHE_ID, disponible: "false" }),
        ),
    ],
    ["publishVitrine", () => publishVitrine()],
    ["unpublishVitrine", () => unpublishVitrine()],
    [
      "reorderVitrineFiches",
      () =>
        reorderVitrineFiches(
          null,
          fd({ categorie_id: RUBRIQUE_ID, order: JSON.stringify([FICHE_ID]) }),
        ),
    ],
    ["setVitrineSlug", () => setVitrineSlug(null, fd({ slug: "le-comptoir" }))],
    [
      "importVitrineCarte",
      () =>
        importVitrineCarte(
          null,
          fd({ import: JSON.stringify({ nom: "Carte du midi" }) }),
        ),
    ],
    [
      "saveVitrineSettings",
      () => saveVitrineSettings(null, fd({ accroche: "Bistrot" })),
    ],
    [
      "setVitrineContenu",
      () =>
        setVitrineContenu(
          null,
          fd({ rang: "1", titre: "Le reportage", url: "https://presse.test/a" }),
        ),
    ],
    ["deleteVitrineContenu", () => deleteVitrineContenu(null, fd({ rang: "2" }))],
    [
      "setVitrineTraduction",
      () =>
        setVitrineTraduction(
          null,
          fd({
            cible_type: "item",
            cible_id: FICHE_ID,
            champ: "nom",
            texte: "Pumpkin soup",
            version: VERSION_SOURCE,
          }),
        ),
    ],
    [
      "deleteVitrineTraduction",
      () =>
        deleteVitrineTraduction(
          null,
          fd({ cible_type: "item", cible_id: FICHE_ID, champ: "nom" }),
        ),
    ],
  ];

  it.each(gestes)("%s refuse le caissier sans émettre de requête", async (
    _nom,
    geste,
  ) => {
    gardeRefusee();
    const res = await geste();
    expect(res.ok).toBe(false);
    // ZÉRO REQUÊTE : un refus qui écrit d'abord n'est pas un refus. Ce compte
    // couvre aussi bien le client de session que le service_role.
    expect(state.calls).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// Invariant 2 — l'organisation vient de la session
// ────────────────────────────────────────────────────────────

describe("l'organisation vient de la SESSION, jamais du formulaire", () => {
  it("une carte est créée avec l'organisation de la session", async () => {
    gardeOk();
    const res = await createVitrineCarte(
      null,
      // `organization_id` posté est IGNORÉ : le schéma ne le lit pas, et
      // l'action n'écrit que celui de la garde.
      fd({ nom: "Carte du midi", organization_id: "org-du-voisin" }),
    );

    expect(res.ok).toBe(true);
    const insertion = callsTo("vitrine_menus").find((c) => c.op === "insert");
    expect(insertion).toBeDefined();
    expect(
      (insertion!.payload as Record<string, unknown>).organization_id,
    ).toBe(ORG_ID);
  });

  it("une rubrique porte l'organisation de la session ET sa carte", async () => {
    gardeOk();
    await createVitrineRubrique(
      null,
      fd({ menu_id: CARTE_ID, nom: "Entrées" }),
    );

    const insertion = callsTo("vitrine_categories").find(
      (c) => c.op === "insert",
    );
    const payload = insertion!.payload as Record<string, unknown>;
    // Les deux colonnes de la FK COMPOSITE : c'est elle qui refuse de coudre
    // une rubrique sous la carte d'un autre locataire.
    expect(payload.organization_id).toBe(ORG_ID);
    expect(payload.menu_id).toBe(CARTE_ID);
  });

  it("chaque mise à jour porte un filtre organization_id explicite", async () => {
    gardeOk();
    await updateVitrineFiche(
      null,
      fd({ id: FICHE_ID, nom: "Soupe", badges: ["vegan"] }),
    );

    const maj = callsTo("vitrine_items").find((c) => c.op === "update");
    expect(maj!.filters.id).toBe(FICHE_ID);
    // En plus de la RLS `is_org_editor` : la ceinture ET les bretelles, parce
    // qu'une policy retirée par erreur ne se voit dans aucun test d'action.
    expect(maj!.filters.organization_id).toBe(ORG_ID);
  });

  it("le réordonnancement borne aussi sur le PARENT", async () => {
    gardeOk();
    await reorderVitrineFiches(
      null,
      fd({ categorie_id: RUBRIQUE_ID, order: JSON.stringify([FICHE_ID]) }),
    );

    const maj = callsTo("vitrine_items").find((c) => c.op === "update");
    expect(maj!.filters.organization_id).toBe(ORG_ID);
    // Garde de COHÉRENCE, pas de locataire : sans elle, un identifiant glissé
    // dans la liste réordonnerait une fiche d'une autre rubrique du commerce.
    expect(maj!.filters.categorie_id).toBe(RUBRIQUE_ID);
    expect((maj!.payload as Record<string, unknown>).ordre).toBe(0);
  });

  it("le CRUD n'utilise JAMAIS le service_role", async () => {
    gardeOk();
    await createVitrineCarte(null, fd({ nom: "Midi" }));
    await updateVitrineFiche(null, fd({ id: FICHE_ID, nom: "Soupe" }));
    await deleteVitrineCarte(null, fd({ id: CARTE_ID }));

    // Le service_role court-circuiterait les policies « vitrine_* : editors ».
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it("setVitrineSlug passe l'acteur de la SESSION à la RPC", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", slug: "le-comptoir", created: true, changed: true },
      error: null,
    });

    const res = await setVitrineSlug(
      null,
      fd({ slug: "  Le-Comptoir ", actor: "quelqu-un-d-autre" }),
    );

    expect(res.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("set_vitrine_slug", {
      p_organization_id: ORG_ID,
      // Normalisé comme en SQL — minuscules et détourage, rien d'autre.
      p_slug: "le-comptoir",
      // DE LA SESSION : un acteur posté ferait de la ligne d'audit une
      // déclaration sur l'honneur.
      p_actor: USER_ID,
    });
  });
});

// ────────────────────────────────────────────────────────────
// Invariant 3 — ce que le lot ne fait pas, il ne l'écrit pas
// ────────────────────────────────────────────────────────────

describe("aucun pipeline d'images dans ce lot", () => {
  it("une fiche créée pose photo_path à null, explicitement", async () => {
    gardeOk();
    await createVitrineFiche(
      null,
      fd({ categorie_id: RUBRIQUE_ID, nom: "Soupe" }),
    );

    const payload = callsTo("vitrine_items").find((c) => c.op === "insert")!
      .payload as Record<string, unknown>;
    expect(payload.photo_path).toBeNull();
  });

  it("l'édition d'une fiche ne touche NI photo_path NI le rattachement NI le rang", async () => {
    gardeOk();
    await updateVitrineFiche(null, fd({ id: FICHE_ID, nom: "Soupe" }));

    const payload = callsTo("vitrine_items").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    // Les envoyer ici ferait qu'éditer un libellé remette la fiche à sa place
    // d'avant — et écraserait un rang que les flèches ↑↓ viennent de poser.
    expect(payload).not.toHaveProperty("photo_path");
    expect(payload).not.toHaveProperty("categorie_id");
    expect(payload).not.toHaveProperty("ordre");
  });

  it("les réglages n'écrivent pas cover_path", async () => {
    gardeOk();
    await saveVitrineSettings(null, fd({ accroche: "Bistrot de quartier" }));

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("cover_path");
  });
});

// ────────────────────────────────────────────────────────────
// Le thème : composé aux NOMS DE LA BASE, sans clé vide
// ────────────────────────────────────────────────────────────

describe("saveVitrineSettings — le thème part sous ses noms SQL", () => {
  it("compose les quatre clés du validateur, et pas une de plus", async () => {
    gardeOk();
    await saveVitrineSettings(
      null,
      fd({
        accroche: "Bistrot",
        histoire: "",
        horaires_texte: "12h-14h",
        couleur_primary: "#112233",
        couleur_secondary: "",
        police_heading: "elegant",
        police_body: "",
        style_cartes: "magazine",
        ordre_blocs: JSON.stringify(["cartes", "accroche", "inconnu"]),
      }),
    );

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    // `""` → `null` : `null` dit « non renseigné », une chaîne vide aurait été
    // une seconde façon d'écrire le même fait.
    expect(payload.histoire).toBeNull();
    expect(payload.horaires_texte).toBe("12h-14h");
    // `style_cartes` et non `styleCartes` : `is_valid_vitrine_theme` est fermée
    // aux deux rangs, un camelCase serait refusé en 23514.
    expect(payload.theme).toEqual({
      couleurs: { primary: "#112233" },
      polices: { heading: "elegant" },
      style_cartes: "magazine",
      ordre_blocs: ["cartes", "accroche"],
    });
  });

  it("un thème entièrement vide vaut {} — jamais des sous-objets vides", async () => {
    gardeOk();
    await saveVitrineSettings(null, fd({ accroche: "Bistrot" }));

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    // `{"couleurs":{}}` dirait « personnalisé, avec rien » : un état de plus à
    // distinguer dans chaque lecture, pour aucun gain.
    expect(payload.theme).toEqual({});
  });

  // ── LE TÉMOIN D'ALLURE (VIT-13) ─────────────────────────────
  //
  // CES DEUX TESTS GARDENT UN DÉFAUT RÉEL, trouvé en écrivant le lot et non
  // imaginé après coup. Les sept interrupteurs d'allure valent `true` par
  // défaut, et une case NON RENDUE se poste exactement comme une case
  // DÉCOCHÉE : rien. Sans témoin, tout formulaire ne portant pas la section
  // écrivait sept `false` — en-tête figé, capitales éteintes, compteurs,
  // monogramme, favoris et recherche retirés — sans message et sans trace.
  //
  // C'est la classe de panne que ce dépôt paie le plus cher : un
  // enregistrement qui réussit en ayant fait autre chose que ce qu'on croit.

  it("sans témoin, l'allure n'est PAS touchée — sept réglages ne s'éteignent pas tout seuls", async () => {
    gardeOk();
    await saveVitrineSettings(
      null,
      fd({ accroche: "Bistrot", couleur_primary: "#112233" }),
    );

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    expect(payload.theme).toEqual({ couleurs: { primary: "#112233" } });
    expect(payload.theme).not.toHaveProperty("allure");
  });

  it("avec le témoin, une case décochée est un CHOIX et s'enregistre", async () => {
    gardeOk();
    await saveVitrineSettings(
      null,
      // `allure_rendue` seul : la section est à l'écran, et les sept cases y
      // sont décochées. C'est donc bien sept refus explicites.
      fd({ accroche: "Bistrot", allure_rendue: "1" }),
    );

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    expect(payload.theme).toEqual({
      allure: {
        entete_collant: false,
        capitales: false,
        capitales_desc: false,
        compte_rubrique: false,
        monogramme: false,
        favoris: false,
        recherche: false,
      },
    });
  });

  it("avec le témoin, ce qui vaut le DÉFAUT n'est pas écrit", async () => {
    gardeOk();
    await saveVitrineSettings(
      null,
      fd({
        allure_rendue: "1",
        // Les sept interrupteurs cochés + une liste et un curseur laissés sur
        // leur valeur de maquette : rien de tout cela ne diffère du défaut.
        entete_collant: "on",
        capitales: "on",
        capitales_desc: "on",
        compte_rubrique: "on",
        monogramme: "on",
        favoris: "on",
        recherche: "on",
        motif: "diagonales",
        rayon: "13",
        // Un seul écart réel.
        style_prix: "pastille",
      }),
    );

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    // SEUL L'ÉCART EST STOCKÉ. Recopier les vingt-cinq défauts aurait figé
    // chaque vitrine sur l'allure du jour de son enregistrement : le jour où un
    // défaut de la maquette change, aucune n'en profiterait.
    expect(payload.theme).toEqual({ allure: { style_prix: "pastille" } });
  });

  it("le secteur et le badge partent dans leurs colonnes, pas dans le thème", async () => {
    gardeOk();
    await saveVitrineSettings(
      null,
      fd({ secteur: "coiffeur", badge_ouverture: "Ouvert · 9h–19h" }),
    );

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    expect(payload.secteur).toBe("coiffeur");
    expect(payload.badge_ouverture).toBe("Ouvert · 9h–19h");
    expect(payload.theme).toEqual({});
  });

  it("un secteur absent vaut le neutre, JAMAIS null — la colonne est not null", async () => {
    gardeOk();
    await saveVitrineSettings(null, fd({ accroche: "Bistrot" }));

    const payload = callsTo("vitrine_settings").find((c) => c.op === "update")!
      .payload as Record<string, unknown>;
    expect(payload.secteur).toBe("commerce");
    // Le badge, lui, est nullable : `""` y devient bien `null`.
    expect(payload.badge_ouverture).toBeNull();
  });

  it("sans ligne de réglages, on le DIT plutôt que de réussir dans le vide", async () => {
    gardeOk();
    state.row = null;

    const res = await saveVitrineSettings(null, fd({ accroche: "Bistrot" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Le pire des deux aurait été un succès : le commerçant repart en croyant
    // son texte enregistré. `vitrine_settings` n'accorde `insert` à personne —
    // seule `set_vitrine_slug` crée la ligne, et elle audite.
    expect(res.error).toContain("adresse publique");
  });
});

// ────────────────────────────────────────────────────────────
// Les refus, tels que l'écran doit les distinguer
// ────────────────────────────────────────────────────────────

describe("setVitrineSlug — trois refus, trois messages", () => {
  it.each([
    ["invalid_slug", "Adresse invalide"],
    ["reserved_slug", "réservée par la plateforme"],
    ["slug_taken", "déjà prise"],
  ])("%s rend un message qui lui est propre", async (etat, attendu) => {
    gardeOk();
    rpcMock.mockResolvedValue({ data: { state: etat }, error: null });

    const res = await setVitrineSlug(null, fd({ slug: "le-comptoir" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(attendu);
  });

  it("une réponse illisible ne dit PAS « adresse invalide »", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({ data: { state: "quoi" }, error: null });

    const res = await setVitrineSlug(null, fd({ slug: "le-comptoir" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Envoyer le commerçant corriger une adresse correcte est le pire message
    // possible : ce cas rend l'erreur générique.
    expect(res.error).not.toContain("Adresse invalide");
  });

  it("un slug hors forme est refusé AVANT l'aller-retour", async () => {
    gardeOk();

    const res = await setVitrineSlug(null, fd({ slug: "le comptoir" }));

    expect(res.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("deleteVitrineCarte — le compte est GARDÉ, le texte de la base NON", () => {
  it("garde le compte de rubriques du trigger", async () => {
    gardeOk();
    state.error = {
      code: "23503",
      message: "cette carte porte encore 3 rubrique(s) : videz-la ou désactivez-la",
    };

    const res = await deleteVitrineCarte(null, fd({ id: CARTE_ID }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Un refus qui ne dit pas COMBIEN ne dit rien : c'est la seule information
    // utile, et elle n'existe que dans le message du trigger.
    expect(res.error).toContain("3 rubrique(s)");
  });

  it("NE RELAIE PAS le texte de la base — seul le chiffre traverse", async () => {
    gardeOk();
    // Le même code 23503 remonte aussi de violations de FK ordinaires, dont le
    // message porte des noms de contrainte, de table et de schéma. Aucun de ces
    // mots ne doit atteindre l'écran du commerçant (revue L10).
    state.error = {
      code: "23503",
      message:
        'insert or update on table "vitrine_categories" violates foreign key ' +
        'constraint "vitrine_categories_menu_fk" — DETAIL: Key (menu_id, ' +
        "organization_id)=(…) is not present in table \"vitrine_menus\".",
    };

    const res = await deleteVitrineCarte(null, fd({ id: CARTE_ID }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).not.toContain("constraint");
    expect(res.error).not.toContain("vitrine_categories");
    expect(res.error).not.toContain("DETAIL");
    // Le repli reste UTILE : il dit quoi faire, sans le compte qu'il n'a pas.
    expect(res.error).toContain("Videz-la ou désactivez-la");
  });

  it("un compte absurde ne traverse pas non plus", async () => {
    gardeOk();
    // Cinq chiffres : hors de la forme extraite, donc repli sans compte. Le
    // motif ne borne pas seulement le CONTENU, il borne aussi la LONGUEUR de ce
    // qui est interpolé.
    state.error = {
      code: "23503",
      message: "cette carte porte encore 999999 rubrique(s) : videz-la",
    };

    const res = await deleteVitrineCarte(null, fd({ id: CARTE_ID }));

    if (res.ok) return;
    expect(res.error).not.toContain("999999");
  });
});

// ────────────────────────────────────────────────────────────
// L11 — le seau de l'adresse, et la purge des pages publiques
// ────────────────────────────────────────────────────────────

describe("setVitrineSlug — le seau est APRÈS la garde, sur la clé du locataire", () => {
  it("borne les essais par ORGANISATION, en fail-closed", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", slug: "le-comptoir", created: true, changed: false },
      error: null,
    });

    await setVitrineSlug(null, fd({ slug: "le-comptoir" }));

    expect(rateLimitMock).toHaveBeenCalledWith(
      // La clé ne porte AUCUNE valeur venue du navigateur : ni le slug demandé,
      // ni l'IP. Boucler sur des adresses inventées n'ouvre donc pas un seau
      // neuf à chaque tour.
      `vitrine:slug:${ORG_ID}`,
      { limit: 20, windowSeconds: 3600 },
      { failClosed: true },
    );
  });

  it("le seau refuse SANS appeler la RPC ni écrire de ligne d'audit", async () => {
    gardeOk();
    rateLimitMock.mockResolvedValue(false);

    const res = await setVitrineSlug(null, fd({ slug: "le-comptoir" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // `set_vitrine_slug` audite à chaque appel : un refus qui appelle d'abord
    // aurait laissé la boucle écrire autant de lignes qu'elle veut.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(res.error).toContain("Réessayez");
  });

  it("le caissier n'entame PAS le seau — la garde passe en premier", async () => {
    gardeRefusee();

    await setVitrineSlug(null, fd({ slug: "le-comptoir" }));

    // Sinon un compte sans droit d'écriture pourrait épuiser le budget de son
    // organisation sans jamais rien écrire.
    expect(rateLimitMock).not.toHaveBeenCalled();
  });
});

describe("les mutations purgent LES DEUX pages publiques (ISR 60 s)", () => {
  it("un geste éditorial revalide le dashboard ET les deux langues", async () => {
    gardeOk();

    await updateVitrineFiche(null, fd({ id: FICHE_ID, nom: "Soupe" }));

    // Le slug n'était pas connu de l'appelant : il est lu dans
    // `vitrine_settings` (ligne par défaut du faux client, `le-comptoir`).
    expect(cheminsRevalides()).toEqual([
      "/dashboard/vitrine",
      "/v/le-comptoir",
      "/v/le-comptoir/en",
    ]);
  });

  it("une création ne revalide pas dans sa réponse", async () => {
    gardeOk();
    // Même quand une adresse existe, la création rend sa ligne canonique à
    // l'éditeur local sans réponse RSC intermédiaire.
    state.row = { id: CARTE_ID, nom: "Midi", ordre: 0, active: true };

    await createVitrineCarte(null, fd({ nom: "Midi" }));

    expect(cheminsRevalides()).toEqual([]);
  });

  it("setVitrineSlug purge le NOUVEAU slug sans relire la base", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", slug: "chez-marie", created: false, changed: true },
      error: null,
    });

    await setVitrineSlug(null, fd({ slug: "chez-marie" }));

    // Le slug vient de la RPC, pas d'une seconde lecture : `slugConnu` existe
    // pour éviter l'aller-retour.
    expect(cheminsRevalides()).toEqual([
      "/dashboard/vitrine",
      "/v/chez-marie",
      "/v/chez-marie/en",
    ]);
    expect(callsTo("vitrine_settings")).toHaveLength(0);
  });
});

describe("activerExperiencesVitrine — annoncer les jeux avec consentement", () => {
  it("ajoute uniquement le bloc jeux à l'ordre déjà choisi et purge les deux langues", async () => {
    gardeOk();
    state.row = {
      id: "row-1",
      slug: "le-comptoir",
      theme: { ordre_blocs: ["cartes", "horaires"] },
    };

    await expect(activerExperiencesVitrine()).resolves.toEqual({
      ok: true,
      data: { active: true },
    });

    const maj = callsTo("vitrine_settings").find((c) => c.op === "update");
    expect(maj?.payload).toEqual({
      theme: { ordre_blocs: ["cartes", "horaires", "experiences"] },
    });
    expect(maj?.filters.organization_id).toBe(ORG_ID);
    expect(cheminsRevalides()).toEqual([
      "/dashboard/vitrine",
      "/v/le-comptoir",
      "/v/le-comptoir/en",
    ]);
  });

  it("refuse avant toute lecture quand l'éditeur n'a plus le droit", async () => {
    gardeRefusee();

    await expect(activerExperiencesVitrine()).resolves.toEqual({
      ok: false,
      error: "Action non autorisée",
    });

    expect(state.calls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// L12 — l'import d'une carte en lot (VIT-2)
// ────────────────────────────────────────────────────────────

/** Un lot minimal, valide, tel que l'écran le sérialise dans `import`. */
const LOT = {
  nom: "Carte du midi",
  rubriques: [
    {
      nom: "Entrées",
      fiches: [
        {
          nom: "Velouté",
          prix_affiche: "  8 €  ",
          badges: ["vegetarien", "vegetarien"],
        },
      ],
    },
  ],
};

function importer(payload: unknown = LOT) {
  return importVitrineCarte(null, fd({ import: JSON.stringify(payload) }));
}

function comptesRpc(rubriques: number, fiches: number) {
  rpcMock.mockResolvedValue({
    data: {
      carte_id: CARTE_ID,
      rubriques_creees: rubriques,
      fiches_creees: fiches,
    },
    error: null,
  });
}

describe("importVitrineCarte — l'ordre des gardes", () => {
  it("le seau vient APRÈS la garde, sur la clé du LOCATAIRE", async () => {
    gardeOk();
    comptesRpc(1, 1);

    await importer();

    expect(rateLimitMock).toHaveBeenCalledWith(
      // Aucune valeur venue du navigateur dans la clé : boucler sur des lots
      // inventés n'ouvre pas un seau neuf à chaque tour.
      `vitrine:import:${ORG_ID}`,
      { limit: 10, windowSeconds: 3600 },
      { failClosed: true },
    );
  });

  it("le caissier n'entame PAS le seau", async () => {
    gardeRefusee();

    await importer();

    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("le seau refuse AVANT de lire le lot, et sans appeler la RPC", async () => {
    gardeOk();
    rateLimitMock.mockResolvedValue(false);

    // Un lot ILLISIBLE : s'il était analysé avant le seau, le refus porterait
    // sur sa forme. L'entrée d'une action d'import peut peser des mégaoctets —
    // c'est ce coût-là que le seau doit borner, pas seulement l'écriture.
    const res = await importVitrineCarte(null, fd({ import: "{pas du json" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Réessayez");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("un lot mal formé ne part JAMAIS à la base", async () => {
    gardeOk();

    // `photo_path` est une colonne réelle, absente du contrat d'import.
    const res = await importer({
      nom: "Midi",
      rubriques: [{ nom: "Entrées", fiches: [{ nom: "Soupe", photo_path: "x" }] }],
    });

    expect(res.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("importVitrineCarte — ce qui part à la RPC", () => {
  it("l'organisation vient de la SESSION et le payload est le VALIDÉ", async () => {
    gardeOk();
    comptesRpc(1, 1);

    await importVitrineCarte(
      null,
      fd({
        import: JSON.stringify(LOT),
        // Ignoré : le schéma ne lit que `import`, l'action que la garde.
        organization_id: "org-du-voisin",
      }),
    );

    expect(rpcMock).toHaveBeenCalledWith("import_vitrine_carte", {
      p_organization_id: ORG_ID,
      // DE LA SESSION, et la RPC le revérifie owner|editor en SQL depuis VIT-3.
      p_actor: USER_ID,
      p_payload: {
        nom: "Carte du midi",
        rubriques: [
          {
            nom: "Entrées",
            fiches: [
              {
                nom: "Velouté",
                // Détouré et dédoublonné AVANT l'aller-retour : le `check` de
                // `prix_affiche` exige une valeur déjà détourée, et un badge en
                // double aurait fait échouer tout l'import en 23514.
                prix_affiche: "8 €",
                badges: ["vegetarien"],
              },
            ],
          },
        ],
      },
    });
  });

  it("l'acteur est celui de la GARDE, jamais un identifiant posté", async () => {
    // Point I2 de la revue L12 : la RPC journalisait `system`. Elle reçoit
    // désormais un acteur ET le revérifie membre owner|editor en SQL — mais
    // cette vérification ne vaut que si l'acteur envoyé vient de la session.
    // Un `actor` accepté depuis le formulaire aurait fait de la ligne d'audit
    // du geste le plus lourd du module une déclaration sur l'honneur.
    gardeOk();
    comptesRpc(1, 1);

    await importVitrineCarte(
      null,
      fd({
        import: JSON.stringify(LOT),
        actor: "00000000-0000-4000-8000-00000000dead",
        p_actor: "00000000-0000-4000-8000-00000000dead",
        user_id: "00000000-0000-4000-8000-00000000dead",
      }),
    );

    const args = rpcMock.mock.calls.at(-1)?.[1] as { p_actor?: unknown };
    expect(args.p_actor).toBe(USER_ID);
  });

  it("le CRUD de session n'est pas utilisé pour écrire — seule la RPC écrit", async () => {
    gardeOk();
    comptesRpc(1, 1);

    await importer();

    // `import_vitrine_carte` est `service_role` : la seule requête du client de
    // session est la lecture du slug pour purger les pages publiques.
    expect(state.calls.every((appel) => appel.op === "select")).toBe(true);
  });
});

describe("importVitrineCarte — les quatre refus, en messages BORNÉS", () => {
  it.each([
    // Anomalie, pas une saisie : la garde a déjà tranché session, rôle et droit.
    ["42501", "not authorized", "Une erreur est survenue"],
    ["22023", "payload carries an unknown key", "forme attendue"],
    ["23505", "a carte of this name already exists in this catalogue", "déjà ce nom"],
  ])("%s rend son message", async (code, message, attendu) => {
    gardeOk();
    rpcMock.mockResolvedValue({ data: null, error: { code, message } });

    const res = await importer();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(attendu);
  });

  it("23514 traduit le NOM DE CONTRAINTE en nom de champ", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          "a line of the import was rejected by constraint vitrine_items_prix_affiche_check",
      },
    });

    const res = await importer();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Le nom de contrainte est une CLÉ de recherche, jamais un relais : ce qui
    // sort désigne le champ du FICHIER, pas une colonne ni une table.
    expect(res.error).toContain("le prix d'une fiche");
    expect(res.error).not.toContain("vitrine_items");
    expect(res.error).not.toContain("constraint");
  });

  it("une contrainte non prévue retombe sur un repli UTILE", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "a line of the import was rejected by constraint une_regle_future",
      },
    });

    const res = await importer();

    if (res.ok) return;
    // Une table fermée refuse d'inventer une phrase pour une règle qu'on n'a pas
    // prévue — mais le repli dit quand même quoi relire.
    expect(res.error).not.toContain("une_regle_future");
    expect(res.error).toContain("Vérifiez les noms");
  });

  it("aucun refus ne relaie le texte de la base", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        // Un message de PostgREST ordinaire porte le détail de la ligne fautive.
        message:
          'a fiche carries an unknown key — DETAIL: Key "prix" of {"nom":"Soupe"}',
      },
    });

    const res = await importer();

    if (res.ok) return;
    expect(res.error).not.toContain("DETAIL");
    expect(res.error).not.toContain("Soupe");
  });
});

describe("importVitrineCarte — le succès rend les comptes et purge les pages", () => {
  it("rend les trois comptes et la phrase déjà composée", async () => {
    gardeOk();
    comptesRpc(3, 47);

    const res = await importer();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.carte_id).toBe(CARTE_ID);
    expect(res.data.rubriques_creees).toBe(3);
    expect(res.data.fiches_creees).toBe(47);
    expect(res.data.message).toBe("Carte créée : 3 rubriques, 47 fiches.");
  });

  it("revalide le dashboard ET les deux pages publiques", async () => {
    gardeOk();
    comptesRpc(1, 1);

    await importer();

    // Une carte importée est immédiatement visible : sans purge, le commerçant
    // reste devant sa propre vitrine inchangée jusqu'à la fin de la fenêtre ISR.
    expect(cheminsRevalides()).toEqual([
      "/dashboard/vitrine",
      "/v/le-comptoir",
      "/v/le-comptoir/en",
    ]);
  });

  it("une réponse illisible ne transforme pas un succès en refus", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({ data: "quoi", error: null });

    const res = await importer();

    // La carte EST écrite : la RPC n'a pas levé. Refuser ici enverrait le
    // commerçant réimporter une carte qu'il possède déjà — et le second import
    // échouerait sur le nom déjà pris.
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rubriques_creees).toBe(0);
    expect(cheminsRevalides()).toContain("/dashboard/vitrine");
  });
});

describe("la publication ne se garde pas ici, mais elle s'explique", () => {
  it("un refus du trigger devient un message d'offre, pas une erreur muette", async () => {
    gardeOk();
    state.error = { code: "P0001", message: "module vitrine non accessible" };

    const res = await publishVitrine();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("offre");
  });

  it("dépublier n'est jamais gardé", async () => {
    gardeOk();
    state.row = { id: "row-1", slug: "le-comptoir", published: false };

    const res = await unpublishVitrine();

    expect(res.ok).toBe(true);
    const maj = callsTo("vitrine_settings").find((c) => c.op === "update");
    expect((maj!.payload as Record<string, unknown>).published).toBe(false);
    expect(maj!.filters.organization_id).toBe(ORG_ID);
  });
});

// ────────────────────────────────────────────────────────────
// L14 — les contenus mis en avant (VIT-4)
// ────────────────────────────────────────────────────────────

/** Le geste nominal : poser un contenu à la place demandée. */
function poser(champs: Record<string, string> = {}) {
  return setVitrineContenu(
    null,
    fd({
      rang: "2",
      titre: "Le reportage",
      url: "https://presse.test/nous",
      ...champs,
    }),
  );
}

describe("setVitrineContenu — un upsert par (organisation, place)", () => {
  it("une place DÉJÀ occupée est mise à jour, sans insertion", async () => {
    gardeOk();

    const res = await poser();

    expect(res.ok).toBe(true);
    const appels = callsTo("vitrine_contenus");
    const maj = appels.find((c) => c.op === "update");
    expect(maj!.filters.organization_id).toBe(ORG_ID);
    // La place est la CLÉ du geste, pas sa matière : elle est en filtre.
    expect(maj!.filters.rang).toBe(2);
    // Et elle n'est PAS dans le payload — l'y mettre ferait qu'enregistrer un
    // titre déplacerait le contenu.
    expect(maj!.payload).toEqual({
      titre: "Le reportage",
      url: "https://presse.test/nous",
    });
    expect(appels.some((c) => c.op === "insert")).toBe(false);
  });

  it("une place VIDE est insérée, avec l'organisation de la SESSION", async () => {
    gardeOk();
    // La mise à jour ne trouve rien : c'est la création.
    state.row = null;

    const res = await poser({ organization_id: "org-du-voisin" });

    expect(res.ok).toBe(true);
    const insertion = callsTo("vitrine_contenus").find((c) => c.op === "insert");
    expect(insertion).toBeDefined();
    expect(insertion!.payload).toEqual({
      // `organization_id` posté est IGNORÉ : le schéma ne le lit pas.
      organization_id: ORG_ID,
      rang: 2,
      titre: "Le reportage",
      url: "https://presse.test/nous",
    });
  });

  it("le CRUD des contenus n'utilise JAMAIS le service_role", async () => {
    gardeOk();
    state.row = null;
    await poser();
    await deleteVitrineContenu(null, fd({ rang: "1" }));

    // Le service_role court-circuiterait « vitrine_contenus : editor write ».
    expect(adminFromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("AUCUN seau : trois lignes bornées de son propre locataire", async () => {
    gardeOk();
    await poser();
    await deleteVitrineContenu(null, fd({ rang: "1" }));

    // Les deux gestes de ce fichier qui portent un seau le portent pour des
    // raisons que ceux-ci n'ont pas : service_role, ligne d'audit, et une
    // question sur un espace de noms GLOBAL.
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("la course entre deux onglets rend un message, pas une erreur muette", async () => {
    gardeOk();
    state.row = null;
    state.erreurInsert = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "vitrine_contenus_org_rang_unique"',
    };

    const res = await poser();

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // L'unicité (organization_id, rang) reste tenue par la BASE : l'action ne
    // compte pas avant d'écrire, elle traduit le refus.
    expect(res.error).toContain("place");
    // Et le texte de la base ne traverse pas : ni nom de contrainte, ni table.
    expect(res.error).not.toContain("vitrine_contenus");
  });

  it("les mutations purgent le dashboard ET les deux pages publiques", async () => {
    gardeOk();

    await poser();

    expect(cheminsRevalides()).toEqual([
      "/dashboard/vitrine",
      "/v/le-comptoir",
      "/v/le-comptoir/en",
    ]);
  });

  it.each([
    ["hors bornes", { rang: "4" }],
    ["à zéro", { rang: "0" }],
    ["décimale", { rang: "1.5" }],
    ["non numérique", { rang: "premier" }],
  ])("une place %s est refusée AVANT toute requête", async (_cas, champs) => {
    gardeOk();

    const res = await poser(champs);

    expect(res.ok).toBe(false);
    // Envoyée telle quelle, elle ne toucherait aucune ligne : la mise à jour
    // rendrait « pas trouvé » et l'insertion échouerait sur le `check`.
    expect(state.calls).toHaveLength(0);
  });

  it.each([
    ["en clair", "http://presse.test/a"],
    ["en javascript:", "javascript:alert(1)"],
    ["portant un espace", "https://presse.test/a b"],
    ["vide", ""],
  ])("une adresse %s est refusée AVANT toute requête", async (_cas, url) => {
    gardeOk();

    const res = await poser({ url });

    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("un titre trop long est refusé ici plutôt qu'en 23514", async () => {
    gardeOk();

    const res = await poser({ titre: "a".repeat(81) });

    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("deleteVitrineContenu — retirer une place, sans rien compter", () => {
  it("supprime par (organisation, place) et revalide", async () => {
    gardeOk();

    const res = await deleteVitrineContenu(null, fd({ rang: "3" }));

    expect(res.ok).toBe(true);
    const suppression = callsTo("vitrine_contenus").find(
      (c) => c.op === "delete",
    );
    expect(suppression!.filters.organization_id).toBe(ORG_ID);
    expect(suppression!.filters.rang).toBe(3);
    expect(cheminsRevalides()).toContain("/v/le-comptoir");
  });

  it("retirer une place déjà vide reste un succès — le geste est idempotent", async () => {
    gardeOk();
    // Aucune ligne supprimée : PostgREST ne rend pas d'erreur pour autant.
    state.row = null;

    const res = await deleteVitrineContenu(null, fd({ rang: "3" }));

    expect(res.ok).toBe(true);
  });

  it("un échec de la base ne relaie jamais son texte", async () => {
    gardeOk();
    state.error = { code: "42501", message: "permission denied for table …" };

    const res = await deleteVitrineContenu(null, fd({ rang: "1" }));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).not.toContain("permission denied");
  });
});

// ────────────────────────────────────────────────────────────
// LES TRADUCTIONS (VIT-5, lot L15)
// ────────────────────────────────────────────────────────────

function fdTraduction(
  surcharge: Record<string, string> = {},
): FormData {
  return fd({
    cible_type: "item",
    cible_id: FICHE_ID,
    champ: "description",
    texte: "Cream and hazelnuts.",
    version: VERSION_SOURCE,
    ...surcharge,
  });
}

describe("setVitrineTraduction — la version VUE est repostée telle quelle", () => {
  it("passe l'organisation de la SESSION, la langue d'ICI, et la version INTACTE", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", created: true, changed: true },
      error: null,
    });

    const res = await setVitrineTraduction(
      null,
      fdTraduction({
        // Postés et IGNORÉS : ni la langue ni l'organisation ne viennent du
        // formulaire. Le schéma est `.strict()`, mais l'action n'extrait de
        // toute façon que les cinq clés qu'elle connaît.
        version: "2026-08-20T10:00:00.123456+02:00",
      }),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({ created: true, changed: true });
    expect(rpcMock).toHaveBeenCalledWith("upsert_vitrine_translation", {
      p_organization_id: ORG_ID,
      p_cible_type: "item",
      p_cible_id: FICHE_ID,
      p_lang: "en",
      p_champ: "description",
      p_texte: "Cream and hazelnuts.",
      // NI REFORMATÉE, NI REMPLACÉE PAR `now()` : la traduction vaut pour la
      // version du français que le commerçant avait sous les yeux. Normaliser
      // aurait perdu la microseconde de Postgres, donc fait comparer égaux deux
      // instants distincts — une périmée se serait déclarée fraîche.
      p_version_source: "2026-08-20T10:00:00.123456+02:00",
      // L'acteur de la GARDE, jamais du formulaire (revue L15, M2).
      p_actor: USER_ID,
    });
  });

  it("revalide le tableau de bord ET LES DEUX PAGES PUBLIQUES", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", created: true, changed: true },
      error: null,
    });

    await setVitrineTraduction(null, fdTraduction());

    // La page `/en` change (le champ change de langue) ET la page française
    // aussi (la couverture décide du sélecteur de langue).
    expect(cheminsRevalides()).toContain("/dashboard/vitrine");
    expect(cheminsRevalides()).toContain("/v/le-comptoir");
    expect(cheminsRevalides()).toContain("/v/le-comptoir/en");
  });

  it("revalide MÊME quand rien n'a changé", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", created: false, changed: false },
      error: null,
    });

    const res = await setVitrineTraduction(null, fdTraduction());

    // `changed: false` est un succès — le texte posté était déjà celui qui est
    // stocké. Conditionner la purge à ce drapeau aurait fait dépendre la
    // fraîcheur d'une page publique d'un état que le commerçant ne voit pas.
    expect(res.ok).toBe(true);
    expect(cheminsRevalides()).toContain("/v/le-comptoir/en");
  });

  it("un texte vide est refusé AVANT l'aller-retour", async () => {
    gardeOk();

    const res = await setVitrineTraduction(null, fdTraduction({ texte: "   " }));

    expect(res.ok).toBe(false);
    // Le vide ne vaut PAS un retrait : celui-ci est une seconde porte, pour
    // qu'un texte perdu en chemin n'efface pas un contenu publié.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("un vocabulaire forgé est refusé AVANT l'aller-retour", async () => {
    gardeOk();

    const forges: Array<Record<string, string>> = [
      { cible_type: "organisation" },
      { champ: "prix_affiche" },
      { cible_id: "pas-un-uuid" },
      { version: "hier" },
    ];
    for (const surcharge of forges) {
      const res = await setVitrineTraduction(null, fdTraduction(surcharge));
      expect(res.ok, JSON.stringify(surcharge)).toBe(false);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("les refus nommés de la RPC ont chacun leur message", async () => {
    for (const [etat, attendu] of [
      ["invalid_cible", "ne peut pas porter de traduction"],
      ["invalid_champ", "ne se traduit pas"],
      ["invalid_texte", "2000 caractères"],
    ] as const) {
      gardeOk();
      rpcMock.mockResolvedValue({ data: { state: etat }, error: null });

      const res = await setVitrineTraduction(null, fdTraduction());

      expect(res.ok, etat).toBe(false);
      if (res.ok) continue;
      expect(res.error, etat).toContain(attendu);
    }
  });

  it("une réponse illisible ne dit PAS « ce champ ne se traduit pas »", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({ data: { state: "quoi" }, error: null });

    const res = await setVitrineTraduction(null, fdTraduction());

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Envoyer le commerçant corriger une saisie correcte est le pire message
    // possible : l'illisible rend le générique.
    expect(res.error).not.toContain("ne se traduit pas");
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("le 42501 reste INDISTINCT et ne relaie pas le texte de la base", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized on vitrine_items" },
    });

    const res = await setVitrineTraduction(null, fdTraduction());

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // La RPC lève le MÊME code pour « la cible n'existe pas » et « elle est à
    // quelqu'un d'autre » : le message doit recouvrir les deux sans nommer ni
    // la table ni le voisin.
    expect(res.error).toBe("Élément introuvable.");
    expect(res.error).not.toContain("vitrine_items");
  });
});

describe("deleteVitrineTraduction — le retrait, et son idempotence", () => {
  it("passe la cible et la langue, sans texte ni version", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", deleted: true },
      error: null,
    });

    const res = await deleteVitrineTraduction(
      null,
      fd({ cible_type: "settings", cible_id: CARTE_ID, champ: "accroche" }),
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({ deleted: true });
    expect(rpcMock).toHaveBeenCalledWith("delete_vitrine_translation", {
      p_organization_id: ORG_ID,
      p_cible_type: "settings",
      p_cible_id: CARTE_ID,
      p_lang: "en",
      p_champ: "accroche",
      // L'acteur de la GARDE, jamais du formulaire (revue L15, M2).
      p_actor: USER_ID,
    });
    expect(cheminsRevalides()).toContain("/v/le-comptoir/en");
  });

  it("retirer une traduction absente est un SUCCÈS qui le dit", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: { state: "ok", deleted: false },
      error: null,
    });

    const res = await deleteVitrineTraduction(
      null,
      fd({ cible_type: "item", cible_id: FICHE_ID, champ: "nom" }),
    );

    // « retirée » et « il n'y avait rien à retirer » ne se disent pas pareil :
    // le drapeau remonte jusqu'à l'écran plutôt que d'être aplati en succès nu.
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({ deleted: false });
  });

  it("ferme les MÊMES vocabulaires que la pose, avant l'aller-retour", async () => {
    gardeOk();

    for (const forge of [
      { cible_type: "organisation", cible_id: CARTE_ID, champ: "nom" },
      { cible_type: "menu", cible_id: CARTE_ID, champ: "prix_affiche" },
      { cible_type: "menu", cible_id: "pas-un-uuid", champ: "nom" },
    ]) {
      const res = await deleteVitrineTraduction(null, fd(forge));
      expect(res.ok, JSON.stringify(forge)).toBe(false);
    }
    // Une divergence entre les deux portes serait un trou : ce qu'on ne peut
    // pas écrire chez le voisin, on ne doit pas pouvoir l'effacer. Le COUPLAGE
    // type ↔ champ, lui, reste tranché en SQL (`invalid_champ`).
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("le 42501 reste INDISTINCT ici aussi", async () => {
    gardeOk();
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized on vitrine_menus" },
    });

    const res = await deleteVitrineTraduction(
      null,
      fd({ cible_type: "menu", cible_id: CARTE_ID, champ: "nom" }),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Ce qu'on ne peut pas écrire chez le voisin, on ne doit pas pouvoir
    // l'effacer — ni apprendre qu'il existe.
    expect(res.error).toBe("Élément introuvable.");
    expect(res.error).not.toContain("vitrine_menus");
  });
});
