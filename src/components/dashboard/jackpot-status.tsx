import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { JackpotCampaignStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<JackpotCampaignStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

export function JackpotStatusBadge({ status }: { status: JackpotCampaignStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}
