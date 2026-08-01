// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * Le rapport du lundi — orchestration.
 *
 * Quatre propriétés, par ordre de ce qu'elles coûtent si elles manquent :
 *   1. le filtre d'opt-out (sans lui, le réglage est décoratif) ;
 *   2. le tri des MONTANTS par rôle (la base ne peut plus le faire : le cron
 *      appelle en service_role) ;
 *   3. le seuil de semaine vide (un « 0 / 0 » chaque lundi tue l'e-mail) ;
 *   4. l'anti-doublon (une répétition fait signaler l'e-mail comme spam).
 * ════════════════════════════════════════════════════════════ */

const mocks = vi.hoisted(() => ({
  isResendConfigured: vi.fn((): boolean => true),
  sendWeeklyDigestEmails: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({
  isResendConfigured: () => mocks.isResendConfigured(),
  sendWeeklyDigestEmails: (...a: unknown[]) => mocks.sendWeeklyDigestEmails(...a),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...a: unknown[]) => mocks.reportError(...a),
}));

import {
  DIGEST_RECIPIENT_ROLES,
  digestForRole,
  digestIsWorthSending,
  isoWeekKey,
  parseWeeklyDigest,
  roleSeesAmounts,
  runWeeklyDigest,
  weeklyDigestDedupKey,
  type WeeklyDigestStats,
} from "./weekly-digest";
import type { MemberRole } from "@/types/database";

// ── Faux client admin ────────────────────────────────────────────────

interface DigestRow {
  period_days?: number;
  players: number;
  rewards_issued: number;
  rewards_redeemed: number;
  basket_cents: number | null;
  prev_players: number;
  prev_rewards_issued: number;
  prev_rewards_redeemed: number;
  prev_basket_cents: number | null;
  top_rewards: unknown;
}

function digestRow(over: Partial<DigestRow> = {}): DigestRow {
  return {
    period_days: 7,
    players: 34,
    rewards_issued: 40,
    rewards_redeemed: 25,
    basket_cents: 123_45,
    prev_players: 22,
    prev_rewards_issued: 40,
    prev_rewards_redeemed: 34,
    prev_basket_cents: 90_00,
    top_rewards: [{ label: "Café offert", count: 12 }],
    ...over,
  };
}

interface AdminOptions {
  orgs?: Array<{ id: string; name: string }>;
  orgCount?: number;
  orgsError?: { message: string } | null;
  digests?: Record<string, DigestRow | { error: string }>;
  members?: Record<string, Array<{ user_id: string; role: MemberRole }>>;
  users?: Record<string, string>;
  /** Adresses RÉELLEMENT réservées ; `null` = toutes (cas nominal). */
  reserved?: string[] | null;
  logError?: { message: string } | null;
}

function makeAdmin(options: AdminOptions = {}) {
  const spy = {
    orgFilters: {} as Record<string, unknown>,
    orgLimit: null as number | null,
    memberIn: null as { column: string; values: unknown } | null,
    upserted: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    fromCalls: [] as string[],
  };

  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      spy.rpcCalls.push({ name, args });
      const entry = options.digests?.[String(args.p_organization_id)];
      if (!entry) return Promise.resolve({ data: [], error: null });
      if ("error" in entry) {
        return Promise.resolve({ data: null, error: { message: entry.error } });
      }
      return Promise.resolve({ data: [entry], error: null });
    },
    auth: {
      admin: {
        getUserById: (userId: string) => {
          const email = options.users?.[userId];
          return Promise.resolve(
            email
              ? { data: { user: { email } }, error: null }
              : { data: { user: null }, error: { message: "introuvable" } },
          );
        },
      },
    },
    from: (table: string) => {
      spy.fromCalls.push(table);

      if (table === "organizations") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            spy.orgFilters[column] = value;
            return builder;
          },
          order: () => builder,
          limit: (n: number) => {
            spy.orgLimit = n;
            const orgs = options.orgs ?? [];
            return Promise.resolve(
              options.orgsError
                ? { data: null, count: null, error: options.orgsError }
                : {
                    data: orgs.slice(0, n),
                    count: options.orgCount ?? orgs.length,
                    error: null,
                  },
            );
          },
        };
        return builder;
      }

      if (table === "organization_members") {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          in: (column: string, values: unknown) => {
            spy.memberIn = { column, values };
            return builder;
          },
          order: () => builder,
          limit: () =>
            Promise.resolve({
              data: options.members?.[String(filters.organization_id)] ?? [],
              error: null,
            }),
        };
        return builder;
      }

      if (table === "email_log") {
        return {
          upsert: (rows: Array<Record<string, unknown>>) => {
            spy.upserted.push(...rows);
            return {
              select: () =>
                Promise.resolve(
                  options.logError
                    ? { data: null, error: options.logError }
                    : {
                        data: rows
                          .filter(
                            (r) =>
                              options.reserved === undefined ||
                              options.reserved === null ||
                              options.reserved.includes(String(r.recipient)),
                          )
                          .map((r) => ({ recipient: r.recipient })),
                        error: null,
                      },
                ),
            };
          },
        };
      }

      throw new Error(`table inattendue: ${table}`);
    },
  };

  return {
    spy,
    admin: admin as unknown as Parameters<typeof runWeeklyDigest>[0],
  };
}

/** Le cas nominal : une organisation active, un propriétaire. */
function nominal(over: Partial<AdminOptions> = {}) {
  return makeAdmin({
    orgs: [{ id: "org-1", name: "Chez Marco" }],
    digests: { "org-1": digestRow() },
    members: { "org-1": [{ user_id: "user-1", role: "owner" }] },
    users: { "user-1": "patron@commerce.fr" },
    ...over,
  });
}

/** Destinataires réellement composés, avec leurs statistiques. */
function outbox() {
  const call = mocks.sendWeeklyDigestEmails.mock.calls[0]?.[0] as
    | { recipients: Array<{ email: string; stats: WeeklyDigestStats }> }
    | undefined;
  return call?.recipients ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isResendConfigured.mockReturnValue(true);
  mocks.sendWeeklyDigestEmails.mockImplementation(
    async (p: { recipients: unknown[] }) => ({
      sent: p.recipients.length,
      sentEmails: [],
    }),
  );
});

// ── 1. L'opt-out ─────────────────────────────────────────────────────

describe("PROPRIÉTÉ 1 — le réglage n'est pas décoratif", () => {
  it("seules les organisations `weekly_digest = true` sont lues", async () => {
    const { admin, spy } = nominal();

    await runWeeklyDigest(admin);

    expect(spy.orgFilters).toEqual({ weekly_digest: true });
    expect(spy.orgLimit).toBeGreaterThan(0);
  });
});

// ── 2. Les montants ──────────────────────────────────────────────────

describe("PROPRIÉTÉ 2 — les montants, et qui y a droit", () => {
  it("UN CAISSIER NE REÇOIT AUCUN MONTANT dans le rapport", async () => {
    // Seconde ligne de défense : même devenu destinataire par un
    // élargissement futur de la liste, un caissier n'obtient pas la marge.
    const { admin } = nominal({
      members: { "org-1": [{ user_id: "user-1", role: "cashier" }] },
    });

    await runWeeklyDigest(admin);

    const [recipient] = outbox();
    expect(recipient.stats.basketCents).toBeNull();
    expect(recipient.stats.prevBasketCents).toBeNull();
    // Les volumes, eux, partent bien : ce n'est pas un e-mail vide.
    expect(recipient.stats.players).toBe(34);
  });

  it("TÉMOIN — un propriétaire les reçoit", async () => {
    const { admin } = nominal();

    await runWeeklyDigest(admin);

    expect(outbox()[0].stats.basketCents).toBe(123_45);
    expect(outbox()[0].stats.prevBasketCents).toBe(90_00);
  });

  it("PREMIÈRE ligne de défense : seul le titulaire du compte est adressé", async () => {
    const { admin, spy } = nominal();

    await runWeeklyDigest(admin);

    // Un caissier n'est donc pas seulement privé de montants : il ne reçoit
    // rien du tout tant que cette liste ne contient que `owner`.
    expect(spy.memberIn).toEqual({ column: "role", values: ["owner"] });
    expect(DIGEST_RECIPIENT_ROLES).toEqual(["owner"]);
  });

  it("le tri se fait PAR DESTINATAIRE, pas par organisation", async () => {
    // Deux lecteurs d'une même organisation n'ont pas les mêmes droits : un
    // tri par organisation servirait la marge au moins-disant.
    const { admin } = nominal({
      members: {
        "org-1": [
          { user_id: "user-1", role: "owner" },
          { user_id: "user-2", role: "cashier" },
        ],
      },
      users: { "user-1": "patron@commerce.fr", "user-2": "caisse@commerce.fr" },
    });

    await runWeeklyDigest(admin);

    const byEmail = Object.fromEntries(
      outbox().map((r) => [r.email, r.stats.basketCents]),
    );
    expect(byEmail).toEqual({
      "patron@commerce.fr": 123_45,
      "caisse@commerce.fr": null,
    });
  });

  it("`digestForRole` NULLifie hors éditeur, et ne met jamais 0", () => {
    const stats = parseWeeklyDigest(digestRow()) as WeeklyDigestStats;

    expect(roleSeesAmounts("owner")).toBe(true);
    expect(roleSeesAmounts("editor")).toBe(true);
    expect(roleSeesAmounts("cashier")).toBe(false);
    expect(digestForRole(stats, "editor").basketCents).toBe(123_45);
    // `null` et non `0` : un zéro se lirait comme une semaine sans chiffre
    // d'affaires, alors que c'est une absence de droit.
    expect(digestForRole(stats, "cashier").basketCents).toBeNull();
  });
});

// ── 3. Le seuil ──────────────────────────────────────────────────────

describe("PROPRIÉTÉ 3 — une semaine vide ne part pas", () => {
  const vide = digestRow({
    players: 0,
    rewards_issued: 0,
    rewards_redeemed: 0,
    basket_cents: 0,
    prev_players: 0,
    prev_rewards_issued: 0,
    prev_rewards_redeemed: 0,
    prev_basket_cents: 0,
    top_rewards: [],
  });

  it("deux semaines vides d'affilée : aucun e-mail", async () => {
    const { admin } = nominal({ digests: { "org-1": vide } });

    const counters = await runWeeklyDigest(admin);

    expect(mocks.sendWeeklyDigestEmails).not.toHaveBeenCalled();
    expect(counters).toMatchObject({ skipped_empty: 1, sent: 0 });
  });

  it("la CHUTE à zéro, elle, part : c'est l'alerte la plus utile de l'année", async () => {
    // La campagne s'est arrêtée, le QR a été décollé. Se taire au motif que
    // le rapport est « vide » reviendrait à ne prévenir de rien au moment où
    // il faut prévenir.
    const { admin } = nominal({
      digests: { "org-1": { ...vide, prev_players: 22, prev_rewards_issued: 40 } },
    });

    const counters = await runWeeklyDigest(admin);

    expect(counters.sent).toBe(1);
    expect(outbox()[0].stats.players).toBe(0);
  });

  it("la règle est AUTO-LIMITANTE : jamais deux rapports vides d'affilée", () => {
    // Le lundi suivant, la période précédente est vide elle aussi.
    const chute = parseWeeklyDigest({
      ...vide,
      prev_players: 22,
    }) as WeeklyDigestStats;
    const suivant = parseWeeklyDigest(vide) as WeeklyDigestStats;

    expect(digestIsWorthSending(chute)).toBe(true);
    expect(digestIsWorthSending(suivant)).toBe(false);
  });

  it("le seuil ne dépend PAS des montants, donc pas du rôle du lecteur", () => {
    // Sinon un caissier et un propriétaire recevraient des semaines
    // différentes de la même organisation.
    const stats = parseWeeklyDigest(vide) as WeeklyDigestStats;
    const avecPanier = { ...stats, basketCents: 500_00, prevBasketCents: 400_00 };

    expect(digestIsWorthSending(avecPanier)).toBe(false);
    expect(digestIsWorthSending(digestForRole(avecPanier, "cashier"))).toBe(false);
  });

  it("un seul lot remis suffit à faire partir le rapport", () => {
    const stats = parseWeeklyDigest({ ...vide, rewards_redeemed: 1 });
    expect(digestIsWorthSending(stats as WeeklyDigestStats)).toBe(true);
  });
});

// ── 4. L'anti-doublon ────────────────────────────────────────────────

describe("PROPRIÉTÉ 4 — un rapport par organisation et par semaine", () => {
  it("réserve avant d'envoyer, une ligne par destinataire", async () => {
    const { admin, spy } = nominal();

    await runWeeklyDigest(admin, new Date("2026-08-03T08:00:00Z"));

    expect(spy.upserted).toEqual([
      {
        organization_id: "org-1",
        scenario: "weekly_digest",
        recipient: "patron@commerce.fr",
        participation_id: null,
        dedup_key: weeklyDigestDedupKey(
          "org-1",
          "2026-W32",
          "patron@commerce.fr",
        ),
      },
    ]);
  });

  it("un second passage la même semaine n'envoie rien", async () => {
    // La base ne réinsère rien (dedup_key unique) : `reserved` vide.
    const { admin } = nominal({ reserved: [] });

    const counters = await runWeeklyDigest(admin);

    expect(mocks.sendWeeklyDigestEmails).not.toHaveBeenCalled();
    expect(counters).toMatchObject({ skipped_already_sent: 1, sent: 0 });
  });

  it("journal indisponible : on n'envoie pas — sans anti-doublon fiable, se taire", async () => {
    const { admin } = nominal({ logError: { message: "deadlock" } });

    const counters = await runWeeklyDigest(admin);

    expect(mocks.sendWeeklyDigestEmails).not.toHaveBeenCalled();
    expect(counters.sent).toBe(0);
  });

  it("la clé de période est la semaine ISO, pas le jour", () => {
    // Un rejeu manuel le mardi doit retomber sur la même clé que le lundi.
    expect(isoWeekKey(new Date("2026-08-03T08:00:00Z"))).toBe("2026-W32");
    expect(isoWeekKey(new Date("2026-08-04T23:59:00Z"))).toBe("2026-W32");
    expect(isoWeekKey(new Date("2026-08-10T00:00:00Z"))).toBe("2026-W33");
    // Bord d'année ISO : le 1ᵉʳ janvier 2027 est un vendredi, semaine 53 de 2026.
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });
});

// ── Robustesse ───────────────────────────────────────────────────────

describe("robustesse et bornage", () => {
  it("Resend non configuré : RIEN n'est ouvert ni réservé", async () => {
    // Réserver puis ne pas pouvoir envoyer consommerait la semaine en silence.
    mocks.isResendConfigured.mockReturnValue(false);
    const { admin, spy } = nominal();

    const counters = await runWeeklyDigest(admin);

    expect(spy.fromCalls).toEqual([]);
    expect(counters.not_configured).toBe(1);
  });

  it("une organisation en échec n'arrête pas les autres, et une seule remontée", async () => {
    const { admin } = makeAdmin({
      orgs: [
        { id: "org-1", name: "Chez Marco" },
        { id: "org-2", name: "Chez Lisa" },
      ],
      digests: {
        "org-1": { error: "statement timeout" },
        "org-2": digestRow(),
      },
      members: { "org-2": [{ user_id: "user-2", role: "owner" }] },
      users: { "user-2": "lisa@commerce.fr" },
    });

    const counters = await runWeeklyDigest(admin);

    expect(counters).toMatchObject({ digest_failed: 1, sent: 1 });
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
  });

  it("aucun destinataire résoluble : compté, jamais envoyé dans le vide", async () => {
    const { admin } = nominal({ users: {} });

    const counters = await runWeeklyDigest(admin);

    expect(counters).toMatchObject({ skipped_no_recipient: 1, sent: 0 });
    expect(mocks.sendWeeklyDigestEmails).not.toHaveBeenCalled();
  });

  it("le plafond du lot est publié en `deferred`, jamais silencieux", async () => {
    const { admin } = makeAdmin({
      orgs: Array.from({ length: 200 }, (_, i) => ({
        id: `org-${i}`,
        name: `Commerce ${i}`,
      })),
      orgCount: 250,
    });

    const counters = await runWeeklyDigest(admin);

    expect(counters.organizations).toBe(200);
    expect(counters.deferred).toBe(50);
  });

  it("lecture des organisations impossible : la route doit le savoir", async () => {
    const { admin } = makeAdmin({ orgsError: { message: "connection reset" } });

    await expect(runWeeklyDigest(admin)).rejects.toThrow();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("une agrégation abîmée ne fait pas tomber le passage", async () => {
    const { admin } = nominal({
      digests: { "org-1": digestRow({ top_rewards: "pas un tableau" }) },
    });

    const counters = await runWeeklyDigest(admin);

    expect(counters.sent).toBe(1);
    expect(outbox()[0].stats.topRewards).toEqual([]);
  });
});

describe("discrétion", () => {
  it("les compteurs ne portent ni destinataire, ni identifiant, ni libellé", async () => {
    const { admin } = makeAdmin({
      orgs: [{ id: "org-secrete", name: "Chez Marco" }],
      digests: {
        "org-secrete": digestRow({ top_rewards: [{ label: "Café", count: 1 }] }),
      },
      members: { "org-secrete": [{ user_id: "user-1", role: "owner" }] },
      users: { "user-1": "patron@commerce.fr" },
    });

    const counters = await runWeeklyDigest(admin);
    const trace = JSON.stringify(counters);

    expect(trace).not.toContain("org-secrete");
    expect(trace).not.toContain("patron@commerce.fr");
    expect(trace).not.toContain("Café");
    expect(Object.values(counters).every((v) => typeof v === "number")).toBe(true);
  });
});
