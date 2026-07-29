// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  isSensitiveKey,
  REDACTED,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubText,
} from "./sentry-scrub";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";

describe("scrubText", () => {
  it("retire les emails et les téléphones", () => {
    const out = scrubText(
      "échec pour joueur.test+tag@example.com (06 12 34 56 78 / +33 6 98 76 54 32)",
    );

    expect(out).not.toContain("@example.com");
    expect(out).not.toContain("06 12 34 56 78");
    expect(out).not.toContain("+33 6 98 76 54 32");
    expect(out).toContain("[email]");
    expect(out).toContain("[téléphone]");
    // Le contexte, lui, reste lisible.
    expect(out).toContain("échec pour");
  });

  it("retire les jetons : JWT, en-tête Bearer, clés préfixées", () => {
    const out = scrubText(
      `refus: Authorization: Bearer ${JWT} avec sk_live_51NabcdefghijklmnopQR et whsec_9f8e7d6c5b4a3210`,
    );

    expect(out).not.toContain(JWT);
    expect(out).not.toContain("sk_live_51NabcdefghijklmnopQR");
    expect(out).not.toContain("whsec_9f8e7d6c5b4a3210");
    expect(out).toContain("Bearer [jeton]");
    expect(out).toContain("[secret]");
  });

  it("désamorce une URL signée sans perdre le chemin ni les paramètres utiles", () => {
    const out = scrubText(
      `lecture impossible : https://abc.supabase.co/storage/v1/object/sign/qr/carte.png?token=${JWT}&width=512`,
    );

    expect(out).not.toContain(JWT);
    // Ce qui permet de comprendre l'incident survit.
    expect(out).toContain("https://abc.supabase.co/storage/v1/object/sign/qr/carte.png");
    expect(out).toContain("width=512");
  });

  it("expurge une affectation de secret en texte libre", () => {
    expect(scrubText('CRON_SECRET="hunter2-très-long" reste hors journal')).toContain(
      `CRON_SECRET=${REDACTED}`,
    );
    // Une affectation anodine n'est pas touchée.
    expect(scrubText("attempts=3")).toBe("attempts=3");
  });

  it("conserve le diagnostic : message Postgres, code, durée, UUID", () => {
    const message =
      'insert or update on table "jobs" violates foreign key constraint (code 23503) en 1753 ms · organisation 3f1a7c2e-8b5d-4f6a-9c0e-1d2b3a4c5d6e';

    expect(scrubText(message)).toBe(message);
  });

  /**
   * Un code de retrait est un SECRET PORTEUR : qui le détient encaisse le lot.
   * PostgreSQL le recopie dans son message sur violation d'unicité, et la clé
   * s'appelle `code` — que le scrubber laisse volontairement lisible (SQLSTATE,
   * `error.code`). D'où un motif sur la FORME du code.
   */
  it("expurge un code de retrait cité par une violation d'unicité Postgres", () => {
    const out = scrubText(
      'duplicate key value violates unique constraint "participations_code_key" · Key (code)=(GAIN-ABCD2345) already exists.',
    );

    expect(out).not.toContain("GAIN-ABCD2345");
    expect(out).toContain("[code de retrait]");
    // Le diagnostic survit : contrainte, nature de l'erreur et clé restent lisibles.
    expect(out).toContain("participations_code_key");
    expect(out).toContain("(code)=");
  });

  it("expurge les neuf familles de codes, quelle que soit leur longueur", () => {
    const codes = [
      "GAIN-ABCD2345",
      "CHASSE-EFGH2345",
      "FIDELITE-JKLM2345",
      "JACKPOT-NPQR2345",
      "EVENT-STUV2345",
      "CADEAU-WXYZ2345",
      "PARRAIN-ABCD3456",
      "QUIZ-EFGH3456",
      "PRONO-JKLM3456",
    ];

    for (const code of codes) {
      const out = scrubText(`Key (code)=(${code}) already exists.`);
      expect(out, `${code} doit être expurgé`).not.toContain(code);
      expect(out).toContain("[code de retrait]");
    }
  });

  it("ne touche pas à ce qui ressemble à un code sans en être un", () => {
    // Identifiants techniques et sigles : les expurger coûterait du
    // diagnostic sans rien protéger. Un code NU n'est délibérément pas visé.
    const message =
      "job SPIN-QUEUE a échoué · build 2SyiVZiyq2nszV8ITD2SB · code ABCD2345 · SQLSTATE 23505";

    expect(scrubText(message)).toBe(message);
  });
});

describe("isSensitiveKey", () => {
  it("reconnaît les clés porteuses de secret ou de PII, quelle que soit la casse", () => {
    for (const key of [
      "email",
      "customer_email",
      "playerKey",
      "ip_address",
      "X-Amz-Signature",
      "authorization",
      "first_name",
      "api-key",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("laisse passer les clés de diagnostic", () => {
    for (const key of [
      "code",
      "duration_ms",
      "organization_id",
      "idempotency_key",
      "attempts",
      "op",
      "status",
    ]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe("scrubSentryEvent", () => {
  it("assainit message, exception, extra, tags et fil d'Ariane", () => {
    const event = scrubSentryEvent({
      message: `envoi refusé pour client@example.com`,
      exception: {
        values: [
          {
            type: "Error",
            value: `Supabase 401 sur https://abc.supabase.co/rest/v1/spins?token=${JWT}`,
          },
        ],
      },
      tags: { scope: "cron.reengage", api_key: "sk_live_abcdefghijklmnop" },
      extra: {
        email: "joueur@example.com",
        duration_ms: 1200,
        organization_id: "3f1a7c2e-8b5d-4f6a-9c0e-1d2b3a4c5d6e",
        payload: { player_key: "pk-secret-value", attempts: 2 },
      },
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: "https://app.example.com/api/wallet?token=abc123def456&slug=cafe",
            status_code: 500,
          },
        },
      ],
    });

    expect(event.message).toContain("[email]");
    expect(event.exception?.values?.[0]?.value).not.toContain(JWT);
    expect(event.exception?.values?.[0]?.type).toBe("Error");
    expect(event.tags?.api_key).toBe(REDACTED);
    expect(event.tags?.scope).toBe("cron.reengage");
    expect(event.extra?.email).toBe(REDACTED);
    expect(event.extra?.duration_ms).toBe(1200);
    expect(event.extra?.organization_id).toBe(
      "3f1a7c2e-8b5d-4f6a-9c0e-1d2b3a4c5d6e",
    );
    expect(event.extra?.payload).toEqual({ player_key: REDACTED, attempts: 2 });

    const crumb = event.breadcrumbs?.[0]?.data;
    expect(crumb?.url).not.toContain("abc123def456");
    expect(crumb?.url).toContain("slug=cafe");
    expect(crumb?.status_code).toBe(500);
  });

  it("supprime cookies et identité de la requête, garde l'URL et l'id technique", () => {
    const event = scrubSentryEvent({
      request: {
        url: "https://app.example.com/play/cafe?token=secret-value-1234",
        query_string: "token=secret-value-1234&slug=cafe",
        cookies: { sb_access: "valeur" },
        headers: { authorization: `Bearer ${JWT}`, "user-agent": "vitest" },
      },
      user: {
        id: "user-1",
        email: "joueur@example.com",
        username: "joueur",
        ip_address: "203.0.113.7",
      },
    });

    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.url).toContain("/play/cafe");
    expect(event.request?.url).not.toContain("secret-value-1234");
    expect(event.request?.query_string).toContain("slug=cafe");
    expect(event.request?.query_string).not.toContain("secret-value-1234");
    expect(event.request?.headers?.authorization).toBe(REDACTED);
    expect(event.request?.headers?.["user-agent"]).toBe("vitest");
    expect(event.user?.email).toBeUndefined();
    expect(event.user?.username).toBeUndefined();
    expect(event.user?.ip_address).toBeUndefined();
    expect(event.user?.id).toBe("user-1");
  });

  it("survit à une structure cyclique", () => {
    const cyclic: Record<string, unknown> = { note: "boucle" };
    cyclic.self = cyclic;

    const event = scrubSentryEvent({ extra: { cyclic } });

    expect(event.extra?.cyclic).toBeDefined();
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("assainit message et données du fil d'Ariane", () => {
    const crumb = scrubSentryBreadcrumb({
      category: "console",
      level: "error",
      message: "[reengage] envoi à joueur@example.com au 06 12 34 56 78",
      data: { to: "joueur@example.com", sent: 3 },
    });

    expect(crumb.message).not.toContain("joueur@example.com");
    expect(crumb.message).not.toContain("06 12 34 56 78");
    expect(crumb.message).toContain("[reengage]");
    // `to` porte une URL ou un destinataire : la valeur est typée, pas gardée.
    expect(crumb.data?.to).toBe("[email]");
    expect(crumb.data?.sent).toBe(3);
    expect(crumb.category).toBe("console");
  });
});
