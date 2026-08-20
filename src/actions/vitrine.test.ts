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
    reset() {
      state.calls = [];
      state.row = { id: "row-1", slug: "le-comptoir", published: true };
      state.error = null;
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

        const settle = () =>
          state.error
            ? { data: null, error: state.error }
            : { data: state.row, error: null };

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
  deleteVitrineCarte,
  importVitrineCarte,
  publishVitrine,
  reorderVitrineFiches,
  saveVitrineSettings,
  setVitrineSlug,
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

  it("sans adresse publique, seul le dashboard est purgé", async () => {
    gardeOk();
    // `set_vitrine_slug` est le seul geste qui fasse naître la ligne de
    // réglages : avant lui, il n'y a aucune page publique à purger.
    state.row = null;

    await createVitrineCarte(null, fd({ nom: "Midi" }));

    expect(cheminsRevalides()).toEqual(["/dashboard/vitrine"]);
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
