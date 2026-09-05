import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAppleWalletPass, appleWalletConfigured } from "@/lib/apple-wallet";
import { normalizeRedeemCode } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders, IP_CLIENT_INCONNUE } from "@/lib/request-ip";

/**
 * Téléchargement du pass Apple Wallet d'un gain :
 * GET /api/wallet/apple/[code] → .pkpass signé.
 *
 * Le code de retrait est lui-même le porteur du droit (haute entropie,
 * même modèle que la caisse). La route REFUSE un code retiré, annulé ou
 * expiré — impossible de re-télécharger un pass pour un gain mort ; le
 * pass déjà installé porte son expirationDate et la caisse vérifie de
 * toute façon l'échéance en base.
 */

export const dynamic = "force-dynamic";

/**
 * Forme admise pour le corps d'un code de gain, AVANT toute requête base.
 *
 * `normalizeRedeemCode` ne borne rien : elle accepte n'importe quelle chaîne
 * non vide et la préfixe en `GAIN-…`, à un `slice(0, 80)` près. Elle est
 * partagée avec la caisse et n'est donc pas l'endroit où resserrer.
 *
 * La borne posée ici est celle du REGISTRE des récompenses
 * (`reward_issuances_code_shape`, migration 20260805150000) :
 * `^GAIN-[A-Z0-9]{4,32}$`. Ce n'est PAS l'alphabet du générateur
 * (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 8 caractères — `claim_winning_spin`) :
 * cette migration documente précisément pourquoi cet alphabet strict est une
 * convention de génération et non un invariant des données — backfills,
 * imports et fixtures portent d'autres formes, `GAIN-E2EEXPIRE` (9 caractères)
 * en est une. Rejeter ici sur l'alphabet strict rendrait donc inaccessibles
 * des gains RÉELS ; la forme du registre, elle, est un invariant vérifié en
 * base.
 */
const CODE_GAIN_RE = /^GAIN-[A-Z0-9]{4,32}$/;

/** Clé de seau : le code ne doit jamais servir de clé en clair. */
function empreinteCode(code: string): string {
  return createHash("sha256").update(`wallet:apple:${code}`).digest("hex");
}

/** Réponse de plafond — muette sur le code comme sur son existence. */
function tropDeRequetes() {
  return NextResponse.json(
    { error: "Trop de requêtes, réessayez dans un instant" },
    { status: 429, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!appleWalletConfigured()) {
    return NextResponse.json({ error: "Apple Wallet non configuré" }, { status: 404 });
  }

  const { code: rawCode } = await params;
  const code = normalizeRedeemCode(rawCode ?? "");
  if (!code || !CODE_GAIN_RE.test(code)) {
    return NextResponse.json({ error: "Code invalide" }, { status: 400 });
  }

  // ── PLAFOND PAR IP SEULE, AVANT TOUTE LECTURE SUPABASE ────────────
  //
  // Cette route était la seule route publique du dépôt sans plafond, et le
  // paramètre `request` y était même ignoré. Chaque appel coûte une lecture
  // `service_role` sur `participations` (RLS contournée) puis, sur un code
  // vivant, une signature PKCS#7. L'IP est la seule clé de ce chemin que
  // l'appelant ne choisit pas : c'est donc la seule qui borne l'énumération
  // (le seau par code ci-dessous est renouvelé à chaque code inventé).
  //
  // Fail-OPEN, comme `/api/health` : la clé est PARTAGÉE (CGNAT, Wi-Fi de
  // commerce), et une panne du backend de rate-limit ne doit pas fermer le
  // téléchargement pour tout un lieu. Le plafond n'existe que sur une IP
  // réellement mesurée — sans `TRUSTED_PROXY_PROVIDER`, `clientIpFromHeaders`
  // rend `unknown` et la clé ne désignerait plus personne.
  const ip = clientIpFromHeaders(request.headers);
  if (ip !== IP_CLIENT_INCONNUE) {
    const sousPlafond = await rateLimit(
      rateLimitBucket("wallet:apple:ip", ip),
      RATE_LIMITS.walletPassIp,
    );
    if (!sousPlafond) return tropDeRequetes();
  }

  // ── PLAFOND PAR CODE, HASHÉ, AVANT LA LECTURE ET DONC AVANT LA SIGNATURE ──
  //
  // Clé d'IDENTITÉ DE GAIN, résolue avant le seau : `failClosed` légitime
  // (ADR-032), sa saturation ne coupe que le porteur de ce code.
  //
  // AVANT la lecture, et non entre la lecture et la signature : placé après le
  // contrôle de vie du gain, le 429 ne serait atteint que par les codes
  // VIVANTS et deviendrait l'oracle d'existence que ce fichier interdit par
  // ailleurs. Ici, un code inconnu, retiré, annulé, expiré ou vivant consomme
  // le même seau et rend la même réponse.
  const sousPlafondCode = await rateLimit(
    rateLimitBucket("wallet:apple:code", empreinteCode(code)),
    RATE_LIMITS.walletPassCode,
    { failClosed: true },
  );
  if (!sousPlafondCode) return tropDeRequetes();

  const admin = createAdminClient();
  const { data } = await admin
    .from("participations")
    .select(
      "redeem_code, redeemed_at, cancelled_at, redeem_expires_at, prizes!participations_prize_id_fkey(label, description), organizations!participations_organization_id_fkey(name)",
    )
    .eq("redeem_code", code)
    .limit(1)
    .maybeSingle();

  const row = data as unknown as {
    redeem_code: string;
    redeemed_at: string | null;
    cancelled_at: string | null;
    redeem_expires_at: string | null;
    prizes: { label: string; description: string } | null;
    organizations: { name: string } | null;
  } | null;

  const dead =
    !row ||
    row.redeemed_at !== null ||
    row.cancelled_at !== null ||
    (row.redeem_expires_at !== null &&
      new Date(row.redeem_expires_at).getTime() <= Date.now());
  if (dead) {
    return NextResponse.json({ error: "Gain indisponible" }, { status: 404 });
  }

  const pass = await buildAppleWalletPass({
    organizationName: row.organizations?.name ?? "Votre commerce",
    prizeLabel: row.prizes?.label ?? "Votre gain",
    prizeDescription: row.prizes?.description ?? "",
    redeemCode: row.redeem_code,
    redeemExpiresAt: row.redeem_expires_at,
  });
  if (!pass) {
    return NextResponse.json({ error: "Génération impossible" }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pass), {
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": `attachment; filename="gain-${code}.pkpass"`,
      "cache-control": "no-store",
    },
  });
}
