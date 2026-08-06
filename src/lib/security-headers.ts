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

  // 'wasm-unsafe-eval' n'autorise QUE la compilation WebAssembly (pas
  // l'eval JS) — requis par le décodeur meshopt de la mascotte Lumoz.
  const scriptPolicy = (() => {
    if (surface === "static") {
      return `'self' 'unsafe-inline' 'wasm-unsafe-eval' ${hosts}${isDev ? " 'unsafe-eval'" : ""}`;
    }
    const withNonce = nonce ? `'nonce-${nonce}' ` : "";
    if (surface === "sensitive") {
      return `'self' ${withNonce}'strict-dynamic' 'wasm-unsafe-eval' ${hosts}`;
    }
    return `'self' ${withNonce}'wasm-unsafe-eval' ${hosts}`;
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
