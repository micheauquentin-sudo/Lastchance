import { z } from "zod";
import {
  entierRequis,
  texteOptionnel,
} from "@/lib/validations/champ-formulaire";
import { codeTtlDaysSchema } from "@/lib/validations/reward-expiry";

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

/**
 * Seuil de niveau, EN POINTS depuis la bascule (20261114120000).
 *
 * ── POURQUOI LE PLAFOND EST MULTIPLIÉ, ET LUI SEUL ──
 *
 * Il valait 1000, en VISITES. La migration convertit les DEUX COLONNES DE
 * SEUIL ×100, en place : un commerçant dont le niveau or était à 11 visites
 * se retrouve à 1100 points — au-dessus de l ancien plafond. Son formulaire de
 * programme aurait été REFUSÉ EN BLOC, sur un champ qu il n avait pas touché,
 * et il n aurait plus rien pu enregistrer : ni le mode de validation, ni le
 * nom. Le plafond suit donc la même conversion.
 *
 * Le seuil des PALIERS, lui, ne bouge pas : la migration ajoute cost_points
 * sans toucher à visit_count, et l éditeur continue d écrire des visites
 * jusqu au lot qui le bascule. Convertir sa borne ici aurait refusé la saisie
 * que le formulaire produit encore.
 */
const tierThresholdSchema = z.coerce
  .number()
  .int("Nombre entier de points requis")
  .min(1, "Le seuil doit valoir au moins 1 point")
  .max(100_000, "Seuil trop élevé (100 000 points max)");

/**
 * Cooldown entre deux tampons d'un même passeport (secondes, 0 = désactivé).
 *
 * Même mode silencieux que le jackpot : 0 étant une valeur métier, `null` y
 * passait pour « anti-rejeu désactivé » — un code tournant observé une fois
 * aurait valu autant de tampons qu'on le rejouait.
 */
const minStampIntervalSchema = entierRequis({
  absent: "Indiquez l'intervalle minimal entre deux tampons (0 pour le désactiver).",
  nombre: "Intervalle invalide",
  entier: "Nombre entier de secondes requis",
  min: [0, "Valeur négative interdite"],
  max: [604_800, "Maximum 604800 secondes (7 j)"],
});

/**
 * Période de rotation du code tournant (secondes), 15..300 — miroir du CHECK
 * SQL durci (20260725150000) : le code reste acceptable ~3 périodes, une
 * période longue allongerait d'autant la fenêtre de devinette et de relais.
 */
const rotatingPeriodSchema = entierRequis({
  absent: "Indiquez la période de rotation du code au comptoir.",
  nombre: "Période invalide",
  entier: "Nombre entier de secondes requis",
  min: [15, "Rotation trop rapide (15 s minimum)"],
  max: [300, "Rotation trop lente (300 s maximum)"],
});

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
const rewardLabelSchema = texteOptionnel(
  z.string().trim().max(120, "Lot trop long (120 caractères max)"),
);

const rewardDetailsSchema = texteOptionnel(
  z.string().trim().max(2000, "Description trop longue (2000 caractères max)"),
);

/**
 * Stock du palier en unités entières. '' → null, ce que `refineMilestone`
 * refuse ensuite sur TOUT palier — `lot` comme `spin` (stock OBLIGATOIRE et
 * FINI, miroir de loyalty_milestones_reward_stock_check tel que réécrit par
 * 20260725200000). Le champ n'est plus « illimité par défaut ».
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
    // '' = aucun pot associé. Le contrôle d'organisation, de statut et de
    // mode reste côté action + contrainte SQL composite.
    jackpot_campaign_id: z
      .union([z.literal("").transform(() => null), z.string().uuid()])
      .nullable()
      .default(null),
    // Échéance du code FIDELITE- (null = sans limite). `.optional()` : le champ
    // n'est écrit que si le formulaire le porte — voir la garde `has` côté
    // action.
    code_ttl_days: codeTtlDaysSchema.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.gold_threshold <= d.silver_threshold) {
      ctx.addIssue({
        code: "custom",
        path: ["gold_threshold"],
        message: "Le seuil or doit être supérieur au seuil argent",
      });
    }
    if (d.jackpot_campaign_id && d.validation_mode !== "staff") {
      ctx.addIssue({
        code: "custom",
        path: ["validation_mode"],
        message: "Un jackpot associé exige la validation en caisse.",
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

/**
 * Marqueur du refus « des codes FIDELITE- attendent encore d'être retirés »,
 * version PROGRAMME ENTIER.
 *
 * La chaîne `loyalty_programs → loyalty_milestones → loyalty_rewards` est
 * intégralement en cascade (20260725120000:122-123 et :221-222) : supprimer le
 * programme emportait tous les codes `FIDELITE-` non retirés, sans le moindre
 * comptage.
 */
export const LOYALTY_PROGRAM_LOSS_HINT = "Cochez la case de confirmation";

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
 * Cohérence type ↔ champs (miroir du CHECK SQL) : lot ⇒ libellé et aucune
 * roue ; spin ⇒ roue cible et aucun libellé imposé. Le stock fini, lui, est
 * exigé sur les DEUX types.
 *
 * Le stock obligatoire est le second VERROU ÉCONOMIQUE du module (miroir de
 * loyalty_milestones_reward_stock_check, migration 20260725190000 puis
 * 20260725200000) : la perte maximale d'un programme vaut exactement le stock
 * choisi par le commerçant, quel que soit le nombre de passeports créés.
 * 0 est admis et signifie « épuisé / en pause » — la seule façon non
 * destructrice de suspendre un palier, la suppression cascaderait sur les
 * récompenses déjà émises.
 *
 * POURQUOI `spin` AUSSI (correctif 20260725200000). La version précédente
 * INTERDISAIT le stock sur un palier `spin`, au motif que le tour offert
 * consommerait le stock des lots de la roue. La prémisse était fausse : un lot
 * de roue est illimité par défaut (`stock is null`, cf. validations/prizes.ts)
 * et `consume_loyalty_spin_grant` sortait alors sans décrément. Un palier
 * `spin` était donc une fabrique de codes de gain SANS aucune borne — et, sur
 * une roue à stocks finis, un moyen de les vider au détriment des vrais
 * clients. Ici le stock compte les TOURS OFFERTS ÉMIS par le palier, pas les
 * lots de la roue.
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
  // VERROU ÉCONOMIQUE commun aux deux types : pas de palier sans plafond.
  if (d.reward_stock === null) {
    ctx.addIssue({
      code: "custom",
      path: ["reward_stock"],
      message:
        d.reward_type === "lot"
          ? "Indiquez le stock de ce lot : il borne la perte maximale du programme (0 = épuisé / en pause)"
          : "Indiquez le stock de ce palier : ce nombre plafonne les tours offerts émis par ce palier (0 = épuisé / en pause)",
    });
  }

  if (d.reward_type === "lot") {
    if (!d.reward_label.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_label"],
        message: "Renseignez le lot de ce palier",
      });
    }
    if (d.target_wheel_id) {
      ctx.addIssue({
        code: "custom",
        path: ["target_wheel_id"],
        message: "Un lot direct n'a pas de roue cible",
      });
    }
  } else if (!d.target_wheel_id) {
    ctx.addIssue({
      code: "custom",
      path: ["target_wheel_id"],
      message: "Choisissez la roue du tour offert",
    });
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

/**
 * Marqueur du refus « des codes FIDELITE- attendent encore d'être retirés »,
 * version UN SEUL PALIER.
 *
 * `loyalty_rewards.(milestone_id, organization_id)` cascade depuis
 * `loyalty_milestones` (20260725120000:221-222) : retirer un palier devenu
 * obsolète détruisait les codes déjà gagnés SUR CE PALIER. Le client arrivait
 * au comptoir avec son passeport et s'entendait répondre « code introuvable ».
 *
 * Le seul chiffre que l'écran affichait déjà (« N code(s) déjà émis ») est
 * accroché au champ STOCK et compte les codes ÉMIS, remis compris : il ne dit
 * rien de ce que la suppression coûte. Marqueur distinct de
 * `LOYALTY_PROGRAM_LOSS_HINT` — deux gestes, deux périmètres, deux cases.
 */
export const LOYALTY_MILESTONE_LOSS_HINT = "Cochez la case de confirmation";

// ── Parcours public (clients du commerçant) ──

/** Identifiant du programme porté par l'URL du passeport. */
export const loyaltyProgramIdSchema = z.string().uuid("Passeport introuvable");

/**
 * Invitation au passeport proposée APRÈS un jeu : l'organisation est la seule
 * entrée, et elle vient d'une prop CLIENT (le panneau post-jeu est monté par la
 * page du jeu). Un identifiant forgé est donc le cas normal à traiter, pas
 * l'exception : le message d'erreur ne sort jamais — l'action rend `null` — et
 * c'est voulu, un libellé distinct par motif serait déjà un oracle.
 */
export const invitationPasseportSchema = z.object({
  organizationId: z.string().uuid("Identifiant invalide"),
});

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

/**
 * Jeton du QR de commande — miroir EXACT du CHECK SQL
 * (`loyalty_order_codes.token`, 20260915120000:80), lui-même calqué sur
 * `hunt_steps.token`. Émis par `randomCode(16)` (32^16 ≈ 2^80 : non devinable),
 * les bornes 8..64 laissent la place à un futur format sans rouvrir le schéma.
 *
 * Le message est le refus GÉNÉRIQUE du module et pas « format invalide » : un
 * jeton malformé et un jeton inconnu doivent être indiscernables, sans quoi le
 * schéma devient l'oracle que la RPC refuse d'être.
 */
export const loyaltyOrderTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{8,64}$/, "Carte de commande invalide");

/**
 * Tampon par QR de commande (parcours public, livraison/e-commerce).
 *
 * LE PROGRAMME N'EST PAS UNE ENTRÉE, et c'est le point de sécurité du schéma :
 * il est DÉRIVÉ du jeton côté serveur (`loadOrderCodeActionContext`). Le client
 * ne fournit donc rien qu'il puisse forger pour viser un autre programme — il
 * n'y a tout simplement pas de champ à forger.
 *
 * `turnstileToken` n'est demandé que lorsque l'appel précédent a répondu
 * `challengeRequired` (identité inconnue). Borné à 2048, la limite que
 * `verifyTurnstile` applique de son côté.
 *
 * `null` et « absent » sont RAMENÉS AU MÊME `undefined` : c'est l'invariant A
 * de `champ-formulaire-coverage.test.ts` — un champ facultatif ne doit pas
 * rendre deux valeurs différentes selon qu'on l'omet ou qu'on l'envoie vide.
 * Sans ce ramenage, `verifyTurnstile` recevrait tantôt `null` tantôt
 * `undefined` pour le même « pas de challenge fourni ».
 */
export const stampLoyaltyOrderSchema = z.object({
  orderToken: loyaltyOrderTokenSchema,
  turnstileToken: z
    .string()
    .max(2048)
    .nullish()
    .transform((v) => v ?? undefined),
});

// ── Dashboard commerçant : émission des QR de commande ──

/**
 * Référence de commande du commerçant (« CMD-2026-0412 »). '' → null, miroir du
 * CHECK SQL `label is null or char_length(btrim(label)) between 1 and 120` :
 * une chaîne vide y lèverait une 23514, alors que « pas de référence » est un
 * cas normal.
 */
const orderCodeLabelSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .min(1, "Référence de commande vide")
      .max(120, "Référence trop longue (120 caractères max)"),
  ])
  .nullable()
  .default(null);

/**
 * Émission d'un lot de QR de commande.
 *
 * `count` plafonné à 100 par appel : un commerçant imprime une planche
 * d'étiquettes, pas un catalogue. La borne n'est pas cosmétique — chaque jeton
 * est une ligne insérée par une session marchande, et le seau `loyaltyOrderCodeIssue`
 * borne le nombre d'appels, pas leur taille.
 */
export const createLoyaltyOrderCodesSchema = z.object({
  programId: loyaltyProgramIdSchema,
  count: z.coerce
    .number()
    .int("Nombre entier de codes requis")
    .min(1, "Demandez au moins un code")
    .max(100, "100 codes maximum par lot"),
  label: orderCodeLabelSchema,
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
