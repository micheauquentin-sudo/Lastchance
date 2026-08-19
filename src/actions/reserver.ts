"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { zonedDateTimeToIso } from "@/lib/date-time";
import { APP_URL } from "@/lib/env";
import { monitored, reportError } from "@/lib/monitoring";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { sendReservationConfirmationEmail } from "@/lib/resend";
import {
  formatCreneau,
  mapCancelReservation,
  mapCheckinReservation,
  mapReservationPublicState,
  mapReserveSlot,
  RESERVER_FUSEAU_DEFAUT,
  urlActiviteReserver,
  type CancelReservationResult,
  type CheckinReservationResult,
  type ReservationPublicState,
  type ReserveSlotResult,
} from "@/lib/reserver";
import {
  assurerIdentiteReserver,
  lireIdentiteReserver,
} from "@/lib/reserver-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { droitEffectifModule } from "@/lib/subscription";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { type ActionResult } from "@/lib/utils";
import {
  cancelReservationSchema,
  checkinReservationSchema,
  createReserverActivitySchema,
  createReserverSlotSchema,
  loadMyReservationsSchema,
  reserveSlotSchema,
  updateReserverActivitySchema,
  updateReserverSlotSchema,
  updateReserverSlotStatusSchema,
} from "@/lib/validations/reserver";

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const TOO_MANY = "Trop de tentatives. Patientez un instant.";
const INDISPONIBLE = "Cette réservation n'est pas disponible.";
const SANS_DROIT =
  "L'agenda Réserver fait partie de l'offre Vitrine. Activez-la pour ouvrir des créneaux.";

// ════════════════════════════════════════════════════════════
// Contrôle d'abus — principe de conception du module (ADR-032)
//
// Le parcours public de Réserver est servi par le service_role à des clients
// qui scannent le QR d'un restaurant, d'une cave, d'un atelier : derrière un
// Wi-Fi ou un CGNAT, l'IP est PARTAGÉE par tous les clients présents. AUCUN
// seau `failClosed` ne porte donc sur une clé partagée (IP, organisation,
// créneau) — un tel seau deviendrait un interrupteur qu'un tiers allume en le
// saturant (« déni de réservation d'un commerce entier »). Les clés partagées
// ne portent que des compteurs d'OBSERVABILITÉ fail-OPEN.
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE
// identité (empreinte du cookie `lc-player`) ou à UN opérateur authentifié
// (user.id au comptoir) : la saturer ne coupe que son porteur.
//
// La borne réelle contre l'abus n'est pas un rate-limit : c'est le socle SQL —
// capacité comptée sous verrou d'avis, index unique partiel (une identité, une
// place vivante par créneau), idempotence de la RPC. Frapper des cookies ne
// crée AUCUNE place supplémentaire.
//
// ANTI-SYBIL — ce que les invariants ne couvrent PAS : ils bornent le NOMBRE de
// places, pas la DIVERSITÉ des mains qui les prennent. Un bot muni de cookies
// jetables peut vider un créneau sans jamais venir — le commerçant prépare pour
// vingt et n'accueille personne. Le SEUL appel ÉMETTEUR du parcours est
// `reserveSlot` : c'est là — et là seulement — qu'un challenge Turnstile est
// opposé, et UNIQUEMENT si les clés sont configurées (motif `finishQuiz`). RIEN
// sur l'annulation ni sur la relecture : aucune friction sur un geste qui rend
// une place ou qui n'écrit rien.
//
// ── INVENTAIRE DES SEAUX ────────────────────────────────────────────────
//  reserveSlot / cancelReservation / loadMyReservations (public)
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 1er)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (observabilité)
//  checkinReservation (authentifié)
//    · cashier:lookup:<org>:<user>            opérateur  CLOSED (seau de caisse)
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Parcours public — identité cookie, seaux, observabilité
// ────────────────────────────────────────────────────────────

/**
 * Le challenge anti-robot est-il opposable ?
 *
 * Motif EXACT de `quizChallengeAvailable` : la clé publique doit exister aussi,
 * sans quoi l'écran n'a aucun widget à afficher et le refus serait sans issue
 * pour le joueur.
 */
function reserverChallengeDisponible(): boolean {
  return (
    turnstileEnabled() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  );
}

/**
 * Les DEUX seaux d'identité, dans l'ordre. Le plafond par APPAREIL est tranché
 * en premier parce que le second est composé avec un `organization_id` fourni
 * par le client : boucler sur des organisations inventées ouvrirait sinon un
 * seau neuf à chaque tour (motif `progressionDevice`, wagon 7).
 */
async function autoriserJoueurReserver(
  /**
   * PORTÉE du second seau : l'organisation pour les gestes qui la nomment,
   * l'identifiant de la réservation pour l'annulation — qui ne connaît pas
   * l'organisation (la RPC la lit sur la ligne) et détient déjà cette clé.
   * Les deux sont des UUID : aucune collision d'espace de noms possible.
   */
  portee: string,
  empreinte: string,
): Promise<boolean> {
  if (
    !(await rateLimit(
      rateLimitBucket("reserver:device", empreinte),
      RATE_LIMITS.reserverDevice,
      { failClosed: true },
    ))
  ) {
    return false;
  }
  return rateLimit(
    rateLimitBucket("reserver:player", portee, empreinte),
    RATE_LIMITS.reserverPlayerAction,
    { failClosed: true },
  );
}

/**
 * Les deux compteurs d'observabilité, dans l'ordre : IP SEULE d'abord, IP par
 * organisation ensuite. Aucun des deux ne refuse jamais.
 *
 * L'IP seule est comptée en premier pour la raison de `pageOpenIp` (wagon 7) :
 * le second seau porte un `organization_id` que l'appelant choisit, et une
 * rafale qui boucle dessus se disperserait sur autant de séries — invisible en
 * supervision, et une écriture de rate-limit par organisation inventée.
 */
async function observerPressionReserver(
  organizationId: string,
  ip: string,
): Promise<void> {
  await observerPressionIp(
    ["reserver:ip"],
    ip,
    RATE_LIMITS.reserverIpCeiling,
    "reserver_ip_ceiling",
  );
  await observerPressionIp(
    ["reserver:public:ip", organizationId],
    ip,
    RATE_LIMITS.reserverPublicIp,
    "reserver_public_pressure",
    { organization_id: organizationId },
  );
}

export type ReserveSlotActionResult =
  | { ok: true; data: ReserveSlotResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Prendre une place sur un créneau.
 *
 * L'identité vient du cookie `lc-player` (posé au besoin), JAMAIS du corps.
 * L'email n'est transmis qu'AVEC son consentement — la base porte une
 * équivalence, pas une implication, et une adresse sans consentement serait une
 * donnée personnelle conservée sans finalité.
 *
 * Aucun code n'est fourni à l'insertion : le trigger `reservations_set_code`
 * l'écrase de toute façon, et le choisir depuis l'application ferait reposer son
 * imprévisibilité sur la discipline de l'appelant.
 */
export async function reserveSlot(input: {
  organizationId: string;
  slotId: string;
  email?: string;
  consent?: boolean;
  turnstileToken?: string;
}): Promise<ReserveSlotActionResult> {
  const parsed = reserveSlotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Identité AVANT tout : aucun aller-retour base, donc le premier seau est
  // tranché avant la moindre requête SQL et avant l'instrumentation.
  const empreinte = await assurerIdentiteReserver();
  if (!empreinte) return { ok: false, error: GENERIC_ERROR };
  if (!(await autoriserJoueurReserver(parsed.data.organizationId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.reserve", () =>
    reserveInner(parsed.data, empreinte, input.turnstileToken),
  );
}

async function reserveInner(
  parsed: {
    organizationId: string;
    slotId: string;
    email?: string;
    consent: boolean;
  },
  empreinte: string,
  turnstileToken: string | undefined,
): Promise<ReserveSlotActionResult> {
  const ip = clientIpFromHeaders(await headers());

  // Compteurs partagés AVANT l'appel émetteur : ce qu'ils mesurent est la
  // pression réelle sur le parcours, y compris celle qui échouera au challenge.
  await observerPressionReserver(parsed.organizationId, ip);

  if (
    reserverChallengeDisponible() &&
    !(await verifyTurnstile(turnstileToken, ip, "reserver-reserve"))
  ) {
    return {
      ok: false,
      error:
        "Vérification anti-robot requise. Validez le contrôle ci-dessous puis réservez.",
      challengeRequired: true,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_slot", {
    p_organization_id: parsed.organizationId,
    p_slot_id: parsed.slotId,
    p_player_key_hash: empreinte,
    p_email: parsed.email ?? null,
    p_consent: parsed.consent,
  });

  if (error) {
    reportError("reserver.reserve", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const resultat = mapReserveSlot(data);

  // CONFIRMATION HORS DU CHEMIN DE RÉPONSE. Le joueur a déjà son code à
  // l'écran : l'email est un rappel, jamais la preuve. `after()` le sort du
  // temps de réponse, et son échec est AVALÉ puis COMPTÉ (`reserver.email.*`)
  // plutôt que remonté — une panne Resend ne doit pas défaire une place prise.
  if (resultat.state === "reserved" && parsed.consent && parsed.email) {
    const destinataire = parsed.email;
    after(() =>
      envoyerConfirmation({
        to: destinataire,
        organizationId: parsed.organizationId,
        slotId: parsed.slotId,
        code: resultat.code,
      }).catch((err) => reportError("reserver.confirmation", err)),
    );
  }

  return { ok: true, data: resultat };
}

/**
 * Compose et envoie la confirmation. Trois lectures, toutes org-scopées, toutes
 * hors du chemin de réponse : l'activité et l'organisation ne sont pas dans la
 * réponse de `reserve_slot`, et les faire voyager par l'appelant aurait laissé
 * un nom de commerce se déclarer depuis le client.
 */
async function envoyerConfirmation(params: {
  to: string;
  organizationId: string;
  slotId: string;
  code: string | null;
}): Promise<void> {
  if (!params.code) return;
  const admin = createAdminClient();

  const { data: slot } = await admin
    .from("reservation_slots")
    .select("id, activity_id, starts_at, ends_at")
    .eq("id", params.slotId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!slot) return;

  const { data: activity } = await admin
    .from("reservation_activities")
    .select("id, name")
    .eq("id", slot.activity_id)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!activity) return;

  const { data: organization } = await admin
    .from("organizations")
    .select("name, timezone")
    .eq("id", params.organizationId)
    .maybeSingle();
  if (!organization) return;

  const timezone = organization.timezone || RESERVER_FUSEAU_DEFAUT;
  await sendReservationConfirmationEmail({
    to: params.to,
    activityName: activity.name,
    slotLabel: formatCreneau(slot.starts_at, slot.ends_at, timezone),
    code: params.code,
    organizationName: organization.name,
    statusUrl: urlActiviteReserver(activity.id, APP_URL),
  });
}

/**
 * Annuler sa réservation, sur preuve de possession (cookie + identifiant).
 *
 * Aucune organisation demandée : la RPC la lit sur la ligne. Le seau par
 * organisation est donc porté par l'identifiant de la RÉSERVATION — une clé que
 * l'appelant détient déjà, et qui n'ouvre rien de neuf.
 */
export async function cancelReservation(input: {
  reservationId: string;
}): Promise<ActionResult<CancelReservationResult>> {
  const parsed = cancelReservationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // LECTURE SEULE du cookie : annuler n'est pas un chemin qui crée une identité.
  // Sans cookie, il n'y a rien à annuler — la RPC répondrait `unknown`, autant
  // ne pas la déranger.
  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: INDISPONIBLE };
  if (
    !(await autoriserJoueurReserver(parsed.data.reservationId, empreinte))
  ) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.cancel", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cancel_reservation", {
      p_reservation_id: parsed.data.reservationId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.cancel", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapCancelReservation(data) };
  });
}

/**
 * « Mes réservations chez ce commerçant » — bornée à une organisation, comme la
 * RPC : l'empreinte du cookie est GLOBALE, et une réponse non bornée montrerait
 * sur la page d'un commerce ce que la personne a réservé chez le concurrent.
 */
export async function loadMyReservations(input: {
  organizationId: string;
}): Promise<ActionResult<ReservationPublicState>> {
  const parsed = loadMyReservationsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const empreinte = await lireIdentiteReserver();
  if (!empreinte) {
    // Pas d'identité = aucune réservation, et c'est VRAI par construction : ce
    // n'est pas une erreur, c'est une liste vide.
    return {
      ok: true,
      data: {
        ok: true,
        timezone: RESERVER_FUSEAU_DEFAUT,
        reservations: [],
      },
    };
  }
  if (!(await autoriserJoueurReserver(parsed.data.organizationId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.my-reservations", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reservation_public_state", {
      p_organization_id: parsed.data.organizationId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.my-reservations", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapReservationPublicState(data) };
  });
}

// ════════════════════════════════════════════════════════════
// Comptoir — valider une arrivée (session + rôle)
// ════════════════════════════════════════════════════════════

/**
 * Enregistrer l'arrivée d'un client par son code.
 *
 * ── L'ACTEUR VIENT DE LA SESSION, JAMAIS DU CORPS ──
 *
 * `p_actor` est l'identifiant de l'utilisateur authentifié, et la RPC le
 * revérifie EN SQL contre `organization_members`. Un acteur posté aurait fait de
 * l'audit `reservation.checkin` une déclaration sur l'honneur.
 *
 * ── LES TROIS RÔLES, DONT LE CAISSIER ──
 *
 * Valider une arrivée est un geste de comptoir : `cashier` en fait partie, au
 * même titre qu'`owner` et `editor`. C'est aussi ce que la RPC accepte.
 *
 * ── AUCUNE GARDE `vitrine` ICI, ET C'EST DÉLIBÉRÉ ──
 *
 * Les actions de configuration l'exigent — on n'ouvre pas de nouveaux créneaux
 * sans le droit. Mais refuser une ARRIVÉE parce qu'un abonnement a expiré
 * laisserait le commerçant face à des clients déjà venus, déjà confirmés, sans
 * moyen d'enregistrer leur présence : la sanction tomberait sur eux. Honorer
 * l'existant est la seule lecture correcte.
 *
 * ── LE SEAU DE LA CAISSE, RÉUTILISÉ ──
 *
 * Même clé et même règle que `lookupRedeemCode` : c'est le même opérateur, sur
 * le même écran, qui saisit des codes. Deux seaux distincts lui auraient donné
 * deux budgets pour un seul geste.
 */
export async function checkinReservation(
  _prev: ActionResult<CheckinReservationResult> | null,
  formData: FormData,
): Promise<ActionResult<CheckinReservationResult>> {
  const parsed = checkinReservationSchema.safeParse({
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor" && role !== "cashier") {
    return { ok: false, error: NOT_EDITOR };
  }

  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: TOO_MANY };

  return monitored("reserver.checkin", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("checkin_reservation", {
      p_organization_id: organization.id,
      p_code: parsed.data.code,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: user.id,
    });
    if (error) {
      reportError("reserver.checkin", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapCheckinReservation(data) };
  });
}

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — activités et créneaux (session + RLS éditeurs)
//
// AUCUNE SUPPRESSION, et ce n'est pas un oubli : le socle a délibérément retiré
// le `grant delete` sur les deux tables. La cascade de la FK composite
// emporterait les créneaux d'une activité PUIS les réservations de ces créneaux
// — donc l'historique des arrivées, sans audit et sans qu'aucun écran n'ait
// compté ce qui allait disparaître. `active = false` (activité) et
// `status = 'closed'` (créneau) sont les interrupteurs, et ils n'effacent rien.
// ════════════════════════════════════════════════════════════

/** Session + rôle éditeur + droit `vitrine`, en un seul geste. */
async function gardeEditeurReserver(): Promise<
  | { ok: true; organizationId: string; timezone: string }
  | { ok: false; error: string }
> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  // Le droit est REVÉRIFIÉ côté serveur : l'écran cache déjà le formulaire, mais
  // une server action reste POSTable en direct.
  if (!droitEffectifModule("vitrine", organization)) {
    return { ok: false, error: SANS_DROIT };
  }
  return {
    ok: true,
    organizationId: organization.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
  };
}

/** Créer une activité réservable. */
export async function createReserverActivity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createReserverActivitySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase.from("reservation_activities").insert({
    organization_id: garde.organizationId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    active: true,
  });

  if (error) {
    console.error("[reserver] create activity:", error.message);
    // Unicité (organization_id, name) : le message nomme la cause réelle plutôt
    // qu'un échec générique sur lequel le commerçant ne peut rien.
    if (error.code === "23505") {
      return { ok: false, error: "Une activité porte déjà ce nom." };
    }
    return { ok: false, error: "Impossible de créer l'activité" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/** Réglages d'une activité — dont son interrupteur `active`. */
export async function updateReserverActivity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateReserverActivitySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservation_activities")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      active: parsed.data.active,
    })
    .eq("id", parsed.data.id)
    // Double la RLS plutôt que de s'y fier seule.
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update activity:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: "Une activité porte déjà ce nom." };
    }
    return { ok: false, error: "Impossible d'enregistrer l'activité" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Créer un créneau. Il naît en `draft` — invisible du joueur — parce qu'un
 * créneau se relit avant de s'ouvrir : capacité, heures, activité. L'ouverture
 * est un second geste, explicite (`updateReserverSlotStatus`).
 */
export async function createReserverSlot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createReserverSlotSchema.safeParse({
    activityId: formData.get("activityId"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  // Les heures saisies sont CIVILES, dans le fuseau de l'établissement. La
  // conversion refuse explicitement les heures inexistantes et ambiguës des
  // changements d'heure, au lieu de laisser JavaScript choisir en silence.
  let startsAt: string;
  let endsAt: string;
  try {
    startsAt = zonedDateTimeToIso(parsed.data.startsAt, garde.timezone);
    endsAt = zonedDateTimeToIso(parsed.data.endsAt, garde.timezone);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Date invalide",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reservation_slots").insert({
    activity_id: parsed.data.activityId,
    organization_id: garde.organizationId,
    starts_at: startsAt,
    ends_at: endsAt,
    capacity: parsed.data.capacity,
    status: "draft",
  });

  if (error) {
    console.error("[reserver] create slot:", error.message);
    // Unicité (activity_id, starts_at) : le double clic d'un éditeur, que la
    // base refuse pour éviter de doubler la capacité réelle en silence.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Un créneau de cette activité commence déjà à cette heure.",
      };
    }
    return { ok: false, error: "Impossible de créer le créneau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Corriger les heures et la capacité d'un créneau.
 *
 * Seul chemin de correction du module : rien ne se supprime (le `grant delete`
 * a été retiré), donc un créneau saisi à la mauvaise heure doit pouvoir être
 * repris. Baisser la capacité est sûr — `reserve_slot` la relit SOUS son verrou,
 * dans le même instantané que son comptage.
 */
export async function updateReserverSlot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateReserverSlotSchema.safeParse({
    id: formData.get("id"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  let startsAt: string;
  let endsAt: string;
  try {
    startsAt = zonedDateTimeToIso(parsed.data.startsAt, garde.timezone);
    endsAt = zonedDateTimeToIso(parsed.data.endsAt, garde.timezone);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Date invalide",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservation_slots")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      capacity: parsed.data.capacity,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update slot:", error.message);
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Un créneau de cette activité commence déjà à cette heure.",
      };
    }
    return { ok: false, error: "Impossible de modifier le créneau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Ouvrir, refermer ou remettre en brouillon un créneau.
 *
 * Fermer ne touche à AUCUNE réservation déjà confirmée : c'est un état
 * d'inscription, pas une annulation de masse.
 */
export async function updateReserverSlotStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateReserverSlotStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservation_slots")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update slot status:", error.message);
    return { ok: false, error: "Impossible de modifier le créneau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}
