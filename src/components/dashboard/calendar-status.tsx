import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { CalendarStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<CalendarStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

export function CalendarStatusBadge({ status }: { status: CalendarStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}
