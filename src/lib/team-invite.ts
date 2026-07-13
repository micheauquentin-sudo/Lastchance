import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/env";

export interface InvitePayload {
  invitationId: string;
  /** Expiration epoch ms — miroir de expires_at côté base. */
  exp: number;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * Jeton d'invitation d'équipe : signé HMAC, référence l'id de la ligne
 * `team_invitations` (source de vérité pour l'état — acceptée, révoquée,
 * expirée). Même schéma que les jetons de claim (voir lib/spin.ts).
 */
export function signInviteToken(
  invitationId: string,
  now: Date = new Date(),
): string {
  const secret = requiredEnv("SPIN_TOKEN_SECRET");
  const payload: InvitePayload = {
    invitationId,
    exp: now.getTime() + INVITE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export function verifyInviteToken(
  token: string,
  now: Date = new Date(),
): InvitePayload | null {
  const secret = requiredEnv("SPIN_TOKEN_SECRET");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body, secret);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as InvitePayload;
    if (
      typeof payload.invitationId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
