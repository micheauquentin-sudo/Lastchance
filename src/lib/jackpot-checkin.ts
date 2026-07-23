import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";

/**
 * Jeton de CHECK-IN d'une participation au jackpot collectif : signé HMAC, à
 * durée très courte, il n'autorise QUE la validation d'une participation par la
 * caisse (mode staff).
 *
 * Miroir EXACT de lib/loyalty-checkin.ts, avec un PRÉFIXE DE DOMAINE DISTINCT
 * (`jackpot-checkin:`) : un jeton de fidélité ne doit jamais être vérifiable
 * comme un jeton de jackpot, même lorsque les deux familles partagent le repli
 * SPIN_TOKEN_SECRET (séparation ADR, cf. token-secrets.ts).
 *
 * En mode `staff`, la page joueur affiche un QR que le commerçant scanne. Ce QR
 * ne porte qu'un laissez-passer de quelques minutes, inutilisable pour LIRE
 * quoi que ce soit : au pire un jeton photographié permet, avant son
 * expiration, de faire compter une participation à la victime.
 *
 * Le payload porte le HASH du jeton joueur (`jackpot_players.token_hash`, déjà
 * la seule forme stockée en base, non inversible) et non le jeton lui-même : la
 * caisse appelle `record_jackpot_participation` sans jamais voir le secret
 * d'identité, y compris à la toute première participation — où aucune ligne
 * `jackpot_players` n'existe encore (c'est la RPC qui la crée).
 */
export interface JackpotCheckinPayload {
  campaignId: string;
  /** Hash SHA-256 du jeton joueur (colonne jackpot_players.token_hash). */
  playerTokenHash: string;
  /** Expiration epoch ms. */
  exp: number;
}

/**
 * TTL volontairement court : le temps d'afficher l'écran et de faire scanner.
 * La page joueur rafraîchit le jeton avant son expiration.
 */
export const JACKPOT_CHECKIN_TTL_MS = 3 * 60 * 1000;

/**
 * Tolérance d'horloge sur la borne SUPÉRIEURE de `exp` (même procédé que
 * lib/loyalty-checkin.ts) : deux instances serverless peuvent dériver de
 * quelques secondes ; sans marge, un jeton émis par une instance en avance
 * serait refusé pendant cet écart alors que le client vient de le demander.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

const SECRET_NAME = "JACKPOT_CHECKIN_TOKEN_SECRET";

/**
 * Séparation de domaine : le message signé est préfixé par la famille. Sans ce
 * préfixe, un déploiement s'appuyant sur le repli SPIN_TOKEN_SECRET signerait
 * check-ins jackpot, check-ins fidélité, claims et invitations avec la même
 * clé — seule l'incompatibilité des payloads empêchait la confusion. Pas de
 * tolérance legacy : la TTL de 3 min rend la transition invisible.
 */
const SIGNED_DOMAIN = "jackpot-checkin:";

/** Miroir du CHECK SQL sur jackpot_players.token_hash. */
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signedMessage(body: string): string {
  return `${SIGNED_DOMAIN}${body}`;
}

export function signJackpotCheckin(
  input: { campaignId: string; playerTokenHash: string },
  now: Date = new Date(),
): { token: string; expiresAt: number } {
  const secret = signingSecret(SECRET_NAME);
  const expiresAt = now.getTime() + JACKPOT_CHECKIN_TTL_MS;
  const payload: JackpotCheckinPayload = {
    campaignId: input.campaignId,
    playerTokenHash: input.playerTokenHash,
    exp: expiresAt,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${hmac(signedMessage(body), secret)}`, expiresAt };
}

/**
 * Retourne le payload si la signature est valide ET le jeton non expiré,
 * null sinon (jeton forgé, altéré, périmé ou malformé). L'appelant DOIT
 * encore vérifier que `campaignId` correspond à la campagne visée.
 */
export function verifyJackpotCheckin(
  token: string,
  now: Date = new Date(),
): JackpotCheckinPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = verificationSecrets(SECRET_NAME).some((secret) => {
    const expected = Buffer.from(hmac(signedMessage(body), secret));
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
  });
  if (!validSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as JackpotCheckinPayload;
    if (
      typeof payload.campaignId !== "string" ||
      typeof payload.playerTokenHash !== "string" ||
      !TOKEN_HASH_PATTERN.test(payload.playerTokenHash) ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime() ||
      // Borne SUPÉRIEURE : un jeton émis avec une échéance lointaine (bug
      // d'émission, horloge folle) redeviendrait un bearer longue durée.
      payload.exp - now.getTime() >
        JACKPOT_CHECKIN_TTL_MS + CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
