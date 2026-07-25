/**
 * Cœur métier « pur » du module Méta-progression : mapping des jsonb renvoyés
 * par les RPC de la migration 20260805200000 (player_progression_snapshot,
 * org_progression_snapshot, open_progression_chest) vers des résultats typés
 * pour l'UI. Fonctions testables sans accès base ni imports server-only (miroir
 * de src/lib/referral.ts et src/lib/quiz.ts).
 *
 * INVARIANT PRODUIT (en-tête de la migration, l. 9-12) : clés, badges, objets et
 * coffres sont des marqueurs d'ENGAGEMENT NON MONÉTAIRES. Aucun type de ce
 * module ne porte de code de caisse, de stock commercial ni d'échéance de
 * retrait — il n'y a rien à encaisser. Une récompense commerciale reste émise
 * par sa source d'origine (roue, chasse, quiz…) puis miroirisée dans
 * `reward_issuances` ; la méta-progression ne fait que la CONSTATER via les
 * événements `reward_issued` / `reward_redeemed`.
 *
 * NON-FUITE : `org_progression_snapshot` est un agrégat qui ne renvoie JAMAIS de
 * `player_id` (ni aucune identité) — les types commerçant ci-dessous n'ont donc
 * aucun champ pour en accueillir un : la fuite est structurellement impossible.
 *
 * DÉFENSIF : aucune confiance dans la forme du jsonb (défauts sûrs sur toute
 * valeur manquante ou invalide). Les deux RPC de lecture renvoient `null` quand
 * il n'y a rien à montrer (joueur inconnu, pas de saison active) : ce cas retombe
 * sur l'état neutre `unavailable`, sans oracle.
 */

import { createHash } from "node:crypto";

// ────────────────────────────────────────────────────────────
// Types de domaine (miroir des CHECK SQL / is_valid_progression_rule)
// ────────────────────────────────────────────────────────────

/** Événements analytics qu'une règle de mission peut consommer. */
export const PROGRESSION_EVENT_NAMES = [
  "experience_started",
  "experience_completed",
  "reward_issued",
  "reward_redeemed",
  "player_returned",
] as const;

export type ProgressionEventName = (typeof PROGRESSION_EVENT_NAMES)[number];

/**
 * Familles d'expériences éligibles à une mission. Miroir EXACT de
 * `PLAYER_EXPERIENCE_KINDS` (src/lib/player-identity.ts) et du CHECK SQL —
 * redéclaré ici parce que ce module doit rester importable côté client/test,
 * alors que `player-identity.ts` est `server-only`.
 */
export const PROGRESSION_EXPERIENCE_KINDS = [
  "campaign",
  "hunt",
  "loyalty",
  "jackpot",
  "event",
  "calendar",
  "referral",
  "contest",
  "quiz",
] as const;

export type ProgressionExperienceKind =
  (typeof PROGRESSION_EXPERIENCE_KINDS)[number];

/** Origine d'acquisition, filtre FACULTATIF d'une règle de mission. */
export const PROGRESSION_SOURCES = [
  "direct",
  "qr",
  "share",
  "referral",
  "unknown",
] as const;

export type ProgressionSource = (typeof PROGRESSION_SOURCES)[number];

/** Icône d'un badge (catalogue fermé côté SQL). */
export const PROGRESSION_BADGE_ICONS = [
  "star",
  "trophy",
  "spark",
  "crown",
  "compass",
] as const;

export type ProgressionBadgeIcon = (typeof PROGRESSION_BADGE_ICONS)[number];

export type ProgressionSeasonStatus = "draft" | "active" | "ended" | "archived";

// ── Bornes (miroir de confort des CHECK SQL, jamais l'autorité) ──

export const PROGRESSION_SEASON_NAME_MAX = 120;
export const PROGRESSION_SEASON_MAX_DAYS = 366;
export const PROGRESSION_BADGE_NAME_MAX = 80;
export const PROGRESSION_COLLECTION_NAME_MAX = 100;
export const PROGRESSION_ITEM_NAME_MAX = 100;
export const PROGRESSION_CHEST_NAME_MAX = 100;
export const PROGRESSION_MISSION_NAME_MAX = 120;
export const PROGRESSION_DESCRIPTION_MAX = 500;
export const PROGRESSION_MISSION_DESCRIPTION_MAX = 800;
export const PROGRESSION_IMAGE_URL_MAX = 2048;
export const PROGRESSION_TARGET_MIN = 1;
export const PROGRESSION_TARGET_MAX = 500;
export const PROGRESSION_KEY_REWARD_MAX = 100;
export const PROGRESSION_KEY_COST_MIN = 1;
export const PROGRESSION_KEY_COST_MAX = 100;
export const PROGRESSION_CHEST_ITEMS_MIN = 1;
export const PROGRESSION_CHEST_ITEMS_MAX = 50;

// ────────────────────────────────────────────────────────────
// Helpers défensifs (aucune confiance dans la forme du jsonb)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Un entier jsonb peut arriver en nombre ou en chaîne (`count(*)` → bigint). */
function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = asString(value);
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

/** Liste de familles d'expériences, filtrée des valeurs inconnues. */
function asExperienceKinds(value: unknown): ProgressionExperienceKind[] {
  return asArray(value).flatMap((entry) => {
    const kind = asString(entry);
    return kind &&
      (PROGRESSION_EXPERIENCE_KINDS as readonly string[]).includes(kind)
      ? [kind as ProgressionExperienceKind]
      : [];
  });
}

/** Applique un mapper à chaque entrée d'un tableau jsonb, en éliminant le bruit. */
function mapList<T>(value: unknown, map: (raw: unknown) => T | null): T[] {
  return asArray(value).flatMap((entry) => {
    const mapped = map(entry);
    return mapped ? [mapped] : [];
  });
}

// ════════════════════════════════════════════════════════════
// player_progression_snapshot — vue JOUEUR (saison ACTIVE seule)
// ════════════════════════════════════════════════════════════

export interface ProgressionOrganizationRef {
  id: string | null;
  name: string;
}

export interface ProgressionSeasonRef {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
}

/** Une mission telle que suivie par le joueur (jauge + dotation annoncée). */
export interface PlayerProgressionMission {
  id: string;
  name: string;
  description: string;
  /** Palier à atteindre (1..500). */
  target: number;
  /** Avancement courant, borné au palier côté base. */
  current: number;
  /** Horodatage d'achèvement, null tant que la mission court. */
  completedAt: string | null;
  /** Clés versées à l'achèvement (0..100). */
  keyReward: number;
  eventName: ProgressionEventName;
  experienceKinds: ProgressionExperienceKind[];
}

export interface PlayerProgressionBadge {
  id: string;
  name: string;
  description: string;
  iconKey: ProgressionBadgeIcon;
  earned: boolean;
  awardedAt: string | null;
}

export interface PlayerProgressionItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  owned: boolean;
  awardedAt: string | null;
}

export interface PlayerProgressionCollection {
  id: string;
  name: string;
  description: string;
  items: PlayerProgressionItem[];
}

export interface PlayerProgressionChest {
  id: string;
  name: string;
  description: string;
  /** Clés consommées par une ouverture (1..100). */
  keyCost: number;
  /** Objets du coffre que ce joueur ne possède PAS encore. */
  availableItems: number;
}

export interface PlayerProgressionSnapshot {
  state: "ok" | "unavailable";
  organization: ProgressionOrganizationRef | null;
  season: ProgressionSeasonRef | null;
  /** Solde de clés dépensables (`keys_balance`). */
  keys: number;
  keysEarned: number;
  keysSpent: number;
  missions: PlayerProgressionMission[];
  badges: PlayerProgressionBadge[];
  collections: PlayerProgressionCollection[];
  chests: PlayerProgressionChest[];
}

const EMPTY_PLAYER_SNAPSHOT: PlayerProgressionSnapshot = {
  state: "unavailable",
  organization: null,
  season: null,
  keys: 0,
  keysEarned: 0,
  keysSpent: 0,
  missions: [],
  badges: [],
  collections: [],
  chests: [],
};

function mapPlayerMission(raw: unknown): PlayerProgressionMission | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  const target = asInt(rec.target) ?? PROGRESSION_TARGET_MIN;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    target,
    // La base borne déjà `current_value` au palier ; on ne l'élargit pas ici.
    current: Math.min(asInt(rec.current) ?? 0, target),
    completedAt: asString(rec.completed_at),
    keyReward: asInt(rec.key_reward) ?? 0,
    eventName: asEnum(
      rec.event_name,
      PROGRESSION_EVENT_NAMES,
      "experience_completed",
    ),
    experienceKinds: asExperienceKinds(rec.experience_kinds),
  };
}

function mapPlayerBadge(raw: unknown): PlayerProgressionBadge | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  const earned = rec.earned === true;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    iconKey: asEnum(rec.icon_key, PROGRESSION_BADGE_ICONS, "star"),
    earned,
    // Un badge non obtenu n'a pas de date : on ne recopie jamais celle d'un autre.
    awardedAt: earned ? asString(rec.awarded_at) : null,
  };
}

function mapPlayerItem(raw: unknown): PlayerProgressionItem | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  const owned = rec.owned === true;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    imageUrl: asString(rec.image_url),
    owned,
    awardedAt: owned ? asString(rec.awarded_at) : null,
  };
}

function mapPlayerCollection(raw: unknown): PlayerProgressionCollection | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    items: mapList(rec.items, mapPlayerItem),
  };
}

function mapPlayerChest(raw: unknown): PlayerProgressionChest | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    keyCost: asInt(rec.key_cost) ?? PROGRESSION_KEY_COST_MIN,
    availableItems: Math.max(asInt(rec.available_items) ?? 0, 0),
  };
}

/**
 * Convertit le jsonb de `player_progression_snapshot` en état typé. La RPC
 * renvoie `null` quand le device est inconnu de l'organisation ou qu'aucune
 * saison n'est active : ces deux cas — indiscernables, volontairement —
 * retombent sur `unavailable` neutre. Une saison sans identifiant est traitée de
 * même (jsonb non conforme).
 */
export function mapPlayerProgressionSnapshot(
  raw: unknown,
): PlayerProgressionSnapshot {
  const root = asRecord(raw);
  const season = root ? asRecord(root.season) : null;
  const seasonId = season ? asString(season.id) : null;
  if (!root || !season || !seasonId) return EMPTY_PLAYER_SNAPSHOT;

  const organization = asRecord(root.organization);
  return {
    state: "ok",
    organization: {
      id: organization ? asString(organization.id) : null,
      name: (organization ? asString(organization.name) : null) ?? "",
    },
    season: {
      id: seasonId,
      name: asString(season.name) ?? "",
      startsAt: asString(season.starts_at),
      endsAt: asString(season.ends_at),
    },
    keys: Math.max(asInt(root.keys) ?? 0, 0),
    keysEarned: Math.max(asInt(root.keys_earned) ?? 0, 0),
    keysSpent: Math.max(asInt(root.keys_spent) ?? 0, 0),
    missions: mapList(root.missions, mapPlayerMission),
    badges: mapList(root.badges, mapPlayerBadge),
    collections: mapList(root.collections, mapPlayerCollection),
    chests: mapList(root.chests, mapPlayerChest),
  };
}

// ════════════════════════════════════════════════════════════
// org_progression_snapshot — vue COMMERÇANT (config + volumes)
// ════════════════════════════════════════════════════════════

/** Volumes agrégés, toutes saisons confondues. JAMAIS d'identité de joueur. */
export interface OrgProgressionSummary {
  players: number;
  missionsCompleted: number;
  keysEarned: number;
  chestsOpened: number;
}

/** Règle immuable d'une mission (version active), telle que stockée en base. */
export interface ProgressionRule {
  version: number;
  eventName: ProgressionEventName;
  target: number;
  experienceKinds: ProgressionExperienceKind[];
  /** Filtre d'origine facultatif ; null = toutes origines. */
  source: ProgressionSource | null;
  /** true = une seule contribution par expérience distincte. */
  distinctExperiences: boolean;
}

export interface OrgProgressionMission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  keyReward: number;
  badgeId: string | null;
  collectionItemId: string | null;
  rule: ProgressionRule;
}

export interface OrgProgressionBadge {
  id: string;
  name: string;
  description: string;
  iconKey: ProgressionBadgeIcon;
  createdAt: string | null;
}

export interface OrgProgressionItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  position: number;
  createdAt: string | null;
}

export interface OrgProgressionCollection {
  id: string;
  name: string;
  description: string;
  items: OrgProgressionItem[];
}

export interface OrgProgressionChest {
  id: string;
  name: string;
  description: string;
  keyCost: number;
  enabled: boolean;
  itemIds: string[];
}

export interface OrgProgressionSeason {
  id: string;
  name: string;
  status: ProgressionSeasonStatus;
  startsAt: string | null;
  endsAt: string | null;
  missions: OrgProgressionMission[];
  badges: OrgProgressionBadge[];
  collections: OrgProgressionCollection[];
  chests: OrgProgressionChest[];
}

export interface OrgProgressionSnapshot {
  summary: OrgProgressionSummary;
  seasons: OrgProgressionSeason[];
}

const EMPTY_SUMMARY: OrgProgressionSummary = {
  players: 0,
  missionsCompleted: 0,
  keysEarned: 0,
  chestsOpened: 0,
};

/** Règle de mission telle que persistée (`progression_mission_versions.rule`). */
function mapProgressionRule(raw: unknown): ProgressionRule {
  const rec = asRecord(raw);
  const sourceRaw = rec ? asString(rec.source) : null;
  return {
    version: asInt(rec?.version) ?? 1,
    eventName: asEnum(
      rec?.event_name,
      PROGRESSION_EVENT_NAMES,
      "experience_completed",
    ),
    target: asInt(rec?.target) ?? PROGRESSION_TARGET_MIN,
    experienceKinds: asExperienceKinds(rec?.experience_kinds),
    source:
      sourceRaw && (PROGRESSION_SOURCES as readonly string[]).includes(sourceRaw)
        ? (sourceRaw as ProgressionSource)
        : null,
    distinctExperiences: rec?.distinct_experiences === true,
  };
}

function mapOrgMission(raw: unknown): OrgProgressionMission | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    enabled: rec.enabled === true,
    keyReward: asInt(rec.key_reward) ?? 0,
    badgeId: asString(rec.badge_id),
    collectionItemId: asString(rec.collection_item_id),
    rule: mapProgressionRule(rec.rule),
  };
}

function mapOrgBadge(raw: unknown): OrgProgressionBadge | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    iconKey: asEnum(rec.icon_key, PROGRESSION_BADGE_ICONS, "star"),
    createdAt: asString(rec.created_at),
  };
}

function mapOrgItem(raw: unknown): OrgProgressionItem | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    imageUrl: asString(rec.image_url),
    position: asInt(rec.position) ?? 0,
    createdAt: asString(rec.created_at),
  };
}

function mapOrgCollection(raw: unknown): OrgProgressionCollection | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    items: mapList(rec.items, mapOrgItem),
  };
}

function mapOrgChest(raw: unknown): OrgProgressionChest | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    keyCost: asInt(rec.key_cost) ?? PROGRESSION_KEY_COST_MIN,
    enabled: rec.enabled === true,
    itemIds: asArray(rec.item_ids).flatMap((entry) => {
      const itemId = asString(entry);
      return itemId ? [itemId] : [];
    }),
  };
}

function mapOrgSeason(raw: unknown): OrgProgressionSeason | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    status: asEnum<ProgressionSeasonStatus>(
      rec.status,
      ["draft", "active", "ended", "archived"],
      "draft",
    ),
    startsAt: asString(rec.starts_at),
    endsAt: asString(rec.ends_at),
    missions: mapList(rec.missions, mapOrgMission),
    badges: mapList(rec.badges, mapOrgBadge),
    collections: mapList(rec.collections, mapOrgCollection),
    chests: mapList(rec.chests, mapOrgChest),
  };
}

/**
 * Convertit le jsonb d'`org_progression_snapshot` en vue commerçant typée. Un
 * jsonb absent ou non conforme donne un tableau de bord VIDE (compteurs à zéro,
 * aucune saison) plutôt qu'une erreur : l'écran de configuration doit rester
 * utilisable même si l'agrégat n'a rien à montrer.
 */
export function mapOrgProgressionSnapshot(raw: unknown): OrgProgressionSnapshot {
  const root = asRecord(raw);
  const summary = root ? asRecord(root.summary) : null;
  return {
    summary: summary
      ? {
          players: Math.max(asInt(summary.players) ?? 0, 0),
          missionsCompleted: Math.max(asInt(summary.missions_completed) ?? 0, 0),
          keysEarned: Math.max(asInt(summary.keys_earned) ?? 0, 0),
          chestsOpened: Math.max(asInt(summary.chests_opened) ?? 0, 0),
        }
      : EMPTY_SUMMARY,
    seasons: root ? mapList(root.seasons, mapOrgSeason) : [],
  };
}

/** La saison ACTIVE d'une vue commerçant (au plus une, index unique partiel). */
export function activeProgressionSeason(
  snapshot: OrgProgressionSnapshot,
): OrgProgressionSeason | null {
  return snapshot.seasons.find((season) => season.status === "active") ?? null;
}

// ════════════════════════════════════════════════════════════
// open_progression_chest — ouverture atomique et idempotente
// ════════════════════════════════════════════════════════════

/**
 * Issues d'une ouverture de coffre :
 *  · `opened` — un objet de collection est débloqué (jamais un code de caisse) ;
 *  · `insufficient_keys` — solde insuffisant, RIEN n'a été débité ;
 *  · `collection_complete` — le joueur possède déjà tous les objets du coffre ;
 *  · `unavailable` — device inconnu, coffre fermé, ou hors saison active.
 */
export type ProgressionChestState =
  | "opened"
  | "insufficient_keys"
  | "collection_complete"
  | "unavailable";

export interface ProgressionChestItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
}

export interface ProgressionChestOpening {
  state: ProgressionChestState;
  /**
   * `true` = la RPC a REJOUÉ une ouverture déjà enregistrée pour ce
   * `request_id` : l'objet est le même et AUCUNE clé n'a été débitée une seconde
   * fois. C'est le signal qui permet à l'UI de ne pas rejouer l'animation
   * « nouvel objet » sur un double-clic.
   */
  idempotent: boolean;
  /** Solde de clés APRÈS l'opération. */
  keys: number;
  /** Coût du coffre — renseigné seulement sur `insufficient_keys`. */
  requiredKeys: number | null;
  /** Objet débloqué (non null seulement sur `opened`). */
  item: ProgressionChestItem | null;
}

const CHEST_STATES: readonly ProgressionChestState[] = [
  "opened",
  "insufficient_keys",
  "collection_complete",
  "unavailable",
];

function mapChestItem(raw: unknown): ProgressionChestItem | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    imageUrl: asString(rec.image_url),
  };
}

/**
 * Convertit le jsonb d'`open_progression_chest` en issue typée. `null` (device
 * inconnu, coffre indisponible) et tout jsonb non reconnu retombent sur
 * `unavailable`. L'objet n'est lu que sur `opened` : aucun état de refus ne
 * révèle le contenu d'un coffre.
 */
export function mapProgressionChestOpening(
  raw: unknown,
): ProgressionChestOpening {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ProgressionChestState =
    stateRaw && (CHEST_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ProgressionChestState)
      : "unavailable";

  if (state === "unavailable" || !root) {
    return {
      state: "unavailable",
      idempotent: false,
      keys: 0,
      requiredKeys: null,
      item: null,
    };
  }

  return {
    state,
    idempotent: state === "opened" && root.idempotent === true,
    keys: Math.max(asInt(root.keys) ?? 0, 0),
    requiredKeys:
      state === "insufficient_keys" ? asInt(root.required_keys) : null,
    item: state === "opened" ? mapChestItem(root.item) : null,
  };
}

// ════════════════════════════════════════════════════════════
// Idempotence d'ouverture — dérivation du request_id
// ════════════════════════════════════════════════════════════

/**
 * Fenêtre de repli de l'idempotence d'ouverture, quand l'appelant ne fournit pas
 * sa propre clé. Deux appels du MÊME device sur le MÊME coffre dans cette fenêtre
 * partagent le `request_id` dérivé : la contrainte unique
 * `(player_season_id, request_id)` fait alors rejouer l'ouverture au lieu de
 * débiter une seconde fois.
 *
 * 5 s couvre le double-clic et le rejeu réseau (retry d'un POST) sans gêner une
 * seconde ouverture DÉLIBÉRÉE du même coffre. Réserve connue : deux clics qui
 * enjambent une frontière de fenêtre tombent dans deux seaux — d'où la clé
 * fournie par l'appelant, qui reste le mécanisme PRÉFÉRÉ (une clé par geste,
 * stable à travers les reprises).
 */
export const PROGRESSION_REQUEST_WINDOW_MS = 5_000;

/**
 * Dérive un UUID déterministe (forme v4) à partir d'un secret d'identité, du
 * coffre visé et d'un seau de temps. Déterministe = idempotent : c'est la
 * propriété qui rend `open_progression_chest` sûre face au double-clic.
 *
 * Le hash du device n'est utilisé QU'EN ENTRÉE de SHA-256 tronqué à 128 bits :
 * l'identifiant produit ne permet pas de le retrouver, et il n'est comparable
 * qu'aux ouvertures du même joueur (l'unicité est portée par
 * `(player_season_id, request_id)`).
 */
export function deriveProgressionRequestId(
  deviceTokenHash: string,
  chestId: string,
  now: number = Date.now(),
): string {
  const bucket = Math.floor(now / PROGRESSION_REQUEST_WINDOW_MS);
  const digest = createHash("sha256")
    .update(`progression-chest:v1:${deviceTokenHash}:${chestId}:${bucket}`)
    .digest("hex");
  const bytes = digest.slice(0, 32).split("");
  // Version 4 + variant RFC 4122 : la valeur reste un UUID valide pour Postgres.
  bytes[12] = "4";
  bytes[16] = "89ab"[Number.parseInt(bytes[16], 16) % 4];
  const hex = bytes.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
