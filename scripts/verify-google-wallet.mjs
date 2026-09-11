#!/usr/bin/env node

import { createSign } from "node:crypto";

const REQUIRED = [
  "GOOGLE_WALLET_ISSUER_ID",
  "GOOGLE_WALLET_CLIENT_EMAIL",
  "GOOGLE_WALLET_PRIVATE_KEY",
];

function fail(message, code = 1) {
  console.error(`[google-wallet] ${message}`);
  process.exitCode = code;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  fail(`configuration absente: ${missing.join(", ")}`, 2);
} else {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID.trim();
  const clientEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL.trim();
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!/^\d{12,20}$/.test(issuerId)) {
    fail("GOOGLE_WALLET_ISSUER_ID doit etre un identifiant numerique.", 2);
  } else if (!clientEmail.endsWith(".iam.gserviceaccount.com")) {
    fail("GOOGLE_WALLET_CLIENT_EMAIL n'est pas un compte de service.", 2);
  } else {
    try {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/wallet_object.issuer",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 300,
      }))}`;
      const signature = createSign("RSA-SHA256")
        .update(unsigned)
        .sign(privateKey)
        .toString("base64url");

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: `${unsigned}.${signature}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) {
        fail(`authentification OAuth refusee (HTTP ${tokenResponse.status}).`);
      } else {
        const tokenBody = await tokenResponse.json();
        if (typeof tokenBody.access_token !== "string") {
          fail("Google n'a rendu aucun jeton OAuth.");
        } else {
          const issuerResponse = await fetch(
            `https://walletobjects.googleapis.com/walletobjects/v1/issuer/${encodeURIComponent(issuerId)}`,
            {
              headers: { authorization: `Bearer ${tokenBody.access_token}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!issuerResponse.ok) {
            fail(
              `compte emetteur inaccessible (HTTP ${issuerResponse.status}); `
                + "autorisez le compte de service dans Google Wallet Console.",
            );
          } else {
            const issuer = await issuerResponse.json();
            if (String(issuer.issuerId ?? issuerId) !== issuerId) {
              fail("Google a rendu un autre identifiant emetteur.");
            } else {
              console.log(
                `[google-wallet] OK: emetteur ${issuerId} accessible en lecture avec le scope wallet_object.issuer.`,
              );
            }
          }
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      fail(`verification impossible: ${reason}`);
    }
  }
}
