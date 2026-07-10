# Lastchance

SaaS de gamification pour commerces (restaurants, bars, boutiques…).
Les clients scannent un QR code, tournent une roue de la fortune et gagnent
des récompenses configurées par le commerçant. Multi-tenant, conforme RGPD,
jamais lié aux avis en ligne.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Supabase** — Auth, PostgreSQL (RLS), migrations SQL versionnées
- **Stripe** — abonnement mensuel des commerçants (Checkout + webhook)
- **Resend** — email de gain
- **PostHog** — analytics (optionnel)
- **Vercel** — déploiement

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis remplir les variables
npm run dev
```

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Appliquer les migrations dans l'ordre (SQL Editor ou CLI) :
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_spins.sql`
   - `supabase/migrations/00003_engagement_and_trial.sql`
   - `supabase/migrations/00004_campaign_play_settings.sql`
   - `supabase/migrations/00005_security_hardening.sql`
   - `supabase/migrations/00006_branding_and_customization.sql`
   - `supabase/migrations/00006_qr_style.sql`
3. Renseigner dans `.env.local` : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. Auth → URL Configuration : ajouter `{APP_URL}/auth/confirm` (emails
   de confirmation) et `{APP_URL}/auth/callback` (OAuth Google) aux
   Redirect URLs
5. Connexion Google : Auth → Providers → Google → renseigner le
   Client ID / Client Secret d'un projet
   [Google Cloud](https://console.cloud.google.com/apis/credentials)
   (OAuth 2.0, redirect URI = celle affichée par Supabase)

### 2. Secrets applicatifs

```bash
# .env.local
SPIN_TOKEN_SECRET=$(openssl rand -hex 32)   # signe les gains (HMAC)
PLAYER_KEY_SALT=$(openssl rand -hex 16)     # pseudonymise les joueurs
```

### 3. Stripe

1. Créer un produit + price mensuel récurrent → `STRIPE_PRICE_ID_STARTER`
2. `STRIPE_SECRET_KEY` (mode test d'abord)
3. Webhook → endpoint `{APP_URL}/api/stripe/webhook`, événements :
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`
   → `STRIPE_WEBHOOK_SECRET`
4. En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### 4. Resend (emails de gain)

1. Vérifier un domaine sur [resend.com](https://resend.com)
2. `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (ex : `Lastchance <noreply@votredomaine.fr>`)
3. Sans configuration, l'app fonctionne — l'email est simplement ignoré (log).

**L'email de gain n'arrive pas ?** Vérifier dans l'ordre :
1. `RESEND_API_KEY` **et** `RESEND_FROM_EMAIL` sont bien définies en prod
   (Vercel → Settings → Environment Variables, puis redéployer)
2. Le domaine de `RESEND_FROM_EMAIL` est **vérifié** dans Resend
   (Domains → statut "Verified"). Sans domaine vérifié (mode test /
   `onboarding@resend.dev`), Resend n'envoie qu'à l'adresse email du
   propriétaire du compte Resend — jamais aux clients.
3. Les logs de la fonction (Vercel → Logs) : chercher `[resend]` —
   chaque envoi loggue son id, chaque échec loggue la cause exacte.
4. Le dashboard Resend → Emails : liste chaque tentative et son statut.

### 5. PostHog (optionnel)

`NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (EU par défaut).

### 6. Cloudflare Turnstile (optionnel, anti-bot)

Challenge anti-robot sur le parcours public (spin). Désactivé tant que les
clés ne sont pas fournies — le parcours reste identique sans configuration.

```bash
# .env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   # widget côté client
TURNSTILE_SECRET_KEY=...             # vérification côté serveur
```

Créer un widget sur [dash.cloudflare.com](https://dash.cloudflare.com) →
Turnstile. Sans ces clés, le rate limiting reste actif et suffit à bloquer
l'automatisation de base.

### 7. Upstash Redis (optionnel, rate limiting renforcé)

Sans configuration, le rate limiting utilise le compteur atomique en
base (suffisant pour un pilote). Pour plusieurs établissements actifs
ou en cas d'abus, créer une base Redis sur
[upstash.com](https://upstash.com) et renseigner :

```bash
# .env.local
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Les compteurs basculent alors sur Redis (la base reste le repli
automatique en cas d'erreur réseau — jamais de blocage à tort).

## Déploiement Vercel

1. Importer le repo dans Vercel (framework : Next.js, zéro config)
2. Copier toutes les variables d'environnement de `.env.example`
   (avec `NEXT_PUBLIC_APP_URL` = URL de prod)
3. Mettre à jour le webhook Stripe et les Redirect URLs Supabase
   avec l'URL de production

## Commandes

| Commande            | Rôle                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Serveur de développement                |
| `npm run build`     | Build de production (+ typecheck)       |
| `npm run lint`      | ESLint                                  |
| `npm test`          | Tests unitaires (tirage, tokens, RGPD)  |
| `npm run test:e2e`  | E2E Playwright du parcours joueur¹      |
| `npm run typecheck` | TypeScript seul                         |

¹ Contre un environnement réel : `E2E_BASE_URL=… E2E_PLAY_SLUG=<slug
d'un QR actif> npm run test:e2e` — sans ces variables, les tests sont
ignorés proprement (voir `playwright.config.ts`).

## Architecture

Voir [docs/architecture.md](docs/architecture.md) pour le schéma complet
(base de données, flux, sécurité) et [docs/decisions.md](docs/decisions.md)
pour les décisions d'architecture (ADR).

**Parcours joueur** : scan QR → `/play/[slug]` → action d'engagement au
choix si la campagne en active (newsletter, Instagram, TikTok, avis
Google) → spin (résultat calculé côté serveur, limite de jeu par
empreinte pseudonymisée) → selon la campagne : formulaire (prénom +
email et/ou téléphone, CGU, opt-in marketing séparé) ou code affiché
directement → code de retrait (masquable après un compte à rebours) +
email si collecté.

**Espace commerçant** : `/dashboard` — campagnes (chacune configure ses
actions avant de jouer, les données demandées au gagnant — email /
téléphone / rien — et le compte à rebours du code) avec stats par
campagne, roue (lots, poids, stocks) **entièrement personnalisable**
(6 styles prêts à l'emploi mélangeables, anneau, ampoules, bordures,
moyeu, pointeur, 7 polices, fond de page, bouton, accroche — aperçu
fidèle en direct), logo d'établissement affiché aux clients après le
scan, QR codes avec **éditeur d'affiche** (modèles, couleurs, polices,
textes, taille du QR — impression A4 directe) + PNG téléchargeable,
page **Caisse** (validation d'un code en un geste), participations
(recherche par code / prénom / email, filtre « à valider », validation
des gains, export CSV, export des abonnés newsletter), statistiques,
abonnement Stripe.

**Essai gratuit** : 7 jours à l'inscription. Essai expiré sans
abonnement : le dashboard reste accessible et les QR codes créables,
mais les campagnes ne peuvent plus être activées et les roues publiques
sont désactivées.

## Sécurité

- RLS activée sur toutes les tables, isolation par `organization_id`
- La page publique ne reçoit jamais les probabilités des lots
- Résultat du spin signé HMAC (15 min) — infalsifiable côté client
- Limite de jeu vérifiée **au spin** (pas au formulaire)
- Consentement CGU exigé par contrainte SQL (`CHECK accepted_terms`)
- Pas de PII brute dans les identifiants joueurs (SHA-256 salé)
- Webhooks Stripe : signature vérifiée + idempotence en base
- **Rate limiting** atomique en base (par IP + empreinte joueur) sur le
  spin, la réclamation, la connexion et l'inscription — bloque bots, spam,
  drainage de stock et credential stuffing, et ferme la course sur la
  limite de jeu ; bascule sur **Upstash Redis** si configuré (repli
  automatique sur la base en cas d'erreur)
- Style de roue et affiche : **validation stricte côté serveur** (zod,
  couleurs hexadécimales uniquement, tailles bornées) avant écriture en
  jsonb — l'éditeur ne peut injecter ni CSS ni HTML arbitraire
- **Anti-injection CSV** : les exports neutralisent les formules
  (`= + - @`) issues d'entrées joueur
- **Turnstile** anti-bot optionnel sur le spin (opt-in par clés d'env)
- **Journal d'audit** (`audit_logs`) des actions sensibles : validation de
  gain, synchronisation d'abonnement, création d'établissement
- Purge des compteurs de rate limiting : `select public.prune_rate_limits();`
  (planifiable via un cron Supabase)
