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

/**
 * Format d'une expérience — miroir du CHECK `reservation_activities.kind`
 * (RES-5, 20261007120000).
 *
 * SEUL `duo` change l'arithmétique : sur lui, toute réservation vaut DEUX
 * personnes, par les trois portes (publique, liste prioritaire, invitation).
 * Les deux autres se réservent à une personne, et `standard` est le socle.
 */
export type ReserverActivityKind = "standard" | "signature" | "duo";

/** Issues de `reserve_slot`. */
export type ReserveSlotState =
  | "unavailable"
  | "invalid_email"
  | "full"
  /**
   * La taille demandée n'est pas celle du format (RES-5) : deux personnes hors
   * d'un Atelier Duo, ou une seule sur un Atelier Duo. NOMMÉ, et non muet comme
   * les six refus voisins — le format est écrit sur la page publique que le
   * joueur vient de lire, le taire ne cacherait rien et empêcherait l'écran de
   * dire « cet atelier se réserve à deux ».
   */
  | "invalid_party_size"
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

/**
 * Bornes des champs de PRÉSENTATION d'une expérience (RES-5) — exactement les
 * CHECK de `reservation_activities` (20261007120000).
 *
 * La durée n'est PAS bornée à « 20 à 45 minutes » : le cahier l'annonce pour le
 * Moment Signature, mais c'est une recommandation de format, et la même colonne
 * porte l'Atelier Duo de deux heures.
 */
export const RESERVER_ACTIVITY_PROMISE_MAX = 200;
export const RESERVER_ACTIVITY_DURATION_MIN = 10;
export const RESERVER_ACTIVITY_DURATION_MAX = 240;
export const RESERVER_ACTIVITY_PREPARATION_MAX = 600;

/**
 * Les cartes du Moment Signature. TROIS, parce que la page en montre trois :
 * ce n'est pas une borne technique mais le format lui-même, et une quatrième
 * carte n'aurait nulle part où s'afficher.
 */
export const RESERVER_ACTIVITY_STEPS_MAX = 3;
export const RESERVER_STEP_TITLE_MAX = 80;
export const RESERVER_STEP_BODY_MAX = 400;

/**
 * Les NOMS des deux champs répétés qui portent les cartes dans le formulaire.
 *
 * Le panneau rend une paire par carte, toutes sous le même nom, et
 * `etapesDepuisFormData` les rassemble par `getAll` — appariées par leur
 * POSITION, sans identifiant. Les deux bouts doivent donc s'accorder sur ces
 * deux chaînes EXACTEMENT, et un désaccord ne fait pas d'erreur : le formulaire
 * poste des étapes que l'action ne lit pas, l'activité s'enregistre sans ses
 * cartes, et rien ne le signale.
 *
 * ── POURQUOI ICI, ET PLUS DANS `validations/reserver.ts` ──
 *
 * Elles y sont nées, à côté du schéma qui les valide — le bon voisinage, mais
 * le mauvais module : `validations/reserver.ts` construit des schémas Zod à
 * l'import, et le formulaire qui a besoin de ces deux chaînes est un composant
 * CLIENT. Les y lire aurait tiré Zod et les vingt schémas du module dans le
 * bundle du navigateur pour deux littéraux. Ce fichier-ci, lui, est déjà des
 * deux côtés — c'est le vocabulaire partagé du module. `validations` les
 * ré-exporte, donc rien ne change pour qui les lisait là-bas.
 */
export const RESERVER_STEP_TITLE_FIELD = "stepTitle";
export const RESERVER_STEP_BODY_FIELD = "stepBody";

/**
 * Taille d'une réservation, en PERSONNES — `between 1 and 30`, exactement le
 * CHECK `reservations_party_size_bound`.
 *
 * ── POURQUOI 30, ET PLUS 2 ──
 *
 * La borne valait 2 tant que le duo était la seule taille plurielle. RDV-6
 * (20261108120000) l'a portée à 30 pour la RÉSERVATION DE TABLE : une tablée
 * de six n'est pas un cas limite dans un restaurant, c'est le cas courant.
 * Cette constante est le miroir du CHECK et doit le suivre — la garder à 2
 * aurait fait refuser par le formulaire ce que la base accepte, et l'écran
 * serait devenu un second juge, plus sévère que le premier.
 *
 * Elle ne dit RIEN de ce qui est PLAÇABLE : c'est `reserve_table` qui cherche
 * une table assez grande, sous verrou, et qui rend `full` quand il n'y en a
 * pas. Une demande de trente couverts est une demande VALIDE ; elle sera
 * simplement sans réponse dans une salle de tables de quatre.
 */
export const RESERVER_PARTY_SIZE_MIN = 1;
export const RESERVER_PARTY_SIZE_MAX = 30;

/**
 * LA SALLE — couverts d'une table, et durée d'occupation (RDV-6).
 *
 * Miroirs des CHECK de 20261108120000 : `reservation_tables_seats_bound`
 * (1..30) et `reservation_activities_table_turn_bound` (15..600).
 *
 * Les couverts d'une table partagent leurs bornes avec l'effectif d'une
 * réservation, et ce n'est pas un hasard : une table plus grande que le plus
 * grand effectif acceptable ne servirait jamais entièrement. Elles restent
 * deux constantes parce qu'elles répondent à deux CHECK distincts — si l'un
 * bouge un jour sans l'autre, un alias les aurait fait mentir ensemble.
 */
export const RESERVER_TABLE_SEATS_MIN = 1;
export const RESERVER_TABLE_SEATS_MAX = 30;

/**
 * Combien de temps une table reste prise — 15 minutes à 10 heures.
 *
 * À NE PAS CONFONDRE avec `duration_minutes`, qui dit tous les combien on
 * propose une heure. Un service d'1 h 30 proposé toutes les 30 minutes donne
 * trois créneaux qui se chevauchent sur la même table : c'est le réglage
 * normal d'un restaurant, et `reserve_table` le gère par sa fenêtre
 * d'occupation. Fusionner les deux l'aurait interdit.
 */
/**
 * LE PAS DE GRILLE POSÉ À LA CRÉATION d'une prise de rendez-vous.
 *
 * Trente minutes : la valeur qui convient à un coiffeur comme à un
 * restaurant, et celle dont on s'écarte le moins souvent. Ce n'est PAS un
 * réglage — c'est ce qu'on écrit pour que la contrainte de complétude
 * accepte la ligne, en attendant que le commerçant tranche à l'étape
 * « durée de service ».
 */
export const RESERVER_PAS_GRILLE_DEFAUT = 30;

export const RESERVER_TABLE_TURN_MIN = 15;
export const RESERVER_TABLE_TURN_MAX = 600;
export const RESERVER_TABLE_TURN_DEFAUT = 90;

/**
 * LES COUVERTS QUI ATTENDENT, et non les lignes (RDV-9).
 *
 * « 3 personnes en attente » était exact tant qu'une inscription valait une
 * personne. Dans une SALLE, trois inscriptions peuvent valoir douze couverts
 * — et le commerçant qui lit « 3 » croit pouvoir les servir en libérant une
 * table de quatre.
 *
 * Une entrée TERMINÉE ne compte pas : `position` vaut 0 sur une entrée
 * convertie, expirée ou partie, exactement comme pour le rang affiché. Elle
 * n'attend plus, et la faire peser sur le compteur ferait voir une file qui
 * ne se vide jamais.
 *
 * Extraite du rendu plutôt que calculée sur place : une somme conditionnelle
 * écrite dans du JSX n'a aucun test, et ce dépôt a déjà payé ce raccourci une
 * fois (le bouton de partage, PR #223).
 */
export function couvertsEnAttente(
  entrees: ReadonlyArray<{ position: number; partySize: number }>,
): number {
  return entrees.reduce(
    (total, entree) =>
      entree.position > 0 ? total + Math.max(1, entree.partySize) : total,
    0,
  );
}

/** Longueur du nom d'une table — miroir du CHECK `char_length between 1 and 40`. */
export const RESERVER_TABLE_NAME_MAX = 40;

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

const ACTIVITY_KINDS: readonly ReserverActivityKind[] = [
  "standard",
  "signature",
  "duo",
];

const RESERVE_STATES: readonly ReserveSlotState[] = [
  "unavailable",
  "invalid_email",
  "full",
  "invalid_party_size",
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

/**
 * Format d'activité, ou `standard` — le REPLI LE PLUS FERMÉ ici, et c'est le
 * DÉFAUT SQL de la colonne : un format illisible se lit comme le socle, donc
 * une réservation d'UNE personne. Lire `duo` par défaut ferait réserver deux
 * places au premier document corrompu.
 */
export function asReserverActivityKind(value: unknown): ReserverActivityKind {
  const candidate = asString(value);
  return candidate && (ACTIVITY_KINDS as string[]).includes(candidate)
    ? (candidate as ReserverActivityKind)
    : "standard";
}

/** Une carte du Moment Signature — miroir de `is_valid_experience_steps`. */
export interface ReserverExperienceStep {
  title: string;
  body: string;
}

/**
 * Lit le `jsonb` `reservation_activities.steps`.
 *
 * DÉFENSIF ET SILENCIEUX : une carte sans titre ou sans corps est ÉCARTÉE, pas
 * complétée — la base la refuse déjà (`coalesce` de `is_valid_experience_steps`),
 * et une carte vide rendue à l'écran serait un trou dans une page qui promet
 * trois étapes. Le plafond est réappliqué ici : ce qui dépasse ne s'affiche
 * nulle part.
 */
export function mapExperienceSteps(raw: unknown): ReserverExperienceStep[] {
  return asArray(raw)
    .flatMap((entry) => {
      const item = asRecord(entry);
      const title = item ? asString(item.title)?.trim() : null;
      const body = item ? asString(item.body)?.trim() : null;
      if (!title || !body) return [];
      return [{ title, body } satisfies ReserverExperienceStep];
    })
    .slice(0, RESERVER_ACTIVITY_STEPS_MAX);
}

/**
 * L'UNITÉ DE RÉSERVATION D'UN FORMAT, en personnes — `case when kind = 'duo'
 * then 2 else 1 end`, la seule expression que les cinq RPC partagent.
 *
 * Elle est recopiée ici pour que l'écran DEMANDE la bonne taille, jamais pour
 * décider à la place de la base : `reserve_slot` la revérifie sous verrou et
 * refuse `invalid_party_size` si les deux divergent.
 */
export function placesParReservation(kind: ReserverActivityKind): number {
  return kind === "duo" ? 2 : 1;
}

/**
 * Combien de RÉSERVATIONS ENTIÈRES tiennent encore dans les places restantes.
 *
 * `null` hors d'un Atelier Duo, délibérément : sur les deux autres formats une
 * place restante EST une réservation possible, et rendre le même nombre deux
 * fois inviterait un écran à afficher « 3 places, 3 réservations possibles ».
 *
 * DIVISION ENTIÈRE, comme `reservation_offer_next` : sur un duo, une place libre
 * isolée n'est prenable par personne — l'afficher comme disponible enverrait
 * l'hôte se faire refuser.
 */
export function pairesRestantes(
  remaining: number,
  kind: ReserverActivityKind,
): number | null {
  if (kind !== "duo") return null;
  return Math.max(0, Math.floor(remaining / 2));
}

/**
 * Ce que le joueur lit sur la TAILLE de sa réservation.
 *
 * `null` à une personne, et ce n'est pas un oubli : « pour 1 personne » sur une
 * réservation ordinaire ajoute un mot à chaque ligne d'écran pour ne rien
 * apprendre. La mention n'existe que là où elle porte une information — l'hôte
 * d'un Atelier Duo doit pouvoir relire que son accompagnant a une place.
 */
export function libelleTaillePersonnes(partySize: number | null): string | null {
  return partySize !== null && partySize >= 2
    ? `pour ${partySize} personnes`
    : null;
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
  /**
   * Personnes que CETTE réservation occupe (RES-5). Rendue sur `reserved` et
   * sur `already_reserved` : l'hôte d'un Atelier Duo qui recharge sa page doit
   * relire « pour deux ».
   */
  partySize: number | null;
  /**
   * La taille QUE LE FORMAT EXIGE, rendue avec `invalid_party_size` — de quoi
   * dire « cet atelier se réserve à deux » plutôt qu'« indisponible ».
   */
  expectedPartySize: number | null;
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
    partySize: detenue && root ? asInt(root.party_size) : null,
    expectedPartySize:
      state === "invalid_party_size" && root ? asInt(root.expected) : null,
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
  /** Les quatre champs de `already_reserved`, mot pour mot ceux de `reserve_slot`. */
  reservationId: string | null;
  code: string | null;
  reservationStatus: ReservationStatus | null;
  /** Taille de la réservation déjà détenue (RES-5) — `already_reserved` seul. */
  reservationPartySize: number | null;
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
    reservationPartySize:
      state === "already_reserved" && root ? asInt(root.party_size) : null,
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
  /**
   * Personnes que la réservation créée occupe (RES-5) — l'UNITÉ DU FORMAT, pas
   * un choix : une offre sur un Atelier Duo tenait deux places, sa conversion
   * en prend deux. Rendue sur `claimed`, rejeu idempotent compris.
   */
  partySize: number | null;
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
    partySize: obtenue && root ? asInt(root.party_size) : null,
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
  /**
   * Personnes occupées (RES-5). L'invité d'un Atelier Duo vient à deux SANS
   * AVOIR À LE DIRE : la taille est une propriété du format, jamais un choix de
   * l'invité — la lui demander aurait ouvert un second chemin par lequel un
   * Atelier Duo se réserve à une personne.
   */
  partySize: number | null;
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
    partySize: detenue && root ? asInt(root.party_size) : null,
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
  /**
   * Personnes occupées par cette réservation (RES-5). Sa page ne lit pas la
   * table — elle lit ce document — et « Atelier Duo, samedi 14 h » sans le
   * nombre de personnes laisserait ouverte la seule question qui compte pour
   * l'hôte : est-ce que mon accompagnant a une place.
   *
   * Le REPLI EST 1, jamais 0 : une réservation occupe au moins une place, et un
   * document illisible ne doit pas faire disparaître une personne d'un compte.
   */
  partySize: number;
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
        partySize: asInt(item.party_size) ?? 1,
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
 *
 * ── « COMPLET » SE DIT EN RÉSERVATIONS POSSIBLES (RES-5) ──
 *
 * `kind` est FACULTATIF et vaut `standard` : les deux formats à une personne se
 * comportent exactement comme avant. Sur un Atelier Duo, en revanche, une place
 * libre isolée n'est prenable par personne — c'est le test de `waitlist_join`
 * (`taken + held + seats <= capacity`), et afficher « ouvert » dessus enverrait
 * l'hôte se faire refuser `full`.
 */
export function etatUiCreneau(
  creneau: {
    status: ReservationSlotStatus;
    startsAt: string;
    remaining: number;
    kind?: ReserverActivityKind;
  },
  now = new Date(),
): EtatUiCreneau {
  if (creneau.status !== "open") return "ferme";
  const debut = new Date(creneau.startsAt).getTime();
  if (!Number.isFinite(debut) || debut <= now.getTime()) return "passe";
  if (creneau.remaining < placesParReservation(creneau.kind ?? "standard")) {
    return "complet";
  }
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

// ════════════════════════════════════════════════════════════
// LA FILE SEREINE (RES-3, lot L6) — migration 20261005120000
//
// L'accueil EN CONTINU, et il ne faut pas le confondre avec la liste
// prioritaire ci-dessus : celle-là attend UN CRÉNEAU PRÉCIS et n'existe que
// parce qu'il est complet, celle-ci n'a AUCUN créneau — on pousse la porte, on
// scanne, on attend son tour. Deux objets, deux tables, aucun mapper partagé.
//
// ── AUCUN ETA, NULLE PART, ET SURTOUT PAS ICI ──
//
// Aucune des structures ci-dessous ne porte de durée, d'heure de passage ni de
// « environ N minutes », et ce n'est pas un manque à combler par une
// soustraction côté écran : rien dans cette base ne mesure le temps de service,
// donc toute estimation serait INVENTÉE — crue, puis démentie. Le rang et le
// nombre de personnes qui attendent sont tout ce que le module promet.
// ════════════════════════════════════════════════════════════

/** Libellé d'une file — 1..80, exactement le CHECK SQL. */
export const QUEUE_NAME_MAX = 80;

/**
 * Prénom d'appel au comptoir — 1..40, exactement le CHECK SQL.
 *
 * Il est TRONQUÉ et jamais refusé (`queue_join` le fait aussi) : c'est un
 * ornement d'écran, et faire échouer l'entrée en file d'une personne debout dans
 * le magasin parce que son prénom fait 41 caractères ferait payer à la file ce
 * qui ne la regarde pas.
 */
export const QUEUE_DISPLAY_NAME_MAX = 40;

/**
 * Borne de DÉFENSE sur le prénom reçu, avant la troncature.
 *
 * Elle ne dit rien du produit : elle empêche seulement de travailler (trim,
 * coupe) sur une chaîne non bornée choisie par l'appelant. Le refus qu'elle
 * produit n'est pas un refus métier — aucun prénom ne l'atteint.
 */
export const QUEUE_DISPLAY_NAME_INPUT_MAX = 2048;

/**
 * Plafond d'entrées VIVANTES (`waiting` + `called`) d'une file — `between 1 and
 * 200`, exactement le CHECK SQL.
 *
 * Sans lui, la seule borne serait une ligne par cookie — c'est-à-dire aucune —
 * et chaque ligne porte un prénom, une adresse et un consentement.
 */
export const QUEUE_MAX_LIVE_ENTRIES_MIN = 1;
export const QUEUE_MAX_LIVE_ENTRIES_MAX = 200;
/** Défaut SQL de `reservation_queues.max_live_entries`. */
export const QUEUE_MAX_LIVE_ENTRIES_DEFAUT = 50;

/** Statut d'une file — miroir du CHECK `reservation_queues.status`. */
export type ReservationQueueStatus = "open" | "paused" | "closed";

/**
 * Statut d'une entrée de file — miroir du CHECK
 * `reservation_queue_entries.status`.
 */
export type ReservationQueueEntryStatus =
  | "waiting"
  | "called"
  | "served"
  | "left"
  | "no_show";

/**
 * Issue que le comptoir peut CONSTATER — le vocabulaire fermé de
 * `queue_resolve`. `left` n'en fait pas partie : partir est un geste du joueur,
 * pas un constat du staff.
 */
export type QueueResolveOutcome = "served" | "no_show";

/** Issues de `queue_join`. */
export type QueueJoinState =
  | "unavailable"
  | "invalid_email"
  /**
   * La FILE est pleine — état distinct et NON muet, motif `waitlist_full` : il
   * ne révèle rien qu'un visiteur ne voie déjà, et « la file est complète,
   * revenez dans un moment » est actionnable là où « indisponible » ne l'est pas.
   */
  | "queue_full"
  | "already_waiting"
  | "waiting";

/** Issues de `queue_leave`. */
export type QueueLeaveState = "unknown" | "left" | "served" | "no_show";

/** Issues de `queue_call_next`. */
export type QueueCallNextState = "unknown" | "empty" | "called";

/** Issues de `queue_resolve`. */
export type QueueResolveState =
  | "unknown"
  /** Depuis `waiting` : servir sans avoir appelé saute le tour de tous ceux qui sont devant. */
  | "not_called"
  | "served"
  | "no_show"
  | "left";

/** Issues de `queue_reopen_entry`. */
export type QueueReopenState =
  | "unknown"
  | "waiting"
  | "served"
  | "no_show"
  | "left";

/** Issues de `queue_public_state`. */
export type QueuePublicKind = "unavailable" | "not_in_queue" | "in_queue";

const QUEUE_STATUSES: readonly ReservationQueueStatus[] = [
  "open",
  "paused",
  "closed",
];

const QUEUE_ENTRY_STATUSES: readonly ReservationQueueEntryStatus[] = [
  "waiting",
  "called",
  "served",
  "left",
  "no_show",
];

const QUEUE_JOIN_STATES: readonly QueueJoinState[] = [
  "unavailable",
  "invalid_email",
  "queue_full",
  "already_waiting",
  "waiting",
];

const QUEUE_LEAVE_STATES: readonly QueueLeaveState[] = [
  "unknown",
  "left",
  "served",
  "no_show",
];

const QUEUE_CALL_STATES: readonly QueueCallNextState[] = [
  "unknown",
  "empty",
  "called",
];

const QUEUE_RESOLVE_STATES: readonly QueueResolveState[] = [
  "unknown",
  "not_called",
  "served",
  "no_show",
  "left",
];

const QUEUE_REOPEN_STATES: readonly QueueReopenState[] = [
  "unknown",
  "waiting",
  "served",
  "no_show",
  "left",
];

const QUEUE_PUBLIC_KINDS: readonly QueuePublicKind[] = [
  "unavailable",
  "not_in_queue",
  "in_queue",
];

/**
 * Statut de file, ou `closed` — le REPLI LE PLUS FERMÉ. Un statut illisible ne
 * doit jamais faire croire qu'on peut encore entrer.
 */
export function asQueueStatus(value: unknown): ReservationQueueStatus {
  const candidate = asString(value);
  return candidate && (QUEUE_STATUSES as string[]).includes(candidate)
    ? (candidate as ReservationQueueStatus)
    : "closed";
}

/**
 * Statut d'entrée, ou `waiting` — le REPLI LE PLUS FERMÉ ici : c'est l'état
 * auquel RIEN N'EST DÛ. Lire `called` par défaut ferait crier « c'est à vous »
 * sur un document corrompu, et envoyer quelqu'un au comptoir devant les autres.
 */
export function asQueueEntryStatus(
  value: unknown,
): ReservationQueueEntryStatus {
  const candidate = asString(value);
  return candidate && (QUEUE_ENTRY_STATUSES as string[]).includes(candidate)
    ? (candidate as ReservationQueueEntryStatus)
    : "waiting";
}

export interface QueueJoinResult {
  state: QueueJoinState;
  /** Présent sur `waiting` et `already_waiting`. */
  entryId: string | null;
  entryStatus: ReservationQueueEntryStatus | null;
  /**
   * Rang, 1 = tête de file. `null` sur une entrée qui n'attend plus (appelée) :
   * « 0e » n'est pas un rang, et le SQL rend `null` pour cette raison.
   */
  position: number | null;
  /**
   * Nombre de personnes en attente. Rendu par le SEUL chemin qui INSÈRE : une
   * rejointe idempotente ne le porte pas — la RPC ne le recompte pas pour
   * quelqu'un qui a déjà sa place.
   */
  waitingCount: number | null;
  /** Horodatage de l'appel, s'il a déjà eu lieu (`already_waiting`). */
  calledAt: string | null;
  /** Plafond de la file, rendu avec `queue_full` — de quoi expliquer le refus. */
  capacity: number | null;
}

/**
 * Mappe le `jsonb` de `queue_join`.
 *
 * Même discipline que `mapReserveSlot` : `entryId` n'est retenu que pour les
 * deux états qui PROUVENT qu'une ligne appartient à cette identité.
 */
export function mapQueueJoin(raw: unknown): QueueJoinResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueueJoinState =
    stateRaw && (QUEUE_JOIN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QueueJoinState)
      : "unavailable";

  const dansLaFile = state === "waiting" || state === "already_waiting";

  return {
    state,
    entryId: dansLaFile && root ? asString(root.entry_id) : null,
    entryStatus: dansLaFile && root ? asQueueEntryStatus(root.status) : null,
    position: dansLaFile && root ? asInt(root.position) : null,
    waitingCount: state === "waiting" && root ? asInt(root.waiting_count) : null,
    calledAt: dansLaFile && root ? asString(root.called_at) : null,
    capacity: state === "queue_full" && root ? asInt(root.capacity) : null,
  };
}

export interface QueueLeaveResult {
  state: QueueLeaveState;
  entryId: string | null;
  /**
   * Horodatage de l'issue. Il est rendu AUSSI quand le comptoir a déjà tranché
   * (`served` / `no_show`) : la RPC rend l'issue telle quelle sans rien
   * réécrire, et l'écran doit pouvoir dire « vous êtes déjà passé ».
   */
  resolvedAt: string | null;
}

export function mapQueueLeave(raw: unknown): QueueLeaveResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueueLeaveState =
    stateRaw && (QUEUE_LEAVE_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QueueLeaveState)
      : "unknown";

  return {
    state,
    entryId: state === "unknown" || !root ? null : asString(root.entry_id),
    resolvedAt: state === "unknown" || !root ? null : asString(root.resolved_at),
  };
}

export interface QueueCallNextResult {
  state: QueueCallNextState;
  entryId: string | null;
  /**
   * Le prénom, POUR APPELER À VOIX HAUTE — le seul endroit du module où il
   * sort, et `null` est un cas parfaitement normal : la file fonctionne
   * entièrement sans lui.
   */
  displayName: string | null;
  calledAt: string | null;
  /** Combien attendent ENCORE, après cet appel. */
  waitingCount: number | null;
}

export function mapQueueCallNext(raw: unknown): QueueCallNextResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueueCallNextState =
    stateRaw && (QUEUE_CALL_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QueueCallNextState)
      : "unknown";

  const appele = state === "called";

  return {
    state,
    entryId: appele && root ? asString(root.entry_id) : null,
    displayName: appele && root ? asString(root.display_name) : null,
    calledAt: appele && root ? asString(root.called_at) : null,
    waitingCount: appele && root ? asInt(root.waiting_count) : null,
  };
}

export interface QueueResolveResult {
  state: QueueResolveState;
  entryId: string | null;
  resolvedAt: string | null;
}

export function mapQueueResolve(raw: unknown): QueueResolveResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueueResolveState =
    stateRaw && (QUEUE_RESOLVE_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QueueResolveState)
      : "unknown";

  return {
    state,
    entryId: state === "unknown" || !root ? null : asString(root.entry_id),
    // `not_called` ne porte AUCUN horodatage : rien n'a été tranché, et en
    // fabriquer un ferait apparaître une sortie qu'aucun écran ne montre.
    resolvedAt:
      state === "unknown" || state === "not_called" || !root
        ? null
        : asString(root.resolved_at),
  };
}

export interface QueueReopenResult {
  state: QueueReopenState;
  entryId: string | null;
  /**
   * Rang rendu par la réouverture, et il vaut 1 : `queue_call_next` avait pris
   * la PLUS ANCIENNE entrée en attente, et rien de plus ancien ne peut
   * apparaître après coup. La remise en tête est une conséquence, pas une
   * écriture — aucun rang n'est renuméroté.
   */
  position: number | null;
  /** Rendu sur une entrée terminale, qu'on ne rouvre pas. */
  resolvedAt: string | null;
}

export function mapQueueReopen(raw: unknown): QueueReopenResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueueReopenState =
    stateRaw && (QUEUE_REOPEN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QueueReopenState)
      : "unknown";

  return {
    state,
    entryId: state === "unknown" || !root ? null : asString(root.entry_id),
    position: state === "waiting" && root ? asInt(root.position) : null,
    resolvedAt:
      state === "waiting" || state === "unknown" || !root
        ? null
        : asString(root.resolved_at),
  };
}

export interface QueuePublicStateResult {
  state: QueuePublicKind;
  queueName: string | null;
  queueStatus: ReservationQueueStatus | null;
  /**
   * Combien de personnes ATTENDENT — les `called` n'en sont pas : elles sont au
   * comptoir. C'est ce qui rend le rang lisible (« 2e sur 5 »).
   */
  waitingCount: number;
  entryId: string | null;
  entryStatus: ReservationQueueEntryStatus | null;
  /** `null` dès que l'entrée n'attend plus — notamment quand elle est appelée. */
  position: number | null;
  joinedAt: string | null;
  /**
   * L'APPEL VOYAGE AVEC LE RANG, sur le même document : c'est ce qui permet à
   * l'écran de basculer sans aller chercher ailleurs (critère RES-3 « l'appel
   * staff prime sur tout autre écran »).
   */
  calledAt: string | null;
}

export function mapQueuePublicState(raw: unknown): QueuePublicStateResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QueuePublicKind =
    stateRaw && (QUEUE_PUBLIC_KINDS as string[]).includes(stateRaw)
      ? (stateRaw as QueuePublicKind)
      : "unavailable";

  const connue = state !== "unavailable";
  const dansLaFile = state === "in_queue";

  return {
    state,
    queueName: connue && root ? asString(root.queue_name) : null,
    queueStatus: connue && root ? asQueueStatus(root.queue_status) : null,
    waitingCount: connue && root ? (asInt(root.waiting_count) ?? 0) : 0,
    entryId: dansLaFile && root ? asString(root.entry_id) : null,
    entryStatus: dansLaFile && root ? asQueueEntryStatus(root.status) : null,
    position: dansLaFile && root ? asInt(root.position) : null,
    joinedAt: dansLaFile && root ? asString(root.joined_at) : null,
    calledAt: dansLaFile && root ? asString(root.called_at) : null,
  };
}

/** Une entrée vivante, vue de l'écran d'accueil. */
export interface QueueStaffEntryView {
  entryId: string;
  /** Le prénom, ou `null` — la file se rejoint sans rien donner de soi. */
  displayName: string | null;
  status: ReservationQueueEntryStatus;
  /** `null` sur une entrée appelée : elle n'attend plus. */
  position: number | null;
  /**
   * L'HEURE D'INSCRIPTION, ET C'EST LE RANG. `created_at` est `not null` en
   * base : une entrée qui n'en porterait pas serait un document corrompu, pas
   * une donnée manquante — et elle n'aurait aucune place lisible dans une liste
   * ordonnée. Le mapper l'écarte plutôt que d'inventer une date.
   */
  joinedAt: string;
  calledAt: string | null;
}

export interface QueueStaffQueueView {
  id: string;
  name: string;
  status: ReservationQueueStatus;
  maxLiveEntries: number;
  activityId: string | null;
  activityName: string | null;
}

export interface QueueStaffStateResult {
  ok: boolean;
  queue: QueueStaffQueueView | null;
  timezone: string;
  /** Les appelés d'abord, puis les attentes dans l'ordre exact du rang. */
  entries: QueueStaffEntryView[];
  live: { waiting: number; called: number };
  /**
   * Les trois issues du JOUR — le jour du FUSEAU DE L'ORGANISATION, tranché par
   * la RPC. C'est la seule mesure honnête qu'on tire d'une file sans mesurer le
   * temps (critère RES-3 « abandons et absences MESURÉS »).
   */
  today: { served: number; noShow: number; left: number };
}

const ETAT_FILE_INCONNU: QueueStaffStateResult = {
  ok: false,
  queue: null,
  timezone: RESERVER_FUSEAU_DEFAUT,
  entries: [],
  live: { waiting: 0, called: 0 },
  today: { served: 0, noShow: 0, left: 0 },
};

export function mapQueueStaffState(raw: unknown): QueueStaffStateResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return ETAT_FILE_INCONNU;

  const queueRaw = asRecord(root.queue);
  const queueId = queueRaw ? asString(queueRaw.id) : null;
  if (!queueRaw || !queueId) return ETAT_FILE_INCONNU;

  const live = asRecord(root.live);
  const today = asRecord(root.today);

  return {
    ok: true,
    queue: {
      id: queueId,
      name: asString(queueRaw.name) ?? "",
      status: asQueueStatus(queueRaw.status),
      maxLiveEntries:
        asInt(queueRaw.max_live_entries) ?? QUEUE_MAX_LIVE_ENTRIES_DEFAUT,
      activityId: asString(queueRaw.activity_id),
      activityName: asString(queueRaw.activity_name),
    },
    timezone: asString(root.timezone) ?? RESERVER_FUSEAU_DEFAUT,
    entries: asArray(root.entries).flatMap((entree) => {
      const item = asRecord(entree);
      const entryId = item ? asString(item.entry_id) : null;
      const joinedAt = item ? asString(item.joined_at) : null;
      // Sans identifiant NI sans heure d'inscription, la ligne n'a ni geste
      // possible ni place dans l'ordre : elle est écartée, pas complétée.
      if (!item || !entryId || !joinedAt) return [];
      return [
        {
          entryId,
          displayName: asString(item.display_name),
          status: asQueueEntryStatus(item.status),
          position: asInt(item.position),
          joinedAt,
          calledAt: asString(item.called_at),
        } satisfies QueueStaffEntryView,
      ];
    }),
    live: {
      waiting: (live && asInt(live.waiting)) ?? 0,
      called: (live && asInt(live.called)) ?? 0,
    },
    today: {
      served: (today && asInt(today.served)) ?? 0,
      noShow: (today && asInt(today.no_show)) ?? 0,
      left: (today && asInt(today.left)) ?? 0,
    },
  };
}

/** Ce que le joueur lit sur SA place dans la file d'accueil. */
export type EtatUiPlaceFile =
  | "attente"
  | "appele"
  | "servi"
  | "absent"
  | "parti";

/**
 * État affichable d'une place en file.
 *
 * ── `appele` EST TESTÉ EN PREMIER, ET C'EST LA RÈGLE ──
 *
 * Critère dur RES-3 : « l'appel staff prime sur tout autre écran ». L'entrée
 * appelée n'a plus de rang (`position` vaut `null` en SQL), et rien de ce que
 * l'écran affiche par ailleurs — un rang mémorisé, une animation d'attente —
 * ne doit pouvoir passer devant. Ce mapper LIT le statut tranché par le
 * serveur ; il ne le recalcule pas et n'en déduit rien d'une horloge locale.
 */
export function etatUiPlaceFile(entree: {
  status: ReservationQueueEntryStatus;
}): EtatUiPlaceFile {
  if (entree.status === "called") return "appele";
  if (entree.status === "served") return "servi";
  if (entree.status === "no_show") return "absent";
  if (entree.status === "left") return "parti";
  return "attente";
}

/** Ce que le commerçant et le joueur lisent sur l'ÉTAT DE LA FILE. */
export type EtatUiFile = "ouverte" | "en_pause" | "fermee";

export function etatUiFile(status: ReservationQueueStatus): EtatUiFile {
  if (status === "paused") return "en_pause";
  if (status === "closed") return "fermee";
  return "ouverte";
}

/**
 * La file accepte-t-elle une NOUVELLE arrivée ?
 *
 * `paused` ≠ `closed` du point de vue du COMPTOIR — la pause continue de
 * servir ceux qui sont là — mais les deux refusent l'ENTRÉE, et c'est ce que
 * cette fonction dit. L'activité liée coupée referme la file de la même façon,
 * exactement comme `queue_join` la referme (`coalesce(v_activity_active, true)`
 * : une file « Comptoir » n'a pas d'activité, et c'est le cas dominant).
 *
 * Elle ne remplace RIEN : la RPC reste seule juge, sous verrou. Cette fonction
 * ne sert qu'à choisir un libellé et à ne pas montrer un bouton sans issue.
 */
export function fileAccepteEntree(file: {
  status: ReservationQueueStatus;
  activiteActive: boolean;
}): boolean {
  return file.status === "open" && file.activiteActive;
}

/**
 * Ce que le joueur lit à la place d'un délai.
 *
 * Formulation VALIDÉE, et elle dit exactement pourquoi il n'y a pas d'ETA :
 * aucune mesure du temps de service n'existe, donc toute estimation serait
 * inventée. Une phrase partagée vaut mieux qu'un écran qui improvise « environ
 * 10 minutes » à partir d'un rang.
 */
export const LIBELLE_FILE_SANS_DELAI =
  "Votre rang se met à jour tout seul. Aucun délai n'est annoncé : nous " +
  "préférons ne rien promettre plutôt que d'annoncer une heure qui ne serait " +
  "pas tenue.";

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
 * Page publique d'une file d'accueil.
 *
 * MÊME CONTRAT que `cheminActiviteReserver`, et c'est ce QR-là qu'un commerçant
 * colle sur son comptoir : AUCUN jeton, AUCUNE empreinte, AUCUN identifiant
 * d'entrée dans l'adresse (ADR-109). C'est le cookie `lc-player` qui fait
 * retrouver au visiteur sa place — un lien photographié par le client suivant
 * n'emporte donc pas la place du précédent.
 */
export function cheminFileReserver(queueId: string): string {
  return `/reserver/file/${queueId}`;
}

/** La même adresse, absolue — c'est elle que le QR du comptoir encode. */
export function urlFileReserver(queueId: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminFileReserver(queueId)}`;
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

// ════════════════════════════════════════════════════════════
// LE MODE ATTENTE ACTIVE (RES-4, lot L7) — migration 20261006120000
//
// Une SESSION D'ATTENTE sépare strictement la file (ou la réservation) de
// l'animation proposée pendant qu'on patiente. Rien ici ne porte de rang, de
// compteur d'attente ni d'échéance, et ce n'est pas un oubli : les rendre
// ferait de la session une SECONDE source de vérité sur la file, c'est-à-dire
// exactement ce que la séparation interdit. Le rang a un seul chemin, et c'est
// `mapQueuePublicState` ci-dessus.
//
// ── LES TROIS ANIMATIONS NE SONT PAS DES MOTEURS NEUFS ──
//
// `quiz` est un `quizzes` existant, `pause` UNE participation offerte sur une
// `campaigns` existante — donc un `spins` ordinaire, un code de retrait
// ordinaire, remis EN CAISSE — et `activite` n'est qu'un LIEN. Aucune famille
// de récompense n'est inventée, aucune économie n'est ajoutée : le plafond est
// celui de la campagne que le commerçant a déjà dotée.
// ════════════════════════════════════════════════════════════

/**
 * D'où l'on attend. Les deux formes du produit — debout dans la file (RES-3) ou
 * un créneau confirmé en poche (RES-1) — et EXACTEMENT une par session, comme
 * le `num_nonnulls(…) = 1` de la table.
 */
export type ReserverWaitSource = "queue_entry" | "reservation";

const RESERVER_WAIT_SOURCES: readonly ReserverWaitSource[] = [
  "queue_entry",
  "reservation",
];

/** Issues de `wait_session_open`. */
export type WaitSessionOpenState = "unknown" | "open";

const WAIT_SESSION_OPEN_STATES: readonly WaitSessionOpenState[] = [
  "unknown",
  "open",
];

/**
 * La configuration de RETRAIT de la campagne de Pause Chance — ce que
 * `ClaimForm` doit demander avant d'afficher le code.
 *
 * ── POURQUOI ELLE EST REDÉCLARÉE ICI ET PAS IMPORTÉE DE `claim-form` ──
 *
 * `ClaimConfig` vit dans un composant `"use client"`. Ce module est lu par le
 * rendu serveur ; l'importer ferait remonter une dépendance d'écran dans une
 * couche qui ne doit connaître que des données. La forme est identique, donc
 * l'affectation est structurellement valide, et c'est le bon sens de la
 * dépendance : c'est l'écran qui accepte ce que le serveur lui donne.
 *
 * ── ELLE NE SE DEVINE PAS ──
 *
 * Elle valait `{ false, false, null }` en dur avant ce correctif, faute d'être
 * descendue. Or `campaigns.collect_email` vaut `true` PAR DÉFAUT : le retrait
 * automatique partait donc sans adresse, le serveur le refusait — et le lot
 * était déjà tiré, le stock déjà décompté. Un tour offert brûlé sans code.
 */
export interface ReserverPauseClaimConfig {
  collectEmail: boolean;
  collectPhone: boolean;
  codeTtlSeconds: number | null;
}

export interface WaitSessionOpenResult {
  state: WaitSessionOpenState;
  /** Présent sur `open` seulement — c'est lui qui PROUVE la session. */
  sessionId: string | null;
  source: ReserverWaitSource | null;
  /**
   * Quiz proposé, ou `null`. La RPC le met à `null` dès qu'il n'est plus
   * `active` : une animation qu'on ne peut pas jouer ne se propose pas.
   */
  quizId: string | null;
  /** Campagne de la Pause Chance, `null` par le même filtre de jouabilité. */
  pauseCampaignId: string | null;
  /**
   * Configuration de retrait de CETTE campagne. Indissociable d'elle : `null`
   * exactement quand `pauseCampaignId` l'est — une collecte sans lot à
   * réclamer n'a pas de sens, et la rendre quand même laisserait un écran
   * croire qu'il y a quelque chose à retirer.
   */
  pauseClaimConfig: ReserverPauseClaimConfig | null;
  /** ADRESSE de l'activité — de quoi construire le lien, rien de plus. */
  activityId: string | null;
  pauseChanceUsed: boolean;
}

/**
 * Mappe le `jsonb` de `wait_session_open`.
 *
 * Même discipline que `mapQueueJoin` : rien n'est retenu hors de l'état qui le
 * prouve. `unknown` couvre INDISTINCTEMENT une source inconnue, celle d'un
 * autre commerce, celle d'un autre joueur, une source morte et une organisation
 * sans le droit `vitrine` — les distinguer donnerait un oracle sur qui se
 * trouve dans le magasin d'en face.
 */
export function mapWaitSessionOpen(raw: unknown): WaitSessionOpenResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: WaitSessionOpenState =
    stateRaw && (WAIT_SESSION_OPEN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as WaitSessionOpenState)
      : "unknown";

  const ouverte = state === "open";
  const sourceRaw = ouverte && root ? asString(root.source) : null;
  const pauseCampaignId =
    ouverte && root ? asString(root.pause_campaign_id) : null;

  return {
    state,
    sessionId: ouverte && root ? asString(root.session_id) : null,
    source:
      sourceRaw && (RESERVER_WAIT_SOURCES as string[]).includes(sourceRaw)
        ? (sourceRaw as ReserverWaitSource)
        : null,
    quizId: ouverte && root ? asString(root.quiz_id) : null,
    pauseCampaignId,
    // ADOSSÉE À LA CAMPAGNE, jamais autonome : sans campagne il n'y a rien à
    // réclamer, donc rien à demander. La RPC rend les trois champs nuls dans ce
    // cas ; on n'en fabrique pas un objet de valeurs par défaut, qui serait
    // exactement la configuration inventée que ce correctif supprime.
    pauseClaimConfig: pauseCampaignId
      ? {
          collectEmail: asBool(root?.pause_collect_email) === true,
          collectPhone: asBool(root?.pause_collect_phone) === true,
          codeTtlSeconds: asInt(root?.pause_code_ttl_seconds),
        }
      : null,
    activityId: ouverte && root ? asString(root.activity_id) : null,
    pauseChanceUsed: ouverte && root ? asBool(root.pause_chance_used) === true : false,
  };
}

/** Issues de `wait_session_use_pause`. */
export type WaitUsePauseState =
  | "unknown"
  /**
   * Le commerçant n'a PAS configuré de Pause Chance. État propre et non muet :
   * il est actionnable côté écran (ne pas montrer le bouton), là où « inconnu »
   * ne l'est pas.
   */
  | "unconfigured"
  /**
   * DÉJÀ JOUÉE RÉCEMMENT À CE GUICHET, mais dans une AUTRE attente.
   *
   * Distinct d'`already_used`, et la nuance n'est pas cosmétique : le second
   * rend son jeton — c'est celui de CETTE session, et le taire punirait un
   * rechargement de page d'un tour perdu. Le premier ne peut pas : le jeton
   * appartient à une session précédente, et le faire voyager serait exactement
   * la confusion que la borne empêche. Le seau est de 24 h, par personne et par
   * file (ou activité) — sans lui, sortir de la file et y revenir fabriquait
   * une Pause Chance neuve à volonté.
   */
  | "cooldown"
  | "granted"
  | "already_used";

const WAIT_USE_PAUSE_STATES: readonly WaitUsePauseState[] = [
  "unknown",
  "unconfigured",
  "cooldown",
  "granted",
  "already_used",
];

export interface WaitUsePauseResult {
  state: WaitUsePauseState;
  sessionId: string | null;
  /** Campagne cible, venue du PARENT — jamais d'un paramètre d'appelant. */
  campaignId: string | null;
  /**
   * Jeton d'octroi, 48 hexadécimaux. Rendu AUSSI sur `already_used`, et c'est
   * voulu : c'est le SIEN, le rejeu est borné à l'étage d'en dessous
   * (`consume_reserver_wait_spin_grant` est idempotente), et le taire punirait
   * un rechargement de page d'un tour perdu.
   */
  grantToken: string | null;
  /** Tour déjà tiré avec ce jeton (`already_used`), s'il l'a été. */
  spinId: string | null;
}

export function mapWaitUsePause(raw: unknown): WaitUsePauseResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: WaitUsePauseState =
    stateRaw && (WAIT_USE_PAUSE_STATES as string[]).includes(stateRaw)
      ? (stateRaw as WaitUsePauseState)
      : "unknown";

  const octroyee = state === "granted" || state === "already_used";

  return {
    state,
    sessionId: octroyee && root ? asString(root.session_id) : null,
    campaignId: octroyee && root ? asString(root.campaign_id) : null,
    grantToken: octroyee && root ? asString(root.grant_token) : null,
    spinId: state === "already_used" && root ? asString(root.spin_id) : null,
  };
}

/**
 * Issues de `consume_reserver_wait_spin_grant` — miroir de
 * `ReferralSpinGrantState`, cinquième exemplaire du tour de roue offert.
 *
 * `no_prize` et `unavailable` NE BRÛLENT PAS le jeton : le joueur pourra
 * revenir quand le commerçant aura réapprovisionné.
 */
export type WaitSpinGrantState =
  | "unavailable"
  | "already_consumed"
  | "no_prize"
  | "spun";

const WAIT_SPIN_GRANT_STATES: readonly WaitSpinGrantState[] = [
  "unavailable",
  "already_consumed",
  "no_prize",
  "spun",
];

export interface WaitSpinGrantResult {
  state: WaitSpinGrantState;
  /** Tour produit (`spun`) ou déjà produit (`already_consumed`) ; `null` sinon. */
  spinId: string | null;
  wheelId: string | null;
  campaignId: string | null;
  prizeId: string | null;
  isLosing: boolean;
}

export function mapWaitSpinGrant(raw: unknown): WaitSpinGrantResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: WaitSpinGrantState =
    stateRaw && (WAIT_SPIN_GRANT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as WaitSpinGrantState)
      : "unavailable";

  return {
    state,
    spinId: root ? asString(root.spin_id) : null,
    wheelId: root ? asString(root.wheel_id) : null,
    campaignId: root ? asString(root.campaign_id) : null,
    prizeId: root ? asString(root.prize_id) : null,
    isLosing: root?.is_losing === true,
  };
}

/**
 * Ce que le joueur peut faire pendant qu'il attend. Trois valeurs, et aucune
 * n'est un moteur neuf — voir l'en-tête de section.
 */
export type AnimationAttente = "quiz" | "pause" | "activite";

/** Ce que le joueur lit du bouton « Pause Chance ». */
export type EtatUiPauseChance = "absente" | "disponible" | "utilisee";

/**
 * État affichable de la Pause Chance.
 *
 * `absente` N'EST PAS `utilisee` : le premier veut dire « le commerçant n'a rien
 * configuré » (le bouton n'existe pas), le second « c'est fait, une par session,
 * définitivement ». Confondre les deux ferait afficher « déjà joué » à quelqu'un
 * qui n'a jamais rien eu à jouer.
 */
export function etatUiPauseChance(session: {
  pauseCampaignId: string | null;
  pauseChanceUsed: boolean;
}): EtatUiPauseChance {
  if (!session.pauseCampaignId) return "absente";
  return session.pauseChanceUsed ? "utilisee" : "disponible";
}

/**
 * Les animations réellement PROPOSABLES, dans l'ordre d'affichage.
 *
 * La Pause Chance y figure même une fois consommée : l'écran doit pouvoir dire
 * « c'est fait » plutôt que de faire disparaître une tuile sous les doigts de
 * quelqu'un qui vient de cliquer. C'est `etatUiPauseChance` qui porte la
 * nuance, pas cette liste.
 */
export function animationsAttente(session: {
  quizId: string | null;
  pauseCampaignId: string | null;
  activityId: string | null;
}): AnimationAttente[] {
  const animations: AnimationAttente[] = [];
  if (session.quizId) animations.push("quiz");
  if (session.pauseCampaignId) animations.push("pause");
  if (session.activityId) animations.push("activite");
  return animations;
}

/** La session d'attente, telle qu'un écran la consomme. */
export interface ReserverAttenteView {
  sessionId: string;
  source: ReserverWaitSource;
  quizId: string | null;
  pauseCampaignId: string | null;
  /**
   * Ce que `ClaimForm` devra demander au gagnant. Voyage AVEC la campagne, et
   * l'écran n'a plus rien à supposer : c'est le correctif de la collecte muette.
   */
  pauseClaimConfig: ReserverPauseClaimConfig | null;
  activityId: string | null;
  pauseChanceUsed: boolean;
  pause: EtatUiPauseChance;
  /** Vide = rien à proposer, et l'écran d'attente reste ce qu'il était. */
  animations: AnimationAttente[];
}

/**
 * Vue d'écran d'une session ouverte, ou `null`.
 *
 * `null` sur TOUT ce qui n'est pas une session prouvée — `unknown`, mais aussi
 * un document `open` sans identifiant ni source, qui serait corrompu. L'appelant
 * n'a alors rien à afficher, et c'est exactement le comportement d'avant RES-4 :
 * le Mode Attente active est facultatif, son absence n'est pas une panne.
 */
export function vueAttente(
  session: WaitSessionOpenResult,
): ReserverAttenteView | null {
  if (session.state !== "open" || !session.sessionId || !session.source) {
    return null;
  }
  return {
    sessionId: session.sessionId,
    source: session.source,
    quizId: session.quizId,
    pauseCampaignId: session.pauseCampaignId,
    pauseClaimConfig: session.pauseClaimConfig,
    activityId: session.activityId,
    pauseChanceUsed: session.pauseChanceUsed,
    pause: etatUiPauseChance(session),
    animations: animationsAttente(session),
  };
}

// ════════════════════════════════════════════════════════════
// LA RÉSERVATION DE STOCK RÉEL ET LE DROP (RES-5, lot L9)
// migration 20261010120000
//
// N unités d'un objet PHYSIQUE, bloquées par des joueurs, retirées AU COMPTOIR
// dans une fenêtre annoncée. Trois choses à ne pas confondre avec le reste du
// module, et elles gouvernent tout ce qui suit.
//
// ── 1. LE RESTANT SE DÉDUIT, IL NE SE DÉCRÉMENTE PAS ──
//
// `remaining = stock_total − (prises « held » NON ÉCHUES + prises « redeemed »)`,
// calculé sous verrou par `hold_stock_offer`. Une prise expirée rend son unité
// par ARITHMÉTIQUE, sans qu'aucune ligne ne change d'état — donc exactement une
// fois. Aucun mapper d'ici ne recalcule ce nombre : il le LIT.
//
// ── 2. LE « DROP » N'EST PAS UN TYPE ──
//
// Une offre à fenêtre courte et proche EST un Drop ; une offre à fenêtre large
// est une réserve ordinaire. Aucun champ, aucun état d'écran ne le distingue —
// un booléen aurait créé une seconde vérité à tenir d'accord avec les dates.
//
// ── 3. LA PRISE EST OUVERTE DÈS `open`, LE RETRAIT SEUL EST BORNÉ ──
//
// On peut bloquer son croissant des heures avant l'ouverture de la fenêtre :
// c'est ce qui fait exister le Drop annoncé. C'est le RETRAIT qui est borné aux
// deux bouts — avant, la caisse refuse (`source_refused`) ; après, le registre
// universel refuse (`expired`).
// ════════════════════════════════════════════════════════════

/** Titre d'une offre — 1..120, exactement le CHECK SQL. */
export const RESERVER_STOCK_TITLE_MAX = 120;
/** Description facultative — 400, exactement le CHECK SQL. */
export const RESERVER_STOCK_DESCRIPTION_MAX = 400;
/**
 * Unités réellement mises de côté — `between 1 and 500`, exactement le CHECK
 * SQL. Le plancher est 1 : une offre à zéro unité n'est pas une offre fermée
 * (`status` dit cela), c'est une promesse sans objet.
 */
export const RESERVER_STOCK_TOTAL_MIN = 1;
export const RESERVER_STOCK_TOTAL_MAX = 500;
/**
 * Combien d'unités UNE personne peut bloquer — `between 1 and 3`, exactement le
 * CHECK SQL. Au-delà, une personne préempte un Drop entier et le partage cesse
 * d'en être un.
 */
export const RESERVER_STOCK_PER_PLAYER_MIN = 1;
export const RESERVER_STOCK_PER_PLAYER_MAX = 3;
/** Défaut SQL de `reservation_stock_offers.per_player_limit`. */
export const RESERVER_STOCK_PER_PLAYER_DEFAUT = 1;

/** Code de comptoir d'une prise — miroir du CHECK `…_holds.code`. */
export const RESERVER_STOCK_CODE_PATTERN = /^RESA-[A-HJ-NP-Z2-9]{8}$/;

/** Statut d'une offre — miroir du CHECK `reservation_stock_offers.status`. */
export type StockOfferStatus = "draft" | "open" | "closed";

/**
 * Statut d'une prise — miroir du CHECK `reservation_stock_holds.status`.
 *
 * `expired` EST DANS LA LISTE ET RIEN NE L'ÉCRIT en L9 : l'expiration est
 * arithmétique. La valeur est admise pour qu'un balayage explicite, s'il naît un
 * jour, ait un état où atterrir — et le mapper doit savoir le lire sans se
 * rabattre sur un défaut.
 */
export type StockHoldStatus = "held" | "redeemed" | "cancelled" | "expired";

/** États rendus par `hold_stock_offer`. */
export type HoldStockOfferState =
  | "held"
  | "already_held"
  | "sold_out"
  | "invalid_email"
  | "unavailable";

/** États rendus par `cancel_stock_hold`. */
export type CancelStockHoldState =
  | "cancelled"
  | "already_redeemed"
  | "too_late"
  | "unknown";

/** États rendus par `stock_offer_public_state`. */
export type StockOfferPublicKind = "ok" | "unavailable";

const STOCK_OFFER_STATUSES: readonly StockOfferStatus[] = [
  "draft",
  "open",
  "closed",
];

const STOCK_HOLD_STATUSES: readonly StockHoldStatus[] = [
  "held",
  "redeemed",
  "cancelled",
  "expired",
];

const HOLD_STATES: readonly HoldStockOfferState[] = [
  "held",
  "already_held",
  "sold_out",
  "invalid_email",
  "unavailable",
];

const CANCEL_HOLD_STATES: readonly CancelStockHoldState[] = [
  "cancelled",
  "already_redeemed",
  "too_late",
  "unknown",
];

/**
 * Statut d'offre, replié sur `draft` — le plus FERMÉ des trois.
 *
 * Un document illisible ne doit jamais faire afficher « ouverte » : le repli
 * fermé fait au pire disparaître un bouton, là où le repli ouvert ferait
 * promettre une prise que la base refusera.
 */
export function asStockOfferStatus(value: unknown): StockOfferStatus {
  const brut = asString(value);
  return brut && (STOCK_OFFER_STATUSES as string[]).includes(brut)
    ? (brut as StockOfferStatus)
    : "draft";
}

/** Statut de prise, replié sur `held` — l'état d'une prise vivante. */
export function asStockHoldStatus(value: unknown): StockHoldStatus {
  const brut = asString(value);
  return brut && (STOCK_HOLD_STATUSES as string[]).includes(brut)
    ? (brut as StockHoldStatus)
    : "held";
}

// ────────────────────────────────────────────────────────────
// `hold_stock_offer`
// ────────────────────────────────────────────────────────────

export interface HoldStockOfferResult {
  state: HoldStockOfferState;
  /** Présent sur `held` et `already_held`. */
  holdId: string | null;
  /** Code de comptoir `RESA-…`. Présent sur `held` et `already_held`. */
  code: string | null;
  /** Statut de la prise rendue par `already_held` (tenue, ou déjà retirée). */
  status: StockHoldStatus | null;
  /** Fenêtre de RETRAIT, rendue avec `held` — la promesse faite au joueur. */
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  /** Échéance GRAVÉE sur la prise (`held`) — jamais recalculée d'une parente. */
  redeemExpiresAt: string | null;
  /**
   * Restant APRÈS cette prise (`held`), et `0` sur `sold_out` — la RPC ne rend
   * rien d'autre dans ce cas, et il ne faut rien inventer de plus.
   */
  remaining: number | null;
  /** Plafond par personne, rendu avec `already_held` — de quoi expliquer. */
  perPlayerLimit: number | null;
}

/**
 * Mappe le `jsonb` de `hold_stock_offer`.
 *
 * `holdId` / `code` ne sont retenus que pour les deux états qui PROUVENT qu'une
 * unité appartient à ce joueur (`held`, `already_held`) : un `unavailable` qui
 * charrierait un code par accident le donnerait à quelqu'un qui ne tient rien —
 * et un code `RESA-` est un droit au porteur.
 */
export function mapHoldStockOffer(raw: unknown): HoldStockOfferResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: HoldStockOfferState =
    stateRaw && (HOLD_STATES as string[]).includes(stateRaw)
      ? (stateRaw as HoldStockOfferState)
      : "unavailable";

  const detenue = state === "held" || state === "already_held";

  return {
    state,
    holdId: detenue && root ? asString(root.hold_id) : null,
    code: detenue && root ? asString(root.code) : null,
    status:
      state === "already_held" && root
        ? asStockHoldStatus(root.status)
        : state === "held"
          ? "held"
          : null,
    windowStartsAt: state === "held" && root ? asString(root.window_starts_at) : null,
    windowEndsAt: state === "held" && root ? asString(root.window_ends_at) : null,
    redeemExpiresAt:
      state === "held" && root ? asString(root.redeem_expires_at) : null,
    // `sold_out` porte `remaining: 0` ET RIEN D'AUTRE — c'est tout ce que le
    // module sait du stock réel, et un oracle inventé se ferait démentir au
    // comptoir.
    remaining:
      (state === "held" || state === "sold_out") && root
        ? asInt(root.remaining)
        : null,
    perPlayerLimit:
      state === "already_held" && root ? asInt(root.per_player_limit) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `cancel_stock_hold`
// ────────────────────────────────────────────────────────────

export interface CancelStockHoldResult {
  state: CancelStockHoldState;
  holdId: string | null;
  cancelledAt: string | null;
  /** Échéance rendue avec `too_late` — de quoi expliquer le refus. */
  redeemExpiresAt: string | null;
}

export function mapCancelStockHold(raw: unknown): CancelStockHoldResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CancelStockHoldState =
    stateRaw && (CANCEL_HOLD_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CancelStockHoldState)
      : "unknown";

  return {
    state,
    holdId: state === "unknown" || !root ? null : asString(root.hold_id),
    cancelledAt: state === "cancelled" && root ? asString(root.cancelled_at) : null,
    redeemExpiresAt:
      state === "too_late" && root ? asString(root.redeem_expires_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `stock_offer_public_state`
// ────────────────────────────────────────────────────────────

/** La prise de CE navigateur sur cette offre, telle que la RPC la rend. */
export interface StockHoldMineView {
  holdId: string;
  code: string;
  status: StockHoldStatus;
  /** Les DEUX bornes gravées à la prise (doctrine 20260904120000) : c'est
   *  elles que le comptoir applique, pas la fenêtre courante de l'offre —
   *  une réédition de fenêtre ne change pas le sort d'une prise consentie. */
  redeemNotBefore: string | null;
  redeemExpiresAt: string | null;
}

export interface StockOfferPublicStateResult {
  state: StockOfferPublicKind;
  offerId: string | null;
  title: string | null;
  description: string | null;
  status: StockOfferStatus | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  perPlayerLimit: number | null;
  /**
   * Restant HONNÊTE mais NON VERROUILLÉ : c'est une PHOTO, jamais une
   * réservation. Entre cette lecture et l'appel à `hold_stock_offer`, le nombre
   * peut tomber à zéro — la RPC de prise, sous verrou, décide seule.
   */
  remaining: number;
  /** `null` sans cookie, ou si ce navigateur ne tient rien sur cette offre. */
  myHold: StockHoldMineView | null;
}

const OFFRE_INDISPONIBLE: StockOfferPublicStateResult = {
  state: "unavailable",
  offerId: null,
  title: null,
  description: null,
  status: null,
  windowStartsAt: null,
  windowEndsAt: null,
  perPlayerLimit: null,
  remaining: 0,
  myHold: null,
};

export function mapStockOfferPublicState(
  raw: unknown,
): StockOfferPublicStateResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return OFFRE_INDISPONIBLE;
  const offerId = asString(root.offer_id);
  // Un document « ok » sans offre est corrompu, pas incomplet : il n'y a rien à
  // afficher et rien à réserver. On rend l'indisponible plutôt que d'inventer.
  if (!offerId) return OFFRE_INDISPONIBLE;

  const mien = asRecord(root.my_hold);
  const holdId = mien ? asString(mien.hold_id) : null;
  const code = mien ? asString(mien.code) : null;

  return {
    state: "ok",
    offerId,
    title: asString(root.title),
    description: asString(root.description),
    status: asStockOfferStatus(root.status),
    windowStartsAt: asString(root.window_starts_at),
    windowEndsAt: asString(root.window_ends_at),
    perPlayerLimit: asInt(root.per_player_limit),
    remaining: asInt(root.remaining) ?? 0,
    myHold:
      mien && holdId && code
        ? {
            holdId,
            code,
            status: asStockHoldStatus(mien.status),
            redeemNotBefore: asString(mien.redeem_not_before),
            redeemExpiresAt: asString(mien.redeem_expires_at),
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// `stock_offers_staff_state`
// ────────────────────────────────────────────────────────────

/** Une offre et ses compteurs, vue du comptoir. */
export interface StockOfferStaffView {
  offerId: string;
  title: string;
  /**
   * RENDUE PARCE QUE LE PANNEAU LA RÉÉCRIT, et pas pour l'afficher.
   *
   * Le formulaire d'édition poste tous les champs de l'offre : sans cette
   * valeur à préremplir, le champ partait vide et le premier enregistrement
   * EFFAÇAIT la description. Une liste de lecture peut se passer d'un texte
   * long ; un formulaire qui le réécrit, jamais.
   */
  description: string | null;
  status: StockOfferStatus;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  stockTotal: number;
  perPlayerLimit: number;
  /** Prises tenues MAINTENANT (`held` non échues). */
  heldCount: number;
  redeemedCount: number;
  /**
   * Prises ÉTEINTES SANS RETRAIT — entièrement DÉRIVÉ, aucune ligne ne porte cet
   * état. C'est la mesure du gaspillage évité qui ne l'a pas été : combien de
   * gens ont bloqué leur part sans venir la chercher.
   */
  expiredCount: number;
  cancelledCount: number;
  remaining: number;
}

export interface StockOffersStaffStateResult {
  ok: boolean;
  offers: StockOfferStaffView[];
}

const ETAT_OFFRES_INCONNU: StockOffersStaffStateResult = {
  ok: false,
  offers: [],
};

export function mapStockOffersStaffState(
  raw: unknown,
): StockOffersStaffStateResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return ETAT_OFFRES_INCONNU;

  return {
    ok: true,
    offers: asArray(root.offers).flatMap((brut) => {
      const item = asRecord(brut);
      const offerId = item ? asString(item.offer_id) : null;
      // Sans identifiant, la ligne n'a ni geste possible ni clé de rendu : elle
      // est écartée, jamais complétée par une valeur inventée.
      if (!item || !offerId) return [];
      const stockTotal = asInt(item.stock_total) ?? 0;
      return [
        {
          offerId,
          title: asString(item.title) ?? "",
          description: asString(item.description),
          status: asStockOfferStatus(item.status),
          windowStartsAt: asString(item.window_starts_at),
          windowEndsAt: asString(item.window_ends_at),
          stockTotal,
          perPlayerLimit:
            asInt(item.per_player_limit) ?? RESERVER_STOCK_PER_PLAYER_DEFAUT,
          heldCount: asInt(item.held_count) ?? 0,
          redeemedCount: asInt(item.redeemed_count) ?? 0,
          expiredCount: asInt(item.expired_count) ?? 0,
          cancelledCount: asInt(item.cancelled_count) ?? 0,
          remaining: asInt(item.remaining) ?? 0,
        } satisfies StockOfferStaffView,
      ];
    }),
  };
}

// ────────────────────────────────────────────────────────────
// États d'écran — ils LISENT ce que le serveur a tranché
// ────────────────────────────────────────────────────────────

/** Ce que le joueur lit sur SA prise. */
export type EtatUiPriseStock = "tenue" | "retiree" | "annulee" | "expiree";

/**
 * État affichable d'une prise.
 *
 * ── L'EXPIRATION EST LA SEULE CHOSE QUI SE DÉDUIT ICI, ET ELLE SE DÉDUIT DE
 * L'ÉCHÉANCE GRAVÉE ──
 *
 * Aucun chemin n'écrit `status = 'expired'` : une prise `held` dont la fenêtre
 * est passée cesse simplement d'être comptée. L'écran doit pourtant dire au
 * joueur que son unité est repartie — d'où cette lecture, qui compare l'échéance
 * GRAVÉE SUR LA PRISE à `maintenant`, et jamais la fenêtre courante de l'offre :
 * un commerçant qui décale sa fenêtre ne doit pas déplacer l'échéance de prises
 * déjà consenties.
 *
 * `retiree` prime sur tout : l'objet est sorti du magasin, et aucune horloge ne
 * défait ce fait.
 */
export function etatUiPriseStock(
  prise: { status: StockHoldStatus; redeemExpiresAt: string | null },
  maintenant: Date = new Date(),
): EtatUiPriseStock {
  if (prise.status === "redeemed") return "retiree";
  if (prise.status === "cancelled") return "annulee";
  if (prise.status === "expired") return "expiree";
  if (
    prise.redeemExpiresAt &&
    new Date(prise.redeemExpiresAt).getTime() <= maintenant.getTime()
  ) {
    return "expiree";
  }
  return "tenue";
}

/** Ce que le commerçant et le joueur lisent sur l'ÉTAT D'UNE OFFRE. */
export type EtatUiOffreStock =
  | "brouillon"
  | "ouverte"
  | "epuisee"
  | "passee"
  | "fermee";

/**
 * État affichable d'une offre.
 *
 * ORDRE DES TESTS, ET IL COMPTE. `brouillon` et `fermee` sont des DÉCISIONS du
 * commerçant : elles priment sur tout le reste, y compris sur une fenêtre
 * passée — « fermée » dit ce qu'il a fait, « passée » dirait ce que le temps a
 * fait. Vient ensuite la fenêtre (une offre ouverte dont la fenêtre est écoulée
 * n'accepte plus rien), puis l'épuisement.
 *
 * Le restant vient du SERVEUR : ce mapper ne le recalcule pas et n'a aucun moyen
 * de le faire — la seule autorité est `hold_stock_offer`, sous verrou.
 */
export function etatUiOffreStock(
  offre: {
    status: StockOfferStatus;
    windowEndsAt: string | null;
    remaining: number;
  },
  maintenant: Date = new Date(),
): EtatUiOffreStock {
  if (offre.status === "draft") return "brouillon";
  if (offre.status === "closed") return "fermee";
  if (
    offre.windowEndsAt &&
    new Date(offre.windowEndsAt).getTime() <= maintenant.getTime()
  ) {
    return "passee";
  }
  if (offre.remaining <= 0) return "epuisee";
  return "ouverte";
}

/**
 * L'offre accepte-t-elle une NOUVELLE prise ?
 *
 * INDICATIF, comme `fileAccepteEntree` : `hold_stock_offer` reste seule juge,
 * sous verrou, et c'est elle qui voit le restant réel. Cette fonction sert à
 * choisir un libellé de bouton, jamais à autoriser.
 *
 * LA PRISE EST OUVERTE DÈS `open`, y compris AVANT le début de la fenêtre : rien
 * ici ne regarde `window_starts_at`, et c'est le point du Drop annoncé.
 */
export function offreAccepteePrise(
  offre: {
    status: StockOfferStatus;
    windowEndsAt: string | null;
    remaining: number;
  },
  maintenant: Date = new Date(),
): boolean {
  return etatUiOffreStock(offre, maintenant) === "ouverte";
}

/**
 * Libellé de la FENÊTRE DE RETRAIT, dans le fuseau de l'établissement.
 *
 * Les DEUX bornes sont datées en entier, contrairement à `formatCreneau` qui
 * n'affiche que l'heure de fin : une fenêtre de retrait peut franchir minuit (un
 * Drop de fin de journée relevé le lendemain matin), et « 12 avr. 2026, 18:00 –
 * 10:00 » se lirait comme une fenêtre qui remonte le temps.
 */
export function formatFenetreStock(
  windowStartsAt: string | Date,
  windowEndsAt: string | Date,
  timeZone: string,
): string {
  return `du ${formatDate(windowStartsAt, timeZone)} au ${formatDate(windowEndsAt, timeZone)}`;
}

/**
 * Ce que la caisse dit d'un code `RESA-` présenté TROP TÔT.
 *
 * ── POURQUOI CE MESSAGE EXISTE ICI ET PAS DANS LE REGISTRE ──
 *
 * La borne BASSE de la fenêtre ne vit que dans le bras source
 * (`redeem_stock_hold`) : le registre universel n'a pas de mot pour « trop
 * tôt », et lui en inventer un aurait donné au registre une seconde sémantique
 * temporelle pour UNE famille sur dix. Le routeur rend donc `source_refused` —
 * un état qui, pour les neuf autres familles, se traduit par « ce lot ne peut
 * pas être remis ». Sur cette famille-ci, c'est FAUX et décourageant : le lot
 * est parfaitement valide, il n'est simplement pas l'heure. Le comptoir doit
 * lire la fenêtre, pas un refus opaque.
 */
export function libelleRetraitTropTot(fenetre: string): string {
  return `Retrait pas encore ouvert — fenêtre : ${fenetre}`;
}

/**
 * Page publique d'une offre de stock.
 *
 * MÊME CONTRAT que `cheminFileReserver` : c'est ce QR-là qu'un commerçant colle
 * sur sa vitrine ou publie pour un Drop, et il n'emporte AUCUN jeton, AUCUNE
 * empreinte, AUCUN code (ADR-109). C'est le cookie `lc-player` qui fait
 * retrouver au visiteur SA prise — un lien photographié ou repartagé n'emporte
 * donc pas l'unité de celui qui l'a bloquée.
 */
export function cheminOffreStock(offerId: string): string {
  return `/reserver/stock/${offerId}`;
}

/** La même adresse, absolue — pour le QR du Drop et l'email de confirmation. */
export function urlOffreStock(offerId: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminOffreStock(offerId)}`;
}
