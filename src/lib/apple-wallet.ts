import "server-only";

import { PKPass } from "passkit-generator";
import { APP_URL, optionalEnv } from "@/lib/env";

/**
 * Pass Apple Wallet (.pkpass) pour le code de retrait d'un gain —
 * pendant du pass Google Wallet. Exige un compte Apple Developer :
 *   APPLE_WALLET_PASS_TYPE_ID  (ex. pass.fr.lastchance.gain)
 *   APPLE_WALLET_TEAM_ID
 *   APPLE_WALLET_CERT_PEM      (certificat du Pass Type ID)
 *   APPLE_WALLET_KEY_PEM       (clé privée du certificat)
 *   APPLE_WALLET_KEY_PASSPHRASE (facultatif)
 *   APPLE_WALLET_WWDR_PEM      (certificat intermédiaire Apple WWDR)
 * Sans configuration, tout renvoie null et le bouton disparaît côté
 * client — même convention que Google Wallet / Resend / Turnstile.
 *
 * Invalidation : expirationDate reflète l'échéance SERVEUR (iOS grise
 * le pass tout seul) et la route de téléchargement refuse un code
 * retiré/annulé/expiré. Le « void » en direct d'un pass déjà installé
 * exigerait le web service de mise à jour Apple — assumé hors périmètre
 * (l'expiration serveur du code fait foi en caisse quoi qu'il arrive).
 */

/** Icône du pass (58×58, encre kermesse) embarquée : requise par iOS. */
const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAAAc0lEQVR4AeXBMQEAIAzAsK4i+DjwL5IJaTLvnk+AREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiEREiERCwSQQHHZ56LwgAAAABJRU5ErkJggg==",
  "base64",
);

export function appleWalletConfigured(): boolean {
  return Boolean(
    optionalEnv("APPLE_WALLET_PASS_TYPE_ID") &&
      optionalEnv("APPLE_WALLET_TEAM_ID") &&
      optionalEnv("APPLE_WALLET_CERT_PEM") &&
      optionalEnv("APPLE_WALLET_KEY_PEM") &&
      optionalEnv("APPLE_WALLET_WWDR_PEM"),
  );
}

/** URL de téléchargement du pass (null si Apple Wallet non configuré). */
export function buildAppleWalletPassUrl(redeemCode: string): string | null {
  if (!appleWalletConfigured()) return null;
  return `${APP_URL}/api/wallet/apple/${encodeURIComponent(redeemCode)}`;
}

/** Construit le .pkpass signé — null si non configuré ou en échec. */
export async function buildAppleWalletPass(params: {
  organizationName: string;
  prizeLabel: string;
  prizeDescription: string;
  redeemCode: string;
  redeemExpiresAt: string | null;
}): Promise<Buffer | null> {
  if (!appleWalletConfigured()) return null;

  try {
    const pass = new PKPass(
      { "icon.png": ICON_PNG, "icon@2x.png": ICON_PNG },
      {
        wwdr: optionalEnv("APPLE_WALLET_WWDR_PEM")!.replace(/\\n/g, "\n"),
        signerCert: optionalEnv("APPLE_WALLET_CERT_PEM")!.replace(/\\n/g, "\n"),
        signerKey: optionalEnv("APPLE_WALLET_KEY_PEM")!.replace(/\\n/g, "\n"),
        signerKeyPassphrase: optionalEnv("APPLE_WALLET_KEY_PASSPHRASE"),
      },
      {
        formatVersion: 1,
        passTypeIdentifier: optionalEnv("APPLE_WALLET_PASS_TYPE_ID")!,
        teamIdentifier: optionalEnv("APPLE_WALLET_TEAM_ID")!,
        serialNumber: params.redeemCode,
        organizationName: params.organizationName,
        description: `Gain ${params.organizationName}`,
        backgroundColor: "rgb(33, 29, 22)",
        foregroundColor: "rgb(253, 246, 227)",
        labelColor: "rgb(252, 202, 89)",
        ...(params.redeemExpiresAt
          ? { expirationDate: new Date(params.redeemExpiresAt).toISOString() }
          : {}),
      },
    );

    pass.type = "coupon";
    pass.primaryFields.push({
      key: "prize",
      label: params.organizationName,
      value: params.prizeLabel,
    });
    if (params.prizeDescription) {
      pass.auxiliaryFields.push({
        key: "description",
        label: "Détail",
        value: params.prizeDescription,
      });
    }
    pass.secondaryFields.push({
      key: "code",
      label: "Code",
      value: params.redeemCode,
    });
    pass.setBarcodes({
      format: "PKBarcodeFormatCode128",
      message: params.redeemCode,
      messageEncoding: "iso-8859-1",
      altText: params.redeemCode,
    });

    return pass.getAsBuffer();
  } catch (err) {
    console.error("[apple-wallet] génération du pass échouée:", err);
    return null;
  }
}
