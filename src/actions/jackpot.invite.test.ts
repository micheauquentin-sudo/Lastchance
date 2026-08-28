import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// invitationJackpot — l'invitation à REJOINDRE le jackpot collectif, proposée
// par un autre module (bas du calendrier, panneau de fin de partie).
//
// Ce que ces tests attestent, et qui est le contrat de sécurité de l'action —
// calqué sur `loyalty.invite.test.ts`, dont elle est le jumeau :
//
//   · elle n'ÉCRIT jamais rien — pas de participation, pas de cookie, pas un
//     cran de jauge. Le lien qu'elle prépare mène à une page qui exige
//     toujours le code tournant ou la caisse : rejoindre par ce chemin ne
//     contourne RIEN de l'anti-triche ;
//   · `organizationId` vient d'une prop CLIENT : les refus (UUID malformé,
//     organisation inconnue, aucune campagne active, module fermé, campagne
//     sans adresse publique) rendent le MÊME `null` — aucun oracle ne
//     distingue une organisation qui existe d'une qui n'existe pas ;
//   · la réponse est EXACTEMENT `{ publicSlug, campaignName }`, jamais une clé
//     de plus : l'assertion porte sur `Object.keys`, sinon un futur `...row`
//     passerait inaperçu — et `rotating_secret` comme `win_probability` ne
//     doivent JAMAIS quitter le serveur ;
//   · la lecture est UNIQUE et bornée (`loadJackpotContext` engage la jauge et
//     l'état du joueur ; il n'est pas appelé ici) ;
//   · le seau de pression est sur clé PARTAGÉE (organisation + IP), donc
//     fail-OPEN — ADR-032 : son dépassement alerte et laisse passer.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000aa";
const CAMPAIGN_ID = "00000000-0000-4000-8000-0000000000bb";

/** Organisation qui SERT le module : abonnement actif + add-on allumé. */
const ORG_SERVANTE = {
  id: ORG_ID,
  subscription_status: "active",
  trial_ends_at: null,
  past_due_since: null,
  addon_jackpot: true,
  comp_access: false,
  comp_access_until: null,
};

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    /** Ligne rendue par la requête `jackpot_campaigns` (null = aucune campagne). */
    campaign: null as Record<string, unknown> | null,
    /** Octrois vivants rendus à `chargerOctroisVivants`. */
    grants: [] as Array<{ module: string }>,
    ip: "203.0.113.7",
    /** Chaînes de colonnes vues par chaque `select()`, table par table. */
    selects: [] as Array<{ table: string; columns: string }>,
    /** Filtres `.eq()` vus par la requête `jackpot_campaigns`. */
    campaignFilters: [] as Array<Record<string, unknown>>,
    /** Toute écriture tentée par l'action — doit rester vide. */
    writes: [] as string[],
    /** Compteurs de seaux, modèle fidèle de `check_rate_limit`. */
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    reset() {
      state.campaign = null;
      state.grants = [];
      state.ip = "203.0.113.7";
      state.selects = [];
      state.campaignFilters = [];
      state.writes = [];
      state.counters = new Map();
      state.rateLimitCalls = [];
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string) => {
        state.writes.push(`rpc:${name}`);
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: (columns: string) => {
            state.selects.push({ table, columns });
            return builder;
          },
          insert: () => {
            state.writes.push(`insert:${table}`);
            return builder;
          },
          update: () => {
            state.writes.push(`update:${table}`);
            return builder;
          },
          delete: () => {
            state.writes.push(`delete:${table}`);
            return builder;
          },
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          is: () => builder,
          not: () => builder,
          lte: () => builder,
          or: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => {
            if (table === "jackpot_campaigns") {
              state.campaignFilters.push({ ...filters });
              return Promise.resolve({ data: state.campaign, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          // Les requêtes sans `maybeSingle` (le chargeur d'octrois) sont
          // attendues telles quelles.
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) =>
            Promise.resolve({
              data:
                table === "organization_module_grants" ? state.grants : null,
              error: null,
            }).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin };
});

const { reportSecurityEventMock, reportErrorMock } = vi.hoisted(() => ({
  reportSecurityEventMock:
    vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => {
  const rateLimit = (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    return Promise.resolve(next <= rule.limit);
  };
  return {
    rateLimit,
    rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
    observeSharedKey: async (
      bucket: string,
      rule: { limit: number; windowSeconds: number },
      event: string,
      extra: Record<string, unknown> = {},
    ) => {
      if (!(await rateLimit(bucket, rule))) {
        reportSecurityEventMock(event, {
          ...extra,
          bucket,
          limit: rule.limit,
          window_seconds: rule.windowSeconds,
        });
      }
    },
    // Valeurs RÉELLES de src/lib/rate-limit.ts (épinglées par rate-limit.test.ts).
    RATE_LIMITS: {
      jackpotInvite: { limit: 1200, windowSeconds: 600 },
      jackpotParticipateIp: { limit: 1200, windowSeconds: 600 },
      jackpotParticipateMember: { limit: 30, windowSeconds: 3600 },
      jackpotParticipateCodeMember: { limit: 6, windowSeconds: 300 },
      jackpotCheckinMember: { limit: 120, windowSeconds: 3600 },
      jackpotNewPlayerBurst: { limit: 60, windowSeconds: 600 },
      jackpotStaffPlayerCreation: { limit: 120, windowSeconds: 3600 },
      jackpotCounter: { limit: 60, windowSeconds: 60 },
      jackpotStateIp: { limit: 1200, windowSeconds: 600 },
      cashier: { limit: 30, windowSeconds: 60 },
    },
  };
});

vi.mock("@/lib/monitoring", () => ({
  recordCounter: vi.fn(),
  monitored: vi.fn((_name: string, fn: () => unknown) => fn()),
  reportError: reportErrorMock,
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/request-ip", async (importOriginal) => ({
  // Le module RÉEL est conservé : `observerPressionIp` doit s'exécuter pour
  // vrai, sinon le test ne prouverait plus rien du seau qu'il observe.
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: () => state.ip,
}));

// `moduleOuvertAuJoueur` n'est PAS mocké : la garde du module s'exécute pour
// de vrai (droit effectif + chargeur d'octrois), c'est elle qu'on éprouve.
vi.mock("@/lib/jackpot-context", () => ({
  jackpotTokenCookieName: (id: string) => `lc-jackpot-${id}`,
  loadJackpotActionContext: () => Promise.resolve({ ok: false }),
  loadJackpotGauge: () => Promise.resolve(null),
}));
vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "generated-token",
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
  headers: () => Promise.resolve({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeAdmin()),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

import { invitationJackpot } from "./jackpot";

/** Campagne active servie par une organisation cohérente. */
function campagneActive(org: Record<string, unknown> = ORG_SERVANTE) {
  return {
    id: CAMPAIGN_ID,
    name: "Cagnotte de Noël",
    public_slug: "cagnotte-de-noel",
    organization_id: ORG_ID,
    organizations: org,
  };
}

beforeEach(() => {
  state.reset();
  reportSecurityEventMock.mockClear();
  reportErrorMock.mockClear();
});

describe("invitationJackpot — chemin nominal", () => {
  it("rend la campagne active de l'organisation", async () => {
    state.campaign = campagneActive();

    await expect(invitationJackpot({ organizationId: ORG_ID })).resolves.toEqual({
      publicSlug: "cagnotte-de-noel",
      campaignName: "Cagnotte de Noël",
    });
  });

  it("ne rend AUCUNE clé de plus que publicSlug et campaignName", async () => {
    state.campaign = {
      ...campagneActive(),
      // Colonnes qu'un `select` trop large ramènerait un jour. Les deux
      // premières ne doivent JAMAIS quitter le serveur : le secret du code
      // tournant et la probabilité de gain sont le cœur de l'anti-triche.
      rotating_secret: "SECRET",
      win_probability: 0.02,
      current_count: 41,
      threshold: 100,
    };

    const invitation = await invitationJackpot({ organizationId: ORG_ID });
    expect(invitation).not.toBeNull();
    expect(Object.keys(invitation ?? {}).sort()).toEqual([
      "campaignName",
      "publicSlug",
    ]);
  });

  it("ne lit qu'une ligne, bornée aux colonnes publiques", async () => {
    state.campaign = campagneActive();
    await invitationJackpot({ organizationId: ORG_ID });

    const lectures = state.selects.filter(
      (s) => s.table === "jackpot_campaigns",
    );
    expect(lectures).toHaveLength(1);
    expect(lectures[0].columns).not.toContain("rotating_secret");
    expect(lectures[0].columns).not.toContain("win_probability");
    // La campagne n'est cherchée QUE dans l'organisation demandée, et
    // seulement si elle est active : la garde multi-tenant est dans le prédicat.
    expect(state.campaignFilters[0]).toEqual({
      organization_id: ORG_ID,
      status: "active",
    });
  });

  it("n'écrit rien — aucune participation, aucun cran de jauge, aucune RPC", async () => {
    state.campaign = campagneActive();
    await invitationJackpot({ organizationId: ORG_ID });
    expect(state.writes).toEqual([]);
  });
});

describe("invitationJackpot — refus, tous indiscernables", () => {
  it("UUID invalide : null, et aucune requête n'est même tentée", async () => {
    state.campaign = campagneActive();

    await expect(
      invitationJackpot({ organizationId: "pas-un-uuid" }),
    ).resolves.toBeNull();
    expect(state.selects).toEqual([]);
    expect(state.rateLimitCalls).toEqual([]);
  });

  it("aucune campagne active : null", async () => {
    state.campaign = null;
    await expect(
      invitationJackpot({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  it("module fermé (abonnement échu, add-on éteint, aucun octroi) : null", async () => {
    state.campaign = campagneActive({
      ...ORG_SERVANTE,
      subscription_status: "canceled",
      addon_jackpot: false,
    });
    state.grants = [];

    await expect(
      invitationJackpot({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  it("module fermé côté abonnement mais OUVERT par un octroi vivant : rendu", async () => {
    // Le droit effectif est un OU (cf. `moduleOuvertAuJoueur`) : un add-on
    // acheté seul ouvre le module sans abonnement. Sans ce cas, un refus
    // erroné passerait pour la bonne réponse dans le test précédent.
    state.campaign = campagneActive({
      ...ORG_SERVANTE,
      subscription_status: "canceled",
      addon_jackpot: false,
    });
    state.grants = [{ module: "jackpot" }];

    await expect(invitationJackpot({ organizationId: ORG_ID })).resolves.toEqual({
      publicSlug: "cagnotte-de-noel",
      campaignName: "Cagnotte de Noël",
    });
  });

  it("organisation incohérente avec la campagne (service_role sans RLS) : null", async () => {
    state.campaign = campagneActive({
      ...ORG_SERVANTE,
      id: "00000000-0000-4000-8000-0000000000cc",
    });

    await expect(
      invitationJackpot({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  /**
   * Le slug est posé par trigger à la création : son absence signale une ligne
   * anormale. On NE retombe PAS sur l'UUID — ce serait proposer une adresse
   * qu'aucun QR ni aucune affiche ne porte, et donc un lien que le commerçant
   * ne reconnaîtrait pas dans ses mesures.
   */
  it("campagne sans adresse publique : null, pas un lien en UUID", async () => {
    state.campaign = { ...campagneActive(), public_slug: null };

    const invitation = await invitationJackpot({ organizationId: ORG_ID });
    expect(invitation).toBeNull();
  });

  it("organisation INCONNUE et organisation SANS campagne rendent le même null", async () => {
    // Le mock ne distingue pas les deux cas parce que l'action ne les
    // distingue pas non plus : elle ne demande jamais « cette organisation
    // existe-t-elle ? ». C'est ce qui interdit le balayage d'UUID.
    state.campaign = null;
    const inconnue = await invitationJackpot({
      organizationId: "00000000-0000-4000-8000-0000000000ff",
    });
    const sansCampagne = await invitationJackpot({ organizationId: ORG_ID });

    expect(inconnue).toBeNull();
    expect(sansCampagne).toEqual(inconnue);
  });
});

describe("invitationJackpot — pression sur clé partagée", () => {
  it("compte la pression par organisation et IP, AVANT toute requête", async () => {
    state.campaign = campagneActive();
    await invitationJackpot({ organizationId: ORG_ID });

    expect(state.rateLimitCalls).toEqual([
      `jackpot:invite:ip:${ORG_ID}:203.0.113.7`,
    ]);
  });

  it("fail-OPEN : au-delà du seuil, on alerte et on sert quand même", async () => {
    // ADR-032 : un seau `failClosed` sur une clé partagée serait un
    // interrupteur qu'un tiers allume en le saturant.
    state.campaign = campagneActive();
    const bucket = `jackpot:invite:ip:${ORG_ID}:203.0.113.7`;
    state.counters.set(bucket, 1200);

    await expect(invitationJackpot({ organizationId: ORG_ID })).resolves.toEqual({
      publicSlug: "cagnotte-de-noel",
      campaignName: "Cagnotte de Noël",
    });
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "jackpot_invite_pressure",
      expect.objectContaining({ bucket, organization_id: ORG_ID }),
    );
  });
});
