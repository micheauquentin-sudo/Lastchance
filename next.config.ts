import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildContentSecurityPolicy } from "./src/lib/security-headers";

const csp = buildContentSecurityPolicy();

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
