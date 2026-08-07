import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { EventGameStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<EventGameStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

/** Badge de statut d'un jeu du Mode événement (miroir JackpotStatusBadge). */
export function EventStatusBadge({ status }: { status: EventGameStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}
