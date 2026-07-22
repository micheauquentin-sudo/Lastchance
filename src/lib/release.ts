import { optionalEnv } from "@/lib/env";

/**
 * Identité de la release affichée au monitoring.
 *
 * EXPECTED_MIGRATION doit désigner la DERNIÈRE migration du dossier
 * supabase/migrations : le back-office compare cette attente à la
 * version réellement appliquée en base (RPC applied_migrations_info)
 * et signale tout écart. Un test unitaire (release.test.ts) lit le
 * dossier et FAIT ÉCHOUER la CI si la constante n'est pas à jour.
 */
export const EXPECTED_MIGRATION = "20260724130000";

/** SHA court du commit déployé (Vercel), « dev » hors plateforme. */
export function releaseSha(): string {
  return optionalEnv("VERCEL_GIT_COMMIT_SHA")?.slice(0, 7) ?? "dev";
}
