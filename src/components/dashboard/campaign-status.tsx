import {
  campaignDisplayStatus,
  type CampaignWindowState,
} from "@/lib/campaign-window";
import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/types/database";

const config: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-zinc-100 text-zinc-600" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  paused: { label: "En pause", className: "bg-amber-100 text-amber-700" },
  archived: { label: "Archivée", className: "bg-zinc-100 text-zinc-400" },
};

/**
 * États DÉRIVÉS d'une campagne `active` hors de sa fenêtre de jouabilité.
 * Table séparée : `config` reste la vérité des états stockés.
 */
const derivedConfig: Record<
  Exclude<ReturnType<typeof campaignDisplayStatus>, CampaignStatus>,
  { label: string; className: string }
> = {
  scheduled: { label: "Programmée", className: "bg-sky-100 text-sky-700" },
  ended: { label: "Terminée", className: "bg-zinc-200 text-zinc-700" },
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
  const display = campaignDisplayStatus(status, windowState);
  const { label, className } =
    display in config
      ? config[display as CampaignStatus]
      : derivedConfig[display as "scheduled" | "ended"];
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
