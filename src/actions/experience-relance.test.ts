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
// la dernière recevant la MÊME clé d'idempotence que celle du geste.
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
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/actions/experience-blueprints", () => ({
  createExperienceBlueprint: createMock,
  publishExperienceBlueprintVersion: publishMock,
  applyExperienceBlueprintVersion: applyMock,
}));

import { huntBlueprintSchema } from "@/platform/experiences/templates/schemas";
import { relancerFormule } from "./experience-relance";

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

function appelsA(table: string): AppelDb[] {
  return state.calls.filter((call) => call.table === table);
}

afterEach(() => {
  state.reset();
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

  it("honore la clé fournie par l'appelant", async () => {
    cheminHeureux();
    const requestId = "11111111-1111-4111-8111-111111111111";

    await relancerFormule({ kind: "hunt", sourceId: SOURCE_ID, requestId });

    expect(applyMock.mock.calls[0][0].requestId).toBe(requestId);
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
