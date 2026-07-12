import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

/** Origine (scheme + host) d'une URL, ou undefined si absente/invalide. */
function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

// Origines externes dérivées de l'environnement (NEXT_PUBLIC_* est figé au
// build). Les fallbacks en wildcard gardent la CSP fonctionnelle quand le
// build se fait sans secrets (CI).
const supabaseOrigin =
  originOf(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "https://*.supabase.co";

const posthogOrigin =
  originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://eu.i.posthog.com";
// posthog-js charge ses bundles additionnels depuis l'hôte "assets" de la
// même région (eu.i.posthog.com -> eu-assets.i.posthog.com).
const posthogAssetsOrigin = posthogOrigin.replace(
  /^https:\/\/(eu|us)\.i\.posthog\.com$/,
  "https://$1-assets.i.posthog.com",
);

// L'ingestion Sentry se déduit du DSN ; sinon wildcard (couvre les
// hôtes oXXXX.ingest.[region.]sentry.io).
const sentryOrigin =
  originOf(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? "https://*.sentry.io";

/**
 * Content Security Policy.
 *
 * Compromis assumé : App Router injecte des <script> inline pour
 * l'hydratation ; sans passer toutes les pages en rendu dynamique
 * (nonces via proxy), script-src doit autoriser 'unsafe-inline'.
 * Les protections structurelles (frame-ancestors, object-src, base-uri,
 * form-action, liste blanche stricte des hôtes) restent entières.
 */
const csp = [
  `default-src 'self'`,
  // Turnstile (anti-bot /play) + bundles lazy PostHog.
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${posthogOrigin} ${posthogAssetsOrigin}${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind/attributs style inline + feuilles Google Fonts (polices
  // commerçant chargées via <link> sur /play et les éditeurs).
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  // QR codes et logos : canvas -> data:/blob: ; logos servis depuis
  // Supabase Storage.
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  // Supabase (auth + données), PostHog (événements), Sentry (erreurs).
  `connect-src 'self' ${supabaseOrigin} ${posthogOrigin} ${posthogAssetsOrigin} ${sentryOrigin}${isDev ? " ws: wss:" : ""}`,
  // Le widget Turnstile s'exécute dans une iframe Cloudflare.
  `frame-src https://challenges.cloudflare.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  // Chrome applique form-action aux redirections qui suivent un POST de
  // formulaire : les server actions redirigent vers Stripe
  // (checkout/portail) et vers l'OAuth Google via Supabase.
  `form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com ${supabaseOrigin}`,
  `frame-ancestors 'none'`,
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 2 ans. `preload` volontairement omis : à ajouter (puis soumettre sur
  // hstspreload.org) une fois tous les sous-domaines servis en HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Redondant avec frame-ancestors, conservé pour les anciens navigateurs.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // L'app n'utilise aucune API sensible du navigateur (les QR sont
  // scannés par l'appareil photo natif du téléphone, pas via getUserMedia).
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()",
  },
  // Les OAuth passent par redirection complète (pas de popup) : isoler
  // le contexte de navigation est sans risque ici.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Durcissement supplémentaire du back-office : jamais indexé, aucun
// referer sortant (pas de fuite d'URL admin), aucune mise en cache
// (pages sensibles hors caches partagés / historique avant-arrière).
const adminSecurityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/admin/:path*",
        headers: adminSecurityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Pas de logs Sentry pendant le build.
  silent: true,

  // L'upload des source maps (stack traces lisibles dans Sentry) ne se
  // fait que si un token est fourni — le build local/CI reste autonome.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Retire les appels au logger Sentry du bundle client.
  disableLogger: true,
});
