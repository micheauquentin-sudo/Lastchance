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
    droitReserver: true,
    activityRow: null as Record<string, unknown> | null,
    slots: [] as Array<Record<string, unknown>>,
    vivantes: [] as Array<Record<string, unknown>>,
    miennes: [] as Array<Record<string, unknown>>,
    /** Offres de liste prioritaire encore TENUES sur les créneaux affichés. */
    tenues: [] as Array<Record<string, unknown>>,
    /** Ce que rend `reservation_public_state` — dont la clé `waitlist`. */
    etatPublic: {
      state: "ok",
      timezone: "Indian/Reunion",
      reservations: [],
      waitlist: [] as Array<Record<string, unknown>>,
    } as Record<string, unknown>,
    rpcs: [] as string[],
    /** La ligne d'invitation résolue PAR EMPREINTE de jeton, ou `null`. */
    invitationRow: null as Record<string, unknown> | null,
    /** La FILE d'accueil (RES-3), avec son organisation jointe, ou `null`. */
    queueRow: null as Record<string, unknown> | null,
    /** Les entrées `waiting` que la lecture de comptage rapporte. */
    entreesFile: [] as Array<Record<string, unknown>>,
    /** Ce que rend `queue_public_state`. */
    etatFile: { state: "not_in_queue" } as Record<string, unknown>,
    /** Ce que rend `wait_session_open` (RES-4). */
    sessionAttente: {} as Record<string, unknown>,
    empreinte: null as string | null,
    /**
     * La session MARCHANDE, pour les chargeurs de tableau de bord. `null` par
     * défaut : la quasi-totalité de ce fichier teste des chemins PUBLICS, où il
     * n'y a personne de connecté, et ce défaut est ce qui les garde honnêtes.
     */
    session: null as {
      user: { id: string };
      organization: Record<string, unknown>;
      role: string | null;
    } | null,
    /** Ce que `stock_offers_staff_state` rend au panneau du commerçant. */
    stockOffersStaffState: { state: "ok", offers: [] } as unknown,
    selects: [] as Array<{ table: string; colonnes: string }>,
    filtres: [] as Array<Record<string, unknown>>,
    /** Les arguments de chaque RPC, dans l'ordre — parallèle à `rpcs`. */
    rpcArgs: [] as Array<Record<string, unknown>>,
    pressions: [] as Array<{ parts: string; evenement: string }>,
    reset() {
      state.droitReserver = true;
      state.session = null;
      state.stockOffersStaffState = { state: "ok", offers: [] };
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
          addon_reserver: true,
          comp_access: false,
          comp_access_until: null,
          timezone: "Indian/Reunion",
        },
      };
      state.slots = [];
      state.vivantes = [];
      state.miennes = [];
      state.tenues = [];
      state.etatPublic = {
        state: "ok",
        timezone: "Indian/Reunion",
        reservations: [],
        waitlist: [],
      };
      state.rpcs = [];
      state.invitationRow = {
        id: "77777777-7777-4777-8777-777777777777",
        organization_id: "11111111-1111-4111-8111-111111111111",
        activity_id: "33333333-3333-4333-8333-333333333333",
        slot_id: null,
        label: "Habitués du samedi",
        max_uses: 5,
        used_count: 0,
        expires_at: null,
        closed_at: null,
        revoked_at: null,
        created_by: null,
        created_at: "2026-08-01T00:00:00Z",
      };
      state.queueRow = {
        id: "44444444-4444-4444-8444-444444444444",
        organization_id: "11111111-1111-4111-8111-111111111111",
        activity_id: null,
        name: "Comptoir",
        status: "open",
        max_live_entries: 50,
        created_at: "2026-08-01T00:00:00Z",
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Chez Marco",
          logo_url: null,
          subscription_status: "active",
          trial_ends_at: "2030-01-01T00:00:00Z",
          past_due_since: null,
          addon_reserver: true,
          comp_access: false,
          comp_access_until: null,
          timezone: "Indian/Reunion",
        },
      };
      state.entreesFile = [];
      state.etatFile = { state: "not_in_queue" };
      state.sessionAttente = {
        state: "open",
        session_id: "88888888-8888-4888-8888-888888888888",
        source: "queue_entry",
        quiz_id: "99999999-9999-4999-8999-999999999999",
        pause_campaign_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        activity_id: null,
        pause_chance_used: false,
      };
      state.empreinte = null;
      state.selects = [];
      state.filtres = [];
      state.rpcArgs = [];
      state.pressions = [];
    },
  };

  function makeAdmin() {
    return {
      rpc(nom: string, args?: Record<string, unknown>) {
        state.rpcs.push(nom);
        state.rpcArgs.push(args ?? {});
        if (nom === "queue_public_state") {
          return Promise.resolve({ data: state.etatFile, error: null });
        }
        if (nom === "wait_session_open") {
          return Promise.resolve({ data: state.sessionAttente, error: null });
        }
        if (nom === "stock_offers_staff_state") {
          return Promise.resolve({
            data: state.stockOffersStaffState,
            error: null,
          });
        }
        return Promise.resolve({ data: state.etatPublic, error: null });
      },
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
            if (table === "reservation_queue_entries") {
              return Promise.resolve({ data: state.entreesFile, error: null });
            }
            if (table === "reservation_waitlist_entries") {
              return Promise.resolve({ data: state.tenues, error: null });
            }
            return Promise.resolve({
              data: lectureMienne ? state.miennes : state.vivantes,
              error: null,
            });
          },
          maybeSingle: () => {
            state.filtres.push(filtres);
            if (table === "reservation_invitations") {
              return Promise.resolve({ data: state.invitationRow, error: null });
            }
            if (table === "reservation_queues") {
              return Promise.resolve({ data: state.queueRow, error: null });
            }
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
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () =>
    Promise.resolve(
      state.session
        ? { ...state.session, memberships: [] }
        : { user: null, organization: null, role: null, memberships: [] },
    ),
}));
vi.mock("@/lib/module-acces-public", () => ({
  moduleOuvertAuJoueur: (module: string) => {
    expect(module).toBe("reserver");
    return Promise.resolve(state.droitReserver);
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

import {
  droitReserverOuvertPourFile,
  generateInvitationToken,
  hashInvitationToken,
  lireEtatFilePublic,
  loadReserverInvitationContext,
  loadReserverPublicContext,
  loadReserverQueuePublicContext,
  loadStockOffersDashboardContext,
} from "@/lib/reserver-context";

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
    state.droitReserver = false;
    const sansDroit = await loadReserverPublicContext(ACTIVITY_ID);

    state.droitReserver = true;
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

// ════════════════════════════════════════════════════════════
// Liste prioritaire dans le contexte public (RES-2, lot L5)
// ════════════════════════════════════════════════════════════

const CRENEAU_OUVERT = {
  id: SLOT_ID,
  organization_id: ORG_ID,
  activity_id: ACTIVITY_ID,
  starts_at: "2026-09-01T12:00:00Z",
  ends_at: "2026-09-01T14:00:00Z",
  capacity: 10,
  status: "open",
  waitlist_offer_minutes: null,
};

describe("loadReserverPublicContext — la jauge à DEUX termes", () => {
  it("retranche les offres TENUES, pas seulement les réservations vivantes", async () => {
    state.slots = [CRENEAU_OUVERT];
    state.vivantes = [{ slot_id: SLOT_ID, status: "confirmed" }];
    state.tenues = [
      { slot_id: SLOT_ID, status: "offered", offer_expires_at: "2030-01-01T00:00:00Z" },
      { slot_id: SLOT_ID, status: "offered", offer_expires_at: "2030-01-01T00:00:00Z" },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    // 10 − 1 vivante − 2 tenues. Compter les seules vivantes afficherait 9
    // places, dont deux sont promises : la RPC refuserait deux d'entre elles.
    expect(contexte.slots[0].remaining).toBe(7);
  });

  it("SOMME `party_size` : un duo occupe DEUX places, pas une ligne", async () => {
    // ── LE BOGUE QUE CE TEST FERME (RES-5) ──
    //
    // La jauge comptait des LIGNES, ce qui était exact tant qu'une réservation
    // valait une personne. Sur un Atelier Duo, deux lignes valent QUATRE
    // personnes : compter des lignes affichait « 8 places restantes » sur un
    // créneau de 10 où il n'en reste que 6, soit une occupation sous-estimée de
    // MOITIÉ — et un bouton « réserver » que `reserve_slot` refuse.
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      kind: "duo",
    };
    state.slots = [CRENEAU_OUVERT];
    state.vivantes = [
      { slot_id: SLOT_ID, status: "confirmed", party_size: 2 },
      { slot_id: SLOT_ID, status: "checked_in", party_size: 2 },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.slots[0].remaining).toBe(6);
    // Et le nombre que l'écran doit vraiment annoncer sur un duo : trois duos
    // possibles, pas six places à prendre séparément.
    expect(contexte.slots[0].pairesRestantes).toBe(3);
    expect(contexte.activity.kind).toBe("duo");

    // La colonne est bien DEMANDÉE : sans elle, la somme retomberait sur le
    // repli à 1 et le bogue reviendrait sans qu'aucun test ne rougisse.
    const comptage = state.selects.find(
      (s) => s.table === "reservations" && s.colonnes.includes("status"),
    );
    expect(comptage?.colonnes).toContain("party_size");
  });

  it("une offre TENUE sur un duo tient DEUX places", async () => {
    // `count(*) * v_seats` des cinq RPC : l'offre tient ce que sa conversion
    // prendra. La compter pour une place laisserait la page ouvrir une porte
    // que `claim_waitlist_offer` refermerait par sur-réservation.
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      kind: "duo",
    };
    state.slots = [CRENEAU_OUVERT];
    state.tenues = [
      {
        slot_id: SLOT_ID,
        status: "offered",
        offer_expires_at: "2030-01-01T00:00:00Z",
      },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.slots[0].remaining).toBe(8);
  });

  it("un créneau standard compte EXACTEMENT comme hier, et sans paires", async () => {
    // `party_size` vaut 1 partout ailleurs : la somme redevient le comptage de
    // lignes, au caractère près. C'est la vérification que ce lot ne casse rien.
    state.slots = [CRENEAU_OUVERT];
    state.vivantes = [
      { slot_id: SLOT_ID, status: "confirmed", party_size: 1 },
      { slot_id: SLOT_ID, status: "confirmed" },
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.slots[0].remaining).toBe(8);
    expect(contexte.slots[0].pairesRestantes).toBeNull();
    expect(contexte.activity.kind).toBe("standard");
  });

  it("porte la page immersive jusqu'à l'écran public", async () => {
    // La promesse, la durée, les cartes et la préparation SONT la page — le
    // visiteur les lit avant de s'engager, contrairement à la configuration
    // d'animation, qui décrit ce qui sera proposé à quelqu'un d'autre.
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      kind: "signature",
      promise: "Trente minutes qui changent un samedi.",
      duration_minutes: 30,
      steps: [
        { title: "Accueil", body: "On vous installe." },
        { title: "Sans corps" },
      ],
      preparation: "Venez dix minutes avant.",
    };
    state.slots = [CRENEAU_OUVERT];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.activity.kind).toBe("signature");
    expect(contexte.activity.promise).toBe(
      "Trente minutes qui changent un samedi.",
    );
    expect(contexte.activity.durationMinutes).toBe(30);
    expect(contexte.activity.preparation).toBe("Venez dix minutes avant.");
    // La carte incomplète est ÉCARTÉE, pas complétée.
    expect(contexte.activity.steps).toEqual([
      { title: "Accueil", body: "On vous installe." },
    ]);
    // La configuration d'animation, elle, ne descend toujours pas.
    expect(contexte.activity.waitQuizId).toBeNull();
  });

  it("ne compte comme tenue qu'une offre dont l'échéance est FUTURE", async () => {
    state.slots = [CRENEAU_OUVERT];
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);

    const lecture = state.filtres.find(
      (f) => f.table === "reservation_waitlist_entries",
    );
    // Refus PARESSEUX, comme le SQL : une offre échue ne tient plus rien, même
    // si le balayage de pg_cron n'est pas encore passé.
    expect(lecture?.status).toBe("offered");
    expect(typeof lecture?.["gt:offer_expires_at"]).toBe("string");
  });

  it("porte la fenêtre d'attente du créneau jusqu'à l'écran", async () => {
    state.slots = [{ ...CRENEAU_OUVERT, waitlist_offer_minutes: 45 }];
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok && contexte.slots[0].waitlistOfferMinutes).toBe(45);
  });

  it("rend MA file par la RPC — position et `offer_live` viennent du serveur", async () => {
    state.empreinte = "b".repeat(64);
    state.slots = [CRENEAU_OUVERT];
    state.etatPublic = {
      state: "ok",
      timezone: "Indian/Reunion",
      reservations: [],
      waitlist: [
        {
          entry_id: "e1",
          slot_id: SLOT_ID,
          status: "offered",
          offer_expires_at: "2030-01-01T00:00:00Z",
          offer_live: true,
          position: 1,
          activity_name: "Dégustation",
        },
      ],
    };

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(state.rpcs).toContain("reservation_public_state");
    expect(contexte.maFile[SLOT_ID]?.offerLive).toBe(true);
    expect(contexte.maFile[SLOT_ID]?.position).toBe(1);
  });

  it("ne demande RIEN de la file à un visiteur sans identité", async () => {
    state.slots = [CRENEAU_OUVERT];
    const contexte = await loadReserverPublicContext(ACTIVITY_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(state.rpcs).toHaveLength(0);
    expect(contexte.maFile).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════
// Contexte d'une invitation privée (RES-2, lot L5)
// ════════════════════════════════════════════════════════════

describe("jeton d'invitation", () => {
  it("tire 32 caractères base64url — 192 bits, bien au-delà des 128 exigés", () => {
    const jeton = generateInvitationToken();
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(jeton).not.toBe(generateInvitationToken());
  });

  it("hache en SHA-256 hexadécimal NON SALÉ — le contrat de la migration", () => {
    const jeton = generateInvitationToken();
    const empreinte = hashInvitationToken(jeton);
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    // NON SALÉ : deux appels rendent la même empreinte, et une rotation de
    // secret ne rendrait aucune invitation illisible.
    expect(hashInvitationToken(jeton)).toBe(empreinte);
  });

  it("refuse de hacher ce qui n'a pas la forme du générateur", () => {
    expect(hashInvitationToken("")).toBeNull();
    expect(hashInvitationToken("trop-court")).toBeNull();
    expect(hashInvitationToken("a".repeat(33))).toBeNull();
    expect(hashInvitationToken(`${"a".repeat(31)}+`)).toBeNull();
  });
});

describe("loadReserverInvitationContext", () => {
  const JETON = "Zq7xK9mB4tR2wL8vN5cP1sD3fG6hJ0yU";

  beforeEach(() => {
    state.slots = [CRENEAU_OUVERT];
  });

  it("résout l'invitation PAR EMPREINTE, jamais par le clair", async () => {
    const contexte = await loadReserverInvitationContext(JETON);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.invitation.label).toBe("Habitués du samedi");
    expect(contexte.invitation.creneauImpose).toBe(false);

    const lecture = state.filtres.find(
      (f) => f.table === "reservation_invitations",
    );
    expect(lecture?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(state.filtres)).not.toContain(JETON);
  });

  it("MONTRE un créneau `closed` — c'est le cas d'usage même de l'invitation", async () => {
    await loadReserverInvitationContext(JETON);
    const lecture = state.filtres.find((f) => f.table === "reservation_slots");
    expect(lecture?.status).toEqual(["open", "closed"]);
  });

  it("ne demande JAMAIS `token_hash` ni `email` dans ses colonnes", async () => {
    await loadReserverInvitationContext(JETON);
    for (const { colonnes } of state.selects) {
      expect(colonnes).not.toContain("token_hash");
      expect(colonnes).not.toContain("email");
    }
  });

  it("rend la MÊME réponse pour un jeton malformé, inconnu, révoqué, clos, expiré ou épuisé", async () => {
    const attendu = "Cette page de réservation n'est pas disponible.";

    const malforme = await loadReserverInvitationContext("trop-court");
    expect(malforme.ok === false && malforme.error).toBe(attendu);

    state.invitationRow = null;
    const inconnu = await loadReserverInvitationContext(JETON);
    expect(inconnu.ok === false && inconnu.error).toBe(attendu);

    const base = {
      id: "77777777-7777-4777-8777-777777777777",
      organization_id: ORG_ID,
      activity_id: ACTIVITY_ID,
      slot_id: null,
      label: "Habitués",
      max_uses: 5,
      used_count: 0,
      expires_at: null,
      closed_at: null,
      revoked_at: null,
      created_by: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    for (const eteint of [
      { revoked_at: "2026-08-01T00:00:00Z" },
      { closed_at: "2026-08-01T00:00:00Z" },
      { expires_at: "2026-08-01T00:00:00Z" },
      { used_count: 5 },
    ]) {
      state.invitationRow = { ...base, ...eteint };
      const refus = await loadReserverInvitationContext(JETON);
      expect(refus.ok === false && refus.error).toBe(attendu);
    }
  });

  it("refuse — de la même façon — une organisation sans le droit `vitrine`", async () => {
    state.droitReserver = false;
    const contexte = await loadReserverInvitationContext(JETON);
    expect(contexte.ok).toBe(false);
  });

  it("compte l'IP SEULE avant même de hacher, puis l'activité une fois résolue", async () => {
    state.invitationRow = null;
    await loadReserverInvitationContext("trop-court");
    // Un balayage de jetons inventés est VU : c'est tout l'intérêt du premier
    // compteur, et il n'aurait rien vu posé après la résolution.
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
    ]);

    state.reset();
    state.slots = [CRENEAU_OUVERT];
    await loadReserverInvitationContext(JETON);
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
      "reserver_page_pressure",
    ]);
    // Par ACTIVITÉ, jamais par jeton : une clé choisie par l'appelant ouvrirait
    // une série neuve à chaque essai.
    expect(state.pressions[1].parts).toBe(
      `reserver:page:activity:ip:${ACTIVITY_ID}`,
    );
  });

  it("refuse quand la cible n'a plus aucun créneau ouvrable", async () => {
    state.slots = [];
    const contexte = await loadReserverInvitationContext(JETON);
    expect(contexte.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// La file sereine (RES-3) — le chargeur public, et ce qu'il refuse.
// ────────────────────────────────────────────────────────────

const QUEUE_ID = "44444444-4444-4444-8444-444444444444";

describe("loadReserverQueuePublicContext", () => {
  it("rend la file, le fuseau de l'établissement, et l'ouvre à l'entrée", async () => {
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.queue.name).toBe("Comptoir");
    expect(contexte.queue.status).toBe("open");
    expect(contexte.timezone).toBe("Indian/Reunion");
    expect(contexte.accepteEntree).toBe(true);
  });

  it("rend le MÊME contexte indisponible sans le droit `vitrine`", async () => {
    // Aucun oracle sur l'état commercial d'un commerce qui n'est pas celui du
    // visiteur : afficher une file EST une capacité de l'offre Vitrine.
    state.droitReserver = false;
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(false);
    expect(contexte.ok === false && contexte.error).toContain("pas disponible");
    // Et surtout : la RPC n'est jamais appelée.
    expect(state.rpcs).toEqual([]);
  });

  it("refuse une jointure qui rapporterait l'organisation d'un AUTRE locataire", async () => {
    state.queueRow = {
      ...(state.queueRow as Record<string, unknown>),
      organization_id: "99999999-9999-4999-8999-999999999999",
    };
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);
    expect(contexte.ok).toBe(false);
  });

  it("observe l'IP SEULE avant l'IP par file, et ne refuse sur aucune", async () => {
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
      "reserver_page_pressure",
    ]);
    expect(state.pressions[0].parts).toBe("reserver:page:ip");
    expect(state.pressions[1].parts).toBe(`reserver:page:queue:ip:${QUEUE_ID}`);
    expect(contexte.ok).toBe(true);
  });

  it("compte l'IP SEULE même sur une file qui n'existe pas", async () => {
    // C'est TOUT L'INTÉRÊT du premier compteur : un balayage d'identifiants
    // inventés n'atteint jamais une file résolue.
    state.queueRow = null;
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(false);
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_page_ip_ceiling",
    ]);
  });

  it("ferme l'entrée d'une file en PAUSE, sans la rendre indisponible", async () => {
    // La pause refuse d'accueillir et continue de SERVIR : celui qui attend
    // déjà doit garder son écran, et son rang.
    state.queueRow = {
      ...(state.queueRow as Record<string, unknown>),
      status: "paused",
    };
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.queue.status).toBe("paused");
    expect(contexte.accepteEntree).toBe(false);
  });

  it("ferme l'entrée quand l'activité liée est coupée, et nomme cette activité", async () => {
    state.queueRow = {
      ...(state.queueRow as Record<string, unknown>),
      activity_id: ACTIVITY_ID,
    };
    state.activityRow = {
      ...(state.activityRow as Record<string, unknown>),
      active: false,
    };
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.queue.activityName).toBe("Dégustation");
    expect(contexte.accepteEntree).toBe(false);
  });

  it("SANS IDENTITÉ : ne demande RIEN à la RPC, et compte les personnes en attente", async () => {
    // `queue_public_state` exige une empreinte de cookie, et en fabriquer une
    // pour lire un nombre écrirait une identité à quelqu'un qui n'a rien
    // demandé — ce qu'un rendu de page n'a de toute façon pas le droit de faire.
    state.empreinte = null;
    state.entreesFile = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(state.rpcs).toEqual([]);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.waitingCount).toBe(3);
    expect(contexte.maPlace).toBeNull();
    expect(contexte.aUneIdentite).toBe(false);
    // Le comptage porte sur le MÊME prédicat que la RPC : les seules `waiting`.
    const comptage = state.filtres.find(
      (f) => f.table === "reservation_queue_entries",
    );
    expect(comptage?.status).toBe("waiting");
  });

  it("AVEC IDENTITÉ : la RPC fait foi, rang et taille de file compris", async () => {
    state.empreinte = "b".repeat(64);
    state.etatFile = {
      state: "in_queue",
      queue_name: "Comptoir",
      queue_status: "open",
      entry_id: "e1",
      status: "waiting",
      position: 2,
      waiting_count: 5,
      joined_at: "2026-08-20T09:00:00Z",
      called_at: null,
    };

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    // `wait_session_open` SUIT, et seulement parce qu'une place existe : ouvrir
    // la session d'attente active (RES-4) est idempotent et ne touche pas à la
    // file. C'est `queue_public_state` qui reste le SEUL juge du rang.
    expect(state.rpcs).toEqual(["queue_public_state", "wait_session_open"]);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.waitingCount).toBe(5);
    expect(contexte.maPlace?.position).toBe(2);
    expect(contexte.maPlace?.etat).toBe("attente");
  });

  it("L'APPEL PRIME : une place appelée n'a plus de rang, et le dit", async () => {
    state.empreinte = "b".repeat(64);
    state.etatFile = {
      state: "in_queue",
      queue_name: "Comptoir",
      queue_status: "open",
      entry_id: "e1",
      status: "called",
      position: null,
      waiting_count: 4,
      joined_at: "2026-08-20T09:00:00Z",
      called_at: "2026-08-20T10:00:00Z",
    };

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.maPlace?.etat).toBe("appele");
    expect(contexte.maPlace?.position).toBeNull();
    expect(contexte.maPlace?.calledAt).toBe("2026-08-20T10:00:00Z");
  });

  it("ÉNUMÈRE les colonnes, et n'en demande NI l'adresse NI le prénom", async () => {
    // Les deux sont hors du grant de `authenticated` : un `select *` y est
    // refusé EN ENTIER. Le prénom ne sort que par `queue_staff_state`, qui
    // choisit ce qu'elle expose.
    state.empreinte = null;
    await loadReserverQueuePublicContext(QUEUE_ID);

    const lectures = state.selects.filter(
      (s) =>
        s.table === "reservation_queues" ||
        s.table === "reservation_queue_entries",
    );
    expect(lectures.length).toBeGreaterThan(0);
    for (const lecture of lectures) {
      expect(lecture.colonnes).not.toContain("*");
      expect(lecture.colonnes).not.toContain("email");
      expect(lecture.colonnes).not.toContain("display_name");
      expect(lecture.colonnes).not.toContain("player_key_hash");
    }
  });

  it("ne rend AUCUNE clé de durée : le contexte ne porte pas d'ETA", async () => {
    state.empreinte = "b".repeat(64);
    state.etatFile = {
      state: "in_queue",
      queue_name: "Comptoir",
      queue_status: "open",
      entry_id: "e1",
      status: "waiting",
      position: 2,
      waiting_count: 5,
      joined_at: "2026-08-20T09:00:00Z",
      called_at: null,
    };
    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);
    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    // Liste NOMMÉE plutôt qu'expression : `etat` — l'état d'interface de la
    // place — contient les trois lettres d'`eta` et ferait rougir une regex,
    // pour un champ qui ne promet rien du tout.
    const CLES_DE_DELAI = new Set([
      "eta",
      "etaMinutes",
      "etaSeconds",
      "estimatedWait",
      "estimatedAt",
      "waitMinutes",
      "delay",
      "delayMinutes",
      "duration",
      "duree",
      "dureeEstimee",
      "tempsAttente",
    ]);
    const cles = [
      ...Object.keys(contexte),
      ...Object.keys(contexte.queue),
      ...Object.keys(contexte.maPlace ?? {}),
    ];
    expect(cles.filter((cle) => CLES_DE_DELAI.has(cle))).toEqual([]);
  });
});

describe("lireEtatFilePublic — UNE lecture, partagée par la page et son scrutin", () => {
  it("rend la file et sa taille à un visiteur sans identité, sans toucher la RPC", async () => {
    state.entreesFile = [{ id: "e1" }, { id: "e2" }];
    const etat = await lireEtatFilePublic(QUEUE_ID, null);

    expect(state.rpcs).toEqual([]);
    expect(etat.state).toBe("not_in_queue");
    expect(etat.queueName).toBe("Comptoir");
    expect(etat.waitingCount).toBe(2);
  });

  it("rend `unavailable` sur une file inconnue, sans rien inventer", async () => {
    state.queueRow = null;
    const etat = await lireEtatFilePublic(QUEUE_ID, null);
    expect(etat.state).toBe("unavailable");
    expect(etat.queueName).toBeNull();
    expect(etat.waitingCount).toBe(0);
  });

  it("NE SE RABAT PAS sur la table quand la RPC rend `unavailable`", async () => {
    // Elle ne trouverait rien non plus, et l'aller-retour serait payé à chaque
    // tic de scrutin d'un identifiant inventé.
    state.etatFile = { state: "unavailable" };
    const etat = await lireEtatFilePublic(QUEUE_ID, "b".repeat(64));

    expect(state.rpcs).toEqual(["queue_public_state"]);
    expect(etat.state).toBe("unavailable");
    expect(
      state.filtres.some((f) => f.table === "reservation_queues"),
    ).toBe(false);
  });
});

describe("droitReserverOuvertPourFile — la garde que le SCRUTIN oppose", () => {
  it("rend `true` quand l'organisation qui porte la file a le droit", async () => {
    expect(await droitReserverOuvertPourFile(QUEUE_ID)).toBe(true);
    // La jointure est ÉNUMÉRÉE, comme partout dans ce fichier.
    const lecture = state.selects.at(-1);
    expect(lecture?.table).toBe("reservation_queues");
    expect(lecture?.colonnes).toContain("organizations(");
  });

  it("rend `false` sans le droit `vitrine`", async () => {
    state.droitReserver = false;
    expect(await droitReserverOuvertPourFile(QUEUE_ID)).toBe(false);
  });

  it("rend `false` sur une file inconnue — le même refus, indistinctement", async () => {
    state.queueRow = null;
    expect(await droitReserverOuvertPourFile(QUEUE_ID)).toBe(false);
  });

  it("rend `false` sur une jointure inter-locataire", async () => {
    state.queueRow = {
      ...(state.queueRow as Record<string, unknown>),
      organization_id: "99999999-9999-4999-8999-999999999999",
    };
    expect(await droitReserverOuvertPourFile(QUEUE_ID)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// LE MODE ATTENTE ACTIVE (RES-4, lot L7) — la session, dans les deux contextes
//
// Ce que ces tests attestent :
//   · la session ne s'ouvre QUE pour quelqu'un qui attend réellement — ni le
//     visiteur sans identité, ni celui qui regarde la file avant d'y entrer ;
//   · l'organisation passée à la RPC est celle de la LIGNE lue, jamais une
//     valeur d'appelant ;
//   · une seule session par écran, même quand le navigateur détient plusieurs
//     réservations : vingt lignes pour un écran qui n'en montre qu'une seraient
//     vingt écritures pour rien ;
//   · le refus de la RPC n'est pas une panne — l'écran garde son rang, sans
//     animation. Le Mode Attente active est FACULTATIF.
// ════════════════════════════════════════════════════════════

/** Une place tenue par ce navigateur, telle que `queue_public_state` la rend. */
const MA_PLACE = {
  state: "in_queue",
  queue_name: "Comptoir",
  queue_status: "open",
  entry_id: "55555555-5555-4555-8555-555555555555",
  status: "waiting",
  position: 2,
  waiting_count: 5,
  joined_at: "2026-08-20T09:00:00Z",
  called_at: null,
};

describe("session d'attente — contexte PUBLIC d'une file", () => {
  it("ouvre la session sur l'ENTRÉE tenue, avec l'organisation de la file", async () => {
    state.empreinte = "b".repeat(64);
    state.etatFile = MA_PLACE;

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    const index = state.rpcs.indexOf("wait_session_open");
    expect(index).toBeGreaterThan(-1);
    expect(state.rpcArgs[index]).toEqual({
      p_organization_id: ORG_ID,
      p_player_key_hash: "b".repeat(64),
      p_queue_entry_id: MA_PLACE.entry_id,
      p_reservation_id: undefined,
    });
    expect(contexte.ok && contexte.attente?.animations).toEqual([
      "quiz",
      "pause",
    ]);
    expect(contexte.ok && contexte.attente?.pause).toBe("disponible");
  });

  it("N'OUVRE RIEN pour qui n'a pas de place — même avec une identité", async () => {
    // Le visiteur qui regarde la file avant d'y entrer n'attend rien : lui
    // ouvrir une session écrirait une ligne pour un écran sans animation.
    state.empreinte = "b".repeat(64);
    state.etatFile = { state: "not_in_queue", queue_name: "Comptoir" };

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(state.rpcs).not.toContain("wait_session_open");
    expect(contexte.ok && contexte.attente).toBeNull();
  });

  it("N'OUVRE RIEN sans identité : un rendu de page n'écrit pas de cookie", async () => {
    state.empreinte = null;

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(state.rpcs).not.toContain("wait_session_open");
    expect(contexte.ok && contexte.attente).toBeNull();
  });

  it("un refus de la RPC laisse le RANG intact et l'animation absente", async () => {
    // `unknown` n'est pas une panne : le Mode Attente active est facultatif, et
    // la file continue de fonctionner exactement comme avant RES-4.
    state.empreinte = "b".repeat(64);
    state.etatFile = MA_PLACE;
    state.sessionAttente = { state: "unknown" };

    const contexte = await loadReserverQueuePublicContext(QUEUE_ID);

    expect(contexte.ok).toBe(true);
    if (!contexte.ok) return;
    expect(contexte.attente).toBeNull();
    expect(contexte.maPlace?.position).toBe(2);
    expect(contexte.waitingCount).toBe(5);
  });
});

describe("session d'attente — contexte PUBLIC d'une activité", () => {
  /** Deux créneaux ouverts, dans l'ordre chronologique rendu par la base. */
  const AUTRE_SLOT = "66666666-6666-4666-8666-666666666666";
  const creneaux = [
    {
      id: SLOT_ID,
      organization_id: ORG_ID,
      activity_id: ACTIVITY_ID,
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
      capacity: 10,
      status: "open",
    },
    {
      id: AUTRE_SLOT,
      organization_id: ORG_ID,
      activity_id: ACTIVITY_ID,
      starts_at: "2026-09-08T12:00:00Z",
      ends_at: "2026-09-08T14:00:00Z",
      capacity: 10,
      status: "open",
    },
  ];

  function maReservation(slotId: string, status: string, id: string) {
    return {
      id,
      slot_id: slotId,
      organization_id: ORG_ID,
      code: "ABCD2345",
      status,
      created_at: "2026-08-20T08:00:00Z",
      cancelled_at: null,
      checked_in_at: status === "checked_in" ? "2026-09-01T12:05:00Z" : null,
      checked_in_by: null,
    };
  }

  it("ouvre UNE session, celle du PROCHAIN créneau confirmé", async () => {
    state.empreinte = "b".repeat(64);
    state.slots = creneaux;
    state.miennes = [
      maReservation(AUTRE_SLOT, "confirmed", "22222222-2222-4222-8222-222222222222"),
      maReservation(SLOT_ID, "confirmed", "11111111-1111-4111-8111-111111111111"),
    ];
    state.sessionAttente = {
      state: "open",
      session_id: "88888888-8888-4888-8888-888888888888",
      source: "reservation",
      quiz_id: null,
      pause_campaign_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      activity_id: ACTIVITY_ID,
      pause_chance_used: true,
    };

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);

    // UNE SEULE : deux réservations, un seul écran d'attente. C'est celle du
    // créneau le plus proche, le seul qu'on attende réellement.
    const ouvertures = state.rpcs.filter((nom) => nom === "wait_session_open");
    expect(ouvertures).toHaveLength(1);
    const index = state.rpcs.indexOf("wait_session_open");
    expect(state.rpcArgs[index]).toEqual({
      p_organization_id: ORG_ID,
      p_player_key_hash: "b".repeat(64),
      p_queue_entry_id: undefined,
      p_reservation_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(contexte.ok && contexte.attente?.pause).toBe("utilisee");
    expect(contexte.ok && contexte.attente?.animations).toEqual([
      "pause",
      "activite",
    ]);
  });

  it("N'OUVRE RIEN pour une arrivée déjà enregistrée : qui est arrivé n'attend plus", async () => {
    state.empreinte = "b".repeat(64);
    state.slots = [creneaux[0]];
    state.miennes = [
      maReservation(SLOT_ID, "checked_in", "11111111-1111-4111-8111-111111111111"),
    ];

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);

    expect(state.rpcs).not.toContain("wait_session_open");
    expect(contexte.ok && contexte.attente).toBeNull();
  });

  it("N'OUVRE RIEN sans identité ni réservation", async () => {
    state.slots = creneaux;

    const sansCookie = await loadReserverPublicContext(ACTIVITY_ID);
    expect(state.rpcs).not.toContain("wait_session_open");
    expect(sansCookie.ok && sansCookie.attente).toBeNull();

    state.rpcs = [];
    state.empreinte = "b".repeat(64);
    const sansPlace = await loadReserverPublicContext(ACTIVITY_ID);
    expect(state.rpcs).not.toContain("wait_session_open");
    expect(sansPlace.ok && sansPlace.attente).toBeNull();
  });

  it("ne fait DESCENDRE aucune configuration d'animation au visiteur", async () => {
    // La config vit sur l'activité, mais elle ne se lit QUE côté commerçant :
    // le visiteur d'une page publique n'a rien à savoir de ce qui sera proposé
    // à quelqu'un d'autre. Elle ne descend que par `wait_session_open`, et
    // seulement à qui détient une attente vivante.
    state.slots = creneaux;

    const contexte = await loadReserverPublicContext(ACTIVITY_ID);

    expect(contexte.ok && contexte.activity.waitQuizId).toBeNull();
    expect(contexte.ok && contexte.activity.waitPauseCampaignId).toBeNull();
    const lecture = state.selects.find(
      (s) => s.table === "reservation_activities",
    );
    expect(lecture?.colonnes).not.toContain("wait_quiz_id");
    expect(lecture?.colonnes).not.toContain("wait_pause_campaign_id");
  });
});

// ════════════════════════════════════════════════════════════
// loadStockOffersDashboardContext — LE RÔLE EST VÉRIFIÉ ICI (revue L9, M2)
//
// `stock_offers_staff_state` est `security definer` et ne demande AUCUNE
// appartenance : elle rend les offres de l'organisation qu'on lui nomme, point.
// Sa sûreté reposait donc entièrement sur une seule ligne de ce chargeur — celle
// qui lui passe l'organisation de la SESSION — sans qu'aucune garde ne le
// rappelle. Ces trois cas fixent le contrat, pour que la fuite ne soit pas à un
// paramètre de distance le jour où quelqu'un rend l'organisation configurable.
// ════════════════════════════════════════════════════════════

describe("loadStockOffersDashboardContext — la garde d'éditeur", () => {
  const ORG = {
    id: "11111111-1111-4111-8111-111111111111",
    subscription_status: "active",
    trial_ends_at: "2030-01-01T00:00:00Z",
    past_due_since: null,
    addon_reserver: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Indian/Reunion",
  };

  it("sans session : `unauthenticated`, et AUCUNE RPC n'est appelée", async () => {
    const res = await loadStockOffersDashboardContext();
    expect(res).toEqual({ ok: false, reason: "unauthenticated" });
    expect(state.rpcs).toEqual([]);
  });

  it("un CAISSIER n'ouvre pas le panneau d'offres — et rien n'est lu", async () => {
    // ROUGE SI : quelqu'un retire la garde de rôle. Le caissier a son écran, le
    // comptoir ; ce panneau-ci est du paramétrage (créer une offre, fixer un
    // stock, rééditer une fenêtre), motif `gardeEditeurReserver`.
    state.session = { user: { id: "u1" }, organization: ORG, role: "cashier" };
    const res = await loadStockOffersDashboardContext();
    expect(res).toEqual({ ok: false, reason: "no_access" });
    // La preuve qui compte : la RPC service_role n'est JAMAIS atteinte.
    expect(state.rpcs).toEqual([]);
  });

  it("un ÉDITEUR lit ses offres, et l'organisation vient de la SESSION", async () => {
    state.session = { user: { id: "u1" }, organization: ORG, role: "editor" };
    state.stockOffersStaffState = { state: "ok", offers: [] };

    const res = await loadStockOffersDashboardContext();

    expect(res.ok).toBe(true);
    expect(res.ok && res.organizationId).toBe(ORG.id);
    expect(state.rpcs).toEqual(["stock_offers_staff_state"]);
    // Jamais d'ailleurs que de la session : c'est l'invariant que la garde de
    // rôle vient doubler.
    expect(state.rpcArgs[0]).toEqual({ p_organization_id: ORG.id });
  });
});
