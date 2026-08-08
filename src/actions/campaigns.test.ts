import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions de campagne — deux gardes, deux défauts fermés
//
//   1. LE REFUS D'ACTIVATION NOMME LA BONNE CAUSE. `hasActiveAccess` répond
//      « non » pour quatre vécus distincts (essai expiré, résiliation, compte
//      inactif, impayé hors grâce) ; le texte du refus était écrit en dur sur
//      un seul et annonçait « votre essai gratuit est terminé » à un client
//      qui a payé puis résilié — pendant que le bandeau du MÊME écran disait
//      correctement « votre abonnement est inactif ».
//
//   2. LA DUPLICATION EMPORTE LE PLAFOND DE DÉPENSE. `budget_cents` était omis
//      de l'insert et la colonne est nullable : la copie naissait sans plafond
//      et la pause automatique « budget atteint », que le commerçant croit
//      héritée, ne se serait jamais déclenchée.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
const CAMPAIGN_ID = "00000000-0000-4000-8000-0000000000c1";

interface DbCall {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: Record<string, unknown>;
}

const { state, makeClient } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{
      table: string;
      op: "select" | "insert" | "update" | "delete";
      payload: unknown;
      filters: Record<string, unknown>;
    }>,
    /** Ligne rendue par le select sur `campaigns` (source de la copie). */
    sourceCampaign: null as unknown,
    reset() {
      state.calls = [];
      state.sourceCampaign = null;
    },
  };

  function makeClient() {
    return {
      from(table: string) {
        const call = {
          table,
          op: "select" as "select" | "insert" | "update" | "delete",
          payload: undefined as unknown,
          filters: {} as Record<string, unknown>,
        };
        state.calls.push(call);

        const settle = () => {
          if (call.op === "insert") {
            if (table === "campaigns") {
              return { data: { id: "campaign-copie" }, error: null };
            }
            if (table === "wheels") return { data: { id: "wheel-copie" }, error: null };
            return { data: null, error: null };
          }
          if (call.op !== "select") return { data: null, error: null };
          if (table === "campaigns") return { data: state.sourceCampaign, error: null };
          return { data: null, error: null };
        };

        const builder = {
          select: () => builder,
          insert: (payload: unknown) => {
            call.op = "insert";
            call.payload = payload;
            return builder;
          },
          update: (payload: unknown) => {
            call.op = "update";
            call.payload = payload;
            return builder;
          },
          delete: () => {
            call.op = "delete";
            return builder;
          },
          eq: (column: string, value: unknown) => {
            call.filters[column] = value;
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve(settle()),
          single: () => Promise.resolve(settle()),
          then: (
            onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(settle()).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeClient };
});

const { getUserAndOrgMock, hasEverSubscribedMock, redirectMock } = vi.hoisted(
  () => ({
    getUserAndOrgMock: vi.fn(),
    hasEverSubscribedMock: vi.fn(),
    redirectMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeClient()),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: getUserAndOrgMock }));
vi.mock("@/lib/stripe", () => ({ hasEverSubscribed: hasEverSubscribedMock }));
vi.mock("@/lib/revalidate-play", () => ({
  revalidatePlaySlugs: () => Promise.resolve(),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import {
  duplicateCampaign,
  updateCampaign,
  updateCampaignPrejeuInvitation,
} from "./campaigns";

/** Organisation active, telle que `getUserAndOrg` la rend. */
function org(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    subscription_status: "trialing",
    // Échu : `hasActiveAccess` refuse, c'est le point de départ commun.
    trial_ends_at: "2020-01-01T00:00:00.000Z",
    past_due_since: null,
    comp_access: false,
    comp_access_until: null,
    ...overrides,
  };
}

function session(organization: Record<string, unknown>) {
  return { user: { id: "user-1" }, organization, role: "owner" };
}

function activationForm(): FormData {
  const fd = new FormData();
  fd.set("id", CAMPAIGN_ID);
  fd.set("status", "active");
  return fd;
}

function callsTo(table: string): DbCall[] {
  return state.calls.filter((call) => call.table === table);
}

afterEach(() => {
  state.reset();
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1 — le refus d'activation nomme la bonne cause
// ────────────────────────────────────────────────────────────

describe("updateCampaign — le refus d'activation dit la VRAIE cause", () => {
  it("essai jamais converti : parle bien de l'essai", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));

    const res = await updateCampaign(null, activationForm());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Votre essai gratuit est terminé/);
    // Aucune écriture : le refus précède l'`update`.
    expect(callsTo("campaigns").some((c) => c.op === "update")).toBe(false);
  });

  it("RÉSILIÉ APRÈS AVOIR PAYÉ : ne parle plus d'essai", async () => {
    // LE DÉFAUT. Le bandeau en haut du même écran dit « votre abonnement est
    // inactif » ; le message sous le bouton envoyait le commerçant chercher un
    // essai terminé depuis des mois.
    getUserAndOrgMock.mockResolvedValue(
      session(org({ subscription_status: "canceled" })),
    );
    hasEverSubscribedMock.mockResolvedValue(true);

    const res = await updateCampaign(null, activationForm());

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toMatch(/essai gratuit/);
      expect(res.error).toMatch(/^Votre abonnement est inactif/);
    }
    // Le discriminant est PAYÉ, et seulement sur le statut ambigu.
    expect(hasEverSubscribedMock).toHaveBeenCalledWith(ORG_ID);
  });

  it("essai jamais converti basculé en canceled par le cron : parle d'essai", async () => {
    // Depuis `expire-trials`, `canceled` recouvre deux vécus. Sans ce cas, on
    // aurait remplacé une donnée fausse par un message vague pour la population
    // même que la correction vise.
    getUserAndOrgMock.mockResolvedValue(
      session(org({ subscription_status: "canceled" })),
    );
    hasEverSubscribedMock.mockResolvedValue(false);

    const res = await updateCampaign(null, activationForm());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Votre essai gratuit est terminé/);
  });

  it("impayé hors délai de grâce : abonnement inactif, aucune question posée à Stripe", async () => {
    getUserAndOrgMock.mockResolvedValue(
      session(
        org({
          subscription_status: "past_due",
          past_due_since: "2020-01-01T00:00:00.000Z",
        }),
      ),
    );

    const res = await updateCampaign(null, activationForm());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Votre abonnement est inactif/);
    // La lecture `service_role` n'est payée QUE sur `canceled`.
    expect(hasEverSubscribedMock).not.toHaveBeenCalled();
  });

  it("compte inactif : abonnement inactif", async () => {
    getUserAndOrgMock.mockResolvedValue(
      session(org({ subscription_status: "inactive" })),
    );

    const res = await updateCampaign(null, activationForm());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Votre abonnement est inactif/);
  });

  it("CONTRÔLE : un simple renommage n'est jamais refusé, quel que soit l'accès", async () => {
    // Sans ce témoin, une garde trop large refuserait tout à un résilié — dont
    // les gestes que le produit lui laisse explicitement.
    getUserAndOrgMock.mockResolvedValue(
      session(org({ subscription_status: "canceled" })),
    );
    const fd = new FormData();
    fd.set("id", CAMPAIGN_ID);
    fd.set("name", "Roue de Noël");

    const res = await updateCampaign(null, fd);

    expect(res.ok).toBe(true);
    expect(callsTo("campaigns").some((c) => c.op === "update")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 2 — la duplication emporte le plafond de dépense
// ────────────────────────────────────────────────────────────

describe("duplicateCampaign — le plafond de dépense suit la copie", () => {
  function seedSource(overrides: Record<string, unknown> = {}) {
    state.sourceCampaign = {
      name: "Roue de Noël",
      engagement: {},
      collect_email: true,
      collect_phone: false,
      code_ttl_seconds: 3600,
      budget_cents: 20000,
      budget_spent_cents: 18500,
      paused_reason: "budget_reached",
      auto_schedule: true,
      starts_at: "2025-12-01T00:00:00.000Z",
      ends_at: "2025-12-31T00:00:00.000Z",
      wheels: [],
      ...overrides,
    };
  }

  function form(): FormData {
    const fd = new FormData();
    fd.set("id", CAMPAIGN_ID);
    return fd;
  }

  function copyPayload(): Record<string, unknown> {
    const call = callsTo("campaigns").find((entry) => entry.op === "insert");
    expect(call, "aucune insertion de la copie").toBeDefined();
    return call!.payload as Record<string, unknown>;
  }

  it("recopie budget_cents", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));
    seedSource();

    await duplicateCampaign(null, form());

    expect(copyPayload().budget_cents).toBe(20000);
  });

  it("une source SANS plafond reste sans plafond", async () => {
    // Naître sans plafond est l'état normal d'une campagne neuve : le correctif
    // ne doit pas inventer une limite que la source n'avait pas.
    getUserAndOrgMock.mockResolvedValue(session(org()));
    seedSource({ budget_cents: null });

    await duplicateCampaign(null, form());

    expect(copyPayload().budget_cents).toBeNull();
  });

  it("les COMPTEURS de l'opération d'origine ne suivent pas", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));
    seedSource();

    await duplicateCampaign(null, form());

    const payload = copyPayload();
    expect(payload.budget_spent_cents).toBeUndefined();
    expect(payload.paused_reason).toBeUndefined();
    expect(payload.status).toBe("draft");
  });

  it("la copie ne se publie pas seule : ni dates, ni programmation", async () => {
    // `auto_schedule: true` avec un `starts_at` déjà passé ferait basculer le
    // brouillon en `active` sans repasser par la garde d'abonnement — c'est
    // pourquoi le docstring l'annonce, et pourquoi ce test l'épingle.
    getUserAndOrgMock.mockResolvedValue(session(org()));
    seedSource();

    await duplicateCampaign(null, form());

    const payload = copyPayload();
    expect(payload.auto_schedule).toBeUndefined();
    expect(payload.starts_at).toBeUndefined();
    expect(payload.ends_at).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 3 — l'invitation avant-jeu (booléen sec, jamais une porte)
//
// Elle remplace `updateCampaignEngagement`, supprimée avec le module
// `lib/engagement.ts` : l'invitation PROPOSE les comptes de la maison, elle ne
// conditionne plus le lancement du jeu. Ce qui doit rester vrai :
//   · le tenant est dans le FILTRE, jamais seulement dans le formulaire ;
//   · l'écriture ne touche QUE sa colonne (une action « booléen sec » qui
//     emporterait un voisin réécrirait des réglages que personne n'a ouverts) ;
//   · un identifiant invalide n'écrit rien du tout.
// ────────────────────────────────────────────────────────────

describe("updateCampaignPrejeuInvitation — le booléen et rien d'autre", () => {
  function invitationForm(valeur?: string): FormData {
    const fd = new FormData();
    fd.set("id", CAMPAIGN_ID);
    if (valeur !== undefined) fd.set("prejeu_invitation", valeur);
    return fd;
  }

  function updates() {
    return callsTo("campaigns").filter((c) => c.op === "update");
  }

  it("case cochée : active l'invitation, scopée à l'organisation active", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));

    const res = await updateCampaignPrejeuInvitation(null, invitationForm("on"));

    expect(res.ok).toBe(true);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({ prejeu_invitation: true });
    expect(updates()[0].filters).toEqual({
      id: CAMPAIGN_ID,
      organization_id: ORG_ID,
    });
  });

  it("sentinelle explicite « true » : même effet qu'une case cochée", async () => {
    // Une carte qui POSTE son état voulu (champ caché) plutôt que de le laisser
    // déduire de la présence doit marcher aussi — sans quoi le formulaire
    // enregistrerait « désactivé » sans que personne ne l'ait demandé.
    getUserAndOrgMock.mockResolvedValue(session(org()));

    const res = await updateCampaignPrejeuInvitation(
      null,
      invitationForm("true"),
    );

    expect(res.ok).toBe(true);
    expect(updates()[0].payload).toEqual({ prejeu_invitation: true });
  });

  it("case décochée (champ absent) : désactive, sans toucher un autre réglage", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));

    const res = await updateCampaignPrejeuInvitation(null, invitationForm());

    expect(res.ok).toBe(true);
    // Égalité STRICTE : ni `engagement`, ni `collect_email`, ni rien d'autre.
    expect(updates()[0].payload).toEqual({ prejeu_invitation: false });
  });

  it("un identifiant qui n'est pas un UUID n'écrit rien", async () => {
    getUserAndOrgMock.mockResolvedValue(session(org()));
    const fd = new FormData();
    fd.set("id", "../autre-campagne");
    fd.set("prejeu_invitation", "on");

    const res = await updateCampaignPrejeuInvitation(null, fd);

    expect(res.ok).toBe(false);
    expect(updates()).toEqual([]);
  });
});

