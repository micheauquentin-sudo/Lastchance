import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Site vitrine — 100 % statique (aucune donnée dynamique, aucun secret).
 * Indépendant de l'application commerçant : seul NEXT_PUBLIC_APP_URL le
 * relie à l'app (liens « Essai gratuit » / « Connexion »).
 */

const isDev = process.env.NODE_ENV === "development";

/**
 * ── POURQUOI DES EN-TÊTES ICI, SUR UN SITE « SANS SURFACE » ──
 *
 * « 100 % statique » a longtemps été lu comme « donc rien à protéger », et ce
 * fichier n'a porté que `poweredByHeader: false` — pendant que l'application
 * en posait huit. Statique ne veut pourtant pas dire inerte : les CTA
 * « Essai gratuit » et « Connexion » mènent vers l'application où le
 * commerçant est authentifié, et une page ENCADRABLE suffit à faire cliquer
 * ailleurs que ce que le visiteur croit viser. `frame-ancestors 'none'` (et
 * son doublon `X-Frame-Options` pour les vieux navigateurs) ferme cela.
 *
 * ── L'INVENTAIRE QUI DÉTERMINE LA CSP, ET RIEN D'AUTRE ──
 *
 * Relevé sur `src/app/layout.tsx`, `src/components/`, `site/package.json` :
 *
 * - Polices : `next/font/google` (Geist, Geist_Mono). Next les TÉLÉCHARGE au
 *   build et les sert depuis notre origine — d'où `font-src 'self'` et
 *   AUCUNE autorisation `fonts.gstatic.com` / `fonts.googleapis.com`, que
 *   l'app doit garder pour d'autres raisons mais qui seraient ici mortes.
 * - Scripts tiers : aucun. Ni analytique, ni Sentry, ni Turnstile — les
 *   hôtes de la CSP applicative n'ont donc pas d'équivalent ici.
 * - `'unsafe-inline'` sur `script-src` : conservé, pour la même contrainte
 *   qui vaut en régime `static` dans l'app — le HTML statique est mutualisé
 *   entre requêtes, aucun nonce ne peut y être posé, et les scripts
 *   d'amorçage de Next sont en ligne. S'y ajoute le bloc JSON-LD de
 *   `/faq`. Le prétendre plus strict casserait l'hydratation en silence.
 * - `'unsafe-inline'` sur `style-src` : Tailwind 4 et les styles en ligne
 *   émis par Next (dont ceux de `next/font`). Même contrainte que l'app.
 * - Images : uniquement locales ; `data:` et `blob:` couvrent les rendus
 *   canvas. Aucune origine distante.
 * - Cadres : aucune vidéo, aucun widget — `frame-src 'none'`.
 * - Formulaires : aucun POST, le contact passe par `mailto:` —
 *   `form-action 'self'`.
 */
function contentSecurityPolicy(): string {
  return [
    `default-src 'self'`,
    // `'unsafe-eval'` : uniquement le rafraîchissement à chaud de `next dev`.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self'`,
    `img-src 'self' data: blob:`,
    // `ws:`/`wss:` : socket HMR de `next dev`, absente du build de production.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Inapplicable en local (http://localhost:3001), donc omis en dev.
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");
}

/** Aucune API sensible n'est utilisée par le site : tout est refusé. */
function permissionsPolicy(): string {
  return [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "browsing-topics=()",
  ].join(", ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // 2 ans, comme l'application. `preload` volontairement omis : il
          // engage TOUS les sous-domaines de lastchance.app, décision qui
          // appartient à l'app et non au site vitrine.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Redondant avec `frame-ancestors`, conservé pour les anciens
          // navigateurs qui n'implémentent pas la directive.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: permissionsPolicy() },
          // Aucune fenêtre surgissante n'est ouverte par le site : isoler le
          // contexte de navigation est sans effet de bord ici.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },

  // Le repo contient deux projets Next (l'app à la racine, le site ici),
  // donc deux lockfiles : sans racine explicite, Next infère la racine
  // du workspace au niveau du repo et embarque les fichiers conventionnels
  // de l'app (src/proxy.ts, instrumentation, configs Sentry) dans CE build.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
