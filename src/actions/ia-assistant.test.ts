import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// ASSISTANT DE CRÉATION IA — action serveur.
//
// On câble le VRAI prestataire (src/lib/ia-provider.ts) et on mocke `fetch` :
// c'est le seul moyen d'inspecter le CORPS réellement envoyé au modèle, et donc
// de prouver l'absence de PII. Auth et rate-limit sont mockés.
//
// Quatre invariants vérifiés sur le comportement RÉEL :
//   1. DORMANT SANS CLÉ — refus serveur AVANT tout appel réseau.
//   2. RÔLE — caissier refusé, rien n'est envoyé.
//   3. PII — le corps de la requête ne porte aucun secret de l'organisation.
//   4. VALIDATION — une idée qui échoue campaignBlueprintSchema est écartée.
// ────────────────────────────────────────────────────────────

const { getUserAndOrgMock } = vi.hoisted(() => ({ getUserAndOrgMock: vi.fn() }));
const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getUserAndOrg: getUserAndOrgMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: rateLimitMock };
});

const fetchMock = vi.fn();

import { suggererIdeesCampagne } from "./ia-assistant";
import { RATE_LIMITS } from "@/lib/rate-limit";

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";

/** Organisation PORTANT des secrets : on prouve qu'aucun ne fuit dans le corps. */
function session(role: "owner" | "editor" | "cashier" = "owner") {
  return {
    user: { id: "user-1" },
    organization: {
      id: ORG_ID,
      name: "Ma boutique",
      stripe_customer_id: "cus_SECRET123",
      webhook_secret: "whsec_SECRET456",
      webhook_url: "https://hook.example/SECRET789",
      comp_access_note: "note-SECRET000",
    },
    role,
  };
}

function blueprintValide(campaignName = "Idée A") {
  return {
    version: 1,
    texts: { campaignName, wheelName: "Roue", wheelTitle: "Tentez votre chance !" },
    visual: { preset: "classic" },
    game: { game_type: "wheel", skill_config: null },
    prizes: [
      { label: "Café offert", description: "", color: "#22d3ee", weight: 30, is_losing: false, stock: 50, cost_cents: 150 },
      { label: "Pas de chance", description: "", color: "#a1a1aa", weight: 70, is_losing: true, stock: null, cost_cents: null },
    ],
    rules: { play_limit: "once", collect_email: false, collect_phone: false, code_ttl_seconds: null, engagement: {}, budget_cents: null },
    durationDays: 7,
    emails: [],
  };
}

/** Un blueprint SANS lot gagnant : invalide au regard de campaignBlueprintSchema. */
function blueprintSansGagnant() {
  const b = blueprintValide("Idée invalide");
  b.prizes = b.prizes.map((prize) => ({ ...prize, is_losing: true }));
  return b;
}

function reponseModele(idees: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ idees }) }],
      }),
    // unsafe-cast-justification: fausse Response réduite aux 3 champs lus (ok, status, json)
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  rateLimitMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("suggererIdeesCampagne — dormance sans clé", () => {
  it("sans ANTHROPIC_API_KEY : refuse côté serveur AVANT tout appel réseau", async () => {
    // ANTHROPIC_API_KEY n'est pas dans l'env de test : assistant dormant.
    getUserAndOrgMock.mockResolvedValue(session("owner"));

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    expect(res).toEqual({ ok: false, error: "Assistant indisponible" });
    // Le point critique : aucun appel réseau n'est tenté sans clé.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("suggererIdeesCampagne — rôle", () => {
  it("un rôle caisse est refusé et n'envoie rien", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("cashier"));

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    expect(res).toEqual({ ok: false, error: "Action non autorisée" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("suggererIdeesCampagne — PII", () => {
  it("le corps envoyé au modèle ne contient AUCUN secret de l'organisation", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    fetchMock.mockResolvedValue(reponseModele([blueprintValide()]));

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    // Aucun champ sensible de l'objet Organization ne transite.
    expect(body).not.toContain("cus_SECRET123");
    expect(body).not.toContain("whsec_SECRET456");
    expect(body).not.toContain("SECRET789");
    expect(body).not.toContain("SECRET000");
    // Seuls le nom (blanc-listé), le type saisi et l'objectif partent.
    expect(body).toContain("Ma boutique");
    expect(body).toContain("boulangerie");
    expect(body).toContain("Acquérir");
  });
});

describe("suggererIdeesCampagne — validation des idées", () => {
  it("stop_reason refusal côté modèle → aucune idée, sans erreur", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ stop_reason: "refusal", content: [] }),
      // unsafe-cast-justification: fausse Response réduite aux 3 champs lus (ok, status, json)
    } as unknown as Response);

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Fidéliser" });

    expect(res).toEqual({ ok: true, data: { idees: [] } });
  });

  it("une idée invalide est ÉCARTÉE, les valides restent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    fetchMock.mockResolvedValue(
      reponseModele([blueprintValide("A"), blueprintSansGagnant(), blueprintValide("B")]),
    );

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.idees).toHaveLength(2);
    expect(res.data.idees.map((idee) => idee.blueprint.texts.campaignName)).toEqual(["A", "B"]);
  });
});

describe("suggererIdeesCampagne — rate limit", () => {
  it("la clé opérateur est (org, user) et failClosed ; le plafond org existe", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    fetchMock.mockResolvedValue(reponseModele([blueprintValide()]));

    await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    const operateur = rateLimitMock.mock.calls.find((call) =>
      String(call[0]).includes("user-1"),
    );
    expect(operateur, "seau opérateur (org, user)").toBeDefined();
    expect(String(operateur![0])).toContain(ORG_ID);
    expect(operateur![2]).toEqual({ failClosed: true });

    const orgSeau = rateLimitMock.mock.calls.find(
      (call) => String(call[0]) === `ia:suggest:org:${ORG_ID}`,
    );
    expect(orgSeau, "plafond par organisation").toBeDefined();
    expect(orgSeau![2]).toEqual({ failClosed: true });

    // Les deux règles existent bien dans le catalogue.
    expect(RATE_LIMITS.iaSuggestionRequest).toBeDefined();
    expect(RATE_LIMITS.iaSuggestionOrg).toBeDefined();
  });

  it("un seau saturé refuse et n'appelle pas le modèle", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    rateLimitMock.mockResolvedValue(false);

    const res = await suggererIdeesCampagne({ typeCommerce: "boulangerie", objectif: "Acquérir" });

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
