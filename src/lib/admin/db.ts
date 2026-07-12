import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { optionalEnv, requiredEnv } from "@/lib/env";

/**
 * Client Supabase DÉDIÉ au back-office (contourne la RLS).
 *
 * Sécurité : la clé est prise de `SUPABASE_ADMIN_SERVICE_ROLE_KEY` si
 * elle est fournie, sinon repli sur `SUPABASE_SERVICE_ROLE_KEY`. En
 * production, provisionner une clé distincte (rôle Postgres dédié aux
 * seules opérations admin) permet de rotationner/révoquer l'accès du
 * back-office indépendamment de l'app commerçant — sans changer le code.
 *
 * À n'utiliser que dans le code du back-office (src/lib/admin, src/app/admin),
 * TOUJOURS après une garde RBAC (requireAdmin / authorizeAction).
 */
export function createAdminBackofficeClient() {
  const key =
    optionalEnv("SUPABASE_ADMIN_SERVICE_ROLE_KEY") ??
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createSupabaseClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
