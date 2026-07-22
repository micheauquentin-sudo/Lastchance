import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Passeport de fidélité — schémas d'entrée
//
// Bornes applicatives plus strictes ou égales aux CHECK SQL de la migration
// 20260725120000_loyalty_passport : l'UI reste lisible, la base garde sa marge.
// ────────────────────────────────────────────────────────────

/** Nom d'un programme — 1..80 (le CHECK SQL tolère jusqu'à 120). */
const programNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom du programme est requis")
  .max(80, "Nom trop long (80 caractères max)");

export const loyaltyValidationModeSchema = z.enum(["rotating_code", "staff"]);

/** Seuil de niveau (nombre de visites), 1..1000. */
const tierThresholdSchema = z.coerce
  .number()
  .int("Nombre entier de visites requis")
  .min(1, "Le seuil doit valoir au moins 1")
  .max(1000, "Seuil trop élevé (1000 max)");

/** Cooldown entre deux tampons d'un même passeport (secondes, 0 = désactivé). */
const minStampIntervalSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(0, "Valeur négative interdite")
  .max(604_800, "Maximum 604800 secondes (7 j)");

/**
 * Période de rotation du code tournant (secondes), 15..300 — miroir du CHECK
 * SQL durci (20260725150000) : le code reste acceptable ~3 périodes, une
 * période longue allongerait d'autant la fenêtre de devinette et de relais.
 */
const rotatingPeriodSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(15, "Rotation trop rapide (15 s minimum)")
  .max(300, "Rotation trop lente (300 s maximum)");

/**
 * Plancher ABSOLU de cooldown en mode code tournant (miroir du CHECK SQL). Le
 * plancher effectif vaut `max(2 × rotating_period_seconds, 300)` : un code est
 * accepté sur DEUX fenêtres de rotation (record_loyalty_stamp, migration
 * 20260725180000), le cooldown doit donc couvrir toute sa durée de validité —
 * sinon un code lu une seule fois au comptoir vaudrait deux tampons.
 */
const ROTATING_COOLDOWN_FLOOR_SECONDS = 300;

/**
 * Plancher de cooldown imposé en mode caisse (miroir du CHECK SQL, durci par
 * 20260725160000 puis 20260725170000) : 300 s, soit la TTL du jeton de
 * check-in (180 s) plus 2 min de marge. Sans ce plancher, un même QR —
 * rejouable dans sa fenêtre — vaudrait plusieurs tampons. Base, Zod et UI
 * partagent désormais la même valeur.
 */
const STAFF_COOLDOWN_FLOOR_SECONDS = 300;

/**
 * Nombre de visites déclenchant un palier, 2..1000.
 *
 * Le plancher de 2 est un VERROU ÉCONOMIQUE, pas une préférence d'ergonomie
 * (miroir de loyalty_milestones_visit_count_check, migration 20260725190000) :
 * un passeport fraîchement créé ne vaut RIEN. Encaisser une récompense exige
 * une SECONDE visite, séparée de la première par le cooldown du programme
 * (plancher 300 s dans les deux modes) — ce qui retire son objet à la frappe
 * de masse de passeports, et donc leur raison d'être aux seaux de création.
 */
const visitCountSchema = z.coerce
  .number()
  .int("Nombre entier de visites requis")
  .min(
    2,
    "Un palier ne peut pas se déclencher dès la première visite : 2 visites minimum",
  )
  .max(1000, "Palier trop élevé (1000 visites max)");

export const loyaltyRewardTypeSchema = z.enum(["spin", "lot"]);

/** Libellé d'un lot — requis pour un palier 'lot' (voir superRefine). */
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
 * Stock du lot en unités entières. '' → null, ce que `refineMilestone` refuse
 * ensuite sur un palier `lot` (stock OBLIGATOIRE et FINI) et exige sur un
 * palier `spin` (aucun stock). Le champ n'est plus « illimité par défaut ».
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

/** Roue cible d'un tour offert (UUID) — requise pour un palier 'spin'. */
const targetWheelSchema = z
  .union([z.literal("").transform(() => null), z.string().uuid()])
  .nullable()
  .default(null);

// ── Dashboard commerçant : programmes ──

export const createLoyaltyProgramSchema = z.object({
  name: programNameSchema,
});

/** Réglages d'un programme (hors statut : voir setLoyaltyProgramStatusSchema). */
export const updateLoyaltyProgramSchema = z
  .object({
    id: z.string().uuid(),
    name: programNameSchema,
    validation_mode: loyaltyValidationModeSchema,
    rotating_period_seconds: rotatingPeriodSchema,
    min_stamp_interval_seconds: minStampIntervalSchema,
    silver_threshold: tierThresholdSchema,
    gold_threshold: tierThresholdSchema,
  })
  .superRefine((d, ctx) => {
    if (d.gold_threshold <= d.silver_threshold) {
      ctx.addIssue({
        code: "custom",
        path: ["gold_threshold"],
        message: "Le seuil or doit être supérieur au seuil argent",
      });
    }
    // Miroir de loyalty_programs_cooldown_floor_check : les DEUX modes portent
    // un plancher (un code tournant observé une fois ne doit pas être rejouable
    // en boucle ; un jeton de check-in reste rejouable dans sa fenêtre de 3 min).
    // Sans ce refine le commerçant récolterait une erreur SQL brute 23514.
    const floor =
      d.validation_mode === "rotating_code"
        ? Math.max(2 * d.rotating_period_seconds, ROTATING_COOLDOWN_FLOOR_SECONDS)
        : STAFF_COOLDOWN_FLOOR_SECONDS;
    if (d.min_stamp_interval_seconds < floor) {
      const mode =
        d.validation_mode === "rotating_code" ? "code tournant" : "caisse";
      ctx.addIssue({
        code: "custom",
        path: ["min_stamp_interval_seconds"],
        message: `En mode ${mode}, l'intervalle entre deux tampons doit valoir au moins ${floor} secondes (${Math.round(floor / 60)} min).`,
      });
    }
  });

export const setLoyaltyProgramStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteLoyaltyProgramSchema = z.object({
  id: z.string().uuid(),
});

// ── Dashboard commerçant : paliers ──

const milestoneFields = {
  visit_count: visitCountSchema,
  reward_type: loyaltyRewardTypeSchema,
  reward_label: rewardLabelSchema,
  reward_details: rewardDetailsSchema,
  reward_stock: rewardStockSchema,
  target_wheel_id: targetWheelSchema,
};

/**
 * Cohérence type ↔ champs (miroir du CHECK SQL) : lot ⇒ libellé + stock fini
 * et aucune roue ; spin ⇒ roue cible et aucun stock.
 *
 * Le stock obligatoire est le second VERROU ÉCONOMIQUE du module (miroir de
 * loyalty_milestones_reward_stock_check, migration 20260725190000) : la perte
 * maximale d'un programme vaut exactement le stock choisi par le commerçant,
 * quel que soit le nombre de passeports créés. 0 est admis et signifie
 * « épuisé / en pause » — la seule façon non destructrice de suspendre un
 * palier, la suppression cascaderait sur les codes déjà émis.
 */
function refineMilestone(
  d: {
    reward_type: "spin" | "lot";
    reward_label: string;
    reward_stock: number | null;
    target_wheel_id: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (d.reward_type === "lot") {
    if (!d.reward_label.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_label"],
        message: "Renseignez le lot de ce palier",
      });
    }
    if (d.reward_stock === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_stock"],
        message:
          "Indiquez le stock de ce lot : il borne la perte maximale du programme (0 = épuisé / en pause)",
      });
    }
    if (d.target_wheel_id) {
      ctx.addIssue({
        code: "custom",
        path: ["target_wheel_id"],
        message: "Un lot direct n'a pas de roue cible",
      });
    }
  } else {
    if (!d.target_wheel_id) {
      ctx.addIssue({
        code: "custom",
        path: ["target_wheel_id"],
        message: "Choisissez la roue du tour offert",
      });
    }
    if (d.reward_stock !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_stock"],
        message: "Un tour de roue offert n'a pas de stock",
      });
    }
  }
}

export const createLoyaltyMilestoneSchema = z
  .object({ program_id: z.string().uuid(), ...milestoneFields })
  .superRefine(refineMilestone);

export const updateLoyaltyMilestoneSchema = z
  .object({ id: z.string().uuid(), ...milestoneFields })
  .superRefine(refineMilestone);

export const deleteLoyaltyMilestoneSchema = z.object({
  id: z.string().uuid(),
});

// ── Parcours public (clients du commerçant) ──

/** Identifiant du programme porté par l'URL du passeport. */
export const loyaltyProgramIdSchema = z.string().uuid("Passeport introuvable");

/** Code tournant saisi/scanné par le client (6 chiffres). */
export const loyaltyRotatingCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Code à 6 chiffres attendu");

/**
 * Jeton de check-in présenté au comptoir (corps base64url + signature HMAC,
 * voir lib/loyalty-checkin.ts). Le jeton d'identité du passeport (cookie
 * httpOnly) n'est JAMAIS transmis par le client : il ne quitte pas le serveur.
 */
export const loyaltyCheckinTokenSchema = z
  .string()
  .trim()
  .min(24, "Passeport illisible")
  .max(512, "Passeport illisible")
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "Passeport illisible");

/** Jeton de spin offert à usage unique (48 hex, miroir du CHECK SQL). */
export const loyaltyGrantTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{48}$/, "Tour offert invalide");

/** Tampon public (mode rotating_code) : le client fournit le code à 6 chiffres. */
export const stampLoyaltyVisitSchema = z.object({
  programId: loyaltyProgramIdSchema,
  code: loyaltyRotatingCodeSchema,
});

/** Demande d'un jeton de check-in court (mode staff : QR à faire scanner). */
export const loyaltyCheckinRequestSchema = z.object({
  programId: loyaltyProgramIdSchema,
});

/** Consommation d'un tour de roue offert. */
export const consumeLoyaltySpinSchema = z.object({
  programId: loyaltyProgramIdSchema,
  grantToken: loyaltyGrantTokenSchema,
});

// ── Caisse (staff / remise en caisse) ──

/** Tampon staff : jeton de check-in court scanné sur l'écran du client. */
export const stampLoyaltyVisitStaffSchema = z.object({
  programId: loyaltyProgramIdSchema,
  checkinToken: loyaltyCheckinTokenSchema,
});

/** Code tournant à afficher au comptoir (écran authentifié). */
export const loyaltyCounterCodeSchema = z.object({
  programId: loyaltyProgramIdSchema,
});

/**
 * Code de retrait présenté en caisse (FIDELITE-XXXXXXXX). Casse et espaces
 * autour tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL).
 */
export const loyaltyRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^FIDELITE-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
