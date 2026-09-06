import "server-only";

import { createHmac } from "node:crypto";
import { timingSafeEquals } from "@/lib/timing-safe";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";

// ────────────────────────────────────────────────────────────
// Tirage pondéré (pur, testable)
// ────────────────────────────────────────────────────────────

export interface WeightedItem {
  weight: number;
  /** Un lot avec stock épuisé est exclu du tirage. */
  outOfStock?: boolean;
}

/**
 * Retourne l'index de l'élément tiré selon les poids relatifs,
 * ou -1 si aucun élément n'est tirable (poids nuls / tout épuisé).
 * `random` ∈ [0,1) injectable pour les tests.
 */
export function pickWeightedIndex(
  items: WeightedItem[],
  random: number = Math.random(),
): number {
  const eligible = items.map((it) =>
    it.outOfStock || it.weight <= 0 ? 0 : it.weight,
  );
  const total = eligible.reduce((a, w) => a + w, 0);
  if (total <= 0) return -1;

  let x = random * total;
  for (let i = 0; i < eligible.length; i++) {
    x -= eligible[i];
    if (x < 0) return i;
  }
  // random très proche de 1 : dernier éligible
  for (let i = eligible.length - 1; i >= 0; i--) {
    if (eligible[i] > 0) return i;
  }
  return -1;
}

// ────────────────────────────────────────────────────────────
// CE QUI VIVAIT ICI, ET POURQUOI CE N'EST PLUS LE CAS
// ────────────────────────────────────────────────────────────
//
// `playWindowStart`, `nextPlayWindowStart` et `computePlayerKey` ont été
// retirés. Ils n'avaient AUCUN appelant en production — vérifié sur tout le
// dépôt, `src/`, `e2e/`, `scripts/`, `supabase/`, `site/` : leurs seules
// références étaient leurs propres tests, six fois. C'est le pire état
// possible pour du code : couvert, donc rassurant, et jamais exécuté par le
// produit.
//
// Ils n'étaient pas seulement morts, ils étaient FAUX. Le calcul de fenêtre
// qui fait autorité est en SQL (`perform_atomic_spin`,
// 20260927120000_boucle_joueur_gain.sql:182-197) et travaille dans le fuseau
// de l'ORGANISATION (`o.timezone`). Ces fonctions-ci utilisaient `setHours`
// et `getDay`, donc l'heure locale du SERVEUR. Les rebrancher un jour aurait
// décalé la fenêtre hebdomadaire de tout commerçant hors du fuseau du
// serveur, sans que rien ne le signale.
//
// `computePlayerKey(ip, userAgent)` dérivait par ailleurs une identité d'une
// empreinte IP + agent, là où le produit dérive la sienne d'un cookie
// (`src/lib/anonymous-player.ts`). Le sel `PLAYER_KEY_SALT` reste utilisé —
// par `anonymous-player.ts` et `player-identity.ts` —, il n'est pas orphelin.
//
// Le prédicat de tirabilité, lui, a DEUX exemplaires assumés (SQL et
// `src/lib/lot-tirable.ts`) et le second est bien appelé : il n'est pas dans
// ce cas et n'a pas été touché.

// ────────────────────────────────────────────────────────────
// Claim token : le résultat du spin, signé HMAC, à durée limitée.
// Rien n'est modifiable côté client sans invalider la signature.
// ────────────────────────────────────────────────────────────

export interface ClaimPayload {
  spinId: string;
  /** Expiration epoch ms. */
  exp: number;
}

const CLAIM_TTL_MS = 15 * 60 * 1000; // 15 min pour remplir le formulaire

/**
 * Tolérance d'horloge sur la borne SUPÉRIEURE de `exp` : en serverless, deux
 * instances peuvent dériver de quelques secondes. Sans marge, un jeton émis par
 * une instance légèrement en avance serait refusé pendant cet écart. Le coût
 * sécurité est nul (la durée de vie effective ne dépasse pas TTL + 5 s).
 */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

/**
 * Séparation de domaine : le message signé est préfixé par la famille (même
 * procédé que `unsubscribe.ts`). Les familles peuvent partager le repli
 * SPIN_TOKEN_SECRET quand leur clé dédiée n'est pas provisionnée : sans ce
 * préfixe, seule l'incompatibilité des payloads séparait claim, invitation
 * d'équipe et check-in fidélité. Pas de tolérance legacy : un claim vit 15 min.
 */
const SIGNED_DOMAIN = "claim:";

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signedMessage(body: string): string {
  return `${SIGNED_DOMAIN}${body}`;
}

export function signClaimToken(
  spinId: string,
  now: Date = new Date(),
): string {
  const secret = signingSecret("CLAIM_TOKEN_SECRET");
  const payload: ClaimPayload = { spinId, exp: now.getTime() + CLAIM_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(signedMessage(body), secret)}`;
}

export function verifyClaimToken(
  token: string,
  now: Date = new Date(),
): ClaimPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const validSignature = verificationSecrets("CLAIM_TOKEN_SECRET").some((secret) =>
    timingSafeEquals(sig, hmac(signedMessage(body), secret)),
  );
  if (!validSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as ClaimPayload;
    if (
      typeof payload.spinId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime() ||
      // Borne SUPÉRIEURE : un jeton mal émis (échéance lointaine) ne doit pas
      // vivre plus longtemps que la TTL nominale du claim — à la dérive
      // d'horloge près entre instances (cf. CLOCK_SKEW_TOLERANCE_MS).
      payload.exp - now.getTime() > CLAIM_TTL_MS + CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
