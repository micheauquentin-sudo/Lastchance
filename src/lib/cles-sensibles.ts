/**
 * LA LISTE DES NOMS SENSIBLES — une seule, lue par les DEUX postes.
 *
 * Elle vivait dans `src/lib/sentry-scrub.ts`, et c'était le défaut : Sentry y
 * branche tout son pipeline, mais PostHog ne branche que `masquerJetonUrl`
 * (`src/components/analytics.tsx`, `before_send`). Un `?token=…` partait donc
 * expurgé chez l'un et INTACT chez l'autre — alors que c'est PostHog qui reçoit
 * l'URL de CHAQUE pageview, pas seulement celle des incidents.
 *
 * Ce qui est partagé ici, c'est la LISTE, pas le pipeline. `sentry-scrub` reste
 * conçu pour la forme d'un événement Sentry (profondeur, cycles, breadcrumbs) et
 * n'a rien à faire dans un lot client ; `masquer-jeton-url` reste une fonction
 * pure appelée sur chaque événement PostHog. Les deux ont besoin de la même
 * réponse à une seule question : « ce nom de clé porte-t-il un secret ? ».
 *
 * Sens des imports : `sentry-scrub` → `masquer-jeton-url` → `cles-sensibles`.
 * Ce module ne dépend de RIEN, ce qui interdit le cycle par construction.
 */

/**
 * Fragments cherchés DANS le nom de la clé (normalisé sans séparateurs) :
 * `player_key`, `playerKey` et `PLAYER-KEY` tombent sur la même règle.
 */
export const SENSITIVE_KEY_FRAGMENTS = [
  "secret",
  "token",
  "password",
  "passwd",
  "apikey",
  "authorization",
  "cookie",
  "signature",
  "credential",
  "privatekey",
  "servicerole",
  "sessionid",
  "email",
  "phone",
  "telephone",
  "firstname",
  "lastname",
  "fullname",
  "displayname",
  "postalcode",
  "ipaddress",
  "playerkey",
  "unsubscribe",
  "redeemcode",
  "dsn",
];

/**
 * Noms EXACTS. Volontairement séparés des fragments : `key` seul est un
 * secret, `idempotency_key` est un diagnostic ; `code` reste lisible
 * (SQLSTATE, `error.code`) alors que `redeem_code` est déjà couvert plus haut.
 *
 * `code` reste DÉLIBÉRÉMENT hors des deux listes, et le motif a doublé depuis
 * qu'elles servent aussi à PostHog : `/auth/callback?code=…` est le code PKCE
 * de Supabase et `/dashboard/redeem?code=…` le champ de recherche du comptoir.
 * Expurger `code` par son nom rendrait le tunnel de connexion et la caisse
 * illisibles dans l'analytique, sans rien fermer que la forme des codes de
 * retrait ne ferme déjà (`REDEEM_CODE_PATTERN`, côté Sentry).
 */
export const SENSITIVE_KEY_EXACT = new Set([
  "mail",
  "tel",
  "sig",
  "ip",
  "zip",
  "address",
  "auth",
  "pwd",
  "key",
  "otp",
  "pin",
  "username",
]);

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Vrai si le NOM de la clé (ou du paramètre d'URL) annonce un secret. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (SENSITIVE_KEY_EXACT.has(normalized)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

/**
 * CODES DE RETRAIT — la FORME, là où les listes ci-dessus travaillent sur le NOM.
 *
 * Ce sont des SECRETS PORTEURS : qui détient le code encaisse le lot. Ils
 * n'ont rien à faire dans un rapport d'erreur ni dans un journal d'analytique.
 *
 * Le chemin qui les amène chez Sentry n'est pas le nôtre mais celui de
 * PostgreSQL : sur violation d'unicité, son message cite la valeur en cause —
 * « Key (code)=(GAIN-ABCD2345) already exists ». Le chemin qui les amène chez
 * PostHog est plus direct : `/dashboard/redeem?code=GAIN-ABCD2345` est l'URL du
 * comptoir, envoyée telle quelle à chaque pageview.
 *
 * Aucune des deux listes de NOMS ne les couvre, et c'est délibéré : la clé
 * s'appelle `code`, qui doit rester lisible parce que c'est aussi le SQLSTATE,
 * `error.code` et le code PKCE de `/auth/callback`. D'où ce motif, sur la FORME.
 *
 * Les onze préfixes du registre (`reward_issuances`, contrainte
 * `reward_issuances_source_code_match`), suivis de 6 à 10 caractères de
 * l'alphabet de `generateCode` (`CODE_ALPHABET`, sans I/O/0/1).
 *
 * DEUX PRÉFIXES DE LA BASE SONT VOLONTAIREMENT ABSENTS : `PR-` et `PASS-`
 * (`referral_code`, migrations 20260729120000 et 20261119120000). Ce sont des
 * codes de PARRAINAGE — faits pour être partagés par le joueur, c'est tout leur
 * usage — et non des droits au porteur. `PARRAIN-`, qui est la récompense
 * encaissable, est bien dans la liste.
 *
 * Volontairement PAS de motif pour les codes NUS : ils sont indiscernables d'un
 * identifiant technique — le code de salon `/lobby/<6 caractères>` et le code
 * de Ticket d'or `/ticket/<10 caractères>` sont tirés du MÊME alphabet — et
 * tout expurger coûterait le diagnostic sans protéger davantage. Ces deux-là
 * sont fermés par leur préfixe de CHEMIN dans `masquer-jeton-url.ts`.
 *
 * ── OÙ CE MOTIF S'APPLIQUE, ET OÙ IL NE S'APPLIQUE PAS ──
 *
 * Sur un texte libre (Sentry) : partout. Sur une URL (PostHog) : dans la QUERY
 * SEULEMENT, jamais dans le chemin. Ce n'est pas de la prudence, c'est une
 * collision mesurée — `qr_codes.slug` et `contests.slug` acceptent les
 * MAJUSCULES en base (`^[A-Za-z0-9-]{4,64}$`, migration 00001, seuls slugs du
 * produit dans ce cas), et `/play/EVENT-BRETAGNE` ou `/play/CADEAU-DECEMBRE`
 * sont donc des URL parfaitement légitimes que ce motif dévore. Le chemin est
 * la dimension de regroupement de PostHog : la manger, c'est rendre l'analytique
 * du commerçant illisible pour fermer une fuite qui n'existe pas — AUCUNE route
 * du produit ne porte un code PRÉFIXÉ dans son chemin.
 */
export const REDEEM_CODE_PATTERN =
  /\b(?:GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO|TICKET|RESA)-[A-HJ-NP-Z2-9]{6,10}\b/g;
