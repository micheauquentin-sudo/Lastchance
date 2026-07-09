import "server-only";

import { optionalEnv } from "@/lib/env";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Le challenge anti-bot est-il activé (clé secrète configurée) ? */
export function turnstileEnabled(): boolean {
  return !!optionalEnv("TURNSTILE_SECRET_KEY");
}

/**
 * Vérifie un jeton Cloudflare Turnstile côté serveur.
 *
 * - Turnstile non configuré (pas de `TURNSTILE_SECRET_KEY`) → toujours
 *   accepté : la protection est opt-in, l'app fonctionne sans clé.
 * - Activé mais jeton absent / invalide → refusé.
 * - Erreur réseau alors que le challenge est activé → refusé (fail-closed :
 *   quand un opérateur active le CAPTCHA, on ne le contourne pas sur incident).
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[turnstile]:", err);
    return false;
  }
}
