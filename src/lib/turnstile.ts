import "server-only";

import { APP_URL, optionalEnv } from "@/lib/env";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Le challenge anti-bot est-il activé (clé secrète configurée) ? */
export function turnstileEnabled(): boolean {
  return !!optionalEnv("TURNSTILE_SECRET_KEY");
}

/** En production, le challenge est obligatoire sauf opt-out explicite. */
export function turnstileRequired(): boolean {
  const configured = optionalEnv("TURNSTILE_REQUIRED");
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Vérifie un jeton Cloudflare Turnstile côté serveur.
 *
 * - Turnstile non configuré : refus en production par défaut, acceptation
 *   seulement hors production ou avec `TURNSTILE_REQUIRED=false`.
 * - Activé mais jeton absent / invalide → refusé.
 * - Erreur réseau alors que le challenge est activé → refusé (fail-closed :
 *   quand un opérateur active le CAPTCHA, on ne le contourne pas sur incident).
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string,
  expectedAction = "play",
): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) return !turnstileRequired();
  if (!token || token.length > 2048) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

    // BUDGET DE TEMPS EXPLICITE, sur le chemin de CHAQUE partie.
    //
    // Sans lui, un Cloudflare qui traîne sans fermer la connexion tient
    // l'invocation ouverte jusqu'au plafond de la plateforme : le joueur
    // regarde un bouton qui ne répond pas, et l'erreur qui finit par sortir
    // ressemble à une panne de base. Trois secondes sont très au-dessus du
    // temps réel de `siteverify` et très en dessous du plafond serverless.
    //
    // L'abandon retombe dans le `catch` ci-dessous, qui rend `false` : le
    // refus reste FERMÉ, conformément au contrat du module. On échange une
    // attente indéfinie contre un refus rapide, jamais contre un laissez-passer.
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(3000),
    });
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    if (data.success !== true || data.action !== expectedAction) return false;

    const configuredHosts = (optionalEnv("TURNSTILE_ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const allowedHosts = configuredHosts.length > 0
      ? configuredHosts
      : [new URL(APP_URL).hostname.toLowerCase()];
    return !!data.hostname && allowedHosts.includes(data.hostname.toLowerCase());
  } catch (err) {
    console.error("[turnstile]:", err);
    return false;
  }
}
