# Audit de sécurité — Lastchance

Audit complet réalisé pour un usage multi-tenant à grande échelle (centaines
d'établissements). Chaque protection ajoutée a été **vérifiée par exécution**
(tests unitaires, tests d'intégration mockés, et tests de concurrence contre
un vrai PostgreSQL 16) et par **tentative de contournement**.

Statut : **55 tests au vert · typecheck OK · lint OK · build de production OK.**

## 1. Périmètre audité et verdict

| Domaine | Verdict | Détail |
| --- | --- | --- |
| RLS Supabase | ✅ Sain | Isolation par `organization_id` sur toutes les tables métier, helpers `SECURITY DEFINER` pour éviter la récursion. Nouvelles tables : `rate_limits` (service-role only, aucune policy), `audit_logs` (select membres). RLS confirmée active en base. |
| Server Actions | ✅ Durci | Toutes vérifient `getUserAndOrg()` + filtre `organization_id`. Rate limiting ajouté sur les actions publiques et l'auth. |
| Authentification | ✅ Durci | Supabase Auth ; rate limiting sur `login`/`signup` (anti credential stuffing / spam d'inscriptions). |
| Autorisations | ✅ Sain | Appartenance à l'org contrôlée partout ; pas de policy d'insertion sur `organization_members` (join impossible). |
| Multi-tenant | ✅ Sain | `organization_id` + RLS ; le parcours public passe par service role avec chaîne QR→campagne→org validée. |
| Stripe | ✅ Sain | Signature vérifiée + idempotence (`stripe_events`) ; accès gouverné par `subscription_status`/essai (source de vérité = webhook). Audit log ajouté. |
| QR Codes | ✅ Sain | Slug validé par regex + contrainte SQL ; incrément de scan via RPC. |
| API / Route handlers | ✅ Durci | Webhook signé ; export CSV limité à l'org (RLS) + anti-injection de formule. |
| Base de données | ✅ Sain | Contraintes `CHECK`, FK `on delete cascade`, index. |
| Variables d'env | ✅ Sain | Service role key server-only, `.env*` gitignoré, aucun secret commité. |
| Validation des données | ✅ Sain | Zod sur toutes les entrées ; revalidation serveur des exigences de collecte. |
| Gestion des sessions | ✅ Sain | Cookies SSR Supabase, rafraîchissement par le middleware. |
| Headers HTTP | ✅ Durci | CSP + HSTS + X-Frame-Options + nosniff + Referrer-Policy + Permissions-Policy + COOP sur toutes les routes (voir §6). |

## 2. Vulnérabilités trouvées et corrigées

### 2.1 Injection de formule CSV (sévérité élevée) — corrigée
Un joueur pouvait saisir `=…`, `+…`, `-…`, `@…` en prénom/email ; à
l'ouverture de l'export par le commerçant (Excel/Sheets/LibreOffice), la
valeur était évaluée comme une formule (exfiltration via `=HYPERLINK`,
exécution de commande). Correctif : `src/lib/csv.ts` préfixe d'une apostrophe
toute valeur commençant (après espaces) par un caractère dangereux, puis
applique l'échappement RFC 4180.
Vérification : `src/lib/csv.test.ts` — payloads `=1+1`, `+…`, `@SUM`, `-2+3`,
`=HYPERLINK(...)`, préfixes après espaces, `\t`/`\r`, et non-régression sur
le texte légitime (dates, codes `GAIN-…`).

### 2.2 Absence de rate limiting (sévérité élevée) — corrigée
Le parcours public (`spin`/`claim`) et l'auth n'avaient aucune limite → bots,
spam, drainage de stock, credential stuffing. Correctif : compteur atomique à
fenêtre fixe en base (`rate_limits` + RPC `check_rate_limit`), appliqué par IP
**et** par empreinte joueur sur le spin, par IP sur le claim, et par IP sur
login/signup (`src/lib/rate-limit.ts`).
Vérification (PostgreSQL réel) :
- 50 requêtes **concurrentes**, limite 5/60s → **exactement 5 autorisées, 45 refusées** (atomicité prouvée).
- Fenêtre fixe : plafond respecté en rafale, budget réinitialisé à la fenêtre suivante (pas de blocage permanent du joueur légitime).
- Isolation des seaux : un joueur ne peut pas épuiser le budget d'un autre (pas de déni de service croisé).
- Couche applicative (`security-integration.test.ts`) : autorise/bloque selon le RPC, **fail-open** sur incident infra (ne bloque pas les légitimes).

### 2.3 Race condition sur la limite de jeu (sévérité moyenne) — corrigée
Le contrôle `count()` puis `insert` n'était pas atomique → deux requêtes
simultanées du même joueur pouvaient jouer deux fois et réserver deux lots.
Correctif : le seau anti-rafale (`spinBurst`, 1 par 4 s et par empreinte)
sérialise atomiquement les requêtes concurrentes d'un même joueur.
Vérification (PostgreSQL réel) : 20 requêtes concurrentes du même joueur,
limite 1 → **un seul spin passe** ; double-play impossible.

### 2.4 Contournement de la limite via en-têtes falsifiables (sévérité moyenne) — atténuée
`x-forwarded-for`/User-Agent sont falsifiables. Atténuation : rate limiting
par IP **et** par empreinte, plus Cloudflare Turnstile activable pour la
protection non falsifiable. Limite résiduelle documentée : un attaquant qui
fait tourner IP **et** UA à chaque requête doit être arrêté par Turnstile —
d'où sa disponibilité opt-in.

### 2.5 Pas de journal d'audit (sévérité faible) — corrigée
Ajout de `audit_logs` + `src/lib/audit.ts`. Événements journalisés :
`participation.claim`, `participation.redeem`, `subscription.sync`,
`organization.create`.
Vérification (PostgreSQL réel) : insertion service-role des 3 événements
sensibles + contrainte `CHECK` action non vide ; (couche applicative)
best-effort — un échec d'écriture ne casse jamais l'opération métier.

### 2.6 Bots (sévérité faible) — corrigée (opt-in)
Cloudflare Turnstile : vérification serveur (`src/lib/turnstile.ts`) + widget
client (`turnstile-widget.tsx`), activé uniquement si les clés d'env sont
fournies (no-op sinon, parcours inchangé).
Vérification : désactivé → accepte sans appel réseau ; activé + jeton absent →
refuse ; activé + `success:true` → accepte ; activé + `success:false` →
refuse ; **panne réseau siteverify → refuse (fail-closed)**.

## 3. Classes de vulnérabilités — revue

| Classe | Statut |
| --- | --- |
| Broken Access Control | ✅ Filtres `organization_id` + RLS sur chaque action. |
| IDOR | ✅ Réclamation via jeton HMAC signé (pas d'id direct exploitable). |
| XSS | ✅ Échappement React ; `escapeHtml` dans l'email ; URLs forcées `https://` ; aucun `dangerouslySetInnerHTML`. |
| CSRF | ✅ Server Actions Next (contrôle d'origine) ; webhook signé. |
| SQL Injection | ✅ Query builder Supabase / RPC paramétrés, aucune concaténation. |
| Replay Attack | ✅ Jeton claim à TTL + flag `claimed` + `UNIQUE(spin_id)` ; idempotence Stripe. |
| Race Conditions | ✅ Décrément de stock atomique ; limite de jeu sérialisée ; double-claim bloqué par `UNIQUE`. |
| Escalade de privilèges | ✅ Aucune policy d'insertion sur `organization_members`. |
| Secrets exposés | ✅ Aucun secret commité, `.env*` ignoré, service role server-only. |
| Bypass Stripe | ✅ Accès gouverné par le statut synchronisé via webhook signé. |
| Anti-fraude / Bots / Spam | ✅ Rate limiting + Turnstile opt-in + audit logs. |

## 4. Reproduire la vérification

```bash
npm test          # 55 tests (csv, rate-limit, turnstile, intégration, existants)
npm run typecheck
npm run lint
npm run build

# Test de concurrence contre un vrai PostgreSQL (atomicité du rate limiter) :
#   appliquer supabase/migrations/00005_security_hardening.sql puis lancer N
#   appels concurrents à check_rate_limit(bucket, limit, window) ; exactement
#   `limit` appels renvoient true.
```

## 5. Exploitation

- Purge des compteurs : planifier `select public.prune_rate_limits();`
  (cron Supabase quotidien).
- Turnstile : fournir `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
  pour activer le challenge anti-bot.
- Sentry : non ajouté — la journalisation d'erreurs `console.error` + le
  journal d'audit couvrent le besoin en V1 ; à intégrer si un suivi d'erreurs
  centralisé devient nécessaire.

## 6. Headers HTTP de sécurité (2026-07-10)

Ajoutés dans `next.config.ts` (`headers()`), appliqués à **toutes** les
routes, y compris `/play` et les pages statiques :

| Header | Valeur | Rôle |
| --- | --- | --- |
| `Content-Security-Policy` | liste blanche stricte par service | XSS, injection de ressources, clickjacking (`frame-ancestors 'none'`) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Force HTTPS 2 ans (`preload` à ajouter après passage complet des sous-domaines en HTTPS) |
| `X-Frame-Options` | `DENY` | Clickjacking (navigateurs anciens, redondant avec `frame-ancestors`) |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Fuite d'URL (slugs QR, jetons dans query) vers les tiers |
| `Permissions-Policy` | tout désactivé (camera, micro, géoloc, payment…) | L'app n'utilise aucune API sensible du navigateur |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolation du contexte de navigation (OAuth par redirection, pas de popup) |

La CSP autorise uniquement les services réellement utilisés : Turnstile
(`script-src`/`frame-src challenges.cloudflare.com`), PostHog (connect +
bundles lazy), Supabase (connect + logos Storage en `img-src`), Sentry
(connect, origine déduite du DSN), Google Fonts (`style-src`/`font-src` —
polices commerçant chargées via `<link>`), `data:`/`blob:` en `img-src`
(QR codes canvas). `form-action` inclut Stripe Checkout/Portal, Google et
Supabase car Chrome applique cette directive aux redirections qui suivent
un POST de formulaire (server actions).

**Compromis assumé** : `script-src` garde `'unsafe-inline'` car App Router
injecte des scripts inline d'hydratation ; une CSP à nonces exigerait de
rendre toutes les pages dynamiques (proxy sur `/play` inclus). Les hôtes
autorisés restant une liste blanche fermée et `object-src 'none'` /
`base-uri 'self'` étant posés, le durcissement par nonces est une
amélioration possible post-bêta.

Vérification : headers observés via `curl -D -` sur `next start`
(routes statiques, dynamiques et réponses d'erreur), et chargement
Chromium de `/`, `/login`, `/signup`, `/play/[slug]` sans aucune
violation CSP en console.
