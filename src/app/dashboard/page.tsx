import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function DashboardPage() {
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const [campaigns, participations, redeemed] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id),
    supabase
      .from("participations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id),
    supabase
      .from("participations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id)
      .not("redeemed_at", "is", null),
  ]);

  const stats = [
    { label: "Campagnes", value: campaigns.count ?? 0 },
    { label: "Participations", value: participations.count ?? 0 },
    { label: "Gains récupérés", value: redeemed.count ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vue d&apos;ensemble</h1>
      <p className="text-zinc-500 mb-8">{organization!.name}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-zinc-500">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

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
