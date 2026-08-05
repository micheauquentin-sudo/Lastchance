import { createAdminClient } from "@/lib/supabase/admin";
import { isModulePageOpenKey } from "@/lib/module-page-opens";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";

/**
 * Compteur d'ouvertures de page publique. Deux formes :
 *
 *   POST /api/scan?slug=<slug>              → la roue (qr_codes.scan_count)
 *   POST /api/scan?module=<clé>&id=<idPub>  → les sept modules à QR
 *
 * Appelé par <ScanBeacon /> à chaque chargement de page — les pages étant
 * servies depuis le cache ISR pour la roue, le comptage ne peut pas se faire
 * dans leur rendu. Réponse TOUJOURS 204, dans tous les cas : le comptage est
 * best-effort et ne doit rien révéler sur l'existence d'un slug.
 *
 * Ce que ce compteur mesure vraiment : un CHARGEMENT de page, pas un scan
 * distinct. Rechargement, retour arrière et lien partagé incrémentent aussi.
 * C'est pourquoi le nouveau compteur s'appelle « ouvertures » côté base comme
 * côté écran — voir le préambule de la migration 20260911120000.
 */

export const dynamic = "force-dynamic";

// Même format que la contrainte SQL sur qr_codes.slug. Il couvre aussi les
// autres formes d'identifiant public des modules — uuid (36 car.), code de
// jonction (8 car.), slug, et jeton d'étape de chasse (`^[A-Za-z0-9-]{8,64}$`,
// strictement inclus dans cette classe) — qui sont tous du `[A-Za-z0-9-]`.
const SLUG_RE = /^[A-Za-z0-9-]{4,64}$/;

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const moduleKey = params.get("module");

  // Le rate-limit est le même dans les deux branches : un endpoint public non
  // borné est un vecteur d'abus, et la RPC module a beau ne rien créer pour un
  // identifiant inconnu, elle lit quand même une table à chaque appel.
  const ip = clientIpFromHeaders(request.headers);

  if (moduleKey === null) {
    // ── Chemin historique : la roue ──
    const slug = params.get("slug") ?? "";
    if (SLUG_RE.test(slug)) {
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

  // ── Chemin module : quiz, calendrier, jackpot, pronostics, fidélité, event,
  // et chasse au trésor — celle-ci comptée PAR ÉTAPE, son `id` étant le jeton
  // de l'étape (`/hunt/[token]`) et non l'identifiant de la chasse. ──
  const publicId = params.get("id") ?? "";
  if (isModulePageOpenKey(moduleKey) && SLUG_RE.test(publicId)) {
    const allowed = await rateLimit(
      rateLimitBucket("scan", moduleKey, publicId, ip),
      RATE_LIMITS.scanIp,
      { failClosed: true },
    );
    if (!allowed) return new Response(null, { status: 204 });
    const admin = createAdminClient();
    const { error } = await admin.rpc("increment_module_page_open", {
      p_module: moduleKey,
      p_public_id: publicId,
    });
    if (error) console.error("[scan] compteur module:", error.message);
  }
  return new Response(null, { status: 204 });
}
