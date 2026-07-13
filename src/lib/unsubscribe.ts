import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/env";

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
  const secret = requiredEnv("SPIN_TOKEN_SECRET");
  const body = Buffer.from(subscriberId).toString("base64url");
  return `${body}.${hmac(`unsub:${body}`, secret)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const secret = requiredEnv("SPIN_TOKEN_SECRET");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(`unsub:${body}`, secret);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const subscriberId = Buffer.from(body, "base64url").toString();
    return subscriberId.length > 0 ? subscriberId : null;
  } catch {
    return null;
  }
}
