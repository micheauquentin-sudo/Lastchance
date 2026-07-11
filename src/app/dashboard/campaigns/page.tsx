import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import { NewCampaignForm } from "@/components/dashboard/new-campaign-form";
import type { Campaign } from "@/types/database";

export const metadata: Metadata = { title: "Campagnes" };

export default async function CampaignsPage() {
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  const campaignList = (campaigns ?? []) as Campaign[];

  // Comptages par campagne (peu de campagnes par commerce → requêtes head-only parallèles)
  const statsByCampaign = new Map<
    string,
    { spins: number; wins: number; pending: number }
  >();
  await Promise.all(
    campaignList.map(async (c) => {
      const [spinsRes, winsRes, pendingRes] = await Promise.all([
        supabase
          .from("spins")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id),
        supabase
          .from("spins")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("is_losing", false),
        supabase
          .from("participations")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .is("redeemed_at", null),
      ]);
      statsByCampaign.set(c.id, {
        spins: spinsRes.count ?? 0,
        wins: winsRes.count ?? 0,
        pending: pendingRes.count ?? 0,
      });
    }),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Campagnes</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Une campagne = une roue + ses QR codes.
          </p>
        </div>
        <NewCampaignForm />
      </div>

      {!campaignList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucune campagne pour l&apos;instant. Créez la première !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {campaignList.map((c) => {
            const s = statsByCampaign.get(c.id);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/campaigns/${c.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.name}</p>
                      <p className="text-sm text-zinc-500 mt-0.5">
                        Créée le {formatDate(c.created_at)}
                      </p>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  {s && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-500">
                      <span>
                        <span className="font-semibold text-zinc-900">
                          {s.spins}
                        </span>{" "}
                        tour{s.spins > 1 ? "s" : ""} joué
                        {s.spins > 1 ? "s" : ""}
                      </span>
                      <span>
                        <span className="font-semibold text-zinc-900">
                          {s.wins}
                        </span>{" "}
                        gain{s.wins > 1 ? "s" : ""}
                      </span>
                      {s.pending > 0 && (
                        <span className="text-amber-600 font-medium">
                          {s.pending} à valider
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
