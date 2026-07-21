# Architecture — LastChance

LastChance est un SaaS multi-tenant de gamification pour commerces. Le dépôt
contient l'application produit principale et un site marketing autonome.

## Vue d'ensemble

```text
Joueur anonyme                 Commerçant authentifié          Administrateur
      │                                 │                            │
      ▼                                 ▼                            ▼
 /play/[slug], /pronos/[slug]   /dashboard/*                  /admin/*
      │                                 │                    (hôte dédié)
      │ Server Actions                  │ Server Components          │
      │ + contexte public               │ + Server Actions           │
      ▼                                 ▼                            ▼
 service-role bornée           client Supabase SSR/RLS        RBAC admin
      └──────────────────────────────┬───────────────────────────────┘
                                     ▼
                         Supabase Auth + PostgreSQL
                                     │
                  ┌──────────────────┼───────────────────┐
                  ▼                  ▼                   ▼
                Stripe            Resend          Sentry/PostHog
```

## Applications du dépôt

- Racine : application Next.js 16 (produit, API, dashboard et back-office).
- `site/` : site marketing Next.js autonome (accueil, tarifs, FAQ, contact,
  sitemap et robots), avec son propre cycle de dépendances et de déploiement.

## Structure du code principal

```text
src/
├── app/
│   ├── (auth)/                     # login, signup, OAuth, invitations
│   ├── onboarding/                 # création du premier établissement
│   ├── dashboard/                  # espace commerçant protégé
│   ├── play/[slug]/                # expérience joueur publique, ISR 30 s
│   ├── pronos/[slug]/              # championnat public, rendu par joueur
│   │   └── tv/                     # classement plein écran pour affichage boutique
│   ├── poster/[id]/                # affiche imprimable
│   ├── newsletter/unsubscribe/     # désinscription par jeton signé
│   ├── admin/                       # back-office interne avec RBAC
│   └── api/
│       ├── scan/                   # comptage des scans hors cache ISR
│       ├── stripe/webhook/         # synchronisation des abonnements
│       ├── pronos/[slug]/tv/       # classement TV public en JSON, sans PII
│       ├── cron/reengage/          # relance marketing automatique
│       ├── cron/purge-data/        # rétention RGPD
│       ├── cron/jobs/              # worker de la file de travaux (ADR-015)
│       ├── cron/sync-contests/     # synchronisation des résultats sportifs
│       ├── cron/webhooks/          # reprise des webhooks sortants (filet)
│       ├── cron/automations/       # scénarios marketing quotidiens (09:30)
│       └── health/                 # santé process + base
├── actions/                        # mutations métier (Server Actions)
├── components/
│   ├── dashboard/                  # éditeurs et vues commerçant
│   ├── wheel/                      # roue, grattage et parcours de gain
│   ├── pronos/                     # inscription, espace joueur à onglets, grilles
│   ├── admin/                      # composants du back-office
│   └── ui/                         # primitives partagées
├── lib/
│   ├── supabase/                   # browser, SSR/RLS et service-role
│   ├── admin/                      # authentification, données et audit admin
│   ├── validations/                # schémas Zod par domaine
│   ├── active-organization.ts      # sélection déterministe du tenant courant
│   ├── play-context.ts             # contexte public QR → campagne → roue
│   ├── pronostics-context.ts       # contexte public championnat → joueur
│   ├── public-resource-guards.ts   # invariants inter-tenant service-role
│   ├── spin.ts                     # tirage, empreinte et jetons HMAC
│   ├── rate-limit.ts               # Upstash avec repli PostgreSQL
│   ├── automations.ts              # scénarios marketing : ciblage et envoi dédupliqué
│   ├── subscription.ts             # essai, abonnement et grâce past_due
│   └── webhooks.ts                 # événements sortants signés
├── proxy.ts                        # session, domaines et routes protégées
└── types/
    ├── database.ts                 # miroir TypeScript maintenu à la main (migration progressive)
    └── database.generated.ts       # snapshot `npm run types:generate` + garde CI anti-dérive

supabase/migrations/                # source de vérité SQL, appliquée dans l'ordre
```

## Frontières d'exécution

### Espace commerçant

Les Server Components et Server Actions créent un client Supabase SSR avec la
session utilisateur. Toutes les requêtes métier sont soumises aux politiques
RLS. Les mutations filtrent aussi par `organization_id` afin de rendre le tenant
visé explicite dans le code.

Un utilisateur peut appartenir à plusieurs organisations. Le tenant actif est
stocké dans le cookie serveur `lc-active-organization`. Ce cookie est une simple
préférence : `getUserAndOrg()` recharge toutes les appartenances visibles sous
RLS et ne l'honore que si l'utilisateur est toujours membre. Sans cookie valide,
l'appartenance la plus ancienne est choisie de manière déterministe. Le
dashboard affiche un sélecteur dès que plusieurs établissements sont disponibles.

### Parcours joueur public

L'anon key n'a aucun accès aux tables métier. Le rendu et les Server Actions
publics utilisent la service-role uniquement côté serveur. Comme elle contourne
la RLS, deux niveaux de contrôle sont obligatoires :

1. Validation de toutes les entrées publiques (Zod, format du slug ou jeton
   signé selon le point d'entrée).
2. Vérification de la chaîne de ressources par `public-resource-guards.ts` :
   QR, campagne, organisation, roue, lot et spin doivent partager les mêmes
   identifiants de tenant et relations métier.

Les requêtes service-role publiques sélectionnent seulement les colonnes utiles.
Les incohérences de chaîne retournent un message générique et sont journalisées,
sans révéler l'existence d'une ressource d'un autre tenant.

Côté accessibilité, l'animation de la roue respecte `prefers-reduced-motion` :
la durée du spin est réduite à la source (300 ms, un tour, easing linéaire)
sans modifier le tirage serveur.

### Back-office administrateur

Le back-office `/admin` possède sa propre table d'utilisateurs autorisés, son
RBAC et ses journaux d'audit. En production, `ADMIN_HOSTS` permet de le servir
sur un domaine dédié ; le proxy retourne 404 pour `/admin` sur le domaine client
et ne sert que le back-office sur le domaine administrateur.

## Modèle de données

```text
organizations
├── organization_members ── team_invitations
├── campaigns                # + auto_schedule, budget_cents, budget_spent_cents, paused_reason
│   ├── wheels
│   │   ├── prizes           # + cost/value_cents, low_stock_threshold
│   │   └── spins
│   ├── qr_codes
│   └── participations
├── newsletter_subscribers ── newsletter_campaigns
│                            # + birth_date (présence = consentement anniversaire)
├── contests
│   ├── contest_matches
│   ├── contest_players
│   ├── contest_predictions
│   └── contest_leagues ── contest_league_members
├── automation_settings      # les 4 scénarios marketing (lecture membres, écriture éditeurs)
├── email_log                # anti-doublon des emails de scénario (dedup_key unique, lecture propriétaire)
├── audit_logs
└── configuration : branding, rétention, notifications et webhooks

admin_users ── admin_audit_logs
stripe_events
rate_limits
jobs · ops_metrics
```

Toutes les tables métier portent `organization_id`. Les fonctions
`is_org_member()` et `is_org_owner()` centralisent les politiques RLS. Les RPC
`create_organization`, `perform_atomic_spin`, `claim_winning_spin`,
`submit_contest_prediction`, `contest_leaderboard` (classement agrégé,
politique d'ex æquo et pagination calculés en base), `contest_player_rank`,
`create/join/leave_contest_league`, `finalize_contest`
(clôture : palmarès figé + récompenses avec codes de retrait),
`run_campaign_schedule` (bascule programmée des campagnes),
`check_rate_limit`, les RPC de ciblage marketing (service-role :
won_not_redeemed, inactive, post_redemption, birthday) et les RPC
d'agrégation assurent les opérations qui
doivent être atomiques, tenir la charge ou masquer des données internes.
Le règlement d'un championnat (barème, récompenses, statut, question
subsidiaire) est gelé dès le premier pronostic : corrections uniquement
motivées et journalisées, plus rien après clôture (ADR-013).

Une campagne peut avoir plusieurs roues. `selectActiveWheel()` choisit la roue
applicable selon sa position et son planning (heures et jours). Une roue peut
utiliser la mécanique classique ou la carte à gratter.

Le module Pronostics est un addon d'organisation. Les Server Actions publiques
ne reçoivent jamais de droit SQL direct : elles utilisent une identité joueur
en cookie HTTP-only, puis `submit_contest_prediction()` verrouille le match et
revalide son coup d'envoi dans la transaction. La saisie d'un résultat et le
recalcul d'un barème sont également atomiques. Les coordonnées et grilles ne
sont lisibles que par le propriétaire ; les prénoms seuls alimentent le
classement public consenti.

Trois extensions du module (2026-07-21) :
- **Ligues privées** : un joueur crée une ligue (code d'invitation), la
  rejoint ou la quitte via les RPC `create/join/leave_contest_league`,
  toujours sous identité cookie, avec erreurs génériques et rate limits
  dédiés (création 5/h par joueur, jonction 10/10 min par IP, fail-closed).
  `contest_leaderboard` et `contest_player_rank` acceptent `p_league_id` :
  les rangs sont re-numérotés 1..n au sein de la ligue, y compris après
  clôture (ADR-020).
- **Mode TV** : `/pronos/[slug]/tv` projette le classement plein écran en
  boutique (polling 45 s tolérant aux pannes, rotation 12 lignes/12 s).
  La route JSON `GET /api/pronos/[slug]/tv` sert le top 30 sans PII
  (prénoms seuls), `s-maxage=30`, `noindex`, 404 générique, rate limit
  30/min par IP volontairement fail-open (ADR-022).
- **Saisie en lot** : `addContestMatches` accepte 1 à 30 matchs en une
  transaction tout-ou-rien, avec erreurs rapportées par index de ligne.

## Flux du spin et du gain

1. `loadPlayContext(slug)` charge QR, campagne, organisation, roues et lots en
   un aller-retour PostgREST.
2. La cohérence inter-tenant, l'accès d'abonnement, le statut et les dates de la
   campagne, puis le planning de la roue sont vérifiés côté serveur.
3. `spinWheel()` contrôle Turnstile et les limites IP/appareil, sans demander
   de renseignement personnel.
4. `perform_atomic_spin()` verrouille la fenêtre de jeu, tire avec une source
   cryptographique, réserve le stock et insère le spin dans une transaction.
   Les poids ne sont jamais envoyés au navigateur.
5. Un gain reçoit un jeton HMAC de 15 minutes contenant uniquement l'id du spin.
6. `claim_winning_spin()` verrouille le spin et insère participation, code,
   opt-in newsletter, audit et outbox webhook dans une transaction. Si la
   campagne porte un budget, le coût du lot y est imputé atomiquement ; à
   l'atteinte, la campagne est mise en pause (ADR-018).
7. Email, notification commerçant et Google Wallet restent des effets
   secondaires après l'enregistrement ; les webhooks sont repris par cron.

## Facturation et accès

Stripe Checkout crée l'abonnement. Le webhook vérifie la signature, relit
l'abonnement courant puis applique idempotence, ordre et statut dans une seule
transaction PostgreSQL.

- `trialing` : accès tant que l'essai applicatif n'est pas expiré.
- `active` : accès complet.
- `past_due` : grâce applicative bornée à 14 jours.
- `canceled` ou `inactive` : dashboard consultable, jeux publics désactivés.

La décision d'autorité est reprise à chaque spin ; le cache ISR de la page
publique ne peut donc pas réactiver une campagne ou un abonnement invalide.

## Automatisations commerçant

Livrées le 2026-07-21, réglées depuis `/dashboard/settings/automations`
(accès owner + editor) et la carte « Programmation et budget » des campagnes.

### Cycle budget, programmation et stock

- **Budget de gains** : `campaigns.budget_cents` / `budget_spent_cents`.
  L'imputation a lieu dans `claim_winning_spin` (coût du lot) ; à l'atteinte,
  pause automatique (`paused_reason = budget_reached`), job
  `automation.budget-paused` (email au commerçant) et bouton « Relancer »
  (`resumeCampaignAfterBudget`, garde owner/editor — le compteur n'est
  jamais remis à zéro). Un léger dépassement d'un lot est accepté par design
  (ADR-018).
- **Programmation** : si `campaigns.auto_schedule`, la RPC
  `run_campaign_schedule()` active/pause la campagne selon
  `starts_at`/`ends_at`. Elle est appelée par pg_cron en SQL direct toutes
  les 10 minutes (pas d'aller-retour HTTP).
- **Alerte stock** : `prizes.low_stock_threshold` + trigger
  `prizes_low_stock_watch` qui dépose un job `automation.low-stock`
  (email commerçant) et se réarme au restock.

### Les 4 scénarios marketing

Configurés dans `automation_settings` (RLS : lecture membres, écriture
éditeurs ; défauts Zod : minAgeHours 48, paliers [30, 60], delayHours 24),
orchestrés par le job `automation.run-scenarios` (settle
completed/partial/retry). Le cron Vercel quotidien `/api/cron/automations`
(09:30) dépose un job par organisation, idempotent par jour
(`automations:{org}:{date}`). Chaque envoi est journalisé dans `email_log`
dont la `dedup_key` unique garantit qu'un même rappel ne part qu'une fois :

| Scénario | Classement | dedup_key |
|---|---|---|
| `won_not_redeemed` | transactionnel (code de retrait du joueur) | `wnr:{participation_id}` |
| `inactive` (paliers 30/60 j) | marketing, List-Unsubscribe | `inactive:{days}:{email}` |
| `post_redemption` | marketing, List-Unsubscribe | `postredeem:{participation_id}` |
| `birthday` | marketing, List-Unsubscribe | `birthday:{email}:{année fuseau org}` |

Le ciblage passe par 4 RPC service-role dédiées ; les anniversaires sont
calculés dans le fuseau de l'organisation (29/02 → fêté le 28/02).

**Chevauchement connu** : le cron de réengagement historique
(`auto_reengage`, refroidissement 30 j) et le scénario `inactive` sont
indépendants — une organisation activant les deux peut doubler des
relances. Un avertissement est affiché dans l'UI ; l'arbitrage produit
reste ouvert (ADR-021).

### Consentement anniversaire

`claimPrize` accepte `birthdayOptIn` + `birthDate` : la date n'est
persistée dans `newsletter_subscribers.birth_date` que si l'opt-in
marketing ET la case anniversaire dédiée ET un email sont présents
(âge 13..120). La présence de `birth_date` vaut consentement explicite
au scénario `birthday` (ADR-019).

## CRM, consentement et rétention

- Aucune action sociale, aucun avis et aucune coordonnée ne conditionnent le
  tirage. Les campagnes choisissent seulement les données nécessaires après gain.
- L'opt-in marketing alimente `newsletter_subscribers` avec désinscription par
  jeton signé.
- Le cron de réengagement cible les abonnés selon un délai de refroidissement.
- Le cron de purge applique la durée de conservation configurée par organisation,
  y compris aux joueurs et grilles de pronostics et au journal `email_log`.
- Les exports CSV neutralisent les préfixes de formules.
- Les webhooks commerçants sont signés par HMAC et repris depuis une file
  durable si le destinataire est indisponible.

## Observabilité et validation

- Sentry est optionnel et devient un no-op sans configuration.
- PostHog est optionnel pour les événements navigateur.
- `/api/health` vérifie le process et une requête minimale vers la base.
- `audit_logs` trace les opérations commerçant sensibles ;
  `admin_audit_logs` trace les actions du back-office.
- Vitest couvre les services métier et les frontières de sécurité.
- Playwright couvre les parcours réels (joueur, caisse/scanner, pronostics,
  rôles, webhooks Stripe, newsletter) en CI, contre l'app buildée sur un
  Supabase local seedé et des stubs Stripe/Resend locaux, sur trois projets
  navigateurs (mobile Chrome, mobile Safari, smoke desktop).

Commandes de validation : `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build` et, après démarrage de la stack locale (Docker :
`supabase start` + seed, puis `npm run build` et `npm start`),
`npm run test:e2e`.
