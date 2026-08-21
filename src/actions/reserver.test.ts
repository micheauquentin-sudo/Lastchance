import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Actions du module Réserver (RES-1b) — anti-Sybil, acteur de session, RGPD.
//
// Ce que ces tests attestent, et qui est le cœur du lot :
//   · le seau `failClosed` porte sur la CLÉ COOKIE (identité), jamais sur l'IP
//     ni sur l'organisation — clés PARTAGÉES derrière le Wi-Fi d'un commerce
//     (ADR-032) ;
//   · le plafond par APPAREIL est tranché AVANT le seau par organisation, et
//     l'observation IP SEULE avant l'observation par organisation (wagon 7) ;
//   · le challenge Turnstile n'est opposé QUE sur l'appel ÉMETTEUR, et
//     UNIQUEMENT si les clés sont configurées (motif `finishQuiz`) ;
//   · l'email ne part QUE consenti, hors du chemin de réponse, et son échec est
//     avalé — une place prise ne se défait pas parce que Resend tousse ;
//   · au comptoir, l'acteur vient de la SESSION, jamais du corps ;
//   · les gestes de configuration exigent le droit `vitrine` ET le rôle éditeur.
// ────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SLOT_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const RESERVATION_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const EMPREINTE = "a".repeat(64);

const { state, makeAdmin, makeRlsClient } = vi.hoisted(() => {
  const state = {
    empreinte: "a".repeat(64) as string | null,
    reserveResponse: { state: "reserved", reservation_id: "r", code: "ABCD2345", remaining: 2 } as unknown,
    cancelResponse: { state: "cancelled" } as unknown,
    checkinResponse: [] as unknown,
    publicStateResponse: { state: "ok", timezone: "Europe/Paris", reservations: [], waitlist: [] } as unknown,
    cancelStaffResponse: { state: "cancelled" } as unknown,
    waitlistJoinResponse: { state: "waiting", entry_id: "e1", status: "waiting", position: 2 } as unknown,
    claimResponse: {
      state: "claimed",
      entry_id: "e1",
      reservation_id: "44444444-4444-4444-8444-444444444444",
      code: "ABCD2345",
      status: "confirmed",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
    } as unknown,
    leaveResponse: { state: "left", entry_id: "e1", cancelled_at: "2026-08-20T10:00:00Z" } as unknown,
    redeemResponse: {
      state: "reserved",
      reservation_id: "44444444-4444-4444-8444-444444444444",
      code: "ABCD2345",
      invitation_id: "i1",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T14:00:00Z",
      activity_name: "Dégustation",
      remaining: 3,
    } as unknown,
    createInvitationResponse: { state: "created", invitation_id: "i1", max_uses: 5, expires_at: null } as unknown,
    /** La FILE que `queueJoin` résout — c'est ELLE qui porte l'organisation. */
    queueRow: {
      id: "88888888-8888-4888-8888-888888888888",
      organization_id: "11111111-1111-4111-8111-111111111111",
    } as Record<string, unknown> | null,
    queueJoinResponse: {
      state: "waiting",
      entry_id: "q1",
      status: "waiting",
      position: 3,
      waiting_count: 3,
      called_at: null,
    } as unknown,
    queueLeaveResponse: {
      state: "left",
      entry_id: "q1",
      resolved_at: "2026-08-20T10:00:00Z",
    } as unknown,
    queueCallResponse: {
      state: "called",
      entry_id: "q1",
      display_name: "Camille",
      called_at: "2026-08-20T10:00:00Z",
      waiting_count: 2,
    } as unknown,
    queueResolveResponse: {
      state: "served",
      entry_id: "q1",
      resolved_at: "2026-08-20T10:01:00Z",
    } as unknown,
    queueReopenResponse: { state: "waiting", entry_id: "q1", position: 1 } as unknown,
    queueStaffResponse: {
      state: "ok",
      queue: {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Comptoir",
        status: "open",
        max_live_entries: 50,
        activity_id: null,
        activity_name: null,
      },
      timezone: "Indian/Reunion",
      entries: [],
      live: { waiting: 0, called: 0 },
      today: { served: 0, no_show: 0, left: 0 },
    } as unknown,
    queuePublicResponse: {
      state: "in_queue",
      queue_name: "Comptoir",
      queue_status: "open",
      entry_id: "q1",
      status: "waiting",
      position: 2,
      waiting_count: 4,
      joined_at: "2026-08-20T09:00:00Z",
      called_at: null,
    } as unknown,
    /** La ligne que la résolution par POSSESSION rapporte, ou `null`. */
    entreeFile: {
      id: "66666666-6666-4666-8666-666666666666",
      organization_id: "11111111-1111-4111-8111-111111111111",
      email: "client@exemple.fr",
      consent_transactional_at: "2026-08-20T09:00:00Z",
    } as Record<string, unknown> | null,
    /** La ligne que la résolution PAR JETON rapporte, ou `null`. */
    invitationRow: {
      id: "i1",
      organization_id: "11111111-1111-4111-8111-111111111111",
    } as Record<string, unknown> | null,
    /**
     * Ce que `reservation_activity_live_commitments` rend au panneau avant
     * d'autoriser un changement de format (RES-5, migration 20261009120000).
     * Par défaut : rien d'engagé, donc tous les réglages passent — c'est l'état
     * de la quasi-totalité des cas, et celui que les tests d'avant supposaient.
     */
    activityCommitments: {
      state: "ok",
      kind: "standard",
      reservations: 0,
      waitlist: 0,
    } as unknown,
    /**
     * Les RPC qui doivent RÉPONDRE EN ERREUR, par nom. Vide par défaut : une
     * panne se demande explicitement, elle ne s'obtient pas par omission.
     */
    rpcErreurs: [] as string[],
    /**
     * Ce que `stock_offer_public_state` rend au GARDE-FOU DU PONT (revue L9,
     * M1). Par défaut : une offre servable — c'est l'état de la quasi-totalité
     * des appels, et celui que les tests écrits avant le garde-fou supposent.
     */
    stockOfferPublicState: {
      state: "ok",
      offer_id: "99999999-9999-4999-8999-999999999999",
      title: "Panier surprise",
      status: "open",
      window_starts_at: "2030-04-12T16:00:00Z",
      window_ends_at: "2030-04-12T18:00:00Z",
      per_player_limit: 1,
      remaining: 4,
      my_hold: null,
    } as unknown,
    /** Ce que `hold_stock_offer` rend (RES-5, lot L9). */
    stockHoldResponse: {
      state: "held",
      hold_id: "77777777-7777-4777-8777-777777777777",
      code: "RESA-ABCD2345",
      window_starts_at: "2030-04-12T16:00:00Z",
      window_ends_at: "2030-04-12T18:00:00Z",
      redeem_expires_at: "2030-04-12T18:00:00Z",
      remaining: 4,
    } as unknown,
    stockCancelResponse: {
      state: "cancelled",
      hold_id: "77777777-7777-4777-8777-777777777777",
      cancelled_at: "2030-04-12T15:00:00Z",
    } as unknown,
    /** Les ponts d'identité posés, dans l'ORDRE — c'est l'ordre qui compte. */
    pontsIdentite: [] as Array<{ kind: string; experienceId: string }>,
    /** Traces d'appels, dans l'ordre : pont, RPC, lecture d'état. */
    chronologie: [] as string[],
    selects: [] as Array<{ table: string; colonnes: string }>,
    filtres: [] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rateLimitCalls: [] as Array<{ bucket: string; failClosed: boolean }>,
    rateLimitVerdict: true,
    /** Préfixes de seaux rendus À SEC, indépendamment du verdict global. */
    seauxASec: [] as string[],
    compteurs: [] as string[],
    pressions: [] as Array<{ parts: string; evenement: string }>,
    turnstileConfigure: false,
    turnstileVerdict: true,
    turnstileJetons: [] as Array<string | undefined>,
    emails: [] as Array<Record<string, unknown>>,
    emailLeve: false,
    taches: [] as Array<Promise<unknown>>,
    role: "owner" as string | null,
    orgAddonVitrine: true,
    /** Le droit `vitrine` de l'organisation qui PORTE la file scrutée. */
    droitVitrineFile: true,
    /** Combien de fois le scrutin a résolu ce droit — une lecture se compte. */
    droitVitrineFileAppels: 0,
    evenementsSecurite: [] as string[],
    rlsWrites: [] as Array<{ table: string; op: string; values: Record<string, unknown>; filters: Record<string, unknown> }>,
    rlsError: null as { message: string; code?: string } | null,
    reset() {
      state.empreinte = "a".repeat(64);
      state.reserveResponse = { state: "reserved", reservation_id: "r", code: "ABCD2345", remaining: 2 };
      state.cancelResponse = { state: "cancelled" };
      state.checkinResponse = [];
      state.publicStateResponse = { state: "ok", timezone: "Europe/Paris", reservations: [], waitlist: [] };
      state.cancelStaffResponse = { state: "cancelled" };
      state.waitlistJoinResponse = { state: "waiting", entry_id: "e1", status: "waiting", position: 2 };
      state.claimResponse = {
        state: "claimed",
        entry_id: "e1",
        reservation_id: "44444444-4444-4444-8444-444444444444",
        code: "ABCD2345",
        status: "confirmed",
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
      };
      state.leaveResponse = { state: "left", entry_id: "e1", cancelled_at: "2026-08-20T10:00:00Z" };
      state.redeemResponse = {
        state: "reserved",
        reservation_id: "44444444-4444-4444-8444-444444444444",
        code: "ABCD2345",
        invitation_id: "i1",
        starts_at: "2026-09-01T12:00:00Z",
        ends_at: "2026-09-01T14:00:00Z",
        activity_name: "Dégustation",
        remaining: 3,
      };
      state.createInvitationResponse = { state: "created", invitation_id: "i1", max_uses: 5, expires_at: null };
      state.queueRow = {
        id: "88888888-8888-4888-8888-888888888888",
        organization_id: "11111111-1111-4111-8111-111111111111",
      };
      state.queueJoinResponse = {
        state: "waiting",
        entry_id: "q1",
        status: "waiting",
        position: 3,
        waiting_count: 3,
        called_at: null,
      };
      state.queueLeaveResponse = {
        state: "left",
        entry_id: "q1",
        resolved_at: "2026-08-20T10:00:00Z",
      };
      state.queueCallResponse = {
        state: "called",
        entry_id: "q1",
        display_name: "Camille",
        called_at: "2026-08-20T10:00:00Z",
        waiting_count: 2,
      };
      state.queueResolveResponse = {
        state: "served",
        entry_id: "q1",
        resolved_at: "2026-08-20T10:01:00Z",
      };
      state.queueReopenResponse = { state: "waiting", entry_id: "q1", position: 1 };
      state.queueStaffResponse = {
        state: "ok",
        queue: {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Comptoir",
          status: "open",
          max_live_entries: 50,
          activity_id: null,
          activity_name: null,
        },
        timezone: "Indian/Reunion",
        entries: [],
        live: { waiting: 0, called: 0 },
        today: { served: 0, no_show: 0, left: 0 },
      };
      state.queuePublicResponse = {
        state: "in_queue",
        queue_name: "Comptoir",
        queue_status: "open",
        entry_id: "q1",
        status: "waiting",
        position: 2,
        waiting_count: 4,
        joined_at: "2026-08-20T09:00:00Z",
        called_at: null,
      };
      state.entreeFile = {
        id: "66666666-6666-4666-8666-666666666666",
        organization_id: "11111111-1111-4111-8111-111111111111",
        email: "client@exemple.fr",
        consent_transactional_at: "2026-08-20T09:00:00Z",
      };
      state.invitationRow = {
        id: "i1",
        organization_id: "11111111-1111-4111-8111-111111111111",
      };
      state.activityCommitments = {
        state: "ok",
        kind: "standard",
        reservations: 0,
        waitlist: 0,
      };
      state.rpcErreurs = [];
      state.stockOfferPublicState = {
        state: "ok",
        offer_id: "99999999-9999-4999-8999-999999999999",
        title: "Panier surprise",
        status: "open",
        window_starts_at: "2030-04-12T16:00:00Z",
        window_ends_at: "2030-04-12T18:00:00Z",
        per_player_limit: 1,
        remaining: 4,
        my_hold: null,
      };
      state.stockHoldResponse = {
        state: "held",
        hold_id: "77777777-7777-4777-8777-777777777777",
        code: "RESA-ABCD2345",
        window_starts_at: "2030-04-12T16:00:00Z",
        window_ends_at: "2030-04-12T18:00:00Z",
        redeem_not_before: "2030-04-12T16:00:00Z",
        redeem_expires_at: "2030-04-12T18:00:00Z",
        remaining: 4,
      };
      state.stockCancelResponse = {
        state: "cancelled",
        hold_id: "77777777-7777-4777-8777-777777777777",
        cancelled_at: "2030-04-12T15:00:00Z",
      };
      state.pontsIdentite = [];
      state.chronologie = [];
      state.selects = [];
      state.filtres = [];
      state.rpcCalls = [];
      state.rateLimitCalls = [];
      state.rateLimitVerdict = true;
      state.seauxASec = [];
      state.compteurs = [];
      state.pressions = [];
      state.turnstileConfigure = false;
      state.turnstileVerdict = true;
      state.turnstileJetons = [];
      state.emails = [];
      state.emailLeve = false;
      state.taches = [];
      state.role = "owner";
      state.orgAddonVitrine = true;
      state.droitVitrineFile = true;
      state.droitVitrineFileAppels = 0;
      state.evenementsSecurite = [];
      state.rlsWrites = [];
      state.rlsError = null;
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        state.chronologie.push(`rpc:${name}`);
        if (state.rpcErreurs.includes(name)) {
          return Promise.resolve({
            data: null,
            error: { message: `${name} indisponible` },
          });
        }
        if (name === "stock_offer_public_state") {
          return Promise.resolve({
            data: state.stockOfferPublicState,
            error: null,
          });
        }
        if (name === "hold_stock_offer") {
          return Promise.resolve({ data: state.stockHoldResponse, error: null });
        }
        if (name === "cancel_stock_hold") {
          return Promise.resolve({
            data: state.stockCancelResponse,
            error: null,
          });
        }
        if (name === "reserve_slot") {
          return Promise.resolve({ data: state.reserveResponse, error: null });
        }
        if (name === "cancel_reservation") {
          return Promise.resolve({ data: state.cancelResponse, error: null });
        }
        if (name === "cancel_reservation_staff") {
          return Promise.resolve({ data: state.cancelStaffResponse, error: null });
        }
        if (name === "checkin_reservation") {
          return Promise.resolve({ data: state.checkinResponse, error: null });
        }
        if (name === "waitlist_join") {
          return Promise.resolve({ data: state.waitlistJoinResponse, error: null });
        }
        if (name === "claim_waitlist_offer") {
          return Promise.resolve({ data: state.claimResponse, error: null });
        }
        if (name === "waitlist_leave") {
          return Promise.resolve({ data: state.leaveResponse, error: null });
        }
        if (name === "redeem_invitation") {
          return Promise.resolve({ data: state.redeemResponse, error: null });
        }
        if (name === "create_reservation_invitation") {
          return Promise.resolve({ data: state.createInvitationResponse, error: null });
        }
        if (name === "revoke_reservation_invitation") {
          return Promise.resolve({
            data: { state: "revoked", invitation_id: "i1", revoked_at: "2026-08-20T10:00:00Z" },
            error: null,
          });
        }
        if (name === "queue_join") {
          return Promise.resolve({ data: state.queueJoinResponse, error: null });
        }
        if (name === "queue_leave") {
          return Promise.resolve({ data: state.queueLeaveResponse, error: null });
        }
        if (name === "queue_call_next") {
          return Promise.resolve({ data: state.queueCallResponse, error: null });
        }
        if (name === "queue_resolve") {
          return Promise.resolve({ data: state.queueResolveResponse, error: null });
        }
        if (name === "queue_reopen_entry") {
          return Promise.resolve({ data: state.queueReopenResponse, error: null });
        }
        if (name === "queue_staff_state") {
          return Promise.resolve({ data: state.queueStaffResponse, error: null });
        }
        if (name === "queue_public_state") {
          return Promise.resolve({ data: state.queuePublicResponse, error: null });
        }
        if (name === "reservation_activity_live_commitments") {
          return Promise.resolve({ data: state.activityCommitments, error: null });
        }
        if (name === "close_reservation_invitation") {
          return Promise.resolve({
            data: { state: "closed", invitation_id: "i1", closed_at: "2026-08-20T10:00:00Z" },
            error: null,
          });
        }
        return Promise.resolve({ data: state.publicStateResponse, error: null });
      },
      from(table: string) {
        const filtres: Record<string, unknown> = {};
        const builder = {
          select: (colonnes: string) => {
            state.selects.push({ table, colonnes });
            return builder;
          },
          eq: (colonne: string, valeur: unknown) => {
            filtres[colonne] = valeur;
            return builder;
          },
          maybeSingle: () => {
            state.filtres.push({ table, ...filtres });
            if (table === "reservation_waitlist_entries") {
              return Promise.resolve({ data: state.entreeFile, error: null });
            }
            if (table === "reservation_invitations") {
              return Promise.resolve({ data: state.invitationRow, error: null });
            }
            if (table === "reservation_queues") {
              return Promise.resolve({ data: state.queueRow, error: null });
            }
            if (table === "reservations") {
              return Promise.resolve({
                data: { id: "44444444-4444-4444-8444-444444444444", slot_id: "22222222-2222-4222-8222-222222222222" },
                error: null,
              });
            }
            if (table === "reservation_slots") {
              return Promise.resolve({
                data: {
                  id: "22222222-2222-4222-8222-222222222222",
                  activity_id: "33333333-3333-4333-8333-333333333333",
                  starts_at: "2026-09-01T12:00:00Z",
                  ends_at: "2026-09-01T14:00:00Z",
                },
                error: null,
              });
            }
            if (table === "reservation_stock_offers") {
              return Promise.resolve({
                data: {
                  id: "99999999-9999-4999-8999-999999999999",
                  title: "Panier surprise",
                },
                error: null,
              });
            }
            if (table === "reservation_activities") {
              return Promise.resolve({
                data: { id: "33333333-3333-4333-8333-333333333333", name: "Dégustation" },
                error: null,
              });
            }
            return Promise.resolve({
              data: { name: "Chez Marco", timezone: "Europe/Paris" },
              error: null,
            });
          },
        };
        return builder;
      },
    };
  }

  function makeRlsClient() {
    return {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          insert: (values: Record<string, unknown>) => {
            state.rlsWrites.push({ table, op: "insert", values, filters });
            return Promise.resolve({ error: state.rlsError });
          },
          update: (values: Record<string, unknown>) => {
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              then: (resolve: (v: unknown) => unknown) => {
                state.rlsWrites.push({ table, op: "update", values, filters });
                return Promise.resolve({ error: state.rlsError }).then(resolve);
              },
            };
            return chain;
          },
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin, makeRlsClient };
});

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => null }),
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

/**
 * LA PURGE DE LA VITRINE EST FEINTE, ET OBSERVÉE (revue L13, M3).
 *
 * `revaliderVitrinePublique` lit `vitrine_settings` puis appelle
 * `revalidatePath` : deux choses que ce fichier n'a aucune raison de rejouer —
 * le vrai comportement de la purge est tenu par les tests de `@/actions/vitrine`
 * et par `revalidate-vitrine` lui-même. Ce qu'on veut prouver ICI est le
 * CÂBLAGE : les trois familles de drapeaux publiés par la vitrine (activité
 * active, file `open`, offre `open`) la déclenchent après leur succès.
 *
 * Motif exact de `campaigns.test.ts` avec `@/lib/revalidate-play`.
 */
const purgeVitrine = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/revalidate-vitrine", () => ({
  revaliderVitrinePublique: purgeVitrine,
}));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    state.taches.push(Promise.resolve().then(fn));
  },
}));

// `generateInvitationToken` et `hashInvitationToken` sont RÉELS : ce sont deux
// fonctions pures (`node:crypto`), et c'est précisément le contrat de hachage
// qu'on veut voir tenu — un faux qui rendrait « hash » ferait passer le test
// qui vérifie que le clair ne descend jamais.
vi.mock("@/lib/reserver-context", async (importOriginal) => {
  const { createHash, randomBytes } = await import("node:crypto");
  void importOriginal;
  return {
    assurerIdentiteReserver: () => Promise.resolve(state.empreinte),
    lireIdentiteReserver: () => Promise.resolve(state.empreinte),
    generateInvitationToken: () => randomBytes(24).toString("base64url"),
    hashInvitationToken: (jeton: string) =>
      /^[A-Za-z0-9_-]{32}$/.test(jeton.trim())
        ? createHash("sha256").update(jeton.trim()).digest("hex")
        : null,
    // Le SCRUTIN public passe par le lecteur partagé du chargeur : ce faux ne
    // rend que ce que la RPC rendrait, MAPPÉ — c'est le contrat que l'action
    // doit respecter (une lecture, pas deux), pas la lecture elle-même, qui a
    // ses propres tests dans `reserver-context.test.ts`.
    lireEtatFilePublic: async (_queueId: string, empreinte: string | null) => {
      const { mapQueuePublicState } = await import("@/lib/reserver");
      return mapQueuePublicState(
        empreinte ? state.queuePublicResponse : { state: "not_in_queue" },
      );
    },
    // La garde vitrine du scrutin : sa lecture réelle (jointure + garde
    // inter-tenant + `moduleOuvertAuJoueur`) a ses tests dans
    // `reserver-context.test.ts`. Ce que l'action doit tenir, c'est QUAND elle
    // l'appelle — et le compteur ci-dessous l'atteste.
    droitVitrineOuvertPourFile: () => {
      state.droitVitrineFileAppels += 1;
      return Promise.resolve(state.droitVitrineFile);
    },
    // La lecture d'état d'une offre de stock passe par le MÊME lecteur partagé
    // que la page (motif `lireEtatFilePublic`). Ce faux ne rend que ce que la
    // RPC rendrait, MAPPÉ : ce que l'action doit tenir, c'est de n'en faire
    // QU'UNE, et de passer l'empreinte telle quelle.
    lireEtatOffreStock: async (offerId: string, empreinte: string | null) => {
      state.chronologie.push("lecture:offre");
      const { mapStockOfferPublicState } = await import("@/lib/reserver");
      return mapStockOfferPublicState({
        state: "ok",
        offer_id: offerId,
        title: "Panier surprise",
        description: null,
        status: "open",
        window_starts_at: "2030-04-12T16:00:00Z",
        window_ends_at: "2030-04-12T18:00:00Z",
        per_player_limit: 1,
        remaining: 3,
        my_hold: empreinte
          ? {
              hold_id: "77777777-7777-4777-8777-777777777777",
              code: "RESA-ABCD2345",
              status: "held",
              redeem_expires_at: "2030-04-12T18:00:00Z",
            }
          : null,
      });
    },
  };
});

// Le PONT D'IDENTITÉ est espionné, pas exécuté : sa justesse (bon triplet, bonne
// empreinte) a ses propres tests, et son miroir pgTAP. Ce qui se joue ICI est
// l'ORDRE — le pont AVANT `hold_stock_offer`, sans quoi le miroir du registre
// écrit `player_id` nul et la prise n'atteint jamais `/portefeuille`.
vi.mock("@/lib/player-identity", () => ({
  ensureProgressivePlayerIdentity: (input: {
    experienceKind: string;
    experienceId: string;
  }) => {
    state.pontsIdentite.push({
      kind: input.experienceKind,
      experienceId: input.experienceId,
    });
    state.chronologie.push("pont");
    return Promise.resolve({ ok: true });
  },
  bridgeOfferedSpinToCampaign: () => Promise.resolve(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(makeRlsClient()),
}));

vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () =>
    Promise.resolve({
      user: state.role ? { id: "55555555-5555-4555-8555-555555555555" } : null,
      organization: state.role
        ? {
            id: "11111111-1111-4111-8111-111111111111",
            timezone: "Europe/Paris",
            subscription_status: "active",
            trial_ends_at: "2030-01-01T00:00:00Z",
            past_due_since: null,
            comp_access: false,
            comp_access_until: null,
            addon_vitrine: state.orgAddonVitrine,
            live_module_grants: [],
          }
        : null,
      role: state.role,
      memberships: [],
    }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...reel,
    rateLimit: (bucket: string, _rule: unknown, options?: { failClosed?: boolean }) => {
      state.rateLimitCalls.push({ bucket, failClosed: options?.failClosed === true });
      if (state.seauxASec.some((prefixe) => bucket.startsWith(prefixe))) {
        return Promise.resolve(false);
      }
      return Promise.resolve(state.rateLimitVerdict);
    },
  };
});

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

vi.mock("@/lib/turnstile", () => ({
  turnstileEnabled: () => state.turnstileConfigure,
  verifyTurnstile: (jeton: string | undefined) => {
    state.turnstileJetons.push(jeton);
    return Promise.resolve(state.turnstileVerdict);
  },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  recordCounter: (op: string) => {
    state.compteurs.push(op);
  },
  reportSecurityEvent: (evenement: string) => {
    state.evenementsSecurite.push(evenement);
  },
}));

vi.mock("@/lib/resend", () => ({
  sendReservationConfirmationEmail: (params: Record<string, unknown>) => {
    state.emails.push(params);
    if (state.emailLeve) return Promise.reject(new Error("resend indisponible"));
    return Promise.resolve(true);
  },
  sendStockHoldConfirmationEmail: (params: Record<string, unknown>) => {
    state.emails.push(params);
    if (state.emailLeve) return Promise.reject(new Error("resend indisponible"));
    return Promise.resolve(true);
  },
}));

import {
  cancelReservation,
  cancelReservationStaff,
  cancelStockHold,
  checkinReservation,
  claimWaitlistOffer,
  closeInvitation,
  createInvitation,
  createReserverActivity,
  createReserverQueue,
  createReserverSlot,
  createStockOffer,
  getQueuePublicState,
  holdStockOffer,
  loadStockOfferPublic,
  getQueueStaffState,
  loadMyReservations,
  queueCallNext,
  queueJoin,
  queueLeave,
  queueReopen,
  queueResolve,
  redeemInvitation,
  reserveSlot,
  revokeInvitation,
  updateReserverActivity,
  updateReserverQueue,
  updateReserverSlotStatus,
  updateStockOffer,
  waitlistJoin,
  waitlistLeave,
} from "@/actions/reserver";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(entries)) fd.set(cle, valeur);
  return fd;
}

beforeEach(() => {
  state.reset();
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reserveSlot — anti-Sybil et ordre des seaux", () => {
  it("porte le failClosed sur la clé COOKIE, et l'appareil AVANT l'organisation", async () => {
    await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });

    const fermes = state.rateLimitCalls.filter((appel) => appel.failClosed);
    expect(fermes).toHaveLength(2);
    // Aucun seau fail-closed ne porte sur l'IP ni sur le seul identifiant de
    // l'organisation : ce sont des clés PARTAGÉES (ADR-032).
    for (const appel of fermes) expect(appel.bucket).toContain(EMPREINTE);
    // Plafond par APPAREIL d'abord (le second seau est composé avec un
    // `organization_id` fourni par le client).
    expect(state.rateLimitCalls[0].bucket).toBe(`reserver:device:${EMPREINTE}`);
    expect(state.rateLimitCalls[1].bucket).toBe(
      `reserver:player:${ORG_ID}:${EMPREINTE}`,
    );
  });

  it("observe l'IP SEULE avant l'IP par organisation, et ne refuse jamais dessus", async () => {
    await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
      "reserver_public_pressure",
    ]);
    expect(state.pressions[0].parts).toBe("reserver:ip");
    expect(state.pressions[1].parts).toBe(`reserver:public:ip:${ORG_ID}`);
    // La réservation aboutit malgré la pression : ces compteurs ne portent
    // aucune porte.
    expect(state.rpcCalls.some((appel) => appel.name === "reserve_slot")).toBe(true);
  });

  it("refuse quand le seau d'identité est saturé, AVANT toute requête", async () => {
    state.rateLimitVerdict = false;
    const resultat = await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });

    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.pressions).toHaveLength(0);
  });

  it("refuse sans identité de cookie exploitable", async () => {
    state.empreinte = null;
    const resultat = await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("transmet l'empreinte du COOKIE à la RPC, jamais une valeur du corps", async () => {
    await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      // @ts-expect-error — champ hors schéma : il ne doit jamais atteindre la RPC.
      playerKeyHash: "b".repeat(64),
    });

    const appel = state.rpcCalls.find((c) => c.name === "reserve_slot");
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    // AUCUN code fourni : le trigger le pose, et le choisir depuis l'application
    // ferait reposer son imprévisibilité sur la discipline de l'appelant.
    expect(Object.keys(appel?.args ?? {})).not.toContain("p_code");
  });

  it("transmet la taille demandée — 2 pour la surface duo (RES-5)", async () => {
    // Elle ne DÉCIDE de rien : `reserve_slot` la compare, sous verrou, à l'unité
    // du format, et refuse `invalid_party_size` si les deux divergent. Ce que ce
    // test garde, c'est qu'elle arrive jusque-là.
    await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID, partySize: 2 });
    const appel = state.rpcCalls.find((c) => c.name === "reserve_slot");
    expect(appel?.args.p_party_size).toBe(2);
  });

  it("REFUSE une taille hors de 1..2 sans déranger la base", async () => {
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      partySize: 40,
    });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("reserveSlot — le challenge anti-robot", () => {
  it("n'oppose AUCUN challenge tant que les clés ne sont pas configurées", async () => {
    state.turnstileConfigure = false;
    state.turnstileVerdict = false;
    const resultat = await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });

    expect(resultat.ok).toBe(true);
    expect(state.rpcCalls.some((c) => c.name === "reserve_slot")).toBe(true);
  });

  it("exige la clé PUBLIQUE aussi : sans widget, pas de refus sans issue", async () => {
    state.turnstileConfigure = true;
    state.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";

    const resultat = await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(resultat.ok).toBe(true);
  });

  it("refuse AVANT la RPC quand le challenge est configuré et échoue", async () => {
    state.turnstileConfigure = true;
    state.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const resultat = await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.challengeRequired).toBe(true);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("transmet le jeton VALIDÉ, et refuse celui qui dépasse la borne du schéma", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      turnstileToken: "jeton-valide",
    });
    expect(state.turnstileJetons).toEqual(["jeton-valide"]);

    // Au-delà de 2048, le schéma refuse — et rien ne part vers Cloudflare. Le
    // jeton relayé vient donc de `parsed.data`, jamais du corps brut : c'est ce
    // qui garantit que la borne de longueur a bien été franchie avant l'appel
    // sortant (INFO-1 de la revue L4).
    state.rpcCalls = [];
    const trop = "x".repeat(2049);
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      turnstileToken: trop,
    });
    expect(resultat.ok).toBe(false);
    expect(state.turnstileJetons).toEqual(["jeton-valide"]);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("reserveSlot — l'anti-arrosage de la boîte d'un tiers", () => {
  it("consomme un seau fail-closed PAR ADRESSE avant d'envoyer", async () => {
    await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "Client@Exemple.fr",
      consent: true,
    });

    const seau = state.rateLimitCalls.find((appel) =>
      appel.bucket.startsWith("reserver:email"),
    );
    // La clé porte l'ADRESSE NORMALISÉE : deux orthographes de la même boîte
    // partagent le seau. Elle est propre à UN destinataire, donc `failClosed`
    // reste conforme à ADR-032 — la saturer ne coupe l'email de personne d'autre.
    expect(seau?.bucket).toBe(`reserver:email:${ORG_ID}:client@exemple.fr`);
    expect(seau?.failClosed).toBe(true);

    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(1);
  });

  it("à sec : AUCUN envoi, la réservation reste valide, et c'est COMPTÉ", async () => {
    state.seauxASec = ["reserver:email"];
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "client@exemple.fr",
      consent: true,
    });

    // La place est prise — le code est déjà dans la réponse, l'email n'a jamais
    // été la preuve.
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.data.state).toBe("reserved");
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
    // Un envoi sauté en silence serait indistinguable d'une panne Resend.
    expect(state.compteurs).toContain("reserver.email.throttled");
  });

  it("ne consomme ce seau QUE lorsqu'un envoi est réellement dû", async () => {
    // Sans consentement, aucune adresse : rien à arroser, donc rien à compter.
    await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(
      state.rateLimitCalls.some((a) => a.bucket.startsWith("reserver:email")),
    ).toBe(false);
  });
});

describe("reserveSlot — email et consentement", () => {
  it("refuse une adresse sans consentement, sans toucher à la base", async () => {
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "client@exemple.fr",
      consent: false,
    });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("transmet adresse ET consentement ensemble, puis envoie hors du chemin de réponse", async () => {
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "Client@Exemple.fr",
      consent: true,
    });

    const appel = state.rpcCalls.find((c) => c.name === "reserve_slot");
    expect(appel?.args.p_email).toBe("client@exemple.fr");
    expect(appel?.args.p_consent).toBe(true);
    // Le parcours d'hier réserve pour UNE personne, sans avoir à le dire.
    expect(appel?.args.p_party_size).toBe(1);
    expect(resultat.ok).toBe(true);
    // L'envoi n'a PAS retardé la réponse : il vit dans `after()`.
    expect(state.emails).toHaveLength(0);

    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].to).toBe("client@exemple.fr");
    expect(state.emails[0].code).toBe("ABCD2345");
    // Une ADRESSE, jamais un jeton : ni code, ni identifiant, ni empreinte.
    expect(String(state.emails[0].statusUrl)).toContain(`/reserver/${ACTIVITY_ID}`);
    expect(String(state.emails[0].statusUrl)).not.toContain("ABCD2345");
    expect(String(state.emails[0].statusUrl)).not.toContain("?");
  });

  it("n'envoie RIEN sans consentement, ni sur un état autre que `reserved`", async () => {
    await reserveSlot({ organizationId: ORG_ID, slotId: SLOT_ID });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);

    state.reserveResponse = { state: "full", capacity: 4 };
    await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
  });

  it("avale l'échec d'envoi : une place prise ne se défait pas", async () => {
    state.emailLeve = true;
    const resultat = await reserveSlot({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    expect(resultat.ok).toBe(true);
    await expect(Promise.all(state.taches)).resolves.toBeDefined();
  });
});

describe("cancelReservation / loadMyReservations", () => {
  it("annule sur preuve de possession : identifiant + empreinte, aucune organisation", async () => {
    const resultat = await cancelReservation({ reservationId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);

    const appel = state.rpcCalls.find((c) => c.name === "cancel_reservation");
    expect(appel?.args).toEqual({
      p_reservation_id: RESERVATION_ID,
      p_player_key_hash: EMPREINTE,
    });
  });

  it("n'oppose AUCUN challenge à l'annulation — rendre une place n'a pas à frotter", async () => {
    state.turnstileConfigure = true;
    state.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const resultat = await cancelReservation({ reservationId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);
  });

  it("sans cookie, l'annulation n'atteint pas la base", async () => {
    state.empreinte = null;
    const resultat = await cancelReservation({ reservationId: RESERVATION_ID });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("sans cookie, « mes réservations » est une LISTE VIDE, pas une erreur", async () => {
    state.empreinte = null;
    const resultat = await loadMyReservations({ organizationId: ORG_ID });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.data.reservations).toEqual([]);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("borne la relecture à UNE organisation", async () => {
    await loadMyReservations({ organizationId: ORG_ID });
    const appel = state.rpcCalls.find((c) => c.name === "reservation_public_state");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
  });

  // ── L'INVENTAIRE DES SEAUX DIT VRAI (M-2 de la revue L4) ──
  // Il attribuait ces compteurs aux trois actions publiques alors que seule
  // `reserveSlot` les consommait. Ces deux tests sont ce qui l'empêche de
  // redevenir une déclaration d'intention.
  it("l'annulation observe l'IP SEULE — et rien par organisation, qu'elle ignore", async () => {
    await cancelReservation({ reservationId: RESERVATION_ID });

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
    ]);
    expect(state.pressions[0].parts).toBe("reserver:ip");
    // Fail-open : l'annulation aboutit quand même. Une porte sur une clé
    // partagée ferait d'un tiers l'interrupteur du parcours (ADR-032).
    expect(state.rpcCalls.some((c) => c.name === "cancel_reservation")).toBe(true);
  });

  it("« mes réservations » observe les DEUX, IP seule d'abord", async () => {
    await loadMyReservations({ organizationId: ORG_ID });

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
      "reserver_public_pressure",
    ]);
    expect(state.pressions[1].parts).toBe(`reserver:public:ip:${ORG_ID}`);
  });
});

describe("cancelReservationStaff — le commerçant libère une place", () => {
  it("passe l'organisation ET l'acteur de la SESSION, jamais du corps", async () => {
    const resultat = await cancelReservationStaff(
      null,
      formData({
        reservationId: RESERVATION_ID,
        // Postés pour rien : ils ne sont dans aucun schéma.
        organizationId: "99999999-9999-4999-8999-999999999999",
        actor: "99999999-9999-4999-8999-999999999999",
      }),
    );
    expect(resultat.ok).toBe(true);

    const appel = state.rpcCalls.find((c) => c.name === "cancel_reservation_staff");
    expect(appel?.args).toEqual({
      p_organization_id: ORG_ID,
      p_reservation_id: RESERVATION_ID,
      p_actor: USER_ID,
    });
  });

  it("REFUSE le caissier : annuler retire une place, ce n'est pas un geste de comptoir", async () => {
    state.role = "cashier";
    const resultat = await cancelReservationStaff(
      null,
      formData({ reservationId: RESERVATION_ID }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("REFUSE sans le droit `vitrine`, même à un propriétaire", async () => {
    // Contrairement au check-in, qui l'exclut délibérément : ici l'écran qui
    // porte le bouton est lui-même derrière le droit, donc refuser n'abandonne
    // personne qui voyait le bouton.
    state.orgAddonVitrine = false;
    const resultat = await cancelReservationStaff(
      null,
      formData({ reservationId: RESERVATION_ID }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("REFUSE un identifiant qui n'est pas un UUID, sans toucher à la base", async () => {
    const resultat = await cancelReservationStaff(
      null,
      formData({ reservationId: "pas-un-uuid" }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rend l'ÉTAT de la RPC, refus compris — l'écran doit pouvoir l'expliquer", async () => {
    state.cancelStaffResponse = { state: "already_checked_in", reservation_id: RESERVATION_ID };
    const resultat = await cancelReservationStaff(
      null,
      formData({ reservationId: RESERVATION_ID }),
    );
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.data.state).toBe("already_checked_in");
  });
});

describe("checkinReservation — l'acteur vient de la session", () => {
  it("passe l'utilisateur authentifié comme acteur, et son organisation", async () => {
    const fd = formData({ code: "abcd2345", actor: "99999999-9999-4999-8999-999999999999" });
    const resultat = await checkinReservation(null, fd);
    expect(resultat.ok).toBe(true);

    const appel = state.rpcCalls.find((c) => c.name === "checkin_reservation");
    // L'acteur POSTÉ est ignoré : celui de la session fait foi.
    expect(appel?.args.p_actor).toBe(USER_ID);
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_code).toBe("ABCD2345");
  });

  it("accepte le CAISSIER — valider une arrivée est un geste de comptoir", async () => {
    state.role = "cashier";
    const resultat = await checkinReservation(null, formData({ code: "ABCD2345" }));
    expect(resultat.ok).toBe(true);
  });

  it("refuse un rôle sans droit de comptoir", async () => {
    state.role = "viewer";
    const resultat = await checkinReservation(null, formData({ code: "ABCD2345" }));
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("consomme le seau de CAISSE, fail-closed sur l'opérateur authentifié", async () => {
    await checkinReservation(null, formData({ code: "ABCD2345" }));
    const appel = state.rateLimitCalls.at(-1);
    expect(appel?.bucket).toBe(`cashier:lookup:${ORG_ID}:${USER_ID}`);
    expect(appel?.failClosed).toBe(true);
  });

  it("N'EXIGE PAS le droit `vitrine` : honorer une arrivée déjà confirmée reste possible", async () => {
    // La sanction d'un abonnement expiré ne doit pas tomber sur des clients
    // venus, confirmés, présents au comptoir.
    state.orgAddonVitrine = false;
    const resultat = await checkinReservation(null, formData({ code: "ABCD2345" }));
    expect(resultat.ok).toBe(true);
  });
});

describe("dashboard commerçant — droit vitrine et rôle éditeur", () => {
  it("crée une activité pour un éditeur d'une organisation ayant le droit", async () => {
    state.role = "editor";
    const resultat = await createReserverActivity(
      null,
      formData({ name: "Dégustation", description: "" }),
    );
    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.table).toBe("reservation_activities");
    expect(ecriture?.values.organization_id).toBe(ORG_ID);
    expect(ecriture?.values.active).toBe(true);
  });

  it("PURGE LA VITRINE quand le drapeau `active` change — et jamais sur un refus", async () => {
    // FAMILLE 1 des quatre drapeaux publiés par `/v/{slug}` (VIT-3). Une
    // activité naît `active` : c'est une porte publiée à l'insertion, et sans
    // purge la vitrine met une minute (ISR) à l'annoncer — ou à cesser de
    // l'annoncer quand le commerçant la désactive.
    await createReserverActivity(null, formData({ name: "Dégustation" }));
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);

    purgeVitrine.mockClear();
    await updateReserverActivity(
      null,
      formData({ id: ACTIVITY_ID, name: "Dégustation", active: "false" }),
    );
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);

    // CONTRÔLE NÉGATIF : un refus d'autorisation n'a rien changé en base, donc
    // rien à purger — et surtout, il ne doit pas payer la lecture du slug.
    purgeVitrine.mockClear();
    state.role = "cashier";
    expect((await createReserverActivity(null, formData({ name: "X" }))).ok).toBe(
      false,
    );
    expect(purgeVitrine).not.toHaveBeenCalled();
  });

  it("REFUSE sans le droit `vitrine`, même à un propriétaire", async () => {
    state.orgAddonVitrine = false;
    const resultat = await createReserverActivity(null, formData({ name: "Atelier" }));
    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("REFUSE un caissier sur la configuration", async () => {
    state.role = "cashier";
    const resultat = await createReserverActivity(null, formData({ name: "Atelier" }));
    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("écrit les cinq champs d'expérience (RES-5), étapes comprises", async () => {
    // LES ÉTAPES SONT UNE LISTE : le panneau rend une paire par carte, toutes
    // sous le MÊME nom, et l'action les relit par `getAll`. Des noms indexés
    // auraient laissé un trou dès que le commerçant retire une carte du milieu.
    const champs = formData({
      name: "Moment Signature",
      kind: "signature",
      promise: "Trente minutes qui changent un samedi.",
      durationMinutes: "30",
      preparation: "Venez dix minutes avant.",
    });
    champs.append("stepTitle", "Accueil");
    champs.append("stepBody", "On vous installe.");
    champs.append("stepTitle", "Dégustation");
    champs.append("stepBody", "Trois vins.");

    const resultat = await createReserverActivity(null, champs);
    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.values.kind).toBe("signature");
    expect(ecriture?.values.duration_minutes).toBe(30);
    expect(ecriture?.values.promise).toBe(
      "Trente minutes qui changent un samedi.",
    );
    expect(ecriture?.values.preparation).toBe("Venez dix minutes avant.");
    // La troisième paire, non rendue, ne crée pas de carte vide.
    expect(ecriture?.values.steps).toEqual([
      { title: "Accueil", body: "On vous installe." },
      { title: "Dégustation", body: "Trois vins." },
    ]);
  });

  it("laisse `standard` et `null` quand le panneau ne rend aucun des cinq", async () => {
    // C'est ce qui rend ce lot rétrocompatible : un formulaire d'hier crée
    // exactement l'activité d'hier. `steps` part à `null` et non `[]` — la base
    // dit « pas d'étapes » avec `null`.
    const resultat = await createReserverActivity(
      null,
      formData({ name: "Dégustation" }),
    );
    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.values.kind).toBe("standard");
    expect(ecriture?.values.duration_minutes).toBeNull();
    expect(ecriture?.values.steps).toBeNull();
    expect(ecriture?.values.promise).toBeNull();
    expect(ecriture?.values.preparation).toBeNull();
  });

  it("REFUSE un duo sans durée annoncée, avant tout aller-retour", async () => {
    const resultat = await createReserverActivity(
      null,
      formData({ name: "Atelier Duo", kind: "duo" }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("repasser en « Standard » NE RÉÉCRIT PAS les quatre champs masqués", async () => {
    // ── L'ALLER-RETOUR QUE CE TEST GARDE ──
    //
    // 1. Le commerçant enregistre un Moment Signature complet.
    // 2. Il repasse en « Standard » : le panneau masque promesse, durée, étapes
    //    et préparation, qui ne sont donc PAS postées.
    // 3. Sans cette clause, l'update les écrivait à `null` — sa promesse et ses
    //    trois cartes disparaissaient sans confirmation ni moyen de les
    //    retrouver. Elles doivent sortir du payload, donc rester en base.
    const signature = formData({
      id: ACTIVITY_ID,
      name: "Moment Signature",
      active: "true",
      kind: "signature",
      promise: "Trente minutes qui changent un samedi.",
      durationMinutes: "30",
      preparation: "Venez dix minutes avant.",
    });
    signature.append("stepTitle", "Accueil");
    signature.append("stepBody", "On vous installe.");

    expect((await updateReserverActivity(null, signature)).ok).toBe(true);
    const complet = state.rlsWrites.at(-1);
    expect(complet?.values.promise).toBe(
      "Trente minutes qui changent un samedi.",
    );
    expect(complet?.values.steps).toEqual([
      { title: "Accueil", body: "On vous installe." },
    ]);

    const retour = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Moment Signature",
        active: "true",
        kind: "standard",
      }),
    );
    expect(retour.ok).toBe(true);

    const apres = state.rlsWrites.at(-1);
    // Le format change — c'est le seul geste demandé.
    expect(apres?.values.kind).toBe("standard");
    // Et les quatre colonnes ne sont PAS dans l'écriture : elles gardent leur
    // valeur. Les tester à `null` aurait été tester le bogue.
    for (const colonne of [
      "promise",
      "duration_minutes",
      "steps",
      "preparation",
    ]) {
      expect(Object.keys(apres?.values ?? {})).not.toContain(colonne);
    }
    // Le reste du formulaire, lui, s'écrit normalement.
    expect(apres?.values.name).toBe("Moment Signature");
    expect(apres?.values.active).toBe(true);
  });

  it("fait traverser les cinq champs à la mise à jour aussi", async () => {
    const resultat = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Atelier Duo",
        active: "true",
        kind: "duo",
        durationMinutes: "120",
        preparation: "Venez avec un tablier.",
      }),
    );
    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.values.kind).toBe("duo");
    expect(ecriture?.values.duration_minutes).toBe(120);
    expect(ecriture?.values.steps).toBeNull();
  });

  // ── LE FORMAT NE BASCULE PAS SOUS DES ENGAGEMENTS VIVANTS (RES-5) ──
  //
  // Le défaut, en une phrase : `claim_waitlist_offer` ne repasse PAS par la
  // jauge et lit le format COURANT. Une offre émise quand l'activité tenait UNE
  // place, convertie après une bascule en « Atelier Duo », crée une réservation
  // de DEUX personnes sur une place réservée pour une. Rien ne le signale.
  it("REFUSE de changer le format tant qu'un engagement vivant subsiste, et NOMME le compte", async () => {
    state.activityCommitments = {
      state: "ok",
      kind: "standard",
      reservations: 1,
      waitlist: 2,
    };

    const resultat = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Atelier Duo",
        active: "true",
        kind: "duo",
        durationMinutes: "90",
      }),
    );

    expect(resultat.ok).toBe(false);
    // LE COMPTE EST DANS LE MESSAGE, motif des gardes destructives du dépôt
    // (`deleteWheel` : « N lot(s) gagné(s) attendent encore en caisse »). Un
    // « impossible » nu laisserait le commerçant chercher ce qui bloque.
    expect(resultat.ok === false && resultat.error).toContain("1 réservation");
    expect(resultat.ok === false && resultat.error).toContain("2 attentes");
    // ET RIEN N'EST ÉCRIT : le refus est un refus, pas un enregistrement
    // partiel où le nom serait passé et le format non.
    expect(state.rlsWrites).toHaveLength(0);
    // Le comptage est demandé à la BASE, org-scopé, jamais recalculé côté
    // action : `reservations` n'a aucune policy de lecture pour l'éditeur.
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("reservation_activity_live_commitments");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_activity_id).toBe(ACTIVITY_ID);
  });

  it("laisse basculer quand tout est clos ou passé", async () => {
    // L'ÉTAT OÙ LA GARDE DOIT S'OUVRIR. Une garde qui ne s'ouvre jamais n'est
    // pas une garde : le commerçant change de format ENTRE deux saisons, c'est
    // précisément le moment où ses créneaux sont derrière lui.
    state.activityCommitments = {
      state: "ok",
      kind: "duo",
      reservations: 0,
      waitlist: 0,
    };

    const resultat = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Atelier",
        active: "true",
        kind: "standard",
      }),
    );

    expect(resultat.ok).toBe(true);
    expect(state.rlsWrites.at(-1)?.values.kind).toBe("standard");
  });

  it("ne bloque PAS les autres réglages quand le format ne change pas", async () => {
    // La garde porte sur LA BASCULE, pas sur l'écran. Renommer une activité ou
    // la couper pendant que dix personnes attendent doit rester possible —
    // couper est même le geste qu'on fait EN PREMIER quand ça déborde.
    state.activityCommitments = {
      state: "ok",
      kind: "duo",
      reservations: 4,
      waitlist: 3,
    };

    const resultat = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Atelier Duo (complet)",
        active: "false",
        kind: "duo",
        durationMinutes: "90",
      }),
    );

    expect(resultat.ok).toBe(true);
    expect(state.rlsWrites.at(-1)?.values.active).toBe(false);
  });

  it("refuse aussi quand le comptage ne se lit pas", async () => {
    // `unknown` (activité d'une autre organisation, ou disparue) et charge utile
    // illisible tombent au MÊME endroit. Laisser passer parce qu'on n'a pas su
    // compter, ce serait exactement le silence que cette garde existe pour
    // rompre.
    state.activityCommitments = { state: "unknown" };

    const resultat = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Atelier",
        active: "true",
        kind: "duo",
        durationMinutes: "90",
      }),
    );

    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("crée un créneau en BROUILLON, converti dans le fuseau de l'organisation", async () => {
    const resultat = await createReserverSlot(
      null,
      formData({
        activityId: ACTIVITY_ID,
        startsAt: "2026-09-01T14:00",
        endsAt: "2026-09-01T16:00",
        capacity: "12",
      }),
    );
    expect(resultat.ok).toBe(true);

    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.table).toBe("reservation_slots");
    expect(ecriture?.values.status).toBe("draft");
    expect(ecriture?.values.capacity).toBe(12);
    expect(ecriture?.values.organization_id).toBe(ORG_ID);
    // 14 h civiles à Paris en septembre = 12:00 UTC.
    expect(ecriture?.values.starts_at).toBe("2026-09-01T12:00:00.000Z");
  });

  it("borne la mise à jour d'un créneau à l'organisation de la session", async () => {
    const resultat = await updateReserverSlotStatus(
      null,
      formData({ id: SLOT_ID, status: "open" }),
    );
    expect(resultat.ok).toBe(true);

    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.values).toEqual({ status: "open" });
    expect(ecriture?.filters).toEqual({ id: SLOT_ID, organization_id: ORG_ID });
  });

  it("ne propose AUCUNE suppression : la surface d'action n'en exporte pas", async () => {
    const actions = await import("@/actions/reserver");
    const noms = Object.keys(actions);
    expect(noms.some((nom) => /delete|supprim/i.test(nom))).toBe(false);
  });

  it("transmet la fenêtre d'attente à la création comme à l'édition", async () => {
    await createReserverSlot(
      null,
      formData({
        activityId: ACTIVITY_ID,
        startsAt: "2026-09-01T14:00",
        endsAt: "2026-09-01T16:00",
        capacity: "12",
        waitlistOfferMinutes: "45",
      }),
    );
    expect(state.rlsWrites.at(-1)?.values.waitlist_offer_minutes).toBe(45);

    // Champ laissé vide : `null`, c'est-à-dire le défaut du produit — et non 0,
    // qui serait une fenêtre de zéro minute.
    await createReserverSlot(
      null,
      formData({
        activityId: ACTIVITY_ID,
        startsAt: "2026-09-01T14:00",
        endsAt: "2026-09-01T16:00",
        capacity: "12",
        waitlistOfferMinutes: "",
      }),
    );
    expect(state.rlsWrites.at(-1)?.values.waitlist_offer_minutes).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// Liste prioritaire (RES-2, lot L5)
// ════════════════════════════════════════════════════════════

describe("waitlistJoin — le même inventaire de seaux que reserveSlot", () => {
  it("porte le failClosed sur la clé COOKIE, l'appareil AVANT l'organisation", async () => {
    await waitlistJoin({ organizationId: ORG_ID, slotId: SLOT_ID });

    const fermes = state.rateLimitCalls.filter((appel) => appel.failClosed);
    expect(fermes).toHaveLength(2);
    for (const appel of fermes) expect(appel.bucket).toContain(EMPREINTE);
    expect(state.rateLimitCalls[0].bucket).toBe(`reserver:device:${EMPREINTE}`);
    expect(state.rateLimitCalls[1].bucket).toBe(
      `reserver:player:${ORG_ID}:${EMPREINTE}`,
    );
  });

  it("observe l'IP SEULE avant l'IP par organisation", async () => {
    await waitlistJoin({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
      "reserver_public_pressure",
    ]);
  });

  it("oppose le challenge — c'est un appel ÉMETTEUR — et SEULEMENT s'il est configuré", async () => {
    // Non configuré : aucun challenge, aucune vérification.
    await waitlistJoin({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(state.turnstileJetons).toHaveLength(0);

    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    state.turnstileVerdict = false;
    state.rpcCalls = [];
    const refus = await waitlistJoin({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(refus.ok).toBe(false);
    expect(refus.ok === false && refus.challengeRequired).toBe(true);
    // Refusé AVANT la RPC : aucune inscription n'est écrite.
    expect(state.rpcCalls.some((appel) => appel.name === "waitlist_join")).toBe(
      false,
    );
  });

  it("n'envoie l'adresse QUE consentie, et n'envoie AUCUN email à l'inscription", async () => {
    await waitlistJoin({
      organizationId: ORG_ID,
      slotId: SLOT_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    const appel = state.rpcCalls.find((a) => a.name === "waitlist_join");
    expect(appel?.args.p_email).toBe("client@exemple.fr");
    expect(appel?.args.p_consent).toBe(true);
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
    // MVP assumé : rien n'est promis à l'inscription, donc rien n'est envoyé.
    expect(state.emails).toHaveLength(0);
  });

  it("refuse à sec sur le seau d'APPAREIL sans jamais appeler la base", async () => {
    state.seauxASec = ["reserver:device"];
    const resultat = await waitlistJoin({ organizationId: ORG_ID, slotId: SLOT_ID });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("claimWaitlistOffer — l'organisation se LIT, elle ne se poste pas", () => {
  it("résout l'organisation sur l'entrée, par possession, et la passe à la RPC", async () => {
    const resultat = await claimWaitlistOffer({ entryId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);

    const lecture = state.filtres.find(
      (f) => f.table === "reservation_waitlist_entries",
    );
    // La lecture est bornée par l'EMPREINTE DU COOKIE : une entrée d'autrui ne
    // se résout pas, et rend `unknown` sans jamais appeler la RPC.
    expect(lecture?.player_key_hash).toBe(EMPREINTE);

    const appel = state.rpcCalls.find((a) => a.name === "claim_waitlist_offer");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
  });

  it("rend `unknown` — sans appeler la RPC — sur une entrée d'une autre identité", async () => {
    state.entreeFile = null;
    const resultat = await claimWaitlistOffer({ entryId: RESERVATION_ID });
    expect(resultat.ok && resultat.data.state).toBe("unknown");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("porte le seau par ENTRÉE, jamais par organisation — elle est inconnue de l'appelant", async () => {
    await claimWaitlistOffer({ entryId: RESERVATION_ID });
    expect(state.rateLimitCalls[0].bucket).toBe(`reserver:device:${EMPREINTE}`);
    expect(state.rateLimitCalls[1].bucket).toBe(
      `reserver:player:${RESERVATION_ID}:${EMPREINTE}`,
    );
    // IP SEULE, et rien par organisation : elle n'est pas connue à ce moment.
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
    ]);
  });

  it("n'oppose AUCUN challenge : la place est déjà tenue pour cette identité", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    state.turnstileVerdict = false;
    const resultat = await claimWaitlistOffer({ entryId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
  });

  it("envoie la confirmation sur la conversion RÉELLE, à l'adresse de l'ENTRÉE", async () => {
    await claimWaitlistOffer({ entryId: RESERVATION_ID });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].to).toBe("client@exemple.fr");
    expect(state.emails[0].code).toBe("ABCD2345");
    const seau = state.rateLimitCalls.at(-1);
    expect(seau?.bucket).toBe(`reserver:email:${ORG_ID}:client@exemple.fr`);
    expect(seau?.failClosed).toBe(true);
  });

  it("N'ENVOIE RIEN sur le rejeu idempotent — la RPC ne rend alors aucune borne", async () => {
    state.claimResponse = {
      state: "claimed",
      entry_id: "e1",
      reservation_id: RESERVATION_ID,
      code: "ABCD2345",
      status: "confirmed",
    };
    await claimWaitlistOffer({ entryId: RESERVATION_ID });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
  });

  it("N'ENVOIE RIEN quand l'entrée ne porte pas d'adresse consentie", async () => {
    state.entreeFile = {
      id: "66666666-6666-4666-8666-666666666666",
      organization_id: ORG_ID,
      email: null,
      consent_transactional_at: null,
    };
    await claimWaitlistOffer({ entryId: RESERVATION_ID });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
  });

  it("le seau d'email à sec ne défait PAS la place — il est seulement compté", async () => {
    state.seauxASec = ["reserver:email"];
    const resultat = await claimWaitlistOffer({ entryId: RESERVATION_ID });
    await Promise.all(state.taches);
    expect(resultat.ok && resultat.data.state).toBe("claimed");
    expect(state.emails).toHaveLength(0);
    expect(state.compteurs).toContain("reserver.email.throttled");
  });
});

describe("waitlistLeave — rendre une place n'a aucune friction", () => {
  it("autorise par POSSESSION et ne poste aucune organisation", async () => {
    const resultat = await waitlistLeave({ entryId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);
    const appel = state.rpcCalls.find((a) => a.name === "waitlist_leave");
    expect(Object.keys(appel?.args ?? {})).toEqual([
      "p_entry_id",
      "p_player_key_hash",
    ]);
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
  });

  it("n'oppose AUCUN challenge et n'observe que l'IP seule", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    state.turnstileVerdict = false;
    const resultat = await waitlistLeave({ entryId: RESERVATION_ID });
    expect(resultat.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
    ]);
  });

  it("sans cookie, il n'y a rien à quitter — la base n'est pas dérangée", async () => {
    state.empreinte = null;
    const resultat = await waitlistLeave({ entryId: RESERVATION_ID });
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// Invitations privées (RES-2, lot L5)
// ════════════════════════════════════════════════════════════

/**
 * Un jeton bien formé, et DISTINCT de l'empreinte du cookie : `"a".repeat(32)`
 * est un sous-mot de `"a".repeat(64)`, et les assertions « le clair n'apparaît
 * nulle part » auraient rougi sur le seau d'appareil sans qu'aucun jeton n'ait
 * fuité.
 */
const JETON = "Zq7xK9mB4tR2wL8vN5cP1sD3fG6hJ0yU";

describe("redeemInvitation — le clair ne quitte jamais la server action", () => {
  it("n'envoie que l'EMPREINTE du jeton à la base, jamais le clair", async () => {
    await redeemInvitation({ token: JETON, slotId: SLOT_ID });

    const appel = state.rpcCalls.find((a) => a.name === "redeem_invitation");
    expect(appel?.args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    // Le clair n'apparaît dans AUCUN argument, sous aucune clé.
    expect(JSON.stringify(appel?.args)).not.toContain(JETON);
    // La résolution non plus ne le recopie nulle part.
    expect(JSON.stringify(state.filtres)).not.toContain(JETON);
  });

  it("résout l'organisation SUR LE JETON, sans jamais la recevoir du navigateur", async () => {
    await redeemInvitation({ token: JETON, slotId: SLOT_ID });
    const lecture = state.filtres.find(
      (f) => f.table === "reservation_invitations",
    );
    expect(lecture?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const appel = state.rpcCalls.find((a) => a.name === "redeem_invitation");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
  });

  it("rend `unavailable` — muet — sur un jeton qui ne résout rien", async () => {
    state.invitationRow = null;
    const resultat = await redeemInvitation({ token: JETON });
    expect(resultat.ok && resultat.data.state).toBe("unavailable");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rend le MÊME message sur un jeton malformé que sur un jeton inconnu", async () => {
    const malforme = await redeemInvitation({ token: "trop-court" });
    state.invitationRow = null;
    expect(malforme.ok).toBe(false);
    expect(malforme.ok === false && malforme.error).toBe(
      "Cette réservation n'est pas disponible.",
    );
  });

  it("tranche le seau par APPAREIL avant tout, et l'organisation seulement APRÈS résolution", async () => {
    await redeemInvitation({ token: JETON });
    expect(state.rateLimitCalls[0].bucket).toBe(`reserver:device:${EMPREINTE}`);
    expect(state.rateLimitCalls[1].bucket).toBe(
      `reserver:player:${ORG_ID}:${EMPREINTE}`,
    );
    // AUCUN seau composé avec le jeton — ni en clair, ni haché : la clé serait
    // choisie par l'appelant, donc un jeton inventé par tour ouvrirait un seau
    // neuf à chaque coup, c'est-à-dire aucune borne.
    const empreinteJeton = createHash("sha256").update(JETON).digest("hex");
    for (const appel of state.rateLimitCalls) {
      expect(appel.bucket).not.toContain(JETON);
      expect(appel.bucket).not.toContain(empreinteJeton);
    }
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
      "reserver_public_pressure",
    ]);
  });

  it("oppose le challenge AVANT même de résoudre le jeton", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    state.turnstileVerdict = false;
    const resultat = await redeemInvitation({ token: JETON });
    expect(resultat.ok === false && resultat.challengeRequired).toBe(true);
    // Ni résolution, ni RPC : un balayage n'apprend rien sur l'existence.
    expect(state.filtres).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("envoie la confirmation consentie, et rien sans consentement", async () => {
    await redeemInvitation({
      token: JETON,
      slotId: SLOT_ID,
      email: "invite@exemple.fr",
      consent: true,
    });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].to).toBe("invite@exemple.fr");

    state.reset();
    await redeemInvitation({ token: JETON, slotId: SLOT_ID });
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
  });
});

describe("createInvitation — le clair, une seule fois", () => {
  it("tire le jeton côté serveur, n'envoie que son empreinte, et rend le clair", async () => {
    const resultat = await createInvitation(
      null,
      formData({ label: "Habitués", activityId: ACTIVITY_ID, maxUses: "5" }),
    );
    expect(resultat.ok).toBe(true);
    if (!resultat.ok || !resultat.data) return;

    // Le clair a la forme du générateur, et n'a JAMAIS été envoyé à la base.
    expect(resultat.data.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const appel = state.rpcCalls.find(
      (a) => a.name === "create_reservation_invitation",
    );
    expect(appel?.args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(appel?.args)).not.toContain(resultat.data.token);
    // L'ACTEUR VIENT DE LA SESSION.
    expect(appel?.args.p_actor).toBe(USER_ID);
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_activity_id).toBe(ACTIVITY_ID);
    expect(appel?.args.p_slot_id).toBeNull();
    // Le lien complet, prêt à copier — et il porte le clair, pas l'empreinte.
    expect(resultat.data.url).toContain(
      `/reserver/invitation/${resultat.data.token}`,
    );
  });

  it("tire un jeton DIFFÉRENT à chaque création", async () => {
    const a = await createInvitation(
      null,
      formData({ label: "A", activityId: ACTIVITY_ID, maxUses: "1" }),
    );
    const b = await createInvitation(
      null,
      formData({ label: "B", activityId: ACTIVITY_ID, maxUses: "1" }),
    );
    expect(a.ok && b.ok && a.data?.token).not.toBe(b.ok ? b.data?.token : null);
  });

  it("convertit l'expiration dans le fuseau de l'organisation", async () => {
    await createInvitation(
      null,
      formData({
        label: "Habitués",
        slotId: SLOT_ID,
        maxUses: "1",
        expiresAt: "2026-09-01T14:00",
      }),
    );
    const appel = state.rpcCalls.find(
      (a) => a.name === "create_reservation_invitation",
    );
    // 14 h civiles à Paris en septembre = 12:00 UTC.
    expect(appel?.args.p_expires_at).toBe("2026-09-01T12:00:00.000Z");
  });

  it("traduit chaque refus de la RPC, sans jamais annoncer un lien", async () => {
    state.createInvitationResponse = { state: "invalid_target" };
    const resultat = await createInvitation(
      null,
      formData({ label: "Habitués", activityId: ACTIVITY_ID, maxUses: "5" }),
    );
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.error).toContain("une seule");
  });

  it("REFUSE un caissier, et n'appelle pas la base", async () => {
    state.role = "cashier";
    const resultat = await createInvitation(
      null,
      formData({ label: "Habitués", activityId: ACTIVITY_ID, maxUses: "5" }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("REFUSE sans le droit `vitrine`", async () => {
    state.orgAddonVitrine = false;
    const resultat = await createInvitation(
      null,
      formData({ label: "Habitués", activityId: ACTIVITY_ID, maxUses: "5" }),
    );
    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("revokeInvitation / closeInvitation", () => {
  it("passent l'acteur de la SESSION et l'organisation de la session", async () => {
    await revokeInvitation(null, formData({ id: RESERVATION_ID }));
    const revoque = state.rpcCalls.at(-1);
    expect(revoque?.name).toBe("revoke_reservation_invitation");
    expect(revoque?.args.p_actor).toBe(USER_ID);
    expect(revoque?.args.p_organization_id).toBe(ORG_ID);

    await closeInvitation(null, formData({ id: RESERVATION_ID }));
    const ferme = state.rpcCalls.at(-1);
    expect(ferme?.name).toBe("close_reservation_invitation");
    expect(ferme?.args.p_actor).toBe(USER_ID);
  });

  it("REFUSENT un caissier sans appeler la base", async () => {
    state.role = "cashier";
    expect((await revokeInvitation(null, formData({ id: RESERVATION_ID }))).ok).toBe(
      false,
    );
    expect((await closeInvitation(null, formData({ id: RESERVATION_ID }))).ok).toBe(
      false,
    );
    expect(state.rpcCalls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// La file sereine (RES-3) — ce que les actions REFUSENT, et d'où viennent
// l'organisation et l'acteur.
// ────────────────────────────────────────────────────────────

const QUEUE_ID = "88888888-8888-4888-8888-888888888888";
const ENTRY_ID = "99999999-9999-4999-8999-999999999999";

describe("queueJoin — l'organisation vient de la FILE, jamais du corps", () => {
  it("résout l'organisation sur la ligne et la passe à la RPC", async () => {
    const resultat = await queueJoin({ queueId: QUEUE_ID });

    expect(resultat.ok).toBe(true);
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("queue_join");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_queue_id).toBe(QUEUE_ID);
    // L'IDENTITÉ VIENT DU COOKIE, jamais du corps.
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
  });

  it("tranche le seau par APPAREIL avant celui par organisation", async () => {
    // La portée du second seau est l'organisation RÉSOLUE : elle n'existe
    // qu'après la lecture de la file, donc l'appareil est le seul opposable
    // avant. Motif `redeemInvitation`.
    await queueJoin({ queueId: QUEUE_ID });

    const seaux = state.rateLimitCalls.map((appel) => appel.bucket);
    expect(seaux[0]).toBe(`reserver:device:${EMPREINTE}`);
    expect(seaux[1]).toBe(`reserver:player:${ORG_ID}:${EMPREINTE}`);
    expect(state.rateLimitCalls.every((appel) => appel.failClosed)).toBe(true);
  });

  it("observe l'IP SEULE avant l'IP par organisation, et ne refuse sur aucune", async () => {
    await queueJoin({ queueId: QUEUE_ID });

    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
      "reserver_public_pressure",
    ]);
    expect(state.pressions[0].parts).toBe("reserver:ip");
    expect(state.pressions[1].parts).toBe(`reserver:public:ip:${ORG_ID}`);
  });

  it("rend `unavailable` sur une file inconnue, SANS appeler la RPC", async () => {
    // Et sans jamais dire laquelle des deux raisons : inconnue, ou d'un autre
    // commerce. C'est ce que rendrait la RPC, à qui on évite un appel sans objet.
    state.queueRow = null;
    const resultat = await queueJoin({ queueId: QUEUE_ID });

    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.data.state).toBe("unavailable");
    expect(state.rpcCalls).toHaveLength(0);
    // L'IP SEULE est comptée quand même : c'est tout l'intérêt du premier
    // compteur — un balayage d'identifiants n'atteint aucune file.
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
    ]);
  });

  it("oppose le challenge anti-robot, et NE LIT MÊME PAS la file sans lui", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    state.turnstileVerdict = false;

    const resultat = await queueJoin({ queueId: QUEUE_ID, turnstileToken: "t" });

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.challengeRequired).toBe(true);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.turnstileJetons).toEqual(["t"]);
  });

  it("n'oppose AUCUN challenge quand les clés ne sont pas configurées", async () => {
    state.turnstileConfigure = false;
    const resultat = await queueJoin({ queueId: QUEUE_ID });

    expect(resultat.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
  });

  it("N'ENVOIE AUCUN EMAIL, même consenti — le lot ne câble rien sur Resend", async () => {
    const resultat = await queueJoin({
      queueId: QUEUE_ID,
      email: "client@exemple.fr",
      consent: true,
    });

    expect(resultat.ok).toBe(true);
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
    // Aucun seau de destinataire non plus : il n'y a pas d'envoi à borner.
    expect(
      state.rateLimitCalls.some((appel) =>
        appel.bucket.startsWith("reserver:email"),
      ),
    ).toBe(false);
  });

  it("transmet l'adresse SEULEMENT avec son consentement", async () => {
    await queueJoin({
      queueId: QUEUE_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    expect(state.rpcCalls.at(-1)?.args.p_email).toBe("client@exemple.fr");

    state.reset();
    // Une adresse SANS consentement est refusée par le schéma : la base porte
    // une ÉQUIVALENCE, et l'action ne l'atteint même pas.
    const refus = await queueJoin({
      queueId: QUEUE_ID,
      email: "client@exemple.fr",
      consent: false,
    });
    expect(refus.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("TRONQUE le prénom à 40 caractères plutôt que de refuser l'entrée", async () => {
    await queueJoin({ queueId: QUEUE_ID, displayName: "é".repeat(60) });
    expect(state.rpcCalls.at(-1)?.args.p_display_name).toBe("é".repeat(40));
  });

  it("envoie `null` pour un prénom vide — un ornement absent n'est pas une chaîne vide", async () => {
    await queueJoin({ queueId: QUEUE_ID, displayName: "   " });
    expect(state.rpcCalls.at(-1)?.args.p_display_name).toBeNull();
  });
});

describe("queueLeave — possession, et aucune friction", () => {
  it("passe l'entrée et l'empreinte, sans organisation", async () => {
    const resultat = await queueLeave({ entryId: ENTRY_ID });

    expect(resultat.ok).toBe(true);
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("queue_leave");
    expect(appel?.args).toEqual({
      p_entry_id: ENTRY_ID,
      p_player_key_hash: EMPREINTE,
    });
    // L'organisation n'est PAS connue de ce chemin : la RPC la lit sur la
    // ligne, donc pas de compteur par organisation ici.
    expect(state.pressions.map((p) => p.evenement)).toEqual([
      "reserver_ip_ceiling",
    ]);
  });

  it("n'oppose AUCUN challenge : c'est un geste qui libère une place", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    state.turnstileVerdict = false;

    const resultat = await queueLeave({ entryId: ENTRY_ID });
    expect(resultat.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
  });

  it("porte le seau sur l'ENTRÉE, une clé que l'appelant détient déjà", async () => {
    await queueLeave({ entryId: ENTRY_ID });
    expect(state.rateLimitCalls.map((a) => a.bucket)).toEqual([
      `reserver:device:${EMPREINTE}`,
      `reserver:player:${ENTRY_ID}:${EMPREINTE}`,
    ]);
  });
});

describe("comptoir de la file — l'acteur vient de la SESSION", () => {
  it("appelle le suivant avec l'organisation et l'acteur de la session", async () => {
    const resultat = await queueCallNext(null, formData({ queueId: QUEUE_ID }));

    expect(resultat.ok).toBe(true);
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("queue_call_next");
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    expect(appel?.args.p_actor).toBe(USER_ID);
    expect(resultat.ok && resultat.data.displayName).toBe("Camille");
  });

  it("ACCEPTE un caissier sur les trois gestes de comptoir", async () => {
    // C'est le point du lot : l'accueil EST le poste du caissier. La garde
    // d'édition l'exclut, celle-ci non — motif `checkinReservation`.
    state.role = "cashier";

    expect((await queueCallNext(null, formData({ queueId: QUEUE_ID }))).ok).toBe(
      true,
    );
    expect(
      (await queueResolve(null, formData({ entryId: ENTRY_ID, outcome: "served" })))
        .ok,
    ).toBe(true);
    expect((await queueReopen(null, formData({ entryId: ENTRY_ID }))).ok).toBe(
      true,
    );
    expect(state.rpcCalls).toHaveLength(3);
  });

  it("REFUSE un rôle hors comptoir, sans appeler la base", async () => {
    state.role = "viewer";
    const resultat = await queueCallNext(null, formData({ queueId: QUEUE_ID }));

    expect(resultat.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("SERT ENCORE sans le droit `vitrine` — la pause d'un abonnement ne vide pas le magasin", async () => {
    // Motif `checkinReservation`, et l'inverse de `cancelReservationStaff` :
    // refuser d'appeler le suivant laisserait le commerçant devant douze
    // personnes debout, sans aucun geste. La sanction tomberait sur elles.
    state.orgAddonVitrine = false;
    const resultat = await queueCallNext(null, formData({ queueId: QUEUE_ID }));

    expect(resultat.ok).toBe(true);
    expect(state.rpcCalls.at(-1)?.name).toBe("queue_call_next");
  });

  it("transmet l'issue du vocabulaire fermé, et refuse tout autre mot", async () => {
    await queueResolve(null, formData({ entryId: ENTRY_ID, outcome: "no_show" }));
    expect(state.rpcCalls.at(-1)?.args.p_outcome).toBe("no_show");

    state.reset();
    const refus = await queueResolve(
      null,
      // `left` est un geste du JOUEUR, pas un constat du comptoir : hors
      // vocabulaire, et arrêté ici plutôt que de faire lever la RPC.
      formData({ entryId: ENTRY_ID, outcome: "left" }),
    );
    expect(refus.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rouvre une entrée appelée par erreur, acteur de session compris", async () => {
    const resultat = await queueReopen(null, formData({ entryId: ENTRY_ID }));

    expect(resultat.ok).toBe(true);
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("queue_reopen_entry");
    expect(appel?.args.p_actor).toBe(USER_ID);
    // EN TÊTE, et c'est une conséquence : rien n'a été renuméroté.
    expect(resultat.ok && resultat.data.position).toBe(1);
  });
});

describe("scrutin de la file", () => {
  it("getQueueStaffState lit l'organisation de la SESSION, jamais du paramètre", async () => {
    // C'est l'invariant du lot : `queue_staff_state` ne vérifie AUCUNE
    // appartenance. Le seul chemin jusqu'à `p_organization_id` passe par
    // `getUserAndOrg`, et l'entrée de l'action ne porte que la file.
    const etat = await getQueueStaffState({ queueId: QUEUE_ID });

    expect(etat?.ok).toBe(true);
    const appel = state.rpcCalls.at(-1);
    expect(appel?.name).toBe("queue_staff_state");
    expect(appel?.args).toEqual({
      p_organization_id: ORG_ID,
      p_queue_id: QUEUE_ID,
    });
  });

  it("getQueueStaffState rend `null` — jamais une erreur d'écran — sur une file inconnue", async () => {
    state.queueStaffResponse = { state: "unknown" };
    expect(await getQueueStaffState({ queueId: QUEUE_ID })).toBeNull();
  });

  it("getQueueStaffState refuse un rôle hors comptoir sans lire la base", async () => {
    state.role = "viewer";
    expect(await getQueueStaffState({ queueId: QUEUE_ID })).toBeNull();
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("getQueueStaffState borne sa CADENCE sur la clé de l'opérateur, et le dit", async () => {
    // Seul scrutin authentifié du module, et le seul dont la RPC recompose les
    // rangs de la file entière à chaque tic. La clé est propre à UN opérateur —
    // c'est ce qui rend le `failClosed` conforme à ADR-032 : la saturer ne
    // ralentit que celui qui l'a saturée.
    await getQueueStaffState({ queueId: QUEUE_ID });
    const seau = state.rateLimitCalls.at(-1);
    expect(seau?.bucket).toBe(`reserver:queue-staff:${ORG_ID}:${USER_ID}`);
    expect(seau?.failClosed).toBe(true);

    state.reset();
    state.seauxASec = ["reserver:queue-staff"];
    // À SEC : l'écran garde ce qu'il montrait, la RPC n'est pas appelée, et
    // l'emballement est REPORTÉ — être freiné ne suffit pas, il faut être vu.
    expect(await getQueueStaffState({ queueId: QUEUE_ID })).toBeNull();
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.evenementsSecurite).toEqual(["reserver_queue_staff_cadence"]);
  });

  it("getQueuePublicState rend le rang du porteur du cookie, sans ETA", async () => {
    const etat = await getQueuePublicState({ queueId: QUEUE_ID });

    expect(etat?.state).toBe("in_queue");
    expect(etat?.position).toBe(2);
    expect(etat?.waitingCount).toBe(4);
    // AUCUNE clé de durée dans le document rendu — critère dur RES-3.
    expect(Object.keys(etat ?? {}).some((cle) => /eta|delay|duree/i.test(cle))).toBe(
      false,
    );
  });

  it("getQueuePublicState prend le seau de LECTURE, jamais celui des gestes", async () => {
    // Le correctif d'INFO-1 : à 12 tics/min et deux onglets, ce scrutin
    // épuisait `reserver:device` — partagé avec `queueJoin` et `queueLeave` —
    // et le refus tombait sur le geste, jamais sur la lecture qui l'avait vidé.
    await getQueuePublicState({ queueId: QUEUE_ID });

    const seaux = state.rateLimitCalls.map((appel) => appel.bucket);
    expect(seaux).toEqual([`reserver:queue-read:${EMPREINTE}`]);
    expect(state.rateLimitCalls[0].failClosed).toBe(true);
  });

  it("getQueuePublicState rend `null` quand le seau du scrutin est à sec", async () => {
    // L'écran garde alors ce qu'il montrait : un seau ralentit une boucle, il
    // n'efface pas un rang.
    state.seauxASec = ["reserver:queue-read"];
    expect(await getQueuePublicState({ queueId: QUEUE_ID })).toBeNull();
  });

  it("getQueuePublicState laisse passer `in_queue` SANS résoudre le droit vitrine", async () => {
    // Quelqu'un qui attend physiquement doit voir son appel, abonnement expiré
    // ou non : la sanction ne tombe pas sur lui (motif `queueCallNext`).
    state.droitVitrineFile = false;
    const etat = await getQueuePublicState({ queueId: QUEUE_ID });

    expect(etat?.state).toBe("in_queue");
    expect(etat?.position).toBe(2);
    // Et la lecture du droit n'est même pas payée sur cette branche.
    expect(state.droitVitrineFileAppels).toBe(0);
  });

  it("getQueuePublicState rend `unavailable` sur `not_in_queue` quand le droit vitrine est fermé", async () => {
    // M-1 : sans cette garde, le scrutin rendait le nom de la file, son statut
    // et le nombre de personnes en attente à n'importe qui — c'est-à-dire
    // l'oracle sur l'état commercial d'un tiers que la PAGE refuse d'être.
    state.empreinte = null;
    state.droitVitrineFile = false;

    const etat = await getQueuePublicState({ queueId: QUEUE_ID });

    expect(state.droitVitrineFileAppels).toBe(1);
    expect(etat?.state).toBe("unavailable");
    // INDISTINGUABLE d'une file inexistante : rien du document n'a fuité.
    expect(etat?.queueName).toBeNull();
    expect(etat?.queueStatus).toBeNull();
    expect(etat?.waitingCount).toBe(0);
  });

  it("getQueuePublicState rend `not_in_queue` tel quel quand le droit vitrine est ouvert", async () => {
    state.empreinte = null;
    const etat = await getQueuePublicState({ queueId: QUEUE_ID });

    expect(state.droitVitrineFileAppels).toBe(1);
    expect(etat?.state).toBe("not_in_queue");
  });
});

describe("files d'accueil — configuration", () => {
  it("crée la file sous l'organisation de la SESSION", async () => {
    const resultat = await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "50" }),
    );

    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.table).toBe("reservation_queues");
    expect(ecriture?.values.organization_id).toBe(ORG_ID);
    // Sans activité choisie, la colonne est NULLE : c'est la file « Comptoir »,
    // le cas dominant du modèle.
    expect(ecriture?.values.activity_id).toBeNull();
    expect(ecriture?.values.status).toBe("open");
  });

  it("nomme la cause réelle d'un doublon de libellé", async () => {
    state.rlsError = { message: "duplicate", code: "23505" };
    const resultat = await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "50" }),
    );

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.error).toContain("porte déjà ce nom");
  });

  it("REFUSE un caissier, et n'écrit rien", async () => {
    // Créer, renommer, mettre en pause sont du PARAMÉTRAGE : `gardeEditeurReserver`,
    // pas la garde de comptoir.
    state.role = "cashier";
    const resultat = await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "50" }),
    );

    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("REFUSE sans le droit `vitrine`", async () => {
    state.orgAddonVitrine = false;
    const resultat = await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "50" }),
    );

    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("borne le plafond d'entrées vivantes à celui du CHECK SQL", async () => {
    const resultat = await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "500" }),
    );

    expect(resultat.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("met à jour SOUS l'organisation de la session, en doublant la RLS", async () => {
    const resultat = await updateReserverQueue(
      null,
      formData({
        queueId: QUEUE_ID,
        name: "Retrait commandes",
        maxLiveEntries: "12",
        status: "paused",
      }),
    );

    expect(resultat.ok).toBe(true);
    const ecriture = state.rlsWrites.at(-1);
    expect(ecriture?.op).toBe("update");
    expect(ecriture?.filters).toEqual({
      id: QUEUE_ID,
      organization_id: ORG_ID,
    });
    // `paused` N'EST PAS `closed` : la file refuse les arrivées mais se sert
    // encore, et c'est la valeur écrite telle quelle.
    expect(ecriture?.values.status).toBe("paused");
    expect(ecriture?.values.max_live_entries).toBe(12);
  });

  it("PURGE LA VITRINE quand le statut de la file change", async () => {
    // FAMILLE 2. La vitrine n'annonce que les files `open` : une file passée en
    // `closed` qui resterait affichée envoie le visiteur sur une porte close,
    // signée du commerce. Une file peut aussi NAÎTRE `open`, d'où les deux.
    await createReserverQueue(
      null,
      formData({ name: "Comptoir", maxLiveEntries: "12", status: "open" }),
    );
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);

    purgeVitrine.mockClear();
    await updateReserverQueue(
      null,
      formData({
        queueId: QUEUE_ID,
        name: "Comptoir",
        maxLiveEntries: "12",
        status: "closed",
      }),
    );
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });
});

describe("les animations d'attente (RES-4) se règlent là où le commerçant regarde", () => {
  // La configuration vit sur les DEUX porteurs — la FILE pour qui attend
  // debout, l'ACTIVITÉ pour qui a un créneau en poche — et les quatre gestes
  // de configuration doivent l'écrire, sans quoi une des deux formes d'attente
  // resterait sans animation réglable.
  const porteurs = [
    {
      nom: "file (création)",
      table: "reservation_queues",
      op: "insert",
      jouer: (champs: Record<string, string>) =>
        createReserverQueue(
          null,
          formData({ name: "Comptoir", maxLiveEntries: "50", ...champs }),
        ),
    },
    {
      nom: "file (réglages)",
      table: "reservation_queues",
      op: "update",
      jouer: (champs: Record<string, string>) =>
        updateReserverQueue(
          null,
          formData({
            queueId: QUEUE_ID,
            name: "Comptoir",
            maxLiveEntries: "50",
            status: "open",
            ...champs,
          }),
        ),
    },
    {
      nom: "activité (création)",
      table: "reservation_activities",
      op: "insert",
      jouer: (champs: Record<string, string>) =>
        createReserverActivity(null, formData({ name: "Atelier", ...champs })),
    },
    {
      nom: "activité (réglages)",
      table: "reservation_activities",
      op: "update",
      jouer: (champs: Record<string, string>) =>
        updateReserverActivity(
          null,
          formData({
            id: ACTIVITY_ID,
            name: "Atelier",
            active: "true",
            ...champs,
          }),
        ),
    },
  ];

  it.each(porteurs)(
    "$nom : écrit les deux colonnes d'animation",
    async ({ table, op, jouer }) => {
      const resultat = await jouer({
        waitQuizId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        waitPauseCampaignId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      });

      expect(resultat.ok).toBe(true);
      const ecriture = state.rlsWrites.at(-1);
      expect(ecriture?.table).toBe(table);
      expect(ecriture?.op).toBe(op);
      expect(ecriture?.values.wait_quiz_id).toBe(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      expect(ecriture?.values.wait_pause_campaign_id).toBe(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
    },
  );

  it.each(porteurs)(
    "$nom : sans réglage, écrit `null` — l'animation est FACULTATIVE",
    async ({ jouer }) => {
      const resultat = await jouer({});

      expect(resultat.ok).toBe(true);
      const ecriture = state.rlsWrites.at(-1);
      expect(ecriture?.values.wait_quiz_id).toBeNull();
      expect(ecriture?.values.wait_pause_campaign_id).toBeNull();
    },
  );

  it.each(porteurs)(
    "$nom : `\"\"` DÉCROCHE l'animation, il n'échoue pas",
    async ({ jouer }) => {
      // Un `<select>` remis sur « Aucune » poste la chaîne vide : c'est une
      // valeur, pas une absence de décision.
      const resultat = await jouer({
        waitQuizId: "",
        waitPauseCampaignId: "",
      });

      expect(resultat.ok).toBe(true);
      expect(state.rlsWrites.at(-1)?.values.wait_quiz_id).toBeNull();
    },
  );

  it.each(porteurs)(
    "$nom : une FK composite refusée rend un message unique, sans oracle",
    async ({ jouer }) => {
      // Inexistant ou appartenant au voisin : un seul message pour les deux —
      // le distinguer apprendrait à qui tape des identifiants ce qui existe
      // chez le commerce d'en face.
      state.rlsError = { message: "fk", code: "23503" };

      const resultat = await jouer({
        waitQuizId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });

      expect(resultat.ok).toBe(false);
      expect(resultat.ok === false && resultat.error).toMatch(/introuvable/i);
    },
  );
});

// ════════════════════════════════════════════════════════════
// Réservation de stock réel et Drop (RES-5, lot L9)
//
// Ce que ces tests attestent, et qui n'existe nulle part ailleurs :
//   · le PONT D'IDENTITÉ est posé AVANT la prise — le miroir du registre est un
//     trigger `after insert`, donc un pont posé après laisserait `player_id`
//     nul et la prise n'atteindrait JAMAIS `/portefeuille` ;
//   · le challenge Turnstile est opposé sur le SEUL appel émetteur, avec sa
//     propre action (`reserver-stock-hold`) ;
//   · rendre son unité n'oppose AUCUNE friction — c'est le geste qui remet la
//     part en vente ;
//   · la relecture d'état consomme le seau de LECTURE, pas celui des gestes.
// ════════════════════════════════════════════════════════════

const OFFER_ID = "99999999-9999-4999-8999-999999999999";
const HOLD_ID = "77777777-7777-4777-8777-777777777777";

describe("holdStockOffer — bloquer une unité", () => {
  it("appelle la RPC avec l'empreinte du COOKIE, jamais une identité du corps", async () => {
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
    });
    expect(res.ok).toBe(true);
    const appel = state.rpcCalls.find((c) => c.name === "hold_stock_offer");
    expect(appel?.args.p_player_key_hash).toBe(EMPREINTE);
    expect(appel?.args.p_organization_id).toBe(ORG_ID);
    // Ni email ni consentement quand rien n'a été donné.
    expect(appel?.args.p_email).toBeUndefined();
    expect(appel?.args.p_consent).toBe(false);
  });

  it("POSE LE PONT D'IDENTITÉ AVANT LA PRISE, sur l'OFFRE", async () => {
    // ROUGE SI : quelqu'un déplace le pont après la RPC. Le miroir du registre
    // résout le joueur DANS la transaction de la prise ; posé après, il ne
    // trouve rien, `player_id` reste nul, et le lot n'apparaît jamais au
    // portefeuille — sans une erreur nulle part.
    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });
    expect(state.pontsIdentite).toEqual([
      { kind: "reserver_stock", experienceId: OFFER_ID },
    ]);
    expect(state.chronologie.indexOf("pont")).toBeLessThan(
      state.chronologie.indexOf("rpc:hold_stock_offer"),
    );
  });

  // ── LE GARDE-FOU DU PONT (revue L9, M1) ─────────────────────────────────
  //
  // L'ordre ci-dessus est nécessaire ; l'inconditionnel ne l'était pas. Le pont
  // écrit une ligne `players` et une adhésion, et il le faisait AUSSI sur les
  // offres dont on sait d'avance qu'elles refuseront. À cookie neuf, c'était une
  // écriture gratuite et répétable — bornée par rien, là où `stock_total` borne
  // tout le reste du module.
  it("une offre ÉPUISÉE n'écrit AUCUNE identité — le pont n'est pas posé", async () => {
    state.stockOfferPublicState = {
      state: "ok",
      offer_id: OFFER_ID,
      title: "Panier surprise",
      status: "open",
      window_starts_at: "2030-04-12T16:00:00Z",
      window_ends_at: "2030-04-12T18:00:00Z",
      per_player_limit: 1,
      remaining: 0,
      my_hold: null,
    };
    state.stockHoldResponse = { state: "sold_out", remaining: 0 };

    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
    });

    expect(state.pontsIdentite).toHaveLength(0);
    // La RPC reste SEULE JUGE : elle est appelée, et c'est SA réponse qui sort.
    expect(state.rpcCalls.some((c) => c.name === "hold_stock_offer")).toBe(true);
    expect(res.ok && res.data.state).toBe("sold_out");
  });

  it("une offre FERMÉE ou en BROUILLON non plus", async () => {
    state.stockOfferPublicState = { state: "unavailable" };
    state.stockHoldResponse = { state: "unavailable" };
    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });
    expect(state.pontsIdentite).toHaveLength(0);
  });

  it("une panne de la lecture pose le pont QUAND MÊME : le doute profite au joueur", async () => {
    // ROUGE SI : quelqu'un fait de ce garde-fou un fail-closed. Un `false` par
    // défaut ferait d'une panne de lecture une prise sans identité — donc une
    // réservation invisible du portefeuille de son propriétaire, sans erreur
    // nulle part. L'état antérieur (pont posé pour rien) est le bon repli.
    state.stockOfferPublicState = null;
    state.rpcErreurs = ["stock_offer_public_state"];
    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });
    expect(state.pontsIdentite).toEqual([
      { kind: "reserver_stock", experienceId: OFFER_ID },
    ]);
  });

  it("la photo disait épuisé, la RPC a dit oui : le pont est RATTRAPÉ et le cas COMPTÉ", async () => {
    // Le restant lu avant le pont n'est pas verrouillé : une annulation arrivée
    // entre les deux appels rend l'unité. On repose alors le pont — il servira
    // aux prises suivantes — et on compte, parce qu'une fenêtre de course qu'on
    // ne mesure pas est une fenêtre dont on ne saura jamais si elle est rare.
    state.stockOfferPublicState = {
      state: "ok",
      offer_id: OFFER_ID,
      title: "Panier surprise",
      status: "open",
      window_starts_at: "2030-04-12T16:00:00Z",
      window_ends_at: "2030-04-12T18:00:00Z",
      per_player_limit: 1,
      remaining: 0,
      my_hold: null,
    };

    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });

    expect(state.pontsIdentite).toEqual([
      { kind: "reserver_stock", experienceId: OFFER_ID },
    ]);
    expect(state.compteurs).toContain("reserver.stock_hold.pont_rattrape");
  });

  it("tranche le seau par APPAREIL avant celui par organisation", async () => {
    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });
    const seaux = state.rateLimitCalls.map((c) => c.bucket);
    expect(seaux[0]).toContain("reserver:device");
    expect(seaux[1]).toContain("reserver:player");
    // Les deux clés d'identité sont fail-CLOSED (ADR-032 : jamais l'IP).
    expect(state.rateLimitCalls[0].failClosed).toBe(true);
    expect(state.rateLimitCalls[1].failClosed).toBe(true);
  });

  it("compte l'IP SEULE avant l'IP par organisation, et ne refuse jamais dessus", async () => {
    await holdStockOffer({ organizationId: ORG_ID, offerId: OFFER_ID });
    expect(state.pressions.map((p) => p.parts)).toEqual([
      "reserver:ip",
      `reserver:public:ip:${ORG_ID}`,
    ]);
  });

  it("à sec sur l'appareil : aucune prise, aucune RPC, aucun pont", async () => {
    state.seauxASec = ["reserver:device"];
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
    });
    expect(res).toEqual({ ok: false, error: "Trop de tentatives. Patientez un instant." });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.pontsIdentite).toHaveLength(0);
  });

  it("oppose le challenge anti-robot — et seulement s'il est configuré", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    state.turnstileVerdict = false;
    const refus = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      turnstileToken: "jeton",
    });
    expect(refus.ok).toBe(false);
    expect(refus.ok === false && refus.challengeRequired).toBe(true);
    // AUCUNE prise n'est tentée quand le challenge échoue.
    expect(state.rpcCalls.some((c) => c.name === "hold_stock_offer")).toBe(false);
  });

  it("sans clés Turnstile, aucun challenge n'est opposé", async () => {
    state.turnstileConfigure = false;
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
    });
    expect(res.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
  });

  it("refuse un email sans consentement AVANT toute requête (équivalence SQL)", async () => {
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      email: "client@exemple.fr",
    });
    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("envoie la confirmation HORS du chemin de réponse, une fois consentie", async () => {
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      email: "Client@Exemple.FR",
      consent: true,
    });
    expect(res.ok).toBe(true);
    // Rien n'est parti pendant la réponse : c'est `after()` qui l'exécute.
    expect(state.emails).toHaveLength(0);
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(1);
    // L'adresse est celle que Zod a normalisée (trim + minuscules).
    expect(state.emails[0].to).toBe("client@exemple.fr");
    expect(state.emails[0].code).toBe("RESA-ABCD2345");
    expect(String(state.emails[0].windowLabel)).toContain("du ");
  });

  it("le seau par DESTINATAIRE est consommé AVANT l'`after()`, et à sec rien ne part", async () => {
    state.seauxASec = ["reserver:email"];
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    // L'UNITÉ RESTE BLOQUÉE : seul le rappel est sauté, et il est COMPTÉ.
    expect(res.ok).toBe(true);
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
    expect(state.compteurs).toContain("reserver.stock_email.throttled");
  });

  it("N'ENVOIE RIEN sur `already_held` — l'idempotence n'est pas un robinet", async () => {
    state.stockHoldResponse = {
      state: "already_held",
      hold_id: HOLD_ID,
      code: "RESA-ABCD2345",
      status: "held",
      per_player_limit: 1,
    };
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    expect(res.ok).toBe(true);
    await Promise.all(state.taches);
    expect(state.emails).toHaveLength(0);
  });

  it("un échec d'envoi ne défait pas la prise", async () => {
    state.emailLeve = true;
    const res = await holdStockOffer({
      organizationId: ORG_ID,
      offerId: OFFER_ID,
      email: "client@exemple.fr",
      consent: true,
    });
    expect(res.ok).toBe(true);
    await expect(Promise.all(state.taches)).resolves.toBeDefined();
  });
});

describe("cancelStockHold — rendre son unité", () => {
  it("autorise par POSSESSION et ne poste AUCUNE organisation", async () => {
    const res = await cancelStockHold({ holdId: HOLD_ID });
    expect(res.ok).toBe(true);
    const appel = state.rpcCalls.find((c) => c.name === "cancel_stock_hold");
    expect(appel?.args).toEqual({
      p_hold_id: HOLD_ID,
      p_player_key_hash: EMPREINTE,
    });
    expect(appel?.args.p_organization_id).toBeUndefined();
  });

  it("porte le seau par PRISE, jamais par organisation inventée", async () => {
    await cancelStockHold({ holdId: HOLD_ID });
    const seaux = state.rateLimitCalls.map((c) => c.bucket);
    expect(seaux[0]).toContain("reserver:device");
    expect(seaux[1]).toContain(`reserver:player:${HOLD_ID}`);
  });

  it("ne compte que l'IP SEULE : l'organisation n'est pas connue de l'appelant", async () => {
    await cancelStockHold({ holdId: HOLD_ID });
    expect(state.pressions.map((p) => p.parts)).toEqual(["reserver:ip"]);
  });

  it("N'OPPOSE AUCUN CHALLENGE — c'est le geste qui remet la part en vente", async () => {
    state.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    state.turnstileVerdict = false;
    const res = await cancelStockHold({ holdId: HOLD_ID });
    expect(res.ok).toBe(true);
    expect(state.turnstileJetons).toHaveLength(0);
  });

  it("sans cookie, aucune RPC n'est dérangée", async () => {
    state.empreinte = null;
    const res = await cancelStockHold({ holdId: HOLD_ID });
    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("loadStockOfferPublic — la relecture d'état", () => {
  it("consomme le seau de LECTURE, pas celui des gestes", async () => {
    // ROUGE SI : cette lecture repasse sur `reserver:device`. Le premier refus
    // tomberait alors sur `cancelStockHold` — quelqu'un qui veut rendre sa part.
    await loadStockOfferPublic({ offerId: OFFER_ID });
    expect(state.rateLimitCalls.map((c) => c.bucket)).toEqual([
      `reserver:queue-read:${EMPREINTE}`,
    ]);
  });

  it("à sec, la lecture ne rapporte rien — et n'efface rien", async () => {
    state.seauxASec = ["reserver:queue-read"];
    expect(await loadStockOfferPublic({ offerId: OFFER_ID })).toBeNull();
    expect(state.chronologie).not.toContain("lecture:offre");
  });

  it("passe par le lecteur PARTAGÉ avec la page, une seule fois", async () => {
    const etat = await loadStockOfferPublic({ offerId: OFFER_ID });
    expect(etat?.state).toBe("ok");
    expect(etat?.myHold?.code).toBe("RESA-ABCD2345");
    expect(state.chronologie.filter((t) => t === "lecture:offre")).toHaveLength(1);
  });

  it("sert un visiteur SANS COOKIE, sans lui en poser un et sans `my_hold`", async () => {
    state.empreinte = null;
    const etat = await loadStockOfferPublic({ offerId: OFFER_ID });
    expect(etat?.state).toBe("ok");
    expect(etat?.myHold).toBeNull();
    // Aucun seau d'identité n'est opposable : seul le compteur d'IP le mesure.
    expect(state.rateLimitCalls).toHaveLength(0);
    expect(state.pressions.map((p) => p.parts)).toEqual(["reserver:ip"]);
  });

  it("une entrée mal formée ne coûte aucune lecture", async () => {
    expect(await loadStockOfferPublic({ offerId: "pas-un-uuid" })).toBeNull();
    expect(state.chronologie).toHaveLength(0);
  });
});

describe("createStockOffer / updateStockOffer — le panneau du commerçant", () => {
  const champs = {
    title: "Panier surprise",
    description: "Les invendus du soir",
    stockTotal: "12",
    windowStartsAt: "2030-04-12T18:00",
    windowEndsAt: "2030-04-12T20:00",
    perPlayerLimit: "2",
    status: "open",
  };

  it("écrit par le client RLS de la SESSION, avec l'organisation de la session", async () => {
    const res = await createStockOffer(null, formData(champs));
    expect(res.ok).toBe(true);
    const write = state.rlsWrites.at(-1);
    expect(write?.table).toBe("reservation_stock_offers");
    expect(write?.op).toBe("insert");
    expect(write?.values.organization_id).toBe(ORG_ID);
    expect(write?.values.stock_total).toBe(12);
    expect(write?.values.per_player_limit).toBe(2);
    expect(write?.values.status).toBe("open");
    // Les heures civiles sont converties dans le fuseau de l'établissement.
    expect(String(write?.values.window_starts_at)).toContain("2030-04-12T16:00");
  });

  it("naît en brouillon quand le panneau ne rend pas le statut", async () => {
    const sansStatut = { ...champs };
    delete (sansStatut as Record<string, string>).status;
    await createStockOffer(null, formData(sansStatut));
    expect(state.rlsWrites.at(-1)?.values.status).toBe("draft");
  });

  it("PURGE LA VITRINE quand le statut de l'offre change", async () => {
    // FAMILLE 3. `closed` EST l'interrupteur — il n'y a pas de suppression
    // d'offre — et la vitrine n'annonce que les offres `open` DANS leur fenêtre.
    // La fenêtre entre donc dans le même filtre que le statut, et se corrige par
    // le même geste : les deux passent par cette purge.
    await createStockOffer(null, formData(champs));
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);

    purgeVitrine.mockClear();
    await updateStockOffer(
      null,
      formData({ ...champs, id: OFFER_ID, status: "closed" }),
    );
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });

  it("refuse une fenêtre qui remonte le temps, AVANT toute écriture", async () => {
    const res = await createStockOffer(
      null,
      formData({ ...champs, windowEndsAt: "2030-04-12T17:00" }),
    );
    expect(res.ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("refuse un stock hors bornes (1..500)", async () => {
    expect(
      (await createStockOffer(null, formData({ ...champs, stockTotal: "0" }))).ok,
    ).toBe(false);
    expect(
      (await createStockOffer(null, formData({ ...champs, stockTotal: "501" }))).ok,
    ).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("refuse une limite par personne hors bornes (1..3)", async () => {
    expect(
      (await createStockOffer(null, formData({ ...champs, perPlayerLimit: "4" })))
        .ok,
    ).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("le CAISSIER ne configure pas, et une organisation sans droit non plus", async () => {
    state.role = "cashier";
    expect((await createStockOffer(null, formData(champs))).ok).toBe(false);
    state.role = "owner";
    state.orgAddonVitrine = false;
    expect((await createStockOffer(null, formData(champs))).ok).toBe(false);
    expect(state.rlsWrites).toHaveLength(0);
  });

  it("la mise à jour double la RLS par un filtre d'organisation explicite", async () => {
    const res = await updateStockOffer(
      null,
      formData({ ...champs, id: OFFER_ID, status: "closed" }),
    );
    expect(res.ok).toBe(true);
    const write = state.rlsWrites.at(-1);
    expect(write?.op).toBe("update");
    expect(write?.filters).toEqual({ id: OFFER_ID, organization_id: ORG_ID });
    // `closed` est l'INTERRUPTEUR : il n'existe aucun chemin de suppression.
    expect(write?.values.status).toBe("closed");
  });
});

describe("updateReserverActivity — le trigger qui gèle le format PARLE (L8)", () => {
  it("traduit le 23514 en refus lisible plutôt qu'en erreur générique", async () => {
    // La garde COMPTÉE a laissé passer (aucun engagement au moment du compte),
    // et pourtant la base refuse : c'est la fenêtre entre les deux requêtes.
    // Sans ce mappage, le commerçant lisait « Impossible d'enregistrer » sans
    // savoir que quelqu'un venait de réserver pendant qu'il enregistrait.
    state.rlsError = { message: "kind is frozen", code: "23514" };
    const res = await updateReserverActivity(
      null,
      formData({
        id: ACTIVITY_ID,
        name: "Dégustation",
        kind: "duo",
        promise: "Une heure à deux",
        durationMinutes: "60",
        active: "true",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le format n'a pas pu changer : des réservations ou attentes vivantes existent. Rechargez la page.",
    );
  });
});
