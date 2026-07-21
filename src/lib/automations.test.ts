// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture les envois sans Resend réel : chaque lot « accepte » tous les
// destinataires (le worker journalise ensuite email_log).
const resendMock = vi.hoisted(() => {
  const echo = async (p: { recipients: Array<{ email: string }> }) => ({
    sent: p.recipients.length,
    sentEmails: p.recipients.map((r) => r.email),
  });
  return {
    sendWonNotRedeemedEmails: vi.fn(echo),
    sendInactiveEmails: vi.fn(echo),
    sendPostRedemptionEmails: vi.fn(echo),
    sendBirthdayEmails: vi.fn(echo),
    sendBudgetPausedEmail: vi.fn(async () => true),
    sendLowStockEmail: vi.fn(async () => true),
    isResendConfigured: vi.fn(() => true),
  };
});
vi.mock("@/lib/resend", () => resendMock);
vi.mock("@/lib/unsubscribe", () => ({
  signUnsubscribeToken: (id: string) => `tok-${id}`,
}));
const merchantContactMock = vi.hoisted(() => ({
  getOrgOwnerEmail: vi.fn(async () => "patron@commerce.fr"),
}));
vi.mock("@/lib/merchant-contact", () => merchantContactMock);

import {
  currentYearInTimezone,
  parseScenarioConfig,
  processAutomationRunJob,
  processBudgetPausedJob,
  processLowStockJob,
  runAutomationScenarios,
} from "./automations";
import type { JobRow } from "./jobs";

const ORG_ID = "org-1";

function job(payload: Record<string, unknown>): JobRow {
  return {
    id: "job-1",
    type: "automation.run-scenarios",
    payload,
    status: "running",
    run_after: new Date().toISOString(),
    attempts: 1,
    max_attempts: 5,
    organization_id: ORG_ID,
    idempotency_key: null,
    last_error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
}

/** Chaîne Supabase minimale : tous les filtres retournent la même issue. */
function chain(data: unknown, error: { message: string } | null = null) {
  const result = { data, error };
  const self: Record<string, unknown> = {
    maybeSingle: async () => result,
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  for (const m of ["select", "eq", "in", "limit", "order"]) {
    self[m] = () => self;
  }
  return self;
}

interface FakeAdminOptions {
  settings?: Array<{ scenario: string; enabled: boolean; config: unknown }>;
  settingsError?: string;
  org?: { id: string; name: string; timezone: string | null } | null;
  campaign?: Record<string, unknown> | null;
  qr?: { slug: string } | null;
  prize?: Record<string, unknown> | null;
  subscribers?: Array<{ id: string; email: string }>;
  /** Résultat des RPC de ciblage — peut jeter pour simuler une panne. */
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
}

function fakeAdmin(opts: FakeAdminOptions) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const emailLog: Array<Record<string, unknown>> = [];

  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: opts.rpc ? opts.rpc(name, args) : [], error: null };
    },
    from(table: string) {
      switch (table) {
        case "automation_settings":
          return chain(
            opts.settings ?? [],
            opts.settingsError ? { message: opts.settingsError } : null,
          );
        case "organizations":
          return chain(opts.org ?? null);
        case "campaigns":
          return chain(opts.campaign ?? null);
        case "qr_codes":
          return chain(opts.qr ?? null);
        case "prizes":
          return chain(opts.prize ?? null);
        case "newsletter_subscribers":
          return chain(opts.subscribers ?? []);
        case "email_log":
          return {
            upsert: async (rows: Array<Record<string, unknown>>) => {
              emailLog.push(...rows);
              return { error: null };
            },
          };
        default:
          throw new Error(`table inattendue: ${table}`);
      }
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, rpcCalls, emailLog };
}

beforeEach(() => {
  resendMock.sendWonNotRedeemedEmails.mockClear();
  resendMock.sendInactiveEmails.mockClear();
  resendMock.sendPostRedemptionEmails.mockClear();
  resendMock.sendBirthdayEmails.mockClear();
  resendMock.sendBudgetPausedEmail.mockClear();
  resendMock.sendLowStockEmail.mockClear();
  resendMock.isResendConfigured.mockReturnValue(true);
  merchantContactMock.getOrgOwnerEmail.mockResolvedValue("patron@commerce.fr");
});

describe("parseScenarioConfig — lecture tolérante avec défauts", () => {
  it("applique les défauts sur une config vide ou absente", () => {
    expect(parseScenarioConfig("won_not_redeemed", {})).toEqual({ minAgeHours: 48 });
    expect(parseScenarioConfig("inactive", null)).toEqual({ tiers: [30, 60] });
    expect(parseScenarioConfig("post_redemption", undefined)).toEqual({
      delayHours: 24,
    });
    expect(parseScenarioConfig("birthday", {})).toEqual({});
  });

  it("conserve des valeurs valides", () => {
    expect(parseScenarioConfig("won_not_redeemed", { minAgeHours: 72 })).toEqual({
      minAgeHours: 72,
    });
    expect(parseScenarioConfig("post_redemption", { delayHours: "12" })).toEqual({
      delayHours: 12,
    });
  });

  it("retombe sur les défauts pour une config hors bornes ou abîmée", () => {
    expect(parseScenarioConfig("won_not_redeemed", { minAgeHours: 10_000 })).toEqual(
      { minAgeHours: 48 },
    );
    expect(parseScenarioConfig("inactive", { tiers: [2] })).toEqual({
      tiers: [30, 60],
    });
    expect(parseScenarioConfig("inactive", "n'importe quoi")).toEqual({
      tiers: [30, 60],
    });
  });

  it("dédoublonne et trie les paliers du scénario inactif", () => {
    expect(parseScenarioConfig("inactive", { tiers: [60, 30, 60] })).toEqual({
      tiers: [30, 60],
    });
  });
});

describe("currentYearInTimezone — clé anniversaire alignée sur la RPC", () => {
  const newYear = new Date("2026-01-01T02:00:00Z");

  it("suit le fuseau de l'organisation autour du Nouvel An", () => {
    expect(currentYearInTimezone("Europe/Paris", newYear)).toBe(2026);
    expect(currentYearInTimezone("America/New_York", newYear)).toBe(2025);
  });

  it("retombe sur l'année UTC pour un fuseau invalide", () => {
    expect(currentYearInTimezone("Pas/Un-Fuseau", newYear)).toBe(2026);
  });
});

describe("runAutomationScenarios — orchestration", () => {
  const org = { id: ORG_ID, name: "Chez Momo", timezone: "Europe/Paris" };

  it("ne fait rien quand aucun scénario n'est activé", async () => {
    const { admin, rpcCalls } = fakeAdmin({ settings: [], org });
    const result = await runAutomationScenarios(admin, ORG_ID);
    expect(result.errors).toEqual([]);
    expect(result.counters.won_not_redeemed).toEqual({ targeted: 0, sent: 0 });
    expect(rpcCalls).toEqual([]);
  });

  it("won_not_redeemed : cible via la RPC, envoie et journalise wnr:{id}", async () => {
    const { admin, rpcCalls, emailLog } = fakeAdmin({
      settings: [
        { scenario: "won_not_redeemed", enabled: true, config: { minAgeHours: 72 } },
      ],
      org,
      campaign: { id: "camp-1" },
      qr: { slug: "SLUG" },
      rpc: (name) => {
        if (name === "automation_won_not_redeemed_targets") {
          return [
            {
              participation_id: "p-1",
              email: "a@ex.fr",
              first_name: "Alice",
              redeem_code: "GAIN-AAAA",
              redeem_expires_at: "2026-08-01T10:00:00Z",
              prize_label: "Café offert",
            },
            {
              participation_id: "p-2",
              email: "b@ex.fr",
              first_name: null,
              redeem_code: "GAIN-BBBB",
              redeem_expires_at: null,
              prize_label: null,
            },
          ];
        }
        return [];
      },
    });

    const result = await runAutomationScenarios(admin, ORG_ID);

    const call = rpcCalls.find(
      (c) => c.name === "automation_won_not_redeemed_targets",
    );
    expect(call?.args).toMatchObject({
      p_organization_id: ORG_ID,
      p_min_age_hours: 72,
    });
    expect(resendMock.sendWonNotRedeemedEmails).toHaveBeenCalledOnce();
    expect(result.counters.won_not_redeemed).toEqual({ targeted: 2, sent: 2 });
    expect(result.errors).toEqual([]);
    expect(emailLog.map((r) => r.dedup_key)).toEqual(["wnr:p-1", "wnr:p-2"]);
    expect(emailLog[0]).toMatchObject({
      organization_id: ORG_ID,
      scenario: "won_not_redeemed",
      recipient: "a@ex.fr",
      participation_id: "p-1",
    });
  });

  it("inactive : un email par jour maximum, palier le plus profond d'abord", async () => {
    const { admin, emailLog } = fakeAdmin({
      settings: [{ scenario: "inactive", enabled: true, config: { tiers: [30, 60] } }],
      org,
      subscribers: [
        { id: "s-a", email: "a@ex.fr" },
        { id: "s-b", email: "b@ex.fr" },
      ],
      rpc: (name, args) => {
        if (name !== "automation_inactive_targets") return [];
        // a@ex.fr inactif depuis 70 j : ressort aux deux paliers.
        return args.p_days === 60
          ? [{ email: "a@ex.fr", first_name: "Alice" }]
          : [
              { email: "a@ex.fr", first_name: "Alice" },
              { email: "b@ex.fr", first_name: null },
            ];
      },
    });

    const result = await runAutomationScenarios(admin, ORG_ID);

    // Deux paliers → deux lots, mais a@ex.fr n'est envoyé qu'au palier 60.
    expect(resendMock.sendInactiveEmails).toHaveBeenCalledTimes(2);
    const firstBatch = resendMock.sendInactiveEmails.mock.calls[0][0];
    expect(firstBatch.recipients.map((r: { email: string }) => r.email)).toEqual([
      "a@ex.fr",
    ]);
    const secondBatch = resendMock.sendInactiveEmails.mock.calls[1][0];
    expect(secondBatch.recipients.map((r: { email: string }) => r.email)).toEqual([
      "b@ex.fr",
    ]);
    expect(result.counters.inactive).toEqual({ targeted: 2, sent: 2 });
    expect(emailLog.map((r) => r.dedup_key).sort()).toEqual([
      "inactive:30:b@ex.fr",
      "inactive:60:a@ex.fr",
    ]);
  });

  it("post_redemption : saute les destinataires sans abonné (pas de désinscription possible)", async () => {
    const { admin, emailLog } = fakeAdmin({
      settings: [
        { scenario: "post_redemption", enabled: true, config: { delayHours: 24 } },
      ],
      org,
      subscribers: [{ id: "s-a", email: "a@ex.fr" }],
      rpc: (name) =>
        name === "automation_post_redemption_targets"
          ? [
              {
                participation_id: "p-1",
                email: "a@ex.fr",
                first_name: "Alice",
                prize_label: "Café offert",
              },
              {
                participation_id: "p-2",
                email: "inconnu@ex.fr",
                first_name: null,
                prize_label: null,
              },
            ]
          : [],
    });

    const result = await runAutomationScenarios(admin, ORG_ID);

    expect(resendMock.sendPostRedemptionEmails).toHaveBeenCalledOnce();
    const batch = resendMock.sendPostRedemptionEmails.mock.calls[0][0];
    expect(batch.recipients).toEqual([
      {
        email: "a@ex.fr",
        firstName: "Alice",
        prizeLabel: "Café offert",
        unsubscribeToken: "tok-s-a",
      },
    ]);
    expect(result.counters.post_redemption).toEqual({ targeted: 2, sent: 1 });
    expect(emailLog.map((r) => r.dedup_key)).toEqual(["postredeem:p-1"]);
  });

  it("birthday : clé birthday:{email}:{année} dans le fuseau de l'org", async () => {
    const { admin, emailLog } = fakeAdmin({
      settings: [{ scenario: "birthday", enabled: true, config: {} }],
      org,
      subscribers: [{ id: "s-a", email: "a@ex.fr" }],
      rpc: (name) =>
        name === "automation_birthday_targets"
          ? [{ email: "a@ex.fr", first_name: "Alice", birth_date: "1990-07-21" }]
          : [],
    });

    await runAutomationScenarios(admin, ORG_ID);

    const year = currentYearInTimezone("Europe/Paris");
    expect(resendMock.sendBirthdayEmails).toHaveBeenCalledOnce();
    expect(emailLog.map((r) => r.dedup_key)).toEqual([`birthday:a@ex.fr:${year}`]);
  });

  it("isole les pannes : un scénario en erreur n'empêche pas les autres", async () => {
    const { admin } = fakeAdmin({
      settings: [
        { scenario: "won_not_redeemed", enabled: true, config: {} },
        { scenario: "birthday", enabled: true, config: {} },
      ],
      org,
      subscribers: [{ id: "s-a", email: "a@ex.fr" }],
      rpc: (name) => {
        if (name === "automation_won_not_redeemed_targets") {
          throw new Error("RPC en panne");
        }
        return name === "automation_birthday_targets"
          ? [{ email: "a@ex.fr", first_name: null, birth_date: "1990-07-21" }]
          : [];
      },
    });

    const result = await runAutomationScenarios(admin, ORG_ID);

    expect(result.errors).toEqual(["won_not_redeemed: RPC en panne"]);
    expect(result.counters.birthday).toEqual({ targeted: 1, sent: 1 });
  });

  it("organisation disparue entre le dépôt et l'exécution : no-op", async () => {
    const { admin, rpcCalls } = fakeAdmin({
      settings: [{ scenario: "birthday", enabled: true, config: {} }],
      org: null,
    });
    const result = await runAutomationScenarios(admin, ORG_ID);
    expect(result.errors).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });
});

describe("processAutomationRunJob — mapping en JobOutcome", () => {
  it("payload sans organizationId → failed", async () => {
    const { admin } = fakeAdmin({});
    const outcome = await processAutomationRunJob(admin, job({}));
    expect(outcome).toEqual({ status: "failed", error: "payload sans organizationId" });
  });

  it("panne avant tout envoi → retry (email_log rend le rejeu sûr)", async () => {
    const { admin } = fakeAdmin({ settingsError: "base indisponible" });
    const outcome = await processAutomationRunJob(
      admin,
      job({ organizationId: ORG_ID }),
    );
    expect(outcome.status).toBe("retry");
  });

  it("tout envoyé sans erreur → completed", async () => {
    const { admin } = fakeAdmin({
      settings: [{ scenario: "birthday", enabled: true, config: {} }],
      org: { id: ORG_ID, name: "Chez Momo", timezone: "Europe/Paris" },
      subscribers: [{ id: "s-a", email: "a@ex.fr" }],
      rpc: (name) =>
        name === "automation_birthday_targets"
          ? [{ email: "a@ex.fr", first_name: null, birth_date: "1990-07-21" }]
          : [],
    });
    const outcome = await processAutomationRunJob(
      admin,
      job({ organizationId: ORG_ID }),
    );
    expect(outcome).toEqual({ status: "completed" });
  });
});

describe("processBudgetPausedJob — alerte budget au commerçant", () => {
  it("notifie le propriétaire avec les montants de la campagne", async () => {
    const { admin } = fakeAdmin({
      campaign: {
        id: "camp-1",
        name: "Jeu de l'été",
        budget_cents: 10_000,
        budget_spent_cents: 10_050,
      },
    });
    const outcome = await processBudgetPausedJob(
      admin,
      job({ campaignId: "camp-1", organizationId: ORG_ID }),
    );
    expect(outcome).toEqual({ status: "completed" });
    expect(resendMock.sendBudgetPausedEmail).toHaveBeenCalledWith({
      to: "patron@commerce.fr",
      campaignName: "Jeu de l'été",
      budgetCents: 10_000,
      spentCents: 10_050,
    });
  });

  it("campagne introuvable → failed, payload incomplet → failed", async () => {
    const { admin } = fakeAdmin({ campaign: null });
    expect(
      await processBudgetPausedJob(
        admin,
        job({ campaignId: "camp-x", organizationId: ORG_ID }),
      ),
    ).toEqual({ status: "failed", error: "campagne introuvable" });
    expect(await processBudgetPausedJob(admin, job({}))).toEqual({
      status: "failed",
      error: "payload incomplet",
    });
  });
});

describe("processLowStockJob — alerte stock au commerçant", () => {
  it("notifie quand le stock est toujours sous le seuil", async () => {
    const { admin } = fakeAdmin({
      prize: { id: "prize-1", label: "Café offert", stock: 2, low_stock_threshold: 3 },
    });
    const outcome = await processLowStockJob(
      admin,
      job({ prizeId: "prize-1", organizationId: ORG_ID }),
    );
    expect(outcome).toEqual({ status: "completed" });
    expect(resendMock.sendLowStockEmail).toHaveBeenCalledWith({
      to: "patron@commerce.fr",
      prizeLabel: "Café offert",
      stock: 2,
      threshold: 3,
    });
  });

  it("restocké entre le dépôt et l'exécution : plus d'alerte", async () => {
    const { admin } = fakeAdmin({
      prize: { id: "prize-1", label: "Café", stock: 50, low_stock_threshold: 3 },
    });
    const outcome = await processLowStockJob(
      admin,
      job({ prizeId: "prize-1", organizationId: ORG_ID }),
    );
    expect(outcome).toEqual({ status: "completed" });
    expect(resendMock.sendLowStockEmail).not.toHaveBeenCalled();
  });
});
