import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";

/**
 * Jeton de CHECK-IN d'un passeport de fidélité : signé HMAC, à durée très
 * courte, il n'autorise QUE la validation d'une visite par la caisse.
 *
 * Pourquoi : en mode `staff`, la page joueur affiche un QR que le commerçant
 * scanne. Ce QR portait auparavant la valeur du cookie passeport — un bearer
 * de 180 jours : quiconque le photographiait (client voisin, caissier
 * malveillant) pouvait reposer le cookie, lire les codes de retrait
 * FIDELITE-… non remis et consommer les tours de roue offerts de la victime.
 * Le QR ne porte plus qu'un laissez-passer de quelques minutes, inutilisable
 * pour LIRE quoi que ce soit : au pire un jeton photographié permet, avant son
 * expiration, de faire compter une visite à la victime.
 *
 * Le payload porte le HASH du jeton passeport (`loyalty_members.token_hash`,
 * déjà la seule forme stockée en base, non inversible) et non le jeton
 * lui-même : la caisse appelle `record_loyalty_stamp` sans jamais voir le
 * secret d'authentification, y compris à la toute première visite — où aucune
 * ligne `loyalty_members` n'existe encore (c'est la RPC qui la crée).
 *
 * Même schéma que les jetons de claim (voir lib/spin.ts) : corps base64url +
 * HMAC-SHA256 sur un message PRÉFIXÉ par la famille, comparaison à temps
 * constant, rotation de secret supportée (LOYALTY_CHECKIN_TOKEN_SECRET, avec
 * LOYALTY_CHECKIN_TOKEN_SECRET_PREVIOUS ; repli SPIN_TOKEN_SECRET uniquement
 * si la clé dédiée est absente, cf. lib/token-secrets.ts).
 */
export interface LoyaltyCheckinPayload {
  programId: string;
  /** Hash SHA-256 du jeton passeport (colonne loyalty_members.token_hash). */
  memberTokenHash: string;
  /** Expiration epoch ms. */
  exp: number;
}

/**
 * TTL volontairement court : le temps d'afficher l'écran et de faire scanner.
 * La page joueur rafraîchit le jeton avant son expiration.
 */
export const LOYALTY_CHECKIN_TTL_MS = 3 * 60 * 1000;

const SECRET_NAME = "LOYALTY_CHECKIN_TOKEN_SECRET";

/**
 * Séparation de domaine : le message signé est préfixé par la famille (même
 * procédé que `unsubscribe.ts`). Sans ce préfixe, un déploiement s'appuyant sur
 * le repli SPIN_TOKEN_SECRET signerait check-ins, claims et invitations avec la
 * même clé — seule l'incompatibilité des payloads empêchait la confusion.
 * Pas de tolérance legacy ici : la TTL de 3 min rend la transition invisible.
 */
const SIGNED_DOMAIN = "loyalty-checkin:";

/** Miroir du CHECK SQL sur loyalty_members.token_hash. */
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signedMessage(body: string): string {
  return `${SIGNED_DOMAIN}${body}`;
}

export function signLoyaltyCheckin(
  input: { programId: string; memberTokenHash: string },
  now: Date = new Date(),
): { token: string; expiresAt: number } {
  const secret = signingSecret(SECRET_NAME);
  const expiresAt = now.getTime() + LOYALTY_CHECKIN_TTL_MS;
  const payload: LoyaltyCheckinPayload = {
    programId: input.programId,
    memberTokenHash: input.memberTokenHash,
    exp: expiresAt,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${hmac(signedMessage(body), secret)}`, expiresAt };
}

/**
 * Retourne le payload si la signature est valide ET le jeton non expiré,
 * null sinon (jeton forgé, altéré, périmé ou malformé). L'appelant DOIT
 * encore vérifier que `programId` correspond au programme visé.
 */
export function verifyLoyaltyCheckin(
  token: string,
  now: Date = new Date(),
): LoyaltyCheckinPayload | null {
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
    ) as LoyaltyCheckinPayload;
    if (
      typeof payload.programId !== "string" ||
      typeof payload.memberTokenHash !== "string" ||
      !TOKEN_HASH_PATTERN.test(payload.memberTokenHash) ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime() ||
      // Borne SUPÉRIEURE : un jeton émis avec une échéance lointaine (bug
      // d'émission, horloge folle) redeviendrait un bearer longue durée. La
      // durée de vie restante ne peut pas dépasser la TTL nominale.
      payload.exp - now.getTime() > LOYALTY_CHECKIN_TTL_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
