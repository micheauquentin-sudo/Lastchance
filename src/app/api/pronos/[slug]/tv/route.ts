import { NextResponse } from "next/server";
import { loadContestTvContext } from "@/lib/pronostics-context";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";

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
  const allowed = await rateLimit(
    rateLimitBucket("prono:tv", slug, ip),
    RATE_LIMITS.pronoTvIp,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes, réessayez dans un instant" },
      { status: 429, headers: NO_STORE },
    );
  }

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
