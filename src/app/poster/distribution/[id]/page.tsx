import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { urlActiviteReserver } from "@/lib/reserver";
import { createClient } from "@/lib/supabase/server";
import { PosterEditor } from "@/components/dashboard/poster-editor";
import type { QrStyle } from "@/types/database";

export const metadata: Metadata = { title: "Éditeur d'affiche" };

async function publicUrl(
  kind: string,
  id: string,
  organizationId: string,
): Promise<string | null> {
  const supabase = await createClient();
  if (kind === "quiz") {
    const { data } = await supabase.from("quizzes").select("public_slug, status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active" && data.public_slug ? `${APP_URL}/quiz/${data.public_slug}` : null;
  }
  if (kind === "calendar") {
    const { data } = await supabase.from("calendars").select("public_slug, status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active" && data.public_slug ? `${APP_URL}/calendar/${data.public_slug}` : null;
  }
  if (kind === "pronostics") {
    const { data } = await supabase.from("contests").select("slug, status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data && data.status !== "draft" ? `${APP_URL}/pronos/${data.slug}` : null;
  }
  if (kind === "jackpot") {
    const { data } = await supabase.from("jackpot_campaigns").select("public_slug, status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active" ? `${APP_URL}/jackpot/${data.public_slug ?? id}` : null;
  }
  if (kind === "loyalty") {
    const { data } = await supabase.from("loyalty_programs").select("status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active" ? `${APP_URL}/passeport/${id}` : null;
  }
  if (kind === "event") {
    const { data } = await supabase.from("event_sessions").select("join_code, status").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data && data.status !== "archived" ? `${APP_URL}/event/${data.join_code}` : null;
  }
  if (kind === "reservation") return urlActiviteReserver(id, APP_URL);
  if (kind === "hunt_step") {
    const { data } = await supabase.from("hunt_steps").select("token").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.token ? `${APP_URL}/hunt/${data.token}` : null;
  }
  if (kind === "vitrine") {
    const { data } = await supabase.from("vitrine_settings").select("slug").eq("id", id).eq("organization_id", organizationId).maybeSingle();
    return data?.slug ? `${APP_URL}/v/${data.slug}` : null;
  }
  if (kind === "duo" || kind === "portrait") {
    const { data } = await supabase.from("organizations").select("slug").eq("id", id).eq("id", organizationId).maybeSingle();
    return data ? `${APP_URL}/lobby/nouveau/${data.slug}` : null;
  }
  return null;
}

export default async function DistributionPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("qr_distribution_assets")
    .select("id, resource_kind, resource_id, style, poster")
    .eq("id", id).eq("organization_id", organization.id).maybeSingle();
  if (!asset) notFound();
  const url = await publicUrl(asset.resource_kind, asset.resource_id, organization.id);
  if (!url) notFound();
  return <PosterEditor qrId={asset.id} playUrl={url} qrStyle={(asset.style ?? {}) as QrStyle} initialConfig={asset.poster as Record<string, unknown>} distribution />;
}
