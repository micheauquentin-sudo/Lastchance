// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...a: unknown[]) => mocks.reportError(...a),
}));

import {
  brevoSmsProvider,
  brevoWireRecipient,
  classifyBrevoFailure,
  scrubProviderError,
} from "@/lib/brevo";

/* ════════════════════════════════════════════════════════════
 * LE CLASSEMENT DES ERREURS BREVO
 *
 * C'est le seul endroit du produit où une décision de REMBOURSEMENT est
 * prise à partir d'un code tiers. La règle testée ici :
 *
 *   DÉFINITIF  = rejouer la même requête donnerait la même réponse
 *   TEMPORAIRE = rejouer la même requête pourrait réussir
 *
 * Les deux erreurs symétriques qu'elle empêche : faire payer un commerçant
 * pour un message que rien n'enverra jamais, et boucler sur un numéro mort.
 * ════════════════════════════════════════════════════════════ */

beforeEach(() => vi.clearAllMocks());

describe("classifyBrevoFailure", () => {
  it("aucune réponse (coupure, délai) : TEMPORAIRE", () => {
    expect(classifyBrevoFailure({ httpStatus: null, code: null })).toBe("failed");
  });

  it("panne du prestataire (5xx) : TEMPORAIRE", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyBrevoFailure({ httpStatus: status, code: null })).toBe(
        "failed",
      );
    }
  });

  it("débit et délai (408, 429) : TEMPORAIRE", () => {
    expect(classifyBrevoFailure({ httpStatus: 429, code: null })).toBe("failed");
    expect(classifyBrevoFailure({ httpStatus: 408, code: null })).toBe("failed");
  });

  it("identité et permissions (401, 403) : TEMPORAIRE — c'est notre compte, pas le numéro", () => {
    expect(classifyBrevoFailure({ httpStatus: 401, code: null })).toBe("failed");
    expect(classifyBrevoFailure({ httpStatus: 403, code: null })).toBe("failed");
  });

  it("numéro ou contenu refusé (400) : DÉFINITIF", () => {
    expect(
      classifyBrevoFailure({ httpStatus: 400, code: "invalid_parameter" }),
    ).toBe("undeliverable");
    expect(
      classifyBrevoFailure({ httpStatus: 400, code: "missing_parameter" }),
    ).toBe("undeliverable");
    expect(classifyBrevoFailure({ httpStatus: 404, code: null })).toBe(
      "undeliverable",
    );
  });

  it("LE CAS QUI COÛTE : « not_enough_credits » arrive en HTTP 400 et reste TEMPORAIRE", () => {
    // Le code est lu AVANT le statut, précisément pour celui-ci. Classé sur le
    // seul statut, un quota Brevo épuisé serait pris pour un numéro invalide :
    // on rembourserait un message parfaitement envoyable, ET on s'interdirait
    // de le renvoyer (claim_sms_delivery refuse toute reprise sur définitif).
    expect(
      classifyBrevoFailure({ httpStatus: 400, code: "not_enough_credits" }),
    ).toBe("failed");
  });

  it("les autres codes de compte restent TEMPORAIRES malgré un 4xx", () => {
    for (const code of [
      "unauthorized",
      "permission_denied",
      "reseller_permission_denied",
      "account_under_validation",
    ]) {
      expect(classifyBrevoFailure({ httpStatus: 400, code })).toBe("failed");
    }
  });

  it("TÉMOIN — un code inconnu sur un 400 reste DÉFINITIF", () => {
    // Modification sans effet attendu : ajouter un code au jeu de codes de
    // compte ne doit pas déplacer ce cas-ci.
    expect(classifyBrevoFailure({ httpStatus: 400, code: "code_inedit" })).toBe(
      "undeliverable",
    );
  });
});

describe("brevoWireRecipient", () => {
  it("retire le « + » que Brevo n'admet pas, et rien d'autre", () => {
    expect(brevoWireRecipient("+33612345678")).toBe("33612345678");
    expect(brevoWireRecipient("33612345678")).toBe("33612345678");
  });

  it("TÉMOIN — ne déduit aucun indicatif, ne répare aucun format", () => {
    // Un numéro non français passe tel quel : cette fonction ne normalise pas.
    expect(brevoWireRecipient("+441632960961")).toBe("441632960961");
    expect(brevoWireRecipient("+9999")).toBe("9999");
  });
});

describe("scrubProviderError", () => {
  it("efface le numéro que Brevo recopie dans ses messages", () => {
    const scrubbed = scrubProviderError(
      "HTTP 400 invalid_parameter — Invalid phone number: 33612345678",
    );
    expect(scrubbed).not.toContain("33612345678");
    expect(scrubbed).toContain("[numéro]");
    expect(scrubbed).toContain("invalid_parameter");
  });

  it("efface aussi les formes espacées", () => {
    expect(scrubProviderError("bad number 06 12 34 56 78 rejected")).not.toContain(
      "12 34",
    );
  });

  it("borne la longueur, sous le CHECK de sms_log.last_error (500)", () => {
    expect(scrubProviderError("x".repeat(2000)).length).toBeLessThanOrEqual(300);
  });

  it("TÉMOIN — un message sans numéro traverse intact", () => {
    expect(scrubProviderError("HTTP 503 service unavailable")).toBe(
      "HTTP 503 service unavailable",
    );
  });
});

/* ── L'adaptateur lui-même, sans réseau ──────────────────── */

function stubFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const request = {
  recipient: "+33612345678",
  sender: "MONRESTO",
  content: "Offre du jour. STOP au 36111",
  marketing: true,
  dedupKey: "sms:org-1:promo:p-1",
};

describe("brevoSmsProvider", () => {
  it("succès : rend l'identifiant du prestataire et le nombre de segments", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ messageId: 12345, smsCount: 1 }), {
        status: 201,
      }),
    );

    const outcome = await brevoSmsProvider("key").send(request);

    expect(outcome).toEqual({
      status: "sent",
      providerMessageId: "12345",
      segments: 1,
    });
  });

  it("envoie le numéro SANS « + », la catégorie et l'expéditeur", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messageId: 1 }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await brevoSmsProvider("secret-key").send(request);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.recipient).toBe("33612345678");
    expect(body.sender).toBe("MONRESTO");
    expect(body.type).toBe("marketing");
    // La clé d'API voyage en en-tête, jamais dans le corps.
    expect(String(init.body)).not.toContain("secret-key");
  });

  it("exception réseau : TEMPORAIRE, et remontée", async () => {
    stubFetch(async () => {
      throw new Error("fetch failed");
    });

    const outcome = await brevoSmsProvider("key").send(request);

    expect(outcome.status).toBe("failed");
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("numéro invalide : DÉFINITIF, et PAS remonté à Sentry", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ code: "invalid_parameter", message: "bad number" }),
        { status: 400 },
      ),
    );

    const outcome = await brevoSmsProvider("key").send(request);

    expect(outcome.status).toBe("undeliverable");
    // Une saisie client fautive est un fait ordinaire du canal : la remonter
    // noierait les vraies pannes sous le bruit.
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("réponse de succès illisible : considérée partie, sans identifiant", async () => {
    stubFetch(async () => new Response("pas du json", { status: 201 }));

    const outcome = await brevoSmsProvider("key").send(request);

    expect(outcome).toEqual({
      status: "sent",
      providerMessageId: null,
      segments: 1,
    });
  });
});
