import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { LoyaltyProgramStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<LoyaltyProgramStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

export function LoyaltyStatusBadge({ status }: { status: LoyaltyProgramStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}
