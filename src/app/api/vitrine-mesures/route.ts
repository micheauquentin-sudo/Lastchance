import { createAdminClient } from "@/lib/supabase/admin";
import { toJson } from "@/lib/supabase/json";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { IP_CLIENT_INCONNUE, clientIpFromHeaders } from "@/lib/request-ip";
import {
  MESURE_VITRINE_MAX,
  mesuresRecevables,
  type MesureVitrine,
} from "@/lib/vitrine-mesures";

/**
 * VIT-9 — LES COMPTEURS AGRÉGÉS D'UNE VITRINE.
 *
 *     POST /api/vitrine-mesures
 *     { "slug": "chez-marcel", "langue": "fr",
 *       "mesures": [{ "type": "fiche", "ref": "…" }, …] }
 *
 * Route PUBLIQUE ET SANS JETON, comme `/api/page-opens` dont elle reprend
 * exactement la forme : la Vitrine est servie depuis le cache ISR, donc le
 * comptage ne peut pas se faire dans son rendu.
 *
 * ── RÉPONSE TOUJOURS 204 ──
 *
 * Dans tous les cas : slug inconnu, vitrine dépubliée, charge illisible, seau
 * saturé. Le comptage est best-effort et ne doit RIEN révéler — un 404 sur un
 * slug inconnu ferait de cette route un oracle d'existence, exactement ce que
 * `vitrine_public_state` refuse d'être.
 *
 * ── CE QUI N'EST PAS LU, ET C'EST LE SUJET DU LOT ──
 *
 * Aucun cookie n'est lu, aucune session ouverte, aucune empreinte calculée.
 * L'IP sert au SEAU et n'est jamais écrite : elle ne franchit pas la frontière
 * de cette fonction. Ce qui part en base est un `+1` sur (organisation, jour,
 * langue, type, référence) — il n'existe nulle part de quoi reconstituer un
 * visiteur.
 *
 * ── L'ORGANISATION N'EST PAS DANS LA CHARGE ──
 *
 * L'appelant ne connaît qu'un SLUG, l'adresse déjà publique. C'est la RPC qui
 * le résout en exigeant `published` et le droit `vitrine`. Laisser le corps
 * nommer une organisation aurait permis d'écrire dans les compteurs de
 * n'importe quel commerce.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);

  // PLAFOND PAR IP SEULE, avant toute lecture de corps — motif `page-opens` :
  // le corps est choisi par l'appelant, et composer un seau avec son contenu
  // aurait ouvert un seau neuf à chaque valeur inventée.
  if (ip !== IP_CLIENT_INCONNUE) {
    const sousPlafond = await rateLimit(
      rateLimitBucket("vitrine-mesures:ip", ip),
      RATE_LIMITS.vitrineMesureIp,
      { failClosed: true },
    );
    if (!sousPlafond) return new Response(null, { status: 204 });
  }

  let charge: unknown;
  try {
    charge = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  if (typeof charge !== "object" || charge === null) {
    return new Response(null, { status: 204 });
  }

  const { slug, langue, mesures } = charge as {
    slug?: unknown;
    langue?: unknown;
    mesures?: unknown;
  };

  if (typeof slug !== "string" || !/^[a-z0-9-]{3,60}$/.test(slug)) {
    return new Response(null, { status: 204 });
  }

  const retenues: MesureVitrine[] = mesuresRecevables(mesures).slice(
    0,
    MESURE_VITRINE_MAX,
  );
  if (retenues.length === 0) return new Response(null, { status: 204 });

  // Attendu, et non laissé en vol : en serverless une promesse abandonnée
  // après la réponse peut être gelée avant l'écriture. `sendBeacon` côté
  // client n'attend de toute façon pas cette réponse.
  const admin = createAdminClient();
  const { error } = await admin.rpc("compter_vues_vitrine", {
    p_slug: slug,
    p_langue: langue === "en" ? "en" : "fr",
    p_mesures: toJson(retenues),
  });
  if (error) console.error("[vitrine-mesures] compteur:", error.message);

  return new Response(null, { status: 204 });
}
