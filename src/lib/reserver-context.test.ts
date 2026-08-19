import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Chargeurs du module Réserver — ce qu'ils REFUSENT.
//
//   · une organisation sans le droit `vitrine` rend le MÊME contexte
//     « indisponible » qu'une activité inexistante : aucun oracle sur l'état
//     commercial d'un commerce qui n'est pas celui du visiteur ;
//   · une jointure qui rapporterait l'organisation d'un AUTRE locataire est
//     refusée avant toute lecture ;
//   · les colonnes sont ÉNUMÉRÉES — `email` n'est dans aucun select, la colonne
//     étant hors du grant de `authenticated` (un `select *` y échoue en entier) ;
//   · les places restantes se déduisent des lignes VIVANTES, `checked_in`
//     comprises : le check-in ne libère AUCUNE place.
// ────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const SLOT_ID = "22222222-2222-4222-8222-222222222222";

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    droitVitrine: true,
    activityRow: null as Record<string, unknown> | null,
    slots: [] as Array<Record<string, unknown>>,
    vivantes: [] as Array<Record<string, unknown>>,
    miennes: [] as Array<Record<string, unknown>>,
    empreinte: null as string | null,
    selects: [] as Array<{ table: string; colonnes: string }>,
    filtres: [] as Array<Record<string, unknown>>,
    pressions: [] as Array<{ parts: string; evenement: string }>,
    reset() {
      state.droitVitrine = true;
      state.activityRow = {
        id: "33333333-3333-4333-8333-333333333333",
        organization_id: "11111111-1111-4111-8111-111111111111",
        name: "Dégustation",
        description: null,
        active: true,
        created_at: "2026-08-01T00:00:00Z",
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Chez Marco",
          logo_url: null,
          subscription_status: "active",
          trial_ends_at: "2030-01-01T00:00:00Z",
          past_due_since: null,
          addon_vitrine: true,
          comp_access: false,
          comp_access_until: null,
          timezone: "Indian/Reunion",
        },
      };
      state.slots = [];
      state.vivantes = [];
      state.miennes = [];
      state.empreinte = null;
      state.selects = [];
      state.filtres = [];
      state.pressions = [];
    },
  };

  function makeAdmin() {
    return {
      from(table: string) {
        const filtres: Record<string, unknown> = { table };
        let colonnes = "";
        let lectureMienne = false;
        const builder = {
          select: (c: string) => {
            colonnes = c;
            state.selects.push({ table, colonnes: c });
            return builder;
          },
          eq: (colonne: string, valeur: unknown) => {
            filtres[colonne] = valeur;
            if (colonne === "player_key_hash") lectureMienne = true;
            return builder;
          },
          in: (colonne: string, valeurs: unknown) => {
            filtres[colonne] = valeurs;
            return builder;
          },
          gt: (colonne: string, valeur: unknown) => {
            filtres[`gt:${colonne}`] = valeur;
            return builder;
          },
          order: () => builder,
          limit: () => {
            state.filtres.push(filtres);
            if (table === "reservation_slots") {
              return Promise.resolve({ data: state.slots, error: null });
            }
            return Promise.resolve({
              data: lectureMienne ? state.miennes : state.vivantes,
              error: null,
            });
          },
          maybeSingle: () => {
            state.filtres.push(filtres);
            return Promise.resolve({ data: state.activityRow, error: null });
          },
        };
        void colonnes;
        return builder;
      },
    };
  }

  return { state, makeAdmin };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
  headers: () => Promise.resolve({ get: () => null }),
}));
vi.mock("@/lib/request-ip", () => ({
  clientIpFromHeaders: () => "203.0.113.7",
  observerPressionIp: (
    parts: Array<string | number>,
    _ip: string,
    _rule: unknown,
    evenement: string,
  ) => {
    state.pressions.push({ parts: parts.join(":"), evenement });
    return Promise.resolve();
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeAdmin()),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: () => Promise.resolve({ user: null, organization: null, role: null, memberships: [] }) }));
vi.mock("@/lib/module-acces-public", () => ({
  moduleOuvertAuJoueur: (module: string) => {
    expect(module).toBe("vitrine");
    return Promise.resolve(state.droitVitrine);
  },
}));
vi.mock("@/lib/player-identity", () => ({
  PLAYER_COOKIE_NAME: "lc-player",
  PLAYER_COOKIE_MAX_AGE: 3600,
  PLAYER_DEVICE_TOKEN_PATTERN: /^[A-Za-z0-9_-]{43}$/,
  generatePlayerDeviceToken: () => "t".repeat(43),
  hashPlayerDeviceToken: () => "b".repeat(64),
  peekPlayerDeviceTokenHash: () => Promise.resolve(state.empreinte),
}));

import { loadReserverPublicContext } from "@/lib/reserver-context";

beforeEach(() => state.reset());
afterEach(() => vi.clearAllMocks());

describe("loadReserverPublicContext", () => {
  it("rend le contexte, le fuseau de l'organisation et les créneaux ouverts", async () => {
    state.slots = [
      {
        id: SLOT_ID,
        organization_id: ORG_ID,
        activity_id: ACTIVITY_ID,
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
        capacity: 10,
        status: "open",
      },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.timezone).toBe("Indian/Reunion");
    expect(contexte.slots).toHaveLength(1);
    expect(contexte.slots[0].remaining).toBe(10);
  });

  it("observe l'IP SEULE avant l'IP par activité, et ne refuse jamais dessus", async () => {
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
      "reserver_page_pressure",
    ]);
    expect(state.pressions[0].parts).toBe("reserver:page:ip");
    expect(state.pressions[1].parts).toBe(
      `reserver:page:activity:ip:${ACTIVITY_ID}`,
    );
    // Ces compteurs ne portent AUCUNE porte : la page se rend quand même.
    expect(contexte.ok).toBe(true);
  });

  it("compte l'IP SEULE même sur une activité qui n'existe pas", async () => {
    // C'est TOUT L'INTÉRÊT du premier compteur : un balayage d'UUID inventés
    // n'atteint jamais une activité résolue. Posé après la lecture, il ne
    // verrait rien du seul trafic qu'il est censé rendre visible.
    state.activityRow = null;
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);

    expect(contexte.ok).toBe(false);
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
    ]);
  });

  it("REFUSE — indistinctement — une organisation sans le droit `vitrine`", async () => {
    state.droitVitrine = false;
    const sansDroit = await loadReserverPublicContext(ACTIVITY_ID);

    state.droitVitrine = true;
    state.activityRow = null;
    const inexistante = await loadReserverPublicContext(ACTIVITY_ID);

    expect(sansDroit.ok).toBe(false);
    expect(inexistante.ok).toBe(false);
    // MÊME message : aucun oracle sur l'état commercial d'un tiers.
    if (!sansDroit.ok && !inexistante.ok) {
      expect(sansDroit.error).toBe(inexistante.error);
    }
  });

  it("REFUSE une jointure qui rapporte l'organisation d'un AUTRE locataire", async () => {
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      organization_id: "99999999-9999-4999-8999-999999999999",
    };
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(false);
  });

  it("REFUSE une activité coupée — `active = false` ferme les réservations", async () => {
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      active: false,
    };
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(false);
  });

  it("compte les DEUX états vivants : le check-in ne libère aucune place", async () => {
    state.slots = [
      {
        id: SLOT_ID,
        organization_id: ORG_ID,
        activity_id: ACTIVITY_ID,
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
        capacity: 3,
        status: "open",
      },
    ];
    state.vivantes = [
      { slot_id: SLOT_ID, status: "confirmed" },
      { slot_id: SLOT_ID, status: "checked_in" },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.slots[0].remaining).toBe(1);

    // Le filtre de statut nomme bien les deux états vivants, jamais `confirmed`
    // seul : ne compter que les confirmées ferait du passage au comptoir une
    // libération de siège.
    const comptage = state.filtres.find(
      (f) => f.table === "reservations" && Array.isArray(f.status),
    );
    expect(comptage?.status).toEqual(["confirmed", "checked_in"]);
  });

  it("ne demande JAMAIS la colonne `email` (hors du grant : un select * échoue en entier)", async () => {
    state.slots = [
      {
        id: SLOT_ID,
        organization_id: ORG_ID,
        activity_id: ACTIVITY_ID,
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
        capacity: 3,
        status: "open",
      },
    ];
    state.empreinte = "b".repeat(64);

    await loadReserverPublicContext(ACTIVITY_ID);

    for (const { colonnes } of state.selects) {
      expect(colonnes).not.toContain("*");
      expect(colonnes.split(/[\s,]+/)).not.toContain("email");
      expect(colonnes).not.toContain("player_key_hash");
    }
  });

  it("ne lit les réservations du visiteur QUE s'il porte une identité", async () => {
    state.slots = [
      {
        id: SLOT_ID,
        organization_id: ORG_ID,
        activity_id: ACTIVITY_ID,
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
        capacity: 3,
        status: "open",
      },
    ];

    const sansCookie = await loadReserverPublicContext(ACTIVITY_ID);
    expect(sansCookie.ok && sansCookie.aUneIdentite).toBe(false);
    expect(
      state.filtres.some((f) => typeof f.player_key_hash === "string"),
    ).toBe(false);

    state.filtres = [];
    state.empreinte = "b".repeat(64);
    state.miennes = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        slot_id: SLOT_ID,
        organization_id: ORG_ID,
        code: "ABCD2345",
        status: "confirmed",
        created_at: "2026-08-20T08:00:00Z",
        cancelled_at: null,
        checked_in_at: null,
        checked_in_by: null,
      },
    ];

    const avecCookie = await loadReserverPublicContext(ACTIVITY_ID);
    expect(avecCookie.ok).toBe(true);
    if (!avecCookie.ok) return;
    expect(avecCookie.aUneIdentite).toBe(true);
    expect(avecCookie.mesReservations[SLOT_ID]?.code).toBe("ABCD2345");
    // La lecture est bornée à l'organisation : l'empreinte du cookie est
    // GLOBALE, et une lecture non bornée montrerait ce que la personne a
    // réservé chez le concurrent d'en face.
    const mienne = state.filtres.find(
      (f) => typeof f.player_key_hash === "string",
    );
    expect(mienne?.organization_id).toBe(ORG_ID);
  });
});
