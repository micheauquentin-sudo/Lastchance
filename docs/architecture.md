# Architecture — LastChance

> **Ce document ne porte plus d’état de livraison.** Quatre modules y ont été
> décrits comme « NON POUSSÉ / NON DÉPLOYÉ » alors qu’ils tournaient en
> production — un statut écrit à la main dans un document d’architecture est
> vrai le jour où on l’écrit et faux la semaine suivante. Pour l’état réel :
> `docs/roadmap.md`, et `EXPECTED_MIGRATION` dans `src/lib/release.ts`.

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
│   ├── hunt/[token]/               # étape de chasse au trésor publique (scan → tampon)
│   ├── passeport/[programId]/      # passeport de fidélité joueur (visites, niveau, paliers, spin offert)
│   ├── jackpot/[id]/               # cagnotte collective suivable (jauge partagée temps réel, PWA installable)
│   ├── event/[code]/               # mode événement live : téléphone joueur + /screen (écran public)
│   ├── calendar/[slug]/            # calendrier de l'Avent suivable (cases temporisées, PWA installable)
│   ├── quiz/[slug]/                # quiz public en libre-service (questions une par une, chronomètre serveur)
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
│       ├── cron/jackpot-draws/      # tirages à date du jackpot collectif (run_jackpot_date_draws)
│       ├── cron/calendar-reminders/ # rappel quotidien opt-in + archivage (calendrier de l'Avent)
│       └── health/                 # santé process + base
├── actions/                        # mutations métier (Server Actions)
├── components/
│   ├── dashboard/                  # éditeurs et vues commerçant
│   ├── wheel/                      # roue, grattage et parcours de gain
│   ├── pronos/                     # inscription, espace joueur à onglets, grilles
│   ├── hunts/                      # parcours joueur de chasse (carnet, tampons)
│   ├── loyalty/                    # passeport joueur (tampons, niveau, paliers, roue offerte)
│   ├── jackpot/                    # page suivable de la cagnotte (jauge temps réel, états de tirage)
│   ├── calendar/                   # calendrier joueur (grille de cases, thèmes carton, tour offert)
│   ├── quiz/                       # quiz joueur (7 modèles de question, chronomètre, correction, classement)
│   ├── admin/                      # composants du back-office
│   └── ui/                         # primitives partagées
├── lib/
│   ├── supabase/                   # browser, SSR/RLS et service-role
│   ├── admin/                      # authentification, données et audit admin
│   ├── validations/                # schémas Zod par domaine
│   ├── active-organization.ts      # sélection déterministe du tenant courant
│   ├── campaign-templates.ts       # catalogue Lastchance (10 modèles) + blueprint → brouillon (module pur)
│   ├── play-context.ts             # contexte public QR → campagne → roue
│   ├── pronostics-context.ts       # contexte public championnat → joueur
│   ├── hunt-context.ts             # contexte public étape → chasse → joueur
│   ├── loyalty-context.ts          # contexte public passeport → programme → membre
│   ├── jackpot-context.ts          # contexte public page suivable → campagne → joueur
│   ├── calendar-context.ts         # contexte public calendrier → organisation → joueur
│   ├── referral-context.ts         # contexte public parrainage (parrain/filleul) sur la roue
│   ├── quiz-context.ts             # contexte public quiz → organisation → joueur (cookie en lecture seule)
│   ├── public-resource-guards.ts   # invariants inter-tenant service-role
│   ├── spin.ts                     # tirage, empreinte et jetons HMAC
│   ├── rate-limit.ts               # Upstash avec repli PostgreSQL
│   ├── automations.ts              # scénarios marketing : ciblage et envoi dédupliqué
│   ├── subscription.ts             # essai, abonnement et grâce past_due
│   └── webhooks.ts                 # événements sortants signés
├── proxy.ts                        # session, domaines et routes protégées
├── platform/
│   └── experiences/                # contrat, catalogue, droits et adaptateurs communs
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

Les parcours publics Pronostics (`/pronos/[slug]`), Chasse au trésor
(`/hunt/[token]`), Passeport de fidélité (`/passeport/[programId]`) et Jackpot
collectif (`/jackpot/[id]`) appliquent le même modèle via
`pronostics-context.ts`, `hunt-context.ts`, `loyalty-context.ts` et
`jackpot-context.ts` : identité joueur en cookie HTTP-only (seul le hash SHA-256
du jeton touche la base, aucune PII à l'inscription), résolution service-role
avec gardes inter-tenant, et écritures uniquement par RPC atomiques dédiées.

Une identité pseudonyme commune complète désormais ce modèle sans le remplacer.
Le cookie HTTP-only `lc-player` contient un jeton opaque de 256 bits ; seule son
empreinte SHA-256 salée et séparée par domaine atteint les tables internes
`players` / `player_devices`. Après une entrée publique validée (check-in) ou une
écriture métier réussie, les parcours roue (standard et skill-gated), chasse,
fidélité, jackpot, événement live, calendrier et quiz appellent en best-effort
`resolve_player_identity` : la RPC crée les adhésions organisation/expérience et
relie le hash de l'ancien cookie dans `player_legacy_identities`. Les tables et
cookies historiques restent la source de vérité de la progression pendant la
transition ; une panne du pont central ne bloque donc jamais un spin, un tampon,
une participation ou un join.

Ces tables centrales sont RLS et `service_role`-only : ni `anon`, ni un membre
marchand authentifié ne peut corréler un joueur entre deux organisations. Chaque
adhésion d'expérience est validée en base contre l'organisation de sa ressource,
et une origine QR facultative possède une FK composite tenant. Les devices sont
rotés après 90 jours avec cinq minutes de grâce, sans stocker aucun jeton brut.
La récupération nominative n'est pas activée : aucun lien magique ni endpoint de
liaison n'est simulé sans fournisseur d'identité joueur. Le modèle n'accepte un
futur `auth_user_id` que si une version et une date de consentement explicite
sont présentes. Pronostics conserve son chantier d'identité séparé ; le
parrainage hérite aujourd'hui du lien de la campagne roue et n'a pas encore sa
propre adhésion centrale.

**Rate limiting — principe transverse (ADR-032).** Dans tout parcours PUBLIC,
aucun seau `failClosed` n'est posé sur une clé PARTAGÉE entre utilisateurs (IP,
programme, organisation) : un tel seau est un interrupteur de déni de service
actionnable par n'importe qui derrière le même Wi-Fi de commerce ou le même
CGNAT. Une clé partagée ne porte qu'un seau LARGE et fail-OPEN, à valeur
d'observabilité (`reportSecurityEvent`), jamais de refus ; le `failClosed` n'est
admis que sur une clé propre à UNE identité (cookie, jeton, gain) ou à UN
opérateur authentifié (`user.id`), et aucun seau n'est consommé AVANT la
vérification du jeton ou du cookie qui identifie l'appelant. La sécurité repose
alors sur l'entropie des jetons, les bornes par identité et les bornes
économiques, pas sur l'étranglement de clés partagées. Dette connue restante,
hors périmètre et sans impact argent ni multi-tenant (disponibilité seule) :
`hunt:scan:ip`, `hunt:claim:ip`, la famille `prono:*` et `spin:ip`
(docs/bugs.md).

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
players
├── player_devices                    # hashes de lc-player, rotation/révocation
├── player_organization_memberships   # présence interne par tenant
└── player_experience_memberships     # scope métier strict
    └── player_legacy_identities      # pont vers les hashes/cookies historiques

organizations
├── organization_members ── team_invitations
├── campaigns                # + auto_schedule, budget_cents, budget_spent_cents, paused_reason
│   ├── wheels               # game_type = registre des mécaniques (roue/grattage + 13 jeux rapides) ; skill_config jsonb (défis skill-gated, secrets server-only)
│   │   ├── prizes           # + cost/value_cents, low_stock_threshold
│   │   └── spins
│   ├── qr_codes
│   └── participations
├── newsletter_subscribers ── newsletter_campaigns
│                            # + birth_date (présence = consentement anniversaire)
├── contests                  # addon Pronostics — événement générique : event_kind (modèle, défaut football), default_locks_at, scoring jsonb (paliers par type)
│   ├── contest_matches       # REGISTRE DE QUESTIONS : question_type score/choice/ranking/number, prompt, options, correct_answer, ranking_size, locks_at (+ colonnes football home_*/away_*/kickoff_at pour le type score)
│   ├── contest_players
│   ├── contest_predictions   # scores NULLABLE (football) + answer jsonb (réponses génériques)
│   └── contest_leagues ── contest_league_members
├── hunts                     # addon Chasse au trésor (2..10 étapes, lot direct)
│   ├── hunt_steps            # une étape = un QR (jeton public non devinable)
│   ├── hunt_players          # cookie HTTP-only, hash du jeton (aucune PII)
│   ├── hunt_scans            # tampons (unique joueur × étape)
│   └── hunt_completions      # code de retrait CHASSE-… (remise en caisse)
├── loyalty_programs          # addon Passeport (2 modes de validation, niveaux, secret code tournant service-role-only)
│   ├── loyalty_milestones    # paliers : lot direct (FIDELITE-…) OU tour de roue offert (target_wheel_id)
│   ├── loyalty_members       # passeport : cookie HTTP-only, hash du jeton (aucune PII)
│   ├── loyalty_stamps        # journal des visites validées (cooldown, pas d'unicité SQL)
│   └── loyalty_rewards       # palier gagné : code FIDELITE-… (lot) ou grant_token (spin offert)
├── jackpot_campaigns         # addon Jackpot (jauge PARTAGÉE current_count, 2 modes de validation, 3 modes de tirage, stock fini obligatoire)
│   ├── jackpot_players       # cookie HTTP-only, hash du jeton (aucune PII)
│   ├── jackpot_participants  # journal des participations validées (cooldown, +1 sur la jauge)
│   └── jackpot_wins          # gain : code JACKPOT-…, draw_seed journalisé, unique(campaign_id, cycle)
├── event_games               # addon Événement live — CONTENU réutilisable (jeu de questions)
│   └── event_questions ── event_question_options  # quiz/poll/prono ; is_correct RPC/service-role seulement
├── event_sessions            # RUN live : machine à états (phase), current_question_started_at (scoring serveur), stock fini EVENT-
│   ├── event_players         # pseudo + avatar, cookie HTTP-only + hash
│   ├── event_answers         # réponse immuable, elapsed_ms serveur, unique(session, question, player)
│   └── event_wins            # podium : code EVENT-…, remis en caisse
├── calendars                 # addon Calendrier (cases temporisées, 5 thèmes, stock fini obligatoire, PWA)
│   ├── calendar_days         # une case : kind content/lot/spin, unlock_at dérivé serveur (source de vérité du gating)
│   ├── calendar_players      # cookie HTTP-only, hash du jeton (aucune PII), opt-in rappel
│   ├── calendar_openings     # journal des cases ouvertes (unique joueur × case) ; case-lot → code CADEAU-…
│   └── calendar_rewards      # récompense d'assiduité : code CADEAU-… (toutes cases ouvertes)
├── referral_programs         # addon Parrainage (opt-in par campagne roue, 3 versements config libre, stock fini obligatoire)
│   ├── referral_sponsors     # parrain : device sponsor_key, code partageable PR-…, jauge partagée validated_count, coffre
│   ├── referral_signups      # filleul validé : proof_spin_id (spin réel), unique device × campagne
│   └── referral_rewards      # versement émis : code PARRAIN-… (lot) ou spin_grant_token (tour offert)
├── campaign_templates       # modèles de campagne PRIVÉS (blueprint jsonb ≤ 32 Ko, nom unique par org, ÉDITEURS seuls en lecture comme en écriture) ; le catalogue des 10 modèles Lastchance vit EN CODE
├── quizzes                   # addon Quiz (libre-service ASYNCHRONE, 7 thèmes, 5 modes de récompense, stock fini obligatoire dès qu'un mode émet)
│   ├── quiz_questions        # question_type choice/number/ranking/text (LE MOTEUR) + preset (LE MODÈLE D'UI, 7 modèles) ; correct_answer jamais servie avant réponse, time_limit_seconds et image_url transversaux
│   ├── quiz_players          # cookie HTTP-only, hash du jeton, prénom + avatar ; email seulement sur opt-in
│   ├── quiz_answers          # réponse IMMUABLE (unique joueur × question), started_at et elapsed_ms posés SERVEUR, trigger de gel
│   └── quiz_rewards          # lot émis : code QUIZ-… (caisse) ou grant_token (tour de roue offert) ; unique(quiz_id, player_id)
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
`submit_contest_prediction` (question `score`), `submit_contest_answer`
(questions génériques `choice`/`ranking`/`number`), `set_contest_question_result`,
`update_contest_generic_scoring`, `update_contest_event_settings` (modèle et
verrouillage par défaut, motif audité), `contest_leaderboard` (classement agrégé,
politique d'ex æquo et pagination calculés en base), `contest_player_rank`,
`create/join/leave_contest_league`, `finalize_contest`
(clôture : palmarès figé + récompenses avec codes de retrait),
`run_campaign_schedule` (bascule programmée des campagnes),
`record_hunt_scan` (scan de chasse atomique sous verrou : tampon idempotent,
ordre, délai, complétion + code de retrait et stock),
`redeem_hunt_completion` (remise du lot de chasse en caisse),
`record_loyalty_stamp` (tampon de fidélité atomique sous verrou du programme :
validation du mode, cooldown, niveau, paliers → lot ou grant de spin),
`current_loyalty_code` (code type TOTP courant pour l'écran comptoir),
`consume_loyalty_spin_grant` (échange d'un grant à usage unique contre un
tirage sur la roue cible), `redeem_loyalty_reward` (remise du lot de fidélité
en caisse), `record_jackpot_participation` (participation collective atomique
sous verrou de campagne : validation du mode, cooldown, +1 sur la jauge
partagée, tirage selon le mode), `run_jackpot_date_draws` (tirages à date via
pg_cron), `current_jackpot_code` (code type TOTP pour l'écran comptoir),
`redeem_jackpot_prize` (remise du lot de jackpot en caisse),
`open_calendar_box` (ouverture d'une case, gating temporel serveur-autoritatif :
`now()` base vs `unlock_at` dérivé serveur), `join_calendar`,
`consume_calendar_spin_grant` (grant d'un tour offert → tirage sur la roue cible),
`calendar_public_state` (état public sans le contenu des cases non ouvertes),
`redeem_calendar_reward` (remise du lot de calendrier en caisse),
`ensure_referral_sponsor` (parrain + code partageable `PR-…`), `validate_referral`
(parrainage validé par un spin RÉEL du filleul, cœur anti-abus),
`consume_referral_spin_grant` (grant d'un tour offert → tirage sur la roue de la
campagne), `redeem_referral_reward` (remise du lot de parrainage en caisse),
`check_rate_limit`, les RPC de ciblage marketing (service-role :
won_not_redeemed, inactive, post_redemption, birthday) et les RPC
d'agrégation assurent les opérations qui
doivent être atomiques, tenir la charge ou masquer des données internes.
Le règlement d'un championnat (barème, récompenses, statut, question
subsidiaire) est gelé dès le premier pronostic : corrections uniquement
motivées et journalisées, plus rien après clôture (ADR-013).

Une campagne peut avoir plusieurs roues. `selectActiveWheel()` choisit la roue
applicable selon sa position et son planning (heures et jours). La mécanique de
présentation d'une roue est portée par `wheels.game_type` — roue classique, carte
à gratter et 13 jeux rapides (révélation ou défi *skill-gated*) partagent le même
moteur de tirage et de gain (voir « Module Jeux rapides »).

Le module Pronostics est un addon d'organisation. Les Server Actions publiques
ne reçoivent jamais de droit SQL direct : elles utilisent une identité joueur
en cookie HTTP-only, puis `submit_contest_prediction()` / `submit_contest_answer()`
verrouillent la question et revalident son échéance dans la transaction. La
saisie d'un résultat et le recalcul d'un barème sont également atomiques. Les
coordonnées et grilles ne sont lisibles que par le propriétaire ; les prénoms
seuls alimentent le classement public consenti.

**Moteur générique (2026-07-24, ADR-038)** : le module
n'est plus football-centré. Un championnat est un ÉVÉNEMENT
(`contests.event_kind`) et `contest_matches` est un REGISTRE DE QUESTIONS typées :
- **4 types** — `score` (deux camps, le football historique inchangé), `choice`
  (choix unique), `ranking` (ordre d'un top N), `number` (estimation) ;
- **verrouillage par question**, avec date par défaut au niveau de l'événement.
  Règle appliquée par les 4 fonctions SQL concernées (`contest_is_locked`,
  `submit_contest_prediction`, `submit_contest_answer`,
  `set_contest_question_result`) et par son miroir TS `effectiveLocksAt` :
  `score → coalesce(locks_at, kickoff_at)` et
  `générique → coalesce(locks_at, default_locks_at, kickoff_at)`. Le football
  IGNORE la date par défaut : ses matchs n'ont pas de `locks_at`, leur fenêtre
  reste le coup d'envoi — seul champ que la synchro met à jour, donc le seul qui
  suive les reports de calendrier ;
- **barème par type** calculé en SQL (`contest_generic_points`,
  `contest_scoring_points`), clés de `contests.scoring` : `choice`,
  `ranking_exact`, `ranking_partial`, `number_exact`, `number_close`,
  `number_tolerance` (défauts appliqués au calcul, jamais réécrits sur un
  championnat football) ; `src/lib/pronostics.ts` en tient un miroir testé ;
- **non-fuite du résultat** : `publicCorrectAnswer` est le point de sérialisation
  UNIQUE de la bonne réponse — rien ne sort tant que la question n'est pas
  `finished` ;
- **modèles préconfigurés** (`src/components/dashboard/contest-event-kinds.ts`) :
  `football` + 10 modèles (`ceremony`, `eurovision`, `election`, `remise_prix`,
  `entreprise`, `culinaire`, `emission`, `tournoi`, `course`, `esport`) +
  `custom`. Catalogue d'INTERFACE — la base ne contraint que la forme de la clé,
  ajouter un modèle ne demande aucune migration. Un modèle propose des questions
  brouillon et un barème conseillé, n'écrit jamais en base et ne fournit AUCUNE
  option factice (candidats, nommés, équipes restent saisis par le commerçant) ;
- **synchro fournisseur réservée au football** : `syncContestFixtures` n'est
  déclenchée que sous double verrou (`event_kind` = `football` ET compétition du
  catalogue).

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

**Encaissement du lot en caisse (2026-07-25, ADR-043)** : `finalize_contest`
posait déjà un code `PRONO-…` dans `contest_awards.code`, mais la caisse ne le
connaissait pas — le seul chemin de remise, `set_contest_award_status`, exige
`is_org_editor`. Les pronostics deviennent la **9e source** du module de caisse
(migration `20260804120000`) :
- **une seule colonne de vérité** — `delivered_at` est renommée `redeemed_at`
  (alignement sur `quiz_rewards`), accompagnée de `redeemed_by`, `basket_cents`
  et `redeem_expires_at`, avec le CHECK
  `(status = 'delivered') = (redeemed_at is not null)` qui rend l'état
  incohérent impossible pour les DEUX chemins d'écriture ;
- **RPC dédiée `redeem_contest_award`** (`service_role` seule, `authenticated` et
  `anon` révoqués) : atomique, idempotente, auditée (`contest.award.redeem`,
  `actor` obligatoire), deny-by-default (`status = 'pending'`), et
  **indistinguable** pour un code inconnu comme pour un code d'une autre
  organisation. L'`UPDATE` **et** la lecture finale exigent que `contests` et
  `contest_players` appartiennent aussi à l'organisation qui encaisse — le nom du
  championnat et le prénom du gagnant sont affichés au comptoir ;
- **expiration serveur** — `contests.code_ttl_seconds` (nullable, réglé en jours
  par le commerçant) est borné **1 h à 90 j**, volontairement différent des
  10 s–600 s de `campaigns.code_ttl_seconds` : le décompte part de la clôture du
  championnat, pas d'un joueur déjà devant la caisse. L'échéance est figée à
  l'émission par trigger et **vérifiée par la RPC** (une capture d'écran ne
  suffit pas) ;
- **deux chemins, deux ACL** — la caisse passe par `redeem_contest_award`,
  l'éditeur garde `set_contest_award_status` pour l'annulation motivée et la
  remise depuis le dashboard (laquelle, elle, ne teste pas l'expiration : le TTL
  protège le commerçant, c'est lui qui en déroge).

## Encaissement en caisse — les 9 sources

`/dashboard/redeem` est un point de lecture UNIQUE : `lookupRedeemCode` normalise
la saisie, la route par TYPE de code et renvoie un `CashierMatch` discriminé.
Neuf familles au 2026-07-25 — `GAIN-` (roue, `source: 'wheel'`), `CHASSE-`
(`hunt`), `FIDELITE-` (`loyalty`), `JACKPOT-` (`jackpot`), `EVENT-` (`event`),
`CADEAU-` (`calendar`), `PARRAIN-` (`referral`), `QUIZ-` (`quiz`) et `PRONO-`
(`contest`). Chaque source garde sa **RPC de remise dédiée** (atomique, auditée,
org-scopée) : la lecture est unifiée, l'écriture ne l'est pas — un lot de chasse,
un tampon de fidélité et un lot de championnat n'ont ni le même cycle de vie ni
les mêmes garde-fous. Une saisie **nue** (8 caractères sans préfixe) est essayée
dans l'ordre du routage et résout vers les pronostics avant le repli roue.
Résidu connu : chaque famille consomme son propre jeton `cashier:lookup`, donc
une saisie nue en consomme 9 (docs/bugs.md, correctif écrit non commité).

## Module Chasse au trésor

Livré le 2026-07-22, addon d'organisation `addon_hunts` (miroir exact
d'`addon_pronostics`, activé depuis le back-office admin, gating
`hasHuntsAccess`). Une chasse est un parcours de 2 à 10 QR codes (étapes),
ordre libre ou imposé, fenêtre de dates optionnelle, indice optionnel
révélé après chaque étape. V1 mono-organisation (ADR-027).

Comme Pronostics, le parcours public n'a aucun droit SQL : l'identité
joueur est un cookie HTTP-only propre à la chasse (`lc-hunt-{id}`), seul le
hash SHA-256 du jeton touche la base (aucune PII à l'inscription). La page
`/hunt/[token]` résout étape → chasse → organisation via `hunt-context.ts`
(service-role + gardes inter-tenant + `hasHuntsAccess` + statut actif +
fenêtre) et n'affiche la progression qu'en LECTURE ; le tampon se fait au
POST du bouton « Valider mon passage » (jamais au GET : anti-prefetch).

`record_hunt_scan()` fait TOUT dans une transaction sous verrou de la
chasse (`for update`) : résolution du jeton d'étape, contrôle
addon + statut + fenêtre (réponse `unavailable` unique, sans oracle sur le
motif), création du joueur au premier scan, délai minimal
(`min_scan_interval_seconds`, anti-partage de photos — pas de
géolocalisation, ADR-026), ordre imposé, tampon idempotent
(`unique(player_id, step_id)`), puis, à la dernière étape, complétion :
émission d'un code de retrait `CHASSE-XXXXXXXX` et décrément du stock
optionnel dans la même transaction. La réponse est un état unique
(`scanned`/`already`/`too_soon`/`wrong_order`/`completed`/`hunt_full`/
`unavailable`).

La récompense est un lot DIRECT (pas de roue, ADR-023) : le code s'affiche
à l'écran, l'email n'est qu'un rappel optionnel (opt-in) rattaché à usage
unique pour parité anti-abus avec la roue (ADR-024). La remise en caisse
est unifiée à la lecture — `lookupRedeemCode` renvoie un `CashierMatch`
discriminé (`source: 'wheel' | 'hunt'`) — mais chaque source garde sa RPC
de remise : `redeem_hunt_completion` (atomique, auditée, org-scopée) pour
la chasse. La purge RGPD `purge_expired_hunt_players` (cron purge-data)
supprime les joueurs expirés en cascade (scans + complétions), miroir de
`purge_expired_contest_players`.

## Module Passeport de fidélité

Livré le 2026-07-22 puis durci et passé en production (GA) le 2026-07-23,
addon d'organisation `addon_loyalty` (miroir exact
d'`addon_hunts`, activé depuis le back-office admin, gating
`hasLoyaltyAccess`). Le client cumule des visites (« tampons ») sur un
passeport dématérialisé ; des niveaux `bronze/silver/gold` se calent sur le
compteur (seuils configurables) et des paliers configurables débloquent une
récompense. V1 mono-organisation (ADR-028).

Comme Pronostics et Chasse, le parcours public `/passeport/[programId]` n'a
aucun droit SQL : identité joueur = cookie HTTP-only (`lc-loyalty-{id}`, 180 j),
seul le hash SHA-256 du jeton touche la base (aucune PII). `loyalty-context.ts`
résout programme → organisation (service-role + garde inter-tenant +
`hasLoyaltyAccess` + statut actif) et n'affiche l'état qu'en LECTURE ; le
tampon se fait au POST uniquement (jamais au GET).

**Deux modes de validation d'une visite, au choix du commerçant** (ADR-030),
portés par le PROGRAMME (`validation_mode`) :
- `rotating_code` : un code type TOTP à 6 chiffres tourne sur un écran au
  comptoir. `current_loyalty_code` (RPC service-role) le calcule depuis
  `rotating_secret` et l'horloge ; `record_loyalty_stamp` le revérifie
  (fenêtre ±1 période). Le secret ne sort jamais côté client (colonne exclue
  des grants `authenticated`, générée par trigger `SECURITY DEFINER`).
- `staff` : un membre owner/editor/cashier valide la visite en caisse en
  scannant le QR du passeport. Ce QR n'encode PAS le cookie passeport (bearer
  180 j) mais un **jeton de check-in signé HMAC, TTL 3 min**
  (`loyalty-checkin.ts`) qui ne porte que le HASH du jeton passeport et
  n'autorise QUE la validation d'une visite — un QR photographié est inerte
  après 3 min et ne donne accès ni aux codes de retrait ni aux tours offerts.
  La RPC exige `p_validated_by`, l'action backend ayant authentifié le rôle au
  préalable (le chemin public est fermé sur un programme staff).

`record_loyalty_stamp()` fait TOUT dans une transaction sous verrou du
programme (`for update`) : contrôle addon + statut, validation du mode,
création du passeport à la première visite, cooldown
(`min_stamp_interval_seconds`, défaut 24 h, plancher durci EN BASE — 300 s en
`staff`, `max(2 × période, 300 s)` en `rotating_code` — pour qu'un code lu une
fois ne vaille jamais 2 tampons), incrément + recalcul du niveau, tampon, puis
détection des paliers NOUVELLEMENT atteints (jamais avant la visite 2). Le stock
du palier est décompté sous le même verrou, à l'émission, pour les DEUX types :
un palier `reward_type = 'lot'` émet un code de retrait `FIDELITE-XXXXXXXX`, un
palier `reward_type = 'spin'` émet un `grant_token` à usage unique. Un palier
épuisé renvoie `out_of_stock` sans rien émettre.

Le **tour de roue offert** (ADR-029) branche la fidélité sur le moteur de spin
existant : `consume_loyalty_spin_grant` échange le grant contre exactement un
tirage atomique sur la roue cible (`target_wheel_id`, même organisation), même
algorithme pondéré que `perform_atomic_spin` mais SANS la limite de jeu
par-fenêtre. Comme le tour offert n'a aucune des bornes de la roue publique
(play_limit, fenêtre, Turnstile, seaux de spin), il en reçoit de propres
(ADR-031) : il ne tire JAMAIS un lot à stock illimité (`prizes.stock` null
exclu du tirage → `no_prize`, grant NON consommé) et vérifie le statut, les
dates et le créneau horaire de la campagne cible avant tout tirage (campagne
fermée → `unavailable`, grant intact, rejouable à la réouverture). Le spin
inséré porte `source = 'loyalty'` (valeur ajoutée à `spins.source`) et suit le
flux de gain normal : jeton HMAC → `claim_winning_spin` → code `GAIN-…`. Le
moteur n'est pas modifié.

**Bornes économiques (ADR-031).** La boucle du module (identité anonyme et
gratuite → valeur encaissable) n'est pas fermée par du rate limiting mais par
deux verrous produit posés en base : **stock fini obligatoire sur tout palier**
(`loyalty_milestones_reward_stock_check` — plus de stock null « illimité », lot
comme spin ; sur un `spin` le stock compte les GRANTS émis ; 0 = palier en
pause) et **palier à partir de la visite 2** (`visit_count between 2 and 1000` —
un passeport fraîchement créé ne déclenche aucune récompense). La perte maximale
d'un programme sous attaque vaut alors exactement le stock choisi par le
commerçant, quel que soit le nombre de passeports fabriqués (≈ 150 € pour une
configuration type).

La remise du lot de fidélité est unifiée à la lecture (`lookupRedeemCode` route
le préfixe `FIDELITE-` vers `source: 'loyalty'`) mais garde sa RPC dédiée
`redeem_loyalty_reward` (atomique, auditée, org-scopée, contrat miroir de
`redeem_hunt_completion`). La purge RGPD `purge_expired_loyalty_members`
(cron purge-data) supprime en cascade (tampons + récompenses) les passeports
DORMANTS au-delà de la rétention — la borne est la dernière activité
(`coalesce(last_stamp_at, created_at)`), divergence assumée avec la chasse : un
programme de fidélité vit dans la durée.

## Module Jackpot collectif

Livré en production le 2026-07-23, addon d'organisation
`addon_jackpot` (miroir exact d'`addon_loyalty`, activé depuis le back-office
admin, gating `hasJackpotAccess`). À la différence des autres jeux, le gain ne
se déclenche pas par joueur mais sur une **jauge PARTAGÉE** : tous les clients
alimentent un même compteur global (`current_count`, +1 par participation
validée), affiché en temps réel. V1 mono-organisation (ADR-033).

Comme les autres parcours publics, `/jackpot/[id]` n'a aucun droit SQL :
identité joueur = cookie HTTP-only + hash SHA-256 (aucune PII). `jackpot-context.ts`
résout la page suivable (par id ou slug) → campagne → organisation (service-role
+ garde inter-tenant + `hasJackpotAccess` + `status = 'active'`) et n'affiche
l'état qu'en LECTURE. La page est installable (PWA, `manifest.webmanifest` par
campagne) et porte un bloc de contenu commerçant ; le **montant d'affichage
croissant** (`display_amount_cents`) est PUREMENT COSMÉTIQUE (aucun lien avec le
stock réel). Un écran comptoir temps réel
(`/dashboard/jackpot/[id]/comptoir`) affiche la jauge et, en mode
`rotating_code`, le code courant.

**Anti-triche réutilisé du Passeport** (ADR-030), porté par la campagne
(`validation_mode`) : `rotating_code` (code type TOTP à 6 chiffres sur l'écran
comptoir — `current_jackpot_code`, RPC service-role ; secret jamais exposé,
fenêtre ±1 période) ou `staff` (jeton de check-in signé HMAC, domaine
`jackpot-checkin:`, `jackpot-checkin.ts`, validé par un membre owner/editor/
cashier authentifié). Cooldown par joueur (`min_participation_interval_seconds`)
à plancher durci ≥ 300 s. La participation applique STRICTEMENT ADR-032 : aucun
seau `failClosed` sur clé partagée.

`record_jackpot_participation()` fait TOUT dans une transaction sous verrou de la
campagne (`for update`) : contrôle addon + statut, validation du mode, création
du joueur à la première participation, cooldown, incrément de la jauge partagée,
puis résolution selon le **mode de tirage** (`draw_mode`) :
- `threshold_draw` : à l'atteinte du `threshold`, tirage cryptographique
  (`gen_random_bytes`) parmi TOUS les participants du cycle ;
- `rescan_win` : jauge pleine → campagne ARMÉE, chaque participation ultérieure
  est une chance de gain INSTANTANÉ (gagnant = appelant) ;
- `date_draw` : le tirage est différé au cron `jackpot-draws`
  (`run_jackpot_date_draws`, pg_cron SQL direct, `/api/cron/jackpot-draws`).

Le tirage est **atomique, équitable et vérifiable** : sous verrou de campagne,
`unique(campaign_id, cycle)` sur `jackpot_wins` garantit UN SEUL gagnant par
cycle (jamais de sur-émission), et la graine `draw_seed` est JOURNALISÉE
(reproductible / auditable). Le **stock fini est OBLIGATOIRE** (ADR-031,
`reward_stock` = nombre de gagnants/cycles), ce qui borne la perte du commerçant.

**Confidentialité du code (défense en profondeur).** En `threshold_draw`, le
joueur qui déclenche le seuil n'est pas forcément le gagnant tiré : le code
`JACKPOT-…` n'est renvoyé QU'AU gagnant réel, sur deux couches —
`case when v_is_winner then v_win_code else null` en SQL et
`code: isWinner ? … : null` dans `mapJackpotParticipation`. Le vrai gagnant
récupère son code via la page publique (`jackpot_wins` filtré sur
`winner_token_hash`).

Le **`date_draw` est un tirage UNIQUE (one-shot)** : après tirage, le cycle n'est
PAS rouvert (`reward_claimed_count + 1` seul), le garde
`not exists jackpot_wins (…cycle…)` exclut ensuite définitivement la campagne des
cron suivants, et la campagne reste `active` (non archivée) pour que le gagnant
asynchrone récupère son code. Limites V1 assumées (docs/bugs.md) : le stock
résiduel d'un `date_draw` non distribué et les scans post-tirage n'incrémentent
que la jauge cosmétique.

La remise du lot est unifiée à la lecture (`lookupRedeemCode` route le préfixe
`JACKPOT-` vers `source: 'jackpot'`) mais garde sa RPC dédiée
`redeem_jackpot_prize` (atomique, auditée, org-scopée, miroir de
`redeem_loyalty_reward`). La purge RGPD `purge_expired_jackpot_players`
(cron purge-data) supprime les joueurs dormants en cascade mais **conserve les
hashes anonymes des tirages** (`winner_token_hash`, SHA-256 d'un jeton aléatoire
192 bits, aucune PII) pour la vérifiabilité du palmarès — conforme RGPD.

## Module Mode événement en direct

Livré en production le 2026-07-23, addon `addon_events` (gating
`hasEventsAccess`). Une animation LIVE dans le commerce : un organisateur enchaîne
des questions face à un public, l'écran de la salle affiche la question, chaque
client répond sur son téléphone, un classement s'actualise en direct. **Première
brique temps réel du projet.** V1 mono-organisation (ADR-034).

**Trois interfaces d'une même RUN, synchronisées** : écran public
(`/event/[code]/screen`, plein écran type TV), téléphone joueur (`/event/[code]`,
join **pseudo + avatar**, aucune PII), télécommande organisateur
(`/dashboard/events/[id]/remote`, AUTHENTIFIÉE owner/editor). `[code]` = le
`join_code` de la session ; `event-context.ts` résout via service-role + garde
inter-tenant.

**Moteur « question » générique** (`event_questions.kind`), un seul chemin pour
trois usages : `quiz` (bonne réponse prédéfinie, scorée), `poll`/sondage (aucune
bonne réponse, on affiche la répartition), `prono` (bonne réponse DÉSIGNÉE par
l'orga au reveal). **Séparation CONTENU** (`event_games`/`questions`/`options`,
édité à froid) **et RUN** (`event_sessions`/`players`/`answers`/`wins`, état
live) : un même jeu se rejoue en plusieurs sessions.

**Machine à états SERVEUR** (`event_sessions.phase` :
`lobby → question_active → question_locked → reveal → leaderboard → ended`),
chaque transition étant une RPC `is_org_editor` (`start`/`launch`/`lock`/
`reveal`/`show_leaderboard`/`end_event_session`). L'organisateur ne pousse jamais
d'état : il fait avancer la machine, les trois surfaces relisent l'état officiel.

**Deux invariants de sécurité** (revue passée sans bloquant) :
- **Non-fuite de la bonne réponse — 4 défenses redondantes** : (1) grants anon
  révoqués sur les 7 tables ; (2) lecture publique via la seule RPC
  `event_public_state`, qui exclut la correction tant que `phase ≠ 'reveal'` ;
  (3) le mapping backend (`mapEventPublicState`) re-filtre hors reveal ; (4) aucun
  autre chemin public (`join`/`submit` ne renvoient jamais la correction).
- **Scoring SERVEUR-AUTORITATIF** : `launch_event_question` pose
  `current_question_started_at = now()` (serveur) ; au `submit`,
  `elapsed_ms = now() - started_at`, jamais une valeur client ; refus hors
  fenêtre/phase, unicité de réponse immuable, verrou `for update of s` homogène
  (pas de course reveal/submit). Points calculés au reveal (base + bonus de
  rapidité), une seule fois.

**Transport temps réel** : POLLING primaire sur `event_public_state` (les 3
surfaces re-sollicitent l'état ~2,5 s ; garde la dernière photo saine sur coupure
réseau) — la fonctionnalité marche entièrement SANS Realtime. Le Supabase
Realtime est une amélioration ACTIVABLE (`EVENTS_REALTIME_ENABLED`) qui diffuse,
sur un canal par session, un simple **ping refresh** (aucun état métier sur le
canal → rien à fuiter ; les abonnés anon re-sollicitent l'état serveur).

`join`/`submit` sont publics à IP partagée (Wi-Fi du bar) : STRICT ADR-032
(aucun `failClosed` sur clé partagée ; seaux d'identité cookie et d'opérateur
seuls bloquants, IP en observabilité fail-open). Récompense = **podium à l'écran**
+ lot `EVENT-…` à **stock fini** (ADR-031), remis en caisse unifiée
(`redeem_event_prize`, org-scopé/audité ; routage `lookupRedeemCode`). Le pseudo,
affiché en public, refuse les caractères de contrôle/formatage Unicode (aucun
XSS — React échappe). Purge RGPD `purge_expired_event_sessions` : supprime les
joueurs (pseudo) des sessions terminées, conserve le registre anonyme
`event_sessions`/`event_wins` (hash seul).

## Module Calendrier de l'Avent & campagnes quotidiennes

Livré en production le 2026-07-23, addon d'organisation
`addon_calendar` (miroir exact d'`addon_events`, activé depuis le back-office
admin, gating `hasCalendarAccess`). Une campagne QUOTIDIENNE à mécanique
ANNUELLE : le joueur revient chaque jour ouvrir UNE case (Avent, semaine
anniversaire, compte à rebours, 7 jours de cadeaux, festival, lancement produit,
semaine soldes), ou suit le calendrier à distance via un rappel email opt-in.
V1 mono-organisation (ADR-035).

Comme les autres parcours publics, `/calendar/[slug]` n'a aucun droit SQL :
identité joueur = cookie HTTP-only + hash SHA-256 (aucune PII).
`calendar-context.ts` résout la page suivable → calendrier → organisation
(service-role + garde inter-tenant + `hasCalendarAccess` + statut actif) et
n'affiche l'état qu'en LECTURE. La page est installable (PWA,
`manifest.webmanifest` par calendrier) et se décline en **5 thèmes « carton »**
(`calendar-theme.ts` : neutre / noël / anniversaire / soldes / festival).

**4 types de case** (`calendar_days.kind`) + une récompense finale :
- `content` : message ou offre affiché ;
- `lot` : code de retrait `CADEAU-…` à stock fini ;
- `spin` : tour de roue offert, branché sur le moteur de spin existant — un
  `grant_token` à usage unique échangé par `consume_calendar_spin_grant` contre
  un tirage atomique sur la roue cible (source `spins.source = 'calendar'` →
  flux de gain normal `GAIN-…`), miroir du tour offert Passeport (ADR-029) ;
- **récompense d'assiduité** : toutes les cases ouvertes → un `CADEAU-…`
  supplémentaire (`calendar_rewards`).

**Deux invariants de sécurité neufs** (revue adversariale passée sans bloquant,
ADR-035) :
- **Gating temporel SERVEUR-AUTORITATIF** : `open_calendar_box` tranche sur
  `now()` (base) contre `unlock_at`, jamais sur un horodatage client. `unlock_at`
  est DÉRIVÉ serveur (minuit civil de `start_date + offset` dans le fuseau du
  calendrier, recalculé par trigger à chaque modification de grille — robuste au
  changement d'heure via `Intl.DateTimeFormat`, `calendarDayUnlockAt`), éditable
  seulement par `is_org_editor`. Ouvrir une case en avance est impossible.
- **Non-fuite du contenu d'une case non ouverte — quadruple défense** : (1)
  `calendar_public_state` n'expose, hors état `opened`, que
  `{day_index, unlock_at, status, is_special}` ; (2) le mapper backend force le
  contenu à `null` hors case ouverte ; (3) une tentative `too_early` ne renvoie
  aucun contenu ; (4) RLS/grants — aucun accès SQL public direct.

`join`/`open` sont publics à IP partagée : STRICT ADR-032 (aucun `failClosed` sur
clé partagée ; seaux d'identité cookie et d'opérateur seuls bloquants, IP en
observabilité fail-open). Le **préchargement** des roues des cases `spin` est
limité aux cases DÉJÀ ouvertes par le joueur — `open_calendar_box` renvoie le
bundle de la case qu'il vient d'ouvrir (`calendar-spin-bundle.ts`) — pour ne
jamais divulguer, dans le payload RSC, les lots des roues de jours verrouillés
(finding de revue anti-spoiler, corrigé `5c4d89f` ; l'invariant strict de
non-fuite n'était pas cassé mais le spoiler était réel).

La remise du lot est unifiée à la lecture (`lookupRedeemCode` route le préfixe
`CADEAU-` vers `source: 'calendar'`, **6 préfixes** au total avec
roue/chasse/fidélité/jackpot/événement) mais garde sa RPC dédiée
`redeem_calendar_reward` (atomique, auditée, org-scopée), qui couvre les DEUX
origines du `CADEAU-…` (case-lot et récompense d'assiduité). Le rappel quotidien
opt-in part du cron Vercel `/api/cron/calendar-reminders` (`15 9 * * *`, ciblage
`calendar_reminder_targets`, dédup `email_log`), qui relaie aussi l'archivage des
calendriers écoulés. Purge RGPD `purge_expired_calendar_players` (cron
purge-data) : ne purge que les calendriers `archived` (résidu assumé — l'archivage
est opt-in commerçant, borné par `data_retention_months`).

## Module Parrainage ludique

Livré en production le 2026-07-24, addon d'organisation
`addon_referral` (miroir exact d'`addon_calendar`, activé depuis le back-office
admin, gating `hasReferralAccess`), opt-in PAR CAMPAGNE (`referral_programs.enabled`)
sur les campagnes ROUE. Un joueur satisfait devient PARRAIN et reçoit un code
partageable `PR-…` (lien `/play/[slug]?ref=PR-…`, aucune nouvelle surface publique) ;
chaque filleul qui vient JOUER un spin fait progresser une jauge d'« équipe »
PARTAGÉE et débloque des récompenses. V1 mono-organisation (ADR-036).

**Preuve par PARTICIPATION réelle, jamais un clic.** Un filleul n'est validé que
lorsqu'il a réellement joué un spin sur la campagne (gagnant OU perdant =
« participant ») : `validate_referral` exige un `proof_spin_id` (spin réel du device
filleul, non forgeable / non rejouable / unique) et n'est appelé qu'APRÈS le spin.
Sur la roue, `ReferralPanel` (parrain : CTA, partage, jauge/coffre/équipe) et
`ReferralSpinExperience` (filleul arrivé par `?ref=PR-…` → `validateReferral` après
le tirage) vivent dans `play-experience.tsx` ; `referral-context.ts` résout l'état de
parrainage (service-role + garde inter-tenant + `hasReferralAccess`), et la page de
jeu ISR n'expose qu'un prop public `referral` (libellés et `kind` seulement, jamais
de stock, de compteur ni de code).

**Trois versements en CONFIG LIBRE** (`referral_programs`, un par campagne), chacun
`none | spin | lot` : au PARRAIN (par filleul validé), au FILLEUL (bienvenue) et un
COFFRE collectif au SEUIL (`chest_threshold`, défaut 3). Un versement `lot` émet un
code de retrait `PARRAIN-…` à STOCK FINI (ADR-031) ; un versement `spin` émet un
`spin_grant_token` à usage unique échangé par `consume_referral_spin_grant` contre un
tirage atomique sur la roue de la campagne (source `spins.source = 'referral'` → flux
de gain normal `GAIN-…`, miroir du tour offert Passeport, ADR-029). La jauge
(`referral_sponsors.validated_count`) et le coffre sont PARTAGÉS par l'« équipe »
(parrain + filleuls), débloqués une seule fois au seuil sous verrou ; il n'y a AUCUN
classement (coopératif, pas compétitif).

**Anti-abus 100 % serveur, borné par l'économie** (ADR-031 plus qu'ADR-032) :
`validate_referral` (cœur anti-abus) refuse l'auto-parrainage (même device ou même
email) et la boucle directe A→B→A, applique 1 filleul par campagne et par device, la
fenêtre `window_days` et le plafond `sponsor_max_filleuls` ; les cycles ≥ 3 ne sont
pas détectés mais restent bornés par le plafond + la fenêtre + le COÛT (N spins réels
de N devices). Tout `lot` est à stock fini obligatoire (décrément atomique
conditionnel), le coffre versé une seule fois. Multi-tenant : tables org-scopées
(RLS + FK composites tenant), `saveReferralProgram` n'écrit jamais les
`*_claimed_count`. Rate-limit ADR-032 : `failClosed` sur la seule clé d'identité
device (`anonymousPlayerKey`, seau `referralPlayerAction`), la clé IP partagée ne
portant qu'un seau large fail-OPEN d'observabilité (`referralPublicIp`). Deux
durcissements de fin de chantier : NO-ORACLE (`validateReferral` collapse tous les
refus en un `rejected` unique) et défense en profondeur (`referral_public_state`
re-vérifie addon + `enabled` + campagne active).

La remise du lot est unifiée à la lecture (`lookupRedeemCode` route le préfixe
`PARRAIN-` vers `source: 'referral'`, **7 préfixes** au total) mais garde sa RPC
dédiée `redeem_referral_reward` (atomique, auditée, org-scopée). La purge RGPD
`purge_expired_referral_data` (cron purge-data) neutralise les emails opt-in des
parrains au-delà de la fenêtre. Fonctions : 6 RPC service-role
(`ensure_referral_sponsor`, `referral_public_state`, `validate_referral`,
`consume_referral_spin_grant`, `redeem_referral_reward`, `purge_expired_referral_data`)
+ 1 helper interne `referral_emit_reward` ; migration `20260729120000_referral.sql`.

## Module Jeux rapides

Livré le 2026-07-24. `wheels.game_type` est le POINT D'EXTENSION des mécaniques de
jeu : depuis V1.4, la roue classique (`wheel`) et la carte à gratter (`scratch`)
partagent le MÊME moteur (`spinWheel` → `perform_atomic_spin` → flux de gain
`claimPrize`). Ce chantier le FORMALISE en socle et l'étend à 13 nouveaux jeux, en
deux familles. Principe : « ajouter un jeu = ajouter une interface » — tout le reste
(éligibilité, probabilités, lots, stocks, réclamation, statistiques, thème,
consentement, partage, caisse, Wallet) est mutualisé et INCHANGÉ.

**Vague 1 — 7 jeux de RÉVÉLATION** (`flip_card`, `cups`, `slot`, `memory`, `chest`,
`dice`, `draw_card`), migration `20260730120000_quick_games_reveal.sql` (extension de
`wheels_game_type_check`). Le socle client `game-shell.tsx` (`<GameShell>`), EXTRAIT
du grattage, factorise les états idle / gagné / perdu / bloqué et mutualise
`spinWheel` / réclamation / partage / captcha / analytics / thèmes. Chaque jeu =
`games/<jeu>-reveal.tsx` (animation) + `<jeu>-experience.tsx` (~12 lignes).
**Serveur-autoritatif** : le lot vient de `spinWheel` (décidé serveur), l'interaction
(gobelet, coffre, carte, dé, memory) ne fait que RÉVÉLER l'`outcome` — cosmétique,
aucun poids ni tirage au client. **Déployée en production** (revue sécurité vague 1 :
GO 0 bloquant).

**Vague 2 — 6 jeux de DÉFI *skill-gated*** (`rps`, `reflex`, `gauge`, `puzzle`,
`mystery_word`, `estimate`), migration `20260731120000_quick_games_skill.sql`. Ici
l'issue dépend d'une RÉUSSITE du joueur, évaluée SERVEUR, sans jamais affaiblir
l'anti-triche du gain. Trois briques SQL : `game_type` étendu ; colonne
`wheels.skill_config jsonb` (paramètres du défi ; les SECRETS `mystery_word.word` /
`estimate.target` / `estimate.tolerance` / `puzzle.order` sont SERVER-ONLY, jamais
sérialisés au client) ; `perform_atomic_spin` recréée en **7 arguments** avec
`p_force_losing boolean default false` — corps normal identique au correctif 42702 de
`20260720150500`, donc ZÉRO régression sur le tirage roue existant.

Le moteur backend est à **2 temps** (`src/lib/skill.ts` + `src/actions/skill.ts`) :
- `startSkillChallenge` présente le défi (vue PUBLIQUE `SkillChallengePublic`, sans
  secret — `toPublicChallenge` strippe) et signe un jeton HMAC domaine-séparé
  (`skill-challenge:`, repli `SPIN_TOKEN_SECRET`, lié device / campagne / roue /
  gameType / seed) ; AUCUN tirage à ce stade.
- `submitSkillChallenge` vérifie le jeton + l'identité device, ÉVALUE le défi CÔTÉ
  SERVEUR (rps : coup serveur dérivé HMAC, égalité = échec ; mystery_word : égalité
  normalisée ; estimate : |x − cible| ≤ tolérance ; puzzle : ordre vérifié ; reflex /
  gauge : réussite *client-reported*), puis appelle
  `perform_atomic_spin(p_force_losing => !succeeded)` — réussite → tirage pondéré
  NORMAL, échec → spin PERDANT forcé. La participation / `play_limit` est CONSOMMÉE
  dans les deux cas (anti-brute-force). Socle client `skill-game-shell.tsx` (à
  2 temps) + `games/<jeu>-challenge.tsx` ; éditeur `wheel-settings.tsx` (sélecteur +
  sous-formulaire « Réglages du défi », secrets marqués).

**Invariants de sécurité** (revue vague 2 NO-GO initial → 2 bloquants corrigés → GO,
`8a3c60e`). Le TIRAGE est le PLAFOND : un tricheur ne dépasse jamais les odds / stock
configurés (ADR-031). Corrigés : (ÉLEVÉ) `spinWheel` ne gardait pas le `game_type` —
garde `isSkillGameType` ajoutée dans `spinWheelInner` AVANT tout tirage, un
`game_type` skill n'est jouable que par `submitSkillChallenge` ; (MOYEN) sous
`play_limit = unlimited`, jeton rejouable + oracle `succeeded` = brute-force d'un
secret — `unlimited` désormais INTERDIT pour les jeux à secret et `succeeded` retiré
de la réponse cliente. Sains par construction : secrets jamais sérialisés (la page
`/play` ne passe pas `skill_config`), jeton HMAC domaine-séparé lié device et
expirant, RLS / grants `service_role`, règle rate-limit ADR-032 (failClosed sur la clé
device, IP fail-open en observabilité). **Vague 2 déployée EN PRODUCTION**
(EXPECTED_MIGRATION bumpé à `20260731120000`). Détail et
résidus assumés : ADR-037, docs/bugs.md.

## Module Place de marché de campagnes

Livré le 2026-07-25 (ADR-039). Le
commerçant part d'un MODÈLE au lieu d'une page blanche. Deux sources
DÉLIBÉRÉMENT ASYMÉTRIQUES, et **aucune place de marché partagée entre
commerçants** (écartée : modération, isolation du contenu publié, propriété des
visuels) :

- **Le catalogue Lastchance — EN CODE** (`src/lib/campaign-templates.ts`, module
  pur) : 10 modèles versionnés avec l'application — Saint-Valentin, Halloween,
  Noël, ouverture de boutique, anniversaire, match de football, fête des Mères,
  happy hour, soldes, lancement de produit. Rien en base : pas de seed à
  maintenir, pas de migration pour retoucher un texte, et pas de table lisible
  par toutes les organisations. Chaque modèle choisit une mécanique qui a du sens
  pour l'occasion (`flip_card`, `cups`, `chest` sur 24 jours, `memory`, `dice`,
  `scratch`, `slot`, `draw_card`, `wheel`) et respecte ADR-031 : 4 lots gagnants
  à STOCK FINI + 1 lot perdant SANS stock.
- **Les modèles PRIVÉS — en base** (`campaign_templates`, migration
  `20260802120000_campaign_templates.sql`) : `name` unique par organisation,
  `description`, `blueprint jsonb`, `source_campaign_id`, `created_by`. La base
  ne tient que les deux garde-fous incontournables sur le blueprint — c'est un
  **objet** et il est **borné à 32 Ko** ; la FORME est validée côté applicatif
  (Zod), pour suivre l'évolution des jeux sans migration par champ. Isolation :
  policy unique **`campaign_templates: editors`** (`for all`, `is_org_editor`,
  miroir de `campaigns: editors`), **FK composite** `(source_campaign_id,
  organization_id) → campaigns(id, organization_id)`, `organization_id` hors du
  grant UPDATE, `created_by` posé par trigger depuis la session, aucune policy
  `anon`/`public` (sentinelle pgTAP).

**Le blueprint** est la recette complète et SANS DATE ABSOLUE : `texts`,
`visual` (préréglage `WHEEL_PRESETS` + surcharges), `game` (`game_type` +
`skill_config`), `prizes`, `rules` (`play_limit`, collecte, `code_ttl_seconds`,
`engagement`, `budget_cents`), `durationDays` (1..365, RELATIF — sinon un modèle
périme) et `emails`. `blueprintToDraft(blueprint, now)` est PURE et ne jette
jamais (un style corrompu retombe sur les défauts de `resolveWheelStyle`).

**Trois actions** (`src/actions/campaign-templates.ts`, owner|editor) :
`applyCampaignTemplate` (catalogue par `templateKey` OU modèle privé par
`templateId`) crée campagne + roue + lots ; `saveCampaignAsTemplate` sérialise
campagne + **roue principale** (première par position) + lots actifs ;
`deleteCampaignTemplate`. Le blueprint est **revalidé par Zod dans les DEUX
chemins**, catalogue compris.

**Trois invariants d'innocuité** (vérifiés sur l'ACTION, seul endroit qui écrit —
29 tests, invariants 1 et 2 mutation-testés) :
1. **BROUILLON INERTE** — `status: 'draft'` ET `auto_schedule: false`, ce dernier
   verrouillé au niveau du TYPE (littéral `false`). Sans lui,
   `run_campaign_schedule()` (pg_cron, 10 min) aurait publié la campagne tout
   seul dès `starts_at`. Le schéma Zod ne comporte AUCUN champ `status` /
   `auto_schedule` / `starts_at` / `ends_at` : un blueprint privé trafiqué ne
   peut pas les forcer.
2. **AUCUN ENVOI** — `automation_settings`, `enqueueJob` et `@/lib/resend` sont
   absents du chemin ; le jeu de tables visitées est figé (campagne / roue / lots
   à l'application, campagne / modèles à l'enregistrement) ; un modèle enregistré
   part avec `emails: []`. Les textes d'email d'un modèle ne sont QUE des textes.
3. **MULTI-TENANT PAR LA SESSION** — organisation et rôle issus de
   `getUserAndOrg()`, modèle privé lu avec le client de SESSION (donc sous RLS)
   plus un filtre `organization_id` explicite, **aucun `createAdminClient`** sur
   ce chemin (sentinelle de test).

**Interface** (`/dashboard/campaigns`) : galerie SERVEUR en deux sections
(« Modèles Lastchance » / « Mes modèles », jamais présentées comme un catalogue
commun), vignettes des **7 promesses** (visuel, jeu, textes, lots, emails, durée,
règles) rendues par un module pur à lecture DÉFENSIVE
(`campaign-template-preview.ts` — un blueprint d'une version antérieure s'affiche
en dégradé au lieu de casser la page) ; les blueprints ne traversent pas le
réseau, seuls les boutons appliquer / supprimer sont clients. La promesse
« brouillon, rien n'est publié, aucun email envoyé » est répétée en bandeau, sous
chaque bouton et dans l'`aria-label`.

**Sécurité** : revue GO 0 bloquant, 1 MOYEN corrigé (`4457b20`) — le blueprint
recopiant `wheels.skill_config`, une lecture ouverte à `is_org_member` faisait
passer les SECRETS des jeux de défi (ADR-037) et le paramétrage commercial
(poids, stocks, `cost_cents`, budget) d'« éditeurs seulement » à « toute
l'équipe, caissiers compris » ; la lecture est désormais réservée aux ÉDITEURS.
`campaign_templates` est couvert par `supabase/tests/campaign_templates.test.sql`
et intégré à l'audit RLS central `security_acl.test.sql`. Résidus assumés :
ADR-039, docs/bugs.md.

## Module Créateur de quiz

Livré le 2026-07-25 (ADR-040). Addon d'organisation `addon_quiz` (miroir
exact d'`addon_calendar`, activé au back-office). Le commerçant compose un QUIZ
que ses clients jouent depuis un QR ou un lien, en LIBRE-SERVICE et de façon
**ASYNCHRONE** : chacun à son rythme, sans animateur ni écran partagé — c'est ce
qui distingue le module du mode « Événement en direct »
(`event_sessions` = SYNCHRONE, l'organisateur lance chaque question ; `quizzes` =
ASYNCHRONE, le JOUEUR démarre chaque question). Usages visés : restaurant, cave /
bar, salon professionnel, boutique, musée, entreprise, club sportif.

**4 formes de réponse + 2 dimensions transversales + un catalogue de 7 modèles.**
`quiz_questions.question_type` est LE MOTEUR (`choice`, `number`, `ranking`,
`text`) ; `time_limit_seconds` (nullable) et `image_url` sont **orthogonaux** à
n'importe quelle forme ; `preset` est LE MODÈLE D'UI, contraint en forme seulement
et **ignoré du moteur** — il porte les 7 modèles demandés (`multiple_choice`,
`true_false`, `mystery_image`, `estimate`, `timed`, `ranking`, `free_prediction`).
Un 8e modèle n'exigera **aucune migration**. Même couple `event_kind` /
`question_type` que les pronostics (ADR-038), dont `choice` / `number` /
`ranking` **RÉUTILISENT les validateurs** `is_valid_contest_options` /
`is_valid_contest_answer` (migration `20260801120000`) : seule la réponse libre
est du code neuf (`quiz_normalize_text`, `IMMUTABLE`, serveur seulement).
Côté éditeur, `quizFormShape(preset, questionType)` rend des booléens lus tels
quels par le formulaire.

**5 tables** (migration `20260803120000_quizzes.sql`) : `quizzes`,
`quiz_questions`, `quiz_players`, `quiz_answers`, `quiz_rewards` — toutes
org-scopées (RLS `is_org_member` en lecture, `is_org_editor` en écriture, FK
composites tenant, compteurs de stock et `draw_state` RPC-only par grants de
colonnes). **16 fonctions** : 10 RPC `service_role` (`join_quiz`,
`start_quiz_question`, `submit_quiz_answer`, `finish_quiz`,
`consume_quiz_spin_grant`, `quiz_public_state`, `quiz_leaderboard`,
`draw_quiz_winners`, `redeem_quiz_reward`, `purge_expired_quiz_players`),
5 helpers de validation / évaluation et 1 helper interne `quiz_emit_reward`.
Aucun droit `anon` : le parcours public passe exclusivement par le `service_role`.

**Chronomètre SERVEUR-AUTORITATIF.** Aucune RPC n'accepte de paramètre de temps
(assertion pgTAP sur `pg_get_function_arguments`) : `start_quiz_question` pose
`started_at = now()` **une seule fois** (`on conflict do nothing`, donc pas de
rembobinage), `submit_quiz_answer` calcule `elapsed_ms = now() - started_at` en
base et ne score pas au-delà de `time_limit_seconds`, et un trigger de gel
interdit tout déplacement de `started_at` — **service_role inclus**. Côté client
la borne initiale vient du couple `server_now` / `started_at` (calcul pur, aucun
`Date.now()` au rendu) ; à expiration l'UI n'invalide rien, elle **soumet quand
même** (hors barème) et la base tranche. Une réponse est **unique et immuable**
par (joueur, question) : aucune seconde tentative pour deviner.

**Non-fuite de la bonne réponse en trois couches** — la vérité existe dès la
création du quiz, contrairement à un pronostic : `quiz_public_state` ne l'attache
qu'aux questions déjà répondues par CE joueur (patron `calendar_public_state`), le
mapper TS la re-force à `null` hors statut « répondu », et le type de question
JOUABLE ne porte **structurellement aucun champ de vérité**. Un refus
`invalid_answer` n'est pas un oracle (forme seulement) ; le hash d'identité vient
toujours du cookie httpOnly ; le classement ne publie que prénom / avatar / score
/ temps, sans aucun email.

**5 modes de récompense** (`reward_mode`) : `threshold` (seuil de bonnes réponses)
et `instant` (clôture, mais seulement si TOUTES les questions ont été répondues)
émis par `finish_quiz` ; `draw` (tirage parmi les `draw_top_n` meilleurs) et
`ranking` (top déterministe score puis rapidité) DIFFÉRÉS et servis par **une
seule RPC** `draw_quiz_winners`, atomique et idempotente (drapeau sous verrou +
unicités + CHECK `claimed <= stock`), le drapeau n'étant posé qu'après émission
réelle (`no_participants` reste relançable) ; `none` (aucun lot, stock forcé à 0).
Stock **fini et obligatoire** dès qu'un mode émet, décrément atomique conditionnel
(ADR-031). Le lot est un code `QUIZ-…` remis en caisse (`lookupRedeemCode` route
le préfixe vers `source: 'quiz'`, **8 préfixes** à sa livraison — **9 depuis le
2026-07-25**, voir « Encaissement en caisse — les 9 sources » ; RPC dédiée
`redeem_quiz_reward`, atomique et auditée) ou un **tour de roue offert**
(`consume_quiz_spin_grant` → `spins.source = 'quiz'` → flux de gain normal
`GAIN-…`, ADR-029), réservé aux modes à émission immédiate.

**Sécurité** : revue **GO conditionnel → tout corrigé** (`fe1e57b`) — le mode
`instant` émettait un lot sans qu'aucune réponse existe (ÉLEVÉ bloquant), Sybil
sur le corrigé complet (ÉLEVÉ → Turnstile sur le SEUL appel émetteur `finishQuiz`
et seulement si un lot est en jeu, rien sur join/start/submit — ADR-032), email
persisté sans consentement, purge laissant les réponses LIBRES (PII), et tirage à
vide qui figeait définitivement la dotation. Rate-limit ADR-032 : `failClosed`
uniquement sur la clé d'identité (`quizPlayerAction`, après résolution du
cookie), la clé partagée quiz + IP ne portant qu'un compteur fail-OPEN
d'observabilité (`quizPublicIp`). Purge RGPD `purge_expired_quiz_players` (cron
purge-data) par **anonymisation**. Détail, invariants et résidus assumés :
ADR-040, docs/bugs.md.

## Module Méta-progression

Branché le 2026-07-26 (ADR-044), livré depuis.
Gamification transversale à l'ensemble des expériences : missions, collections,
badges, clés et coffres, pass saisonnier. 1 713 lignes de SQL dormaient depuis
un chantier antérieur de l'audit 3 (14 tables `progression_*`, 13 fonctions,
aucune RPC appelée, aucune UI) — la seule fondation entièrement morte du
projet avant ce chantier.

**Le moteur est un trigger, pas un appel applicatif.**
`apply_meta_progression_event()` est branché sur `experience_events`, la table
d'analytics commune aux 9 expériences (roue, quiz, pronostics, chasse,
passeport, jackpot, événement live, calendrier, parrainage) : les missions
progressent automatiquement depuis les 9 expériences existantes, **sans une
seule ligne de code applicatif à ajouter dans chacune**. Brancher ce module a
donc consisté à livrer la lecture, l'écriture de configuration et l'ouverture
de coffre — la progression elle-même tournait déjà, silencieusement, dès la
première migration.

**3 migrations** : `20260805200000_meta_progression.sql` (1 713 l.,
préexistante) — **14 tables** : missions (+ versions, progression,
contributions), collections (+ items), badges (+ badges joueur), coffres (+
items, ouvertures), saisons (+ saisons joueur), items joueur ;
`20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`) —
18 fonctions : clôture / archivage / suppression de saison, édition et
suppression **bornées aux saisons à l'état brouillon**, sel serveur
`progression_chests.loot_seed` (le tirage était `md5(request_id ‖ item.id)`
avec un `request_id` **fourni par le client**, meulable hors ligne pour choisir
son objet — corrigé sans casser l'idempotence par `request_id`), table
`progression_engine_failures`, purge corrigée ;
`20260805220000_meta_progression_hardening.sql` (1 380 l., `3174cbd`) — suites
de la revue de sécurité.

**Invariant NON MONÉTAIRE.** Clés, badges, objets et coffres sont des
marqueurs d'engagement, pas des récompenses commerciales : aucun code de
caisse, aucune ligne `reward_issuances`, aucune colonne `*_cents` sur les
14 tables. Vérifié par **grep inverse** : aucun autre module du projet ne lit
ces tables, l'économie de clés est close sur elle-même. Une récompense
commerciale reste émise par sa source d'origine, jamais par la progression.

**L'interrupteur d'arrêt est le seul geste autorisé sur une saison lancée.**
Toute l'édition (missions, coffres, règles, dotations) est bornée au
brouillon ; `set_progression_mission_enabled` et
`set_progression_chest_enabled` font seuls exception et ne touchent **que**
la colonne `enabled`, jamais les règles ni les dotations. La clôture d'une
saison est **définitive** : aucune RPC ne la réactive. L'archive joueur
inclut les saisons échues non encore closes, pour que les badges d'un joueur
ne disparaissent pas de son écran entre `ends_at` et la clôture manuelle.

**Backend** : `src/lib/meta-progression.ts`,
`src/lib/validations/meta-progression.ts`, `src/actions/meta-progression.ts`
(**27 RPC exposées**), nouveaux seaux de rate-limit `progressionDevice` /
`progressionPlayerAction` / `progressionPublicIp`, 9e RPC de purge dans le
cron `purge-data`, sonde SLO du journal moteur
(`progression_engine_failures`) dans `src/lib/admin/ops.ts`.

**Frontend** : éditeur commerçant `/dashboard/progression` ; panneau joueur
(`src/components/wheel/progression-panel.tsx`) greffé au parcours public
**existant** `/play/[slug]` — **aucune nouvelle surface publique**, la
progression étant scopée par organisation et n'ayant aucun objet propre à
adresser par une URL. Le panneau n'est aujourd'hui visible que depuis la roue :
les missions **progressent** déjà depuis les 14 jeux rapides, le passeport, le
calendrier, le quiz, la chasse, le jackpot et l'événement live, mais rien n'y
affiche encore la progression au joueur (docs/bugs.md).

**Sécurité** : revue **GO conditionnel**, 0 CRITIQUE, 0 ÉLEVÉ, 3 MOYEN
corrigés (seau `failClosed` composé sur un `organizationId` **client** →
seau sur la clé d'identité seule, observation hissée avant le contrôle ;
commentaire d'invariant **faux** sur `org_progression_snapshot` — infirmait
qu'un caissier lise strictement moins qu'un visiteur, faux sur 4 points —
corrigé et réécrit ; interrupteur d'arrêt ajouté), 5 FAIBLE corrigés dont F1
(relecture d'idempotence du butin ignorant `chest_id`) et F2
(`progression_engine_failures` sans lecteur). Détail, invariants complets et
résidus assumés : ADR-044, docs/bugs.md.

**Tests** : **1 304 tests unitaires**, pgTAP `meta_progression.test.sql`
(**293 assertions**) + `security_acl.test.sql` (**506**), `e2e/progression.spec.ts`.
**Preuve obtenue** : la branche a été poussée et une PR (#29) ouverte
spécifiquement pour cela — impossible de les exécuter localement (Docker
Desktop exige un build Windows ≥ 19045, la machine de développement est figée
en LTSC 2021 / 19044). Résultat après 13 passages CI : **22/22 suites pgTAP,
1 781 assertions, E2E verts, PR entièrement verte (6/6 jobs)**. L'exécution a
révélé 8 défauts qu'aucune relecture n'avait vus (fonctions SQL inappelables,
ambiguïté de colonne, veto du registre universel sur les tables legacy,
double ligne Stripe, pagination Stripe, contraste a11y du bouton `danger`,
harnais E2E Stripe désaligné, suite pgTAP sans contexte d'appel) — détail
dans `docs/bugs.md`.

**Prérequis non satisfait, découvert en rejouant le parcours en local contre
un vrai Postgres** (`c131340`) : `experience_started` et `experience_completed`
— les deux événements émis par le spin de la roue — ne portent qu'un
`player_key`, jamais de `player_id`. `apply_meta_progression_event()` exige
`player_id` et renonce dès sa première garde ; `spins.player_key` ne
correspond à aucun `player_devices.token_hash` (jointure vide, mesurée). Ce
constat (ADR-045, 2026-07-26/27) attribuait la cause aux deux systèmes
d'identité qui « ne se rencontrent jamais » — **cause corrigée le 2026-07-27
(`a963583`)** : la résolution `player_id` depuis `player_legacy_identities`
existait déjà et fonctionne (`append_experience_event_internal`) ; la vraie
cause est un ordre d'écriture — `resolve_player_identity` insère l'adhésion
avant la ligne de pont, et c'est le trigger de l'adhésion qui portait le
rattrapage, lisant un pont pas encore écrit. Corrigé par un trigger
`AFTER INSERT` sur `player_legacy_identities`
(`20260805230000_experience_identity_backfill.sql`), qui corrige aussi une
dégradation de la source d'acquisition (`direct` → `unknown`) sur le même
premier passage. L'item 5 du backlog de l'audit 3 (« migration des cookies
existants »), un temps requalifié en prérequis de ce module, est **traité** —
voir ADR-045 (addendum), `docs/audit-3-backlog.md`. Le test E2E du panneau
joueur reste en `test.fixme` au 2026-07-27, non réactivé dans ce chantier.

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
l'abonnement courant puis applique idempotence, ordre, statut, plan et droits
dans une seule transaction PostgreSQL.

- `trialing` : accès tant que l'essai applicatif n'est pas expiré.
- `active` : accès complet.
- `past_due` : grâce applicative bornée à 14 jours.
- `canceled` ou `inactive` : dashboard consultable, jeux publics désactivés.

Les droits sont stockés dans `organization_entitlements`. Une reprise `legacy`
préserve les addons des comptes bêta tant qu'aucun snapshot Stripe n'existe.
Après le premier webhook V2, les items Stripe deviennent autoritaires et les
booléens `addon_*` ne sont plus que des projections de compatibilité protégées
contre les modifications directes. Les expériences sont regroupées par objectif
dans le catalogue commun ; la navigation n'affiche que celles qui sont actives
et la galerie `Découvrir` présente les autres.

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

## Rapport hebdomadaire

`org_weekly_digest` lit les neuf familles du registre universel des
récompenses et rend deux fenêtres (semaine écoulée, semaine précédente) en un
aller-retour : joueurs, lots remis, panier attribuable, podium. Le cron
`weekly-digest` n'envoie que si l'une des deux fenêtres porte de l'activité
(ADR-057) — jamais deux rapports vides d'affilée, mais une chute à zéro après
une semaine active reste envoyée. Les montants ne partent qu'aux rôles owner
et editor ; la RPC tourne en `service_role`, donc la garde de rôle est
entièrement applicative, doublée d'un gabarit qui omet la ligne de montant
plutôt que d'y écrire un zéro.

## Portefeuille du client

`/portefeuille` (surface publique) rassemble tous les gains d'un joueur,
toutes familles confondues, depuis le registre universel des récompenses.
**Aucun jeton ni identifiant dans l'URL** : la page identifie le joueur par
le cookie de l'appareil qui a scanné, et la garantie est tenue par le
compilateur — `loadPlayerWallet()` et `PortefeuillePage()` ne prennent aucun
argument (ADR-055). Le code de retrait n'est journalisé nulle part côté
serveur.

## Canal SMS

Prestataire **Brevo**, crédits prépayés facturés à l'unité par le
commerçant (ADR-056). L'expéditeur alphanumérique (≤ 11 caractères, nom
commercial déclaré, charte AF2M) ne peut pas recevoir de réponse : le STOP
arrive par le numéro court du prestataire via `/api/sms/webhook`, jamais
par le numéro du commerçant.

- Solde matérialisé adossé à un grand livre en ajout seul (3 triggers,
  non-divergence structurelle) ; coût stocké en micros.
- Le crédit ne peut pas être consommé deux fois sous concurrence : verrou
  posé au débit, prouvé par un contrôle chronométré (le second appelant
  concurrent attend réellement le verrou avant d'obtenir son refus).
- `not_enough_credits` est classé **avant** le statut HTTP (Brevo répond 400
  aussi bien pour un solde épuisé que pour un numéro invalide) — un solde
  épuisé n'est jamais traité comme définitif.
- Le numéro de téléphone est normalisé en E.164 par colonne calculée à
  l'écriture, un seul endroit : un consentement et son retrait (STOP)
  portent toujours la même clé, quelle que soit la graphie saisie.
- Le débit suit le nombre de segments SMS réels, pas un forfait par message
  (ADR-058) : `smsSegments()` calcule côté serveur avant toute réservation,
  1 à 6 segments, refus au-delà ; `sms.segment_mismatch` mesure l'écart
  avec le compte annoncé par Brevo après l'envoi.
- Premier producteur branché : un gagnant qui laisse son téléphone plutôt
  que son e-mail reçoit désormais son code par ce canal.

**Deux surfaces applicatives**, sans lesquelles le canal restait inerte
(`docs/bugs.md`, Critical) — les RPC d'expéditeur n'avaient aucun appelant :

- `/dashboard/settings/sms` (propriétaire seul) : demande d'expéditeur,
  état affiché en clair avec sa conséquence (« Déclaration en cours, aucun
  SMS ne peut partir »), motif sur refus/suspension, solde et 20 derniers
  mouvements du grand livre, packs de crédits Stripe (masqués si aucun prix
  n'est configuré pour un pack).
- Panneau « Canal SMS » sur la fiche commerçant du back-office : déclaration
  AF2M avec référence, refus / suspension / remise en attente / retrait
  avec motif, crédit manuel (`merchants.sms_credit`, super_admin seul).

**Achat de crédits par Stripe** : packs 100/500/2000 SMS, catalogue piloté
par variables d'environnement (un pack sans variable n'est pas proposé),
session Stripe en mode `payment`, crédité par le webhook
`checkout.session.completed` via `credit_sms_balance`.

**Corrigé le 2026-08-01** (migration `20260828120000_sms_findings.sql`,
commits `9f9cc3f`, `088daf2` — détail `docs/bugs.md`, ADR-059), les quatre
findings de la revue sécurité initiale : `request_sms_sender` exclut
désormais une ligne `suspended` de son `UPDATE` (le reset de `rejected` est
conservé, ce n'est pas une sanction) ; un index unique partiel
(`sms_credit_entries_one_purchase_per_reference`) rend l'idempotence du
webhook Stripe **au grand livre**, `credit_sms_balance` renvoyant l'entrée
déjà existante sur conflit plutôt que de lever ; le webhook route désormais
`checkout.session.async_payment_succeeded`/`.async_payment_failed` par le
même chemin que `completed` ; `processSmsSendJob` aligne la fenêtre de
péremption de `claim_sms_delivery` sur le verrou réel du job (120 s).

**Corrigé le 2026-08-01, troisième tour** (commits `301d04f`, `05754be`,
`5bfe506` — détail `docs/bugs.md`, ADR-060) : `declare_sms_sender` refuse
désormais tant que l'**organisation** porte une ligne `suspended`, retirée
ou non — ferme à la fois la redemande sous le même nom et sous un nom
**différent** ; un expéditeur `suspended` puis retiré reste affiché comme
sanctionné sur les deux écrans (`src/lib/sms-sender-state.ts`), avec un
refus explicite avant la base plutôt qu'un no-op muet ; `credit_sms_balance`
rend `(entry_id, created)`, lu par les deux appelants (back-office, webhook
Stripe), qui distinguent désormais un crédit d'un rejeu (audit
`.duplicate`/`.replayed`, écran ambre). Une **fenêtre horaire légale**
(8h-22h heure de Paris, jamais dimanche ni jour férié, 11 fériés dont 3
dérivés de Pâques) est posée dans un module pur (`src/lib/sms-window.ts`)
et appliquée dans le worker avant tout débit, rendant `retry` et jamais
`failed`.

**Corrigé le 2026-08-01, quatrième et dernier tour** (commits `31268a0`,
`76b257f`, `e432b20` — détail `docs/bugs.md`, ADR-061) : le trigger de
renommage d'expéditeur protégeait déjà le registre mais pas la sanction —
renommer un expéditeur `suspended` le laissait retomber en `pending`,
levant la suspension sans qu'aucun humain ne l'ait décidée ; corrigé par
une garde sur `old.status = 'suspended' or new.status = 'suspended'`
(migration `20260830120000`). Le client a tranché la question laissée
ouverte au tour 3 : **le code de retrait par SMS est transactionnel**
(`marketing: false`) — il sort de la fenêtre horaire (un gain de 23h30
part à 23h30), la mention STOP reste dans le message bien que sa garde ne
s'arme plus, le consentement reste exigé inchangé. Pour tout futur SMS
publicitaire, un report de fenêtre devient un état `deferred`
(`src/lib/jobs.ts`) qui repose `run_after` à la prochaine ouverture et ne
consomme plus le budget de reprise des pannes (`max_attempts`), borné par
un plafond d'âge de 7 jours. Les lignes `sms_log` figées en `sending`
au-delà de 24h sont désormais comptées (`sms.stale_sending`, index
`sms_log_stale_idx`), jamais remboursées automatiquement — on ne sait pas
si Brevo a reçu. Les deux écrans (`/dashboard/settings/sms`) distinguent
enfin « aucun expéditeur utilisable » (rouge) de « les SMS partent malgré
une suspension ailleurs » (ambre).

**Corrigé le 2026-08-02 — la prémisse ci-dessous était fausse, mesurée.**
La sonde `production-health.yml` (commit `46c33dc`, 17h36 UTC) prouve que
`jobs` répond `healthy` avec un battement inférieur à 15 min alors que le
seul filet Vercel passe à 04h20 UTC, treize heures plus tôt : les deux
secrets Vault existaient déjà en production et `lastchance-jobs-worker`
tournait déjà toutes les 5 minutes, avant même l'ouverture du chantier
`chantier/cadence-file`. Le panneau « Cadence des workers » livré par ce
chantier (ADR-062) n'est donc pas un déblocage mais une **rotation**
par-dessus une configuration qui fonctionne — le risque s'inverse, un
mauvais armement casse une file qui tourne plutôt que de débloquer une
file inerte. Reste ouvert, sans lien avec la cadence : la mention
STOP ne peut pas encore citer le numéro court réel tant que le compte
Brevo n'est pas ouvert, `BREVO_API_KEY` / `BREVO_WEBHOOK_SECRET` à poser
en production, et `sms.claim_refused` ne distingue toujours pas un crédit
épuisé d'un STOP.

**Corrigé en partie le 2026-08-01** (branche `chantier/cadence-file`,
commits `f7aa3fd`, `fe36d6b` — ADR-062) : poser les deux secrets Vault
n'exige plus qu'un humain manipule `CRON_SECRET`. Panneau « Cadence des
workers » (`/admin/monitoring`, `src/components/admin/worker-cadence-panel.tsx`,
permission `monitoring.cadence`) branché sur l'action
`enableWorkerFastCadence` (`src/app/admin/(protected)/monitoring/actions.ts`) :
le secret et l'URL de l'application sont lus dans l'environnement du
serveur, jamais transmis par le client ; l'URL cible est refusée si elle
n'est pas `https://` ou désigne un hôte local/privé
(`src/lib/admin/worker-cadence.ts`). **La RPC d'écriture au Vault livrée le
2026-08-01** (`set_worker_vault_secrets`, migration `20260831120000`,
commits `f127f8f`/`b362993`/`1d30c6b`) : elle n'écrit que dans les deux
entrées Vault que le registre `ops_worker_definitions` désigne pour le
worker demandé, jamais une case arbitraire ; un refus prévisible (worker
inconnu, prérequis Vault absents) est rendu comme valeur de retour plutôt
que levé — la justification d'origine (fuite dans les journaux Postgres)
s'est révélée fausse à la mesure (`log_parameter_max_length_on_error = 0`),
le design est gardé pour une autre raison : un refus prévisible n'a rien à
faire dans un journal d'erreur. Revue sécurité GO, 0 CRITIQUE,
0 ÉLEVÉ, 1 MOYEN (rien n'empêche d'armer la cadence depuis un déploiement
non-production). **Fermé le 2026-08-01, même branche** (commits `b97f344`,
`4bfa714`, `8c87128`) : `checkCadenceEnvironment` refuse hors
`VERCEL_ENV = production` et compare l'hôte de `NEXT_PUBLIC_APP_URL` à
`VERCEL_PROJECT_PRODUCTION_URL` quand elle est exposée ; l'avertissement
pré-clic du panneau, qui sous-déclarait le worker voisin dont l'entrée
Vault est aussi réécrite, est corrigé. La migration doit être **appliquée
en production** pour que le bouton fonctionne (sinon PGRST202) — mais,
depuis la correction du 2026-08-02 ci-dessus, ni elle ni le clic ne
conditionnent plus la cadence de la file, déjà à 5 minutes ; voir
`docs/production-readiness.md` §5bis.

## CRM, consentement et rétention

- Aucune action sociale, aucun avis et aucune coordonnée ne conditionnent le
  tirage. Les campagnes choisissent seulement les données nécessaires après gain.
- L'opt-in marketing alimente `newsletter_subscribers` avec désinscription par
  jeton signé.
- Le cron de réengagement cible les abonnés selon un délai de refroidissement.
- Le cron de purge applique la durée de conservation configurée par organisation,
  y compris aux joueurs et grilles de pronostics, aux joueurs de chasse au trésor
  (scans et complétions en cascade), aux passeports de fidélité dormants (tampons
  et récompenses en cascade, bornés sur la dernière activité), aux joueurs de
  jackpot collectif dormants (participations en cascade ; les hashes anonymes des
  tirages `jackpot_wins` sont conservés pour la vérifiabilité, aucune PII), aux
  joueurs des sessions d'événement live terminées (pseudos et réponses ; le registre
  anonyme des sessions et des gains est conservé), aux joueurs de calendrier de
  l'Avent (uniquement des calendriers `archived` — la purge est relayée par
  l'archivage automatique des calendriers écoulés, opt-in commerçant borné par la
  rétention), aux données de parrainage expirées (`purge_expired_referral_data`
  neutralise les emails opt-in des parrains au-delà de la fenêtre), aux
  participations de quiz expirées (`purge_expired_quiz_players` **anonymise** :
  prénom, email, avatar, opt-in et **réponses LIBRES** — du texte saisi, donc de
  la PII potentielle — en conservant l'issue des réponses pour que le score reste
  vérifiable, le registre des codes et le classement ; jamais conditionnée au
  statut du quiz, seule l'ancienneté de la participation compte) et au journal
  `email_log`.
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
- Les parcours Playwright incluent des scans axe-core (WCAG A/AA, helper
  `e2e/axe.ts`) qui font échouer le test sur toute violation serious ou
  critical.

Commandes de validation : `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build` et, après démarrage de la stack locale (Docker :
`supabase start` + seed, puis `npm run build` et `npm start`),
`npm run test:e2e`.
