import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import { CampaignSettings } from "@/components/dashboard/campaign-settings";
import { CampaignWheels } from "@/components/dashboard/campaign-wheels";
import {
  PrizePerformance,
  type PrizePerformanceRow,
} from "@/components/dashboard/prize-performance";
import {
  CampaignClaimSettings,
  CampaignEngagementSettings,
} from "@/components/dashboard/campaign-play-settings";
import type { Campaign, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "Campagne" };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  // Campagne, roues (multi-roues, triées par position) et performance
  // par lot en parallèle. Si la campagne n'existe pas, on 404.
  const [{ data: campaign }, { data: wheels }, { data: perf }, { count: shareCount }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organization!.id)
        .maybeSingle(),
      supabase
        .from("wheels")
        .select("*")
        .eq("campaign_id", id)
        .eq("organization_id", organization!.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.rpc("campaign_prize_performance", { p_campaign_id: id }),
      supabase
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("source", "share"),
    ]);

  if (!campaign) notFound();

  const c = campaign as Campaign;
  const wheelList = (wheels ?? []) as Wheel[];
  const perfRows = (perf ?? []) as PrizePerformanceRow[];

  return (
    <div>
      <Link
        href="/dashboard/campaigns"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Campagnes
      </Link>

      <div className="flex items-center justify-between gap-4 mt-3 mb-8">
        <h1 className="text-2xl font-bold truncate">{c.name}</h1>
        <CampaignStatusBadge status={c.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6 items-start">
        {wheelList.length > 0 ? (
          <CampaignWheels campaignId={c.id} wheels={wheelList} />
        ) : (
          <Card>
            <h2 className="font-semibold mb-1">Roues du jeu</h2>
            <p className="text-sm text-red-600">Roue manquante</p>
          </Card>
        )}

        <Card>
          <h2 className="font-semibold mb-1">QR codes</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Le lien que scannent vos clients.
          </p>
          <Link
            href={`/dashboard/qr-codes?campaign=${c.id}`}
            className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Gérer les QR codes
          </Link>
          {(shareCount ?? 0) > 0 && (
            <p className="mt-4 text-sm text-zinc-500">
              🔗 <span className="font-semibold text-zinc-900">{shareCount}</span>{" "}
              partie{(shareCount ?? 0) > 1 ? "s" : ""} via un lien partagé.
            </p>
          )}
        </Card>
      </div>

      <div className="mb-6">
        <PrizePerformance rows={perfRows} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6 items-start">
        <CampaignEngagementSettings campaign={c} />
        <CampaignClaimSettings campaign={c} />
      </div>

      <CampaignSettings campaign={c} />
    </div>
  );
}
