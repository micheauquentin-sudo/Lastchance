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
  /** Échéance SERVEUR du code : le pass expire de lui-même dans Wallet. */
  redeemExpiresAt?: string | null;
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
            // Le pass reflète l'expiration SERVEUR du code : passé ce
            // moment, Wallet le classe automatiquement comme expiré.
            ...(params.redeemExpiresAt
              ? {
                  validTimeInterval: {
                    end: { date: new Date(params.redeemExpiresAt).toISOString() },
                  },
                }
              : {}),
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

/** Jeton OAuth du compte de service (scope wallet_object.issuer). */
async function walletApiToken(
  clientEmail: string,
  privateKey: string,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const assertion = `${unsigned}.${createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey)
    .toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Invalide le pass Google Wallet d'un code (retrait ou annulation) :
 * l'objet passe à l'état EXPIRED chez Google — le client voit son pass
 * grisé. Best-effort : sans configuration ou en cas d'échec, on loggue
 * et on continue — l'expiration SERVEUR du code fait foi de toute façon.
 */
export async function expireGoogleWalletPass(redeemCode: string): Promise<void> {
  const issuerId = optionalEnv("GOOGLE_WALLET_ISSUER_ID");
  const clientEmail = optionalEnv("GOOGLE_WALLET_CLIENT_EMAIL");
  const rawKey = optionalEnv("GOOGLE_WALLET_PRIVATE_KEY");
  if (!issuerId || !clientEmail || !rawKey) return;

  try {
    const privateKey = rawKey.replace(/\\n/g, "\n");
    const token = await walletApiToken(clientEmail, privateKey);
    if (!token) return;

    const safeCode = redeemCode.replace(/[^A-Za-z0-9_.-]/g, "_");
    const objectId = `${issuerId}.${safeCode}`;
    const res = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ state: "EXPIRED" }),
        signal: AbortSignal.timeout(8000),
      },
    );
    // 404 : le client n'avait jamais ajouté le pass — rien à invalider.
    if (!res.ok && res.status !== 404) {
      console.warn(`[google-wallet] invalidation ${objectId}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[google-wallet] invalidation échouée:", err);
  }
}
