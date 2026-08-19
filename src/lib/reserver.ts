/**
 * Cœur métier « pur » du module Réserver (RES-1b lot L4, RES-2 lot L5) : types
 * de domaine, mappers des `jsonb` / lignes renvoyés par les RPC service_role du
 * socle (`reserve_slot`, `cancel_reservation`, `checkin_reservation`,
 * `reservation_public_state`, migration 20261002120000) et de la liste
 * prioritaire et des invitations (`waitlist_join`, `claim_waitlist_offer`,
 * `waitlist_leave`, `redeem_invitation`, `create_reservation_invitation`,
 * `revoke_reservation_invitation`, `close_reservation_invitation`, migration
 * 20261004120000), plus le formatage des créneaux dans le fuseau de
 * l'organisation.
 *
 * Aucun import `server-only`, aucun accès base : ce fichier est testable seul,
 * exactement comme `src/lib/quiz.ts` et `src/lib/calendar.ts`.
 *
 * ── CE QUE CE MODULE NE DÉCIDE PAS ──
 *
 * Ni la capacité, ni la fenêtre de check-in, ni l'ouverture d'un créneau. Tout
 * cela est tranché EN BASE, sous verrou, par les RPC. Les fonctions d'état
 * ci-dessous ne servent qu'à CHOISIR UN LIBELLÉ : elles lisent ce que le serveur
 * a déjà décidé et n'ajoutent aucune règle. Un écran qui refuserait ici ce que
 * la base accepte (ou l'inverse) serait un second juge, donc une divergence.
 */

import { formatDate } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Types de domaine (miroir des CHECK SQL)
// ────────────────────────────────────────────────────────────

/** Statut d'une réservation — miroir du CHECK `reservations.status`. */
export type ReservationStatus = "confirmed" | "cancelled" | "checked_in";

/** Statut d'un créneau — miroir du CHECK `reservation_slots.status`. */
export type ReservationSlotStatus = "draft" | "open" | "closed";

/** Issues de `reserve_slot`. */
export type ReserveSlotState =
  | "unavailable"
  | "invalid_email"
  | "full"
  | "already_reserved"
  | "reserved";

/** Issues de `cancel_reservation`. */
export type CancelReservationState =
  | "unknown"
  | "already_checked_in"
  | "too_late"
  | "cancelled";

/**
 * Statut d'une entrée de liste prioritaire — miroir du CHECK
 * `reservation_waitlist_entries.status` (20261004120000).
 */
export type ReservationWaitlistStatus =
  | "waiting"
  | "offered"
  | "converted"
  | "expired"
  | "cancelled";

/** Issues de `waitlist_join`. */
export type WaitlistJoinState =
  | "unavailable"
  | "invalid_email"
  | "not_full"
  /**
   * La FILE est pleine, pas le créneau (revue de sécurité L5, E-1a). État
   * distinct et NON muet, contrairement aux six refus de `reserve_slot` : il ne
   * révèle rien qu'un visiteur ne voie déjà, et « la liste est complète » est
   * actionnable là où « indisponible » ne l'est pas.
   */
  | "waitlist_full"
  | "already_reserved"
  | "waiting"
  | "already_waiting";

/** Issues de `claim_waitlist_offer`. */
export type ClaimWaitlistOfferState =
  | "unknown"
  | "unavailable"
  | "expired"
  | "claimed";

/** Issues de `waitlist_leave`. */
export type WaitlistLeaveState =
  | "unknown"
  | "left"
  | "converted"
  | "expired";

/**
 * Issues de `evict_waitlist_entry` (retrait AU NOM DU COMMERCE, revue L5 E-1b).
 *
 * Même forme que `waitlist_leave`, un mot près : `evicted` au lieu de `left`.
 * Deux types plutôt qu'un seul, parce que les deux chemins n'ont ni la même
 * autorisation (appartenance contre possession) ni le même journal — et qu'un
 * type partagé aurait invité, au premier état ajouté d'un côté, à le traiter
 * comme s'il existait de l'autre.
 */
export type EvictWaitlistEntryState =
  | "unknown"
  | "evicted"
  | "converted"
  | "expired";

/** Issues de `redeem_invitation`. */
export type RedeemInvitationState =
  | "unavailable"
  | "invalid_email"
  | "full"
  | "already_reserved"
  | "reserved";

/**
 * Issues de `create_reservation_invitation`, plus `unknown`.
 *
 * `unknown` N'EST PAS UN ÉTAT SQL : la RPC ne le produit jamais. C'est le repli
 * FERMÉ d'un document illisible — sans lui, un `jsonb` corrompu se lirait
 * `created` par défaut et l'écran annoncerait un lien qui n'existe pas.
 */
export type CreateInvitationState =
  | "unknown"
  | "created"
  | "invalid_label"
  | "invalid_max_uses"
  | "invalid_target"
  | "invalid_expiry"
  | "duplicate";

/** Issues de `revoke_reservation_invitation`. */
export type RevokeInvitationState = "unknown" | "revoked";

/** Issues de `close_reservation_invitation`. */
export type CloseInvitationState = "unknown" | "closed";

/**
 * Verdict de fenêtre rendu PAR `checkin_reservation` (colonne `window_state`).
 * Il ne se lit JAMAIS seul : voir `mapCheckinReservation`.
 */
export type CheckinWindowState = "ok" | "too_early" | "too_late";

/** Bornes applicatives, ≤ aux CHECK SQL du socle. */
export const RESERVER_ACTIVITY_NAME_MAX = 120;
export const RESERVER_ACTIVITY_DESCRIPTION_MAX = 2000;
export const RESERVER_EMAIL_MAX = 254;
export const RESERVER_CAPACITY_MIN = 1;
/**
 * Plafond APPLICATIF de capacité. Le CHECK SQL n'impose que `capacity > 0` :
 * 500 est la borne d'un écran de comptoir, pas une règle métier de la base.
 */
export const RESERVER_CAPACITY_MAX = 500;

/** Code court de check-in — miroir du CHECK `^[A-HJ-NP-Z2-9]{8}$`. */
export const RESERVER_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

/** Libellé d'une invitation — 1..120, exactement le CHECK SQL. */
export const RESERVER_INVITATION_LABEL_MAX = 120;

/**
 * Usages d'une invitation — `between 1 and 500`, exactement le CHECK SQL.
 * Au-delà de 500, « invitation privée » ne veut plus rien dire : le commerçant
 * devrait simplement ouvrir son créneau.
 */
export const RESERVER_INVITATION_MAX_USES_MIN = 1;
export const RESERVER_INVITATION_MAX_USES_MAX = 500;

/**
 * Fenêtre de tenue d'une place proposée, en minutes — `between 5 and 1440`,
 * exactement le CHECK `reservation_slots_waitlist_window_check`.
 *
 * `null` en base = défaut du produit (120 minutes), et l'échéance est de toute
 * façon PLAFONNÉE au début du créneau par `reservation_offer_next`.
 */
export const RESERVER_WAITLIST_OFFER_MINUTES_MIN = 5;
export const RESERVER_WAITLIST_OFFER_MINUTES_MAX = 1440;
export const RESERVER_WAITLIST_OFFER_MINUTES_DEFAUT = 120;

/**
 * Jeton d'invitation en CLAIR — 24 octets en base64url, soit 192 bits.
 *
 * Même générateur et même forme que `pronostics.generatePlayerToken`, et pour
 * la même raison : c'est un secret d'URL, haché en SHA-256 NON SALÉ avant
 * d'entrer en base (`reservation_invitations.token_hash`). Non salé
 * délibérément — un sel applicatif rendrait TOUTES les invitations illisibles
 * le jour où il tournerait, et une invitation doit survivre à une rotation de
 * secret là où une session non.
 */
export const RESERVER_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "confirmed",
  "cancelled",
  "checked_in",
];

const SLOT_STATUSES: readonly ReservationSlotStatus[] = [
  "draft",
  "open",
  "closed",
];

const RESERVE_STATES: readonly ReserveSlotState[] = [
  "unavailable",
  "invalid_email",
  "full",
  "already_reserved",
  "reserved",
];

const CANCEL_STATES: readonly CancelReservationState[] = [
  "unknown",
  "already_checked_in",
  "too_late",
  "cancelled",
];

const WAITLIST_STATUSES: readonly ReservationWaitlistStatus[] = [
  "waiting",
  "offered",
  "converted",
  "expired",
  "cancelled",
];

const WAITLIST_JOIN_STATES: readonly WaitlistJoinState[] = [
  "unavailable",
  "invalid_email",
  "not_full",
  "waitlist_full",
  "already_reserved",
  "waiting",
  "already_waiting",
];

const CLAIM_STATES: readonly ClaimWaitlistOfferState[] = [
  "unknown",
  "unavailable",
  "expired",
  "claimed",
];

const LEAVE_STATES: readonly WaitlistLeaveState[] = [
  "unknown",
  "left",
  "converted",
  "expired",
];

const EVICT_STATES: readonly EvictWaitlistEntryState[] = [
  "unknown",
  "evicted",
  "converted",
  "expired",
];

const REDEEM_STATES: readonly RedeemInvitationState[] = [
  "unavailable",
  "invalid_email",
  "full",
  "already_reserved",
  "reserved",
];

const CREATE_INVITATION_STATES: readonly CreateInvitationState[] = [
  "created",
  "invalid_label",
  "invalid_max_uses",
  "invalid_target",
  "invalid_expiry",
  "duplicate",
];

// ────────────────────────────────────────────────────────────
// Lecture défensive du jsonb (motif src/lib/quiz.ts:236)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Statut de réservation, ou `confirmed` — jamais une valeur inventée à l'écran. */
export function asReservationStatus(value: unknown): ReservationStatus {
  const candidate = asString(value);
  return candidate && (RESERVATION_STATUSES as string[]).includes(candidate)
    ? (candidate as ReservationStatus)
    : "confirmed";
}

/**
 * Statut de créneau, ou `draft` — le REPLI LE PLUS FERMÉ. Un statut illisible
 * ne doit jamais faire apparaître un créneau au joueur : `draft` est
 * précisément l'état invisible.
 */
export function asSlotStatus(value: unknown): ReservationSlotStatus {
  const candidate = asString(value);
  return candidate && (SLOT_STATUSES as string[]).includes(candidate)
    ? (candidate as ReservationSlotStatus)
    : "draft";
}

/**
 * Statut de liste prioritaire, ou `waiting` — le REPLI LE PLUS FERMÉ : c'est
 * l'état auquel RIEN N'EST DÛ. Lire `offered` par défaut ferait afficher une
 * place tenue que personne n'a promise.
 */
export function asWaitlistStatus(value: unknown): ReservationWaitlistStatus {
  const candidate = asString(value);
  return candidate && (WAITLIST_STATUSES as string[]).includes(candidate)
    ? (candidate as ReservationWaitlistStatus)
    : "waiting";
}

// ────────────────────────────────────────────────────────────
// `reserve_slot`
// ────────────────────────────────────────────────────────────

export interface ReserveSlotResult {
  state: ReserveSlotState;
  /** Présent sur `reserved` et `already_reserved`. */
  reservationId: string | null;
  /** Code de comptoir. Présent sur `reserved` et `already_reserved`. */
  code: string | null;
  /** Statut de la ligne rendue par `already_reserved` (confirmée ou arrivée). */
  status: ReservationStatus | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Places restantes après cette réservation (`reserved` seulement). */
  remaining: number | null;
  /** Capacité du créneau, rendue avec `full` — de quoi expliquer le refus. */
  capacity: number | null;
}

/**
 * Mappe le `jsonb` de `reserve_slot`.
 *
 * `reservationId` / `code` ne sont retenus que pour les deux états qui PROUVENT
 * qu'une ligne appartient à ce joueur (`reserved`, `already_reserved`) : un
 * `unavailable` qui charrierait un code par accident le donnerait à quelqu'un
 * qui n'a rien réservé.
 */
export function mapReserveSlot(raw: unknown): ReserveSlotResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ReserveSlotState =
    stateRaw && (RESERVE_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ReserveSlotState)
      : "unavailable";

  const detenue = state === "reserved" || state === "already_reserved";

  return {
    state,
    reservationId: detenue && root ? asString(root.reservation_id) : null,
    code: detenue && root ? asString(root.code) : null,
    status:
      state === "already_reserved" && root
        ? asReservationStatus(root.status)
        : state === "reserved"
          ? "confirmed"
          : null,
    startsAt: state === "reserved" && root ? asString(root.starts_at) : null,
    endsAt: state === "reserved" && root ? asString(root.ends_at) : null,
    remaining: state === "reserved" && root ? asInt(root.remaining) : null,
    capacity: state === "full" && root ? asInt(root.capacity) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `cancel_reservation`
// ────────────────────────────────────────────────────────────

export interface CancelReservationResult {
  state: CancelReservationState;
  reservationId: string | null;
  cancelledAt: string | null;
  /** Début du créneau, rendu avec `too_late` — de quoi expliquer le refus. */
  startsAt: string | null;
}

export function mapCancelReservation(raw: unknown): CancelReservationResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CancelReservationState =
    stateRaw && (CANCEL_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CancelReservationState)
      : "unknown";

  return {
    state,
    reservationId: state === "unknown" || !root ? null : asString(root.reservation_id),
    cancelledAt: state === "cancelled" && root ? asString(root.cancelled_at) : null,
    startsAt: state === "too_late" && root ? asString(root.starts_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// Liste prioritaire (RES-2) — `waitlist_join`, `claim_waitlist_offer`,
// `waitlist_leave`
// ────────────────────────────────────────────────────────────

export interface WaitlistJoinResult {
  state: WaitlistJoinState;
  /** Présent sur `waiting` et `already_waiting`. */
  entryId: string | null;
  /** Statut de l'entrée rendue (`waiting` ou `offered`). */
  entryStatus: ReservationWaitlistStatus | null;
  /** Rang dans la file, 1 = tête. Présent sur `waiting` et `already_waiting`. */
  position: number | null;
  /** Échéance d'une offre déjà en cours (`already_waiting` seulement). */
  offerExpiresAt: string | null;
  /** Places encore libres — rendu avec `not_full` : on ne fait pas la queue. */
  remaining: number | null;
  /**
   * Plafond de la FILE, rendu avec `waitlist_full` seulement. C'est un nombre
   * de personnes en attente, jamais un nombre de places : le confondre avec
   * `remaining` ferait dire à l'écran « il reste 4 places » sur un créneau
   * complet.
   */
  waitlistCapacity: number | null;
  /** Les trois champs de `already_reserved`, mot pour mot ceux de `reserve_slot`. */
  reservationId: string | null;
  code: string | null;
  reservationStatus: ReservationStatus | null;
}

/**
 * Mappe le `jsonb` de `waitlist_join`.
 *
 * Même discipline que `mapReserveSlot` : `reservationId` / `code` ne sont
 * retenus que sur l'état qui PROUVE qu'une ligne appartient à ce joueur.
 */
export function mapWaitlistJoin(raw: unknown): WaitlistJoinResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: WaitlistJoinState =
    stateRaw && (WAITLIST_JOIN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as WaitlistJoinState)
      : "unavailable";

  const dansLaFile = state === "waiting" || state === "already_waiting";

  return {
    state,
    entryId: dansLaFile && root ? asString(root.entry_id) : null,
    entryStatus: dansLaFile && root ? asWaitlistStatus(root.status) : null,
    position: dansLaFile && root ? asInt(root.position) : null,
    // L'échéance n'a de sens que sur une offre DÉJÀ faite : `waiting` la rend
    // explicitement nulle en SQL, et une inscription neuve ne tient rien.
    offerExpiresAt:
      state === "already_waiting" && root
        ? asString(root.offer_expires_at)
        : null,
    remaining: state === "not_full" && root ? asInt(root.remaining) : null,
    waitlistCapacity:
      state === "waitlist_full" && root ? asInt(root.capacity) : null,
    reservationId:
      state === "already_reserved" && root ? asString(root.reservation_id) : null,
    code: state === "already_reserved" && root ? asString(root.code) : null,
    reservationStatus:
      state === "already_reserved" && root
        ? asReservationStatus(root.status)
        : null,
  };
}

export interface ClaimWaitlistOfferResult {
  state: ClaimWaitlistOfferState;
  entryId: string | null;
  reservationId: string | null;
  code: string | null;
  status: ReservationStatus | null;
  /**
   * Bornes du créneau. LA RPC NE LES REND QUE SUR LA CONVERSION RÉELLE : ni le
   * rejeu idempotent, ni la ceinture « il détenait déjà une place » ne les
   * portent. C'est donc aussi le signal qui distingue les deux — voir
   * `claimWaitlistOffer` dans les actions, qui s'en sert pour ne pas renvoyer
   * une confirmation par email à chaque clic.
   */
  startsAt: string | null;
  endsAt: string | null;
  /** Échéance dépassée, rendue avec `expired` — de quoi expliquer le refus. */
  offerExpiresAt: string | null;
}

export function mapClaimWaitlistOffer(raw: unknown): ClaimWaitlistOfferResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ClaimWaitlistOfferState =
    stateRaw && (CLAIM_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ClaimWaitlistOfferState)
      : "unknown";

  const obtenue = state === "claimed";

  return {
    state,
    entryId:
      state === "unknown" || state === "unavailable" || !root
        ? null
        : asString(root.entry_id),
    reservationId: obtenue && root ? asString(root.reservation_id) : null,
    code: obtenue && root ? asString(root.code) : null,
    status: obtenue && root ? asReservationStatus(root.status) : null,
    startsAt: obtenue && root ? asString(root.starts_at) : null,
    endsAt: obtenue && root ? asString(root.ends_at) : null,
    offerExpiresAt:
      state === "expired" && root ? asString(root.offer_expires_at) : null,
  };
}

export interface WaitlistLeaveResult {
  state: WaitlistLeaveState;
  entryId: string | null;
  cancelledAt: string | null;
  /** Rendu avec `converted` : la place a été prise, elle n'est pas perdue. */
  reservationId: string | null;
  offerExpiresAt: string | null;
}

export function mapWaitlistLeave(raw: unknown): WaitlistLeaveResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: WaitlistLeaveState =
    stateRaw && (LEAVE_STATES as string[]).includes(stateRaw)
      ? (stateRaw as WaitlistLeaveState)
      : "unknown";

  return {
    state,
    entryId: state === "unknown" || !root ? null : asString(root.entry_id),
    cancelledAt: state === "left" && root ? asString(root.cancelled_at) : null,
    reservationId:
      state === "converted" && root ? asString(root.reservation_id) : null,
    offerExpiresAt:
      state === "expired" && root ? asString(root.offer_expires_at) : null,
  };
}

export interface EvictWaitlistEntryResult {
  state: EvictWaitlistEntryState;
  entryId: string | null;
  cancelledAt: string | null;
  /** Rendu avec `converted` : la personne a déjà pris sa place. */
  reservationId: string | null;
  offerExpiresAt: string | null;
}

/**
 * Mappe le `jsonb` de `evict_waitlist_entry`.
 *
 * `unknown` couvre l'entrée inconnue ET celle d'une AUTRE organisation — la RPC
 * les rend indistinctes volontairement, et ce mappage ne les distingue pas non
 * plus : rien dans la réponse ne permet de savoir laquelle des deux.
 */
export function mapEvictWaitlistEntry(raw: unknown): EvictWaitlistEntryResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: EvictWaitlistEntryState =
    stateRaw && (EVICT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as EvictWaitlistEntryState)
      : "unknown";

  return {
    state,
    entryId: state === "unknown" || !root ? null : asString(root.entry_id),
    cancelledAt:
      state === "evicted" && root ? asString(root.cancelled_at) : null,
    reservationId:
      state === "converted" && root ? asString(root.reservation_id) : null,
    offerExpiresAt:
      state === "expired" && root ? asString(root.offer_expires_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// Invitations privées (RES-2)
// ────────────────────────────────────────────────────────────

export interface RedeemInvitationResult {
  state: RedeemInvitationState;
  reservationId: string | null;
  code: string | null;
  status: ReservationStatus | null;
  /** Rendu sur `reserved` seulement : rien n'est dit d'une invitation refusée. */
  invitationId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  activityName: string | null;
  remaining: number | null;
  /** Capacité du créneau, rendue avec `full` — de quoi expliquer le refus. */
  capacity: number | null;
}

/**
 * Mappe le `jsonb` de `redeem_invitation`.
 *
 * `unavailable` est le repli, et c'est le POINT : la RPC y range NEUF refus
 * distincts (jeton inconnu, révoqué, fermé, expiré, épuisé, d'une autre
 * organisation, créneau absent / en brouillon / passé, activité coupée, droit
 * `vitrine` absent). Les distinguer ici reconstruirait l'oracle que le SQL a
 * pris soin de ne pas donner.
 */
export function mapRedeemInvitation(raw: unknown): RedeemInvitationResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: RedeemInvitationState =
    stateRaw && (REDEEM_STATES as string[]).includes(stateRaw)
      ? (stateRaw as RedeemInvitationState)
      : "unavailable";

  const detenue = state === "reserved" || state === "already_reserved";

  return {
    state,
    reservationId: detenue && root ? asString(root.reservation_id) : null,
    code: detenue && root ? asString(root.code) : null,
    status:
      state === "already_reserved" && root
        ? asReservationStatus(root.status)
        : state === "reserved"
          ? "confirmed"
          : null,
    invitationId: state === "reserved" && root ? asString(root.invitation_id) : null,
    startsAt: state === "reserved" && root ? asString(root.starts_at) : null,
    endsAt: state === "reserved" && root ? asString(root.ends_at) : null,
    activityName:
      state === "reserved" && root ? asString(root.activity_name) : null,
    remaining: state === "reserved" && root ? asInt(root.remaining) : null,
    capacity: state === "full" && root ? asInt(root.capacity) : null,
  };
}

export interface CreateInvitationResult {
  state: CreateInvitationState;
  invitationId: string | null;
  maxUses: number | null;
  expiresAt: string | null;
}

export function mapCreateInvitation(raw: unknown): CreateInvitationResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CreateInvitationState =
    stateRaw && (CREATE_INVITATION_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CreateInvitationState)
      : "unknown";

  const creee = state === "created";

  return {
    state,
    invitationId: creee && root ? asString(root.invitation_id) : null,
    maxUses: creee && root ? asInt(root.max_uses) : null,
    expiresAt: creee && root ? asString(root.expires_at) : null,
  };
}

export interface RevokeInvitationResult {
  state: RevokeInvitationState;
  invitationId: string | null;
  revokedAt: string | null;
}

export function mapRevokeInvitation(raw: unknown): RevokeInvitationResult {
  const root = asRecord(raw);
  const revoquee = root ? asString(root.state) === "revoked" : false;
  return {
    state: revoquee ? "revoked" : "unknown",
    invitationId: revoquee ? asString(root?.invitation_id) : null,
    revokedAt: revoquee ? asString(root?.revoked_at) : null,
  };
}

export interface CloseInvitationResult {
  state: CloseInvitationState;
  invitationId: string | null;
  closedAt: string | null;
}

export function mapCloseInvitation(raw: unknown): CloseInvitationResult {
  const root = asRecord(raw);
  const fermee = root ? asString(root.state) === "closed" : false;
  return {
    state: fermee ? "closed" : "unknown",
    invitationId: fermee ? asString(root?.invitation_id) : null,
    closedAt: fermee ? asString(root?.closed_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `reservation_public_state`
// ────────────────────────────────────────────────────────────

export interface PublicReservationItem {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string | null;
  cancelledAt: string | null;
  checkedInAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  activityName: string;
}

/**
 * Une entrée VIVANTE (`waiting` ou `offered`) de la file du joueur.
 *
 * `offerLive` est tranché PAR LE SERVEUR, et c'est tout l'intérêt : savoir si
 * une place est encore tenue ne doit pas dépendre de l'horloge d'un téléphone.
 * `offerExpiresAt` sert à afficher un compte à rebours, jamais à décider.
 */
export interface PublicWaitlistItem {
  entryId: string;
  slotId: string;
  status: ReservationWaitlistStatus;
  createdAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  activityName: string;
  offerExpiresAt: string | null;
  offerLive: boolean;
  /** Rang, 1 = tête de file. Recalculé à la lecture, jamais stocké. */
  position: number;
}

export interface ReservationPublicState {
  ok: boolean;
  /** Fuseau de l'organisation — transporté par la RPC pour ne pas le deviner. */
  timezone: string;
  reservations: PublicReservationItem[];
  /** Entrées de file VIVANTES de ce navigateur chez cette organisation. */
  waitlist: PublicWaitlistItem[];
}

/** Fuseau de repli, identique à celui des RPC (`Europe/Paris`). */
export const RESERVER_FUSEAU_DEFAUT = "Europe/Paris";

export function mapReservationPublicState(raw: unknown): ReservationPublicState {
  const root = asRecord(raw);
  const ok = root ? asString(root.state) === "ok" : false;
  if (!ok) {
    return {
      ok: false,
      timezone: RESERVER_FUSEAU_DEFAUT,
      reservations: [],
      waitlist: [],
    };
  }

  const timezone = asString(root?.timezone) ?? RESERVER_FUSEAU_DEFAUT;
  const reservations = asArray(root?.reservations).flatMap((entry) => {
    const item = asRecord(entry);
    const reservationId = item ? asString(item.reservation_id) : null;
    if (!item || !reservationId) return [];
    return [
      {
        reservationId,
        code: asString(item.code) ?? "",
        status: asReservationStatus(item.status),
        createdAt: asString(item.created_at),
        cancelledAt: asString(item.cancelled_at),
        checkedInAt: asString(item.checked_in_at),
        startsAt: asString(item.starts_at),
        endsAt: asString(item.ends_at),
        activityName: asString(item.activity_name) ?? "",
      } satisfies PublicReservationItem,
    ];
  });

  const waitlist = asArray(root?.waitlist).flatMap((entry) => {
    const item = asRecord(entry);
    const entryId = item ? asString(item.entry_id) : null;
    const slotId = item ? asString(item.slot_id) : null;
    if (!item || !entryId || !slotId) return [];
    return [
      {
        entryId,
        slotId,
        status: asWaitlistStatus(item.status),
        createdAt: asString(item.created_at),
        startsAt: asString(item.starts_at),
        endsAt: asString(item.ends_at),
        activityName: asString(item.activity_name) ?? "",
        offerExpiresAt: asString(item.offer_expires_at),
        // Le REPLI EST `false` : un document illisible ne fait pas croire à une
        // place tenue. Le pire coût d'un faux `false` est un bouton « prendre
        // ma place » de moins ; celui d'un faux `true` est une promesse.
        offerLive: asBool(item.offer_live) ?? false,
        position: asInt(item.position) ?? 0,
      } satisfies PublicWaitlistItem,
    ];
  });

  return { ok: true, timezone, reservations, waitlist };
}

// ────────────────────────────────────────────────────────────
// `checkin_reservation`
// ────────────────────────────────────────────────────────────

/**
 * Verdict de comptoir, dans l'ordre où le staff le lit.
 *
 * ── POURQUOI `status` SE LIT AVANT `window_state` ──
 *
 * La RPC rend TOUJOURS les deux, et ils ne parlent pas de la même chose :
 * `status` dit ce qu'EST la réservation, `window_state` dit si le geste de
 * check-in serait recevable MAINTENANT. Un second scan le lendemain rend donc
 * `checked_in` ET `too_late` — c'est une arrivée DÉJÀ ENREGISTRÉE, pas un refus.
 * Lire la fenêtre d'abord aurait fait afficher « trop tard » sur un client
 * pourtant venu, et poussé le staff à chercher un problème inexistant.
 */
export type CheckinVerdict =
  | "unknown"
  | "cancelled"
  | "checked_in"
  | "already_checked_in"
  | "too_early"
  | "too_late";

export interface CheckinReservationResult {
  verdict: CheckinVerdict;
  reservationId: string | null;
  code: string | null;
  status: ReservationStatus | null;
  checkedInAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  activityName: string | null;
}

const VERDICT_INCONNU: CheckinReservationResult = {
  verdict: "unknown",
  reservationId: null,
  code: null,
  status: null,
  checkedInAt: null,
  startsAt: null,
  endsAt: null,
  activityName: null,
};

/**
 * Mappe la ligne (ou l'absence de ligne) de `checkin_reservation`.
 *
 * AUCUNE ligne = code inconnu OU code d'une autre organisation : la RPC rend la
 * même chose dans les deux cas, et ce mapper ne les distingue pas non plus.
 */
export function mapCheckinReservation(raw: unknown): CheckinReservationResult {
  const row = asRecord(asArray(raw)[0] ?? raw);
  const reservationId = row ? asString(row.id) : null;
  if (!row || !reservationId) return VERDICT_INCONNU;

  const status = asReservationStatus(row.status);
  const checkedInNow = asBool(row.checked_in_now) ?? false;
  const windowState = asString(row.window_state);

  const commun = {
    reservationId,
    code: asString(row.code),
    status,
    checkedInAt: asString(row.checked_in_at),
    startsAt: asString(row.starts_at),
    endsAt: asString(row.ends_at),
    activityName: asString(row.activity_name),
  };

  // L'ORDRE EST LA RÈGLE — voir le docstring de `CheckinVerdict`.
  if (status === "cancelled") return { verdict: "cancelled", ...commun };
  if (status === "checked_in") {
    return {
      verdict: checkedInNow ? "checked_in" : "already_checked_in",
      ...commun,
    };
  }
  if (windowState === "too_early") return { verdict: "too_early", ...commun };
  if (windowState === "too_late") return { verdict: "too_late", ...commun };
  // `confirmed` + fenêtre `ok` sans consommation : la RPC ne produit pas ce cas
  // (l'`update` et la lecture partagent la MÊME expression de fenêtre). Le repli
  // est le plus fermé — on n'affirme pas une arrivée que rien n'atteste.
  return { verdict: "unknown", ...commun };
}

// ────────────────────────────────────────────────────────────
// États d'interface
// ────────────────────────────────────────────────────────────

/** Ce que le joueur lit sur SA réservation. */
export type EtatUiReservation = "confirme" | "annule" | "arrive";

export function etatUiReservation(status: ReservationStatus): EtatUiReservation {
  if (status === "cancelled") return "annule";
  if (status === "checked_in") return "arrive";
  return "confirme";
}

/** Ce que le joueur lit sur UN CRÉNEAU de la page publique. */
export type EtatUiCreneau = "ouvert" | "complet" | "ferme" | "passe";

/**
 * État affichable d'un créneau.
 *
 * L'ordre des tests reproduit celui des refus de `reserve_slot` : un créneau
 * non ouvert est fermé quoi qu'il reste de places, un créneau commencé est
 * passé même s'il est plein — la base refuse déjà pour ces deux motifs, et
 * afficher « complet » sur un créneau d'hier enverrait le joueur chercher une
 * place qui n'existe plus.
 */
export function etatUiCreneau(
  creneau: { status: ReservationSlotStatus; startsAt: string; remaining: number },
  now = new Date(),
): EtatUiCreneau {
  if (creneau.status !== "open") return "ferme";
  const debut = new Date(creneau.startsAt).getTime();
  if (!Number.isFinite(debut) || debut <= now.getTime()) return "passe";
  if (creneau.remaining <= 0) return "complet";
  return "ouvert";
}

/** Une activité coupée ferme tous ses créneaux, sans rien effacer. */
export function activiteOuverte(activity: { active: boolean }): boolean {
  return activity.active;
}

/** Ce que le joueur lit sur SA place dans la file. */
export type EtatUiEntreeFile =
  | "attente"
  | "offre"
  | "offre_expiree"
  | "convertie"
  | "expiree"
  | "partie";

/**
 * État affichable d'une entrée de liste prioritaire.
 *
 * ── `offerLive` PASSE AVANT L'ÉCHÉANCE, ET NE SE RECALCULE PAS ICI ──
 *
 * `reservation_public_state` tranche déjà `offered and offer_expires_at > now()`
 * côté serveur. Le recalculer ici en comparant `offerExpiresAt` à l'horloge
 * locale rétablirait exactement ce que le SQL a écarté : une place « encore à
 * moi » qui dépend d'un téléphone mal réglé. Ce mapper LIT le verdict.
 *
 * `offered` sans offre vivante rend `offre_expiree` plutôt que `expiree` : la
 * ligne est encore `offered` en base — le balayage n'est pas passé — et
 * `claim_waitlist_offer` répondra `expired` par son refus PARESSEUX. Les deux
 * libellés disent la même chose au joueur, mais le second ment sur l'état de la
 * ligne, et l'écran de reprise n'aurait plus de quoi expliquer un rang encore
 * occupé.
 */
export function etatUiEntreeFile(entree: {
  status: ReservationWaitlistStatus;
  offerLive: boolean;
}): EtatUiEntreeFile {
  if (entree.status === "converted") return "convertie";
  if (entree.status === "expired") return "expiree";
  if (entree.status === "cancelled") return "partie";
  if (entree.status === "offered") {
    return entree.offerLive ? "offre" : "offre_expiree";
  }
  return "attente";
}

/** Ce que le commerçant lit sur UNE invitation. */
export type EtatUiInvitation =
  | "active"
  | "revoquee"
  | "fermee"
  | "expiree"
  | "epuisee";

/**
 * État affichable d'une invitation.
 *
 * L'ORDRE REPRODUIT CELUI DES QUATRE INTERRUPTEURS DE `redeem_invitation` :
 * révoquée, fermée, expirée, épuisée. Les trois premiers sont des décisions du
 * commerçant, la quatrième une conséquence — afficher « épuisée » sur un lien
 * qu'il vient de révoquer lui ferait chercher des places qu'il a lui-même
 * fermées.
 */
export function etatUiInvitation(
  invitation: {
    revokedAt: string | null;
    closedAt: string | null;
    expiresAt: string | null;
    usedCount: number;
    maxUses: number;
  },
  now = new Date(),
): EtatUiInvitation {
  if (invitation.revokedAt) return "revoquee";
  if (invitation.closedAt) return "fermee";
  if (invitation.expiresAt) {
    const echeance = new Date(invitation.expiresAt).getTime();
    if (Number.isFinite(echeance) && echeance <= now.getTime()) return "expiree";
  }
  if (invitation.usedCount >= invitation.maxUses) return "epuisee";
  return "active";
}

// ────────────────────────────────────────────────────────────
// Formatage — TOUJOURS dans le fuseau de l'organisation
// ────────────────────────────────────────────────────────────

/**
 * Formateurs d'heure seule, un par fuseau (motif `formatPour` de
 * `src/lib/utils.ts`, qui est privé et rend une date COMPLÈTE : la fin d'un
 * créneau se lit « 16:00 », pas « 12 avr. 2026, 16:00 »).
 */
const FORMATS_HEURE = new Map<string, Intl.DateTimeFormat>();

function heurePour(timeZone: string): Intl.DateTimeFormat {
  const connu = FORMATS_HEURE.get(timeZone);
  if (connu) return connu;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    // Fuseau inconnu du runtime : le défaut vaut mieux qu'un écran cassé.
    format = heurePour(RESERVER_FUSEAU_DEFAUT);
  }
  FORMATS_HEURE.set(timeZone, format);
  return format;
}

/** Heure civile d'un instant, dans le fuseau de l'établissement. */
export function formatHeure(iso: string | Date, timeZone: string): string {
  return heurePour(timeZone).format(new Date(iso));
}

/**
 * Libellé complet d'un créneau : « 12 avr. 2026, 14:00 – 16:00 ».
 *
 * `timeZone` est OBLIGATOIRE ici, contrairement à `formatDate` qui l'a rendu
 * optionnel pour ne pas casser 42 appels existants. Un créneau sans fuseau
 * explicite est le défaut que le socle SQL a pris soin d'éviter en transportant
 * `organizations.timezone` jusqu'au client (`reservation_public_state`).
 */
export function formatCreneau(
  startsAt: string | Date,
  endsAt: string | Date | null,
  timeZone: string,
): string {
  const debut = formatDate(startsAt, timeZone);
  if (!endsAt) return debut;
  return `${debut} – ${formatHeure(endsAt, timeZone)}`;
}

/**
 * Ce que le commerçant lit sur la fenêtre de check-in.
 *
 * Formulation VALIDÉE : elle nomme les deux bornes de `checkin_reservation`
 * dans l'ordre où elles se comprennent au comptoir, sans exposer le `greatest`
 * qui les combine. « Au moins jusqu'à la fin de la journée » est la borne de
 * journée civile ; « plus deux heures » est celle qui rattrape les séances qui
 * franchissent minuit.
 */
export const LIBELLE_FENETRE_CHECKIN =
  "Le code s'enregistre à partir d'une heure avant le début, et jusqu'à la fin " +
  "de la séance, plus deux heures, et au moins jusqu'à la fin de la journée.";

// ────────────────────────────────────────────────────────────
// Adresses publiques — DES ADRESSES, JAMAIS DES PREUVES
// ────────────────────────────────────────────────────────────

/**
 * Page publique d'une activité réservable.
 *
 * AUCUN jeton, AUCUNE empreinte, AUCUN code dans le chemin ni dans la
 * query-string (ADR-109 : « le QR public est une adresse, jamais une preuve de
 * présence »). C'est le cookie `lc-player` du navigateur qui fait retrouver au
 * joueur sa réservation sur cette page — un lien copié-collé n'emporte donc
 * rien avec lui.
 */
export function cheminActiviteReserver(activityId: string): string {
  return `/reserver/${activityId}`;
}

/** La même adresse, absolue — pour un email transactionnel. */
export function urlActiviteReserver(activityId: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminActiviteReserver(activityId)}`;
}

/**
 * Page de rejointe d'une invitation privée.
 *
 * ── POURQUOI CELLE-CI PORTE UN JETON, ALORS QUE LA PRÉCÉDENTE S'Y REFUSE ──
 *
 * `cheminActiviteReserver` n'emporte rien parce qu'un QR public est une adresse
 * (ADR-109). Une invitation est l'inverse : un artefact CONÇU pour être un
 * secret porteur d'un droit — révocable (`revoked_at`), fermable (`closed_at`),
 * daté (`expires_at`), à usage compté (`max_uses`). C'est le contrat d'une clé
 * d'API, pas celui d'une identité : il se retire d'un geste, sans rien effacer
 * de ce qu'il a ouvert. Le précédent est `/hunt/[token]`.
 *
 * Le clair ne quitte cette adresse que HACHÉ : `hashInvitationToken`
 * (src/lib/reserver-context.ts) est appliqué à la frontière, et rien d'autre ne
 * descend vers la base ni vers les journaux.
 */
export function cheminInvitationReserver(jeton: string): string {
  return `/reserver/invitation/${encodeURIComponent(jeton)}`;
}

/** La même adresse, absolue — c'est ELLE que le commerçant copie, une fois. */
export function urlInvitationReserver(jeton: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminInvitationReserver(jeton)}`;
}
