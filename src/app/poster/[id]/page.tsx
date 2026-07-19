import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { migrateLegacyPosterImages } from "@/lib/poster-storage";
import { PosterEditor } from "@/components/dashboard/poster-editor";
import type { QrCode } from "@/types/database";

export const metadata: Metadata = { title: "Éditeur d'affiche" };

/**
 * Éditeur d'affiche « libre » pour un QR code : éléments déplaçables
 * (textes, formes, images, QR), modèles, 28 polices — puis impression
 * A4 (seule l'affiche sort). Le QR affiché reprend la personnalisation
 * du Studio QR (qr_codes.style).
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
  const poster = await migrateLegacyPosterImages({
    qrId: qr.id,
    organizationId: organization.id,
    poster: qr.poster,
  });

  return (
    <PosterEditor
      qrId={qr.id}
      playUrl={`${APP_URL}/play/${qr.slug}`}
      qrStyle={qr.style ?? {}}
      initialConfig={poster as Record<string, unknown>}
    />
  );
}
