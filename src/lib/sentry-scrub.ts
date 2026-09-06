import type { Breadcrumb, Event } from "@sentry/nextjs";
import {
  isSensitiveKey,
  normalizeKey,
  REDEEM_CODE_PATTERN,
} from "./cles-sensibles";
import { masquerJetonUrl } from "./masquer-jeton-url";

/**
 * Assainissement CENTRAL des charges envoyées à Sentry.
 *
 * Un seul endroit décide ce qui sort de la plateforme : les trois `init`
 * (serveur, edge, navigateur) branchent `scrubSentryEvent` sur `beforeSend`
 * et `scrubSentryBreadcrumb` sur `beforeBreadcrumb`. Aucun appelant n'a
 * donc à se souvenir d'expurger avant `captureException` — c'est la
 * dernière barrière, appliquée quel que soit le chemin (erreur non gérée,
 * `reportError`, fil d'Ariane console/fetch, message d'opération lente).
 *
 * Ce qui est retiré :
 *  - secrets et jetons (JWT, `Authorization: Bearer …`, clés préfixées
 *    `sk_`/`pk_`/`whsec_`/`re_`/`sb_…`, affectations `token=…`) ;
 *  - URLS SIGNÉES : le chemin est conservé, seule la valeur des
 *    paramètres sensibles (`token`, `signature`, `X-Amz-Credential`, `sig`…)
 *    est remplacée — une URL de stockage reste identifiable sans être rejouable ;
 *  - JETONS DE CHEMIN : `/commande/<jeton>`, `/hunt/<jeton>`, `/ticket/<code>`…
 *    portent leur secret DANS le chemin, là où l'expurgation par nom de
 *    paramètre ci-dessus ne va pas voir (src/lib/masquer-jeton-url.ts, qui
 *    couvre désormais les DEUX — chemin et query — parce que PostHog ne
 *    branche que lui) ;
 *  - email, téléphone et clés porteuses de données personnelles
 *    (`email`, `first_name`, `player_key`, `ip_address`, cookies…).
 *
 * Ce qui est CONSERVÉ, parce que c'est tout le diagnostic : le texte de
 * l'erreur, les codes (`error.code`, SQLSTATE), les compteurs et durées,
 * les identifiants techniques (UUID d'organisation, id de job), la pile
 * d'appel, la route. Expurger plus, c'est troquer une fuite contre une
 * cécité.
 */

/** Remplacement générique d'une valeur jugée sensible. */
export const REDACTED = "[expurgé]";
const EMAIL_PLACEHOLDER = "[email]";
const PHONE_PLACEHOLDER = "[téléphone]";
const TOKEN_PLACEHOLDER = "[jeton]";
const SECRET_PLACEHOLDER = "[secret]";
const REDEEM_CODE_PLACEHOLDER = "[code de retrait]";
const CYCLE_PLACEHOLDER = "[cycle]";
const DEPTH_PLACEHOLDER = "[trop profond]";
const TRUNCATED_PLACEHOLDER = "[tronqué]";
const SCRUB_FAILURE_MESSAGE =
  "Charge expurgée : assainissement Sentry impossible";

/** Profondeur et largeur bornées : un objet pathologique ne doit pas bloquer l'envoi. */
const MAX_DEPTH = 10;
const MAX_ARRAY_ITEMS = 1000;

/** Clés dont la valeur est une URL (absolue ou non) : query expurgée par nom de paramètre. */
const URL_KEYS = new Set(["url", "href", "absurl", "from", "to", "location"]);

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * Numéros de téléphone : international (`+33 6 …`) ou national commençant
 * par 0 (`06 12 34 56 78`). Exiger `+` ou `0` en tête est délibéré — une
 * suite de 13 chiffres est presque toujours un horodatage en millisecondes,
 * et l'expurger coûterait du diagnostic sans rien protéger.
 */
const PHONE_PATTERN =
  /(^|[^\w+])(\+\d{1,3}[ .-]?(?:\d[ .-]?){7,12}\d|0\d(?:[ .-]?\d){8})(?!\w)/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_PATTERN = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PREFIXED_SECRET_PATTERN =
  /\b(?:sk|pk|rk|whsec|re|sb|sbp|ghp|gho)[_-][A-Za-z0-9_-]{8,}/g;
/** `token=…`, `secret: "…"` dans un texte libre — expurgé seulement si la clé est sensible. */
const ASSIGNED_VALUE_PATTERN =
  /\b([A-Za-z][A-Za-z0-9_-]{1,40})(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&)"']+)/g;
const URL_IN_TEXT_PATTERN = /\bhttps?:\/\/[^\s"'<>`\\]+/gi;

/**
 * Codes de retrait — LE MOTIF AUSSI A DÉMÉNAGé dans `cles-sensibles.ts`,
 * et pour la même raison que les listes de noms : PostHog en a besoin.
 *
 * `/dashboard/redeem?code=GAIN-ABCD2345` est l'URL du comptoir, envoyée telle
 * quelle à chaque pageview ; ce motif était la seule chose capable de la
 * fermer, et il vivait dans un module que PostHog ne branche pas. La nuance
 * est écrite là-bas : ici il s'applique à tout texte libre, côté analytique il
 * ne s'applique qu'à la QUERY — un slug de QR en majuscules a la même forme.
 */
export { REDEEM_CODE_PATTERN };

/**
 * `isSensitiveKey` est la surface publique de ce module depuis l'origine : ses
 * appelants et son test n'ont pas à savoir que la liste habite ailleurs.
 */
export { isSensitiveKey };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Expurge par NOM de paramètre : `token=…` disparaît, `page=2` reste. */
function scrubQueryString(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      const separator = pair.indexOf("=");
      if (separator < 0) return pair;
      const key = pair.slice(0, separator);
      return isSensitiveKey(safeDecode(key)) ? `${key}=${REDACTED}` : pair;
    })
    .join("&");
}

/**
 * Conserve origine et chemin (le diagnostic utile), expurge la query et le
 * fragment paramètre par paramètre. Une URL signée Supabase (`?token=<JWT>`)
 * reste reconnaissable — et inutilisable.
 */
function scrubUrl(raw: string): string {
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) : null;
  const queryIndex = beforeHash.indexOf("?");
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : null;

  let out = base;
  if (query !== null) out += `?${scrubQueryString(query)}`;
  if (fragment !== null) out += `#${scrubQueryString(fragment)}`;
  return out;
}

/** Assainit un texte libre : message d'erreur, ligne de log, fil d'Ariane. */
export function scrubText(input: string): string {
  if (!input) return input;
  return (
    // EN PREMIER, et sur TOUTE chaîne — pas seulement sur celles reconnues
    // comme des URLs. Un jeton de chemin arrive par trois portes qui ne
    // passent pas par `scrubUrl` : le nom de transaction (`/commande/abc`,
    // chemin nu), le fil d'Ariane `fetch` (« GET /hunt/xyz 404 ») et le texte
    // d'une exception Next. La liste des préfixes est fermée, le passage est
    // donc un no-op sur tout le reste.
    masquerJetonUrl(input)
  )
    .replace(REDEEM_CODE_PATTERN, REDEEM_CODE_PLACEHOLDER)
    .replace(JWT_PATTERN, TOKEN_PLACEHOLDER)
    .replace(BEARER_PATTERN, (_match, scheme: string) =>
      `${scheme} ${TOKEN_PLACEHOLDER}`,
    )
    .replace(PREFIXED_SECRET_PATTERN, SECRET_PLACEHOLDER)
    .replace(URL_IN_TEXT_PATTERN, (url) => scrubUrl(url))
    .replace(
      ASSIGNED_VALUE_PATTERN,
      (match, key: string, separator: string) =>
        isSensitiveKey(key) ? `${key}${separator}${REDACTED}` : match,
    )
    .replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER)
    .replace(PHONE_PATTERN, (_match, prefix: string) =>
      `${prefix}${PHONE_PLACEHOLDER}`,
    );
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Passe générique, EN PLACE : elle couvre message, exception, extra,
 * contexts, tags, fil d'Ariane, requête et spans — y compris les champs
 * que Sentry ajoutera demain, qu'aucune liste explicite n'aurait couverts.
 */
function scrubUnknown(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  const sensitive = isSensitiveKey(key);

  if (typeof value === "string") {
    if (sensitive) return REDACTED;
    const normalized = normalizeKey(key);
    if (URL_KEYS.has(normalized)) return scrubText(scrubUrl(value));
    if (normalized === "querystring") return scrubText(scrubQueryString(value));
    return scrubText(value);
  }

  if (value === null || typeof value !== "object") {
    return sensitive ? REDACTED : value;
  }
  if (sensitive) return REDACTED;

  if (depth >= MAX_DEPTH) return DEPTH_PLACEHOLDER;
  if (seen.has(value)) return CYCLE_PLACEHOLDER;
  seen.add(value);

  if (Array.isArray(value)) {
    const items: unknown[] = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => scrubUnknown(key, item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) items.push(TRUNCATED_PLACEHOLDER);
    return items;
  }

  // Instances (Date, Error…) laissées telles quelles : Sentry normalise la
  // charge en JSON avant `beforeSend`, on n'y rencontre que du simple.
  if (!isPlainObject(value)) return value;

  for (const [childKey, childValue] of Object.entries(value)) {
    Reflect.set(
      value,
      childKey,
      scrubUnknown(childKey, childValue, depth + 1, seen),
    );
  }
  return value;
}

/**
 * `beforeSend` : assainit l'événement en place et le renvoie.
 *
 * En cas d'échec de l'assainissement lui-même, l'incident n'est ni perdu ni
 * envoyé brut : les conteneurs à risque sont retirés et il ne reste qu'un
 * marqueur — un angle mort visible vaut mieux qu'une fuite silencieuse.
 */
export function scrubSentryEvent<E extends Event>(event: E): E {
  try {
    scrubUnknown("", event, 0, new WeakSet<object>());
    if (event.request) delete event.request.cookies;
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    return event;
  } catch {
    delete event.exception;
    delete event.breadcrumbs;
    delete event.extra;
    delete event.contexts;
    delete event.request;
    delete event.user;
    event.message = SCRUB_FAILURE_MESSAGE;
    return event;
  }
}

/** `beforeBreadcrumb` : même barrière sur le fil d'Ariane (console, fetch, navigation). */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  try {
    scrubUnknown("", breadcrumb, 0, new WeakSet<object>());
    return breadcrumb;
  } catch {
    return {
      type: breadcrumb.type,
      category: breadcrumb.category,
      level: breadcrumb.level,
      timestamp: breadcrumb.timestamp,
      message: SCRUB_FAILURE_MESSAGE,
    };
  }
}
