import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Jackpot collectif — schémas d'entrée
//
// Bornes applicatives plus strictes ou égales aux CHECK SQL de la migration
// 20260726120000_jackpot_collective : l'UI reste lisible, la base garde sa
// marge. Modelé sur validations/loyalty.ts (mêmes verrous économiques : stock
// FINI OBLIGATOIRE, plancher de cooldown par mode).
// ────────────────────────────────────────────────────────────

/** Nom d'une campagne — 1..80 (le CHECK SQL tolère jusqu'à 120). */
const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la campagne est requis")
  .max(80, "Nom trop long (80 caractères max)");

export const jackpotValidationModeSchema = z.enum(["rotating_code", "staff"]);
export const jackpotDrawModeSchema = z.enum([
  "threshold_draw",
  "rescan_win",
  "date_draw",
]);

/**
 * Période de rotation du code tournant (secondes), 15..300 — miroir du CHECK
 * SQL : le code reste acceptable 2 périodes, une période longue allongerait
 * d'autant la fenêtre de devinette et de relais.
 */
const rotatingPeriodSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(15, "Rotation trop rapide (15 s minimum)")
  .max(300, "Rotation trop lente (300 s maximum)");

/** Cooldown entre deux participations d'un même joueur (secondes, 0..7 j). */
const minParticipationIntervalSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(0, "Valeur négative interdite")
  .max(604_800, "Maximum 604800 secondes (7 j)");

/**
 * Plancher ABSOLU de cooldown en mode code tournant (miroir du CHECK SQL
 * jackpot_campaigns_cooldown_floor_check) : max(2 × période, 300) — un code
 * accepté sur DEUX fenêtres ne doit pas valoir deux participations. En mode
 * staff : 300 s (la TTL du jeton de check-in plus marge, ce jeton n'étant pas
 * à usage unique).
 */
const ROTATING_COOLDOWN_FLOOR_SECONDS = 300;
const STAFF_COOLDOWN_FLOOR_SECONDS = 300;

/** Objectif de la jauge (déclencheur ou affichage), >= 1 (miroir SQL). */
const thresholdSchema = z.coerce
  .number()
  .int("Nombre entier requis")
  .min(1, "L'objectif doit valoir au moins 1")
  .max(1_000_000, "Objectif trop élevé (1000000 max)");

/**
 * Probabilité de gain instantané (rescan_win). '' → null (= défaut 1/objectif,
 * calculé par la RPC). Sinon un réel dans ]0, 1]. Ignorée hors rescan_win
 * (normalisée à null côté action, comme milestoneFieldsForType en fidélité).
 */
const winProbabilitySchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .gt(0, "La probabilité doit être supérieure à 0")
      .max(1, "La probabilité ne peut pas dépasser 1"),
  ])
  .nullable()
  .default(null);

/** Date-heure de formulaire (datetime-local ou ISO) → ISO, '' → null. */
const jackpotDateTime = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .transform((raw, ctx) => {
        const time = Date.parse(raw);
        if (Number.isNaN(time)) {
          ctx.addIssue({ code: "custom", message: "Date invalide" });
          return z.NEVER;
        }
        return new Date(time).toISOString();
      }),
  ])
  .nullable()
  .default(null);

/** Libellé du lot — requis (non vide) uniquement à l'activation. */
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
 * Stock du lot en unités entières. '' → null, ce que `refineCampaign` refuse
 * ensuite : le stock est OBLIGATOIRE et FINI (ADR-031, miroir du NOT NULL SQL
 * reward_stock >= 0). 0 = « épuisé / en pause », état non destructeur.
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
 * Montant d'affichage saisi en EUROS (décimal, « , » ou « . » tolérés) →
 * centimes entiers. '' → 0. Champ purement cosmétique (le vrai lot reste le
 * lot fini) — d'où une borne large.
 */
const displayEurosToCentsSchema = z
  .union([
    z.literal("").transform(() => 0),
    z
      .string()
      .trim()
      .transform((raw, ctx) => {
        const value = Number(raw.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
          ctx.addIssue({ code: "custom", message: "Montant invalide" });
          return z.NEVER;
        }
        return Math.round(value * 100);
      }),
  ])
  .default(0);

/** Contenu marchand affiché sur la page publique (offres, soirées…). */
const merchantContentSchema = z
  .string()
  .trim()
  .max(4000, "Contenu trop long (4000 caractères max)")
  .default("");

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

// ── Dashboard commerçant ──

export const createJackpotCampaignSchema = z.object({
  name: campaignNameSchema,
});

/**
 * Cohérence mode ↔ champs + planchers économiques (miroir des CHECK SQL) :
 *  · stock FINI obligatoire sur toute campagne (verrou économique ADR-031) ;
 *  · plancher de cooldown par mode de validation ;
 *  · date_draw ⇒ date de tirage requise ; rescan_win ⇒ probabilité valide.
 * Sans ces refine, le commerçant récolterait une erreur SQL brute 23514/23502.
 */
function refineCampaign(
  d: {
    validation_mode: "rotating_code" | "staff";
    rotating_period_seconds: number;
    min_participation_interval_seconds: number;
    draw_mode: "threshold_draw" | "rescan_win" | "date_draw";
    draw_at: string | null;
    reward_stock: number | null;
  },
  ctx: z.RefinementCtx,
) {
  // VERROU ÉCONOMIQUE : pas de campagne sans plafond de lots.
  if (d.reward_stock === null) {
    ctx.addIssue({
      code: "custom",
      path: ["reward_stock"],
      message:
        "Indiquez le stock du lot : il borne le nombre de gagnants (0 = épuisé / en pause)",
    });
  }

  // Plancher de cooldown par mode (miroir jackpot_campaigns_cooldown_floor_check).
  const floor =
    d.validation_mode === "rotating_code"
      ? Math.max(2 * d.rotating_period_seconds, ROTATING_COOLDOWN_FLOOR_SECONDS)
      : STAFF_COOLDOWN_FLOOR_SECONDS;
  if (d.min_participation_interval_seconds < floor) {
    const mode = d.validation_mode === "rotating_code" ? "code tournant" : "caisse";
    ctx.addIssue({
      code: "custom",
      path: ["min_participation_interval_seconds"],
      message: `En mode ${mode}, l'intervalle entre deux participations doit valoir au moins ${floor} secondes (${Math.round(floor / 60)} min).`,
    });
  }

  // date_draw : la date du tirage est indispensable.
  if (d.draw_mode === "date_draw" && !d.draw_at) {
    ctx.addIssue({
      code: "custom",
      path: ["draw_at"],
      message: "Indiquez la date et l'heure du tirage",
    });
  }
}

/** Réglages d'une campagne (hors statut : voir setJackpotCampaignStatusSchema). */
export const updateJackpotCampaignSchema = z
  .object({
    id: z.string().uuid(),
    name: campaignNameSchema,
    public_slug: publicSlugSchema,
    validation_mode: jackpotValidationModeSchema,
    rotating_period_seconds: rotatingPeriodSchema,
    min_participation_interval_seconds: minParticipationIntervalSchema,
    draw_mode: jackpotDrawModeSchema,
    threshold: thresholdSchema,
    win_probability: winProbabilitySchema,
    draw_at: jackpotDateTime,
    reward_label: rewardLabelSchema,
    reward_details: rewardDetailsSchema,
    reward_stock: rewardStockSchema,
    display_base: displayEurosToCentsSchema,
    display_increment: displayEurosToCentsSchema,
    merchant_content: merchantContentSchema,
  })
  .superRefine(refineCampaign);

export const setJackpotCampaignStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteJackpotCampaignSchema = z.object({
  id: z.string().uuid(),
});

// ── Parcours public (clients du commerçant) ──

/** Identifiant de campagne porté par les actions publiques (toujours l'UUID). */
export const jackpotCampaignIdSchema = z.string().uuid("Jackpot introuvable");

/** Code tournant saisi/scanné par le client (6 chiffres). */
export const jackpotRotatingCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Code à 6 chiffres attendu");

/**
 * Jeton de check-in présenté au comptoir (corps base64url + signature HMAC,
 * voir lib/jackpot-checkin.ts). Le jeton d'identité du joueur (cookie httpOnly)
 * n'est JAMAIS transmis par le client : il ne quitte pas le serveur.
 */
export const jackpotCheckinTokenSchema = z
  .string()
  .trim()
  .min(24, "Jeton illisible")
  .max(512, "Jeton illisible")
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "Jeton illisible");

/**
 * Participation publique (mode rotating_code) : le client fournit le code à 6
 * chiffres. Le code est OPTIONNEL au niveau du schéma ('' → undefined) — une
 * participation sans code sur une campagne staff est fermée par la RPC
 * (p_validated_by requis), sans oracle.
 */
export const participateJackpotSchema = z.object({
  campaignId: jackpotCampaignIdSchema,
  code: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    jackpotRotatingCodeSchema.optional(),
  ),
});

// ── Caisse (staff / remise en caisse) ──

/** Participation staff : jeton de check-in court scanné sur l'écran du client. */
export const participateJackpotStaffSchema = z.object({
  campaignId: jackpotCampaignIdSchema,
  checkinToken: jackpotCheckinTokenSchema,
});

/** Code tournant à afficher au comptoir (écran authentifié). */
export const jackpotCounterCodeSchema = z.object({
  campaignId: jackpotCampaignIdSchema,
});

/**
 * Code de retrait présenté en caisse (JACKPOT-XXXXXXXX). Casse et espaces
 * autour tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL).
 */
export const jackpotRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^JACKPOT-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
