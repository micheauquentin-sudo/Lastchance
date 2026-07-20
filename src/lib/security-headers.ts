/** Configuration CSP partagée par next.config et le proxy à nonce. */
function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).origin; } catch { return undefined; }
}

export function buildContentSecurityPolicy(nonce?: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "https://*.supabase.co";
  const posthog = originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://eu.i.posthog.com";
  const posthogAssets = posthog.replace(
    /^https:\/\/(eu|us)\.i\.posthog\.com$/,
    "https://$1-assets.i.posthog.com",
  );
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? "https://*.sentry.io";
  // 'wasm-unsafe-eval' n'autorise QUE la compilation WebAssembly (pas
  // l'eval JS) — requis par le décodeur meshopt de la mascotte Lumoz.
  const scriptPolicy = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${posthog} ${posthogAssets}`
    : `'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${posthog} ${posthogAssets}${isDev ? " 'unsafe-eval'" : ""}`;

  return [
    `default-src 'self'`,
    `script-src ${scriptPolicy}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: ${supabase}`,
    `connect-src 'self' ${supabase} ${posthog} ${posthogAssets} ${sentry}${isDev ? " ws: wss:" : ""}`,
    `frame-src https://challenges.cloudflare.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com ${supabase}`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");
}
