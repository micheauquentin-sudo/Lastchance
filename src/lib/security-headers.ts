/** Configuration CSP partagée par next.config et le proxy à nonce. */

/**
 * Permissions-Policy de l'app. `camera=(self)` : le scanner de QR en
 * caisse (/dashboard/redeem) utilise getUserMedia sur notre propre
 * origine — tout le reste demeure interdit, y compris aux iframes.
 */
export function buildPermissionsPolicy(): string {
  return [
    "camera=(self)",
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

/**
 * Les trois régimes de `script-src` de l'app, du plus strict au plus
 * permissif :
 *
 * - `sensitive` — back-office et pages d'authentification : nonce +
 *   `'strict-dynamic'`. Aucune liste d'hôtes n'est consultée par le
 *   navigateur : seul un script chargé par un script de confiance passe.
 *   Régime en production depuis l'origine, inchangé ici.
 * - `public` — expériences joueur rendues à chaque requête : nonce SANS
 *   `'strict-dynamic'`, la liste d'hôtes reste donc active. C'est
 *   volontaire : Turnstile s'injecte lui-même via `createElement`
 *   (`turnstile-widget.tsx`) puis charge ses propres ressources, et
 *   PostHog va chercher son bundle sur son hôte. `'strict-dynamic'`
 *   ferait dépendre ces deux parcours publics de la propagation de
 *   confiance du navigateur ; une liste d'hôtes courte et connue est ici
 *   le compromis sûr. `'unsafe-inline'` disparaît dans les deux cas —
 *   c'est le gain recherché.
 * - `static` — surfaces servies depuis un cache (ISR `/play`) ou hors du
 *   proxy (`/pronos`) et pages statiques : pas de nonce possible (le HTML
 *   est mutualisé entre requêtes), donc `'unsafe-inline'` conservé pour
 *   les scripts d'amorçage de Next.
 */
export type CspSurface = "static" | "public" | "sensitive";

/**
 * Préfixes du back-office et de l'authentification (nonce + strict-dynamic).
 *
 * ── CETTE LISTE EST TENUE À LA MAIN, ET C'EST SA FAIBLESSE ──
 *
 * Elle ne dérive de rien : ni des routes qui exigent une session, ni d'un
 * segment de l'App Router. Un écran authentifié posé HORS de `/dashboard`
 * retombe donc en régime `static` — c'est-à-dire sous `'unsafe-inline'` et
 * sans nonce — sans que rien ne casse et sans qu'aucun test ne rougisse.
 *
 * C'est arrivé deux fois, pour la même raison : un éditeur plein écran doit
 * sortir de `/dashboard` pour échapper à sa colonne de navigation.
 * `/poster` y est entré à sa création ; `/vitrine-studio` (VIT-17) ne l'a
 * PAS été, et a passé plusieurs lots au régime le plus faible alors qu'il
 * rend l'identité du commerce, sa carte et ses réglages.
 *
 * Rien n'était exploitable — la page est derrière la session, et la CSP n'est
 * pas ce qui l'y tient — mais c'est une défense en profondeur perdue sur
 * l'écran devenu central du module. Toute route plein écran ajoutée plus tard
 * doit venir ici en même temps qu'elle naît.
 */
export const SENSITIVE_PREFIXES = [
  "/dashboard",
  "/admin",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/onboarding",
  "/poster",
  "/vitrine-studio",
  // Les studios par module (VIT-39) : `/studio/calendrier/[id]`, et les onze
  // qui suivront. Un préfixe et non une entrée par module — la liste
  // n'aurait tenu que jusqu'au deuxième oubli, et l'oubli est silencieux :
  // la page retomberait en régime `static`, donc sous `'unsafe-inline'`, sur
  // un écran qui exige pourtant une session.
  "/studio",
] as const;

/**
 * Expériences publiques éligibles au nonce. Deux conditions, toutes deux
 * vérifiées par `security-headers.test.ts` :
 *
 * 1. la route traverse le proxy (absente des exclusions du `matcher`) —
 *    sans quoi aucun nonce n'est émis ;
 * 2. elle déclare `export const dynamic = "force-dynamic"` — un nonce
 *    posé sur du HTML mis en cache serait servi périmé à la requête
 *    suivante et bloquerait les scripts de Next.
 *
 * `/play` en est volontairement absente : elle est en ISR (`revalidate =
 * 30`, ~55 req/s économisées par instance) et cet arbitrage de charge
 * prime. `/pronos` aussi : elle est hors `matcher`, l'y faire entrer
 * ajouterait un aller-retour de session Supabase sur un parcours public.
 * Les deux gardent le régime `static` et le canal Report-Only.
 */
export const PUBLIC_NONCE_PREFIXES = [
  "/calendar",
  // QR de commande unique du Passeport (cahier §7). L'oubli d'un préfixe ici
  // ne casse RIEN de visible : la page retombe simplement en régime `static`,
  // donc sous `'unsafe-inline'`, et le durcissement obtenu partout ailleurs est
  // perdu sur elle seule — une dégradation silencieuse, jamais une erreur.
  "/commande",
  "/event",
  "/hunt",
  "/jackpot",
  "/passeport",
  "/quiz",
] as const;

/** `true` si `pathname` est `prefix` ou une de ses sous-routes. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Régime CSP d'un chemin. Fonction pure : c'est elle qu'on teste. */
export function cspSurfaceForPath(pathname: string): CspSurface {
  if (SENSITIVE_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "sensitive";
  if (PUBLIC_NONCE_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "public";
  return "static";
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).origin; } catch { return undefined; }
}

/**
 * Collecteur de violations CSP, quand `CSP_REPORT_URI` est configuré.
 *
 * Cette valeur part dans un en-tête public : elle est filtrée avant tout
 * usage. HTTPS obligatoire, aucun identifiant intégré (`user:pass@` y
 * serait exfiltré à chaque réponse), aucun caractère hors ASCII
 * imprimable, ni `;` ni `,` — ces deux-là séparent les directives et les
 * en-têtes, une URL qui en contient pourrait en injecter une.
 */
function reportEndpoint(): string | undefined {
  const raw = process.env.CSP_REPORT_URI?.trim();
  if (!raw) return undefined;
  if (!/^[\x21-\x7E]+$/.test(raw)) return undefined;
  if (/[;,]/.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/** Nom du groupe de reporting, partagé par `report-to` et l'en-tête. */
const REPORT_GROUP = "csp-endpoint";

/**
 * Valeur de l'en-tête `Reporting-Endpoints` (API moderne, Chrome), ou
 * `undefined` si aucun collecteur n'est configuré. `report-uri` reste
 * émis en parallèle pour Firefox et Safari.
 */
export function buildReportingEndpointsHeader(): string | undefined {
  const endpoint = reportEndpoint();
  return endpoint ? `${REPORT_GROUP}="${endpoint}"` : undefined;
}

export interface CspOptions {
  /** Régime de `script-src`. Défaut : `static`. */
  surface?: CspSurface;
  /** Nonce de la requête ; ignoré en régime `static`. */
  nonce?: string | null;
  /**
   * Politique destinée à `Content-Security-Policy-Report-Only` :
   * `upgrade-insecure-requests` y est retiré (ignoré par la spec en
   * Report-Only, il ne produirait que des rapports trompeurs).
   */
  reportOnly?: boolean;
}

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const { surface = "static", nonce = null, reportOnly = false } = options;
  const isDev = process.env.NODE_ENV === "development";
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "https://*.supabase.co";
  const posthog = originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://eu.i.posthog.com";
  const posthogAssets = posthog.replace(
    /^https:\/\/(eu|us)\.i\.posthog\.com$/,
    "https://$1-assets.i.posthog.com",
  );
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? "https://*.sentry.io";
  const hosts = `https://challenges.cloudflare.com ${posthog} ${posthogAssets}`;

  // 'wasm-unsafe-eval' RETIRÉ (MORT-2). Il n'a jamais eu qu'une raison d'être —
  // le décodeur meshopt de la mascotte Lumoz — et cette mascotte est supprimée
  // avec ses dépendances. Plus rien dans `src/` ni `e2e/` ne compile de
  // WebAssembly ; la roue est du canvas 2D, pas de la 3D. Une permission dont
  // le motif est parti n'est pas neutre : elle reste ouverte sur les TROIS
  // surfaces, dont `sensitive` (back-office), pour un usage qui n'existe plus.
  const scriptPolicy = (() => {
    if (surface === "static") {
      return `'self' 'unsafe-inline' ${hosts}${isDev ? " 'unsafe-eval'" : ""}`;
    }
    const withNonce = nonce ? `'nonce-${nonce}' ` : "";
    if (surface === "sensitive") {
      return `'self' ${withNonce}'strict-dynamic' ${hosts}`;
    }
    return `'self' ${withNonce}${hosts}`;
  })();

  const endpoint = reportEndpoint();

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
    ...(isDev || reportOnly ? [] : [`upgrade-insecure-requests`]),
    ...(endpoint ? [`report-uri ${endpoint}`, `report-to ${REPORT_GROUP}`] : []),
  ].join("; ");
}

/**
 * Politique candidate mesurée en Report-Only sur les surfaces qui ne
 * peuvent pas encore porter de nonce (`/play` en ISR, `/pronos` hors
 * proxy, pages statiques) : la politique publique, privée de
 * `'unsafe-inline'` et sans nonce. Elle répond à la seule question qui
 * décide de la suite — « qu'est-ce qui, sur ces pages, s'exécute encore
 * en ligne, et est-ce autre chose que l'amorçage de Next ? ».
 *
 * Renvoie `undefined` tant qu'aucun collecteur n'est configuré : la
 * campagne de mesure s'ouvre et se ferme avec `CSP_REPORT_URI`, jamais
 * par accident. Rien n'est bloqué pendant ce temps — Report-Only
 * n'applique rien.
 *
 * Note d'exploitation : un rapport CSP contient l'URL de la page
 * (`document-uri`, `referrer`). Le collecteur doit donc être traité comme
 * un journal applicatif — pas de secret dans nos URL publiques, et une
 * rétention courte côté collecteur.
 */
export function buildCspReportOnlyPolicy(): string | undefined {
  if (!reportEndpoint()) return undefined;
  return buildContentSecurityPolicy({ surface: "public", reportOnly: true });
}

/**
 * LA POLITIQUE DU FIL DE RECONNAISSANCE DE TEXTE — `/ocr/` et rien d'autre.
 *
 * ── LE DÉFAUT QU'ELLE FERME, ET IL ÉTAIT LIVRÉ ──
 *
 * `'wasm-unsafe-eval'` a été retiré de l'app par MORT-2 : il n'avait qu'une
 * raison d'être, le décodeur d'une mascotte 3D supprimée, et une permission
 * dont le motif est parti ne se voit nulle part. Le retrait était juste.
 *
 * VIT-18 a ensuite livré la lecture de carte photographiée — du WebAssembly,
 * dans le navigateur. Rien n'a rougi : ni le typecheck, ni les tests, qui ne
 * lisent pas une CSP. La fonctionnalité était donc en production et INERTE,
 * chez tous les commerçants, sans message et sans trace.
 *
 * ── POURQUOI CETTE POLITIQUE ET NON UN RETOUR EN ARRIÈRE ──
 *
 * Rouvrir `'wasm-unsafe-eval'` dans `buildContentSecurityPolicy` l'aurait rendu
 * aux TROIS régimes, dont `sensitive` — le back-office, l'administration et les
 * pages d'authentification. C'est-à-dire défaire un lot entier de durcissement
 * pour un besoin qui tient dans un seul fichier.
 *
 * La permission est donc portée par la RÉPONSE des fichiers `/ocr/`, et par
 * elle seule. Un fil d'exécution tire sa politique de la réponse de son propre
 * script : celui de la reconnaissance peut compiler du WebAssembly, la page qui
 * l'a lancé ne le peut toujours pas. Pour en abuser, il faudrait déjà contrôler
 * nos propres fichiers statiques — auquel cas la CSP n'est plus la question.
 *
 * ── CE QUI DOIT ÊTRE VRAI EN MÊME TEMPS, SOUS PEINE D'INUTILITÉ ──
 *
 * 1. `import-ocr.ts` doit poser `workerBlobURL: false`. Par défaut,
 *    `tesseract.js` fabrique son fil depuis une URL `blob:` — qui HÉRITE de la
 *    politique de la page, et rendrait cet en-tête sans effet.
 * 2. `/ocr` doit rester HORS du matcher du proxy, sinon deux en-têtes
 *    coexisteraient : le navigateur les INTERSECTE, et la plus stricte
 *    l'emporterait — donc celle-ci ne servirait à rien.
 *
 * Les deux sont gardées, chacune dans son fichier : une seule des trois pièces
 * qui manque et la lecture d'image redevient silencieusement inerte.
 *
 * ── LA POLITIQUE EST MINIMALE ──
 *
 * Ce fil ne rend rien, ne charge aucune image, n'a ni page ni cadre : il
 * importe deux scripts de notre domaine, lit deux fichiers du même domaine, et
 * compile le moteur. Tout le reste est refusé — y compris `connect-src` vers
 * Supabase, PostHog ou Sentry, qui n'ont rien à y faire.
 */
export function buildOcrWorkerCsp(): string {
  return [
    `default-src 'none'`,
    // `'self'` couvre `importScripts` du cœur ; `'wasm-unsafe-eval'` autorise
    // la COMPILATION du module, jamais l'évaluation de JavaScript arbitraire —
    // `'unsafe-eval'` serait bien plus large et n'est pas nécessaire.
    `script-src 'self' 'wasm-unsafe-eval'`,
    // Le dictionnaire et le binaire du moteur, tous deux sous `/ocr/`.
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    // Un fil n'est pas encadrable, mais un fichier `.js` reste une réponse que
    // l'on peut tenter de servir dans un cadre.
    `frame-ancestors 'none'`,
  ].join("; ");
}
