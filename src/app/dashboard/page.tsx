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

  const stats = [
    { label: "Scans QR", value: scans },
    { label: "Tours joués", value: spins },
    { label: "Lots gagnés", value: wins },
    { label: "Participations", value: participations },
    { label: "Gains récupérés", value: redeemed },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vue d&apos;ensemble</h1>
      <p className="text-zinc-500 mb-8">{organization!.name}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {distributionList.length > 0 && (
        <Card className="mb-8">
          <h2 className="font-semibold mb-4">Répartition des gains</h2>
          <ul className="space-y-3">
            {distributionList.map((d) => (
              <li key={d.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-700">{d.label}</span>
                  <span className="text-zinc-500 font-mono">{d.count}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
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

      <Card className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Démarrer</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Créez une campagne, configurez votre roue, puis imprimez le QR
            code.
          </p>
        </div>
        <Link
          href="/dashboard/campaigns"
          className="shrink-0 bg-violet-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-violet-500 transition-colors"
        >
          Mes campagnes
        </Link>
      </Card>
    </div>
  );
}
