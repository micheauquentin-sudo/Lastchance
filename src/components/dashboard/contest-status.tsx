import { cn } from "@/lib/utils";
import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import type { ContestStatus } from "@/types/database";

/** Traduction seule : le vocabulaire vit dans `components/ui/status-badge.tsx`. */
const ETATS: Record<ContestStatus, EtatAnimation> = {
  draft: "brouillon",
  active: "ouverte",
  finished: "cloturee",
};

export function ContestStatusBadge({ status }: { status: ContestStatus }) {
  return <StatusBadge etat={ETATS[status]} />;
}

/**
 * Vignette d'un participant : drapeau emoji (nations/joueurs) ou pastille
 * couleur + initiales (clubs). Résolue côté serveur à l'ajout du match.
 */
export function ParticipantBadge({
  badge,
  color,
  className,
}: {
  badge: string;
  color: string;
  className?: string;
}) {
  if (color) {
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white",
          className,
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {badge}
      </span>
    );
  }
  return (
    <span className={cn("text-xl leading-none", className)} aria-hidden>
      {badge || "🏳️"}
    </span>
  );
}
