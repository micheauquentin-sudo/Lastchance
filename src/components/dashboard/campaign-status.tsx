import {
  campaignDisplayStatus,
  type CampaignWindowState,
} from "@/lib/campaign-window";
import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { CampaignStatus } from "@/types/database";

/**
 * Traduction — et rien d'autre. Le mot affiché vit dans `StatusBadge`
 * (`components/ui/status-badge.tsx`) : ce fichier ne fait que dire quel état de
 * ce vocabulaire commun correspond au statut stocké, fenêtre comprise.
 */
const ETATS: Record<
  ReturnType<typeof campaignDisplayStatus>,
  EtatAnimation
> = {
  draft: "brouillon",
  active: "ouverte",
  paused: "pause",
  archived: "cloturee",
  scheduled: "programmee",
  ended: "cloturee",
};

/**
 * `windowState` est calculé CÔTÉ SERVEUR par les pages appelantes
 * (`campaignWindowState`, lib/campaign-window.ts) et passé en prop : la
 * pastille ne lit jamais l'horloge elle-même. Sans ce découpage, un futur
 * appelant client rendrait une valeur différente à l'hydratation.
 * Absent → « open », donc comportement historique inchangé.
 */
export function CampaignStatusBadge({
  status,
  windowState = "open",
}: {
  status: CampaignStatus;
  windowState?: CampaignWindowState;
}) {
  return <StatusBadge etat={ETATS[campaignDisplayStatus(status, windowState)]} />;
}
