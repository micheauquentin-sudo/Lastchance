import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import { CampaignSettings } from "@/components/dashboard/campaign-settings";
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

  // Campagne et roue en parallèle : la roue est requêtée par campaign_id
  // (l'id de l'URL) — si la campagne n'existe pas, on 404 de toute façon.
  const [{ data: campaign }, { data: wheel }] = await Promise.all([
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
      .maybeSingle(),
  ]);

  if (!campaign) notFound();

  const c = campaign as Campaign;
  const w = wheel as Wheel | null;

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

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <Card>
          <h2 className="font-semibold mb-1">Roue</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Lots, probabilités et couleurs.
          </p>
          {w ? (
            <Link
              href={`/dashboard/campaigns/${c.id}/wheel`}
              className="inline-block bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Configurer la roue
            </Link>
          ) : (
            <p className="text-sm text-red-600">Roue manquante</p>
          )}
        </Card>

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
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6 items-start">
        <CampaignEngagementSettings campaign={c} />
        <CampaignClaimSettings campaign={c} />
      </div>

      <CampaignSettings campaign={c} />
    </div>
  );
}
