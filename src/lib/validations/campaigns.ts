import { z } from "zod";
import { isValidLocalDateTime } from "@/lib/date-time";
import { absentSiNonRendu } from "@/lib/validations/champ-formulaire";

export const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la campagne est requis")
  .max(120, "Nom trop long");

export const createCampaignSchema = z.object({
  name: campaignNameSchema,
});

/**
 * Mise à jour PARTIELLE : chaque champ absent laisse sa colonne tranquille.
 *
 * `absentSiNonRendu` et non `.optional()` seul : les deux formulaires qui
 * appellent cette action ne rendent chacun qu'un des deux champs, donc l'autre
 * arrive en `null`. `.optional()` le refusait, et l'action compensait par un
 * `?? undefined` — un filet qu'il fallait penser à reposer sur chaque nouvel
 * écran.
 */
export const updateCampaignSchema = z.object({
  id: z.string().uuid(),
  name: absentSiNonRendu(campaignNameSchema),
  status: absentSiNonRendu(
    z.enum(["draft", "active", "paused", "archived"]),
  ),
});

export const deleteCampaignSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Marqueur du refus « des lots gagnés attendent encore d'être retirés ».
 *
 * `deleteCampaign` le place dans son message et l'écran s'en sert pour ne
 * montrer la case de confirmation qu'APRÈS ce refus précis — et non sur
 * n'importe quel échec de la suppression, où cocher « je comprends que les
 * codes deviendront introuvables » n'aurait aucun sens et n'apprendrait au
 * commerçant qu'à cocher par réflexe. Quatrième et dernier des marqueurs du
 * lot, même forme que `HUNT_STEP_LOSS_HINT`, `CALENDAR_DAY_LOSS_HINT` et
 * `EVENT_SESSION_LOSS_HINT`.
 */
export const CAMPAIGN_OUTSTANDING_LOSS_HINT = "Cochez la case de confirmation";

export const duplicateCampaignSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Invitation avant-jeu, par campagne : proposer au joueur, AVANT le jeu, les
 * comptes de la maison (`Organization.google_review_url` / `instagram_url` /
 * `tiktok_url`, réglés une fois pour toutes dans les réglages).
 *
 * IL Y AVAIT ICI un `updateCampaignEngagementSchema`, retiré : il décrivait une
 * PORTE par campagne (« suis-nous pour jouer ») portant ses propres URL, sans
 * aucune liste blanche d'hôtes. Il n'avait plus ni action ni écran depuis que
 * l'invitation a remplacé la porte — un schéma mort qui restait un modèle à
 * recopier. L'invitation, elle, ne bloque rien, ne porte aucune URL et se
 * réduit donc à un booléen ; sans lien renseigné côté organisation, l'activer
 * n'affiche rien — c'est `lib/play-context.ts` qui tranche.
 */
export const updateCampaignPrejeuInvitationSchema = z.object({
  id: z.string().uuid(),
  prejeu_invitation: z.boolean(),
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

/** Heure civile du commerce (`datetime-local`), convertie par l'action. */
const campaignDateTime = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .refine(isValidLocalDateTime, "Date invalide"),
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
