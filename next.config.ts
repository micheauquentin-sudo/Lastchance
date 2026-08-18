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

// LES PAGES DONT L'URL EST LE SECRET — `/commande/<jeton>` (QR de commande à
// usage unique) et `/hunt/<jeton>` (étape de chasse). Qui détient l'URL détient
// le droit : c'est exactement la propriété qui rend le referer et le cache
// dangereux ici, alors qu'ils sont anodins sur une page ordinaire.
//
// Le même raisonnement que pour `/admin` et `/portefeuille`, appliqué à des
// pages qui n'ont même pas de cookie à protéger — leur jeton est dans le
// CHEMIN, donc dans tout ce qui recopie une URL :
//  - `Referrer-Policy: no-referrer` — sans lui, le moindre lien ou asset
//    tiers chargé depuis ces pages emporte le jeton dans son `Referer` ;
//  - `Cache-Control: no-store` — pas d'écriture sur disque partagé, ni de
//    réapparition par l'historique avant-arrière sur une tablette de comptoir ;
//  - `X-Robots-Tag: noindex` — un jeton indexé est un jeton public, et ces
//    URLs circulent par QR et par SMS, donc parfois via des aperçus.
const tokenPathSecurityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  // LES MÉTADONNÉES BLOQUENT LA RÉPONSE — c'est ce qui rend un 404 vraiment 404.
  //
  // ── Le défaut ──
  //
  // Next 16 STREAME les métadonnées par défaut : l'en-tête HTTP — donc le
  // STATUT — part avant que `generateMetadata` ait fini. Une page joueur dont
  // la ressource n'existe pas répondait donc **200**, avec le 404 enfoui plus
  // loin dans le flux. À l'œil, rien ne change : le visiteur voit bien l'écran
  // « introuvable ». Tout ce qui lit un statut était trompé — moteurs
  // d'indexation, sondes de supervision, tests. Déplacer le `notFound()` du
  // corps vers `generateMetadata` n'y changeait rien : les deux arrivent après
  // l'en-tête.
  //
  // ── Le mécanisme, lu dans le Next installé (16.2.12) ──
  //
  // `server/lib/streaming-metadata.js` :
  //     shouldServeStreamingMetadata(ua, htmlLimitedBots)
  //       → new RegExp(htmlLimitedBots || <bots par défaut>, 'i')
  //       → si l'UA correspond, retourne FALSE = métadonnées BLOQUANTES
  //
  // `lib/metadata/metadata.js` (MetadataOutlet) : quand le flag est faux, la
  // promesse des métadonnées est rendue SANS `<Suspense>` autour. React ne
  // peut alors pas émettre la coquille avant qu'elle soit résolue, et le
  // `notFound()` remonte avant le premier octet. Avec le flag vrai, la même
  // promesse est enveloppée d'un `<Suspense>` : la coquille part d'abord.
  //
  // `server/base-server.js:1041` évalue ce flag PAR REQUÊTE, à partir de
  // l'en-tête `user-agent`. La liste par défaut ne contient que les robots
  // « html-limited » (Bingbot, Slackbot, WhatsApp…) : eux seuls recevaient un
  // statut juste. Une regex attrape-tout la remplace, et tout le monde le
  // reçoit.
  //
  // ── Le prix, assumé ──
  //
  // Le TTFB attend désormais la résolution de `generateMetadata`. Sur les dix
  // parcours joueur, c'est UNE lecture indexée — exactement ce que ces pages
  // payaient avant ce chantier, et sans aucun squelette pour l'habiller. Le
  // `loading.tsx` du groupe `(player)` garde toute sa valeur : il couvre le
  // CORPS, qui reste streamé derrière la coquille. Les autres routes portent
  // des `metadata` statiques, qui ne coûtent aucune attente.
  //
  // ── La limite, écrite plutôt que découverte plus tard ──
  //
  // La garde de Next est `if (userAgent && regex.test(userAgent))` : une
  // requête SANS en-tête `user-agent` retombe sur le streaming, donc sur un
  // 200. Aucune regex ne peut corriger cela depuis ici. Navigateurs, curl et
  // robots en envoient toujours un ; une sonde en socket nu, non.
  //
  // Aucune option par route n'existe (vérifié dans
  // `build/segment-config/app/`) : ce réglage est global, et c'est le seul
  // levier documenté.
  htmlLimitedBots: /.*/,

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
      {
        source: "/commande/:path*",
        headers: tokenPathSecurityHeaders,
      },
      {
        source: "/hunt/:path*",
        headers: tokenPathSecurityHeaders,
      },
      {
        // Jeton d'invitation d'équipe : même classe de porteur que
        // /commande et /hunt (revue du wagon 1, FAIBLE 3) — même durcissement.
        source: "/invite/:path*",
        headers: tokenPathSecurityHeaders,
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
