import { NextResponse } from "next/server";
import { loadContestTvContext } from "@/lib/pronostics-context";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { IP_CLIENT_INCONNUE, clientIpFromHeaders } from "@/lib/request-ip";

/**
 * Mode TV : GET /api/pronos/[slug]/tv → classement public en JSON.
 *
 * Alimente l'écran affiché en salle (rafraîchissement périodique) :
 * lecture seule, SANS cookie joueur, aucune donnée personnelle (prénom,
 * avatar, points, rang uniquement). Cache partagé court : plusieurs
 * écrans du même commerce se partagent la même photo (~30 s), et un
 * message générique ne distingue pas brouillon / module coupé / inconnu.
 */

export const dynamic = "force-dynamic";

// Même famille de format que les slugs générés (randomCode) — strict,
// borné, aucun caractère spécial.
const SLUG_RE = /^[A-Za-z0-9-]{4,64}$/;

const NO_STORE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug ?? "")) {
    return NextResponse.json(
      { error: "Championnat indisponible" },
      { status: 404, headers: NO_STORE },
    );
  }

  const ip = clientIpFromHeaders(request.headers);

  const tropDeRequetes = () =>
    NextResponse.json(
      { error: "Trop de requêtes, réessayez dans un instant" },
      { status: 429, headers: NO_STORE },
    );

  // ── PLAFOND PAR IP SEULE, CONSOMMÉ D'ABORD (SEC-1/SEC-4) ──────────
  //
  // Le seau `prono:tv:<slug>:<ip>` ci-dessous est composé avec un slug que
  // l'APPELANT choisit : en boucler des inventés ouvrait un seau NEUF à chaque
  // tour — 30 req/min chacun, donc un débit borné par rien — et chaque tour
  // coûtait une écriture de rate-limit. Ce plafond rend le coût d'une rafale
  // indépendant du NOMBRE de slugs essayés.
  //
  // Il n'ajoute AUCUN interrupteur au sens d'ADR-032 : cette route refuse déjà
  // sur une clé composée de l'IP, à un seuil quatre fois plus bas. Et il reste
  // fail-OPEN, comme le seau qu'il précède — une panne du backend de
  // rate-limit ne doit pas éteindre les écrans d'une salle.
  // Comme /api/page-opens, le plafond n'existe QUE sur une IP réellement
  // mesurée. Sans `TRUSTED_PROXY_PROVIDER`, `clientIpFromHeaders` rend
  // `unknown` : tous les écrans du parc tomberaient dans une seule ligne, et y
  // refuser éteindrait le mode TV partout à la fois — l'interrupteur qu'ADR-032
  // interdit. En production (Vercel), l'IP est mesurée.
  if (ip !== IP_CLIENT_INCONNUE) {
    const sousPlafond = await rateLimit(
      rateLimitBucket("prono:tv:ip", ip),
      RATE_LIMITS.pronoTvIpCeiling,
    );
    if (!sousPlafond) return tropDeRequetes();
  }

  // Le fail-open de ce seau-ci RESTE (appel sans `failClosed`, ADR-032).
  const allowed = await rateLimit(
    rateLimitBucket("prono:tv", slug, ip),
    RATE_LIMITS.pronoTvIp,
  );
  if (!allowed) return tropDeRequetes();

  const tv = await loadContestTvContext(slug);
  if (!tv.ok) {
    return NextResponse.json(
      { error: "Championnat indisponible" },
      { status: 404, headers: NO_STORE },
    );
  }

  // Liste blanche explicite : rien d'autre ne sort (jamais de PII).
  return NextResponse.json(
    {
      contest: tv.contest,
      organization: tv.organization,
      totalPlayers: tv.totalPlayers,
      entries: tv.entries,
      generatedAt: tv.generatedAt,
    },
    {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=60",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}
