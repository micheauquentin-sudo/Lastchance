import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { PosterEditor } from "@/components/dashboard/poster-editor";
import type { QrCode } from "@/types/database";

export const metadata: Metadata = { title: "Éditeur d'affiche" };

/**
 * Éditeur d'affiche pour un QR code : le commerçant personnalise
 * (modèles, couleurs, polices, textes, logo, taille du QR), enregistre,
 * puis imprime — seule l'affiche sort à l'impression (A4).
 */
export default async function PosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const { data } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!data) notFound();
  const qr = data as QrCode;

  const playUrl = `${APP_URL}/play/${qr.slug}`;
  const qrDataUrl = await QRCode.toDataURL(playUrl, {
    width: 1024,
    margin: 1,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  return (
    <PosterEditor
      qrId={qr.id}
      qrDataUrl={qrDataUrl}
      playUrl={playUrl}
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      initialConfig={qr.poster}
    />
  );
}
