import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { NewQrForm } from "@/components/dashboard/qr-forms";
import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import type { Campaign, QrCode } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";

export const metadata: Metadata = { title: "QR codes" };

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; page?: string }>;
}) {
  const { campaign: campaignFilter, page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 24;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const [{ data: campaigns }, qrQuery] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", organization!.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    (() => {
      let q = supabase
        .from("qr_codes")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize);
      if (campaignFilter) q = q.eq("campaign_id", campaignFilter);
      return q;
    })(),
  ]);

  const qrCodes = (qrQuery.data ?? []) as QrCode[];
  const hasNext = qrCodes.length > pageSize;
  if (hasNext) qrCodes.pop();
  const campaignList = (campaigns ?? []) as Pick<Campaign, "id" | "name">[];
  const campaignNames = new Map(campaignList.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">QR codes</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Personnalisez-les à vos couleurs, ajoutez votre logo, imprimez-les
            et placez-les en salle, en caisse, sur les tables…
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="font-semibold mb-4">Nouveau QR code</h2>
        {campaignList.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Créez d&apos;abord une campagne.
          </p>
        ) : (
          <NewQrForm
            campaigns={campaignList}
            defaultCampaignId={campaignFilter}
          />
        )}
      </Card>

      {qrCodes.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">Aucun QR code pour l&apos;instant.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {qrCodes.map((qr) => (
            <li key={qr.id}>
              <QrCodeCard
                id={qr.id}
                slug={qr.slug}
                label={qr.label}
                campaignName={
                  campaignNames.get(qr.campaign_id) ?? "Campagne supprimée"
                }
                url={`${APP_URL}/play/${qr.slug}`}
                scanCount={qr.scan_count}
                initialStyle={qr.style ?? {}}
                posterHref={`/poster/${qr.id}`}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} hasNext={hasNext} params={{ campaign: campaignFilter }} />
    </div>
  );
}
