/**
 * Cœur métier « pur » du module Réserver (RES-1b, lot L4) : types de domaine,
 * mappers des `jsonb` / lignes renvoyés par les quatre RPC service_role du socle
 * (`reserve_slot`, `cancel_reservation`, `checkin_reservation`,
 * `reservation_public_state`, migration 20261002120000) et formatage des
 * créneaux dans le fuseau de l'organisation.
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

export interface ReservationPublicState {
  ok: boolean;
  /** Fuseau de l'organisation — transporté par la RPC pour ne pas le deviner. */
  timezone: string;
  reservations: PublicReservationItem[];
}

/** Fuseau de repli, identique à celui des RPC (`Europe/Paris`). */
export const RESERVER_FUSEAU_DEFAUT = "Europe/Paris";

export function mapReservationPublicState(raw: unknown): ReservationPublicState {
  const root = asRecord(raw);
  const ok = root ? asString(root.state) === "ok" : false;
  if (!ok) {
    return { ok: false, timezone: RESERVER_FUSEAU_DEFAUT, reservations: [] };
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

  return { ok: true, timezone, reservations };
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
