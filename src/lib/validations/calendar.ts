import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Calendrier / campagnes quotidiennes — schémas d'entrée
//
// Bornes applicatives plus strictes ou égales aux CHECK SQL de la migration
// 20260728120000_calendar_campaigns : l'UI reste lisible, la base garde sa
// marge. Modelé sur validations/events.ts et validations/jackpot.ts (même verrou
// économique : stock FINI OBLIGATOIRE sur toute case `lot` et sur la récompense
// d'assiduité ; cohérence usage ↔ champs miroir des CHECK SQL).
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/** Thème saisonnier (miroir de l'enum SQL). */
export const calendarThemeSchema = z.enum([
  "noel",
  "anniversaire",
  "soldes",
  "festival",
  "neutre",
]);

/** Usage d'une case (miroir de l'enum SQL). */
export const calendarContentTypeSchema = z.enum(["content", "lot", "spin"]);

/** Nom d'un calendrier — 1..120 (miroir CHECK SQL). */
const calendarNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom du calendrier est requis")
  .max(120, "Nom trop long (120 caractères max)");

/**
 * Nombre de cases — 1..60 (miroir CHECK SQL). Avent = 24, semaine = 7, compte à
 * rebours = N.
 */
const dayCountSchema = z.coerce
  .number()
  .int("Nombre entier requis")
  .min(1, "Au moins une case")
  .max(60, "60 cases maximum");

/** Date de départ de la grille (YYYY-MM-DD). */
const startDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de départ invalide (AAAA-MM-JJ)")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Date de départ invalide");

/**
 * Fuseau IANA du calendrier. '' → null (l'action retombe alors sur le fuseau de
 * l'organisation). Sinon validé contre Intl (un fuseau inconnu ferait dériver
 * tout le calcul des unlock_at).
 */
const timezoneSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .max(64, "Fuseau invalide")
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Fuseau horaire inconnu"),
  ])
  .nullable()
  .default(null);

/**
 * URL publique suivable. '' → null (la page cible alors l'id). Sinon 3..64
 * caractères [a-z0-9-] (miroir du CHECK SQL et de l'unicité).
 */
const publicSlugSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{3,64}$/, "Slug invalide (3 à 64 caractères a-z, 0-9, -)"),
  ])
  .nullable()
  .default(null);

/** Contenu marchand affiché sur la page publique (accroche). */
const merchantContentSchema = z
  .string()
  .trim()
  .max(4000, "Contenu trop long (4000 caractères max)")
  .default("");

/** Libellé de lot — borné 0..120 (requis à l'activation, vérifié côté action). */
const rewardLabelSchema = z
  .string()
  .trim()
  .max(120, "Lot trop long (120 caractères max)")
  .default("");

const rewardDetailsSchema = z
  .string()
  .trim()
  .max(2000, "Description trop longue (2000 caractères max)")
  .default("");

/**
 * Message d'une case `content` — borné 0..2000 (miroir CHECK SQL). Requis (non
 * vide) à l'activation pour une case `content`, vérifié par refineDay.
 */
const contentTextSchema = z
  .string()
  .trim()
  .max(2000, "Message trop long (2000 caractères max)")
  .default("");

/**
 * Stock du lot d'une case `lot` en unités entières. '' → null. Miroir du CHECK
 * SQL (reward_stock >= 0). refineDay le rend OBLIGATOIRE sur une case `lot`
 * (verrou économique ADR-031). 0 = « épuisé / en pause », état non destructeur.
 */
const rewardStockSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(0, "Stock négatif interdit")
      .max(1_000_000, "Stock trop grand"),
  ])
  .nullable()
  .default(null);

/**
 * Stock de la récompense d'assiduité — FINI et OBLIGATOIRE (ADR-031, miroir du
 * NOT NULL SQL completion_reward_stock >= 0). '' → 0 (« pas de récompense
 * finale »), état non destructeur.
 */
const completionRewardStockSchema = z
  .union([
    z.literal("").transform(() => 0),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(0, "Stock négatif interdit")
      .max(1_000_000, "Stock trop grand"),
  ])
  .default(0);

/** Roue cible d'une case `spin` — UUID ; '' → null. */
const targetWheelIdSchema = z
  .union([z.literal("").transform(() => null), uuid])
  .nullable()
  .default(null);

// ── Dashboard commerçant — calendriers ──

export const createCalendarSchema = z.object({
  name: calendarNameSchema,
});

/** Réglages d'un calendrier (hors statut : voir setCalendarStatusSchema). */
export const updateCalendarSchema = z.object({
  id: uuid,
  name: calendarNameSchema,
  theme: calendarThemeSchema,
  start_date: startDateSchema,
  timezone: timezoneSchema,
  day_count: dayCountSchema,
  public_slug: publicSlugSchema,
  merchant_content: merchantContentSchema,
  completion_reward_label: rewardLabelSchema,
  completion_reward_details: rewardDetailsSchema,
  completion_reward_stock: completionRewardStockSchema,
});

export const setCalendarStatusSchema = z.object({
  id: uuid,
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteCalendarSchema = z.object({
  id: uuid,
});

// ── Dashboard commerçant — cases ──

/**
 * Cohérence usage ↔ champs (miroir des CHECK SQL calendar_days_lot_stock_check /
 * calendar_days_spin_wheel_check) :
 *  · lot     ⇒ stock FINI obligatoire (verrou économique ADR-031) ;
 *  · spin    ⇒ roue cible désignée ;
 *  · content ⇒ message présent (cohérence d'affichage, non vide).
 * Sans ces refine, le commerçant récolterait une erreur SQL brute 23514.
 */
function refineDay(
  d: {
    content_type: "content" | "lot" | "spin";
    content_text: string;
    reward_label: string;
    reward_stock: number | null;
    target_wheel_id: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (d.content_type === "lot") {
    if (d.reward_stock === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_stock"],
        message:
          "Indiquez le stock du lot : il borne le nombre de gagnants (0 = épuisé / en pause)",
      });
    }
    if (!d.reward_label.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_label"],
        message: "Indiquez le libellé du lot de cette case",
      });
    }
  }
  if (d.content_type === "spin" && !d.target_wheel_id) {
    ctx.addIssue({
      code: "custom",
      path: ["target_wheel_id"],
      message: "Choisissez la roue offerte pour cette case",
    });
  }
  if (d.content_type === "content" && !d.content_text.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["content_text"],
      message: "Saisissez le message affiché à l'ouverture de cette case",
    });
  }
}

/**
 * Configuration d'une case, éditée par son id. day_index et unlock_at ne sont
 * JAMAIS édités ici : ils sont dérivés de la grille du calendrier (start_date +
 * offset dans le fuseau) et restés SERVEUR-AUTORITATIFS (gating temporel). Le
 * merchant ne règle que l'usage et le contenu d'une case existante.
 */
export const updateCalendarDaySchema = z
  .object({
    id: uuid,
    content_type: calendarContentTypeSchema,
    content_text: contentTextSchema,
    reward_label: rewardLabelSchema,
    reward_details: rewardDetailsSchema,
    reward_stock: rewardStockSchema,
    target_wheel_id: targetWheelIdSchema,
    is_special: z.coerce.boolean().default(false),
  })
  .superRefine(refineDay);

// ── Parcours public (clients du commerçant) ──

/** Identifiant de calendrier porté par les actions publiques (toujours l'UUID). */
export const calendarIdSchema = uuid;

/**
 * URL/slug public résolu par joinCalendar : slug [a-z0-9-]{3,64} OU UUID (la
 * page peut cibler l'id). Casse tolérée, normalisée en minuscules.
 */
export const calendarSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(64, "Lien invalide")
  .regex(
    /^([a-z0-9-]{3,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    "Lien invalide",
  );

/**
 * Email opt-in RGPD (rappel quotidien / marketing) : consentement EXPLICITE
 * côté UI (jamais pré-coché). '' → undefined (aucune PII collectée). Miroir léger
 * du CHECK SQL (3..320, présence d'un @).
 */
const optInEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Email invalide")
    .max(320, "Email trop long")
    .refine((v) => v.includes("@"), "Email invalide")
    .optional(),
);

/**
 * Rejoindre un calendrier : slug + opt-in email facultatifs. Les opt-in ne valent
 * que si un email est fourni (consentement RGPD explicite).
 */
export const joinCalendarSchema = z.object({
  slug: calendarSlugSchema,
  email: optInEmailSchema,
  marketingOptIn: z.coerce.boolean().default(false),
  reminderOptIn: z.coerce.boolean().default(false),
});

/** Ouvrir une case : calendrier + case (tous UUID). */
export const openCalendarBoxSchema = z.object({
  calendarId: uuid,
  dayId: uuid,
});

/** Consommer un tour offert : calendrier + jeton de spin (48 hex). */
export const consumeCalendarSpinSchema = z.object({
  calendarId: uuid,
  grantToken: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{48}$/, "Jeton de tour offert invalide"),
});

/** Repli polling : l'état public d'un calendrier par son UUID. */
export const getCalendarStateSchema = z.object({
  calendarId: uuid,
});

// ── Caisse (remise en caisse) ──

/**
 * Code de retrait présenté en caisse (CADEAU-XXXXXXXX). Casse et espaces autour
 * tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL). Miroir strict de
 * jackpotRedeemCodeSchema / eventRedeemCodeSchema.
 */
export const calendarRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CADEAU-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
