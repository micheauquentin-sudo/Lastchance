import { cn } from "@/lib/utils";
import type { LoyaltyProgramStatus } from "@/types/database";

const config: Record<LoyaltyProgramStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-zinc-100 text-zinc-600" },
  active: { label: "Actif", className: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Archivé", className: "bg-amber-100 text-amber-700" },
};

export function LoyaltyStatusBadge({ status }: { status: LoyaltyProgramStatus }) {
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
