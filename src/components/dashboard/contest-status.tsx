import { cn } from "@/lib/utils";
import type { ContestStatus } from "@/types/database";

const config: Record<ContestStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-zinc-100 text-zinc-600" },
  active: { label: "En cours", className: "bg-emerald-100 text-emerald-700" },
  finished: { label: "Terminé", className: "bg-amber-100 text-amber-700" },
};

export function ContestStatusBadge({ status }: { status: ContestStatus }) {
  const { label, className } = config[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
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
