import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { QuizStatus } from "@/lib/quiz";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<QuizStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  archived: "cloturee",
};

export function QuizStatusBadge({ status }: { status: QuizStatus }) {
  return <StatusBadge etat={ETATS[status] ?? "brouillon"} />;
}
