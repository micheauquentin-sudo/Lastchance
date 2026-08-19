"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { zonedDateTimeToIso } from "@/lib/date-time";
import { APP_URL } from "@/lib/env";
import { bridgeOfferedSpinToCampaign } from "@/lib/player-identity";
import {
  monitored,
  recordCounter,
  reportError,
  reportSecurityEvent,
} from "@/lib/monitoring";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { sendReservationConfirmationEmail } from "@/lib/resend";
import {
  formatCreneau,
  mapCancelReservation,
  mapCheckinReservation,
  mapClaimWaitlistOffer,
  mapCloseInvitation,
  mapCreateInvitation,
  mapEvictWaitlistEntry,
  mapQueueCallNext,
  mapQueueJoin,
  mapQueueLeave,
  mapQueuePublicState,
  mapQueueReopen,
  mapQueueResolve,
  mapQueueStaffState,
  mapRedeemInvitation,
  mapReservationPublicState,
  mapReserveSlot,
  mapRevokeInvitation,
  mapWaitlistJoin,
  mapWaitlistLeave,
  mapWaitSpinGrant,
  mapWaitUsePause,
  RESERVER_FUSEAU_DEFAUT,
  urlActiviteReserver,
  urlInvitationReserver,
  type CancelReservationResult,
  type CheckinReservationResult,
  type ClaimWaitlistOfferResult,
  type CloseInvitationResult,
  type EvictWaitlistEntryResult,
  type QueueCallNextResult,
  type QueueJoinResult,
  type QueueLeaveResult,
  type QueuePublicStateResult,
  type QueueReopenResult,
  type QueueResolveResult,
  type QueueStaffStateResult,
  type RedeemInvitationResult,
  type ReservationPublicState,
  type ReserverAttenteView,
  type ReserveSlotResult,
  type RevokeInvitationResult,
  type WaitlistJoinResult,
  type WaitlistLeaveResult,
  type WaitUsePauseResult,
} from "@/lib/reserver";
import {
  assurerIdentiteReserver,
  droitVitrineOuvertPourFile,
  generateInvitationToken,
  hashInvitationToken,
  lireEtatFilePublic,
  lireIdentiteReserver,
  ouvrirSessionAttente,
} from "@/lib/reserver-context";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { droitEffectifModule } from "@/lib/subscription";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { type ActionResult } from "@/lib/utils";
import {
  cancelReservationSchema,
  cancelReservationStaffSchema,
  checkinReservationSchema,
  claimWaitlistOfferSchema,
  closeReserverInvitationSchema,
  createReserverActivitySchema,
  createReserverInvitationSchema,
  createReserverQueueSchema,
  createReserverSlotSchema,
  evictWaitlistEntrySchema,
  loadMyReservationsSchema,
  queueCallNextSchema,
  queueJoinSchema,
  queueLeaveSchema,
  queueReopenEntrySchema,
  queueResolveSchema,
  queueStateSchema,
  redeemInvitationSchema,
  reserveSlotSchema,
  revokeReserverInvitationSchema,
  updateReserverActivitySchema,
  updateReserverQueueSchema,
  updateReserverSlotSchema,
  updateReserverSlotStatusSchema,
  waitConsumeSpinSchema,
  waitlistJoinSchema,
  waitlistLeaveSchema,
  waitSessionOpenSchema,
  waitUsePauseSchema,
} from "@/lib/validations/reserver";

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const TOO_MANY = "Trop de tentatives. Patientez un instant.";
const INDISPONIBLE = "Cette réservation n'est pas disponible.";
const SANS_DROIT =
  "L'agenda Réserver fait partie de l'offre Vitrine. Activez-la pour ouvrir des créneaux.";
/**
 * Refus d'une FK composite d'ANIMATION D'ATTENTE (RES-4). UN SEUL message pour
 * le quiz et pour la campagne, et pour les deux causes (inexistant, ou d'un
 * autre commerce) : les distinguer apprendrait à qui tape des identifiants ce
 * qui existe chez le voisin.
 */
const ANIMATION_INTROUVABLE =
  "Cette animation d'attente est introuvable.";
/** Refus muet des trois chemins d'attente active — aucun oracle, jamais. */
const ATTENTE_INDISPONIBLE = "Cette animation n'est pas disponible.";

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
// ── ANTI-ARROSAGE EMAIL — la victime n'est pas l'appelant ──
//
// Les seaux d'identité bornent le PORTEUR DU COOKIE ; ils ne bornent pas le
// nombre de messages reçus par un TIERS. Le parcours public accepte une adresse
// choisie par le visiteur, et réserver puis annuler en boucle sur un créneau
// ouvert relance un envoi à chaque tour — la place revient, donc la capacité ne
// borne rien. Le seau `reserver:email:<org>:<adresse>` ferme cela : clé propre à
// UN destinataire, donc `failClosed` conforme à ADR-032 (la saturer ne coupe
// l'email de personne d'autre), motif exact `pronoRecoverEmail`. À sec, ON
// N'ENVOIE PAS et LA RÉSERVATION RESTE VALIDE — le code est déjà à l'écran.
//
// ── INVENTAIRE DES SEAUX ────────────────────────────────────────────────
// Cet inventaire est VÉRIFIÉ, pas déclaratif : il a menti pendant tout le lot L4
// en attribuant à `cancelReservation` et `loadMyReservations` des compteurs IP
// que seul `reserveSlot` consommait. Le corriger a coûté moins cher que de le
// croire.
//  reserveSlot (public, ÉMETTEUR)
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 1er)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (observabilité)
//    · reserver:email:<org>:<adresse>         destinataire CLOSED (avant l'envoi)
//  cancelReservation (public) — l'organisation n'est PAS connue de l'appelant :
//  la RPC la lit sur la ligne, donc pas de seau par organisation ici.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<résa>:<empreinte>     identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE)
//  loadMyReservations (public)
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 1er)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (observabilité)
//  waitlistJoin (public, ÉMETTEUR) — MÊME inventaire que `reserveSlot`, aux
//  mêmes clés : c'est le même geste sur le même écran, et deux jeux de seaux
//  auraient donné deux budgets pour une seule main.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 1er)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (observabilité)
//  claimWaitlistOffer (public) — PAS de Turnstile : la place est DÉJÀ tenue
//  pour cette identité, il n'y a rien à gagner à multiplier les cookies. Comme
//  `cancelReservation`, l'organisation n'est pas postée : elle se lit sur
//  l'entrée, donc pas de compteur par organisation ici.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<entrée>:<empreinte>   identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE)
//    · reserver:email:<org>:<adresse>         destinataire CLOSED (avant l'envoi)
//  waitlistLeave (public) — même raison, et aucune friction n'est opposée à un
//  geste qui REND une place.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<entrée>:<empreinte>   identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE)
//  redeemInvitation (public, ÉMETTEUR) — l'organisation n'est connue qu'APRÈS
//  résolution du jeton : le seau par appareil et l'IP seule sont tranchés
//  avant, les deux clés org-scopées après.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 2e)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED (après résolution)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (après résolution)
//    · reserver:email:<org>:<adresse>         destinataire CLOSED (avant l'envoi)
//  AUCUN seau n'est composé avec le JETON d'invitation, et c'est délibéré : la
//  clé serait choisie par l'appelant, donc un jeton inventé par tour ouvrirait
//  un seau neuf à chaque coup — une écriture de rate-limit par essai, et rien
//  de borné (motif `progressionDevice`, wagon 7). Ce qui borne la rejointe est
//  le seau par APPAREIL, tranché en premier.
//  checkinReservation (authentifié)
//    · cashier:lookup:<org>:<user>            opérateur  CLOSED (seau de caisse)
//  queueJoin (public, ÉMETTEUR — RES-3) — MÊME forme que `redeemInvitation`, et
//  pour la même raison : l'organisation n'est connue qu'APRÈS résolution de la
//  FILE, donc les deux clés org-scopées ne peuvent être tranchées qu'ensuite.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 2e)
//    · reserver:player:<org>:<empreinte>      identité   CLOSED (après résolution)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (après résolution)
//  AUCUN seau composé avec l'identifiant de FILE : la clé serait choisie par
//  l'appelant, donc un identifiant inventé par tour ouvrirait un seau neuf à
//  chaque coup (motif `progressionDevice`, wagon 7).
//  AUCUN seau `reserver:email` non plus, et pour une raison simple : CE LOT
//  N'ENVOIE AUCUN EMAIL. L'adresse est stockée, rien ne la lit.
//  queueLeave (public) — aucune friction sur un geste qui LIBÈRE une ligne.
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:player:<entrée>:<empreinte>   identité   CLOSED
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE)
//  queueCallNext / queueResolve / queueReopen (authentifiés) — AUCUN seau,
//  motif `cancelReservationStaff` et `evictWaitlistEntry` : gestes d'un
//  opérateur authentifié sur son propre écran, et le seau `cashier:lookup`
//  borne la SAISIE DE CODES, pas l'appel du suivant.
//  getQueuePublicState (public, LECTURE RÉPÉTÉE — un tic toutes les 5 s) — SÉRIE
//  PROPRE, et c'est le correctif : ce scrutin consommait `reserver:device`,
//  PARTAGÉ avec `queueJoin` et `queueLeave`. À 12 tics/min et deux onglets, un
//  client debout au comptoir épuisait les 60/min du seau de GESTE en regardant
//  son rang, et se voyait refuser `queueLeave`. Une lecture qui n'écrit rien ne
//  dépense plus le budget d'un geste qui écrit.
//    · reserver:queue-read:<empreinte>       identité   CLOSED (120/min)
//    · reserver:ip:<ip>                      partagée   OPEN (IP SEULE)
//  AUCUN seau composé avec l'identifiant de FILE — clé choisie par l'appelant
//  (motif `progressionDevice`, wagon 7). SANS COOKIE, aucun seau d'identité
//  n'est opposable : seul le compteur d'IP mesure ce visiteur (ADR-032).
//  getQueueStaffState (authentifié, LECTURE RÉPÉTÉE — un tic toutes les 5 s)
//    · reserver:queue-staff:<org>:<user>     opérateur  CLOSED (40/min)
//  SEUL scrutin authentifié du module, et le seul chemin dont la RPC recompose
//  les rangs de la file entière à chaque tic : contrairement aux trois gestes
//  de comptoir ci-dessus, sa CADENCE est bornée. Clé d'opérateur, donc
//  `failClosed` conforme (ADR-032) ; le dépassement est aussi REPORTÉ.
//  waitSessionOpen (public, LECTURE/OUVERTURE IDEMPOTENTE — RES-4) — SÉRIE DE
//  LECTURE, la même que `getQueuePublicState` : ouvrir une session est
//  idempotent (verrou d'avis, une ligne par source) et l'écran d'attente le
//  refait à chaque retour d'onglet. Lui faire dépenser le budget des GESTES
//  ferait tomber le premier refus sur `queueLeave`, c'est-à-dire sur quelqu'un
//  qui veut quitter la file dans laquelle il est debout.
//    · reserver:queue-read:<empreinte>        identité   CLOSED (120/min)
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 1er)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (après résolution)
//  waitUsePause (public, ÉMETTEUR — RES-4)
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE, 2e)
//    · reserver:public:ip:<org>:<ip>          partagée   OPEN (après résolution)
//  consumeReserverWaitSpin (public, ÉMETTEUR — RES-4)
//    · reserver:device:<empreinte>            identité   CLOSED  (tranché 1er)
//    · reserver:ip:<ip>                       partagée   OPEN (IP SEULE)
//  AUCUN seau composé avec l'identifiant de SESSION, d'ENTRÉE ni de
//  RÉSERVATION sur ces trois chemins : la clé serait choisie par l'appelant,
//  donc un identifiant inventé par tour ouvrirait un seau neuf à chaque coup —
//  c'est-à-dire aucune borne (motif `progressionDevice`, wagon 7). Ce qui les
//  borne est le seau par APPAREIL, tranché en premier.
//
//  ── ET AUCUN TURNSTILE SUR LES TROIS, DÉLIBÉRÉMENT ──
//
//  Le challenge existe sur `reserveSlot`, `waitlistJoin` et `queueJoin` parce
//  que ce sont des appels ÉMETTEURS dont les invariants SQL bornent le NOMBRE de
//  places, jamais la DIVERSITÉ des mains : un bot à cookies jetables y prend
//  quelque chose de RARE. Rien de tel ici, et pour deux raisons structurelles.
//  (a) La Pause Chance est bornée à UNE PAR SESSION par un `update` conditionnel,
//  et la session est UNIQUE PAR SOURCE (index unique partiel) : la borne réelle
//  est « une par entrée en file », et multiplier les cookies ne multiplie pas
//  les entrées — `queue_join`, LUI, oppose déjà le challenge. (b) Le gain est
//  borné par l'ÉCONOMIE DE LA CAMPAGNE que le commerçant a dotée : stock fini,
//  BORNE 2 (un lot à stock illimité n'est pas tirable par un tour offert),
//  BORNE 3 (statut et fenêtre). Un challenge de plus n'aurait donc rien protégé
//  qui ne le soit déjà, et il aurait mis une friction anti-robot devant
//  quelqu'un qui patiente debout dans un magasin.
//  Ouverture de la page publique — hors de ce fichier, dans
//  `loadReserverPublicContext`, `loadReserverInvitationContext` ET
//  `loadReserverQueuePublicContext` (src/lib/reserver-context.ts) :
//    · reserver:page:ip:<ip>                  partagée   OPEN (IP SEULE, 1er)
//    · reserver:page:activity:ip:<act>:<ip>   partagée   OPEN (observabilité)
//    · reserver:page:queue:ip:<file>:<ip>     partagée   OPEN (observabilité)
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
  if (!(await autoriserAppareilReserver(empreinte))) return false;
  return autoriserPorteeReserver(portee, empreinte);
}

/**
 * Le PLAFOND PAR APPAREIL, seul. Il se tranche toujours en premier, et il est
 * le seul seau opposable à un geste dont la portée n'est pas encore connue —
 * `redeemInvitation`, qui ne sait de quelle organisation il s'agit qu'après
 * avoir résolu le jeton.
 */
async function autoriserAppareilReserver(empreinte: string): Promise<boolean> {
  return rateLimit(
    rateLimitBucket("reserver:device", empreinte),
    RATE_LIMITS.reserverDevice,
    { failClosed: true },
  );
}

/**
 * Le seau du SCRUTIN de file, et lui seul. Série DISTINCTE de `reserver:device`
 * — voir l'inventaire en tête de fichier : une lecture répétée douze fois par
 * minute ne doit pas dépenser le budget des gestes qui écrivent, sans quoi le
 * premier refus tombe sur `queueLeave`, c'est-à-dire sur quelqu'un qui veut
 * quitter la file dans laquelle il est debout.
 *
 * Clé d'IDENTITÉ pure (l'empreinte du cookie, sans identifiant de file), donc
 * `failClosed` conforme à ADR-032 : la saturer ne coupe que son porteur, et le
 * refus se traduit par « ce tic n'a rien rapporté ».
 */
async function autoriserLectureFileReserver(empreinte: string): Promise<boolean> {
  return rateLimit(
    rateLimitBucket("reserver:queue-read", empreinte),
    RATE_LIMITS.reserverQueueRead,
    { failClosed: true },
  );
}

/** Le seau par PORTÉE — voir `autoriserJoueurReserver` pour ce qu'elle vaut. */
async function autoriserPorteeReserver(
  portee: string,
  empreinte: string,
): Promise<boolean> {
  return rateLimit(
    rateLimitBucket("reserver:player", portee, empreinte),
    RATE_LIMITS.reserverPlayerAction,
    { failClosed: true },
  );
}

/**
 * Les compteurs d'observabilité, dans l'ordre : IP SEULE d'abord, IP par
 * organisation ensuite. Aucun des deux ne refuse jamais.
 *
 * L'IP seule est comptée en premier pour la raison de `pageOpenIp` (wagon 7) :
 * le second seau porte un `organization_id` que l'appelant choisit, et une
 * rafale qui boucle dessus se disperserait sur autant de séries — invisible en
 * supervision, et une écriture de rate-limit par organisation inventée.
 *
 * `organizationId` À NULL : le seul appelant dans ce cas est `cancelReservation`,
 * qui ne connaît PAS l'organisation — la RPC la lit sur la ligne. Inventer une
 * clé de repli (« unknown », l'identifiant de la réservation) aurait fabriqué
 * une série qui ne se rapproche d'aucune autre ; l'IP seule, elle, se compare à
 * tout le reste du parcours. Le compteur par organisation est donc simplement
 * absent de ce chemin, et l'inventaire ci-dessus le dit.
 */
async function observerPressionReserver(
  organizationId: string | null,
  ip: string,
): Promise<void> {
  await observerPressionIp(
    ["reserver:ip"],
    ip,
    RATE_LIMITS.reserverIpCeiling,
    "reserver_ip_ceiling",
  );
  if (!organizationId) return;
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

  // LA VALEUR VALIDÉE, jamais celle du corps : `input.turnstileToken` n'a
  // traversé ni la borne de longueur ni le contrôle de type du schéma. Le jeton
  // part ensuite en requête sortante vers Cloudflare — c'est exactement le
  // genre de champ qu'on ne relaie pas brut.
  return monitored("reserver.reserve", () =>
    reserveInner(parsed.data, empreinte, parsed.data.turnstileToken),
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
    // ANTI-ARROSAGE, CONSOMMÉ AVANT L'`after()` — pas dedans : un seau posé
    // dans la tâche différée compterait bien, mais après que la décision
    // d'envoyer a été prise, et une rafale l'aurait déjà remplie de tâches.
    // L'adresse est celle que Zod a normalisée (trim + minuscules) : deux
    // orthographes de la même boîte partagent donc le même seau.
    const autorise = await rateLimit(
      rateLimitBucket("reserver:email", parsed.organizationId, destinataire),
      RATE_LIMITS.reserverEmail,
      { failClosed: true },
    );
    if (autorise) {
      after(() =>
        envoyerConfirmation({
          to: destinataire,
          organizationId: parsed.organizationId,
          slotId: parsed.slotId,
          code: resultat.code,
        }).catch((err) => reportError("reserver.confirmation", err)),
      );
    } else {
      // LA PLACE RESTE PRISE. Ce n'est pas une erreur rendue au joueur : sa
      // réservation est valide et son code est à l'écran. Seul le rappel est
      // sauté, et il est COMPTÉ — sans quoi un seau mal calibré ferait
      // disparaître des confirmations sans que personne ne sache combien.
      recordCounter("reserver.email.throttled");
    }
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
    // IP SEULE, fail-open. Ce chemin ne connaît pas l'organisation — la RPC la
    // lit sur la ligne — donc le compteur par organisation n'existe pas ici, et
    // l'inventaire en tête de fichier le dit. Ce qui reste mesuré est ce qui
    // compte : la pression réelle du parcours par IP, annulations comprises.
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));

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
        waitlist: [],
      },
    };
  }
  if (!(await autoriserJoueurReserver(parsed.data.organizationId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.my-reservations", async () => {
    // Les DEUX compteurs ici : cette action connaît l'organisation, elle la
    // reçoit du client. Même ordre que `reserveSlot` — IP seule d'abord, parce
    // que le second seau est composé avec un identifiant que l'appelant choisit.
    await observerPressionReserver(
      parsed.data.organizationId,
      clientIpFromHeaders(await headers()),
    );

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
// Liste prioritaire (RES-2) — rejoindre, prendre sa place, partir
// ════════════════════════════════════════════════════════════

export type WaitlistJoinActionResult =
  | { ok: true; data: WaitlistJoinResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Rejoindre la liste prioritaire d'un créneau complet.
 *
 * ── POURQUOI LE MÊME INVENTAIRE DE SEAUX QUE `reserveSlot` ──
 *
 * C'est le même écran, la même main et le même geste : le joueur clique sur le
 * créneau, et c'est la JAUGE qui décide s'il réserve ou s'il fait la queue. Des
 * seaux distincts lui auraient donné deux budgets pour un seul geste — et
 * l'ordre importe autant qu'eux (appareil avant organisation, IP seule avant IP
 * par organisation), pour la raison écrite dans `autoriserJoueurReserver`.
 *
 * ── LE CHALLENGE Y EST, ET IL DOIT Y ÊTRE ──
 *
 * `waitlist_join` est un appel ÉMETTEUR au même titre que `reserve_slot` : les
 * invariants SQL bornent le nombre de PLACES, jamais la diversité des mains.
 * Un bot muni de cookies jetables qui remplit une file coûte au commerçant
 * exactement ce que coûte un créneau vidé — il prépare pour vingt personnes qui
 * n'ont jamais existé.
 */
export async function waitlistJoin(input: {
  organizationId: string;
  slotId: string;
  email?: string;
  consent?: boolean;
  turnstileToken?: string;
}): Promise<WaitlistJoinActionResult> {
  const parsed = waitlistJoinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const empreinte = await assurerIdentiteReserver();
  if (!empreinte) return { ok: false, error: GENERIC_ERROR };
  if (!(await autoriserJoueurReserver(parsed.data.organizationId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.waitlist-join", async () => {
    const ip = clientIpFromHeaders(await headers());
    await observerPressionReserver(parsed.data.organizationId, ip);

    if (
      reserverChallengeDisponible() &&
      !(await verifyTurnstile(
        // LA VALEUR VALIDÉE, jamais celle du corps : ce jeton part en requête
        // sortante vers Cloudflare.
        parsed.data.turnstileToken,
        ip,
        "reserver-waitlist-join",
      ))
    ) {
      return {
        ok: false as const,
        error:
          "Vérification anti-robot requise. Validez le contrôle ci-dessous puis réessayez.",
        challengeRequired: true,
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("waitlist_join", {
      p_organization_id: parsed.data.organizationId,
      p_slot_id: parsed.data.slotId,
      p_player_key_hash: empreinte,
      p_email: parsed.data.email ?? null,
      p_consent: parsed.data.consent,
    });
    if (error) {
      reportError("reserver.waitlist-join", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    // AUCUN EMAIL ICI, ET C'EST ASSUMÉ (MVP RES-2) : rien n'est promis à
    // l'inscription — ni une place, ni une date. Le seul message qui parte est
    // celui de la CONFIRMATION, quand l'offre est devenue une réservation.
    return { ok: true as const, data: mapWaitlistJoin(data) };
  });
}

/**
 * Prendre la place qui m'est proposée.
 *
 * ── AUCUN CHALLENGE, ET AUCUNE JAUGE ──
 *
 * La place est DÉJÀ tenue pour cette identité : `reserve_slot` et
 * `waitlist_join` la comptent comme occupée depuis l'émission de l'offre. Ni
 * Turnstile (rien à gagner à multiplier les cookies : l'offre est nominative),
 * ni comptage de capacité (la retester la compterait deux fois, et aucune offre
 * ne serait jamais honorable) — c'est écrit dans la RPC, et cette action ne
 * refait aucun des deux.
 *
 * ── LA CONFIRMATION PART SUR LA CONVERSION RÉELLE, PAS SUR LE CLIC ──
 *
 * `claim_waitlist_offer` est idempotente : rejouée, elle rend la même
 * réservation et le même code. Seul le chemin qui INSÈRE rend `starts_at` /
 * `ends_at`, et c'est ce que ce code lit pour décider d'envoyer. Le seau
 * `reserver:email` borne de toute façon un destinataire à trois messages par
 * heure — la discipline ici évite le message inutile, le seau évite l'abus.
 */
export async function claimWaitlistOffer(input: {
  entryId: string;
}): Promise<ActionResult<ClaimWaitlistOfferResult>> {
  const parsed = claimWaitlistOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // LECTURE SEULE du cookie : on ne crée pas d'identité pour prendre une place
  // qui a été promise à une identité qui existait déjà.
  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: INDISPONIBLE };
  // Portée = l'ENTRÉE, comme `cancelReservation` porte la réservation : ce
  // chemin ne reçoit pas d'organisation, et la clé est déjà détenue.
  if (!(await autoriserJoueurReserver(parsed.data.entryId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.waitlist-claim", async () => {
    // IP SEULE : l'organisation n'est connue qu'APRÈS résolution, et inventer
    // une clé de repli fabriquerait une série qui ne se compare à rien
    // (raison écrite dans `observerPressionReserver`).
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));

    const admin = createAdminClient();

    // L'ORGANISATION SE LIT SUR L'ENTRÉE, sur preuve de possession. `unknown`
    // couvre indistinctement l'entrée inconnue, celle d'une autre identité et
    // celle dont les données ont été purgées — exactement ce que rendrait la
    // RPC, à qui ce chemin évite simplement un appel sans objet.
    const { data: entree } = await admin
      .from("reservation_waitlist_entries")
      .select("id, organization_id")
      .eq("id", parsed.data.entryId)
      .eq("player_key_hash", empreinte)
      .maybeSingle();
    if (!entree) {
      return {
        ok: true as const,
        data: mapClaimWaitlistOffer({ state: "unknown" }),
      };
    }
    const organizationId = entree.organization_id;

    const { data, error } = await admin.rpc("claim_waitlist_offer", {
      p_organization_id: organizationId,
      p_entry_id: parsed.data.entryId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.waitlist-claim", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }

    const resultat = mapClaimWaitlistOffer(data);
    if (resultat.state === "claimed" && resultat.startsAt && resultat.code) {
      await confirmerParEmail({
        organizationId,
        reservationId: resultat.reservationId,
        code: resultat.code,
        // L'ADRESSE VIENT DE L'ENTRÉE DE FILE, jamais du corps de la requête :
        // elle y a été donnée pour ce créneau, chez ce commerçant, sous le même
        // consentement transactionnel — et la RPC l'a recopiée telle quelle sur
        // la réservation.
        destinataire: await adresseConsentieDeLaFile(admin, {
          organizationId,
          entryId: parsed.data.entryId,
        }),
      });
    }
    return { ok: true as const, data: resultat };
  });
}

/**
 * Quitter la file.
 *
 * Aucune friction : c'est un geste qui REND une place — la RPC la propose
 * immédiatement au suivant si celui qui part en tenait une. Même forme que
 * `cancelReservation`, y compris le seau porté par l'identifiant de l'ENTRÉE :
 * l'organisation n'est pas un paramètre, la RPC la lit sur la ligne.
 */
export async function waitlistLeave(input: {
  entryId: string;
}): Promise<ActionResult<WaitlistLeaveResult>> {
  const parsed = waitlistLeaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: INDISPONIBLE };
  if (!(await autoriserJoueurReserver(parsed.data.entryId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.waitlist-leave", async () => {
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("waitlist_leave", {
      p_entry_id: parsed.data.entryId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.waitlist-leave", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapWaitlistLeave(data) };
  });
}

// ════════════════════════════════════════════════════════════
// Invitations privées (RES-2) — la rejointe publique
// ════════════════════════════════════════════════════════════

export type RedeemInvitationActionResult =
  | { ok: true; data: RedeemInvitationResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Réserver au titre d'une invitation privée.
 *
 * ── LE CLAIR S'ARRÊTE À CETTE FONCTION ──
 *
 * `hashInvitationToken` est appliqué avant le premier aller-retour, et c'est
 * l'EMPREINTE seule qui descend. Le clair n'est ni journalisé, ni recopié dans
 * un message d'erreur, ni relayé à un tiers : un jeton qui apparaît dans un
 * journal est un jeton qu'il faut révoquer.
 *
 * ── MÊMES SEAUX, MÊME CHALLENGE QUE `reserveSlot` ──
 *
 * C'est un appel ÉMETTEUR : il crée une réservation. Le fait que l'accès passe
 * par une règle privée ne change rien à ce que le module craint — des cookies
 * jetables qui vident un créneau sans jamais venir.
 */
export async function redeemInvitation(input: {
  token: string;
  slotId?: string;
  email?: string;
  consent?: boolean;
  turnstileToken?: string;
}): Promise<RedeemInvitationActionResult> {
  const parsed = redeemInvitationSchema.safeParse(input);
  // UN SEUL MESSAGE pour un jeton malformé comme pour un jeton inconnu : dire
  // « ce lien n'a pas la bonne forme » apprendrait à qui tape au hasard quand
  // il a trouvé la bonne. `INDISPONIBLE` est ce que rend aussi `unavailable`.
  if (!parsed.success) return { ok: false, error: INDISPONIBLE };

  const empreinteJeton = hashInvitationToken(parsed.data.token);
  if (!empreinteJeton) return { ok: false, error: INDISPONIBLE };

  const empreinte = await assurerIdentiteReserver();
  if (!empreinte) return { ok: false, error: GENERIC_ERROR };
  // LE SEAU PAR APPAREIL SEUL, ET AVANT TOUT LE RESTE. Le second seau est
  // composé avec une organisation qu'on ne connaît pas encore ; le composer
  // avec le JETON à la place aurait ouvert un seau neuf à chaque jeton
  // inventé — c'est-à-dire aucune borne du tout (wagon 7).
  if (!(await autoriserAppareilReserver(empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.invitation-redeem", async () => {
    const ip = clientIpFromHeaders(await headers());
    // IP SEULE d'abord : elle est comptée même sur un jeton qui ne résout rien,
    // et c'est tout l'intérêt — un balayage n'atteint aucune invitation.
    await observerPressionReserver(null, ip);

    if (
      reserverChallengeDisponible() &&
      !(await verifyTurnstile(
        parsed.data.turnstileToken,
        ip,
        "reserver-invitation",
      ))
    ) {
      return {
        ok: false as const,
        error:
          "Vérification anti-robot requise. Validez le contrôle ci-dessous puis réservez.",
        challengeRequired: true,
      };
    }

    const admin = createAdminClient();

    // L'ORGANISATION EST CELLE DU JETON, jamais une valeur postée. Introuvable
    // = `unavailable`, le même état muet que rendrait la RPC pour un jeton
    // révoqué, expiré ou d'un autre commerce.
    const { data: invitation } = await admin
      .from("reservation_invitations")
      .select("id, organization_id")
      .eq("token_hash", empreinteJeton)
      .maybeSingle();
    if (!invitation) {
      return {
        ok: true as const,
        data: mapRedeemInvitation({ state: "unavailable" }),
      };
    }
    const organizationId = invitation.organization_id;

    // Le second seau et le second compteur, maintenant que la portée existe.
    if (!(await autoriserPorteeReserver(organizationId, empreinte))) {
      return { ok: false as const, error: TOO_MANY };
    }
    await observerPressionIp(
      ["reserver:public:ip", organizationId],
      ip,
      RATE_LIMITS.reserverPublicIp,
      "reserver_public_pressure",
      { organization_id: organizationId },
    );

    const { data, error } = await admin.rpc("redeem_invitation", {
      p_organization_id: organizationId,
      p_token_hash: empreinteJeton,
      p_player_key_hash: empreinte,
      p_slot_id: parsed.data.slotId ?? null,
      p_email: parsed.data.email ?? null,
      p_consent: parsed.data.consent,
    });
    if (error) {
      // LE MESSAGE DE L'ERREUR, JAMAIS LES ARGUMENTS : `error.message` de
      // PostgREST ne contient pas le jeton (il n'a d'ailleurs reçu que son
      // empreinte), et rien d'autre n'est journalisé ici.
      reportError("reserver.invitation-redeem", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }

    const resultat = mapRedeemInvitation(data);
    if (
      resultat.state === "reserved" &&
      parsed.data.consent &&
      parsed.data.email &&
      resultat.code
    ) {
      await confirmerParEmail({
        organizationId,
        reservationId: resultat.reservationId,
        code: resultat.code,
        destinataire: parsed.data.email,
      });
    }
    return { ok: true as const, data: resultat };
  });
}

/**
 * L'adresse consentie portée par une entrée de file, ou `null`.
 *
 * Lecture service_role : `email` est HORS du grant de colonnes de
 * `authenticated`, exactement comme sur `reservations`. Elle ne sort pas d'ici
 * — elle va directement au destinataire qu'elle nomme.
 */
async function adresseConsentieDeLaFile(
  admin: ReturnType<typeof createAdminClient>,
  params: { organizationId: string; entryId: string },
): Promise<string | null> {
  const { data } = await admin
    .from("reservation_waitlist_entries")
    .select("id, email, consent_transactional_at")
    .eq("id", params.entryId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!data?.email || !data.consent_transactional_at) return null;
  return data.email;
}

/**
 * Le rappel par email d'une réservation qui vient d'être confirmée par un
 * chemin autre que `reserveSlot` (offre prise, invitation honorée).
 *
 * MÊME SEAU, MÊME `after()`, MÊME COMPTEUR que le chemin d'origine : le
 * destinataire est borné à trois messages par heure et par organisation, la
 * décision d'envoyer est prise AVANT la tâche différée (une rafale l'aurait
 * sinon remplie de tâches déjà décidées), et un refus de seau ne défait RIEN —
 * la place est prise, le code est à l'écran, seul le rappel est sauté.
 */
async function confirmerParEmail(params: {
  organizationId: string;
  reservationId: string | null;
  code: string;
  destinataire: string | null;
}): Promise<void> {
  const { destinataire, reservationId } = params;
  if (!destinataire || !reservationId) return;

  const autorise = await rateLimit(
    rateLimitBucket("reserver:email", params.organizationId, destinataire),
    RATE_LIMITS.reserverEmail,
    { failClosed: true },
  );
  if (!autorise) {
    recordCounter("reserver.email.throttled");
    return;
  }

  after(() =>
    envoyerConfirmationPourReservation({
      to: destinataire,
      organizationId: params.organizationId,
      reservationId,
      code: params.code,
    }).catch((err) => reportError("reserver.confirmation", err)),
  );
}

/**
 * Compose la confirmation à partir d'une RÉSERVATION plutôt que d'un créneau.
 *
 * Un aller-retour de plus que `envoyerConfirmation`, et il est nécessaire : ni
 * `claim_waitlist_offer` ni `redeem_invitation` ne rendent le `slot_id` — la
 * première parce que le créneau vient de l'entrée de file, la seconde parce
 * qu'il peut venir de l'invitation. Le faire voyager par le client aurait
 * laissé un créneau se déclarer depuis le navigateur.
 */
async function envoyerConfirmationPourReservation(params: {
  to: string;
  organizationId: string;
  reservationId: string;
  code: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select("id, slot_id")
    .eq("id", params.reservationId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!reservation) return;

  await envoyerConfirmation({
    to: params.to,
    organizationId: params.organizationId,
    slotId: reservation.slot_id,
    code: params.code,
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
  | { ok: true; organizationId: string; userId: string; timezone: string }
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
    // L'ACTEUR, pour les gestes audités. Il sort de la SESSION et de nulle part
    // ailleurs : `cancel_reservation_staff` le revérifie membre en SQL, et un
    // acteur posté aurait fait de la ligne d'audit une déclaration sur
    // l'honneur (même raison qu'au comptoir).
    userId: user.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
  };
}

/**
 * ANNULER AU NOM DU COMMERCE — le geste qui manquait.
 *
 * ── LE DÉFAUT QU'IL FERME (revue de sécurité L4, M-4a) ──
 *
 * Le socle n'a livré qu'un chemin d'annulation, et il exige l'empreinte du
 * cookie du joueur. `reservations` n'a par ailleurs AUCUN grant `update` : ni
 * PostgREST, ni la RLS, ni aucune action ne pouvaient libérer une place. Un
 * client qui annulait par téléphone — le cas le plus banal d'un restaurant —
 * laissait donc son siège gelé jusqu'à l'heure du créneau, et le commerçant
 * n'avait littéralement aucun geste. Sur un module dont l'objet unique est de
 * distribuer ces places.
 *
 * ── CE QUE CETTE ACTION NE DÉCIDE PAS ──
 *
 * Ni l'appartenance, ni le rôle, ni l'organisation de la réservation :
 * `cancel_reservation_staff` revérifie TOUT en SQL (migration 20261003120000).
 * Les gardes ci-dessous servent à rendre un message utile au commerçant, pas à
 * tenir la porte — une server action reste POSTable en direct.
 *
 * ── POURQUOI `gardeEditeurReserver`, DROIT `vitrine` COMPRIS ──
 *
 * Contrairement au check-in, qui l'exclut délibérément pour ne pas laisser un
 * commerçant sans abonnement face à des clients déjà venus. Ici la question ne
 * se pose pas : l'écran qui porte ce bouton est LUI-MÊME derrière le droit
 * (`loadReserverDashboardContext` rend `no_access` sans lui), donc refuser ne
 * peut abandonner personne qui voyait le bouton. Et la RPC accepte
 * `owner`/`editor` seulement — le caissier en est exclu, parce qu'annuler
 * RETIRE une place à quelqu'un qui n'est pas là pour le voir, là où enregistrer
 * une arrivée ne fait que CONSTATER.
 */
export async function cancelReservationStaff(
  _prev: ActionResult<CancelReservationResult> | null,
  formData: FormData,
): Promise<ActionResult<CancelReservationResult>> {
  const parsed = cancelReservationStaffSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.cancel-staff", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cancel_reservation_staff", {
      p_organization_id: garde.organizationId,
      p_reservation_id: parsed.data.reservationId,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.cancel-staff", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    // Même forme de réponse que le chemin joueur : `mapCancelReservation` lit
    // les quatre états (`unknown`, `already_checked_in`, `too_late`,
    // `cancelled`) et l'écran les traduit. Une seconde fonction de lecture pour
    // le même jsonb aurait dérivé de celle-ci au premier état ajouté.
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: mapCancelReservation(data) };
  });
}

/**
 * RETIRER QUELQU'UN DE LA LISTE PRIORITAIRE — le second geste qui manquait.
 *
 * ── LE DÉFAUT QU'IL FERME (revue de sécurité L5, E-1b) ──
 *
 * La file n'avait aucun geste commerçant. Le SQL l'assumait — « une offre meurt
 * d'elle-même en deux heures au plus » — ce qui décrit l'extinction NATURELLE
 * d'une file et non le retrait de QUELQU'UN : un doublon manifeste, une
 * inscription abusive, un désistement téléphonique de la part de qui a perdu son
 * lien. Les seules issues étaient d'attendre, ou de fermer le créneau pour tout
 * le monde.
 *
 * ── CE QUE CETTE ACTION NE DÉCIDE PAS ──
 *
 * Ni l'appartenance, ni le rôle, ni l'organisation de l'entrée :
 * `evict_waitlist_entry` revérifie TOUT en SQL, et c'est elle qui re-propose la
 * place au suivant sous le verrou d'avis. La garde ci-dessous sert à rendre un
 * message utile au commerçant, pas à tenir la porte — une server action reste
 * POSTable en direct.
 */
export async function evictWaitlistEntry(
  _prev: ActionResult<EvictWaitlistEntryResult> | null,
  formData: FormData,
): Promise<ActionResult<EvictWaitlistEntryResult>> {
  const parsed = evictWaitlistEntrySchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.waitlist-evict", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("evict_waitlist_entry", {
      p_organization_id: garde.organizationId,
      p_entry_id: parsed.data.entryId,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.waitlist-evict", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    // AUCUN EMAIL, comme à l'inscription : rien n'avait été promis à cette
    // personne — ni une place, ni une date — et lui écrire pour lui annoncer
    // qu'elle n'est plus dans une file où elle n'a peut-être jamais su qu'elle
    // était classée serait un message que le module n'a pas à envoyer.
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: mapEvictWaitlistEntry(data) };
  });
}

// ────────────────────────────────────────────────────────────
// Invitations privées — côté commerçant
// ────────────────────────────────────────────────────────────

export interface CreateReserverInvitationData {
  invitationId: string;
  /**
   * Le libellé, RENVOYÉ TEL QUEL. L'écran affiche le lien à côté du nom qu'il
   * vient de lui donner — le relire depuis la liste rechargée aurait fait
   * dépendre l'affichage du secret d'un aller-retour qui peut échouer.
   */
  label: string;
  /**
   * LE JETON EN CLAIR, RENDU UNE SEULE FOIS.
   *
   * La base n'en garde que l'empreinte : personne — ni le commerçant, ni le
   * support, ni une requête SQL — ne peut le retrouver ensuite. C'est le
   * contrat d'une clé d'API, et c'est ce qui empêche une invitation de devenir
   * un QR permanent qu'on retrouve six mois plus tard dans un tableau de bord.
   */
  token: string;
  /** L'adresse complète à copier — la seule forme utile au commerçant. */
  url: string;
  maxUses: number | null;
  expiresAt: string | null;
}

/** Ce que lit le commerçant pour chacun des refus de la RPC. */
const MESSAGES_INVITATION: Record<string, string> = {
  invalid_label: "Donnez un nom à cette invitation.",
  invalid_max_uses: "Nombre d'usages invalide.",
  invalid_target:
    "Choisissez une cible et une seule : une activité entière, ou un créneau précis, de votre établissement.",
  invalid_expiry: "L'expiration doit être dans le futur.",
  duplicate: "Réessayez : ce lien n'a pas pu être créé.",
};

/**
 * Créer une invitation privée.
 *
 * ── LE JETON EST TIRÉ ICI, ET HACHÉ AVANT DE PARTIR ──
 *
 * `create_reservation_invitation` ne prend QUE l'empreinte : le clair n'entre
 * jamais en base, donc aucun journal Postgres ne peut le contenir. Il ne
 * traverse ce fichier que pour être rendu à l'écran de création, une fois.
 *
 * ── POURQUOI `gardeEditeurReserver`, ET POURQUOI LA RPC LE REVÉRIFIE ──
 *
 * Ouvrir des places est une décision commerciale : `owner`/`editor` seulement,
 * le caissier en est exclu — c'est le même arbitrage que `cancelReservationStaff`
 * et c'est la RPC qui le tient, en SQL, contre `organization_members`. La garde
 * ci-dessous sert à rendre un message utile, pas à tenir la porte.
 */
export async function createInvitation(
  _prev: ActionResult<CreateReserverInvitationData> | null,
  formData: FormData,
): Promise<ActionResult<CreateReserverInvitationData>> {
  const parsed = createReserverInvitationSchema.safeParse({
    label: formData.get("label"),
    activityId: formData.get("activityId"),
    slotId: formData.get("slotId"),
    maxUses: formData.get("maxUses"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  let expiresAt: string | null = null;
  if (parsed.data.expiresAt) {
    try {
      // Heure CIVILE dans le fuseau de l'établissement, comme les créneaux : une
      // invitation qui expire « samedi minuit » n'expire pas à la même seconde à
      // Saint-Denis et à Paris.
      expiresAt = zonedDateTimeToIso(parsed.data.expiresAt, garde.timezone);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Date invalide",
      };
    }
  }

  const jeton = generateInvitationToken();
  const empreinte = hashInvitationToken(jeton);
  // Impossible par construction (le générateur produit la forme attendue) ;
  // refuser plutôt que d'envoyer une empreinte que la RPC rejetterait en 22023.
  if (!empreinte) return { ok: false, error: GENERIC_ERROR };

  return monitored("reserver.invitation-create", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_reservation_invitation", {
      p_organization_id: garde.organizationId,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: garde.userId,
      p_label: parsed.data.label,
      p_token_hash: empreinte,
      p_activity_id: parsed.data.activityId || null,
      p_slot_id: parsed.data.slotId || null,
      p_max_uses: parsed.data.maxUses,
      p_expires_at: expiresAt,
    });
    if (error) {
      reportError("reserver.invitation-create", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }

    const resultat = mapCreateInvitation(data);
    if (resultat.state !== "created" || !resultat.invitationId) {
      return {
        ok: false as const,
        error: MESSAGES_INVITATION[resultat.state] ?? GENERIC_ERROR,
      };
    }

    revalidatePath("/dashboard/reservations");
    return {
      ok: true as const,
      data: {
        invitationId: resultat.invitationId,
        label: parsed.data.label,
        token: jeton,
        url: urlInvitationReserver(jeton, APP_URL),
        maxUses: resultat.maxUses,
        expiresAt: resultat.expiresAt,
      },
    };
  });
}

/**
 * Révoquer une invitation : le lien est MORT.
 *
 * Il rendra `unavailable` à la rejointe, indistinctement d'un jeton inconnu —
 * un visiteur ne doit pas apprendre qu'une invitation a existé. NE TOUCHE
 * AUCUNE réservation déjà confirmée par ce lien.
 */
export async function revokeInvitation(
  _prev: ActionResult<RevokeInvitationResult> | null,
  formData: FormData,
): Promise<ActionResult<RevokeInvitationResult>> {
  const parsed = revokeReserverInvitationSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.invitation-revoke", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("revoke_reservation_invitation", {
      p_organization_id: garde.organizationId,
      p_invitation_id: parsed.data.id,
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.invitation-revoke", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    const resultat = mapRevokeInvitation(data);
    if (resultat.state === "unknown") {
      return { ok: false as const, error: INDISPONIBLE };
    }
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: resultat };
  });
}

/**
 * Fermer les inscriptions d'une invitation.
 *
 * ── CE N'EST PAS UNE ANNULATION DE MASSE ──
 *
 * Critère d'acceptation RES-2, et sa preuve est dans la RPC : elle n'écrit que
 * dans `reservation_invitations` et ne lit même pas `reservations`. Le lien
 * reste lisible par le commerçant, il n'ouvre simplement plus rien.
 */
export async function closeInvitation(
  _prev: ActionResult<CloseInvitationResult> | null,
  formData: FormData,
): Promise<ActionResult<CloseInvitationResult>> {
  const parsed = closeReserverInvitationSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.invitation-close", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("close_reservation_invitation", {
      p_organization_id: garde.organizationId,
      p_invitation_id: parsed.data.id,
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.invitation-close", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    const resultat = mapCloseInvitation(data);
    if (resultat.state === "unknown") {
      return { ok: false as const, error: INDISPONIBLE };
    }
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: resultat };
  });
}

/** Créer une activité réservable. */
export async function createReserverActivity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createReserverActivitySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    waitQuizId: formData.get("waitQuizId"),
    waitPauseCampaignId: formData.get("waitPauseCampaignId"),
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
    // ANIMATIONS D'ATTENTE (RES-4) : `""` = « aucune », et c'est le défaut. La
    // FK COMPOSITE `(wait_quiz_id, organization_id)` refuse le quiz du voisin.
    wait_quiz_id: parsed.data.waitQuizId || null,
    wait_pause_campaign_id: parsed.data.waitPauseCampaignId || null,
  });

  if (error) {
    console.error("[reserver] create activity:", error.message);
    // Unicité (organization_id, name) : le message nomme la cause réelle plutôt
    // qu'un échec générique sur lequel le commerçant ne peut rien.
    if (error.code === "23505") {
      return { ok: false, error: "Une activité porte déjà ce nom." };
    }
    // Violation d'une FK composite d'animation : le quiz ou la campagne
    // n'existe pas, ou n'est pas celui de ce commerce. Un seul message pour les
    // deux — le distinguer apprendrait ce qui existe chez le voisin.
    if (error.code === "23503") {
      return { ok: false, error: ANIMATION_INTROUVABLE };
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
    waitQuizId: formData.get("waitQuizId"),
    waitPauseCampaignId: formData.get("waitPauseCampaignId"),
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
      wait_quiz_id: parsed.data.waitQuizId || null,
      wait_pause_campaign_id: parsed.data.waitPauseCampaignId || null,
    })
    .eq("id", parsed.data.id)
    // Double la RLS plutôt que de s'y fier seule.
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update activity:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: "Une activité porte déjà ce nom." };
    }
    if (error.code === "23503") {
      return { ok: false, error: ANIMATION_INTROUVABLE };
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
    waitlistOfferMinutes: formData.get("waitlistOfferMinutes"),
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
    // `null` = défaut du produit (120 min). C'est une valeur, pas une absence :
    // la colonne est nullable exactement pour porter ce sens.
    waitlist_offer_minutes: parsed.data.waitlistOfferMinutes,
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
    waitlistOfferMinutes: formData.get("waitlistOfferMinutes"),
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
      waitlist_offer_minutes: parsed.data.waitlistOfferMinutes,
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

// ════════════════════════════════════════════════════════════
// La file sereine (RES-3, lot L6) — rejoindre, partir ; appeler, constater
//
// ── AUCUN EMAIL N'EST ENVOYÉ PAR CE LOT, ET C'EST ASSUMÉ ──
//
// L'adresse et son consentement sont STOCKÉS (`queue_join`), rien ne les lit.
// Rien n'est promis à quelqu'un qui entre dans une file : ni un horaire, ni un
// rang tenu. Le jour où un message partira — « c'est bientôt à vous » — ce sera
// une décision produit, avec son seau `reserver:email` et son `after()`, comme
// partout ailleurs dans ce fichier. Aucun fil n'est tiré vers Resend ici.
//
// ── ET AUCUN DÉLAI, NULLE PART ──
//
// Aucune de ces actions ne calcule, ne transporte ni ne rend une durée. Le rang
// et le nombre de personnes en attente viennent du serveur ; tout le reste
// serait inventé (critère dur RES-3).
// ════════════════════════════════════════════════════════════

export type QueueJoinActionResult =
  | { ok: true; data: QueueJoinResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Entrer dans une file d'accueil.
 *
 * ── L'ORGANISATION VIENT DE LA FILE, PAS DU CORPS ──
 *
 * Motif `redeemInvitation`, et pour la même raison : l'appelant nomme une FILE,
 * le serveur en déduit l'organisation. La poster aurait laissé le navigateur
 * choisir sous quelle enseigne il prend son rang — et le refus muet de la RPC,
 * qui rend « file d'une AUTRE organisation » indistinguable d'« inconnue »,
 * n'aurait plus rien gardé.
 *
 * Conséquence sur l'ordre des seaux, identique à `redeemInvitation` : le
 * plafond par APPAREIL est le seul opposable avant la résolution, les deux clés
 * org-scopées ne peuvent l'être qu'après.
 *
 * ── LE CHALLENGE Y EST, ET IL DOIT Y ÊTRE ──
 *
 * `queue_join` est un appel ÉMETTEUR au même titre que `reserve_slot` : les
 * invariants SQL bornent le NOMBRE d'entrées vivantes (plafond de la file,
 * index unique partiel), jamais la DIVERSITÉ des mains. Un bot muni de cookies
 * jetables qui remplit une file de cinquante fantômes coûte au commerçant
 * exactement ce que coûte un créneau vidé — sauf qu'ici les gens sont debout
 * dans le magasin et voient la file refuser du monde.
 *
 * ── LE DROIT `vitrine` EST TENU PAR LA RPC ──
 *
 * `queue_join` interroge `org_has_module_access(…, 'vitrine')` sous son verrou
 * et rend `unavailable` sans le droit — c'est la vraie défense, et elle tient
 * même sur une action POSTée en direct. La page publique le vérifie AUSSI
 * (`loadReserverQueuePublicContext`), pour ne pas afficher un bouton sans issue.
 */
export async function queueJoin(input: {
  queueId: string;
  displayName?: string;
  email?: string;
  consent?: boolean;
  turnstileToken?: string;
}): Promise<QueueJoinActionResult> {
  const parsed = queueJoinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Identité AVANT tout : aucun aller-retour base, donc le premier seau est
  // tranché avant la moindre requête SQL.
  const empreinte = await assurerIdentiteReserver();
  if (!empreinte) return { ok: false, error: GENERIC_ERROR };
  // LE SEAU PAR APPAREIL SEUL, ET AVANT TOUT LE RESTE. Le composer avec la FILE
  // aurait ouvert un seau neuf à chaque identifiant inventé — c'est-à-dire
  // aucune borne du tout (motif `progressionDevice`, wagon 7).
  if (!(await autoriserAppareilReserver(empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.queue-join", async () => {
    const ip = clientIpFromHeaders(await headers());
    // IP SEULE d'abord : elle est comptée même sur une file qui ne résout rien,
    // et c'est tout l'intérêt — un balayage d'UUID n'atteint aucune file.
    await observerPressionReserver(null, ip);

    if (
      reserverChallengeDisponible() &&
      // LA VALEUR VALIDÉE, jamais celle du corps : ce jeton part en requête
      // sortante vers Cloudflare.
      !(await verifyTurnstile(parsed.data.turnstileToken, ip, "reserver-queue-join"))
    ) {
      return {
        ok: false as const,
        error:
          "Vérification anti-robot requise. Validez le contrôle ci-dessous puis réessayez.",
        challengeRequired: true,
      };
    }

    const admin = createAdminClient();

    // L'ORGANISATION EST CELLE DE LA FILE. Introuvable = `unavailable`, le même
    // état muet que rendrait la RPC pour une file fermée ou d'un autre commerce.
    const { data: file } = await admin
      .from("reservation_queues")
      .select("id, organization_id")
      .eq("id", parsed.data.queueId)
      .maybeSingle();
    // AUCUNE ORGANISATION N'EST POSTÉE, et c'est ce qui rend ce chemin sûr : il
    // n'existe pas de valeur du corps à confronter, donc pas de valeur à
    // confondre avec celle qui autorise. La ligne lue ici est la seule source.
    if (!file) {
      return { ok: true as const, data: mapQueueJoin({ state: "unavailable" }) };
    }
    const organizationId = file.organization_id;

    // Le second seau et le second compteur, maintenant que la portée existe.
    if (!(await autoriserPorteeReserver(organizationId, empreinte))) {
      return { ok: false as const, error: TOO_MANY };
    }
    await observerPressionIp(
      ["reserver:public:ip", organizationId],
      ip,
      RATE_LIMITS.reserverPublicIp,
      "reserver_public_pressure",
      { organization_id: organizationId },
    );

    const { data, error } = await admin.rpc("queue_join", {
      p_organization_id: organizationId,
      p_queue_id: parsed.data.queueId,
      p_player_key_hash: empreinte,
      // Le prénom est un ORNEMENT D'ÉCRAN : vide vaut absent, et la RPC le
      // tronque à 40 caractères plutôt que de refuser l'entrée.
      p_display_name: parsed.data.displayName || null,
      // L'adresse ne part QU'AVEC son consentement — la base porte une
      // équivalence, pas une implication.
      p_email: parsed.data.email ?? null,
      p_consent: parsed.data.consent,
    });
    if (error) {
      reportError("reserver.queue-join", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    // AUCUN EMAIL : voir l'en-tête de section. L'adresse est stockée, rien ne
    // la lit encore.
    return { ok: true as const, data: mapQueueJoin(data) };
  });
}

/**
 * Quitter la file.
 *
 * Aucune friction, aucun challenge : c'est un geste qui LIBÈRE une ligne du
 * plafond, et qui n'a aucune conséquence — ni pénalité, ni délai de carence
 * (critère RES-3, l'abandon est MESURÉ, jamais sanctionné). Même forme que
 * `waitlistLeave`, y compris le seau porté par l'identifiant de l'ENTRÉE :
 * l'organisation n'est pas un paramètre, la RPC la lit sur la ligne.
 */
export async function queueLeave(input: {
  entryId: string;
}): Promise<ActionResult<QueueLeaveResult>> {
  const parsed = queueLeaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // LECTURE SEULE du cookie : sans identité, il n'y a rien à quitter.
  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: INDISPONIBLE };
  if (!(await autoriserJoueurReserver(parsed.data.entryId, empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.queue-leave", async () => {
    // IP SEULE, fail-open : ce chemin ne connaît pas l'organisation — la RPC la
    // lit sur la ligne — donc le compteur par organisation n'existe pas ici, et
    // l'inventaire en tête de fichier le dit.
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_leave", {
      p_entry_id: parsed.data.entryId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.queue-leave", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    return { ok: true as const, data: mapQueueLeave(data) };
  });
}

// ────────────────────────────────────────────────────────────
// Comptoir — appeler, constater, corriger (session + rôle)
// ────────────────────────────────────────────────────────────

/**
 * Session + RÔLE DE COMPTOIR, caissier COMPRIS — et sans garde `vitrine`.
 *
 * ── POURQUOI PAS `gardeEditeurReserver` ──
 *
 * Elle exclut le caissier, et l'accueil EST son poste : appeler le suivant est
 * le geste de comptoir par excellence, pas une décision commerciale. Les trois
 * RPC (`queue_call_next`, `queue_resolve`, `queue_reopen_entry`) acceptent
 * `owner`/`editor`/`cashier` et le revérifient EN SQL — cette garde ne fait que
 * rendre un message utile, elle ne tient pas la porte.
 *
 * ── POURQUOI AUCUNE GARDE `vitrine` ──
 *
 * Motif EXACT de `checkinReservation`, et pas celui de `cancelReservationStaff`.
 * Refuser d'appeler le suivant parce qu'un abonnement vient d'expirer
 * laisserait le commerçant devant douze personnes debout dans son magasin, sans
 * aucun geste : la sanction tomberait sur elles. Honorer l'existant est la seule
 * lecture correcte — et c'est aussi ce que fait le SQL, qui ne vérifie ce droit
 * QUE sur `queue_join`, l'entrée de nouvelles personnes.
 *
 * ── ET AUCUN SEAU ──
 *
 * Motif `cancelReservationStaff` et `evictWaitlistEntry` : ce sont des gestes
 * d'un opérateur AUTHENTIFIÉ sur son propre écran, pas un chemin public. Le
 * seau `cashier:lookup` n'est pas repris ici — il borne la SAISIE DE CODES, et
 * le partager ferait payer à l'appel du suivant le budget du check-in.
 */
async function gardeComptoirReserver(): Promise<
  { ok: true; organizationId: string; userId: string } | { ok: false; error: string }
> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor" && role !== "cashier") {
    return { ok: false, error: NOT_EDITOR };
  }
  return { ok: true, organizationId: organization.id, userId: user.id };
}

/**
 * Appeler la première personne en attente.
 *
 * ── CE QUE CETTE ACTION NE DÉCIDE PAS ──
 *
 * Ni qui est en tête, ni si deux caissiers qui cliquent en même temps appellent
 * la même personne : `queue_call_next` choisit la tête et la bascule SOUS UN
 * VERROU D'AVIS, donc deux appels concurrents appellent deux personnes
 * DIFFÉRENTES. Reproduire ce choix ici — lire la tête puis demander à la RPC de
 * l'appeler — aurait rétabli exactement la course que le verrou ferme.
 *
 * Elle ne contrôle pas non plus le statut de la file : une file `paused`
 * n'accepte plus personne mais SE SERT ENCORE, et c'est tout le sens de la
 * pause (« je ferme la file, je finis les douze qui attendent »).
 */
export async function queueCallNext(
  _prev: ActionResult<QueueCallNextResult> | null,
  formData: FormData,
): Promise<ActionResult<QueueCallNextResult>> {
  const parsed = queueCallNextSchema.safeParse({
    queueId: formData.get("queueId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeComptoirReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.queue-call", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_call_next", {
      p_organization_id: garde.organizationId,
      p_queue_id: parsed.data.queueId,
      // DE LA SESSION. Jamais du corps de la requête — la RPC le revérifie
      // membre en SQL, et un acteur posté ferait de la ligne d'audit
      // `reservation.queue_call` une déclaration sur l'honneur.
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.queue-call", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: mapQueueCallNext(data) };
  });
}

/**
 * Constater l'issue d'une personne appelée : servie, ou absente.
 *
 * ── MARQUER « ABSENT » EST UNE AFFIRMATION SUR UNE PERSONNE ──
 *
 * C'est pourquoi ce n'est pas un simple `update` depuis l'écran : elle doit
 * porter un auteur, et `audit_logs` en garde la trace sur le SEUL geste réel
 * (une entrée déjà résolue est rendue telle quelle, sans écriture et sans
 * audit). AUCUNE conséquence automatique n'en découle — pas de blocage, pas de
 * carence : le cahier RES-3 l'exclut nommément.
 *
 * `not_called` n'est pas une erreur d'appelant mais un refus utile au comptoir :
 * servir quelqu'un qui n'a pas été appelé saute le tour de tous ceux qui sont
 * devant lui, et c'est exactement ce contre quoi la file existe.
 */
export async function queueResolve(
  _prev: ActionResult<QueueResolveResult> | null,
  formData: FormData,
): Promise<ActionResult<QueueResolveResult>> {
  const parsed = queueResolveSchema.safeParse({
    entryId: formData.get("entryId"),
    outcome: formData.get("outcome"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeComptoirReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.queue-resolve", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_resolve", {
      p_organization_id: garde.organizationId,
      p_entry_id: parsed.data.entryId,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: garde.userId,
      p_outcome: parsed.data.outcome,
    });
    if (error) {
      reportError("reserver.queue-resolve", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: mapQueueResolve(data) };
  });
}

/**
 * Défaire un appel erroné — « j'ai appelé Camille, c'était Dominique ».
 *
 * L'entrée redevient `waiting` et se retrouve EN TÊTE : ce n'est pas une
 * écriture de rang mais une CONSÉQUENCE — `queue_call_next` avait pris la plus
 * ancienne entrée en attente, et rien de plus ancien ne peut apparaître après
 * coup. Rien n'est renuméroté, donc rien ne peut dériver.
 *
 * Le caissier en est, à l'inverse d'`evictWaitlistEntry` : celle-là RETIRE un
 * rang, celle-ci le REND, et c'est la correction immédiate d'une erreur de
 * comptoir. La faire remonter à un responsable laisserait quelqu'un perdre son
 * tour en attendant.
 */
export async function queueReopen(
  _prev: ActionResult<QueueReopenResult> | null,
  formData: FormData,
): Promise<ActionResult<QueueReopenResult>> {
  const parsed = queueReopenEntrySchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeComptoirReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  return monitored("reserver.queue-reopen", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_reopen_entry", {
      p_organization_id: garde.organizationId,
      p_entry_id: parsed.data.entryId,
      // DE LA SESSION. Jamais du corps de la requête.
      p_actor: garde.userId,
    });
    if (error) {
      reportError("reserver.queue-reopen", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }
    revalidatePath("/dashboard/reservations");
    return { ok: true as const, data: mapQueueReopen(data) };
  });
}

// ────────────────────────────────────────────────────────────
// Files d'accueil — configuration (session + RLS éditeurs)
//
// AUCUNE SUPPRESSION, comme partout dans ce module et pour la même raison : le
// socle n'a pas donné de `grant delete`, parce que la cascade emporterait les
// entrées du jour — donc les compteurs de servis, d'absents et de partis, la
// seule mesure que RES-3 promet au commerçant. `status = 'closed'` ferme sans
// rien effacer.
// ────────────────────────────────────────────────────────────

/**
 * Créer une file d'accueil.
 *
 * L'ACTIVITÉ EST OPTIONNELLE — une file « Comptoir » n'en a aucune, et c'est le
 * cas dominant. Quand elle est posée, la FK COMPOSITE
 * `(activity_id, organization_id)` garantit qu'elle appartient à ce locataire :
 * une activité empruntée au voisin est refusée par la base, pas par une
 * vérification applicative qu'on pourrait oublier.
 */
export async function createReserverQueue(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createReserverQueueSchema.safeParse({
    name: formData.get("name"),
    activityId: formData.get("activityId"),
    maxLiveEntries: formData.get("maxLiveEntries"),
    status: formData.get("status"),
    waitQuizId: formData.get("waitQuizId"),
    waitPauseCampaignId: formData.get("waitPauseCampaignId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase.from("reservation_queues").insert({
    organization_id: garde.organizationId,
    // `""` = aucune activité, et c'est une valeur, pas une absence de décision.
    activity_id: parsed.data.activityId || null,
    name: parsed.data.name,
    status: parsed.data.status,
    max_live_entries: parsed.data.maxLiveEntries,
    // ANIMATIONS D'ATTENTE (RES-4), facultatives : `""` = « aucune ». Elles ne
    // confèrent AUCUN droit sur la file — le jeu ignore jusqu'à l'existence
    // d'un rang.
    wait_quiz_id: parsed.data.waitQuizId || null,
    wait_pause_campaign_id: parsed.data.waitPauseCampaignId || null,
  });

  if (error) {
    console.error("[reserver] create queue:", error.message);
    // Unicité (organization_id, name) : le message nomme la cause réelle plutôt
    // qu'un échec générique sur lequel le commerçant ne peut rien.
    if (error.code === "23505") {
      return { ok: false, error: "Une file porte déjà ce nom." };
    }
    // Violation d'une FK composite : l'activité — ou, depuis RES-4, le quiz ou
    // la campagne d'animation — n'existe pas, ou n'est pas celui de ce
    // commerce. Un seul message pour toutes ces causes : les distinguer
    // apprendrait à qui tape des identifiants ce qui existe chez le voisin.
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Cette activité ou cette animation d'attente est introuvable.",
      };
    }
    return { ok: false, error: "Impossible de créer la file" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

/**
 * Réglages d'une file — dont son interrupteur `status`.
 *
 * `paused` N'EST PAS `closed`, et la distinction est réelle au comptoir : la
 * pause refuse les nouvelles arrivées mais laisse SERVIR ceux qui attendent
 * déjà — `queue_call_next` ne contrôle pas le statut, délibérément.
 *
 * Baisser le plafond est SÛR : `queue_join` relit `max_live_entries` SOUS son
 * verrou, dans le même instantané que son comptage. Les entrées déjà admises
 * restent — rien ne les expulse, et rien ne doit les expulser.
 */
export async function updateReserverQueue(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateReserverQueueSchema.safeParse({
    queueId: formData.get("queueId"),
    name: formData.get("name"),
    activityId: formData.get("activityId"),
    maxLiveEntries: formData.get("maxLiveEntries"),
    status: formData.get("status"),
    waitQuizId: formData.get("waitQuizId"),
    waitPauseCampaignId: formData.get("waitPauseCampaignId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurReserver();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservation_queues")
    .update({
      name: parsed.data.name,
      activity_id: parsed.data.activityId || null,
      status: parsed.data.status,
      max_live_entries: parsed.data.maxLiveEntries,
      wait_quiz_id: parsed.data.waitQuizId || null,
      wait_pause_campaign_id: parsed.data.waitPauseCampaignId || null,
    })
    .eq("id", parsed.data.queueId)
    // Double la RLS plutôt que de s'y fier seule.
    .eq("organization_id", garde.organizationId);

  if (error) {
    console.error("[reserver] update queue:", error.message);
    if (error.code === "23505") {
      return { ok: false, error: "Une file porte déjà ce nom." };
    }
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Cette activité ou cette animation d'attente est introuvable.",
      };
    }
    return { ok: false, error: "Impossible d'enregistrer la file" };
  }

  revalidatePath("/dashboard/reservations");
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Le SCRUTIN des deux écrans de la file
//
// ── POURQUOI CES DEUX-LÀ RENDENT `null` ET NON UN `ActionResult` ──
//
// Ce sont des LECTURES RÉPÉTÉES, appelées toutes les quelques secondes par un
// écran qui affiche DÉJÀ un état. `null` y veut dire « ce tic n'a rien
// rapporté » — l'écran garde ce qu'il montrait, et personne ne voit une erreur
// pour une requête perdue dans un tunnel. Un `ActionResult` aurait obligé
// chaque appelant à traduire un refus en « ne change rien », c'est-à-dire à
// réécrire la même décision deux fois.
//
// ── ET POURQUOI AUCUN DÉLAI N'EN SORT ──
//
// Ni l'un ni l'autre ne rend de durée, et aucun ne mesure l'écart entre deux
// tics : le seul temps que ces chemins connaissent est celui, FACTUEL, de
// l'inscription et de l'appel. Un ETA ne peut pas naître d'un scrutin.
// ────────────────────────────────────────────────────────────

/**
 * L'état de la file pour CE navigateur — le tic du joueur.
 *
 * ── LA GARDE `vitrine` NE PORTE QUE SUR CELUI QUI N'ATTEND PAS ──
 *
 * `queue_public_state` ne vérifie ni le droit ni le statut de la file, et c'est
 * juste pour quelqu'un qui attend PHYSIQUEMENT : lire son propre rang n'est pas
 * un acte commercial, et le lui refuser parce qu'un abonnement a expiré ferait
 * tomber la sanction sur lui. `in_queue` passe donc sans condition.
 *
 * `not_in_queue` est un tout autre document : le nom de la file, son statut et
 * le nombre de personnes qui attendent, rendus à N'IMPORTE QUI. La PAGE refuse
 * exactement cela quand le droit est fermé (`loadReserverQueuePublicContext`)
 * — laisser le scrutin y répondre en faisait l'oracle que la page refusait
 * d'être, sur l'état commercial d'un commerce tiers. Droit fermé ⇒ `unavailable`,
 * indistinctement d'une file inexistante.
 *
 * La lecture du droit n'est payée QUE sur cette branche : celui qui attend ne la
 * traverse jamais, et `unavailable` n'a plus rien à cacher.
 *
 * ── LES SEAUX D'IDENTITÉ NE SONT OPPOSÉS QU'À UNE IDENTITÉ ──
 *
 * Sans cookie, il n'y a aucune clé propre à trancher : le visiteur qui regarde
 * la file avant d'y entrer n'est mesuré que par les compteurs d'IP, fail-open
 * (ADR-032). Lui POSER un cookie pour pouvoir le compter serait écrire une
 * identité à quelqu'un qui n'a rien demandé.
 *
 * ── ET LE SEAU EST CELUI DE LA LECTURE, PAS CELUI DES GESTES ──
 *
 * Voir `autoriserLectureFileReserver` : ce scrutin consommait `reserver:device`,
 * partagé avec `queueJoin` et `queueLeave`, et le premier refus tombait sur le
 * geste, jamais sur la lecture qui l'avait épuisé.
 */
export async function getQueuePublicState(input: {
  queueId: string;
}): Promise<QueuePublicStateResult | null> {
  const parsed = queueStateSchema.safeParse(input);
  if (!parsed.success) return null;

  // LECTURE SEULE du cookie : un scrutin ne crée pas d'identité.
  const empreinte = await lireIdentiteReserver();
  if (empreinte && !(await autoriserLectureFileReserver(empreinte))) {
    // À SEC = ce tic ne rapporte rien, et l'écran garde son état. C'est le
    // comportement exact qu'on veut d'un seau sur un scrutin : il ralentit une
    // boucle, il n'efface pas un rang.
    return null;
  }

  return monitored("reserver.queue-state", async () => {
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));
    const etat = await lireEtatFilePublic(parsed.data.queueId, empreinte);
    // `in_queue` sort tel quel, et `unavailable` n'a rien à protéger : la
    // résolution du droit ne coûte une lecture que sur la branche qui l'exige.
    if (etat.state !== "not_in_queue") return etat;
    if (await droitVitrineOuvertPourFile(parsed.data.queueId)) return etat;
    return mapQueuePublicState({ state: "unavailable" });
  });
}

/**
 * L'écran d'accueil d'une file — le tic du comptoir.
 *
 * ── L'ORGANISATION VIENT DE LA SESSION, ET C'EST L'INVARIANT DU LOT ──
 *
 * `queue_staff_state` ne vérifie AUCUNE appartenance : elle est en lecture,
 * `service_role`, et bornée à l'organisation qu'on lui passe. Son commentaire
 * SQL l'écrit noir sur blanc — l'identifiant DOIT venir de `getUserAndOrg`.
 * C'est pourquoi l'entrée de cette action ne porte QUE la file : il n'existe
 * aucun chemin par lequel un navigateur puisse nommer l'organisation lue.
 *
 * La file d'un AUTRE commerce rend `unknown`, indistinctement d'une file
 * inexistante — décidé par la RPC, et rien ici ne cherche à les distinguer :
 * `mapQueueStaffState` rend alors un état non-`ok`, et cette action `null`.
 *
 * ── LE SEUL SCRUTIN AUTHENTIFIÉ, ET LE SEUL À PORTER UNE CADENCE ──
 *
 * Les trois gestes de comptoir ci-dessus n'ont aucun seau, et c'est justifié :
 * ce sont des gestes ponctuels sur un écran d'opérateur. Celui-ci n'est pas un
 * geste — c'est un écran qui se rappelle toutes les cinq secondes, et dont la
 * RPC recompose les rangs de la file entière à chaque tic. Sans borne, un
 * onglet laissé en boucle tenait ce coût indéfiniment, invisible en supervision.
 *
 * LE CHOIX : une seule clé, `reserver:queue-staff:<org>:<user>`, propre à UN
 * opérateur authentifié — motif `cashier:lookup`. C'est ce qui rend le refus
 * conforme à ADR-032 : rien de PARTAGÉ n'est fail-closed ici, saturer cette clé
 * ne ralentit que la personne qui l'a saturée, jamais l'écran de son collègue
 * ni celui d'un autre commerce. Et le refus est bénin par construction — cette
 * action rend `null`, ce qui veut dire « ce tic n'a rien rapporté » : l'écran
 * garde ce qu'il montrait, personne ne perd sa file.
 *
 * Le dépassement est REPORTÉ en plus d'être opposé (`observeSharedKey` ne rend
 * que la moitié de ce service ici — il n'oppose rien) : une console emballée
 * doit être VUE, pas seulement freinée.
 */
export async function getQueueStaffState(input: {
  queueId: string;
}): Promise<QueueStaffStateResult | null> {
  const parsed = queueStateSchema.safeParse(input);
  if (!parsed.success) return null;

  const garde = await gardeComptoirReserver();
  if (!garde.ok) return null;

  const seau = rateLimitBucket(
    "reserver:queue-staff",
    garde.organizationId,
    garde.userId,
  );
  if (
    !(await rateLimit(seau, RATE_LIMITS.reserverQueueStaffState, {
      failClosed: true,
    }))
  ) {
    reportSecurityEvent("reserver_queue_staff_cadence", {
      organization_id: garde.organizationId,
      bucket: seau,
      limit: RATE_LIMITS.reserverQueueStaffState.limit,
      window_seconds: RATE_LIMITS.reserverQueueStaffState.windowSeconds,
    });
    return null;
  }

  return monitored("reserver.queue-staff-state", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("queue_staff_state", {
      // DE LA SESSION. Jamais d'un paramètre de requête — voir ci-dessus.
      p_organization_id: garde.organizationId,
      p_queue_id: parsed.data.queueId,
    });
    if (error) {
      reportError("reserver.queue-staff-state", error.message);
      return null;
    }
    const etat = mapQueueStaffState(data);
    return etat.ok ? etat : null;
  });
}

// ════════════════════════════════════════════════════════════
// LE MODE ATTENTE ACTIVE (RES-4, lot L7) — parcours public
//
// Trois gestes, et AUCUN ne touche à la file : les RPC n'exécutent sur
// `reservation_queue_entries`, `reservations` et `reservation_waitlist_entries`
// que des `select` de VIVACITÉ. Le critère dur du cahier — « le jeu ne peut ni
// lire ni modifier rang, priorité, capacité, accès, délai ou droit à une
// place » — est donc tenu en SQL ; rien ici ne peut le défaire, et rien ici ne
// rend de rang.
//
// ── L'ORGANISATION EST RÉSOLUE PAR LE SERVEUR, TOUJOURS ──
//
// Elle vient de la SOURCE (l'entrée de file ou la réservation) ou de la SESSION,
// lues au service_role. Aucun schéma d'entrée ne la porte, donc il n'existe
// aucune valeur du corps à confondre avec celle qui autorise — motif exact de
// `queueJoin` et `redeemInvitation`. Et le refus est MUET : `unknown` couvre
// indistinctement une source inconnue, celle d'un autre commerce, celle d'un
// autre joueur, une source morte et une organisation sans le droit `vitrine`.
// Les distinguer donnerait un oracle sur qui se trouve dans le magasin d'en
// face.
//
// ── PAS DE TURNSTILE, ET LA RAISON EST STRUCTURELLE ──
//
// Voir l'inventaire des seaux en tête de fichier : la Pause Chance est bornée à
// UNE PAR SESSION par la base, la session est UNIQUE PAR SOURCE, et le gain est
// borné par l'économie de la campagne que le commerçant a dotée (stock fini,
// BORNE 2, BORNE 3). Un challenge n'aurait rien protégé de plus, devant
// quelqu'un qui patiente debout dans un magasin.
// ════════════════════════════════════════════════════════════

/**
 * L'organisation qui PORTE la source d'attente, lue au service_role.
 *
 * C'est une RÉSOLUTION, pas une autorisation : la RPC revérifie la propriété
 * (empreinte du cookie) et la vivacité sous son verrou. Introuvable rend `null`,
 * et l'appelant en fait le même refus muet que la RPC.
 */
async function organisationDeLaSourceAttente(
  admin: ReturnType<typeof createAdminClient>,
  source: { queueEntryId: string } | { reservationId: string },
): Promise<string | null> {
  const table =
    "queueEntryId" in source ? "reservation_queue_entries" : "reservations";
  const id =
    "queueEntryId" in source ? source.queueEntryId : source.reservationId;
  const { data } = await admin
    .from(table)
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

/**
 * Ouvrir — ou retrouver — sa session d'attente active.
 *
 * IDEMPOTENTE de bout en bout : la RPC retrouve la session existante sous
 * verrou d'avis, donc recharger l'écran n'en crée pas une seconde. C'est aussi
 * pourquoi le seau est celui de la LECTURE (`reserver:queue-read`) et non celui
 * des gestes : cet appel se refait à chaque retour d'onglet, et le laisser
 * manger le budget de `queueLeave` ferait tomber le premier refus sur quelqu'un
 * qui veut quitter la file dans laquelle il est debout.
 *
 * Le rendu de page l'appelle DÉJÀ (`loadReserverPublicContext`,
 * `loadReserverQueuePublicContext`) ; cette action existe pour l'écran qui
 * rafraîchit sans recharger.
 */
export async function waitSessionOpen(input: {
  queueEntryId?: string;
  reservationId?: string;
}): Promise<ActionResult<ReserverAttenteView>> {
  const parsed = waitSessionOpenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // LECTURE SEULE du cookie : sans identité, il n'y a aucune attente à ouvrir —
  // et une ouverture ne fabrique pas d'identité à quelqu'un qui n'a rien
  // demandé.
  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: ATTENTE_INDISPONIBLE };
  if (!(await autoriserLectureFileReserver(empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  const source = parsed.data.queueEntryId
    ? { queueEntryId: parsed.data.queueEntryId }
    : { reservationId: parsed.data.reservationId as string };

  return monitored("reserver.wait-open", async () => {
    const ip = clientIpFromHeaders(await headers());
    // IP SEULE d'abord : elle est comptée même sur une source qui ne résout
    // rien, et c'est tout l'intérêt — un balayage d'UUID n'atteint aucune
    // attente.
    await observerPressionReserver(null, ip);

    const admin = createAdminClient();
    const organizationId = await organisationDeLaSourceAttente(admin, source);
    if (!organizationId) {
      return { ok: false as const, error: ATTENTE_INDISPONIBLE };
    }

    await observerPressionIp(
      ["reserver:public:ip", organizationId],
      ip,
      RATE_LIMITS.reserverPublicIp,
      "reserver_public_pressure",
      { organization_id: organizationId },
    );

    // LA MÊME OUVERTURE QUE LES DEUX PAGES — écrite une fois, dans
    // `reserver-context`. Deux appels séparés auraient divergé au premier champ
    // ajouté, et l'écran aurait montré une animation que le rendu ignorait.
    const attente = await ouvrirSessionAttente(
      organizationId,
      empreinte,
      source,
    );
    if (!attente) return { ok: false as const, error: ATTENTE_INDISPONIBLE };
    return { ok: true as const, data: attente };
  });
}

/**
 * Consommer LA Pause Chance de sa session — au plus une, définitivement.
 *
 * ── ELLE NE TIRE PAS LE TOUR ──
 *
 * Elle rend un JETON et la campagne cible ; `consumeReserverWaitSpin` tire.
 * Séparer les deux permet à l'écran de montrer la roue avant de connaître le
 * résultat, comme partout ailleurs dans ce produit.
 *
 * ── LA CAMPAGNE VIENT DU PARENT, JAMAIS DE L'APPELANT ──
 *
 * C'est ce qui rend « gains décidés côté serveur à valeur plafonnée » vrai : un
 * `campaignId` posté aurait laissé le navigateur choisir sur quelle campagne il
 * joue son tour offert.
 *
 * `already_used` rend LE MÊME jeton, et ce n'est pas une fuite : c'est le sien,
 * le rejeu est borné à l'étage d'en dessous, et le taire punirait un
 * rechargement de page d'un tour perdu.
 */
export async function waitUsePause(input: {
  sessionId: string;
}): Promise<ActionResult<WaitUsePauseResult>> {
  const parsed = waitUsePauseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: ATTENTE_INDISPONIBLE };
  // LE SEAU PAR APPAREIL SEUL : le composer avec la SESSION aurait ouvert un
  // seau neuf à chaque identifiant inventé, c'est-à-dire aucune borne du tout
  // (motif `progressionDevice`, wagon 7).
  if (!(await autoriserAppareilReserver(empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.wait-use-pause", async () => {
    const ip = clientIpFromHeaders(await headers());
    await observerPressionReserver(null, ip);

    const admin = createAdminClient();
    // L'ORGANISATION EST CELLE DE LA SESSION. Résolution seule — la RPC
    // revérifie que la session est bien celle de ce cookie.
    const { data: sessionRow } = await admin
      .from("reservation_wait_sessions")
      .select("id, organization_id")
      .eq("id", parsed.data.sessionId)
      .maybeSingle();
    const organizationId =
      (sessionRow as { organization_id: string } | null)?.organization_id ??
      null;
    if (!organizationId) {
      return { ok: false as const, error: ATTENTE_INDISPONIBLE };
    }

    await observerPressionIp(
      ["reserver:public:ip", organizationId],
      ip,
      RATE_LIMITS.reserverPublicIp,
      "reserver_public_pressure",
      { organization_id: organizationId },
    );

    const { data, error } = await admin.rpc("wait_session_use_pause", {
      p_organization_id: organizationId,
      p_session_id: parsed.data.sessionId,
      p_player_key_hash: empreinte,
    });
    if (error) {
      reportError("reserver.wait-use-pause", error.message);
      return { ok: false as const, error: GENERIC_ERROR };
    }

    const resultat = mapWaitUsePause(data);
    // `unknown` = refus muet. `unconfigured` sort en `ok` : le commerçant n'a
    // simplement rien configuré, et l'écran doit pouvoir le dire sans erreur.
    if (resultat.state === "unknown") {
      return { ok: false as const, error: ATTENTE_INDISPONIBLE };
    }
    return { ok: true as const, data: resultat };
  });
}

/** Issue d'un tour de Pause Chance consommé, prête pour l'UI de la roue. */
export interface ReserverWaitSpinOutcome {
  state: "spun" | "already_consumed" | "no_prize";
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
  /** Index du lot dans la roue cible (animation), `null` si perdant/indispo. */
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
  /** Gain non perdant : jeton signé à passer à claimPrize (flux GAIN-…). */
  claimToken: string | null;
}

interface SpinRow {
  wheelId: string;
  prizeId: string | null;
  isLosing: boolean;
}

/** Relit un spin (reprise `already_consumed` via `resulting_spin_id`). */
async function loadSpinRow(
  admin: ReturnType<typeof createAdminClient>,
  spinId: string,
): Promise<SpinRow | null> {
  const { data } = await admin
    .from("spins")
    .select("wheel_id, prize_id, is_losing")
    .eq("id", spinId)
    .maybeSingle();
  if (!data) return null;
  return {
    wheelId: data.wheel_id as string,
    prizeId: (data.prize_id as string | null) ?? null,
    isLosing: data.is_losing as boolean,
  };
}

/** Enrichit l'issue avec le libellé et l'index du lot dans la roue cible. */
async function enrichSpinPrize(
  admin: ReturnType<typeof createAdminClient>,
  wheelId: string | null,
  prizeId: string | null,
): Promise<{
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
}> {
  const empty = { prizeIndex: null, label: null, description: null };
  if (!wheelId || !prizeId) return empty;

  const { data } = await admin
    .from("prizes")
    .select("id, label, description, position, created_at")
    .eq("wheel_id", wheelId)
    .eq("is_active", true);
  const prizes = (
    (data as Array<{
      id: string;
      label: string;
      description: string;
      position: number;
      created_at: string;
    }> | null) ?? []
  ).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const idx = prizes.findIndex((p) => p.id === prizeId);
  if (idx < 0) return empty;
  return {
    prizeIndex: idx,
    label: prizes[idx].label,
    description: prizes[idx].description,
  };
}

/**
 * Échanger le jeton d'octroi d'une Pause Chance contre UN tour de roue.
 *
 * CINQUIÈME exemplaire du tour de roue offert de ce dépôt (fidélité,
 * calendrier, quiz, parrainage), et c'est le but : même RPC de tirage pondéré
 * atomique, mêmes bornes économiques, même jeton `claim` rebranché sur le flux
 * `claimPrize` existant (code GAIN-…). Rien de neuf n'est inventé — le plafond
 * est celui de la campagne que le commerçant a déjà dotée.
 *
 * `no_prize` et `unavailable` NE BRÛLENT PAS le jeton : le joueur pourra revenir
 * quand le commerçant aura réapprovisionné. Un jeton brûlé sur une roue vide
 * serait une Pause Chance volée.
 */
export async function consumeReserverWaitSpin(input: {
  sessionId: string;
  grantToken: string;
}): Promise<ActionResult<ReserverWaitSpinOutcome>> {
  const parsed = waitConsumeSpinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Sans cookie il n'y a rien à consommer : on sort avant toute requête, tout
  // compteur et toute instrumentation (motif `consumeQuizSpin`).
  const empreinte = await lireIdentiteReserver();
  if (!empreinte) return { ok: false, error: ATTENTE_INDISPONIBLE };
  if (!(await autoriserAppareilReserver(empreinte))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("reserver.wait-consume-spin", () =>
    consommerTourAttente(parsed.data, empreinte),
  );
}

async function consommerTourAttente(
  parsed: { sessionId: string; grantToken: string },
  empreinte: string,
): Promise<ActionResult<ReserverWaitSpinOutcome>> {
  try {
    // Le contexte de ce chemin tient en un client : la RPC ne prend AUCUNE
    // organisation — elle la lit sur la session, résolue par le jeton ET
    // l'empreinte. Il n'y a donc rien à résoudre ici, et rien à confondre.
    const ctx = { admin: createAdminClient() };

    // Clé PARTAGÉE (IP seule) : fail-OPEN, observabilité seule (ADR-032).
    await observerPressionReserver(null, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc(
      "consume_reserver_wait_spin_grant",
      {
        p_session_id: parsed.sessionId,
        p_player_key_hash: empreinte,
        p_grant_token: parsed.grantToken,
      },
    );
    if (error) {
      reportError("reserver.wait-consume-spin", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const grant = mapWaitSpinGrant(data);
    if (grant.state === "unavailable") {
      return { ok: false, error: ATTENTE_INDISPONIBLE };
    }
    if (grant.state === "no_prize") {
      return {
        ok: true,
        data: {
          state: "no_prize",
          wheelId: grant.wheelId,
          prizeId: null,
          isLosing: false,
          prizeIndex: null,
          label: null,
          description: null,
          claimToken: null,
        },
      };
    }

    // spun / already_consumed : reconstruire l'issue à partir du spin.
    let wheelId = grant.wheelId;
    let prizeId = grant.prizeId;
    let isLosing = grant.isLosing;
    if (grant.state === "already_consumed" && grant.spinId) {
      const spin = await loadSpinRow(ctx.admin, grant.spinId);
      if (spin) {
        wheelId = spin.wheelId;
        prizeId = spin.prizeId;
        isLosing = spin.isLosing;
      }
    }

    const enriched = await enrichSpinPrize(ctx.admin, wheelId, prizeId);
    const claimToken =
      !isLosing && prizeId && grant.spinId ? signClaimToken(grant.spinId) : null;

    // PONT `campaign` DU TOUR OFFERT (voir `bridgeOfferedSpinToCampaign`).
    //
    // La `participations` que `claimPrize` va créer est résolue par le triplet
    // (`campaign`, campaign_id, player_key) : sans ce pont, son `player_id`
    // reste null et le lot n'apparaît JAMAIS sur `/portefeuille` — sans une
    // erreur nulle part (ADR-066).
    //
    // Posé ICI et pas plus haut : un jeton de claim émis est la condition
    // exacte sous laquelle une participation peut naître. Un tour perdant ou
    // sans lot n'a aucun lot à faire figurer nulle part.
    if (claimToken && grant.spinId) {
      await bridgeOfferedSpinToCampaign(ctx.admin, grant.spinId);
    }

    return {
      ok: true,
      data: {
        state: grant.state,
        wheelId,
        prizeId,
        isLosing,
        prizeIndex: enriched.prizeIndex,
        label: enriched.label,
        description: enriched.description,
        claimToken,
      },
    };
  } catch (err) {
    reportError("reserver.wait-consume-spin", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
