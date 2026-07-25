import { z } from "zod";
import { isValidLocalDateTime } from "@/lib/date-time";
import {
  PROGRESSION_BADGE_ICONS,
  PROGRESSION_BADGE_NAME_MAX,
  PROGRESSION_CHEST_ITEMS_MAX,
  PROGRESSION_CHEST_ITEMS_MIN,
  PROGRESSION_CHEST_NAME_MAX,
  PROGRESSION_COLLECTION_NAME_MAX,
  PROGRESSION_DESCRIPTION_MAX,
  PROGRESSION_EVENT_NAMES,
  PROGRESSION_EXPERIENCE_KINDS,
  PROGRESSION_IMAGE_URL_MAX,
  PROGRESSION_ITEM_NAME_MAX,
  PROGRESSION_KEY_COST_MAX,
  PROGRESSION_KEY_COST_MIN,
  PROGRESSION_KEY_REWARD_MAX,
  PROGRESSION_MISSION_DESCRIPTION_MAX,
  PROGRESSION_MISSION_NAME_MAX,
  PROGRESSION_SEASON_MAX_DAYS,
  PROGRESSION_SEASON_NAME_MAX,
  PROGRESSION_SOURCES,
  PROGRESSION_TARGET_MAX,
  PROGRESSION_TARGET_MIN,
} from "@/lib/meta-progression";

// ────────────────────────────────────────────────────────────
// Méta-progression — schémas d'entrée des 7 mutations de configuration
//
// MIROIR DE CONFORT, PAS L'AUTORITÉ. Toutes les bornes ci-dessous répliquent la
// migration 20260805200000 (is_valid_progression_rule, les CHECK des tables
// progression_* et les gardes des RPC `create_progression_*`) : chaque RPC est
// `security definer`, revérifie `is_org_editor`, l'appartenance de la saison à
// l'organisation ET son statut `draft`. Ces schémas ne servent qu'à rendre un
// message lisible au commerçant AVANT l'aller-retour — jamais de barrière unique.
// Modelé sur validations/quiz.ts et validations/referral.ts.
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/** Description libre, bornée. '' accepté (valeur par défaut côté SQL). */
function descriptionSchema(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Description trop longue (${max} caractères max)`)
    .default("");
}

function nameSchema(max: number, required: string) {
  return z
    .string()
    .trim()
    .min(1, required)
    .max(max, `Nom trop long (${max} caractères max)`);
}

/**
 * Heure civile du commerce (`datetime-local`) : convertie en instant UTC par
 * l'action, avec le fuseau de l'organisation (`zonedDateTimeToIso`), comme la
 * programmation d'une campagne. Aucune date ne transite en heure « serveur ».
 */
const seasonDateTime = z
  .string()
  .trim()
  .refine(isValidLocalDateTime, "Date et heure invalides");

/** UUID optionnel d'un formulaire : '' → null. */
const optionalUuid = z
  .union([z.literal("").transform(() => null), uuid])
  .nullable()
  .default(null);

// ── 1. Saison ──

/**
 * Fenêtre d'une saison. `ends_at > starts_at` et une durée d'au plus 366 jours
 * (miroir de `progression_seasons_window_check`). La comparaison porte sur les
 * heures CIVILES saisies : la base tranche ensuite sur les instants réels, elle
 * seule fait autorité à une heure près autour d'un changement d'heure.
 */
export const createProgressionSeasonSchema = z
  .object({
    name: nameSchema(
      PROGRESSION_SEASON_NAME_MAX,
      "Le nom de la saison est requis",
    ),
    startsAt: seasonDateTime,
    endsAt: seasonDateTime,
  })
  .superRefine((data, ctx) => {
    if (data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fin de saison doit être après son début",
      });
      return;
    }
    const spanMs = Date.parse(`${data.endsAt}Z`) - Date.parse(`${data.startsAt}Z`);
    if (spanMs > PROGRESSION_SEASON_MAX_DAYS * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: `Une saison ne peut pas durer plus de ${PROGRESSION_SEASON_MAX_DAYS} jours`,
      });
    }
  });

/** Activation de la saison : la RPC exige `draft`, non expirée, ≥ 1 mission. */
export const activateProgressionSeasonSchema = z.object({
  seasonId: uuid,
});

// ── 2. Badge ──

export const createProgressionBadgeSchema = z.object({
  seasonId: uuid,
  name: nameSchema(PROGRESSION_BADGE_NAME_MAX, "Le nom du badge est requis"),
  description: descriptionSchema(PROGRESSION_DESCRIPTION_MAX),
  iconKey: z.enum(PROGRESSION_BADGE_ICONS).default("star"),
});

// ── 3. Collection ──

export const createProgressionCollectionSchema = z.object({
  seasonId: uuid,
  name: nameSchema(
    PROGRESSION_COLLECTION_NAME_MAX,
    "Le nom de la collection est requis",
  ),
  description: descriptionSchema(PROGRESSION_DESCRIPTION_MAX),
});

// ── 4. Objet de collection ──

/**
 * Visuel de l'objet. '' → null. HTTPS EXIGÉ (miroir du CHECK SQL `^https://`) :
 * une image en clair sur une page joueur servie en HTTPS serait bloquée par le
 * navigateur, et le refus SQL serait illisible.
 */
const itemImageUrlSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .max(PROGRESSION_IMAGE_URL_MAX, "URL trop longue")
      .refine((v) => v.startsWith("https://"), "L'URL doit commencer par https://"),
  ])
  .nullable()
  .default(null);

export const createProgressionCollectionItemSchema = z.object({
  collectionId: uuid,
  name: nameSchema(PROGRESSION_ITEM_NAME_MAX, "Le nom de l'objet est requis"),
  description: descriptionSchema(PROGRESSION_DESCRIPTION_MAX),
  imageUrl: itemImageUrlSchema,
});

// ── 5. Mission ──

/**
 * Familles d'expériences comptées par la mission : 1 à 9, SANS DOUBLON (miroir
 * de `is_valid_progression_rule`, qui compare `count(distinct …)` à la longueur
 * du tableau — un doublon fait échouer la RPC avec un « invalid mission » brut).
 */
const experienceKindsSchema = z
  .array(z.enum(PROGRESSION_EXPERIENCE_KINDS))
  .min(1, "Choisissez au moins un type d'expérience")
  .max(
    PROGRESSION_EXPERIENCE_KINDS.length,
    `${PROGRESSION_EXPERIENCE_KINDS.length} types maximum`,
  )
  .refine(
    (kinds) => new Set(kinds).size === kinds.length,
    "Un même type d'expérience est sélectionné deux fois",
  );

/** Filtre d'origine facultatif : '' → null (toutes origines comptent). */
const missionSourceSchema = z
  .union([z.literal("").transform(() => null), z.enum(PROGRESSION_SOURCES)])
  .nullable()
  .default(null);

/**
 * Une mission = une règle immuable + sa dotation NON MONÉTAIRE (clés, badge,
 * objet). Elle n'émet jamais de code de caisse : les événements `reward_issued` /
 * `reward_redeemed` qu'elle peut compter sont produits par la source d'origine.
 */
export const createProgressionMissionSchema = z.object({
  seasonId: uuid,
  name: nameSchema(
    PROGRESSION_MISSION_NAME_MAX,
    "Le nom de la mission est requis",
  ),
  description: descriptionSchema(PROGRESSION_MISSION_DESCRIPTION_MAX),
  eventName: z.enum(PROGRESSION_EVENT_NAMES),
  target: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(PROGRESSION_TARGET_MIN, "Le palier doit valoir au moins 1")
    .max(PROGRESSION_TARGET_MAX, `${PROGRESSION_TARGET_MAX} maximum`),
  experienceKinds: experienceKindsSchema,
  keyReward: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(0, "Nombre de clés négatif interdit")
    .max(PROGRESSION_KEY_REWARD_MAX, `${PROGRESSION_KEY_REWARD_MAX} clés maximum`)
    .default(0),
  source: missionSourceSchema,
  /** true = une seule contribution par expérience distincte (anti-répétition). */
  distinctExperiences: z.coerce.boolean().default(false),
  badgeId: optionalUuid,
  collectionItemId: optionalUuid,
});

// ── 6. Coffre ──

/**
 * Un coffre consomme des clés et débloque UN objet de collection encore
 * manquant. Son contenu est une liste d'objets DISTINCTS de 1 à 50 (miroir de
 * la garde `invalid chest` de la RPC).
 */
export const createProgressionChestSchema = z.object({
  seasonId: uuid,
  name: nameSchema(PROGRESSION_CHEST_NAME_MAX, "Le nom du coffre est requis"),
  description: descriptionSchema(PROGRESSION_DESCRIPTION_MAX),
  keyCost: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(PROGRESSION_KEY_COST_MIN, "Un coffre coûte au moins une clé")
    .max(PROGRESSION_KEY_COST_MAX, `${PROGRESSION_KEY_COST_MAX} clés maximum`),
  itemIds: z
    .array(uuid)
    .min(PROGRESSION_CHEST_ITEMS_MIN, "Ajoutez au moins un objet au coffre")
    .max(PROGRESSION_CHEST_ITEMS_MAX, `${PROGRESSION_CHEST_ITEMS_MAX} objets maximum`)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Un même objet est ajouté deux fois",
    ),
});

// ── Parcours joueur (pseudonyme, cookie `lc-player`) ──

/** Lecture de la progression du porteur du cookie dans une organisation. */
export const getPlayerProgressionSchema = z.object({
  organizationId: uuid,
});

/**
 * Ouverture d'un coffre. `requestId` est la CLÉ D'IDEMPOTENCE : une par geste de
 * l'utilisateur, réutilisée telle quelle si la requête est rejouée (réseau,
 * double soumission). Omise, l'action en dérive une déterministe sur une courte
 * fenêtre (`deriveProgressionRequestId`) — cf. la note de ce helper.
 */
export const openProgressionChestSchema = z.object({
  organizationId: uuid,
  chestId: uuid,
  requestId: z
    .union([z.literal("").transform(() => null), uuid])
    .nullable()
    .default(null),
});
