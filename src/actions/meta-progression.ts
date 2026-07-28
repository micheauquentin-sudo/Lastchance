"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { zonedDateTimeToIso } from "@/lib/date-time";
import {
  deriveProgressionRequestId,
  mapOrgProgressionSnapshot,
  mapPlayerProgressionArchive,
  mapPlayerProgressionSnapshot,
  mapProgressionChestOpening,
  PROGRESSION_GENERIC_ERROR,
  progressionErrorMessage,
  type OrgProgressionSnapshot,
  type PlayerProgressionArchive,
  type PlayerProgressionSnapshot,
  type ProgressionChestOpening,
} from "@/lib/meta-progression";
import { monitored, reportError } from "@/lib/monitoring";
import { peekPlayerDeviceTokenHash } from "@/lib/player-identity";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { hasActiveAccess } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/utils";
import {
  activateProgressionSeasonSchema,
  archiveProgressionSeasonSchema,
  createProgressionBadgeSchema,
  createProgressionChestSchema,
  createProgressionCollectionItemSchema,
  createProgressionCollectionSchema,
  createProgressionMissionSchema,
  createProgressionSeasonSchema,
  deleteProgressionBadgeSchema,
  deleteProgressionChestSchema,
  deleteProgressionCollectionItemSchema,
  deleteProgressionCollectionSchema,
  deleteProgressionMissionSchema,
  deleteProgressionSeasonSchema,
  endProgressionSeasonSchema,
  getPlayerProgressionArchiveSchema,
  getPlayerProgressionSchema,
  openProgressionChestSchema,
  setProgressionChestEnabledSchema,
  setProgressionMissionEnabledSchema,
  updateProgressionBadgeSchema,
  updateProgressionChestSchema,
  updateProgressionCollectionItemSchema,
  updateProgressionCollectionSchema,
  updateProgressionMissionSchema,
} from "@/lib/validations/meta-progression";

// ════════════════════════════════════════════════════════════
// Méta-progression — server actions (migration 20260805200000)
//
// INVARIANT PRODUIT : clés, badges, objets et coffres sont des marqueurs
// d'ENGAGEMENT NON MONÉTAIRES. Aucune action de ce fichier n'émet de code de
// caisse, ne touche `reward_issuances`, ni ne provisionne un stock commercial :
// une récompense commerciale reste émise par sa source d'origine (roue, chasse,
// quiz…). Ouvrir un coffre débite des clés et rend un objet de COLLECTION.
//
// LE MOTEUR TOURNE DÉJÀ EN BASE : le trigger `experience_events_meta_progression`
// branche `apply_meta_progression_event()` sur `experience_events`. Les missions
// avancent donc TOUTES SEULES depuis les événements analytics déjà émis par les
// parcours existants — il n'y a rien à appeler pour « faire progresser » un
// joueur, et aucune action ci-dessous n'écrit dans les tables de progression
// joueur (seule `open_progression_chest` le fait, sous verrou, côté base).
//
// PARTAGE DES CLIENTS :
//  · configuration commerçant → client de SESSION (`createClient`) : les RPC
//    `create_progression_*` sont `security definer` et revérifient
//    `is_org_editor(p_organization_id)` avec l'`auth.uid()` du porteur. Passer
//    par le service_role court-circuiterait ce contrôle ET priverait
//    `created_by` de son auteur ;
//  · parcours joueur → service_role (`createAdminClient`) : les deux RPC joueur
//    sont accordées à `service_role` SEUL et exigent explicitement
//    `auth.role() = 'service_role'`.
//
// CONTRÔLE D'ABUS (ADR-032) : le parcours joueur est PUBLIC et servi derrière le
// Wi-Fi / CGNAT partagé d'un commerce. Aucun seau `failClosed` ne porte sur une
// clé partagée (IP, organisation) — un tel seau deviendrait un interrupteur
// qu'un tiers allume en le saturant. Le `failClosed` ne porte que sur des clés
// d'IDENTITÉ device (hash salé du cookie `lc-player`), tranchées AVANT toute
// requête ; la clé partagée ne porte qu'un compteur d'OBSERVABILITÉ fail-open,
// consommé AVANT tout retour anticipé pour qu'une rafale laisse une trace.
//
// DEUX SEAUX D'IDENTITÉ, dans cet ordre (cf. `beginProgressionPlayer`) : le
// PLAFOND GLOBAL du cookie (`progression:device:{hash}`, sans organisation) puis
// le seau par organisation. L'organisation vient du CLIENT : sans le premier
// seau, boucler sur des UUID aléatoires ouvrait un seau neuf à chaque tour et le
// débit n'était borné par rien.
// ════════════════════════════════════════════════════════════

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = PROGRESSION_GENERIC_ERROR;
const RATE_LIMITED = "Trop de tentatives. Patientez un instant.";

// ════════════════════════════════════════════════════════════
// Configuration commerçant — session + is_org_editor côté RPC
// ════════════════════════════════════════════════════════════

type EditorGuard =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      organizationId: string;
      timezone: string;
    }
  | { ok: false; error: string };

/**
 * Prélude commun aux 7 mutations de configuration : session obligatoire,
 * organisation ACTIVE (jamais un id fourni par l'appelant), rôle owner|editor.
 * La RPC revérifie `is_org_editor` — ce garde ne fait que rendre un message
 * clair avant l'aller-retour.
 */
async function requireProgressionEditor(): Promise<EditorGuard> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  return {
    ok: true,
    supabase: await createClient(),
    organizationId: organization.id,
    timezone: organization.timezone ?? "Europe/Paris",
  };
}

/** Purge le cache du tableau de bord de progression après une mutation. */
function revalidateProgression(): void {
  revalidatePath("/dashboard/progression");
}

/**
 * Crée une saison en brouillon. Les heures saisies sont CIVILES (fuseau du
 * commerce) et converties en instants UTC ici — jamais en heure « serveur ».
 * Une saison naît `draft` : c'est le seul état où sa configuration (badges,
 * collections, missions, coffres) est modifiable.
 */
export async function createProgressionSeason(input: {
  name: string;
  startsAt: string;
  endsAt: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionSeasonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  let startsAt: string;
  let endsAt: string;
  try {
    startsAt = zonedDateTimeToIso(parsed.data.startsAt, guard.timezone);
    endsAt = zonedDateTimeToIso(parsed.data.endsAt, guard.timezone);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Date et heure invalides",
    };
  }

  const { data, error } = await guard.supabase.rpc("create_progression_season", {
    p_organization_id: guard.organizationId,
    p_name: parsed.data.name,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) {
    reportError("progression.createSeason", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/** Ajoute un badge à une saison en brouillon (récompense non monétaire). */
export async function createProgressionBadge(input: {
  seasonId: string;
  name: string;
  description?: string;
  iconKey?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionBadgeSchema.safeParse({
    seasonId: input.seasonId,
    name: input.name,
    description: input.description ?? "",
    iconKey: input.iconKey ?? "star",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc("create_progression_badge", {
    p_organization_id: guard.organizationId,
    p_season_id: parsed.data.seasonId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_icon_key: parsed.data.iconKey,
  });
  if (error) {
    reportError("progression.createBadge", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/** Crée une collection (l'album) dans une saison en brouillon. */
export async function createProgressionCollection(input: {
  seasonId: string;
  name: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionCollectionSchema.safeParse({
    seasonId: input.seasonId,
    name: input.name,
    description: input.description ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc(
    "create_progression_collection",
    {
      p_organization_id: guard.organizationId,
      p_season_id: parsed.data.seasonId,
      p_name: parsed.data.name,
      p_description: parsed.data.description,
    },
  );
  if (error) {
    reportError("progression.createCollection", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/**
 * Ajoute un objet à une collection. La `position` est attribuée par la RPC (fin
 * de liste) : rien à calculer côté application, donc pas de course sur l'ordre.
 */
export async function createProgressionCollectionItem(input: {
  collectionId: string;
  name: string;
  description?: string;
  imageUrl?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionCollectionItemSchema.safeParse({
    collectionId: input.collectionId,
    name: input.name,
    description: input.description ?? "",
    imageUrl: input.imageUrl ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc(
    "create_progression_collection_item",
    {
      p_organization_id: guard.organizationId,
      p_collection_id: parsed.data.collectionId,
      p_name: parsed.data.name,
      p_description: parsed.data.description,
      p_image_url: parsed.data.imageUrl,
    },
  );
  if (error) {
    reportError("progression.createCollectionItem", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/**
 * Crée une mission et sa règle (version 1, IMMUABLE). La règle est assemblée
 * PAR LA RPC à partir des paramètres nommés puis revalidée par
 * `is_valid_progression_rule` : aucun jsonb libre ne transite depuis
 * l'application, un opérateur ne peut donc pas fabriquer une règle hors
 * catalogue.
 */
export async function createProgressionMission(input: {
  seasonId: string;
  name: string;
  description?: string;
  eventName: string;
  target: number | string;
  experienceKinds: string[];
  keyReward?: number | string;
  source?: string;
  distinctExperiences?: boolean;
  badgeId?: string;
  collectionItemId?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionMissionSchema.safeParse({
    seasonId: input.seasonId,
    name: input.name,
    description: input.description ?? "",
    eventName: input.eventName,
    target: input.target,
    experienceKinds: input.experienceKinds ?? [],
    keyReward: input.keyReward ?? 0,
    source: input.source ?? "",
    distinctExperiences: input.distinctExperiences ?? false,
    badgeId: input.badgeId ?? "",
    collectionItemId: input.collectionItemId ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc("create_progression_mission", {
    p_organization_id: guard.organizationId,
    p_season_id: parsed.data.seasonId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_event_name: parsed.data.eventName,
    p_target: parsed.data.target,
    p_experience_kinds: parsed.data.experienceKinds,
    p_key_reward: parsed.data.keyReward,
    p_source: parsed.data.source,
    p_distinct_experiences: parsed.data.distinctExperiences,
    p_badge_id: parsed.data.badgeId,
    p_collection_item_id: parsed.data.collectionItemId,
  });
  if (error) {
    reportError("progression.createMission", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/**
 * Crée un coffre et son contenu. Le coffre ne débloque QUE des objets de
 * collection de la même saison : il ne peut structurellement pas rendre un lot
 * commercial ni un code de caisse.
 */
export async function createProgressionChest(input: {
  seasonId: string;
  name: string;
  description?: string;
  keyCost: number | string;
  itemIds: string[];
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProgressionChestSchema.safeParse({
    seasonId: input.seasonId,
    name: input.name,
    description: input.description ?? "",
    keyCost: input.keyCost,
    itemIds: input.itemIds ?? [],
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc("create_progression_chest", {
    p_organization_id: guard.organizationId,
    p_season_id: parsed.data.seasonId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_key_cost: parsed.data.keyCost,
    p_item_ids: parsed.data.itemIds,
  });
  if (error) {
    reportError("progression.createChest", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { id: data as string } };
}

/**
 * Lance une saison (draft → active). L'allumage exige un accès actif
 * (abonnement / essai / accès offert), comme l'activation d'un calendrier ou
 * d'un programme de parrainage : les RPC gardent `is_org_editor` mais NON l'état
 * d'abonnement. La RPC clôt d'abord d'elle-même une saison active DÉJÀ EXPIRÉE
 * (sans quoi elle verrouillerait l'organisation à vie), puis vérifie qu'aucune
 * autre saison n'est active, que celle-ci est encore en brouillon, non expirée,
 * et porte au moins une mission activée.
 *
 * NOTE PÉRIMÈTRE : il n'existe AUCUN drapeau `addon_progression` en base — les
 * 8 addons existants ne couvrent pas ce module. Aucune garde d'addon n'est donc
 * inventée ici ; seul l'accès d'abonnement est exigé.
 */
export async function activateProgressionSeason(input: {
  seasonId: string;
}): Promise<ActionResult<{ activated: boolean }>> {
  const parsed = activateProgressionSeasonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  if (!hasActiveAccess(organization)) {
    return {
      ok: false,
      error: "Votre accès n'est plus actif : réactivez votre abonnement pour lancer une saison.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_progression_season", {
    p_organization_id: organization.id,
    p_season_id: parsed.data.seasonId,
  });
  if (error) {
    reportError("progression.activateSeason", error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data: { activated: data === true } };
}

// ────────────────────────────────────────────────────────────
// Cycle de vie, édition, suppression (migration 20260805210000)
// ────────────────────────────────────────────────────────────

/**
 * Exécute une RPC de configuration : garde éditeur, appel, traduction de
 * l'erreur métier, purge du cache. Factorisé parce que les 13 mutations de
 * cycle de vie / édition / suppression n'en diffèrent QUE par le nom de la RPC
 * et ses arguments — les dupliquer ferait 13 endroits où oublier
 * `progressionErrorMessage` ou `revalidateProgression`.
 *
 * `data` reste brut (`unknown`) : la plupart des RPC rendent un booléen, mais
 * `update_progression_mission` rend le NUMÉRO DE VERSION de la nouvelle règle.
 * C'est à l'appelant de dire ce qu'il attend.
 */
async function runProgressionEditorRpc(
  scope: string,
  fn: string,
  buildArgs: (organizationId: string) => Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const guard = await requireProgressionEditor();
  if (!guard.ok) return { ok: false, error: guard.error };

  const { data, error } = await guard.supabase.rpc(
    fn,
    buildArgs(guard.organizationId),
  );
  if (error) {
    reportError(scope, error.message);
    return { ok: false, error: progressionErrorMessage(error.message) };
  }

  revalidateProgression();
  return { ok: true, data };
}

/** Réduit une issue de RPC booléenne à un `ActionResult` sans charge utile. */
function asVoidResult(
  result: Awaited<ReturnType<typeof runProgressionEditorRpc>>,
): ActionResult {
  return result.ok ? { ok: true, data: undefined } : result;
}

/**
 * Clôt la saison en cours (`active` → `ended`). La clôture ne touche QUE le
 * statut : saisons joueurs, badges, objets et ouvertures restent en base et
 * restent lisibles par `getPlayerProgressionArchive` — un badge gagné ne se
 * perd pas. C'est ce qui débloque l'enchaînement d'une saison suivante (l'index
 * unique partiel n'autorise qu'une saison `active` par organisation).
 */
export async function endProgressionSeason(input: {
  seasonId: string;
}): Promise<ActionResult> {
  const parsed = endProgressionSeasonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.endSeason",
      "end_progression_season",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_season_id: parsed.data.seasonId,
      }),
    ),
  );
}

/** Archive une saison close (`ended` → `archived`) : rangement, pas destruction. */
export async function archiveProgressionSeason(input: {
  seasonId: string;
}): Promise<ActionResult> {
  const parsed = archiveProgressionSeasonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.archiveSeason",
      "archive_progression_season",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_season_id: parsed.data.seasonId,
      }),
    ),
  );
}

/**
 * Supprime une saison BROUILLON et toute sa configuration (coffres, missions,
 * collections, badges). Bornée au brouillon côté RPC : une saison qui a tourné
 * ne peut pas être effacée sous les joueurs, seulement close puis archivée.
 */
export async function deleteProgressionSeason(input: {
  seasonId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionSeasonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteSeason",
      "delete_progression_season",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_season_id: parsed.data.seasonId,
      }),
    ),
  );
}

/** Corrige un badge (libellé, description, icône) — saison brouillon seulement. */
export async function updateProgressionBadge(input: {
  badgeId: string;
  name: string;
  description?: string;
  iconKey?: string;
}): Promise<ActionResult> {
  const parsed = updateProgressionBadgeSchema.safeParse({
    badgeId: input.badgeId,
    name: input.name,
    description: input.description ?? "",
    iconKey: input.iconKey ?? "star",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.updateBadge",
      "update_progression_badge",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_badge_id: parsed.data.badgeId,
        p_name: parsed.data.name,
        p_description: parsed.data.description,
        p_icon_key: parsed.data.iconKey,
      }),
    ),
  );
}

/**
 * Supprime un badge. REFUSÉ s'il est encore la récompense d'une mission : la RPC
 * ne laisse jamais une mission citer un badge disparu, et le message dit quoi
 * faire (le retirer de la mission d'abord).
 */
export async function deleteProgressionBadge(input: {
  badgeId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionBadgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteBadge",
      "delete_progression_badge",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_badge_id: parsed.data.badgeId,
      }),
    ),
  );
}

/** Corrige une collection (nom, description) — saison brouillon seulement. */
export async function updateProgressionCollection(input: {
  collectionId: string;
  name: string;
  description?: string;
}): Promise<ActionResult> {
  const parsed = updateProgressionCollectionSchema.safeParse({
    collectionId: input.collectionId,
    name: input.name,
    description: input.description ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.updateCollection",
      "update_progression_collection",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_collection_id: parsed.data.collectionId,
        p_name: parsed.data.name,
        p_description: parsed.data.description,
      }),
    ),
  );
}

/**
 * Supprime un album entier. REFUSÉ si l'un de ses objets récompense une mission,
 * ou si un coffre se retrouverait sans aucun butin à distribuer.
 */
export async function deleteProgressionCollection(input: {
  collectionId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteCollection",
      "delete_progression_collection",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_collection_id: parsed.data.collectionId,
      }),
    ),
  );
}

/**
 * Corrige un objet de collection. `position` omise ('' → null) laisse le rang
 * INCHANGÉ : rééditer un libellé ne doit pas réordonner l'album.
 */
export async function updateProgressionCollectionItem(input: {
  itemId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  position?: number | string;
}): Promise<ActionResult> {
  const parsed = updateProgressionCollectionItemSchema.safeParse({
    itemId: input.itemId,
    name: input.name,
    description: input.description ?? "",
    imageUrl: input.imageUrl ?? "",
    position: input.position ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.updateCollectionItem",
      "update_progression_collection_item",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_item_id: parsed.data.itemId,
        p_name: parsed.data.name,
        p_description: parsed.data.description,
        p_image_url: parsed.data.imageUrl,
        p_position: parsed.data.position,
      }),
    ),
  );
}

/**
 * Supprime un objet. REFUSÉ s'il récompense une mission, ou s'il est le DERNIER
 * butin d'un coffre. Sinon son appartenance aux coffres tombe par cascade.
 */
export async function deleteProgressionCollectionItem(input: {
  itemId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionCollectionItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteCollectionItem",
      "delete_progression_collection_item",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_item_id: parsed.data.itemId,
      }),
    ),
  );
}

/**
 * Édite une mission. La règle n'est JAMAIS réécrite en place : la RPC ajoute une
 * NOUVELLE version au journal immuable `progression_mission_versions` et la rend
 * active. Elle rend donc un ENTIER — le numéro de cette version — et non un
 * booléen : il est remonté tel quel pour que l'écran puisse dire au commerçant
 * ce qui vient d'être publié (« règle v3 »). `null` = retour illisible, l'UI ne
 * doit alors afficher aucun numéro plutôt qu'un numéro faux.
 */
export async function updateProgressionMission(input: {
  missionId: string;
  name: string;
  description?: string;
  eventName: string;
  target: number | string;
  experienceKinds: string[];
  keyReward?: number | string;
  source?: string;
  distinctExperiences?: boolean;
  badgeId?: string;
  collectionItemId?: string;
  enabled?: boolean;
}): Promise<ActionResult<{ version: number | null }>> {
  const parsed = updateProgressionMissionSchema.safeParse({
    missionId: input.missionId,
    name: input.name,
    description: input.description ?? "",
    eventName: input.eventName,
    target: input.target,
    experienceKinds: input.experienceKinds ?? [],
    keyReward: input.keyReward ?? 0,
    source: input.source ?? "",
    distinctExperiences: input.distinctExperiences ?? false,
    badgeId: input.badgeId ?? "",
    collectionItemId: input.collectionItemId ?? "",
    enabled: input.enabled ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const result = await runProgressionEditorRpc(
    "progression.updateMission",
    "update_progression_mission",
    (organizationId) => ({
      p_organization_id: organizationId,
      p_mission_id: parsed.data.missionId,
      p_name: parsed.data.name,
      p_description: parsed.data.description,
      p_event_name: parsed.data.eventName,
      p_target: parsed.data.target,
      p_experience_kinds: parsed.data.experienceKinds,
      p_key_reward: parsed.data.keyReward,
      p_source: parsed.data.source,
      p_distinct_experiences: parsed.data.distinctExperiences,
      p_badge_id: parsed.data.badgeId,
      p_collection_item_id: parsed.data.collectionItemId,
      p_enabled: parsed.data.enabled,
    }),
  );
  if (!result.ok) return result;

  const version = Number(result.data);
  return {
    ok: true,
    data: { version: Number.isInteger(version) ? version : null },
  };
}

/**
 * Supprime une mission. REFUSÉE dès qu'un joueur y a progressé — le repli est de
 * la DÉSACTIVER (`enabled: false` via `updateProgressionMission`), ce que dit le
 * message d'erreur.
 */
export async function deleteProgressionMission(input: {
  missionId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionMissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteMission",
      "delete_progression_mission",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_mission_id: parsed.data.missionId,
      }),
    ),
  );
}

/**
 * Édite un coffre. ATTENTION : `itemIds` REMPLACE intégralement le contenu (la
 * RPC purge puis réinsère `progression_chest_items`) — toujours envoyer la liste
 * complète voulue, jamais un delta.
 */
export async function updateProgressionChest(input: {
  chestId: string;
  name: string;
  description?: string;
  keyCost: number | string;
  itemIds: string[];
  enabled?: boolean;
}): Promise<ActionResult> {
  const parsed = updateProgressionChestSchema.safeParse({
    chestId: input.chestId,
    name: input.name,
    description: input.description ?? "",
    keyCost: input.keyCost,
    itemIds: input.itemIds ?? [],
    enabled: input.enabled ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.updateChest",
      "update_progression_chest",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_chest_id: parsed.data.chestId,
        p_name: parsed.data.name,
        p_description: parsed.data.description,
        p_key_cost: parsed.data.keyCost,
        p_item_ids: parsed.data.itemIds,
        p_enabled: parsed.data.enabled,
      }),
    ),
  );
}

/**
 * Supprime un coffre. REFUSÉ dès qu'un joueur l'a ouvert (l'ouverture est une
 * trace, pas un brouillon) — le repli est de le DÉSACTIVER.
 */
export async function deleteProgressionChest(input: {
  chestId: string;
}): Promise<ActionResult> {
  const parsed = deleteProgressionChestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.deleteChest",
      "delete_progression_chest",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_chest_id: parsed.data.chestId,
      }),
    ),
  );
}

/**
 * INTERRUPTEUR D'ARRÊT d'une mission. Seul chemin qui touche `enabled` sur une
 * saison LANCÉE : les 13 autres mutations de configuration sont bornées au
 * brouillon, si bien qu'une mission publiée avec un palier trop généreux (palier
 * 1, 100 clés, sans `distinctExperiences`) ne pouvait être stoppée qu'en clôturant
 * TOUTE la saison — ce qui bascule chaque joueur sur son archive.
 *
 * La RPC est autorisée sur `draft` ET `active`, ne modifie QUE `enabled`, et
 * journalise (`progression.mission.enabled`) : couper une mécanique en direct est
 * une décision, pas un réglage. Elle est idempotente — rejouer le même état ne
 * produit ni erreur ni seconde entrée d'audit.
 */
export async function setProgressionMissionEnabled(input: {
  missionId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const parsed = setProgressionMissionEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.setMissionEnabled",
      "set_progression_mission_enabled",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_mission_id: parsed.data.missionId,
        p_enabled: parsed.data.enabled,
      }),
    ),
  );
}

/**
 * INTERRUPTEUR D'ARRÊT d'un coffre, miroir exact du précédent. Un coffre arrêté
 * disparaît du panneau joueur (`player_progression_snapshot` filtre sur
 * `chest.enabled`) et `open_progression_chest` le refuse : les clés déjà gagnées
 * restent au crédit du joueur, aucune n'est reprise.
 */
export async function setProgressionChestEnabled(input: {
  chestId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const parsed = setProgressionChestEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return asVoidResult(
    await runProgressionEditorRpc(
      "progression.setChestEnabled",
      "set_progression_chest_enabled",
      (organizationId) => ({
        p_organization_id: organizationId,
        p_chest_id: parsed.data.chestId,
        p_enabled: parsed.data.enabled,
      }),
    ),
  );
}

/**
 * Vue commerçant AGRÉGÉE : configuration de toutes les saisons + volumes. La RPC
 * n'expose JAMAIS de `player_id` ni la moindre identité, et n'est accordée qu'à
 * un membre de l'organisation (`is_org_member`) — lecture ouverte au rôle
 * `viewer`, contrairement aux mutations. Un échec rend un tableau de bord vide
 * plutôt qu'une erreur : l'écran de configuration reste utilisable.
 */
export async function getOrgProgression(): Promise<OrgProgressionSnapshot> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_progression_snapshot", {
    p_organization_id: organization.id,
  });
  if (error) {
    reportError("progression.orgSnapshot", error.message);
    return mapOrgProgressionSnapshot(null);
  }
  return mapOrgProgressionSnapshot(data);
}

// ════════════════════════════════════════════════════════════
// Parcours joueur — identité pseudonyme (cookie `lc-player`)
// ════════════════════════════════════════════════════════════

type PlayerGuard =
  | { ok: true; deviceTokenHash: string }
  | { ok: false; reason: "unavailable" | "rate_limited" };

/**
 * Prélude commun aux actions joueur : lit l'identité device en LECTURE SEULE
 * (`peekPlayerDeviceTokenHash` ne pose jamais le cookie — un visiteur sans
 * identité n'a par construction aucune progression), puis tranche le PREMIER
 * REMPART, deux seaux `failClosed` sur des clés d'IDENTITÉ, AVANT toute requête,
 * tout appel sortant et toute instrumentation.
 *
 * L'ORDRE DES DEUX SEAUX EST LOAD-BEARING, et c'est la correction d'un
 * contournement réel. `organizationId` vient du CLIENT : composé dans la clé, il
 * ouvrait un seau NEUF de 60 req/min par UUID inventé, si bien qu'un unique
 * cookie valide (obtenu en scannant n'importe quel QR) n'était borné par rien —
 * chaque tour de boucle coûtant une écriture de rate-limit et un `select` sur
 * `organizations`. Le PLAFOND GLOBAL du cookie est donc consommé D'ABORD : une
 * fois saturé, plus aucun seau par organisation n'est même touché.
 */
async function beginProgressionPlayer(
  organizationId: string,
): Promise<PlayerGuard> {
  const deviceTokenHash = await peekPlayerDeviceTokenHash();
  if (!deviceTokenHash) return { ok: false, reason: "unavailable" };

  if (
    !(await rateLimit(
      rateLimitBucket("progression:device", deviceTokenHash),
      RATE_LIMITS.progressionDevice,
      { failClosed: true },
    ))
  ) {
    return { ok: false, reason: "rate_limited" };
  }

  if (
    !(await rateLimit(
      rateLimitBucket("progression:player", organizationId, deviceTokenHash),
      RATE_LIMITS.progressionPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: true, deviceTokenHash };
}

/**
 * Seau d'observabilité de la pression publique (clé partagée, jamais un refus).
 *
 * À CONSOMMER AVANT LE CONTRÔLE D'ORGANISATION. Placé après, il n'était jamais
 * atteint sur un `organizationId` inconnu : une rafale sur des UUID inventés ne
 * produisait donc AUCUN `progression_public_pressure` et restait invisible au
 * monitoring — exactement le cas qu'il faut voir.
 */
async function observeProgressionPressure(organizationId: string): Promise<void> {
  await observeSharedKey(
    rateLimitBucket(
      "progression:public:ip",
      organizationId,
      clientIpFromHeaders(await headers()),
    ),
    RATE_LIMITS.progressionPublicIp,
    "progression_public_pressure",
    { organization_id: organizationId },
  );
}

/**
 * L'organisation sert-elle encore ses expériences ? Les RPC joueur ne gardent
 * que la saison active, pas l'état d'abonnement : c'est ce que ce contrôle
 * referme, comme `hasReferralAccess` / `hasCalendarAccess` le font pour leurs
 * modules (à ceci près qu'aucun addon ne couvre la méta-progression).
 */
async function progressionOrganizationServes(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("organizations")
    .select(
      "id, subscription_status, trial_ends_at, past_due_since, comp_access, comp_access_until",
    )
    .eq("id", organizationId)
    // Le client admin n'est pas typé par `Database` (dette de l'item 9) : la
    // forme attendue se dit donc ici, en ENTRÉE, plutôt que par un double cast
    // en sortie. `Parameters<...>` la garde amarrée à `hasActiveAccess` — si sa
    // signature bouge, c'est cette requête qui cesse de compiler.
    .maybeSingle<Parameters<typeof hasActiveAccess>[0]>();
  if (!data) return false;
  return hasActiveAccess(data);
}

/**
 * Tableau de bord du joueur pour la saison ACTIVE d'une organisation : solde de
 * clés, missions et leur jauge, badges, collections et coffres. La RPC renvoie
 * `null` — et le mapper `unavailable` — quand le device est inconnu de
 * l'organisation ou qu'aucune saison ne court : deux cas volontairement
 * indiscernables (aucun oracle sur l'existence d'une saison).
 */
export async function getPlayerProgression(input: {
  organizationId: string;
}): Promise<PlayerProgressionSnapshot> {
  const parsed = getPlayerProgressionSchema.safeParse(input);
  if (!parsed.success) return mapPlayerProgressionSnapshot(null);

  const guard = await beginProgressionPlayer(parsed.data.organizationId);
  if (!guard.ok) return mapPlayerProgressionSnapshot(null);

  return monitored("progression.playerSnapshot", async () => {
    try {
      await observeProgressionPressure(parsed.data.organizationId);

      const admin = createAdminClient();
      if (
        !(await progressionOrganizationServes(admin, parsed.data.organizationId))
      ) {
        return mapPlayerProgressionSnapshot(null);
      }

      const { data, error } = await admin.rpc("player_progression_snapshot", {
        p_device_token_hash: guard.deviceTokenHash,
        p_organization_id: parsed.data.organizationId,
      });
      if (error) {
        reportError("progression.playerSnapshot", error.message);
        return mapPlayerProgressionSnapshot(null);
      }
      return mapPlayerProgressionSnapshot(data);
    } catch (err) {
      reportError("progression.playerSnapshot", err);
      return mapPlayerProgressionSnapshot(null);
    }
  });
}

/**
 * Ce que le joueur a gagné dans les saisons CLOSES de cette organisation
 * (`ended` / `archived`) : badges et objets, avec ses totaux de clés.
 *
 * Sans cette seconde lecture, clore une saison ferait DISPARAÎTRE de l'écran du
 * joueur tout ce qu'il a obtenu (`player_progression_snapshot` ne sert que la
 * saison active). L'état `unavailable` distingue l'appareil inconnu du joueur
 * connu sans saison close : on n'annonce jamais « vous n'avez rien gagné » à
 * quelqu'un qu'on n'a pas identifié.
 */
export async function getPlayerProgressionArchive(input: {
  organizationId: string;
}): Promise<PlayerProgressionArchive> {
  const parsed = getPlayerProgressionArchiveSchema.safeParse(input);
  if (!parsed.success) return mapPlayerProgressionArchive(null);

  const guard = await beginProgressionPlayer(parsed.data.organizationId);
  if (!guard.ok) return mapPlayerProgressionArchive(null);

  return monitored("progression.playerArchive", async () => {
    try {
      await observeProgressionPressure(parsed.data.organizationId);

      const admin = createAdminClient();
      if (
        !(await progressionOrganizationServes(admin, parsed.data.organizationId))
      ) {
        return mapPlayerProgressionArchive(null);
      }

      const { data, error } = await admin.rpc("player_progression_archive", {
        p_device_token_hash: guard.deviceTokenHash,
        p_organization_id: parsed.data.organizationId,
      });
      if (error) {
        reportError("progression.playerArchive", error.message);
        return mapPlayerProgressionArchive(null);
      }
      return mapPlayerProgressionArchive(data);
    } catch (err) {
      reportError("progression.playerArchive", err);
      return mapPlayerProgressionArchive(null);
    }
  });
}

/**
 * Ouvre un coffre : débite les clés de la saison et débloque UN objet de
 * collection encore manquant. NON MONÉTAIRE — aucun code de caisse n'est produit.
 *
 * IDEMPOTENCE (le point sensible : un débit ne doit jamais être joué deux fois).
 * La base porte la garantie — `unique (player_season_id, request_id)` et une
 * relecture de l'ouverture existante AVANT tout débit — mais elle ne vaut que si
 * le `request_id` est STABLE d'une tentative à l'autre. Un UUID tiré au hasard à
 * chaque appel la rendrait inopérante : deux clics = deux clés dépensées.
 * D'où deux niveaux :
 *  · `requestId` fourni par l'appelant — le mécanisme PRÉFÉRÉ : une clé par
 *    geste, réutilisée telle quelle par toute reprise de la même soumission ;
 *  · à défaut, une clé DÉRIVÉE de (device, coffre, seau de 5 s) : déterministe,
 *    donc double-clic et rejeu réseau retombent sur la même ouverture.
 * Un `requestId` forgé n'ouvre rien de plus : il n'est unique QUE dans la saison
 * du joueur qui le présente — le rejouer rend sa propre ouverture, en changer
 * revient à cliquer à nouveau. Il ne permet pas davantage de CHOISIR son butin :
 * depuis 20260805210000 l'ordre de tirage est salé par `progression_chests
 * .loot_seed`, un secret serveur qu'aucune RPC de lecture n'expose. L'ordre
 * reste déterministe pour un couple (coffre, request_id), donc l'idempotence est
 * intacte, mais il n'est plus prédictible hors ligne.
 */
export async function openProgressionChest(input: {
  organizationId: string;
  chestId: string;
  requestId?: string;
}): Promise<ActionResult<ProgressionChestOpening>> {
  const parsed = openProgressionChestSchema.safeParse({
    organizationId: input.organizationId,
    chestId: input.chestId,
    requestId: input.requestId ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await beginProgressionPlayer(parsed.data.organizationId);
  if (!guard.ok) {
    if (guard.reason === "rate_limited") {
      return { ok: false, error: RATE_LIMITED };
    }
    return { ok: true, data: mapProgressionChestOpening(null) };
  }

  return monitored("progression.openChest", () =>
    openChestInner(parsed.data, guard.deviceTokenHash),
  );
}

async function openChestInner(
  parsed: { organizationId: string; chestId: string; requestId: string | null },
  deviceTokenHash: string,
): Promise<ActionResult<ProgressionChestOpening>> {
  try {
    await observeProgressionPressure(parsed.organizationId);

    const admin = createAdminClient();
    if (!(await progressionOrganizationServes(admin, parsed.organizationId))) {
      return { ok: true, data: mapProgressionChestOpening(null) };
    }

    const requestId =
      parsed.requestId ??
      deriveProgressionRequestId(deviceTokenHash, parsed.chestId);

    const { data, error } = await admin.rpc("open_progression_chest", {
      p_device_token_hash: deviceTokenHash,
      p_organization_id: parsed.organizationId,
      p_chest_id: parsed.chestId,
      p_request_id: requestId,
    });
    if (error) {
      reportError("progression.openChest", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    return { ok: true, data: mapProgressionChestOpening(data) };
  } catch (err) {
    reportError("progression.openChest", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
