import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { recordCounter } from "@/lib/monitoring";
import {
  generatePlayerDeviceToken,
  hashPlayerDeviceToken,
  lookupLegacyIdentityHash,
  peekPlayerDeviceTokenHash,
  PLAYER_COOKIE_MAX_AGE,
  PLAYER_COOKIE_NAME,
  PLAYER_DEVICE_TOKEN_PATTERN,
} from "@/lib/player-identity";
import {
  asQueueStatus,
  asReservationStatus,
  asReserverActivityKind,
  asSlotStatus,
  asWaitlistStatus,
  etatUiInvitation,
  etatUiOffreStock,
  etatUiPlaceFile,
  mapExperienceSteps,
  mapQueuePublicState,
  mapReservationPublicState,
  mapStockOfferPublicState,
  mapStockOffersStaffState,
  mapWaitSessionOpen,
  offreAccepteePrise,
  pairesRestantes,
  placesParReservation,
  QUEUE_MAX_LIVE_ENTRIES_DEFAUT,
  QUEUE_MAX_LIVE_ENTRIES_MAX,
  RESERVER_FUSEAU_DEFAUT,
  RESERVER_INVITATION_TOKEN_PATTERN,
  vueAttente,
  type EtatUiInvitation,
  type EtatUiOffreStock,
  type EtatUiPlaceFile,
  type PublicWaitlistItem,
  type QueuePublicStateResult,
  type StockOfferPublicStateResult,
  type StockOfferStaffView,
  type ReserverActivityKind,
  type ReserverAttenteView,
  type ReserverExperienceStep,
  type ReservationQueueEntryStatus,
  type ReservationQueueStatus,
  type ReservationStatus,
  type ReservationSlotStatus,
  type ReservationWaitlistStatus,
} from "@/lib/reserver";
import { droitEffectifModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/types/database";

/**
 * Chargeurs serveur du module Réserver (RES-1b, lot L4).
 *
 * ── LES COLONNES SONT ÉNUMÉRÉES, TOUJOURS ──
 *
 * `reservations` porte un GRANT DE COLONNES à `authenticated` dont `email` est
 * ABSENT (20261002120000:435) : un `select *` PostgREST est refusé EN ENTIER sur
 * cette table, pas partiellement. Les trois tables sont donc lues colonne par
 * colonne — y compris côté service_role, où rien ne l'imposerait, pour que la
 * requête du dashboard et celle du parcours public ne divergent pas le jour où
 * l'une passe de l'autre côté.
 *
 * ── LE DROIT `reserver` EST VÉRIFIÉ ICI AUSSI ──
 *
 * `reserve_slot` l'interroge déjà en SQL, et c'est la vraie défense. Ce chargeur
 * le vérifie pour une raison différente : une organisation sans le droit doit
 * rendre le MÊME contexte « indisponible » qu'une activité inexistante — sans
 * quoi la page publique deviendrait un oracle sur l'état commercial d'un
 * commerce qui n'est pas celui du visiteur.
 *
 * LA CLÉ EST `reserver` DEPUIS 20261020120000, ET PLUS `vitrine`. Les deux
 * désignaient le même booléen tant qu'une clé unique ouvrait quatre produits ;
 * la migration a détaché l'agenda, recopié aux mêmes bornes les octrois
 * existants (`mirror_vitrine_entitlements`), et réécrit les seize appels SQL de
 * ce module. Continuer à demander `vitrine` ici aurait rouvert l'écart que ce
 * fichier passe son temps à fermer : la base accordant ce que l'écran refuse,
 * pour un commerçant à qui l'on vient de vendre l'agenda seul.
 */

/** Erreur générique unique : aucun oracle sur l'existence ni sur l'état. */
const INDISPONIBLE = "Cette page de réservation n'est pas disponible.";

/**
 * Créneaux affichés sur une page publique. Vingt suffisent à un agenda de
 * commerce, et cette borne est aussi ce qui plafonne la lecture de comptage
 * ci-dessous (20 × capacité max 500 = 10 000 lignes au pire).
 */
const CRENEAUX_PUBLICS_MAX = 20;

/** Plafond de la lecture de comptage — voir `CRENEAUX_PUBLICS_MAX`. */
const RESERVATIONS_COMPTAGE_MAX = 10_000;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_reserver, comp_access, comp_access_until, timezone";

/**
 * Les CINQ COLONNES D'EXPÉRIENCE (RES-5) sont dans la liste COMMUNE, à la
 * différence des deux colonnes d'animation d'attente — et c'est la même règle
 * qui range les unes ici et les autres à part : on lit ce que la page rend.
 *
 * `kind`, `promise`, `duration_minutes`, `steps` et `preparation` SONT la page
 * immersive : le visiteur doit lire la promesse, la durée annoncée, les trois
 * cartes et ce qu'il faut savoir avant de venir. `wait_quiz_id`, lui, décrit ce
 * qui sera proposé à QUELQU'UN D'AUTRE pendant qu'il attend — rien à faire dans
 * le HTML d'un visiteur qui n'attend rien.
 *
 * `authenticated` porte un `grant select` DE TABLE sur `reservation_activities`
 * (socle, 20261002120000:418) : les colonnes neuves y entrent sans grant de
 * plus, contrairement à `reservations` qui est en liste blanche de colonnes.
 */
const ACTIVITY_COLUMNS =
  "id, organization_id, name, description, active, created_at, kind, promise, duration_minutes, steps, preparation, booking_mode";

/**
 * LES DEUX COLONNES D'ANIMATION D'ATTENTE (RES-4), ajoutées aux précédentes
 * pour le SEUL écran qui les règle.
 *
 * Une constante séparée, et non deux colonnes de plus sur `ACTIVITY_COLUMNS` :
 * la configuration d'animation n'a aucune raison d'être lue sur le chemin
 * public, qui la jetterait de toute façon. Ce qu'on ne lit pas ne peut pas
 * fuir dans un HTML par un `...row` distrait.
 */
const ACTIVITY_DASHBOARD_COLUMNS = `${ACTIVITY_COLUMNS}, wait_quiz_id, wait_pause_campaign_id`;

const SLOT_COLUMNS =
  "id, organization_id, activity_id, starts_at, ends_at, capacity, status, waitlist_offer_minutes";

/**
 * `email` EST ABSENT, et c'est le point : il n'existe que pour l'envoi serveur.
 *
 * `party_size` Y EST (RES-5), et il a fallu un grant pour cela
 * (20261007120000:412) : sans lui, l'agenda du commerçant afficherait
 * « 3 réservations » sur un atelier plein à 6 personnes, et la jauge ne pourrait
 * pas sommer ce qu'elle ne peut pas lire.
 */
const RESERVATION_COLUMNS =
  "id, slot_id, organization_id, code, status, created_at, cancelled_at, checked_in_at, checked_in_by, party_size, table_id";

/**
 * Entrées de liste prioritaire du panneau commerçant.
 *
 * `email` EST ABSENT — hors du grant de colonnes, exactement comme sur
 * `reservations` : le commerçant voit QUI attend et à quel rang, l'adresse
 * n'existe que pour que le serveur prévienne.
 *
 * `player_key_hash` EST ABSENT AUSSI, et là c'est un choix de CETTE couche, pas
 * du SQL : la colonne est dans le grant (elle sert à recomposer une file), mais
 * c'est la CLÉ D'ACCÈS du joueur — la faire descendre jusqu'à un écran la
 * mettrait dans un HTML, un cache et une capture d'écran, pour un affichage qui
 * n'en a aucun usage.
 */
const WAITLIST_COLUMNS =
  "id, slot_id, organization_id, status, offered_at, offer_expires_at, converted_at, converted_reservation_id, expired_at, cancelled_at, created_at, party_size";

/** `token_hash` EST ABSENT : il n'est pas dans le grant, et n'a aucun lecteur. */
const INVITATION_COLUMNS =
  "id, organization_id, activity_id, slot_id, label, max_uses, used_count, expires_at, closed_at, revoked_at, created_by, created_at";

/** Files d'accueil (RES-3) — toutes les colonnes de la table, aucune sensible. */
const QUEUE_COLUMNS =
  "id, organization_id, activity_id, name, status, max_live_entries, created_at";

/** Miroir d'`ACTIVITY_DASHBOARD_COLUMNS` pour la file — même raison. */
const QUEUE_DASHBOARD_COLUMNS = `${QUEUE_COLUMNS}, wait_quiz_id, wait_pause_campaign_id`;

/**
 * Les cibles d'animation proposables au commerçant. `name` sur les deux tables,
 * et rien d'autre : un sélecteur n'a besoin que d'un libellé et d'un
 * identifiant.
 */
const ATTENTE_OPTION_COLUMNS = "id, name";

/**
 * Plafond des deux listes de choix. Un commerce qui aurait plus de 200 quiz ou
 * 200 campagnes ne choisirait de toute façon pas dans une liste déroulante.
 */
const ATTENTE_OPTIONS_MAX = 200;

/**
 * Entrées de file lues POUR ÊTRE COMPTÉES.
 *
 * `email` ET `display_name` sont HORS du grant de colonnes de `authenticated`
 * (20261005120000) : un `select *` y est refusé EN ENTIER, pas partiellement.
 * Le prénom ne sort que par `queue_staff_state`, qui choisit ce qu'elle expose
 * — c'est le seul écran où il a une raison d'être, en face du bon rang.
 * `player_key_hash` est absent aussi, et là c'est un choix de CETTE couche :
 * c'est la clé d'accès du joueur, elle n'a rien à faire dans un HTML.
 */
const QUEUE_ENTRY_COUNT_COLUMNS = "id, queue_id, status";

type ReserverOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_reserver"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

interface ActivityRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  /** Les cinq colonnes d'expérience (RES-5) — lues sur les deux chemins. */
  kind: string;
  promise: string | null;
  duration_minutes: number | null;
  steps: unknown;
  preparation: string | null;
  /** D'où viennent les créneaux (20261106120000) : `moment` ou `rendez_vous`. */
  booking_mode?: string | null;
  /** Présentes seulement sur la lecture `ACTIVITY_DASHBOARD_COLUMNS`. */
  wait_quiz_id?: string | null;
  wait_pause_campaign_id?: string | null;
  organizations?: ReserverOrganization | null;
}

/** Une cible d'animation d'attente, telle que le sélecteur la propose. */
export interface ReserverAttenteOption {
  id: string;
  name: string;
}

interface SlotRow {
  id: string;
  organization_id: string;
  activity_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  waitlist_offer_minutes: number | null;
}

interface WaitlistRow {
  id: string;
  slot_id: string;
  organization_id: string;
  status: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  converted_at: string | null;
  converted_reservation_id: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  party_size: number | null;
}

interface InvitationRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  slot_id: string | null;
  label: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  closed_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface ReservationRow {
  id: string;
  slot_id: string;
  organization_id: string;
  code: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  party_size: number;
  table_id: string | null;
}

interface QueueRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  name: string;
  status: string;
  max_live_entries: number;
  created_at: string;
  /** Présentes seulement sur la lecture `QUEUE_DASHBOARD_COLUMNS`. */
  wait_quiz_id?: string | null;
  wait_pause_campaign_id?: string | null;
  organizations?: ReserverOrganization | null;
}

// ────────────────────────────────────────────────────────────
// Identité joueur — le cookie global `lc-player`
// ────────────────────────────────────────────────────────────

/**
 * Empreinte du cookie joueur, en LECTURE SEULE — miroir de
 * `peekPlayerDeviceTokenHash`, qui ne pose jamais le cookie et n'écrit jamais en
 * base. C'est la seule forme admissible dans un rendu de page : un composant
 * serveur n'a pas le droit d'écrire un cookie.
 *
 * `null` = pas d'identité (cookie absent, malformé, ou sel non configuré), donc
 * aucune réservation à retrouver — ce qui est vrai par construction.
 */
export async function lireIdentiteReserver(): Promise<string | null> {
  return peekPlayerDeviceTokenHash();
}

/**
 * Empreinte du cookie joueur, EN POSANT le cookie s'il manque. Réservée aux
 * server actions.
 *
 * ── POURQUOI CE HELPER PLUTÔT QU'`ensurePlayerDeviceCookie` PUIS UN PEEK ──
 *
 * Le couple « poser puis relire » ferait dépendre le hash rendu de la façon
 * dont le magasin de cookies reflète une écriture faite dans la même requête.
 * Ici le jeton est tenu en main : c'est LUI qu'on hache, jamais ce qu'une
 * seconde lecture veut bien rendre. Aucun aller-retour base, donc le premier
 * seau de limitation peut être tranché avant la moindre requête SQL.
 *
 * `null` si le sel `PLAYER_KEY_SALT` n'est pas configuré : l'action refusera,
 * plutôt que d'écrire une empreinte qui ne vaut rien.
 */
export async function assurerIdentiteReserver(): Promise<string | null> {
  try {
    const store = await cookies();
    const existant = store.get(PLAYER_COOKIE_NAME)?.value;
    const valide = existant && PLAYER_DEVICE_TOKEN_PATTERN.test(existant);
    const jeton = valide ? existant : generatePlayerDeviceToken();
    // Le hash AVANT la pose : si le sel manque, rien n'est écrit dans le
    // navigateur pour une identité que le serveur ne saura pas relire.
    const empreinte = hashPlayerDeviceToken(jeton);
    if (!valide) {
      store.set(PLAYER_COOKIE_NAME, jeton, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PLAYER_COOKIE_MAX_AGE,
        priority: "high",
      });
    }
    return empreinte;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Jeton d'invitation — tiré ici, haché ici, jamais journalisé
// ────────────────────────────────────────────────────────────

/**
 * Jeton d'invitation en clair : 24 octets tirés du CSPRNG, en base64url.
 *
 * 192 bits, très au-delà des 128 exigés : aucun dictionnaire ne retrouve un tel
 * jeton, ce qui est la raison même pour laquelle la base peut se contenter
 * d'une empreinte NON SALÉE. Il ne quitte cette fonction que vers l'écran de
 * création, UNE FOIS — la base n'en garde que le SHA-256.
 */
export function generateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * SHA-256 hexadécimal, SANS SEL — le contrat écrit dans la migration
 * 20261004120000 (`reservation_invitations.token_hash`).
 *
 * Non salé DÉLIBÉRÉMENT, contrairement à `hashPlayerDeviceToken` : le sel
 * applicatif de l'identité joueur existe pour empêcher de rapprocher les
 * empreintes d'un même appareil entre tables historiques. Ici il n'y a rien à
 * rapprocher, et un sel rendrait TOUTES les invitations illisibles le jour où
 * il tournerait — une invitation doit survivre à une rotation de secret, une
 * session non.
 *
 * `null` si le jeton n'a pas la forme attendue : hacher n'importe quoi
 * produirait une empreinte bien formée pour une entrée qui ne l'est pas, et la
 * RPC lèverait `22023` sur ce que le contrôle de forme aurait dû arrêter.
 */
export function hashInvitationToken(jeton: string): string | null {
  const clair = jeton.trim();
  if (!RESERVER_INVITATION_TOKEN_PATTERN.test(clair)) return null;
  return createHash("sha256").update(clair).digest("hex");
}

// ────────────────────────────────────────────────────────────
// LE MODE ATTENTE ACTIVE (RES-4) — la session, écrite UNE FOIS
//
// Les deux formes d'attente du produit ouvrent la MÊME session par la MÊME
// RPC ; seule la source change. Écrire cet appel deux fois aurait fait diverger
// les deux écrans au premier champ ajouté — c'est le motif exact de
// `lireEtatFilePublic`, et il vaut ici pour la même raison.
//
// ── L'ORGANISATION VIENT DE LA RÉSOLUTION SERVEUR, JAMAIS DU CLIENT ──
//
// Les appelants la tiennent d'une ligne qu'ils viennent de lire (la file, ou
// l'activité qui porte le créneau). Aucun chemin ne laisse un navigateur la
// nommer, et `unknown` — le seul refus de la RPC — se traduit ici par `null` :
// aucun oracle, et l'écran d'attente reste ce qu'il était avant RES-4.
//
// ── OUVRIR EST IDEMPOTENT, DONC UN RENDU DE PAGE PEUT LE FAIRE ──
//
// `wait_session_open` retrouve la session existante sous verrou d'avis et
// n'insère qu'à la première ouverture. Recharger la page ne crée pas une
// seconde session, et rien de cette écriture ne touche la file — la RPC ne lit
// de la source que sa propriété et sa vivacité.
// ────────────────────────────────────────────────────────────

/**
 * Ouvre — ou retrouve — la session d'attente de CE navigateur sur une source
 * vivante, et rend de quoi peupler l'écran d'attente.
 *
 * `null` dès que la RPC refuse (source inconnue, d'un autre commerce, d'un
 * autre joueur, morte, ou organisation sans le droit `reserver`) : le Mode
 * Attente active est FACULTATIF, son absence n'est pas une panne.
 */
export async function ouvrirSessionAttente(
  organizationId: string,
  empreinte: string,
  source: { queueEntryId: string } | { reservationId: string },
): Promise<ReserverAttenteView | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("wait_session_open", {
    p_organization_id: organizationId,
    p_player_key_hash: empreinte,
    // EXACTEMENT UNE des deux, comme le `num_nonnulls(…) = 1` de la table.
    p_queue_entry_id:
      "queueEntryId" in source ? source.queueEntryId : undefined,
    p_reservation_id:
      "reservationId" in source ? source.reservationId : undefined,
  });
  // Un échec d'ouverture n'a AUCUNE conséquence sur l'attente elle-même : la
  // page rend son rang comme avant, sans animation. Rien à propager.
  if (error) return null;
  return vueAttente(mapWaitSessionOpen(data));
}

// ────────────────────────────────────────────────────────────
// Contexte PUBLIC d'une activité
// ────────────────────────────────────────────────────────────

export interface ReserverActivityView {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  /**
   * ANIMATIONS D'ATTENTE (RES-4) — la CONFIGURATION, celle que le commerçant
   * règle sur son écran.
   *
   * Toujours `null` sur le contexte PUBLIC, et ce n'est pas un oubli : le
   * visiteur d'une page d'activité n'a rien à savoir de ce qui sera proposé à
   * quelqu'un d'autre. La configuration ne descend au joueur que par
   * `wait_session_open`, donc uniquement à celui qui détient une attente
   * VIVANTE, et seulement si l'animation est `active` — voir `attente` sur
   * `ReserverPublicContext`.
   */
  waitQuizId: string | null;
  waitPauseCampaignId: string | null;
  /**
   * LE FORMAT (RES-5) et sa présentation. Ceux-là descendent AUSSI sur le chemin
   * public — ils SONT la page immersive, et le visiteur les lit avant de
   * s'engager. `kind` est ce qui décide de l'unité de réservation : sur `duo`,
   * la surface publique demande deux places.
   */
  kind: ReserverActivityKind;
  promise: string | null;
  durationMinutes: number | null;
  steps: ReserverExperienceStep[];
  preparation: string | null;
}

export interface ReserverSlotPublicView {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: ReservationSlotStatus;
  /**
   * Places restantes, EN PERSONNES — comptage à DEUX TERMES, celui de
   * `reserve_slot` : réservations vivantes (confirmées ET arrivées) PLUS offres
   * de liste prioritaire encore tenues. Oublier le second ferait afficher une
   * place libre que la RPC refuse, parce qu'elle est promise à quelqu'un.
   *
   * ── DES PERSONNES, PAS DES LIGNES (RES-5) ──
   *
   * Le premier terme SOMME `party_size` depuis L8. Compter des lignes
   * sous-estimait l'occupation d'un Atelier Duo de moitié : trois lignes y
   * valent six personnes, et la jauge affichait « 3 places prises » sur un
   * atelier plein.
   */
  remaining: number;
  /**
   * Combien de RÉSERVATIONS ENTIÈRES tiennent encore — `null` hors d'un Atelier
   * Duo, où une place restante EST une réservation possible et où rendre le même
   * nombre deux fois n'apprendrait rien. Sur un duo, c'est `remaining / 2` en
   * division entière : une place isolée n'est prenable par personne.
   */
  pairesRestantes: number | null;
  /** Fenêtre de tenue d'une place proposée ; `null` = défaut du produit. */
  waitlistOfferMinutes: number | null;
}

export interface ReserverMaReservationView {
  reservationId: string;
  slotId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  checkedInAt: string | null;
  /** Personnes que CETTE réservation occupe — 2 sur un Atelier Duo (RES-5). */
  partySize: number;
}

export type ReserverPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      activity: ReserverActivityView;
      organization: ReserverOrganization;
      /** Fuseau de l'établissement — jamais celui de l'hôte ni du navigateur. */
      timezone: string;
      slots: ReserverSlotPublicView[];
      /** Les réservations VIVANTES de ce navigateur, par créneau. */
      mesReservations: Record<string, ReserverMaReservationView>;
      /**
       * Les entrées de file VIVANTES de ce navigateur, par créneau.
       *
       * ── C'EST L'AIGUILLAGE, PAS UN ORNEMENT ──
       *
       * Un joueur qui DÉTIENT une offre vivante (`offerLive`) reçoit `full` de
       * `reserve_slot` : sa place est comptée comme tenue, et la reprendre par
       * la jauge publique la compterait deux fois. L'écran doit donc le router
       * vers `claimWaitlistOffer` — jamais vers le bouton de réservation — et
       * c'est cette entrée-là qui le lui dit.
       */
      maFile: Record<string, PublicWaitlistItem>;
      /**
       * La session d'ATTENTE ACTIVE (RES-4) du prochain créneau confirmé, ou
       * `null`.
       *
       * ── UNE SEULE, ET C'EST CELLE DE L'ATTENTE EN COURS ──
       *
       * Cette page peut porter vingt créneaux, donc jusqu'à vingt réservations
       * de ce navigateur. En ouvrir une session par réservation aurait écrit
       * vingt lignes pour UN écran, et l'écran n'en montre qu'une : celle du
       * créneau le plus proche, le seul qu'on attende réellement. Les autres
       * s'ouvriront le jour où elles seront la prochaine.
       *
       * `checked_in` n'y donne pas droit : qui est arrivé n'attend plus, et la
       * RPC le refuse (`confirmed` seulement).
       */
      attente: ReserverAttenteView | null;
      /** Ce navigateur porte-t-il déjà une identité joueur ? */
      aUneIdentite: boolean;
      /**
       * L'adresse est-elle EXIGÉE pour réserver ? Vrai pour un rendez-vous,
       * faux pour un Moment — la règle suit l'usage, pas le module.
       */
      emailObligatoire: boolean;
      /**
       * Le MODE de réservation, rendu tel quel.
       *
       * Il a d abord été DÉRIVÉ d emailObligatoire côté page — les deux
       * valaient la même chose. C était un raccourci qui tenait par accident :
       * l adresse est exigée PARCE QUE le rendez-vous la demande, mais rien
       * n interdit qu un jour un Moment l exige aussi, et ce jour-là toute la
       * salle se serait affichée sur des ateliers.
       *
       * Une conséquence ne remplace pas sa cause : on rend la cause.
       */
      bookingMode: "moment" | "rendez_vous";
    };

/**
 * LA PLACE N'EST PLUS LA LIGNE (RES-5) — la jauge SOMME `party_size`.
 *
 * Les deux chemins publics comptaient des lignes, ce qui était exact tant qu'une
 * réservation valait une personne. Sur un Atelier Duo, trois lignes valent SIX
 * personnes : compter des lignes affichait « 3 places prises » sur un atelier
 * plein, donc une jauge qui sous-estime l'occupation de MOITIÉ et un bouton
 * « réserver » que `reserve_slot` refuse.
 *
 * Écrit UNE FOIS et partagé par les deux chemins, délibérément : deux boucles
 * jumelles avaient déjà produit deux comptages qu'il fallait tenir d'accord.
 *
 * LE REPLI EST 1, JAMAIS 0. Une réservation occupe au moins une place ; une
 * colonne illisible ne doit pas faire disparaître quelqu'un d'un compte de
 * capacité — l'erreur sûre est de compter une place de trop, pas une de moins.
 */
function compterPersonnesParCreneau(
  lignes: ReadonlyArray<{ slot_id: string; party_size?: number | null }>,
): Map<string, number> {
  const parCreneau = new Map<string, number>();
  for (const ligne of lignes) {
    const places =
      typeof ligne.party_size === "number" && Number.isFinite(ligne.party_size)
        ? Math.max(1, Math.trunc(ligne.party_size))
        : 1;
    parCreneau.set(
      ligne.slot_id,
      (parCreneau.get(ligne.slot_id) ?? 0) + places,
    );
  }
  return parCreneau;
}

/**
 * Les PLACES qu'une offre de liste prioritaire tient — l'unité du format, pas
 * une ligne (`count(*) * v_seats` dans les cinq RPC). Une offre sur un Atelier
 * Duo tient DEUX places, puisque sa conversion en prendra deux.
 */
function compterPlacesTenues(
  lignes: ReadonlyArray<{ slot_id: string }>,
  placesParOffre: number,
): Map<string, number> {
  const parCreneau = new Map<string, number>();
  for (const ligne of lignes) {
    parCreneau.set(
      ligne.slot_id,
      (parCreneau.get(ligne.slot_id) ?? 0) + placesParOffre,
    );
  }
  return parCreneau;
}

/**
 * Contexte public d'une activité : l'activité, ses créneaux OUVERTS et À VENIR,
 * et la réservation que ce navigateur détient déjà sur chacun d'eux.
 *
 * Le comptage des places restantes est INDICATIF, et il faut le savoir : il est
 * lu hors du verrou d'avis que prend `reserve_slot`. Un créneau affiché « une
 * place » peut donc répondre `full` — c'est la RPC qui tranche, sous verrou, et
 * c'est bien elle qui doit trancher. L'affichage ne fait qu'éviter au joueur de
 * cliquer sur un créneau visiblement plein.
 */
export async function loadReserverPublicContext(
  activityId: string,
): Promise<ReserverPublicContext> {
  // ── PRESSION IP, EN PREMIER ET SANS JAMAIS REFUSER ──
  //
  // C'était le dernier chargeur public du module sans aucune mesure : la page
  // n'est pas `monitored` et aucune server action n'est appelée à l'ouverture,
  // donc une boucle de GET sur `/reserver/<uuid>` restait invisible à la
  // supervision. `observerPressionIp` est fail-OPEN par construction
  // (`observeSharedKey` ne rend rien) — l'IP est une clé PARTAGÉE derrière le
  // Wi-Fi d'un commerce, et un refus dessus serait un interrupteur qu'un tiers
  // allume (ADR-032). Règle `reserverPageIpCeiling`, motif `loyaltyOrderPageIp`.
  //
  // AVANT LA LECTURE, contrairement au précédent loyalty : l'identifiant vient
  // de l'URL, donc du client. Un balayage d'UUID inventés n'atteint jamais une
  // activité résolue — posé après, ce compteur n'en verrait rien.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  const admin = createAdminClient();

  const { data: activityData } = await admin
    .from("reservation_activities")
    .select(`${ACTIVITY_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", activityId)
    .maybeSingle();
  if (!activityData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = activityData as unknown as ActivityRow;
  const organization = row.organizations ?? null;
  // Garde inter-tenant : la jointure ne doit jamais rapporter une organisation
  // qui n'est pas celle de la ligne (motif loadQuizActionContext).
  if (!organization || organization.id !== row.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }
  // Organisation sans le droit `reserver` : MÊME rendu qu'une activité
  // inexistante. Aucun oracle sur l'état commercial d'un tiers.
  if (!(await moduleOuvertAuJoueur("reserver", organization))) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!row.active) return { ok: false, error: INDISPONIBLE };

  // Second compteur, par ACTIVITÉ cette fois — il n'a de sens qu'ici, une fois
  // l'activité résolue. Fail-open lui aussi : il nomme la page sous pression,
  // il n'en ferme aucune.
  await observerPressionIp(
    ["reserver:page:activity:ip", row.id],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { activity_id: row.id },
  );

  const timezone = organization.timezone || RESERVER_FUSEAU_DEFAUT;
  const maintenant = new Date().toISOString();

  const { data: slotData } = await admin
    .from("reservation_slots")
    .select(SLOT_COLUMNS)
    .eq("organization_id", organization.id)
    .eq("activity_id", row.id)
    .eq("status", "open")
    .gt("starts_at", maintenant)
    .order("starts_at", { ascending: true })
    .limit(CRENEAUX_PUBLICS_MAX);

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const slotRows = (slotData ?? []) as unknown as SlotRow[];
  const slotIds = slotRows.map((slot) => slot.id);

  const empreinte = await lireIdentiteReserver();
  const mesReservations: Record<string, ReserverMaReservationView> = {};
  const maFile: Record<string, PublicWaitlistItem> = {};
  // LE FORMAT DE L'ACTIVITÉ, lu une fois : c'est lui qui donne l'unité de
  // réservation de tous ses créneaux (voir la migration — le format est une
  // propriété de ce qui est proposé, jamais de l'heure à laquelle on le
  // propose).
  const kind = asReserverActivityKind(row.kind);
  const placesParOffre = placesParReservation(kind);
  let vivantesParCreneau = new Map<string, number>();
  let tenuesParCreneau = new Map<string, number>();

  if (slotIds.length > 0) {
    // LES DEUX ÉTATS VIVANTS, comme le comptage de `reserve_slot` : une arrivée
    // occupe la place qu'elle honore, le check-in ne libère rien. Compter les
    // seules `confirmed` ferait afficher une place qui n'existe plus.
    const { data: vivantes } = await admin
      .from("reservations")
      .select("slot_id, status, party_size")
      .eq("organization_id", organization.id)
      .in("slot_id", slotIds)
      .in("status", ["confirmed", "checked_in"])
      .limit(RESERVATIONS_COMPTAGE_MAX);

    // EN PERSONNES, PAS EN LIGNES (RES-5) — voir `compterPersonnesParCreneau`.
    vivantesParCreneau = compterPersonnesParCreneau(
      (vivantes ?? []) as Array<{ slot_id: string; party_size?: number | null }>,
    );

    // LE SECOND TERME DE LA JAUGE : les places TENUES par une offre de liste
    // prioritaire. `offer_expires_at > maintenant` reproduit le refus PARESSEUX
    // du SQL — une offre échue ne tient plus rien, même si le balayage de
    // pg_cron n'est pas encore passé, et attendre son passage gèlerait ici une
    // place que `reserve_slot` accorderait sans hésiter.
    const { data: tenues } = await admin
      .from("reservation_waitlist_entries")
      .select("slot_id, status, offer_expires_at")
      .eq("organization_id", organization.id)
      .in("slot_id", slotIds)
      .eq("status", "offered")
      .gt("offer_expires_at", maintenant)
      .limit(RESERVATIONS_COMPTAGE_MAX);

    tenuesParCreneau = compterPlacesTenues(
      (tenues ?? []) as Array<{ slot_id: string }>,
      placesParOffre,
    );

    if (empreinte) {
      const { data: miennes } = await admin
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("organization_id", organization.id)
        .eq("player_key_hash", empreinte)
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "checked_in"])
        .limit(CRENEAUX_PUBLICS_MAX);

      // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
      for (const brute of (miennes ?? []) as unknown as ReservationRow[]) {
        mesReservations[brute.slot_id] = {
          reservationId: brute.id,
          slotId: brute.slot_id,
          code: brute.code,
          status: asReservationStatus(brute.status),
          createdAt: brute.created_at,
          cancelledAt: brute.cancelled_at,
          checkedInAt: brute.checked_in_at,
          partySize: brute.party_size ?? 1,
        };
      }

      // MA FILE, PAR LA RPC ET NON PAR UNE LECTURE DE TABLE. `position` et
      // `offer_live` y sont calculés côté serveur, sous le même instantané :
      // les recomposer ici demanderait de relire toute la file de chaque
      // créneau pour compter les inscrits antérieurs, et de comparer une
      // échéance à l'horloge de ce processus. Un seul juge, et c'est le SQL.
      const { data: etatPublic } = await admin.rpc("reservation_public_state", {
        p_organization_id: organization.id,
        p_player_key_hash: empreinte,
      });
      const affichables = new Set(slotIds);
      for (const entree of mapReservationPublicState(etatPublic).waitlist) {
        if (affichables.has(entree.slotId)) maFile[entree.slotId] = entree;
      }
    }
  }

  // LA SESSION D'ATTENTE DU PROCHAIN CRÉNEAU — voir le champ `attente` du
  // contexte pour le pourquoi d'une SEULE. `slotIds` est ordonné par
  // `starts_at` croissant, donc le premier créneau où ce navigateur détient une
  // réservation `confirmed` est bien la prochaine attente.
  let attente: ReserverAttenteView | null = null;
  if (empreinte) {
    const prochaine = slotIds
      .map((slotId) => mesReservations[slotId])
      .find((reservation) => reservation?.status === "confirmed");
    if (prochaine) {
      attente = await ouvrirSessionAttente(organization.id, empreinte, {
        reservationId: prochaine.reservationId,
      });
    }
  }

  return {
    ok: true,
    activity: {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      // `null` DÉLIBÉRÉMENT : voir `ReserverActivityView`. Ces colonnes ne sont
      // même pas lues ici (`ACTIVITY_COLUMNS` ne les porte pas) — la
      // configuration d'animation n'a aucune raison d'atteindre le HTML d'un
      // visiteur qui n'attend rien.
      waitQuizId: null,
      waitPauseCampaignId: null,
      // LA PAGE IMMERSIVE, elle, descend : c'est ce que le visiteur vient lire.
      kind,
      promise: row.promise,
      durationMinutes: row.duration_minutes,
      steps: mapExperienceSteps(row.steps),
      preparation: row.preparation,
    },
    organization,
    timezone,
    slots: slotRows.map((slot) => {
      const remaining = Math.max(
        0,
        slot.capacity -
          (vivantesParCreneau.get(slot.id) ?? 0) -
          (tenuesParCreneau.get(slot.id) ?? 0),
      );
      return {
        id: slot.id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        capacity: slot.capacity,
        status: asSlotStatus(slot.status),
        remaining,
        pairesRestantes: pairesRestantes(remaining, kind),
        waitlistOfferMinutes: slot.waitlist_offer_minutes,
      } satisfies ReserverSlotPublicView;
    }),
    mesReservations,
    maFile,
    attente,
    aUneIdentite: Boolean(empreinte),
    /**
     * L'ADRESSE EST-ELLE EXIGÉE ? (RDV-4, décision produit du 2026-08-29)
     *
     * Un RENDEZ-VOUS nommé sans moyen de joindre le client est ingérable : ni
     * confirmation, ni prévenance si le commerçant doit annuler. Un MOMENT —
     * atelier, dégustation, file d'accueil — se prend au contraire très bien
     * sans rien laisser, et l'exiger n'y ferait que de la friction.
     *
     * La règle suit donc l'USAGE, pas le module : c'est `booking_mode` qui la
     * porte, et rien d'autre.
     */
    emailObligatoire: row.booking_mode === "rendez_vous",
    bookingMode: row.booking_mode === "rendez_vous" ? "rendez_vous" : "moment",
  };
}

// ────────────────────────────────────────────────────────────
// Contexte PUBLIC d'une invitation privée
// ────────────────────────────────────────────────────────────

export interface ReserverInvitationPublicView {
  /** L'identifiant, jamais le jeton : le clair ne redescend pas d'ici. */
  id: string;
  label: string;
  /** `true` si l'invitation vise UN créneau précis, imposé au visiteur. */
  creneauImpose: boolean;
}

export type ReserverInvitationContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      organization: ReserverOrganization;
      timezone: string;
      invitation: ReserverInvitationPublicView;
      activity: ReserverActivityView;
      /** Les créneaux que CETTE invitation ouvre, et eux seuls. */
      slots: ReserverSlotPublicView[];
      mesReservations: Record<string, ReserverMaReservationView>;
      aUneIdentite: boolean;
    };

/**
 * Contexte de la page `/reserver/invitation/[jeton]`.
 *
 * ── UNE SEULE RÉPONSE POUR TOUS LES REFUS ──
 *
 * Jeton malformé, inconnu, révoqué, fermé, expiré, épuisé ; activité coupée,
 * organisation sans droit `reserver` : `INDISPONIBLE`, mot pour mot. C'est la
 * même discipline que `redeem_invitation`, et elle ne vaut que si les DEUX
 * couches la tiennent — une page qui distinguerait « révoquée » d'« inconnue »
 * rendrait l'oracle que la RPC refuse de donner, sans même avoir à l'appeler.
 *
 * ── LE CRÉNEAU `closed` EST MONTRÉ, DÉLIBÉRÉMENT ──
 *
 * C'est le cas d'usage même de l'invitation : « j'ouvre cinq places à mes
 * habitués sur une séance fermée au public ». `draft` reste exclu — un créneau
 * en brouillon n'est pas configuré — exactement comme dans la RPC.
 */
export async function loadReserverInvitationContext(
  jetonClair: string,
): Promise<ReserverInvitationContext> {
  // PRESSION IP D'ABORD, ET SUR L'IP SEULE : un balayage de jetons inventés
  // n'atteint jamais une invitation résolue, donc un compteur posé après ne
  // verrait rien de ce trafic-là. Fail-open (ADR-032) — l'IP est partagée.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  // LE CLAIR S'ARRÊTE ICI. Rien d'autre, en dessous, ne le voit.
  const empreinteJeton = hashInvitationToken(jetonClair);
  if (!empreinteJeton) return { ok: false, error: INDISPONIBLE };

  const admin = createAdminClient();

  const { data: invitationData } = await admin
    .from("reservation_invitations")
    .select(INVITATION_COLUMNS)
    .eq("token_hash", empreinteJeton)
    .maybeSingle();
  if (!invitationData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  const invitation = invitationData as unknown as InvitationRow;

  // LES QUATRE INTERRUPTEURS, muets — ceux de `redeem_invitation`.
  if (etatUiInvitation(mapperInvitation(invitation)) !== "active") {
    return { ok: false, error: INDISPONIBLE };
  }

  const maintenant = new Date().toISOString();

  // La CIBLE : un créneau précis, ou tous ceux de l'activité visée.
  let slotRows: SlotRow[] = [];
  if (invitation.slot_id) {
    const { data } = await admin
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", invitation.organization_id)
      .eq("id", invitation.slot_id)
      .in("status", ["open", "closed"])
      .gt("starts_at", maintenant)
      .limit(1);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    slotRows = (data ?? []) as unknown as SlotRow[];
  } else if (invitation.activity_id) {
    const { data } = await admin
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", invitation.organization_id)
      .eq("activity_id", invitation.activity_id)
      .in("status", ["open", "closed"])
      .gt("starts_at", maintenant)
      .order("starts_at", { ascending: true })
      .limit(CRENEAUX_PUBLICS_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    slotRows = (data ?? []) as unknown as SlotRow[];
  }
  if (slotRows.length === 0) return { ok: false, error: INDISPONIBLE };

  // L'ACTIVITÉ vient du CRÉNEAU, pas de l'invitation : une invitation à un
  // créneau ne porte pas d'`activity_id`, et les deux doivent de toute façon
  // désigner la même (la RPC le revérifie sous verrou).
  const { data: activityData } = await admin
    .from("reservation_activities")
    .select(`${ACTIVITY_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", slotRows[0].activity_id)
    .eq("organization_id", invitation.organization_id)
    .maybeSingle();
  if (!activityData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const activity = activityData as unknown as ActivityRow;
  const organization = activity.organizations ?? null;
  if (!organization || organization.id !== activity.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!(await moduleOuvertAuJoueur("reserver", organization))) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!activity.active) return { ok: false, error: INDISPONIBLE };

  // Second compteur, par ACTIVITÉ, une fois la cible résolue — et par activité
  // et non par jeton : composer une clé de seau sur une valeur choisie par
  // l'appelant ouvrirait une série neuve à chaque jeton inventé (wagon 7).
  await observerPressionIp(
    ["reserver:page:activity:ip", activity.id],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { activity_id: activity.id },
  );

  const slotIds = slotRows.map((slot) => slot.id);
  // MÊME UNITÉ QUE LA PORTE PUBLIQUE : l'invité d'un Atelier Duo vient à deux
  // sans avoir à le dire, et la jauge de cette page doit donc compter comme
  // celle de l'autre. Les faire diverger aurait affiché deux nombres de places
  // différents pour le même créneau selon la page par où l'on arrive.
  const kind = asReserverActivityKind(activity.kind);
  const placesParOffre = placesParReservation(kind);
  const mesReservations: Record<string, ReserverMaReservationView> = {};

  const { data: vivantes } = await admin
    .from("reservations")
    .select("slot_id, status, party_size")
    .eq("organization_id", organization.id)
    .in("slot_id", slotIds)
    .in("status", ["confirmed", "checked_in"])
    .limit(RESERVATIONS_COMPTAGE_MAX);
  const vivantesParCreneau = compterPersonnesParCreneau(
    (vivantes ?? []) as Array<{ slot_id: string; party_size?: number | null }>,
  );

  const { data: tenues } = await admin
    .from("reservation_waitlist_entries")
    .select("slot_id, status, offer_expires_at")
    .eq("organization_id", organization.id)
    .in("slot_id", slotIds)
    .eq("status", "offered")
    .gt("offer_expires_at", maintenant)
    .limit(RESERVATIONS_COMPTAGE_MAX);
  const tenuesParCreneau = compterPlacesTenues(
    (tenues ?? []) as Array<{ slot_id: string }>,
    placesParOffre,
  );

  const empreinte = await lireIdentiteReserver();
  if (empreinte) {
    const { data: miennes } = await admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("organization_id", organization.id)
      .eq("player_key_hash", empreinte)
      .in("slot_id", slotIds)
      .in("status", ["confirmed", "checked_in"])
      .limit(CRENEAUX_PUBLICS_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    for (const brute of (miennes ?? []) as unknown as ReservationRow[]) {
      mesReservations[brute.slot_id] = {
        reservationId: brute.id,
        slotId: brute.slot_id,
        code: brute.code,
        status: asReservationStatus(brute.status),
        createdAt: brute.created_at,
        cancelledAt: brute.cancelled_at,
        checkedInAt: brute.checked_in_at,
        partySize: brute.party_size ?? 1,
      };
    }
  }

  return {
    ok: true,
    organizationId: organization.id,
    organization,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    invitation: {
      id: invitation.id,
      label: invitation.label,
      creneauImpose: Boolean(invitation.slot_id),
    },
    activity: {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      active: activity.active,
      // `null` sur le chemin public — voir `ReserverActivityView`.
      waitQuizId: null,
      waitPauseCampaignId: null,
      kind,
      promise: activity.promise,
      durationMinutes: activity.duration_minutes,
      steps: mapExperienceSteps(activity.steps),
      preparation: activity.preparation,
    },
    slots: slotRows.map((slot) => {
      const remaining = Math.max(
        0,
        slot.capacity -
          (vivantesParCreneau.get(slot.id) ?? 0) -
          (tenuesParCreneau.get(slot.id) ?? 0),
      );
      return {
        id: slot.id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        capacity: slot.capacity,
        status: asSlotStatus(slot.status),
        remaining,
        pairesRestantes: pairesRestantes(remaining, kind),
        waitlistOfferMinutes: slot.waitlist_offer_minutes,
      } satisfies ReserverSlotPublicView;
    }),
    mesReservations,
    aUneIdentite: Boolean(empreinte),
  };
}

// ────────────────────────────────────────────────────────────
// Contexte DASHBOARD
// ────────────────────────────────────────────────────────────

export interface ReserverSlotDashboardView extends ReserverSlotPublicView {
  activityId: string;
  /** Réservations du créneau — SANS email : la colonne n'est pas dans le grant. */
  reservations: ReserverDashboardReservationView[];
  /**
   * Réservations vivantes (confirmées + arrivées) — DES LIGNES : « trois
   * réservations », ce que le commerçant lit dans son agenda.
   */
  vivantes: number;
  /**
   * Les PERSONNES que ces lignes occupent (RES-5) — la somme de `party_size`,
   * et c'est elle que `reserve_slot` compare à la capacité. Sur un Atelier Duo,
   * trois réservations valent six personnes ; afficher `vivantes` en face de la
   * capacité y ferait croire à un atelier à moitié vide.
   */
  personnes: number;
  /** Arrivées enregistrées — le seul indicateur de présence du commerçant. */
  arrivees: number;
  /** La file, dans l'ordre — SANS email, SANS empreinte (voir WAITLIST_COLUMNS). */
  waitlist: ReserverWaitlistDashboardView[];
  /** Entrées VIVANTES (`waiting` + `offered`) : combien de gens attendent. */
  enAttente: number;
  /**
   * PLACES actuellement tenues par une offre — le second terme de la jauge.
   *
   * Des places, pas des offres (RES-5) : sur un Atelier Duo, une offre vivante
   * tient DEUX places, puisque sa conversion en prendra deux. C'est
   * `count(*) * v_seats` des cinq RPC, recopié.
   */
  offresTenues: number;
}

export interface ReserverDashboardReservationView {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  checkedInAt: string | null;
  /** Personnes attendues sous ce code — 2 sur un Atelier Duo (RES-5). */
  partySize: number;
  /**
   * La table attribuée par `reserve_table`, ou `null` — un Moment n’a pas de
   * salle. C’est elle qui range la réservation sur une ligne du plan ; sans
   * elle, l’écran la montre dans « Sans table attribuée » plutôt que de la
   * laisser disparaître.
   */
  tableId: string | null;
}

/**
 * Une entrée de file, vue du comptoir. Aucune donnée personnelle : ni adresse
 * (hors du grant), ni empreinte de l'appareil (dans le grant, mais c'est la clé
 * d'accès du joueur — voir `WAITLIST_COLUMNS`). Le commerçant a besoin de
 * savoir COMBIEN attendent et à quel rang, pas QUI.
 */
export interface ReserverWaitlistDashboardView {
  entryId: string;
  slotId: string;
  status: ReservationWaitlistStatus;
  /**
   * Rang parmi les entrées VIVANTES du créneau, 1 = tête.
   *
   * Recomposé ici par le MÊME ordre que le SQL — `(created_at, id)` croissant,
   * la paire départageant deux inscriptions de la même milliseconde — et non
   * lu d'une colonne : il n'en existe pas, délibérément (une colonne de rang
   * devrait être renumérotée à chaque départ, chaque conversion et chaque
   * expiration). `0` sur une entrée terminée : elle n'occupe plus de rang.
   */
  position: number;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  /** Tranché SERVEUR, comme dans la RPC : une échéance passée ne tient rien. */
  offerLive: boolean;
  createdAt: string;
  /**
   * COMBIEN ILS SONT (RDV-9).
   *
   * La colonne existe depuis RDV-6 et n'était lisible que depuis RDV-8 : son
   * droit de lecture manquait, exactement comme celui de
   * `reservations.table_id`. Deux fois le même défaut, sur le même lot.
   *
   * Elle vaut 1 partout sur les MOMENTS, où l'inscription est nominative et où
   * la file compte des personnes. Elle ne dit quelque chose que dans une
   * SALLE — et là, elle décide : une tablée de six qui attend ne se sert pas
   * en libérant une table de deux, et le commerçant qui ne la voit pas ne peut
   * pas décider de rapprocher deux tables.
   */
  partySize: number;
}

export interface ReserverInvitationDashboardView {
  id: string;
  label: string;
  /** L'une des deux est posée, jamais les deux (contrainte SQL). */
  activityId: string | null;
  slotId: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  closedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  etat: EtatUiInvitation;
}

export interface ReserverActivityDashboardView extends ReserverActivityView {
  createdAt: string;
  /**
   * D'OÙ VIENNENT SES CRÉNEAUX — `moment` (posés à la main) ou
   * `rendez_vous` (engendrés par des horaires). C'est ce champ, et rien
   * d'autre, qui range l'activité dans l'une des deux sections du
   * dashboard : les deux produits partagent la même table.
   */
  bookingMode: string;
  slots: ReserverSlotDashboardView[];
  /**
   * Les invitations de cette activité, celles de ses créneaux comprises.
   *
   * LE JETON N'Y EST PAS, et ne peut pas y être : la base n'en garde que
   * l'empreinte, hors du grant de lecture. Un lien perdu se révoque et se
   * recrée — c'est le contrat d'une clé d'API, écrit dans la migration.
   */
  invitations: ReserverInvitationDashboardView[];
}

/** Lecture d'une ligne d'invitation, SANS son état — que le mapper d'UI tranche. */
function mapperInvitation(
  row: InvitationRow,
): Omit<ReserverInvitationDashboardView, "etat"> {
  return {
    id: row.id,
    label: row.label,
    activityId: row.activity_id,
    slotId: row.slot_id,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export type ReserverDashboardContext =
  | { ok: false; reason: "unauthenticated" | "no_access" }
  | {
      ok: true;
      organizationId: string;
      timezone: string;
      activities: ReserverActivityDashboardView[];
      /**
       * Les cibles d'ANIMATION D'ATTENTE (RES-4) de ce commerce — quiz d'un
       * côté, campagnes de l'autre.
       *
       * ── POURQUOI SUR CE CONTEXTE, ET POURQUOI TOUTES ──
       *
       * Le commerçant règle son animation depuis l'écran de l'activité ET
       * depuis celui de la file : les deux panneaux lisent la même paire de
       * listes, résolues SERVEUR. Aucun identifiant de quiz ou de campagne ne
       * se saisit à la main — ce qui n'est pas dans ces listes n'appartient pas
       * à ce commerce, et la FK composite le refuserait de toute façon.
       *
       * Elles ne sont PAS filtrées sur `status = 'active'`, délibérément. La
       * RPC, elle, ne propose au joueur qu'une animation `active` — mais si le
       * sélecteur cachait les autres, corriger le nom d'une file effacerait en
       * silence l'animation d'un quiz momentanément en pause. Un réglage ne
       * disparaît pas parce qu'on a édité le champ d'à côté.
       */
      waitQuiz: ReserverAttenteOption[];
      waitCampaigns: ReserverAttenteOption[];
    };

/** Plafond de lecture du panneau : 200 créneaux, 5 000 réservations. */
const CRENEAUX_DASHBOARD_MAX = 200;
const RESERVATIONS_DASHBOARD_MAX = 5_000;
/** Même ordre de grandeur pour la file et pour les invitations d'un commerce. */
const WAITLIST_DASHBOARD_MAX = 5_000;
const INVITATIONS_DASHBOARD_MAX = 500;

/**
 * Agenda du commerçant : ses activités, leurs créneaux et les réservations de
 * chaque créneau.
 *
 * Lecture par le client RLS de la SESSION (jamais le service_role) : la policy
 * `reservations: members read` sert tous les membres, caissier compris — c'est
 * son écran de comptoir. Le filtre `organization_id` explicite double la RLS
 * plutôt que de s'y fier : deux gardes valent mieux qu'une sur un panneau qui
 * liste des personnes.
 */
export async function loadReserverDashboardContext(): Promise<ReserverDashboardContext> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, reason: "unauthenticated" };
  if (!droitEffectifModule("reserver", organization)) {
    return { ok: false, reason: "no_access" };
  }

  const supabase = await createClient();

  const { data: activityData } = await supabase
    .from("reservation_activities")
    .select(ACTIVITY_DASHBOARD_COLUMNS)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const activityRows = (activityData ?? []) as unknown as ActivityRow[];
  const activityIds = activityRows.map((activity) => activity.id);

  let slotRows: SlotRow[] = [];
  let reservationRows: ReservationRow[] = [];
  let waitlistRows: WaitlistRow[] = [];
  let invitationRows: InvitationRow[] = [];

  if (activityIds.length > 0) {
    const { data: slotData } = await supabase
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", organization.id)
      .in("activity_id", activityIds)
      .order("starts_at", { ascending: true })
      .limit(CRENEAUX_DASHBOARD_MAX);
    // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
    slotRows = (slotData ?? []) as unknown as SlotRow[];
  }

  if (slotRows.length > 0) {
    const { data: reservationData } = await supabase
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("organization_id", organization.id)
      .in(
        "slot_id",
        slotRows.map((slot) => slot.id),
      )
      .order("created_at", { ascending: true })
      .limit(RESERVATIONS_DASHBOARD_MAX);
    // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
    reservationRows = (reservationData ?? []) as unknown as ReservationRow[];

    // L'ORDRE DE LECTURE EST L'ORDRE DU RANG : `created_at` puis `id`, la même
    // paire que le SQL compare. Trier autrement ici — ou s'en remettre à
    // l'ordre de PostgREST — donnerait au commerçant une file dont la tête ne
    // serait pas celle à qui la place partira.
    const { data: waitlistData } = await supabase
      .from("reservation_waitlist_entries")
      .select(WAITLIST_COLUMNS)
      .eq("organization_id", organization.id)
      .in(
        "slot_id",
        slotRows.map((slot) => slot.id),
      )
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(WAITLIST_DASHBOARD_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    waitlistRows = (waitlistData ?? []) as unknown as WaitlistRow[];
  }

  // Les invitations sont org-scopées, pas créneau-scopées : une invitation à
  // l'échelle d'une activité n'a pas de créneau, et la filtrer par `slot_id`
  // l'aurait fait disparaître de l'écran qui sert à la révoquer.
  const { data: invitationData } = await supabase
    .from("reservation_invitations")
    .select(INVITATION_COLUMNS)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(INVITATIONS_DASHBOARD_MAX);
  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  invitationRows = (invitationData ?? []) as unknown as InvitationRow[];

  const parCreneau = new Map<string, ReservationRow[]>();
  for (const reservation of reservationRows) {
    const liste = parCreneau.get(reservation.slot_id);
    if (liste) liste.push(reservation);
    else parCreneau.set(reservation.slot_id, [reservation]);
  }

  const fileParCreneau = new Map<string, WaitlistRow[]>();
  for (const entree of waitlistRows) {
    const liste = fileParCreneau.get(entree.slot_id);
    if (liste) liste.push(entree);
    else fileParCreneau.set(entree.slot_id, [entree]);
  }

  const maintenant = Date.now();

  // LE FORMAT DE CHAQUE ACTIVITÉ, résolu une fois : c'est lui qui donne l'unité
  // de réservation de ses créneaux. Un créneau dont l'activité n'a pas été lue
  // retombe sur `standard`, c'est-à-dire sur l'arithmétique d'hier.
  const formatParActivite = new Map<string, ReserverActivityKind>(
    activityRows.map((activity) => [
      activity.id,
      asReserverActivityKind(activity.kind),
    ]),
  );

  const creneauxParActivite = new Map<string, ReserverSlotDashboardView[]>();
  for (const slot of slotRows) {
    const kind = formatParActivite.get(slot.activity_id) ?? "standard";
    const placesParOffre = placesParReservation(kind);
    const brutes = parCreneau.get(slot.id) ?? [];
    const reservations = brutes.map((brute) => ({
      reservationId: brute.id,
      code: brute.code,
      status: asReservationStatus(brute.status),
      createdAt: brute.created_at,
      cancelledAt: brute.cancelled_at,
      checkedInAt: brute.checked_in_at,
      partySize: brute.party_size ?? 1,
      tableId: brute.table_id ?? null,
    }));
    const lignesVivantes = reservations.filter(
      (reservation) =>
        reservation.status === "confirmed" || reservation.status === "checked_in",
    );
    const vivantes = lignesVivantes.length;
    // LA JAUGE COMPTE DES PERSONNES, PAS DES LIGNES (RES-5) — même somme que
    // `reserve_slot`. Le repli à 1 est celui de `compterPersonnesParCreneau` :
    // une réservation occupe au moins une place.
    const personnes = lignesVivantes.reduce(
      (total, reservation) => total + Math.max(1, reservation.partySize),
      0,
    );

    // Le rang ne se compte QUE sur les vivantes, et dans l'ordre déjà demandé à
    // la base : une entrée convertie, expirée ou partie n'occupe plus la file.
    let rang = 0;
    const waitlist = (fileParCreneau.get(slot.id) ?? []).map((entree) => {
      const status = asWaitlistStatus(entree.status);
      const vivante = status === "waiting" || status === "offered";
      if (vivante) rang += 1;
      const echeance = entree.offer_expires_at
        ? new Date(entree.offer_expires_at).getTime()
        : null;
      return {
        entryId: entree.id,
        slotId: entree.slot_id,
        status,
        position: vivante ? rang : 0,
        offeredAt: entree.offered_at,
        offerExpiresAt: entree.offer_expires_at,
        offerLive:
          status === "offered" &&
          echeance !== null &&
          Number.isFinite(echeance) &&
          echeance > maintenant,
        createdAt: entree.created_at,
        // Défaut à 1 et non 0 : une entrée de liste vaut au moins une
        // personne, et la colonne est nullable dans le type généré alors que
        // la base la déclare .
        partySize:
          typeof entree.party_size === "number" && entree.party_size > 0
            ? entree.party_size
            : 1,
      } satisfies ReserverWaitlistDashboardView;
    });

    const offresTenues =
      waitlist.filter((entree) => entree.offerLive).length * placesParOffre;

    // MÊME JAUGE QUE LE SQL, ses deux termes compris : une place promise à
    // quelqu'un de la file n'est pas une place libre, et l'afficher comme telle
    // ferait ouvrir au commerçant une porte que `reserve_slot` referme.
    const remaining = Math.max(0, slot.capacity - personnes - offresTenues);

    const vue: ReserverSlotDashboardView = {
      id: slot.id,
      activityId: slot.activity_id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity: slot.capacity,
      status: asSlotStatus(slot.status),
      remaining,
      pairesRestantes: pairesRestantes(remaining, kind),
      waitlistOfferMinutes: slot.waitlist_offer_minutes,
      reservations,
      vivantes,
      personnes,
      arrivees: reservations.filter(
        (reservation) => reservation.status === "checked_in",
      ).length,
      waitlist,
      enAttente: waitlist.filter(
        (entree) => entree.status === "waiting" || entree.status === "offered",
      ).length,
      offresTenues,
    };

    const liste = creneauxParActivite.get(slot.activity_id);
    if (liste) liste.push(vue);
    else creneauxParActivite.set(slot.activity_id, [vue]);
  }

  // Une invitation appartient à l'activité qu'elle vise — directement, ou par
  // le créneau qu'elle vise. Le second cas est le plus courant (« samedi 14 h »)
  // et l'oublier aurait laissé ces invitations sans écran.
  const activiteDuCreneau = new Map(
    slotRows.map((slot) => [slot.id, slot.activity_id]),
  );
  const invitationsParActivite = new Map<
    string,
    ReserverInvitationDashboardView[]
  >();
  const now = new Date(maintenant);
  for (const row of invitationRows) {
    const activityId =
      row.activity_id ??
      (row.slot_id ? (activiteDuCreneau.get(row.slot_id) ?? null) : null);
    // Invitation dont le créneau n'est pas dans la fenêtre lue : elle existe,
    // mais aucun écran d'activité ne la porte. On la tait plutôt que de
    // l'attribuer à une activité au hasard.
    if (!activityId) continue;
    const base = mapperInvitation(row);
    const vue: ReserverInvitationDashboardView = {
      ...base,
      etat: etatUiInvitation(base, now),
    };
    const liste = invitationsParActivite.get(activityId);
    if (liste) liste.push(vue);
    else invitationsParActivite.set(activityId, [vue]);
  }

  return {
    ok: true,
    organizationId: organization.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    activities: activityRows.map((activity) => ({
      id: activity.id,
      name: activity.name,
      description: activity.description,
      active: activity.active,
      waitQuizId: activity.wait_quiz_id ?? null,
      waitPauseCampaignId: activity.wait_pause_campaign_id ?? null,
      kind: asReserverActivityKind(activity.kind),
      promise: activity.promise,
      durationMinutes: activity.duration_minutes,
      steps: mapExperienceSteps(activity.steps),
      preparation: activity.preparation,
      createdAt: activity.created_at,
      bookingMode: activity.booking_mode ?? "moment",
      slots: creneauxParActivite.get(activity.id) ?? [],
      invitations: invitationsParActivite.get(activity.id) ?? [],
    })),
    ...(await lireCiblesAttente(supabase, organization.id)),
  };
}

/**
 * Les deux listes de cibles d'animation d'attente d'un commerce.
 *
 * Lecture par le client RLS de la SESSION, comme tout le reste de ce chargeur,
 * et doublée d'un filtre `organization_id` explicite : deux gardes valent mieux
 * qu'une sur une liste qui va peupler un sélecteur.
 */
async function lireCiblesAttente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<{
  waitQuiz: ReserverAttenteOption[];
  waitCampaigns: ReserverAttenteOption[];
}> {
  const [quiz, campagnes] = await Promise.all([
    supabase
      .from("quizzes")
      .select(ATTENTE_OPTION_COLUMNS)
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .limit(ATTENTE_OPTIONS_MAX),
    supabase
      .from("campaigns")
      .select(ATTENTE_OPTION_COLUMNS)
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .limit(ATTENTE_OPTIONS_MAX),
  ]);

  const lister = (data: unknown): ReserverAttenteOption[] =>
    ((data ?? []) as Array<{ id?: unknown; name?: unknown }>).flatMap((ligne) =>
      typeof ligne.id === "string" && typeof ligne.name === "string"
        ? [{ id: ligne.id, name: ligne.name }]
        : [],
    );

  return {
    waitQuiz: lister(quiz.data),
    waitCampaigns: lister(campagnes.data),
  };
}

// ════════════════════════════════════════════════════════════
// La file sereine (RES-3, lot L6) — contexte public et contextes commerçant
//
// ── CE QUE CETTE COUCHE DOIT TENIR, ET QUE LE SQL NE TIENT PAS ──
//
// `queue_staff_state` ne vérifie AUCUNE appartenance : elle est en lecture,
// `service_role` seulement, et bornée à l'organisation qu'on lui passe. Son
// commentaire SQL l'écrit noir sur blanc — l'identifiant DOIT venir de la
// session marchande résolue côté serveur (`getUserAndOrg`), JAMAIS d'un
// paramètre de requête. Les deux chargeurs commerçants ci-dessous sont les
// SEULS appelants, et aucun ne prend d'organisation en argument : c'est
// l'invariant, et il se lit sur leur signature.
//
// `queue_public_state`, à l'inverse, autorise PAR POSSESSION (identifiant de
// file + empreinte du cookie) et ne vérifie ni le droit `reserver` ni le statut
// de la file : lire son propre rang n'est pas un acte commercial. Le chargeur
// public, lui, VÉRIFIE le droit `reserver` — parce qu'il décide d'AFFICHER une
// file, ce qui est une capacité de l'offre Vitrine, là où la RPC ne fait que
// répondre à quelqu'un qui attend déjà.
// ════════════════════════════════════════════════════════════

/**
 * Plafond de la lecture de comptage d'une file.
 *
 * Il n'est pas arbitraire : le CHECK SQL borne `max_live_entries` à 200, donc
 * une file ne peut pas avoir admis plus de 200 entrées vivantes, quel que soit
 * l'historique de son plafond.
 */
const FILE_COMPTAGE_MAX = QUEUE_MAX_LIVE_ENTRIES_MAX;

/** Plafonds du panneau commerçant : 50 files, leurs entrées vivantes. */
const FILES_DASHBOARD_MAX = 50;
const FILE_ENTREES_DASHBOARD_MAX = FILES_DASHBOARD_MAX * FILE_COMPTAGE_MAX;

/** Ce que le joueur voit de SA place. */
export interface ReserverQueuePlaceView {
  entryId: string;
  status: ReservationQueueEntryStatus;
  /** `null` dès qu'elle n'attend plus — notamment quand elle est appelée. */
  position: number | null;
  joinedAt: string | null;
  calledAt: string | null;
  etat: EtatUiPlaceFile;
}

/**
 * Ce que le joueur voit de LA FILE. Ni plafond, ni liste, ni prénom : le
 * document public ne porte que son entrée à lui et des NOMBRES — rendre la
 * liste, même réduite à des prénoms, ferait de la page d'attente un annuaire de
 * qui est dans le magasin.
 */
export interface ReserverQueuePublicView {
  id: string;
  name: string;
  status: ReservationQueueStatus;
  /** `null` sur une file « Comptoir », qui n'a aucune activité — cas dominant. */
  activityName: string | null;
}

export type ReserverQueuePublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organization: ReserverOrganization;
      /** Fuseau de l'établissement — jamais celui de l'hôte ni du navigateur. */
      timezone: string;
      queue: ReserverQueuePublicView;
      /**
       * La file accepte-t-elle une NOUVELLE arrivée ? `paused` et `closed` la
       * refusent tous deux, l'activité liée coupée aussi. Indicatif : la RPC
       * reste seule juge, sous verrou.
       */
      accepteEntree: boolean;
      /** Combien de personnes ATTENDENT — les appelées n'en sont pas. */
      waitingCount: number;
      /** La place de CE navigateur, ou `null` s'il n'est pas dans la file. */
      maPlace: ReserverQueuePlaceView | null;
      /**
       * La session d'ATTENTE ACTIVE (RES-4) de cette place, ou `null`.
       *
       * Elle ne porte NI rang, NI compteur, NI délai — le critère dur du cahier
       * est que le jeu ne puisse ni lire ni modifier la file, et `maPlace`
       * au-dessus reste le seul chemin vers ces nombres.
       */
      attente: ReserverAttenteView | null;
      aUneIdentite: boolean;
    };

/**
 * Combien de personnes attendent dans cette file.
 *
 * MÊME PRÉDICAT que `queue_public_state` (`status = 'waiting'` sur cette file),
 * et cette lecture n'existe que pour le visiteur qui n'a PAS encore d'identité :
 * la RPC exige une empreinte de cookie, et lui en fabriquer une pour lire un
 * nombre écrirait une identité à quelqu'un qui n'a rien demandé. Dès qu'une
 * identité existe, c'est la RPC qui fait foi — un seul juge.
 */
/**
 * L'organisation qui PORTE cette file a-t-elle encore le droit `reserver` ?
 *
 * ── CE QU'ELLE FERME, ET POURQUOI ELLE N'EST PAS DANS `lireEtatFilePublic` ──
 *
 * Le scrutin public (`getQueuePublicState`) répondait `not_in_queue` — avec le
 * nom de la file, son statut et le nombre de personnes qui attendent — à
 * n'importe qui, y compris quand l'abonnement Vitrine du commerce a expiré. La
 * PAGE, elle, rend « indisponible » dans ce cas (`loadReserverQueuePublicContext`
 * ci-dessous). Deux réponses opposées sur le même fait : le scrutin devenait
 * l'oracle que la page refusait d'être, sur l'état commercial d'un tiers.
 *
 * La garde vit ICI plutôt que dans `lireEtatFilePublic` parce que la page a
 * DÉJÀ lu l'organisation et tranché son droit avant d'appeler cette lecture :
 * l'y enfouir aurait fait payer une seconde résolution à chaque rendu de page,
 * pour reposer une question déjà répondue. C'est l'appelant public — l'action
 * de scrutin — qui l'oppose, et seulement sur la branche qui en a besoin.
 *
 * ── ET ELLE NE FERME PAS `in_queue` ──
 *
 * Quelqu'un qui attend PHYSIQUEMENT doit voir son appel : lui refuser son rang
 * parce qu'un abonnement a expiré ferait tomber la sanction sur lui. C'est le
 * motif exact de `queueCallNext` au comptoir — honorer l'existant.
 *
 * Introuvable, jointure inter-locataire, droit fermé : `false` dans les trois
 * cas, et l'appelant en fait un seul état muet.
 */
export async function droitReserverOuvertPourFile(
  queueId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reservation_queues")
    .select(`${QUEUE_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", queueId)
    .maybeSingle();
  if (!data) return false;

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = data as unknown as QueueRow;
  const organization = row.organizations ?? null;
  // Garde inter-tenant : la jointure ne doit jamais rapporter une organisation
  // qui n'est pas celle de la ligne (motif `loadReserverQueuePublicContext`).
  if (!organization || organization.id !== row.organization_id) return false;
  return moduleOuvertAuJoueur("reserver", organization);
}

async function compterEnAttente(
  admin: ReturnType<typeof createAdminClient>,
  queueId: string,
): Promise<number> {
  const { data } = await admin
    .from("reservation_queue_entries")
    .select(QUEUE_ENTRY_COUNT_COLUMNS)
    .eq("queue_id", queueId)
    .eq("status", "waiting")
    .limit(FILE_COMPTAGE_MAX);
  return (data ?? []).length;
}

/**
 * L'ÉTAT PUBLIC D'UNE FILE POUR CE NAVIGATEUR — la seule lecture, partagée par
 * le rendu de la page et par son scrutin.
 *
 * ── POURQUOI ELLE EST ÉCRITE UNE FOIS ──
 *
 * La page rend un premier état, puis le composant relit toutes les quelques
 * secondes. Deux lectures écrites séparément auraient divergé au premier champ
 * ajouté — et le symptôme aurait été le pire possible : un rang venu d'une
 * source et une taille de file venue de l'autre, sur le même écran.
 *
 * ── LE VISITEUR SANS IDENTITÉ ──
 *
 * `queue_public_state` EXIGE une empreinte de cookie, et lui en fabriquer une
 * pour lire un nombre écrirait une identité à quelqu'un qui n'a rien demandé —
 * ce que le rendu d'une page serveur n'a de toute façon pas le droit de faire.
 * Ce chemin-là lit donc la file et compte les `waiting` : MÊME PRÉDICAT que la
 * RPC, et il ne rend jamais d'entrée — il n'y en a pas.
 */
export async function lireEtatFilePublic(
  queueId: string,
  empreinte: string | null,
): Promise<QueuePublicStateResult> {
  const admin = createAdminClient();

  if (empreinte) {
    const { data } = await admin.rpc("queue_public_state", {
      p_queue_id: queueId,
      p_player_key_hash: empreinte,
    });
    // Rendu TEL QUEL, `unavailable` compris : on ne se rabat PAS sur la lecture
    // de table dans ce cas — elle ne trouverait rien non plus, et l'aller-retour
    // serait payé à chaque tic de scrutin d'un identifiant inventé.
    return mapQueuePublicState(data);
  }

  const { data: queueData } = await admin
    .from("reservation_queues")
    .select(QUEUE_COLUMNS)
    .eq("id", queueId)
    .maybeSingle();
  if (!queueData) return mapQueuePublicState({ state: "unavailable" });

  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  const queue = queueData as unknown as QueueRow;
  return mapQueuePublicState({
    state: "not_in_queue",
    queue_name: queue.name,
    queue_status: queue.status,
    waiting_count: await compterEnAttente(admin, queue.id),
  });
}

/**
 * Contexte de la page publique d'une file d'accueil.
 *
 * ── LE DROIT `reserver` EST VÉRIFIÉ ICI, ET LA RPC NE LE VÉRIFIE PAS ──
 *
 * Ce n'est pas une divergence, c'est la répartition. `queue_public_state` répond
 * à quelqu'un qui attend DÉJÀ, et lui refuser son rang parce qu'un abonnement a
 * expiré ferait tomber la sanction sur lui. Cette page, elle, MONTRE la file et
 * porte le bouton qui la rejoint — deux gestes de l'offre Vitrine. Une
 * organisation sans le droit rend donc le MÊME contexte « indisponible » qu'une
 * file inexistante : aucun oracle sur l'état commercial d'un tiers.
 *
 * `queue_join` revérifie ce droit EN SQL, et c'est là qu'est la vraie défense —
 * une server action reste POSTable en direct.
 */
export async function loadReserverQueuePublicContext(
  queueId: string,
): Promise<ReserverQueuePublicContext> {
  // PRESSION IP D'ABORD, SUR L'IP SEULE, ET SANS JAMAIS REFUSER — motif
  // `loadReserverPublicContext` : l'identifiant vient de l'URL, donc du client,
  // et un balayage d'UUID inventés n'atteint jamais une file résolue. Posé
  // après la lecture, ce compteur n'en verrait rien. Fail-open par
  // construction (ADR-032) : l'IP est partagée derrière le Wi-Fi d'un commerce.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  const admin = createAdminClient();

  const { data: queueData } = await admin
    .from("reservation_queues")
    .select(`${QUEUE_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", queueId)
    .maybeSingle();
  if (!queueData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = queueData as unknown as QueueRow;
  const organization = row.organizations ?? null;
  // Garde inter-tenant : la jointure ne doit jamais rapporter une organisation
  // qui n'est pas celle de la ligne (motif loadReserverPublicContext).
  if (!organization || organization.id !== row.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!(await moduleOuvertAuJoueur("reserver", organization))) {
    return { ok: false, error: INDISPONIBLE };
  }

  // Second compteur, par FILE, une fois la cible résolue — et par file, jamais
  // par une valeur libre : composer une clé de seau sur ce que l'appelant
  // choisit ouvrirait une série neuve à chaque identifiant inventé (wagon 7).
  await observerPressionIp(
    ["reserver:page:queue:ip", row.id],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { queue_id: row.id },
  );

  // L'ACTIVITÉ LIÉE EST OPTIONNELLE : une file « Comptoir » n'en a aucune, et
  // c'est le cas dominant — d'où le `true` quand la colonne est nulle, exactement
  // comme le `coalesce(v_activity_active, true)` de `queue_join`. Quand elle est
  // posée, le repli est FERMÉ : une activité qu'on n'arrive pas à relire ne fait
  // pas ouvrir la file (la FK composite garantit qu'elle existe).
  let activityName: string | null = null;
  let activiteActive = true;
  if (row.activity_id) {
    const { data: activityData } = await admin
      .from("reservation_activities")
      .select("id, name, active")
      .eq("id", row.activity_id)
      .eq("organization_id", row.organization_id)
      .maybeSingle();
    const activity = activityData as { name: string; active: boolean } | null;
    activityName = activity?.name ?? null;
    activiteActive = activity?.active ?? false;
  }

  // LA MÊME LECTURE QUE LE SCRUTIN — voir `lireEtatFilePublic`. Le rang y est
  // compté par la RPC, à la lecture, sous le même instantané que le nombre de
  // personnes en attente : le recomposer ici demanderait de relire toute la
  // file pour compter les inscrits antérieurs, et donnerait un second juge.
  const empreinte = await lireIdentiteReserver();
  const etat = await lireEtatFilePublic(row.id, empreinte);
  const maPlace: ReserverQueuePlaceView | null =
    etat.state === "in_queue" && etat.entryId && etat.entryStatus
      ? {
          entryId: etat.entryId,
          status: etat.entryStatus,
          position: etat.position,
          joinedAt: etat.joinedAt,
          calledAt: etat.calledAt,
          etat: etatUiPlaceFile({ status: etat.entryStatus }),
        }
      : null;

  const status = asQueueStatus(row.status);

  // LA SESSION D'ATTENTE, et seulement pour quelqu'un qui a une place. Un
  // visiteur qui regarde la file avant d'y entrer n'attend rien : lui ouvrir une
  // session écrirait une ligne pour un écran qui n'a pas d'animation à montrer.
  // La vivacité de l'entrée est tranchée par la RPC, pas ici.
  const attente =
    empreinte && maPlace
      ? await ouvrirSessionAttente(organization.id, empreinte, {
          queueEntryId: maPlace.entryId,
        })
      : null;

  return {
    ok: true,
    organization,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    queue: {
      id: row.id,
      name: row.name,
      status,
      activityName,
    },
    accepteEntree: status === "open" && activiteActive,
    waitingCount: etat.waitingCount,
    maPlace,
    attente,
    aUneIdentite: Boolean(empreinte),
  };
}

/** Une file, vue de la liste du commerçant. */
export interface ReserverQueueDashboardView {
  id: string;
  name: string;
  status: ReservationQueueStatus;
  maxLiveEntries: number;
  activityId: string | null;
  activityName: string | null;
  /**
   * ANIMATIONS D'ATTENTE (RES-4) réglées sur CETTE file. `null` = aucune, et
   * c'est le défaut : le Mode Attente active est facultatif.
   */
  waitQuizId: string | null;
  waitPauseCampaignId: string | null;
  createdAt: string;
  /** Entrées `waiting` — celles qui attendent encore. */
  enAttente: number;
  /** Entrées `called` — celles qui sont au comptoir. */
  appeles: number;
}

export type ReserverQueuesDashboardContext =
  | { ok: false; reason: "unauthenticated" | "no_access" }
  | {
      ok: true;
      organizationId: string;
      timezone: string;
      queues: ReserverQueueDashboardView[];
    };

/**
 * Les files de l'organisation, avec leurs compteurs vivants.
 *
 * Lecture par le client RLS de la SESSION (jamais le service_role) : la policy
 * `reservation_queue_entries: members read` sert tous les membres, caissier
 * compris — l'écran d'accueil est littéralement son poste. Le filtre
 * `organization_id` explicite double la RLS plutôt que de s'y fier seule.
 *
 * AUCUN APPEL À `queue_staff_state` ICI, et c'est délibéré : une RPC par file
 * ferait N allers-retours pour une liste. Les deux compteurs vivants se
 * déduisent d'UNE lecture groupée ; l'écran détaillé d'une file, lui, passe par
 * l'action de scrutin `getQueueStaffState` (`src/actions/reserver.ts`), qui
 * appelle `queue_staff_state` — il n'existe aucun chargeur `…StaffContext` ici,
 * et ce commentaire en nommait un depuis le premier jour du lot.
 */
export async function loadReserverQueuesDashboardContext(): Promise<ReserverQueuesDashboardContext> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, reason: "unauthenticated" };
  if (!droitEffectifModule("reserver", organization)) {
    return { ok: false, reason: "no_access" };
  }

  const supabase = await createClient();

  const { data: queueData } = await supabase
    .from("reservation_queues")
    .select(QUEUE_DASHBOARD_COLUMNS)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(FILES_DASHBOARD_MAX);

  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  const queueRows = (queueData ?? []) as unknown as QueueRow[];

  const nomParActivite = new Map<string, string>();
  const activityIds = [
    ...new Set(
      queueRows.flatMap((queue) =>
        queue.activity_id ? [queue.activity_id] : [],
      ),
    ),
  ];
  if (activityIds.length > 0) {
    const { data: activityData } = await supabase
      .from("reservation_activities")
      .select("id, name")
      .eq("organization_id", organization.id)
      .in("id", activityIds)
      .limit(FILES_DASHBOARD_MAX);
    for (const activity of (activityData ?? []) as Array<{
      id: string;
      name: string;
    }>) {
      nomParActivite.set(activity.id, activity.name);
    }
  }

  const enAttenteParFile = new Map<string, number>();
  const appelesParFile = new Map<string, number>();
  if (queueRows.length > 0) {
    // LES DEUX ÉTATS VIVANTS, le MÊME ensemble que compte le plafond de
    // `queue_join` : une personne appelée occupe toujours une ligne de la file
    // et une place au comptoir.
    const { data: entryData } = await supabase
      .from("reservation_queue_entries")
      .select(QUEUE_ENTRY_COUNT_COLUMNS)
      .eq("organization_id", organization.id)
      .in(
        "queue_id",
        queueRows.map((queue) => queue.id),
      )
      .in("status", ["waiting", "called"])
      .limit(FILE_ENTREES_DASHBOARD_MAX);

    for (const entree of (entryData ?? []) as Array<{
      queue_id: string;
      status: string;
    }>) {
      const cible =
        entree.status === "called" ? appelesParFile : enAttenteParFile;
      cible.set(entree.queue_id, (cible.get(entree.queue_id) ?? 0) + 1);
    }
  }

  return {
    ok: true,
    organizationId: organization.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    queues: queueRows.map((queue) => ({
      id: queue.id,
      name: queue.name,
      status: asQueueStatus(queue.status),
      maxLiveEntries: queue.max_live_entries ?? QUEUE_MAX_LIVE_ENTRIES_DEFAUT,
      activityId: queue.activity_id,
      activityName: queue.activity_id
        ? (nomParActivite.get(queue.activity_id) ?? null)
        : null,
      waitQuizId: queue.wait_quiz_id ?? null,
      waitPauseCampaignId: queue.wait_pause_campaign_id ?? null,
      createdAt: queue.created_at,
      enAttente: enAttenteParFile.get(queue.id) ?? 0,
      appeles: appelesParFile.get(queue.id) ?? 0,
    })),
  };
}

// ════════════════════════════════════════════════════════════
// Réservation de stock réel et Drop (RES-5, lot L9)
// migration 20261010120000
//
// ── TOUT PASSE PAR LES RPC, ET C'EST UNE OBLIGATION, PAS UN STYLE ──
//
// `reservation_stock_offers` n'a AUCUNE policy `anon` et `reservation_stock_holds`
// aucune policy d'écriture : le joueur ne lit ces lignes QUE par une RPC
// service_role, et le restant ne se compte QUE sous verrou d'avis. Un chargeur
// qui lirait les tables pour recomposer un restant aurait fabriqué le SECOND
// JUGE que tout le module refuse — et il l'aurait fait hors verrou, donc faux.
// ════════════════════════════════════════════════════════════

/**
 * L'ÉTAT PUBLIC D'UNE OFFRE POUR CE NAVIGATEUR — la seule lecture, partagée par
 * le rendu de la page et par son scrutin.
 *
 * Motif EXACT de `lireEtatFilePublic`, et pour la même raison : la page rend un
 * premier état, puis l'écran relit après chaque geste. Deux lectures écrites
 * séparément auraient divergé au premier champ ajouté, et le symptôme aurait été
 * le pire possible — un restant venu d'une source et une prise venue de l'autre,
 * sur le même écran.
 *
 * ── LE VISITEUR SANS IDENTITÉ EST SERVI, ET SANS COOKIE ──
 *
 * `stock_offer_public_state` accepte une empreinte FACULTATIVE : un visiteur qui
 * n'a jamais rien réservé doit pouvoir lire le restant. Lui poser un cookie pour
 * pouvoir le compter écrirait une identité à quelqu'un qui n'a rien demandé — ce
 * qu'un rendu de page serveur n'a de toute façon pas le droit de faire.
 */
export async function lireEtatOffreStock(
  offerId: string,
  empreinte: string | null,
): Promise<StockOfferPublicStateResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("stock_offer_public_state", {
    p_offer_id: offerId,
    // `undefined` et non `null` : la RPC porte un défaut, et lui passer
    // explicitement `null` reviendrait au même — mais l'omission dit « je n'en
    // ai pas » plutôt que « voici rien ».
    p_player_key_hash: empreinte ?? undefined,
  });
  // Rendu TEL QUEL, `unavailable` compris : aucun repli sur une lecture de
  // table, qui ne trouverait rien de plus et paierait un aller-retour à chaque
  // identifiant inventé.
  if (error) return mapStockOfferPublicState({ state: "unavailable" });
  const etat = mapStockOfferPublicState(data);

  // LE SECOND ESSAI, ET SEULEMENT S'IL Y A UN VIDE À COMBLER.
  //
  // Trois conditions, toutes nécessaires : ce navigateur a une identité (sans
  // cookie il n'y a jamais eu de prise), l'offre est servie (sur `unavailable`
  // il n'y a pas d'offre à laquelle rattacher une adhésion), et la lecture
  // normale n'a rien rendu. Un joueur qui voit déjà sa prise ne paie donc rien
  // de ce qui suit — c'est la seule façon de tenir un chemin de reprise sans
  // doubler le coût du chemin ordinaire.
  if (!empreinte || etat.state !== "ok" || !etat.offerId || etat.myHold) {
    return etat;
  }
  return repliPriseApresRotation(admin, etat, etat.offerId, empreinte);
}

/**
 * Retrouve la prise écrite sous l'ANCIENNE empreinte, après rotation du cookie
 * `lc-player` (90 jours, `resolve_player_identity`).
 *
 * ── POURQUOI CE CHEMIN EXISTE ──
 *
 * `reservation_stock_holds.player_key_hash` porte l'empreinte du jour de la
 * prise. Quand le cookie tourne, l'empreinte change et la prise devient
 * INVISIBLE pour son propre client — il ne retrouve plus le code qu'il doit
 * présenter au comptoir. Rien n'est perdu en base : le nouvel appareil est
 * rattaché au même `players.id` et l'ancienne empreinte est conservée dans
 * `player_legacy_identities`, parce que `holdStockOffer` pose le pont
 * d'identité `reserver_stock` à chaque prise. `lookup_player_identity` sait
 * refaire le lien ; il n'avait aucun appelant.
 *
 * ── L'ORGANISATION EST LUE ICI, ET C'EST ASSUMÉ ──
 *
 * La RPC de reprise la réclame, et `stock_offer_public_state` ne la rend pas.
 * Cette lecture par CLÉ PRIMAIRE est le même geste que celui de
 * `loadStockOfferPublicContext` juste en dessous, faite au même moment logique :
 * APRÈS que la RPC a accepté de servir l'offre. Elle ne décide de rien —
 * l'interdit du module porte sur le RESTANT, qui ne se compte que sous verrou
 * et dont il n'est pas question ici — et elle n'est payée que sur le vide.
 *
 * ── L'ÉCHEC NE CASSE RIEN ──
 *
 * Pas d'organisation, pas d'ancienne empreinte, seconde lecture en panne ou
 * toujours vide : on rend l'état de la PREMIÈRE lecture, à l'identique. Une
 * page sans prise, jamais une erreur.
 *
 * Seul `myHold` est repris de la seconde lecture. Le restant, le titre et la
 * fenêtre restent ceux de la première : c'est la même offre, mais un seul des
 * deux documents a le droit de décrire l'écran, sans quoi deux photos prises à
 * deux instants se retrouveraient sur la même carte.
 */
async function repliPriseApresRotation(
  admin: ReturnType<typeof createAdminClient>,
  etat: StockOfferPublicStateResult,
  offerId: string,
  empreinte: string,
): Promise<StockOfferPublicStateResult> {
  const { data: offre } = await admin
    .from("reservation_stock_offers")
    .select("organization_id")
    .eq("id", offerId)
    .maybeSingle();
  const organizationId = (offre as { organization_id?: string } | null)
    ?.organization_id;
  if (!organizationId) return etat;

  const ancienne = await lookupLegacyIdentityHash({
    deviceTokenHash: empreinte,
    organizationId,
    experienceKind: "reserver_stock",
    experienceId: offerId,
  });
  if (!ancienne) return etat;

  const { data, error } = await admin.rpc("stock_offer_public_state", {
    p_offer_id: offerId,
    p_player_key_hash: ancienne,
  });
  if (error) return etat;
  const repli = mapStockOfferPublicState(data);
  if (repli.state !== "ok" || !repli.myHold) return etat;

  // ZÉRO EST LA VALEUR ATTENDUE tant que personne n'a tourné ; une population
  // non nulle dit combien de clients auraient perdu leur code sans ce chemin.
  recordCounter("reserver.stock.repli_rotation");
  return { ...etat, myHold: repli.myHold };
}

export type ReserverStockOfferPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organization: ReserverOrganization;
      /** Fuseau de l'établissement — jamais celui de l'hôte ni du navigateur. */
      timezone: string;
      offre: StockOfferPublicStateResult;
      /** Ce que l'écran affiche de l'offre — brouillon, ouverte, épuisée… */
      etat: EtatUiOffreStock;
      /** Indicatif : `hold_stock_offer` reste seule juge, sous verrou. */
      accepteePrise: boolean;
      aUneIdentite: boolean;
    };

/**
 * Contexte de la page publique d'une offre de stock.
 *
 * ── LE DROIT `reserver` EST TRANCHÉ PAR LA RPC, ET PAS ICI ──
 *
 * Différence assumée avec `loadReserverQueuePublicContext`, qui le résout
 * lui-même : `stock_offer_public_state` l'interroge DÉJÀ et rend `unavailable` —
 * indistinctement d'une offre inconnue ou en brouillon. Le refaire ici aurait
 * payé une seconde lecture de l'organisation pour reposer une question déjà
 * répondue, et surtout aurait ouvert la possibilité que les deux réponses
 * divergent.
 *
 * L'organisation est quand même lue, mais pour AFFICHER (nom, logo, fuseau), et
 * seulement APRÈS que la RPC a accepté de servir l'offre : un visiteur à qui
 * elle répond `unavailable` n'apprend donc rien de l'existence du commerce.
 */
export async function loadStockOfferPublicContext(
  offerId: string,
): Promise<ReserverStockOfferPublicContext> {
  // PRESSION IP D'ABORD, SUR L'IP SEULE, ET SANS JAMAIS REFUSER — motif
  // `loadReserverQueuePublicContext` : l'identifiant vient de l'URL, donc du
  // client, et un balayage d'UUID inventés n'atteint jamais une offre résolue.
  // Posé après la lecture, ce compteur n'en verrait rien.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  const empreinte = await lireIdentiteReserver();
  const offre = await lireEtatOffreStock(offerId, empreinte);
  if (offre.state !== "ok" || !offre.offerId) {
    return { ok: false, error: INDISPONIBLE };
  }

  // Second compteur, par OFFRE, une fois la cible résolue — et par offre, jamais
  // par une valeur libre : composer une clé de seau sur ce que l'appelant
  // choisit ouvrirait une série neuve à chaque identifiant inventé (wagon 7).
  await observerPressionIp(
    ["reserver:page:stock:ip", offre.offerId],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { offer_id: offre.offerId },
  );

  // L'ORGANISATION N'EST PAS DANS LA RÉPONSE DE LA RPC, et ne doit pas l'être :
  // elle sert à HABILLER la page (nom, logo, fuseau), pas à décider. On la
  // retrouve par la ligne d'offre, au service_role, une fois l'offre servie.
  const admin = createAdminClient();
  const { data: offerData } = await admin
    .from("reservation_stock_offers")
    .select(`id, organization_id, organizations(${ORG_COLUMNS})`)
    .eq("id", offre.offerId)
    .maybeSingle();
  if (!offerData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = offerData as unknown as {
    id: string;
    organization_id: string;
    organizations?: ReserverOrganization | null;
  };
  const organization = row.organizations ?? null;
  // Garde inter-tenant : la jointure ne doit jamais rapporter une organisation
  // qui n'est pas celle de la ligne (motif `loadReserverPublicContext`).
  if (!organization || organization.id !== row.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }

  return {
    ok: true,
    organization,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    offre,
    etat: etatUiOffreStock({
      status: offre.status ?? "draft",
      windowEndsAt: offre.windowEndsAt,
      remaining: offre.remaining,
    }),
    accepteePrise: offreAccepteePrise({
      status: offre.status ?? "draft",
      windowEndsAt: offre.windowEndsAt,
      remaining: offre.remaining,
    }),
    aUneIdentite: Boolean(empreinte),
  };
}

export type ReserverStockOffersDashboardContext =
  | { ok: false; reason: "unauthenticated" | "no_access" }
  | {
      ok: true;
      organizationId: string;
      timezone: string;
      offers: StockOfferStaffView[];
    };

/**
 * Les offres de stock de l'organisation, avec leurs compteurs.
 *
 * ── UNE SEULE RPC, CONTRAIREMENT AUX FILES ──
 *
 * `loadReserverQueuesDashboardContext` recompose ses deux compteurs depuis une
 * lecture groupée, parce que `queue_staff_state` est par FILE et qu'une RPC par
 * ligne aurait fait N allers-retours. Ici `stock_offers_staff_state` rend
 * l'organisation ENTIÈRE en un appel, compteurs compris — dont `expired_count`,
 * qui n'existe dans AUCUNE colonne et ne se recomposerait qu'en relisant toutes
 * les prises.
 *
 * L'ORGANISATION VIENT DE LA SESSION, et il n'existe aucun chemin par lequel un
 * navigateur puisse en nommer une autre : la RPC ne vérifie AUCUNE appartenance
 * (elle est en lecture, service_role, bornée à l'organisation qu'on lui passe) —
 * c'est exactement le contrat de `queue_staff_state`, et le même invariant.
 *
 * ── LE RÔLE EST VÉRIFIÉ ICI, PARCE QUE PERSONNE D'AUTRE NE LE FAIT (revue L9) ──
 *
 * `stock_offers_staff_state` est `security definer` et ne demande AUCUNE
 * appartenance : elle rend les offres de l'organisation qu'on lui nomme, point.
 * Sa sûreté repose donc entièrement sur le fait que ce chargeur-ci lui passe
 * l'organisation de la SESSION — un invariant vrai, mais qui tenait à une seule
 * ligne et qu'aucune garde ne rappelait. Le rôle est le second tour de clé : il
 * ne change rien tant que l'invariant tient, et il évite qu'une fuite
 * inter-locataire soit à un paramètre de distance le jour où quelqu'un croit
 * bien faire en rendant l'organisation configurable.
 *
 * `owner | editor`, motif `gardeEditeurReserver` (src/actions/reserver.ts) : ce
 * panneau est du PARAMÉTRAGE — créer une offre, fixer un stock, rééditer une
 * fenêtre. Le CAISSIER, lui, n'en a pas besoin ; son écran est le comptoir
 * (`/dashboard/redeem`), qui lit les prises et non le catalogue. Il voit donc
 * cette page sans les offres, exactement comme il voit les autres panneaux
 * d'édition qui ne le concernent pas.
 */
export async function loadStockOffersDashboardContext(): Promise<ReserverStockOffersDashboardContext> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, reason: "unauthenticated" };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, reason: "no_access" };
  }
  if (!droitEffectifModule("reserver", organization)) {
    return { ok: false, reason: "no_access" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("stock_offers_staff_state", {
    // DE LA SESSION. Jamais d'un paramètre de requête — voir ci-dessus.
    p_organization_id: organization.id,
  });
  // Une panne de lecture rend une LISTE VIDE plutôt qu'un refus de droit : le
  // commerçant a le droit, il n'a simplement rien à afficher pour l'instant.
  // Confondre les deux lui ferait croire que son abonnement a changé.
  const etat = error
    ? { ok: false, offers: [] }
    : mapStockOffersStaffState(data);

  return {
    ok: true,
    organizationId: organization.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    offers: etat.offers,
  };
}
