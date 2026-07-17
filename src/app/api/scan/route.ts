import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";

/**
 * Compteur de scans : POST /api/scan?slug=<slug>
 *
 * Appelé par <ScanBeacon /> à chaque chargement de la page /play — la
 * page étant servie depuis le cache ISR, le comptage ne peut plus se
 * faire dans son rendu. Réponse toujours 204 (le comptage est
 * best-effort et ne doit rien révéler sur l'existence d'un slug).
 */

export const dynamic = "force-dynamic";

// Même format que la contrainte SQL sur qr_codes.slug.
const SLUG_RE = /^[A-Za-z0-9-]{4,64}$/;

export async function POST(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (SLUG_RE.test(slug)) {
    const ip = clientIpFromHeaders(request.headers);
    const allowed = await rateLimit(
      rateLimitBucket("scan", slug, ip),
      RATE_LIMITS.scanIp,
      { failClosed: true },
    );
    if (!allowed) return new Response(null, { status: 204 });
    // Attendu (et non fire-and-forget) : en serverless, une promesse
    // laissée en vol après la réponse peut être gelée avant l'écriture.
    // sendBeacon côté client n'attend pas cette réponse de toute façon.
    const admin = createAdminClient();
    const { error } = await admin.rpc("increment_qr_scan", { p_slug: slug });
    if (error) console.error("[scan] compteur:", error.message);
  }
  return new Response(null, { status: 204 });
}
