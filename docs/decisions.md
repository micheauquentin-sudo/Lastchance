# Architecture Decisions - Lastchance

## ADR-001: Project Initialization with Memory System
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Starting fresh project needed structure for context preservation

**Decision**: 
Implement a Claude Code-based memory system with:
- State tracking files in `.claude/state/`
- Checkpoint system for milestones
- Continuous memory for cross-session context
- Documentation-first approach

**Rationale**:
- Maintains project context across Claude Code sessions
- Clear audit trail of decisions and changes
- Supports long-term project sustainability
- Enables smooth handoffs and context transfer

**Consequences**:
- State files become single source of truth for project status
- Requires disciplined updates to memory files
- Enables better context preservation than git alone

**References**:
- [Project State](../state/project-state.md)
- [Checkpoint](../state/checkpoint.md)
- [Memory](../state/memory.md)

---

## ADR-002: Branch Strategy
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Need clear branching strategy for single-developer workflow

**Decision**:
- Development branch: `claude/project-template-init-gvkmn5`
- Main branch: `main` (protected)
- All work commits to development branch
- PR to main for releases/milestones

**Rationale**:
- Isolates development work from main
- Maintains clean main branch history
- Enables testing before merge to main
- Clear tracking of feature work

---

## ADR-003: Documentation Structure
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Need organized documentation system

**Decision**:
Organize documentation into:
- `/docs/` - Architecture, roadmap, decisions, bugs
- `/state/` - Project state, checkpoints, memory
- `CLAUDE.md` - Quick context and navigation

**Rationale**:
- Clear separation between long-term docs and session state
- Easy navigation and reference
- Supports both long-term planning and session continuity

---

## ADR-004: No Business Logic at Initialization
**Date**: 2026-07-06
**Status**: Accepted
**Context**: Starting with clean slate, need deliberate approach to feature development

**Decision**:
- Initialization phase focuses on context and memory
- No business logic implementation during setup
- All context files created first
- Features defined in roadmap before implementation

**Rationale**:
- Ensures clear understanding before coding
- Prevents mid-stream context loss
- Establishes baseline for tracking
- Better requirements gathering

---

## Future Decisions Pending
- Aucune décision en attente : stack (ADR-005), base de données et
  multi-tenant RLS (ADR-006), tests (Vitest + suite E2E Playwright exécutée
  en CI), API (Server Actions + routes `src/app/api/`) et exigences de
  performance ([Performance Report](./perf-report.md)) sont actés et
  implémentés.

---

## Decision Log Template

When making future decisions, use:

```
## ADR-NNN: Title
**Date**: YYYY-MM-DD
**Status**: Pending/Accepted/Deprecated
**Context**: 

**Decision**: 

**Rationale**:

**Consequences**:

**References**:
```

---

## ADR-005 : Stack Next.js + Supabase + Stripe + Vercel
**Date** : 2026-07-06
**Status** : Accepted
**Context** : Pivot vers un SaaS multi-tenant de gamification pour commerces. Besoin d'un MVP robuste, déployable rapidement, sur plans gratuits.

**Decision** : Next.js 16 App Router (TS + Tailwind 4), Supabase (Auth + PostgreSQL RLS), Stripe Checkout + webhook, Resend, PostHog, Vercel. Server Actions plutôt que routes API (sauf webhook Stripe et export CSV).

**Rationale** : un seul repo, zéro infra à gérer, RLS = isolation multi-tenant au niveau base, plans gratuits suffisants pour le pilote.

---

## ADR-006 : Multi-tenant par organization_id + RLS
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : toutes les tables métier portent organization_id ; policies RLS via is_org_member() (SECURITY DEFINER). Le parcours public n'utilise jamais l'anon key : Server Actions + service role avec validations explicites.

**Consequences** : isolation vérifiée par tests SQL (intrus bloqué en lecture et écriture) ; un membre pourra appartenir à plusieurs orgs plus tard sans migration.

---

## ADR-007 : Spin tracé au lancer + claim token HMAC
**Date** : 2026-07-06
**Status** : Accepted
**Context** : le gain est révélé avant le formulaire ; il faut empêcher (a) de relancer jusqu'au lot désiré, (b) de forger un gain.

**Decision** : table spins insérée au moment du lancer (la limite de jeu s'y vérifie) ; résultat signé HMAC-SHA256 15 min renvoyé au client ; participations.spin_id UNIQUE contre le double-claim ; stock réservé atomiquement au spin (désormais via perform_atomic_spin, qui verrouille la fenêtre de jeu, tire et décrémente le stock dans la même transaction).

**Trade-off accepté** : un gagnant qui abandonne le formulaire consomme une unité de stock (préférable à distribuer plus que le stock).

---

## ADR-008 : RGPD by design
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : consentement CGU obligatoire (CHECK SQL + case non pré-cochée), opt-in marketing séparé, identité joueur pseudonymisée (SHA-256 salé IP+UA, jamais d'IP brute), gain jamais conditionné à un avis en ligne, données visibles uniquement par l'org propriétaire (RLS).

---

## ADR-009 : Délai de grâce de 14 jours sur les impayés (past_due)
**Date** : 2026-07-11
**Status** : Accepted
**Context** : `past_due` coupait les roues publiques immédiatement, alors que Stripe relance la carte pendant plusieurs jours (dunning) avant de résilier. Une carte expirée éteignait le jeu du commerçant sans préavis.

**Decision** : pendant `past_due`, l'accès est maintenu 14 jours à partir de l'entrée en impayé (`organizations.past_due_since`, posée par le webhook à la transition, effacée à la sortie). `hasActiveAccess` coupe au-delà de cette borne — même si le webhook final de Stripe (canceled/unpaid) n'arrivait jamais. Bannière dédiée dans le dashboard avec la date de coupure et un lien vers le portail de paiement.

**Consequences** : la coupure est exacte au spin (revalidation serveur à chaque lancer) et ≤ 30 s sur la page /play (ISR). Un impayé non daté (transition en cours) ne coupe pas — l'état incomplet est transitoire, le webhook date l'entrée.

---

## ADR-010 : Organisation active explicite par cookie validé sous RLS
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le modèle autorise plusieurs appartenances, mais le dashboard
sélectionnait la première ligne retournée par PostgreSQL avec `limit(1)`, sans
ordre ni choix utilisateur.

**Decision** : conserver l'id du tenant actif dans un cookie HTTP-only. À chaque
requête, charger les appartenances de l'utilisateur sous RLS et n'accepter le
cookie que s'il correspond toujours à l'une d'elles. Sans préférence valide,
choisir l'appartenance la plus ancienne avec un ordre déterministe. Afficher un
sélecteur dans le dashboard lorsque plusieurs organisations sont disponibles.

**Consequences** : aucune confiance d'autorisation n'est placée dans le cookie ;
un membre retiré bascule automatiquement vers une organisation encore valide.
L'acceptation d'une invitation active immédiatement l'établissement rejoint.

---

## ADR-011 : Gardes applicatives pour tout accès public service-role
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le parcours public doit contourner la RLS, mais des clés étrangères
simples ne garantissent pas à elles seules que toutes les lignes reliées portent
le même `organization_id`.

**Decision** : centraliser les invariants dans `public-resource-guards.ts` et
vérifier explicitement les relations QR → campagne → roue → lots et spin →
campagne → roue → lot avant toute décision ou écriture publique. Filtrer les
relectures de claim par tenant et limiter les colonnes d'organisation chargées
par le rendu public.

**Consequences** : une incohérence inter-tenant est refusée avec un message
générique et signalée au monitoring. Toute nouvelle opération publique utilisant
la service-role doit réutiliser ces gardes ou fournir une frontière équivalente
testée.

---

## ADR-012 : Classement Pronostics en SQL et worker de synchronisation 10 min
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le classement chargeait tous les joueurs et pronostics puis
agrégeait en JavaScript (intenable à plusieurs milliers de participants), et la
synchronisation des résultats reposait sur un cron Vercel quotidien (plan Hobby)
plus une synchro paresseuse à la visite — un résultat pouvait attendre le
lendemain, et des requêtes simultanées doublaient les appels fournisseur.

**Decision** :
- classement agrégé en base : RPC `contest_leaderboard` (totaux, `exact_count`,
  `prediction_count`, rang « competition », pagination, garde service-role /
  propriétaire) et `contest_player_rank` (position du joueur courant) —
  la page publique affiche le top 50 + la ligne du joueur, le dashboard pagine ;
- worker fréquent SANS quitter le plan Hobby : pg_cron + pg_net côté Supabase
  appellent `/api/cron/sync-contests` toutes les 10 minutes (URL et secret lus
  dans Vault à l'exécution, job inactif tant qu'ils n'existent pas — le cron
  Vercel quotidien reste en filet) ;
- rafraîchissement fournisseur verrouillé par ligue (`claim_fixture_refresh`,
  reprise sur verrou expiré), une paire d'appels par ligue distribuée à tous
  les championnats, ligues les plus périmées d'abord, budget temps 45 s avec
  report au passage suivant ;
- supervision : `contests.last_synced_at`/`last_sync_error`,
  `fixture_cache.provider_status`/`last_error`, alerte Sentry
  `cron.sync-contests.lag` au-delà de 3 h sans résultat.

**Consequences** : pas de table de résumé matérialisée à ce stade (l'agrégat
indexé suffit largement à l'échelle visée) — à réévaluer si un championnat
dépasse ~50 000 pronostics. L'activation prod du worker est une insertion Vault
unique (docs/observability.md). rankPlayers() reste la référence métier testée
du rang « competition », désormais reproduit par la RPC (pgTAP).

---

## ADR-013 : Règles de compétition — ex æquo, gel du règlement, clôture
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le rang « competition » (1, 2, 2, 4) pouvait attribuer une même
récompense à plusieurs joueurs, et rien n'empêchait un commerçant de modifier
barème ou récompenses après avoir vu les résultats.

**Decision** :
- politique d'ex æquo explicite, appliquée en SQL : points > nb de scores
  exacts > nb de bons écarts > question subsidiaire (écart absolu à la réponse
  officielle, posée à l'inscription) > tirage déterministe et auditable
  (`md5(contest_id, player_id)` — pré-engagé, aucun acteur ne peut l'influencer),
  le tirage n'étant appliqué qu'à la clôture pour garantir un joueur par rang ;
- gel du règlement dès le premier pronostic ou coup d'envoi : barème,
  récompenses et suppression de matchs pronostiqués exigent un motif
  (≥ 10 caractères) journalisé dans audit_logs ; question subsidiaire figée ;
  transitions de statut via RPC (matrice draft↔active→finished, réouverture
  motivée) — les colonnes status/rewards ne sont plus modifiables en direct ;
- clôture (`finalize_contest`, propriétaire) : photographie du classement final
  (`contest_final_standings`, rangs uniques) servie ensuite telle quelle par
  `contest_leaderboard`, attribution des lots (`contest_awards` : rang, joueur,
  lot, code de retrait PRONO-XXXXXXXX, statut remis/annulé audité), puis plus
  aucune modification ni réouverture possible.

**Consequences** : les paliers du barème sont strictement décroissants (les
compteurs d'exacts/écarts servent de départage). Une correction post-clôture
impossible par construction — en cas d'erreur avérée, seule voie : annuler les
lots un à un avec motif, le palmarès restant la trace de ce qui a été publié.
Comportement verrouillé par pgTAP (supabase/tests/contest_leaderboard.test.sql)
et un parcours E2E de clôture.

---

## ADR-014 : Récupération d'identité joueur par lien magique
**Date** : 2026-07-21
**Status** : Accepted
**Context** : l'identité joueur Pronostics tient à un cookie httpOnly de
180 jours. Cookie effacé ou téléphone changé : l'email est reconnu « déjà
inscrit » mais la grille est inaccessible.

**Decision** : lien magique par email (« Retrouver mes pronostics » sur la
page publique, y compris championnat terminé — un gagnant doit retrouver son
code) : jeton haché SHA-256 à usage unique, 30 minutes, une demande invalide
les précédentes ; réponse toujours neutre (pas d'oracle d'inscription) ;
double rate limit (championnat+IP, email ciblé) + Turnstile ; consommation
UNIQUEMENT au clic (les scanners d'emails suivent les liens) ; à la
confirmation, ROTATION du jeton appareil — les autres appareils sont
déconnectés — et récupération journalisée (contest.player.recovered).
Un compte joueur transversal multi-concours est volontairement différé
tant que l'usage réel ne le justifie pas.

**Consequences** : la récupération suppose la collecte d'email activée sur le
championnat (sinon le lien « Retrouver » n'apparaît pas — rien à envoyer).
L'échec d'envoi est signalé au joueur (pas de faux « email parti »). Table
`contest_recovery_tokens` service-role uniquement, parcours E2E complet via la
boîte mail de test du stub Resend (GET /_last).

---

## ADR-015 : File de travaux générique — les traitements longs hors HTTP
**Date** : 2026-07-21
**Status** : Accepted
**Context** : newsletter (jusqu'à 1 000 destinataires), relance clients
(toutes les organisations) et webhooks sortants vivaient dans des requêtes
HTTP synchrones ; le cron webhooks était quotidien alors que les retys sont
pensés en minutes — une livraison pouvait attendre 24 h.

**Decision** : table `jobs` unique (type, payload jsonb, statut queued/
running/completed/partial/failed, run_after, attempts/max_attempts,
locked_until, idempotency_key, last_error) réclamée par `claim_jobs` (FOR
UPDATE SKIP LOCKED) avec reprise des zombies (`requeue_stale_jobs`) et
backoff 1/5/15/60 min. Worker unique `/api/cron/jobs` toutes les 5 minutes
(pg_cron + Vault, secret partagé avec le worker de synchro ; cron Vercel
quotidien en filet) :
- `newsletter.send` — l'action ne fait plus que journaliser la campagne
  (statut queued, segment mémorisé) et déposer le job ; le journal expose
  queued → sending → completed / partial / failed avec bouton « Relancer »
  (jamais de double envoi : une campagne complète est refusée au rejeu) ;
- `reengage.org` — le cron quotidien dépose UN job par organisation
  (idempotent par jour), le worker relance org par org, erreurs isolées ;
- webhooks sortants — la file `webhook_deliveries` existante est drainée à
  chaque tick (retys en minutes réels) ; l'épuisement des 12 tentatives est
  matérialisé (`failed_at` = dead-letter) et rejouable depuis les Réglages.
Extensible aux prochains usages (exports, rappels pronostics, passes
Wallet) : un type + un handler.

**Consequences** : `org_segment_emails` accepte le service role (le ciblage
se fait au worker). `recipient_count` désigne désormais les CIBLÉS et
`sent_count` les envoyés (historique backfillé). Activation prod = un secret
Vault `jobs_worker_url` (le secret d'auth existe déjà). Comportement
verrouillé par pgTAP (supabase/tests/jobs_queue.test.sql) et l'E2E newsletter
qui déclenche le worker comme pg_cron le fait.

---

## ADR-016 : Monitoring mesuré — SLO affichés, plus d'état « OK » statique
**Date** : 2026-07-21
**Status** : Accepted
**Context** : la page monitoring du back-office marquait des services
« fonctionnels » en dur, et le healthcheck ne vérifiait que l'accès base +
configuration — pas l'état fonctionnel réel.

**Decision** :
- `monitored()` écrit chaque opération critique dans `ops_metrics`
  (durée, issue — best-effort, jamais bloquant, purge 30 j) : latences
  p50/p95 et taux d'erreur affichés sont des MESURES ;
- RPC de santé : `cron_last_success()` (dernier passage/succès de chaque job
  pg_cron), `applied_migrations_info()` (version appliquée) comparée à
  `EXPECTED_MIGRATION` (src/lib/release.ts) — un test unitaire lit le dossier
  des migrations et fait échouer la CI si la constante n'est pas à jour ;
  SHA de release via VERCEL_GIT_COMMIT_SHA ;
- la page affiche quatre objectifs mesurés : participation/réclamation
  erreur < 1 % (24 h), webhook sortant en file < 5 min, résultat sportif
  < 15 min après la fin attendue d'un match, aucun job actif > 30 min —
  plus files (jobs, webhooks, dead-letters), synchro sportive, âge du cache
  fournisseur, dernier webhook Stripe, acceptation emails 7 j.

**Consequences** : les rebonds email restent non instrumentés (webhooks
Resend non branchés) — affiché comme limitation explicite plutôt que faux
vert. Toute nouvelle migration exige le bump d'EXPECTED_MIGRATION dans le
même commit (le test release.test.ts y veille).

---

## ADR-017 : Cycle complet du gain — expiration serveur, panier, ROI, Wallet
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le compte à rebours du code n'était qu'un affichage client
(une capture d'écran ou l'email gardait le code utilisable), l'économie des
lots n'était pas suivie, et seul Google Wallet existait, sans invalidation.

**Decision** :
- expiration SERVEUR : `redeem_expires_at` figé à la réclamation (trigger,
  depuis le TTL de la campagne, historique backfillé) et VÉRIFIÉ par
  `redeem_by_code` — la caisse affiche « Code expiré » et la RPC refuse ;
- cycle complet : retrait (avec `basket_cents` facultatif saisi en caisse),
  annulation motivée (`cancel_participation` : audit + restock), expiration
  dérivée — statuts visibles sur la caisse et le tableau des participations ;
- économie : `prizes.cost_cents` / `value_cents` (éditeur de roue), RPC
  `org_prize_funnel` — taux gagné → réclamé → retiré, revenu attribuable
  (somme des paniers), coût des lots retirés, ROI estimé affichés sur la
  page Participations (30 j) ;
- Wallet : le pass Google porte `validTimeInterval` (expiration automatique
  côté portefeuille) et il est passé à l'état EXPIRED via l'API à chaque
  retrait/annulation (best-effort) ; Apple Wallet ajouté (`passkit-generator`,
  route /api/wallet/apple/[code]) derrière les variables APPLE_WALLET_* —
  sans certificats Apple Developer, le bouton n'apparaît pas.

**Consequences** : le « void » en direct d'un pass Apple déjà installé
exigerait le web service de mise à jour Apple — assumé hors périmètre : le
pass porte son expirationDate, la route refuse tout re-téléchargement d'un
gain mort, et l'échéance serveur fait foi en caisse quoi qu'il arrive.
L'activation d'Apple Wallet demande un compte Apple Developer (Pass Type ID,
certificats WWDR + signature) fourni par l'exploitant.
