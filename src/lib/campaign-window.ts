import type { CampaignStatus } from "@/types/database";

/**
 * Fenêtre de jouabilité d'une campagne — SOURCE DE VÉRITÉ UNIQUE.
 *
 * `status` est un état STOCKÉ ; la jouabilité est un état DÉRIVÉ
 * (`status` + fenêtre `starts_at`/`ends_at`). Le parcours joueur calculait
 * le dérivé (`lib/play-context.ts`) pendant que le dashboard n'affichait que
 * le stocké : une campagne dont la date de fin était passée restait
 * « Active » en vert côté commerçant alors que plus aucun client ne pouvait
 * jouer. Le pont automatique (`run_campaign_schedule()`) ne bascule que les
 * campagnes `auto_schedule = true`, et les modèles de la galerie posent
 * `auto_schedule: false` en dur (`lib/campaign-templates.ts`) : la
 * divergence est structurelle, pas accidentelle.
 *
 * Les deux surfaces appellent donc la MÊME fonction. Ne pas recopier ce
 * prédicat ailleurs — elles redivergeraient au prochain changement.
 */
export type CampaignWindowState = "scheduled" | "open" | "ended";

export interface CampaignWindowInput {
  starts_at?: string | null;
  ends_at?: string | null;
}

/**
 * `scheduled` : la campagne n'a pas encore ouvert. `ended` : elle est
 * fermée. `open` : dans la fenêtre (ou aucune borne posée).
 *
 * L'ordre des tests reproduit celui de la cascade de refus de `/play` : sur
 * des dates incohérentes (`starts_at` futur ET `ends_at` passé), c'est
 * « pas encore commencé » qui l'emporte, comme côté joueur. Une date
 * illisible donne `NaN`, donc les deux comparaisons sont fausses et la
 * campagne reste `open` — même comportement qu'avant l'extraction.
 */
export function campaignWindowState(
  campaign: CampaignWindowInput,
  now: Date = new Date(),
): CampaignWindowState {
  if (campaign.starts_at && new Date(campaign.starts_at) > now) {
    return "scheduled";
  }
  if (campaign.ends_at && new Date(campaign.ends_at) < now) {
    return "ended";
  }
  return "open";
}

/**
 * Statut d'affichage = statut stocké, sauf pour une campagne `active` hors
 * de sa fenêtre. Les états `draft` / `paused` / `archived` restent inchangés :
 * ils décrivent une décision du commerçant, pas une horloge.
 */
export type CampaignDisplayStatus = CampaignStatus | "scheduled" | "ended";

export function campaignDisplayStatus(
  status: CampaignStatus,
  window: CampaignWindowState,
): CampaignDisplayStatus {
  if (status !== "active" || window === "open") return status;
  return window;
}
