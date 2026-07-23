/**
 * Cœur métier « pur » du module Calendrier / campagnes quotidiennes : mapping
 * des jsonb renvoyés par les RPC service_role (join_calendar, open_calendar_box,
 * consume_calendar_spin_grant, calendar_public_state) vers des résultats typés
 * pour l'UI. Fonctions testables sans accès base ni imports server-only (miroir
 * de src/lib/event.ts, src/lib/jackpot.ts et src/lib/loyalty.ts).
 *
 * INVARIANT DE SÉCURITÉ #2 (voir migration 20260728120000) : le contenu d'une
 * case (message, libellé de lot, code, jeton de spin) ne fuit JAMAIS dans un
 * payload joueur avant que CE joueur l'ait ouverte. Ce module ne lit le contenu
 * d'une case de `calendar_public_state` QUE lorsque son statut vaut 'opened' —
 * défense en profondeur redoublant le filtrage déjà opéré par la RPC (qui
 * n'expose {day_index, unlock_at, status, is_special} pour une case non ouverte).
 */

import type {
  CalendarContentType,
  CalendarJoinState,
  CalendarOpenState,
  CalendarSpinGrantState,
  CalendarTheme,
} from "@/types/database";

// ────────────────────────────────────────────────────────────
// Helpers défensifs (aucune confiance dans la forme du jsonb)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const CALENDAR_THEMES: readonly CalendarTheme[] = [
  "noel",
  "anniversaire",
  "soldes",
  "festival",
  "neutre",
];

function asTheme(value: unknown): CalendarTheme {
  return CALENDAR_THEMES.includes(value as CalendarTheme)
    ? (value as CalendarTheme)
    : "neutre";
}

function asContentType(value: unknown): CalendarContentType {
  return value === "lot" ? "lot" : value === "spin" ? "spin" : "content";
}

// ────────────────────────────────────────────────────────────
// join_calendar
// ────────────────────────────────────────────────────────────

export interface CalendarJoinResult {
  state: CalendarJoinState;
  /** Calendrier rejoint (null hors `joined`). */
  calendar: {
    id: string;
    name: string;
    theme: CalendarTheme;
    dayCount: number;
    merchantContent: string | null;
  } | null;
  /** Joueur créé/rejoint (null hors `joined`). */
  player: {
    id: string;
    openedCount: number;
    marketingOptIn: boolean;
    reminderOptIn: boolean;
    hasEmail: boolean;
  } | null;
}

const JOIN_STATES: readonly CalendarJoinState[] = ["unavailable", "joined"];

export function mapCalendarJoin(raw: unknown): CalendarJoinResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CalendarJoinState =
    stateRaw && (JOIN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CalendarJoinState)
      : "unavailable";

  const calRec = root ? asRecord(root.calendar) : null;
  const playerRec = root ? asRecord(root.player) : null;

  return {
    state,
    calendar:
      state === "joined" && calRec
        ? {
            id: asString(calRec.id) ?? "",
            name: asString(calRec.name) ?? "",
            theme: asTheme(calRec.theme),
            dayCount: asInt(calRec.day_count) ?? 0,
            merchantContent: asString(calRec.merchant_content),
          }
        : null,
    player:
      state === "joined" && playerRec
        ? {
            id: asString(playerRec.id) ?? "",
            openedCount: asInt(playerRec.opened_count) ?? 0,
            marketingOptIn: playerRec.marketing_opt_in === true,
            reminderOptIn: playerRec.reminder_opt_in === true,
            hasEmail: playerRec.has_email === true,
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// open_calendar_box
// ────────────────────────────────────────────────────────────

/** Case ouverte par le joueur — reflète l'ouverture (opened / already_opened). */
export interface CalendarOpenedDay {
  id: string;
  dayIndex: number;
  contentType: CalendarContentType;
  unlockAt: string | null;
  /** content : message affiché (null hors 'content'). */
  contentText: string | null;
  /** lot : libellé / détails du lot (null hors 'lot'). */
  rewardLabel: string | null;
  rewardDetails: string | null;
  /** lot : code de retrait CADEAU-… (null si rupture ou hors 'lot'). */
  code: string | null;
  /** spin : jeton à consommer sur la roue offerte (null hors 'spin'). */
  spinGrantToken: string | null;
  /** spin : roue cible du tour offert (null hors 'spin'). */
  targetWheelId: string | null;
  /** lot en rupture de stock à l'ouverture : aucun code émis. */
  outOfStock: boolean;
}

/** Récompense d'assiduité débloquée par cette ouverture (completion). */
export interface CalendarCompletion {
  rewarded: boolean;
  code: string | null;
  outOfStock: boolean;
}

export interface CalendarOpenResult {
  state: CalendarOpenState;
  /** Case ouverte (opened / already_opened) — null sinon. */
  day: CalendarOpenedDay | null;
  /** Progression après ouverture (opened / already_opened) — null sinon. */
  progression: { openedCount: number; dayCount: number } | null;
  /** Récompense d'assiduité (opened uniquement) — null sinon. */
  completion: CalendarCompletion | null;
  /** too_early : instant de déverrouillage à afficher (« revenez le … »). */
  unlockAt: string | null;
}

const OPEN_STATES: readonly CalendarOpenState[] = [
  "unavailable",
  "too_early",
  "opened",
  "already_opened",
];

/** Case ouverte : le contenu est celui du joueur lui-même, exposé complet. */
function mapOpenedDay(dayRec: Record<string, unknown>, root: Record<string, unknown>): CalendarOpenedDay {
  const contentType = asContentType(dayRec.content_type);
  return {
    id: asString(dayRec.id) ?? "",
    dayIndex: asInt(dayRec.day_index) ?? 0,
    contentType,
    unlockAt: asString(dayRec.unlock_at),
    contentText: contentType === "content" ? asString(root.content_text) : null,
    rewardLabel: contentType === "lot" ? asString(root.reward_label) : null,
    rewardDetails: contentType === "lot" ? asString(root.reward_details) : null,
    code: asString(root.code),
    spinGrantToken: asString(root.spin_grant_token),
    targetWheelId: contentType === "spin" ? asString(root.target_wheel_id) : null,
    outOfStock: root.out_of_stock === true,
  };
}

/**
 * Convertit le jsonb d'open_calendar_box en résultat typé, sans jamais faire
 * confiance à sa forme. Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapCalendarOpen(raw: unknown): CalendarOpenResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CalendarOpenState =
    stateRaw && (OPEN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CalendarOpenState)
      : "unavailable";

  const dayRec = root ? asRecord(root.day) : null;
  const progRec = root ? asRecord(root.progression) : null;
  const completionRec = root ? asRecord(root.completion) : null;

  const opened = state === "opened" || state === "already_opened";

  return {
    state,
    day: opened && dayRec ? mapOpenedDay(dayRec, root!) : null,
    progression:
      opened && progRec
        ? {
            openedCount: asInt(progRec.opened_count) ?? 0,
            dayCount: asInt(progRec.day_count) ?? 0,
          }
        : null,
    completion:
      state === "opened" && completionRec
        ? {
            rewarded: completionRec.rewarded === true,
            code: asString(completionRec.code),
            outOfStock: completionRec.out_of_stock === true,
          }
        : null,
    // too_early expose l'instant de déverrouillage (au niveau racine et day).
    unlockAt:
      state === "too_early"
        ? asString(root?.unlock_at) ?? (dayRec ? asString(dayRec.unlock_at) : null)
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// consume_calendar_spin_grant (miroir de mapLoyaltySpinGrant)
// ────────────────────────────────────────────────────────────

export interface CalendarSpinGrantResult {
  state: CalendarSpinGrantState;
  /** Spin produit (spun) ou déjà produit (already_consumed) ; null sinon. */
  spinId: string | null;
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
}

const SPIN_GRANT_STATES: readonly CalendarSpinGrantState[] = [
  "unavailable",
  "already_consumed",
  "no_prize",
  "spun",
];

export function mapCalendarSpinGrant(raw: unknown): CalendarSpinGrantResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CalendarSpinGrantState =
    stateRaw && (SPIN_GRANT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CalendarSpinGrantState)
      : "unavailable";

  return {
    state,
    spinId: root ? asString(root.spin_id) : null,
    wheelId: root ? asString(root.wheel_id) : null,
    prizeId: root ? asString(root.prize_id) : null,
    isLosing: root?.is_losing === true,
  };
}

// ────────────────────────────────────────────────────────────
// calendar_public_state — LA source unique de l'état public (page + polling)
// ────────────────────────────────────────────────────────────

/**
 * Case telle que servie sur la page publique. Pour une case NON ouverte par le
 * joueur (`status` locked/available), SEULS day_index / unlock_at / status /
 * is_special sont renseignés — aucun contenu (invariant #2). Les champs de
 * contenu ne sont peuplés que pour une case `opened` par ce joueur.
 */
export interface CalendarPublicDay {
  dayIndex: number;
  unlockAt: string | null;
  status: "locked" | "available" | "opened";
  isSpecial: boolean;
  contentType: CalendarContentType | null;
  contentText: string | null;
  rewardLabel: string | null;
  rewardDetails: string | null;
  code: string | null;
  spinGrantToken: string | null;
  targetWheelId: string | null;
  resultingSpinId: string | null;
  outOfStock: boolean;
}

export interface CalendarPublicState {
  state: "ok" | "unavailable";
  calendar: {
    id: string;
    name: string;
    theme: CalendarTheme;
    status: string;
    dayCount: number;
    merchantContent: string | null;
    completionRewardLabel: string;
    completionRewardDetails: string | null;
  } | null;
  days: CalendarPublicDay[];
  progression: { openedCount: number; dayCount: number };
  /** Récompense d'assiduité du joueur courant (son code) — null sinon. */
  completionReward: { code: string; redeemedAt: string | null } | null;
}

function asDayStatus(value: unknown): "locked" | "available" | "opened" {
  return value === "opened" ? "opened" : value === "available" ? "available" : "locked";
}

/**
 * Mappe une case. Le contenu (content_type, texte, libellé, code, jeton) n'est
 * lu QUE pour une case `opened` — pour toute autre, il est forcé à null quoi
 * qu'ait renvoyé la RPC (invariant #2, défense en profondeur : une case non
 * ouverte ne peut jamais laisser fuir son contenu vers le navigateur joueur).
 */
function mapPublicDay(raw: unknown): CalendarPublicDay | null {
  const d = asRecord(raw);
  if (!d) return null;
  const status = asDayStatus(d.status);
  const opened = status === "opened";
  const contentType = opened ? asContentType(d.content_type) : null;
  return {
    dayIndex: asInt(d.day_index) ?? 0,
    unlockAt: asString(d.unlock_at),
    status,
    isSpecial: d.is_special === true,
    contentType,
    contentText: opened && contentType === "content" ? asString(d.content_text) : null,
    rewardLabel: opened && contentType === "lot" ? asString(d.reward_label) : null,
    rewardDetails: opened && contentType === "lot" ? asString(d.reward_details) : null,
    code: opened ? asString(d.code) : null,
    spinGrantToken: opened ? asString(d.spin_grant_token) : null,
    targetWheelId: opened && contentType === "spin" ? asString(d.target_wheel_id) : null,
    resultingSpinId: opened ? asString(d.resulting_spin_id) : null,
    outOfStock: opened ? d.out_of_stock === true : false,
  };
}

/**
 * Convertit le jsonb de calendar_public_state en état typé, sans jamais faire
 * confiance à sa forme. Un jsonb non reconnu (ou state ≠ ok) retombe sur
 * `unavailable` neutre.
 */
export function mapCalendarPublicState(raw: unknown): CalendarPublicState {
  const root = asRecord(raw);
  const calRec = root ? asRecord(root.calendar) : null;

  if (!root || asString(root.state) !== "ok" || !calRec) {
    return {
      state: "unavailable",
      calendar: null,
      days: [],
      progression: { openedCount: 0, dayCount: 0 },
      completionReward: null,
    };
  }

  const progRec = asRecord(root.progression);
  const rewardRec = asRecord(root.completion_reward);
  const rewardCode = rewardRec ? asString(rewardRec.code) : null;

  return {
    state: "ok",
    calendar: {
      id: asString(calRec.id) ?? "",
      name: asString(calRec.name) ?? "",
      theme: asTheme(calRec.theme),
      status: asString(calRec.status) ?? "",
      dayCount: asInt(calRec.day_count) ?? 0,
      merchantContent: asString(calRec.merchant_content),
      completionRewardLabel: asString(calRec.completion_reward_label) ?? "",
      completionRewardDetails: asString(calRec.completion_reward_details),
    },
    days: asArray(root.days).flatMap((entry) => {
      const day = mapPublicDay(entry);
      return day ? [day] : [];
    }),
    progression: {
      openedCount: (progRec ? asInt(progRec.opened_count) : null) ?? 0,
      dayCount: (progRec ? asInt(progRec.day_count) : null) ?? 0,
    },
    completionReward: rewardRec && rewardCode
      ? { code: rewardCode, redeemedAt: asString(rewardRec.redeemed_at) }
      : null,
  };
}

// ────────────────────────────────────────────────────────────
// Génération des jours (pur, testable) — dérive unlock_at par case
// ────────────────────────────────────────────────────────────

/**
 * Instant de déverrouillage (UTC/ISO) du début du jour civil `start_date + offset`
 * dans le fuseau `timezone`. SERVEUR-AUTORITATIF : c'est la source de vérité du
 * gating (open_calendar_box compare `now() >= unlock_at`). Le calcul est fait
 * une fois à la création / à la modification de start_date|day_count|timezone,
 * jamais côté client.
 *
 * Méthode : on prend la date civile cible (start_date décalée de `offsetDays`),
 * puis on cherche l'instant absolu dont la représentation dans `timezone` est
 * exactement minuit ce jour-là. On détermine l'offset UTC du fuseau à cette date
 * via Intl (formatToParts) et on l'applique — robuste aux changements d'heure
 * (l'offset est réévalué pour CHAQUE jour, pas figé au 1er).
 */
export function calendarDayUnlockAt(
  startDate: string,
  offsetDays: number,
  timeZone: string,
): Date {
  // Date civile cible : start_date (YYYY-MM-DD) + offsetDays, en arithmétique
  // de calendrier pure (UTC pour éviter toute dérive DST sur l'ajout de jours).
  const [y, m, d] = startDate.split("-").map((p) => Number.parseInt(p, 10));
  const civil = new Date(Date.UTC(y, m - 1, d));
  civil.setUTCDate(civil.getUTCDate() + offsetDays);

  const year = civil.getUTCFullYear();
  const month = civil.getUTCMonth() + 1;
  const day = civil.getUTCDate();

  // Instant absolu du minuit civil de ce jour DANS le fuseau : on part de
  // minuit UTC puis on corrige de l'offset du fuseau évalué à cet instant.
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offsetMinutes * 60_000);
}

/**
 * Offset (minutes, Est positif — ex. Europe/Paris été = +120) du fuseau à un
 * instant donné, via Intl.DateTimeFormat. Fuseau inconnu → 0 (UTC), la case
 * reste déverrouillable, jamais une exception.
 */
function timeZoneOffsetMinutes(at: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(at);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = Number.parseInt(p.value, 10);
    }
    const asUTC = Date.UTC(
      map.year,
      (map.month ?? 1) - 1,
      map.day ?? 1,
      map.hour ?? 0,
      map.minute ?? 0,
      map.second ?? 0,
    );
    return Math.round((asUTC - at.getTime()) / 60_000);
  } catch {
    return 0;
  }
}
