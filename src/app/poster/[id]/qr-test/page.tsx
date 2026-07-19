import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QrTestSheet } from "@/components/dashboard/qr-test-sheet";
import { APP_URL } from "@/lib/env";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { QrStyle } from "@/types/database";

export const metadata: Metadata = { title: "Validation des styles QR" };

export default async function QrTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const { data: qr } = await supabase
    .from("qr_codes")
    .select("slug, label, style")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!qr) notFound();

  return (
    <QrTestSheet
      url={`${APP_URL}/play/${qr.slug}`}
      label={qr.label}
      currentStyle={(qr.style ?? {}) as QrStyle}
    />
  );
}
