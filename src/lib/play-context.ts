import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveAccess } from "@/lib/subscription";
import type { Campaign, Organization, Prize, Wheel } from "@/types/database";

export type PlayContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      qr: { id: string; campaign_id: string; organization_id: string };
      campaign: Campaign;
      organization: Organization;
      wheel: Wheel;
      prizes: Prize[];
    };

/**
 * Charge et valide la chaîne QR → campagne → organisation → roue pour
 * le parcours public. Utilise le client admin : la page /play est
 * anonyme, aucune donnée n'est accessible via l'anon key.
 */
export async function loadPlayContext(slug: string): Promise<PlayContext> {
  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_codes")
    .select("id, campaign_id, organization_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!qr) return { ok: false, error: "Ce lien de jeu n'existe pas." };

  const [{ data: campaign }, { data: organization }, { data: wheel }] =
    await Promise.all([
      admin.from("campaigns").select("*").eq("id", qr.campaign_id).single(),
      admin
        .from("organizations")
        .select("*")
        .eq("id", qr.organization_id)
        .single(),
      admin
        .from("wheels")
        .select("*")
        .eq("campaign_id", qr.campaign_id)
        .maybeSingle(),
    ]);

  const c = campaign as Campaign | null;
  const org = organization as Organization | null;
  const w = wheel as Wheel | null;

  if (!c || !org || !w) return { ok: false, error: "Jeu indisponible." };

  // Abonnement actif ou essai en cours requis (essai 7 jours).
  if (!hasActiveAccess(org)) {
    return { ok: false, error: "Ce jeu est momentanément désactivé." };
  }
  if (c.status !== "active") {
    return { ok: false, error: "Cette campagne n'est pas active." };
  }
  const now = new Date();
  if (c.starts_at && new Date(c.starts_at) > now) {
    return { ok: false, error: "Cette campagne n'a pas encore commencé." };
  }
  if (c.ends_at && new Date(c.ends_at) < now) {
    return { ok: false, error: "Cette campagne est terminée." };
  }

  const { data: prizes } = await admin
    .from("prizes")
    .select("*")
    .eq("wheel_id", w.id)
    .eq("is_active", true)
    .order("position")
    .order("created_at");

  return {
    ok: true,
    admin,
    qr,
    campaign: c,
    organization: org,
    wheel: w,
    prizes: (prizes ?? []) as Prize[],
  };
}
