import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";

export interface InvitePayload {
  invitationId: string;
  /** Expiration epoch ms — miroir de expires_at côté base. */
  exp: number;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Tolérance d'horloge sur la borne SUPÉRIEURE de `exp` (même procédé que
 * lib/spin.ts et lib/loyalty-checkin.ts) : quelques secondes de dérive entre
 * instances serverless ne doivent pas invalider un jeton fraîchement émis.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

/**
 * Séparation de domaine : le message signé est préfixé par la famille (même
 * procédé que `unsubscribe.ts`), pour qu'un jeton d'invitation ne puisse jamais
 * être confondu avec un claim ou un check-in fidélité — familles qui partagent
 * le repli SPIN_TOKEN_SECRET tant que leur clé dédiée n'est pas provisionnée.
 */
const SIGNED_DOMAIN = "invite:";

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signedMessage(body: string): string {
  return `${SIGNED_DOMAIN}${body}`;
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
  const secret = signingSecret("TEAM_INVITE_TOKEN_SECRET");
  const payload: InvitePayload = {
    invitationId,
    exp: now.getTime() + INVITE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(signedMessage(body), secret)}`;
}

/**
 * TRANSITION : la vérification accepte les DEUX formes de signature — la forme
 * préfixée (émise depuis l'introduction de `SIGNED_DOMAIN`) et la forme legacy
 * (message = corps nu). Contrairement aux claims (15 min) et aux check-ins
 * fidélité (3 min), une invitation vit 7 jours : refuser la forme legacy
 * casserait les liens déjà partis par email. La tolérance peut être retirée
 * une fois passée une fenêtre de 7 jours après le déploiement — l'émission,
 * elle, est déjà exclusivement préfixée.
 */
export function verifyInviteToken(
  token: string,
  now: Date = new Date(),
): InvitePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = verificationSecrets("TEAM_INVITE_TOKEN_SECRET").some((secret) =>
    [signedMessage(body), body].some((message) => {
      const expected = Buffer.from(hmac(message, secret));
      return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
    }),
  );
  if (!validSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as InvitePayload;
    if (
      typeof payload.invitationId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime() ||
      // Borne SUPÉRIEURE, par cohérence avec les claims et les check-ins
      // fidélité : un jeton mal émis (échéance lointaine, horloge folle) ne
      // vit pas plus longtemps que la TTL nominale. L'impact reste faible —
      // `team_invitations` fait foi pour l'état (acceptée, révoquée, expirée).
      payload.exp - now.getTime() > INVITE_TTL_MS + CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
