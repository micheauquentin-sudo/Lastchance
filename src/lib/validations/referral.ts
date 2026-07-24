import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Parrainage ludique — schémas d'entrée
//
// Le parrainage s'attache aux campagnes ROUE (parcours public play/[slug]). Les
// bornes applicatives reflètent les formats SQL de la migration
// 20260729120000_referral : jeton partageable PR-…, code de retrait PARRAIN-…,
// jeton de tour offert 48 hex. Modelé sur validations/calendar.ts.
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/**
 * Slug public de la campagne roue (segment /play/[slug]). Permissif mais borné :
 * la résolution réelle (qr_codes → campagne) tranche l'existence, une réponse
 * générique masque l'invalidité (pas d'oracle).
 */
export const referralSlugSchema = z
  .string()
  .trim()
  .min(1, "Lien invalide")
  .max(120, "Lien invalide");

/**
 * Jeton de parrainage partageable (PR-XXXXXXXX). Casse et espaces autour tolérés ;
 * l'alphabet exclut I/O/0/1 (miroir du CHECK SQL referral_sponsors).
 */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PR-[A-HJ-NP-Z2-9]{8}$/, "Code de parrainage invalide");

/** Identifiant du spin de PREUVE du filleul (a vraiment joué). */
const proofSpinIdSchema = z.string().uuid("Preuve de participation invalide");

/**
 * Email opt-in RGPD (parrain / filleul) : consentement EXPLICITE côté UI, jamais
 * pré-coché. '' → undefined (aucune PII). Miroir léger du CHECK SQL (présence
 * d'un @, 3..320). Copié de validations/calendar.ts.
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

/** Jeton de tour offert à consommer (48 hex, miroir du CHECK SQL). */
const grantTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{48}$/, "Jeton de tour offert invalide");

// ── Parcours public (clients du commerçant) ──

/** Devenir parrain sur une campagne : slug + email opt-in facultatif (RGPD). */
export const ensureReferralSponsorSchema = z.object({
  slug: referralSlugSchema,
  email: optInEmailSchema,
});

/**
 * Valider un parrainage (après le spin du filleul) : slug + jeton partageable +
 * preuve (spin réel) + email opt-in facultatif.
 */
export const validateReferralSchema = z.object({
  slug: referralSlugSchema,
  ref: referralCodeSchema,
  proofSpinId: proofSpinIdSchema,
  email: optInEmailSchema,
});

/** Consommer un tour offert : slug + jeton de spin (48 hex). */
export const consumeReferralSpinSchema = z.object({
  slug: referralSlugSchema,
  grantToken: grantTokenSchema,
});

/** Repli polling : l'état public du parrain par le slug de campagne. */
export const getReferralStateSchema = z.object({
  slug: referralSlugSchema,
});

// ── Dashboard commerçant — configuration du programme ──

/** Nature d'un versement configuré (miroir des CHECK SQL). */
export const referralRewardKindSchema = z.enum(["none", "spin", "lot"]);

/**
 * Config d'UN versement (sponsor / filleul / chest). Cohérence usage ↔ champs
 * (miroir des CHECK SQL referral_programs_*_lot_stock_check + de l'invariant
 * ADR-031) : un versement `lot` EXIGE un libellé non vide ET un stock FINI ;
 * `spin`/`none` laissent label/details/stock au repos (normalisés à vide/null
 * côté action). '' → null pour le stock. Modelé sur updateCalendarDaySchema.
 */
const referralRewardConfigSchema = z
  .object({
    kind: referralRewardKindSchema,
    label: z
      .string()
      .trim()
      .max(120, "Libellé trop long (120 caractères max)")
      .default(""),
    details: z
      .string()
      .trim()
      .max(2000, "Description trop longue (2000 caractères max)")
      .default(""),
    stock: z
      .union([
        z.literal("").transform(() => null),
        z.coerce
          .number()
          .int("Nombre entier requis")
          .min(0, "Stock négatif interdit")
          .max(1_000_000, "Stock trop grand"),
      ])
      .nullable()
      .default(null),
  })
  .superRefine((r, ctx) => {
    if (r.kind !== "lot") return;
    if (!r.label.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: "Indiquez le libellé du lot de ce versement",
      });
    }
    if (r.stock === null) {
      ctx.addIssue({
        code: "custom",
        path: ["stock"],
        message:
          "Indiquez le stock du lot : il borne le nombre de versements (0 = épuisé / en pause)",
      });
    }
  });

/**
 * Réglages du programme de parrainage d'une campagne (dashboard). Bornes miroir
 * des CHECK SQL : chest_threshold 2..50, sponsor_max_filleuls 1..1000,
 * window_days 1..365 ; chaque versement cohérent par kind (superRefine).
 */
export const saveReferralProgramSchema = z.object({
  campaignId: uuid,
  enabled: z.coerce.boolean().default(false),
  chestThreshold: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(2, "Seuil du coffre : 2 filleuls minimum")
    .max(50, "Seuil du coffre : 50 filleuls maximum"),
  sponsorMaxFilleuls: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(1, "Au moins 1 filleul compté par parrain")
    .max(1000, "1000 filleuls maximum par parrain"),
  windowDays: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(1, "Durée : au moins 1 jour")
    .max(365, "Durée : 365 jours maximum"),
  sponsor: referralRewardConfigSchema,
  filleul: referralRewardConfigSchema,
  chest: referralRewardConfigSchema,
});

// ── Caisse (remise en caisse) ──

/**
 * Code de retrait présenté en caisse (PARRAIN-XXXXXXXX). Casse et espaces autour
 * tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL). Miroir strict de
 * calendarRedeemCodeSchema / eventRedeemCodeSchema.
 */
export const referralRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PARRAIN-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
