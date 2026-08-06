import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// « Relancer une formule » — GARDES DE L'ACTION
//
// Le sérialiseur est couvert à part (`src/lib/experience-relance.test.ts`,
// pur). Ce fichier couvre l'autre bout : le seul endroit qui LIT la base et
// DÉCLENCHE une écriture. Quatre refus et une composition.
//
//   1. LE RÔLE. Patron de `campaign-templates.ts` — owner|editor — et non
//      celui de `duplicateCampaign`, qui omet la vérification.
//   2. LE MODULE. Un kind que le moteur universel ne sait pas appliquer est
//      refusé AVANT toute lecture, avec le message métier de son adaptateur ;
//      la campagne, elle, est renvoyée vers « Dupliquer », qui existe et fait
//      mieux.
//   3. L'ORGANISATION. La source est lue par le client de SESSION avec un
//      filtre `organization_id` explicite : la source d'un autre commerçant
//      est « introuvable », jamais « refusée » — les deux réponses ne disent
//      pas la même chose à qui sonde des identifiants.
//   4. LA CLÔTURE. On ne relance pas une animation qui tourne encore.
//
// Et la composition : rien n'est recodé du moteur. `createExperienceBlueprint`
// → `publishExperienceBlueprintVersion` → `applyExperienceBlueprintVersion`,
// la dernière recevant la clé d'idempotence de l'appelant quand il en fournit
// une.
//
//   5. LE PLAFOND. Le discriminant du NOM, lui, est dérivé serveur et ne doit
//      RIEN au `requestId` du client. `unique (organization_id, name)` est le
//      seul frein à la création en masse de modèles sur un tableau de bord
//      sans rate-limit : si le client pouvait choisir le discriminant, il
//      obtiendrait un nom neuf — donc un module de plus — à chaque requête.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
const AUTRE_ORG = "00000000-0000-4000-8000-0000000000a2";
const SOURCE_ID = "00000000-0000-4000-8000-0000000000b1";
const BLUEPRINT_ID = "00000000-0000-4000-8000-0000000000c1";
const TARGET_ID = "00000000-0000-4000-8000-0000000000d1";

interface AppelDb {
  table: string;
  filters: Record<string, unknown>;
}

/** Chasse TERMINÉE (fenêtre close), avec deux étapes — le minimum du schéma. */
function chasseTerminee() {
  return {
    name: "Chasse du centre-ville",
    status: "active",
    order_mode: "ordered",
    min_scan_interval_seconds: 60,
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2026-02-01T00:00:00Z",
    reward_label: "Bon d'achat",
    reward_details: null,
    reward_stock: 10,
    hunt_steps: [
      { position: 1, label: "La boulangerie", hint_text: null },
      { position: 2, label: "La fontaine", hint_text: "Face à la mairie" },
    ],
  };
}

const { state, makeClient } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ table: string; filters: Record<string, unknown> }>,
    /** Ligne rendue par le select, si les filtres correspondent. */
    row: null as unknown,
    /** Organisation propriétaire de la ligne simulée. */
    rowOrg: "" as string,
    reset() {
      state.calls = [];
      state.row = null;
      state.rowOrg = "";
    },
  };

  function makeClient() {
    return {
      from(table: string) {
        const call = { table, filters: {} as Record<string, unknown> };
        state.calls.push(call);
        const builder = {
          select: () => builder,
          eq: (colonne: string, valeur: unknown) => {
            call.filters[colonne] = valeur;
            return builder;
          },
          order: () => builder,
          // La RLS + le filtre explicite : rien ne remonte si l'organisation
          // du filtre n'est pas celle qui porte la ligne.
          maybeSingle: () =>
            Promise.resolve({
              data:
                call.filters.organization_id === state.rowOrg ? state.row : null,
              error: null,
            }),
        };
        return builder;
      },
    };
  }

  return { state, makeClient };
});

const { getUserAndOrgMock, createMock, publishMock, applyMock } = vi.hoisted(() => ({
  getUserAndOrgMock: vi.fn(),
  createMock: vi.fn(),
  publishMock: vi.fn(),
  applyMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeClient()),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: getUserAndOrgMock }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
/*
 * `redirect` LÈVE, comme le vrai.
 *
 * Un `vi.fn()` muet rendrait `undefined` et laisserait la suite du wrapper
 * s'exécuter sur des données qu'il vient de refuser — le test observerait alors
 * un comportement que la production n'a jamais. Next interrompt le rendu par
 * une exception ; le double doit faire pareil.
 */
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((cible: string) => {
    throw new Error(`NEXT_REDIRECT:${cible}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

/** La cible du `redirect` levé par l'appel, ou `null` s'il n'a pas redirigé. */
async function cibleDeRedirection(appel: Promise<unknown>): Promise<string | null> {
  try {
    await appel;
    return null;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    return message.startsWith("NEXT_REDIRECT:")
      ? message.slice("NEXT_REDIRECT:".length)
      : null;
  }
}
vi.mock("@/actions/experience-blueprints", () => ({
  createExperienceBlueprint: createMock,
  publishExperienceBlueprintVersion: publishMock,
  applyExperienceBlueprintVersion: applyMock,
}));

import { huntBlueprintSchema } from "@/platform/experiences/templates/schemas";
import { relancerFormule, relancerFormuleForm } from "./experience-relance";

function session(role: "owner" | "editor" | "cashier" = "owner") {
  return { user: { id: "user-1" }, organization: { id: ORG_ID }, role };
}

function cheminHeureux() {
  getUserAndOrgMock.mockResolvedValue(session("editor"));
  state.row = chasseTerminee();
  state.rowOrg = ORG_ID;
  createMock.mockResolvedValue({
    ok: true,
    data: { blueprintId: BLUEPRINT_ID, version: 1 },
  });
  publishMock.mockResolvedValue({ ok: true, data: undefined });
  applyMock.mockResolvedValue({
    ok: true,
    data: { targetId: TARGET_ID, dashboardHref: "/dashboard/hunts" },
  });
}

/**
 * `createExperienceBlueprint` avec `unique (organization_id, name)` SIMULÉE.
 *
 * Sans elle, un test qui rejoue l'action deux fois observe deux succès et ne
 * dit rien du plafond : c'est la base qui refuse le doublon, pas l'action.
 */
function createAvecUnicite(): void {
  const noms = new Set<string>();
  createMock.mockImplementation((entree: { name: string }) => {
    if (noms.has(entree.name)) {
      return Promise.resolve({ ok: false, error: "Un modèle porte déjà ce nom." });
    }
    noms.add(entree.name);
    return Promise.resolve({
      ok: true,
      data: { blueprintId: BLUEPRINT_ID, version: 1 },
    });
  });
}

function appelsA(table: string): AppelDb[] {
  return state.calls.filter((call) => call.table === table);
}

afterEach(() => {
  state.reset();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("relancerFormule — refus", () => {
  it("refuse la caisse, sans lire la source", async () => {
    getUserAndOrgMock.mockResolvedValue(session("cashier"));
    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });
    expect(res).toEqual({ ok: false, error: "Action non autorisée" });
    expect(state.calls).toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("refuse une entrée mal formée avant tout accès base", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    const res = await relancerFormule({ kind: "hunt", sourceId: "pas-un-uuid" });
    expect(res.ok).toBe(false);
    expect(getUserAndOrgMock).not.toHaveBeenCalled();
    expect(state.calls).toHaveLength(0);
  });

  it("renvoie une campagne vers « Dupliquer », sans rien lire", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    const res = await relancerFormule({ kind: "campaign", sourceId: SOURCE_ID });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Dupliquer");
    expect(state.calls).toHaveLength(0);
  });

  it("refuse les kinds que le moteur universel ne sait pas appliquer", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    for (const kind of ["jackpot", "referral"] as const) {
      const res = await relancerFormule({ kind, sourceId: SOURCE_ID });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error.length).toBeGreaterThan(0);
      expect(res.error).not.toContain("Dupliquer");
    }
    expect(state.calls).toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("une source d'une AUTRE organisation est introuvable", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.row = chasseTerminee();
    state.rowOrg = AUTRE_ORG;

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res).toEqual({ ok: false, error: "Animation introuvable." });
    // La lecture a bien porté le filtre d'organisation venu de la SESSION.
    expect(appelsA("hunts")[0].filters).toEqual({
      id: SOURCE_ID,
      organization_id: ORG_ID,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("refuse une source encore en cours", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.row = { ...chasseTerminee(), ends_at: null };
    state.rowOrg = ORG_ID;

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Terminez d'abord");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("refuse une source que le schéma ne sait pas recopier", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.row = {
      ...chasseTerminee(),
      hunt_steps: [{ position: 1, label: "Seule étape", hint_text: null }],
    };
    state.rowOrg = ORG_ID;

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("relancerFormule — composition du moteur existant", () => {
  it("crée, publie puis applique — et rend le brouillon créé", async () => {
    cheminHeureux();

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res).toEqual({
      ok: true,
      data: { targetId: TARGET_ID, dashboardHref: "/dashboard/hunts" },
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith({
      blueprintId: BLUEPRINT_ID,
      version: 1,
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it("le modèle créé porte « Relance de » et une configuration valide", async () => {
    cheminHeureux();
    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    const entree = createMock.mock.calls[0][0];
    expect(entree.kind).toBe("hunt");
    expect(entree.name).toContain("Relance de Chasse du centre-ville");
    expect(entree.name.length).toBeLessThanOrEqual(120);
    expect(huntBlueprintSchema.safeParse(entree.configuration).success).toBe(true);
    expect(entree.defaultRewards).toEqual([
      { slot: "primary", label: "Bon d'achat", stock: 10 },
    ]);
  });

  it("la clé d'idempotence du geste est celle transmise à l'application", async () => {
    cheminHeureux();
    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    const derive = applyMock.mock.calls[0][0].requestId;
    expect(derive).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // Dérivée du geste, donc STABLE : c'est ce qui absorbe le double-clic.
    const nom = createMock.mock.calls[0][0].name;
    expect(nom).toContain(derive.slice(0, 6));
  });

  it("honore la clé fournie par l'appelant — et ne la met QUE là", async () => {
    cheminHeureux();
    const requestId = "11111111-1111-4111-8111-111111111111";

    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID, requestId });

    expect(applyMock.mock.calls[0][0].requestId).toBe(requestId);
    // Le nom, lui, ne doit rien au client : ni la clé, ni son préfixe.
    const nom = createMock.mock.calls[0][0].name;
    expect(nom).not.toContain(requestId);
    expect(nom).not.toContain(requestId.slice(0, 6));
  });

  it("un rejeu du même geste ne crée pas un second modèle", async () => {
    cheminHeureux();
    createMock.mockResolvedValue({
      ok: false,
      error: "Un modèle porte déjà ce nom.",
    });

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("vient d'être lancée");
    expect(publishMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("n'applique rien si la publication du modèle échoue", async () => {
    cheminHeureux();
    publishMock.mockResolvedValue({ ok: false, error: "Version invalide." });

    const res = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(res).toEqual({ ok: false, error: "Version invalide." });
    expect(applyMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// LE PLAFOND DE CRÉATION
//
// `unique (organization_id, name)` est le seul frein anti-création-en-masse
// du tableau de bord commerçant — aucun rate-limit ne s'y applique. Il ne
// tient QUE si le discriminant du nom est hors de portée du navigateur : un
// éditeur qui poste un `request_id` neuf à chaque appel ne doit pas pour
// autant obtenir un nom neuf, donc un blueprint et un module de plus.
// ────────────────────────────────────────────────────────────

describe("relancerFormule — le nom ne vient jamais du client", () => {
  it("deux clés clientes DIFFÉRENTES dans la même tranche de 10 s butent sur l'unicité", async () => {
    cheminHeureux();
    createAvecUnicite();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));

    const premier = await relancerFormule({
      kind: "hunt",
      sourceId: SOURCE_ID,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    expect(premier.ok).toBe(true);

    // Trois secondes plus tard : MÊME seau de 10 s, mais une clé cliente
    // toute neuve — c'était exactement la manœuvre qui créait sans limite.
    vi.setSystemTime(new Date("2026-03-01T12:00:03.000Z"));
    const second = await relancerFormule({
      kind: "hunt",
      sourceId: SOURCE_ID,
      requestId: "22222222-2222-4222-8222-222222222222",
    });

    expect(createMock.mock.calls[1][0].name).toBe(createMock.mock.calls[0][0].name);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toContain("vient d'être lancée");
    // Rien n'a été publié ni appliqué : pas de second module.
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it("une relance délibérée, plus de 10 s après, aboutit toujours", async () => {
    cheminHeureux();
    createAvecUnicite();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));

    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    // Onze secondes : seau suivant, donc discriminant neuf.
    vi.setSystemTime(new Date("2026-03-01T12:00:11.000Z"));
    const second = await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });

    expect(createMock.mock.calls[1][0].name).not.toBe(
      createMock.mock.calls[0][0].name,
    );
    expect(second.ok).toBe(true);
    expect(applyMock).toHaveBeenCalledTimes(2);
  });

  it("le discriminant dépend de la SOURCE : deux animations restent relançables ensemble", async () => {
    cheminHeureux();
    createAvecUnicite();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));

    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID });
    const autreSource = "00000000-0000-4000-8000-0000000000b2";
    const second = await relancerFormule({ kind: "hunt", sourceId: autreSource });

    expect(second.ok).toBe(true);
    expect(createMock.mock.calls[1][0].name).not.toBe(
      createMock.mock.calls[0][0].name,
    );
  });
});

// ────────────────────────────────────────────────────────────
// LE WRAPPER DE FORMULAIRE
//
// Il n'ajoute aucune garde et n'en retire aucune : `relancerFormule` reste le
// seul juge. Ce qui lui est propre, et ce que ces tests couvrent, c'est la
// DESTINATION — reconstruite à partir de champs revalidés, jamais lue dans le
// formulaire. Un champ « retour » caché aurait offert une redirection ouverte
// à qui poste la requête.
// ────────────────────────────────────────────────────────────

function formulaire(champs: Record<string, string>): FormData {
  const data = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) data.append(cle, valeur);
  return data;
}

describe("relancerFormuleForm — destination", () => {
  it("mène au brouillon créé quand la relance aboutit", async () => {
    cheminHeureux();

    const cible = await cibleDeRedirection(
      relancerFormuleForm(formulaire({ kind: "hunt", source_id: SOURCE_ID })),
    );

    expect(cible).toBe("/dashboard/hunts");
  });

  it("transmet la clé d'idempotence posée au rendu", async () => {
    cheminHeureux();
    const requestId = "22222222-2222-4222-8222-222222222222";

    await cibleDeRedirection(
      relancerFormuleForm(
        formulaire({ kind: "hunt", source_id: SOURCE_ID, request_id: requestId }),
      ),
    );

    expect(applyMock.mock.calls[0][0].requestId).toBe(requestId);
  });

  it("ramène le caissier sur SA source, avec le refus en clair", async () => {
    getUserAndOrgMock.mockResolvedValue(session("cashier"));

    const cible = await cibleDeRedirection(
      relancerFormuleForm(formulaire({ kind: "quiz", source_id: SOURCE_ID })),
    );

    expect(cible).toBe(
      `/dashboard/quiz/${SOURCE_ID}?relance_error=${encodeURIComponent("Action non autorisée")}`,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("refuse un kind non supporté sans jamais lire la base", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));

    const cible = await cibleDeRedirection(
      relancerFormuleForm(formulaire({ kind: "jackpot", source_id: SOURCE_ID })),
    );

    // Le schéma du wrapper ne connaît que les six kinds relançables : le refus
    // tombe AVANT l'action, et la destination n'est donc pas composée à partir
    // d'un kind qu'on vient d'écarter.
    expect(cible).toBe(
      `/dashboard/discover?relance_error=${encodeURIComponent("Relance invalide.")}`,
    );
    expect(getUserAndOrgMock).not.toHaveBeenCalled();
    expect(state.calls).toHaveLength(0);
  });

  it("ne compose aucune URL à partir d'un identifiant invalide", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));

    const cible = await cibleDeRedirection(
      relancerFormuleForm(formulaire({ kind: "hunt", source_id: "../../admin" })),
    );

    expect(cible).toBe(
      `/dashboard/discover?relance_error=${encodeURIComponent("Relance invalide.")}`,
    );
  });
});
