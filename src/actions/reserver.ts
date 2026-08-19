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

const NOT_EDITOR = "Action non autorisÃ©e";
const GENERIC_ERROR = "Une erreur est survenue, rÃ©essayez.";
const TOO_MANY = "Trop de tentatives. Patientez un instant.";
const INDISPONIBLE = "Cette rÃ©servation n'est pas disponible.";
const SANS_DROIT =
  "L'agenda RÃ©server fait partie de l'offre Vitrine. Activez-la pour ouvrir des crÃ©neaux.";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ContrÃ´le d'abus â€” principe de conception du module (ADR-032)
//
// Le parcours public de RÃ©server est servi par le service_role Ã  des clients
// qui scannent le QR d'un restaurant, d'une cave, d'un atelier : derriÃ¨re un
// Wi-Fi ou un CGNAT, l'IP est PARTAGÃ‰E par tous les clients prÃ©sents. AUCUN
// seau `failClosed` ne porte donc sur une clÃ© partagÃ©e (IP, organisation,
// crÃ©neau) â€” un tel seau deviendrait un interrupteur qu'un tiers allume en le
// saturant (Â« dÃ©ni de rÃ©servation d'un commerce entier Â»). Les clÃ©s partagÃ©es
// ne portent que des compteurs d'OBSERVABILITÃ‰ fail-OPEN.
//
// Le `failClosed` reste lÃ©gitime â€” et employÃ© â€” sur une clÃ© propre Ã  UNE
// identitÃ© (empreinte du cookie `lc-player`) ou Ã  UN opÃ©rateur authentifiÃ©
// (user.id au comptoir) : la saturer ne coupe que son porteur.
//
// La borne rÃ©elle contre l'abus n'est pas un rate-limit : c'est le socle SQL â€”
// capacitÃ© comptÃ©e sous verrou d'avis, index unique partiel (une identitÃ©, une
// place vivante par crÃ©neau), idempotence de la RPC. Frapper des cookies ne
// crÃ©e AUCUNE place supplÃ©mentaire.
//
// ANTI-SYBIL â€” ce que les invariants ne couvrent PAS : ils bornent le NOMBRE de
// places, pas la DIVERSITÃ‰ des mains qui les prennent. Un bot muni de cookies
// jetables peut vider un crÃ©neau sans jamais venir â€” le commerÃ§ant prÃ©pare pour
// vingt et n'accueille personne. Le SEUL appel Ã‰METTEUR du parcours est
// `reserveSlot` : c'est lÃ  â€” et lÃ  seulement â€” qu'un challenge Turnstile est
// opposÃ©, et UNIQUEMENT si les clÃ©s sont configurÃ©es (motif `finishQuiz`). RIEN
// sur l'annulation ni sur la relecture : aucune friction sur un geste qui rend
// une place ou qui n'Ã©crit rien.
//
// â”€â”€ INVENTAIRE DES SEAUX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  reserveSlot / cancelReservation / loadMyReservations (public)
//    Â· reserver:device:<empreinte>            identitÃ©   CLOSED  (tranchÃ© 1er)
//    Â· reserver:player:<org>:<empreinte>      identitÃ©   CLOSED
//    Â· reserver:ip:<ip>                       partagÃ©e   OPEN (IP SEULE, 1er)
//    Â· reserver:public:ip:<org>:<ip>          partagÃ©e   OPEN (observabilitÃ©)
//  checkinReservation (authentifiÃ©)
//    Â· cashier:lookup:<org>:<user>            opÃ©rateur  CLOSED (seau de caisse)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Parcours public â€” identitÃ© cookie, seaux, observabilitÃ©
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Le challenge anti-robot est-il opposable ?
 *
 * Motif EXACT de `quizChallengeAvailable` : la clÃ© publique doit exister aussi,
 * sans quoi l'Ã©cran n'a aucun widget Ã  afficher et le refus serait sans issue
 * pour le joueur.
 */
function reserverChallengeDisponible(): boolean {
  return (
    turnstileEnabled() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  );
}

/**
 * Les DEUX seaux d'identitÃ©, dans l'ordre. Le plafond par APPAREIL est tranchÃ©
 * en premier parce que le second est composÃ© avec un `organization_id` fourni
 * par le client : boucler sur des organisations inventÃ©es ouvrirait sinon un
 * seau neuf Ã  chaque tour (motif `progressionDevice`, wagon 7).
 */
async function autoriserJoueurReserver(
  /**
   * PORTÃ‰E du second seau : l'organisation pour les gestes qui la nomment,
   * l'identifiant de la rÃ©servation pour l'annulation â€” qui ne connaÃ®t pas
   * l'organisation (la RPC la lit sur la ligne) et dÃ©tient dÃ©jÃ  cette clÃ©.
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
 * Les deux compteurs d'observabilitÃ©, dans l'ordre : IP SEULE d'abord, IP par
 * organisation ensuite. Aucun des deux ne refuse jamais.
 *
 * L'IP seule est comptÃ©e en premier pour la raison de `pageOpenIp` (wagon 7) :
 * le second seau porte un `organization_id` que l'appelant choisit, et une
 * rafale qui boucle dessus se disperserait sur autant de sÃ©ries â€” invisible en
 * supervision, et une Ã©criture de rate-limit par organisation inventÃ©e.
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
 * Prendre une place sur un crÃ©neau.
 *
 * L'identitÃ© vient du cookie `lc-player` (posÃ© au besoin), JAMAIS du corps.
 * L'email n'est transmis qu'AVEC son consentement â€” la base porte une
 * Ã©quivalence, pas une implication, et une adresse sans consentement serait une
 * donnÃ©e personnelle conservÃ©e sans finalitÃ©.
 *
 * Aucun code n'est fourni Ã  l'insertion : le trigger `reservations_set_code`
 * l'Ã©crase de toute faÃ§on, et le choisir depuis l'application ferait reposer son
 * imprÃ©visibilitÃ© sur la discipline de l'appelant.
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

  // IdentitÃ© AVANT tout : aucun aller-retour base, donc le premier seau est
  // tranchÃ© avant la moindre requÃªte SQL et avant l'instrumentation.
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

  // Compteurs partagÃ©s AVANT l'appel Ã©metteur : ce qu'ils mesurent est la
  // pression rÃ©elle sur le parcours, y compris celle qui Ã©chouera au challenge.
  await observerPressionReserver(parsed.organizationId, ip);

  if (
    reserverChallengeDisponible() &&
    !(await verifyTurnstile(turnstileToken, ip, "reserver-reserve"))
  ) {
    return {
      ok: false,
      error:
        "VÃ©rification anti-robot requise. Validez le contrÃ´le ci-dessous puis rÃ©servez.",
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

  // CONFIRMATION HORS DU CHEMIN DE RÃ‰PONSE. Le joueur a dÃ©jÃ  son code Ã 
  // l'Ã©cran : l'email est un rappel, jamais la preuve. `after()` le sort du
  // temps de rÃ©ponse, et son Ã©chec est AVALÃ‰ puis COMPTÃ‰ (`reserver.email.*`)
  // plutÃ´t que remontÃ© â€” une panne Resend ne doit pas dÃ©faire une place prise.
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
 * Compose et envoie la confirmation. Trois lectures, toutes org-scopÃ©es, toutes
 * hors du chemin de rÃ©ponse : l'activitÃ© et l'organisation ne sont pas dans la
 * rÃ©ponse de `reserve_slot`, et les faire voyager par l'appelant aurait laissÃ©
 * un nom de commerce se dÃ©clarer depuis le client.
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
 * Annuler sa rÃ©servation, sur preuve de possession (cookie + identifiant).
 *
 * Aucune organisation demandÃ©e : la RPC la lit sur la ligne. Le seau par
 * organisation est donc portÃ© par l'identifiant de la RÃ‰SERVATION â€” une clÃ© que
 * l'appelant dÃ©tient dÃ©jÃ , et qui n'ouvre rien de neuf.
 */
export async function cancelReservation(input: {
  reservationId: string;
}): Promise<ActionResult<CancelReservationResult>> {
  const parsed = cancelReservationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // LECTURE SEULE du cookie : annuler n'est pas un chemin qui crÃ©e une identitÃ©.
  // Sans cookie, il n'y a rien Ã  annuler â€” la RPC rÃ©pondrait `unknown`, autant
  // ne pas la dÃ©ranger.
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
 * Â« Mes rÃ©servations chez ce commerÃ§ant Â» â€” bornÃ©e Ã  une organisation, comme la
 * RPC : l'empreinte du cookie est GLOBALE, et une rÃ©ponse non bornÃ©e montrerait
 * sur la page d'un commerce ce que la personne a rÃ©servÃ© chez le concurrent.
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
    // Pas d'identitÃ© = aucune rÃ©servation, et c'est VRAI par construction : ce
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Comptoir â€” valider une arrivÃ©e (session + rÃ´le)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Enregistrer l'arrivÃ©e d'un client par son code.
 *
 * â”€â”€ L'ACTEUR VIENT DE LA SESSION, JAMAIS DU CORPS â”€â”€
 *
 * `p_actor` est l'identifiant de l'utilisateur authentifiÃ©, et la RPC le
 * revÃ©rifie EN SQL contre `organization_members`. Un acteur postÃ© aurait fait de
 * l'audit `reservation.checkin` une dÃ©claration sur l'honneur.
 *
 * â”€â”€ LES TROIS RÃ”LES, DONT LE CAISSIER â”€â”€
 *
 * Valider une arrivÃ©e est un geste de comptoir : `cashier` en fait partie, au
 * mÃªme titre qu'`owner` et `editor`. C'est aussi ce que la RPC accepte.
 *
 * â”€â”€ AUCUNE GARDE `vitrine` ICI, ET C'EST DÃ‰LIBÃ‰RÃ‰ â”€â”€
 *
 * Les actions de configuration l'exigent â€” on n'ouvre pas de nouveaux crÃ©neaux
 * sans le droit. Mais refuser une ARRIVÃ‰E parce qu'un abonnement a expirÃ©
 * laisserait le commerÃ§ant face Ã  des clients dÃ©jÃ  venus, dÃ©jÃ  confirmÃ©s, sans
 * moyen d'enregistrer leur prÃ©sence : la sanction tomberait sur eux. Honorer
 * l'existant est la seule lecture correcte.
 *
 * â”€â”€ LE SEAU DE LA CAISSE, RÃ‰UTILISÃ‰ â”€â”€
 *
 * MÃªme clÃ© et mÃªme rÃ¨gle que `lookupRedeemCode` : c'est le mÃªme opÃ©rateur, sur
 * le mÃªme Ã©cran, qui saisit des codes. Deux seaux distincts lui auraient donnÃ©
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
      // DE LA SESSION. Jamais du corps de la requÃªte.
      p_actor: user.id,
    });
    if (error) {
      reportError("reserver.checkin", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapCheckinReservation(data) };
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Dashboard commerÃ§ant â€” activitÃ©s et crÃ©neaux (session + RLS Ã©diteurs)
//
// AUCUNE SUPPRESSION, et ce n'est pas un oubli : le socle a dÃ©libÃ©rÃ©ment retirÃ©
// le `grant delete` sur les deux tables. La cascade de la FK composite
// emporterait les crÃ©neaux d'une activitÃ© PUIS les rÃ©servations de ces crÃ©neaux
// â€” donc l'historique des arrivÃ©es, sans audit et sans qu'aucun Ã©cran n'ait
// comptÃ© ce qui allait disparaÃ®tre. `active = false` (activitÃ©) et
// `status = 'closed'` (crÃ©neau) sont les interrupteurs, et ils n'effacent rien.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Session + rÃ´le Ã©diteur + droit `vitrine`, en un seul geste. */
async function gardeEditeurReserver(): Promise<
  | { ok: true; organizationId: string; timezone: string }
  | { ok: false; error: string }
> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  // Le droit est REVÃ‰RIFIÃ‰ cÃ´tÃ© serveur : l'Ã©cran cache dÃ©jÃ  le formulaire, mais
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

/** CrÃ©er une activitÃ© rÃ©servable. */
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
    // UnicitÃ© (organization_id, name) : le message nomme la cause rÃ©elle plutÃ´t
    // qu'un Ã©chec gÃ©nÃ©rique sur lequel le commerÃ§ant ne peut rien.
    if (error.code === "23505") {
      return { ok: false, error: "Une activitÃ© porte dÃ©jÃ  ce nom." };
    }
    return { ok: false, error: "Impossible de crÃ©er l'activitÃ©" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/** RÃ©glages d'une activitÃ© â€” dont son interrupteur `active`. */
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
    // Double la RLS plutÃ´t que de s'y fier seule.
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update activity:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: "Une activitÃ© porte dÃ©jÃ  ce nom." };
    }
    return { ok: false, error: "Impossible d'enregistrer l'activitÃ©" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * CrÃ©er un crÃ©neau. Il naÃ®t en `draft` â€” invisible du joueur â€” parce qu'un
 * crÃ©neau se relit avant de s'ouvrir : capacitÃ©, heures, activitÃ©. L'ouverture
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

  // Les heures saisies sont CIVILES, dans le fuseau de l'Ã©tablissement. La
  // conversion refuse explicitement les heures inexistantes et ambiguÃ«s des
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
    // UnicitÃ© (activity_id, starts_at) : le double clic d'un Ã©diteur, que la
    // base refuse pour Ã©viter de doubler la capacitÃ© rÃ©elle en silence.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Un crÃ©neau de cette activitÃ© commence dÃ©jÃ  Ã  cette heure.",
      };
    }
    return { ok: false, error: "Impossible de crÃ©er le crÃ©neau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Corriger les heures et la capacitÃ© d'un crÃ©neau.
 *
 * Seul chemin de correction du module : rien ne se supprime (le `grant delete`
 * a Ã©tÃ© retirÃ©), donc un crÃ©neau saisi Ã  la mauvaise heure doit pouvoir Ãªtre
 * repris. Baisser la capacitÃ© est sÃ»r â€” `reserve_slot` la relit SOUS son verrou,
 * dans le mÃªme instantanÃ© que son comptage.
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
        error: "Un crÃ©neau de cette activitÃ© commence dÃ©jÃ  Ã  cette heure.",
      };
    }
    return { ok: false, error: "Impossible de modifier le crÃ©neau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Ouvrir, refermer ou remettre en brouillon un crÃ©neau.
 *
 * Fermer ne touche Ã  AUCUNE rÃ©servation dÃ©jÃ  confirmÃ©e : c'est un Ã©tat
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
    return { ok: false, error: "Impossible de modifier le crÃ©neau" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}
