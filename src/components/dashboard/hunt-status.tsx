import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { HuntStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<HuntStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

export function HuntStatusBadge({ status }: { status: HuntStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}
