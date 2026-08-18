// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({
  sendNewsletterEmails: (params: { recipients: Array<{ email: string }> }) =>
    mocks.send(params),
}));
vi.mock("@/lib/unsubscribe", () => ({
  signUnsubscribeToken: (id: string) => `tok-${id}`,
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));

import { processNewsletterJob } from "./newsletter-worker";
import type { JobRow } from "./jobs";
import type { createAdminClient } from "@/lib/supabase/admin";

const ORG_ID = "org-1";
const CAMPAIGN_ID = "camp-1";

function job(attempts = 1): JobRow {
  return {
    id: "job-1",
    type: "newsletter.send",
    payload: { campaignId: CAMPAIGN_ID },
    status: "running",
    run_after: new Date().toISOString(),
    attempts,
    max_attempts: 5,
    organization_id: ORG_ID,
    idempotency_key: null,
    last_error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
}

const abonne = (n: number) => ({
  subscriber_id: `sub-${String(n).padStart(5, "0")}`,
  email: `abonne${n}@exemple.fr`,
});

const segmentDe = (taille: number) =>
  Array.from({ length: taille }, (_, i) => abonne(i));

const cleDe = (subscriberId: string) => `newsletter:${CAMPAIGN_ID}:${subscriberId}`;

interface FakeOptions {
  segment: Array<{ subscriber_id: string; email: string }>;
  /** Clés déjà présentes dans `email_log` au début du passage. */
  dejaServis?: Set<string>;
  campaignStatus?: string;
  segmentError?: string;
  logReadError?: string;
  /**
   * Rang de la lecture du journal (1 = la première) à partir duquel elle
   * tombe. Sert à faire échouer une tranche APRÈS qu'une autre soit partie —
   * le seul cas où le worker doit différer plutôt que réessayer.
   */
  logReadErrorDesLecture?: number;
}

function fakeAdmin(options: FakeOptions) {
  const journal = new Set(options.dejaServis ?? []);
  let lecturesJournal = 0;
  /** Trace ORDONNÉE des écritures : c'est elle qui prouve le par-tranche. */
  const trace: Array<
    | { type: "upsert"; count: number }
    | { type: "campaign"; status: string; sent: number; total: number }
  > = [];

  const campagne = {
    id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    subject: "Nos nouveautés",
    body: "Bonjour",
    status: options.campaignStatus ?? "queued",
    segment: "all",
    recipient_count: 0,
  };

  const admin = {
    rpc: async (fn: string) => {
      if (fn !== "org_segment_emails") throw new Error(`RPC inattendue: ${fn}`);
      if (options.segmentError) {
        return { data: null, error: { message: options.segmentError } };
      }
      return { data: options.segment, error: null };
    },
    from(table: string) {
      if (table === "newsletter_campaigns") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: campagne, error: null }) }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              if (typeof values.sent_count === "number") {
                trace.push({
                  type: "campaign",
                  status: String(values.status),
                  sent: values.sent_count,
                  total: Number(values.recipient_count),
                });
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Chez Marcel" }, error: null }),
            }),
          }),
        };
      }
      // email_log
      return {
        select: () => ({
          eq: () => ({
            in: async (_col: string, cles: string[]) => {
              lecturesJournal += 1;
              if (options.logReadError) {
                return { data: null, error: { message: options.logReadError } };
              }
              if (
                options.logReadErrorDesLecture !== undefined &&
                lecturesJournal >= options.logReadErrorDesLecture
              ) {
                return { data: null, error: { message: "journal ko" } };
              }
              return {
                data: cles.filter((c) => journal.has(c)).map((c) => ({ dedup_key: c })),
                error: null,
              };
            },
          }),
        }),
        upsert: async (rows: Array<{ dedup_key: string }>) => {
          trace.push({ type: "upsert", count: rows.length });
          for (const r of rows) journal.add(r.dedup_key);
          return { error: null };
        },
      };
    },
  };

  return {
    // unsafe-cast-justification: bouchon minimal de client Supabase.
    admin: admin as unknown as ReturnType<typeof createAdminClient>,
    trace,
    journal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Le fournisseur accepte tout le lot qu'on lui donne.
  mocks.send.mockImplementation(
    async (p: { recipients: Array<{ email: string }> }) => ({
      sent: p.recipients.length,
      delivered: p.recipients.map((r) => r.email),
    }),
  );
});

describe("processNewsletterJob — le plafond ne fait plus disparaître personne", () => {
  it("différe le reliquat au lieu de tronquer, et annonce le TOTAL réel", async () => {
    // LE DÉFAUT QUE CE TEST FERME (JOB-2). Le segment était `slice(0, 1000)` :
    // les 1 500 autres abonnés n'étaient ni envoyés, ni comptés, ni signalés,
    // et `recipient_count` recopiait le nombre TRONQUÉ — la campagne
    // s'affichait « 1000 sur 1000 », complète.
    const { admin, trace, journal } = fakeAdmin({ segment: segmentDe(2500) });

    const outcome = await processNewsletterJob(admin, job());

    expect(outcome.status).toBe("deferred");
    expect(outcome).toHaveProperty("runAfter");
    expect(journal.size).toBe(1000);

    const derniere = trace.filter((t) => t.type === "campaign").at(-1);
    expect(derniere).toEqual({
      type: "campaign",
      status: "sending",
      sent: 1000,
      total: 2500,
    });
  });

  it("reprend là où le passage précédent s'est arrêté", async () => {
    const segment = segmentDe(2500);
    const dejaServis = new Set(
      segment.slice(0, 1000).map((r) => cleDe(r.subscriber_id)),
    );
    const { admin, trace } = fakeAdmin({
      segment,
      dejaServis,
      campaignStatus: "sending",
    });

    const outcome = await processNewsletterJob(admin, job());

    // Aucun des 1 000 premiers n'est renvoyé : ils ne sont dans aucun lot.
    const envoyes = mocks.send.mock.calls.flatMap((appel) => {
      const p = appel[0] as { recipients: Array<{ email: string }> };
      return p.recipients.map((r) => r.email);
    });
    expect(envoyes).not.toContain(segment[0].email);
    expect(envoyes).toContain(segment[1000].email);
    expect(envoyes).toHaveLength(1000);

    expect(outcome.status).toBe("deferred");
    expect(trace.filter((t) => t.type === "campaign").at(-1)).toMatchObject({
      sent: 2000,
      total: 2500,
    });
  });

  it("clôt en `completed` quand le dernier reliquat passe", async () => {
    const segment = segmentDe(150);
    const dejaServis = new Set(
      segment.slice(0, 100).map((r) => cleDe(r.subscriber_id)),
    );
    const { admin, trace } = fakeAdmin({ segment, dejaServis, campaignStatus: "sending" });

    const outcome = await processNewsletterJob(admin, job());

    expect(outcome.status).toBe("completed");
    expect(trace.filter((t) => t.type === "campaign").at(-1)).toMatchObject({
      status: "completed",
      sent: 150,
      total: 150,
    });
  });
});

describe("processNewsletterJob — la progression s'écrit par tranche", () => {
  it("journalise et publie APRÈS CHAQUE tranche, pas à la fin", async () => {
    // LE DÉFAUT QUE CE TEST FERME (JOB-3). `email_log` n'était écrit qu'après
    // le dernier lot : un worker tué au neuvième lot sur dix ne laissait aucune
    // trace des neuf premiers, et la reprise renvoyait 900 emails déjà reçus.
    const { admin, trace } = fakeAdmin({ segment: segmentDe(250) });

    await processNewsletterJob(admin, job());

    expect(mocks.send).toHaveBeenCalledTimes(3);
    // Trois tranches → trois journalisations et trois publications, alternées.
    expect(trace.map((t) => t.type)).toEqual([
      "upsert",
      "campaign",
      "upsert",
      "campaign",
      "upsert",
      "campaign",
      // La septième est la clôture terminale (`completed`), pas une tranche.
      "campaign",
    ]);
    expect(trace.at(-1)).toMatchObject({ status: "completed", sent: 250, total: 250 });
    expect(trace.filter((t) => t.type === "upsert").map((t) => t.count)).toEqual([
      100, 100, 50,
    ]);
  });

  it("garde ce qui est parti quand le journal devient illisible en cours", async () => {
    // La première tranche lit son journal et part ; la DEUXIÈME lecture tombe.
    const { admin } = fakeAdmin({
      segment: segmentDe(250),
      logReadErrorDesLecture: 2,
    });

    const outcome = await processNewsletterJob(admin, job());

    // La première tranche est partie : la perdre en renvoyant `retry` la
    // referait envoyer. Le reste est différé.
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("deferred");
  });
});

describe("processNewsletterJob — issues terminales", () => {
  it("refuse un segment vide", async () => {
    const { admin, trace } = fakeAdmin({ segment: [] });
    const outcome = await processNewsletterJob(admin, job());
    expect(outcome.status).toBe("completed");
    expect(trace.at(-1)).toMatchObject({ status: "failed", sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("ne renvoie rien quand tout le segment a déjà été servi", async () => {
    const segment = segmentDe(50);
    const { admin, trace } = fakeAdmin({
      segment,
      dejaServis: new Set(segment.map((r) => cleDe(r.subscriber_id))),
      campaignStatus: "sending",
    });

    const outcome = await processNewsletterJob(admin, job());

    expect(mocks.send).not.toHaveBeenCalled();
    expect(outcome.status).toBe("completed");
    expect(trace.at(-1)).toMatchObject({ status: "completed", sent: 50, total: 50 });
  });

  it("réessaie quand le fournisseur n'accepte rien", async () => {
    mocks.send.mockResolvedValue({ sent: 0, delivered: [] });
    const { admin } = fakeAdmin({ segment: segmentDe(50) });

    const outcome = await processNewsletterJob(admin, job(1));

    expect(outcome).toEqual({
      status: "retry",
      error: "aucun email accepté par le fournisseur",
    });
  });

  it("échoue définitivement à l'épuisement des tentatives", async () => {
    mocks.send.mockResolvedValue({ sent: 0, delivered: [] });
    const { admin, trace } = fakeAdmin({ segment: segmentDe(50) });

    const outcome = await processNewsletterJob(admin, job(5));

    expect(outcome.status).toBe("failed");
    expect(trace.at(-1)).toMatchObject({ status: "failed" });
  });

  it("conclut `partial` quand une tranche tombe après une tranche réussie", async () => {
    let lots = 0;
    mocks.send.mockImplementation(
      async (p: { recipients: Array<{ email: string }> }) => {
        lots += 1;
        return lots === 1
          ? { sent: p.recipients.length, delivered: p.recipients.map((r) => r.email) }
          : { sent: 0, delivered: [] };
      },
    );
    const { admin, trace } = fakeAdmin({ segment: segmentDe(250) });

    const outcome = await processNewsletterJob(admin, job());

    expect(outcome.status).toBe("partial");
    expect(trace.at(-1)).toMatchObject({ status: "partial", sent: 100, total: 250 });
  });

  it("réessaie sans rien envoyer si le journal est illisible d'entrée", async () => {
    const { admin } = fakeAdmin({ segment: segmentDe(50), logReadError: "journal ko" });

    const outcome = await processNewsletterJob(admin, job());

    expect(mocks.send).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: "retry",
      error: "journal des envois illisible",
    });
  });

  it("n'agit pas sur une campagne déjà terminée", async () => {
    const { admin } = fakeAdmin({ segment: segmentDe(50), campaignStatus: "completed" });
    const outcome = await processNewsletterJob(admin, job());
    expect(outcome.status).toBe("completed");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("réessaie quand le segment est illisible", async () => {
    const { admin } = fakeAdmin({ segment: [], segmentError: "rpc ko" });
    const outcome = await processNewsletterJob(admin, job());
    expect(outcome).toEqual({ status: "retry", error: "rpc ko" });
  });
});
