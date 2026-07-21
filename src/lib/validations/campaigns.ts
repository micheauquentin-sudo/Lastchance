import { z } from "zod";

export const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la campagne est requis")
  .max(120, "Nom trop long");

export const createCampaignSchema = z.object({
  name: campaignNameSchema,
});

export const updateCampaignSchema = z.object({
  id: z.string().uuid(),
  name: campaignNameSchema.optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export const deleteCampaignSchema = z.object({
  id: z.string().uuid(),
});

export const duplicateCampaignSchema = z.object({
  id: z.string().uuid(),
});

const linkUrl = z
  .string()
  .trim()
  .max(300, "Lien trop long")
  .refine((v) => v === "" || v.startsWith("https://"), {
    message: "Le lien doit commencer par https://",
  })
  .default("");

/**
 * Actions proposées au joueur avant de lancer la roue (par campagne).
 * Une action lien activée sans URL est refusée.
 */
export const updateCampaignEngagementSchema = z
  .object({
    id: z.string().uuid(),
    newsletter: z.boolean(),
    instagram: z.boolean(),
    instagram_url: linkUrl,
    tiktok: z.boolean(),
    tiktok_url: linkUrl,
    google_review: z.boolean(),
    google_review_url: linkUrl,
  })
  .superRefine((data, ctx) => {
    const pairs: Array<[boolean, string, string]> = [
      [data.instagram, data.instagram_url, "instagram_url"],
      [data.tiktok, data.tiktok_url, "tiktok_url"],
      [data.google_review, data.google_review_url, "google_review_url"],
    ];
    for (const [enabled, url, path] of pairs) {
      if (enabled && url === "") {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Renseignez le lien pour activer cette action",
        });
      }
    }
  });

/** Budget en euros saisi librement (« 250 », « 99,90 ») → centimes, '' → null (sans plafond). */
const budgetEurosToCents = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .transform((raw, ctx) => {
        const value = Number(raw.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
          ctx.addIssue({ code: "custom", message: "Budget invalide (montant positif requis)" });
          return z.NEVER;
        }
        return Math.round(value * 100);
      }),
  ])
  .nullable()
  .default(null);

/** Date-heure de formulaire (datetime-local ou ISO) → ISO, '' → null. */
const campaignDateTime = z
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

/**
 * Programmation et budget d'une campagne : période (starts_at/ends_at,
 * suivie par run_campaign_schedule côté base quand auto_schedule est
 * actif) et plafond de dépense (imputé par claim_winning_spin).
 */
export const updateCampaignAutomationSchema = z
  .object({
    id: z.string().uuid(),
    auto_schedule: z.boolean(),
    starts_at: campaignDateTime,
    ends_at: campaignDateTime,
    budget_cents: budgetEurosToCents,
  })
  .superRefine((d, ctx) => {
    if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "La fin doit être après le début",
      });
    }
    if (d.auto_schedule && !d.starts_at && !d.ends_at) {
      ctx.addIssue({
        code: "custom",
        path: ["starts_at"],
        message: "Renseignez au moins une date pour programmer la campagne",
      });
    }
  });

/** Relance d'une campagne pausée pour budget atteint (nouveau budget facultatif). */
export const resumeCampaignBudgetSchema = z.object({
  id: z.string().uuid(),
  // '' → null : on conserve le budget actuel (la campagne se remettra en
  // pause au prochain gain si le plafond reste dépassé).
  budget_cents: budgetEurosToCents,
});

/**
 * Réglages du formulaire après gain : quelles données sont demandées
 * avant d'afficher le code, et compte à rebours avant masquage du code.
 */
export const updateCampaignClaimSchema = z.object({
  id: z.string().uuid(),
  collect_email: z.boolean(),
  collect_phone: z.boolean(),
  code_ttl_seconds: z
    .union([
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Nombre entier de secondes requis")
        .min(10, "Minimum 10 secondes")
        .max(600, "Maximum 600 secondes (10 min)"),
    ])
    .nullable()
    .default(null),
});
