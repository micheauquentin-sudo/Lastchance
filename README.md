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
3. Renseigner dans `.env.local` : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. Auth → URL Configuration : ajouter `{APP_URL}/auth/confirm` aux
   Redirect URLs (emails de confirmation)

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

### 5. PostHog (optionnel)

`NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (EU par défaut).

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
| `npm run typecheck` | TypeScript seul                         |

## Architecture

Voir [docs/architecture.md](docs/architecture.md) pour le schéma complet
(base de données, flux, sécurité) et [docs/decisions.md](docs/decisions.md)
pour les décisions d'architecture (ADR).

**Parcours joueur** : scan QR → `/play/[slug]` → spin (résultat calculé
côté serveur, limite de jeu par empreinte pseudonymisée) → formulaire
(prénom, email, CGU obligatoires, opt-in marketing séparé) → code de
retrait + email.

**Espace commerçant** : `/dashboard` — campagnes, roue (lots, poids,
stocks), QR codes imprimables, participations (validation des gains,
export CSV), statistiques, abonnement Stripe.

## Sécurité

- RLS activée sur toutes les tables, isolation par `organization_id`
- La page publique ne reçoit jamais les probabilités des lots
- Résultat du spin signé HMAC (15 min) — infalsifiable côté client
- Limite de jeu vérifiée **au spin** (pas au formulaire)
- Consentement CGU exigé par contrainte SQL (`CHECK accepted_terms`)
- Pas de PII brute dans les identifiants joueurs (SHA-256 salé)
- Webhooks Stripe : signature vérifiée + idempotence en base
