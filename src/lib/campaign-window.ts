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

/**
 * ── LA REPRISE APRÈS PAUSE, DEUXIÈME ÉTAT DÉRIVÉ DE CE MODULE ──
 *
 * Ce fichier ne parlait que de dates, et ces deux prédicats n'en lisent
 * aucune : ils sont ici pour la raison qui a fait naître le module, pas pour sa
 * matière. Un état DÉRIVÉ de `campaigns` (statut + motif de pause + compteurs)
 * lu à la fois par un écran et par une action serveur avait déjà divergé une
 * fois — une campagne « Active » en vert que plus personne ne pouvait jouer.
 * `repriseBudgetRequise` est exactement de cette espèce : la carte Statut s'en
 * sert pour ne plus offrir un bouton voué à l'échec, `updateCampaign` pour
 * refuser le POST direct. Deux copies redivergeraient au premier seuil changé.
 */
export interface RepriseCampagne {
  /**
   * `string` et non `CampaignStatus` : le prédicat est appelé aussi bien sur un
   * `Campaign` typé côté écran que sur la ligne d'un `select(…)`, dont les
   * types générés rendent `status: string`. Élargir ici évite un cast à
   * l'appelant serveur — et le prédicat compare à des littéraux, il ne dérive
   * rien du type.
   */
  status: string;
  paused_reason: string | null;
  budget_cents: number | null;
  budget_spent_cents: number;
}

/**
 * La campagne est-elle en pause « budget atteint » AVEC un plafond toujours
 * dépassé ? Alors une reprise générique (`paused → active`) est un cul-de-sac :
 * le trigger la remettra en pause au prochain gain réclamé, et le geste correct
 * est « Reprendre la campagne » de la carte « Programmation et budget », qui
 * relève le plafond dans le même mouvement (`resumeCampaignAfterBudget`).
 *
 * ── LES DEUX CAS QUI RENDENT `false`, ET C'EST VOULU ──
 *
 * `budget_cents === null` : le plafond a été RETIRÉ. Plus rien ne peut se
 * dépasser, la reprise générique redevient le bon geste.
 * `budget_spent_cents < budget_cents` : le plafond a déjà été RELEVÉ (ou des
 * gains ont été annulés). La pause n'a plus de cause, rouvrir aboutira.
 *
 * Dans les deux cas le motif `budget_reached` est un RÉSIDU : il décrit
 * pourquoi la pause a eu lieu, pas si elle tient encore. Refuser dessus
 * enfermerait un commerçant qui vient précisément de faire ce qu'on lui
 * demandait.
 */
export function repriseBudgetRequise(campaign: RepriseCampagne): boolean {
  return (
    campaign.status === "paused" &&
    campaign.paused_reason === "budget_reached" &&
    campaign.budget_cents !== null &&
    campaign.budget_spent_cents >= campaign.budget_cents
  );
}

/**
 * Une reprise générique depuis la carte Statut peut-elle encore aboutir ?
 *
 * Deux causes, deux propriétaires. Le budget non résorbé est refusé par
 * `updateCampaign` (garde applicative, ci-dessus). `droit_expire` est refusé
 * par la base : `run_campaign_schedule` a mis la campagne en pause faute du
 * droit « wheel », et `assert_module_publish_allowed` opposera le même refus à
 * la RPC. Le bouton ne peut donc produire qu'un échec dans les deux cas — et la
 * bannière dit déjà, pour le second, qu'il n'y a rien à relancer à la main : le
 * planificateur réactive de lui-même dès que l'abonnement repart.
 *
 * PAS de garde applicative pour `droit_expire` : la base la porte déjà, et un
 * second oracle du droit en TypeScript est exactement ce que la garde de parité
 * `access_parity.test.sql` surveille sans pouvoir l'empêcher. Ce prédicat ne
 * sert donc qu'à MASQUER un bouton, jamais à refuser une écriture.
 */
export function repriseGeneriqueImpossible(campaign: RepriseCampagne): boolean {
  return (
    repriseBudgetRequise(campaign) ||
    (campaign.status === "paused" && campaign.paused_reason === "droit_expire")
  );
}
