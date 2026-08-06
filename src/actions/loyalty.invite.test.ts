import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// invitationPasseport — l'invitation au Passeport proposée APRÈS un jeu.
//
// Ce que ces tests attestent, et qui est le contrat de sécurité de l'action :
//
//   · elle n'ÉCRIT jamais rien — pas de tampon, pas de passeport, pas de
//     cookie. Le lien qu'elle prépare mène à une page en lecture seule, donc
//     « un lien partagé n'ajoute JAMAIS de tampon » tient par CONSTRUCTION ;
//   · `organizationId` vient d'une prop CLIENT : les quatre refus (UUID
//     malformé, organisation inconnue, aucun programme actif, module fermé)
//     rendent le MÊME `null` — aucun oracle ne distingue une organisation qui
//     existe d'une qui n'existe pas ;
//   · la réponse est EXACTEMENT `{ programId, programName }`, jamais une clé de
//     plus : l'assertion porte sur `Object.keys`, pas sur les champs attendus,
//     sinon un futur `...row` passerait inaperçu ;
//   · la lecture est UNIQUE et bornée (`loadLoyaltyContext` engage jusqu'à cinq
//     requêtes ; il n'est pas appelé ici) et ne demande jamais `rotating_secret`
//     ni `min_stamp_interval_seconds` ;
//   · le seau de pression est sur clé PARTAGÉE (organisation + IP), donc
//     fail-OPEN : son dépassement alerte et laisse passer.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000aa";
const PROGRAM_ID = "00000000-0000-4000-8000-0000000000bb";

/** Organisation qui SERT le module : abonnement actif + add-on allumé. */
const ORG_SERVANTE = {
  id: ORG_ID,
  subscription_status: "active",
  trial_ends_at: null,
  past_due_since: null,
  addon_loyalty: true,
  comp_access: false,
  comp_access_until: null,
};

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    /** Ligne rendue par la requête `loyalty_programs` (null = aucun programme). */
    program: null as Record<string, unknown> | null,
    /** Octrois vivants rendus à `chargerOctroisVivants`. */
    grants: [] as Array<{ module: string }>,
    ip: "203.0.113.7",
    /** Chaînes de colonnes vues par chaque `select()`, table par table. */
    selects: [] as Array<{ table: string; columns: string }>,
    /** Filtres `.eq()` vus par la requête `loyalty_programs`. */
    programFilters: [] as Array<Record<string, unknown>>,
    /** Toute écriture tentée par l'action — doit rester vide. */
    writes: [] as string[],
    /** Compteurs de seaux, modèle fidèle de `check_rate_limit`. */
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    reset() {
      state.program = null;
      state.grants = [];
      state.ip = "203.0.113.7";
      state.selects = [];
      state.programFilters = [];
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
            if (table === "loyalty_programs") {
              state.programFilters.push({ ...filters });
              return Promise.resolve({ data: state.program, error: null });
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
      loyaltyInvite: { limit: 1200, windowSeconds: 600 },
      loyaltyStampIp: { limit: 1200, windowSeconds: 600 },
      loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
      loyaltyCheckinMember: { limit: 120, windowSeconds: 3600 },
      loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
      loyaltyPassportCreationBurst: { limit: 60, windowSeconds: 600 },
      loyaltyStaffPassportCreation: { limit: 120, windowSeconds: 3600 },
      loyaltyStaffKnownVisit: { limit: 120, windowSeconds: 3600 },
      loyaltyCounter: { limit: 60, windowSeconds: 60 },
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
vi.mock("@/lib/loyalty-context", () => ({
  loyaltyTokenCookieName: (id: string) => `lc-loyalty-${id}`,
  loadLoyaltyActionContext: () =>
    Promise.resolve({ ok: false, error: "indisponible" }),
}));
vi.mock("@/lib/spin", () => ({ signClaimToken: vi.fn() }));
vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "generated-token",
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: () => undefined, set: vi.fn() }),
  headers: () => Promise.resolve({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeAdmin()),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

import { invitationPasseport } from "./loyalty";

/** Programme actif servi par une organisation cohérente. */
function programmeActif(org: Record<string, unknown> = ORG_SERVANTE) {
  return {
    id: PROGRAM_ID,
    name: "Carte du Comptoir",
    organization_id: ORG_ID,
    organizations: org,
  };
}

beforeEach(() => {
  state.reset();
  reportSecurityEventMock.mockClear();
  reportErrorMock.mockClear();
});

describe("invitationPasseport — chemin nominal", () => {
  it("rend le programme actif de l'organisation", async () => {
    state.program = programmeActif();

    await expect(invitationPasseport({ organizationId: ORG_ID })).resolves.toEqual({
      programId: PROGRAM_ID,
      programName: "Carte du Comptoir",
    });
  });

  it("ne rend AUCUNE clé de plus que programId et programName", async () => {
    state.program = {
      ...programmeActif(),
      // Colonnes qu'un `select` trop large ramènerait un jour : elles ne
      // doivent pas ressortir, même présentes dans la ligne.
      rotating_secret: "SECRET",
      min_stamp_interval_seconds: 300,
      validation_mode: "rotating_code",
    };

    const invitation = await invitationPasseport({ organizationId: ORG_ID });
    expect(invitation).not.toBeNull();
    expect(Object.keys(invitation ?? {}).sort()).toEqual([
      "programId",
      "programName",
    ]);
  });

  it("ne lit qu'une ligne, bornée aux colonnes publiques", async () => {
    state.program = programmeActif();
    await invitationPasseport({ organizationId: ORG_ID });

    const lectures = state.selects.filter(
      (s) => s.table === "loyalty_programs",
    );
    expect(lectures).toHaveLength(1);
    expect(lectures[0].columns).not.toContain("rotating_secret");
    expect(lectures[0].columns).not.toContain("min_stamp_interval_seconds");
    // Le programme n'est cherché QUE dans l'organisation demandée, et
    // seulement s'il est actif : la garde multi-tenant est dans le prédicat.
    expect(state.programFilters[0]).toEqual({
      organization_id: ORG_ID,
      status: "active",
    });
  });

  it("n'écrit rien — ni tampon, ni passeport, ni RPC", async () => {
    state.program = programmeActif();
    await invitationPasseport({ organizationId: ORG_ID });
    expect(state.writes).toEqual([]);
  });
});

describe("invitationPasseport — refus, tous indiscernables", () => {
  it("UUID invalide : null, et aucune requête n'est même tentée", async () => {
    state.program = programmeActif();

    await expect(
      invitationPasseport({ organizationId: "pas-un-uuid" }),
    ).resolves.toBeNull();
    expect(state.selects).toEqual([]);
    expect(state.rateLimitCalls).toEqual([]);
  });

  it("aucun programme actif : null", async () => {
    state.program = null;
    await expect(
      invitationPasseport({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  it("module fermé (abonnement échu, add-on éteint, aucun octroi) : null", async () => {
    state.program = programmeActif({
      ...ORG_SERVANTE,
      subscription_status: "canceled",
      addon_loyalty: false,
    });
    state.grants = [];

    await expect(
      invitationPasseport({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  it("module fermé côté abonnement mais OUVERT par un octroi vivant : rendu", async () => {
    // Le droit effectif est un OU (cf. `moduleOuvertAuJoueur`) : un add-on
    // acheté seul ouvre le module sans abonnement. Sans ce cas, un refus
    // erroné passerait pour la bonne réponse dans le test précédent.
    state.program = programmeActif({
      ...ORG_SERVANTE,
      subscription_status: "canceled",
      addon_loyalty: false,
    });
    state.grants = [{ module: "loyalty" }];

    await expect(invitationPasseport({ organizationId: ORG_ID })).resolves.toEqual({
      programId: PROGRAM_ID,
      programName: "Carte du Comptoir",
    });
  });

  it("organisation incohérente avec le programme (service_role sans RLS) : null", async () => {
    state.program = programmeActif({
      ...ORG_SERVANTE,
      id: "00000000-0000-4000-8000-0000000000cc",
    });

    await expect(
      invitationPasseport({ organizationId: ORG_ID }),
    ).resolves.toBeNull();
  });

  it("organisation INCONNUE et organisation SANS programme rendent le même null", async () => {
    // Le mock ne distingue pas les deux cas parce que l'action ne les
    // distingue pas non plus : elle ne demande jamais « cette organisation
    // existe-t-elle ? ». C'est ce qui interdit le balayage d'UUID.
    state.program = null;
    const inconnue = await invitationPasseport({
      organizationId: "00000000-0000-4000-8000-0000000000ff",
    });
    const sansProgramme = await invitationPasseport({ organizationId: ORG_ID });

    expect(inconnue).toBeNull();
    expect(sansProgramme).toEqual(inconnue);
  });
});

describe("invitationPasseport — pression sur clé partagée", () => {
  it("compte la pression par organisation et IP, AVANT toute requête", async () => {
    state.program = programmeActif();
    await invitationPasseport({ organizationId: ORG_ID });

    expect(state.rateLimitCalls).toEqual([
      `loyalty:invite:ip:${ORG_ID}:203.0.113.7`,
    ]);
  });

  it("fail-OPEN : au-delà du seuil, on alerte et on sert quand même", async () => {
    state.program = programmeActif();
    const bucket = `loyalty:invite:ip:${ORG_ID}:203.0.113.7`;
    state.counters.set(bucket, 1200);

    await expect(invitationPasseport({ organizationId: ORG_ID })).resolves.toEqual({
      programId: PROGRAM_ID,
      programName: "Carte du Comptoir",
    });
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "loyalty_invite_pressure",
      expect.objectContaining({ bucket, organization_id: ORG_ID }),
    );
  });
});
