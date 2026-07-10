import type { Metadata } from "next";
import QRCode from "qrcode";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { NewQrForm, DeleteQrButton } from "@/components/dashboard/qr-forms";
import type { Campaign, QrCode } from "@/types/database";

export const metadata: Metadata = { title: "QR codes" };

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignFilter } = await searchParams;
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
        .order("created_at", { ascending: false });
      if (campaignFilter) q = q.eq("campaign_id", campaignFilter);
      return q;
    })(),
  ]);

  const qrCodes = (qrQuery.data ?? []) as QrCode[];
  const campaignList = (campaigns ?? []) as Pick<Campaign, "id" | "name">[];
  const campaignNames = new Map(campaignList.map((c) => [c.id, c.name]));

  // Génération des images côté serveur (data URLs)
  const withImages = await Promise.all(
    qrCodes.map(async (qr) => {
      const url = `${APP_URL}/play/${qr.slug}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: { dark: "#18181b", light: "#ffffff" },
      });
      return { qr, url, dataUrl };
    }),
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">QR codes</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Imprimez-les et placez-les en salle, en caisse, sur les tables…
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

      {withImages.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">Aucun QR code pour l&apos;instant.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {withImages.map(({ qr, url, dataUrl }) => (
            <li key={qr.id}>
              <Card className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dataUrl}
                  alt={`QR code ${qr.label || qr.slug}`}
                  className="h-28 w-28 shrink-0 rounded-lg border border-zinc-200"
                />
                <div className="min-w-0 flex flex-col">
                  <p className="font-semibold truncate">
                    {qr.label || "Sans libellé"}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {campaignNames.get(qr.campaign_id) ?? "Campagne supprimée"}
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:underline truncate mt-1"
                  >
                    {url}
                  </a>
                  <p className="text-xs text-zinc-400 mt-1">
                    {qr.scan_count} scan{qr.scan_count > 1 ? "s" : ""}
                  </p>
                  <div className="mt-auto pt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={`/poster/${qr.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-violet-600 hover:underline"
                    >
                      Imprimer l&apos;affiche
                    </a>
                    <a
                      href={dataUrl}
                      download={`qr-${qr.slug}.png`}
                      className="text-sm font-semibold text-violet-600 hover:underline"
                    >
                      Télécharger PNG
                    </a>
                    <DeleteQrButton id={qr.id} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
