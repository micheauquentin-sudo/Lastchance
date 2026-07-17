import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";

/**
 * Jeton de désinscription newsletter : même schéma HMAC que le claim
 * token du gain (voir lib/spin.ts), mais SANS expiration — un lien de
 * désinscription doit rester valide indéfiniment (RGPD, email archivé).
 * Le préfixe "unsub:" namespacé dans le message signé évite toute
 * confusion avec un autre type de jeton signé par le même secret.
 */
function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signUnsubscribeToken(subscriberId: string): string {
  const secret = signingSecret("UNSUBSCRIBE_TOKEN_SECRET");
  const body = Buffer.from(subscriberId).toString("base64url");
  return `${body}.${hmac(`unsub:${body}`, secret)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = verificationSecrets("UNSUBSCRIBE_TOKEN_SECRET").some((secret) => {
    const expected = Buffer.from(hmac(`unsub:${body}`, secret));
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
  });
  if (!validSignature) {
    return null;
  }

  try {
    const subscriberId = Buffer.from(body, "base64url").toString();
    return subscriberId.length > 0 ? subscriberId : null;
  } catch {
    return null;
  }
}
