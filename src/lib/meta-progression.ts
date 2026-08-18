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
 *
 * AUCUN IMPORT NODE, ET C'EST UNE CONTRAINTE : `progression-season-card.tsx`
 * (client) importe d'ici vingt-six constantes et types. La promesse
 * « importable côté client » de l'en-tête a été fausse le temps qu'une seule
 * fonction — `deriveProgressionRequestId` — y installe `node:crypto` : le
 * polyfill du navigateur (~121 Ko gzip) partait dans l'écran des saisons. Elle
 * vit désormais dans `src/lib/progression-request-id.ts`, et la garde de source
 * `src/lib/import-sans-crypto.test.ts` refuse le retour.
 */

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
/** Position d'un objet dans son album (réordonnancement à l'édition). */
export const PROGRESSION_ITEM_POSITION_MAX = 1000;
/**
 * Révisions d'une règle de mission. `progression_mission_versions` est
 * WRITE-ONCE : chaque édition ajoute une version, jamais n'en réécrit une.
 * Au-delà, `update_progression_mission` lève `too many mission revisions`.
 */
export const PROGRESSION_MISSION_VERSION_MAX = 1000;

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

/**
 * Une mission telle que suivie par le joueur (jauge + dotation annoncée).
 *
 * SANS `eventName` NI `experienceKinds`, et c'est délibéré : depuis
 * 20260805220000 `player_progression_snapshot` ne les sert plus. Ils partaient au
 * joueur sans qu'aucun écran ne les affiche — c'était la recette exacte du
 * meulage d'une mission (quel événement viser, sur quelle famille d'expérience).
 * La règle reste lisible côté commerçant (`OrgProgressionMission.rule`), qui en a
 * besoin pour l'éditer. Ne pas les réintroduire ici.
 */
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
// player_progression_archive — saisons CLOSES du joueur
// ════════════════════════════════════════════════════════════

/**
 * `player_progression_snapshot` ne sert que la saison ACTIVE : sans cette
 * seconde lecture, clore une saison ferait disparaître de l'écran du joueur tout
 * ce qu'il a gagné. L'archive ne porte que des saisons `ended` / `archived`, et
 * seulement ce que CE joueur a obtenu (badges et objets), jamais le catalogue
 * complet ni un état de mission en cours.
 */
export interface ArchivedProgressionBadge {
  id: string;
  name: string;
  description: string;
  iconKey: ProgressionBadgeIcon;
  awardedAt: string | null;
}

export interface ArchivedProgressionItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  awardedAt: string | null;
}

export interface ArchivedProgressionSeason {
  id: string;
  name: string;
  /**
   * `ended` / `archived` — mais AUSSI `active` : depuis 20260805220000 l'archive
   * renvoie les saisons encore `active` dont `ends_at` est passé (échues, pas
   * encore closes par le commerçant) et les annonce telles quelles. Sans ça, les
   * badges du joueur s'effaçaient de son écran entre l'échéance de la saison et
   * l'action du commerçant : `player_progression_snapshot` exige
   * `ends_at > now()`, l'archive n'acceptait qu'un statut clos, personne ne
   * servait plus rien dans l'intervalle. Ne jamais restreindre ce champ à
   * `ended | archived`.
   */
  status: ProgressionSeasonStatus;
  startsAt: string | null;
  endsAt: string | null;
  keysEarned: number;
  keysSpent: number;
  badges: ArchivedProgressionBadge[];
  items: ArchivedProgressionItem[];
}

export interface PlayerProgressionArchive {
  /**
   * `ok` = l'appareil est connu de l'organisation, même si `seasons` est vide
   * (aucune saison close). `unavailable` = appareil inconnu : l'UI ne doit pas
   * afficher « vous n'avez rien gagné » à quelqu'un qu'on n'a pas identifié.
   */
  state: "ok" | "unavailable";
  seasons: ArchivedProgressionSeason[];
}

function mapArchivedBadge(raw: unknown): ArchivedProgressionBadge | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    iconKey: asEnum(rec.icon_key, PROGRESSION_BADGE_ICONS, "star"),
    awardedAt: asString(rec.awarded_at),
  };
}

function mapArchivedItem(raw: unknown): ArchivedProgressionItem | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    description: asString(rec.description) ?? "",
    imageUrl: asString(rec.image_url),
    awardedAt: asString(rec.awarded_at),
  };
}

function mapArchivedSeason(raw: unknown): ArchivedProgressionSeason | null {
  const rec = asRecord(raw);
  const id = rec ? asString(rec.id) : null;
  if (!rec || !id) return null;
  return {
    id,
    name: asString(rec.name) ?? "",
    status: asEnum<ProgressionSeasonStatus>(
      rec.status,
      ["draft", "active", "ended", "archived"],
      "ended",
    ),
    startsAt: asString(rec.starts_at),
    endsAt: asString(rec.ends_at),
    keysEarned: Math.max(asInt(rec.keys_earned) ?? 0, 0),
    keysSpent: Math.max(asInt(rec.keys_spent) ?? 0, 0),
    badges: mapList(rec.badges, mapArchivedBadge),
    items: mapList(rec.items, mapArchivedItem),
  };
}

/**
 * Convertit le jsonb de `player_progression_archive`. `null` (appareil inconnu)
 * → `unavailable`. Un objet `{seasons: []}` reste `ok` : c'est un joueur connu
 * dont aucune saison n'est encore close — les deux cas ne se confondent pas.
 */
export function mapPlayerProgressionArchive(
  raw: unknown,
): PlayerProgressionArchive {
  const root = asRecord(raw);
  if (!root || !Array.isArray(root.seasons)) {
    return { state: "unavailable", seasons: [] };
  }
  return { state: "ok", seasons: mapList(root.seasons, mapArchivedSeason) };
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
  /**
   * Le porteur a-t-il le droit de CONFIGURER (`is_org_editor`) ?
   *
   * Depuis 20260805220000 la branche `seasons` de la RPC est réservée aux
   * éditeurs : un `viewer` ou un compte de caisse reçoit `seasons: []` — il lisait
   * auparavant les noms de missions, les paliers, les dotations en clés et les
   * coffres d'une saison NON LANCÉE. Sans ce drapeau, l'UI confondrait « aucune
   * saison configurée » (invitation à en créer une) avec « pas le droit de les
   * voir » : les deux cas ont la même charge utile, seul `canConfigure` les
   * sépare.
   *
   * `false` par défaut, y compris quand l'agrégat est illisible : proposer des
   * boutons d'édition qui échoueront est pire que de ne rien proposer.
   */
  canConfigure: boolean;
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
 * aucune saison, `canConfigure: false`) plutôt qu'une erreur : l'écran de
 * configuration doit rester utilisable même si l'agrégat n'a rien à montrer.
 */
export function mapOrgProgressionSnapshot(raw: unknown): OrgProgressionSnapshot {
  const root = asRecord(raw);
  const summary = root ? asRecord(root.summary) : null;
  return {
    // Seul `true` explicite ouvre la configuration : toute autre forme (champ
    // absent d'une RPC plus ancienne, jsonb illisible) reste fermée.
    canConfigure: root?.can_configure === true,
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
// Erreurs métier des RPC de configuration → messages actionnables
// ════════════════════════════════════════════════════════════

/** Message générique : aucune erreur Postgres brute n'atteint le commerçant. */
export const PROGRESSION_GENERIC_ERROR = "Une erreur est survenue, réessayez.";

/**
 * Table ORDONNÉE de traduction des exceptions bornées levées par les RPC.
 *
 * L'ORDRE EST LOAD-BEARING, et c'est un piège réel : la correspondance se fait
 * par inclusion, or « draft badge not found » CONTIENT « badge not found », et
 * « invalid collection item » CONTIENT « invalid collection ». Les motifs les
 * PLUS SPÉCIFIQUES doivent donc précéder les plus généraux, sans quoi une saison
 * verrouillée serait annoncée comme un badge introuvable. Couvert par un test
 * dédié — ne pas réordonner sans le relire.
 *
 * Les trois refus les plus fréquents côté commerçant (référence encore utilisée,
 * suppression après usage) ne disent pas seulement « non » : ils disent quoi
 * faire ensuite.
 */
const PROGRESSION_ERRORS: ReadonlyArray<readonly [string, string]> = [
  ["not authorized", "Action non autorisée"],

  // ── Introuvable / plus modifiable (variantes « draft … » EN PREMIER) ──
  [
    "draft season not found",
    "Saison introuvable ou déjà lancée : la configuration se fait avant activation.",
  ],
  [
    "draft badge not found",
    "Badge introuvable, ou saison déjà lancée : un badge ne se modifie qu'en brouillon.",
  ],
  [
    "draft collection item not found",
    "Objet introuvable, ou saison déjà lancée : un objet ne se modifie qu'en brouillon.",
  ],
  [
    "draft collection not found",
    "Collection introuvable, ou saison déjà lancée : une collection ne se modifie qu'en brouillon.",
  ],
  [
    "draft mission not found",
    "Mission introuvable, ou saison déjà lancée : une mission ne se modifie qu'en brouillon.",
  ],
  [
    "draft chest not found",
    "Coffre introuvable, ou saison déjà lancée : un coffre ne se modifie qu'en brouillon.",
  ],

  // ── Interrupteur d'arrêt (saison `draft` OU `active`) ──
  // « open … not found » CONTIENT « … not found » : ces deux motifs restent donc
  // dans le bloc spécifique, au-dessus de la queue générale de la table.
  [
    "open mission not found",
    "Mission introuvable : seule une mission d'une saison en préparation ou en cours peut être arrêtée ou relancée.",
  ],
  [
    "open chest not found",
    "Coffre introuvable : seul un coffre d'une saison en préparation ou en cours peut être arrêté ou relancé.",
  ],

  // ── Cycle de vie de saison ──
  [
    "active season not found",
    "Aucune saison en cours à clore : elle est déjà close, archivée, ou pas encore lancée.",
  ],
  [
    "ended season not found",
    "Seule une saison close peut être archivée : clôturez-la d'abord.",
  ],
  [
    "another season is active",
    "Une autre saison est déjà en cours : clôturez-la avant d'en lancer une nouvelle.",
  ],
  [
    "season cannot be activated",
    "Cette saison ne peut pas être lancée (statut, échéance dépassée, ou aucune mission active).",
  ],

  // ── Refus d'orphelin et de destruction après usage (les plus fréquents) ──
  [
    "badge used by a mission",
    "Ce badge est la récompense d'une mission : retirez-le de la mission (ou supprimez la mission) avant de le supprimer.",
  ],
  [
    "collection item used by a mission",
    "Cet objet est la récompense d'une mission : retirez-le de la mission (ou supprimez la mission) avant de le supprimer.",
  ],
  [
    "chest would be left empty",
    "Un coffre se retrouverait sans aucun objet à distribuer : ajoutez-lui un autre objet avant cette suppression.",
  ],
  [
    "mission already has player progress",
    "Des joueurs ont déjà progressé sur cette mission : elle ne peut plus être supprimée. Désactivez-la à la place.",
  ],
  [
    "chest already opened by a player",
    "Ce coffre a déjà été ouvert par un joueur : il ne peut plus être supprimé. Désactivez-le à la place.",
  ],

  // ── Validation (variantes les plus longues EN PREMIER) ──
  ["invalid collection item", "Objet de collection invalide."],
  ["invalid collection", "Collection invalide."],
  ["invalid season", "Fenêtre de saison invalide."],
  ["invalid badge", "Badge invalide."],
  ["invalid mission", "Mission invalide."],
  ["invalid chest", "Coffre invalide."],
  [
    "too many mission revisions",
    `Cette mission a atteint sa limite de ${PROGRESSION_MISSION_VERSION_MAX} révisions : créez-en une nouvelle.`,
  ],

  // ── Références citées par une mission (après les variantes « draft … ») ──
  ["badge not found", "Badge introuvable dans cette saison."],
  ["collection item not found", "Objet de collection introuvable dans cette saison."],
];

/**
 * Traduit le message d'une exception RPC en phrase actionnable. Tout message
 * inconnu retombe sur l'erreur générique : une erreur Postgres brute (ou une
 * contrainte violée) n'est jamais renvoyée telle quelle à l'utilisateur.
 */
export function progressionErrorMessage(message: string): string {
  const found = PROGRESSION_ERRORS.find(([needle]) => message.includes(needle));
  return found ? found[1] : PROGRESSION_GENERIC_ERROR;
}
