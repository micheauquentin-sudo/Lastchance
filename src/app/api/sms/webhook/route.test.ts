// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * POST /api/sms/webhook — la réception du STOP
 *
 * Cette route est ce qui rend le produit légal : sans elle, un client qui
 * répond STOP continue d'être démarché. Les tests portent donc sur quatre
 * choses, dans cet ordre d'importance : le STOP est-il RÉELLEMENT enregistré,
 * l'appel est-il authentifié, la route dit-elle quelque chose d'un numéro
 * qu'on ne lui a pas demandé, et un échec fait-il RETENTER le prestataire.
 *
 * L'authentification a TROIS chemins depuis que le secret maître est sorti
 * de l'URL (en-tête, jeton dérivé en URL, secret maître en URL le temps de
 * la bascule) : les trois sont couverts, et le dernier est vérifié sur son
 * SIGNAL — c'est lui qui dira quand le retirer.
 * ════════════════════════════════════════════════════════════ */

const mocks = vi.hoisted(() => ({
  recordCounter: vi.fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
  observeSharedKey: vi.fn(),
  normalizeSmsPhone: vi.fn(),
  rpc: vi.fn(),
  logRows: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) =>
    name === "BREVO_WEBHOOK_SECRET" ? "hook-secret" : undefined,
}));
vi.mock("@/lib/monitoring", () => ({
  monitored: (_name: string, fn: () => unknown) => fn(),
  recordCounter: (...a: unknown[]) => mocks.recordCounter(...a),
  reportError: (...a: unknown[]) => mocks.reportError(...a),
  reportSecurityEvent: (...a: unknown[]) => mocks.reportSecurityEvent(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  observeSharedKey: (...a: unknown[]) => mocks.observeSharedKey(...a),
  rateLimitBucket: (...parts: unknown[]) => parts.join(":"),
}));
vi.mock("@/lib/sms-dispatch", () => ({
  normalizeSmsPhone: (...a: unknown[]) => mocks.normalizeSmsPhone(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...a: unknown[]) => mocks.rpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => mocks.logRows(),
          }),
        }),
      }),
    }),
  }),
}));

import { createHmac } from "node:crypto";

import { POST } from "./route";

/* Dérivation refaite ici À LA MAIN, et non importée de la route : un test
 * qui appelle la fonction qu'il vérifie ne prouve que sa propre cohérence.
 * Si la forme du jeton change, ce test doit rougir. */
const URL_TOKEN = createHmac("sha256", "hook-secret")
  .update("brevo-url-token")
  .digest("hex")
  .slice(0, 32);

function post(
  body: unknown,
  options: { token?: string | null; query?: string } = {},
) {
  const token = options.token === undefined ? "hook-secret" : options.token;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["x-lastchance-sms-token"] = token;
  return new Request(
    `https://app.example.com/api/sms/webhook${options.query ?? ""}`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.normalizeSmsPhone.mockResolvedValue("+33612345678");
  mocks.logRows.mockResolvedValue({
    data: [{ organization_id: "org-1" }],
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.observeSharedKey.mockResolvedValue(undefined);
});

describe("authentification", () => {
  it("sans jeton : 401, et AUCUNE lecture de base", async () => {
    const response = await POST(post({ event: "unsubscribe" }, { token: null }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reportSecurityEvent).toHaveBeenCalledWith(
      "sms_webhook_invalid_token",
    );
  });

  it("jeton faux : 401", async () => {
    const response = await POST(post({ event: "unsubscribe" }, { token: "nope" }));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("en-tête FAUX : 401, sans repli sur l'URL même correcte", async () => {
    // Un en-tête présent mais faux est un appel qui prétend s'authentifier.
    // Le rattraper par l'URL rendrait l'en-tête décoratif.
    const response = await POST(
      post({ event: "unsubscribe", msisdn: "33612345678" }, {
        token: "nope",
        query: `?token=${URL_TOKEN}`,
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("jeton DÉRIVÉ en paramètre d'URL : accepté, et aucun signal de bascule", async () => {
    const response = await POST(
      post({ event: "unsubscribe", msisdn: "33612345678" }, {
        token: null,
        query: `?token=${URL_TOKEN}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "revoke_sms_consent",
      expect.objectContaining({ p_organization_id: "org-1" }),
    );
    expect(mocks.reportSecurityEvent).not.toHaveBeenCalled();
  });

  it("LE SECRET MAÎTRE n'est PAS le jeton d'URL", async () => {
    // La garde du chantier : si cette assertion tombe, c'est que le jeton
    // dérivé a été recâblé sur le secret lui-même et que l'URL le reporte.
    expect(URL_TOKEN).not.toBe("hook-secret");
    expect(URL_TOKEN).toMatch(/^[0-9a-f]{32}$/);
  });

  it("secret maître en URL : encore accepté, mais SIGNALÉ", async () => {
    // Chemin hérité : le refuser aujourd'hui couperait les STOP entre le
    // déploiement et la reprise de la configuration Brevo. Le signal est
    // ce qui dira quand il n'a plus d'usage.
    const response = await POST(
      post({ event: "unsubscribe", msisdn: "33612345678" }, {
        token: null,
        query: "?token=hook-secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalled();
    expect(mocks.reportSecurityEvent).toHaveBeenCalledWith(
      "sms_webhook_legacy_url_secret",
    );
  });

  it("jeton d'URL faux : 401", async () => {
    const response = await POST(
      post({ event: "unsubscribe" }, { token: null, query: "?token=nope" }),
    );

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reportSecurityEvent).toHaveBeenCalledWith(
      "sms_webhook_invalid_token",
    );
  });
});

describe("le STOP est réellement enregistré", () => {
  it("réponse « STOP » du client : consentement retiré", async () => {
    const response = await POST(
      post({ from: "33612345678", to: "36111", text: "STOP" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_sms_consent", {
      p_organization_id: "org-1",
      p_phone: "+33612345678",
      p_reason: "stop",
    });
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.stop.revoked");
  });

  it("sur une réponse entrante, c'est « from » (le client) qui est retiré, pas « to » (le numéro court)", async () => {
    await POST(post({ from: "33612345678", to: "36111", text: "stop" }));

    expect(mocks.normalizeSmsPhone).toHaveBeenCalledWith(
      expect.anything(),
      "33612345678",
    );
  });

  it("sur un événement de désabonnement, c'est « msisdn » (la destination)", async () => {
    await POST(post({ event: "unsubscribe", msisdn: "33698765432" }));

    expect(mocks.normalizeSmsPhone).toHaveBeenCalledWith(
      expect.anything(),
      "33698765432",
    );
  });

  it("les variantes réellement tapées sont reconnues", async () => {
    for (const text of ["stop", "STOP", " Stop ", "arret", "arrêt", "STOPSMS"]) {
      vi.clearAllMocks();
      mocks.normalizeSmsPhone.mockResolvedValue("+33612345678");
      mocks.logRows.mockResolvedValue({
        data: [{ organization_id: "org-1" }],
        error: null,
      });
      mocks.rpc.mockResolvedValue({ data: true, error: null });

      await POST(post({ from: "33612345678", text }));
      expect(mocks.rpc, `« ${text} » doit valoir un retrait`).toHaveBeenCalled();
    }
  });

  it("un second STOP est normal : 200, et compté comme répétition", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(post({ from: "33612345678", text: "STOP" }));

    expect(response.status).toBe(200);
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.stop.repeated");
  });
});

describe("ce qui n'est PAS un STOP", () => {
  it("un accusé de livraison est acquitté sans rien retirer", async () => {
    const response = await POST(
      post({ event: "delivered", msisdn: "33612345678" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.webhook.ignored");
  });

  it("un message qui PARLE de stop n'est pas un retrait", async () => {
    // « stop » ancré en tête : sans cela, un client enthousiaste se
    // désabonnerait sans le vouloir.
    const response = await POST(
      post({ from: "33612345678", text: "c'est top, non stop je recommande" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("TÉMOIN — un événement inconnu ne fait rien et ne casse rien", async () => {
    const response = await POST(post({ event: "sent", msisdn: "33612345678" }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("aucun oracle sur l'existence d'un numéro", () => {
  it("numéro inconnu : réponse IDENTIQUE au cas nominal", async () => {
    mocks.logRows.mockResolvedValue({ data: [], error: null });

    const unknown = await POST(post({ from: "33600000000", text: "STOP" }));
    const unknownBody = await unknown.json();

    mocks.logRows.mockResolvedValue({
      data: [{ organization_id: "org-1" }],
      error: null,
    });
    const known = await POST(post({ from: "33612345678", text: "STOP" }));
    const knownBody = await known.json();

    expect(unknown.status).toBe(known.status);
    expect(unknownBody).toEqual(knownBody);
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.stop.unmatched");
  });
});

describe("un STOP perdu doit faire RETENTER le prestataire", () => {
  it("base injoignable à la recherche : 500", async () => {
    mocks.logRows.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    const response = await POST(post({ from: "33612345678", text: "STOP" }));

    // 500 volontaire : acquitter à 200 perdrait le retrait en silence, et
    // nous laisserait démarcher quelqu'un qui a demandé l'arrêt.
    expect(response.status).toBe(500);
  });

  it("retrait impossible : 500", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await POST(post({ from: "33612345678", text: "STOP" }));

    expect(response.status).toBe(500);
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("corps illisible : 400, sans lecture de base", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/sms/webhook", {
        method: "POST",
        headers: { "x-lastchance-sms-token": "hook-secret" },
        body: "{ pas du json",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("limite de débit", () => {
  it("OBSERVE mais ne refuse jamais — un STOP ne se rejette pas", async () => {
    const response = await POST(post({ from: "33612345678", text: "STOP" }));

    expect(mocks.observeSharedKey).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalled();
  });
});
