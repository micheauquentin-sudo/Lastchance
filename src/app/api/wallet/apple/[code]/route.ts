import { NextResponse } from "next/server";
import { buildAppleWalletPass, appleWalletConfigured } from "@/lib/apple-wallet";
import { normalizeRedeemCode } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!appleWalletConfigured()) {
    return NextResponse.json({ error: "Apple Wallet non configuré" }, { status: 404 });
  }

  const { code: rawCode } = await params;
  const code = normalizeRedeemCode(rawCode ?? "");
  if (!code) return NextResponse.json({ error: "Code invalide" }, { status: 400 });

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
