import "server-only";

import { createSign } from "node:crypto";
import { APP_URL, optionalEnv } from "@/lib/env";

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Lien « Ajouter à Google Wallet » pour le code de retrait d'un gain.
 * Renvoie null si Google Wallet n'est pas configuré (compte de service
 * émetteur Google Pay & Wallet Console requis) — le bouton disparaît
 * simplement côté client, comme Resend/Turnstile quand ils manquent.
 *
 * Classe et objet du pass sont déclarés inline dans le JWT signé : pas
 * besoin d'appel API préalable pour créer la classe côté Google.
 */
export function buildGoogleWalletSaveUrl(params: {
  organizationName: string;
  prizeLabel: string;
  redeemCode: string;
}): string | null {
  const issuerId = optionalEnv("GOOGLE_WALLET_ISSUER_ID");
  const clientEmail = optionalEnv("GOOGLE_WALLET_CLIENT_EMAIL");
  const rawKey = optionalEnv("GOOGLE_WALLET_PRIVATE_KEY");
  if (!issuerId || !clientEmail || !rawKey) return null;

  try {
    const privateKey = rawKey.replace(/\\n/g, "\n");
    const classId = `${issuerId}.lastchance_prize`;
    const safeCode = params.redeemCode.replace(/[^A-Za-z0-9_.-]/g, "_");
    const objectId = `${issuerId}.${safeCode}`;

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: clientEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [APP_URL],
      payload: {
        genericClasses: [{ id: classId }],
        genericObjects: [
          {
            id: objectId,
            classId,
            genericType: "GENERIC_TYPE_UNSPECIFIED",
            hexBackgroundColor: "#18181b",
            cardTitle: {
              defaultValue: { language: "fr", value: params.organizationName },
            },
            header: {
              defaultValue: { language: "fr", value: params.prizeLabel },
            },
            subheader: {
              defaultValue: { language: "fr", value: "Votre gain" },
            },
            textModulesData: [{ header: "CODE", body: params.redeemCode }],
            barcode: {
              type: "CODE_128",
              value: params.redeemCode,
              alternateText: params.redeemCode,
            },
          },
        ],
      },
    };

    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(privateKey)
      .toString("base64url");

    return `https://pay.google.com/gp/v/save/${unsigned}.${signature}`;
  } catch (err) {
    console.error("[google-wallet] construction du lien échouée:", err);
    return null;
  }
}
