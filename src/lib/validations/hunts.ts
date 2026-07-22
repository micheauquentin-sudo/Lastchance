import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Chasse au trésor multi-QR — schémas d'entrée
//
// Bornes applicatives plus strictes que les CHECK SQL (00024) :
// l'UI reste lisible (noms/libellés courts), la base garde de la marge.
// ────────────────────────────────────────────────────────────

/** Nom d'une chasse — 1..80 (le CHECK SQL tolère jusqu'à 120). */
const huntNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la chasse est requis")
  .max(80, "Nom trop long (80 caractères max)");

/** Libellé d'une étape (aussi affiché au joueur une fois scanné). */
const stepLabelSchema = z
  .string()
  .trim()
  .min(1, "Le libellé de l'étape est requis")
  .max(60, "Libellé trop long (60 caractères max)");

/** Indice optionnel révélé après le scan de l'étape ('' = aucun). */
const stepHintSchema = z
  .string()
  .trim()
  .max(200, "Indice trop long (200 caractères max)")
  .default("");

/** Lot final : requis (non vide) uniquement à l'activation. */
const rewardLabelSchema = z
  .string()
  .trim()
  .max(80, "Lot trop long (80 caractères max)")
  .default("");

const rewardDetailsSchema = z
  .string()
  .trim()
  .max(2000, "Description trop longue (2000 caractères max)")
  .default("");

export const huntOrderModeSchema = z.enum(["free", "ordered"]);

/** Délai minimal anti-partage entre deux scans (secondes, 0 = désactivé). */
const minScanIntervalSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(0, "Valeur négative interdite")
  .max(86400, "Maximum 86400 secondes (24 h)");

/** Stock du lot en euros/unités entières, '' → null (illimité). */
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

/** Date-heure de formulaire (datetime-local ou ISO) → ISO, '' → null. */
const huntDateTime = z
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

// ── Dashboard commerçant ──

export const createHuntSchema = z.object({
  name: huntNameSchema,
});

/** Réglages d'une chasse (hors statut : voir setHuntStatusSchema). */
export const updateHuntSchema = z
  .object({
    id: z.string().uuid(),
    name: huntNameSchema,
    order_mode: huntOrderModeSchema,
    min_scan_interval_seconds: minScanIntervalSchema,
    reward_label: rewardLabelSchema,
    reward_details: rewardDetailsSchema,
    reward_stock: rewardStockSchema,
    starts_at: huntDateTime,
    ends_at: huntDateTime,
  })
  .superRefine((d, ctx) => {
    if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "La fin doit être après le début",
      });
    }
  });

export const setHuntStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteHuntSchema = z.object({
  id: z.string().uuid(),
});

// ── Étapes (une étape = un QR code) ──

export const createHuntStepSchema = z.object({
  hunt_id: z.string().uuid(),
  label: stepLabelSchema,
  hint: stepHintSchema,
});

export const updateHuntStepSchema = z.object({
  id: z.string().uuid(),
  label: stepLabelSchema,
  hint: stepHintSchema,
});

export const deleteHuntStepSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Réordonnancement : liste ordonnée des identifiants d'étapes de la
 * chasse (2..10, sans doublon). Les positions sont réattribuées côté
 * action dans l'ordre reçu.
 */
export const reorderHuntStepsSchema = z.object({
  hunt_id: z.string().uuid(),
  order: z
    .array(z.string().uuid())
    .min(2, "Une chasse compte au moins 2 étapes")
    .max(10, "10 étapes maximum")
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: "Étapes en double" });
      }
    }),
});

// ── Parcours public (clients du commerçant) ──

/** Jeton public d'étape (URL du QR) — miroir du CHECK SQL. */
export const huntStepTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{8,64}$/, "Lien invalide");

export const stampHuntStepSchema = z.object({
  stepToken: huntStepTokenSchema,
});

/**
 * Claim du code de retrait après complétion : email OPTIONNEL (le code
 * s'affiche toujours à l'écran). Cible la chasse par le jeton d'étape ou
 * directement par son identifiant.
 */
export const claimHuntRewardSchema = z
  .object({
    stepToken: huntStepTokenSchema.optional(),
    huntId: z.string().uuid().optional(),
    email: z
      .union([z.literal(""), z.string().trim().toLowerCase().email("Email invalide").max(254)])
      .default(""),
    marketingOptIn: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (!d.stepToken && !d.huntId) {
      ctx.addIssue({
        code: "custom",
        path: ["huntId"],
        message: "Chasse non identifiée",
      });
    }
  });

/**
 * Code de retrait présenté en caisse (CHASSE-XXXXXXXX). Casse et espaces
 * autour tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL).
 */
export const huntRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CHASSE-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
