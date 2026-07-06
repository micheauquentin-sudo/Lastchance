import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

/**
 * Client Supabase avec la service role key — CONTOURNE LA RLS.
 * Réservé aux opérations serveur contrôlées (parcours public /play,
 * webhooks Stripe). Ne jamais l'utiliser avec des filtres dérivés
 * d'entrées utilisateur non validées.
 */
export function createAdminClient() {
  return createSupabaseClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
