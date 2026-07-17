import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveAccess } from "@/lib/subscription";
import { selectActiveWheel } from "@/lib/wheel-schedule";
import { isConsistentPlayResourceChain } from "@/lib/public-resource-guards";
import type { Campaign, Organization, Prize, Wheel } from "@/types/database";

type PublicPlayOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "timezone"
>;

export type PlayContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      qr: { id: string; campaign_id: string; organization_id: string };
      campaign: Campaign;
      organization: PublicPlayOrganization;
      wheel: Wheel;
      prizes: Prize[];
    };

/** Ligne renvoyée par la requête imbriquée (embeds PostgREST). */
interface PlayContextRow {
  id: string;
  campaign_id: string;
  organization_id: string;
  organizations: PublicPlayOrganization | null;
  campaigns: (Campaign & { wheels: (Wheel & { prizes: Prize[] })[] }) | null;
}

/**
 * Charge et valide la chaîne QR → campagne → organisation → roue pour
 * le parcours public. Utilise le client admin : la page /play est
 * anonyme, aucune donnée n'est accessible via l'anon key.
 *
 * Un seul aller-retour PostgREST (embeds via les FK
 * qr_codes→campaigns/organizations, campaigns→wheels, wheels→prizes) :
 * sur le chemin le plus chaud de l'app, 3 allers-retours séquentiels
 * coûtaient ~2× la latence DB par vue et 5 requêtes par scan.
 */
export async function loadPlayContext(slug: string): Promise<PlayContext> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("qr_codes")
    .select(
      "id, campaign_id, organization_id, organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, timezone), campaigns!qr_codes_campaign_id_fkey(*, wheels!wheels_campaign_id_fkey(*, prizes!prizes_wheel_id_fkey(*)))",
    )
    .eq("slug", slug)
    .maybeSingle();

  const row = data as unknown as PlayContextRow | null;
  if (!row) return { ok: false, error: "Ce lien de jeu n'existe pas." };

  const qr = {
    id: row.id,
    campaign_id: row.campaign_id,
    organization_id: row.organization_id,
  };
  const org = row.organizations;
  const embeddedCampaign = row.campaigns;
  // Multi-roues : on sert la roue active pour l'instant courant
  // (créneau horaire), priorité aux roues planifiées. Le spin lui-même
  // re-résout ce contexte côté serveur — le HTML mis en cache (ISR 30 s)
  // n'a d'incidence que sur le premier rendu autour d'une bascule.
  const embeddedWheel = embeddedCampaign
    ? selectActiveWheel(
        embeddedCampaign.wheels ?? [],
        new Date(),
        org?.timezone ?? "Europe/Paris",
      )
    : null;

  if (!embeddedCampaign || !org || !embeddedWheel) {
    return { ok: false, error: "Jeu indisponible." };
  }

  if (
    org.id !== row.organization_id ||
    !isConsistentPlayResourceChain({
      qr,
      campaign: embeddedCampaign,
      wheel: embeddedWheel,
      prizes: embeddedWheel.prizes ?? [],
    })
  ) {
    console.error("[play-context] chaîne de ressources inter-tenant refusée", {
      qrId: row.id,
      campaignId: row.campaign_id,
    });
    return { ok: false, error: "Jeu indisponible." };
  }

  // Détache les embeds pour rendre des objets Campaign/Wheel nets.
  const { wheels: _wheels, ...c } = embeddedCampaign;
  void _wheels;

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

  // Filtre/tri côté serveur Node : les lots arrivent déjà avec la roue.
  const prizes = (embeddedWheel.prizes ?? [])
    .filter((p) => p.is_active)
    .sort(
      (a, b) =>
        a.position - b.position || a.created_at.localeCompare(b.created_at),
    );

  const { prizes: _prizes, ...wheel } = embeddedWheel;
  void _prizes;

  return {
    ok: true,
    admin,
    qr,
    campaign: c,
    organization: org,
    wheel,
    prizes,
  };
}
