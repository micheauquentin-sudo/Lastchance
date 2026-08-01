import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildContentSecurityPolicy,
  buildCspReportOnlyPolicy,
  buildPermissionsPolicy,
  buildReportingEndpointsHeader,
} from "./src/lib/security-headers";

// Politique de repli : elle couvre tout ce que le proxy ne voit pas
// (assets, /play, /pronos) et sert de socle aux routes qu'il enrichit
// d'un nonce — l'en-tête posé par le proxy prime alors sur celui-ci.
const csp = buildContentSecurityPolicy();
const cspReportOnly = buildCspReportOnlyPolicy();
const reportingEndpoints = buildReportingEndpointsHeader();

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  ...(reportingEndpoints
    ? [{ key: "Reporting-Endpoints", value: reportingEndpoints }]
    : []),
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
  // camera=(self) : requis par le scanner de QR en caisse
  // (/dashboard/redeem). Le reste des APIs sensibles demeure interdit.
  { key: "Permissions-Policy", value: buildPermissionsPolicy() },
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

// LE PORTEFEUILLE JOUEUR — la seule page du produit qui liste des DROITS AU
// PORTEUR sans authentification.
//
// Le motif écrit plus haut pour le back-office (« pages sensibles hors caches
// partagés / historique avant-arrière ») décrit `/portefeuille` encore mieux
// qu'`/admin` : `/admin` est derrière une authentification, `/portefeuille`
// est public et son corps dépend ENTIÈREMENT d'un cookie.
//
// Sans directive explicite, on s'en remet au `Cache-Control` implicite que
// Next émet pour un rendu dynamique. C'est probablement suffisant — mais
// c'est une garantie de framework que rien ici n'affirme ni ne mesure, et ce
// dépôt a déjà décidé une fois, pour `/admin`, de ne pas s'y fier.
//
// Le pire cas est nommé : un intermédiaire qui applique une heuristique de
// cache (proxy d'entreprise, cache partagé sur la tablette d'un comptoir, un
// CDN ajouté demain devant l'application) sert le portefeuille du visiteur
// précédent au suivant — c'est-à-dire des codes encaissables en caisse.
//
// `private` interdit les caches partagés, `no-store` interdit l'écriture, et
// `Vary: Cookie` dit explicitement ce dont dépend la réponse. `X-Robots-Tag`
// parce qu'une page de codes n'a rien à faire dans un index.
const walletSecurityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Vary", value: "Cookie" },
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
      {
        source: "/portefeuille",
        headers: walletSecurityHeaders,
      },
      // /play (ISR) et /pronos (hors matcher du proxy) ne reçoivent
      // jamais de nonce : ce sont les seules surfaces publiques où
      // 'unsafe-inline' reste appliqué. Le canal Report-Only y mesure la
      // politique candidate sans rien bloquer, et n'existe que si
      // CSP_REPORT_URI est configuré. Le proxy ne passant pas ici, aucun
      // conflit d'en-tête possible.
      ...(cspReportOnly
        ? ["/play/:path*", "/pronos/:path*"].map((source) => ({
            source,
            headers: [
              { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
            ],
          }))
        : []),
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

  // Configuration actuelle de tree-shaking Sentry (l'ancien
  // `disableLogger` est déprécié).
  webpack: { treeshake: { removeDebugLogging: true } },
});
