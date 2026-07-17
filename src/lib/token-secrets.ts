import "server-only";

import { requiredEnv } from "@/lib/env";

/**
 * Chaque usage possède sa clé. SPIN_TOKEN_SECRET reste un fallback de
 * migration afin que les déploiements existants et jetons en vol continuent
 * de fonctionner pendant la rotation.
 */
export function signingSecret(name: string): string {
  return process.env[name] || requiredEnv("SPIN_TOKEN_SECRET");
}

export function verificationSecrets(name: string): string[] {
  const current = signingSecret(name);
  const previous = (process.env[`${name}_PREVIOUS`] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const legacy = process.env.SPIN_TOKEN_SECRET;
  return [...new Set([current, ...previous, ...(legacy ? [legacy] : [])])];
}
