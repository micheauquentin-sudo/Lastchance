import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLES, type AdminRole } from "@/types/admin";
import { can, type Permission } from "@/lib/admin/rbac";
import type { ActionResult } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Back-office commerçants — LA FRONTIÈRE D'AUTORISATION ET LE PÉRIMÈTRE
// D'UNE SUPPRESSION DÉFINITIVE.
//
// Ce module est le plus destructeur du produit : `deleteMerchant` annule un
// abonnement Stripe, efface une organisation en cascade, supprime des comptes
// de connexion et vide DEUX buckets Storage. Jusqu'ici, tout `src/app/admin/**`
// était sans aucun test : la phrase « le back-office est réservé aux
// super-administrateurs » n'était vraie que par relecture. Ce fichier la rend
// mécanique.
//
// CINQ PROPRIÉTÉS, dans l'ordre de ce qu'un défaut coûterait :
//
//   1. LA GARDE PRÉCÈDE TOUT EFFET. Aucune des treize actions n'écrit sur le
//      commerçant, ne touche Stripe ni Storage avant d'avoir obtenu sa
//      permission. La matrice RBAC RÉELLE (`can`) est branchée dans le
//      harnais : le test ne rejoue pas une copie de la matrice, il l'exerce.
//      La permission demandée par chaque action est en plus figée, donc un
//      `merchants.delete` transformé en `merchants.edit` ouvrirait la
//      suppression au rôle `admin` — et rougirait ici.
//
//   2. LE PÉRIMÈTRE EST L'ORGANISATION VISÉE, ET ELLE SEULE. Quand on efface
//      en masse, le scope est le seul rempart : un `.eq("id", …)` perdu efface
//      TOUS les commerçants, un préfixe Storage perdu vide le bucket entier.
//      Une organisation VOISINE est présente dans la fixture, avec ses objets
//      Storage — sans elle, un test de périmètre ne pourrait pas rougir.
//
//   3. RIEN NE S'EFFACE SANS TRACE. Le journal durable `merchant_deletion_jobs`
//      est écrit AVANT la cascade (assertion d'ORDRE, pas de simple présence),
//      et l'audit `merchant.delete` porte de quoi expliquer la suppression.
//
//   4. UN ÉCHEC PARTIEL NE SE PRÉSENTE PAS COMME UN SUCCÈS. Storage
//      indisponible, compte Auth récalcitrant, Stripe qui refuse : chaque cas
//      a son état de sortie distinct, et aucun ne renvoie l'écran vert. Cas
//      limite : quand le journal durable tombe APRÈS l'annulation Stripe, il
//      reste à `pending` et ment sur ce qui a été fait chez le prestataire —
//      le fait doit alors survivre dans une table qui, elle, répond encore.
//
//   5. UN REFUS LAISSE UNE TRACE. Le back-office ne consignait que ses succès :
//      un compte révoqué qui rejoue ses actions, un opérateur qui teste les
//      limites de son rôle, un POST fabriqué sans session n'y apparaissaient
//      jamais. Cinquante `merchants.delete` refusés d'affilée ressemblaient à
//      une journée calme. La trace est best-effort, et ce n'est pas une
//      négligence : une panne du journal ne doit pas devenir une panne
//      d'autorisation.
//
// Harnais calqué sur src/actions/campaign-templates.test.ts : builder Supabase
// qui ENREGISTRE (table, opération, filtres, payload) au lieu de simuler une
// base. Le faux Storage, lui, est un vrai petit magasin d'objets : il indexe
// des chemins COMPLETS, `list` honore le préfixe, `remove` retire réellement.
// C'est ce qui permet d'affirmer que les fichiers du voisin SURVIVENT.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
/** Une organisation VOISINE, avec des objets à elle : rien ne doit la toucher. */
const OTHER_ORG_ID = "00000000-0000-4000-8000-0000000000a2";
const ORG_SLUG = "chez-marcel";

/** Comptes de connexion (auth.users) de l'équipe du commerçant supprimé. */
const MEMBER_ORPHAN = "00000000-0000-4000-8000-0000000000b1";
const MEMBER_MULTI_ORG = "00000000-0000-4000-8000-0000000000b2";
const MEMBER_IS_ADMIN = "00000000-0000-4000-8000-0000000000b3";

const BUCKETS = ["logos", "poster-images"] as const;
type Bucket = (typeof BUCKETS)[number];

interface DbCall {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload: unknown;
  /** Filtres `.eq()` / `.in()` vus par la requête. */
  filters: Record<string, unknown>;
  /** `select(..., { count: "exact", head: true })` — compte, ne rend rien. */
  head: boolean;
}

type StorageOp =
  | { kind: "list"; bucket: string; prefix: string; offset: number }
  | { kind: "remove"; bucket: string; paths: string[] };

type ListOp = Extract<StorageOp, { kind: "list" }>;
type RemoveOp = Extract<StorageOp, { kind: "remove" }>;

interface AuditInput {
  actor: { id: string; email: string; role: string };
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

const { state, makeDb, JOB_ID } = vi.hoisted(() => {
  // `vi.hoisted` s'exécute AVANT les `const` du module : les littéraux dont le
  // faux client a besoin sont inlinés ici et ré-exportés.
  const JOB_ID = "00000000-0000-4000-8000-0000000000e1";

  const state = {
    /** Toutes les requêtes émises, dans l'ordre de départ. */
    calls: [] as DbCall[],
    storage: [] as StorageOp[],
    /** Comptes Auth réellement passés à `auth.admin.deleteUser`. */
    authDeleted: [] as string[],

    org: null as Record<string, unknown> | null,
    orgReadError: null as string | null,
    orgUpdateError: null as string | null,
    orgDeleteError: null as string | null,
    /** false = le DELETE ne rend aucune ligne (rien n'a été supprimé). */
    orgDeleteHitsRow: true,

    /** Nombre de droits d'origine `stripe` sur l'organisation. */
    stripeEntitlements: 0,
    entitlementError: null as string | null,

    members: [] as string[],
    membersError: null as string | null,
    /** Sous-ensemble des membres qui sont AUSSI des comptes back-office. */
    adminAccounts: [] as string[],
    adminsError: null as string | null,
    /** Adhésions RESTANTES par compte, après la cascade. >0 = pas orphelin. */
    remainingMemberships: {} as Record<string, number>,
    membershipCountError: null as string | null,

    jobInsertError: null as string | null,
    /** Erreur d'écriture du journal, indexée par le statut qu'on tentait d'y poser. */
    jobUpdateErrors: {} as Record<string, string>,
    /** Panne du journal d'audit — la trace d'un refus doit rester best-effort. */
    auditInsertError: null as string | null,

    /** Magasin d'objets : bucket → chemins COMPLETS (`<org>/<fichier>`). */
    storageFiles: {} as Record<string, string[]>,
    storageListError: {} as Record<string, string>,
    storageRemoveError: {} as Record<string, string>,
    authDeleteError: {} as Record<string, string>,

    reset() {
      state.calls = [];
      state.storage = [];
      state.authDeleted = [];
      state.org = null;
      state.orgReadError = null;
      state.orgUpdateError = null;
      state.orgDeleteError = null;
      state.orgDeleteHitsRow = true;
      state.stripeEntitlements = 0;
      state.entitlementError = null;
      state.members = [];
      state.membersError = null;
      state.adminAccounts = [];
      state.adminsError = null;
      state.remainingMemberships = {};
      state.membershipCountError = null;
      state.jobInsertError = null;
      state.jobUpdateErrors = {};
      state.auditInsertError = null;
      state.storageFiles = {};
      state.storageListError = {};
      state.storageRemoveError = {};
      state.authDeleteError = {};
    },
  };

  function makeDb() {
    return {
      from(table: string) {
        const call: DbCall = {
          table,
          op: "select",
          payload: undefined,
          filters: {},
          head: false,
        };
        state.calls.push(call);

        const settle = (): { data: unknown; error: unknown; count?: number | null } => {
          if (call.op === "insert") {
            if (table === "merchant_deletion_jobs") {
              return state.jobInsertError
                ? { data: null, error: { message: state.jobInsertError } }
                : { data: { id: JOB_ID }, error: null };
            }
            if (table === "admin_audit_logs") {
              return {
                data: null,
                error: state.auditInsertError
                  ? { message: state.auditInsertError }
                  : null,
              };
            }
            return { data: null, error: null };
          }
          if (call.op === "update") {
            if (table === "merchant_deletion_jobs") {
              const status = String((call.payload as { status?: unknown }).status ?? "");
              const message = state.jobUpdateErrors[status];
              return { data: null, error: message ? { message } : null };
            }
            return {
              data: null,
              error: state.orgUpdateError ? { message: state.orgUpdateError } : null,
            };
          }
          if (call.op === "delete") {
            if (state.orgDeleteError) {
              return { data: null, error: { message: state.orgDeleteError } };
            }
            return {
              data: state.orgDeleteHitsRow ? { id: call.filters.id } : null,
              error: null,
            };
          }

          if (table === "organizations") {
            return state.orgReadError
              ? { data: null, error: { message: state.orgReadError } }
              : { data: state.org, error: null };
          }
          if (table === "organization_entitlements") {
            return state.entitlementError
              ? { data: null, error: { message: state.entitlementError }, count: null }
              : { data: null, error: null, count: state.stripeEntitlements };
          }
          if (table === "organization_members") {
            // Deux usages distincts, séparés par le mode `head` : le relevé de
            // l'équipe (liste) et le contrôle d'orphelinat (compte).
            if (call.head) {
              const userId = String(call.filters.user_id);
              return state.membershipCountError
                ? { data: null, error: { message: state.membershipCountError }, count: null }
                : {
                    data: null,
                    error: null,
                    count: state.remainingMemberships[userId] ?? 0,
                  };
            }
            return state.membersError
              ? { data: null, error: { message: state.membersError } }
              : { data: state.members.map((user_id) => ({ user_id })), error: null };
          }
          if (table === "admin_users") {
            if (state.adminsError) {
              return { data: null, error: { message: state.adminsError } };
            }
            // Le faux client honore le `.in(...)` : sans quoi le test prouverait
            // la protection des admins sans que la requête la porte.
            const scope = (call.filters.user_id as string[] | undefined) ?? [];
            return {
              data: state.adminAccounts
                .filter((id) => scope.includes(id))
                .map((user_id) => ({ user_id })),
              error: null,
            };
          }
          return { data: null, error: null };
        };

        const builder = {
          select: (_columns?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) call.head = true;
            return builder;
          },
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
          in: (column: string, values: unknown) => {
            call.filters[column] = values;
            return builder;
          },
          maybeSingle: () => Promise.resolve(settle()),
          single: () => Promise.resolve(settle()),
          then: (
            onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(settle()).then(onFulfilled, onRejected),
        };
        return builder;
      },

      storage: {
        from(bucket: string) {
          return {
            /**
             * Fidèle au contrat Supabase : ne rend QUE les objets directement
             * sous `prefix`. C'est ce qui rend un préfixe perdu observable.
             */
            list: (prefix: string, opts: { limit: number; offset: number }) => {
              state.storage.push({ kind: "list", bucket, prefix, offset: opts.offset });
              const failure = state.storageListError[bucket];
              if (failure) {
                return Promise.resolve({ data: null, error: { message: failure } });
              }
              const scope = prefix === "" ? "" : `${prefix}/`;
              const names = (state.storageFiles[bucket] ?? [])
                .filter((path) => path.startsWith(scope))
                .map((path) => path.slice(scope.length))
                .filter((name) => name !== "" && !name.includes("/"));
              return Promise.resolve({
                data: names
                  .slice(opts.offset, opts.offset + opts.limit)
                  .map((name) => ({ name })),
                error: null,
              });
            },
            remove: (paths: string[]) => {
              state.storage.push({ kind: "remove", bucket, paths });
              const failure = state.storageRemoveError[bucket];
              if (!failure) {
                state.storageFiles[bucket] = (state.storageFiles[bucket] ?? []).filter(
                  (path) => !paths.includes(path),
                );
              }
              return Promise.resolve({
                data: null,
                error: failure ? { message: failure } : null,
              });
            },
          };
        },
      },

      auth: {
        admin: {
          deleteUser: (userId: string) => {
            state.authDeleted.push(userId);
            const failure = state.authDeleteError[userId];
            return Promise.resolve({
              data: null,
              error: failure ? { message: failure } : null,
            });
          },
        },
      },
    };
  }

  return { state, makeDb, JOB_ID };
});

const { authState, ACTOR, ACTOR_IP } = vi.hoisted(() => {
  const ACTOR = {
    // `id` (ligne admin_users) et `user_id` (compte auth) VOLONTAIREMENT
    // différents : c'est la seule façon de prouver que la purge Auth lit bien
    // `user_id` et non `id` — sinon l'acteur supprimerait son propre compte.
    id: "00000000-0000-4000-8000-0000000000f1",
    user_id: "00000000-0000-4000-8000-0000000000f2",
    email: "ops@lastchance.test",
    name: "Ops",
    role: "super_admin",
    is_active: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_login_at: null,
  };
  const ACTOR_IP = "203.0.113.7";
  const authState = {
    role: "super_admin" as AdminRole,
    /** Fenêtre sudo ouverte (connexion récente). */
    fresh: true,
    /**
     * false = aucune session admin du tout (cookie absent, expiré, révoqué).
     * C'est le cas d'un POST fabriqué directement contre l'action serveur :
     * il n'a AUCUNE identité à mettre dans une trace, et c'est pourtant celui
     * qu'on a le plus besoin de voir passer.
     */
    session: true,
    calls: [] as Array<{ permission: string; requireFresh: boolean }>,
    reset() {
      authState.role = "super_admin";
      authState.fresh = true;
      authState.session = true;
      authState.calls = [];
    },
  };
  return { authState, ACTOR, ACTOR_IP };
});

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    customers: [] as string[],
    result: { ok: true } as { ok: boolean; error?: string },
    reset() {
      stripeState.customers = [];
      stripeState.result = { ok: true };
    },
  },
}));

const { logAdminActionMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  logAdminActionMock: vi.fn<(input: AuditInput) => Promise<void>>(() => Promise.resolve()),
  revalidatePathMock: vi.fn<(path: string) => void>(),
  redirectMock: vi.fn<(url: string) => void>(),
}));

vi.mock("@/lib/admin/db", () => ({ createAdminBackofficeClient: () => makeDb() }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: logAdminActionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

// La garde est simulée dans son CÂBLAGE (session, cookie, fenêtre sudo) mais
// PAS dans sa décision : `can` est la fonction réelle, sur la matrice réelle.
// Un rôle retiré ou ajouté dans ROLE_PERMISSIONS se voit donc ici.
vi.mock("@/lib/admin/auth", async () => {
  const { can: realCan } = await vi.importActual<typeof import("@/lib/admin/rbac")>(
    "@/lib/admin/rbac",
  );
  class AdminForbiddenError extends Error {
    constructor(message = "Action non autorisée.") {
      super(message);
      this.name = "AdminForbiddenError";
    }
  }
  return {
    AdminForbiddenError,
    authorizeAction: async (
      permission: Permission,
      opts: { requireFresh?: boolean } = {},
    ) => {
      authState.calls.push({ permission, requireFresh: opts.requireFresh === true });
      if (!authState.session) {
        throw new AdminForbiddenError("Session admin requise.");
      }
      if (!realCan(authState.role, permission)) {
        throw new AdminForbiddenError("Permission insuffisante pour cette action.");
      }
      if (opts.requireFresh && !authState.fresh) {
        throw new AdminForbiddenError("Ré-authentification requise.");
      }
      return { ...ACTOR, role: authState.role };
    },
    // L'identité relue APRÈS un refus, pour nommer l'auteur de la tentative.
    // Sans session, elle est nulle — et la trace doit quand même partir.
    getAdminUser: async () =>
      authState.session ? { ...ACTOR, role: authState.role } : null,
    actorIp: async () => ACTOR_IP,
  };
});

vi.mock("@/lib/stripe", async () => {
  const { PLAN_TIERS } = await vi.importActual<typeof import("@/lib/plans")>("@/lib/plans");
  return {
    PLANS: PLAN_TIERS,
    cancelCustomerSubscriptions: (customerId: string) => {
      stripeState.customers.push(customerId);
      return Promise.resolve(stripeState.result);
    },
  };
});

import * as merchantActions from "./actions";

/* ────────────────────────────────────────────────────────────
 * Catalogue des actions : entrée valide, permission ATTENDUE, sudo.
 * Il sert de matrice de refus ET de verrou anti-dérive.
 * ──────────────────────────────────────────────────────────── */

type ActionName = keyof typeof merchantActions;

interface ActionCase {
  name: ActionName;
  permission: Permission;
  /** L'action exige-t-elle une connexion récente (fenêtre sudo) ? */
  sudo: boolean;
  /**
   * Nom d'audit posé sur une tentative REFUSÉE. Le suffixe `.denied` n'est pas
   * décoratif : /admin/audit colore en rouge toute action qui le porte, et le
   * préfixe doit rester celui du succès correspondant pour qu'un même filtre
   * ramène les deux faces d'une action.
   */
  deniedAction: string;
  form: () => FormData;
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const addonForm = () => form({ organizationId: ORG_ID, enabled: "true" });
const deleteForm = () => form({ organizationId: ORG_ID, confirmSlug: ORG_SLUG });

/** Raccourci : les huit bascules d'addon ne diffèrent que par leur nom. */
function addonCase(name: ActionName, slug: string): ActionCase {
  return {
    name,
    permission: "merchants.edit",
    sudo: true,
    deniedAction: `merchant.addon_${slug}.change.denied`,
    form: addonForm,
  };
}

const ACTION_CASES: ActionCase[] = [
  {
    name: "setMerchantStatus",
    permission: "merchants.suspend",
    sudo: true,
    deniedAction: "merchant.status.change.denied",
    form: () => form({ organizationId: ORG_ID, status: "canceled" }),
  },
  {
    name: "setMerchantPlan",
    permission: "merchants.edit",
    // Longtemps la SEULE action `merchants.edit` sans reconnexion, alors
    // qu'elle change le palier facturé — donc l'étendue des droits — là où un
    // addon ne coche qu'un module. L'asymétrie est corrigée ; le test
    // « toutes les actions merchants.edit… » plus bas empêche son retour.
    sudo: true,
    deniedAction: "merchant.plan.change.denied",
    form: () => form({ organizationId: ORG_ID, plan: "engagement" }),
  },
  addonCase("setMerchantPronosticsAddon", "pronostics"),
  addonCase("setMerchantHuntsAddon", "hunts"),
  addonCase("setMerchantLoyaltyAddon", "loyalty"),
  addonCase("setMerchantJackpotAddon", "jackpot"),
  addonCase("setMerchantEventsAddon", "events"),
  addonCase("setMerchantCalendarAddon", "calendar"),
  addonCase("setMerchantReferralAddon", "referral"),
  addonCase("setMerchantQuizAddon", "quiz"),
  {
    name: "setMerchantCompAccess",
    permission: "merchants.comp_access",
    sudo: true,
    deniedAction: "merchant.comp_access.change.denied",
    form: () => form({ organizationId: ORG_ID, enabled: "false" }),
  },
  {
    name: "deleteMerchant",
    permission: "merchants.delete",
    sudo: true,
    deniedAction: "merchant.delete.denied",
    form: deleteForm,
  },
  {
    name: "addMerchantNote",
    permission: "support.reply",
    // Écrire une note n'accorde aucun droit et ne touche aucune donnée du
    // commerçant : seule action du fichier légitimement hors sudo.
    sudo: false,
    deniedAction: "merchant.note.add.denied",
    form: () => form({ organizationId: ORG_ID, body: "Rappel client à 14 h." }),
  },
];

/** Colonnes que les treize actions lisent sur `organizations`. */
function nominalOrg() {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    slug: ORG_SLUG,
    stripe_customer_id: "cus_TEST123",
    subscription_status: "active",
    past_due_since: null,
    plan: "core",
    comp_access: false,
    timezone: "Europe/Paris",
    addon_pronostics: false,
    addon_hunts: false,
    addon_loyalty: false,
    addon_jackpot: false,
    addon_events: false,
    addon_calendar: false,
    addon_referral: false,
    addon_quiz: false,
  };
}

function run(name: ActionName, data: FormData): Promise<ActionResult | undefined> {
  // `deleteMerchant` finit sur `redirect()`, ici simulé : il ne lève pas, donc
  // l'action rend `undefined` en cas de succès. D'où le type élargi.
  return merchantActions[name](data);
}

/** Aucun effet observable : ni base, ni Storage, ni Auth, ni Stripe, ni audit. */
function expectNoEffect() {
  expect(state.calls, "aucune requête ne doit partir").toHaveLength(0);
  expect(state.storage, "aucun objet Storage touché").toHaveLength(0);
  expect(state.authDeleted, "aucun compte Auth supprimé").toHaveLength(0);
  expect(stripeState.customers, "aucun appel Stripe").toHaveLength(0);
  expect(logAdminActionMock).not.toHaveBeenCalled();
  expect(revalidatePathMock).not.toHaveBeenCalled();
  expect(redirectMock).not.toHaveBeenCalled();
}

function callsTo(table: string, op?: DbCall["op"]): DbCall[] {
  return state.calls.filter(
    (call) => call.table === table && (op === undefined || call.op === op),
  );
}

/** La ligne écrite dans `admin_audit_logs` par une tentative refusée. */
function deniedRow(): Record<string, unknown> {
  const inserts = callsTo("admin_audit_logs", "insert");
  expect(inserts, "aucune trace de la tentative refusée").toHaveLength(1);
  return inserts[0].payload as Record<string, unknown>;
}

/**
 * Un refus laisse UNE trace, et rien d'autre. Les deux moitiés comptent :
 * l'absence de tout le reste prouve que la garde précède le premier effet ;
 * la présence de la trace prouve qu'un sondage du back-office est visible.
 */
function expectDeniedTrace(action: string) {
  expect(deniedRow()).toMatchObject({ action, target_type: "organization" });
  expect(
    state.calls.filter((call) => call.table !== "admin_audit_logs"),
    "aucune requête hors journal d'audit",
  ).toHaveLength(0);
  expect(state.storage, "aucun objet Storage touché").toHaveLength(0);
  expect(state.authDeleted, "aucun compte Auth supprimé").toHaveLength(0);
  expect(stripeState.customers, "aucun appel Stripe").toHaveLength(0);
  expect(logAdminActionMock, "aucun audit de succès").not.toHaveBeenCalled();
  expect(revalidatePathMock).not.toHaveBeenCalled();
  expect(redirectMock).not.toHaveBeenCalled();
}

function jobUpdates(): Array<Record<string, unknown>> {
  return callsTo("merchant_deletion_jobs", "update").map(
    (call) => call.payload as Record<string, unknown>,
  );
}

function lastJobUpdate(): Record<string, unknown> {
  const updates = jobUpdates();
  expect(updates.length, "aucune écriture du journal de suppression").toBeGreaterThan(0);
  return updates[updates.length - 1];
}

function auditActions(): string[] {
  return logAdminActionMock.mock.calls.map((call) => call[0].action);
}

function auditEntry(action: string): AuditInput {
  const found = logAdminActionMock.mock.calls
    .map((call) => call[0])
    .find((entry) => entry.action === action);
  expect(found, `aucune entrée d'audit « ${action} »`).toBeDefined();
  return found!;
}

function listOps(): ListOp[] {
  return state.storage.filter((op): op is ListOp => op.kind === "list");
}

function removeOps(): RemoveOp[] {
  return state.storage.filter((op): op is RemoveOp => op.kind === "remove");
}

function removedPaths(bucket: Bucket): string[] {
  return removeOps()
    .filter((op) => op.bucket === bucket)
    .flatMap((op) => op.paths);
}

const NEIGHBOUR_OBJECTS: Record<Bucket, string> = {
  logos: `${OTHER_ORG_ID}/logo-voisin.webp`,
  "poster-images": `${OTHER_ORG_ID}/affiche-voisin.webp`,
};

/**
 * Scénario nominal d'une suppression. `files` porte des NOMS de fichiers, qui
 * sont rangés dans le dossier de l'organisation visée. Les objets de
 * l'organisation VOISINE sont toujours présents : ils sont la seule chose qui
 * permet aux assertions de périmètre Storage de rougir.
 */
function seedDeletion(files: Partial<Record<Bucket, string[]>> = {}) {
  state.members = [MEMBER_ORPHAN, MEMBER_MULTI_ORG, MEMBER_IS_ADMIN, ACTOR.user_id];
  state.adminAccounts = [MEMBER_IS_ADMIN];
  // Le compte multi-boutiques appartient encore à l'organisation voisine.
  state.remainingMemberships = { [MEMBER_MULTI_ORG]: 1 };
  state.storageFiles = Object.fromEntries(
    BUCKETS.map((bucket) => [
      bucket,
      [
        NEIGHBOUR_OBJECTS[bucket],
        ...(files[bucket] ?? []).map((name) => `${ORG_ID}/${name}`),
      ],
    ]),
  );
}

function runDeletion(): Promise<ActionResult | undefined> {
  return run("deleteMerchant", deleteForm());
}

beforeEach(() => {
  state.org = nominalOrg();
});

afterEach(() => {
  state.reset();
  authState.reset();
  stripeState.reset();
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════
 * 1. La garde précède TOUT effet
 * ════════════════════════════════════════════════════════════ */

describe("garde d'autorisation — aucune action n'agit avant d'y avoir droit", () => {
  it("le catalogue de test couvre TOUTES les actions exportées", () => {
    // ROUGE SI : une action est ajoutée au module sans être déclarée ici — donc
    // sans permission attendue, sans exigence sudo, et surtout sans passer par
    // la matrice de refus ci-dessous. Le trou de couverture devient impossible
    // à creuser par distraction.
    // unsafe-cast-justification: reflexion sur l'espace de noms du module — enumerer les exports pour qu'aucune action ne puisse echapper a la matrice de refus exige de sortir du type.
    const namespace = merchantActions as unknown as Record<string, unknown>;
    const exported = Object.keys(namespace)
      .filter((key) => typeof namespace[key] === "function")
      .sort();
    const covered = ACTION_CASES.map((entry) => String(entry.name)).sort();
    expect(covered).toEqual(exported);
  });

  it.each(ACTION_CASES)(
    "$name demande exactement la permission attendue",
    async ({ name, permission, sudo, form: makeForm }) => {
      // ROUGE SI : la chaîne de permission change (un `merchants.delete`
      // rétrogradé en `merchants.edit` ouvrirait la suppression définitive au
      // rôle `admin`, qui n'a pas `merchants.delete`), ou si l'exigence de
      // reconnexion disparaît d'une action sensible.
      await run(name, makeForm());
      expect(authState.calls).toHaveLength(1);
      expect(authState.calls[0]).toEqual({ permission, requireFresh: sudo });
    },
  );

  it("toutes les actions `merchants.edit` exigent la même reconnexion", async () => {
    // ROUGE SI : une action `merchants.edit` perd son `requireFresh` — ou si
    // une nouvelle est ajoutée sans. C'est l'écart qu'a porté
    // `setMerchantPlan` : seule des dix à ne pas exiger de reconnexion, alors
    // qu'elle change le palier FACTURÉ du commerçant, donc l'étendue de ses
    // droits — plus lourd que cocher un module. Un poste laissé déverrouillé
    // suffisait à rétrograder une boutique. L'exigence est relevée sur ce que
    // le CODE demande à l'exécution, pas sur le catalogue ci-dessus.
    const observed: Array<{ name: string; permission: string; requireFresh: boolean }> = [];
    for (const entry of ACTION_CASES.filter((c) => c.permission === "merchants.edit")) {
      authState.calls = [];
      await run(entry.name, entry.form());
      observed.push({
        name: String(entry.name),
        permission: String(authState.calls[0]?.permission),
        requireFresh: authState.calls[0]?.requireFresh === true,
      });
    }

    expect(observed.length).toBeGreaterThan(1);
    expect(
      observed.filter(
        (seen) => seen.permission !== "merchants.edit" || !seen.requireFresh,
      ),
    ).toEqual([]);
  });

  const refusals = ACTION_CASES.flatMap((entry) =>
    ADMIN_ROLES.filter((role) => !can(role, entry.permission)).map((role) => ({
      name: entry.name,
      role,
      deniedAction: entry.deniedAction,
      form: entry.form,
    })),
  );

  it.each(refusals)(
    "$name refusée au rôle $role : la tentative est tracée, et rien d'autre",
    async ({ name, role, deniedAction, form: makeForm }) => {
      // ROUGE SI : la garde passe APRÈS une lecture, une écriture, un appel
      // Stripe ou un `revalidatePath` — l'ordre est prouvé par l'absence de
      // toute trace autre que celle du refus, pas par la lecture du code.
      // ROUGE AUSSI SI : le refus repart muet. Un back-office qui ne consigne
      // que ses succès ne montre jamais qu'on l'a sondé — cinquante
      // `merchants.delete` refusés d'affilée y ressemblent à une journée calme.
      authState.role = role;

      const res = await run(name, makeForm());

      expect(res).toEqual({
        ok: false,
        error: "Permission insuffisante pour cette action.",
      });
      expectDeniedTrace(deniedAction);
    },
  );

  it("le rôle `admin`, le plus élevé sous super_admin, ne peut PAS supprimer", async () => {
    // ROUGE SI : `merchants.delete` est ajoutée au rôle `admin` dans
    // ROLE_PERMISSIONS. Ce test isole le cas le plus coûteux de la matrice
    // ci-dessus : cinq opérateurs internes au lieu d'un seul auraient alors le
    // pouvoir d'effacer un commerçant et toutes ses données.
    authState.role = "admin";

    const res = await runDeletion();

    expect(res).toEqual({
      ok: false,
      error: "Permission insuffisante pour cette action.",
    });
    expectDeniedTrace("merchant.delete.denied");
  });

  it.each(ACTION_CASES.filter((entry) => entry.sudo))(
    "$name refusée hors fenêtre sudo, tentative tracée",
    async ({ name, deniedAction, form: makeForm }) => {
      // ROUGE SI : l'une des douze actions sensibles perd son `requireFresh`.
      // Un poste laissé déverrouillé, ou un cookie admin volé, suffirait alors
      // à supprimer un commerçant sans jamais reprouver l'identité.
      authState.fresh = false;

      const res = await run(name, makeForm());

      expect(res).toEqual({ ok: false, error: "Ré-authentification requise." });
      expectDeniedTrace(deniedAction);
    },
  );

  it.each(ACTION_CASES.filter((entry) => !entry.sudo))(
    "$name reste possible hors fenêtre sudo — écart assumé, figé ici",
    async ({ name, form: makeForm }) => {
      // ROUGE SI : quelqu'un ajoute `requireFresh` à `addMerchantNote`, seule
      // action restante hors sudo. Ce ne serait pas une régression — le cas
      // devra alors migrer dans la liste au-dessus. Ce test existe pour rendre
      // l'écart VISIBLE, et pour qu'il reste un choix : écrire une note support
      // n'accorde aucun droit, l'exiger ferait reconnecter le support toutes
      // les quinze minutes pour rien.
      authState.fresh = false;

      const res = await run(name, makeForm());

      expect(res).toEqual({ ok: true, data: undefined });
    },
  );

  it("une saisie invalide n'écrit rien, même avec tous les droits", async () => {
    // ROUGE SI : la validation zod passe après la première requête. Un
    // identifiant non-UUID venu du formulaire atteindrait alors le client
    // service_role, qui contourne la RLS. Aucune trace de refus attendue ici :
    // l'autorisation, elle, a été accordée — c'est la saisie qui est fautive.
    const res = await run(
      "setMerchantStatus",
      form({ organizationId: "pas-un-uuid", status: "canceled" }),
    );

    expect(res).toMatchObject({ ok: false });
    expectNoEffect();
  });
});

/* ════════════════════════════════════════════════════════════
 * 1 bis. Ce que dit la trace d'un refus
 * ════════════════════════════════════════════════════════════ */

describe("tentatives refusées — un journal qui ne dit plus que les succès", () => {
  it("la trace nomme l'opérateur, son rôle, le droit manquant et l'IP", async () => {
    // ROUGE SI : la trace part anonyme, ou sans le droit demandé. Sans le nom
    // et l'IP, impossible de distinguer un opérateur qui s'est trompé d'écran
    // d'un compte compromis ; sans le droit visé, impossible de dire ce que la
    // tentative cherchait à atteindre.
    authState.role = "support";

    await run("deleteMerchant", deleteForm());

    expect(deniedRow()).toMatchObject({
      admin_user_id: ACTOR.id,
      actor_email: ACTOR.email,
      actor_role: "support",
      action: "merchant.delete.denied",
      target_type: "organization",
      target_id: ORG_ID,
      metadata: {
        permission: "merchants.delete",
        reason: "Permission insuffisante pour cette action.",
      },
      ip: ACTOR_IP,
    });
  });

  it("un appel SANS session admin est tracé, pas seulement rejeté", async () => {
    // ROUGE SI : la trace n'est écrite que lorsqu'un admin est identifié.
    // C'est pourtant l'appel sans session — un POST fabriqué directement
    // contre l'action serveur — qu'on a le plus besoin de voir : c'est le seul
    // signal qu'une adresse cherche la porte. `admin_user_id` doit rester nul
    // (aucune ligne admin_users à référencer, la FK refuserait tout le reste)
    // et le rôle vaut `none`, comme pour `admin.login.denied`.
    authState.session = false;

    const res = await run(
      "setMerchantStatus",
      form({ organizationId: ORG_ID, status: "canceled" }),
    );

    expect(res).toEqual({ ok: false, error: "Session admin requise." });
    expect(deniedRow()).toMatchObject({
      admin_user_id: null,
      actor_email: "inconnu",
      actor_role: "none",
      action: "merchant.status.change.denied",
      target_id: ORG_ID,
    });
  });

  it("un identifiant fabriqué n'entre pas dans la trace", async () => {
    // ROUGE SI : la valeur brute du formulaire est recopiée dans `target_id`.
    // La colonne porte `check (char_length(target_id) <= 120)` : une chaîne
    // longue ferait échouer l'insertion, donc PERDRE la trace — précisément
    // pour la requête fabriquée qu'on voulait voir. Le refus, lui, reste
    // prononcé, et la trace part sans cible plutôt que pas du tout.
    authState.role = "read_only";

    const res = await run(
      "setMerchantPlan",
      form({ organizationId: "x".repeat(400), plan: "engagement" }),
    );

    expect(res).toMatchObject({ ok: false });
    expect(deniedRow()).toMatchObject({
      target_id: null,
      action: "merchant.plan.change.denied",
    });
  });

  it("un journal en panne ne transforme pas un refus en autre chose", async () => {
    // ROUGE SI : l'écriture de la trace cesse d'être best-effort. Une panne du
    // journal deviendrait alors une panne d'autorisation : l'appelant
    // recevrait un message différent, voire une exception, là où le refus
    // était déjà prononcé et parfaitement correct. Une trace perdue coûte
    // moins cher qu'un back-office qui répond faux quand son journal tousse.
    authState.role = "read_only";
    state.auditInsertError = "journal indisponible";

    const res = await run(
      "setMerchantPlan",
      form({ organizationId: ORG_ID, plan: "engagement" }),
    );

    expect(res).toEqual({
      ok: false,
      error: "Permission insuffisante pour cette action.",
    });
    expect(callsTo("organizations")).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * 2. Stripe reste l'autorité sur les droits payants
 * ════════════════════════════════════════════════════════════ */

describe("droits pilotés par Stripe — la case du back-office ne les écrase pas", () => {
  const managed = ACTION_CASES.filter(
    (entry) => entry.name === "setMerchantPlan" || entry.name.endsWith("Addon"),
  );

  it.each(managed)(
    "$name refuse d'écrire quand un droit vient de Stripe",
    async ({ name, form: makeForm }) => {
      // ROUGE SI : `rejectStripeManagedEntitlements` disparaît d'une de ces
      // neuf actions. La conséquence produit est un accès payant accordé hors
      // Stripe, que le prochain webhook révoquerait sans prévenir — le
      // commerçant perdrait un module en pleine campagne.
      state.stripeEntitlements = 1;

      const res = await run(name, makeForm());

      expect(res).toMatchObject({ ok: false });
      expect(callsTo("organizations", "update")).toHaveLength(0);
    },
  );

  it.each(managed)(
    "$name TRACE son refus au lieu de repartir muet",
    async ({ name, deniedAction, form: makeForm }) => {
      // ROUGE SI : le refus redevient silencieux. `authorizeOrTrace` ne couvre
      // pas ce cas-là — il trace le manque de PERMISSION, or ici l'opérateur
      // est parfaitement autorisé et c'est l'autorité sur les droits qui lui
      // est refusée. Douze tentatives sur douze modules d'une organisation
      // Stripe ne laissaient donc aucune trace : la classe de trou fermée par
      // les PR #46-50, « un back-office qui n'enregistrait que ses succès ».
      state.stripeEntitlements = 1;

      await run(name, makeForm());

      expect(logAdminActionMock).toHaveBeenCalledTimes(1);
      const trace = logAdminActionMock.mock.calls[0][0] as {
        action: string;
        targetType: string;
        targetId: string;
        metadata: Record<string, unknown>;
      };
      // Suffixe `.denied` et non `.blocked` : /admin/audit ne colore en rouge
      // que le premier (audit/page.tsx:20). Un refus qu'on ne repère pas dans
      // le journal ne remplit pas l'office pour lequel il y est écrit.
      //
      // Même nom que le refus de PERMISSION de la même action, délibérément :
      // « ce geste a été refusé » est un seul fait pour qui relit le journal.
      // C'est `metadata.reason` qui dit lequel des deux refus a joué.
      expect(trace.action).toBe(deniedAction);
      expect(trace.targetType).toBe("organization");
      expect(trace.targetId).toBe(ORG_ID);
      expect(trace.metadata).toEqual({ reason: "stripe_managed" });
    },
  );

  it("une vérification IMPOSSIBLE laisse elle aussi une trace, distincte", async () => {
    // ROUGE SI : seul le refus légitime est tracé. Une panne du contrôle et un
    // refus d'autorité se ressemblent à l'écran ; seule la métadonnée les
    // distingue après coup, et sans trace on ne saurait même pas qu'il y a eu
    // panne.
    state.entitlementError = "connexion perdue";

    await run("setMerchantPlan", form({ organizationId: ORG_ID, plan: "engagement" }));

    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({
      action: "merchant.plan.change.denied",
      metadata: { reason: "entitlement_authority_unavailable" },
    });
  });

  it.each(managed)(
    "$name n'interroge les droits QUE de l'organisation visée",
    async ({ name, form: makeForm }) => {
      // ROUGE SI : le filtre `organization_id` saute — le contrôle deviendrait
      // global (un seul commerçant sous Stripe gèlerait le back-office pour
      // tous les autres).
      await run(name, makeForm());

      const check = callsTo("organization_entitlements");
      expect(check).toHaveLength(1);
      expect(check[0].filters).toEqual({
        organization_id: ORG_ID,
        source: "stripe",
      });
    },
  );

  it("une vérification impossible bloque l'écriture au lieu de la laisser passer", async () => {
    // ROUGE SI : l'erreur de lecture est ignorée (`count ?? 0` sur une réponse
    // en erreur vaudrait 0 et laisserait écrire). Fail-closed exigé : on ne
    // modifie pas des droits payants quand on ignore qui en est l'autorité.
    state.entitlementError = "connexion perdue";

    const res = await run("setMerchantPlan", form({
      organizationId: ORG_ID,
      plan: "engagement",
    }));

    expect(res).toMatchObject({ ok: false });
    expect(callsTo("organizations", "update")).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * 2 bis. « Impayé » depuis le back-office doit COUPER quelque chose
 *
 * Le sélecteur de statut rendait « Impayé » (merchantStatusSchema admet
 * `past_due`, merchant-controls l'affiche) et n'écrivait QUE
 * `subscription_status`. Or c'est `past_due_since` — et elle seule — qui
 * borne le délai de grâce : `hasActiveAccess` lit une date absente comme
 * « transition en cours, le webhook la datera » et n'ouvre donc JAMAIS la
 * coupure. L'accès restait complet indéfiniment, roues publiques comprises,
 * pendant que le commerçant voyait une bannière rouge d'échec de paiement.
 *
 * Cette action était le SEUL écrivain de `subscription_status`, tous langages
 * confondus, à ne pas maintenir `past_due_since` : les deux écrivains SQL
 * (00019:493 et apply_stripe_subscription_event_v2, 20260805170000:242)
 * portent tous deux la même formule, reprise ici à l'identique.
 * ════════════════════════════════════════════════════════════ */

describe("setMerchantStatus — l'impayé est DATÉ, sinon il ne coupe rien", () => {
  function orgUpdate(): Record<string, unknown> {
    const updates = callsTo("organizations", "update");
    expect(updates, "un seul UPDATE attendu").toHaveLength(1);
    return updates[0].payload as Record<string, unknown>;
  }

  it("passage en « Impayé » : la date d'entrée est posée", async () => {
    // ROUGE SI : l'UPDATE retombe à `{ subscription_status }` seul. Le délai
    // de grâce n'expire alors jamais et la suspension est purement décorative.
    const avant = Date.now();

    const res = await run("setMerchantStatus", form({
      organizationId: ORG_ID,
      status: "past_due",
    }));

    expect(res).toEqual({ ok: true, data: undefined });
    const pastDueSince = orgUpdate().past_due_since;
    expect(typeof pastDueSince).toBe("string");
    const pose = new Date(pastDueSince as string).getTime();
    expect(pose).toBeGreaterThanOrEqual(avant);
    expect(pose).toBeLessThanOrEqual(Date.now());
  });

  it("impayé déjà daté : réappliquer le statut NE REPOUSSE PAS l'échéance", async () => {
    // ROUGE SI : le `coalesce` disparaît. Un opérateur qui reclique « Appliquer »
    // — ou deux passages du même écran — rallongerait le délai de grâce de
    // quatorze jours à chaque fois, sans que rien ne le dise.
    state.org = { ...nominalOrg(), past_due_since: "2026-07-01T08:00:00Z" };

    await run("setMerchantStatus", form({
      organizationId: ORG_ID,
      status: "past_due",
    }));

    expect(orgUpdate().past_due_since).toBe("2026-07-01T08:00:00Z");
  });

  it("sortie d'impayé : la date est EFFACÉE", async () => {
    // ROUGE SI : la date survit à une réactivation. `pastDueGraceEndsAt` ne la
    // lit que sur le statut `past_due`, mais la laisser derrière soi ferait
    // repartir d'une échéance déjà écoulée au prochain impayé — coupure
    // immédiate, sans délai de grâce.
    state.org = { ...nominalOrg(), past_due_since: "2026-07-01T08:00:00Z" };

    // `trialing` est volontairement hors du schéma back-office (un essai se
    // définit par sa date de fin) : les trois autres sorties sont exhaustives.
    for (const status of ["active", "canceled", "inactive"] as const) {
      state.calls = [];
      await run("setMerchantStatus", form({ organizationId: ORG_ID, status }));
      expect(orgUpdate().past_due_since, status).toBeNull();
    }
  });

  it("la date d'entrée est LUE avant d'être décidée", async () => {
    // ROUGE SI : le SELECT préalable cesse de ramener `past_due_since` — le
    // `coalesce` ci-dessus deviendrait indécidable et le code retomberait
    // silencieusement sur `now()` à chaque application.
    await run("setMerchantStatus", form({ organizationId: ORG_ID, status: "past_due" }));

    const reads = callsTo("organizations", "select");
    expect(reads).toHaveLength(1);
    expect(reads[0].filters).toEqual({ id: ORG_ID });
  });
});

/* ════════════════════════════════════════════════════════════
 * 2 ter. L'accès offert AVEC module sur une organisation Stripe
 *
 * `setMerchantCompAccess` était la seule action à écrire une colonne
 * `addon_*` sans demander d'abord qui en est l'autorité. Le trigger
 * `organizations_protect_stripe_entitlements` refusait alors l'UPDATE, qui
 * est UNITAIRE : accès offert, date et motif partaient avec le module. Et
 * l'opérateur ne lisait que « Échec de la mise à jour. ».
 * ════════════════════════════════════════════════════════════ */

describe("setMerchantCompAccess — un refus qui dit pourquoi, et seulement quand il faut", () => {
  const avecModule = () =>
    form({
      organizationId: ORG_ID,
      enabled: "true",
      until: "2099-01-01",
      note: "Partenaire presse",
      includePronostics: "true",
    });

  it("module coché sur une organisation Stripe : refus EXPLIQUÉ, rien n'est écrit", async () => {
    // ROUGE SI : la garde disparaît. L'opérateur retrouve « Échec de la mise à
    // jour. » sans cause ni marche à suivre, et perd au passage l'accès offert,
    // la date et le motif qu'il venait de saisir.
    state.stripeEntitlements = 1;

    const res = await run("setMerchantCompAccess", avecModule());

    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).not.toBe("Échec de la mise à jour.");
    expect((res as { error: string }).error).toContain("Stripe");
    expect(callsTo("organizations", "update")).toHaveLength(0);
    // Le refus est tracé (et lui seul : aucun succès n'a été journalisé).
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0][0]).toMatchObject({
      action: "merchant.comp_access.change.denied",
      metadata: { reason: "stripe_managed" },
    });
  });

  it("module DÉJÀ posé par Stripe : aucun refus, l'écriture n'aurait rien changé", async () => {
    // ROUGE SI : la garde repart sur « une case est cochée » sans regarder
    // l'état courant. Le trigger, lui, ne lève que sur `is distinct from`
    // (20260805170000:126-137) : cocher « Pronostics » sur une organisation
    // dont Stripe a DÉJÀ posé `addon_pronostics = true` n'aurait rien modifié.
    // Le refus tombait donc sur un NO-OP — échec fermé, donc sans danger, mais
    // il bloquait l'opérateur sans raison et lui demandait d'aller faire dans
    // Stripe ce qui y était déjà fait. Un refus qui ne protège de rien
    // n'enseigne rien : il apprend à contourner.
    state.stripeEntitlements = 1;
    state.org = { ...nominalOrg(), addon_pronostics: true };

    const res = await run("setMerchantCompAccess", avecModule());

    expect(res).toEqual({ ok: true, data: undefined });
    // Le contrôle d'autorité n'a même pas été interrogé.
    expect(callsTo("organization_entitlements")).toHaveLength(0);
    const payload = callsTo("organizations", "update")[0].payload as Record<
      string,
      unknown
    >;
    expect(payload.comp_access).toBe(true);
  });

  it("un module DÉJÀ posé n'exempte PAS un module qui, lui, changerait", async () => {
    // ROUGE SI : la comparaison devient un « au moins un module est déjà là »
    // au lieu d'un « au moins un module changerait ». Cocher Pronostics (déjà
    // vrai) ET Chasses (faux) écrirait alors `addon_hunts` sur une
    // organisation pilotée par Stripe — l'accès payant accordé hors Stripe que
    // toute cette garde existe pour empêcher.
    state.stripeEntitlements = 1;
    state.org = { ...nominalOrg(), addon_pronostics: true };

    const res = await run("setMerchantCompAccess", form({
      organizationId: ORG_ID,
      enabled: "true",
      includePronostics: "true",
      includeHunts: "true",
    }));

    expect(res).toMatchObject({ ok: false });
    expect(callsTo("organizations", "update")).toHaveLength(0);
  });

  it("le contrôle est borné à l'organisation visée", async () => {
    // ROUGE SI : le filtre `organization_id` saute — un seul commerçant sous
    // Stripe gèlerait l'accès offert de tous les autres.
    await run("setMerchantCompAccess", avecModule());

    const check = callsTo("organization_entitlements");
    expect(check).toHaveLength(1);
    expect(check[0].filters).toEqual({
      organization_id: ORG_ID,
      source: "stripe",
    });
  });

  it("accès offert SANS module : accordé même sur une organisation Stripe", async () => {
    // ROUGE SI : la garde devient inconditionnelle. Ce serait une régression
    // pure : le trigger est déclaré `before update of plan, addon_*` et ne se
    // déclenche pas sur comp_access — offrir un accès à un abonné Stripe est
    // légitime et fonctionnait déjà. Une garde trop large casse ce qui marche.
    state.stripeEntitlements = 1;

    const res = await run("setMerchantCompAccess", form({
      organizationId: ORG_ID,
      enabled: "true",
      until: "2099-01-01",
      note: "Geste commercial",
    }));

    expect(res).toEqual({ ok: true, data: undefined });
    expect(callsTo("organization_entitlements")).toHaveLength(0);
    const payload = callsTo("organizations", "update")[0].payload as Record<string, unknown>;
    expect(payload.comp_access).toBe(true);
    expect(payload).not.toHaveProperty("addon_pronostics");
  });

  it("révocation avec les cases encore cochées : aucun contrôle, aucun module écrit", async () => {
    // ROUGE SI : la garde regarde les cases sans regarder `enabled`. Retirer un
    // accès offert n'écrit aucun `addon_*` (les options ne coupent jamais un
    // module) : exiger l'autorité Stripe pour REPRENDRE un cadeau serait
    // absurde, et bloquerait le retrait.
    state.stripeEntitlements = 1;

    const res = await run("setMerchantCompAccess", form({
      organizationId: ORG_ID,
      enabled: "false",
      includePronostics: "true",
    }));

    expect(res).toEqual({ ok: true, data: undefined });
    expect(callsTo("organization_entitlements")).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * 3. deleteMerchant — le périmètre
 * ════════════════════════════════════════════════════════════ */

describe("deleteMerchant — le périmètre est l'organisation visée, et elle seule", () => {
  it("supprime UNE organisation, désignée par son identifiant", async () => {
    // ROUGE SI : le `.eq("id", organizationId)` disparaît ou change de colonne.
    // Sans lui, le client service_role (qui contourne la RLS) efface la table
    // `organizations` entière — tous les commerçants du SaaS, en cascade.
    seedDeletion();

    await runDeletion();

    const deletes = state.calls.filter((call) => call.op === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe("organizations");
    expect(deletes[0].filters).toEqual({ id: ORG_ID });
  });

  it("ne vide que le dossier de l'organisation, dans chacun des deux buckets", async () => {
    // ROUGE SI : le préfixe passé à `list` cesse d'être l'identifiant de
    // l'organisation. Un `list("")` énumérerait la racine du bucket et emporte-
    // rait les objets du voisin — le faux Storage indexe des chemins complets
    // et honore le préfixe, donc la fuite serait visible dans `removedPaths`.
    // Le NOMBRE de buckets, lui, est verrouillé côté base par
    // supabase/tests/storage_acl.test.sql (« les seuls buckets sont logos et
    // poster-images ») : un troisième bucket y rougit d'abord.
    seedDeletion({
      logos: ["logo.webp"],
      "poster-images": ["affiche-1.webp", "affiche-2.webp"],
    });

    await runDeletion();

    expect(listOps().length).toBeGreaterThan(0);
    for (const op of listOps()) expect(op.prefix).toBe(ORG_ID);
    expect(new Set(listOps().map((op) => op.bucket))).toEqual(new Set(BUCKETS));

    expect(removedPaths("logos")).toEqual([`${ORG_ID}/logo.webp`]);
    expect(removedPaths("poster-images")).toEqual([
      `${ORG_ID}/affiche-1.webp`,
      `${ORG_ID}/affiche-2.webp`,
    ]);
  });

  it("les objets de l'organisation voisine survivent, et elle n'est nommée nulle part", async () => {
    // ROUGE SI : la purge Storage déborde du dossier visé. C'est l'assertion la
    // plus concrète du fichier : après la suppression, le logo du commerçant
    // d'à côté doit être TOUJOURS dans le magasin. Le second contrôle est un
    // filet volontairement grossier — il attrape les fuites de portée
    // qu'aucune assertion ciblée n'avait prévues.
    seedDeletion({ logos: ["logo.webp"], "poster-images": ["affiche.webp"] });

    await runDeletion();

    expect(state.storageFiles.logos).toEqual([NEIGHBOUR_OBJECTS.logos]);
    expect(state.storageFiles["poster-images"]).toEqual([
      NEIGHBOUR_OBJECTS["poster-images"],
    ]);

    const trace = JSON.stringify({
      calls: state.calls,
      storage: state.storage,
      audit: logAdminActionMock.mock.calls,
    });
    expect(trace).not.toContain(OTHER_ORG_ID);
  });

  it("vide un dossier de plus de 100 objets jusqu'au dernier", async () => {
    // ROUGE SI : la pagination saute (`offset` figé, ou une seule page lue).
    // Conséquence produit : une suppression annoncée « complète » laisserait
    // 150 affiches du commerçant en ligne et publiquement lisibles — le bucket
    // est public. Promesse RGPD non tenue, sans le moindre signal.
    const names = Array.from({ length: 250 }, (_, index) => `poster-${index}.webp`);
    seedDeletion({ "poster-images": names });

    await runDeletion();

    expect(removedPaths("poster-images")).toEqual(
      names.map((name) => `${ORG_ID}/${name}`),
    );
    // Découpé en lots d'au plus 100 : un `remove` de 250 chemins d'un coup
    // serait refusé par l'API Storage.
    for (const op of removeOps()) expect(op.paths.length).toBeLessThanOrEqual(100);
  });

  it("ne supprime que les comptes devenus orphelins", async () => {
    // ROUGE SI : le contrôle d'orphelinat disparaît. Le gérant d'un groupe de
    // trois boutiques perdrait son compte de connexion — et l'accès à ses deux
    // autres organisations — parce qu'on a supprimé la troisième.
    seedDeletion();

    await runDeletion();

    expect(state.authDeleted).toEqual([MEMBER_ORPHAN]);
  });

  it("n'efface jamais le compte de l'acteur ni celui d'un administrateur", async () => {
    // ROUGE SI : `selectAuthCleanupCandidates` reçoit `actor.id` (la ligne
    // admin_users) au lieu de `actor.user_id` (le compte auth) — les deux sont
    // distincts dans cette fixture EXPRÈS. Le super-admin qui supprime un
    // commerçant dont il est membre se supprimerait alors lui-même, et un
    // collègue back-office membre de ce commerçant disparaîtrait avec.
    seedDeletion();

    await runDeletion();

    expect(state.authDeleted).not.toContain(ACTOR.user_id);
    expect(state.authDeleted).not.toContain(ACTOR.id);
    expect(state.authDeleted).not.toContain(MEMBER_IS_ADMIN);
  });

  it("la recherche de comptes administrateurs est bornée à l'équipe relevée", async () => {
    // ROUGE SI : le `.in("user_id", memberIds)` est remplacé par une lecture
    // complète de `admin_users`. La protection tiendrait encore, mais le
    // back-office ramènerait toute sa table d'administrateurs à chaque
    // suppression — une liste nominative qui n'a rien à faire là.
    seedDeletion();

    await runDeletion();

    const lookup = callsTo("admin_users");
    expect(lookup).toHaveLength(1);
    expect(lookup[0].filters.user_id).toEqual(state.members);
  });

  it("un slug de confirmation faux n'engage rien", async () => {
    // ROUGE SI : la ressaisie du slug cesse d'être comparée à `org.slug`, ou
    // devient laxiste (casse, espaces). C'est le seul garde-fou contre le clic
    // sur la mauvaise ligne d'une liste de commerçants.
    seedDeletion();

    const res = await run(
      "deleteMerchant",
      form({ organizationId: ORG_ID, confirmSlug: "Chez-Marcel" }),
    );

    expect(res).toMatchObject({ ok: false });
    expect(callsTo("merchant_deletion_jobs")).toHaveLength(0);
    expect(state.calls.filter((call) => call.op === "delete")).toHaveLength(0);
    expect(stripeState.customers).toHaveLength(0);
    expect(state.storage).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * 4. deleteMerchant — rien ne s'efface sans trace
 * ════════════════════════════════════════════════════════════ */

describe("deleteMerchant — traçabilité", () => {
  it("le journal durable est écrit AVANT la cascade, pas après", async () => {
    // ROUGE SI : l'insertion du journal passe après le DELETE. Une coupure au
    // milieu de la cascade laisserait alors une organisation à moitié effacée
    // dont plus rien ne dirait qui l'a lancée, ni sur quel client Stripe.
    seedDeletion();

    await runDeletion();

    const jobInsert = state.calls.findIndex(
      (call) => call.table === "merchant_deletion_jobs" && call.op === "insert",
    );
    const orgDelete = state.calls.findIndex((call) => call.op === "delete");
    expect(jobInsert).toBeGreaterThanOrEqual(0);
    expect(orgDelete).toBeGreaterThan(jobInsert);
  });

  it("le journal porte l'acteur, l'organisation et l'équipe visée", async () => {
    // ROUGE SI : l'un de ces champs cesse d'être écrit. Le nom et le slug sont
    // la seule mémoire d'une organisation qui n'existe plus ; `member_user_ids`
    // est la seule façon de répondre à « quels comptes ont été purgés ».
    seedDeletion();

    await runDeletion();

    const insert = callsTo("merchant_deletion_jobs", "insert")[0].payload as Record<
      string,
      unknown
    >;
    expect(insert).toMatchObject({
      organization_id: ORG_ID,
      organization_name: "Chez Marcel",
      organization_slug: ORG_SLUG,
      stripe_customer_id: "cus_TEST123",
      actor_admin_user_id: ACTOR.id,
      actor_email: ACTOR.email,
      member_user_ids: state.members,
      status: "pending",
    });
  });

  it("le journal n'est mis à jour que sur SA propre ligne", async () => {
    // ROUGE SI : le `.eq("id", jobId)` disparaît des mises à jour — tous les
    // journaux de suppression du produit basculeraient au statut de la dernière
    // opération, effaçant l'histoire des précédentes.
    seedDeletion();

    await runDeletion();

    const updates = callsTo("merchant_deletion_jobs", "update");
    expect(updates.length).toBeGreaterThan(0);
    for (const call of updates) expect(call.filters).toEqual({ id: JOB_ID });
  });

  it("l'audit `merchant.delete` explique ce qui a disparu", async () => {
    // ROUGE SI : l'appel d'audit est retiré ou vidé de ses métadonnées. Une
    // suppression de commerçant sans trace est une suppression qu'on ne peut
    // pas expliquer — ni au commerçant, ni à un régulateur.
    seedDeletion({ logos: ["logo.webp"] });

    await runDeletion();

    expect(auditActions()).toContain("merchant.delete");
    const entry = auditEntry("merchant.delete");
    expect(entry.targetType).toBe("organization");
    expect(entry.targetId).toBe(ORG_ID);
    expect(entry.metadata).toMatchObject({
      jobId: JOB_ID,
      slug: ORG_SLUG,
      members: state.members.length,
      stripeCanceled: true,
      protectedAdminAccounts: 1,
      cleanupWarnings: 0,
    });
  });

  it("la facturation est arrêtée avant que les données ne disparaissent", async () => {
    // ROUGE SI : l'ordre s'inverse. Effacer d'abord, c'est perdre le
    // `stripe_customer_id` si l'annulation échoue — le commerçant continue
    // d'être prélevé pour un compte qui n'existe plus, et plus rien côté
    // produit ne permet de retrouver son client Stripe.
    seedDeletion();

    await runDeletion();

    expect(stripeState.customers).toEqual(["cus_TEST123"]);
    const stripeMark = state.calls.findIndex(
      (call) =>
        call.table === "merchant_deletion_jobs" &&
        call.op === "update" &&
        (call.payload as { status?: unknown }).status === "stripe_canceled",
    );
    const orgDelete = state.calls.findIndex((call) => call.op === "delete");
    expect(stripeMark).toBeGreaterThanOrEqual(0);
    expect(orgDelete).toBeGreaterThan(stripeMark);
  });
});

/* ════════════════════════════════════════════════════════════
 * 5. deleteMerchant — un échec partiel ne se présente pas comme un succès
 * ════════════════════════════════════════════════════════════ */

describe("deleteMerchant — états de sortie", () => {
  it("succès complet : journal `completed` et retour explicite", async () => {
    // ROUGE SI : le succès et l'échec partiel finissent au même endroit — le
    // cas nominal est la référence dont les suivants doivent se distinguer.
    seedDeletion({ logos: ["logo.webp"] });

    await runDeletion();

    expect(lastJobUpdate()).toMatchObject({
      status: "completed",
      cleanup_errors: [],
      last_error: null,
    });
    expect(redirectMock).toHaveBeenCalledWith("/admin/merchants?deletion=success");
  });

  it("Storage indisponible : l'écran dit « avertissement », pas « succès »", async () => {
    // ROUGE SI : l'échec de purge est avalé et l'opérateur voit l'écran vert.
    // Il croirait les affiches du commerçant effacées alors qu'elles restent
    // publiquement servies — et personne ne repasserait derrière.
    seedDeletion({ "poster-images": ["affiche.webp"] });
    state.storageListError.logos = "storage indisponible";

    await runDeletion();

    const final = lastJobUpdate();
    expect(final.status).toBe("completed_with_warnings");
    expect(final.cleanup_errors).toEqual([
      { stage: "storage:logos", message: "storage indisponible" },
    ]);
    expect(final.last_error).toBe("Nettoyage incomplet");
    expect(redirectMock).toHaveBeenCalledWith("/admin/merchants?deletion=warning");
    expect(auditEntry("merchant.delete").metadata).toMatchObject({ cleanupWarnings: 1 });
  });

  it("un bucket en panne n'empêche pas de purger l'autre", async () => {
    // ROUGE SI : le try/catch remonte autour de la boucle plutôt qu'autour de
    // chaque bucket. Une panne sur `logos` laisserait alors toutes les affiches
    // en ligne, alors qu'elles étaient parfaitement supprimables.
    seedDeletion({ "poster-images": ["affiche.webp"] });
    state.storageListError.logos = "storage indisponible";

    await runDeletion();

    expect(removedPaths("poster-images")).toEqual([`${ORG_ID}/affiche.webp`]);
  });

  it("un compte Auth récalcitrant est signalé, pas oublié", async () => {
    // ROUGE SI : l'erreur de `deleteUser` cesse d'être lue. Un compte de
    // connexion survivrait à la suppression de sa dernière organisation sans
    // que rien ne le dise — une donnée personnelle conservée par accident.
    seedDeletion();
    state.authDeleteError[MEMBER_ORPHAN] = "user is protected";

    await runDeletion();

    const final = lastJobUpdate();
    expect(final.status).toBe("completed_with_warnings");
    expect(final.cleanup_errors).toEqual([
      { stage: "auth_delete", userId: MEMBER_ORPHAN, message: "user is protected" },
    ]);
    expect(redirectMock).toHaveBeenCalledWith("/admin/merchants?deletion=warning");
  });

  it("Stripe refuse : rien n'est effacé, la tentative est auditée", async () => {
    // ROUGE SI : la suppression continue malgré l'échec d'annulation, ou si
    // l'action rend un succès. Le commerçant serait prélevé indéfiniment pour
    // un compte disparu.
    seedDeletion({ logos: ["logo.webp"] });
    stripeState.result = { ok: false, error: "network" };

    const res = await runDeletion();

    expect(res).toMatchObject({ ok: false });
    expect(state.calls.filter((call) => call.op === "delete")).toHaveLength(0);
    expect(state.storage).toHaveLength(0);
    expect(state.authDeleted).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(lastJobUpdate()).toMatchObject({
      status: "failed",
      last_error: "stripe: network",
    });
    expect(auditActions()).toEqual(["merchant.delete.blocked"]);
  });

  it("un DELETE qui n'atteint aucune ligne ne déclenche aucun nettoyage", async () => {
    // ROUGE SI : le code se contente de `!error` pour conclure au succès. Un
    // DELETE qui ne touche rien (course, ligne déjà partie, filtre inopérant)
    // enchaînerait alors sur la purge des comptes de connexion et du Storage
    // d'une organisation TOUJOURS VIVANTE.
    seedDeletion({ logos: ["logo.webp"] });
    state.orgDeleteHitsRow = false;

    const res = await runDeletion();

    expect(res).toEqual({ ok: false, error: "Échec de la suppression." });
    expect(state.authDeleted).toHaveLength(0);
    expect(state.storage).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(lastJobUpdate()).toMatchObject({ status: "failed" });
  });

  it("journal muet APRÈS l'annulation Stripe : le fait survit ailleurs", async () => {
    // ROUGE SI : l'action se contente de `return fail(...)` quand la mise à
    // jour du journal échoue après l'annulation. L'abonnement est alors bel et
    // bien arrêté chez Stripe pendant que `merchant_deletion_jobs` reste à
    // `pending` — le suivi durable MENT sur ce qui a été fait chez le
    // prestataire, et plus rien ne permet de le rapprocher. L'entrée d'audit
    // (table distincte, append-only, autre mode de panne) est la seule mémoire
    // de l'annulation, donc le seul point de reprise.
    seedDeletion({ logos: ["logo.webp"] });
    state.jobUpdateErrors.stripe_canceled = "journal indisponible";

    const res = await runDeletion();

    // L'annulation a eu lieu : c'est tout le problème.
    expect(stripeState.customers).toEqual(["cus_TEST123"]);
    // Et rien n'a été effacé — on s'arrête avant la cascade.
    expect(state.calls.filter((call) => call.op === "delete")).toHaveLength(0);
    expect(state.storage).toHaveLength(0);
    expect(state.authDeleted).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();

    expect(auditEntry("merchant.delete.blocked").metadata).toMatchObject({
      jobId: JOB_ID,
      stage: "job_stripe_canceled",
      stripeCanceled: true,
    });
    // Le message doit DIRE ce qui a été fait chez le prestataire : un
    // opérateur qui lit « interrompu » sans plus de détail en conclut, à tort,
    // que la facturation continue — et relance une annulation qu'il croit due.
    expect(res).toMatchObject({
      ok: false,
      error: expect.stringContaining("Stripe"),
    });
  });

  it("un journal impossible à créer annule la suppression avant tout effet", async () => {
    // ROUGE SI : l'échec d'insertion du journal devient non bloquant. On
    // effacerait un commerçant sans la seule trace durable prévue pour ça.
    seedDeletion();
    state.jobInsertError = "insert refusé";

    const res = await runDeletion();

    expect(res).toMatchObject({ ok: false });
    expect(stripeState.customers).toHaveLength(0);
    expect(state.calls.filter((call) => call.op === "delete")).toHaveLength(0);
    expect(state.storage).toHaveLength(0);
  });

  it("un commerçant introuvable ne crée ni journal ni appel Stripe", async () => {
    // ROUGE SI : l'action poursuit sur une organisation nulle. Un identifiant
    // périmé rejoué (double soumission, retour arrière) créerait un journal
    // fantôme et un appel d'annulation sur un client vide.
    state.org = null;

    const res = await runDeletion();

    expect(res).toEqual({ ok: false, error: "Commerçant introuvable." });
    expect(callsTo("merchant_deletion_jobs")).toHaveLength(0);
    expect(stripeState.customers).toHaveLength(0);
  });
});
