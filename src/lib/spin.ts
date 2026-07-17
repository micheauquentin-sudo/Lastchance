import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/env";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";
import type { PlayLimit } from "@/types/database";

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
// Limite de jeu (pur, testable)
// ────────────────────────────────────────────────────────────

/**
 * Début de la fenêtre de jeu courante pour une limite donnée.
 * Retourne null si aucune limite (unlimited).
 * - daily : minuit (heure serveur)
 * - weekly : lundi 00:00
 * - once : depuis toujours
 */
export function playWindowStart(limit: PlayLimit, now: Date): Date | null {
  switch (limit) {
    case "unlimited":
      return null;
    case "once":
      return new Date(0);
    case "daily": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "weekly": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay(); // 0 = dimanche
      const sinceMonday = (day + 6) % 7;
      d.setDate(d.getDate() - sinceMonday);
      return d;
    }
  }
}

/**
 * Prochaine fenêtre de jeu après la fenêtre courante, pour une limite
 * donnée — sert à afficher un compte à rebours quand la roue refuse un
 * spin. Null si aucune prochaine fenêtre (unlimited/once : jamais/déjà
 * joué une fois pour toutes).
 */
export function nextPlayWindowStart(limit: PlayLimit, now: Date): Date | null {
  switch (limit) {
    case "unlimited":
    case "once":
      return null;
    case "daily": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 1);
      return d;
    }
    case "weekly": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay(); // 0 = dimanche
      const sinceMonday = (day + 6) % 7;
      d.setDate(d.getDate() - sinceMonday + 7);
      return d;
    }
  }
}

// ────────────────────────────────────────────────────────────
// Identité joueur pseudonymisée (RGPD : pas de PII brute)
// ────────────────────────────────────────────────────────────

export function computePlayerKey(ip: string, userAgent: string): string {
  const salt = requiredEnv("PLAYER_KEY_SALT");
  return createHash("sha256")
    .update(`${salt}:${ip}:${userAgent}`)
    .digest("hex");
}

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

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signClaimToken(
  spinId: string,
  now: Date = new Date(),
): string {
  const secret = signingSecret("CLAIM_TOKEN_SECRET");
  const payload: ClaimPayload = { spinId, exp: now.getTime() + CLAIM_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export function verifyClaimToken(
  token: string,
  now: Date = new Date(),
): ClaimPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = verificationSecrets("CLAIM_TOKEN_SECRET").some((secret) => {
    const expected = Buffer.from(hmac(body, secret));
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
  });
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
      payload.exp < now.getTime()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
