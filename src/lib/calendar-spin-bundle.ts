import type { WheelSegment } from "@/components/wheel/wheel-svg";
import type { ClaimConfig } from "@/components/wheel/claim-form";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Roue cible d'une case `spin`, préchargée côté serveur (clé = wheelId). */
export interface CalendarSpinBundle {
  segments: WheelSegment[];
  claimConfig: ClaimConfig;
}

interface PrizeRow {
  id: string;
  label: string;
  color: string;
  position: number;
  created_at: string;
  wheel_id: string;
}
interface WheelRow {
  id: string;
  campaign_id: string;
}
interface CampaignRow {
  id: string;
  collect_email: boolean;
  collect_phone: boolean;
  code_ttl_seconds: number | null;
}

/**
 * Précharge, pour une LISTE EXPLICITE de roues, la roue cible (segments publics
 * ordonnés comme le tirage serveur + config de collecte de la campagne). Indexé
 * par wheelId : la table renvoyée ne relie AUCUN jour à une roue (invariant #2
 * préservé — le joueur n'apprend le wheelId qu'en ouvrant sa case). L'appelant
 * ne passe QUE les roues auxquelles CE joueur a droit (cases déjà ouvertes, ou la
 * case qu'il vient d'ouvrir) : rien n'est préchargé pour des jours encore
 * verrouillés — pas de spoiler du lot d'une case future dans le payload RSC. Les
 * segments d'une roue sont de toute façon publics quand cette roue est jouée.
 */
export async function loadCalendarSpinBundles(
  admin: ReturnType<typeof createAdminClient>,
  wheelIds: string[],
  organizationId: string,
): Promise<Record<string, CalendarSpinBundle>> {
  // Déduplication / filtrage des roues passées : l'appelant peut fournir des
  // doublons (plusieurs cases ouvertes visant la même roue) ou des `null`.
  wheelIds = [...new Set(wheelIds.filter(Boolean))];
  if (wheelIds.length === 0) return {};

  const [{ data: prizeRows }, { data: wheelRows }] = await Promise.all([
    admin
      .from("prizes")
      .select("id, label, color, position, created_at, wheel_id")
      .in("wheel_id", wheelIds)
      .eq("is_active", true)
      .eq("organization_id", organizationId),
    admin
      .from("wheels")
      .select("id, campaign_id")
      .in("id", wheelIds)
      .eq("organization_id", organizationId),
  ]);

  const wheels = (wheelRows ?? []) as WheelRow[];
  const campaignIds = [...new Set(wheels.map((w) => w.campaign_id))];
  const { data: campaignRows } = campaignIds.length
    ? await admin
        .from("campaigns")
        .select("id, collect_email, collect_phone, code_ttl_seconds")
        .in("id", campaignIds)
        .eq("organization_id", organizationId)
    : { data: [] };

  const campaignById = new Map(
    ((campaignRows ?? []) as CampaignRow[]).map((c) => [c.id, c]),
  );
  const wheelById = new Map(wheels.map((w) => [w.id, w]));

  // Segments par roue : triés comme le tirage serveur (position, puis
  // created_at) — l'index doit coïncider avec le prizeIndex renvoyé.
  const prizeByWheel = new Map<string, PrizeRow[]>();
  for (const row of (prizeRows ?? []) as PrizeRow[]) {
    const list = prizeByWheel.get(row.wheel_id) ?? [];
    list.push(row);
    prizeByWheel.set(row.wheel_id, list);
  }

  const bundles: Record<string, CalendarSpinBundle> = {};
  for (const wheelId of wheelIds) {
    const list = (prizeByWheel.get(wheelId) ?? []).sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    );
    const segments: WheelSegment[] = list.map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
    }));
    const campaign = campaignById.get(wheelById.get(wheelId)?.campaign_id ?? "");
    bundles[wheelId] = {
      segments,
      claimConfig: {
        collectEmail: Boolean(campaign?.collect_email),
        collectPhone: Boolean(campaign?.collect_phone),
        codeTtlSeconds: campaign?.code_ttl_seconds ?? null,
      },
    };
  }
  return bundles;
}
