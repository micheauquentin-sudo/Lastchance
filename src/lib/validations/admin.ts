import { z } from "zod";
import { ADMIN_ROLES } from "@/types/admin";
import { isValidDateOnly } from "@/lib/date-time";
import { smsSenderIdSchema } from "@/lib/validations/sms";
import { WORKER_NAMES } from "@/lib/worker-health";

const uuid = z.string().uuid("Identifiant invalide.");

/**
 * Statuts d'abonnement pilotables manuellement depuis le back-office.
 * On exclut « trialing » : un essai se définit par sa date de fin
 * (trial_ends_at), qu'un simple changement de statut ne poserait pas —
 * l'org paraîtrait en essai tout en étant lue comme essai expiré.
 */
export const merchantStatusSchema = z.object({
  organizationId: uuid,
  status: z.enum(["active", "past_due", "canceled", "inactive"]),
});

export const merchantPlanSchema = z.object({
  organizationId: uuid,
  plan: z.string().trim().min(1).max(40),
});

export const merchantAddonSchema = z.object({
  organizationId: uuid,
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Accès offert (premium sans paiement). `until` vide = illimité ; sinon
 * une date (input `type=date`). `includePronostics` / `includeHunts`
 * activent aussi les addons correspondants.
 */
export const merchantCompAccessSchema = z.object({
  organizationId: uuid,
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  until: z
    .string()
    .default("")
    .refine(
      (value) => value === "" || isValidDateOnly(value),
      { message: "Date de fin invalide." },
    ),
  note: z.string().trim().max(200, "Motif trop long.").default(""),
  includePronostics: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  includeHunts: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  includeLoyalty: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  includeJackpot: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

/**
 * LE PLAFOND D'UN CRÉDIT SMS, en unités (1 unité = 1 SMS).
 *
 * ── POURQUOI IL Y A UN PLAFOND, ET PAS SEULEMENT UN AVERTISSEMENT ──
 *
 * Parce qu'un crédit accordé NE SE REPREND PAS. `sms_credit_entries` est
 * append-only (trigger `sms_credit_entries_append_only`), et
 * `credit_sms_balance` refuse tout montant nul ou négatif : il n'existe aucune
 * porte, même en `service_role`, pour annuler un crédit fautif. Le seul
 * mouvement négatif du grand livre est le débit d'un envoi réel. Autrement dit,
 * cette borne n'est pas une confirmation qu'on peut défaire après coup — c'est
 * le dernier point où l'erreur est encore réparable.
 *
 * ── POURQUOI 10 000 ──
 *
 * C'est le plus gros lot plausible pour UN commerçant : une boutique de 2 000
 * clients qui envoie cinq campagnes dans l'année. À 0,045 € l'unité (tarif par
 * défaut de `sms_credits.unit_cost_micros`), cela représente environ 450 € —
 * un geste commercial important mais concevable.
 *
 * Ce que la borne ferme réellement, c'est LE ZÉRO DE TROP : 1 000 saisi 10 000
 * passe (et reste rattrapable en n'en recréditant pas d'autres), 10 000 saisi
 * 100 000 est REFUSÉ. Un besoin supérieur reste possible — il exige alors
 * plusieurs opérations, donc plusieurs lignes d'audit, donc un acte délibéré
 * plutôt qu'une glissade de doigt.
 *
 * Valeur arbitrable : elle relève du produit, pas de la technique.
 */
export const SMS_CREDIT_MAX_UNITS = 10_000;

/**
 * Crédit SMS accordé par la plateforme. Tant qu'aucun achat Stripe n'existe,
 * c'est le SEUL producteur de crédit du système.
 *
 * `reference` est OBLIGATOIRE, contrairement au `note` de l'accès offert : la
 * ligne du grand livre est indélébile, et sans motif personne ne pourra dire
 * six mois plus tard pourquoi 5 000 SMS ont été accordés à ce commerçant.
 * C'est la seule explication que la facturation aura jamais.
 */
export const merchantSmsCreditSchema = z.object({
  organizationId: uuid,
  units: z.coerce
    .number()
    .int("Nombre de SMS invalide.")
    .min(1, "Créditez au moins 1 SMS.")
    .max(
      SMS_CREDIT_MAX_UNITS,
      `Au plus ${SMS_CREDIT_MAX_UNITS} SMS par opération — au-delà, procédez en plusieurs fois.`,
    ),
  // Les deux seuls motifs que `credit_sms_balance` accepte. `refund` y est
  // refusé (il n'existe que rattaché à un envoi), `send` et `expiry` sont des
  // débits : les proposer ici ferait lever la RPC après coup.
  reason: z.enum(["purchase", "adjustment"], {
    message: "Motif de crédit invalide.",
  }),
  reference: z
    .string()
    .trim()
    .min(1, "Indiquez un motif (facture, geste commercial…).")
    .max(200, "Motif trop long."),
});

/**
 * Déclaration d'un expéditeur SMS au registre AF2M, par la PLATEFORME.
 *
 * `smsSenderIdSchema` est réutilisé et non recopié : le nom déclaré doit être
 * exactement celui que le commerçant a demandé, et deux règles distinctes
 * finiraient par diverger — la plateforme déclarerait alors un nom que la base
 * du commerçant refuse.
 *
 * La référence de registre est OBLIGATOIRE, comme dans `declare_sms_sender` :
 * une déclaration sans référence est une affirmation sans preuve. Zod n'ajoute
 * ici que le message ; la RPC reste le rempart.
 */
export const merchantSmsSenderDeclareSchema = z.object({
  organizationId: uuid,
  senderId: smsSenderIdSchema,
  reference: z
    .string()
    .trim()
    .min(1, "Indiquez la référence de déclaration au registre AF2M.")
    .max(200, "Référence trop longue."),
});

/**
 * Refus, suspension, remise en attente ou retrait d'un expéditeur.
 *
 * `declared` est volontairement ABSENT — il n'existe que par
 * `declare_sms_sender`, qui exige la référence de registre. L'admettre ici
 * rouvrirait la porte que la migration 20260824120000 ferme.
 *
 * Le motif est exigé pour un refus ou une suspension : c'est le seul texte que
 * le commerçant lira sur son écran, et un refus sans motif le laisse redemander
 * le même nom.
 */
export const merchantSmsSenderStatusSchema = z
  .object({
    organizationId: uuid,
    senderId: smsSenderIdSchema,
    status: z.enum(["pending", "rejected", "suspended", "retired"], {
      message: "État d'expéditeur invalide.",
    }),
    reason: z.string().trim().max(200, "Motif trop long.").default(""),
  })
  .refine(
    (value) =>
      (value.status !== "rejected" && value.status !== "suspended") ||
      value.reason.length > 0,
    {
      path: ["reason"],
      message: "Indiquez le motif : le commerçant le lira tel quel.",
    },
  );

/**
 * Suppression définitive d'un commerçant. La confirmation exige de
 * ressaisir le slug exact de l'organisation (garde-fou anti-erreur).
 */
export const deleteMerchantSchema = z.object({
  organizationId: uuid,
  confirmSlug: z.string().trim().min(1, "Confirmation requise."),
});

export const addNoteSchema = z.object({
  organizationId: uuid,
  body: z.string().trim().min(1, "Note vide.").max(2000),
});

export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide."),
  name: z.string().trim().max(120).default(""),
  role: z.enum(ADMIN_ROLES),
});

export const updateAdminRoleSchema = z.object({
  adminId: uuid,
  role: z.enum(ADMIN_ROLES),
});

export const toggleAdminSchema = z.object({
  adminId: uuid,
  isActive: z.boolean(),
});

/**
 * Activation de la cadence rapide d'un worker.
 *
 * `WORKER_NAMES` est le miroir applicatif de `ops_worker_definitions`, dont
 * `ops_worker_runs.worker` est une clé étrangère : borner l'entrée à cette liste
 * évite qu'un POST fabriqué fasse écrire dans le Vault un secret nommé d'après
 * un worker qui n'existe pas. Le registre reste le rempart — la RPC relit la
 * ligne — ceci n'est que le message d'erreur lisible.
 */
export const workerCadenceSchema = z.object({
  worker: z.enum(WORKER_NAMES, { message: "Worker inconnu." }),
});
