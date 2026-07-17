import { isIP } from "node:net";

interface HeaderReader {
  get(name: string): string | null;
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[")) candidate = candidate.slice(1, candidate.indexOf("]"));
  else if (candidate.includes(".") && candidate.includes(":")) candidate = candidate.split(":")[0];
  return isIP(candidate) ? candidate : null;
}

/** Préfère les en-têtes posés par les plateformes de confiance. */
export function clientIpFromHeaders(headers: HeaderReader): string {
  const provider = process.env.TRUSTED_PROXY_PROVIDER ?? (process.env.VERCEL ? "vercel" : "");
  const trustedHeader =
    provider === "cloudflare"
      ? "cf-connecting-ip"
      : provider === "vercel"
        ? "x-vercel-forwarded-for"
        : null;
  const trustedIp = trustedHeader ? normalizeIp(headers.get(trustedHeader)) : null;
  if (trustedIp) return trustedIp;

  // Les en-têtes génériques sont forgeables si l'origine est accessible
  // directement. Ils ne sont lus que lorsque l'opérateur déclare
  // explicitement un reverse proxy qui les nettoie et les reconstruit.
  if (provider !== "generic") return "unknown";
  const realIp = normalizeIp(headers.get("x-real-ip"));
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")
    ?.split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
  return forwarded?.at(-1) ?? "unknown";
}
