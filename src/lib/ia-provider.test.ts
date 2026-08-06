import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getIaProvider, isIaConfigured, type EntreeSuggestion } from "./ia-provider";

// ────────────────────────────────────────────────────────────
// PRESTATAIRE IA — dormance, issues non nominales, absence de fuite.
//
// La clé vit dans l'ENVIRONNEMENT et l'en-tête, jamais dans le corps ni un log.
// Sans clé, l'assistant est ÉTEINT : provider null, aucun appel réseau. Toute
// issue non `end_turn` (refusal, max_tokens), tout non-200 et toute panne réseau
// rendent une liste vide — jamais une exception qui remonterait un corps.
// ────────────────────────────────────────────────────────────

const fetchMock = vi.fn();

const ENTREE: EntreeSuggestion = {
  organizationName: "Ma boutique",
  typeCommerce: "boulangerie",
  objectif: "Acquérir",
};

function reponse(body: unknown, ok = true, status = 200): Response {
  // unsafe-cast-justification: fausse Response réduite aux 3 champs lus (ok, status, json)
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

function providerConfigure() {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  const provider = getIaProvider();
  expect(provider).not.toBeNull();
  return provider!;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ia-provider — dormance sans clé", () => {
  it("sans ANTHROPIC_API_KEY : non configuré et provider null", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isIaConfigured()).toBe(false);
    expect(getIaProvider()).toBeNull();
  });

  it("avec clé : configuré et provider non null", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(isIaConfigured()).toBe(true);
    expect(getIaProvider()).not.toBeNull();
  });
});

describe("ia-provider — suggererBlueprints", () => {
  it("clé présente dans l'en-tête, JAMAIS dans le corps de la requête", async () => {
    fetchMock.mockResolvedValue(
      reponse({ stop_reason: "end_turn", content: [{ type: "text", text: '{"idees":[]}' }] }),
    );

    await providerConfigure().suggererBlueprints(ENTREE);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
    expect(String(init.body)).not.toContain("sk-ant-test");
  });

  it("stop_reason refusal → liste vide, aucune exception", async () => {
    fetchMock.mockResolvedValue(reponse({ stop_reason: "refusal", content: [] }));
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual([]);
  });

  it("stop_reason max_tokens → liste vide (JSON possiblement tronqué)", async () => {
    fetchMock.mockResolvedValue(
      reponse({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"idees":[{' }] }),
    );
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual([]);
  });

  it("non-200 → liste vide et ne relaie pas le corps d'erreur", async () => {
    fetchMock.mockResolvedValue(
      reponse({ error: { message: "fuite-en-tete-x-api-key" } }, false, 500),
    );
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual([]);
  });

  it("panne réseau → liste vide, aucune exception", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual([]);
  });

  it("end_turn + JSON valide → rend le tableau brut d'idées (non validé ici)", async () => {
    const idees = [{ version: 1 }, { forme: "libre" }];
    fetchMock.mockResolvedValue(
      reponse({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ idees }) }] }),
    );
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual(idees);
  });

  it("tolère un préambule textuel autour du JSON", async () => {
    const idees = [{ version: 1 }];
    fetchMock.mockResolvedValue(
      reponse({
        stop_reason: "end_turn",
        content: [{ type: "text", text: `Voici :\n${JSON.stringify({ idees })}\nVoilà.` }],
      }),
    );
    await expect(providerConfigure().suggererBlueprints(ENTREE)).resolves.toEqual(idees);
  });
});
