import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Purge le cache ISR de /play/[slug] pour tous les QR codes d'une
 * campagne ou d'une organisation. Sans cela, une modification du
 * commerçant (lots, style, statut de campagne, logo) n'apparaît aux
 * joueurs qu'à l'expiration de la fenêtre ISR (30 s).
 *
 * Best-effort : si la lecture des slugs échoue, l'ISR re-génère de
 * toute façon la page sous 30 s — on ne bloque jamais l'action.
 */
export async function revalidatePlaySlugs(
  supabase: SupabaseClient,
  filter: { campaignId: string } | { organizationId: string },
): Promise<void> {
  const base = supabase.from("qr_codes").select("slug");
  const { data } =
    "campaignId" in filter
      ? await base.eq("campaign_id", filter.campaignId)
      : await base.eq("organization_id", filter.organizationId);

  for (const row of data ?? []) {
    revalidatePath(`/play/${row.slug}`);
  }
}
