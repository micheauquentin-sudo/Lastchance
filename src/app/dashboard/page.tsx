import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Vue d'ensemble" };

interface DashboardSummary {
  scans: number;
  spins: number;
  wins: number;
  participations: number;
  redeemed: number;
  blocked: number;
  campaigns: number;
  first_campaign_id: string | null;
  active_campaigns: number;
  active_prizes: number;
  qr_codes: number;
  first_qr_id: string | null;
  poster_customized: boolean;
  distribution: { id: string; label: string; color: string; count: number }[];
}

export default async function DashboardPage() {
  const { organization, role } = await getUserAndOrg();
  if (role === "cashier") redirect("/dashboard/redeem");
  const supabase = await createClient();
  const orgId = organization!.id;
  const { data, error } = await supabase.rpc("org_dashboard_summary", {
    p_organization_id: orgId,
  });
  if (error) console.error("[dashboard] summary:", error.message);
  const summary = (data ?? {
    scans: 0, spins: 0, wins: 0, participations: 0, redeemed: 0,
    blocked: 0, campaigns: 0, first_campaign_id: null, active_campaigns: 0,
    active_prizes: 0, qr_codes: 0, first_qr_id: null,
    poster_customized: false, distribution: [],
  }) as DashboardSummary;
  const blockedCount = summary.blocked;
  const firstCampaignId = summary.first_campaign_id;

  const onboardingSteps = [
    {
      key: "campaign",
      label: "Créer votre première campagne",
      href: "/dashboard/campaigns",
      done: summary.campaigns > 0,
    },
    {
      key: "prize",
      label: "Configurer au moins un lot",
      href: firstCampaignId
        ? `/dashboard/campaigns/${firstCampaignId}/wheel`
        : "/dashboard/campaigns",
      done: summary.active_prizes > 0,
    },
    {
      key: "qr",
      label: "Générer un QR code",
      href: "/dashboard/qr-codes",
      done: summary.qr_codes > 0,
    },
    {
      key: "poster",
      label: "Personnaliser votre affiche",
      href: summary.first_qr_id ? `/poster/${summary.first_qr_id}` : "/dashboard/qr-codes",
      done: summary.poster_customized,
    },
    {
      key: "logo",
      label: "Ajouter votre logo",
      href: "/dashboard/settings",
      done: !!organization!.logo_url,
    },
    {
      key: "activate",
      label: "Activer votre campagne",
      href: firstCampaignId
        ? `/dashboard/campaigns/${firstCampaignId}`
        : "/dashboard/campaigns",
      done: summary.active_campaigns > 0,
    },
  ];

  const scans = summary.scans;
  const spins = summary.spins;
  const wins = summary.wins;
  const participations = summary.participations;
  const redeemed = summary.redeemed;
  const pending = participations - redeemed;
  const winRate = spins > 0 ? Math.round((wins / spins) * 100) : null;

  // Répartition des gains enregistrés par lot
  const distribution = new Map<
    string,
    { label: string; color: string; count: number }
  >();
  for (const row of summary.distribution) {
    distribution.set(row.id, { label: row.label, color: row.color, count: row.count });
  }
  const distributionList = [...distribution.values()].sort(
    (a, b) => b.count - a.count,
  );
  const maxCount = Math.max(1, ...distributionList.map((d) => d.count));

  const stats: Array<{
    label: string;
    value: number;
    hint?: string;
    href?: string;
    icon: React.ReactNode;
    accent?: boolean;
  }> = [
    {
      label: "Scans QR",
      value: scans,
      icon: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h3v3h-3v-3Zm3 3h3v3h-3v-3Z" />,
    },
    {
      label: "Tours joués",
      value: spins,
      hint: winRate !== null ? `${winRate}% de gagnants` : undefined,
      icon: <path d="M4 5a9 9 0 1 0 9 9M12 5v7l5-3" />,
    },
    {
      label: "Lots gagnés",
      value: wins,
      icon: <path d="M8 3h8v3a4 4 0 0 1-8 0V3ZM6 5H4v1a3 3 0 0 0 3 3M18 5h2v1a3 3 0 0 1-3 3M9 14h6l-1 4H10l-1-4ZM8 21h8" />,
    },
    {
      label: "Participations",
      value: participations,
      icon: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
    },
    {
      label: "Gains à valider",
      value: pending,
      hint: pending > 0 ? "Voir la liste →" : undefined,
      href: "/dashboard/participations?statut=a-valider",
      icon: <path d="M5 13l4 4L19 7" />,
      accent: pending > 0,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-k-ink sm:text-3xl">
          Vue d&apos;ensemble
        </h1>
        <p className="mt-1 font-bold text-k-body">{organization!.name}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const content = (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={
                    s.accent
                      ? "flex h-9 w-9 items-center justify-center rounded-xl border-2 border-k-ink bg-white text-k-ink"
                      : "flex h-9 w-9 items-center justify-center rounded-xl bg-k-yellow/50 text-k-ink"
                  }
                >
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </span>
                {s.href && (
                  <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" className={s.accent ? "text-k-ink/70" : "text-zinc-300"}>
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className={`mt-3 text-xs font-bold ${s.accent ? "text-k-ink/70" : "text-k-body"}`}>{s.label}</p>
              <p className="mt-0.5 text-2xl font-black text-k-ink">{s.value}</p>
              {s.hint && (
                <p className={`mt-1 text-xs font-black ${s.accent ? "text-k-ink" : "text-k-orange"}`}>{s.hint}</p>
              )}
            </>
          );
          const accentCls = s.accent ? "bg-k-yellow" : "";
          return s.href ? (
            <Link key={s.label} href={s.href} className="group">
              <Card className={`h-full p-4 transition-transform duration-200 group-hover:-translate-y-1 ${accentCls}`}>
                {content}
              </Card>
            </Link>
          ) : (
            <Card key={s.label} className="h-full p-4">
              {content}
            </Card>
          );
        })}
      </div>

      {distributionList.length > 0 && (
        <Card className="mb-8">
          <h2 className="mb-4 font-black text-k-ink">
            Répartition des gains
          </h2>
          <ul className="space-y-4">
            {distributionList.map((d) => (
              <li key={d.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-700">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    {d.label}
                  </span>
                  <span className="font-mono text-zinc-500">{d.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.round((d.count / maxCount) * 100)}%`,
                      background: d.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <OnboardingChecklist steps={onboardingSteps} />

      <Card className="mb-8 flex items-center gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            blockedCount > 0
              ? "bg-amber-50 text-amber-600"
              : "bg-emerald-50 text-emerald-600"
          }`}
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
            {blockedCount > 0 ? (
              <path d="M12 8v5M12 16h.01" />
            ) : (
              <path d="M9 12l2 2 4-4" />
            )}
          </svg>
        </span>
        <div>
          <h2 className="font-black text-k-ink">
            Protection anti-abus
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {blockedCount > 0 ? (
              <>
                <span className="font-semibold text-zinc-900">{blockedCount}</span>{" "}
                tentative{blockedCount > 1 ? "s" : ""} suspecte{blockedCount > 1 ? "s" : ""}{" "}
                bloquée{blockedCount > 1 ? "s" : ""} cette semaine (vérification anti-robot
                ou débit anormal) — votre roue reste protégée automatiquement.
              </>
            ) : (
              "Aucune activité suspecte détectée cette semaine sur votre jeu."
            )}
          </p>
        </div>
      </Card>
    </div>
  );
}
