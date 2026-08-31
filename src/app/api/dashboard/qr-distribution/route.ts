import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { qrDistributionKinds, type QrDistributionKind } from "@/lib/qr-distribution";

const querySchema = z.object({
  kind: z.enum(["campaign", ...qrDistributionKinds]),
  id: z.string().uuid(),
});

type DistributionKind = QrDistributionKind;

const styleSchema = z.object({
  dark: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  light: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logo: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(200_000).nullable(),
  logoScale: z.number().min(0.12).max(0.32),
  pattern: z.enum(["square", "rounded", "dots", "diamond", "fluid", "lines-h", "lines-v", "classy"]),
  eyeStyle: z.enum(["square", "rounded", "circle", "leaf"]),
  eyeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  gradientType: z.enum(["none", "linear", "radial"]),
  darkTo: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  frame: z.enum(["none", "banner"]),
  frameText: z.string().trim().max(32),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  resourceKind: z.enum(qrDistributionKinds),
  resourceId: z.string().uuid(),
});

async function editorContext() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return null;
  if (role !== "owner" && role !== "editor") return null;
  return organization;
}

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

export async function POST(request: NextRequest) {
  const parsed = querySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.kind === "campaign") return NextResponse.json({ error: "QR invalide" }, { status: 400 });
  const organization = await editorContext();
  if (!organization) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const supabase = await createClient();
  if (!await ownsPublicResource(supabase, parsed.data.kind, parsed.data.id, organization.id)) {
    return NextResponse.json({ error: "Animation introuvable" }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("qr_distribution_assets")
    .upsert({ organization_id: organization.id, resource_kind: parsed.data.kind, resource_id: parsed.data.id }, { onConflict: "organization_id,resource_kind,resource_id" })
    .select("id, style, poster")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Création du QR impossible" }, { status: 500 });
  return NextResponse.json({ asset: data });
}

export async function PATCH(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  const style = styleSchema.safeParse(raw);
  if (!parsed.success || !style.success) return NextResponse.json({ error: "Style invalide" }, { status: 400 });
  const organization = await editorContext();
  if (!organization) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const supabase = await createClient();
  if (!await ownsPublicResource(supabase, parsed.data.resourceKind, parsed.data.resourceId, organization.id)) {
    return NextResponse.json({ error: "Animation introuvable" }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("qr_distribution_assets")
    .update({ style: style.data })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .eq("resource_kind", parsed.data.resourceKind)
    .eq("resource_id", parsed.data.resourceId)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  revalidatePath("/dashboard/qr-codes");
  return NextResponse.json({ ok: true });
}
