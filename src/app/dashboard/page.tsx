import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function DashboardPage() {
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();
  const orgId = organization!.id;

  const [scansRes, spinsRes, winsRes, participationsRes, redeemedRes, prizesRes] =
    await Promise.all([
      supabase
        .from("qr_codes")
        .select("scan_count")
        .eq("organization_id", orgId),
      supabase
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_losing", false),
      supabase
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not("redeemed_at", "is", null),
      supabase
        .from("participations")
        .select("prize_id, prizes(label, color)")
        .eq("organization_id", orgId),
    ]);

  const scans = (scansRes.data ?? []).reduce(
    (a, r) => a + (r.scan_count ?? 0),
    0,
  );
  const spins = spinsRes.count ?? 0;
  const wins = winsRes.count ?? 0;
  const participations = participationsRes.count ?? 0;
  const redeemed = redeemedRes.count ?? 0;
  const pending = participations - redeemed;
  const winRate = spins > 0 ? Math.round((wins / spins) * 100) : null;

  // Répartition des gains enregistrés par lot
  const distribution = new Map<
    string,
    { label: string; color: string; count: number }
  >();
  for (const row of prizesRes.data ?? []) {
    const prize = row.prizes as unknown as {
      label: string;
      color: string;
    } | null;
    if (!prize || !row.prize_id) continue;
    const entry = distribution.get(row.prize_id) ?? {
      label: prize.label,
      color: prize.color,
      count: 0,
    };
    entry.count++;
    distribution.set(row.prize_id, entry);
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
        <h1
          className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
        >
          Vue d&apos;ensemble
        </h1>
        <p className="mt-1 text-zinc-500">{organization!.name}</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const content = (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={
                    s.accent
                      ? "flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white"
                      : "flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500"
                  }
                >
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </span>
                {s.href && (
                  <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" className={s.accent ? "text-white/80" : "text-zinc-300"}>
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className={`mt-3 text-xs ${s.accent ? "text-white/80" : "text-zinc-500"}`}>{s.label}</p>
              <p className={`mt-0.5 text-2xl font-bold ${s.accent ? "text-white" : "text-zinc-900"}`}>{s.value}</p>
              {s.hint && (
                <p className={`mt-1 text-xs font-medium ${s.accent ? "text-white/90" : "text-orange-600"}`}>{s.hint}</p>
              )}
            </>
          );
          const accentCls = s.accent
            ? "border-transparent bg-gradient-to-br from-orange-500 to-pink-500 shadow-[0_12px_30px_-10px_rgba(236,72,153,0.5)]"
            : "";
          return s.href ? (
            <Link key={s.label} href={s.href} className="group">
              <Card className={`h-full p-4 transition-all duration-200 group-hover:-translate-y-0.5 ${accentCls} ${s.accent ? "group-hover:shadow-[0_16px_36px_-10px_rgba(236,72,153,0.55)]" : "group-hover:border-orange-200 group-hover:shadow-[0_14px_34px_-14px_rgba(120,40,20,0.25)]"}`}>
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
          <h2 className="mb-4 font-semibold text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
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

      <Card className="flex flex-col items-start justify-between gap-4 overflow-hidden sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-pink-100 text-orange-500">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5a9 9 0 1 0 9 9M12 5v7l5-3" />
            </svg>
          </span>
          <div>
            <h2 className="font-semibold text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
              Démarrer
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Créez une campagne, configurez votre roue, puis imprimez le QR code.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/campaigns"
          className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/25 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-orange-500/30 active:translate-y-0"
        >
          Mes campagnes
          <svg aria-hidden width="15" height="15" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </Card>
    </div>
  );
}
