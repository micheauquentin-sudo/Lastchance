import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import {
  CampaignAutomationSettings,
  CampaignStateBanner,
} from "@/components/dashboard/campaign-automation";
import { CampaignSettings } from "@/components/dashboard/campaign-settings";
import { CampaignWheels } from "@/components/dashboard/campaign-wheels";
import {
  PrizePerformance,
  type PrizePerformanceRow,
} from "@/components/dashboard/prize-performance";
import {
  CampaignClaimSettings,
} from "@/components/dashboard/campaign-play-settings";
import {
  ReferralProgramSettings,
  type ReferralProgramRow,
} from "@/components/dashboard/referral-program-settings";
import { hasReferralAccess } from "@/lib/referral-context";
import { selectActiveWheel } from "@/lib/wheel-schedule";
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
  const [
    { data: campaign },
    { data: wheels },
    { data: perf },
    { count: shareCount },
    { data: referralProgram },
  ] = await Promise.all([
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
    // Parrainage : programme opt-in de la campagne (RLS membre ; null = pas
    // encore configuré → défauts côté éditeur).
    supabase
      .from("referral_programs")
      .select(
        "enabled, chest_threshold, sponsor_max_filleuls, window_days, sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock, filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock, chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock",
      )
      .eq("campaign_id", id)
      .eq("organization_id", organization!.id)
      .maybeSingle(),
  ]);

  if (!campaign) notFound();

  const c = campaign as Campaign;
  const wheelList = (wheels ?? []) as Wheel[];
  const perfRows = (perf ?? []) as PrizePerformanceRow[];
  // Aperçu live : quelle roue /play servirait à l'instant présent
  // (même logique que le parcours public, voir lib/wheel-schedule.ts).
  const activeWheelId = selectActiveWheel(wheelList)?.id ?? null;

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

      {c.status === "paused" && c.paused_reason && (
        <div className="mb-6">
          <CampaignStateBanner campaign={c} interactive />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 mb-6 items-start">
        {wheelList.length > 0 ? (
          <CampaignWheels
            campaignId={c.id}
            wheels={wheelList}
            activeWheelId={activeWheelId}
          />
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

      <div className="mb-6">
        <CampaignClaimSettings campaign={c} />
      </div>

      <div className="mb-6">
        <CampaignAutomationSettings campaign={c} />
      </div>

      <div className="mb-6">
        <ReferralProgramSettings
          campaignId={c.id}
          program={(referralProgram as ReferralProgramRow | null) ?? null}
          hasAccess={hasReferralAccess(organization!)}
        />
      </div>

      <CampaignSettings campaign={c} />
    </div>
  );
}
