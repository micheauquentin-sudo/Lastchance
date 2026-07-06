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

      {!campaigns?.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucune campagne pour l&apos;instant. Créez la première !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(campaigns as Campaign[]).map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/campaigns/${c.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-violet-300 transition-colors"
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
