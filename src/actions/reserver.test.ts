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
      state.rlsWrites = [];
      state.rlsError = null;
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
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
  };
});

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
}));

vi.mock("@/lib/resend", () => ({
  sendReservationConfirmationEmail: (params: Record<string, unknown>) => {
    state.emails.push(params);
    if (state.emailLeve) return Promise.reject(new Error("resend indisponible"));
    return Promise.resolve(true);
  },
}));

import {
  cancelReservation,
  cancelReservationStaff,
  checkinReservation,
  claimWaitlistOffer,
  closeInvitation,
  createInvitation,
  createReserverActivity,
  createReserverSlot,
  loadMyReservations,
  redeemInvitation,
  reserveSlot,
  revokeInvitation,
  updateReserverSlotStatus,
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
