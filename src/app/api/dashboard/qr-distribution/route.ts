import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  kind: z.enum([
    "campaign", "quiz", "calendar", "pronostics", "jackpot", "loyalty",
    "event", "reservation", "duo", "portrait", "hunt_step", "vitrine",
  ]),
  id: z.string().uuid(),
});

type DistributionKind = Exclude<z.infer<typeof querySchema>["kind"], "campaign">;

async function ownsPublicResource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: DistributionKind,
  id: string,
  organizationId: string,
) {
  if (kind === "duo" || kind === "portrait") return id === organizationId;
  if (kind === "quiz") return Boolean((await supabase.from("quizzes").select("id").eq("id", id).eq("organization_id", organizationId).eq("status", "active").maybeSingle()).data);
  if (kind === "calendar") return Boolean((await supabase.from("calendars").select("id").eq("id", id).eq("organization_id", organizationId).eq("status", "active").maybeSingle()).data);
  if (kind === "pronostics") return Boolean((await supabase.from("contests").select("id").eq("id", id).eq("organization_id", organizationId).neq("status", "draft").maybeSingle()).data);
  if (kind === "jackpot") return Boolean((await supabase.from("jackpot_campaigns").select("id").eq("id", id).eq("organization_id", organizationId).eq("status", "active").maybeSingle()).data);
  if (kind === "loyalty") return Boolean((await supabase.from("loyalty_programs").select("id").eq("id", id).eq("organization_id", organizationId).eq("status", "active").maybeSingle()).data);
  if (kind === "event") return Boolean((await supabase.from("event_sessions").select("id").eq("id", id).eq("organization_id", organizationId).neq("status", "archived").maybeSingle()).data);
  if (kind === "reservation") return Boolean((await supabase.from("reservation_activities").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle()).data);
  if (kind === "hunt_step") return Boolean((await supabase.from("hunt_steps").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle()).data);
  return Boolean((await supabase.from("vitrine_settings").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle()).data);
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    kind: request.nextUrl.searchParams.get("kind"),
    id: request.nextUrl.searchParams.get("id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "QR invalide" }, { status: 400 });

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (role !== "owner" && role !== "editor") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  const supabase = await createClient();
  const { kind, id } = parsed.data;
  if (kind === "campaign") {
    const { data: qr } = await supabase.from("qr_codes").select("id").eq("id", id).eq("organization_id", organization.id).maybeSingle();
    if (!qr) return NextResponse.json({ error: "QR introuvable" }, { status: 404 });
    const { count, error } = await supabase.from("experience_events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("qr_code_id", id).eq("event_name", "reward_issued");
    if (error) return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
    return NextResponse.json({ asset: null, rewardCount: count ?? 0 });
  }

  if (!await ownsPublicResource(supabase, kind, id, organization.id)) {
    return NextResponse.json({ error: "Animation introuvable" }, { status: 404 });
  }
  const { data: asset, error: assetError } = await supabase.from("qr_distribution_assets").select("id, style, poster").eq("organization_id", organization.id).eq("resource_kind", kind).eq("resource_id", id).maybeSingle();
  if (assetError) return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });

  const experienceKind = { quiz: "quiz", calendar: "calendar", pronostics: "contest", jackpot: "jackpot", loyalty: "loyalty", event: "event", reservation: null, duo: null, portrait: null, hunt_step: null, vitrine: null }[kind];
  if (!experienceKind) return NextResponse.json({ asset, rewardCount: null });
  const { count, error: countError } = await supabase.from("experience_events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("experience_kind", experienceKind).eq("experience_id", id).eq("event_name", "reward_issued");
  if (countError) return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  return NextResponse.json({ asset, rewardCount: count ?? 0 });
}
