import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildContentSecurityPolicy,
  buildCspReportOnlyPolicy,
  buildOcrWorkerCsp,
  buildPermissionsPolicy,
  buildReportingEndpointsHeader,
} from "./src/lib/security-headers";

// Politique de repli : elle couvre tout ce que le proxy ne voit pas
// (assets, /play, /pronos, /v) et sert de socle aux routes qu'il enrichit
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
  // ── HÔTES AUTORISÉS À CHARGER LES RESSOURCES DU SERVEUR DE DEV ──
  //
  // Sans cette liste, `next dev` ne sert ses fichiers client qu'à `localhost` :
  // ouvrir la page par `127.0.0.1` ou par l'IP du réseau local la rend en HTML
  // mais **ne l'hydrate jamais**. Le piège est qu'elle a l'air correcte — seuls
  // les composants clients manquent à l'appel, sans la moindre erreur visible.
  // Le décor de l'accueil reste alors figé sur son poster.
  //
  // N'a aucun effet en production : `next start` et Vercel ignorent ce champ.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.87"],

  // ── LES BINAIRES DE `sharp` DOIVENT SUIVRE LA FONCTION ──
  //
  // `sharp` charge un `.node` qui charge lui-même `libvips-cpp.so`. Le second
  // n'est référencé par AUCUN `import` : il est résolu au moment du `dlopen`.
  // L'analyse statique qui décide des fichiers embarqués ne peut donc pas le
  // voir, et la fonction déployée part sans lui. La production l'a dit mot pour
  // mot le 2026-08-23 :
  //
  //     ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
  //
  // Le défaut est INVISIBLE en local et en CI : `next start` y tourne sur un
  // `node_modules` complet, où le fichier est là. Seul un déploiement tracé le
  // révèle — ce qui explique qu'une suite E2E verte ait pu le laisser passer.
  //
  // LE GLOB EST LARGE À DESSEIN, et c'est un arbitrage, pas une paresse. Une
  // action serveur s'exécute dans la route qui porte SON FORMULAIRE : la liste
  // exacte des routes qui encodent une image se déduit donc des composants, pas
  // des imports, et s'en tromper d'une ferait revenir un défaut que ni le local
  // ni la CI ne voient. On paie la sûreté en octets.
  //
  // Mesuré sur une construction Linux le 2026-08-23 : 44 traces sur 118
  // embarquent libvips (~10 Mo chacune), et aucune hors de ces deux globs —
  // `/dashboard/redeem` le porte donc sans jamais encoder quoi que ce soit.
  outputFileTracingIncludes: {
    "/dashboard/**": ["./node_modules/@img/**"],
    "/poster/**": ["./node_modules/@img/**"],
  },
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
        // LE FIL DE RECONNAISSANCE DE TEXTE (VIT-18, réparé VIT-29).
        //
        // Cette règle vient APRÈS `/(.*)` et écrase sa `Content-Security-Policy`
        // pour ces quatre fichiers — même mécanisme que `/admin/:path*`, qui
        // écrase déjà `Referrer-Policy`.
        //
        // C'est le seul endroit de l'application où `'wasm-unsafe-eval'` est
        // accordé. La page qui lance ce fil ne l'a toujours pas : un fil tire sa
        // politique de la réponse de SON script, pas de celle de son lanceur.
        // Voir `buildOcrWorkerCsp` pour les deux autres conditions —
        // `workerBlobURL: false` et la sortie du matcher du proxy — sans
        // lesquelles cet en-tête ne sert à rien.
        source: "/ocr/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildOcrWorkerCsp() },
          // Ces fichiers ne sont ni une page ni un contenu à indexer, et ils
          // pèsent 4,1 Mo : rien ne doit les faire remonter dans un moteur.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Décor scrollytelling de l'accueil : une illustration verticale, servie
        // en trois paliers de largeur dont un seul est téléchargé par visite.
        // Sans cache immuable, chaque retour sur l'accueil le reprendrait en
        // entier. Le nom d'un fichier porte sa largeur et ne change jamais sans
        // que son contenu change (ils sont régénérés en bloc par
        // `scripts/build-backdrop-panorama.mjs`), donc `immutable` est sûr ici.
        source: "/panorama/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          // Des images de décor n'ont rien à faire dans un moteur d'images.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
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
      {
        // Le code de salle vit dans le CHEMIN et le corps dépend d'un cookie
        // (membre ou pas) : cinquième surface « l'URL est le secret » (revue
        // L16, M-3). `Vary: Cookie` en plus — un cache clé-sur-URL (proxy
        // d'entreprise, tablette de comptoir) ne doit jamais servir au
        // visiteur suivant la page rendue pour un membre.
        source: "/lobby/:path*",
        headers: [
          ...tokenPathSecurityHeaders,
          { key: "Vary", value: "Cookie" },
        ],
      },
      // /play (ISR), /pronos, /v et /lobby (toutes quatre hors matcher du
      // proxy) ne reçoivent jamais de nonce : ce sont LES QUATRE surfaces
      // publiques — pas trois — où 'unsafe-inline' reste appliqué. Le canal
      // Report-Only y mesure la politique candidate sans rien bloquer, et
      // n'existe que si CSP_REPORT_URI est configuré. Le proxy ne passant pas
      // ici, aucun conflit d'en-tête possible.
      //
      // /v y est entrée avec sa sortie du matcher, /lobby (L16) de même : le
      // proxy leur servait ce même canal, et les exclure sans les ajouter ici
      // les aurait rendues muettes — des surfaces sous 'unsafe-inline' qui ne
      // remontent plus rien. C'est la contrepartie INDISSOCIABLE de la sortie
      // du matcher, et elle se paie dans le même commit.
      ...(cspReportOnly
        ? ["/play/:path*", "/pronos/:path*", "/v/:path*", "/lobby/:path*"].map((source) => ({
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
