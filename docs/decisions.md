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

---

## ADR-018 : Budget de gains imputé au claim, jamais remis à zéro
**Date** : 2026-07-21
**Status** : Accepted
**Context** : un commerçant veut borner ce qu'une campagne peut distribuer.
Le point de dépense réel est la réclamation (un spin gagnant abandonné ne
coûte rien) ; imputer au spin surestimerait, imputer au retrait arriverait
trop tard.

**Decision** : `campaigns.budget_cents` / `budget_spent_cents` ; le coût du
lot (`prizes.cost_cents`) est imputé ATOMIQUEMENT dans `claim_winning_spin`.
À l'atteinte du budget, la campagne est mise en pause dans la même
transaction (`paused_reason = budget_reached`) et un job
`automation.budget-paused` prévient le commerçant. La relance
(`resumeCampaignAfterBudget`, garde owner/editor) rouvre le jeu sans jamais
remettre `budget_spent_cents` à zéro : pour redonner de la marge, on
augmente le budget.

**Consequences** : un léger dépassement d'un lot est accepté par design (le
claim en cours au moment de l'atteinte aboutit — préférable à refuser un
gain déjà annoncé au joueur). Le compteur cumulatif rend la dépense
auditable sur toute la vie de la campagne.

---

## ADR-019 : Anniversaire — double consentement, date complète stockée
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le scénario `birthday` a besoin d'une date de naissance, une
donnée plus sensible qu'un simple email ; l'opt-in marketing générique ne
suffit pas à la justifier.

**Decision** : double consentement — la date n'est persistée
(`newsletter_subscribers.birth_date`) que si l'opt-in marketing ET la case
anniversaire dédiée (sous-option indentée, jamais requise, visible
seulement si l'opt-in marketing est coché) ET un email sont présents ;
âge borné 13..120. La présence de `birth_date` vaut consentement explicite.
La date complète est stockée ; les anniversaires sont fêtés dans le fuseau
de l'organisation (29/02 → 28/02).

**Consequences** : minimisation RGPD perfectible — jour + mois suffiraient
au scénario, l'année complète est stockée (évolution possible notée).
Limitation assumée (revue sécurité, FAIBLE) : un gagnant claimant avec
l'email d'un abonné existant de la même organisation peut écraser sa
birth_date (impact : mauvaise date de vœux ; durcissement possible : ne
poser birth_date que sur une ligne créée par le claim). Suivi dans
docs/bugs.md.

---

## ADR-020 : Rangs de ligue re-numérotés 1..n
**Date** : 2026-07-21
**Status** : Accepted
**Context** : une ligue privée est un sous-ensemble des joueurs du
championnat. Afficher les rangs globaux dans une ligue (ex. 12, 47, 103)
serait illisible et révélerait la position globale de joueurs qui n'ont
consenti qu'au classement de leur ligue.

**Decision** : `contest_leaderboard` et `contest_player_rank` acceptent
`p_league_id` et recalculent les rangs 1..n au sein de la ligue, avec la
même politique d'ex æquo que le général (ADR-013) — y compris après
clôture, où les rangs de ligue sont re-numérotés à partir du palmarès figé.

**Consequences** : le rang de ligue est un affichage dérivé — seuls le
classement général et `contest_final_standings` font foi pour les
récompenses. Aucune table supplémentaire : la re-numérotation est faite
par la RPC.

---

## ADR-021 : Coexistence reengage / scénario inactive assumée
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le cron de réengagement historique (`auto_reengage`,
refroidissement 30 j) et le nouveau scénario `inactive` (paliers 30/60 j,
dédupliqué par `email_log`) ciblent des populations qui se recouvrent.
Les fusionner pendant le chantier aurait mêlé refonte et nouveauté.

**Decision** : les deux mécanismes restent indépendants. Une organisation
qui active les deux peut doubler des relances ; un avertissement explicite
est affiché dans l'UI des automatisations quand `auto_reengage` est actif.
L'arbitrage produit (fusion, migration ou exclusion mutuelle) est
volontairement laissé ouvert.

**Consequences** : pas de double envoi silencieux — le commerçant est
prévenu au moment du réglage. À trancher avant la sortie de bêta ; suivi
en roadmap (« Suites ouvertes »).

---

## ADR-022 : Mode TV — lecture publique fail-open derrière cache CDN
**Date** : 2026-07-21
**Status** : Accepted
**Context** : l'écran TV en boutique doit rester affiché des heures sans
intervention. Un rate limit fail-closed (comme sur les écritures publiques)
transformerait une panne d'Upstash en écran noir chez le commerçant.

**Decision** : `GET /api/pronos/[slug]/tv` est en lecture seule, sans PII
(top 30, prénoms seuls), avec `s-maxage=30` (le CDN absorbe l'essentiel du
trafic), `noindex` et 404 générique. Le rate limit (30/min par IP) est
volontairement FAIL-OPEN : en cas de panne du limiteur, la route continue
de servir. Le client TV tolère les pannes (polling 45 s, conserve le
dernier classement affiché).

**Consequences** : exception documentée à la règle fail-closed du parcours
public — justifiée uniquement parce que la route ne révèle rien de
sensible et ne fait aucune écriture. Toute évolution ajoutant des données
personnelles à cette route devra repasser en fail-closed.

---

## ADR-023 : Chasse au trésor — addon d'organisation, récompense en lot direct
**Date** : 2026-07-22
**Status** : Accepted
**Context** : nouveau module de gamification — un parcours de QR codes
(étapes) à travers la boutique ou le quartier menant à un lot final. Deux
choix structurants : comment l'activer, et comment récompenser la
complétion. La roue existe déjà avec tout son cycle (tirage anti-triche,
claim HMAC, stock, expiration, Wallet).

**Decision** : addon d'organisation `organizations.addon_hunts`, miroir
exact d'`addon_pronostics` — activé depuis le back-office admin (option
payante ou incluse dans un plan), gating par `hasHuntsAccess` (addon +
`hasActiveAccess` : un essai expiré coupe aussi les chasses). La récompense
finale n'est PAS une roue : lot DIRECT décrit sur la chasse
(`reward_label`/`reward_details`, `reward_stock` optionnel), matérialisé à
la complétion par un code de retrait `CHASSE-XXXXXXXX` (même alphabet sans
I/O/0/1 que `GAIN-`/`PRONO-`), remis en caisse.

**Consequences** : aucune réutilisation du tirage/claim de la roue (il n'y
a aucun aléa — la complétion EST le gain). La remise passe par une RPC
DÉDIÉE `redeem_hunt_completion` plutôt que d'étendre `redeem_by_code`, dont
le contrat de retour est façonné participation (lot de roue, campagne,
panier, expiration) : l'étendre casserait ses appelants. La caisse est
unifiée à la LECTURE (`lookupRedeemCode` → `CashierMatch` discriminé par
`source: 'wheel' | 'hunt'`) mais chaque source garde sa RPC de remise. Pas
d'expiration du code de chasse en V1 (contrairement à la roue, ADR-017) —
évolution possible.

---

## ADR-024 : Attache-email de la complétion à usage unique
**Date** : 2026-07-22
**Status** : Accepted
**Context** : le code de retrait s'affiche à l'écran dès la complétion ;
l'email n'est qu'un rappel OPTIONNEL. La première implémentation acceptait
un email à chaque appel de `claimHuntReward`, sur une chasse déjà terminée.
La revue sécurité l'a classé ÉLEVÉ : email-bombing depuis le domaine Resend
du commerçant, et empoisonnement de sa newsletter par rappels successifs
avec un destinataire arbitraire. La roue n'a pas ce trou (l'email est fixé
une seule fois dans `claim_winning_spin`).

**Decision** : l'attache-email devient à usage unique par compare-and-swap
atomique — `update … set email=… where id=… and email is null` suivi de
`.select()`. Seul le PREMIER email rattache la ligne ; l'envoi Resend ET
l'abonnement newsletter (opt-in) ne se déclenchent que si une ligne a
effectivement été mise à jour. Tout rappel ultérieur (email différent
inclus) est un no-op idempotent (`emailed=false`), le code restant
consultable à l'écran.

**Consequences** : parité anti-abus avec la roue atteinte sans table ni
verrou supplémentaires (l'invariant se porte sur `email is null`). Un
joueur qui se trompe d'email au premier essai ne peut pas le corriger par
ce canal — accepté (le code reste affiché, le rappel mail est un confort).
Couvert par Vitest (2ᵉ email → 0 envoi, 0 abonnement).

---

## ADR-025 : Rate-limit de scan porté par l'entropie des jetons, pas par le seau IP
**Date** : 2026-07-22
**Status** : Accepted
**Context** : une chasse se joue là où le public partage une IP (galerie
marchande, festival, NAT d'opérateur mobile). Un plafond IP serré, calibré
comme les écritures publiques sensibles, verrouillerait tous les joueurs
légitimes derrière un même NAT dès qu'ils sont nombreux — l'incident
`pronoPredictIp` a déjà montré ce risque.

**Decision** : la sécurité du scan repose d'abord sur l'ENTROPIE des jetons
d'étape (`randomCode(16)` sur un alphabet de 32 caractères, ≈ 2⁸⁰ — non
énumérables) et sur un seau PAR COOKIE joueur (`huntScanPlayer`, 30/h) ; le
seau IP (`huntScanIp`) est un simple garde-fou anti-bot, relevé de 20 à
200 / 600 s (≈ 50 joueurs actifs derrière un NAT ; un bot mono-IP reste
capté à ~20 complétions / 10 min). Les deux seaux restent fail-closed avec
repli SQL `check_rate_limit` (le scan requiert déjà Postgres) — jamais de
verrouillage global sur panne Upstash.

**Consequences** : un attaquant ne peut de toute façon pas deviner un jeton
d'étape ; le rôle du seau IP est réduit à ce qu'il peut réellement porter.
Le tampon se fait au POST du bouton (jamais au GET : anti-prefetch), seul
point d'écriture. Recalibrage issu de la revue sécurité (MOYEN), couvert
par un test de la nouvelle valeur.

---

## ADR-026 : Aucune géolocalisation — anti-partage par délai minimal optionnel
**Date** : 2026-07-22
**Status** : Accepted
**Context** : garantir qu'un joueur est physiquement passé à chaque étape
plaiderait pour une vérification GPS ou une distance minimale entre scans.
Mais le principe fondateur du produit est qu'aucune donnée personnelle
n'est requise pour jouer (ADR-008) — la position en est une, sensible.

**Decision** : refus EXPLICITE de toute géolocalisation / distance
minimale. Le seul garde-fou anti-triche est un délai minimal OPTIONNEL
entre deux scans d'un même joueur (`hunts.min_scan_interval_seconds`,
0 = désactivé, plafond 24 h), qui décourage le partage de photos des QR
sans jamais lire la position. L'ordre imposé optionnel
(`order_mode = 'ordered'`) ajoute une contrainte de parcours, également
sans localisation.

**Consequences** : le produit n'a aucune preuve de présence physique — un
joueur déterminé peut se faire envoyer les photos des QR. Compromis assumé
au nom de la vie privée. Le défaut `min_scan_interval_seconds = 0` est à
l'étude (un défaut > 0 frictionnerait le partage d'entrée de jeu) — suivi
en roadmap.

---

## ADR-027 : Chasse au trésor V1 mono-organisation
**Date** : 2026-07-22
**Status** : Accepted
**Context** : une chasse « de quartier » réunissant plusieurs commerçants
partenaires (étapes dans des boutiques distinctes, lot commun) est une
demande naturelle. Mais toutes les tables de la chasse portent un
`organization_id` unique et les gardes inter-tenant (RLS, FK composites
`(id, organization_id)`, gardes service-role) supposent une seule
organisation propriétaire.

**Decision** : la V1 est délibérément mono-organisation. Étapes, joueurs,
scans et complétion appartiennent à la même organisation ; l'intégrité
inter-tenant est vérifiée par des FK composites `(step/player, hunt,
organization)` et une réponse générique unique côté public. Le
multi-commerçants partenaires (multi-tenant croisé : qui possède la chasse,
qui voit les joueurs, qui honore le lot) est un chantier distinct, reporté.

**Consequences** : le modèle de données et les gardes restent l'exact
miroir de Pronostics — aucune complexité multi-tenant croisée introduite
prématurément. L'ouverture au multi-commerçants demandera un modèle de
propriété partagée et une refonte des gardes ; noté en roadmap (« suites
ouvertes »).

---

## ADR-028 : Passeport de fidélité — addon d'organisation, récompense mixte lot/spin
**Date** : 2026-07-22
**Status** : Accepted
**Context** : nouveau module de gamification — le client cumule des visites
(« tampons ») sur un passeport dématérialisé, avec des paliers configurables
et des niveaux bronze/argent/or. Deux choix structurants, comme pour la
chasse : comment l'activer, et comment récompenser un palier.

**Decision** : addon d'organisation `organizations.addon_loyalty`, miroir
exact d'`addon_hunts` — activé depuis le back-office admin (option payante ou
incluse dans un plan), gating par `hasLoyaltyAccess` (addon +
`hasActiveAccess` : un essai expiré coupe aussi la fidélité). Cumul de visites
→ tampon numérique ; niveaux `bronze/silver/gold` calqués sur `visit_count`
(seuils `silver_threshold`/`gold_threshold` configurables). Les paliers
(`loyalty_milestones`, à N visites) portent une récompense MIXTE, choisie par
palier : `reward_type = 'lot'` (lot direct décrit sur le palier, code de
retrait `FIDELITE-XXXXXXXX` remis en caisse via `redeem_loyalty_reward`)
OU `reward_type = 'spin'` (tour de roue offert — ADR-029).
V1 mono-organisation (multi-établissements reporté).

> **Mise à jour GA (ADR-031, supersede ce point)** : le stock du palier,
> décrit ici à l'origine comme « optionnel », est devenu **obligatoire et
> fini** sur les DEUX types de palier (`lot` et `spin`), et un palier ne peut
> plus se déclencher avant la visite 2. C'est ce qui borne l'engagement
> financier du commerçant. Voir ADR-031.

**Consequences** : 5 tables (`loyalty_programs`/`_milestones`/`_members`/
`_stamps`/`_rewards`), miroir du modèle chasse (FK composites tenant, RLS
`is_org_member` en lecture d'équipe, `is_org_editor` en écriture). Le code
`FIDELITE-` partage l'alphabet sans I/O/0/1 des autres codes mais son préfixe
distinct sert au routage caisse par type. Le niveau (`tier`) est dénormalisé :
un léger retard après changement de seuil est rattrapé au tampon suivant. Pas
d'expiration du code de fidélité en V1 (comme la chasse, contrairement à la
roue). Remise par RPC dédiée `redeem_loyalty_reward` (contrat identique à
`redeem_hunt_completion` : atomique, auditée, org-scopée).

---

## ADR-029 : Tour de roue offert — grant à usage unique branché sur le moteur de spin
**Date** : 2026-07-22
**Status** : Accepted
**Context** : un palier de fidélité peut offrir un tour de roue. La roue existe
avec tout son cycle (tirage pondéré anti-triche, claim HMAC, stock, expiration,
Wallet) et une limite de jeu par-fenêtre. Il faut offrir un spin MÉRITÉ sans
dupliquer ce moteur ni affaiblir l'anti-triche du gain.

**Decision** : un palier `reward_type = 'spin'` cible une roue de la MÊME
organisation (`target_wheel_id`, FK composite tenant — impossible d'offrir la
roue d'une autre org). L'atteindre crée une ligne `loyalty_rewards` portant un
`grant_token` à usage unique (48 hex). `consume_loyalty_spin_grant` échange ce
jeton contre EXACTEMENT un tirage atomique sur la roue cible — même algorithme
pondéré que `perform_atomic_spin` (réservation de stock incluse) mais SANS la
limite de jeu par-fenêtre (le joueur a mérité ce spin). Le spin inséré porte
`source = 'loyalty'` (valeur ajoutée à la contrainte `spins.source`) et
débouche sur le FLUX DE GAIN NORMAL : jeton HMAC signé côté app →
`claim_winning_spin` → participation + code `GAIN-…`. Anti-rejeu par verrou de
ligne (`for update of r`) plus lien grant↔passeport (le grant seul, sans le
cookie du membre, ne consomme rien).

**Consequences** : le moteur spin/claim/Wallet n'est pas modifié — seule la
valeur `'loyalty'` s'ajoute à `spins.source` (spin journalisé distinctement,
hors stats direct/share et hors limite de jeu). Si la roue cible n'a plus
aucun lot disponible, le grant reste NON consommé (rejouable au
réapprovisionnement). Le client passe du passeport au tirage puis au retrait
de gain sans couture ni double comptage.

---

## ADR-030 : Passeport — deux modes de validation de visite, limites fermées avant GA
**Date** : 2026-07-22
**Status** : Accepted
**Context** : valider qu'un client est réellement venu est le cœur du module.
Deux approches, au choix du commerçant, aux compromis opposés.

**Decision** : le mode est porté par le PROGRAMME (`validation_mode`), jamais
par l'appelant :
- `rotating_code` : un code type TOTP à 6 chiffres tourne sur un écran au
  comptoir (`current_loyalty_code`, RPC service role). Le serveur recalcule le
  code attendu depuis `rotating_secret` et l'horloge, avec une fenêtre ±1
  période pour la dérive. Le secret NE SORT JAMAIS côté client (colonne exclue
  des grants `authenticated`, générée par trigger `SECURITY DEFINER`).
- `staff` : un membre owner/editor/cashier valide la visite depuis la caisse
  (scan du QR passeport) ; la RPC exige `p_validated_by` (identité du staff).
  L'action backend authentifie le rôle AVANT d'appeler avec le service role,
  ce qui ferme le chemin public sur un programme staff (un tampon staff sans
  validateur est refusé).

Cooldown anti-abus `min_stamp_interval_seconds` (défaut 24 h) ; tampon au POST
uniquement (jamais au GET) ; identité joueur = cookie HTTP-only + hash SHA-256
(aucune PII), miroir chasse.

Les deux limites initialement assumées pour la bêta ont été FERMÉES avant la
GA (8 revues sécurité successives, 2026-07-22) :
- mode `staff` : le QR n'encode plus le jeton de session (bearer 180 j) mais un
  **jeton de check-in signé HMAC, TTL 3 min**, qui n'autorise QUE la validation
  d'une visite par un staff authentifié — un QR photographié est inerte après
  expiration et ne donne accès ni aux codes de retrait ni aux tours offerts ;
- rejeu dans la fenêtre : planchers de cooldown durcis en base — 300 s en mode
  `staff` (TTL du jeton + marge) et `max(2 × période, 300 s)` en mode
  `rotating_code`, de sorte que la durée de validité d'un code soit TOUJOURS
  couverte par le cooldown. Un code lu une fois ne vaut donc jamais 2 tampons.

LIMITE RÉSIDUELLE RÉELLEMENT ASSUMÉE : en mode `rotating_code`, le code est
affiché publiquement par conception ; il peut donc être relayé à distance dans
sa fenêtre. Aucun mode ne prouve une présence physique — cohérent avec le refus
de géolocalisation (ADR-026). Ce qui borne l'abus n'est PAS le contrôle d'accès
mais l'économie du programme (ADR-031) : un passeport fabriqué ne vaut rien
(palier ≥ visite 2) et la perte totale est plafonnée par un stock fini
obligatoire.

**Consequences** : le mode `staff` est structurellement plus fort (un humain
atteste la visite) ; le mode `rotating_code` est livré parce que sa faiblesse
est neutralisée économiquement, pas parce qu'elle est négligeable. Le cooldown
reste la borne par passeport (au plus 1 tampon / passeport / intervalle).

---

## ADR-031 : Passeport — la boucle economique est fermee par des bornes produit, pas par du rate limiting
**Date** : 2026-07-22
**Status** : Accepted

**Context** : le module fabrique de la valeur encaissable (codes `FIDELITE-`,
tours de roue offerts) a partir de deux elements intrinsequement faibles : une
identite ANONYME et GRATUITE a creer (cookie, par conception : jouer ne demande
aucune donnee personnelle) et une preuve de presence molle (code affiche
publiquement au comptoir, ou geste d'un seul employe). Huit revues securite
successives ont montre qu'aucun empilement de rate limits ne fermait le
probleme : un seau borne un DEBIT, jamais une BOUCLE non bornee. Pire, chaque
tour de vis creait un deni de service (voir ADR-032).

**Decision** : borner l'ECONOMIE plutot que l'acces. Deux verrous, arbitres
avec le proprietaire du produit :
1. **Stock fini OBLIGATOIRE sur tous les paliers** — pour un palier `lot` il
   plafonne les codes de retrait emis ; pour un palier `spin` il plafonne les
   GRANTS emis. Plus de `reward_stock` null (« illimite »).
2. **Palier minimum a la visite 2** — un passeport fraichement cree ne declenche
   AUCUNE recompense, ce qui rend la frappe de masse d'identites sans objet.

En defense en profondeur : un tour offert par la fidelite ne peut pas tirer un
lot a stock illimite (la roue publique le tolere car elle est bornee par la
limite de jeu et la fenetre de campagne ; le tour offert n'a aucune de ces
bornes), et `consume_loyalty_spin_grant` verifie le statut et les dates de la
campagne ciblee.

**Consequences** : la perte maximale d'un commercant sous attaque optimale est
CHIFFRABLE et FINIE — mesuree a ~150 EUR de marchandise pour une configuration
type, atteinte en ~12 min, apres quoi le programme est sterile. Le commercant
perd deux libertes de configuration (« cadeau des la 1re visite », lot
« illimite ») ; c'est le prix de la borne, et l'editeur l'explique. Limite
residuelle assumee : un tour offert GAGNANT preleve une unite du stock de la
campagne publique ciblee et s'impute a son budget — transfert de cout que le
commercant fixe, desormais annonce dans l'UI.

---

## ADR-032 : Regle transverse — aucun seau fail-closed sur une cle partagee dans un parcours public
**Date** : 2026-07-22
**Status** : Accepted

**Context** : le meme piege s'est reproduit SIX fois pendant le chantier
passeport, y compris dans des correctifs censes durcir : un rate limit
`failClosed` pose sur une cle PARTAGEE entre utilisateurs (IP, programme,
organisation) est un INTERRUPTEUR. N'importe qui derriere le meme Wi-Fi de
commerce ou le meme CGNAT mobile coupe le service pour tous les autres, a un
cout derisoire (« deni d'inscription d'un programme entier pour ~10 EUR/jour »,
« interrupteur permanent a 0,1 req/s »). Le codebase documentait deja la lecon
sur `huntScanIp` sans qu'elle soit erigee en regle.

**Decision** : dans tout parcours PUBLIC,
- aucun seau `failClosed` sur une cle partagee entre utilisateurs ;
- une cle partagee ne porte qu'un seau LARGE et fail-OPEN, a valeur
  d'observabilite (`reportSecurityEvent`), jamais de refus ;
- le `failClosed` n'est admis que sur une cle propre a UNE identite
  (cookie/jeton/gain) ou a UN operateur authentifie (`user.id`) ;
- aucun seau n'est consomme AVANT la verification du jeton ou du cookie qui
  identifie l'appelant.

**Consequences** : la securite ne repose plus sur l'etranglement de cles
partagees mais sur l'entropie des jetons, les bornes par identite et les bornes
economiques (ADR-031). La regle a ete appliquee au module passeport sans
exception, puis retroactivement aux parcours partages (claim de gain). Dette
connue restante, hors perimetre de cette release et sans impact argent ni
multi-tenant (disponibilite seule) : `hunt:scan:ip`, `hunt:claim:ip`, la famille
`prono:*` et `spin:ip` — suivi dans docs/bugs.md.

---

## ADR-033 : Jackpot collectif — jauge partagée, tirage atomique équitable et vérifiable
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable à Pronostics / Chasse /
Passeport) — une CAGNOTTE COLLECTIVE : au lieu d'un tirage individuel par joueur,
tous les clients d'un commerce alimentent une même jauge partagée (chaque
participation validée = +1 sur un compteur global affiché en temps réel), et le
gain se déclenche au niveau de cette jauge. Trois choix structurants : comment
déclencher le gain sur un compteur partagé, comment garantir un tirage juste et
prouvable, et comment réutiliser l'anti-triche et les verrous économiques déjà
éprouvés sur le Passeport (ADR-030, ADR-031, ADR-032).

**Decision** :
- **Addon d'organisation `organizations.addon_jackpot`** (miroir exact
  d'`addon_loyalty`), activé depuis le back-office admin, gating par
  `hasJackpotAccess` (addon + `hasActiveAccess`). V1 mono-organisation : une
  seule jauge, une seule organisation propriétaire (le multi-commerces sur une
  même jauge = multi-tenant croisé, reporté — cf. ADR-027/ADR-028).
- **Jauge PARTAGÉE sans kill-switch** : le compteur global (`current_count`) est
  incrémenté de 1 par participation validée sous le verrou de la campagne. La
  participation publique applique STRICTEMENT ADR-032 — aucun seau `failClosed`
  sur une clé partagée (IP, campagne, organisation) ; la sécurité repose sur
  l'anti-triche par identité et sur les bornes économiques, jamais sur
  l'étranglement d'une clé commune (qui, sur une jauge de commerce, serait un
  interrupteur de déni de participation pour tous).
- **Anti-triche RÉUTILISÉ du Passeport** (ADR-030) porté par la campagne
  (`validation_mode`) : `rotating_code` (code type TOTP à 6 chiffres sur l'écran
  comptoir, secret jamais exposé au client, fenêtre ±1 période) ou `staff`
  (jeton de check-in signé HMAC, domaine `jackpot-checkin:`, validé par un membre
  owner/editor/cashier authentifié). Cooldown par joueur
  (`min_participation_interval_seconds`) à plancher durci ≥ 300 s : un code lu
  une fois ne vaut jamais 2 participations.
- **3 modes de résolution** (`draw_mode`) :
  - `threshold_draw` : à l'atteinte du seuil, tirage automatique et atomique
    parmi TOUS les participants du cycle ;
  - `rescan_win` : jauge pleine = campagne ARMÉE ; chaque participation
    ultérieure est une chance de gain INSTANTANÉ (le gagnant est toujours
    l'appelant) ;
  - `date_draw` : tirage à date via le cron `jackpot-draws`
    (`run_jackpot_date_draws`, pg_cron SQL direct).
- **Tirage ATOMIQUE, ÉQUITABLE et VÉRIFIABLE** : le tirage se fait sous verrou de
  la campagne, avec source cryptographique (`gen_random_bytes`), et l'unicité
  `unique(campaign_id, cycle)` sur `jackpot_wins` garantit UN SEUL gagnant par
  cycle — jamais de sur-émission. La graine du tirage (`draw_seed`) est
  JOURNALISÉE pour l'auditabilité (tirage reproductible / vérifiable).
- **Récompense = lot unique `JACKPOT-…`** remis en caisse (RPC dédiée
  `redeem_jackpot_prize`, miroir de `redeem_loyalty_reward`). **Stock fini
  OBLIGATOIRE** (ADR-031) = nombre de gagnants / cycles ; c'est ce qui borne
  l'engagement financier du commerçant.
- **`date_draw` = tirage UNIQUE (one-shot)** : après un tirage à date, le cycle
  N'EST PAS rouvert (`reward_claimed_count + 1` seul, pas de `cycle + 1` ni de
  remise à zéro de la jauge). Le garde `not exists jackpot_wins (…cycle…)` exclut
  ensuite définitivement la campagne des cron suivants. La campagne reste
  `active` (NON archivée) pour que le gagnant, tiré de façon asynchrone, puisse
  récupérer son code `JACKPOT-…` sur la page publique (`loadJackpotContext` exige
  `status = 'active'`).
- **Confidentialité du code (ADR-032 / défense en profondeur)** : en
  `threshold_draw`, le déclencheur du seuil n'est pas forcément le gagnant tiré ;
  le code de retrait n'est renvoyé QU'AU gagnant réel — deux couches :
  `case when v_is_winner then v_win_code else null` côté SQL, et
  `code: isWinner ? … : null` dans `mapJackpotParticipation` côté app. Le vrai
  gagnant récupère son code via la page publique (`jackpot_wins` filtré sur
  `winner_token_hash`).
- **Page publique suivable `/jackpot/[id]`** installable (PWA, manifest par
  campagne `manifest.webmanifest`) affichant la jauge en temps réel, un montant
  d'affichage croissant PUREMENT COSMÉTIQUE (`display_amount_cents`, aucun lien
  avec le stock réel) et un bloc de contenu commerçant. Écran comptoir temps réel
  (`/dashboard/jackpot/[id]/comptoir`). Caisse unifiée par `source`.

**Consequences** :
- La perte maximale d'un commerçant est CHIFFRABLE et FINIE (stock fini
  obligatoire = nombre de gagnants), comme sur le Passeport (ADR-031).
- **RGPD** : la purge (`purge_expired_jackpot_players`) conserve les hashes
  anonymes des tirages (`winner_token_hash`, SHA-256 d'un jeton aléatoire
  192 bits, aucune PII) pour la vérifiabilité du palmarès — conforme (aucune
  donnée personnelle retenue). Identité joueur = cookie HTTP-only + hash, aucune
  PII à la participation (miroir Passeport / Chasse).
- **Limites V1 assumées** (suivi docs/bugs.md, priorité basse) : (1) le stock
  résiduel d'un `date_draw` non distribué (un seul gagnant tiré, stock > 1) reste
  non attribué ; (2) après un tirage `date_draw`, les scans post-tirage
  incrémentent SEULEMENT la jauge cosmétique sans produire de gain. Ces deux
  compromis découlent directement du choix « tirage à date unique ».
- Le moteur anti-triche, les verrous économiques et la caisse ne sont pas
  dupliqués : le module réutilise les mécanismes du Passeport et n'ajoute que la
  logique de jauge partagée et les 3 modes de résolution.

---

## ADR-034 : Mode événement en direct — expérience synchronisée à trois interfaces, machine à états serveur
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable à Pronostics / Chasse /
Passeport / Jackpot) — une animation LIVE dans le commerce (bar, salle) où un
organisateur enchaîne des questions face à un public : l'écran de la salle
affiche la question, chaque client répond sur son téléphone, et un classement
s'actualise en direct. Trois choix structurants : comment tenir SYNCHRONISÉES
trois surfaces distinctes (écran, téléphones, télécommande), comment garantir
qu'aucune bonne réponse ne fuite avant la révélation, et comment scorer la
rapidité sans jamais faire confiance à l'horloge d'un client.

**Decision** :
- **Addon d'organisation `organizations.addon_events`** (miroir exact
  d'`addon_jackpot`), activé depuis le back-office admin, gating par
  `hasEventsAccess` (addon + `hasActiveAccess`). V1 mono-organisation.
- **Trois interfaces d'une même RUN, synchronisées** :
  - **écran public** (TV du bar, `/event/[code]/screen`) — question, décompte,
    répartition/podium, plein écran ;
  - **téléphone joueur** (`/event/[code]`, public) — le client rejoint avec un
    **pseudo + avatar** (aucune PII), répond, voit son rang ;
  - **télécommande organisateur** (`/dashboard/events/[id]/remote`,
    AUTHENTIFIÉE) — pilote la machine à états. `[code]` est le `join_code` de la
    session (résolu par `event-context.ts`, service-role + garde inter-tenant).
- **Moteur « question » générique** (`event_questions.kind`), un seul chemin de
  code pour trois usages : `quiz` (bonne réponse prédéfinie, scorée),
  `poll`/sondage (AUCUNE bonne réponse, on affiche la répartition des votes),
  `prono` (pas de bonne réponse à la création — l'organisateur la DÉSIGNE au
  reveal, `reveal_event_question(p_correct_option_id)`).
- **Séparation CONTENU / RUN** : le CONTENU réutilisable
  (`event_games` / `event_questions` / `event_question_options`) est édité à
  froid dans le dashboard ; la RUN jetable
  (`event_sessions` / `event_players` / `event_answers` / `event_wins`) porte
  l'état live. Un même jeu peut être rejoué en plusieurs sessions.
- **Machine à états SERVEUR** portée par `event_sessions.phase`
  (`lobby → question_active → question_locked → reveal → leaderboard → ended`),
  chaque transition étant une RPC `is_org_editor`
  (`start_event_session`, `launch_event_question`, `lock_event_question`,
  `reveal_event_question`, `show_event_leaderboard`, `end_event_session`).
  L'organisateur ne « pousse » jamais d'état : il fait avancer la machine, les
  trois surfaces relisent l'état officiel.
- **Récompense = podium à l'écran + lot fini `EVENT-…`** remis en caisse (RPC
  dédiée `redeem_event_prize`, miroir de `redeem_jackpot_prize`). **Stock fini
  OBLIGATOIRE** (ADR-031) = nombre de gagnants du podium ; c'est ce qui borne
  l'engagement financier du commerçant.
- Migration `20260727120000_events_live.sql`.

**INVARIANTS DE SÉCURITÉ** :
- **Non-fuite de la bonne réponse — 4 défenses redondantes** (vérifiées sur les
  payloads réels par la revue). La colonne `event_question_options.is_correct`
  (quiz) et la désignation `prono` ne doivent JAMAIS être lisibles par le public
  avant la phase `reveal` : (1) grants anon RÉVOQUÉS sur toutes les tables du
  module (le public n'a aucun accès SQL direct) ; (2) lecture publique UNIQUEMENT
  via la RPC `event_public_state`, qui EXCLUT la correction tant que
  `phase ≠ 'reveal'` ; (3) le mapping backend (`mapEventPublicState`) re-filtre
  la correction hors reveal, pour qu'une régression SQL ne puisse pas re-fuiter ;
  (4) AUCUN autre chemin public n'expose la correction (join/submit ne la
  renvoient jamais).
- **Scoring SERVEUR-AUTORITATIF** : `launch_event_question` pose
  `event_sessions.current_question_started_at = now()` (serveur) ; au submit,
  `elapsed_ms = now() - current_question_started_at` est calculé EN BASE — aucune
  valeur de temps client n'est jamais acceptée. `submit_event_answer` refuse
  toute réponse hors fenêtre ou hors phase (`phase ≠ question_active`, autre
  question courante, délai dépassé), l'unicité `(session, question, joueur)` rend
  la réponse immuable, et le verrou `for update` est homogène entre reveal et
  submit (pas de course). Les points ne sont écrits qu'au reveal, par
  `reveal_event_question` (SECURITY DEFINER).
- **Transport temps réel — polling PRIMAIRE, Realtime ping-only** (première
  brique temps réel du projet). Le canal nominal est le POLLING de `getEventState`
  (→ `event_public_state`) : les trois surfaces marchent SANS Supabase Realtime.
  Le broadcast Realtime est une OPTIMISATION de latence activable
  (`EVENTS_REALTIME_ENABLED`) qui ne diffuse QU'UN ping « refresh » horodaté
  (aucun état métier sur le canal → rien à fuiter, la bonne réponse ne transite
  jamais par le broadcast) : le client, au ping, redéclenche un `getEventState`
  service-role. Coupable à tout moment sans perte de correction.
- **Rate limiting (ADR-032)** : `join`/`submit` sont publics et joués à IP
  PARTAGÉE (Wi-Fi du bar) → aucun seau `failClosed` sur une clé partagée. Seuls
  les seaux d'identité (cookie joueur) et d'opérateur (session/organisateur) sont
  bloquants ; l'IP n'est qu'en observabilité fail-open.

**Rationale** : une seule source de vérité (l'état serveur relu par les trois
surfaces) évite toute divergence entre écran, téléphones et télécommande sans
protocole de synchronisation applicatif. Le moteur « question » générique livre
quiz, sondage et prono par configuration, pas par trois chemins de code. Le
polling primaire garantit que le module fonctionne même sans le canal Realtime du
projet (qui n'existait pas avant ce chantier), ce dernier n'apportant que de la
latence.

**Consequences** :
- Réutilisation directe d'ADR-031 (stock fini obligatoire borne la perte
  commerçant) et d'ADR-032 (parcours public à clé partagée, jamais de kill-switch).
- **Limites V1 assumées** (suivi docs/bugs.md) :
  - **Capture du podium par sybil multi-cookie** : un joueur peut recréer
    plusieurs identités (cookies/pseudos) et truster le podium. L'abus est BORNÉ
    par le stock fini du lot (ADR-031) ; parade optionnelle non retenue en V1 :
    Turnstile au premier `join`.
  - **RGPD** : la purge (`purge_expired_event_sessions`) supprime les pseudos et
    les réponses des sessions expirées ; le registre des sessions
    (`event_sessions`) et des gains (`event_wins`) est conservé ANONYME (aucune
    PII — pseudo/avatar publics par conception, hash de jeton, aucune coordonnée
    à la participation). Conforme.
  - Le pseudo est durci contre le brouillage d'affichage (refus des caractères
    de contrôle/formatage Unicode Cc/Cf — bidi, zéro-largeur ; pas de faille XSS,
    React échappe, mais évite l'usurpation et le brouillage de l'écran TV —
    finding FAIBLE de la revue, résolu `e39a40c`).

---

## ADR-035 : Calendrier de l'Avent & campagnes quotidiennes — gating temporel serveur, non-fuite du contenu non ouvert
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable à Pronostics / Chasse /
Passeport / Jackpot / Événement) — une campagne QUOTIDIENNE à mécanique
ANNUELLE : le joueur, venu par le lien/QR du commerce, revient chaque jour ouvrir
UNE case (Avent, semaine anniversaire, compte à rebours, 7 jours de cadeaux,
festival multi-jours, lancement produit, semaine soldes), OU suit le calendrier à
distance en s'abonnant à un rappel email. Deux propriétés sont le cœur du
produit et de la sécurité : il doit être IMPOSSIBLE d'ouvrir une case en avance,
et le contenu d'une case non encore ouverte ne doit JAMAIS fuiter.

**Decision** :
- **Addon d'organisation `organizations.addon_calendar`** (miroir exact
  d'`addon_events`), activé depuis le back-office admin, gating par
  `hasCalendarAccess` (addon + `hasActiveAccess`). V1 mono-organisation.
- **4 types de case** (`calendar_days.kind`) : `content` (message/offre affiché),
  `lot` (code de retrait `CADEAU-…` à stock fini), `spin` (tour de roue offert →
  branché sur le moteur de spin existant, grant à usage unique via
  `consume_calendar_spin_grant`, source `spins.source = 'calendar'` — miroir du
  tour offert Passeport, ADR-029), plus une **récompense d'assiduité finale**
  (toutes les cases ouvertes → un `CADEAU-…` supplémentaire). Une case peut être
  marquée « spéciale » et partagée.
- **Migration `20260728120000_calendar_campaigns.sql`** : 5 tables `calendars`,
  `calendar_days`, `calendar_openings`, `calendar_rewards`, `calendar_players`
  (FK composites tenant, RLS org-scopée `is_org_member`/`is_org_editor`, aucun
  accès anon). RPC service-role : `join_calendar`, `open_calendar_box`,
  `consume_calendar_spin_grant`, `calendar_public_state`,
  `calendar_reminder_targets`, `redeem_calendar_reward`,
  `purge_expired_calendar_players` (+ trigger `calendars_set_defaults` qui dérive
  les `unlock_at`). `spins.source` étendu à `'calendar'`.
- **Récompense = lot fini `CADEAU-…`** remis en caisse (RPC dédiée
  `redeem_calendar_reward`, miroir de `redeem_event_prize` — org-scopée, auditée),
  couvrant DEUX origines du même préfixe : une case-lot (`calendar_openings`) et
  la récompense d'assiduité (`calendar_rewards`). **Stock fini OBLIGATOIRE**
  (ADR-031) borne l'engagement financier du commerçant. Caisse unifiée par
  `source` — `lookupRedeemCode` route désormais **6 préfixes**
  (roue/chasse/fidélité/jackpot/événement/calendrier).
- **Transport = polling** (miroir des autres parcours publics ; le Realtime
  ping-only introduit par l'Événement — ADR-034 — n'est pas requis ici, une case
  se déverrouille à échéance fixe, pas en direct).
- **5 thèmes « carton »** (`calendar-theme.ts` : neutre / noël / anniversaire /
  soldes / festival) ; page publique `/calendar/[slug]` installable (PWA,
  `manifest.webmanifest` par calendrier). Rappel quotidien opt-in via le cron
  Vercel `/api/cron/calendar-reminders` (`15 9 * * *`).

**INVARIANTS DE SÉCURITÉ (2 neufs, confirmés par revue adversariale)** :
- **Gating temporel SERVEUR-AUTORITATIF** : `open_calendar_box` tranche sur
  `now()` (horloge base) contre `unlock_at`, jamais sur un horodatage client.
  `unlock_at` est DÉRIVÉ serveur (minuit civil de `start_date + offset` dans le
  fuseau du calendrier, recalculé à chaque modification de grille — robuste au
  changement d'heure via `Intl.DateTimeFormat`, `calendarDayUnlockAt`) et
  modifiable seulement par `is_org_editor`. Ouvrir une case en avance est
  impossible par construction.
- **Non-fuite du contenu d'une case non ouverte — quadruple défense** : (1) la RPC
  `calendar_public_state` n'expose, hors état `opened`, que
  `{day_index, unlock_at, status, is_special}` — jamais le contenu ; (2) le
  mapper backend force le contenu à `null` pour toute case non ouverte ; (3) une
  tentative trop précoce (`too_early`) ne renvoie AUCUN contenu ; (4)
  RLS/grants — le public n'a aucun accès SQL direct.

**Rationale** : le déverrouillage à échéance fixe et l'absence de fuite reposent
sur une source de vérité unique (l'état serveur : `now()` en base et `unlock_at`
dérivé serveur), jamais sur le client. Le module réutilise les mécanismes
éprouvés — moteur de spin et flux de gain (ADR-029, tour offert), stock fini
obligatoire (ADR-031), règle rate-limit (ADR-032), caisse unifiée par `source`
(ADR-023) — et n'ajoute que la logique de cases temporisées et de rappel.

**Consequences** :
- **Rate-limit (ADR-032)** : parcours public à clé partagée (Wi-Fi du commerce) —
  aucun seau `failClosed` sur clé partagée ; seuls les seaux d'identité (cookie
  joueur) et d'opérateur authentifié sont bloquants, l'IP reste en observabilité
  fail-open.
- **Décision anti-spoiler (finding de revue, corrigé `5c4d89f`)** : le
  préchargement des roues cibles des cases `spin` révélait, dans le payload RSC,
  les segments (lots) et la config de collecte de TOUTES les roues visées, y
  compris des cases de jours VERROUILLÉS (un visiteur pouvait lire le lot rare
  d'une case future). L'invariant strict #2 n'était PAS cassé (aucune association
  jour→roue, aucun code de retrait exposé), mais le spoiler était réel. Fix :
  préchargement limité aux roues des cases DÉJÀ ouvertes par le joueur, et
  `openCalendarBox` renvoie le bundle de la case qu'il vient d'ouvrir (module
  `src/lib/calendar-spin-bundle.ts`, `loadCalendarSpinBundles` ; `organizationId`
  ajouté au contexte d'action ; côté client `allBundles` = préchargé +
  à-la-volée). Vérifié : typecheck ✓, eslint ✓, 775 tests ✓.
- **Résidus assumés** (suivi docs/bugs.md, priorité basse) :
  - **UUID des cases (`dayIds`) exposés au client, futurs compris** —
    ASSUMÉ/neutralisé : `open_calendar_box` sur un UUID verrouillé renvoie
    `too_early` sans aucun contenu ; les restreindre casserait le déverrouillage
    à minuit page ouverte (les `dayIds` ne sont pas rafraîchis par le poll).
  - **Purge RGPD conditionnée à l'archivage** —
    `purge_expired_calendar_players` ne purge que les calendriers `archived` ;
    l'archivage automatique n'a lieu que pour les organisations à
    `data_retention_months` non nul (opt-in commerçant assumé, relayé par le cron
    de rappel/archivage).
  - `calendar_public_state` ne re-vérifie pas addon/statut actif (service-role
    only ; les server actions gatent avant appel) — sans conséquence.
- Vérifs CI-only (Docker absent en local) : pgTAP `calendar.test.sql`, E2E
  `e2e/calendar.spec.ts`, seed.

---

## ADR-036 : Parrainage ludique — validation par PARTICIPATION réelle, économie bornée, jauge d'équipe partagée
**Date** : 2026-07-24
**Status** : Accepted
**Context** : nouveau module de croissance (comparable à Pronostics / Chasse /
Passeport / Jackpot / Événement / Calendrier) greffé sur les campagnes ROUE — un
joueur satisfait devient PARRAIN et invite ses proches ; chaque filleul qui vient
JOUER fait progresser une jauge d'« équipe » partagée et débloque des récompenses
pour le parrain, le filleul et, au seuil, un coffre collectif. Quatre choix
structurants ont été tranchés avec le propriétaire du produit : (1) sur quoi porte
le parrainage et comment l'activer, (2) ce qui vaut « parrainage validé », (3) qui
gagne quoi et comment le commerçant le configure, (4) ce qu'est une « équipe ». Le
module fabrique de la valeur encaissable (codes `PARRAIN-…`, tours de roue offerts)
à partir d'une identité ANONYME et GRATUITE — même profil de risque que le Passeport
(ADR-031) et le Jackpot (ADR-033).

**Decision (4 arbitrages)** :
1. **Périmètre & activation** : parrainage sur les campagnes ROUE uniquement,
   opt-in PAR CAMPAGNE (`referral_programs.enabled`) SOUS un addon global
   d'organisation `organizations.addon_referral` (miroir exact d'`addon_calendar`,
   activé au back-office admin). Le lien de parrainage est un paramètre de la page
   de jeu existante `/play/[slug]?ref=PR-…` — aucune nouvelle surface publique.
2. **Preuve = PARTICIPATION réelle, jamais un clic** : un filleul n'est validé que
   lorsqu'il a réellement JOUÉ un spin sur la campagne (gagnant OU perdant =
   « participant »). `validate_referral` exige un `proof_spin_id` — un spin réel du
   device filleul sur la campagne, non forgeable, non rejouable, unique — et n'est
   appelé qu'APRÈS le spin réel. Un lien ouvert sans jouer ne vaut rien. Ce choix
   sert aussi l'intention produit (« le parrain gagne quand un ami PARTICIPE »).
3. **Récompenses en CONFIG LIBRE, à trois versements** : le commerçant configure
   librement, par campagne, trois versements indépendants, chacun `none | spin |
   lot` : au PARRAIN (par filleul validé), au FILLEUL (bienvenue) et un COFFRE
   collectif au SEUIL (`chest_threshold`, défaut 3 filleuls). `lot` = code de
   retrait `PARRAIN-…` à STOCK FINI remis en caisse ; `spin` = tour offert sur la
   roue de la campagne (grant à usage unique → tirage → flux de gain normal
   `GAIN-…`, ADR-029, `spins.source = 'referral'`).
4. **« Équipe » = groupe parrain+filleuls à jauge/coffre PARTAGÉS, sans
   classement** : la jauge (`referral_sponsors.validated_count`) et le coffre sont
   collectifs et débloqués une seule fois au seuil ; il n'y a AUCUN classement entre
   parrains (choix explicite : coopératif, pas compétitif).

**Modèle** — migration `20260729120000_referral.sql` : colonne `addon_referral` ;
`spins.source` étendu à `'referral'` ; 4 tables org-scopées (FK composites tenant,
RLS `is_org_member`/`is_org_editor`, aucun accès anon) : `referral_programs`
(1/campagne, les 3 versements `{sponsor,filleul,chest}_reward_{kind,label,details,
stock,claimed_count}`), `referral_sponsors` (device `sponsor_key`, code partageable
`PR-…`, jauge `validated_count`, `chest_rewarded`), `referral_signups` (filleul
validé, `proof_spin_id`, unique device × campagne), `referral_rewards` (versement
émis : code `PARRAIN-…` OU `spin_grant_token`). 7 fonctions SECURITY DEFINER
(6 RPC service-role — `ensure_referral_sponsor`, `referral_public_state`,
`validate_referral` [cœur anti-abus], `consume_referral_spin_grant`,
`redeem_referral_reward`, `purge_expired_referral_data` — + 1 helper interne
`referral_emit_reward`). Caisse unifiée : `lookupRedeemCode` route désormais
**7 préfixes** (roue/chasse/fidélité/jackpot/événement/calendrier + parrainage).

**INVARIANTS DE SÉCURITÉ (revue GO, 0 bloquant)** — l'anti-abus est 100 % serveur et
borné par l'ÉCONOMIE (ADR-031) plus que par les rate limits (ADR-032) :
1. **Pas de récompense sur un clic** : `validate_referral` exige un spin RÉEL
   (`proof_spin_id` non forgeable / non rejouable / unique).
2. **Auto-parrainage et boucle directe bloqués** : self (même device ou même email)
   et boucle A→B→A refusés. Les cycles ≥ 3 ne sont pas détectés mais restent bornés
   par le plafond + la fenêtre + le COÛT (N spins réels de N devices).
3. **Bornes device** : 1 filleul par campagne et par device, fenêtre `window_days`,
   plafond `sponsor_max_filleuls`.
4. **Récompenses plafonnées** : stock FINI obligatoire sur tout `lot` (ADR-031),
   décrément atomique conditionnel, coffre versé une seule fois sous verrou.
5. **Multi-tenant** : tables org-scopées (RLS + FK composites), `redeem_referral_reward`
   org-scopée et indistinguable, `saveReferralProgram` n'écrit JAMAIS les
   `*_claimed_count` (compteurs pilotés en base seulement).
6. **Non-fuite** : `referral_public_state` ne renvoie que le parrain courant ; le
   prop public `referral` de la page de jeu ne porte que des libellés et des `kind`,
   jamais de stock, de compteur ni de code.
7. **Rate-limit (ADR-032)** : `failClosed` sur la seule clé d'IDENTITÉ device
   (`anonymousPlayerKey`, hash SHA-256, seau `referralPlayerAction` 60/60 s) ; la clé
   IP partagée ne porte qu'un seau LARGE fail-OPEN d'observabilité
   (`referralPublicIp` 1200/600 s), jamais de refus.
8. **Jetons & RGPD** : `spin_grant_token` 192 bits anti-rejeu ; codes `PR-…` /
   `PARRAIN-…` CSPRNG (`gen_random_bytes`) ; `purge_expired_referral_data` neutralise
   les emails opt-in des parrains expirés.

**Durcissements de fin de chantier** (`6d7bfba`) : (a) NO-ORACLE — `validateReferral`
collapse tous les états de refus (self, boucle, hors fenêtre, plafond, addon/campagne
inactive, code inconnu) en un `rejected` unique côté action, pour ne rien apprendre à
un attaquant ; (b) DÉFENSE EN PROFONDEUR — `referral_public_state` re-vérifie en
interne addon + `enabled` + campagne active (les server actions gatent déjà avant
appel).

**Rationale** : le module réutilise les mécanismes éprouvés — moteur de spin et flux
de gain (ADR-029), stock fini obligatoire (ADR-031), règle rate-limit (ADR-032),
caisse unifiée par `source` (ADR-023) — et n'ajoute que la logique de parrainage. La
preuve par PARTICIPATION réelle (et non par clic) est ce qui rend la fraude coûteuse :
fabriquer un filleul coûte un spin réel d'un device distinct, et la perte maximale
reste plafonnée par le stock fini.

**Consequences** :
- Perte maximale du commerçant CHIFFRABLE et FINIE (stock fini obligatoire), comme
  Passeport (ADR-031) et Jackpot (ADR-033).
- **Résidus assumés** (revue GO, suivi docs/bugs.md, priorité basse) :
  - **Dédup EMAIL inerte dans le flux post-spin** : `validateReferral` étant appelé
    APRÈS le spin (donc avant le claim qui collecte l'email), `filleul_email` est
    toujours absent au moment de la validation — la dédup email SQL, présente et
    correcte, n'est jamais alimentée. Accepté : la dédup email ne borne PAS le
    vecteur multi-devices (décorative) ; la vraie borne est stock fini + plafond +
    fenêtre + spin rate-limité. Câblage best-effort au claim = amélioration future.
  - **Amplification ~3× des tirages** en configuration sponsor=`spin` ET
    filleul=`spin` (les tours offerts contournent `play_limit`, comme fidélité /
    calendrier) : BORNÉE par le stock fini des lots de la roue (ADR-031). Note de
    dimensionnement commerçant : garder ≥ 1 lot à stock fini sur la roue (sinon
    `no_prize` sur les tours offerts).
  - **Entropie `referral_code` = 40 bits** (`PR-` + 8 caractères sur un alphabet de
    32) : suffisant pour un identifiant PARTAGEABLE non secret (≠ `spin_grant_token`,
    192 bits).
- Vérifs CI-only (Docker absent en local) : pgTAP `referral.test.sql`, E2E
  `e2e/referral.spec.ts`, seed `PARRAIN-E2ECHEST`.

---

## ADR-037 : Jeux rapides — moteur de tirage partagé (socle GameShell) + jeux skill-gated (moteur à 2 temps)
**Date** : 2026-07-24
**Status** : Accepted
**Context** : demande client — ajouter BEAUCOUP de mini-jeux qui partagent le même
moteur de campagne (éligibilité, probabilités, lots, stocks, réclamation,
statistiques, thème, consentement, partage), de sorte qu'« ajouter un jeu = ajouter
une interface ». Le point d'extension existait déjà : `wheels.game_type` (V1.4, la
roue et la carte à gratter partagent `spinWheel` / `perform_atomic_spin` /
`claimPrize`). Il restait à le FORMALISER en socle et à l'étendre. Deux arbitrages
ont été tranchés avec le propriétaire du produit : (1) livrer 13 nouveaux jeux, (2)
en faire deux familles — des jeux de pure RÉVÉLATION (le résultat est déjà décidé
serveur) et des jeux de DÉFI *skill-gated* (l'issue dépend d'une réussite du joueur,
sans jamais affaiblir l'anti-triche du gain).

**Decision (2 vagues)** :

- **Vague 1 — 7 jeux de RÉVÉLATION** (`flip_card`, `cups`, `slot`, `memory`,
  `chest`, `dice`, `draw_card`). Migration `20260730120000_quick_games_reveal.sql` :
  simple extension de la contrainte `wheels_game_type_check`. Socle client
  `game-shell.tsx` (`<GameShell>`) EXTRAIT du grattage : il factorise les états
  idle / gagné / perdu / bloqué et mutualise `spinWheel` / réclamation / partage /
  captcha / analytics / thèmes. Chaque jeu = `games/<jeu>-reveal.tsx` (animation) +
  `<jeu>-experience.tsx` (~12 lignes). **Serveur-autoritatif** : le lot vient de
  `spinWheel` (décidé serveur) ; l'interaction (choix de gobelet / coffre / carte,
  dé, memory) ne fait que RÉVÉLER l'`outcome` — cosmétique, aucun poids au client.

- **Vague 2 — 6 jeux de DÉFI *skill-gated*** (`rps`, `reflex`, `gauge`, `puzzle`,
  `mystery_word`, `estimate`). Migration `20260731120000_quick_games_skill.sql` :
  extension de `game_type` ; colonne `wheels.skill_config jsonb` (paramètres du
  défi ; les SECRETS `mystery_word.word` / `estimate.target` / `estimate.tolerance`
  / `puzzle.order` sont SERVER-ONLY, jamais sérialisés au client) ;
  `perform_atomic_spin` recréée en **7 arguments** avec `p_force_losing boolean
  default false` (corps normal identique au correctif 42702 de `20260720150500` →
  zéro régression). Moteur backend à **2 temps** (`src/lib/skill.ts` +
  `src/actions/skill.ts`) :
  - `startSkillChallenge` présente le défi (vue PUBLIQUE `SkillChallengePublic`,
    sans secret) + un jeton HMAC signé (domaine-séparé `skill-challenge:`, repli
    `SPIN_TOKEN_SECRET`, lié device / campagne / roue / gameType / seed) ; AUCUN
    tirage à ce stade ;
  - `submitSkillChallenge` vérifie le jeton + l'identité device, ÉVALUE le défi
    CÔTÉ SERVEUR (rps : coup serveur dérivé HMAC, égalité = échec ; mystery_word :
    égalité normalisée ; estimate : |x − cible| ≤ tolérance ; puzzle : ordre
    vérifié ; reflex / gauge : réussite *client-reported*), puis appelle
    `perform_atomic_spin(p_force_losing => !succeeded)` — réussite → tirage pondéré
    NORMAL, échec → spin PERDANT forcé. La participation / `play_limit` est
    CONSOMMÉE dans les deux cas (anti-brute-force). Socle client
    `skill-game-shell.tsx` (à 2 temps) + `games/<jeu>-challenge.tsx`.
  - Éditeur commerçant (`wheel-settings.tsx`) : sélecteur de jeu + sous-formulaire
    « Réglages du défi » (les champs secrets sont marqués). La vague 2 a aussi
    corrigé un manque de la vague 1 (`ac27384`) : `updateWheel` refusait de
    sauvegarder les nouveaux `game_type` (schéma limité à `wheel`/`scratch`) →
    enum complet.

**INVARIANTS DE SÉCURITÉ** — revue dédiée vague 2 : **NO-GO initial
(1 ÉLEVÉ + 1 MOYEN) → corrigés → GO** (`8a3c60e`). Invariant central : le TIRAGE
est le PLAFOND — un tricheur ne dépasse jamais les odds / stock configurés
(ADR-031). Ce qui a été corrigé et ce qui tenait déjà :
1. **ÉLEVÉ (corrigé)** : `spinWheel` ne gardait pas le `game_type` → un appel direct
   à `spinWheel` contournait le défi (tirage sans réussir le skill). Garde
   `isSkillGameType` ajoutée dans `spinWheelInner`, AVANT tout tirage : un
   `game_type` skill ne peut être joué que par le chemin `submitSkillChallenge`.
2. **MOYEN (corrigé)** : sous `play_limit = unlimited`, jeton rejouable + oracle
   `succeeded` renvoyé au client = brute-force d'un secret (mystery_word / estimate
   / puzzle). Fermé en deux portes : (a) `unlimited` INTERDIT pour les jeux à secret
   (verrou produit + sécurité) ; (b) `succeeded` retiré de la réponse cliente.
3. **Invariants SAINS confirmés** : secrets jamais sérialisés (la page `/play` ne
   passe pas `skill_config` ; `toPublicChallenge` strippe) ; jeton HMAC
   domaine-séparé, lié device, expirant, non rejouable sous `play_limit` borné ;
   `perform_atomic_spin` 7-args sans régression, `p_force_losing` sans toucher au
   stock ; RLS / grants `service_role` ; règle rate-limit ADR-032 (failClosed sur
   la clé device, IP fail-open en observabilité).

**Rationale** : le socle réutilise l'intégralité du moteur éprouvé (tirage
anti-triche, claim HMAC, stock, expiration, Wallet, caisse) — aucun nouveau chemin
de gain, aucune nouvelle surface publique. Les jeux de révélation sont gratuits en
risque (le serveur décide, le client anime). Les jeux de défi ajoutent la seule
notion de « réussite », évaluée SERVEUR, qui décide entre tirage normal et spin
perdant forcé, sans jamais permettre de dépasser l'économie de la campagne.

**Consequences** :
- **Vague 1 déployée EN PRODUCTION** (migration `20260730120000` en prod, revue
  sécurité vague 1 : GO 0 bloquant). **Vague 2 également déployée EN PRODUCTION**
  (migration `20260731120000`) ; EXPECTED_MIGRATION bumpé à `20260731120000`
  (vague 2). Commits `d957f46`→`5710641` (vague 1), `125eb99`→`8a3c60e` (vague 2).
- **Résidus assumés** (revue GO, suivi docs/bugs.md, priorité basse) :
  - **reflex / gauge = réussite *client-reported*** (non vérifiable serveur) :
    BORNÉE par l'économie (ADR-031) — un bot qui « réussit » toujours obtient au
    mieux un tirage NORMAL par participation (baseline roue), jamais au-dessus des
    poids / stock. Acceptable.
  - **Jeux à secret (mystery_word / estimate / puzzle) exigent un `play_limit`
    borné** (`unlimited` interdit) — verrou produit + sécurité.
  - **Divergence UX mineure** : sur erreur transitoire au submit, le composant de
    défi se verrouille (le shell prévoyait un ré-essai) ; recharger relance un défi
    (`start` ne consomme rien). FAIBLE, à surveiller.
- Vérifs CI-only (Docker absent en local) : pgTAP `quick_games_skill.test.sql`,
  E2E `skill-games.spec.ts`, seed.

---

## ADR-038 : Pronostics génériques — le football devient un modèle, pas le cœur
**Date** : 2026-07-24
**Status** : Accepted — construit et validé ; **poussé depuis** (les 8 commits sont
présents sur `origin/main` au 2026-07-25 ; l'application effective de la migration
en production n'a pas été revérifiée dans cette session)
**Context** : demande client — le moteur de pronostics ne servait qu'au football
(matchs, scores, calendrier importé d'un fournisseur). Il doit désormais servir à
tout événement à résultat : cérémonie, Eurovision, élection interne ou
associative, remise de prix, compétition d'entreprise, concours culinaire, finale
d'une émission, classement d'un tournoi local, résultat d'une course, résultat
d'un événement e-sport. Modèle cible : **événement → questions prédictives → date
de verrouillage → résultat → barème → classement → récompenses**. Le football
devient donc un MODÈLE PRÉCONFIGURÉ parmi d'autres, plus le cœur technique — sans
qu'un seul championnat existant ne régresse.

**Decision** — trois arbitrages tranchés avec le propriétaire du produit :

1. **4 types de questions** (`contest_matches.question_type`) : `score` (deux
   camps affrontés — le football historique, strictement inchangé), `choice`
   (choix unique dans une liste), `ranking` (ordre d'un top N), `number`
   (estimation chiffrée).
2. **Football + 10 modèles préconfigurés** (plus `custom`).
3. **Verrouillage PAR QUESTION, avec une date par défaut au niveau de
   l'événement.**

**Modèle de données** (migration `20260801120000_generic_contests.sql`) :
- `contests` : `event_kind` (texte, défaut `football`, forme contrainte par
  `EVENT_KIND_PATTERN` `^[a-z][a-z0-9_]{1,39}$` — ajouter un modèle ne demande
  AUCUNE migration), `default_locks_at`, `scoring` jsonb étendu aux paliers
  génériques ;
- `contest_matches` devient le **REGISTRE DE QUESTIONS** : `question_type`
  (défaut `score`), `prompt`, `options`, `correct_answer`, `ranking_size`,
  `locks_at` — les colonnes football (`home_*`/`away_*`, `kickoff_at`) restent en
  place et servent de socle au type `score` ;
- `contest_predictions` : `home_score`/`away_score` rendus NULLABLE, colonne
  `answer jsonb` pour les réponses génériques ;
- nouvelles RPC : `submit_contest_answer`, `set_contest_question_result`,
  `update_contest_generic_scoring`, `update_contest_event_settings` ; validateurs
  de forme en base (`is_valid_contest_question`, `is_valid_contest_options`,
  `is_valid_contest_answer`, `is_valid_contest_scoring`) ; barème générique
  calculé en SQL (`contest_generic_points`, `contest_scoring_points`).

**Règle de verrouillage par type** (le point le plus sensible du chantier) :

```
score     → coalesce(locks_at, kickoff_at)
générique → coalesce(locks_at, default_locks_at, kickoff_at)
```

posée dans les **4 fonctions SQL** concernées (`contest_is_locked`,
`submit_contest_prediction`, `submit_contest_answer`,
`set_contest_question_result`) ET dans son miroir TS `effectiveLocksAt` — l'UI ne
doit jamais annoncer « verrouillé » sur une question que le serveur accepte
encore, ni l'inverse. Cette règle est le produit direct de la revue sécurité
(findings E1 et M1 ci-dessous) ; le champ « verrouillage par défaut » est masqué
dans l'UI pour le modèle football.

**Barème par type** — clés de `contests.scoring`, défauts appliqués AU CALCUL (un
championnat football ne porte pas ces clés et n'est jamais réécrit) :
`choice` (3), `ranking_exact` (5), `ranking_partial` (1, × nombre d'éléments à la
bonne position), `number_exact` (5), `number_close` (2), `number_tolerance` (0,
écart absolu toléré). Les paliers football (`exact` 3 / `diff` 2 / `winner` 1)
sont inchangés. Une question `score` reste scorée par `scorePrediction`, un type
inconnu ne rapporte rien.

**Modèles préconfigurés** (`contest-event-kinds.ts`, catalogue d'INTERFACE) :
`football`, `ceremony`, `eurovision`, `election`, `remise_prix`, `entreprise`,
`culinaire`, `emission`, `tournoi`, `course`, `esport`, `custom`. Un modèle
propose des questions BROUILLON (qui remplissent le formulaire d'ajout) et un
barème conseillé — il **n'écrit jamais rien en base**, et surtout **aucune option
factice** : candidats, nommés, plats ou équipes sont saisis par le commerçant
(les exemples ne sont que des `placeholder`). La synchro du fournisseur de
calendriers ne part QUE pour le football, sous double verrou
(`event_kind === DEFAULT_EVENT_KIND` ET compétition du catalogue).

**Non-fuite du résultat** : `publicCorrectAnswer` est le POINT DE SÉRIALISATION
UNIQUE de la bonne réponse — elle ne quitte le serveur que lorsque la question est
`finished`.

**Revue sécurité : NO-GO conditionnel → corrigé.** GO franc sur le volet
générique (verrouillage serveur-autoritatif sérialisé sous `for update`,
non-fuite du résultat démontrée sur un point de passage unique, validation de
forme en base, multi-tenant, règle ADR-032 respectée). Le blocage portait
entièrement sur la **non-régression football** :
1. **E1 (ÉLEVÉ, corrigé)** : le backfill `locks_at = kickoff_at` figeait la
   fenêtre de chaque match à l'instant de la migration, alors que la synchro
   (`contest-sync.ts`) ne met à jour que `kickoff_at`. Au premier match REPORTÉ —
   routine, déclenchée par le cron — les pronostics se seraient fermés
   silencieusement sur un match non joué, avec un message trompeur ; un match
   AVANCÉ aurait laissé la base accepter un pronostic pendant la rencontre.
   **Correctif** : backfill SUPPRIMÉ, `locks_at` reste NULL sur les matchs, le
   repli tombe sur `kickoff_at` — qui suit les reports par construction.
2. **M1 (MOYEN, corrigé)** : `default_locks_at` primait sur `kickoff_at` pour
   TOUS les types → un commerçant football renseignant une date par défaut
   fermait d'un coup tout un championnat importé. **Correctif** : la date par
   défaut ne s'applique JAMAIS à une question `score` (règle de verrouillage
   ci-dessus, SQL + miroir TS), et le champ est masqué côté UI pour le football.
   Couvert par les tests pgTAP « match reporté / match avancé / date par défaut
   ignorée » et 5 tests TS.

**Rationale** : généraliser le registre plutôt que créer un second module. Tout
ce qui est éprouvé reste partagé et INCHANGÉ — identité joueur par cookie,
classement SQL et politique d'ex æquo (ADR-012, ADR-013), ligues (ADR-020), mode
TV (ADR-022), récupération par lien magique (ADR-014), gel du règlement, clôture
et récompenses. Aucune nouvelle surface publique. Le football garde son chemin
d'origine bit pour bit : un championnat existant ne voit aucune différence.

**Consequences** :
- **Au 2026-07-24, NON DÉPLOYÉ** — les 8 commits (`4973736` → `f09ee89`) étaient
  LOCAUX, non poussés, et la migration `20260801120000` n'était pas appliquée en
  production ; c'était alors le seul chantier du projet dans cet état, et
  EXPECTED_MIGRATION valait `20260801120000`. **Au 2026-07-25, ces commits sont
  présents sur `origin/main`** (donc poussés) et le seul chantier NON POUSSÉ est
  désormais la place de marché de campagnes (ADR-039, EXPECTED_MIGRATION
  `20260802120000`). L'application effective de la migration `20260801120000` en
  production n'a pas été revérifiée dans cette session.
- **Résidus assumés** (suivi docs/bugs.md) :
  - **M2** : `update_contest_event_settings` permet de déplacer
    `default_locks_at` vers le futur sur un championnat verrouillé (motif d'audit
    exigé), ce qui peut ROUVRIR une question dont `locks_at` est NULL.
    Atténuations réelles : l'UI écrit toujours `locks_at` à la création d'une
    question (il faudrait un INSERT PostgREST direct pour l'éviter), une question
    résolue reste fermée, l'opération est journalisée avec son motif, et c'est de
    l'auto-traitement sur son propre tenant.
  - **I1** : `scoreAnswer` / `scorePrediction` (TS) n'ont AUCUN appelant en
    production — les points sont écrits exclusivement en SQL. C'est un miroir de
    test ; la parité SQL↔TS a été vérifiée ligne à ligne (aucune divergence) mais
    n'est garantie que par les tests unitaires.
  - **exact_count / diff_count** (départage d'ex æquo, ADR-013) comptent le
    PALIER et non le TYPE : strictement inchangé sur un championnat 100 %
    football, imprécis seulement sur un événement mixte.
  - **I2** : `number_tolerance` accepte un décimal à l'écriture mais l'ignore au
    calcul (non atteignable via l'UI ni PostgREST).
  - **I4** : les nouvelles RPC sont couvertes par `generic_contests.test.sql` et
    non par l'audit ACL central `security_acl.test.sql` (à rapatrier).
  - **I5** (pré-existant) : `tiebreaker_answer` est chargé dans le contexte
    public mais jamais transmis au client (projections explicites) —
    durcissement souhaitable.
- Vérifs CI-only (Docker absent en local) : pgTAP `generic_contests.test.sql`,
  E2E `e2e/pronostics-generic.spec.ts`, seed `E2EPRONO3`.

---

## ADR-039 : Place de marché de campagnes — catalogue en code, modèles privés en base
**Date** : 2026-07-25
**Status** : Accepted — **construit et validé, NON POUSSÉ / NON DÉPLOYÉ à ce jour**
**Context** : demande client — un commerçant qui crée une campagne part d'une page
blanche et doit tout paramétrer (visuel, mécanique, textes, lots, règles, durée).
Il doit pouvoir partir d'un MODÈLE. Dix modèles étaient demandés :
Saint-Valentin, Halloween, Noël, ouverture de boutique, anniversaire, match de
football, fête des Mères, happy hour, soldes, lancement de produit — chacun
portant **7 promesses** : le visuel, le jeu, les textes, les
récompenses suggérées, les emails, la durée, les règles.

**Decision** — trois arbitrages tranchés avec le propriétaire du produit :

1. **Catalogue Lastchance EN CODE + modèles PRIVÉS en base.** Les 10 modèles
   vivent dans `src/lib/campaign-templates.ts`, versionnés avec l'application :
   pas de seed à maintenir, pas de migration pour retoucher un texte, et surtout
   pas de table lisible par toutes les organisations. En plus, un commerçant peut
   enregistrer sa propre campagne comme modèle réutilisable, visible de sa SEULE
   organisation. La **place de marché partagée entre commerçants a été ÉCARTÉE**
   (modération du contenu publié, isolation d'un contenu inter-tenant, propriété
   des visuels) : c'est un projet à part, et rien n'est préparé pour elle ici.
2. **Appliquer un modèle = créer une campagne EN BROUILLON complète** (campagne +
   jeu + lots), que le commerçant relit, ajuste et active LUI-MÊME.
3. **Les emails sont fournis en TEXTES, jamais activés.** Un modèle transporte des
   sujets et des corps ; aucun scénario d'emailing n'est armé.

**Modèle de données** (migration `20260802120000_campaign_templates.sql`) — une
seule table, `campaign_templates`, pour les modèles PRIVÉS :
- `name` (1..80, **unique par organisation** — deux commerçants ont chacun droit à
  leur « Noël » ; unicité exacte non normalisée, le doublon franc 23505 est
  traduit en « Un modèle porte déjà ce nom. ») ; `description` (≤ 300) ;
- `blueprint jsonb` — la recette complète, bornée par deux garde-fous qu'un client
  ne peut pas contourner : c'est un **objet** (`jsonb_typeof = 'object'`) et il est
  **borné à 32 Ko** (`pg_column_size`, même patron que `wheels_skill_config_size_check`
  à 8 Ko ; une bibliothèque de modèles sans borne est un vecteur de gonflement de
  la base à coût nul). La FORME n'est PAS validée en base : elle suivra l'évolution
  des jeux, un CHECK figé imposerait une migration par champ ;
- `source_campaign_id` — traçabilité seule, en **FK COMPOSITE**
  `(source_campaign_id, organization_id) → campaigns(id, organization_id)` : sans le
  couple, un éditeur pouvait faire pointer son modèle sur la campagne d'une AUTRE
  organisation. `on delete set null (source_campaign_id)` avec liste de colonnes
  explicite (PostgreSQL 15+) — un `set null` nu annulerait aussi `organization_id`,
  qui est NOT NULL, et la suppression d'une campagne échouerait ;
- `created_by` posé par le trigger `protect_campaign_template_attribution` depuis
  la session (jamais depuis le corps de la requête), `organization_id` et
  `created_by` immuables à l'UPDATE ;
- RLS : **une seule policy `campaign_templates: editors`** (`for all`,
  `is_org_editor`) — voir la revue sécurité ci-dessous. `organization_id` est hors
  du **grant UPDATE** : un utilisateur éditeur de deux organisations ne peut pas
  déplacer un modèle de l'une à l'autre. Aucune policy `anon`/`public`, aucun slug
  public : la table n'est jamais dans le chemin d'un parcours joueur.

**Le blueprint** (`src/lib/campaign-templates.ts`, module PUR) : `version` 1,
`texts` (nom de campagne, nom du jeu, accroche joueur), `visual` (clé d'un
préréglage EXISTANT de `WHEEL_PRESETS` + surcharges), `game` (`game_type` +
`skill_config`), `prizes`, `rules` (`play_limit`, collecte, `code_ttl_seconds`,
`engagement`, `budget_cents`), `durationDays` et `emails`. **Durée RELATIVE en
jours (1..365), jamais de date absolue** — sinon un modèle périme. `blueprintToDraft`
(pure, `now` injecté, ne jette jamais) traduit la recette en valeurs concrètes ; un
style corrompu retombe sur les défauts via `resolveWheelStyle`. Les 10 modèles
choisissent une mécanique qui a du SENS pour l'occasion (`flip_card` à la
Saint-Valentin, `cups` à Halloween, `chest` à Noël sur 24 jours, `memory`,
`dice`, `scratch`, `slot`, `draw_card`, `wheel`) et respectent ADR-031 :
4 lots gagnants à **stock fini** + 1 lot perdant **sans stock** (un « pas de
chance » ne doit jamais s'épuiser).

**LES TROIS INVARIANTS D'INNOCUITÉ** — c'est le cœur du design, et ils sont
vérifiés au niveau de l'ACTION (`src/actions/campaign-templates.ts`), seul endroit
qui ÉCRIT :

1. **BROUILLON INERTE** — `status: 'draft'` **ET** `auto_schedule: false`, ce
   dernier verrouillé au niveau du TYPE (littéral `false` dans `CampaignDraft`).
   Sans lui, `run_campaign_schedule()` (pg_cron, toutes les 10 min) aurait fait
   passer la campagne `draft → active` dès `starts_at` atteint, c'est-à-dire
   immédiatement : **un modèle appliqué se serait publié tout seul.** Le schéma Zod
   `campaignBlueprintSchema` ne comporte AUCUN champ `status` / `auto_schedule` /
   `starts_at` / `ends_at` : un blueprint privé trafiqué ne peut pas les forcer
   (testé, avec `status: "active"` injecté dans le jsonb).
2. **AUCUN ENVOI** — appliquer ou enregistrer un modèle n'active aucune
   automatisation, ne dépose aucun job, n'envoie aucun email :
   `automation_settings`, `enqueueJob` et `@/lib/resend` sont ABSENTS du chemin
   (audit statique des 7 sources du chantier, commentaires retirés). Le jeu de
   tables visitées est figé : `campaigns` / `wheels` / `prizes` à l'application,
   `campaigns` / `campaign_templates` à l'enregistrement. Un modèle enregistré part
   avec `emails: []` — il ne peut pas propager un scénario d'emailing d'une
   campagne à une autre.
3. **MULTI-TENANT PAR LA SESSION** — organisation et rôle viennent de
   `getUserAndOrg()` (owner|editor exigé), jamais du formulaire ; un modèle privé
   est lu avec le client de **SESSION** (donc sous RLS) PLUS un filtre
   `organization_id` explicite ; **aucun `createAdminClient` sur ce chemin**, ce
   que verrouille une sentinelle de test. Le blueprint est **revalidé par Zod dans
   les DEUX chemins** (catalogue et privé) : la base ne garantit que « objet jsonb
   ≤ 32 Ko », la FORME est validée là.

**Interface** (`/dashboard/campaigns`) : galerie SERVEUR en deux sections —
« Modèles Lastchance » et « Mes modèles », jamais mélangées ni présentées comme un
catalogue commun. Les blueprints ne traversent pas le réseau : les vignettes sont
rendues côté serveur, seuls les boutons appliquer / supprimer sont clients. Chaque
carte résume les 7 promesses via un module pur à **lecture DÉFENSIVE**
(`campaign-template-preview.ts`) — un blueprint écrit par une version antérieure
s'affiche en dégradé (ou avec un message) au lieu de casser la page des campagnes.
La promesse « appliquer crée un BROUILLON, rien n'est publié, aucun email n'est
envoyé » est répétée en bandeau, sous chaque bouton et jusque dans l'`aria-label` ;
les emails sont annoncés « fournis en texte, non activés ».

**Revue sécurité : GO, 0 bloquant — 1 MOYEN corrigé** (`4457b20`).
- **MOYEN (corrigé)** : le blueprint d'un modèle privé recopie
  `wheels.skill_config`, donc les **SECRETS des jeux de défi** (mot mystère, nombre
  cible et tolérance, ordre du puzzle — ADR-037). La policy de lecture accordait le
  SELECT à `is_org_member`, alors que la SOURCE de ces secrets (`wheels`,
  `campaigns`, `prizes`) est réservée aux ÉDITEURS : le secret passait
  d'« éditeurs seulement » à « toute l'équipe, **CAISSIERS compris** ». Un caissier
  pouvait lire le blueprint via l'API REST avec son propre jeton de session et
  réussir systématiquement le défi (gain borné par ADR-031, mais c'est la même
  classe que la fuite déjà traitée sur les jeux de défi) ; effet de bord : poids,
  stocks, `cost_cents` (la marge) et budget devenaient lisibles par un caissier.
  **Correctif** : policy unique `campaign_templates: editors`, miroir exact de
  `campaigns: editors`. Aucune perte produit — les 3 actions exigeaient déjà
  owner|editor et la liste des campagnes est déjà vide pour un caissier. pgTAP :
  assertion caissier **INVERSÉE** (0 modèle lu, même ciblé par id), assertion
  dédiée à la non-fuite du secret, et contre-épreuve côté éditeur (c'est bien le
  rôle qui masque, pas un blueprint vide). `campaign_templates` rejoint aussi
  l'audit RLS central `security_acl.test.sql`.
- **INFO corrigés** : `budget_cents` passé en `min(1)` (`campaigns.budget_cents`
  porte un CHECK `> 0` — un 0 passait Zod puis cassait l'INSERT).
- **Sains par construction** : isolation A/B (lecture, écriture, suppression,
  insertion croisée), FK composite tenant, `organization_id` hors grant UPDATE,
  attribution par trigger, sentinelle pgTAP qui ÉCHOUE si une policy venait à
  citer `anon`/`public`, aucun `service_role` sur le chemin.

**Rationale** : la valeur du chantier est un gain de temps commerçant, pas une
nouvelle mécanique — donc il ne devait ouvrir AUCUNE surface. Le catalogue en code
supprime d'emblée la question de la lisibilité inter-tenant, le brouillon inerte
supprime celle de la publication accidentelle, et les emails en texte celle de
l'envoi accidentel : les trois risques réels de ce type de fonctionnalité
sont fermés par construction plutôt que par du contrôle. Tout le reste réutilise
l'existant tel quel (éditeur de campagne, éditeur de lots, roue, thèmes).

**Consequences** :
- **NON POUSSÉ / NON DÉPLOYÉ** — les 5 commits (`ed50271` → `4457b20`) sont
  LOCAUX et la migration `20260802120000` n'est pas appliquée en production.
  EXPECTED_MIGRATION vaut déjà `20260802120000` : il faudra pousser migration et
  code ensemble. C'est le seul chantier du projet dans cet état.
- **Résidus assumés** (revue GO, suivi docs/bugs.md, priorité basse) :
  - un blueprint **PRIVÉ** peut décrire une roue sans lot perdant ou à gagnant
    illimité — le CATALOGUE, lui, respecte ADR-031 (testé). Pas une escalade : le
    même éditeur peut déjà créer cette roue dans l'éditeur de lots (auto-préjudice,
    aucun effet inter-tenant) ;
  - **application non transactionnelle** : si l'INSERT du jeu ou des lots échoue,
    un brouillon orphelin subsiste (même patron que `createCampaign`). Sans effet
    jouable — `draft`, sans QR code, et le contexte de jeu exige `active` ;
  - **ni quota ni rate-limit** sur `applyCampaignTemplate` /
    `saveCampaignAsTemplate`, aligné sur `createCampaign` (les actions dashboard ne
    sont pas rate-limitées par convention) ;
  - le secret d'un jeu de défi reste **DUPLIQUÉ** dans
    `campaign_templates.blueprint` : sa confidentialité repose désormais
    entièrement sur la policy éditeurs de cette table (l'option « ne pas
    sérialiser le secret » a été écartée pour la V1) ;
  - `saveCampaignAsTemplate` ne capture que la **roue principale** (première par
    position) : un modèle porte une mécanique, pas une grille multi-roues ;
  - la galerie affiche « Utiliser ce modèle » à un caissier qui ne peut pas
    l'appliquer (l'action refuse) — comportement préexistant du bouton
    « + Nouvelle campagne » juste à côté.
- Vérifs CI-only (Docker absent en local) : pgTAP `campaign_templates.test.sql`
  (ajouté au job d'audit ACL), E2E `e2e/campaign-templates.spec.ts`, seed.
  Unitaires : 29 tests d'action (dont les invariants BROUILLON et INNOCUITÉ
  mutation-testés : `auto_schedule: true` → 11 rouges, filtre organisation retiré
  → 2 rouges), 1021 tests au total ✓.
- **Poussé sur `origin/main` le 2026-07-25** (commits présents jusqu'à `e22e655`) ;
  l'application effective de la migration en production n'a pas été revérifiée.
  Le chantier « Créateur de quiz » (ADR-040) est désormais le seul en attente de
  poussée.

## ADR-040 : Créateur de quiz — module DÉDIÉ, 4 formes de réponse, 5 modes de récompense
**Date** : 2026-07-25
**Status** : Accepted — **construit, QA verte, revue sécurité passée de « GO
conditionnel » à corrigé ; NON POUSSÉ / NON DÉPLOYÉ à ce jour**
**Context** : demande client — un **créateur de quiz** jouable depuis un QR ou un
lien, en LIBRE-SERVICE. Usages visés : restaurant (questions sur la cuisine),
cave / bar (dégustation), salon professionnel (les exposants), boutique
(découverte des produits), musée (parcours culturel), entreprise (team building),
club sportif. Le client a précisé que « le moteur des pronostics pourra être
réutilisé pour une grande partie du classement » : la parenté est assumée, elle
n'implique pas la fusion.

**Decision** — trois arbitrages tranchés avec le propriétaire du produit :

1. **Module DÉDIÉ**, ni un `event_kind` des pronostics, ni une extension du mode
   « Événement en direct ». L'intention commerçant « je crée un quiz » est
   distincte, et surtout la **sémantique de la vérité diffère** : dans un
   pronostic la bonne réponse est inconnue de TOUS jusqu'au résultat (la
   non-fuite est gratuite, il n'y a rien à cacher) ; dans un quiz elle existe
   **dès la création**, stockée à côté de la question — la règle de non-fuite
   change donc de nature et devient un invariant à démontrer. Le cycle de vie
   diffère aussi : `event_sessions` est SYNCHRONE (l'organisateur lance chaque
   question, machine à états, écran partagé) alors qu'un quiz est ASYNCHRONE
   (c'est le JOUEUR qui démarre chaque question, à son rythme, sans animateur).
2. **Les 7 types de questions demandés** : choix multiple, vrai/faux, image
   mystère, estimation numérique, question chronométrée, classement de réponses,
   pronostic libre.
3. **Les 5 modes de récompense demandés** : seuil de bonnes réponses, tirage au
   sort parmi les meilleurs, classement, gain instantané, aucun lot.

**MODÉLISATION — le point de design central : 4 FORMES DE RÉPONSE, pas 7 types.**
Stocker les 7 modèles comme 7 valeurs de `question_type` aurait dupliqué trois
fois la même mécanique, car deux d'entre eux ne sont pas des formes de réponse :
- « question chronométrée » est une **dimension transversale** —
  `time_limit_seconds` (nullable), applicable à N'IMPORTE QUEL type. En faire un
  type aurait interdit le « choix multiple chronométré », pourtant l'usage le
  plus courant ;
- « vrai/faux » est un **choix à deux options** : même stockage, même
  évaluation, seul le rendu diffère ;
- « image mystère » est un **média** attaché à la question (`image_url`, seconde
  dimension transversale) : on peut faire reconnaître une image par un choix
  multiple OU par une réponse libre.

D'où le couple, repris TEXTUELLEMENT du patron `contests.event_kind` vs
`contest_matches.question_type` (ADR-038) :
- `quiz_questions.question_type` = **LE MOTEUR**, 4 valeurs, une par forme de
  réponse : `choice` (choix multiple ET vrai/faux), `number` (estimation, avec
  `tolerance`), `ranking` (tableau ordonné d'identifiants), `text` (chaîne
  comparée à des formulations acceptées) ;
- `quiz_questions.preset` = **LE MODÈLE D'UI**, contraint en FORME seulement
  (`^[a-z][a-z0-9_]{1,39}$`, aucune énumération figée) : il porte les 7 modèles
  du besoin — `multiple_choice`, `true_false`, `mystery_image`, `estimate`,
  `timed`, `ranking`, `free_prediction`. **Le moteur IGNORE `preset`** : il ne
  lit que `question_type`, `options`, `correct_answer`, `tolerance`,
  `ranking_size` et `time_limit_seconds`.

**Conséquence pratique — ajouter un 8e modèle = une entrée de catalogue, sans
migration.** Côté UI, `quizFormShape(preset, questionType)` rend des booléens que
le formulaire lit tel quel. **Et `choice` / `number` / `ranking` RÉUTILISENT les
validateurs du moteur de pronostics** (`is_valid_contest_options` /
`is_valid_contest_answer`, migration `20260801120000`) : trois des quatre formes
ne coûtent aucune ligne de validation neuve ; seule la réponse libre (`text`) est
du code propre au quiz — normalisation `quiz_normalize_text` (minuscules, accents
français repliés, non-alphanumérique ramené à l'espace, espaces collapsés),
`IMMUTABLE` et **serveur seulement**, jamais rejouée côté client.

**Modèle de données** (migration `20260803120000_quizzes.sql`) : addon
d'organisation `addon_quiz` (miroir exact d'`addon_calendar` / `addon_events` /
`addon_jackpot` / `addon_loyalty` / `addon_hunts`, activé au back-office) et
5 tables org-scopées — `quizzes` (7 thèmes, `public_slug`, `reward_mode` et ses
champs propres, `reward_stock` / `reward_claimed_count`, `draw_state`,
`target_wheel_id`), `quiz_questions`, `quiz_players` (cookie httpOnly, hash du
jeton, prénom + avatar, email opt-in seulement), `quiz_answers` (réponse
immuable, `started_at` / `elapsed_ms` serveur), `quiz_rewards` (code `QUIZ-…` ou
`grant_token` de tour offert). 16 fonctions : 10 RPC `service_role`
(`join_quiz`, `start_quiz_question`, `submit_quiz_answer`, `finish_quiz`,
`consume_quiz_spin_grant`, `quiz_public_state`, `quiz_leaderboard`,
`draw_quiz_winners`, `redeem_quiz_reward`, `purge_expired_quiz_players`),
5 helpers de validation / évaluation et 1 helper interne `quiz_emit_reward`.
`spins.source` accepte `'quiz'`. pgTAP `quizzes.test.sql` + 5 lignes RLS et
10 assertions dans l'audit ACL central `security_acl.test.sql`.

**LES 5 MODES DE RÉCOMPENSE** (`reward_mode`, CHECK de cohérence par mode) :
`threshold` (lot dès X bonnes réponses, émis par `finish_quiz`), `instant` (lot à
la clôture sans exigence de justesse, mais **seulement si toutes les questions
ont été répondues** — voir E1), `draw` (tirage au sort parmi les `draw_top_n`
meilleurs, DIFFÉRÉ), `ranking` (top déterministe score décroissant PUIS temps
total croissant, DIFFÉRÉ), `none` (participation gratuite, stock forcé à 0). Les
deux modes différés partagent **une seule RPC** `draw_quiz_winners` (même verrou,
même idempotence, aucun second chemin d'émission à auditer). Le lot est un code
de retrait en caisse `QUIZ-…` (**8e préfixe**) ou un **tour de roue offert**
(`target_wheel_id` + `grant_token`, patron ADR-029), ce dernier réservé aux modes
à émission immédiate (`threshold` / `instant`) : un jeton de spin émis des heures
plus tard, hors présence du joueur, n'a pas de sens ergonomique
(`quizzes_wheel_mode_check`).

**LES SIX INVARIANTS DE SÉCURITÉ** (confirmés SAINS par la revue) :

1. **NON-FUITE DE LA BONNE RÉPONSE — trois couches.** La vérité existe dès la
   création : (a) `quiz_public_state` ne l'attache qu'aux questions déjà répondues
   par CE joueur (patron exact de `calendar_public_state`, où le contenu d'une
   case n'est joint qu'aux cases ouvertes) et `start_quiz_question` ne la renvoie
   jamais ; (b) le mapper TS re-force bonne réponse / justesse / temps à `null`
   hors statut « répondu » (patron `mapPublicDay`) ; (c) le type de question
   JOUABLE ne porte **structurellement aucun champ de vérité** — il n'y a rien à
   masquer dans le payload RSC. Un refus `invalid_answer` n'est **pas un oracle**
   (validation de FORME seulement). Le hash d'identité vient TOUJOURS du cookie
   httpOnly, jamais du client : lire l'état d'un autre joueur est impossible ; le
   classement ne publie que prénom / avatar / score / temps, sans aucun email.
2. **CHRONOMÈTRE SERVEUR-AUTORITATIF ET INFORGEABLE.** Aucune RPC n'accepte de
   paramètre de temps — une assertion pgTAP le vérifie sur
   `pg_get_function_arguments`. `start_quiz_question` pose `started_at = now()`
   **une seule fois** (`on conflict do nothing` : un second appel renvoie le
   `started_at` déjà posé, aucun rembobinage), `submit_quiz_answer` calcule
   `elapsed_ms = now() - started_at` **en base**, et un trigger de gel interdit
   tout déplacement de `started_at` — **service_role inclus**. Côté client la
   borne initiale vient du couple `server_now` / `started_at` (calcul pur, aucun
   `Date.now()` au rendu, aucun écart d'hydratation) : seule la décrue suit
   l'horloge locale, la base tranche (`too_late`).
3. **UNE SEULE RÉPONSE PAR (joueur, question), IMMUABLE.** Unicité
   `(player_id, question_id)` + trigger `quiz_answers_freeze` qui refuse toute
   réécriture d'une ligne déjà répondue : aucune seconde tentative pour deviner —
   crucial pour l'estimation avec tolérance et pour la réponse libre. Corollaire
   assumé : une réponse **hors délai est ENREGISTRÉE** (hors barème) plutôt que
   rejetée ; la rejeter rouvrirait une tentative gratuite.
4. **TIRAGE IDEMPOTENT.** `draw_quiz_winners` est atomique sous `for update` :
   un `draw_state = 'done'` renvoie le tirage existant SANS rien émettre.
   Aléa cryptographique, vivier respecté, **trois verrous indépendants** contre
   la sur-émission (drapeau `draw_state`, unicités `(quiz_id, player_id)` /
   `(quiz_id, rank)`, CHECK `claimed <= stock`) : le bug de re-déclenchement
   rencontré sur le jackpot est fermé d'emblée.
5. **BORNES ÉCONOMIQUES (ADR-031).** `reward_stock` **FINI et OBLIGATOIRE** dès
   qu'un mode émet (CHECK par mode, à la manière de
   `calendar_days_lot_stock_check`), décrément **atomique et conditionnel** sous
   le verrou du quiz, `out_of_stock` propre, verrou structurel
   `quizzes_reward_bounds_check (reward_claimed_count <= reward_stock)` : aucun
   des 5 modes ne peut sur-émettre.
6. **MULTI-TENANT ET ADR-032.** Les 5 tables sont RLS org-scopées (lecture
   `is_org_member`, écriture `is_org_editor`, FK composites tenant, compteurs et
   `draw_state` RPC-only par grants de colonnes) ; aucun droit `anon`, le parcours
   public passe exclusivement par le `service_role` ; la caisse est
   indistinguable inter-organisation. Rate-limit : `failClosed` **uniquement** sur
   la clé d'identité (hash du cookie, seau `quizPlayerAction`) et APRÈS
   résolution de celle-ci ; la clé partagée quiz + IP ne porte qu'un compteur
   d'observabilité **fail-OPEN** (`quizPublicIp`) — plusieurs joueurs derrière le
   Wi-Fi d'un restaurant ou d'un salon ne doivent jamais se bloquer entre eux.
   4 gardes de source le vérifient, dont « aucun seau avant l'identité » et
   « aucun paramètre de temps ou de score envoyé aux RPC ».

**Revue sécurité : GO CONDITIONNEL → tout corrigé** (`fe1e57b` : 1 ÉLEVÉ
bloquant, 1 ÉLEVÉ, 3 MOYEN).
- **E1 — ÉLEVÉ, BLOQUANT (lot gratuit)** : le mode `instant` émettait le lot
  **sans qu'aucune réponse existe** (`v_answered` était calculé mais jamais
  utilisé comme garde). Deux appels — rejoindre, terminer — suffisaient à obtenir
  un code `QUIZ-…` ; l'identité étant un cookie gratuit (donc un seau `failClosed`
  neuf à chaque tour) et le seau IP fail-open par conception, une boucle vidait
  tout le stock promotionnel depuis une seule IP. **Correctif** : émission
  conditionnée à la complétion RÉELLE (`v_answered >= v_total and v_total > 0`).
- **E2 — ÉLEVÉ (Sybil)** : le corrigé est rendu au joueur dès sa réponse — il lui
  est dû — mais une passe jetable collecte ainsi le corrigé COMPLET, après quoi
  chaque identité neuve franchit le seuil à coup sûr ; de même un bot rafle les
  premiers rangs avec un temps ≈ latence réseau. **Correctif** : Turnstile sur le
  **SEUL appel émetteur** (`finishQuiz`) et seulement **si un lot est en jeu** ;
  RIEN sur `join` / `start` / `submit` — aucune friction sur le chemin de jeu,
  aucun contrôle avant l'identité (ADR-032).
- **M1 — RGPD** : l'email était persisté **sans consentement** (le couplage
  n'existait que dans le composant client) → refus explicite au schéma et email
  jamais transmis à la base sans opt-in, là où l'écriture se produit.
- **M2 — RGPD** : la purge laissait les **réponses LIBRES**, qui contiennent
  couramment de la PII (« comment s'appelle notre chef ? ») → réponses `text`
  neutralisées, score et registre des codes conservés.
- **M3 — piège irréversible** : un tirage lancé avant que quiconque ait terminé
  posait `draw_state = 'done'` à 0 gagnant et **figeait définitivement la
  dotation** (aucune RPC ne revient à `pending`) → le drapeau n'est posé
  qu'**après émission réelle**, nouvel état `no_participants` (câblé jusqu'au TS,
  rendu en information neutre) et **tirage relançable** : « non rejouable » ne
  doit pas vouloir dire « impossible à faire une seule fois ».
- **INFO retenus** : verrou global inutile retiré de `submit`, oracle d'existence
  du classement uniformisé, gardes addon / statut en défense en profondeur, motif
  d'URL porté dans le CHECK `image_url`, et `retryable` remplace une comparaison
  de TEXTE d'erreur côté éditeur (une reformulation cassait l'affichage).
- **Conséquence d'E1 traitée côté UI** : une question chronométrée abandonnée est
  désormais **SOUMISE** (hors barème) au lieu d'être sautée — sinon un joueur
  honnête qui laisse filer le temps perdait sa récompense, la complétion étant
  devenue la condition d'émission.

**Rationale** : le module réutilise ce qui existe (validateurs de pronostics pour
3 des 4 formes, patron de non-fuite du calendrier, chronométrage du mode
événement, moteur de spin pour le tour offert, caisse) et n'invente que ce que la
sémantique du quiz impose : une vérité qui préexiste à la partie, donc une
non-fuite à démontrer, et un chronomètre dont l'autorité ne peut pas être
déléguée au client. Le couple `question_type` / `preset` fait porter la richesse
produit (7 modèles, et plus demain) par le CATALOGUE d'interface, pas par le
schéma.

**Consequences** :
- **NON POUSSÉ / NON DÉPLOYÉ** — les 6 commits (`cb92b19` → `fe1e57b`) sont
  LOCAUX et la migration `20260803120000` n'est pas appliquée en production.
  `EXPECTED_MIGRATION` vaut déjà `20260803120000` : migration et code devront
  être poussés ensemble. C'est **le seul chantier du projet dans cet état** ; la
  place de marché de campagnes (ADR-039), qui l'était encore le 2026-07-25, a
  depuis été poussée.
- **Un défaut de PRODUCTION a été corrigé au passage** (`b483740`, hors périmètre
  du quiz) : la base portait **8 addons**, le back-office n'en exposait que **6**
  et `src/lib/admin/data.ts` ne LISAIT même pas les deux manquantes. Conséquence
  réelle : le module **Parrainage, en production depuis plusieurs jours, ne
  pouvait être activé pour AUCUN commerçant**. Les 8 sont désormais basculables
  et lues (`getUserAndOrg` sélectionnait déjà les 8 : le blocage venait bien de
  l'admin). Résidu noté : `setMerchantCompAccess` (accès offert) ne couvre que
  4 addons — incohérence préexistante, que les bascules dédiées suppléent.
- **Résidus assumés** (suivi docs/bugs.md) :
  - **Sybil économique** : l'identité est un cookie gratuit et le corrigé est dû
    au joueur ; le plafond est et reste `reward_stock` (ADR-031) — rien ne
    garantit que les lots aillent à des humains DISTINCTS. Turnstile sur la
    clôture réduit la surface ; sans clés provisionnées, aucun challenge n'est
    présenté (miroir exact du compromis fidélité / jackpot) ;
  - **aucune borne minimale de temps humain** en SQL : un bot garde l'avantage
    sur les modes `ranking` et `draw` ;
  - **`out_of_stock` est terminal** : un joueur touché en rupture ne sera plus
    doté même après réapprovisionnement (unicité joueur × quiz, patron
    calendrier) — à documenter côté commerçant ;
  - **purge par ANONYMISATION** : hash du jeton, score, temps, réponses non
    libres et registre des codes survivent à la rétention (arbitrage assumé au
    regard du registre de caisse) ;
  - `consume_quiz_spin_grant` **ignore l'état de la roue / campagne cibles**
    (miroir calendrier) : un tour offert peut atterrir sur une roue en pause ;
  - **prénom joueur affiché au classement, non modéré** (identique aux
    pronostics et au mode événement) ;
  - **dérogation au trigger de gel** : la purge peut vider une réponse `text`, et
    SEULEMENT cela (toutes les autres colonnes doivent rester identiques, sinon
    refus) — dérogation purement destructive, verrouillée par deux tests.
- Vérifs CI-only (Docker absent en local) : pgTAP `quizzes.test.sql`, E2E
  `e2e/quiz.spec.ts`, seed. Unitaires : typecheck ✓, lint ✓, **1116 tests ✓**.

## ADR-041 : Identité joueur commune par pont pseudonyme progressif

**Date** : 2026-07-25
**Status** : Accepted

**Context** : chaque expérience publique possède historiquement son propre
cookie HTTP-only et sa propre table joueur. Ce cloisonnement protège la
progression existante, mais empêche une continuité cohérente entre les parcours.
Une bascule immédiate vers un compte joueur central aurait créé deux risques :
perdre la progression au premier défaut de migration et inventer une
authentification nominative sans fournisseur ni parcours de consentement.

**Decision** : ajouter une identité centrale pseudonyme et additive :

- `lc-player` est un jeton opaque commun de 256 bits ; seule une empreinte
  SHA-256 salée et séparée par domaine est stockée dans `player_devices` ;
- `players`, les adhésions organisation/expérience et les liens legacy sont
  privés (`service_role`-only, RLS sans accès marchand direct) ;
- `resolve_player_identity` valide en base le couple expérience/organisation,
  lazy-link le hash historique et rattache un nouveau device au joueur déjà
  connu lorsque l'ancien cookie subsiste ;
- les cookies et tables historiques restent autoritaires. Le pont n'est appelé
  qu'après une opération publique reconnue, en best-effort, et ne peut pas
  invalider son résultat métier ;
- un device âgé de 90 jours est roté ; l'ancien hash est révoqué avec cinq
  minutes de grâce pour les requêtes concurrentes ;
- aucune API de liaison nominative n'est exposée. Une future liaison
  `auth_user_id` est contrainte par une preuve de consentement explicite,
  horodatée et versionnée.

**Rationale** : le double chemin permet de déployer, observer et éventuellement
revenir en arrière sans supprimer ni réinterpréter une progression existante.
Les FK composites, la validation polymorphe de la ressource et l'absence de
lecture marchande directe empêchent qu'un identifiant central devienne un canal
de corrélation inter-tenant. Ne pas simuler de lien magique évite de transformer
le système d'authentification marchand actuel en identité joueur par accident.

**Consequences** :

- roue standard/skill-gated, chasse, fidélité, jackpot, événement live,
  calendrier et quiz alimentent le pont ; Pronostics reste traité par son
  chantier séparé et le parrainage n'a pas encore d'adhésion centrale dédiée ;
- effacer `lc-player` ne perd pas la progression : si l'ancien cookie
  d'expérience subsiste, le lazy-link rattache le nouveau device au même joueur ;
- effacer aussi le cookie historique rend la reprise automatique impossible en
  l'absence volontaire de compte joueur ou de récupération nominative ;
- le schéma est prêt pour une liaison consentie future, mais cette capacité
  restera inactive tant qu'un fournisseur et un parcours de consentement
  vérifiable ne seront pas définis.

## ADR-042 : Catalogue d'expériences et droits Stripe progressifs

**Date** : 2026-07-25  
**Status** : Accepted

**Context** : le produit ne se limite plus à la roue, mais la navigation, le
site marketing et la facturation continuaient à présenter ou activer les
modules comme une liste de booléens administratifs. Un passage brutal à de
nouveaux Price IDs aurait coupé les organisations bêta et inventé des tarifs
qui ne sont pas encore validés.

**Decision** :

- un catalogue typé unique classe les expériences par objectif
  (`Acquérir`, `Fidéliser`, `Animer en direct`, `Créer du trafic`) et associe
  chaque module à un droit fonctionnel ;
- les offres deviennent `Core`, `Engagement`, `Live & Events` et
  `Full Platform`. Seul le tarif Core déjà établi est affiché ; les autres
  restent « sur devis » tant que leurs prix ne sont pas décidés ;
- le webhook relit les items de l'abonnement Stripe et applique statut, plan
  et photographie des droits dans une seule RPC idempotente et ordonnée ;
- les anciens `addon_*` restent des projections compatibles. Les activations
  existantes sont reprises comme source `legacy`, puis sont masquées dès le
  premier snapshot Stripe, même si celui-ci désactive tous les droits ;
- lorsqu'un snapshot Stripe existe, un trigger interdit de modifier
  directement le plan ou les projections d'addons. La transaction du webhook
  est la seule à ouvrir temporairement cette écriture ;
- la navigation principale n'affiche que les expériences actives. Les autres
  restent visibles dans une galerie `Découvrir`, sans simuler un achat lorsque
  le Price ID correspondant n'est pas configuré.

**Rationale** : cette double lecture permet une migration sans coupure tout en
créant une borne nette : avant Stripe, le back-office admin conserve le pilotage
des comptes legacy ; après Stripe, la facture redevient l'unique source de
vérité. Les Price IDs restent des secrets de configuration serveur et aucun
montant commercial non validé n'est codé dans l'application.

**Consequences** :

- un Price ID inconnu fait échouer le webhook afin que Stripe le retente ; il
  ne révoque jamais silencieusement des modules ;
- les commandes manuelles de plan/addons refusent les organisations déjà
  pilotées par Stripe, mais l'accès offert (`comp_access`) demeure une voie
  explicite, séparée et auditée ;
- les migrations et le webhook doivent être déployés ensemble avant d'activer
  les nouveaux Price IDs ;
- le catalogue fournit le premier port commun aux futurs modules
  `ExperienceDefinition`, sans imposer une réécriture globale des actions
  historiques.

## ADR-043 : Encaissement en caisse — module unifié à 9 sources, une seule colonne de vérité (`redeemed_at`), TTL divergent par famille
**Date** : 2026-07-25
**Status** : Accepted — commité sur `main` (commits `e310606` → `f873b77`,
migration `20260804120000`, `EXPECTED_MIGRATION` bumpé) mais **NON POUSSÉ au
2026-07-25** (`origin/main` = `eb3193d`), donc migration non appliquée en
production. **Les assertions pgTAP n'ont jamais été exécutées** (ni Docker ni CLI Supabase disponibles) : elles ne
seront prouvées qu'au job `database-security` de la CI.

**Context** : les pronostics émettaient déjà un code de retrait. `finalize_contest`
pose `contest_awards.code` au format `PRONO-…`, le joueur le voit sur
`/pronos/[slug]` et l'interface lui dit de le **présenter en caisse**. Mais
`lookupRedeemCode` ne routait que **8 sources** (roue, chasse, fidélité, jackpot,
événement live, calendrier, parrainage, quiz) : saisi au comptoir, un code
`PRONO-…` répondait « code introuvable ». Le seul chemin de remise existant,
`set_contest_award_status`, exige `is_org_editor` — **un caissier ne pouvait pas
remettre le lot**, et un owner devait le faire à la main depuis le dashboard.
Anomalie fonctionnelle **en production**, sur une promesse déjà affichée au joueur.

**Decision** :

1. **9e source de caisse, au contrat strictement identique aux 8 autres.**
   `lookupRedeemCode` route la forme `PRONO-…` vers
   `CashierMatch { source: 'contest' }` (lecture org-scopée
   `lookupContestAwardByCode`), et l'écriture passe par une RPC dédiée
   `redeem_contest_award(uuid, text, text, integer)` — `service_role` seule,
   `authenticated` et `anon` explicitement révoqués. Elle est **atomique**
   (recherche, validation, remise et audit dans un seul `UPDATE … returning`),
   **idempotente** (la seconde tentative ne matche plus rien : `redeemed_at is
   null` fait partie du prédicat), **auditée** (`contest.award.redeem` avec
   `actor` obligatoire et `basket_cents`), **deny-by-default** (`status =
   'pending'` seulement — les statuts ajoutés plus tard seront refusés sans qu'on
   y repense) et **indistinguable** pour un code inconnu comme pour un code
   d'une autre organisation (aucune ligne rendue : pas d'oracle d'existence).
2. **Une seule colonne de vérité pour la remise.** `contest_awards.delivered_at`
   est **renommée `redeemed_at`**, alignée sur les 7 modules frères
   (`quiz_rewards.redeemed_at`, `calendar_rewards`, …), plutôt que d'ajouter un
   second horodatage à côté. S'y ajoutent `redeemed_by`, `basket_cents` et
   `redeem_expires_at`, et surtout un CHECK qui rend l'état incohérent
   **impossible** : `(status = 'delivered') = (redeemed_at is not null)`. Un
   index unique `(organization_id, code)` remplace la portée « par championnat »
   de l'unicité existante, précédé d'un **contrôle de doublons explicite** qui
   échoue avec un message actionnable plutôt que sur un « could not create unique
   index » muet.
3. **Deux chemins, deux ACL.** La caisse utilise `redeem_contest_award`
   (`service_role`, via une Server Action authentifiée). L'éditeur garde
   `set_contest_award_status` (`is_org_editor`) pour l'annulation motivée et la
   remise depuis le dashboard. Ce ne sont pas deux implémentations de la même
   chose : ce sont deux autorités différentes sur le même objet.
4. **Bornes de TTL délibérément divergentes.** `contests.code_ttl_seconds`
   (nullable, réglable en jours dans l'éditeur) est borné **3 600 s à
   7 776 000 s (1 h à 90 j)**, là où `campaigns.code_ttl_seconds` est borné
   **10 s à 600 s**. Même nom, même unité, même patron de trigger figeant
   l'échéance à l'émission — mais pas la même borne, et c'est intentionnel.
5. **Aucune confiance à la colonne dénormalisée.** L'`UPDATE` **et** le `SELECT`
   final de la RPC exigent que `contests` **et** `contest_players`
   appartiennent aussi à l'organisation qui encaisse, avec un filtre
   rigoureusement identique des deux côtés.

**Rationale** :

- **Pourquoi une 9e source et pas un droit de plus au caissier.** Élargir
  `set_contest_award_status` au rôle `cashier` aurait donné au comptoir le
  pouvoir d'**annuler** un lot, et aurait laissé la remise hors du contrat commun
  (pas de panier, pas d'expiration serveur, pas de réponse indistinguable). Le
  module de caisse est déjà un point unique de lecture pour 8 familles de codes :
  la 9e coûte un préfixe et une RPC, et le caissier n'apprend rien de nouveau.
- **Pourquoi une seule colonne et un renommage.** Conserver `delivered_at` et
  ajouter `redeemed_at` aurait créé deux horodatages qui divergent au premier
  chemin d'écriture oublié, et un doute permanent sur celui qui fait foi. Le
  renommage est plus coûteux une fois (migration, types, UI) et gratuit ensuite.
  Le CHECK déplace l'invariant de la discipline du code vers la base : les deux
  RPC sont contraintes, y compris une future troisième.
- **Pourquoi les bornes de TTL divergent.** Sur la roue, le décompte part du
  moment où le joueur **vient de gagner et se trouve devant la caisse** : la
  fenêtre courte est précisément ce qui empêche de réutiliser une capture
  d'écran. Sur un championnat, le décompte part de la **clôture**, pas d'un
  joueur présent en boutique : le gagnant doit être prévenu, puis se déplacer.
  Toute borne de l'ordre de la minute expirerait 100 % des codes **avant le
  premier retrait possible**. Uniformiser les bornes aurait uniformisé un chiffre
  au prix de la fonction qu'il remplit.
- **Pourquoi l'org-scoping va jusqu'à l'`UPDATE`.** La revue a relevé que
  `c.name` (le championnat) et `pl.first_name` (le **prénom du gagnant**) sont
  les deux champs affichés au comptoir : ne scoper que la lecture aurait produit
  un état **pire** que le défaut d'origine — le lot consommé et audité pendant
  que la caisse affiche « code inconnu ».

**Consequences** :

- la caisse (`/dashboard/redeem`) reconnaît désormais **9 familles de codes** ;
  le palmarès du championnat affiche quand, par qui et pour quel panier chaque
  lot a été remis, et le joueur voit l'échéance de son code ;
- **bascule de tie-break assumée** : une saisie **nue** de 8 caractères (sans
  préfixe) résout vers les pronostics **avant** le repli roue. Comportement
  testé et voulu, mais c'est un changement de résolution pour les codes nus ;
- **résidu M2, non livré** : chaque famille consomme son propre jeton
  `cashier:lookup`, donc une saisie nue en consomme désormais **9** et ramène le
  caissier à ~3 recherches/minute, le refus s'affichant « code introuvable » sur
  un lot valide. Le correctif est écrit et vert (1 222 tests) mais **non
  commité** — il concerne les 9 sources, pas les seuls pronostics (docs/bugs.md) ;
- `set_contest_award_status('delivered')` **ne teste pas** `redeem_expires_at` :
  un owner peut honorer depuis le dashboard un code périmé. Le TTL protège le
  commerçant, c'est donc lui qui en déroge — dérogation assumée, pas oubli ;
- aucune garde `hasPronosticsAccess` sur la remise, **cohérent avec les 8 autres
  sources** : on n'annule pas des lots déjà dus parce qu'un abonnement a expiré ;
- l'index unique élargit la portée anti-collision de « par championnat » à « par
  organisation » alors que `finalize_contest` n'a **pas** de boucle de reprise sur
  le code (~5·10⁻⁷ pour 1 000 lots ; la clôture avorte en transaction et reste
  rejouable) ;
- les 43 assertions pgTAP de `supabase/tests/contest_awards.test.sql` et les 4 de
  l'audit ACL central **restent à prouver en CI** : c'est le trou réel du
  chantier.

---

## ADR-044 : Méta-progression — moteur par trigger, invariant non monétaire, interrupteur d'arrêt comme seul geste sur une saison lancée
**Date** : 2026-07-26 (mis à jour 2026-07-27)
**Status** : Accepted — branche `chantier/audit-3` poussée, **PR #29 ouverte
et entièrement verte (6/6 jobs)** après 13 passages CI. Migrations
`20260805200000` / `20260805210000` / `20260805220000`, `EXPECTED_MIGRATION` =
`20260805220000`, non fusionnée sur `main` à ce stade. **pgTAP et E2E ont été
exécutés pour la première fois** via cette PR — 22/22 suites, 1 781
assertions, E2E verts — puisque Docker Desktop exige un build Windows ≥ 19045
et que la machine de développement est figée en LTSC 2021 / 19044 pour toute
sa durée de vie (seule la CI fait autorité, voir mémoire utilisateur
« Docker impossible, la CI est seul juge »). L'exécution a trouvé 8 défauts
qu'aucune relecture n'avait vus (docs/bugs.md), et a révélé qu'un correctif
antérieur (`15364ee`) créait lui-même le blocage qu'il prétendait résoudre —
annulé par `c131340`.

**Context** : 1 713 lignes de SQL dormaient depuis un chantier antérieur de
l'audit 3 — 14 tables `progression_*` (missions, collections, badges, coffres,
saisons, items joueur) et 13 fonctions, mais **aucune RPC appelée par le code**
et **aucune UI**. C'était la seule fondation du projet entièrement morte, et le
n°1 du backlog de l'audit (`docs/audit-3-backlog.md`, item 13).

**Decision** :

1. **Le moteur est un trigger, pas un appel.** `apply_meta_progression_event()`
   est branché sur `experience_events` : les missions progressent depuis les
   9 expériences existantes **sans une seule ligne applicative**. Conséquence
   directe : brancher ce module consistait à livrer la lecture, l'écriture de
   configuration et l'ouverture de coffre — la progression elle-même tournait
   déjà, silencieusement, avant ce chantier.
2. **Invariant NON MONÉTAIRE.** Clés, badges, objets et coffres sont des
   marqueurs d'engagement, pas des récompenses commerciales. Aucun code de
   caisse, aucune ligne `reward_issuances`, aucune colonne `*_cents` sur les
   14 tables. Vérifié par **grep inverse** : aucun autre module du projet ne
   lit ces tables — l'économie de clés est close sur elle-même. Une récompense
   commerciale continue d'être émise par sa source d'origine (roue, quiz,
   pronostics, …), jamais par la progression.
3. **Sel serveur sur le butin.** Le tirage d'origine était
   `order by md5(request_id ‖ item.id)` avec un `request_id` **fourni par le
   client** : meulable hors ligne pour choisir son objet. Corrigé par
   `progression_chests.loot_seed`, généré et conservé côté serveur, qui ne sort
   jamais de la base (`20260805210000_meta_progression_lifecycle.sql`,
   `bf2c3d3`). L'idempotence par `request_id` est préservée — c'était la
   contrainte difficile de ce correctif.
4. **L'interrupteur d'arrêt est le seul geste autorisé sur une saison
   lancée.** Toute l'édition (missions, coffres, dotations, règles) est bornée
   au brouillon. `set_progression_mission_enabled` et
   `set_progression_chest_enabled` font seuls exception, et ne touchent
   **que** la colonne `enabled` — jamais les règles ni les dotations. Sans cet
   interrupteur, corriger une mission trop généreuse en cours de saison
   exigeait de clore toute la saison et de basculer chaque joueur sur son
   archive.
5. **`canConfigure` distingue « rien n'est configuré » de « tu n'as pas le
   droit de le voir ».** Un tableau vide muet aurait laissé croire à un
   commerçant sans droit d'édition qu'aucune saison n'existe.
6. **La clôture est définitive.** Aucune RPC ne réactive une saison une fois
   close — arbitrage produit assumé, énoncé dans l'UI avant le clic.
7. **`z.boolean()` strict, pas `z.coerce.boolean()`**, sur les entrées de
   l'interrupteur d'arrêt — seul écart de style du chantier, délibéré : la
   coercition transforme la chaîne `"false"` en `true`, ce qui ferait d'un
   interrupteur d'arrêt un relanceur de ce qu'il est censé couper.
8. **Deux arbitrages client** : édition et suppression de saison sont
   possibles, mais **bornées aux saisons à l'état brouillon** ; et **aucun
   `addon_progression`** n'a été créé — la monétisation du module est reportée
   au packaging commercial (item 10 du backlog de l'audit).
9. **L'archive joueur inclut les saisons échues non encore closes.** Sans
   cela, les badges d'un joueur auraient disparu de son écran pendant toute la
   fenêtre entre `ends_at` et la clôture manuelle par le commerçant.

**Rationale** :

- **Pourquoi un trigger et pas un appel explicite dans chaque action de jeu.**
  Les 9 expériences (roue, quiz, pronostics, chasse, passeport, jackpot,
  événement live, calendrier, parrainage) auraient chacune dû apprendre à
  notifier la progression — 9 points d'oubli possibles, et un dixième à chaque
  nouvelle expérience. Le trigger sur `experience_events`, déjà la source
  commune d'analytics (`track_experience_activity`), rend la connexion
  automatique et rétroactive : les 9 expériences existantes progressent les
  missions sans modification de leur propre code.
- **Pourquoi l'invariant non monétaire, explicitement.** Le module manipule du
  stock (coffres, dotations) et pourrait facilement glisser vers une
  ressource échangeable. Fixer l'invariant dès l'ADR — et le vérifier par grep
  inverse plutôt que par affirmation — empêche qu'un futur chantier fasse
  lire ces tables par un module de caisse sans re-décider consciemment le
  changement de nature de la ressource.
- **Pourquoi le sel serveur plutôt qu'un durcissement du `request_id` client.**
  Interdire au client de choisir son `request_id` aurait cassé l'idempotence
  existante (le client doit pouvoir rejouer sa propre requête après une
  coupure réseau). Séparer « la clé d'idempotence » (client, rejouable) de
  « la graine de tirage » (serveur, secrète) résout les deux exigences sans
  compromettre l'une pour l'autre.
- **Pourquoi l'interrupteur d'arrêt et rien de plus.** Autoriser l'édition
  complète d'une saison lancée aurait permis de modifier rétroactivement des
  règles déjà appliquées à des joueurs ayant déjà progressé — un problème
  d'équité. Autoriser seulement `enabled` donne au commerçant le seul geste
  dont l'effet est prévisible : arrêter, sans réécrire l'histoire.

**Consequences** :

- 27 RPC exposées (`src/actions/meta-progression.ts`), backend
  `src/lib/meta-progression.ts` / `src/lib/validations/meta-progression.ts`,
  nouveaux seaux de rate-limit `progressionDevice` / `progressionPlayerAction`
  / `progressionPublicIp`, 9e RPC de purge dans le cron `purge-data`, sonde
  SLO du journal moteur dans `src/lib/admin/ops.ts` ;
- éditeur commerçant `/dashboard/progression` et panneau joueur greffé au
  parcours public **existant** `/play/[slug]` — **aucune nouvelle surface
  publique** : la progression est scopée par organisation et n'a aucun objet
  propre à adresser par une URL ;
- **le panneau joueur n'est visible que depuis la roue.** Les missions
  **progressent** pourtant déjà depuis les 14 jeux rapides, le passeport, le
  calendrier, le quiz, la chasse, le jackpot et l'événement live — c'est la
  visibilité qui est partielle, pas le mécanisme (docs/bugs.md) ;
- **résidu M3 corrigé** : l'interrupteur d'arrêt (décision 4) répond au MOYEN
  de la revue sécurité qui notait l'absence de tout geste correctif sur une
  saison lancée ;
- **résidu assumé** : le seau de rate-limit par appareil borne un cookie, pas
  un humain — cohérent avec les 7 modules frères, rien de monétaire en jeu ;
- **Mise à jour 2026-07-27** : preuve obtenue — PR #29 verte (6/6 jobs), 22/22
  suites pgTAP, 1 781 assertions, E2E verts. Voir ADR-045 pour le prérequis
  d'identité découvert au passage, et docs/bugs.md pour les 8 défauts que
  l'exécution a révélés dans d'autres migrations du même chantier.

**References** :
- `supabase/migrations/20260805200000_meta_progression.sql` (1 713 l.)
- `supabase/migrations/20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`)
- `supabase/migrations/20260805220000_meta_progression_hardening.sql` (1 380 l., `3174cbd`)
- `supabase/tests/meta_progression.test.sql` (293 assertions)
- `src/lib/meta-progression.ts`, `src/actions/meta-progression.ts`
- `src/app/dashboard/progression`, `src/components/progression`, `src/components/wheel/progression-panel.tsx`
- `docs/audit-3-backlog.md` (item 13), `docs/roadmap.md` (V1.18), `docs/bugs.md`
- ADR-045 (identité joueur, prérequis)

## ADR-045 : L'identité joueur unifiée est un prérequis de la méta-progression, pas une dette annexe
**Date** : 2026-07-27
**Status** : Accepted — constat, aucun code livré par cette décision.

**Context** : ADR-044 (item 13 du backlog) a branché le moteur de
méta-progression sur `experience_events` via un trigger. En rejouant le
parcours joueur **en local contre un vrai Postgres et un vrai navigateur**
(première fois du projet, `c131340`), il apparaît que deux des neuf
événements métier — précisément ceux qu'émet la roue, l'expérience phare —
ne portent pas l'identité que le moteur exige :

```
experience_viewed    → player_id ✅   (identité unifiée, cookie lc-player)
experience_joined    → player_id ✅
experience_started   → player_id ✗   player_key seul  ← émis par le spin
experience_completed → player_id ✗   player_key seul  ← émis par le spin
```

`apply_meta_progression_event()` exige `player_id` et renonce dès sa première
garde. `spins.player_key` (cookie legacy par expérience, ADR antérieur à
l'identité unifiée) ne correspond à **aucun** `player_devices.token_hash` —
jointure vide, mesurée, pas supposée. Les deux systèmes d'identité — le cookie
historique par expérience et `players`/`player_devices` (identité joueur
unifiée, item 5 du backlog) — **ne se rencontrent jamais**. Conséquence
produit directe : aucune mission fondée sur « lancer » ou « terminer » une
expérience ne peut progresser depuis la roue. Preuve en base : 0
`progression_mission_progress`, 0 `progression_player_seasons`, et
`progression_engine_failures` **vide** — le moteur ne plante pas, il renonce
en silence (invisible sans la sonde SLO ajoutée en `1051bea`).

**Decision** :

1. L'item 5 du backlog de l'audit 3 (« migration des cookies existants »,
   `docs/audit-3-backlog.md`) est **requalifié de dette en prérequis** du
   module 13. Tant qu'il n'est pas traité, la méta-progression reste
   fonctionnelle uniquement pour les modules qui posent déjà `player_id` sur
   leurs événements (les 7 autres expériences, à vérifier module par module),
   jamais pour la roue.
2. Le test E2E du panneau joueur (`e2e/progression.spec.ts`) est laissé en
   `test.fixme` avec la raison écrite en commentaire, plutôt que supprimé ou
   laissé rouge — pour qu'il documente le manque et reparte au vert dès que
   le prérequis est traité, sans qu'un futur chantier ait à redécouvrir le
   même fait.
3. Aucun correctif n'est tenté ici : faire émettre `player_id` par le spin
   sans traiter la migration des cookies existants aurait recréé, à l'envers,
   le même défaut (identité qui change sous un joueur déjà engagé).

**Rationale** : documenter un constat vérifié en base plutôt que de le
laisser se reproduire silencieusement dans un futur chantier qui croirait le
module 13 entièrement fonctionnel parce que ses tests unitaires (qui ne
traversent pas un vrai Postgres) passent.

**Consequences** :
- `docs/audit-3-backlog.md` item 5 marque explicitement le lien vers l'item 13 ;
- tout chantier qui reprend l'item 5 doit vérifier, en plus de la migration
  des cookies, que le spin émette bien `player_id` sur `experience_started`
  et `experience_completed` ;
- aucune régression de sécurité : le moteur renonce fail-closed (aucune
  mission n'avance à tort), le défaut est un manque de fonctionnalité, pas
  une fuite.

**Addendum — correction de la cause, 2026-07-27 (`a963583`)** : le diagnostic
ci-dessus était **juste dans l'effet, faux dans la cause**. La résolution
`player_id` depuis `player_legacy_identities` n'était pas absente : elle
existait déjà et fonctionne, dans `append_experience_event_internal`
(`20260805160000:382-393`), point d'émission unique des 10 branches
d'événements — donc pas seulement la roue. Mesuré contre un vrai Postgres :
la vraie cause est un **ordre d'écriture**. `resolve_player_identity` insère
l'adhésion AVANT la ligne de pont (`player_legacy_identities`), la FK
composite l'impose ; or c'est le trigger de l'adhésion qui portait le
rattrapage, et il lisait un pont pas encore écrit. 1re résolution après un
join → `player_id` nul ; 2e → attribué. Le rattrapage existait donc bel et
bien, décalé d'une visite entière — pas absent comme l'ADR l'affirmait ; le
tout premier tour de roue d'un joueur neuf (cas le plus fréquent sur un
produit à QR code) ne faisait progresser aucune mission au moment où il
avait lieu.

Second défaut trouvé en mesurant, absent du diagnostic initial : le
`select ... into` de `resolve_player_identity` NULLifiait aussi
`v_source`/`v_qr_code_id` sur non-correspondance — la source `direct` de la
roue était dégradée en `unknown` sur tout événement émis avant la pose de son
pont, faussant l'attribution d'acquisition à chaque premier passage.

**Correctif** : trigger `AFTER INSERT` sur `player_legacy_identities`
(migration `20260805230000_experience_identity_backfill.sql`), posé là où la
correspondance hash → `player_id` devient vraie — indépendant de l'ordre
d'écriture côté serveur, donc insensible à un futur réordonnancement de
`resolve_player_identity`. Vérifié `supabase test db` : **1 804 assertions
PASS** (contre 1 781 avant ce correctif). **Contrôle négatif** : migration
retirée, 8 assertions tombent — la preuve porte sur le défaut réel, pas sur
une tautologie. `EXPLAIN` confirme l'usage des deux index concernés.
`EXPECTED_MIGRATION` bumpé à `20260805230000`.

**Status final** : **Resolved** (le prérequis constaté par cet ADR est
traité). Le test `e2e/progression.spec.ts` reste toutefois en `test.fixme`
au 2026-07-27 malgré ce correctif — non réactivé dans ce chantier, à faire
séparément (voir docs/audit-3-backlog.md, item 5).

## ADR-046 : Une transition d'entrée hors `prefers-reduced-motion` peut casser le contraste calculé, pas seulement l'accessibilité au mouvement
**Date** : 2026-07-27
**Status** : Accepted — résolu par `1cf46cf`.

**Context** : troisième défaut d'accessibilité réel trouvé sur `/play`, après
le bouton `danger` sous le seuil AA (`6973d13`) et le texte secondaire
(passeport). `.play-in` était la seule animation d'entrée de `/play` absente
du bloc `prefers-reduced-motion: reduce` de `globals.css` (22 classes s'y
trouvaient, elle manquait). Son keyframe animait `opacity: 0 → 1` sur 450 ms.
axe-core replie l'opacité des ancêtres dans le calcul du contraste du texte :
pendant la transition, tout le petit texte de l'écran traversait une zone
sous le seuil AA — pour **tout** joueur, y compris ceux SANS préférence de
mouvement réduit, à chaque changement d'écran. 20 points d'appel dans 5
composants : tous les parcours `/play`, pas seulement les 14 jeux rapides.
Explique l'intermittence observée en CI : `progression.spec.ts` pose
`reducedMotion: "reduce"` et échappe au fondu, `skill-games.spec.ts` non.

**Decision** :
1. `.play-in` ajouté au bloc `prefers-reduced-motion: reduce` de
   `globals.css:601`.
2. Opacité de départ portée de `0` à `0.75` — le `translateY(14px)` porte
   seul l'arrivée. Corrige le cas SANS préférence de mouvement réduit, que
   le point 1 seul ne couvre pas.
3. Jeton `--color-k-muted: #6b6459` introduit (5,4:1 sur crème) pour la
   grappe `opacity-*` sur du texte (`puzzle` ×2, `gauge`, `estimate` ×2,
   `mystery-word` ×2, `rps`) ; les 4 boutons de validation recopiés à
   l'identique factorisés dans `challengeButtonTone()`
   (`src/components/play/play-theme.tsx`).
4. Le contournement JS du panneau de progression
   (`reducedMotion ? "" : "play-in"`) redevient inconditionnel — sa raison
   d'être disparaît une fois le point 1 traité. Le hook
   `usePrefersReducedMotion` est conservé : il sert encore une `transition`
   inline (jauge) hors de portée d'une feuille de style.
5. Laissé volontairement : `chest-reveal` et `cups-reveal` gardent
   `opacity-40` — leur bouton ne contient qu'un emoji décoratif, aucune règle
   de contraste ne s'y applique.

**Rationale** : la classe d'erreur est générale, pas propre à ce composant —
toute transition d'opacité sur un conteneur de texte, non couverte par
`prefers-reduced-motion`, dégrade le contraste calculé pour l'ensemble des
utilisateurs pendant sa durée, pas seulement pour ceux visés par la media
query. Vaut d'être retenue au-delà de `/play`.

**Consequences** :
- diagnostic établi sur pièces (lecture de `globals.css` et des composants),
  confirmé par exécution ensuite : CI verte.
- résiduel : aucune spec ne scanne encore un état post-soumission
  (`opacity-40`/`opacity-60` sur des contrôles verrouillés) — la première qui
  le fera devra vérifier le même invariant de contraste.

**References** :
- `src/lib/meta-progression.ts` (`apply_meta_progression_event`)
- `supabase/migrations/20260805140000_player_identity.sql`
- `docs/audit-3-backlog.md` (items 5 et 13)
- ADR-044

## ADR-047 : Une shorthand CSS `background` peut effacer la couleur de fond posée avant elle, pas seulement la peindre

**Date** : 2026-07-27
**Status** : Accepted — résolu par `d96acbd`.

**Context** : quatrième défaut d'accessibilité réel trouvé sur `/play`, celui-ci
**en production** depuis le lancement du thème commerçant. `src/app/play/[slug]/page.tsx`
peint le thème « nuit » avec la shorthand CSS `background` : `background-image` (le
dégradé du commerçant) et `background-color` sont posés dans la même
déclaration, donc quand seul le dégradé est fourni, la shorthand **remet
`background-color` à sa valeur initiale (`transparent`)** — même si une
couleur avait été posée juste avant dans la cascade. Sous `/play`, la seule
peinture opaque restante était alors celle du `body` du site vitrine :
**crème** (`#fdf6e3`). Tant que le dégradé du commerçant peint effectivement,
invisible à l'œil — le dégradé recouvre tout. Le jour où il ne peint pas
(chargement lent, dégradé retiré, repaint partiel, ou tout outil qui empile
les fonds pour calculer un contraste, tel axe-core), le texte blanc du thème
nuit se retrouve sur fond crème : 1,07:1 pour l'accroche, 1,05:1 pour le nom
du commerce — annulant tout le travail de contraste par ailleurs correct.
Trouvé par un scan axe sur `e2e/player-win.spec.ts`, jamais par relecture.

**Decision** : reposer la couleur pleine du thème (`bgTo`) **après** la
shorthand `background`, dans `PlayShell` et dans l'aperçu de l'éditeur qui
recopiait la même construction. À l'écran, rien ne change — le dégradé la
recouvre toujours — mais le fond de `/play` n'est plus, en dernier ressort,
celui d'une page claire.

**Rationale** : la classe d'erreur est générale, pas propre à ce composant —
toute shorthand CSS qui combine `background-image` et une couleur implicite
efface silencieusement une `background-color` posée ailleurs dans la cascade,
y compris par une règle jugée hors de cause. Un audit de contraste qui ne
regarde que les propriétés explicitement déclarées sur l'élément manque ce
cas ; seul l'empilement réel des fonds (calcul d'axe-core, ou un repaint qui
expose la couche du dessous) le révèle.

**Consequences** :
- même chantier, un second défaut de couleur traité comme une **classe** :
  `text-zinc-500` (4,21:1) et `text-k-body/70` (4,49:1), sous le seuil AA aux
  tailles où ils servent dans les deux thèmes, remplacés par un jeton partagé
  `playText.muted()` dans 11 recopies.
- résiduel : aucune garde automatisée n'empêche une future shorthand
  `background` de reproduire ce défaut — seul le scan axe de
  `e2e/player-win.spec.ts` le couvre aujourd'hui.

**References** :
- `src/app/play/[slug]/page.tsx`, `src/components/dashboard/wheel-style-editor.tsx` (aperçu)
- `src/components/wheel/play-theme.tsx` (jeton `playText.muted()`)
- ADR-046 (même chantier, défaut d'accessibilité voisin — transition d'opacité)
- `docs/bugs.md` (Resolved)

---

## ADR-048 : Un repli silencieux ne se retire pas — il se mesure d'abord

**Date** : 2026-07-29
**Statut** : accepté

**Context** :
`20260805150000_universal_rewards.sql` a installé le registre universel
`reward_issuances`, ses dix triggers de miroir et le moteur unique
`redeem_reward_by_code`. Son en-tête assume une « migration sans big-bang » :
**rien n'a été rétro-alimenté**. Tout lot émis avant cette migration est donc
invisible du moteur, qui sort en zéro ligne.

Personne ne s'en apercevait, et c'est le point : la caisse tente le moteur,
obtient zéro ligne, et **retombe silencieusement** sur la RPC historique de la
famille. Le test `universal_rewards.test.sql:311-341` prouve littéralement que
c'est ce repli qui sauve ces codes — il supprime la ligne de registre pour
simuler une émission antérieure.

L'item 4 de l'audit 3 (« basculer la caisse sur le moteur unique ») supposait
qu'il suffisait de retirer les neuf chemins historiques. C'était faux, pour
deux raisons distinctes qu'aucune relecture n'avait séparées.

**Decision** :
Traiter la bascule comme **trois étapes ordonnées**, dont les deux premières
ne changent aucun comportement.

1. **Rétro-alimenter** (`20260807120000`) : rejouer `sync_reward_issuance` sur
   les dix tables historiques. L'outil existait et est idempotent par
   construction ; une boucle plutôt qu'un `insert … select`, parce que la
   logique par famille (résolution du joueur, expiration, annulation) vit déjà
   dans cette fonction — la réécrire en ensembliste recréerait la seconde
   source de vérité que le registre existe pour supprimer.
2. **Mesurer** : compteurs `rewards.registry_miss.<famille>` et
   `rewards.registry_error` dans `ops_metrics`, objectif back-office
   `rewards-registry` vert seulement à zéro sur 24 h.
3. **Basculer**, famille par famille, **conditionné à la mesure** — pas au
   jugement.

**Consequences** :
- Un repli conçu pour être invisible est, par construction, un repli qu'on ne
  peut pas retirer : son silence en régime nominal est indistinguable de son
  inutilité. L'instrumenter n'est pas du confort, c'est la condition de sa
  suppression. Zéro ligne étant la valeur saine, l'instrumentation ne coûte
  rien quand tout va bien.
- Les compteurs **nomment la famille** : la bascule se fait module par module,
  un total agrégé ne dirait pas lequel est prêt. Ils ne journalisent **jamais**
  le code (secret porteur).
- `registry_miss` et `registry_error` sont **séparés** : registre incomplet et
  registre injoignable interdisent tous deux la bascule, pour des raisons
  opposées ; les confondre ferait diagnostiquer l'un pour l'autre.
- Aucune table ni migration pour les compteurs — `ops_metrics` porte déjà la
  purge à 30 jours et la synthèse. Un compteur n'a pas mérité sa table.
- **Mesuré, pas présumé, en écrivant la migration** : la colonne de code n'est
  pas uniforme (`participations` porte `redeem_code`, les neuf autres `code`).
  Présumer l'uniformité fait échouer la migration entière sur un `42703`.
  Corollaire utile : un nom de colonne erroné lève ce `42703` dès l'ouverture
  du curseur **même sur une table vide**, donc à chaque `db reset` de la CI.
- La liste des dix tables a été vérifiée contre le catalogue vivant (tables
  portant un trigger appelant `sync_reward_issuance`), pas déduite des noms.
- **Résiduel assumé** : le chemin de **lecture** de la caisse
  (`lookupRedeemCode`, neuf familles) reste hors périmètre — seule
  l'écriture est concernée. Et la bascule elle-même reste à faire : ces deux
  étapes la rendent possible et sûre, elles ne la réalisent pas.

**References** :
- `supabase/migrations/20260807120000_backfill_reward_issuances.sql`
- `supabase/tests/reward_backfill.test.sql` (12 assertions, contrôle négatif)
- `src/lib/monitoring.ts` (`recordCounter`), `src/actions/participations.ts`
- `src/lib/admin/ops.ts` (`evaluateRewardsRegistrySlo`)
- `docs/audit-3-backlog.md` (item 4)
- ADR-043 (les 9 sources d'encaissement et leur colonne de vérité)

---

## ADR-049 : `revoke all … from public, anon` ne retire pas `service_role` — vérifier en base, pas déduire de l'idiome

**Date** : 2026-07-31
**Statut** : accepté

**Context** :
Une revue de sécurité sur `settle_hunt_completions` (voir docs/bugs.md,
2026-07-31) a fait relire l'idiome `revoke all on function … from public,
anon`, présent 81 fois dans 26 fichiers de migration, avec l'hypothèse
implicite qu'il ferme l'appel à toute autre partie que `service_role`.

Mesuré en base plutôt que présumé : `pg_default_acl` porte un `alter default
privileges … grant all on functions to postgres, anon, authenticated,
service_role`, posé par Supabase à l'initialisation du projet. Ce GRANT par
défaut s'applique à **toute nouvelle fonction**, y compris celles qui ne
révoquent que `public` et `anon`. Conséquence vérifiée par
`select proacl from pg_proc where pronamespace = 'public'::regnamespace` :
217 des 231 fonctions du schéma `public` portent `service_role=X` dans leur
ACL, alors que seules 4 occurrences de l'idiome révoquent explicitement
`service_role`.

**Decision** :
Ne pas traiter cet écart comme une vulnérabilité et ne pas lancer de
migration corrective de masse.

- `service_role` contourne déjà Row Level Security et lit/écrit les tables en
  accès direct : qu'il puisse aussi appeler la fonction par son nom ne lui
  ouvre rien qu'il n'ait déjà. **Ce n'est pas une escalade de privilège.**
- C'est en revanche un écart entre ce que le code affirme (« seul
  `service_role` peut appeler ceci ») et ce que la base fait réellement
  (n'importe quel rôle qui obtiendrait `service_role` — ou un audit qui lirait
  l'ACL en la croyant close — verrait une porte que le commentaire dit
  fermée).
- Les quatre fonctions touchées par le chantier du 2026-07-31
  (`settle_hunt_completions`, `hunt_settlement_preview`, et les deux fonctions
  de gestion d'équipe) portent désormais le `revoke` écrit explicitement
  jusqu'à `service_role`.
- Les 77 autres sites ne sont **pas** corrigés : une migration de masse sur
  81 occurrences, pour un écart qui ne change aucun comportement observable,
  coûterait plus qu'elle ne prouverait. Un développeur qui touche l'une de
  ces fonctions et veut vérifier son ACL réelle doit interroger `pg_proc`,
  pas relire le DDL.

**Consequences** :
- Toute future revue de sécurité qui s'appuie sur la présence de
  `revoke all … from public, anon` pour conclure « seul `service_role`
  appelle ceci » doit vérifier `pg_proc.proacl`, pas se fier au texte de la
  migration.
- Le vrai périmètre de protection de ces fonctions reste ce qu'il a toujours
  été : les gardes applicatives (org courante, rôle, addon) exécutées DANS le
  corps de la fonction, pas le GRANT/REVOKE au niveau du rôle SQL.

**References** :
- `docs/bugs.md` (Low Priority, « `revoke all … from public, anon` ne retire
  pas `service_role` »)
- Vérification : `select proacl from pg_proc where pronamespace =
  'public'::regnamespace and proname = '<nom>';`

---

## ADR-050 : L'abonnement actif se lit par l'événement Stripe reçu, pas par la présence d'un client Stripe

**Date** : 2026-07-31
**Statut** : accepté

**Context** :
`ensureStripeCustomer` écrit `stripe_customer_id` dès l'OUVERTURE de la page
de paiement — avant tout paiement réel — et rien ne le remet à `null` (le
webhook ne traite pas `checkout.session.expired`). Le prédicat qui décidait
d'afficher le bouton « S'abonner » testait la présence de
`stripe_customer_id`. Un propriétaire qui cliquait « Retour » sur la page
Stripe repartait donc avec un client Stripe, zéro abonnement, et plus jamais
de bouton pour payer — à sa place le portail Stripe, qui ne sait pas créer un
premier abonnement (voir docs/bugs.md, 2026-07-31).

**Decision** :
Le discriminant d'« a un abonnement actif » devient `stripe_event_created_at`,
une colonne écrite **uniquement** par `apply_stripe_subscription_event_v2` —
donc seulement quand Stripe a réellement annoncé un abonnement, jamais à la
simple création d'un client. La décision est extraite en fonction pure
(`billingActions`) plutôt que laissée dans la page, pour qu'un futur écran
qui a besoin du même verdict ne réinvente pas le prédicat.

Deux garde-fous posés dans le même geste, pour ne pas rouvrir une fenêtre en
en fermant une autre :
- Entre le retour de paiement (`?checkout=success`) et l'arrivée du webhook
  (quelques secondes), la page affiche explicitement « abonnement en cours
  d'activation » plutôt que de ré-afficher un bouton de paiement qui ferait
  payer deux fois.
- `canCheckout` et `canManage` ne s'excluent plus : un abonnement résilié
  ouvre les deux (consulter ses anciennes factures ET se réabonner).
  `inactive` (qui couvre `incomplete` et `paused` — un objet abonnement vit
  encore chez Stripe) ne rouvre volontairement PAS le checkout : y proposer
  un paiement facturerait deux fois un abonnement récupérable par le portail.
- La garde anti-double-abonnement est descendue **côté serveur**, dans
  `createCheckoutSession`, plutôt que dans la seule visibilité du bouton — un
  bouton masqué n'arrête ni un POST rejoué ni une page laissée ouverte.

**Consequences** :
- Tout futur écran ou action qui a besoin de savoir « ce commerçant a-t-il un
  abonnement actif » doit lire `stripe_event_created_at` via `billingActions`,
  jamais `stripe_customer_id` seul.
- Le délai de grâce sur impayé (`past_due_since`, ADR-009) doit être maintenu
  par **tout** écrivain de statut d'abonnement, y compris les actions admin —
  un écrivain qui l'omet rouvre un accès complet indéfini sans que rien ne le
  signale (défaut trouvé et corrigé le même jour, voir docs/bugs.md).

**References** :
- `docs/bugs.md` (2026-07-31, « Avoir un client Stripe » n'est pas « avoir un
  abonnement »)
- ADR-009 (délai de grâce sur impayé)
- `src/lib/billingActions.ts`, `src/actions/billing.ts` (`createCheckoutSession`)

---

## ADR-051 : L'autorité de Stripe sur les droits s'arrête avec l'abonnement, pas avec le client

**Date** : 2026-07-31
**Statut** : accepté

**Context** :
Le trigger `protect_stripe_managed_entitlements` interdit au back-office
d'écrire `plan` et les colonnes `addon_*` d'une organisation « gérée par
Stripe ». Sa condition était un `exists` sur `organization_entitlements`
filtré sur `source = 'stripe'`, sans filtre sur `active`. Or une résiliation
met `active = false` en laissant les lignes : un commerçant résilié restait
donc géré par Stripe **à vie**, alors qu'il est exactement la cible
naturelle d'un accès offert (partenaire, compensation, presse, reconquête
d'un client parti). L'administrateur obtenait « Échec de la mise à jour »
sans issue. Ce point avait été laissé ouvert le 2026-07-31 (voir
docs/bugs.md, entrée « Avoir un client Stripe ») précisément parce que le
corriger déplace une assertion de sécurité existante — voir plus bas.

**Decision** :
Le prédicat du trigger devient `source = 'stripe' and active` : Stripe ne
fait autorité que tant qu'il gouverne réellement l'organisation.
`org_effective_entitlements` porte le même `exists` sans `active` et n'est
**délibérément pas corrigée à l'identique** : elle n'a aucun appelant
applicatif, et y ajouter le prédicat ferait rejaillir les droits legacy d'un
résilié — un risque sans bénéfice mesurable aujourd'hui. `comp_access` reste
un droit orthogonal accordé par le back-office ; il n'est jamais couplé à
l'état Stripe.

`subscription_entitlements.test.sql` plaçait ses deux `throws_ok` 42501
**après** l'événement de résiliation, là où la propriété qu'ils protègent
devient fausse. Ils ont été remontés sur l'abonnement vivant — leur
placement d'origine tenait à la commodité d'écriture, pas à une intention —
avec un miroir après résiliation qui **relit la valeur** plutôt qu'un simple
`lives_ok` (un `lives_ok` seul resterait vert si un autre trigger annulait
la ligne en silence), et la frontière `past_due` contrôlée séparément
(`v_access_active` reste vrai, les droits doivent rester bloqués).

**Consequences** :
- Toute future lecture de « ce commerçant est-il géré par Stripe » doit
  filtrer sur `active`, sous peine de reproduire ce même verrou permanent.
- `org_effective_entitlements` reste une trappe à corriger le jour où elle
  gagnera un appelant applicatif — pas avant, et pas par cohérence
  cosmétique avec le trigger.
- Un déplacement d'assertion de sécurité (et non un simple ajout) doit être
  mesuré : la preuve retenue ici est que le fichier de test au HEAD, joué
  contre la fonction corrigée, rend exactement les deux rouges attendus et
  aucun autre.

**References** :
- `docs/bugs.md` (2026-07-31, « Avoir un client Stripe » n'est pas « avoir un
  abonnement » — clos)
- ADR-049 (`revoke … from service_role`, même migration)
- `supabase/migrations/20260818120000_*.sql`
- `supabase/tests/subscription_entitlements.test.sql`

---

## ADR-052 : Un essai que Stripe ne confirme pas finit résilié — Stripe interrogé avant chaque bascule, jamais l'inverse

**Date** : 2026-07-31
**Statut** : accepté

**Context** :
Demande du client : qu'un commerçant en essai soit résilié si Stripe ne
remonte jamais de paiement actif. Un essai expiré sans souscription restait
`trialing` indéfiniment — pas un trou d'accès (`hasActiveAccess` coupe déjà
à `trial_ends_at`), mais un mensonge de statut : la base affichait « en
essai » sur des comptes finis depuis des mois, et le back-office comptait
ces prospects parmi les essais en cours.

**Decision** :
Nouveau cron quotidien `GET /api/cron/expire-trials`, sur le modèle des huit
crons existants, avec trois garde-fous ordonnés par ce qu'ils coûtent s'ils
manquent :
1. On **demande à Stripe** avant chaque bascule (`hasLiveStripeSubscription`).
   Seul un `stripe_customer_id` nul (aucune page de paiement jamais ouverte)
   autorise une résiliation sans appel.
2. Une **panne Stripe ne résilie personne** : l'organisation est sautée et
   journalisée, réessayée le lendemain. Propriété la plus importante du
   lot — un incident chez Stripe ne doit jamais se traduire par une
   résiliation de masse.
3. Un abonnement **vivant chez Stripe** alors que le statut local dit
   `trialing` est un webhook perdu, pas un cas normal : remonté, jamais
   résilié.

Le délai de grâce de 3 jours n'est **pas** la protection contre le faux
positif — c'est la garde 1 qui l'assure. Le délai n'est que la fenêtre de
réessai d'un webhook Stripe : une panne complète de notre réception se
rattrape à l'intérieur de la marge. L'écriture est un `UPDATE` conditionnel
sur `subscription_status = 'trialing'` (un webhook hors ordre garde la
main) qui ne touche que le statut — écrire `plan` ou `addon_*` lèverait le
42501 de l'ADR-051.

`comp_access` n'est **pas** exclu du calcul : c'est un droit accordé par le
back-office, orthogonal à l'état Stripe ; les coupler ferait dire deux
choses au même champ.

18 lecteurs de `trialing` ont été audités, 7 modifiés. `isTrialExpired`
reçoit un discriminant `ever_subscribed`, optionnel et testé `=== false` :
un appelant qui ne sait pas garde l'ancien comportement, pour ne pas
remplacer le bandeau « Votre essai gratuit est terminé » par un « abonnement
inactif » générique sur exactement la population visée. Le discriminant se
replie sur `true` en cas de panne — on dégrade vers le vague, jamais vers le
faux.

**Consequences** :
- `ops_worker_runs.worker` étant une clé étrangère, tout nouveau cron doit
  être inscrit au registre des workers **dans la même migration** qui
  l'active — sans quoi son heartbeat est refusé et `startWorkerRunSafely`
  avale l'échec en silence (le worker tournerait sans laisser de trace).
- `resolveStripeEntitlements` doit toujours rendre un couple auto-cohérent
  (droits du plan retenu semés en sortie) — un couple `[]`/`core` sans
  droits avait été trouvé et corrigé dans ce même chantier.
- Les sept crons quotidiens restent inscrits mais **non supervisés**
  (`enabled = false`), `expire-trials` compris : un worker sans exécution
  réussie serait déclaré `never_succeeded` dès l'application de la
  migration. Lever la supervision est un `UPDATE`, pas une migration, et
  reste à faire une fois le premier passage constaté en production.
- Toute assertion pgTAP qui compte des workers par nombre plutôt que par nom
  masque la nature d'un écart (ajout vs perte) — voir le résidu corrigé dans
  `ops_monitoring.test.sql` (docs/bugs.md).

**References** :
- `docs/bugs.md` (2026-07-31, « Un essai que Stripe ne confirme pas restait
  `trialing` indéfiniment »)
- ADR-051 (l'autorité de Stripe et le même verrou d'écriture)
- ADR-009 (délai de grâce sur impayé, `past_due_since`)
- `supabase/migrations/20260819120000_*.sql`
- `src/lib/worker-health.test.ts` (registre dérivé du dossier de migrations)

---

## ADR-053 : Superviser un worker = un `UPDATE` conditionnel, pas une liste en dur ni une migration

**Date** : 2026-07-31
**Statut** : accepté

**Context** :
`20260805240000` avait inscrit les six crons quotidiens (`automations`,
`calendar-reminders`, `jackpot-draws`, `purge-data`, `reengage`,
`webhooks`) à `ops_worker_definitions.enabled = false`, avec un motif juste
à l'époque : « faux tant que la route du worker n'écrit pas de heartbeat ;
un worker jamais branché serait sinon rouge à tort ». Ce motif est caduc —
mesuré, pas supposé : les six routes appellent toutes
`startWorkerRunSafely` / `finishWorkerRunSafely` depuis des semaines. Elles
déposaient donc des lignes dans `ops_worker_runs` sans que
`ops_workers_health()`, et donc l'objectif de service du back-office, ne
les voie jamais. Une purge RGPD qui échouerait chaque nuit ne réveillerait
personne — même classe de défaut que « un back-office qui n'enregistrait
que ses succès », en miroir : ici la trace existe, elle n'est lue par rien.

**Decision** :
Migration `20260820120000` : un seul `UPDATE`, conditionnel, sans fonction
créée ni redéfinie —

```sql
update public.ops_worker_definitions d
   set enabled = true
 where not d.enabled
   and exists (
     select 1 from public.ops_worker_runs r
      where r.worker = d.worker and r.status = 'succeeded'
   );
```

Une **règle**, pas une liste énumérant les six noms : tout worker ayant
**déjà déposé un succès** devient supervisé. La table le dit d'elle-même
depuis sa création : « brancher un worker = un `UPDATE` de `enabled`, pas
une migration » — l'état de supervision dépend de l'**environnement**
(a-t-il déjà tourné avec succès quelque part), pas du schéma. Écrire
`enabled = true` en dur pour ces six noms l'aurait imposé aussi à une base
neuve (CI, poste de développement) où aucun worker n'a jamais tourné :
`ops_workers_health()` les aurait tous déclarés `never_succeeded`, objectif
rouge en permanence, partout, pour une raison qui n'est pas un incident. La
condition règle les deux cas d'un même geste : en production les six
passent supervisés ; sur une base fraîchement remise à zéro,
`ops_worker_runs` est vide et rien ne change.

`expire-trials` (ADR-052), déployé le jour même, n'a pas encore tourné
(cron à 05:10) et **reste à `false`** — on ne supervise pas une promesse,
on supervise un historique. Il se branchera de lui-même au prochain passage
de la règle, une fois son premier succès constaté.

`ops_worker_runs` étant purgée à 30 jours (cron `purge-data`), « a déjà
réussi » signifie en pratique « a réussi dans le mois » — un worker éteint
depuis plus longtemps ne serait pas rallumé par erreur en rejouant cette
migration.

**Deux erreurs de méthode dans la vérification, consignées parce qu'elles
valent l'enseignement** :
1. Le premier contrôle négatif ne prouvait rien : l'insertion du heartbeat
   de test portait `2>/dev/null` — sur la commande dont l'échec était
   précisément l'information cherchée. Refait sans redirection, six sondes
   numérotées, concluant (`INSERT 0 1`, `UPDATE 1`, supervisés devenant
   `jobs`, `purge-data`, `sync-contests`). L'échec du premier tour reste
   inexpliqué — l'information a été détruite avec la redirection, ce qui
   est écrit tel quel plutôt que par une cause inventée.
2. Une assertion pgTAP ajoutée pour « établir la prémisse » (« aucun succès
   n'est enregistré ») est tombée et avait tort : le fichier de test sème
   lui-même des exécutions plus haut pour éprouver la sonde de santé. Elle
   mesurait l'état après ses propres insertions. Retirée plutôt que
   rafistolée.

**Rationale** :
Une liste en dur aurait été plus simple à lire mais aurait figé la
supervision au jour de la migration — tout futur worker serait resté
`enabled = false` jusqu'à une migration dédiée, exactement le défaut que ce
chantier corrige. La règle conditionnelle rend la supervision
**auto-entretenue** : elle s'applique à `expire-trials` sans qu'il ait
fallu l'anticiper, et à tout worker à venir de la même façon.

**Consequences** :
- Un worker nouvellement inscrit au registre n'est **jamais** supervisé
  tant qu'il n'a pas déposé un succès — un déploiement le jour même ne
  suffit pas, c'est voulu.
- Rejouer cette migration (ou une règle équivalente) sur une base ayant
  accumulé des succès rallumera tout worker resté à `false` par erreur ;
  c'est un filet, pas seulement un correctif ponctuel.
- Sur une base neuve (CI, poste de développement), le comportement est
  inchangé — aucun worker n'est rallumé, l'objectif de service ne devient
  pas rouge par construction.

**References** :
- [Bugs — supervision des workers](./bugs.md)
- Migration `supabase/migrations/20260820120000_supervise_workers_with_proven_heartbeat.sql`
- ADR-052 (`expire-trials`)

---

## ADR-054 : Quand une garde mécanique refuse un nouveau cas, c'est parfois le cas qui n'y appartient pas

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
En corrigeant la permutation de libellés d'options d'événement live (voir
`docs/bugs.md`, « Deux invitations vivantes… et deux libellés permutés »,
PR #78), la nouvelle garde a d'abord été inscrite dans
`src/lib/destructive-confirm-coverage.test.ts` — le registre qui asserte
que les quatre confirmations de suppression du projet (calendrier,
événement, chasse, campagne) portent toutes le même marqueur textuel. Trois
de ses assertions sont tombées, et elles avaient raison : ce registre est
bâti pour une famille précise — quatre gestes de même espèce, quatre
SUPPRESSIONS, un seul champ de formulaire libre (`name=""`) — et il
vérifie précisément que leurs marqueurs **convergent**. La confirmation de
permutation ne détruit rien ; son marqueur doit au contraire **différer**
de celui des suppressions, pour ne jamais apparaître sous le mauvais texte
dans un écran qui porte les deux refus côte à côte (un piège frôlé pendant
ce même chantier : une première rédaction réutilisait « Cochez la case de
confirmation… », propre à la suppression).

**Decision** :
La garde de permutation reste un fichier séparé
(`src/lib/answer-meaning-guard.test.ts`), avec son motif de séparation
écrit en tête, plutôt que d'être forcée dans le registre des quatre. Deux
options avaient été pesées et écartées : affaiblir les invariants du
registre existant (perdre la garantie de convergence pour les quatre
suppressions), ou adopter ici un design moins bon — booléen typé côté
serveur au lieu d'un `name=""` — pour ressembler au registre. Aucune des
deux ne valait la simplicité d'un fichier de plus.

La distinction entre les deux gestes eux-mêmes (permutation dangereuse vs.
correction de coquille légitime) est tranchée par une **mesure**, pas une
intention déclarée : on compare l'ensemble des libellés, triés, avant et
après écriture. Une permutation laisse cet ensemble identique — seul
l'ordre ou l'affectation change ; une coquille corrigée le modifie. Un
premier geste, plus large, taxait toute modification de libellé et aurait
défait la correction de coquille que le chantier précédent avait
délibérément rendue gratuite ; trois tests existants l'ont signalé
immédiatement.

**Rationale** :
Un registre qui vérifie qu'un ensemble de gardes se ressemblent perd sa
valeur dès qu'on y admet une garde qui doit leur ressembler *sauf sur le
point qu'il teste*. Le signal utile d'un registre de convergence est binaire
— appartient à la famille, ou non — et forcer l'appartenance coûte plus cher
en confusion future que de nommer une seconde famille.

**Consequences** :
- Toute future confirmation qui ne détruit rien (réécrit un sens, un état,
  une affectation) devrait suivre le même réflexe : vérifier d'abord si un
  registre existant l'engloberait honnêtement, créer un fichier séparé
  sinon.
- Une assertion du registre voisin a été corrigée à cette occasion : elle
  exigeait la forme exacte `import { X } from "…"` sur une seule ligne et
  tombait dès qu'un second marqueur du même module faisait passer l'import
  en plusieurs lignes — corrigée pour vérifier ce qu'elle voulait dire
  (le composant importe ce marqueur depuis ce module), pas sa mise en forme.

**References** :
- [Bugs — invitations en vol et permutation de libellés](./bugs.md)
- `src/lib/answer-meaning-guard.test.ts`
- `src/lib/destructive-confirm-coverage.test.ts`
- PR #78

---

## ADR-055 : Le portefeuille du joueur ne prend aucun paramètre — la garantie « pas de jeton dans l'URL » est tenue par le compilateur

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
Le registre universel des récompenses (ADR antérieur, migration
`20260805150000`) portait déjà tout ce qu'il faut pour montrer à un joueur
l'ensemble de ses gains, toutes familles confondues — code, libellé gravé,
échéance, état — mais rien ne le lisait côté joueur. Un lien de type
`/portefeuille?player=<id>` ou `?token=<jwt>` aurait été le dessin le plus
direct, et le plus dangereux : partagé, transféré, ou simplement laissé dans
un historique de navigateur, il listerait les codes de retrait d'un autre
joueur.

**Decision** :
`/portefeuille` ne lit aucun paramètre d'URL. La page identifie le joueur par
le cookie posé sur l'appareil qui a scanné, et la garantie « aucun jeton dans
l'URL » n'est pas vérifiée par un test qui pourrait un jour manquer un cas —
elle est structurelle : `loadPlayerWallet()` et `PortefeuillePage()` ne
prennent aucun argument. Un sabotage qui rouvrirait un paramètre (ajouter un
`searchParams` à la signature pour, par exemple, filtrer par organisation)
fait échouer `tsc`, pas un test qu'on pourrait oublier d'écrire ou de
maintenir.

Le code de retrait n'est journalisé nulle part côté serveur : la seule
remontée d'erreur possible ne porte que le code Postgres, jamais le message,
qui recopierait les paramètres de l'appel — donc indirectement le hash du
cookie.

**Rationale** :
Une garantie de sécurité posée dans le système de types survit aux futures
modifications d'une façon qu'un test ne garantit pas : le test peut être
supprimé ou contourné sans que rien d'autre ne casse, la signature de
fonction ne le peut pas sans casser la compilation de tout appelant.

**Consequences** :
- Le portefeuille est strictement lié à l'appareil : changer de téléphone
  perd l'accès (aucun mécanisme de récupération par email n'existe à ce
  stade — cohérent avec l'absence d'identité joueur email-first dans le
  reste du produit).
- Toute évolution future qui voudrait un lien partageable (ex. « envoyer mon
  portefeuille par SMS ») devra être un choix de conception explicite et non
  un ajout de paramètre incrémental.

**References** :
- [Architecture — Portefeuille du client](./architecture.md)
- `src/lib/player-wallet.ts`, `src/app/portefeuille/page.tsx`
- Migration `20260822120000_player_wallet.sql`
- PR #80

---

## ADR-056 : Le canal SMS passe par Brevo, expéditeur alphanumérique, crédit prépayé non-divergent

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
Le produit ne notifiait un gagnant que par e-mail (Resend). Un client
demandait un canal SMS pour les joueurs qui laissent un numéro de téléphone
plutôt qu'une adresse — jusqu'ici, ces gagnants ne recevaient aucune
notification. Deux contraintes réglementaires françaises, vérifiées sur
sources publiques avant tout choix technique : la charte AF2M impose qu'un
expéditeur alphanumérique fasse au plus 11 caractères, corresponde au nom
commercial réel du commerçant et soit déclaré (pas de provisionnement
instantané) ; et un expéditeur alphanumérique ne peut structurellement pas
recevoir de réponse — un SMS « STOP » envoyé par un client n'atteint jamais
le commerçant.

**Decision** :
Prestataire **Brevo** (société et hébergement français), crédits prépayés
sans abonnement ni expiration, facturés à l'unité par le commerçant. Le STOP
transite par le numéro court du prestataire et une route webhook dédiée
(`/api/sms/webhook`) plutôt que par une réponse au numéro du commerçant, qui
ne pourrait jamais l'atteindre. Le solde de crédits est **matérialisé**
(colonne rapide à lire) mais adossé à un **grand livre en ajout seul** (3
triggers appliquent les mouvements), pour que solde et historique ne puissent
pas diverger structurellement plutôt que par discipline applicative. Le coût
est stocké en **micros** — 0,045 € ne se représente pas en centimes entiers.
La normalisation E.164 se fait à un seul endroit, imposée par des colonnes
calculées : un futur chemin d'écriture qui ignorerait les RPC porterait quand
même la bonne clé de consentement.

**Rationale** :
`not_enough_credits` arrive chez Brevo en HTTP 400, au même titre qu'un
numéro invalide. Classer l'échec sur le seul statut HTTP aurait traité un
solde épuisé comme définitif : le message aurait été remboursé au
commerçant ET plus jamais renvoyable, alors qu'un solde rechargé le rendrait
à nouveau envoyable. Le code d'erreur est donc lu avant le statut, règle :
« définitif = rejouer donnerait la même réponse ».

**Consequences** :
- Le crédit ne peut pas découvrir sous concurrence : prouvé (pas seulement
  visé) par un contrôle où deux envois simultanés sous un solde de 1 rendent
  un succès et un refus avec un seul mouvement au grand livre, le second
  appel ayant réellement attendu le verrou (chronométré à 2 174 ms).
  `0612345678` et `+33612345678` comptaient pour deux consentements avant la
  normalisation — corrigé, un STOP vaut désormais pour les deux graphies.
- Le multi-segment reste un point ouvert : le grand livre débite 1 crédit par
  envoi quel que soit le nombre de segments SMS réels facturés par Brevo.
- La mention STOP du texte de consentement ne peut porter le numéro court
  réel tant que le compte Brevo n'est pas ouvert.
- L'achat de crédits reste manuel, via le back-office plateforme ; aucun
  parcours Stripe de recharge n'existe encore.

**References** :
- [Architecture — Canal SMS](./architecture.md)
- `src/lib/brevo.ts`, `src/lib/sms-dispatch.ts`, `src/lib/sms-prize.ts`
- Migrations `20260823120000_sms_foundation.sql`,
  `20260824120000_sms_sender_identity.sql`,
  `20260825120000_sms_credit_ledger.sql`,
  `20260826120000_sms_e164_and_send_gate.sql`
- PR #80

---

## ADR-057 : Le rapport hebdomadaire n'envoie que si l'une des deux dernières semaines porte de l'activité

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
Le client a demandé un e-mail hebdomadaire au commerçant, comparant la
semaine écoulée à la précédente (joueurs, lots remis, panier attribuable,
podium). La vue existante `org_prize_funnel` ne convenait pas : elle ne voit
que la roue, ne compte aucun joueur et ne compare rien à une période
antérieure. Un envoi inconditionnel chaque lundi poserait un problème
d'engagement évident pour tout commerçant en pause saisonnière ou peu
actif : un « 0 joueur cette semaine, 0 la précédente » répété tue
l'ouverture du mail à moyen terme.

**Decision** :
`org_weekly_digest` lit les neuf familles du registre universel des
récompenses en un aller-retour et rend les deux fenêtres (semaine écoulée,
semaine précédente). L'envoi est **auto-limitant** : le cron n'envoie que si
la semaine écoulée OU la semaine précédente porte de l'activité. Une chute à
zéro après une semaine active reste donc envoyée — c'est l'alerte la plus
utile de l'année pour un commerçant (QR décollé, campagne arrêtée par
erreur) — mais deux semaines vides consécutives ne peuvent jamais produire
deux rapports vides d'affilée : la seconde semaine vide est couverte par la
condition « OU la précédente », donc son propre successeur retombe en
silence dès la troisième semaine vide.

Les montants ne partent qu'aux rôles owner et editor. La RPC est appelée par
le cron en `service_role`, donc sans rôle applicatif que la base pourrait
vérifier : la garde est entièrement applicative, doublée d'un gabarit qui
n'émet pas la ligne de montant du tout plutôt que d'y écrire un zéro qui se
lirait comme une mesure réelle.

**Rationale** :
Un seuil binaire (« la semaine écoulée a de l'activité ») aurait supprimé le
signal le plus important — la rupture — puisqu'une semaine qui tombe à zéro
après en avoir eu échouerait ce test. Regarder les deux fenêtres avant de
décider d'envoyer préserve ce signal sans revenir à l'envoi inconditionnel.

**Consequences** :
- Un commerçant qui n'a jamais eu d'activité ne reçoit jamais ce rapport —
  cohérent avec l'objectif (rien à comparer), mais signifie que l'e-mail ne
  sert pas d'incitation à démarrer.
- Le worker `weekly-digest` est inscrit au registre de supervision mais reste
  hors de l'objectif de service tant qu'il n'a pas déposé un premier succès
  (même règle qu'ADR-053).

**References** :
- [Architecture — Rapport hebdomadaire](./architecture.md)
- `src/lib/weekly-digest.ts`, `src/app/api/cron/weekly-digest/route.ts`
- Migration `20260821120000_weekly_digest.sql`
- PR #80

---

## ADR-058 : Les segments SMS se calculent côté serveur avant l'envoi, jamais en croyant Brevo après

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
ADR-056 avait laissé ouvert l'écart entre facturation Brevo (au segment SMS
réel — 160 caractères en GSM-7, 70 dès qu'un seul caractère hors alphabet
bascule le message entier en UCS-2) et débit interne (une unité par message,
quel que soit son contenu). Le compteur `sms.multipart`, déjà en place,
mesurait l'écart sans jamais le facturer : Brevo annonce le nombre réel de
segments dans sa réponse d'envoi, *après* l'envoi.

**Decision** :
`smsSegments()` (`src/lib/sms-segments.ts`) recalcule le nombre de segments
côté serveur, sur le contenu final du message, **avant** toute réservation de
crédit — remplissage segment par segment sur la table d'extension GSM-7,
jamais une division qui sous-compte les messages à cheval sur une frontière
de segment. `claim_sms_delivery` reçoit ce compte en paramètre
supplémentaire (`p_segments`, migration `20260827120000`) et débite ce
nombre d'unités dans la même transaction que la réservation, à l'insertion
comme à la reprise. Un message de plus de 6 segments est refusé avant tout
débit (`sms.too_long`). Le compte réel renvoyé par Brevo après l'envoi est
comparé au compte pré-calculé ; un écart incrémente `sms.segment_mismatch`
au lieu d'ajuster silencieusement le grand livre.

**Rationale** :
La question n'était pas « comment compter les segments » — l'algorithme est
un fait GSM connu — mais **quand** compter. Attendre la réponse de Brevo
pour débiter aurait exigé une seconde transaction après un appel réseau
externe, avec toute la fenêtre de panne que cela ouvre entre réservation et
débit réel. Calculer avant l'envoi garde le débit dans la même transaction
atomique que la réservation du job, au prix d'une hypothèse : que le calcul
local reproduit fidèlement la segmentation GSM/UCS-2 de Brevo. Cette
hypothèse n'est pas affirmée à l'aveugle — `sms.segment_mismatch` la rend
mesurable en production, plutôt que de la laisser présumée indéfiniment.

**Consequences** :
- Un solde de 2 crédits refuse désormais un message de 3 segments — avant ce
  chantier, il partait pour le prix d'un seul.
- Un accent dans un nom de lot ou une enseigne peut faire basculer un message
  entier en UCS-2 (70 caractères/segment au lieu de 160) sans avertissement
  visible pour le commerçant ; `sms.claim_refused` ne distingue toujours pas
  ce cas d'un crédit épuisé ou d'un STOP (dette assumée, `docs/bugs.md`).
- `sms.segment_mismatch` n'a encore aucun lecteur dédié (pas d'alerte, pas de
  tableau de bord) — il existe pour permettre la mesure, pas pour la
  produire automatiquement.

**References** :
- [Architecture — Canal SMS](./architecture.md)
- `src/lib/sms-segments.ts`, `src/lib/sms-dispatch.ts`
- Migration `20260827120000_sms_segments.sql`
- ADR-056
- Branche `feat/canal-sms-utilisable`

## ADR-059 : L'idempotence d'un grand livre se pose dans la base, jamais chez l'appelant

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
La revue sécurité de `feat/canal-sms-utilisable` a confirmé deux défauts qui
partagent une même racine, distincte de leurs symptômes. **ÉLEVÉ 1** :
`request_sms_sender` remettait à `pending` toute ligne existante non
`declared` et non retirée — le commentaire de la migration ne décrivait que
le cas `retired`, la branche `else` couvrait aussi `rejected` **et**
`suspended`. La RPC n'avait alors aucun appelant applicatif : la faute
dormait, invisible et sans conséquence. Ce chantier lui a ouvert un
appelant (`requestSmsSender`, l'écran commerçant) — sans rien changer à la
RPC elle-même, la rendant du même coup atteignable. **ÉLEVÉ 2** :
`creditSmsPack` (webhook Stripe) prenait l'événement dans `stripe_events`
avant de créditer, puis relâchait la prise si `credit_sms_balance` rendait
une erreur, sous l'hypothèse « erreur = rien n'a été écrit ». Cette
hypothèse est fausse au point d'appel : `supabase-js` rend `{ error }` de
la même façon pour un rollback complet et pour une coupure survenue
**après** le commit (pooler coupé, redéploiement pendant la réponse) — le
code appelant ne peut pas distinguer les deux cas depuis sa seule réponse
réseau.

**Decision** :
1. **Ouvrir un appelant sur une RPC `security definer` dormante revue son
   corps entier avant de le faire**, pas seulement la signature et le nom.
   Une branche jamais atteinte n'a jamais été mise à l'épreuve d'un vrai
   appelant ; son commentaire peut décrire un sous-ensemble de ce qu'elle
   fait sans que rien ne le contredise. Publier un chemin vers une fonction,
   c'est publier tout ce qu'elle fait, y compris ce que personne n'a relu
   depuis qu'elle a été écrite.
2. **L'idempotence d'un mouvement de grand livre se pose dans la base, pas
   dans l'appelant.** Un index unique partiel porte la garante
   (`sms_credit_entries_one_purchase_per_reference`, sur
   `(organization_id, reference)` où `reason = 'purchase'`) ; la RPC
   `credit_sms_balance` rend l'entrée **déjà existante** sur conflit au lieu
   de lever, avec sa signature inchangée — l'appelant reçoit toujours un
   `entryId` valide, qu'il ait créé une ligne ou retrouvé la précédente. Ce
   n'est pas un raffinement de gestion d'erreur : c'est le déplacement de la
   garantie du seul endroit qui sait réellement ce qui a été commité.

**Rationale** :
Un `try/catch` autour d'un appel RPC ne peut raisonner que sur ce que le
réseau lui a rendu, jamais sur ce que la transaction a réellement fait —
« erreur donc rien n'a été écrit » est un raisonnement côté client sur un
fait côté serveur, et il est faux dès qu'une coupure survient après le
commit. Un index unique déplace la question « ce paiement a-t-il déjà été
crédité ? » à l'endroit qui peut y répondre avec certitude : la
transaction suivante, dans la même base, protégée par la même contrainte.

**Consequences** :
- Toute future RPC de grand livre (crédit, débit, remboursement) doit
  porter sa propre garde d'unicité en base plutôt que de faire confiance à
  la gestion d'erreur de l'appelant — le motif est réutilisable au-delà du
  canal SMS.
- Cette même revue a trouvé un résidu que ce déplacement de garantie n'a
  pas anticipé : `creditMerchantSmsBalance` (back-office) ne compare pas
  l'`entryId` rendu à une valeur attendue et affiche « crédit effectué »
  même quand la RPC a en réalité rendu l'entrée d'un doublon déjà écrit —
  consigné ouvert dans `docs/bugs.md`. Rendre une valeur de repli sur
  conflit résout l'idempotence du grand livre, pas la fidélité de tous ses
  lecteurs.
- Toute RPC dormante restant dans le catalogue doit être relue en entier,
  et pas seulement sa signature, avant qu'un premier appelant applicatif
  ne lui soit ouvert.

**References** :
- [Bugs — Canal SMS](./bugs.md)
- Migration `20260828120000_sms_findings.sql`,
  `supabase/tests/sms_findings.test.sql`
- ADR-058 (segments SMS, même chantier)
- Branche `feat/canal-sms-utilisable`

## ADR-060 : La fenêtre horaire légale est un module pur, appliquée sans distinction de nature du message — la distinction reste à trancher

**Date** : 2026-08-01
**Statut** : accepté, avec une question produit ouverte

**Context** :
Rien ne bornait l'heure d'envoi d'un SMS sur ce canal : un lot gagné à
23h30 déclenchait un message à 23h35. La prospection commerciale par SMS
est interdite en France entre 22h et 8h, le dimanche et les jours fériés
(charte AF2M, doctrine CNIL) — la même source qui impose déjà à ce canal
l'expéditeur alphanumérique et la mention STOP. Une contre-revue du
troisième tour a aussi établi, par la mesure et non l'hypothèse, que la
cadence réelle de la file de jobs est **quotidienne** (`vercel.json`,
`20 4 * * *`), pas les 5 minutes que sept commentaires affirmaient : un
code de retrait peut donc légitimement arriver jusqu'à 24h après le gain,
fenêtre horaire ou non.

**Decision** :
1. La règle vit dans un module pur et séparé du worker
   (`src/lib/sms-window.ts`) : une fonction d'un instant vers un verdict,
   éprouvable sans base, sans job, sans prestataire — ce dépôt n'a pas
   d'environnement de rendu et a payé plusieurs fois le coût d'une logique
   enfouie dans un composant ou un worker que personne ne peut vérifier
   isolément.
2. Le fuseau est une **donnée nommée** (`Europe/Paris`), jamais l'heure du
   processus : Vercel exécute en UTC, où la fenêtre s'ouvrirait à 6h ou 7h
   selon la saison — en plein cœur des heures qu'elle existe pour
   interdire.
3. Dans le worker, la garde tombe **avant** `claim_sms_delivery`, donc
   avant tout débit de crédit, et rend `retry`, jamais `failed` : un
   message hors fenêtre n'est pas fautif, il est prématuré ; un `failed`
   le perdrait pour toujours.
4. **La fenêtre s'applique aujourd'hui sans distinction de nature du
   message** : un code de retrait de gain (que le joueur attend, sans
   contenu promotionnel) est retardé exactement comme un SMS publicitaire.
   Ce point n'est **pas tranché ici** — reclasser ce message en
   transactionnel est défendable et l'affranchirait de la fenêtre, mais
   c'est une décision du client, consignée ouverte dans `docs/bugs.md`.

**Rationale** :
La contrainte légale porte sur la *prospection*, pas sur toute
communication SMS — mais le canal ne portait, à sa livraison, qu'un seul
type de message (le code de retrait). Appliquer la fenêtre uniformément
est le choix le plus sûr en l'absence d'une classification explicite des
messages ; il coûte de la latence sur un cas qui n'en a peut-être pas
besoin, jamais l'inverse.

**Consequences** :
- Un gain remporté en soirée peut ne recevoir son SMS que le lendemain
  matin — combiné à la cadence quotidienne de la file, le budget de
  reprise (`max_attempts = 5`) peut s'épuiser avant la réouverture de la
  fenêtre ; consigné ouvert dans `docs/bugs.md` avec sa sortie (activer
  `lastchance-jobs-worker`, pg_cron à 5 minutes, par la pose de deux
  secrets Vault).
- Les deux jours fériés propres à l'Alsace-Moselle ne sont pas couverts :
  ils dépendent du département du destinataire, que le produit ne
  connaît pas — résidu nommé et testé, pas une couverture supposée.
- Toute future famille de SMS (rappel, relance) doit explicitement
  choisir de passer ou non par `smsMarketingWindow`, plutôt que d'hériter
  silencieusement du comportement du seul appelant existant.

**References** :
- [Bugs — Canal SMS](./bugs.md)
- `src/lib/sms-window.ts`, `src/lib/sms-window.test.ts`
- `src/app/api/cron/jobs/route.ts` (en-tête, cadence réelle)
- ADR-059 (idempotence du grand livre, même chantier)
- Branche `feat/canal-sms-utilisable`

---

## ADR-062 : L'application pose elle-même ses secrets d'exploitation au Vault — parce que les noms des cases écrites viennent du registre, jamais de l'appelant

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
`docs/production-readiness.md` §5bis demandait au propriétaire de poser à
la main deux secrets Vault Supabase (`jobs_worker_url`,
`sync_contests_secret`) pour faire passer `lastchance-jobs-worker` d'un
passage quotidien (`vercel.json`, `20 4 * * *`) à un passage toutes les
5 minutes (`pg_cron`) — la sortie déjà identifiée pour que la file de jobs
SMS ne fasse plus reporter un même envoi jour après jour (ADR-061). Poser
`jobs_worker_url` exige de construire une URL qui embarque `CRON_SECRET` en
en-tête ou en requête : un secret d'exploitation qui vit déjà dans
l'environnement de l'application, recopié à la main par un humain dans une
console d'administration.

**Decision** :
Une action serveur (`enableWorkerFastCadence`) lit `CRON_SECRET` et l'URL
de l'application dans son **propre** environnement — jamais depuis un
paramètre client — et les dépose au Vault via une RPC dédiée. Ce qui rend
le geste sûr n'est pas qu'il soit automatique, c'est que **les noms des
cases écrites viennent du registre `ops_worker_definitions`, jamais de
l'appelant** : un appelant compromis ne peut faire écrire que ce que le
registre lui désigne, pas une case arbitraire du Vault. Trois gardes
supplémentaires, dans l'ordre : (1) permission dédiée `monitoring.cadence`,
super_admin seul, `requireFresh`, refus tracé ; (2) l'URL est refusée si
elle n'est pas en `https://` ou si elle désigne un hôte local ou privé
(loopback `127.0.0.0/8`, `::1`, `0.0.0.0`, plages `10/172.16-31/192.168`,
lien-local, `.local`) ; (3) `CRON_SECRET` absente vaut refus explicite,
jamais un Vault posé avec une valeur vide.

**Rationale** :
La garde (2) est la moins évidente et la plus importante. Sans elle, poser
une URL non-production dans le Vault ferait interroger Postgres, toutes
les 5 minutes, une adresse qui n'est pas l'application réelle — avec le
secret d'exploitation dans l'en-tête de chaque appel — pendant que l'écran
de supervision afficherait « worker configuré », sans aucun moyen de le
détecter autrement qu'en observant l'absence d'effet.

**Consequences** :
- Le secret ne sort jamais en clair d'un canal observable : aucun
  paramètre de formulaire ne le porte, aucune sortie (succès, erreur,
  journal) ne le recopie — seul le SQLSTATE Postgres est journalisé sur
  échec.
- Le geste reste, après ce chantier, **possible sans identifiants** — il
  ne se substitue pas à la décision du propriétaire. Le bouton doit encore
  être cliqué en production ; tant qu'il ne l'a pas été, la file continue
  de tourner une fois par jour (`docs/production-readiness.md` §5bis).

**Addendum (2026-08-01, même branche, migration `20260831120000_worker_vault_write.sql`,
commits `f127f8f`/`b362993`/`1d30c6b`)** — la RPC `set_worker_vault_secrets` est
livrée, et sa revue a produit un enseignement qui dépasse ce chantier :

- **Un refus prévisible qui LÈVE fuit son paramètre vers un public plus
  large que celui qui détient déjà le secret.** L'appelant applicatif passe
  le jeton `CRON_SECRET` en paramètre de l'appel PostgREST. Une exception
  Postgres journalise l'instruction fautive **avec ses paramètres**
  (`log_min_error_statement = error`, mesuré) ; ce journal est lisible par
  tout membre du projet Supabase, y compris sans accès direct à la base —
  donc par un public plus large que celui qui peut déjà lire
  `vault.decrypted_secrets`. Règle retenue : un refus **prévisible** (worker
  inconnu, prérequis Vault absents, valeur vide, panne du Vault) doit être
  **rendu** comme une valeur de retour, jamais levé. La seule exception
  assumée est le refus d'**autorisation** (appelant ≠ `service_role`) : lui
  seul continue de lever, parce qu'il est un événement de sécurité qui doit
  laisser une trace, et que ce chemin est inatteignable depuis l'appelant
  applicatif légitime — l'atteindre suppose déjà un appelant illégitime.
- **Effet de bord assumé, sous condition écrite et non conclue** :
  `ops_worker_definitions` fait porter à `jobs` et à `sync-contests` le
  même `vault_shared_secret`. Armer l'un réécrit donc l'entrée Vault de
  l'autre. C'est bénin **tant qu'un seul `CRON_SECRET` existe** pour
  authentifier les deux routes de cron ; le jour où ils devraient porter
  des valeurs différentes, le partage devient une écriture silencieuse
  par-dessus le voisin. La RPC rend `also_affects_workers` (calculé depuis
  le registre) pour que l'appelant le sache avant d'agir, et le panneau
  l'affiche avant le clic.
- Revue sécurité (lecture seule, HEAD `1d30c6b`) : **GO, 0 CRITIQUE,
  0 ÉLEVÉ, 1 MOYEN, 4 INFO**. Le MOYEN restant est distinct de la RPC :
  rien n'empêche d'armer la cadence depuis un déploiement non-production
  (`worker-cadence.ts` valide `https://` + hôte public, pas « c'est bien
  nous ») — une URL de preview ferait émettre le `CRON_SECRET` de
  production vers un hôte tiers, 288×/jour, pendant que l'écran affiche
  « configuré ». Correctif proposé : refuser si `VERCEL_ENV ≠ production`,
  non livré dans ce chantier.

**Second addendum (2026-08-01, même branche, commits `b97f344`/`4bfa714`/
`8c87128`)** — le MOYEN de la revue est fermé, une justification fausse est
corrigée, et un avertissement voisin sous-déclarait ce qu'il touchait :

- **La garde d'environnement, `checkCadenceEnvironment`** (module pur,
  `src/lib/admin/worker-cadence.ts`), deux angles : `VERCEL_ENV` doit valoir
  `production` (absente hors Vercel = refus, un poste local n'arme rien) ;
  et quand `VERCEL_PROJECT_PRODUCTION_URL` est exposée, son hôte est comparé
  à celui de `NEXT_PUBLIC_APP_URL` — le seul angle qui attrape une `APP_URL`
  **périmée sur une vraie production**, cas que `VERCEL_ENV` seule laisse
  passer puisqu'elle dit bien `production`. Placée **après** la garde d'URL
  et non avant : les deux refuseraient un `http://localhost:3000`, mais la
  garde d'URL le refuse en **nommant l'adresse locale**, là où la garde
  d'environnement dirait seulement « pas le domaine de production » — sans
  cet ordre, les 4 tests d'URL existants seraient devenus vacants (message
  générique remplaçant un message qui pointe la vraie cause). L'ordre est
  épinglé par une assertion. Ce que la garde ne couvre pas est écrit et non
  tu : `VERCEL_PROJECT_PRODUCTION_URL` n'a pas été vérifiée à l'exécution
  sur ce projet ; en son absence, la comparaison d'hôte n'a pas lieu et une
  production à l'`APP_URL` périmée serait armée quand même — bloquer
  rendrait la cadence inarmable, donc on autorise, mais `hostChecked` part
  à l'audit sous `production_host_verified` pour que ce cas se relise
  après coup.
- **La justification de la garde « refus prévisible rendu, jamais levé »
  était fausse — le design reste juste pour une autre raison.** Le
  chantier avait justifié ce choix par une fuite de `CRON_SECRET` dans les
  journaux d'erreur Postgres (`log_min_error_statement = error`, mesuré).
  Faux : ce GUC gouverne le **texte** de l'instruction fautive, jamais ses
  **valeurs liées** — celles-ci relèvent de
  `log_parameter_max_length_on_error`, qui vaut **0** (mesuré en base) :
  aucun paramètre lié n'est journalisé, PostgREST lie le corps en `$1`, et
  une levée n'aurait jamais montré le jeton. La fuite décrite n'a jamais
  existé sur cette configuration. **Le design est conservé quand même**,
  pour une raison différente de celle qui l'a motivé : un refus
  **prévisible** (worker inconnu, prérequis Vault absents, valeur vide) n'a
  rien à faire dans un journal d'**erreur**, et cette propriété ne dépend
  d'**aucun** réglage de journalisation — elle reste vraie le jour où
  quelqu'un relève ces GUC pour diagnostiquer autre chose. Les quatre
  endroits qui portaient l'ancienne justification (migration, son
  `comment on function`, son test pgTAP, l'action et son test) sont
  corrigés dans le même sens. Commentaires et tests seuls, aucune logique
  touchée.
- **`listWorkerCadenceDefinitions` sous-déclarait le voisin réellement
  touché.** Le panneau prévient l'administrateur des AUTRES workers dont
  une entrée Vault sera réécrite par son clic ; il les calculait sur une
  liste déjà filtrée par `vault_url_secret is not null` — le filtre des
  lignes AFFICHABLES (celles qui portent un bouton). Or `set_worker_vault_secrets`
  réécrit sur `vault_url_secret` **ou** `vault_shared_secret` : un worker
  n'ayant que le second n'a pas de bouton mais **est** réécrit par le clic
  du voisin. Le filtre d'affichage n'a plus sa place dans la requête qui
  nourrit aussi l'avertissement — il reste où il est testé, dans le module
  pur.
- Contrôles négatifs joués et restaurés : `checkCadenceEnvironment`
  neutralisée → 14 rouges (9 module + 5 câblage de l'action, prouvés
  séparément) ; filtre `ops.ts` réintroduit → 2 rouges, dont l'assertion
  qui nomme le défaut (`['sync-contests']` au lieu de
  `['sms-relance','sync-contests']`).

**Troisième addendum (2026-08-02)** — la prémisse de tout ce chantier était
fausse, mesurée et non déduite ; et une phrase de la **Decision** d'origine
ne résiste pas à la lecture du catalogue de droits vivant.

- **La prémisse.** Le journal du workflow `production-health.yml` sur le
  commit `46c33dc` rend « Production saine (0.1.0) : database, workers,
  security_configuration » à 17h36 UTC. `checkWorkers()`
  (`src/app/api/health/route.ts`) exige `jobs` **et** `sync-contests`
  `healthy = true`, ce qui suppose à la fois les entrées Vault posées et
  un battement récent (`tolerance_seconds = 900`, 15 min, pour `jobs`) ;
  le cron Vercel de secours ne passe qu'à 04h20 UTC, treize heures avant
  cette sonde. Un battement de treize heures ne satisfait pas une
  tolérance de quinze minutes : les secrets Vault existaient déjà en
  production et le pg_cron toutes les 5 minutes tournait déjà, avant même
  l'ouverture de ce chantier. **Conséquence** : le bouton livré n'est pas
  un déblocage, c'est une **rotation** par-dessus une configuration qui
  fonctionne — le risque s'inverse, un mauvais armement ne débloque rien
  dans le vide, il **casse une file qui tourne**. Les gardes déjà posées
  (garde d'URL, `checkCadenceEnvironment`) en valent donc davantage, pas
  moins ; aucune n'est retirée par ce constat.
- **« Un appelant compromis ne peut faire écrire que ce que le registre
  lui désigne » (Decision, ci-dessus) est faux tel quel.** `service_role`
  — l'identité sous laquelle tourne l'action serveur et sous laquelle la
  RPC `set_worker_vault_secrets` s'exécute — a **déjà** l'exécution sur
  `vault.create_secret` et la lecture sur `vault.decrypted_secrets` dans
  Postgres : un `service_role` compromis peut écrire n'importe quelle case
  du Vault directement, sans passer par cette RPC ni par son registre. Ce
  que la phrase visait, et ce qui reste vrai, c'est plus étroit : **la RPC
  borne le chemin exposé par PostgREST** — c'est-à-dire l'unique chemin
  qu'un appelant HTTP muni du jeton `monitoring.cadence` (et non du
  `service_role` Postgres lui-même) peut emprunter. La garde protège la
  surface applicative, pas le compte `service_role` sous-jacent, qui reste
  et a toujours été un compte à pleins pouvoirs sur la base.

**References** :
- ADR-061 (la sortie que ce geste active)
- `src/lib/admin/worker-cadence.ts`, `src/app/admin/(protected)/monitoring/actions.ts`
- `supabase/migrations/20260831120000_worker_vault_write.sql`
- `docs/production-readiness.md` §5bis
- Branche `chantier/cadence-file`

---

## ADR-061 : Le code de retrait par SMS est TRANSACTIONNEL — et un report de fenêtre ne consomme pas le budget des pannes

**Date** : 2026-08-01
**Statut** : accepté

**Context** :
ADR-060 laissait une question explicitement ouverte : la fenêtre horaire
légale s'appliquait **sans distinction de nature du message**, et le seul
producteur du canal — le code de retrait d'un lot gagné — était donc
retardé comme une offre commerciale. Une contre-revue a par ailleurs
mesuré que le report lui-même ne tenait pas : `retry` fait monter le
backoff `[1, 5, 15, 60]` minutes sur `max_attempts = 5`, soit **81
minutes** d'horizon, contre **10 h** de fermeture nocturne et **34 h** du
samedi 22 h au lundi 8 h. Un SMS publicitaire posté le soir mourait avant
la réouverture — quelle que soit la cadence du worker. Les deux points
sont traités ensemble parce qu'ils se croisent : reclasser le code de
retrait le sort du chemin défaillant, mais ne répare pas le chemin.

**Decision** :
1. **Le code de retrait est transactionnel** (`marketing: false` dans
   `enqueuePrizeRedeemSms`). Trois faits cumulatifs, écrits dans le code :
   le message part **à la suite d'une action explicite** du joueur, il ne
   porte **aucun contenu promotionnel**, et il est **nécessaire au service
   demandé** — sans lui, le lot déjà décrémenté du stock n'est pas
   retirable. C'est la définition d'un message transactionnel, pas de la
   prospection. Décision du client.
2. Ce que cela emporte, traité point par point plutôt qu'en basculant un
   booléen : (a) la fenêtre 22 h–8 h / dimanche / fériés ne s'applique plus
   à ce message — un gain de 23 h 30 part à 23 h 30, c'est l'objet du
   changement ; (b) la catégorie déclarée à Brevo devient
   `transactional`, chemin de remise distinct, le bon pour un code
   attendu ; (c) la garde mécanique de la mention STOP ne s'arme plus, mais
   **la mention reste dans le message** — quelques caractères pour le seul
   rappel du droit de retrait que ce client recevra jamais ; (d) le
   **consentement reste exigé**, `claim_sms_delivery` inchangée : le numéro
   n'est détenu que parce que la personne a coché la case. Reclasser le
   message ne reclasse pas la collecte.
3. **Le coût de (c) est mesuré, pas supposé** : le message type mesuré par
   `smsSegments` tient en **un segment GSM-7**, avec ou sans numéro court.
   Un seul accent dans la partie fixe basculerait le message entier en
   UCS-2 (70 caractères par segment), et le grand livre débite une unité
   par segment depuis `20260827120000` : ces caractères sont de l'argent.
   Un test le verrouille.
4. **Une garde nommée** (`sms-prize.test.ts`, « LE CODE DE RETRAIT EST
   TRANSACTIONNEL, ET DOIT LE RESTER ») échoue si ce message redevient
   publicitaire, et porte la raison dans son corps. Sans elle, un futur
   lecteur rétablirait le défaut « par prudence » en croyant bien faire.
5. **Un report de fenêtre n'est pas une panne** : nouvel état de sortie
   `deferred` (`src/lib/jobs.ts`), qui repose `run_after` à la **prochaine
   ouverture** calculée par `nextSmsMarketingOpening` et **rend la
   tentative** consommée par `claim_jobs`. Une attente prévue et datée et
   un incident sont deux choses différentes ; elles n'avaient aucune raison
   de partager un compteur.
6. Puisque `max_attempts` ne borne plus cette boucle, un **plafond d'âge**
   la borne : sept jours (la plus longue fermeture légale dure 58 h). Au
   delà, `sms.window_deferral_exhausted` et échec propre.

**Rationale** :
La contrainte AF2M/CNIL porte sur la *prospection*. Le canal ne portait à
sa livraison qu'un seul type de message, et appliquer la fenêtre
uniformément était le choix le plus sûr **en l'absence de classification**
— pas une position sur le fond. La classification étant désormais prise et
motivée, maintenir le retard reviendrait à protéger personne au prix d'un
service que le joueur a explicitement demandé.

`nextSmsMarketingOpening` **n'implémente aucune règle** : elle interroge
`smsMarketingWindow` heure par heure. Une formule fermée devrait rejouer
nuit, dimanche et fériés mobiles et leurs enchaînements — c'est-à-dire
dupliquer la règle, avec la certitude que les deux copies divergeront.

**Consequences** :
- La fenêtre horaire n'a plus **aucun producteur réel** : le seul message
  du canal en est sorti. Le mécanisme reste testé sur des envois
  explicitement publicitaires (`sms-dispatch.test.ts`, payload par défaut
  sans `marketing`), pour qu'il ne devienne pas du code mort non couvert
  le jour où une famille publicitaire apparaîtra.
- **Ce qui n'est pas réparé, et doit être dit** : la **cadence**. Le worker
  passe à 05 h 20 Paris, *dans* la fenêtre interdite, tous les jours : un
  message publicitaire reporté à 8 h ne sera réclamé qu'au passage suivant,
  donc reporté encore. Il échoue proprement au bout de sept jours au lieu
  de tourner sans fin — ce n'est pas une réparation. La sortie reste la
  pose des deux secrets Vault qui activent `lastchance-jobs-worker`
  (pg_cron, 5 minutes), décision de plan qui appartient au client.
- Une ligne `sms_log` figée en `sending` porte des crédits débités sans
  envoi prouvé : `countStaleSmsDeliveries` la **compte** désormais
  (`sms.stale_sending`), l'index `sms_log_stale_idx` cessant d'être sans
  lecteur. **On ne rembourse pas** : une ligne figée peut aussi bien
  signifier « mort avant l'appel » que « Brevo a accepté puis mort avant la
  clôture », et rembourser un SMS réellement parti ferait diverger le grand
  livre — le défaut exact que ce canal a passé un chantier à fermer.

**References** :
- ADR-060 (la question ouverte que celui-ci tranche), ADR-056, ADR-058
- `src/lib/sms-prize.ts`, `src/lib/sms-window.ts`, `src/lib/jobs.ts`,
  `src/lib/sms-dispatch.ts`
- [Bugs — Canal SMS](./bugs.md)
- Branche `feat/canal-sms-utilisable`

---

## ADR-063 : Une garde destructive compte avec le client admin, jamais avec le client RLS — et un comptage qui échoue REFUSE

**Date** : 2026-08-02
**Statut** : accepté

**Context** :
Six gestes d'entretien du tableau de bord détruisaient en cascade des codes
de retrait émis et non retirés : suppression d'une roue (`participations`
→ `GAIN-`), d'une chasse (`hunt_completions` → `CHASSE-`), d'un calendrier
(`calendar_openings` **et** les récompenses d'assiduité → `CADEAU-`), d'un
quiz (`QUIZ-`), d'un palier et d'un programme de fidélité (`FIDELITE-`).
Le client se présentait au comptoir et lisait « Code introuvable ». Le
dépôt avait pourtant déjà tranché ce danger un cran au-dessus, pour la
suppression de campagne : compter les codes en attente, refuser tant qu'une
case n'est pas cochée, et **nommer le chiffre** dans le refus.

Le patron a donc été reporté sur les six gestes — et la revue sécurité a
trouvé que le patron lui-même, tel qu'il était écrit, ne gardait rien pour
le rôle qui l'exécutera le plus souvent :

- **Le comptage passait par le client RLS.** La policy de lecture de
  `participations` est owner-only (`participations: owner select`,
  `00017`:98) alors que `deleteWheel` laisse `wheels: editors` trancher qui
  agit. Pour un `editor`, RLS rendait zéro ligne — donc « aucun code en
  attente », donc aucune case, aucun chiffre, et **la suppression passait
  en silence**. Le propriétaire, lui, voyait le refus : le défaut était
  invisible à qui ne teste qu'avec un compte owner, et tous les tests
  existants montaient un compte owner. Le même trou, préexistant,
  affectait `deleteCampaign`.
- **Le comptage échouait OUVERT.** Toutes les gardes s'écrivaient
  `const { count } = await supabase…` puis `(count ?? 0) > 0`. `error`
  n'était jamais lu, et `count` vaut `null` dès que la requête n'aboutit
  pas — coupure réseau, délai PostgREST dépassé, policy absente le temps
  d'une migration. Le `?? 0` transformait « je n'ai pas pu savoir » en
  « il n'y a rien à perdre ».
- **Une garde ne voyait que la moitié de sa cascade** : deux tables
  descendent de `calendars` et portent le préfixe `CADEAU-`, une seule
  était comptée.

**Decision** :
1. Le comptage d'une garde destructive se fait avec le **client admin**,
   org-scopé explicitement, en ne lisant que la colonne `id` — et le
   contrôle de rôle est écrit dans l'action, à côté. Le client RLS n'est
   pas un contrôle d'autorisation pour un comptage : c'est un filtre de
   lecture dont la portée n'a aucune raison de coïncider avec celle du
   geste gardé.
2. La décision est extraite dans un module pur, `src/lib/codes-en-attente.ts`,
   qui rend un **verdict à trois issues** et non un booléen :
   `aucun` (le geste passe), `en-attente` avec son nombre (refus
   cochable, le chiffre est nommé), `indisponible` avec son motif (refus
   **sans case à cocher**). Un booléen écrase deux de ces trois issues, et
   la pire des confusions serait de proposer une case à cocher
   qu'aucun chiffre n'accompagne : cela n'apprendrait au commerçant qu'à
   cocher sans lire, exactement ce que le registre des confirmations
   destructives existe pour éviter.
3. Le refus est **rendu**, jamais levé — même règle qu'ADR-062 : un refus
   prévisible, et une base momentanément injoignable en est un, n'a rien à
   faire dans un journal d'erreur sous forme d'exception.
4. Les six gardes entrent au registre
   `src/lib/destructive-confirm-coverage.test.ts`, qui asserte leur
   convergence textuelle.

**Rationale** :
Une garde qui échoue ouvert protège exactement les jours où rien ne va
mal. Et une garde dont la portée de lecture dépend d'une policy écrite
pour un autre usage est une garde dont personne ne peut dire, en la
lisant, pour qui elle s'arme : le seul moyen de le savoir était de la
jouer sous chaque rôle — ce que les tests ne faisaient pas.

**Consequences** :
- **Enseignement porté au-delà de ce chantier** : un défaut de garde peut
  être invisible au rôle qui écrit le test. Toute garde posée sur une
  action ouverte à `editor` doit être éprouvée sous `editor`, pas sous le
  rôle le plus commode à monter.
- Le comptage par client admin élargit la surface `service_role` de ces
  actions ; le contrepoids est écrit : org-scope explicite dans la
  requête, une seule colonne lue, contrôle de rôle en tête de l'action.
- ~~Les gardes ne ferment pas le cas de bout en bout~~ — **corrigé le
  2026-08-03 (ADR-068)**. Les six gardes réduisaient la fréquence du cas
  sans le fermer : `player_wallet` lit `reward_issuances` **sans jointure
  sur la table source**, donc après une suppression confirmée le client
  continuait de voir son lot « active » pendant que la caisse le refusait.
  `20260902120000` pose les dix triggers `after delete` qui manquaient :
  la ligne de registre est désormais **annulée** avec sa source, le
  portefeuille est cohérent avec la caisse, et le client lit une
  explication au lieu de constater une disparition. La suppression reste
  possible, et voulue, une fois la case cochée — les gardes gardent tout
  leur sens : elles nomment le nombre de codes qui deviendront caducs.

**References** :
- ADR-062 (le refus rendu et jamais levé), ADR-054 (le registre des
  confirmations destructives)
- `src/lib/codes-en-attente.ts`, `src/lib/destructive-confirm-coverage.test.ts`
- [Bugs — six cascades qui détruisaient des codes en main](./bugs.md)
- `docs/chasse-parcours-2026-08-02.md`

---

## ADR-064 : Le gel d'un engagement porte sur la VALEUR, pas sur la présence de la clé

**Date** : 2026-08-02
**Statut** : accepté

**Context** :
`20260814120000` a gelé le **libellé** d'un lot émis dans le registre
universel, et son propre en-tête écrivait que la moitié affichage restait
ouverte. Elle l'était doublement : le gel substituait la seule ligne
`label = excluded.label` de l'`on conflict`, laissant intacte la ligne
voisine `metadata = excluded.metadata` — or `metadata` porte la clé
`reward_details`, la **description**, écrite par huit des neuf familles.
Elle était donc réécrite à chaque resynchronisation du miroir, y compris
celle que déclenche la remise en caisse elle-même. Au comptoir, le titre
de la carte portait le libellé gravé (« Café offert ») et la ligne juste en
dessous la description courante (« un croissant pur beurre, hors
boissons ») : les deux lignes de la même carte se contredisaient, et c'est
la seconde qui énonce les conditions que le caissier applique.

**Decision** :
Le gel porte sur **`reward_details` seule**, et il est écrit comme un
`case` sur la **valeur** : une description absente ou vide peut être
remplie, une description déjà gravée n'est jamais écrasée.

Deux choses ont été explicitement écartées :
- **Figer `metadata` en bloc** serait plus court et faux. `metadata`
  mélange une PROMESSE faite au client (`reward_details`, et elle seule) et
  du CONTEXTE (`legacy_table`, dont dépend le rattrapage de
  `20260822120000` pour router son rejeu, `experience_label`, `rank`,
  `cycle`, `beneficiary`…). Rien de ce contexte n'a été promis à
  quiconque, et le figer empêcherait toute clé ajoutée par une future
  version de `sync_reward_issuance` d'apparaître sur les lignes déjà
  écrites.
- **Tester `jsonb_exists`**, c'est-à-dire la présence de la clé. Défaut
  trouvé par la mesure dans la première rédaction : `prizes.description`
  est `not null default ''`, donc sur la roue — la famille qui émet le
  plus — la clé existe **toujours** et vaut la chaîne vide. Geler sur la
  présence aurait gravé une chaîne vide à perpétuité, et un commerçant
  décrivant son lot le lendemain ne l'aurait jamais vu apparaître.

**Rationale** :
« Cette valeur a-t-elle été promise ? » ne se répond pas par « cette clé
existe-t-elle ? » dès qu'une colonne source porte un `default ''`. Le gel
reprend donc exactement la règle déjà éprouvée par le gel du libellé
(`when label = '' then excluded.label`) : remplir oui, écraser jamais.

**Consequences** :
- Deux populations profitent du « remplir » : les lignes rétro-alimentées
  par `20260807120000` et le lot dont le commerçant écrit la description
  après l'avoir créé.
- Tant que la migration n'est pas appliquée, un correctif d'affichage
  défensif tient la caisse : quand le libellé gravé diffère du libellé
  courant, `descriptionDeCaisse` (`src/lib/caisse-remise.ts`) **retire** la
  description plutôt que d'en afficher une périmée. Il assume par écrit sa
  moitié manquante — une description réécrite SANS renommage passe
  inaperçue. Une fois la description gravée, la caisse affiche la bonne
  plutôt que rien.
- `contest` est la seule famille à n'écrire aucun `reward_details` : le gel
  n'a rien à y faire, et ce n'est pas un oubli.

**References** :
- `supabase/migrations/20260901120000_freeze_reward_details.sql`,
  `supabase/tests/reward_details_freeze.test.sql`
- `src/lib/caisse-remise.ts` (`descriptionDeCaisse`)
- ADR-048 (le registre universel), PR #68 (le gel du libellé)

---

## ADR-065 : Le stock ne s'écrit que sous témoin de ce que le champ AFFICHAIT — un contrôle contre l'accident, pas contre un appelant

**Date** : 2026-08-02
**Statut** : accepté

**Context** :
`prizes.stock` n'est pas un total mais le **restant**, décrémenté par
chaque tirage (`update prizes set stock = stock - 1`, dix RPC). Le champ
« Stock (vide = illimité) » de l'éditeur est un input non contrôlé dont le
`defaultValue` vaut le restant **au chargement de la page**, et
`updatePrize` réécrivait la colonne en bloc. Corriger une coquille de
libellé sur une page ouverte depuis une heure recréditait donc les lots
gagnés entre-temps : la roue redistribuait des cafés que le commerçant
n'avait plus, et rien à l'écran ne le disait.

**Decision** :
`updatePrize` compare **trois** valeurs et non deux : ce que le champ
affichait au chargement (témoin `stock_seen`, posté par le formulaire), ce
que le client POSTE maintenant, et ce que la base porte au moment de
l'écriture. Le stock n'est écrit que si le commerçant l'a réellement
changé ; si la base a bougé sous lui sans qu'il touche au champ, l'écriture
de cette colonne est abandonnée plutôt que d'écraser.

La piste d'origine — comparer simplement la valeur postée à la valeur en
base — a été écartée après mesure : elle est insuffisante et
contradictoire. Sans témoin de ce que le champ AFFICHAIT, « il a
délibérément saisi 12 » et « 12 traînait dans le champ depuis le
chargement » sont **indistinguables au serveur**.

**Rationale** :
La question à laquelle il fallait répondre n'est pas « cette valeur
est-elle correcte ? » mais « ce commerçant a-t-il voulu écrire cette
valeur ? » — et l'intention ne se déduit que d'un écart entre ce qu'on lui
a montré et ce qu'il renvoie.

**Consequences** :
- **À écrire noir sur blanc, sous peine de mal lire ce mécanisme** :
  `stock_seen` vient du client. Poster la valeur réelle de la base y fait
  passer n'importe quelle écriture. Ce n'est **pas** une garde contre un
  appelant — un `editor` a parfaitement le droit de fixer le stock de ses
  lots ; c'est un contrôle contre l'**accident**, dans la seule classe où
  l'accident est certain et silencieux.
- Le module Quiz portait déjà la garde jumelle (stock total +
  `reward_claimed_count` + refus nommé) : les deux modèles coexistent, le
  quiz stockant un total et la roue un restant.

**References** :
- `src/actions/prizes.ts`, `src/lib/validations/prizes.ts`
- `docs/chasse-parcours-2026-08-02.md` (`stock-du-lot-remis-a-sa-valeur-affichee`)

---

## ADR-066 : Le pont d'identité se pose au point d'écriture — un rejeu rétroactif par migration ne rachète rien

**Date** : 2026-08-02
**Statut** : accepté

**Context** :
`ensureProgressivePlayerIdentity` est le seul écrivain de
`player_legacy_identities`, le pont entre la clé de jeu d'une famille et
l'identité joueur globale. Il était appelé pour sept familles sur neuf :
**pronostics et parrainage ne le posaient jamais**. Conséquences mesurées :
`reward_player_from_legacy(…, 'contest'|'referral', …)` rendait toujours
`null`, donc `reward_issuances.player_id` restait `null`, donc
`player_wallet` — qui filtre sur `player_id` — n'affichait jamais ces lots,
alors que la documentation promet un portefeuille « toutes familles
confondues » ; et `apply_meta_progression_event` sort sur
`player_id is null`, donc une mission de saison portant sur ces deux
familles ne progressait pour personne, alors que l'éditeur les propose.

**Decision** :
Les deux appels manquants sont posés **au point d'écriture** (inscription
au championnat, mise en place du parrain). Le **rejeu rétroactif des
`player_id` n'a pas été écrit**, et le motif est structurel, pas
circonstanciel : une migration s'applique **avant** le déploiement de
l'application qui pose ces ponts ; au moment du rejeu, aucun pont
contest/referral n'existe, et `reward_player_from_legacy` — fonction
`stable`, qui ne fait que **lire** le pont — rendrait `null` pour chaque
ligne. Zéro rachat, par construction.

Mesure de contexte qui confirme le non-geste : `contest_awards` et
`referral_rewards` comptent **0 ligne en production**.

**Rationale** :
Le geste utile, s'il devient nécessaire, n'est pas un rejeu one-shot mais
un **trigger `after insert on player_legacy_identities`** qui rattrape les
lignes du registre au moment où le pont apparaît — c'est exactement le
motif déjà adopté par `20260805230000` pour corriger l'ordre d'écriture de
l'identité, et il fonctionne quel que soit l'ordre migration/déploiement.

**Consequences** :
- ~~Une seconde population reste sans pont~~ — **corrigé le 2026-08-03**.
  Un lot de roue gagné via un **tour offert** (calendrier, fidélité, quiz,
  parrainage) posait le pont pour SA famille, jamais pour `campaign` — or
  la participation créée ensuite cherche un pont `campaign`, donc le lot
  était absent de `/portefeuille`. `bridgeOfferedSpinToCampaign` pose ce
  pont au retour des quatre RPC de consommation. Le point qui compte :
  elle relit `organization_id`, `campaign_id` et `player_key` **sur le
  spin**, jamais sur l'appelant — c'est la même source que celle que le
  miroir interrogera, donc le triplet ponté ne peut pas diverger de celui
  qui sera cherché. `acquisitionSource: "unknown"` et non `direct` :
  `resolve_player_identity` ne remplace une source posée que si elle vaut
  `unknown`, donc `direct` serait **collant** et mentirait
  définitivement ; en déclarant l'ignorance, on laisse un futur scan de QR
  sur cette même campagne écrire la vérité.
- ~~`ensureProgressivePlayerIdentity` avale toute panne~~ — **corrigé le
  2026-08-03**. Chaque sortie en échec émet désormais un `reportError` et
  un compteur `player-identity.bridge-failed.<motif>.<famille>`,
  **étouffés par fenêtre de 60 s et par cause**. L'étouffement n'est pas
  une commodité : sans lui, une cause générale (sel mal déployé, RPC en
  échec après migration) produisait un événement Sentry **et un `insert`
  `ops_metrics`** par requête joueur — l'observabilité se serait détruite
  elle-même au moment précis où l'on en a besoin. Le compteur ne mesure
  donc plus l'amplitude mais les **fenêtres porteuses d'échec** ; zéro
  reste la valeur saine, et une population non nulle nomme toujours la
  famille dont les lots n'atteindront pas `/portefeuille`. Rien n'entre
  dans la clé qui ne soit un littéral ou une valeur d'énumération fermée.
- Question **tranchée par la mesure et close** : le pont fonctionne bien en
  production. Les deux seules lignes de `reward_issuances` portent
  `player_id` null par **antériorité** — trois clés de spin distinctes
  existent, le pont a été posé pour la dernière à l'horodatage exact du
  dernier spin, et les deux lots pointent vers des participations à clé
  antérieure remontées par le rattrapage. `PLAYER_KEY_SALT` n'est pas en
  cause. Ne pas rouvrir ce point.

**References** :
- ADR-045 (l'identité joueur unifiée), ADR-055 (le portefeuille),
  ADR-044 (la méta-progression)
- `src/lib/player-identity.ts`, `src/actions/pronostics.ts`,
  `src/actions/referral.ts`
- [Bugs — pont d'identité](./bugs.md)

---

## ADR-067 : Un rejeu de réclamation rend le code déjà émis — et ce qu'on ne sait pas distinguer, on le COMPTE avant de le réémettre

**Date** : 2026-08-02
**Statut** : accepté

**Context** :
Le joueur gagne, valide « Récupérer mon gain », la requête est committée
mais la réponse se perd (4G qui décroche au fond du magasin). L'écran lui
dit « Connexion perdue […] réessayez » — ce que le commentaire du bouton
promettait comme sûr (« idempotente sur son jeton »). Il réessaye et lit
« Ce gain a déjà été enregistré. » : `claimPrizeInner` relisait le spin,
voyait `claimed = true` et sortait **sans jamais rendre le code**.
Recharger ne le sauvait pas non plus, `recoverPendingWin` filtrant sur
`claimed = false`. Le lot était décompté, la participation et le
`redeem_code` existaient en base, le joueur n'avait rien à présenter.

La revue a trouvé, au passage, que la branche « deux rejeux concurrents »
écrite pour ce chemin était **du code mort** : elle décidait sur le TEXTE
de l'exception (`already claimed`), or la définition vivante de
`claim_winning_spin` ouvre sur un `select … for update` qui **sérialise** —
le second appel attend, relit `claimed = true` et sort par l'autre porte.
Coût réel : un double-tap donnait une impasse devant un gain réel (il
fallait un troisième tap) et une alerte sur un chemin nominal.

**Decision** :
1. Sur un rejeu, la décision porte sur un **fait** — la participation
   existe-t-elle pour ce `spin_id` ? — et non sur le texte d'une exception
   ni sur un drapeau lu en amont. Si elle existe, son `redeem_code` (et les
   URL Wallet) sont rendus **en succès**. Le jeton signé désigne déjà CE
   spin : aucune seconde participation n'est créée, la propriété
   « transaction à usage unique » est conservée.
2. Ce qu'on ne sait pas distinguer, on ne le devine pas. Quand l'invocation
   meurt **après** le commit de la RPC, l'e-mail et le SMS ne sont pas
   partis — mais aucune trace par participation ne permet de séparer ce cas
   de la simple réponse perdue en transit, où ils SONT partis. Réémettre à
   l'aveugle ferait des doublons dans le cas fréquent. On **compte**
   (`play.claim-replay-sans-renvoi`).

**Rationale** :
Même règle qu'ADR-048 : un repli silencieux ne se retire pas, il se mesure
d'abord. Si le compteur s'avère non nul, le correctif juste est une
**trace d'envoi par participation**, qui rend les deux cas distinguables —
pas un renvoi à l'aveugle décidé sans donnée.

**Consequences** :
- **L'enseignement le plus cher du chantier vient du contrôle négatif de
  ce correctif** : en rétablissant le défaut d'origine, la suite entière
  restait VERTE. Les deux tests qui semblaient l'éprouver n'atteignent
  jamais cette branche — les doubles étant synchrones, le second appel voit
  `spin.claimed = true` à la lecture amont et part par le chemin voisin
  sans appeler la RPC. **Le cas central du correctif n'était couvert par
  rien.** Test ajouté ; le sabotage rend désormais un rouge nommé. Deux
  autres montages ne mordaient pas davantage, faute de dissocier « le spin
  est déjà réclamé » de « la RPC refuse ».
- Le pavé de commentaire qui décrivait le mécanisme concurrent inexistant
  a été rendu **vrai**, pas réécrit : c'est le motif déjà consigné le
  2026-08-01 (un en-tête qui affirme une propriété que le code ne tient
  pas se corrige en rendant la phrase vraie).

**References** :
- ADR-048 (mesurer un repli avant de le retirer)
- `src/actions/play.ts`, `src/components/wheel/claim-form.tsx`
- [Bugs — claim non idempotent](./bugs.md)

---

## ADR-068 : Une source qui disparaît ANNULE son lot au registre, elle ne l'efface pas — et la rétention n'est pas une annulation comme les autres

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
`reward_issuances.source_id` est **polymorphe** : il désigne dix tables et
ne porte aucune clé étrangère. Rien ne reliait donc mécaniquement la ligne
de registre à sa ligne source, et les dix triggers de miroir étaient
`after insert or update`, **jamais `delete`**. Quand la cascade emportait
la source — roue, chasse, calendrier, quiz, palier ou programme de
fidélité supprimés — la ligne de registre survivait, orpheline : le client
lisait toujours son lot « À retirer » sur `/portefeuille` pendant que la
caisse lui répondait « Code introuvable ». Les six gardes d'ADR-063
réduisaient la fréquence du cas ; elles ne le fermaient pas, la
suppression restant possible et voulue une fois la case cochée.

**Decision** :
1. **Marquer, jamais détruire.** Dix triggers `after delete` posent
   `cancelled_at` sur la ligne de registre.
2. **La cause de la disparition est portée par un réglage de session**,
   `lastchance.purge_maintenance`, posé par les cinq purges qui
   suppriment réellement une ligne joueur — le trigger ne voit qu'un
   `old`, jamais le pourquoi.
3. **Une annulation par la rétention n'est pas TERMINÉE** au sens de
   `purge_expired_reward_issuances` : la clause
   `cancelled_reason is distinct from 'source purgée'` l'en exclut.
   L'annulation par le geste du commerçant, elle, reste purgeable.

> **Corrigée le 2026-08-03 par ADR-071 et ADR-072** (branche
> `chantier/derniers-ouverts`). Les points 2 et 3 ci-dessus **ne décrivent
> plus le code** : la cause ne se lit plus dans `cancelled_reason` mais dans
> la colonne dédiée `reward_issuances.cancelled_source` (ADR-072), et
> l'exclusion de purge n'est plus inconditionnelle — elle est **bornée par
> une grâce de `least(3 mois, fenêtre de rétention de l'organisation)** à
> compter de `cancelled_at` (ADR-071), et elle s'applique désormais aux
> **deux** causes collatérales, `purged` comme `source_deleted`.

**Rationale** :
Supprimer la ligne aurait rétabli la cohérence en une ligne de SQL. Le
marquage est retenu pour quatre raisons dont trois sont **mesurables dans
ce dépôt** : l'état `cancelled` existe déjà de bout en bout (le
portefeuille le calcule, l'écran l'affiche, `redeem_reward_by_code` le lit
**avant** toute route legacy) — donc le client lit une explication là où
la suppression lui aurait fait constater une disparition, et un lot gagné
qui s'évapore, c'est un produit qui a l'air cassé ; `org_weekly_digest`
compte les lots ÉMIS et son propre commentaire dit qu'un lot annulé reste
émis — détruire ferait baisser après coup le chiffre d'une semaine passée,
sur le seul document que le commerçant reçoit chaque lundi ; la caisse a
déjà l'issue cohérente câblée ; et la trace n'est pas éternelle pour
autant, une annulation par le commerçant devenant purgeable à l'échéance
de rétention.

Le point 3 est le plus important, et c'est **la revue sécurité qui l'a
trouvé, sur une conséquence non déclarée de la migration elle-même**.
`purge_expired_*` supprime les lignes joueur sur le **seul critère
d'âge** — `data_retention_months` vaut `default 12`, ce n'est pas un
opt-in, chaque organisation purge. Les tables de lots cascadent, le
nouveau trigger posait `cancelled_at`, et une ligne annulée est TERMINÉE
donc détruite la nuit même (les deux purges tournent dans le même
`Promise.all`, ordre non déterministe). **Avant cette migration, cette
ligne était protégée à vie.** Sans la distinction de cause, un correctif
de cohérence d'affichage serait devenu un annulateur de masse.

**Consequences** :
- L'invariant de `20260810120000` (« on ne supprime jamais un lot encore
  encaissable ») devient **conditionnel** : il ne tient plus par la seule
  vertu de son prédicat, mais aussi par la clause ci-dessus. Son en-tête
  est sur `main` et `scripts/check-migration-order.mjs` compare des
  octets — la correction est donc écrite dans la migration nouvelle, pas
  en place. C'est la règle déjà consignée le 2026-08-01.
- **Cinq purges instrumentées, pas neuf, et c'est vérifié et non
  supposé** : `quiz` et `referral` **anonymisent** sans supprimer (aucun
  `after delete` ne peut s'y déclencher) ; `jackpot_wins` n'a **aucune
  FK** vers `jackpot_players` ; `event_wins` référence `event_sessions`,
  que sa purge ne touche pas. Ces deux dernières familles sont
  structurellement hors d'atteinte — leur registre anonyme de gains
  survit déjà à la purge du joueur.
- La définition vivante des cinq purges **déménage** dans cette
  migration : `grep -l "function public.purge_expired_hunt_players"` rend
  désormais deux fichiers. La règle du catalogue vivant s'applique — elle
  a déjà coûté deux défauts à ce dépôt. Les cinq corps ont été extraits
  **par script**, une seule ligne insérée, aller-retour vérifié à l'octet
  près : aucune ligne recopiée à la main.
- **Ce que le marquage ne ferme pas** : sept familles sur neuf n'ont
  aucune expiration au registre (`sync_reward_issuance` écrit `null` pour
  hunt, loyalty, jackpot, event, calendar ×2, referral, quiz ; seuls
  `wheel` et `contest` en portent une). Un lot « source purgée » de ces
  familles était donc conservé **indéfiniment**. ~~Consigné ouvert.~~
  **FERMÉ le 2026-08-03 par ADR-071** : la ligne d'explication reçoit une
  échéance bornée. Ce qui reste vrai, et reste ouvert, est plus étroit :
  ces sept familles n'ont toujours aucune échéance pour les lots **non
  annulés**, que rien ne clôt jamais.

**References** :
- ADR-063 (les six gardes destructives), ADR-055 (le portefeuille),
  ADR-069 (la cause rendue au client)
- `supabase/migrations/20260902120000_cancel_reward_on_source_delete.sql`,
  `supabase/tests/reward_source_deletion.test.sql`
- [Bugs — résidus de la chasse par parcours vécu](./bugs.md)

---

## ADR-069 : La cause d'une annulation est un vocabulaire FERMÉ — le motif libre du commerçant ne franchit jamais la frontière du client

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
ADR-068 crée une troisième cause d'annulation. Deux surfaces affirmaient
pourtant un motif **unique** : le portefeuille du client (« Le commerçant
a annulé ce lot. ») et la carte d'annulation de la caisse (« l'opération
qui le portait a été supprimée »). Les deux textes devenaient faux, et
faux dans le sens le plus coûteux : ils imputent à un commerçant un geste
qu'il n'a pas fait — et le caissier répète la phrase **au client, en
face**. En mars 2028, une purge de rétention aurait fait affirmer à un
employé, devant un vrai gagnant, que son patron avait supprimé
l'opération.

La voie évidente était de faire remonter `cancelled_reason` jusqu'au
portefeuille. Elle a été **écartée après vérification** : ce champ est du
**texte libre saisi par le commerçant** (300 caractères, lu d'un
formulaire par `cancelParticipation`). Le publier déposerait des notes
internes — « client indésirable », « suspicion de fraude » — sur l'écran
que le client ouvre, et sur celui que le caissier lui montre.

**Decision** :
1. `player_wallet` rend une **cause normalisée**, `cancelled_cause`,
   vocabulaire fermé à trois valeurs (`purged`, `source_deleted`,
   `merchant`) plus `null`. Elle dit **qui a agi**, rien de plus. Le motif
   libre ne franchit jamais la frontière.
2. Les deux tables de texte vivent dans un module pur,
   `src/lib/annulation-cause.ts`, en `Record<CauseAnnulation, string>` :
   ajouter une cause fait échouer `tsc` tant que les deux audiences n'ont
   pas été traitées. La garantie « aucune branche muette » est tenue par
   le compilateur — ce dépôt a déjà payé deux fois une branche d'affichage
   oubliée sur une seule famille.
3. Les deux audiences ne partagent pas leur phrase. Le client lit un écran
   de téléphone et n'a rien à corriger ; le caissier lit la sienne à voix
   haute et a besoin de savoir s'il doit faire retaper la saisie.
4. Une cause inconnue — toute annulation **antérieure** à ce chantier — ne
   retombe pas sur `merchant` mais sur une phrase qui n'accuse personne.
   Le repli par défaut *était* le défaut d'origine.

> **Partiellement RETOURNÉE le 2026-08-03 par ADR-072** (branche
> `chantier/derniers-ouverts`). Le principe — vocabulaire fermé, motif libre
> qui ne franchit jamais la frontière — tient et est renforcé. Ce qui était
> faux est le **mécanisme** : la première implémentation *dérivait* la cause
> de `cancelled_reason`, c'est-à-dire du champ de texte libre que cette ADR
> disait précisément ne pas publier. Un `editor` qui saisissait exactement
> `source purgée` — au formulaire, ou par un `PATCH` PostgREST direct qui ne
> laisse aucune trace d'audit — fabriquait la sentinelle et faisait afficher
> « Personne ne l'a annulé ». L'ADR était donc retournée contre elle-même :
> au lieu d'imputer au commerçant un geste automatique, on laissait le
> commerçant imputer à l'automatisme son propre geste. La cause vit
> désormais dans une colonne dédiée (ADR-072). Le point 4 (repli sur une
> phrase qui n'accuse personne) est également **abandonné à la lecture** :
> le repli est `merchant`, et le motif de ce choix est écrit dans ADR-072.

**Rationale** :
Le mécanisme qui rend la cause connaissable mérite d'être écrit, parce que
la voie élégante est **refusée par la plateforme, mesuré et non supposé** :
`alter function … set lastchance.purge_maintenance` — qui aurait posé le
réglage sans toucher un seul corps de fonction — échoue avec
`permission denied to set parameter`. Ce n'est pas une affaire de
guillemets : la forme non quotée, seule correcte au regard de la
grammaire, rend la même erreur. La cause est le modèle de rôles Supabase —
`postgres`, sous lequel tournent les migrations, n'est pas superutilisateur,
et fixer un paramètre *custom* par `alter function … set` l'exige. Une
migration qui l'aurait tenté aurait échoué **en entier**, et c'est
exactement ce qui s'est passé au premier `db reset` : les dix triggers, la
purge corrigée et le portefeuille n'ont jamais existé, silencieusement,
derrière un `Result: FAIL` qui ne nommait que les tests. Repli sur
`set_config(…, is_local => true)` dans les corps — l'idiome
`audit_maintenance` déjà en production depuis `20260826120000`.

**Consequences** :
- La caisse n'a **pas** d'autre chemin : elle lit `reward_issuances` en
  direct (`lookupUniversalRewardRoute`), pas `player_wallet`, qui est
  scopée au joueur porteur du cookie. Les deux motifs SQL sont donc
  recopiés en constantes (`MOTIF_PURGE`, `MOTIF_SUPPRESSION`) et
  confinés à ce seul endroit.
- **La garde de ces deux littéraux ne prouvait pas ce qu'on croyait** :
  `annulation-cause.test.ts` les comparait au **fichier de migration**,
  jamais à `pg_proc`. ~~Consigné ouvert.~~ **FERMÉ le 2026-08-03** : deux
  assertions pgTAP lisent `pg_proc.prosrc` — la définition que Postgres
  exécutera — et **nomment** les constantes TypeScript à déplacer. La
  mesure a d'ailleurs corrigé l'entrée : cinq assertions préexistantes
  rougissaient déjà sur ce sabotage, donc « une redéfinition passerait
  sans que rien ne rougisse » était **trop large** ; ce qui manquait
  n'était pas la détection mais la **désignation** — les cinq
  préexistantes font corriger la fixture, pas la constante. Le point est
  par ailleurs devenu secondaire : la caisse ne dérive plus aucune cause
  d'un littéral (ADR-072).
- `WheelResult` et `ContestResult` rendent encore « annulé » sans cause :
  ces chemins lisent la table parente **vivante**, donc leur cause est
  toujours `merchant` — la distinction n'y est simplement pas énoncée.

**References** :
- ADR-068 (marquer plutôt que détruire), ADR-055 (le portefeuille)
- `src/lib/annulation-cause.ts`, `src/lib/annulation-cause.test.ts`,
  `src/app/dashboard/redeem/page.tsx`,
  `src/components/wallet/player-wallet-screen.tsx`

---

## ADR-070 : Un seau qui garde une LECTURE de dernier recours échoue OUVERT — et l'exception ne s'exporte pas

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
`loadHuntRecallContext` est le chemin par lequel un gagnant relit son code
`CHASSE-…` **quand la chasse est close** — il existe précisément parce que
ce code n'est lisible nulle part ailleurs à ce moment-là. Il s'ajoutait au
chargeur strict sur une page publique `force-dynamic`, atteignable par
quiconque photographie le QR d'une étape en boutique, et ne portait aucune
borne : chaque requête coûtait trois lectures `service_role`, y compris
sur une chasse archivée. Amplification pure — aucune donnée n'en sort sans
le cookie de complétion — mais un travail non borné offert à Internet
reste un travail offert.

**Decision** :
Trois gardes ordonnées du moins cher au plus cher : aucun cookie de chasse
sur l'appareil → refus à **zéro requête** ; cookie présent mais pas celui
de CETTE chasse → refus à **une requête** ; puis un seau sur le hash du
cookie joueur, **`failClosed: false`**.

**Rationale** :
Le calcul du fail-closed suppose qu'un rejeu non borné coûte quelque
chose. Ici il ne coûte rien d'exploitable : ce chargeur **n'écrit rien**,
ne rend pas le client admin, et exige une complétion déjà acquise. En
regard, une panne de la table de compteurs aurait fermé cette page à des
gagnants légitimes — et de travers : pendant le **même** incident, une
chasse encore ACTIVE aurait continué de répondre, `loadHuntStepContext` ne
portant aucun seau. Une chasse close aurait été moins accessible qu'une
chasse ouverte, au moment précis où son seul recours est cette page.

**Ce raisonnement ne s'exporte pas.** Les autres seaux d'identité
(`huntScanPlayer`, `loyaltyStampMember`, `cashier:lookup`) gardent des
**écritures**, où un rejeu non borné consomme du stock, tamponne un
passeport ou remet un lot. L'exception tient à ce que ce chemin est en
lecture seule, pas à ce qu'il est public.

**Consequences** :
- **Ce seau ne borne pas un débit, et l'affirmer serait faux.** Sa clé
  contient le sha256 de la **valeur** d'un cookie `httpOnly` — caché à
  JavaScript, pas à l'utilisateur, qui peut en changer la valeur à chaque
  requête : les deux gardes amont passent (elles ne regardent que le NOM),
  le hash est neuf à chaque coup, aucun seau ne se remplit. Il borne un
  porteur **coopératif** — l'onglet laissé ouvert, le réseau capricieux.
  Une première rédaction du commentaire annonçait qu'« un script en
  atteint le plafond en quelques secondes » : la **phrase a été corrigée
  plutôt qu'une fausse garde ajoutée**. Un seau sur le jeton d'étape serait
  l'interrupteur qu'ADR-032 interdit — la carte de victoire de tous les
  joueurs d'un même lieu, fermée par un seul abuseur.
  > **Correction du 2026-08-03 (ADR-073)** : la phrase « l'IP est proscrite
  > par ADR-032 » citait l'ADR **à contresens**, et la même erreur figurait
  > dans l'en-tête de `loadHuntStepContext`. ADR-032 proscrit de **refuser**
  > sur une clé partagée ; elle **prescrit** à la place un seau large et
  > fail-open, à valeur d'observabilité. Le raisonnement concluait de
  > « aucune clé ne peut porter un refus » à « rien à faire », en sautant le
  > terme moyen que l'ADR pose — et que le dépôt implémentait déjà deux
  > fonctions plus loin (`observeSharedKey` + `huntScanIp`).
  >
  > **Suite du 2026-08-03 (`chantier/solde-bugs`) — ce constat n'est plus
  > seul : quelque chose est POSÉ À CÔTÉ.** « Ce seau ne borne pas un
  > débit » reste exact et le seau est délibérément conservé pour ce qu'il
  > borne réellement (un porteur coopératif). Mais le débit qu'il ne borne
  > pas est désormais **compté** : `observeSharedKey` sur (chasse, IP),
  > règle `huntRecallIp`, **fail-open**, intercalé **entre la garde 2 et la
  > garde 3** — exactement la population que la garde 3 prétendait borner,
  > et l'IP est la seule clé de ce chemin que l'appelant ne choisit pas.
  > **Le `failClosed: false` ci-dessus est intact : un compteur ne refuse
  > rien**, `observeSharedKey` ne rend aucune valeur. Seau **distinct** de
  > `huntStepIp` bien que les deux chargeurs servent la **même requête** —
  > le rappel ne s'exécute qu'après le refus du chargeur d'étape, qui a
  > déjà consommé son compteur, donc une clé commune compterait un passage
  > pour deux (la raison même qui tient `huntStepIp` séparé de
  > `huntScanIp`). Séparés, **leur rapport est l'information** : la part du
  > trafic d'une chasse qui retombe sur le repli. Calibrage **dérivé et non
  > inventé** — identique à `huntStepIp`, dont les requêtes comptées ici
  > sont un sous-ensemble strict.
- `loadHuntStepContext` reste non borné sur la même page (~4 lectures
  `service_role` par requête) — préexistant, hors périmètre, et c'est lui
  qui relativise le seau posé : **l'attaquant n'obtient ici rien qu'il
  n'ait déjà** par ce chemin-là. ~~Consigné ouvert.~~ **Requalifié le
  2026-08-03 (ADR-073)** : le refus reste refusé, mais le coût est
  désormais **mesuré** (3 lectures sans cookie, 4 avec un cookie
  arbitraire, 6 pour un joueur retrouvé — le « ~4 » n'avait jamais été
  compté) et un compteur `huntStepIp` rend l'amplification visible.
- La vraie borne du chemin est ailleurs, et elle est écrite : les deux
  gardes de cookie, l'exigence d'une complétion acquise, et l'absence
  d'écriture.

**References** :
- ADR-032 (une clé partagée ne porte jamais un REFUS ; elle peut porter un
  compteur large et fail-open — voir ADR-073, qui corrige la lecture qu'en
  faisait cette ADR)
- `src/lib/hunt-context.ts`, `src/lib/rate-limit.ts` (`RATE_LIMITS.huntRecall`,
  `RATE_LIMITS.huntStepIp`)


---

## ADR-071 : Une explication a une échéance — la grâce va au COLLATÉRAL, jamais à la décision

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
ADR-068 avait exclu de `purge_expired_reward_issuances` les annulations
causées par la rétention. Cette clause **n'avait pas d'échéance**, et
`sync_reward_issuance` écrit `null::timestamptz as expires_at` pour HUIT de
ses dix branches — seules la roue et les pronostics reportent une échéance,
et les deux colonnes sources sont nullables. Pour ces familles, une ligne
annulée n'était terminale pour aucune des trois branches du prédicat :
**aucun chemin ne la supprimait jamais**, alors qu'elle porte un `player_id`
et qu'il n'existe aucune purge de `public.players`. Une conservation de fait,
sans fin, sur une ligne rattachable à une personne.

Le second défaut est une **asymétrie sans fondement** : la grâce allait à
`purged` (la rétention) et pas à `source_deleted` (le geste d'entretien du
commerçant), qui était détruite la nuit même.

**Decision** :
1. Un **délai de grâce** court à compter de `cancelled_at`, et non une
   conservation infinie ni une destruction immédiate. La ligne n'est plus
   encaissable par aucun chemin dès que sa source disparaît ; sa seule valeur
   restante est d'**expliquer** au client et au caissier, et une explication a
   une échéance.
2. La durée est **bornée** : `least(3 mois, fenêtre de rétention de
   l'organisation)`. La grâce ne dépasse jamais ce que l'organisation a
   déclaré.
3. La grâce va au **collatéral** — `purged` **et** `source_deleted` — jamais à
   la **décision** (`merchant`, et le repli des lignes sans cause connue).
4. Le point de départ est `cancelled_at`, **jamais** `issued_at`. La clause
   est **ANDée** au critère d'âge, jamais substituée : le délai réel est le
   maximum des deux horloges.

**Rationale** :
**Trois mois est un arbitrage produit assumé, sans appui mesurable — et c'est
la revue sécurité qui a démoli les deux appuis que la première rédaction
avançait, tous deux gravés dans un `comment on function`.** (a) « la plus
longue vie qu'un code de retrait puisse avoir ici », qui citait
`contests.code_ttl_seconds` plafonné à 90 jours : faux, cette colonne est
**nullable** et son propre commentaire dit « null : sans limite »,
`campaigns.code_ttl_seconds` de même, et les sept familles où cette grâce
décide de quelque chose n'ont **aucune colonne d'échéance** — leur code ne
meurt jamais. 90 jours est la plus longue échéance *finie configurable*, pas
la plus longue vie d'un code. (b) « le quart de la plus courte rétention
déclarable », qui citait un `<select>` à 12/24/36 mois : c'est du **client**.
La frontière serveur est `src/lib/validations/privacy.ts` (`min(1).max(60)`)
et le CHECK `00016:15` ; un propriétaire qui poste `months=1` est accepté, et
trois mois y seraient le **triple** de la rétention, pas le quart. Les deux
appuis sont **retirés et non réécrits** : rien dans ce produit ne borne la
durée pendant laquelle un client conserve un code devenu mort, et prétendre
le contraire est le motif récurrent que ce dépôt se reproche. Ce qui est
énoncé dans le `comment on function` est donc la seule chose relisible dans
le code : la **borne**.

**Le motif de l'extension à `source_deleted` est FACTUEL et non d'équité.**
Avant `20260902120000`, les triggers de miroir étaient `after insert or
update` : quelle que soit la cause, la disparition de la source laissait la
ligne `cancelled_at is null`, donc **non terminale, donc jamais purgée — pour
les deux causes**. Cette migration a converti « jamais purgée » en « purgée
dès le passage suivant du cron » pour les deux, et n'en a protégé qu'une :
l'asymétrie suivait le contour du risque que la revue précédente avait nommé
à ce moment-là, pas un principe. Le scénario qu'elle laissait ouvert est
réel — rétention 12 mois, un `CHASSE-…` gagné il y a 14 mois et jamais
retiré (la famille chasse n'a aucune échéance, rien ne l'avait clos), le
commerçant supprime la chasse aujourd'hui et coche la case d'ADR-063 :
`issued_at` est déjà au-delà de la rétention, le cron de la nuit même détruit
la ligne, et le client perd l'explication **alors même qu'il a quelqu'un à qui
la demander**. La règle retenue ne porte donc pas sur « qui a décidé » mais
sur « cette ligne a-t-elle été close par une décision PORTANT SUR CE LOT ».

**`cancelled_at` et jamais `issued_at`** : pour la roue, `issued_at` **est**
`participations.created_at`, le critère exact que `purge_expired_personal_data`
vient d'appliquer pour supprimer la source. Ancrer la grâce dessus la rendrait
nulle pour la famille la plus fréquente et rouvrirait, dès le passage suivant
du cron, le trou fermé la veille.

**Consequences** :
- Une ligne d'explication meurt au plus tard trois mois après l'annulation, et
  plus tôt si l'organisation a déclaré une rétention plus courte.
- **Ce que la migration ne fait pas, écrit ici plutôt que découvert** : elle
  ne donne d'échéance à aucune des sept familles. Un lot **non annulé** et
  jamais remis y reste conservé sans fin, comme le veut `20260810120000`.
  Seul le sous-ensemble annulé en collatéral est borné. Consigné ouvert.
- `cancelled_reason` continue de porter les deux sentinelles textuelles :
  elles ne décident plus rien (ADR-072), mais restent un texte que le
  commerçant peut imiter.

**References** :
- ADR-068 (marquer plutôt que détruire, partiellement corrigée), ADR-072 (la
  cause devient une colonne), ADR-063 (les six gardes destructives)
- `supabase/migrations/20260903120000_purged_reward_grace.sql`,
  `supabase/tests/reward_retention.test.sql`

---

## ADR-072 : La cause d'annulation est une colonne que l'application ne peut pas NOMMER — fiable par absence d'écrivain, pas par contrôle

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
ADR-069 posait le bon principe — vocabulaire fermé, motif libre du commerçant
qui ne franchit jamais la frontière du client — et l'implémentait par le
mauvais mécanisme : la cause se **dérivait du texte**, la caisse comparant
`cancelled_reason` aux deux sentinelles que le trigger y écrit
(`causeDepuisMotif`). Or ce champ n'est pas à nous. Il arrive dans le registre
par deux chemins, tous deux ouverts : `cancel_participation`, dont le motif
n'exige que cinq caractères et que `sync_reward_issuance` recopie **tel quel**
pour la roue ; et, plus court encore, un `PATCH /rest/v1/participations` —
`00018:24` accorde `update` sur **toutes** les colonnes à `authenticated`,
`00017:100` ouvre la policy à l'`owner` — qui obtient le même résultat **sans
la ligne `audit_logs`** que la RPC écrit.

Ce qu'un commerçant obtenait en saisissant exactement `source purgée` : le
portefeuille affichait à SON client « Personne ne l'a annulé », le caissier
disait au client en face « Ce n'est une décision de personne — ni la vôtre, ni
celle de votre équipe », et la ligne gagnait la protection de rétention
réservée aux annulations automatiques. **ADR-069 retournée contre elle-même** :
au lieu d'imputer au commerçant un geste automatique, on laissait le
commerçant imputer à l'automatisme son propre geste.

**Decision** :
La cause vit dans une colonne dédiée, `reward_issuances.cancelled_source`, à
`check` de vocabulaire fermé, posée par **un seul écrivain** — le trigger
`cancel_reward_issuance_on_source_delete`. Le repli à la **lecture**, jamais
stocké, est `merchant`.

**Rationale** :
**Ce qui rend la colonne fiable n'est pas un contrôle, c'est une ABSENCE.**
`upsert_reward_issuance` — le miroir, seul chemin par lequel une écriture
legacy atteint le registre — **ne nomme pas la colonne**, ni à l'`insert`, ni
à l'`on conflict do update` ; et `reward_issuances` est révoquée en entier de
`public, anon, authenticated`, donc aucun chemin PostgREST direct n'existe,
pour aucune colonne. Un `PATCH` sur `participations` ne peut donc pas
l'atteindre, quel que soit le texte posté. Une garde qu'on peut oublier
d'appeler protège moins qu'un chemin d'écriture qui n'existe pas.

Le repli `merchant` est le **sens sûr** : une annulation dont on ne sait rien
est traitée comme une décision, ce qui n'accorde aucune des faveurs réservées
à l'automatique — ni la grâce d'ADR-071, ni la phrase qui n'accuse personne.

**Aucune contrainte d'état ne lie la colonne à `cancelled_at`**, et ce n'est
pas un oubli : `upsert_reward_issuance` écrit `cancelled_at = excluded.…`, y
compris `null`, sans toucher `cancelled_source` ; un `check` lèverait alors
**dans le trigger `after` du miroir**, donc à l'intérieur de la transaction de
l'écriture legacy, et la ferait ROLLBACK. C'est très exactement le droit de
**veto** du miroir sur l'autorité que `20260805150000` refuse déjà deux fois.
Les deux lecteurs testent `cancelled_at` avant de consulter la colonne.

**Consequences** :
- `causeDepuisMotif` et les deux sentinelles recopiées côté applicatif sont
  **retirées** : la duplication qu'elles gardaient n'existe plus. La garde des
  littéraux SQL demeure, désormais adossée à `pg_proc` et non à un fichier.
- **Le repli `merchant` est indistinguable** entre « annulation décidée à la
  main » et « cause illisible » : aucune surface ne peut plus signaler une
  valeur hors vocabulaire. Alignement **délibéré** entre la caisse et le
  portefeuille — deux écrans qui parlent au même client ne doivent pas se
  contredire — mais écrit ici pour ne pas être découvert.
- `cancelled_reason` reste écrit par le trigger et reste du texte libre que le
  commerçant peut imiter. Il ne gouverne plus aucune décision.
- Rattrapage des lignes déjà annulées par un `update` unique — le seul endroit
  du fichier où le texte décide d'une cause, et il ne s'exécute qu'une fois.
  **Mesuré en production le 2026-08-03** : `reward_issuances` y porte 2 lignes
  et ZÉRO annulée ; ce rattrapage n'y touche rien, il existe pour la CI, le
  seed et les bases de développement.

**References** :
- ADR-069 (le principe, retourné dans son mécanisme), ADR-071 (la grâce, qui
  s'appuie sur cette cause désormais fiable), ADR-055 (le portefeuille)
- `supabase/migrations/20260903120000_purged_reward_grace.sql`,
  `src/lib/annulation-cause.ts`

---

## ADR-073 : Une clé partagée ne peut pas REFUSER — mais elle peut COMPTER, et « rien à faire » saute ce terme moyen

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
`loadHuntStepContext` sert la page publique d'étape de chasse, atteignable par
quiconque photographie un QR de vitrine, et n'était borné par **rien**.
**Quatre chantiers successifs l'ont consigné « non borné » sans rien poser**,
chacun concluant par le même raisonnement : le jeton d'étape est sur un QR
partagé (un seau dessus fermerait la chasse à tout le lieu), le cookie de
chasse n'existe pas au premier scan — or le premier scan **est** le produit —
et « l'IP est proscrite par ADR-032 ».

**Cette dernière phrase cite ADR-032 à contresens.** L'ADR dit l'inverse :
une clé partagée ne porte **jamais un refus**, mais elle porte un seau
**large et fail-open, à valeur d'observabilité**. C'est *refuser* sur l'IP qui
est proscrit, pas *compter*. Et le dépôt implémentait déjà exactement cela
deux fonctions plus loin (`observeSharedKey` + `huntScanIp`). Le raisonnement
concluait de « aucune clé ne peut porter un refus » à « rien à faire », en
sautant le terme moyen que l'ADR prescrit.

**Decision** :
1. **Le seau bloquant reste REFUSÉ**, et c'est désormais une décision écrite,
   pas une dette qui traîne. Recopier ici le seau de `loadHuntRecallContext`
   serait **pire qu'ailleurs** : l'amplification passe par le chemin **sans
   cookie**, donc le seau siégerait sur la seule route que l'abuseur ne prend
   jamais.
2. **Le coût public est MESURÉ et épinglé table par table** : trois lectures
   `service_role` sans cookie, quatre avec un cookie `lc-hunt-<id>` arbitraire
   (qui coûte une lecture de plus sans rien ouvrir), six pour un joueur
   retrouvé. Les documents annonçaient « ~4 » — personne n'avait compté.
3. Un `observeSharedKey` sur (chasse, IP), seau `huntStepIp`, **fail-open,
   jamais un refus**, posé **après** la résolution de l'étape.

**Rationale** :
Le seau est **distinct** de `huntScanIp` et non partagé avec lui :
`stampHuntStep` traverse ce chargeur avant de tamponner, les fondre ferait
compter deux fois un même geste et rendrait les deux signaux illisibles. Le
rapport entre les deux est d'ailleurs l'information utile — beaucoup de pages
pour peu de tampons, c'est un balayage ; l'inverse n'existe pas.

L'ordre compte : le compteur est posé **après** la garde d'étape, sinon il
mesurerait aussi les requêtes qu'on rejette déjà pour rien.

**Consequences** :
- ~~`clientIpFromHeaders` rend `"unknown"` hors proxy déclaré : le compteur ne
  mesure quelque chose que là où `TRUSTED_PROXY_PROVIDER`/`VERCEL` est posé.~~
  **Traité le 2026-08-03 (`chantier/solde-bugs`), et sur CE module — pas
  ailleurs.** Le défaut réel n'était pas le `"unknown"` (délibéré : les
  en-têtes génériques sont forgeables) mais sa **concaténation telle quelle**
  dans la clé, qui versait tous les visiteurs dans une seule ligne agrégée à un
  seuil calibré pour un seul d'entre eux. `pressionParIp`
  (`src/lib/request-ip.ts`) pose désormais la clé `ip-non-mesuree` et suffixe
  l'événement en `.ip_non_mesuree` : **on garde la détection, on perd
  l'attribution, et on le dit deux fois** — s'abstenir de compter aurait jeté
  la première avec la seconde, alors que sous un débit réel l'agrégat franchit
  le seuil et reste le seul signal là où aucun proxy n'est déclaré. **Ne
  couvre que `huntStepIp` et `huntRecallIp`** : la vingtaine d'autres
  compteurs par IP du dépôt gardent l'ancien comportement, ce qui est écrit
  dans le docstring de la fonction plutôt que présenté comme une garde
  transverse.
- **Le calibrage (200 / 10 min) est hérité de `huntScanIp` sans mesure propre
  à cette page.** Même lieu, même Wi-Fi, même ordre de grandeur de visiteurs :
  c'est un point de départ raisonné, pas un chiffre mesuré. Écrit comme tel.
  **Et `huntRecallIp` en hérite à son tour (2026-08-03) : trois seuils, une
  seule origine.** Aucune mesure n'est possible aujourd'hui — la production
  porte une seule organisation, celle du propriétaire ; un chiffre inventé ne
  vaudrait pas mieux qu'un chiffre hérité et raisonné.
- Ne **pas** repasser `huntStepIp` en `failClosed` : ce serait l'interrupteur
  qu'ADR-032 interdit, sur la page la plus exposée du module.

**References** :
- ADR-032 (le principe, cité ici jusqu'à son terme moyen), ADR-070 (le seau du
  chemin voisin, et sa section Consequences corrigée)
- `src/lib/hunt-context.ts`, `src/lib/rate-limit.ts` (`RATE_LIMITS.huntStepIp`)

---

## ADR-074 : Une garde TEXTUELLE et une garde COMPORTEMENTALE ne prouvent pas la même chose — on garde les deux, et on écrit ce qu'aucune ne prouve

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
`player-identity-coverage.test.ts` était censé garantir que les quatre modules
d'offre de tour (calendrier, fidélité, quiz, parrainage) posent bien le pont
d'identité `campaign` qu'ADR-066 exige. Il est **textuel** : il cherche l'appel
dans le fichier. QA l'a démontré aveugle en préfixant les quatre appels par
`void 0 &&` — la suite est restée **entièrement verte**. Elle prouvait qu'un
appel *existe dans un fichier*, jamais qu'il est *atteignable*.

**Decision** :
Un second fichier, `src/actions/offered-spin-bridge.test.ts`, **exécute** les
quatre actions contre des doubles et observe l'appel, avec deux
contre-exemples par module (tour perdant, roue sans lot) pour qu'un pont posé
inconditionnellement ne passe pas non plus. **L'assertion textuelle est
CONSERVÉE**, et l'en-tête dit désormais qui prouve quoi — et ce qu'aucune des
deux ne prouve.

**Rationale** :
Les deux gardes ont des angles morts **complémentaires**, et c'est la seule
raison de payer les deux. La textuelle se **dérive du dossier `src/actions`** :
un cinquième module d'offre y arrive tout seul, et sera couvert le jour où
quelqu'un l'écrira. La comportementale énumère quatre modules **à la main** :
elle ne verra jamais le cinquième, mais elle est la seule à distinguer un
appel atteignable d'un appel mort.

**L'écart entre les deux fichiers EST la démonstration**, et il est mesuré :
sur le même sabotage (`void 0 &&`, vérifié par `grep -c` sur disque), la
comportementale rend **4 rouges / 8 verts**, la textuelle **15 verts, 0
rouge**. La cécité est reproduite, pas supposée.

**Consequences** :
- Un cinquième module d'offre sera attrapé par la textuelle mais **pas** par
  la comportementale, qu'il faudra étendre à la main. Écrit dans l'en-tête du
  fichier, pas seulement ici.
- Généralisation retenue au-delà de ce cas : **une garde qui lit du texte
  prouve une présence, jamais une atteignabilité.** Quand elle garde un
  invariant qui coûte de l'argent ou de la confiance, elle demande une
  jumelle qui exécute.

**Addendum du 2026-08-04 — la jumelle est enfin possible pour les composants.**
Cette ADR a été appliquée pendant un an aux seules *actions*, et jamais aux
*composants*, pour une raison qui n'était écrite nulle part ici : il n'existait
aucun moyen d'exécuter du JSX dans ce dépôt. Une douzaine d'en-têtes le
disaient à sa place (« le projet n'a pas d'environnement de rendu React »),
transformant une limite d'outillage en doctrine. Cette limite est levée
(ADR-076) et la doctrine ne change pas d'un mot : les deux formes restent
complémentaires, **la textuelle pour l'exhaustivité, l'exécutable pour
l'atteignabilité**. Ce qui change est le périmètre — un composant dont une
branche non rendue coûterait cher relève désormais de la seconde phrase de la
généralisation, pas de la première.

**References** :
- ADR-066 (le pont d'identité posé au point d'écriture)
- ADR-076 (l'environnement de rendu qui rend la jumelle possible côté écran)
- `src/lib/player-identity-coverage.test.ts`,
  `src/actions/offered-spin-bridge.test.ts`

---

## ADR-075 : Une IP qu'on n'a pas su lire se COMPTE quand même — mais sous une étiquette et un nom d'événement qui l'avouent

**Date** : 2026-08-03
**Statut** : accepté

**Context** :
`clientIpFromHeaders` rend `"unknown"` dès qu'aucun proxy de confiance n'est
déclaré (`TRUSTED_PROXY_PROVIDER` / `VERCEL`), et c'est **délibéré** : les
en-têtes génériques sont forgeables si l'origine est joignable en direct. Le
défaut n'était pas là. Il était que les appelants **concaténaient cette valeur
telle quelle** dans leur clé de seau : tous les visiteurs tombaient alors dans
une **unique ligne agrégée** `…:unknown`, à un seuil calibré pour **un seul**
d'entre eux. Deux confusions en découlaient, et aucune n'est signalée nulle
part : un dépassement nommait un seau qui ne désigne personne (impossible de
distinguer une vraie pression mono-IP d'un agrégat), et un zéro sain était
indistinguable d'un zéro aveugle.

**Decision** :
Un module pur, `pressionParIp` (`src/lib/request-ip.ts`), traversé par les
compteurs avant toute mise en seau. Quand l'IP est illisible : la composante de
clé devient `ip-non-mesuree`, et le nom de l'événement gagne le suffixe
`.ip_non_mesuree`. **On compte quand même.**

**Rationale** :
L'alternative honnête — ne rien compter quand on ne sait pas qui compter —
aurait jeté la **détection** avec l'**attribution**. Sous un débit réel,
l'agrégat franchit le seuil : c'est le seul signal qui subsiste là où aucun
proxy n'est déclaré, c'est-à-dire précisément sur les déploiements les moins
instrumentés. On garde donc la détection, on assume la perte d'attribution, et
on la **dit deux fois** : dans la **clé** (`ip-non-mesuree` ne peut pas se lire
comme une adresse, contrairement à `unknown` qui ressemble à une valeur) et
dans le **nom de l'événement** (série distincte, que personne n'agrège par
mégarde avec la série attribuée). Deux séries qu'aucun tableau de bord ne peut
confondre, ni par clé ni par nom.

La règle générale : **une mesure qu'on ne peut pas attribuer reste une mesure,
à condition qu'elle avoue son défaut d'attribution dans son propre nom.** Le
piège n'est pas de mesurer grossièrement, c'est de rendre un chiffre grossier
sous le nom d'un chiffre fin.

**Consequences** :
- **Seuls `huntStepIp` et `huntRecallIp` passent par ce module.** La vingtaine
  d'autres `observeSharedKey` clés sur l'IP (quiz, calendrier, jackpot,
  fidélité, parrainage, événement, pronostics, skill, play, méta-progression)
  concatènent toujours l'IP brute et retombent dans le seau agrégé. **Écrit
  dans le docstring de `pressionParIp`**, à l'endroit exact où quelqu'un
  croirait tenir une garde transverse — et non seulement ici.
- Les migrer casserait plusieurs gardes **textuelles** existantes
  (`quiz.test.ts`, `calendar.test.ts`, `referral.test.ts` matchent la source à
  la regex) : c'est un chantier à part entière, pas une ligne.
- Le suffixe crée une **seconde série** par compteur migré. Un tableau de bord
  qui ne connaîtrait que la série d'origine deviendrait silencieux hors proxy
  déclaré — c'est le comportement voulu (un zéro attribué **est** vrai), mais
  il faut lire les deux séries pour avoir le total.

**References** :
- ADR-032 (une clé partagée ne porte jamais un REFUS), ADR-073 (le terme moyen :
  elle porte un compteur large et fail-open), ADR-070 (le seau voisin)
- `src/lib/request-ip.ts`, `src/lib/hunt-context.ts`,
  `src/lib/rate-limit.ts` (`huntStepIp`, `huntRecallIp`)

---

## ADR-076 : Le rendu React devient possible en test — mais `node` reste le défaut, et les gardes textuelles restent

**Date** : 2026-08-04
**Statut** : accepté

**Context** :
Douze en-têtes de ce dépôt affirmaient « le projet n'a pas d'environnement de
rendu React », et s'en servaient pour justifier deux pratiques : extraire toute
logique hors des composants (modules purs), et garder le markup par des gardes
**textuelles** qui lisent la source. La phrase était exacte —
`vitest.config.ts` n'incluait que `src/**/*.test.ts` et tournait en
`environment: "node"`. Elle avait une conséquence que personne n'avait écrite :
un test de composant n'y était pas *rouge*, **il n'était pas collecté**.

Le chantier `chantier/echeance-lots` a buté dessus deux fois. `RedeemCodeScreen`
a **deux vues mutuellement exclusives** (code valable / code expiré) et le lien
vers le portefeuille doit être dans les deux : un import unique en tête de
fichier satisfait une garde textuelle même si le lien n'est posé que dans
l'une, et le cas manqué serait le plus utile. Et le champ caché de
`CodeTtlDaysField` — le maillon dont dépendent les deux gardes du chantier —
n'était vérifié par personne, parce que ce qu'il faut mesurer est *ce que le
navigateur enverrait*.

**Decision** :
`happy-dom` + `@testing-library/react`, et `src/**/*.test.tsx` ajouté à
`include`. **`environment: "node"` reste le défaut** : un fichier qui rend un
composant demande le sien par la directive `// @vitest-environment happy-dom`.

**Les gardes textuelles existantes sont CONSERVÉES, sans exception.**

**Rationale** :
Le défaut `node` n'est pas une timidité. Les ~2860 tests de logique n'ont aucun
besoin d'un DOM ; le leur imposer coûterait du temps à chaque exécution, pour
rien. Mesuré : +17 s d'environnement sur la suite, pour trois fichiers de
rendu. Le coût est payé par ceux qui en profitent et par personne d'autre.

Conserver les gardes textuelles n'est pas de la prudence non plus, c'est leur
angle mort qui est le bon : elles **se dérivent du système de fichiers**, donc
elles attrapent l'écran écrit demain que personne n'aura pensé à tester — c'est
exactement ce qui a trouvé les pronostics manquants au chantier précédent. Un
test de rendu ne voit que les composants qu'on a décidé de monter.

Deux d'entre elles gagnent même un motif **plus fort** qu'avant : celles de
`player-wallet-screen.test.ts` ferment des interdits d'**absence** (pas de
jeton dans l'URL, pas de code journalisé, pas de cookie posé), or un rendu ne
prouve jamais qu'une chose n'existe nulle part — seulement qu'elle n'apparaît
pas sur le montage qu'on a choisi.

**La démonstration est chiffrée**, comme ADR-074 l'exige : sabotage retirant le
lien de la **seule** vue expirée, import laissé en place (`grep` : 2 → 1
occurrence). Une garde textuelle sur l'import serait restée **verte**. Le test
de rendu rend **1 rouge / 3 verts**, et le rouge désigne la vue exacte.

**Consequences** :
- Les **quinze** en-têtes de code (plus `docs/architecture.md` et une entrée de
  `docs/bugs.md`) sont corrigés en place — c'est le motif que ce dépôt se
  reproche depuis cinq chantiers (une entrée qui affirme un état dépassé), et
  il se paierait ici à chaque relecture. **Le chiffre a d'abord été annoncé à
  douze, et il était faux** : le recensement passait par `grep … | head -12`,
  et le plafond a été lu comme un total — voir la conséquence suivante.
  **Aucune conclusion n'est annulée** :
  les modules purs restent extraits, pour une raison qui ne dépendait pas de la
  contrainte — une règle se teste sur ses entrées et n'a pas à exiger le
  montage d'un écran.
- Piège mesuré et consigné dans le test : **`textContent` n'est pas le nom
  accessible**. Il concatène tout le DOM, `aria-hidden` compris, que
  l'algorithme accname exclut. Mesurer `textContent` pour parler
  d'accessibilité, c'est mesurer ce qu'un lecteur d'écran n'annonce pas —
  utiliser l'option `name` de `getByRole`, qui passe par le vrai calcul.
- **Occurrence NEUVE du motif « le détecteur ment », et elle ne vient d'aucun
  test** : le recensement des en-têtes à corriger a été fait par
  `grep … | head -12`, et le plafond a rendu exactement douze lignes — lues
  comme un total. Trois fichiers de code et deux documents sont restés faux,
  **publiés comme corrigés** dans un commit, une PR et quatre documents. Ni un
  sabotage qui ne mord pas, ni un détecteur muet : un **plafond d'affichage lu
  comme une mesure**. Rattrapé non par un test mais par une question du
  propriétaire (« il ne reste plus rien ? ») suivie d'un recomptage sans
  plafond, qui a en outre trouvé une variante de formulation
  (`sms-window.ts`, « pas d'environnement de rendu » sans « React ») qu'aucune
  des deux passes précédentes n'aurait vue. **Règle retenue : un compte qu'on
  publie ne se lit jamais sur une sortie tronquée — `wc -l` avant `head`, et
  une recherche de variantes avant de conclure à l'exhaustivité.**
- Trois fichiers de rendu seulement : l'environnement n'est pas une invitation
  à monter tous les écrans. La règle « extraire ce qui se teste » reste la
  première réponse ; le rendu sert aux branches **d'affichage** qu'aucune
  extraction ne peut sortir du composant.

**References** :
- ADR-074 (textuelle vs exécutable — la doctrine, inchangée, addendum du même jour)
- `vitest.config.ts`, `src/components/wheel/claim-form.test.tsx`,
  `src/components/dashboard/code-ttl-days-field.test.tsx`,
  `src/components/wallet/lien-portefeuille.test.tsx`

## ADR-077 : Une règle écrite huit fois n'est pas « à corriger huit fois », c'est une FORME à supprimer — et une frontière d'agent n'est pas une frontière de domaine

**Date** : 2026-08-04
**Statut** : accepté

**Context** :
Le droit effectif d'un module — « ce commerçant peut-il publier ce jeu ? » —
était écrit **huit fois** en TypeScript : six fonctions `has…Access` dans
`src/lib/subscription.ts`, plus `hasQuizAccess` dans `quiz-context.ts` et
`hasReferralAccess` dans `referral-context.ts`.

Le lot P0.2 (migration `20260907120000`) a changé cette règle : « tout add-on
peut être acheté seul » (docs/codex-handoff.md §2) fait qu'un **octroi daté
vivant** ouvre le module sans exiger ni abonnement ni booléen `addon_*`. La
garde SQL `org_has_module_access` porte la nouvelle branche, et **six** des
huit fonctions TypeScript l'ont reçue : exactement celles qui se trouvaient
dans le fichier qu'on avait ouvert.

Les deux autres ne l'ont pas reçue, et leur en-tête disait pourquoi :

> défini LOCALEMENT (le fichier `subscription.ts` relève de l'agent
> stripe-billing, comme pour le parrainage)

Ce n'est pas une frontière technique, c'est une frontière de **répartition du
travail entre agents**. Elle a tenu tant que la règle ne bougeait pas.

Conséquence mesurée avant correction : un commerçant qui achète le seul **Quiz
express** (15 €/7 j au catalogue) ou le seul **Bouche-à-oreille** (12 €/mois)
obtient de Postgres le droit de publier son module, et de l'écran un refus.
Exactement le module qu'il vient de payer, et le seul qu'il ait payé.

**Decision** :
La règle est **retirée des huit** et concentrée dans `droitEffectifModule`,
miroir unique de `org_has_module_access`. Les huit fonctions **restent** —
quelque quatre-vingts appelants les nomment — mais comme **façades sans
règle** : un `return droitEffectifModule("hunts", org, now)`.

Deux propriétés sont confiées au compilateur plutôt qu'à la vigilance :

* `MODULE_ADDON_COLUMN` porte l'association module → colonne `addon_*`, avec
  `wheel: null` **écrit** plutôt qu'absent, pour que `satisfies` oblige à
  constater qu'aucun add-on ne conditionne la roue ;
* `ChampsModule<M>` **calcule depuis cette table** les champs qu'un appelant
  doit fournir. Demander le droit du quiz sans avoir sélectionné `addon_quiz`
  ne compile plus.

La parité avec le SQL n'est pas recopiée mais **lue** : `module-access-parity`
parse le `case p_module` de la migration et le compare à la constante.

**Consequences** :
* Le défaut ne peut plus se reproduire par oubli local : il n'y a plus de lieu
  local. Une règle qui change se corrige à un endroit, ou ne se corrige nulle
  part — et le second cas est visible.
* La classe de défaut « colonne jamais chargée qui se lit `undefined` et se
  comporte comme `false` », déjà payée deux fois sur ce dépôt, est fermée pour
  ce chemin : `tsc` réclame la colonne.
* **Ce que la garde de parité ne prouve pas** : elle lit un **fichier** de
  migration, pas `pg_proc`. Une redéfinition ultérieure de
  `org_has_module_access` passerait inaperçue. Garde textuelle au sens
  d'ADR-074 — elle prouve que les deux déclarations sont d'accord, pas que
  celle-ci est la dernière.
* **Règle générale retenue** : une règle écrite N fois ne se corrige pas N
  fois. On ne corrige jamais que les copies qu'on a sous les yeux, et le
  nombre de copies restantes est précisément ce que personne ne mesure. Le
  geste juste est de supprimer la forme, pas de rattraper l'écart.
* **Corollaire sur l'organisation du travail** : découper le code selon le
  périmètre des agents qui l'écrivent fabrique des frontières qui ne
  correspondent à rien dans le domaine. Un droit de module est **une** question
  et doit avoir **un** lieu de réponse, quel que soit l'agent qui le touche.

**References** :
- ADR-074 (garde textuelle vs comportementale — ce qu'une garde qui lit un
  fichier prouve et ne prouve pas)
- `src/lib/subscription.ts` (`droitEffectifModule`, `MODULE_ADDON_COLUMN`,
  `ChampsModule`), `src/lib/module-access-parity.test.ts`
- migration `20260907120000_p0_lot2_octrois_dates.sql` (`org_has_module_access`)

## ADR-078 : Découvrir, préparer, publier — un seul booléen d'accès faisait payer pour voir ce qu'on achèterait

**Date** : 2026-08-04
**Statut** : accepté

**Context** :
Le cahier partagé (docs/codex-handoff.md §3) demande de « séparer et revalider
partout `canExplore`, `canEditDraft` et `canPublish` ». Aucun des trois
n'existait : le dépôt n'avait qu'un booléen d'accès par module, et il gardait
tout ou rien. Sept pages de module rendaient, sans le droit, **uniquement** une
carte d'offre — pas de liste, pas de formulaire, rien à faire.

Le produit vend pourtant la **publication**, pas la découverte. Avec un booléen
unique, un commerçant ne voit rien avant d'avoir payé, donc ne sait pas ce
qu'il achèterait ; et il ne peut pas préparer son calendrier de l'Avent en
octobre pour ne payer qu'en décembre.

**Decision** :
Trois capacités distinctes, calculées par `capacitesModule` (module pur) :

* **`canExplore`** — ouvert à `owner` et `editor`, toujours. Le caissier est
  refusé **avant** tout calcul de droit : inutile de parler d'achat à quelqu'un
  que l'achat n'ouvrirait pas.
* **`canEditDraft`** — ouvert si le module est payé, sinon borné à **un**
  brouillon par organisation et par module.
* **`canPublish`** — le droit effectif, et lui seul.

`droitEffectif` est une **entrée** de ce module, jamais un calcul : le
recalculer y refabriquerait la seconde source de vérité qu'ADR-077 vient de
supprimer.

Le message est calibré sur l'audience : le propriétaire lit une invitation à
ouvrir le module ; l'éditeur lit « demandez au propriétaire », **sans prix,
sans Stripe, sans abonnement** — il ne peut rien en faire, et le lui montrer
l'envoie chercher un écran qu'il n'a pas le droit d'ouvrir.

**Consequences** :
* **`canPublish` est un calcul d'AFFICHAGE et ne garde rien.** Ce qui empêche
  réellement de publier vit en base depuis le lot P0.1 :
  `assert_module_publish_allowed`, le trigger `guard_module_publication` et les
  révocations de colonne `status` qui ferment le `PATCH` PostgREST direct. Un
  écran évite de proposer un bouton qui échouera ; il ne protège pas.
* **Le quota de brouillon borne une COURTOISIE, pas une recette.** Le
  contourner ne donne qu'un second brouillon, jamais une expérience publiée.
  C'est le motif explicite de son **absence de contrepartie SQL** : neuf
  triggers pour borner un inconvénient seraient un coût sans rapport avec ce
  qu'ils évitent. Il est néanmoins appliqué côté serveur dans les huit actions
  de création — une server action reste POSTable en direct — avec le **même
  calcul** que l'écran, pour qu'une page et son action ne puissent pas répondre
  différemment.
* `brouillonsExistants` est **requis** et non optionnel à zéro : un appelant
  qui l'oublierait obtiendrait `canEditDraft` vrai en toutes circonstances,
  soit le refus le plus permissif possible. Le rendre obligatoire fait échouer
  `tsc` là où un défaut aurait produit un silence.
* Le sens des erreurs est délibéré : le chargeur d'octrois dégrade vers le
  refus (une panne ne doit jamais accorder un module payant), et le compteur de
  brouillons **aussi** — rendre 0 sur panne transformerait une base
  indisponible en quota illimité.
* **Reste ouvert** : les huit contextes **publics** ne renseignent pas
  `live_module_grants`, donc un module ouvert par un octroi seul reste fermé au
  **joueur**. Sans effet tant qu'aucun chemin d'achat ne crée d'octroi ; à
  fermer avec le lot de paiement, faute de quoi la première vente d'add-on
  autonome produira des pages de jeu introuvables.

**References** :
- ADR-077 (le droit effectif, source unique)
- `src/lib/module-capabilities.ts`, `src/lib/module-capabilities-server.ts`,
  `src/lib/quota-brouillons.ts`, `src/lib/module-resources.ts`
- migration `20260905120000_p0_gardes_publication.sql` (ce qui garde vraiment)

---

## ADR-079 : Quand la correction évidente est pire que le défaut, la bonne livraison est une GARDE — et elle se pose là où elle ferme les trois portes

**Date** : 2026-08-05
**Statut** : Accepté — **garde LEVÉE le 2026-08-05 par ADR-081**

> **Ce que cette ADR décrit n'est plus l'état du code.** La garde
> `venteEnLigneOuverte` a été levée le jour même : les deux add-ons mensuels
> sont vendables. Sa section « Ce qu'il faudra pour lever la garde » a été
> exécutée point par point — voir ADR-081.
>
> Le raisonnement reste valable et c'est pourquoi cette ADR n'est pas
> supprimée : il explique pourquoi la correction *évidente* (ignorer le prix
> inconnu) aurait été **pire que le défaut**, et cette conclusion a directement
> dicté la forme de la solution finale — partitionner les prix **avant** toute
> résolution, plutôt que de les faire tolérer par `resolveStripeEntitlements`.
**Contexte** : P0.4, chemin d'achat des add-ons autonomes

### Le constat

Le catalogue vend huit add-ons « achetables seuls » (cahier §2). Six sont des
achats uniques, deux sont mensuels. Le chemin d'achat livré ici les traite tous
de la même façon : `resolveAddonCheckout` rend un `priceId` et un `mode`, et
`modeCheckout` renvoie `subscription` pour les deux mensuels.

Or un `mode: "subscription"` crée chez Stripe un abonnement **séparé** de
l'abonnement principal, et Stripe émet alors `customer.subscription.created`.
Le webhook y résout les prix par `resolveStripeEntitlements`
(`src/lib/stripe.ts:403`), qui ne connaît que les prix d'offre et ceux
d'`ADDON_PRICE_ENV`. Un prix `STRIPE_PRICE_ID_PASS_*` en ressort donc
« inconnu », et la route répond **500** — en boucle, puisque Stripe rejoue trois
jours avant de désactiver le point d'entrée. Ce qui couperait aussi la
synchronisation des abonnements principaux.

### Ce qui rend la décision non triviale

La correction évidente — apprendre à `resolveStripeEntitlements` à ignorer ces
prix — **est pire que le défaut**. `PLANS[0]` est l'offre la moins chère, et la
fonction y retombe quand aucun prix d'offre n'est reconnu :
`apply_stripe_subscription_event_v2` écraserait alors le plan payé de
l'organisation. Un 500 casse un webhook et se voit dans les journaux ; le
déclassement silencieux d'un client à jour de ses paiements ne se voit pas.

S'y ajoute une seconde face. Les termes d'un mensuel posent `ends_at: null`
(`octroi-termes.ts`, délibérément : une fin à trente jours couperait le module
au premier renouvellement) et **rien ne révoque** l'octroi à la résiliation. Le
panneau d'administration cache d'ailleurs le bouton de révocation pour
`source = 'stripe'` (`module-grants-panel.tsx:157`) : la révocation automatique
est le chemin prévu, et elle n'existe pas.

### La décision

**Fermer la vente des deux mensuels, en amont, plutôt que livrer un chemin qui
casse ou un correctif qui corrompt.** `venteEnLigneOuverte` refuse
`recurring-monthly`, et cette seule fonction ferme les trois portes :

1. l'écran ne montre pas de bouton (`addonAchetableEnLigne`) ;
2. l'action refuse si le formulaire est posté à la main
   (`resolveAddonCheckout`) ;
3. donc aucun abonnement de pass n'existe jamais chez Stripe.

Poser la garde dans l'action, ou dans l'écran, en aurait fermé une seule.

**Les six achats uniques ne sont pas concernés** : mode `payment`, aucun
abonnement créé, donc aucun `customer.subscription.*`. Ils sont livrés.

### Ce qu'il faudra pour lever la garde

Isoler le chemin des abonnements autonomes dans le webhook : les **reconnaître**
avant `resolveStripeEntitlements`, ne **pas** les faire passer par la
synchronisation d'abonnement — qui écrirait le plan de l'organisation — et
**révoquer** leur octroi `recurring` sur `customer.subscription.deleted`. Trois
gestes, pas un ; c'est ce qui justifie un lot distinct plutôt qu'un correctif
glissé dans celui-ci.

### Ce que les tests verrouillent

Un test vérifie que **poser le prix en variable d'environnement ne suffit pas**
à ouvrir la vente. Sans lui, la garde se lèverait toute seule le jour où
quelqu'un configure Stripe — c'est-à-dire exactement le jour où le défaut
deviendrait atteignable.

Deux tests d'étanchéité entre les deux familles de variables ont dû être
**basculés de `loyalty` vers `hunts`** : la garde ferme désormais `loyalty`, donc
ils passaient sans plus rien prouver de ce qu'ils annonçaient. Un test qui passe
pour la mauvaise raison est plus coûteux qu'un test absent — il fait croire à
une couverture.

### Conséquences

- Six add-ons sur huit sont vendables ; les deux mensuels affichent
  « écrivez-nous », message qui dit au commerçant quoi **faire** et n'expose pas
  la raison technique.
- La garde est à **un seul endroit**, et le jour du lot d'isolation elle se lève
  là et nulle part ailleurs.
- Aucun produit ni prix Stripe n'est créé (cahier §2, « Bloqué ») : sans
  variable, la page affiche huit options et zéro bouton. Le code est livrable à
  froid.

**References** :
- ADR-078 (découvrir, préparer, publier)
- `src/lib/octroi-checkout.ts` (la garde), `src/lib/octroi-termes.ts` (les
  termes), `src/actions/billing.ts` (l'action)
- `src/lib/stripe.ts:403` (`resolveStripeEntitlements`),
  `src/app/api/stripe/webhook/route.ts:106` (le 500)
- migration `20260908120000_p0_lot4_octroi_par_paiement.sql`

---

## ADR-080 : Deux durées vendues séparément doivent être appliquées séparément — et celle qui manquait ne se voyait pas, parce qu'elle n'avait pas de geste

**Date** : 2026-08-05
**Statut** : Accepté
**Contexte** : P0.4 (suite), activation des pass achetés

### Le constat

Le catalogue vend deux durées distinctes par pass : « 29 € / **30 jours**,
activable dans les **90 jours** » (cahier §2). ADR-079 a livré la seconde —
`activate_by` est posé à l'achat, différencié (90 jours, mais **30** pour la
Soirée en jeu). La première ne l'était pas.

`termesDepuisCatalogue` pose délibérément `starts_at: null` sur un achat
unique : les trente jours payés ne doivent pas s'écouler pendant que le
commerçant rédige ses lots. Mais **rien ne faisait sortir l'octroi de cet
état** — aucune RPC, aucun trigger, aucune action ; seul le back-office posait
`starts_at`, à la main. Or `chargerOctroisVivants` filtre sur
`starts_at is null`.

Cinq add-ons sur six encaissaient donc sans ouvrir le module. Et `activeDays`
(30 / 31 / 7 / 30) comme `preparationDays` + `playHours` (7 j + 24 h)
n'apparaissaient que dans **l'affichage du tarif** — jamais dans un calcul de
fenêtre.

### Ce qui rend le défaut instructif

Il était invisible à toutes les preuves du lot précédent : typecheck, lint,
3121 tests, build, pgTAP. Chaque pièce était correcte **prise séparément** — le
catalogue portait les bonnes durées, le webhook posait les bons termes, l'écran
affichait les bons prix. Ce qui manquait n'était dans aucune pièce : c'était le
**geste** qui les relie.

Une donnée que personne ne lit ne fait rougir aucun test. La seule chose qui
l'aurait attrapée est la question qu'a posée le propriétaire : *où va cette
valeur ?* — et elle n'allait nulle part.

### La décision

**Un bouton explicite « Démarrer », et non un démarrage à la publication.**

L'alternative était d'activer l'octroi quand le commerçant publie sa chasse ou
son quiz : un geste de moins. Écartée — le compteur partirait sur une
publication faite « pour voir », et il n'existe aucun retour en arrière sur une
durée payée. Le §2 dit « activable dans les 90 jours », ce qui décrit un geste
délibéré, pas un effet de bord.

Corollaire retenu : **le bouton annonce la date de fin avant le clic**. Démarrer
est irréversible ; sans cette date, un commerçant lance son Quiz express de sept
jours trois semaines trop tôt et ne le découvre qu'une fois la fenêtre passée.

### Ce qui garde quoi

- **La RPC** (`service_role`, comme `grant_module_from_payment`) porte le
  cloisonnement **dans son `where`** et non dans un contrôle après coup : un
  identifiant d'octroi trouvé dans un journal ne **désigne** rien chez un autre
  commerçant, au lieu d'être lu puis refusé.
- **Le trigger de gel du lot 2 avait anticipé ce geste** — « passer de null à
  une valeur est l'acte d'achat/de démarrage, et doit rester possible ». La
  double activation est donc impossible **en base**, indépendamment de la RPC.
  On rend malgré tout un verdict plutôt qu'une exception : l'appelant est un
  écran, et « ce pass a déjà démarré » n'est pas une panne.
- **Le module est relu en base, jamais posté.** C'est lui qui décide de la
  durée : le laisser transiter par le navigateur permettrait de démarrer une
  Chasse de trente jours en déclarant un Calendrier de trente-et-un.

### Conséquences

- Les six add-ons vendables ouvrent réellement leur module, et pour la durée
  exacte du catalogue — vérifié une par une : 30, 31, 7, 30 jours, et **8 jours**
  pour la Soirée en jeu (7 de préparation + 24 h de jeu).
- Un pass dont la fenêtre d'activation est passée n'est **pas affiché** avec un
  bouton grisé : il est exclu par le chargeur. Ce qui est proposé est ce qui
  aboutit.
- Reste hors périmètre : `ends_at` n'est pas gelé par le trigger du lot 2 (seuls
  `capacity` et `starts_at` le sont). Aucun chemin applicatif ne le modifie
  aujourd'hui, mais rien ne l'interdirait.

**References** :
- ADR-079 (la garde des mensuels), ADR-078
- `src/lib/octroi-termes.ts` (`termesActivation`),
  `src/lib/module-grants-loader.ts` (`chargerOctroisEnAttente`),
  `src/actions/billing.ts` (`activateAddonGrant`)
- migration `20260909120000_p0_lot4_activation_octroi.sql`,
  `supabase/tests/module_grant_activation.test.sql`

---

## ADR-081 : Une règle produit peut supprimer une colonne — « un seul actif » a remplacé la traçabilité qu'on croyait devoir écrire

**Date** : 2026-08-05
**Statut** : Accepté
**Contexte** : P0.5, ouverture des deux add-ons mensuels

### Le problème tel qu'il se présentait

ADR-079 avait fermé la vente des `recurring-monthly` et listé trois gestes pour
la rouvrir. Une exploration en a trouvé un quatrième, plus coûteux : **rien ne
permettait de savoir quel octroi révoquer.**

`grant_module_from_payment` écrit `source_reference = ` l'identifiant de la
**session de checkout**. À `customer.subscription.deleted`, le webhook ne dispose
que de l'identifiant d'**abonnement**. Et rien n'interdisait deux achats
successifs du même mensuel : l'index d'idempotence porte sur
`(organization_id, source_reference)`, et deux sessions distinctes ne se
heurtent pas. Un commerçant dont le webhook tarde, qui rachète, se retrouvait
avec deux abonnements prélevés et deux octrois indiscernables.

Les trois issues étaient toutes mauvaises : révoquer au hasard ferme une fois sur
deux le module encore payé ; tout révoquer coupe un service prélevé
indéfiniment ; ne rien révoquer laisse vivant un octroi sans terme. Et aucun
rattrapage n'existe — le back-office refuse de toucher un octroi `source =
'stripe'`.

La solution technique évidente était d'ajouter une colonne pour l'identifiant
d'abonnement, plus une migration, plus un index.

### La décision, et elle est produit

**Le propriétaire a tranché : un commerçant ne peut pas racheter un add-on
mensuel qu'il a déjà actif.**

Cette règle **supprime le problème au lieu de le tracer**. Si un seul octroi
`recurring` vivant peut exister par `(organisation, module)`, alors ce couple
*est* la clé : la révocation devient non ambiguë sans qu'aucun identifiant
Stripe n'ait besoin d'être persisté. La colonne, sa migration et son index
disparaissent du plan.

C'est le point à retenir au-delà de ce lot : **une contrainte produit bien
choisie coûte moins cher qu'une traçabilité générale**, et il vaut la peine de
poser la question au propriétaire avant d'écrire le schéma qui contourne son
absence.

### Ce qui garde quoi

- **L'index unique partiel est la garde réelle**, pas le refus côté action.
  Entre la vérification de l'action et l'écriture du webhook, un double clic
  ouvre une fenêtre où deux sessions de paiement partent. Le prédicat est
  **immuable** (`kind = 'recurring' and revoked_at is null and ends_at is null`)
  — pas de `now()`, qu'un index ne peut pas porter : c'est la projection
  intemporelle de « vivant » pour un récurrent, dont les termes posent
  `starts_at` à l'achat et `ends_at: null` par construction.
- **Le refus au checkout reste, mais comme confort** : il dit au commerçant
  « vous l'avez déjà » plutôt que de le laisser aller jusqu'à Stripe pour se
  faire refuser après avoir sorti sa carte.
- **Une troisième issue à `grant_module_from_payment`.** L'index aurait fait
  lever la RPC sur `unique_violation`, donc 500 en boucle sur un conflit
  *définitif* que Stripe rejouerait sans fin. Elle rattrape la violation **par
  son `constraint_name`** (tout autre nom est relevé, pour ne pas avaler un
  conflit qu'on n'a pas prévu) et rend `(null, false)` — refus de cumul,
  distinct du rejeu `(id, false)`.
- **La partition précède la résolution.** `partitionnerPrix` sépare les prix de
  pass des prix d'offre **avant** `resolveStripeEntitlements`. C'est la
  conclusion directe d'ADR-079 : faire *tolérer* le prix inconnu à cette
  fonction l'aurait fait retomber sur `PLANS[0]` et écraser le plan payé.
- **Le chemin de pass ne CRÉE aucun octroi**, il ne fait que refermer. La
  création reste à `checkout.session.completed`, comme pour les six achats
  uniques — deux créateurs auraient posé deux octrois pour un seul paiement.

### Ce que le lot ne ferme pas, écrit et non arrondi

- **La vente n'est pas ouverte en pratique** : `STRIPE_PRICE_ID_PASS_LOYALTY` et
  `_REFERRAL` doivent être posées. La levée de garde est nécessaire, pas
  suffisante — geste du propriétaire.
- **Un mensuel `past_due` reste ouvert** jusqu'à l'annulation Stripe.
  Délibéré : même grâce que l'abonnement principal.
- **Le back-office** rend un message opaque quand un admin crée un récurrent qui
  doublerait un vivant. Hors périmètre, à traiter.
- **L'index couvre les deux sources** (`stripe` et back-office), mais la
  **révocation filtre `source = 'stripe'`** — sinon une résiliation Stripe
  refermerait un accès offert à la main par le propriétaire.

**References** :
- ADR-079 (la garde, désormais levée), ADR-080 (l'activation)
- migration `20260910120000_p0_lot5_recurrent_unique.sql`,
  `supabase/tests/module_grant_recurring.test.sql`
- `src/lib/octroi-checkout.ts`, `src/app/api/stripe/webhook/route.ts`,
  `src/actions/billing.ts`

---

## ADR-082 : `DROP FUNCTION` emporte les privilèges — et une fonction `security definer` payante redevient appelable par `anon`

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : P0.6, changement du type de retour de `grant_module_from_payment`

### Ce qui a été constaté

Changer le type de retour d'une fonction Postgres impose `DROP` + `CREATE` —
`CREATE OR REPLACE` échoue explicitement :

```
ERROR: cannot change return type of existing function
DETAIL: Row type defined by OUT parameters is different
HINT: Use DROP FUNCTION … first
```

**Ce que la documentation ne met pas en avant, et qui coûte cher** : le `DROP`
emporte aussi les `GRANT`/`REVOKE`. Après le `CREATE`, Postgres réapplique son
défaut — `EXECUTE` accordé à `PUBLIC`. Mesuré :
`has_function_privilege('public', …)` repasse à `true`.

`grant_module_from_payment` est `security definer` et **octroie des modules
payants**. Sans réémission des `REVOKE`, elle redevenait donc appelable par
`anon` : n'importe qui pouvait s'accorder un add-on depuis PostgREST.

### La décision

**Toute migration qui `DROP` une fonction réémet ses `REVOKE` et ses `GRANT`
dans la même migration**, et le pgTAP le vérifie — pas par lecture du fichier,
mais en interrogeant `has_function_privilege` après application.

Le contrôle qui tranche :

```sql
select has_function_privilege('public', p.oid, 'execute')      -- doit être false
```

### Pourquoi la garde vit dans pgTAP et non dans une relecture

Parce que l'oubli est **invisible au diff**. Une migration qui `DROP` puis
`CREATE` se lit comme un remplacement anodin ; rien dans son texte ne signale
que les privilèges viennent de disparaître. Seul un test qui interroge le
catalogue **après** application peut le voir.

C'est la même famille que les gardes dérivées de ce dépôt : ce qui n'est pas
mesuré sur l'objet réel n'est pas prouvé.

### Portée

Cette ADR ne concerne pas que la fonction en cause. **Toute** migration future
qui change une signature — ajout d'un argument, changement de type de retour —
passera par un `DROP`, donc par ce trou. Les révocations ne sont pas un détail
de style : elles font partie de la définition.

**References** :
- migration `20260913120000_p0_octroi_outcome.sql`
- `supabase/tests/module_grant_payment.test.sql`
- ADR-081 (l'index unique dont ce changement de retour dérive)

---

## ADR-083 : Un compteur qui promet plus qu'il ne mesure — et le grain d'un identifiant polymorphe était déjà tranché

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : P0.6, compteur d'ouvertures des QR

### Le nom mentait, et le corriger valait mieux que le justifier

La roue comptait ses « scans » depuis le socle V1 : colonne `qr_codes.scan_count`,
RPC `increment_qr_scan`, route `/api/scan`, composant `ScanBeacon`.

**Le beacon ne compte pas des scans.** Il se déclenche à chaque **chargement de
page** : un rechargement, un retour arrière, un lien partagé par messagerie
incrémentent aussi. Le mot promettait une mesure d'acquisition physique là où le
chiffre mesure des ouvertures.

En généralisant le compteur à huit modules, deux voies s'ouvraient : reproduire
le vocabulaire existant par cohérence, ou nommer ce qui est réellement mesuré.

**Décision : nommer honnêtement.** `open_count`, `module_page_opens`,
`/api/page-opens`, `PageOpenBeacon`, et l'écran dit au commerçant que chaque
chargement compte — « ce n'est donc pas un nombre de visiteurs distincts ».

Le libellé de la roue est corrigé au passage : sa colonne historique reste,
le mot affiché change. **La donnée est livrée, le mensonge non.**

### Le grain de `resource_id` était déjà décidé, et personne ne l'avait lu

La chasse au trésor avait d'abord été écartée du compteur, au motif que « ses
affiches sont par étape » et qu'un compteur unique confondrait des étapes
distinctes. Le motif était juste ; la conclusion, non.

En relisant la migration du compteur, le grain y était : pour `events`,
`resource_id` porte `event_sessions.id` — un **sous-objet** d'`event_games`, et
le commentaire de colonne le nomme. Le grain effectif n'a jamais été « la tête
du module » mais **ce que CE QR désigne**, une ligne par affiche. Une étape de
chasse a exactement cette forme.

Conséquence : **ni colonne ni table ajoutée**. Compter la chasse aurait, lui,
exigé une colonne — pour produire le chiffre dont on venait d'établir qu'il ne
répond pas à la question du commerçant.

**Ce qu'il faut en retenir** : avant d'élargir un schéma pour un cas qu'on croit
particulier, relire ce que le schéma fait déjà des cas voisins. La forme
cherchée y est parfois, sans commentaire qui l'annonce.

### Deux gardes que ce lot a rendues nécessaires

- **La RPC résout l'identifiant public contre la table du module** et ne crée
  rien s'il ne désigne aucune ressource. Sans cela, un POST en boucle avec des
  chaînes aléatoires ferait croître la table depuis Internet — la porte
  `service_role` ne protège pas de ça, puisque c'est le serveur qui appelle.
- **Un test vérifie que le chemin appelé par le beacon existe.** Côté
  `sendBeacon`, le navigateur n'attend pas la réponse : un **404 est
  indiscernable d'un 204**. Un renommage de route pouvait donc tuer le compteur
  en silence — c'est exactement ce que ce lot faisait.

**References** :
- migrations `20260911120000`, `20260912120000`
- `src/app/api/page-opens/route.ts`, `src/components/page-open-beacon.tsx`
- ADR-074 (ce qu'une garde textuelle prouve et ne prouve pas)

## ADR-084 : La classe des champs non rendus est fermée par ses propriétés, pas par sa forme

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : `chantier/formulaires-null-classe`, suite de V1.38/V1.39 et de
l'entrée `docs/bugs.md` qui annonçait à tort la classe close le 2026-08-05.

### Deux modes de panne, et un seul avait été fermé

`FormData.get` rend `null` — pas `undefined` — pour un champ **non rendu**
dans le DOM soumis. Deux schémas y réagissent différemment :
- **Mode bruyant** : un schéma qui n'absorbe pas `null` (`z.string()` sans
  `.nullable()`) rejette avec une erreur Zod. Visible, corrigé au cas par cas
  en V1.38/V1.39.
- **Mode silencieux** : `z.coerce.number()` sans `.nullable()` convertit
  `null` en `0` (`Number(null) === 0`), sans lever d'erreur. Invisible à tout
  grep sur des messages d'erreur, invisible à l'audit précédent qui ne
  cherchait que le rejet.

Mesure faite en ouvrant ce chantier : **26 violations, dont 3 bruyantes et
23 silencieuses.** Le mode silencieux ne frappait que les champs dont la
borne basse descend à 0 : un `min(1)` refusait `null` **par accident**
(0 < 1) — la même faute était muette ou bruyante selon une borne sans rapport
avec elle. Les plus coûteuses : les trois cooldowns anti-rejeu (chasse,
fidélité, jackpot) où 0 est une valeur métier (« anti-partage désactivé ») —
un champ non rendu désarmait la protection en la faisant passer pour un choix
du commerçant ; et `weight` (`prizes.ts`), un lot de poids 0 jamais tiré sans
erreur, ou un barème de pronostics remis à 0.

### Décision

Un point unique, `src/lib/validations/champ-formulaire.ts` (sept primitives :
`texteOptionnel`, `entierOptionnel`, `entierRequis`, `nonRenduVaut`,
`absentSiNonRendu`, `caseACochee`, `nombreRequis`, `videSiNonRendu`), ferme la
classe par ses **propriétés** plutôt que par la forme du code qui l'exprime :
- **Entrée tolérante, sortie inchangée.** Les primitives absorbent `null`
  sans changer le type de sortie exposé à l'appelant, pour ne pas casser les
  types en aval de 62 déclarations sur 12 modules.
- **Un champ requis refuse `null` explicitement — jamais 0 silencieux.**
  Aucune exception : c'est l'invariant qui aurait empêché les 23 conversions
  silencieuses de naître.
- **Ordre impératif : schéma d'abord, appelant ensuite.** Corriger chez
  l'appelant (98 `??`) a déjà démontré son coût en V1.38 — un site avait
  échappé au filet malgré 131 `??`/`formData.has()` déjà posés ailleurs. Le
  schéma est le seul endroit qui ne peut pas être oublié un jour d'ajout.
- **Garde comportementale, pas textuelle.**
  `champ-formulaire-coverage.test.ts` vérifie ce que les schémas **font** —
  deux invariants sur 300+ champs de 24 modules, énumérés depuis les modules
  — jamais leur forme écrite. Une garde textuelle rougit sur un retour à la
  ligne et ne voit ni `.optional()` ni `.default(` : elle n'aurait jamais vu
  le mode silencieux. L'invariant B (requis refuse `null`) n'a aucune
  exclusion ; les 37 exclusions de l'invariant A sont nominatives, motivées,
  et leur mortalité est détectée.
- **JSON-only reste strict.** Les schémas qui valident des blueprints ou des
  payloads de webhook ne reçoivent pas la tolérance : y absorber `null`
  masquerait une corruption de données plutôt qu'un champ de formulaire
  simplement non rendu.

### Conséquences

- 62 déclarations converties, 98 `??` d'appelant supprimés (5 survivent,
  chacun commenté : 4 sur champs obligatoires, 1 où `undefined` ≠ `null` par
  conception).
- **Risque résiduel assumé, non fermé** : un champ **rendu** mais **vidé**
  (`""`) vaut toujours 0 par coercition sur les entiers requis. C'est un
  comportement d'origine, hors de cette classe — le champ a bien été rendu —
  et le changer refuserait des enregistrements aujourd'hui acceptés.
  Documenté dans `nombreRequis` plutôt que corrigé.
- Deux contrôles négatifs joués et restaurés : `.nullable()` retiré →
  invariant A rouge sur `hunts` ; `weight` ramené à `z.coerce.number()` →
  invariant B rouge sur les 3 chemins `prizes`.

**References** :
- `src/lib/validations/champ-formulaire.ts`,
  `src/lib/validations/champ-formulaire-coverage.test.ts`
- roadmap V1.41, `docs/bugs.md` (entrée requalifiée le 2026-08-06)

## ADR-085 : Le dashboard guidé — compteurs honnêtes, relance par blueprint, un état de cycle de vie qui manquait

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : `chantier/dashboard-guide`, cahier §5/§9.3 — création guidée,
Carte de l'Aventure, Relancer une formule, Tableau d'équipe, Centre
d'animation. Migration `20260914120000`.

### Compteurs honnêtes plutôt que prometteurs

Le Centre d'animation affiche des tuiles qui auraient pu enjoliver l'état du
commerce. Décidé : chaque étiquette dit ce qu'elle mesure, pas ce qu'elle
suggère. « QR à tester » devient **« QR jamais scannés »**, parce que le
compteur est un proxy `scan_count = 0` et non une preuve d'absence de test.
« Stocks faibles » ne porte que sur la roue, parce que le seuil de stock
n'existe que sur `prizes` — les autres modules n'ont rien à afficher là, pas
un zéro qui laisserait croire à une vérification faite.

### Le Tableau d'équipe ne dérive jamais un chiffre inventé

`teamTasks` est strictement la projection des actions déjà « prêtes » dans
les modules existants (brouillon publiable, lot en rupture, gain à valider).
Aucun total, aucune moyenne, aucune extrapolation : une ligne du tableau qui
n'a pas de source directe dans une table n'est pas affichée.

### Un cinquième état manquait dans le cycle de vie

Le cahier décrit cinq phases (idée → brouillon → répétition → en cours →
clôturée) pour projeter les états hétérogènes des 8 modules équipés
(referral exclu : pas de statut propre, il vit sous une campagne).
Mesuré en écrivant la projection : un module publié mais pas encore jouable
(programmé, en pause, fenêtre pas ouverte) n'a sa place dans aucune des cinq
— confondu avec « en cours », la Carte aurait affiché « ouverte aux joueurs »
sur une page inatteignable. Décision : un sixième état intermédiaire,
**« prête »**, entre brouillon et en cours. Seul l'événement porte
réellement la répétition (sessions de lobby) ; les autres modules la
traversent sans s'y arrêter.

### Relancer une formule sérialise un blueprint, jamais des données joueur

« Relancer une formule » (6 des 8 kinds — ni campagnes, où Dupliquer existe
déjà, ni jackpot, dont l'économie active n'est pas portable) part d'une
instance publiée et produit un **blueprint** : structure et réglages
seulement, validés par les mêmes schémas `.strict()` que la création. Jamais
de participants, de gains ou de scans — la relance est une remise à blanc,
pas une copie d'historique. Le nom du brouillon créé reste celui de la
source ; seul le blueprint porte « Relance de … », pour que l'origine reste
traçable sans se substituer au nommage du commerçant.

### Une décision corrigée en cours de revue : le discriminant vient du serveur

Le brief initial proposait de reconnaître les relances en rafale par un
discriminant transmis par le client. La revue sécurité a montré que ce choix
supprimait le seul frein anti-création-en-masse : un discriminant fabriqué
côté client se falsifie. Corrigé avant fusion — le discriminant (seau de
10 s par source) est dérivé côté serveur ; le `requestId` client ne sert
plus qu'à l'idempotence de la requête, jamais à la limite de fréquence.

### Une RPC unique plutôt que dix-huit comptages

Le Centre d'animation aurait pu accumuler un appel par module. Décidé :
une RPC unique, `org_animation_center_counts`, security definer,
`is_org_editor` vérifié en premier geste, REVOKE/GRANT réémis après le
`DROP FUNCTION` (ADR-082 appliquée une seconde fois) et prouvés au
catalogue par pgTAP plutôt que supposés tenus par défaut.

**Conséquences** :
- La chasse au trésor et le calendrier avaient chacun un piège que la
  mesure a révélé plutôt que l'hypothèse de départ : dix tables d'émission
  de récompenses et non neuf (le calendrier en porte deux — openings et
  rewards) ; sept familles sur neuf prouvent l'annulation par l'ABSENCE de
  ligne (purge en cascade), `cancelled_at` n'existant que sur les
  participations. Trois exclusions supplémentaires (redeem_code null = tour
  perdant, code null = rupture, reward_type/kind = 'lot') évitaient un
  compteur à 18 quand la caisse en sert 10.
- Les IDs d'options de quiz divergeaient entre `OPTION_ID_PATTERN` et le
  schéma blueprint : un quiz réel aurait été refusé à sa propre relance.
  Corrigé par une renumérotation `o1, o2…` avec remappage de
  `correct_option_id` au moment de la sérialisation.
- `contest_matches` porte deux clés étrangères vers `contests` : l'embed de
  sérialisation doit désambiguïser explicitement, sous peine d'erreur
  PostgREST silencieuse en ambiguïté de jointure.

**References** :
- migration `20260914120000`
- `src/lib/experience-lifecycle.ts`, `src/lib/centre-animation-server.ts`,
  `src/lib/experience-relance.ts`, `src/actions/experience-relance.ts`
- roadmap V1.42, ADR-082 (privilèges emportés par `DROP FUNCTION`)

## ADR-086 : Le Passeport post-jeu est une proposition strictement navigationnelle

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : `chantier/passeport-post-jeu`, cahier §7, point 4 de l'ordre
impératif (§9.4). Après un jeu, proposer au joueur de créer/continuer un
Passeport de fidélité.

### Gagné et perdu, sans distinction

Le cahier dit « après un jeu », pas « après un gain ». Décidé : la carte
s'affiche dans les deux cas — c'est le joueur qui perd qu'on veut le plus
retenir, et une carte réservée aux gagnants aurait exclu la majorité des
parties.

### Un lien, jamais un tampon

« Un lien partagé ne tamponne jamais » est vrai par construction : la carte
`ProposerPasseport` ne fait que naviguer vers `/passeport/<programId>`.
Aucun appel à `record_loyalty_stamp` ne part de ce composant — le tamponnage
reste le monopole du parcours QR de commande (ADR-087) et de la visite en
caisse existante.

### `invitationPasseport` calquée sur `getPlayerProgression`, anti-oracle

L'action publique lit une seule fois, bornée à l'organisation demandée, et
rend au plus `{programId, programName}`. Org inconnue, org sans programme de
fidélité, et module fermé rendent tous les trois le même `null` — aucun des
trois états ne se distingue de l'extérieur (prouvé par test jusqu'au
`Object.keys` de la réponse).

### Un exemplaire par page

Sur les pages qui combinent plusieurs ancrages potentiels (le filleul
gagnant, par exemple), un garde empêche que la carte s'affiche deux fois.
Le parrainage reste au gain seul, sans écran de fin dédié — aucun second
ancrage n'y a été ajouté.

**Conséquences** :
- 8 ancrages couvrent 7 modules (roue/RedeemCodeScreen, quiz, chasse,
  calendrier, jackpot, événement, pronostics) plus les 13 jeux de révélation
  via la plomberie `organizationId` déjà partagée.
- Une organisation sans programme de fidélité actif n'affiche jamais la
  carte — pas de lien mort vers un passeport qui n'existe pas.

**References** :
- `src/actions/invitation-passeport.ts` (ou équivalent), composant
  `ProposerPasseport`
- roadmap V1.43

## ADR-087 : QR de commande unique — usage unique atomique porté par `consumed_at`

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : `chantier/passeport-post-jeu`, cahier §7. Un QR/code unique
par commande de livraison doit créer/continuer le Passeport et ajouter
exactement un tampon, une seule fois. Migrations `20260915120000` et
`20260916120000`.

### Le jeton contourne le cooldown, par décision produit

`record_loyalty_stamp` passait déjà par un cooldown anti-rejeu pour les
visites en caisse. Pour la commande, l'anti-abus retenu est l'**usage
unique** du jeton, pas le cooldown : un client qui passe deux commandes la
même minute doit recevoir deux tampons. Le jeton `p_order_token` contourne
donc explicitement le cooldown existant plutôt que de le partager.

### L'usage unique est atomique, porté par une seule colonne

`update loyalty_order_codes set consumed_at = now() where token = … and
consumed_at is null returning …` : la course entre deux requêtes simultanées
sur le même jeton est tranchée par Postgres, pas par une lecture puis une
écriture applicative. Un jeton déjà consommé rend l'état `order_invalid`,
au même rang que jeton inconnu ou expiré côté réponse publique.

### FK simple, pas composite en cascade — pour ne pas ressusciter à la purge

Une FK composite en `cascade` vers la ligne de récompense aurait, à la purge
RGPD, effacé la ligne de `loyalty_order_codes` et donc **remis `consumed_at`
à zéro à la prochaine relecture** — un jeton dépensé serait redevenu
utilisable après une purge, silencieusement. Choisi : une FK simple `on
delete set null`, avec `consumed_at` comme unique porteur de la règle
d'usage unique — indépendant de ce qui advient de la ligne pointée.

### ADR-082 appliquée frontalement

Le passage de `record_loyalty_stamp` en 5-aires impose un `drop function` +
`create` (changement de signature). Réémission systématique des
`revoke`/`grant` après recréation, vérifiée au catalogue par pgTAP — même
geste que le lot précédent (ADR-082), appliqué ici en connaissance de cause
plutôt que découvert une seconde fois.

### `create or replace` à signature identique préserve l'ACL — le corollaire utile d'ADR-082

Le correctif FAIBLE 3 (purge du `label` sur les codes consommés hors
rétention) ne change pas la signature de la fonction de purge : un simple
`create or replace`, qui **ne** perd **pas** les privilèges, contrairement au
`drop` + `create` d'une signature modifiée. La distinction n'est pas
« migration risquée » contre « migration sûre » en général — c'est
précisément le changement de signature qui déclenche la perte, et rien
d'autre.

### Refus et succès empruntent le même escalier

Un jeton inconnu posait d'abord le défi Turnstile avant toute RPC : un
attaquant distinguait un jeton existant d'un jeton inventé selon qu'un
captcha lui était présenté ou non. Corrigé : la résolution d'identité et le
challenge se déroulent identiquement que le jeton soit valide, expiré,
consommé ou inexistant ; seule la RPC finale distingue les cas, dans une
réponse elle-même uniforme côté page publique.

**Conséquences** :
- Le grain public `/commande/[token]` garde un flou volontaire 404/200
  (bugs.md) — identique à `/hunt`, assumé, non résolu par ce chantier.
- MVP sans péremption ni révocation de jeton (au-delà du delete bloqué en
  FAIBLE 2) ; à reprendre si l'usage réel le demande.

**References** :
- migrations `20260915120000`, `20260916120000`
- `src/lib/loyalty-order-codes.ts` (ou équivalent), `stampLoyaltyOrder`,
  `createLoyaltyOrderCodes`, `src/app/commande/[token]/`
- ADR-082 (privilèges emportés par `DROP FUNCTION`), roadmap V1.43

## ADR-088 : Un conseiller déterministe plutôt qu'une IA facturée

**Date** : 2026-08-06
**Statut** : Accepté
**Contexte** : `chantier/conseiller-gratuit`. Le lot précédent (#123) avait
livré un assistant de création appelant l'API Anthropic au jeton —
`ia-provider`, `ia-assistant`, `ANTHROPIC_API_KEY`, `iaSuggestion`, plus une
3ᵉ source `blueprint` dans `applyCampaignTemplate`. Le propriétaire ne
voulait pas d'IA facturée : il voulait un accompagnement simple, dans le
code, gratuit, pour aiguiller le commerçant vers les actions utiles et les
modules pertinents.

### Retrait complet plutôt que coexistence

L'assistant IA payant est reverté intégralement (commit `be7fdef`) plutôt que
désactivé derrière un flag : une clé API absente qui laisse du code mort
capable de l'appeler est un risque qu'on préfère ne pas porter. Le retrait
est prouvé par `git grep` : plus aucune occurrence de `ia-provider`,
`ia-assistant`, `ANTHROPIC_API_KEY` ou `iaSuggestion` hors documentation.

### Des règles sur des données déjà chargées, pas un nouvel appel

Le conseiller (`src/lib/conseiller-commercant.ts`, fonction pure
`construireConseils`) ne fait ni IO ni réseau : il projette deux sources déjà
en mémoire — les compteurs du Centre d'animation et le catalogue des
modules avec les kinds actifs — en une liste de conseils triés et bornés à
6. Il ne « comprend » rien : il applique des règles fixes, un compteur au-delà
de zéro déclenche une phrase, un module absent des kinds actifs en déclenche
une autre.

### Ton sobre, non commercial — décision explicite du propriétaire

Le conseiller signale, il ne survend pas : « 3 gains à remettre. », « Module
Passeport fidélité disponible (objectif : Fidéliser). » — comptes exacts,
phrases neutres, aucune formule d'incitation. Choix produit assumé, pas une
limitation technique : rien n'empêchait un ton plus commercial, il a été
écarté.

### Zéro RPC en plus — la fonction pure reçoit ce que la page a déjà

La page `/dashboard` charge `chargerCentreAnimation` une seule fois pour
l'AnimationCenter et transmet son résultat directement à
`construireConseils`. Un premier wrapper `chargerConseils` relançait la RPC
pour son propre compte ; la revue sécurité l'a signalé (finding perf), le
correctif l'a fait disparaître, et le wrapper — devenu sans appelant — a été
retiré dans la foulée (commit `66cdd31`), plutôt que laissé en place « au
cas où ».

**Conséquences** :
- Aucun coût par usage, aucune clé, aucune dépendance externe : le
  conseiller fonctionne identiquement en local, en CI et en production.
- Extensible sans coût marginal : ajouter une règle ne consomme ni jeton ni
  quota.
- Ce n'est pas une IA : pas de reformulation, pas d'adaptation au contexte
  au-delà des compteurs et du catalogue déjà modélisés.

**References** :
- `src/lib/conseiller-commercant.ts`, `src/components/dashboard/conseiller-panel.tsx`
- commits `be7fdef` (retrait), `e98f2c7` (conseiller), `dd01c3a` (panneau),
  `2b23414` et `66cdd31` (correctif RPC en double)
- roadmap V1.44

## ADR-089 : Refonte clarté espace commerçant — une question par écran, un vocabulaire unique

**Date** : 2026-08-07
**Statut** : Accepté
**Contexte** : `chantier/clarte-commercant`, PR #125. Demande directe du
propriétaire : l'espace commerçant plus clair, plus ludique, plus simple ; le
commerçant doit savoir immédiatement où il est et quoi faire. Une
cartographie préalable (7 explorateurs parallèles) a chiffré le problème
plutôt que de le décrire : ~31 rectangles bordés sur `/dashboard` pour un
nouveau propriétaire, « gains à remettre » répété 5 fois avec deux calculs
différents, menu à plat de 11 à 18 entrées, aucun wizard dans le dépôt.

### Une seule question par écran

Principe retenu pour la Vue d'ensemble : « je fais quoi maintenant ? » n'a
qu'une réponse visible en premier, portée par un vrai bouton — le hero
« Votre prochaine action » (`src/components/dashboard/prochaine-action.tsx`),
qui absorbe l'ancienne checklist d'onboarding plutôt que de coexister avec
elle. Sept priorités en cascade (démarrage incomplet → gains à remettre →
stock faible → brouillons → QR jamais scannés → aucune animation ouverte →
« Tout roule »), chaque candidate validée par `lienSelonRole` avant d'être
retenue : jamais de lien mort proposé comme la prochaine action.

### Un fait, une seule case

« Gains à remettre » apparaissait 5 fois sur `/dashboard`, avec deux calculs
qui pouvaient diverger. La tuile doublon « Vérifier les participations à
valider » (Tableau d'équipe) est supprimée : Centre d'animation et Tableau
d'équipe fusionnent en une seule section, un compteur unique par fait.

### Vocabulaire unifié — un module, un nom ; un état, un mot

Le libellé du menu (`EXPERIENCE_CATALOG.label`) devient la référence
canonique ; les h1 des pages liste s'alignent dessus. Cinq états d'animation
reçoivent chacun un badge et un libellé uniques dans tout le produit
(`src/components/ui/status-badge.tsx` : Brouillon, Programmée, En pause,
Ouverte aux joueurs, Clôturée) et les verbes de transition sont fixés
(« Ouvrir aux joueurs », « Mettre en pause », « Clôturer », « Repartir de
cette formule ») — remplaçant un mélange d'« Activer », « Archiver »,
« Relancer » qui désignait des actions différentes selon la page.

### Le guidage se distingue visuellement des réglages

Fond `k-yellow`/`k-bg` (palette Kermesse) réservé aux blocs de guidage (hero,
Carte de l'Aventure) ; carte blanche pour le contenu et les réglages. Décision
héritée des gardes existantes du design system, appliquée systématiquement
plutôt que laissée à l'appréciation de chaque page.

### Le « Bravo » conditionné remplace l'inconditionnel — écarté sur preuve

`experience-lifecycle.ts` affichait « Bravo, votre animation est prête à être
partagée ! » dès qu'une animation quittait l'état brouillon, y compris
**en pause** ou programmée — un bug prouvé, pas une supposition. La version
inconditionnelle est remplacée par une lecture du vrai statut : le bravo
n'apparaît que si l'animation est réellement ouverte aux joueurs ; en pause
ou programmée, l'étape affiche la situation exacte (« Programmée — ouvrira le
J » / « En pause — vos clients ne peuvent pas jouer pour le moment »).
Alternative écartée : garder le message générique et corriger seulement le
cas pause — rejetée parce que la même classe d'erreur (un message qui ne lit
pas le vrai statut) aurait pu se reproduire ailleurs sur le même composant.

### Token de contraste `--color-k-orange-text`, trouvé par le scan axe en CI

L'ajout d'un scan `expectNoA11yViolations` au test owner de
`e2e/dashboard-home.spec.ts` (peu coûteux, un test déjà lancé) a fait
remonter de vraies violations de contraste sur le petit texte orange
(sur-titres, marqueurs « → », titres de groupe du menu). Corrigé à la racine
par un token unique `--color-k-orange-text: #b45309` (4.66:1 sur fond crème,
5.02:1 sur fond blanc, calculés) plutôt qu'au cas par cas sur chaque
occurrence — la même classe de défaut ne peut plus se reproduire par simple
oubli d'un composant.

**Conséquences** :
- Aucune migration, aucune route API, aucune action serveur touchée : le
  chantier est entièrement `src/components/` et `src/lib/experience-lifecycle.ts`.
- PR #125 reste ouverte vers `main`, fusion en attente d'une décision du
  propriétaire — la CI complète est verte sur `f0ba41d` (E2E Chromium+WebKit,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit npm).
- Hors périmètre assumé : vrai wizard de création multi-écrans, unification
  des 9 cartes de caisse, généralisation de `PageHeader` aux pages détail
  (consigné en roadmap V1.45 et docs/bugs.md).

**References** :
- `src/components/dashboard/prochaine-action.tsx`, `-state.ts`,
  `src/components/ui/status-badge.tsx`, `src/components/ui/page-header.tsx`,
  `src/lib/experience-lifecycle.ts`
- commits `349ab27`, `92a4223`, `62b41b4`, `57cd55e`, `e1ad5af`, `5be9f57`,
  `9aa56aa`, `5568f57`, `f0ba41d`
- roadmap V1.45, PR #125

## ADR-090 : L'Atelier du jeu — un wizard sur la route existante, jamais de champ reposté en hidden

**Date** : 2026-08-07
**Statut** : Accepté
**Contexte** : `chantier/assistant-creation`, PR #126. Demande propriétaire :
un accompagnement de création en étapes, guidé et déterministe, sans IA — la
suite de la clôture de la refonte clarté V1.45. Un diagnostic préalable (5
explorateurs) a chiffré la page `/dashboard/campaigns/[id]/wheel` : 102
contrôles interactifs simultanés, 6 actions d'écriture réparties sur 12
boutons Enregistrer sans état global, « Ouvrir aux joueurs » sans
précondition métier (une campagne sans lot tirable pouvait être publiée), 13
mécaniques sur 15 recevant des réglages de roue sans effet visible, aucune
spec E2E ni scan axe sur cette page.

### Le wizard vit sur la route existante, pas une nouvelle

`/dashboard/campaigns/[id]/wheel` devient l'Atelier ; l'étape choisie est un
paramètre `?etape=` sur la MÊME URL, le `?wheel=` multi-roues préservé.
Raison directe : 6 `revalidatePath(…/wheel)` dans `src/actions/prizes.ts` et
3 appelants de cette URL restent valides sans un seul changement — une
nouvelle route aurait cassé silencieusement `revalidate-coverage.test.ts` et
toute page qui pointe vers l'atelier.

### Une étape = un POST complet d'une action existante, jamais un champ en hidden

Zéro nouvelle action serveur, zéro nouveau module de validations. Chaque
étape mappe une action déjà en production (`updateWheel`, `addPrize` /
`updatePrize` / `deletePrize`, `updateWheelStyle`, `updateWheelSchedule`) et
la soumet **complète**. Alternative écartée : reposter en champ caché ce
qu'une autre étape a déjà réglé — c'est la classe de défaut « champ non
rendu, valeur perdue au submit suivant » que le dépôt documente déjà
ailleurs. C'est pourquoi la mécanique, les réglages du défi et la limite de
jeu restent dans une seule et même étape : `updateWheel` exige les trois
ensemble.

### La publication reste hors de l'Atelier — un seul endroit publie

L'étape Vérification n'a pas de bouton « Ouvrir aux joueurs » : elle calcule
une checklist pure (mécanique choisie, lot gagnant tirable au miroir de
`perform_atomic_spin`, poids total > 0, QR existant, fenêtre via
`campaignWindowState` importé — jamais recopié) et renvoie, si tout est vert,
vers `/dashboard/campaigns/<id>#statut`, la position unifiée par la refonte
clarté V1.45. La garde métier réelle (le trou reste POSTable en direct sur
`set_campaign_status`) est un arbitrage de base non tranché ici, consigné
dans `docs/bugs.md`.

### Catalogue de mécaniques et calcul de part unique

Le catalogue des 15 mécaniques et le calcul `partSur10` existaient en trois
copies divergentes (roue, éditeur de lots, prévisualisations) ; extraits en
modules purs testés et partagés par l'étape Lots et l'étape Vérification —
la même classe de défaut (deux calculs pour un seul fait) que la refonte
clarté avait déjà fermée sur « gains à remettre ».

**Conséquences** :
- Aucune migration, aucune route API, aucune RLS, aucun webhook ni token
  touchés : revue sécurité dédiée jugée non requise pour ce lot, seule la
  cible d'un redirect interne change (`createCampaign` → l'Atelier au lieu
  du détail).
- Nouvelle spec `e2e/wheel-wizard.spec.ts` (8 tests, premier scan axe de
  cette page) a débusqué 13 violations d'accessibilité réelles préexistantes
  (contrastes, selects/case/curseur sans nom accessible), corrigées à la
  racine plutôt que contournées dans le test.
- PR #126 reste ouverte vers `main`, fusion en attente d'une décision du
  propriétaire (comme PR #125) — CI complète verte sur `0faa05a`.
- Hors périmètre assumé : préconditions de publication en base, toggle
  `is_active` / réordonnancement des segments, quota brouillon sur
  `applyCampaignTemplate` (consigné en roadmap V1.46 et `docs/bugs.md`).

**References** :
- `src/app/dashboard/campaigns/[id]/wheel/page.tsx`,
  `src/components/dashboard/atelier-verification-state.ts`
- commits `d009bf6`, `7b19ee1`, `2682708`, `146aed1`, `0faa05a`
- roadmap V1.46, PR #126

## ADR-091 : L'Atelier partout — le patron des deux visages généralisé à 7 modules

**Date** : 2026-08-07
**Statut** : Accepté
**Contexte** : `chantier/atelier-modules`, PR #127. Ordre propriétaire après
fusion de V1.46 : « fais l'extension du modèle atelier aux autres modules de
création ». Cartographie préalable (5 explorateurs, une fiche par module)
pour découper quiz, calendrier de l'Avent, chasse au trésor, passeport de
fidélité, jackpot collectif, événement live et pronostics selon le même
patron que la roue.

### Le patron des deux visages, jamais de sous-route

Chaque route détail existante garde une seule URL, à deux lectures : sans
`?etape=`, la vue **suivi** (en-tête, Carte de l'Aventure, carte Statut,
blocs de suivi, carte de relance, et une carte d'entrée d'Atelier listant
les étapes) ; avec `?etape=<clé>`, le mode **atelier** (stepper + carte de
l'étape + navigation précédent/suivant + retour au suivi). Raison directe,
identique à celle de V1.46 : les ~90 `revalidatePath` par module visent la
page détail nue, et `revalidate-coverage.test.ts` ignore la query — une
sous-route aurait cassé cette couverture en silence. La Carte de l'Aventure
pointe désormais `liens.editeur` vers `?etape=<clé-réglages>` ; `liens.suivi`,
statut et relance restent des ancres de la vue par défaut : jamais d'ancre
morte.

### Les étapes sont calées sur la sémantique des sauvegardes existantes

Une étape = un POST complet d'une action déjà en production, jamais un champ
d'une autre étape reposté en hidden — la même règle que l'ADR-090. Les cinq
cartes Réglages monolithiques (`updateQuiz`, `updateCalendar`, `updateHunt`,
`updateLoyaltyProgram`, `updateJackpotCampaign`) restent chacune une étape
indivisible : aucun schéma n'a été assoupli pour l'occasion (consigné en
dette dans `docs/bugs.md`, pas résolu ici). Le jackpot est le seul module au
stepper adaptatif (2 ou 3 étapes selon `validation_mode` : l'écran comptoir
ne s'affiche que dans le mode qui le produit) ; les gestes d'exploitation
(le tirage définitif du quiz, la clôture des pronostics) restent hors du
fil de préparation, dans la vue suivi.

### Vérification = modules purs à double consommation

Chaque précondition privée de publication (`activationBlocker` de quiz.ts,
calendar.ts, jackpot.ts ; blocs inline de hunts.ts, loyalty.ts, events.ts)
est extraite dans `src/lib/activation/<module>.ts`, pure et testée,
consommée à la fois par l'action serveur et par l'étape « La vérification »
— une seule vérité, sur le modèle de `atelier-verification-state.ts`
important `campaignWindowState` en V1.46 plutôt que de le recopier.
Pronostics est le cas limite : aucune précondition n'existe côté serveur
(un championnat sans match ni récompense reste publiable), donc son étape de
vérification ne fait que RACONTER l'état — matchs, questions, récompenses,
échéances — sans rien bloquer ; la garde en base reste une dette ouverte
(`docs/bugs.md`).

### Un invariant découvert en écrivant le filet E2E

`e2e/atelier-modules.spec.ts` a tenté de fabriquer une case de calendrier
« incomplète » en éditant `day_count` à la hausse après coup, pour tester le
message de vérification qui nomme la case fautive. Le serveur refuse ce
geste (`refusCase`) : une case du calendrier ne peut PAS devenir invalide
par édition — invariant jusqu'ici non documenté, désormais couvert par le
test qui l'a débusqué plutôt que contourné.

**Conséquences** :
- Cinq bugs vivants fermés au passage : l'effacement silencieux de
  `default_locks_at` des pronostics (hidden non pré-rempli), cinq 404
  injustifiés sur le droit payé (via `capacitesDuModule` +
  `ModuleCapabilityNotice`), deux ancres `#reglages` menteuses, l'écran
  comptoir jackpot affiché hors de son mode.
- `e2e/pronostics.spec.ts` et `e2e/referral.spec.ts` restent vertes sans
  modification — critère d'acceptation de la vue par défaut, comme
  `e2e/wheel-wizard.spec.ts` pour la roue.
- Revue sécurité dédiée : GO, 0 critique/élevé/moyen. L'élargissement
  d'accès des pages détail ne change que « qui voit sa propre donnée » ; la
  publication reste verrouillée en base via `assert_module_publish_allowed`
  (inchangé par ce chantier) ; 2 INFO corrigées avant fusion (dont la
  généralisation `createLoyaltyOrderCodes`), 2 INFO consignées en suivi.
- PR #127 ouverte vers `main`, fusion en attente d'une décision du
  propriétaire (comme #125 et #126) — CI complète verte sur `93319ea`.
- Hors périmètre assumé : assouplissement des cinq schémas monolithiques en
  partiel, garde de publication en base pour les modules qui n'en ont
  aucune (pronostics), fusion des 3 formulaires `updateContest`, écriture de
  questions de pronostics (INSERT-only), leaderboard quiz non lu par la
  vue suivi (consigné en roadmap V1.47 et `docs/bugs.md`).

**References** :
- `src/lib/activation/` (7 modules + `controle.ts`),
  `src/components/dashboard/atelier-etapes.ts`,
  `e2e/atelier-modules.spec.ts`
- commits `3390c63`, `1cd2595`, `fe79eeb`, `fde377c`, `3160e61`, `573270b`,
  `cd7648b`, `fbbe7e2`, `76341d4`, `93319ea`
- roadmap V1.47, PR #127

## ADR-092 : Clarté dashboard — rappels fermables par liste blanche de préfixes, cartes repliables sans `<details>`

**Date** : 2026-08-07
**Statut** : Accepté
**Contexte** : `chantier/apparence-dashboard`, PR à ouvrir. Demande
propriétaire du jour : améliorer l'apparence et la clarté du dashboard (7
points), sans migration. Deux mécanismes transverses introduits au passage
méritent d'être fixés comme patron plutôt que redécouverts au prochain
bandeau ou à la prochaine carte repliable.

### Rappels fermables : liste blanche de préfixes de clé, jamais une liste noire

Les bandeaux d'accueil (« Accès offert », « Essai gratuit », le Conseiller)
deviennent fermables par un cookie posé via `src/actions/rappels.ts`, lu côté
serveur dans `src/app/dashboard/layout.tsx` (zéro flash : pas de rendu suivi
d'un retrait client). Les 3 bandeaux bloquants (incident de paiement,
abonnement inactif, essai terminé) doivent rester impossibles à fermer même
si un futur composant improvise une nouvelle clé de cookie. Alternative
écartée : une liste noire de clés interdites — elle protège tant que
personne n'oublie d'y ajouter la nouvelle clé bloquante, et l'oubli est
silencieux (le bandeau se fermerait sans erreur). Retenu : une **liste
blanche de préfixes de clé** acceptés par `src/lib/rappels.ts`, testée ; une
clé bloquante non listée est refusée par construction, pas par vigilance.
Conséquence directe : le cookie est borné au path `/dashboard` (ne part pas
sur le trafic joueur) et purgé au logout — préférence de rappel par
navigateur et non par utilisateur, assumé, borné par cette purge (voir
`docs/bugs.md`).

### Cartes repliables : composant client à `aria-expanded`, jamais `<details>`/`<summary>`

`CarteRepliable` (6 blocs secondaires de la page détail campagne) est un
composant client avec un bouton `aria-expanded`, pas l'élément HTML natif
`<details>`. Raison mesurée, pas stylistique : Chromium retire le rôle
`heading` aux titres qui descendent d'un `<summary>`, ce qui aurait cassé
les locators E2E fondés sur le rôle (`getByRole("heading", …)`) dans tout
bloc replié par défaut. Les 6 blocs restent ouverts par défaut précisément
pour ne pas changer ce que les specs existantes trouvent ; l'état de repli
n'est pas persisté (perdu à la navigation), comme l'aurait été un
`<details>` natif — ce choix n'ajoute donc pas de régression de confort par
rapport à l'alternative écartée, seulement l'accessibilité du titre.

**Conséquences** :
- `src/lib/rappels.ts` (pur, testé) fixe la liste blanche de préfixes ;
  toute nouvelle clé de rappel fermable doit matcher un préfixe listé,
  toute clé bloquante doit explicitement ne pas en avoir.
- Revue sécurité dédiée avant PR : GO, 0 critique/élevé ; 2 MOYEN corrigés
  (liste blanche de préfixes, garde de rôle sur les 3 actions QR mutantes
  ajoutées à la même page) ; 4 INFO, dont 2 corrigées (cookie borné au path,
  purge au logout) et 2 documentées sans action (ombrage de cookie —
  nécessite XSS —, absence de rate-limit — conforme au pattern des actions
  dashboard).
- `CarteRepliable` est réutilisable pour toute prochaine page détail qui
  voudrait replier des blocs secondaires ; ne pas réintroduire `<details>`
  sur une page portant des locators E2E par rôle.

**References** :
- `src/lib/rappels.ts`, `src/lib/rappels.test.ts`, `src/actions/rappels.ts`,
  `src/components/dashboard/rappel-fermable.tsx`
- `src/components/dashboard/carte-repliable.tsx`,
  `src/components/dashboard/carte-repliable.test.tsx`
- commits `eaf50a2`, `dabf9ec`, `18dddd1`, `4b77353`, `1cb13a5`

## ADR-093 : Fonds thématiques cartoon — décors par tables de tokens pures, enum saisonnière partagée

**Date** : 2026-08-07
**Statut** : Accepté
**Contexte** : `chantier/themes-cartoon`. Demande propriétaire : quand un
thème est choisi (Noël, Saint-Valentin…), le fond doit suivre — remplacer
les lignes fades par des décors cartoon, sur toutes les surfaces et aussi
pour les pronostics, qui n'avaient encore aucun thème.

### Une seule palette saisonnière, pas deux

`contests.theme` reçoit exactement les six clés de `calendars.theme`
(`neutre`, `noel`, `saint_valentin`, `anniversaire`, `soldes`, `festival`),
et non un vocabulaire propre : deux énumérations pour la même idée
obligeraient chaque écran à savoir laquelle il regarde, et la première clé
ajoutée d'un côté manquerait de l'autre. Le quiz ne change pas — ses clés
(`gourmand`, `degustation`, `culture`) nomment un usage métier, pas une
saison, et restent hors de cette enum. `src/lib/seasonal-theme.ts` devient
la source unique côté application (repli neutre en lecture, refus en
saisie) ; `lib/calendar.ts` la consomme au lieu de sa copie locale.

### Optionnel-préservant, pas optionnel-effaçant

`updateContest` traite `theme` comme les autres primitives champ-formulaire :
absent du `FormData`, la colonne n'est pas touchée. La classe de bug
`default_locks_at` (un champ hidden non pré-rempli qui efface une valeur en
base sur un simple no-op) ne peut donc pas se reproduire avec ce champ,
pour les 3 formulaires qui postent ce schéma. La garantie porte sur
l'absence, pas sur le vide : `""` reste refusé par l'enum, à savoir avant
d'écrire un 4e formulaire.

### Décors par tables de tokens pures, un seul composant

**Retiré en V1.54 (2026-08-09)** : `ThemeDecor` a été entièrement supprimé
sur décision explicite du propriétaire, les fonds image de V1.53 rendant les
motifs cartoon redondants — voir ADR-099. Le paragraphe qui suit décrit ce
qui a existé entre le 2026-08-07 et le 2026-08-09.

`ThemeDecor` peint 16 scènes cartoon (28 motifs, facture contour encre /
aplats pastel) à partir de tables de tokens pures et testées
(`contest-theme.ts` sur le patron de `calendar-theme.ts` / `quiz-theme.ts`),
avec 13 emplacements déterministes — zéro `Math.random`, zéro id SVG —
pour ne jamais collisionner quand plusieurs vignettes cohabitent sur un
même écran. `PlayerPageShell` factorise les 4 shells joueur (quiz,
calendrier, pronostics, récupération) qui recopiaient chacun le bandeau
kermesse en ligne. Les aperçus éditeurs (calendrier, quiz, roue) rendent le
même composant que le joueur : l'aperçu reste ce que verront les clients.

**Conséquences** :
- CHECK du calendrier élargi à `saint_valentin` (contrainte nommée à part
  pour les pronostics, contrainte en ligne héritée pour le calendrier —
  lives_ok garde le point que le drop a bien atteint sa cible).
- Revue sécurité dédiée : GO, 0 critique/élevé/moyen/faible, 4 INFO. INFO-1
  (clé héritée du prototype rendant le repli neutre inopérant) corrigée
  avant fusion sur les 3 tables de tokens. 3 INFO en suivi dans
  `docs/bugs.md` : ordre de déploiement migration→build (sinon le select
  public de `/pronos` échoue en 42703 le temps de la promotion), parité
  palette SQL↔TS jamais testée entre les deux côtés, portée exacte de
  l'optionnel-préservant.
- Hors périmètre assumé : le quiz garde ses 7 thèmes d'usage sans saison ;
  `/play` en branche nuit reste sans décor (dégradé libre du commerçant) ;
  le mode TV pronostics reste neutre.

**References** :
- `supabase/migrations/20260917120000_themes_saisonniers.sql`,
  `supabase/tests/themes_saisonniers.test.sql`
- `src/lib/seasonal-theme.ts`, `src/components/pronos/contest-theme.ts`,
  `src/components/ui/player-page-shell.tsx`
- commits `030265c`, `7286746`, `cce05a6`, `e8a1f89`
- roadmap V1.48

## ADR-094 : Invitation avant-jeu — non bloquante par construction, liens à l'établissement, activation à la campagne

**Date** : 2026-08-08
**Statut** : Accepté
**Contexte** : `chantier/retours-proprietaire`. Retour propriétaire — proposer
au joueur de noter la page Google ou de suivre Instagram/TikTok de
l'établissement avant un jeu instantané. Une mécanique voisine avait déjà
existé en **porte obligatoire** et avait été retirée pour cela : la nouvelle
demande devait donc être structurellement différente, pas juste redésactivée
par défaut.

### Non bloquante par construction, pas par réglage

Le bouton « Continuer vers le jeu » n'est placé dans aucune branche
conditionnelle et n'est jamais désactivé : ce n'est pas un choix de
configuration qui pourrait être renversé plus tard par un commerçant pressé,
c'est une propriété du composant, verrouillée par un test E2E dédié. La leçon
de la porte précédente était précisément qu'un interrupteur peut être mis en
mode bloquant ; ici l'état bloquant n'existe simplement pas dans le code.

### Liens à l'établissement, activation à la campagne

Les trois URLs (Google, Instagram, TikTok) sont posées une fois par
organisation, pas répétées par campagne : elles ne changent pas d'une
campagne à l'autre et une saisie par campagne aurait multiplié les occasions
de lien mort ou de faute de frappe. L'activation, elle, est bien par
campagne (booléen) : un commerçant peut vouloir la carte sur sa roue de Noël
et pas sur son quiz permanent. Grant SELECT public sans droit d'update : la
lecture publique ne peut pas devenir un vecteur d'écriture.

### Liste blanche d'hôtes bornée au chemin, pas au suffixe

Une whitelist par suffixe de domaine (`*.google.com`) aurait laissé passer
`sites.google.com` et les redirecteurs `/url` et `/amp` — un lien de
confiance affiché au joueur pointant en réalité ailleurs. La revue sécurité
dédiée (MOYEN, fermé avant fusion) a resserré la liste aux hôtes **exacts**
et aux préfixes de **chemin** attendus (`writereview`, `maps`,
`maps.app.goo.gl`, `g.page`), retiré `g.co` (raccourcisseur générique,
destination non prévisible) et refusé tout port explicite dans l'URL.

**Conséquences** :
- Nettoyage de la porte bloquante précédente : `updateCampaignEngagement`,
  `lib/engagement`, la carte de réglages orpheline et `_engagementInput`
  supprimés ; la FAQ du site cesse de promettre une mécanique éteinte.
- Contexte public (`/pronos`, `/play`, etc.) : les 3 URLs sont revalidées à
  la **lecture** contre la liste blanche courante, jamais servies telles
  quelles depuis la base — une valeur enregistrée avant un resserrement de
  la liste cesse d'être exposée plutôt que de fuiter.
- La revue a également fermé 2 INFO (schéma mort supprimé, `reportError`
  posé) et documenté sans y toucher : le parse qui précède la garde dans ce
  fichier (patron déjà en place ailleurs), et une dette préexistante
  (`TRUNCATE` table-level hérité de la migration `00018`, hors périmètre de
  ce chantier).

**References** :
- `supabase/migrations/20260918120000_invitation_prejeu.sql`
- `src/lib/prejeu-invitation.ts` (nom indicatif), carte réglages
  « Notez-nous, suivez-nous »
- commits `f7a5d3a`, `9d69f58`, `5868b13`, `05345ff`
- roadmap V1.50

## ADR-095 : Calendrier — une case vide est un « pas de chance », plus un blocage

**Date** : 2026-08-08
**Statut** : Accepté
**Contexte** : `chantier/retours-proprietaire`. L'invariant posé en V1.47
refusait de publier un calendrier tant qu'une case restait vide. Retour
propriétaire : une case vide doit rester **publiable** — le joueur qui
l'ouvre tombe simplement sur une issue perdante, comme n'importe quelle case
d'un calendrier physique peut ne rien contenir.

### Publication libre, deux contrôles non bloquants conservés

L'invariant bloquant est retiré ; les refus déjà portés par les contraintes
`CHECK` de lot/spin restent (une case ne peut pas pointer vers un lot ou un
spin invalide, ce n'est pas la même classe de problème). Deux contrôles
**informatifs** subsistent côté éditeur : la liste des cases vides (nommées
et liées, pas un simple compteur) et le garde-fou d'assiduité si aucune case
ne peut jamais donner de gain — l'un signale un oubli probable, l'autre une
configuration qui viderait le module de son sens, ni l'un ni l'autre ne
bloque.

### Le joueur reçoit une vraie issue perdante, pas un mensonge

Avant ce chantier, ouvrir une case vide retombait sur le message générique
« Bonne journée ! », identique à un cas normal — le joueur ne pouvait pas
distinguer une case sans lot d'une case dont il n'avait simplement pas
gagné. Le message devient explicite (« Pas de chance aujourd'hui ! ») avec
une consolation d'assiduité quand elle s'applique, et l'ouverture compte
tout de même dans `opened_count` : une case vide reste une case ouverte pour
le calcul d'assiduité, elle ne se soustrait pas au parcours.

**Conséquences** :
- `caseVide()` exporté depuis le module de calendrier et consommé par
  l'éditeur (pastille dès la frappe) comme par le joueur — une seule
  définition de ce qu'est une case vide.
- 9 assertions pgTAP neuves couvrent la publication d'un calendrier à cases
  vides et le comptage `opened_count` sur une case vide ouverte.
- Assumé sans correction : un blueprint sans texte devient publiable (voulu
  par cette décision) ; les rappels email programmés partent aussi vers une
  case perdante, le suspense fait partie du jeu en V1.

**References** :
- `src/lib/calendar.ts` (`caseVide`)
- `supabase/tests/calendar.test.sql` (9 assertions neuves)
- commits `a94d976`, `afd53b4`
- roadmap V1.50

## ADR-096 : Checklist par mappage des contrôles d'activation, autosave par file/débounce à côté du hook

**Date** : 2026-08-08
**Statut** : Accepté
**Contexte** : `chantier/tuiles-checklist-autosave`. Demande propriétaire : sur
chaque page de jeu, toutes les tuiles refermées par défaut, numérotées dans
l'ordre des tâches, pastille rouge (obligatoire manquant) / verte (complet —
vide-mais-optionnel compte comme valide) ; et tout réglage s'enregistre
automatiquement, avec une notification en haut à droite.

### La vérité des pastilles est mappée depuis les contrôles d'activation, jamais recalculée

`src/lib/checklist/` ne réévalue pas ce qu'est un module « complet » : il fait
correspondre les tuiles ordonnées de chaque page aux VRAIS contrôles
d'activation posés en V1.47 (`src/lib/activation/`), module par module. La
table des défauts `bloquant` est tranchée **par module** — les pronostics
n'ont aucune précondition bloquante côté serveur, donc leurs pastilles sont
vertes honnêtement plutôt que rougies par une règle générique. Une clé de
contrôle absente de la table ne fait jamais rougir un écran qui n'a pas été
relu pour ce chantier ; un test de couverture double-sens vérifie qu'aucun
contrôle n'est orphelin et qu'aucune clé de la table n'est fantôme.

### L'autosave vit à côté du hook `useActionForm`, pas dedans

`useAutoSave` (debounce 800 ms, jamais déclenché au montage, flush forcé à la
sortie de champ) est un hook séparé qui appelle le même point d'entrée que le
bouton « Enregistrer » manuel — il ne remplace pas `useActionForm`, il le
pilote depuis l'extérieur. Un correctif préalable dans `useActionForm`
lui-même s'est avéré nécessaire : la file de soumissions (ligne ~132) perdait
silencieusement la dernière frappe en cas de resoumission rapprochée ; elle
rejoue désormais par un `requestSubmit` qui relit l'état frais, et le rejeu est
abandonné après un `resetOnSuccess`. `useAutoSaveManuel` couvre les gestes qui
n'ont pas de formulaire (ex. `QuestionForm` en édition, `DayRow`) avec la même
garde anti-no-op et une file d'une place. Le toast de confirmation est un bus
de module sans `Provider` React (rôle `status`/`alert`, pile de 3 messages
maximum) pour rester appelable depuis des composants qui ne partagent pas un
arbre commun.

### Exclusions autosave, actées et non une omission

Restent volontairement sur bouton « Enregistrer » manuel, jamais sur
debounce : statuts et publication, zones dangereuses, toute création,
finalisation/tirage/résultats, le motif de verrouillage (un debounce
enverrait un motif tronqué dans l'audit), les uploads. `PrizeRow` reste sans
autosave (comparaison `stock_seen` avant écriture). `day_count` du calendrier
désactive son autosave dès que la valeur diffère de l'initiale et rend la
main au bouton — la confirmation `confirm_day_loss` doit rester un geste
explicite, jamais un débounce silencieux.

**Conséquences** :
- 8 pages détail (campagnes, roue, quiz, calendrier, chasse, fidélité,
  jackpot, événements, pronostics) passent en checklist repliée par défaut,
  auto-ouverture par ancre `#statut`/`#suivi`/`#reglages` conservée.
- Zéro migration, zéro nouvelle action serveur : chaque étape poste une
  action existante complète.
- État de repli non persisté entre visites (assumé, hors périmètre) ;
  `useAutoSave` annule son minuteur au démontage — une navigation sans
  `blur` avant l'échéance du debounce peut perdre la dernière frappe, borné
  par le flush à la sortie de champ.

**References** :
- `src/lib/checklist/controles.ts`, `src/lib/checklist/tuiles.ts`
- `src/lib/use-auto-save.ts`, `src/lib/use-auto-save-manuel.ts`,
  `src/lib/use-action-form.ts`, `src/lib/toast-bus.ts`
- `src/components/dashboard/carte-repliable.tsx`
- commits `269cbc4`, `a9b2913`, `d77e751`, `edf5690`, `3685e3a`, `c944520`,
  `9d8b5d3`, `f858127`
- roadmap V1.51

## ADR-097 : Le partage générique post-jeu devient un réglage par surface, distinct du parrainage récompensé

**Date** : 2026-08-08
**Statut** : Accepté

**Contexte**. Le propriétaire décoche « Activer le parrainage sur cette
campagne » et voit toujours, côté joueur, « Faites gagner vos proches /
Partager sur WhatsApp / Copier le lien ». Deux widgets distincts coexistent
sous l'apparence d'un seul réglage : `ReferralPanel` (parrainage récompensé,
gaté par `referral_programs.enabled` + addon) et `ShareInvite` (partage
générique post-partie — pas de récompense, juste un lien), rendu SANS AUCUN
réglage sur les 4 coquilles de `/play` (roue, jeux de révélation via
`GameShell`, grattage, défis skill-gated via `SkillGameShell`), écrans gagné
ET perdu. Un audit des 8 surfaces publiques a trouvé le même défaut sur le
quiz (« Défier un ami » / « Partager mon score », inconditionnels) ; le
calendrier était déjà correct (partage conditionné à la case `is_special`) ;
chasse, fidélité, jackpot, événement, portefeuille et commande ne diffusent
que le code de retrait du joueur et n'avaient donc rien à gater.

**Décision**. Le partage générique post-jeu devient un réglage explicite par
surface — `campaigns.share_enabled` et `quizzes.share_enabled`, boolean not
null, **défaut `true`** pour préserver le comportement historique sans
migration de données. Il reste structurellement distinct du parrainage
récompensé : deux colonnes, deux actions (`updateCampaignShareInvite`,
`updateQuizShareInvite`), deux cases d'atelier, jamais un seul interrupteur
qui gouvernerait les deux mécaniques. Le défaut d'absence de colonne (lecture
`!== false`) est aligné entre `/play` et le quiz : les deux fail-open de la
même façon si la colonne n'est pas encore chargée dans le contexte.

**Justification**. Un défaut `true` évite de faire disparaître un widget que
tous les commerçants existants voyaient la veille sans qu'ils aient rien
demandé. Séparer les deux mécaniques évite la confusion que le propriétaire
a lui-même signalée : décocher une récompense ne doit pas être le seul levier
pour arrêter une diffusion non récompensée, et inversement.

**Conséquences**. En corrigeant le refus silencieux sur les deux nouvelles
actions, la revue sécurité a retrouvé le même défaut sur l'action de
parrainage prejeu existante : un update à 0 ligne (RLS qui refuse) rendait
un succès muet côté UI. Les trois actions campagne concernées (partage,
prejeu, et par cohérence le refus déjà présent ailleurs) refusent désormais
explicitement via `.select("id")`, avec un message fondu anti-oracle
(« Campagne introuvable ou droits insuffisants ») pour ne pas distinguer
« n'existe pas » de « pas les droits ».

**References** :
- `supabase/migrations/20260919120000_partage_apres_jeu.sql`,
  `supabase/migrations/20260920120000_partage_apres_jeu_quiz.sql`
- `src/actions/campaigns.ts` (`updateCampaignShareInvite`), `src/actions/quiz.ts`
  (`updateQuizShareInvite`)
- `src/components/dashboard/campaign-share-settings.tsx`, éditeur quiz
  `QuizShareSettings`
- commits `4baff77`, `f56e81c`, `f0e51d0`, `404f771`, `0f83ebc`, `944a031`,
  `58c487e`, `c6ad6d9`
- roadmap V1.52

## ADR-098 : Fonds d'écran thématiques — images statiques optimisées, palette élargie, fond de roue en choix explicite

**Date** : 2026-08-08
**Statut** : Accepté

**Contexte**. La palette d'habillage partagée entre calendrier, pronostics,
quiz et roue portait 6 clés, toutes saisonnières (Noël, Saint-Valentin…). Le
propriétaire voulait des univers non saisonniers en plus (restaurant,
football, festival…) et un vrai fond d'écran image sur les surfaces joueur,
pas seulement des motifs SVG sur fond de couleur. Le fond de roue posait une
question distincte : le décor de la roue (couleurs, style) obéit à un preset
choisi par le commerçant, indépendant du thème saisonnier de la campagne.

**Décision**.
1. **Images statiques optimisées, pas `next/image`.** 40 fichiers WebP
   (10 univers × 4 déclinaisons) générés hors requête par
   `scripts/optimiser-fonds.mjs`, servis en CDN statique — la même chaîne
   d'optimisation (« lumoz ») que les décors thématiques existants, choisie
   pour rester hors du chemin SSR et éviter le coût de transformation à la
   volée sur des assets qui ne changent jamais par requête.
2. **`FondKey` découplé de `SeasonalTheme`.** Le vocabulaire d'habillage
   (`SeasonalTheme`, 6 → 11 clés) et le vocabulaire de fond d'écran
   (`FondKey`, `src/lib/fonds-ecran.ts`) restent deux types distincts reliés
   par une fonction de correspondance (`fondPourTheme`), pas un alias : le
   quiz continue de choisir son thème par usage (gourmand → restaurant,
   sport → football) sans que la palette d'habillage ait besoin de connaître
   cette correspondance.
3. **Palette élargie à 11, requalifiée « habillage saisonnier ou
   d'univers ».** Les commentaires de colonne (`calendars.theme`,
   `contests.theme`) et les 5 recopies TypeScript sont mis à jour ensemble ;
   un test de parité SQL↔TS neuf compare le `CHECK` au catalogue exporté
   (dette INFO-3 du chantier fonds thématiques cartoon, fermée ici).
4. **Fond de roue en JSONB, choix explicite.** `wheelStyleSchema.fond` est
   un choix posé par le commerçant, jamais dérivé automatiquement du thème
   de la campagne — le décor de la roue reste au preset en cours
   (`setFond` le préserve). Différent des 3 autres surfaces, qui suivent le
   thème choisi sans réglage séparé.
5. **Voile de lisibilité mesuré, pas estimé.** L'opacité du voile posé
   au-dessus de l'image (`FondEcran`) est calibrée par scan axe-core sur
   chaque univers plutôt que fixée à une valeur unique supposée suffisante.
6. **Dissymétrie lecture/écriture assumée sur `wheelStyleWriteSchema`.** Le
   schéma de lecture reste tolérant à une clé de fond inconnue (repli
   neutre, pour ne pas faire échouer l'affichage d'une roue existante) ; le
   schéma d'écriture refuse désormais explicitement un fond hors palette —
   fermé en INFO de revue avant la PR, pour ne pas laisser une valeur
   invalide s'écrire à la faveur d'un futur appelant moins prudent.

**Justification**. Découpler `FondKey` de `SeasonalTheme` évite de figer les
usages du quiz (7 thèmes d'usage, jamais saisonniers) derrière un vocabulaire
qui grossit pour d'autres raisons. Le choix explicite sur la roue respecte
l'architecture déjà en place (ADR-093) : le décor suit un preset choisi, la
roue n'a jamais suivi le thème de campagne automatiquement.

**Conséquences**. Trois dettes restent en suivi (`docs/bugs.md`) : `games.style`
garde le même `.catch(undefined)` en écriture que celui fermé sur
`wheelStyleSchema` ; `wheelStyleSchema.partial()` des modèles de campagne
tolère un fond inconnu (lu des deux bouts, désormais écrit) ; les 3
sélecteurs de thème frères gardaient une radio `sr-only` 1×1 px sans surface
cliquable réelle — corrigé dans ce chantier après un flake E2E causé par
`scroll-behavior: smooth`, qui reste un piège pour tout futur `click()` sur
une cible petite et basse dans la page.

**References** :
- `scripts/optimiser-fonds.mjs`, `public/fonds/`
- `src/lib/fonds-ecran.ts`, `src/lib/wheel-style.ts`
  (`wheelStyleSchema`/`wheelStyleWriteSchema`)
- `supabase/migrations/20260921120000_habillages_univers.sql`
- `src/components/*/fond-ecran.tsx`, `src/components/dashboard/wheel-style-editor.tsx`
- commits `95c32de`, `815459e`, `7a158a8`, `b3d218d`, `b63fed1`, `c7214bd`
- roadmap V1.53

## ADR-099 : Les fonds image remplacent les décors SVG ; le style d'un QR se dérive au moment de sa naissance

**Date** : 2026-08-09
**Statut** : Accepté

**Contexte**. Après test à la main de V1.53, le propriétaire a demandé sept
retours ponctuels. Deux touchent des choix d'architecture pris pour l'habillage :
`ThemeDecor` (16 scènes cartoon SVG, ADR-093) coexistait avec les fonds image
livrés une itération plus tard (V1.53, ADR-098) — les deux couches
d'habillage se superposaient sur les mêmes surfaces joueur, et le propriétaire
a jugé les motifs cartoon redondants une fois le fond image en place. Par
ailleurs, un QR créé depuis la page d'un jeu ne portait aucun style : il
fallait rouvrir l'éditeur QR pour l'assortir à l'univers du jeu.

**Décision**.
1. **Retrait complet de `ThemeDecor`**, pas une désactivation. Le composant
   (945 lignes + test), le champ `decor` dans les 3 tables de tokens (pronos,
   calendrier, quiz) et dans les presets, `playDecor`, et les classes CSS
   `decor-float` sont supprimés — pas de flag mort, pas de code inatteignable.
   C'est une **inversion partielle assumée d'ADR-093** : la décision d'alors
   (« décors par tables de tokens pures ») reste valide dans son principe,
   mais son objet (le rendu SVG cartoon) est retiré sur arbitrage produit du
   propriétaire, une fois le fond image reconnu comme suffisant. Le
   vocabulaire `DecorKey` disparaît du projet.
2. **Les 18 presets d'habillage portent leur fond sur l'OBJET STYLE, pas sur
   l'objet preset** (« OPTION A », tranchée en amont du code). Les 10 nouveaux
   presets « Univers » écrivent leur `FondKey` dans le même style que celui
   qu'édite le commerçant, au lieu d'un champ séparé sur la structure de
   preset. Deux gains : héritage gratuit par les blueprints de campagne (qui
   copient déjà l'objet style sans connaître la notion de preset), et survie
   automatique au retrait de `decor` — un champ qui n'existe plus dans le
   style ne peut pas laisser une clé orpheline sur les presets qui le
   référençaient.
3. **Le style d'un QR créé depuis la page du jeu se dérive 100 % côté
   serveur**, au moment de sa création (`src/lib/qr-style-du-jeu.ts`) : lavis
   de l'univers du jeu + couleur d'accent du jeu. Aucun nouveau champ de
   schéma — la fonction lit le style déjà en base et projette un style QR
   valide. Testé sur 10 fonds × 7 accents × 2 ambiances, échec fermé sur le
   style par défaut d'avant cette fonctionnalité.

**Justification**. Un composant retiré plutôt que désactivé ne laisse pas de
code mort à réexpliquer au prochain chantier. Porter le fond sur le style
plutôt que sur le preset évite une deuxième source de vérité qui aurait dû
être tenue synchrone avec les blueprints et aurait cassé silencieusement au
retrait de `decor` ; la dérivation serveur du style QR évite de dupliquer la
logique de correspondance univers→couleur côté client.

**Conséquences**. Toute description antérieure de `ThemeDecor` comme livré
(roadmap V1.53, ADR-093, `docs/codex-handoff.md`) est désormais périmée et
annotée en ce sens plutôt que réécrite. Aucune migration : le retrait de
`decor` ne touche que des colonnes JSONB (tokens applicatifs), pas de colonne
SQL dédiée.

**References** :
- commits `500ecd4` (retrait ThemeDecor), `d1fb464`/`abfc131` (18 presets en
  2 familles), `467791b` (dérivation style QR)
- `src/lib/qr-style-du-jeu.ts`, `src/lib/qr-style-du-jeu.test.ts`

## ADR-100 : Le hub QR unionne les huit modules par une RPC, pas par huit requêtes de page

**Date** : 2026-08-09
**Statut** : Accepté
**Contexte** : `chantier/qr-hub-types` — `/dashboard/qr-codes` ne listait que
les QR de campagne ; sept autres modules (chasse, événement, jackpot,
fidélité, calendrier, quiz, parrainage, pronostics) n'avaient aucune vitrine
de leurs QR/liens dans ce hub.

**Décision**.
1. **Une RPC d'union, `org_qr_hub`**, plutôt que huit requêtes déclenchées
   depuis la page. Même doctrine que `org_animation_center_counts`
   (ADR-085, migration `20260914120000`) : un aller-retour, `security
   definer`, garde d'autorisation en premier geste, prouvé par pgTAP plutôt
   que supposé.
2. **La garde reprend `is_org_editor`, calquée sur la RLS vivante** — pas
   recopiée depuis la migration d'origine des tables sources. Un non-membre
   ne doit rien voir ; un caissier ne doit pas obtenir par cette RPC un accès
   qu'il n'a pas sur les pages module elles-mêmes. Parité avec la RLS plutôt
   qu'une règle d'accès dupliquée et divergente.
3. **Les cartes des modules hors campagne sont en lecture seule** : QR au
   style `PublicShare` déjà utilisé ailleurs, lien copiable, mais aucun style
   persisté propre à ces cartes. Écart assumé et consigné dans
   `docs/bugs.md` plutôt que corrigé dans ce lot — le studio de style ne
   s'applique aujourd'hui qu'aux QR de campagne, et étendre la persistance de
   style aux sept autres modules est un chantier séparé, pas un sous-effet
   du hub.

**Justification**. La RPC unique évite huit allers-retours réseau et huit
points de garde à maintenir synchrones ; calquer la garde sur la RLS vivante
plutôt que sur la migration d'origine évite qu'un octroi de rôle ajouté après
coup (caisse, éditeur) laisse la RPC désynchronisée de la politique réelle.

**Conséquences** : pgTAP a révélé que `module_page_opens.resource_id` n'est
pas au même grain selon le module (événement → sessions, chasse → étapes) ;
la RPC doit sommer côté SQL plutôt que compter une ligne par ressource,
prouvé sur un cas 3+4=7 (51 assertions, `qr_hub.test.sql`).

**References** :
- RPC `org_qr_hub`, `src/app/dashboard/qr-codes/`, `jeu-lien-card.tsx`
- `supabase/tests/qr_hub.test.sql`
- ADR-085 (RPC unique pour le Centre d'animation, même doctrine)
- roadmap V1.55
- roadmap V1.54

---

## ADR-101 : Les filtres descendent dans les RPC, pas dans le rendu de page

**Date** : 2026-08-09
**Statut** : Accepté
**Contexte** : `chantier/tris-filtres-partout` — quatre demandes propriétaire
(recherche/filtre/tri sur Clients et Participations, filtre État + « jamais
scanné » sur le hub QR, pagination sur les sept listes de modules de la Vue
d'ensemble) parmi une liste de six propositions.

**Décision**.
1. **Les filtres et la pagination descendent dans les RPC** (`org_qr_hub`,
   `org_customer_profiles_page`) plutôt que d'être appliqués côté page sur un
   résultat déjà chargé — sinon la pagination n'est juste que sur la page
   courante, pas sur l'ensemble filtré.
2. **Le compteur et la liste partagent le même prédicat**, factorisé en une
   fonction SQL unique (`customer_segment_matches`) plutôt que dupliqué en
   deux endroits qui peuvent diverger avec le temps. Parité prouvée par
   pgTAP, pas supposée.
3. **Les libellés de tuile ne promettent jamais le chiffre de la liste vers
   laquelle elles pointent.** La tuile de la Vue d'ensemble compte des
   ressources (grain module, 9 catégories) ; la liste qu'elle ouvre compte
   des affiches (grain différent, 8 modules). Les deux univers ne coïncident
   pas structurellement — le libellé dit « voir les affiches concernées »,
   jamais un nombre. Un test refuse tout chiffre dans ces descriptions.
4. **Les exports appliquent les mêmes filtres que l'écran**, via le même
   composant/la même requête partagée par module — jamais une requête
   d'export séparée qui peut dériver de ce que l'utilisateur voit (c'était le
   cas de l'export participations avant ce chantier, corrigé ici).
5. **Le téléphone client reste hors de l'écran et de l'export CSV** — décision
   RGPD déjà en vigueur, désormais écrite explicitement plutôt qu'implicite
   dans le code.

**Justification**. Un filtre appliqué après le chargement complet reproduit
le défaut déjà corrigé sur les sept listes de modules (tout chargé sans
plafond) ; un prédicat dupliqué entre compteur et liste dérive silencieusement
dès que l'un des deux est modifié sans l'autre — la revue sécurité a
d'ailleurs fermé deux défauts de ce type avant la PR (borne de date DST sur
les participations, pagination d'export mal bornée).

**Conséquences** : trois défauts latents ont été corrigés en écrivant la
pagination dans les RPC plutôt qu'en la supposant correcte : départage
manquant pouvant répéter ou faire disparaître une ligne entre deux pages,
plafond de page contournable par un `null`, prénom masqué par une valeur
récente `NULL`.

**References** :
- RPC `org_qr_hub` (`p_etat`, `p_jamais_scanne`), `org_customer_profiles_page`
  (`p_q`/`p_segment`/`p_tri`), `customer_segment_matches`
- `src/components/dashboard/module-list-filters.tsx`
- `/dashboard/customers/export`
- roadmap V1.56

## ADR-102 : La purge anonymise les spins, et « une seule fois » devient « une seule fois par période de conservation »

**Date** : 2026-08-16
**Statut** : Accepté
**Contexte** : audit transverse du 2026-08-16, constat RET-1 —
`spins.player_key` n'était jamais purgé. C'est la clé qui relie entre elles
toutes les parties jouées par une même personne (cookie joueur), et elle
survivait indéfiniment à la fenêtre de rétention RGPD que
`purge_expired_personal_data` applique déjà à d'autres tables. Le wagon 1 du
train de correction (`chantier/audit-p0-sorties`, PR #146) devait fermer ce
constat.

**Décision**. `purge_expired_personal_data` anonymise désormais
`spins.player_key` en `'purge:'||id` pour toute ligne dépassant la période de
conservation configurée. Aucune empreinte stable n'est conservée au-delà de
cette fenêtre — ce serait précisément ce que la purge existe pour interdire.

**Conséquence assumée**. La garde `play_limit = 'once'` de
`perform_atomic_spin` teste l'existence d'un spin par `player_key` sur toute
la vie de la campagne. Après anonymisation, un même joueur qui revient après
la fenêtre de rétention peut donc rejouer une campagne « une seule fois ».
La promesse devient de fait « une seule fois par période de conservation » —
la fenêtre réelle est bornée par le cookie joueur (365 jours) contre la
rétention configurée (1 à 60 mois selon l'organisation). C'est un
sous-produit assumé de la purge RGPD, pas un défaut à corriger : conserver
une empreinte stable au-delà de la rétention pour préserver la garde
« une seule fois » irait à l'encontre de l'anonymisation elle-même. La
vérité est désormais écrite sous le réglage de rétention plutôt que laissée
implicite.

**References** :
- `purge_expired_personal_data`, migration `20260924120000_sorties_rgpd.sql`
- `supabase/tests/sorties_rgpd.test.sql`
- `perform_atomic_spin` (garde `play_limit = 'once'`)
- roadmap V1.57 ; `docs/bugs.md` (MOYEN 1, wagon 1)

## ADR-103 : Un pass n'ouvre que son module, et un refus en tâche de fond se signale plutôt que de rester silencieux

**Date** : 2026-08-17
**Statut** : Accepté
**Contexte** : wagon 2 du train de correction issu de l'audit transverse du
2026-08-16 (`docs/chantier-audit-2026-08-16.md`, SD-1..SD-7, SD-9), branche
`chantier/audit-p0-stripe`. Le catalogue Stripe vendait des pass et des
offres qui n'ouvraient pas exactement ce qu'ils promettaient : un pass
ouvrait le socle roue en plus de son module, une Saison de pronostics
couvrait toutes les compétitions au lieu d'une seule, et une programmation de
campagne dont le droit avait expiré continuait de tourner sans que personne
ne le sache.

**Décision — périmètre d'un pass (SD-4)**. `org_has_module_access` gagne un
paramètre `_for_resource` : un octroi vivant n'ouvre plus le socle `wheel`,
seulement son propre module. C'est l'application de la décision produit du
2026-08-04 (déjà notée en ADR-078/ADR-079 pour le socle « découvrir,
préparer, publier »), étendue au catalogue de pass.

**Décision renversée — programmation gardée (SD-9)**. La migration
`20260906120000` documentait un choix délibéré : « `run_campaign_schedule`
non gardé — un refus en tâche de fond n'a pas d'écran pour se dire ».
Cette objection est désormais **fermée par le signal**, pas ignorée :
`run_campaign_schedule` est gardée par `org_has_module_access(org,'wheel')`,
le motif `droit_expire` est posé à la transition avec une entrée
`audit_logs`, et un job `automation.schedule-blocked` envoie un e-mail au
propriétaire. Le rachat du droit réactive la campagne au passage suivant, le
trigger existant efface le motif.

**Frontière assumée**. Les campagnes déjà `active` dont le droit tombe ne
sont pas mises en pause par le cron — le refus se joue à l'activation ; les
contextes publics refusent déjà à la lecture. Rien ne rend une campagne
active injouable côté joueur au moment où le droit expire ; le signal porte
sur la reprise, pas sur l'interruption immédiate.

**Décision — grâce d'impayé d'un pass ancrée sur l'événement de CET
abonnement**. La date de départ de la grâce est prise sur `event.created` de
l'abonnement du pass concerné, jamais sur `organizations.past_due_since`
(qui reste réservé à l'abonnement principal) et jamais écrite pour un pass
pur. La date est monotone : une fin calculée ≤ `starts_at` est refusée et
signalée plutôt que d'entraîner un 500 en boucle sur `grant_fin_apres_debut`.
`current_period_end` a été écarté : dans le SDK Stripe v22, cette date est
portée par les items de l'abonnement, pas par l'abonnement lui-même, et en
choisir un parmi plusieurs items n'aurait pas été justifiable.

**Conséquences** : migrations `20260925120000_droits_stripe.sql` et
`20260926120000_pass_expire_lisible.sql` ; webhook Stripe borné par
`organization_id` sur la reprise de remboursement (SD-2) ; `resource_id`
vivant et resserrement automatique d'`ends_at` à la clôture d'une
compétition (SD-5) ; garde de checkout par famille de prix pour qu'un
abonnement 100 % pass ne ferme plus la vente de l'offre (SD-3).

**References** :
- `org_has_module_access`, `run_campaign_schedule`,
  `shrink_contest_grants_on_close`, `revoke_grant_for_refund`,
  `debit_sms_balance_for_refund` — migrations `20260925120000` et
  `20260926120000`
- `etatOctroiModule`, `capacitesDuModule`, `octroiRessourceVivant`,
  `partitionnerPrix`, `processScheduleBlockedJob`, `sendScheduleBlockedEmail`
- ADR-078, ADR-079 (socle « découvrir, préparer, publier »), migration
  `20260906120000` (décision renversée)
- roadmap V1.58 ; `docs/bugs.md` (reliquats INFO, wagon 2)

## ADR-104 : La reprise d'un gain suit la fenêtre de rejeu, un nonce de défi ne joue qu'une fois, deux durcissements écrits plutôt que des retraits

**Date** : 2026-08-17
**Statut** : Accepté
**Contexte** : wagon 3 du train de correction issu de l'audit transverse du
2026-08-16 (`docs/chantier-audit-2026-08-16.md`, JOU-1, UI-1, UI-2, JOB-8,
SEC-2, MORT-1), branche `chantier/audit-p0-joueur`. Quatre arbitrages
propriétaire du 2026-08-16 encadraient ce wagon : la reprise de gain doit
couvrir toute la fenêtre de rejeu et s'afficher d'elle-même, un défi
skill-gated doit durcir sans retirer le jeu, le mode caisse jackpot staff
doit recevoir l'écran qui lui manque plutôt qu'être retiré.

**Décision — fenêtre de reprise (JOU-1)**. La RPC
`recover_pending_spin(p_wheel_id, p_player_key)` remplace le cutoff fixe de
30 minutes par la fenêtre réelle de `play_limit` de la campagne, calcul
recopié directement de `perform_atomic_spin` — source unique SQL,
délibérément sans miroir TypeScript, pour qu'un futur changement de la
fenêtre en base ne puisse pas diverger silencieusement d'une copie
applicative. Le prédicat est élargi aux spins sans `play_window_key`
(bornés par le début de fenêtre au lieu d'être exclus) : les gains de
parrainage empruntent la même clé joueur sans clé de fenêtre, trouvé
pendant ce chantier — les exclure aurait laissé une classe entière de gains
irrécupérables. `unlimited` reste sans borne explicite ; sa borne réelle est
la purge de rétention qui anonymise `player_key` (ADR-102), pas une limite
ajoutée ici.

**Frontière assumée**. Un gain sans clé de fenêtre à cheval sur une
frontière daily/weekly n'est plus repris au-delà de cette frontière — c'est
un resserrement volontaire, pas un défaut : le calcul de fenêtre suit
désormais la même règle que le spin qui a produit le gain.

**Décision — idempotence du défi (JOB-8, SEC-2)**. `perform_atomic_spin`
passe à 8 arguments avec `p_idempotency_key` ; le submit d'un défi
skill-gated transmet `'skill:' + nonce` du payload signé comme clé — le
nonce, jusque-là vérifié mais jamais consommé, ferme désormais la rejouabilité
d'un même défi. Un rejeu renvoie la même issue (stock décrémenté une seule
fois), lookup borné au joueur sous le verrou consultatif de la fonction, via
un index unique partiel sur `spins.idempotency_key`.

**Décision — deux durcissements écrits plutôt que des retraits (arbitrage
propriétaire du 2026-08-16)**. (1) `GAUGE_MIN_SUCCESS_MS` passe à 300 ms :
un succès à 0 ms était implausible et fermait la porte à un contrôle a
posteriori ; le jeu reste, la mention de l'atelier Réflexe/Jauge dit
désormais explicitement que le verdict vient de l'appareil du joueur. (2) Le
mode caisse jackpot staff, jusque-là sans appelant pour
`participateJackpotStaff`, reçoit son écran (`jackpot-staff-checkin.tsx`,
calqué sur le tampon fidélité, monté sur `/dashboard/redeem`) plutôt que
d'être retiré comme code mort.

**Conséquences** : migration `20260927120000_boucle_joueur_gain.sql` ;
`recoverPendingWin` perd son cutoff 30 min ; 4 écrans « tour offert »
(calendrier, quiz, passeport, parrainage) gagnent un try/catch réseau (UI-1)
et une sortie de blocage vers le portefeuille (UI-2) ; premier parcours E2E
de la famille caisse jackpot staff.

**References** :
- `recover_pending_spin`, `perform_atomic_spin` — migration
  `20260927120000_boucle_joueur_gain.sql`
- `recoverPendingWin`, `GAUGE_MIN_SUCCESS_MS`, `jackpot-staff-checkin.tsx`,
  `participateJackpotStaff`
- ADR-102 (purge et fenêtre de rétention comme borne réelle)
- roadmap V1.59 ; `docs/bugs.md` (JOU-7, FAIBLE-1, wagon 3)

## ADR-105 : Le commerçant garde la main — gardes applicatives assumées, une seule campagne à matrice fermée, une mesure qui se répare vers l'avant

**Date** : 2026-08-17
**Statut** : Accepté
**Contexte** : wagon 4 du train de correction issu de l'audit transverse du
2026-08-16 (`docs/chantier-audit-2026-08-16.md`, FIA-1..FIA-6, EXP-2, EXP-3,
NUM-1, SCAN-1, LIST-1, IDX-1, CNT-1), branche `chantier/audit-p1-controle`.
Trois arbitrages propriétaire rendus le 2026-08-17 encadrent ce wagon et ne
se rejouent pas : FIA-2 en gardes applicatives, FIA-3 en branche A
(désarmement par `set_campaign_status`), NUM-1 en clés datées avec rupture
de série assumée.

### FIA-2 — la garde métier reste applicative, ADR qui l'assume

`docs/decisions.md` (ADR-090, section « La publication reste hors de
l'Atelier ») laissait la question ouverte : « La garde métier réelle (le
trou reste POSTable en direct sur `set_campaign_status`) est un arbitrage de
base non tranché ici, consigné dans `docs/bugs.md`. » **Ce wagon la ferme** :
la garde reste **applicative**, elle ne descend pas en base. Une
`assert_module_publishable(module, id)` appelée par les huit RPC de
publication (modèle `20260905120000:255-282`) coûtait une migration + pgTAP
sur huit RPC, pour un risque d'enfermement non instruit (une campagne dont
le dernier lot s'épuise pourrait ne plus jamais repasser `active` après une
pause). Le geste minimal — deux gardes métier manquantes — était commun aux
deux branches, donc réalisé dans le lot backend quelle que soit l'issue de
l'arbitrage.

Deux gardes ajoutées, toutes deux dans le prédicat campagne (périmètre
tranché le 2026-08-17 : les **deux** promesses déjà faites par l'écran,
`src/lib/checklist/controles.ts:82-83`) : `updateCampaign` refuse le passage
à `active` si aucun lot gagnant n'est tirable **ou** si le poids total des
lots est nul, via `estGagnantTirable` (`src/lib/lot-tirable.ts`, prédicat
déplacé — pas dupliqué — hors de `atelier-verification-state.ts`, miroir de
`perform_atomic_spin`) ; `updateContest` refuse l'ouverture d'un championnat
sans match, via `blocageActivationContest`, extrait sur le modèle exact de
`blocageActivationEvent`.

**Ce que ça n'empêche pas, dit sans l'adoucir** : un éditeur du même tenant
qui appelle `set_campaign_status` ou `set_contest_status` directement en
PostgREST contourne les deux gardes — elles vivent dans l'action serveur,
pas dans la RPC `security definer`. C'est un **contournement connu et
assumé**, pas un oubli ; le vocabulaire retenu partout (code, tests,
documentation) est « refusé par l'écran et l'action », **jamais**
« impossible ». La liste des RPC contournables est tenue dans
`docs/bugs.md` (wagon 4, F-2).

### FIA-3 — branche A : `set_campaign_status` désarme, le commerçant ré-arme à la main

`set_campaign_status` pose désormais `auto_schedule = false` dans le même
`update` que le changement de statut, quand la cible est `paused`, `draft`
ou `archived` — une pause manuelle dans sa fenêtre n'est plus réactivée par
`run_campaign_schedule` en moins de 10 minutes. La branche B (un
`paused_reason = 'manual'` distinct) était écartée : elle aurait exigé une
migration de contrainte et une valeur d'énumération de plus, sans couvrir
« Restaurer en brouillon » que la branche A couvre naturellement.
**Conséquence produit assumée** : un commerçant qui pause une heure doit
ré-armer la programmation à la main dans « Programmation et budget » — pas
de raccourci ajouté depuis la carte Statut, la mention suffit (moins de
surface, le geste existe déjà à un écran de distance).

### FIA-6 — la matrice d'états ne restreint QUE la campagne

`set_campaign_status` refuse désormais `archived → active` ; les sept
autres RPC de publication (`set_hunt_status`, `set_calendar_status`,
`set_loyalty_program_status`, `set_quiz_status`,
`set_jackpot_campaign_status`, `set_event_game_status`,
`set_contest_status`) restent permissives sur cette même transition, **par
choix, pas par oubli** : six écrans offrent explicitement
`archived → active` (`hunt-editor.tsx:677`, `calendar-editor.tsx:895`,
`quiz-editor.tsx:175`, `loyalty-editor.tsx:884`, `jackpot-editor.tsx:546`,
`event-editor.tsx:124`) — fermer la RPC casserait six parcours légitimes.
Cette permissivité était affirmée par un commentaire (`20260905120000:91-95`)
sans être vérifiée ; elle est désormais **prouvée** par une section pgTAP
dédiée qui énumère la matrice, contrôles négatifs compris (le retour en
arrière `archived → draft` doit rester ouvert, les six autres modules
doivent rester permissifs sur `archived → active`).

### NUM-1 — clés datées, rupture de série assumée et écrite en tête de migration

Les clés d'idempotence des événements `experience_viewed` /
`experience_started` / `experience_completed` sont désormais datées au jour
local de l'organisation. **Rupture de série assumée, non corrigible par
backfill** : avant ce wagon, un `start` comptait un par joueur **à vie** ;
après, un par joueur **et par jour**. Les lignes déjà écrites gardent leur
ancienne clé (`on conflict do nothing`) — aucune ligne historique n'est
retraitée. Les périodes antérieures et postérieures à la migration
`20260928120000` **ne sont pas comparables** ; c'est un fait à connaître
avant de lire un graphique d'analytique d'expérience à cheval sur cette
date, pas un défaut à corriger. L'alternative purement additive (compteurs
distincts, clés inchangées) était écartée : elle aurait corrigé le libellé
sans réparer le taux, qui continuait de s'effondrer sur les cohortes de plus
de 30 jours.

### CNT-1 — un plafond de page constant, en repli silencieux

`Math.min` posé aux cinq sites TypeScript de `parsePageParam` et aux deux
RPC PostgREST appelables directement (`org_customer_profiles_page`,
`org_qr_hub`), sur la **même constante** — 500 pages. Au-dessus, la page est
ramenée au plafond **sans message**, convention déjà en usage dans le dépôt
pour un paramètre d'URL hors domaine (`module-list-filters.tsx:61-63`).

### Les angles morts de l'audit qui restent des angles morts

Aucun EXPLAIN ni benchmark n'a été exécuté pour IDX-1 (angle mort 4) : les
trois index de clé étrangère ajoutés (`spins.campaign_id`, `spins.prize_id`,
`participations.prize_id`) se justifient par lecture — un FK sans index de
tête — jamais par un gain chiffré, qui n'a été ni mesuré ni annoncé. Le
`max_rows` du PostgREST **hébergé** n'a pas pu être lu (angle mort 8) :
LIST-1 est traité comme un transfert de lignes inutile, jamais comme un
compteur qui mentirait — cette dernière affirmation n'est **pas établie** et
n'a été écrite nulle part. EXP-2 et SCAN-1 restent des constats dérivés du
code, aucun parcours n'a été rejoué en session réelle (angle mort 10).

**Conséquences** : migration `20260928120000_controle_commercant.sql` ;
`src/lib/lot-tirable.ts` neuf (prédicats déplacés, importés par
`atelier-verification-state.ts`) ; `src/lib/publication-transition.ts` gagne
la classe `transition`, distincte d'`echec`, pour que le refus de matrice
s'affiche « Ce changement de statut n'est pas permis. » et non
« Mise à jour impossible » ; six commentaires de code devenus faux corrigés
dans le même lot (`src/lib/activation/pronostics.ts`,
`src/lib/checklist/controles.ts`, `src/lib/publication-transition.ts`,
`src/components/dashboard/atelier-verification-state.ts`,
`supabase/migrations/20260905120000` révisé en commentaire de la migration
neuve, `src/lib/codes-en-attente.ts`).

**References** :
- `set_campaign_status`, `set_contest_status`, `start_event_session` —
  migration `20260928120000_controle_commercant.sql`
- `src/lib/lot-tirable.ts`, `src/actions/campaigns.ts` (`updateCampaign`),
  `src/actions/pronostics.ts` (`updateContest`), `src/actions/events.ts`
  (`startEventSession`, `deleteEventQuestion`), `src/actions/prizes.ts`
  (`deletePrize`)
- ADR-090 (« la garde métier réelle est un arbitrage de base non tranché
  ici » — c'est cette phrase que ce wagon ferme)
- roadmap V1.60 ; `docs/bugs.md` (wagon 4 : sept points consignés sans
  correctif, F-2, INFO-3, INFO-5)

## ADR-106 : La soirée live tient sa promesse — cache d'1 s par session, jauge vendable plafonnée à 500

**Date** : 2026-08-17
**Statut** : Accepté
**Contexte** : wagon 5 du train de correction issu de l'audit transverse du
2026-08-16 (`docs/chantier-audit-2026-08-16.md`, EVT-1, EVT-2, JOU-4, JOU-5,
DOC-1 perf-report, JKP-1, plafond jauge 500), branche `chantier/audit-p1-live`.
Le §7 de `docs/perf-report.md` avait établi, dès 2026-08-07, que la jauge
vendue « La Totale » (1000 participants) n'était pas tenue : ~400 req/s de
besoin contre ~150 req/s de débit estimé en production, Realtime coupé. Ce
wagon ferme cet écart.

### Le cache d'1 s par session et par instance, retenu comme levier dominant

Six des sept clés de l'état public d'une session sont identiques pour tous
ses joueurs. `event_etat_partage` (migration `20260929120000`) isole cette
part commune et la cache une seconde en mémoire, par session, par instance
serveur — calque du modèle déjà en usage pour `dernieresTraces`
(`src/lib/player-identity.ts:155-180`). Le bloc `you` (`event_etat_joueur`)
n'est **jamais** caché : il porte le score, le rang et le code de retrait
personnels. Le drapeau `EVENTS_REALTIME_ENABLED` seul, sans ce cache, laisse
un besoin résiduel de ~217 req/s pour ~150 req/s disponibles à 500 joueurs :
insuffisant seul, d'où le choix de livrer le cache en base plutôt que de
se reposer uniquement sur l'activation d'un transport encore éteint en
production.

### La fusion des gardes en base, source unique

Le rendu serveur et le repli polling lisaient chacun la session puis la garde
de module puis l'état, soit trois allers-retours dupliqués par deux chemins.
`event_etat_partage` descend les deux premiers dans la RPC : `unavailable` sur
session brouillon/archivée ou module fermé est désormais tranché à un seul
endroit, en base, et la parité avec l'ancien comportement à deux chemins a été
vérifiée à la main par la revue de sécurité plutôt que par un test générique
de non-régression comportementale.

### La jauge vendable redescend à 500, l'union de type porte l'interdit

`event_participant_capacity` rend désormais 500 pour `full` et `live` (1000
pour l'accès offert, jamais vendu sur une promesse de débit).
`src/lib/plans.ts` rétrécit l'union `eventParticipants` à `100 | 500` : vendre
1000 redevient une erreur de compilation, pas une case qu'un commercial peut
cocher seul. Aucun banc n'a prouvé 1000 tenable ; le catalogue ne le propose
donc plus tant qu'un banc futur ne l'aura pas établi.

### `server_now` figé jusqu'à 1 s par le cache, assumé

Le chrono serveur affiché aux deux écrans dérive du `server_now` renvoyé par
`event_etat_partage`, lui-même valide jusqu'à 1 s pendant qu'il est servi
depuis le cache. Assumé : très en dessous de la cadence de sondage la plus
serrée (2,5 s en question active), ce n'est pas la fraîcheur individuelle
d'un joueur qui est en jeu, seulement la simultanéité d'une salle.

### L'écran de salle sans bouton de reconnexion, assumé

Le téléphone joueur affiche « Reconnexion… » + un bouton « Actualiser » dès le
2ᵉ échec de sondage. L'écran de salle affiche le même bandeau **sans**
bouton : personne ne clique sur un téléviseur relié à un boîtier au fond
d'une salle — l'organisateur agit depuis sa télécommande, pas depuis l'écran
public.

**Conséquences** : migration `20260929120000_soiree_live.sql` ;
`src/lib/event-etat.ts` (nouveau) ; `src/lib/plans.ts` (union `100 | 500`) ;
`.env.example` documente `EVENTS_REALTIME_ENABLED` ; `docs/perf-report.md` §7
réécrite pour ne plus décrire comme livré ce qui ne l'était pas avant ce
wagon (DOC-1).

**References** :
- `event_etat_partage`, `event_etat_joueur`, `event_participant_capacity` —
  migration `20260929120000_soiree_live.sql`
- `src/lib/event-etat.ts`, `src/lib/plans.ts`
- `docs/perf-report.md` §7 ; roadmap V1.61 ; `docs/bugs.md` (wagon 5, INFO 1-4)

## ADR-107 : Vrai 404 avant squelette — le streaming des métadonnées de Next 16 déjoue deux tentatives avant la troisième

**Date** : 2026-08-18
**Statut** : Accepté
**Contexte** : wagon 6 du train de correction issu de l'audit transverse du
2026-08-16 (`docs/chantier-audit-2026-08-16.md`, PERF-1..8, UI-3..6, A11Y-1..7),
branche `chantier/audit-p2-front`. Le socle demandait une frontière
`loading.tsx` sur les routes joueur qui n'en avaient aucune (play, hub
pronostics, recover, portefeuille), pour éviter un écran blanc pendant le
chargement des données. Trois tentatives ont été nécessaires pour la poser
sans casser le comportement 404 des routes à ressource (calendar, event,
jackpot) devant une ressource inconnue.

### Trois tentatives, une seule qui tient

1. **`notFound()` dans `generateMetadata` + `cache()`** : sans effet — Next 16
   streame les métadonnées par défaut, l'en-tête HTTP 200 part avant que la
   fonction s'exécute.
2. **`htmlLimitedBots: /.*/ ` (rendu des métadonnées bloquant)** : prouvé sans
   effet par quatre méthodes convergentes sur un build propre, y compris avec
   l'UA `Slackbot` de la liste par défaut de Next.
3. **Solution retenue, par construction** : aucune frontière `loading`
   au-dessus d'une route publique qui peut rendre `notFound()`. Les quatre
   routes équipées (play, hub pronostics — isolé dans un sous-groupe
   `(hub)` pour ne pas contaminer ses voisines —, recover, portefeuille)
   n'appellent jamais `notFound()`. Les routes à ressource
   (calendar/event/jackpot) gardent leur statu quo d'avant le wagon : vrai
   404, sans squelette de chargement au-dessus.

La garde `route-boundaries.test.ts` a été **retournée** : elle affirmait
auparavant l'inverse (toute route publique doit avoir un `loading.tsx`) et
aurait laissé passer la régression qu'elle nomme désormais explicitement —
neuf routes listées, échec si une frontière `loading` de groupe est reposée
au-dessus de l'une d'elles.

### L'exception dashboard/admin, assumée

Le dashboard commerçant et l'espace admin gardent la paire
`loading.tsx`+`notFound()` d'avant le wagon : leur statut 404 est donc
« faux » (rendu 200 au streaming) mais ce n'est jamais observable par un
visiteur anonyme — ces routes sont protégées par authentification en amont.
Le compromis qui serait inacceptable sur une route publique (fuir
l'existence d'une ressource) est sans conséquence derrière une connexion
obligatoire.

### L'exclusion axe nommée site par site, jamais globale

Les scans d'accessibilité automatisés (axe, 7 specs Playwright + `a11y.spec.ts`
étendue à 7 pages) lisent `incomplete` comme bloquant sur `color-contrast`,
avec un format qui distingue `[violation]` (certain) de `[indécidable]`
(nécessite jugement humain). L'exclusion `SURFACE_A_DEGRADE` liste 17 sites,
chacun justifié individuellement dans le code — aucune exclusion par
catégorie ou par page entière, pour que l'ajout d'un dix-huitième élément à
une page déjà exclue reste détecté. Ces capteurs ont débusqué deux vrais
défauts en une seule campagne : le séparateur « ou » de `/login` (jamais
scannée avant ce wagon, contraste 2,5:1) et l'upload de logo sans label
accessible (`critical`, corrigé par un `sr-only`).

### La poignée PostHog comme seul mécanisme correct de retrait de poids

Chargement dynamique et import-au-clic ont été écartés au profit d'un garde
de consentement (`analytics.tsx`) : PostHog ne se charge que si le
consentement est **accordé**, pas seulement proposé. Un chargement
différé sans ce garde continue de télécharger la bibliothèque pour tout
visiteur qui refuse le suivi, ce qui manque l'objectif (poids et respect du
refus sont la même contrainte ici, pas deux contraintes séparées).

### La mesure de bundle automatisée, sans seuil bloquant

`scripts/mesurer-bundle.mjs` (`npm run bundle:mesure`) rend les quatre poids
mesurés avant/après reproductibles, mais ne pose **aucun seuil qui ferait
échouer la CI** — angle mort assumé : mesurer d'abord, menacer plus tard si
une régression future le justifie. Un seuil prématuré, choisi sans historique
de variation naturelle du poids d'une page, aurait un taux de faux positifs
inconnu.

**Conséquences** : `scripts/mesurer-bundle.mjs` (nouveau) ; `error.tsx` sur
les groupes `(player)`/`(public)`/`(auth)`/admin/onboarding/poster ;
`loading.tsx` sur play/hub-pronostics/recover/portefeuille uniquement ;
`route-boundaries.test.ts` retournée ; règle ESLint `no-restricted-imports`
sur `src/components` + `import-sans-crypto.test.ts` ; exclusion
`SURFACE_A_DEGRADE` (17 sites) dans les specs a11y ; `docs/bugs.md` (wagon 6,
quatre points consignés).

**References** :
- `scripts/mesurer-bundle.mjs`, `src/lib/analytics.tsx`
- `route-boundaries.test.ts`, `import-sans-crypto.test.ts`,
  `dashboard-contrast.test.ts`
- `a11y.spec.ts` ; roadmap V1.62 ; `docs/bugs.md` (wagon 6)

## ADR-108 : Privilèges par défaut symétriques, cadence de capteur = cadence du heartbeat, job différé qui prouve sa progression

**Date** : 2026-08-18
**Statut** : Accepté
**Contexte** : wagon 7 (dernier) du train de correction issu de l'audit
transverse du 2026-08-16 (`docs/chantier-audit-2026-08-16.md`, JOB-1..9, SEC
surface, SEC multitenant, CI-1/2, TEST-1..3, DETTE-1/2, MORT-2), branche
`chantier/audit-p2-fond`, migration `20260930120000_le_fond_tient.sql`. Trois
décisions structurantes, indépendantes l'une de l'autre.

### (a) Privilèges par défaut révoqués pour `authenticated`, symétriques à `anon`

00021 avait posé « rien par défaut » pour `anon` : toute table créée ensuite
devait gagner ses privilèges explicitement. `authenticated` n'avait jamais
reçu la même garde — une future table oubliée aurait été lisible par
n'importe quel compte connecté, de n'importe quel locataire, dès qu'une
policy même modérément permissive existerait, ou même sans policy si `enable
row level security` manquait aussi. `alter default privileges for role
postgres in schema public revoke all … from authenticated` ferme ce filet,
plus sept révocations explicites sur les tables hors-locataire qui ne
tenaient que par « RLS + zéro policy » (`stripe_events`, `rate_limits`,
`admin_users`, `admin_sessions`, `admin_audit_logs`, `admin_notes`,
`webhook_deliveries`) : une table hors-locataire doit être fermée par
privilège retiré, jamais par la seule absence d'une policy — la première
policy un peu large écrite dessus l'aurait ouverte sans qu'aucun `grant`
n'ait eu à être ajouté.

**Convention à retenir pour les migrations futures** : une nouvelle table à
séquence destinée à `authenticated` devra recevoir un `grant usage`
explicite sur cette séquence — le filet par défaut le lui retire désormais
aussi (finding I6 de la revue sécurité). Un privilège manquant sur une
séquence casse silencieusement un `insert … returning` avant même d'exposer
une donnée.

### (b) Un capteur de supervision porte la cadence de ce qu'il mesure, jamais celle du travail sous-jacent

Le wagon a d'abord voulu passer la période déclarée de `jackpot-draws` à
300 s / 900 s, au motif qu'un pg_cron (`lastchance-jackpot-date-draws`) le
déclenche toutes les 5 minutes. La revue sécurité (M1) a montré que la
prémisse confondait le TRAVAIL et le BATTEMENT DE CŒUR : ce pg_cron exécute
`run_jackpot_date_draws()` directement en SQL et n'écrit aucune ligne dans
`ops_worker_runs` ; le seul heartbeat de ce worker vient de la route HTTP
`/api/cron/jackpot-draws`, planifiée une fois par jour (`vercel.json`,
`45 4 * * *`). Appliquer 300 s aurait rendu le capteur rouge ~23 h 45 sur 24
dès l'activation — un voyant qui reste toujours allumé est un voyant qu'on
cesse de lire, l'exact défaut que ce wagon ferme ailleurs. La période
déclarée reste donc 86 400 s / 108 000 s, cadence vraie de ce que le capteur
mesure réellement. Superviser le chemin pg_cron des 5 minutes demanderait que
`run_jackpot_date_draws()` écrive son propre heartbeat — un chantier à part
entière, consigné dans `docs/bugs.md`, pas un `update` glissé dans cette
migration.

### (c) Un job différé doit prouver sa progression, sinon un retry ne fait que consommer

La newsletter envoie désormais par tranches de 100 avec `recipient_count`
réel et une progression journalisée. La revue sécurité (M2) a montré qu'une
seule borne — un plafond de tentatives ou d'âge — ne suffit pas à distinguer
un envoi qui avance lentement d'un envoi bloqué qui consomme des retries sans
avancer : les deux ont la même signature externe. La double borne retenue
exige les deux conditions à la fois pour continuer à reporter — une
progression **constatée** depuis le dernier passage, et un plafond d'âge de
24 h au-delà duquel le job échoue explicitement plutôt que de se reporter
indéfiniment. Un report qui ne vérifie que l'âge laisserait tourner un job
mort jusqu'à la borne ; un report qui ne vérifie que la progression laisserait
un job lent traîner sans fin.

**Conséquences** : `supabase/migrations/20260930120000_le_fond_tient.sql`
(revokes symétriques + sept révocations + `org_segment_emails` ordonnée) ;
`security_acl.test.sql` (règle catalogue ≥ 110 tables + organisation
« voisine ») ; `src/lib/newsletter-worker.ts` (double borne) ; `docs/bugs.md`
(supervision du chemin pg_cron 5 min de `jackpot-draws`, geste
`enabled = true` réservé au propriétaire après premier succès prouvé) ;
`docs/observability.md` (cadence réelle du drain webhook et du registre
`jackpot-draws`).

**References** :
- `supabase/migrations/20260930120000_le_fond_tient.sql`
- `src/lib/webhook-worker.ts`, `src/lib/newsletter-worker.ts`,
  `src/lib/timing-safe.ts`
- roadmap V1.63 ; `docs/bugs.md` (wagon 7) ; `docs/chantier-audit-2026-08-16.md`

## ADR-109 : Train Réserver & Vitrine — plan de lots et arbitrages

**Date** : 2026-08-19
**Statut** : Accepté
**Contexte** : le propriétaire a validé le 2026-08-19 un plan de 19 lots
(L0→L18) implémentant les décisions produit de
`docs/lastchance-reserver.md` — LastChance Réserver (RES-1..5), Vitrine
(VIT-1..5), Expériences Signature, Duo Miroir, Portrait de la Bande. Il a
donné un **ordre permanent** : exécution autonome complète, push/fusion/
enchaînement des lots sans son intervention, bilan global à la fin du train.
Quatre arbitrages ont été tranchés avant le lancement, plus une décision de
traduction et une décision sur les packs de questions.

### Ordre permanent du propriétaire

Exécution autonome sur l'ensemble des 19 lots : chaque lot est développé,
vérifié, poussé et fusionné sans validation intermédiaire du propriétaire ;
un bilan global est produit en fin de train (voir
`docs/chantier-reserver-vitrine.md` pour le suivi lot par lot). Règle de
cadence héritée du socle opérationnel : au plus 2 trains d'écriture en vol,
jamais 2 lots à migration en parallèle, fusions de migrations sérialisées.

### A1 — Un seul entitlement « vitrine », vérifié côté serveur sur 3 surfaces

**Décision** : un entitlement unique couvre la publication de la Vitrine, le
CRM léger et l'agenda Réserver, vérifié côté serveur sur chacune des trois
surfaces.
**Justification** : ajouter un enum de droit supplémentaire plus tard reste
bon marché ; fusionner deux entitlements distincts après coup est coûteux
(migration de données, double vérification transitoire). L'entitlement
unique colle au modèle déjà en place « un droit, trois capacités ».
**Conséquence assumée** : un octroi bêta ouvre les trois capacités
ensemble — il n'existe pas de granularité plus fine au MVP.

### A2 — Canal nominatif par email, check-in par code court

**Décision** : le canal nominatif des réservations est l'email (Resend,
déjà en production). Le consentement transactionnel est capturé à la fois à
la réservation et à l'inscription en liste prioritaire. Le check-in se fait
par code court, pas par QR en email.
**Justification** : ni liaison de compte joueur ni SMS ne sont nécessaires
au MVP ; le rendu QR est aujourd'hui 100 % côté client, donc un QR envoyé
par email n'a pas de générateur serveur disponible — le code court évite ce
chantier annexe.
**Conséquence assumée** : pas de QR imprimable/affichable par email au MVP.

### A3 — Pas de scission du consentement SMS au MVP

**Décision** : `sms_consents` reste tel quel, sans nouvelle colonne de
consentement transactionnel dédié. Interdiction explicite d'envoyer du
transactionnel Réserver/Vitrine sur le consentement marketing actuel.
**Justification** : scinder le consentement est un chantier à part entière
(ADR-061 sur le SMS transactionnel de retrait fait déjà cette distinction
pour un autre flux) ; l'introduire ici alourdirait un train déjà large sans
bénéfice immédiat, le canal MVP étant l'email (A2).
**Conséquence assumée** : lot conditionnel, hors chemin critique du train,
à activer seulement si un SMS transactionnel Réserver devient nécessaire.

### A4 — Lobbies joueurs gratuits, hors paliers événement facturés

**Décision** : les lobbies créés par les joueurs (Duo Miroir à 2, Portrait
de la Bande de 2 à 12) sont gratuits, distincts des paliers événement
facturés (minimum 10 participants, créés depuis le dashboard commerçant).
**Gardes retenues** : seau IP-seule (protection réelle contre l'abus),
quota par organisation, TTL d'expiration des lobbies non verrouillés. Le
plafond par cookie joueur est reconnu comme décoratif — il ne protège rien
qu'un joueur motivé ne contourne en effaçant son cookie — et n'est donc pas
compté comme une garde à part entière.
**Justification** : un lobby joueur gratuit doit rester praticable en
usage normal tout en étant borné contre l'abus organisé ; l'IP et le quota
d'organisation sont les deux gardes qui résistent à un joueur qui rejoue le
geste, contrairement au cookie.

### Décision traduction — zéro IA payante, adaptateur neutre, repli français

**Décision** : aucune IA payante et aucune clé Anthropic pour la traduction
de la Vitrine. DeepL est écarté pour l'instant — son compte devrait être
créé par le propriétaire, geste hors du périmètre d'exécution autonome de ce
train. Le lot L11 (VIT-1b) livre une infrastructure i18n avec un adaptateur
de traduction **neutre et pluggable**, plus un repli automatique vers le
français, sans fournisseur branché à ce stade.
**Conséquence assumée, validée par le propriétaire** : si aucune traduction
gratuite viable n'est trouvée au moment du lot L11, la Vitrine ouvre **en
français seul** — écart assumé par rapport à l'ambition initiale
« anglais dès le socle ». Les alternatives gratuites ou à faible coût (DeepL
Free, 500 000 caractères/mois ; LibreTranslate auto-hébergé ; autres pistes
trouvées en cours de route) seront documentées au bilan de fin de train,
avec un calcul de capacité rapporté au volume de clients.

### Décision packs de questions — Portrait de la Bande

**Décision** : les packs de questions du module Portrait de la Bande sont
rédigés et livrés par Claude au lot L18 — un pack par défaut à tonalité
positive, un pack « taquin » assumé comme tel, avec des exclusions strictes
de contenu. Relecture et validation du propriétaire au bilan de fin de
train, pas avant.

### Ordre des 19 lots

L0 cadrage docs · L1 benchmark Mennoo (lecture seule) · L2 droit serveur
vitrine · L3 RES-1a schéma + RPC · L4 RES-1b surfaces + email · L5 RES-2
liste prioritaire + invitations · L6 RES-3 file sereine · L7 RES-4 attente
active · L8 Expériences Signature · L9 RES-5 hold stock + RESA- + Drop ·
L10 VIT-1a marque + catalogue FR (sous drapeau) · L11 VIT-1b infra i18n +
adaptateur neutre (ouverture publique Vitrine) · L12 VIT-2 import assisté +
QR imprimables · L13 VIT-3 branchement · L14 VIT-4 social + avis +
analytics + CRM léger (segments « réservé »/« venu ») · L15 VIT-5 langues+ ·
L16 socle session joueur · L17 Duo Miroir · L18 Portrait de la Bande.

**Conséquences** : `docs/chantier-reserver-vitrine.md` (tracker créé au lot
L0, mis à jour à chaque lot fusionné) ; `docs/roadmap.md` (entrée V1.64) ;
`docs/codex-handoff.md` (journal d'avancement).

**Références** :
- `docs/lastchance-reserver.md`
- `docs/chantier-reserver-vitrine.md`
- roadmap V1.64

## ADR-110 : RES-2 — l'offre à une personne, le plafond de file et l'éviction staff

**Date** : 2026-08-19
**Statut** : Accepté
**Contexte** : le lot L5 (RES-2, PR #161, migration `20261004120000`) livre
la liste prioritaire (waitlist) et les invitations d'un créneau complet.
Plusieurs arbitrages ont été tranchés pendant l'implémentation.

**Décision — capacité et verrouillage** : la capacité d'un créneau se compte
sur les lignes `reservations` à l'état vivant (`'confirmed'`, `'checked_in'`),
sous verrou `org_id` + créneau pour éviter la survente en écriture concurrente.

**Décision — offre séquentielle exactly-once** : quand une place se libère,
une offre est envoyée à un seul candidat de la file à la fois, avec
expiration ; l'état terminal de l'offre (acceptée/expirée/retirée) est posé
par trigger pour garantir qu'une offre ne peut être consommée qu'une fois,
même en cas de double appel concurrent.

**Décision — plafond de file** : `least(greatest(2×capacité, 4), 50)` — un
plancher de 4 pour les petits créneaux, un plafond dur de 50 pour borner le
volume de PII conservé par créneau quelle que soit sa capacité.

**Décision — éviction staff auditée** : le commerçant peut retirer une
entrée de la file ; le geste est audité comme les autres actions staff du
module (même modèle que `cancel_reservation_staff`, ADR consigné au lot L4).

**Décision — jeton d'invitation** : 192 bits d'entropie, haché SHA-256 sans
sel côté base, révélé une seule fois au moment de l'envoi. Masqué dans les
analytics via l'extension du même mécanisme `masquer-jeton-url` déjà en
place pour les liens de retrait. Le jeton en clair est interdit en prop
client React (Server Component) : un bug de cette classe a été trouvé et
corrigé dans ce lot, puis le même geste de correction a été appliqué par
prudence aux deux autres surfaces qui en portaient un déjà en production
(`/commande`, `/hunt`), sans attendre un audit dédié.

**Justification** : la file d'attente d'un créneau est une surface neuve qui
manipule des identifiants nominatifs (email) et des jetons d'accès — le même
niveau de rigueur que les mécaniques de retrait existantes (masquage
analytics, absence de secret client) s'imposait dès la livraison plutôt
qu'en correctif après coup.

**Conséquences** : le plafond de file borne le stock vivant de PII par
créneau, pas son cumul dans le temps (voir `docs/bugs.md`, notes du train).
Pas d'email d'offre au MVP — la file est découverte par consultation de la
page (voir note L5 de `docs/chantier-reserver-vitrine.md`).

**Références** :
- PR #161, migration `20261004120000`
- `docs/chantier-reserver-vitrine.md`

## ADR-111 : RES-3 — la file sereine sans ETA ni pénalité

**Date** : 2026-08-19
**Statut** : Accepté
**Contexte** : le lot L6 (RES-3, PR #162, migration `20261005120000`) livre
la file d'attente affichée au joueur sans estimation de temps ni risque de
pénalité automatique.

**Décision — rang calculé à la lecture** : le rang d'un joueur dans la file
n'est jamais stocké ; il est recalculé à chaque lecture. Aucun ETA n'est
affiché ni calculé.
**Justification** : un ETA stocké ou estimé finit toujours par mentir (un
créneau plus lent ou plus rapide que la moyenne le rend faux), et une
promesse de temps non tenue est perçue comme une pénalité par le joueur —
contraire à l'objectif « file sereine ».
**Garde** : l'ensemble clos des clés publiques exposées par la file est
verrouillé par un test — tout ajout futur d'un champ de type ETA fera
rougir ce test, pour empêcher qu'une régression réintroduise la promesse de
temps par un chemin détourné.

**Décision — aucun worker d'expiration** : une entrée de la file d'attente
n'expire pas automatiquement.
**Justification** : une expiration automatique est une pénalité déguisée en
mécanique technique — elle retire au joueur une place qu'il n'a pas
explicitement quittée.

**Décision — purge datée au dernier instant connu** : quand une entrée
vivante doit être purgée, elle est marquée `'left'` avec la date du dernier
instant connu de son activité, jamais `now()`.
**Justification** : dater au moment du cron plutôt qu'au dernier instant
connu fabriquerait une statistique de temps d'attente inventée, mesurée au
matin du passage du job plutôt qu'au moment réel où le joueur a quitté la
file.

**Décision — console staff sans droit vitrine** : la console de gestion de
file est ouverte au caissier même sans l'entitlement vitrine (motif :
check-in), distincte de l'accès à la Vitrine elle-même.

**Décision — garde du scrutin public** : le scrutin public (page de la
file, pollée par le joueur) n'est ouvert que sur la branche
`not_in_queue` — un joueur déjà dans la file ne repasse pas par ce chemin
public, réduisant la surface interrogeable sans identité vérifiée.

**Conséquences** : `getQueuePublicState` reste accessible sans cookie sur
la branche `not_in_queue`, environ 4 requêtes non opposables à un seau
d'identité — écart assumé, voir ADR-032 et `docs/bugs.md` (notes du train).

**Références** :
- PR #162, migration `20261005120000`
- `docs/chantier-reserver-vitrine.md`

---

## ADR-112 — RES-4 : un tour offert par visite, pas par attente

**Date** : 2026-08-20 · **Statut** : acté (revue sécurité L7, finding F1)

**Contexte** : la Pause Chance était bornée à une par session d'attente, mais
une session naît avec chaque entrée en file : entrer → jouer → sortir →
recommencer renouvelait le tirage à volonté, le stock de la campagne restant
la seule borne réelle.

**Décision** : `wait_session_use_pause` refuse (`cooldown`, aucun jeton ne
voyage) s'il existe une autre session du même `player_key_hash` sur la même
file ou la même activité dont la Pause a été consommée depuis moins de 24 h.
La promesse produit devient « un tour offert par visite et par guichet »,
non « par attente ».

**Conséquences** : un client légitime qui revient le lendemain rejoue ; un
cycleur ne gagne rien de plus que sa première Pause — le seau est sérialisé
par verrou d'avis (org+empreinte+guichet), la course des sessions pré-armées
est fermée. « Par guichet » se lit au pied de la lettre : une file rattachée
à une activité et l'activité elle-même sont deux guichets (deux attentes
réelles), bornés par la configuration marchande. La config de retrait
(`collect_email`, `collect_phone`, TTL) descend de la campagne cible par
`wait_session_open` — le flux GAIN- reste le standard, sans régime parallèle.

**Références** :
- PR #163, migration `20261006120000`
- ADR-110, ADR-111 · `docs/chantier-reserver-vitrine.md`

## ADR-113 — L8 : la capacité en personnes et le format gelé

**Date** : 2026-08-20 · **Statut** : acté

**Contexte** : les Expériences Signature (Moment Signature, Atelier Duo)
partagent le même moteur que le socle Réserver — mêmes RPC, même verrou
d'avis — sans table ni jauge à elles. L'Atelier Duo casse l'équivalence
« une réservation = une place » : `reservations.party_size` porte le nombre
de personnes, et tous les comptages du module passent de `count(*)` à
`sum(party_size)` sous les verrous existants. Un format réglable à tout
moment (`reservation_activities.kind`) devient alors l'unité de comptage
lue à chaque appel — jamais figée au moment où un engagement est pris — ce
qui permet à un créneau de dépasser sa capacité sans qu'aucune contrainte
ne soit violée ni qu'aucune erreur ne s'affiche (revue du lot L8, sévérité
MOYEN).

**Décision** : le duo vaut deux places atomiques par les trois portes
(réservation directe, offre de liste d'attente, prise de l'offre) ; l'offre
de liste d'attente porte l'unité du format au moment de son émission ; le
trigger `reservation_activities_freeze_kind` refuse tout changement de
`kind` — y compris un PATCH PostgREST direct, hors serveur Next — dès qu'il
existe une réservation ou une attente vivante sur un créneau à venir, en
recomptant dans la transaction même de l'écriture. `updateReserverActivity`
garde son propre refus nommé (« N réservations et N attentes vivantes »)
en amont : le trigger est le plancher, l'action est ce qui se lit. Les deux
dérivent du même prédicat, écrit une fois dans
`reservation_activity_live_counts`.

Un second défaut, trouvé par l'E2E du lot (`e2e/reserver-signature.spec.ts`)
et non par lecture de code : `is_valid_experience_steps`, référencée dans un
`check` de `reservation_activities`, est évaluée avec les privilèges du rôle
qui écrit la ligne — pas sans contrôle, contrairement au commentaire qui
accompagnait son `revoke all`. Sans `grant execute` à `authenticated` et
`service_role`, tout insert/update sur `reservation_activities` portant des
étapes échouait en « permission denied for function
is_valid_experience_steps ». Le grant est rendu (migration
`20261008120000`) et épinglé par une assertion pgTAP
(`has_function_privilege('authenticated', 'public.is_valid_experience_steps(jsonb)', 'EXECUTE')`,
ACL-32 dans `supabase/tests/reserver.test.sql`) pour que la prochaine fois
soit gratuite.

**Justification** : figer `party_size` à l'émission de l'offre aurait
ajouté un second endroit où l'unité s'écrit — donc un second endroit où
elle diverge, l'inverse de ce que le lot cherchait. Convertir les lignes
existantes au changement de format surprend le commerçant sans qu'il ait
rien demandé. Refuser le changement tant qu'il y a des engagements vivants,
en nommant ce qui est compté, reprend le motif déjà retenu pour les gardes
destructives du dépôt (`deleteWheel`, `deleteCampaign`).

**Conséquences** : ce que le trigger ne ferme pas — une transaction
concurrente engagée après le snapshot de l'instruction — reste de l'ordre
de la microseconde, sur un geste manuel fait une fois par saison ; le
reprendre aurait demandé un verrou par créneau à venir sur un chemin qui
n'en connaît pas le nombre. Le précédent cité pour le grant EXECUTE
(`is_valid_progression_rule`, 20260805200000) n'a pas la même omission :
ses écritures passent par des RPC `security definer`, qui héritent
l'EXECUTE de leur propriétaire — `reservation_activities` s'écrit en
PostgREST direct sous `authenticated`, d'où le besoin du grant explicite.

**Références** :
- PR #164, migrations `20261007120000`, `20261008120000`, `20261009120000`
- ADR-109, ADR-112 · `docs/chantier-reserver-vitrine.md`

## ADR-114 — L9 : le stock qui se dérive et les bornes gravées

**Date** : 2026-08-20 · **Statut** : acté

**Contexte** : le Drop anti-gaspi (RES-5, lot L9) bloque un objet physique
jusqu'à une heure dite, à retirer en caisse. Ce n'est pas un second
mécanisme mais une offre dont la fenêtre de retrait est courte et proche :
une seule table (`reservation_stock_offers` / `reservation_stock_holds`),
un seul jeu de RPC, la même caisse universelle. La leçon retenue du lot L8
est explicite dans le fichier de migration : « l'arithmétique remplace la
compensation ».

**Décision** :
- Le restant se **dérive** — `stock_total` moins les prises vivantes, sous
  le verrou d'avis de l'offre — sans compteur dénormalisé. Une prise dont
  la fenêtre est passée cesse simplement d'être comptée : aucun job de
  restock, donc aucune occasion de restituer une unité deux fois.
- Le code de retrait `RESA-` devient la **10e famille** du registre
  universel de récompenses, routée par `redeem_reward_by_code` comme les
  neuf précédentes ; une seconde présentation rend `already_redeemed`.
- La dérivation des fonctions déjà vivantes en production
  (`sync_reward_issuance`) est appliquée par remplacement de motif dans le
  corps installé, verrouillé par une assertion qui compte les occurrences
  du motif avant patch (`v_hits <> 1` lève une exception si la fonction a
  changé) et vérifie après coup que la branche `reservation_stock_holds`
  est bien présente dans le corps installé — pour ne jamais migrer contre
  du code que la description ne décrit plus.
- Les **deux bornes de retrait sont gravées sur la prise**
  (`redeem_not_before`, `redeem_expires_at`), recopiées de la fenêtre de
  l'offre à l'instant du blocage et jamais relues ensuite : une fenêtre
  rééditée par le commerçant vaut pour les prises à venir, pas pour celles
  déjà consenties (doctrine de 20260904120000, appliquée aux deux bouts).
  La prise est possible dès que l'offre est `open`, y compris avant le
  début de la fenêtre ; le retrait ne l'est que dans la fenêtre.
- Le **pont d'identité** (`ensureProgressivePlayerIdentity`, 10e famille
  `experience_kind = 'reserver_stock'`) est posé **avant** l'appel RPC
  seulement quand l'offre est jugée servable sur une photo non verrouillée
  du restant (`offreServableAvantPont`). Quand cette photo ment — restant
  affiché à zéro pendant qu'une annulation concurrente libère l'unité —
  la RPC accorde quand même la prise, et le pont est reposé après coup ;
  le cas est compté (`reserver.stock_hold.pont_rattrape`) plutôt que
  silencieux.

**Justification** : le stock n'est jamais un compteur temps réel — le
commerçant saisit un nombre fini borné à 500, et ce nombre est la seule
vérité, un choix nommé par le cahier des charges pour éviter les ventes
doubles qu'une fausse promesse de synchronisation produirait. Le registre
reste un miroir qui ne décide jamais du stock, conformément à sa règle
fondatrice (20260805150000) : `reservation_stock_holds` est seule autorité.

**Conséquences** : `reserver.stock_hold.pont_rattrape` à zéro n'est pas la
preuve que la fenêtre de course n'existe pas — voir `docs/bugs.md`, le
compteur peut être incrémenté par un `already_held` non servable, donc ne
pas alerter dessus tel quel. La famille `reserver_stock` n'entre ni dans
`track_reward_issuance_analytics` ni dans `experience_economic_policies` :
elle n'est tirée au sort par rien et ne doit apparaître dans aucune
statistique de jeu — voir le bug analytics associé dans `docs/bugs.md`.

**Références** :
- PR #165, migration `20261010120000`
- ADR-112, ADR-113 · `docs/chantier-reserver-vitrine.md`

---

## ADR-109 §A4 — Amendement : la garde IP observe, le quota durci refuse (2026-08-21, revue L16)

**Constat.** §A4 nommait le seau IP-seule « protection réelle contre l'abus ».
À la livraison du socle (L16), cette garde a été posée en **observabilité pure**
(fail-open) — parce qu'ADR-032 interdit tout refus sur une clé partagée dans un
parcours public : l'IP d'un café est celle de toute la tablée, et un refus posé
dessus serait un interrupteur qu'un tiers allume en le saturant. La revue L16 a
relevé que trois commentaires justifiaient cette dégradation par une citation
de §A4 qui n'existait pas (M-1), et que le quota — devenu de fait la seule
garde de refus — était son propre levier de déni : vingt salles vides gelaient
la création pour les vrais clients à quarante requêtes par heure (E-1).

**Décision.**
1. La garde 1 de §A4 est actée **observatoire** : le seau `lobbyIp` compte,
   alerte, et ne refuse jamais. ADR-032 prime.
2. Le quota SQL est **durci** — seules les salles *habitées ou récentes*
   comptent (verrouillée, OU créée depuis moins de dix minutes, OU au moins
   deux membres) — mais **il ne ferme pas E-1, et il ne le fermera jamais**.
   La contre-revue l'a démontré chiffres en main : l'attaquant reçoit le
   `join_code` de sa propre salle, la rejoint avec un second cookie, la
   verrouille, et tient une place pour trois requêtes ; le déni se maintient à
   **~15 requêtes par heure**, moins cher que les 40 de l'attaque d'origine.
   La raison est structurelle et vaut d'être écrite une fois pour toutes :
   **aucun prédicat portant sur une appartenance attestée par cookie ne peut
   distinguer un attaquant qui frappe N cookies de N personnes.** Le levier
   n'est pas en SQL.
   **Ce qui est fait à la place** : rendre le déni COURT, VISIBLE et
   RÉVERSIBLE — TTL des salles verrouillées ramené de quatre heures à une
   heure (une partie dure quinze minutes), liste des salles actives dans le
   dashboard du commerçant, et geste de fermeture par salle. Vingt salles-squat
   se ferment en vingt clics au lieu de se subir.
   **Ce qui reste à trancher par le propriétaire** (porté au bilan, condition
   avant que L17/L18 publient l'entrée depuis la Vitrine) : Turnstile sur la
   création seule, ou seau `failClosed` par IP sur la création seule. Le second
   heurte ADR-032, mais la comparaison de rayon d'action n'avait jamais été
   posée — saturer ce seau coûterait « cette IP n'ouvre pas de salon pendant
   une heure », là où le déni actuel coûte « plus personne dans ce commerce
   n'ouvre de salon ». C'est cet arbitrage-là, et lui seul, qui referme E-1.
3. L'hôte dispose d'un **retrait par rang** (`kick_player_lobby`) : un porteur
   de code qui occupe les places se retire sans consommer le quota (M-2). C'est
   un retrait de place, pas un bannissement — le bannissement serait un autre
   arbitrage.
4. Les commentaires du code citent §A4 **verbatim ou pas du tout** ; toute
   tension entre deux ADR se tranche par amendement écrit, jamais par
   reformulation en commentaire.

**Pourquoi.** Une décision qui ne vit que dans un commentaire finit par être
relue comme la décision elle-même — c'est précisément ainsi que la prochaine
revue aurait refermé E-1 sans le voir. Le document de décision reste la seule
source ; le code le cite, il ne le réécrit pas.

## ADR-115 : Le train Vitrine et salons joueurs — ce qui a été tranché

**Date** : 2026-08-21
**Statut** : Accepté
**Contexte** : les huit lots L11 à L18 du train Réserver & Vitrine (ADR-109)
sont fusionnés et en production — la Vitrine publique bilingue (L11-L15) et
le socle lobby avec ses deux jeux, Duo Miroir et Portrait de la Bande
(L16-L18). Cet ADR clôt le train : il consigne les décisions structurantes
prises pendant l'exécution et ce que la vérification a trouvé que la lecture
seule n'aurait pas montré.

**Décision — traduction sans fournisseur.** L'adaptateur i18n de L11 reste
neutre : aucune IA payante, aucune clé Anthropic, DeepL écarté (son compte
est un geste propriétaire hors périmètre d'exécution autonome). Le français
est la langue de référence ; une traduction absente ou périmée replie sur le
FR plutôt que d'afficher un texte à moitié traduit. Confirme et clôt
l'arbitrage ouvert par ADR-109 « Décision traduction ».

**Décision — portes de publication en opt-in.** Réserver et le quiz ne
s'affichent sur la Vitrine que si le commerçant les active explicitement
(L13) ; le geste du commerçant EST le consentement, il n'existe pas d'ouverture
par défaut. Le même principe gouverne l'affichage des portes lobby ajoutées en
L17/L18 : elles ne s'affichent que chez les commerçants qui ont déjà ouvert
l'annuaire, ces lots ne l'ouvrent chez personne.

**Décision — QR contextuels par ancre, jamais par paramètre d'URL.** L'ISR de
la Vitrine (revalidate 60 s) rend une page par ancre de slug ; un QR encodé
avec un paramètre de requête casserait le cache statique à chaque scan. Les
QR imprimables de L12 pointent donc sur des ancres de route, pas des query
strings.

**Décision — identité par salle, jamais recousable.** Un joueur de lobby
(L16) n'a pas d'identité stable entre deux salons : son identité est locale à
la salle qu'il a rejointe, par construction, pour qu'aucune session ne
permette de relier deux parties d'un même joueur.

**Décision — le secret du vote est garanti « dès trois joueurs », pas avant.**
Portrait de la Bande (L18) a d'abord affirmé le secret du vote sans condition.
La revue a montré qu'à deux joueurs le secret n'existe pas : celui qui passe
sait que l'unique voix restante est celle de l'autre, qui le désigne donc de
fait. `bande_reveal` exige désormais `least(3, dénominateur)` réponses avant
de révéler, et le produit énonce le seuil du même mot partout, y compris à
l'éditeur commerçant avant qu'on propose le jeu.

**Décision — packs de plateforme en code, pas en table.** Les cinq packs de
questions de Portrait de la Bande (Entre amis, En duo, Équipe, Anniversaire,
Taquin) sont écrits en TypeScript et gardés par une garde de parité SQL⇄TS,
plutôt que stockés en table éditable — décision d'ADR-109 confirmée : le
contenu est un artefact de release, pas une donnée commerçante, et une garde
de contenu vérifie mot à mot les huit familles exclues du cahier.

**Ce que la vérification a trouvé que la lecture ne montrait pas.**

- **L'ISR qui n'existait pas.** La route `/v/[slug]/[[...langue]]` posait
  `revalidate = 60` sans `generateStaticParams` : Next ne préconstruit alors
  aucune page, et sans elle chaque requête retombe en rendu dynamique — l'ISR
  affichée dans le code ne s'exécutait jamais. Prouvé par le manifeste de
  build (`.next/server/app` ne contenait aucune page pré-rendue pour la
  route), pas par simple lecture du fichier.
- **La course du scrutin.** Sur `bande_reveal`, un tic de minuterie déclenché
  côté client pouvait partir avant la pose du verrou serveur et revenir après
  lui — un « déjà révélé » écrasé par un révélateur tardif. Fermé par
  transaction verrouillée en base, pas par un délai côté client.
- **L'hôte qui désanonymisait les votes un par un.** Avant le plancher de
  3 réponses (revue L18, E-1), l'hôte votait, regardait le compteur passer à
  deux, révélait, puis retranchait mentalement sa propre voix pour connaître
  le choix exact du voisin qu'il venait de voir taper — six fois par partie,
  sans qu'aucun test ne le signale puisque le mécanisme livré fonctionnait
  « comme prévu ». `bande_reveal` refuse désormais sous le plancher.
- **Le `is distinct from` qui aurait rouvert la brèche que son propre remède
  fermait.** Un correctif de garde écrit avec `is distinct from` au lieu de
  `is not null and <>` traitait `null` comme distinct de la valeur interdite
  — donc silencieusement permissif sur exactement le cas que la garde
  existait pour fermer. Trouvé en confrontant la garde à une valeur `null`
  explicite en pgTAP, pas en la relisant.

**Reste ouvert** (voir `docs/bugs.md`) : LOBBY-1 (Turnstile posé, non armé —
clés de production à poser par le propriétaire, geste déjà requis pour
Réserver depuis L4) ; aucun mécanisme de présence dans les salons, l'hôte doit
clore chaque question lui-même ; `robots: index false` sur la Vitrine, décision
de commerce en attente ; les cinq packs de questions Portrait de la Bande
attendent la relecture du propriétaire.

**Références** :
- ADR-109 (plan de lots), ADR-110/111/113/114 (RES-2/RES-3/L8/L9)
- `docs/chantier-reserver-vitrine.md`
- `docs/roadmap.md` V1.64
- `docs/bugs.md` LOBBY-1

---

## ADR-116 — Une clé d'octroi par produit : Réserver, Duo et Bande se détachent de la Vitrine

**Date** : 2026-08-22 · **Statut** : acté

**Contexte** : le train Vitrine (ADR-109, clos par ADR-115) avait posé une
règle unique — « UN seul entitlement les porte toutes les trois » — recopiée
en tête de la migration `20261001120000`, qui annonçait elle-même le jour où
l'une devrait s'en détacher. Ce jour est arrivé par une demande du
propriétaire, après le train de dix-neuf lots : mettre le back-office à jour
avec ce qui a été livré. Deux décisions ont été prises en cours de route —
couverture checklist complète des quatre modules, et une clé d'octroi par
produit — et c'est la seconde qui structure ce chantier (PR #176, branche
`chantier/cle-par-produit`, 4 commits). Mesuré au catalogue SQL **vivant**, et
non aux fichiers de migration qu'une redéfinition ultérieure rend muets :
quinze fonctions interrogeaient `org_has_module_access(…, 'vitrine')`, pour
seize appels — les douze portes de Réserver (activités, files, offres de
stock, attente active), et trois fonctions propres à la Vitrine
(`create_player_lobby`, `vitrine_dashboard_state`, `vitrine_public_state`,
cette dernière deux fois). La liste de départ du chantier n'en citait que
cinq ; les sept autres avaient été écrites par des migrations plus anciennes
et jamais recopiées depuis. Sous une seule clé, un commerçant ne pouvait ni
ouvrir Réserver sans la Vitrine, ni faire facturer un jeu à part, et
l'opérateur de back-office lisait un libellé qui n'annonçait que deux
surfaces sur les cinq réellement gouvernées.

**Décision** :
- Trois clés neuves — `reserver`, `duo`, `bande` — avec leurs colonnes
  `addon_reserver` / `addon_duo` / `addon_bande`, miroirs exacts d'
  `addon_vitrine` (migration `20261020120000_cle_par_produit.sql`). `vitrine`
  ne porte plus que la page publique et les salons ; les douze portes de
  Réserver et la porte Duo de `vitrine_public_state` sont converties.
- La vraie difficulté de ce lot n'est pas la migration, c'est le
  **remplissage rétroactif** : toute organisation détenant déjà `vitrine` —
  par addon ou par octroi daté — reçoit les trois droits neufs dans la même
  transaction, aux mêmes bornes. Sans ce remplissage, des commerçants réels
  auraient perdu Réserver, Duo et Bande à la seconde où la migration
  s'applique.
- Le remplissage est écrit comme **fonction cataloguée**
  (`mirror_vitrine_entitlements()`), pas en ligne : pgTAP s'exécute après les
  migrations et ne peut donc pas fabriquer un « avant ». En extrayant le
  geste en fonction, le test rejoue *le* code du remplissage, et non une
  copie qui lui ressemble — c'est la forme de détecteur muet que ce dépôt
  s'est déjà fait prendre plusieurs fois. La fonction reste au catalogue pour
  cette seule raison, sans privilège pour aucun rôle applicatif.
- La fonction **refuse de s'exécuter** — elle lève — si un octroi `vitrine`
  d'origine Stripe existe. Un acte de back-office ne peut pas recopier un
  droit que Stripe gouverne et révoque par webhook : trois miroirs que
  Stripe ignorerait survivraient à la fin de l'abonnement. Aucun octroi de
  ce genre n'existe aujourd'hui (aucun produit Stripe ne pilote `vitrine`) ;
  si cela change un jour, un déploiement qui s'arrête en le disant vaut
  mieux qu'un sur-octroi silencieux et perpétuel.
- Sa garde d'unicité (éviter de miroiter deux fois le même octroi) compare
  les bornes par `is not distinct from`, pas par `<>` : avec `<>`, deux
  octrois partageant un `ends_at` nul auraient été vus comme distincts et
  miroités deux fois. C'est la leçon déjà payée en L17 (ADR-115, garde
  `is distinct from` qui rouvrait la brèche que son propre remède fermait),
  reproduite ici volontairement dans le sens correct.
- **Principe des gardes : additives, jamais en substitution.**
  `create_player_lobby` garde `vitrine` et ajoute la clé du jeu demandé
  (`duo` ou `bande` selon `p_kind`) dans le même `if`, donc le même refus —
  l'indistinguabilité des quatre motifs de refus (organisation inconnue, pas
  de droit vitrine, vitrine non publiée, pas de droit du jeu) tient par la
  structure, pas par un accord entre branches.
- **Arbitrage sur Duo et Bande** : leur éditeur commerçant (le réglage du
  plateau, avant toute salle) reste gardé par le seul droit `vitrine`, pas
  par leur clé propre. Motif : régler un plateau est une **préparation**, et
  la doctrine du dépôt met le verrou payant sur la **publication** ; pour un
  salon, l'équivalent de la publication est son **ouverture**
  (`create_player_lobby`), déjà gardée par la clé du jeu en SQL. Exiger
  `duo` dès l'édition mettrait un péage sur l'essai, avant même de savoir si
  le commerçant veut ouvrir un salon.
- **Ce qui n'a pas été fait, et pourquoi** : rien de ce train n'est
  achetable en ligne. `vitrine` et `reserver` sont absents de toute offre
  d'abonnement et de tout catalogue d'add-ons Stripe, exactement comme
  `addon_vitrine` l'était déjà — le seul chemin d'octroi reste le
  back-office pendant la bêta. Rendre l'une de ces clés vendable exigerait
  de créer un produit et un prix Stripe : un geste propriétaire, hors du
  périmètre de ce lot.

**Justification** : une seule clé pour cinq surfaces empêchait toute
tarification différenciée et forçait un commerçant intéressé par Réserver
seul à recevoir (ou attendre) la Vitrine entière. Détacher les clés rend
chaque produit facturable et coupable séparément, sans toucher à la forme
des réponses publiques : les portes de `vitrine_public_state` restent
toujours présentes (quatre listes, jamais absentes), seul leur contenu se
vide quand le droit du produit qu'elles ouvrent manque — une porte annoncée
vers un module fermé serait une promesse rompue faite à un client qui lit la
page pendant son repas.

**Conséquences** : une organisation peut désormais publier sa Vitrine avec
le seul droit `vitrine`, et la page servie n'affichera aucune porte Réserver
ni Duo — avant ce lot, « vitrine publiée » impliquait « Réserver ouvert »,
les deux faits sont maintenant séparés. Le mode de défaillance reste
« moins de portes », jamais « plus de droits ». Aucun trigger de publication
n'est ajouté pour `reserver`, `duo` ou `bande` : aucune ressource « publiée »
de Duo ou de Bande n'existe (les salons naissent par une RPC déjà gardée),
et les ressources de Réserver n'en ont jamais porté non plus — leur en poser
un serait une restriction nouvelle sur le geste des commerçants, hors de ce
lot. `vitrine_dashboard_state` (le tableau de bord) continue de garder
`vitrine` seule et rend un booléen unique : si l'écran commerçant doit un
jour distinguer Réserver / Duo / Bande, il lui faudra plus d'un booléen —
c'est un changement de forme laissé à un futur lot. Deux dettes de couverture
ont été fermées dans la foulée du même chantier (voir `docs/bugs.md`) : la
pastille des files d'accueil qui ignorait l'activité coupée, et une garde de
parité TypeScript⇄SQL (`module-access-parity.test.ts`) dont l'ancre de
migration pointait une définition périmée d'`org_has_module_access` pour la
troisième fois.

**Références** :
- ADR-109 §A1 (arbitrage initial « une seule clé »), ADR-115 (clôture du
  train Vitrine)
- Migration `20261020120000_cle_par_produit.sql`
- PR #176, branche `chantier/cle-par-produit`
- `docs/roadmap.md` (back-office à jour)
- `docs/bugs.md` (pastille files d'accueil, garde de parité, Duo sous 2
  fiches, échec local de `supabase db reset`)

## ADR-117 — Sur Place : la cinquième offre, et les quatre droits que le webhook refusait

**Date** : 2026-08-22 · **Statut** : acté

**Contexte** : quatre produits étaient livrés, en production, gardés par leurs
propres droits serveur depuis la PR #176 — et invendables. `vitrine`,
`reserver`, `duo` et `bande` ne figuraient dans aucune offre de `PLAN_TIERS`
ni dans `ADDON_OFFERS` ; le seul chemin d'octroi restait le back-office, ce
que la roadmap V1.65 assumait explicitement (« un produit et un prix Stripe
étant un geste propriétaire hors périmètre de ce lot »). Dix-neuf lots,
dix-neuf migrations, dix-neuf PR — zéro euro.

Un audit tarifaire demandé par le propriétaire a d'abord proposé de créer une
seconde ligne de produit à cinq offres, avec les tarifs de jeu revus à la
hausse (29/69/99). **Le relevé concurrentiel a invalidé cette moitié-là** :
le jeu au QR se vend 9,90 €/mois (QronoPlay), la fourchette du marché SaaS va
de 10 à 100 €, et la fidélité commerce plafonne à 49 € (Loyeo, Zerosix). Les
tarifs de jeu étaient déjà dans le haut de leur marché ; les monter aurait été
excessif. Le propriétaire a tranché : **on ne touche pas aux tarifs de jeu**.

**Décision** — une cinquième offre, et deux options remises à plus tard.

1. **`place` / « Sur Place », 79 €/mois** = socle + `vitrine` + `reserver` +
   `duo` + `bande` + `quiz`. Le prix est exactement 29 + 20 + 30, sans remise :
   la grille reste calculable de tête, ce qui était la demande explicite
   (« comment on pourrait articuler tout ça plus simplement ? »).
2. **La Totale absorbe les quatre droits SANS changer de prix** (129 €).
   Décision propriétaire, assumée comme une baisse relative. Elle rend surtout
   son sous-titre à nouveau vrai : « toute la plateforme » serait devenu faux
   le jour où Sur Place a existé.
3. **Le nom est commercial, l'identifiant est définitif.** `place` part dans
   `organizations.plan` et sert de clé au price Stripe. « Sur Place » a été
   arrêté après trois candidats — « La Table » a été écarté parce qu'il
   enfermait dans la restauration, alors que la même formule sert un salon de
   coiffure, un institut ou un garage. Le nom peut encore bouger ; l'id, non.
4. **Les options Vitrine (+20 €) et Réserver (+30 €) ne sont pas dans ce lot.**
   Elles demandent deux corrections que Sur Place n'exige pas : voir « ce qui
   reste ouvert » plus bas.

**Ce que la vérification a trouvé, et que la lecture avait manqué.** Le
document d'audit affirmait « aucune migration nécessaire : les colonnes
d'octroi existent depuis `20261020120000` ». **C'était faux, et le défaut
n'aurait pas été borné au produit neuf.**
`apply_stripe_subscription_event_v2` porte deux listes fermées :
`p_plan_id not in ('starter','core','engagement','live','full')` et
`if not v_entitlements <@ v_allowed`, ce dernier sur neuf valeurs. Le premier
abonnement vendu — Sur Place **comme** La Totale — aurait levé une exception.
Or un webhook qui échoue est rejoué par Stripe trois jours durant, puis le
point d'entrée est désactivé : la synchronisation des abonnements **existants**
serait tombée avec lui.

**Ce qui a été vérifié avant d'écrire plutôt que supposé.** Élargir l'`update`
aux quatre colonnes écrit `false` chez tout abonné qui n'est ni sur Sur Place
ni sur La Totale — en apparence, une révocation de masse. Deux constats
ferment le risque : (1) les quatre colonnes sont nées `not null default false`
et **aucun chemin ne les écrit** — le `grep` sur `src/` ne rend que des
`select` — donc y réécrire `false` est un no-op ; (2) le back-office n'accorde
pas par ces colonnes mais par `organization_module_grants`, et
`org_has_module_access` répond « colonne OU octroi vivant » : un accès offert
survit intact, c'est la moitié de la disjonction que la migration ne touche
pas.

**Trois conséquences structurelles.**

- **`duo` et `bande` entrent dans l'union `Entitlement`.** Ils étaient
  `GrantableModule` sans être des droits — asymétrie tenable tant que le seul
  chemin était l'octroi manuel, intenable dès qu'une offre les déclare, le
  webhook ne faisant passer les droits d'une offre que par `Entitlement`.
- **`MODULE_CATALOG` : le second registre qui manquait.** Les deux gardes de
  `plans.test.ts` — « aucun droit hors du catalogue produit » et « aucune offre
  sans expérience listée » — tiraient leur vocabulaire du seul
  `EXPERIENCE_CATALOG`. Elles refusaient donc une carte de restaurant, faute
  d'un `kind` jouable. Le registre décrit ce qu'une offre peut CONTENIR, dont
  les expériences ne sont qu'une moitié ; `describeTier` lit désormais les deux.
- **`protect_stripe_managed_entitlements` suit les colonnes qu'il garde.** Il
  en énumérait huit ; le webhook en écrit douze. Laisser les quatre neuves
  dehors n'aurait produit aucun défaut immédiat — rien ne les écrit — mais une
  asymétrie invisible : Stripe ferait autorité sur des colonnes que le
  garde-fou ne défendrait pas, et le premier écran de back-office à les
  basculer serait écrasé au prochain événement sans explication.

**Un arbitrage de portée pris pendant l'écriture** : `quiz` est dans Sur Place.
La Vitrine porte une porte quiz depuis le lot L13 ; la vendre sans le droit
aurait livré une page dont un bouton configurable mène à un refus — le
commerçant l'aurait ouvert, pas le joueur. Sans effet sur l'échelle :
`cheapestTierFor("quiz")` reste Le Club, à 59 €.

**Ce qui reste ouvert.**

- **Les deux options mensuelles** exigent d'abord un `subscriptions.update`
  posant l'option comme LIGNE de l'abonnement en cours. Aujourd'hui
  `createAddonCheckoutSession` ouvre une session en `mode: "subscription"` avec
  un seul `line_items`, ce qui crée un abonnement **séparé** — le fichier le
  dit lui-même — et aucun `subscriptions.update` n'existe dans `src/`
  (zéro occurrence). Un commerçant qui prend Passeport **et** Parrainage a donc
  déjà deux prélèvements à deux dates. Elles exigent aussi qu'un seul prix
  Vitrine ouvre TROIS colonnes, `AddonOffer.entitlement` étant singulier.
- **Le produit et le prix Stripe en mode live.** La clé `rk_live_` de la CLI
  n'a ni `product_write` ni `feature_write`, et c'est celle dont
  `docs/chantier-audit-2026-08-16.md` demande la révocation : élargir ses
  permissions irait contre cette consigne.

**Références** :
- Migration `20261021120000_offre_sur_place.sql`
- Branche `chantier/packaging-sur-place`
- `src/lib/plans.ts` (`PACKAGING_VERSION` → `2026-08-b`),
  `src/platform/experiences/catalog.ts` (`MODULE_CATALOG`),
  `src/platform/experiences/contract.ts` (`duo`, `bande`)
- Relevé concurrentiel du 2026-08-22 : Zenchef 129/169/249 €, TheFork ~139 € +
  2 à 2,60 €/couvert, ClickTable 29/69/149 €, Restomatik 49/79/109 €,
  Resatable 39 €, ViteUneTable dès 29 € (anti no-show 49 € en option),
  Guestonline 17 €, Planity 74/94/114 €, MenuOnline 49 € + 595 € d'entrée,
  Loyeo 0/29/49 €, Zerosix 49 € + 190 €, QronoPlay 9,90 €.

## ADR-118 — Les options de lieu : une ligne de l'abonnement, jamais un second

**Date** : 2026-08-22 · **Statut** : acté

**Contexte** : ADR-117 a livré l'offre Sur Place et laissé les deux options
Vitrine (+20 €) et Réserver (+30 €) hors périmètre, pour une raison précise.
`createAddonCheckoutSession` vend un mensuel en ouvrant une session Stripe en
`mode: "subscription"` avec un seul `line_items` — ce qui crée un abonnement
**séparé**. Le commentaire du fichier le dit lui-même, et `grep` confirmait
l'autre moitié : **aucun `subscriptions.update` n'existait dans `src/`**, zéro
occurrence. Ce n'était pas une lacune théorique : un commerçant qui prenait le
Passeport *et* le Parrainage recevait déjà deux prélèvements, à deux dates, sur
deux factures, et devait résilier deux fois.

**Décision** — une option est un **item** de l'abonnement en cours.

1. **`toggleSubscriptionOption`** (`src/actions/billing.ts`) modifie
   l'abonnement existant plutôt que d'en ouvrir un second, avec
   `proration_behavior: "create_prorations"` dans les deux sens : une option
   ajoutée le 20 n'est facturée que pour ses onze jours, une option retirée
   rend le reste en avoir. L'action n'écrit **rien** en base — Stripe émet
   `customer.subscription.updated`, le webhook relit la photographie complète
   des prix et `resolveStripeEntitlements` en dérive les droits. Écrire ici
   aussi créerait un second juge.
2. **Pas d'abonnement, pas d'option.** Refus délibéré et commercial : ces deux
   options se vendent « sur Coup d'envoi, Le Club ou Le Grand Jeu ». Les ouvrir
   seules donnerait le socle à 20 €, alors qu'il en coûte 29.
3. **Le tunnel autonome leur est fermé** (`resolveAddonCheckout`), et le refus
   tient au **modèle de vente**, pas à une variable manquante — le test pose
   exprès un `STRIPE_PRICE_ID_PASS_VITRINE` pour le prouver. Une garde qui ne
   tient qu'à l'absence de configuration cède le jour où quelqu'un configure.

**Trois coutures que la lecture seule n'aurait pas trouvées.**

- **`MODULES_PORTANT_LE_SOCLE` dérivait du catalogue entier.** Y faire entrer
  Vitrine aurait fait porter le socle payant à *tout* octroi vitrine — y compris
  ceux que le back-office accorde **gratuitement** en bêta. C'est mot pour mot
  le défaut MOYEN-2 que le lot L2 avait fermé. La sortie n'est pas d'exclure
  ces deux-là à la main mais de nommer la propriété qui compte : `soldStandalone`
  sur l'offre. `MODULES_AVEC_OFFRE` reste le catalogue entier — le back-office
  y gagne d'ailleurs de pouvoir accorder Vitrine en pass différé, ce qu'il
  refusait — et seul `MODULES_PORTANT_LE_SOCLE` se restreint aux huit
  achetables seules.
- **Un prix Stripe désigne un droit — sauf un.** La PR #176 a détaché `duo` et
  `bande` de `vitrine` en trois colonnes, alors que le commerce n'a jamais
  vendu que « la carte et les jeux qui vont avec ». D'où `alsoGrants` sur
  l'offre, expansé dans `resolveStripeEntitlements`. Sans lui, le commerçant
  aurait payé sa Vitrine et trouvé les deux jeux fermés — un défaut **muet**,
  puisque le paiement, lui, aurait réussi.
- **`ADDONS_PURCHASABLE_STANDALONE` a cessé d'être vrai.** Le booléen global
  promettait « tout add-on est achetable seul ». Il est désormais **dérivé**,
  donc il dit la vérité au lieu de la promettre — et l'éditorial du site, qui
  s'appuyait sur un ternaire tout-ou-rien, distingue maintenant les deux
  familles.

**Ce que le lot ne fait pas.** Aucune migration : les droits passent par
`ADDON_PRICE_ENV`, que `20261021120000` a déjà rendu inscriptibles. Et aucune
vente n'est ouverte tant que `STRIPE_PRICE_ID_ADDON_VITRINE` et
`STRIPE_PRICE_ID_ADDON_RESERVER` ne sont pas posées : l'écran affiche alors
« pas encore en vente en ligne » plutôt qu'un bouton qui échoue.

**Références** :
- `src/actions/billing.ts` (`toggleSubscriptionOption`),
  `src/lib/stripe.ts` (`findOfferSubscription`, `getAddonLinePriceId`,
  expansion `alsoGrants`), `src/lib/plans.ts` (`soldStandalone`, `alsoGrants`),
  `src/lib/subscription.ts` (`MODULES_PORTANT_LE_SOCLE`),
  `src/lib/octroi-checkout.ts` (fermeture du tunnel),
  `src/components/dashboard/option-abonnement.tsx`
- Branche `chantier/options-lieu`

## ADR-119 — Duo Miroir et Portrait de la Bande deviennent des jeux du socle

**Date** : 2026-08-22 · **Statut** : acté

**Contexte** : demande du propriétaire — « que ce soit considéré comme des jeux
en plus, produit ». Les deux salons étaient dans Sur Place et La Totale
seulement, vendus comme un supplément de la Vitrine (`alsoGrants`, ADR-118).
C'était leur histoire, pas leur nature : ils sont nés sous le droit `vitrine`
au lot L17, et la PR #176 les en avait détachés en colonnes sans les détacher
en produit.

**Ce que la lecture du catalogue ne montrait pas.** Les changer d'offre
n'aurait rien changé : **trois attaches** liaient les salons à la Vitrine, et
le catalogue n'en était qu'une.

1. `create_player_lobby` exigeait le droit `vitrine` — et, **en plus**, une
   ligne `vitrine_settings` **publiée**.
2. L'adresse joueur est `/lobby/nouveau/[slug]`, où `slug` était résolu par
   `resoudreCommerceLobby` **depuis `vitrine_settings`**. Sans carte publiée,
   il n'existait aucune URL pour atteindre le jeu.
3. La surface commerçant — QR, supervision des salons — vivait dans
   `/dashboard/vitrine`, qui rend `notFound()` sans le droit `vitrine`.

Une boulangerie sur Coup d'envoi aurait donc eu Duo Miroir « inclus » dans son
offre et **strictement injouable**. C'est la définition d'une demi-livraison,
et c'est ce qui a fait de ce lot un chantier plutôt qu'une ligne de catalogue.

**Décision** — les quatre attaches tombent ensemble.

1. **Catalogue** : `duo` et `bande` entrent dans `core`, donc dans les cinq
   offres (packaging `2026-08-c`). Sur Place cesse de les annoncer : elle ne
   vend plus que ce qui lui est propre.
2. **SQL** (`20261022120000`) : `create_player_lobby` ne garde que le droit du
   jeu, dérivé de `p_kind`. La garde `vitrine` et l'exigence de vitrine publiée
   disparaissent. La migration `20261020120000` l'avait annoncé mot pour mot :
   « on ajoute un cran, dérivé de `p_kind`, que l'opérateur pourra desserrer
   seul le jour où il vendra les salons sans la Vitrine ».
3. **Adresse** : `resoudreCommerceLobby` se replie sur `organizations.slug`
   quand aucune vitrine publiée ne répond. **L'ordre compte** — la vitrine
   d'abord, parce que c'est l'adresse déjà imprimée sur les QR, et la faire
   passer après changerait la page servie à un client qui scanne.
4. **Surface** : `/dashboard/salons/[jeu]`, gardée par `capacitesDuModule(jeu)`
   et non par le droit vitrine. Elle réutilise `PublicShare` (QR, copie,
   téléchargement) et `SalonsOuverts`.

**La navigation change de rangement, à la demande du propriétaire.** Un groupe
« Vos applications » accueille Vitrine et Réservations ; les deux salons
rejoignent « Vos animations », auprès de la roue et des jeux rapides. Vitrine
et Réservations n'y avaient leur place que faute d'ailleurs où aller : l'une
publie un catalogue, l'autre tient un carnet de rendez-vous — ce ne sont pas
des animations, et les mêler aux jeux obligeait le commerçant à relire toute la
liste pour trouver ce qu'il ouvre plusieurs fois par service.

**`alsoGrants` est retiré, un lot après avoir été posé.** Il existait pour que
le prix Vitrine ouvre trois colonnes. Les salons étant désormais dans toutes
les offres, ce mécanisme ne peut plus rien ouvrir : il ne garderait plus que le
vide. Le retirer suit la doctrine du dépôt — une garde qui ne garde plus rien
finit par empêcher ce qu'elle protégeait.

**Ce qui n'est pas perdu.** Le corps de `create_player_lobby` est repris
caractère pour caractère : quota par organisation, verrou d'avance, fenêtre
« habité ou récent », invariant « l'hôte est membre de son lobby »,
indistinction des refus. Ce que `published` gardait — « on ne s'ouvre pas sur
une adresse que le commerçant n'a pas ouverte » — reste vrai sur la branche
vitrine et n'a plus d'objet sur l'autre : un slug d'organisation n'est pas une
page qu'on publie, c'est l'identité du commerce, et la porte est le droit du
jeu, qui vient d'un abonnement actif.

**Références** : migration `20261022120000_salons_sans_vitrine.sql`,
`src/lib/plans.ts`, `src/lib/lobby-context.ts`,
`src/app/dashboard/salons/[jeu]/page.tsx`, `src/components/dashboard/nav.tsx`,
`src/app/dashboard/layout.tsx`. Branche `chantier/salons-jeux-de-base`.

---

## ADR-120 — Un générateur de questions sans migration : le sondage et le pronostic passent par le `preset`

**Date** : 2026-08-28
**Statut** : Accepté
**Contexte** : le commerçant devait écrire chaque question à la main. Une soirée
d'une heure, c'est une centaine de questions saisies une par une — le module
Quiz était livré, et inutilisable pour son cas d'usage le plus évident. La
demande ajoutait trois natures de contenu : question notée, **sondage** (un
avis) et **pronostic** (un pari).

### Décision 1 — La banque est de la DONNÉE, le tirage est du CODE

`src/lib/quiz-banque-questions.ts` porte 240 questions sur 12 thèmes ;
`src/lib/quiz-banque.ts` porte les types, le tirage et la conversion durée ↔
nombre. Relire une réponse fausse n'oblige jamais à rouvrir la logique, et le
moteur reste testable sans dépendre du volume du catalogue.

**Ce qui garde la banque** : toutes ses questions repassent, en test, par le
schéma RÉEL de création (`createQuizQuestionSchema` et
`createEventQuestionSchema`). Une bonne réponse hors options, une tolérance sur
un type qui n'en accepte pas, deux variantes libres équivalentes après
normalisation SQL : tout tombe dans la suite, pas devant le joueur.

### Décision 2 — Sondage et pronostic sont des `preset`, pas des types moteur

**Aucune migration.** `quiz_questions.preset` n'est contraint qu'en FORME
(`^[a-z][a-z0-9_]{1,39}$`) et `points` accepte déjà 0 : deux modèles d'interface
de plus (`sondage`, `pronostic`) suffisent, et `quizPresetSansVerite` porte
seule les trois conséquences — pas de saisie de résultat officiel, 0 point,
aucune correction affichée.

**Écarté** : ajouter un type moteur `poll` au quiz. Il aurait demandé une
migration, un nouveau chemin dans `submit_quiz_answer` et un affichage de
répartition (donc une RPC d'agrégation) — pour un besoin que le `preset`
couvre déjà. La colonne `correct_answer` étant `not null`, un sondage porte la
première proposition comme vérité **de forme** : jamais affichée, jamais
comparée à l'écran, et sans effet sur le score puisque `points` vaut 0.

**Limite assumée** : le quiz n'affiche donc PAS encore la répartition des avis
(« 62 % ont répondu Vrai »). Elle demande une agrégation en base, et c'est un
lot à part entière. Le Mode événement live, lui, l'a déjà nativement.

### Décision 3 — Le barème d'un pronostic diffère entre les deux modules

Dans le **quiz**, un pronostic vaut 0 point : le quiz corrige à l'instant, rien
ne peut arbitrer plus tard un pari sur la soirée. Dans le **live**, il rapporte
— l'animateur désigne l'option gagnante au reveal
(`session.prono_correct_option_id`), le schéma `event_questions` connaissant
nativement les trois natures (`quiz` / `poll` / `prono`). Pour un pronostic
arbitré après coup **hors soirée**, le module Pronostics reste l'outil.

### Décision 4 — L'aperçu EST le tirage

Le composant appelle `genererQuestions` (pur, déterministe pour une graine), et
la server action **rejoue le même calcul** avec la graine reçue. Le client
n'envoie jamais de questions : seulement des critères. Deux propriétés d'un même
choix — ce que le commerçant valide est exactement ce qui s'écrit, et un appel
direct à l'action ne peut pas injecter de contenu arbitraire.

Un aperçu « représentatif » mais différent aurait été pire que pas d'aperçu du
tout : on aurait fait valider autre chose que ce qui était lu.

### Décision 5 — La durée est une estimation, et le manque est dit

Le chronomètre d'une question est un **plafond**, pas une durée :
`PART_CHRONO_CONSOMMEE` (0,75) porte l'hypothèse à un seul endroit, avec le
temps de lecture et celui de la correction. L'écran annonce « environ ».

Un seul thème coché ne porte qu'une vingtaine de questions. Demander une heure
là-dessus est légitime, et la seule réponse honnête est de dire combien il en
manque et quoi faire (cocher d'autres thèmes, accepter plus difficile,
raccourcir) — jamais de rendre une partie plus courte en silence.

### Décision 6 — Le partage sort du milieu de la partie

Le bouton « Défier un ami » était rendu en bas de la page publique du quiz **à
tous les états**, y compris sous la question en cours, où il ressemblait à un
bouton de cette question et concurrençait « Valider ma réponse ».

**Corrigé une première fois, et mal** (2026-08-28, même jour) : le bloc a été
MASQUÉ pendant la partie. Le propriétaire l'a signalé aussitôt — le joueur qui
veut faire tourner le quiz le veut justement *au moment où il s'amuse*, pas
seulement avant d'avoir commencé.

**La bonne réponse n'est ni « toujours » ni « jamais », mais « toujours, à un
autre endroit »** : le partage reste accessible dans tous les états, avec deux
variantes — `carte` quand il est le sujet de l'écran (avant de commencer,
l'invitation ; après la partie, le défi) et `discret` pendant la partie, en
**pied de page** : un filet, une marge franche, un bouton secondaire, et
l'adresse repliée tant que le presse-papiers fonctionne. Le seul interrupteur
qui le fait disparaître reste celui du commerçant (`quizzes.share_enabled`).

**Ce que cette double erreur a changé au code** : la décision ne vit plus dans
un `&&` du rendu mais dans `vuePartageQuiz` (`quiz-partage-etat.ts`), fonction
pure et testée — miroir d'`event-view-state.ts`. Un `&&` n'avait aucun test, et
c'est exactement ce qui a laissé passer les deux erreurs successives.

`PartageLienJeu` remplace le bouton nu et **affiche l'adresse** : `navigator.
share` n'existe pas sur un ordinateur de bureau et le presse-papiers échoue en
silence sous certaines permissions — un champ en lecture seule reste utilisable
dans tous les cas. Le même bloc est posé côté Mode événement live, à l'écran de
saisie et dans le salon d'attente : le QR géant de l'écran de salle suppose
qu'on soit DANS la salle, alors qu'une soirée entre amis se joue à distance.

**Références** : `src/lib/quiz-banque.ts`, `src/lib/quiz-banque-questions.ts`,
`src/components/dashboard/generateur-questions.tsx`,
`src/components/partage/partage-lien-jeu.tsx`,
`src/components/quiz/quiz-presets.ts`.

---

## ADR-121 — Le Ticket d'Or se scanne, et le gain survit à un rechargement

**Date** : 2026-08-28
**Statut** : Accepté
**Contexte** : le staff lisait dix caractères à voix haute et le client les
tapait. Dix caractères dictés dans le bruit d'un comptoir, c'est une faute de
frappe par client — et chaque faute rendait « ce ticket ne mène nulle part ».

### Décision 1 — Le QR porte l'URL, le code reste dessous

L'écran d'émission montre un QR de `${APP_URL}/ticket/CODE`, grand, scanné
depuis l'autre côté du comptoir. Le code écrit **reste affiché sous le QR** :
un QR suppose un appareil photo qui marche, assez de lumière et une main libre.
Le retirer aurait rendu le jeu impraticable les jours où le scan ne prend pas.

**Aucun droit nouveau** : le QR ne transporte que l'URL publique du ticket,
c'est-à-dire le code déjà affiché. L'usage unique reste tenu en base (`tire_le`
posé sous verrou), l'émission exige toujours `is_org_member`, et rien n'est
réaffiché après coup.

### Décision 2 — Le tirage reste un GESTE, pas un chargement

**Écarté** : tirer automatiquement à l'ouverture de la page, pour que le client
« voie de suite ». Un `GET` qui consomme le ticket est consommé par un
préchargement de navigateur, un antivirus qui suit les liens, un aperçu de lien
dans une messagerie ou un retour arrière — le client aurait « joué » sans rien
toucher, sans aucun moyen de le prouver. Le passage au QR n'affaiblit pas cet
argument, il l'aiguise : une URL scannée circule.

Le doigt sur le bouton n'est pas une friction, c'est le **geste de grattage** :
scanner, voir un ticket doré, appuyer, savoir. Une manipulation au lieu de dix
caractères à taper — c'est bien « de suite ».

### Décision 3 — Le gain est mémorisé sur l'appareil du client

`tirer_ticket_or` ne rend le lot et le code de retrait **qu'une fois** : le
second appel rend `deja_tire`, sans rien d'autre. Tenable quand on lisait un
code au comptoir ; plus du tout au QR, où l'écran se perd tout le temps — on
bascule vers ses SMS, l'écran se verrouille, le navigateur de l'appareil photo
recharge l'onglet. Le client relisait « ce ticket a déjà été ouvert » alors
qu'il venait de gagner, sans plus aucun moyen de lire son code.

Le résultat est donc mémorisé en `localStorage`, sur **son** appareil :
 · il ne contient que ce que le serveur lui a déjà rendu — aucun droit neuf ;
 · il ne rejoue rien : le tirage reste à usage unique côté base ;
 · il est local, et l'écran le dit — un `deja_tire` sans mémoire locale annonce
   désormais que le lot reste dû au comptoir, au lieu de laisser croire à une
   perte.

Ce qui sort du stockage est **revalidé** (`parserTirageMemorise`) : le stockage
local se modifie à la main, et un faux gain peint à l'écran serait pire que pas
de gain du tout. Rien d'autre que les quatre champs connus n'en ressort.

**Écarté pour l'instant** : faire rendre le lot par `deja_tire`. C'est le vrai
correctif, et il demande une migration **plus un arbitrage** — le code du
ticket deviendrait un moyen permanent de relire le code de retrait. Proposé à
part.

**Références** : `src/components/ticket/ticket-qr.tsx`,
`src/components/ticket/emettre-ticket.tsx`,
`src/components/ticket/ticket-experience.tsx`, `src/lib/ticket-or.ts`.

---

## ADR-122 — Réservation de table : un plan de salle NOMMÉ, sur le même schéma que Moments

**Date** : 2026-08-29
**Statut** : Accepté
**Contexte** : Réserver ne savait compter que des couverts sur un créneau —
suffisant pour un Moment (dégustation, atelier), pas pour un service de
restaurant, où deux groupes de deux ne remplacent pas un groupe de quatre.
RDV-6 à RDV-9 (PR #229, #230, #231, #232) ajoutent le plan de salle : tables
nommées, effectif exact, liste d'attente qui compte des personnes plutôt que
des lignes.

### Décision 1 — `booking_mode` sépare les produits, pas le schéma

Réservation de table est un second produit (clé d'entitlement `rendez_vous`,
posée en RDV-5, #228 — distincte de `reserver`), mais elle vit dans les
**mêmes tables** que Moments. `booking_mode` sur `reservation_activities`
choisit le comportement, la RLS et les RPC restent partagées.

**Écarté** : un second jeu de tables dédié au plan de salle. Il aurait dupliqué
la RLS, les RPC de file d'attente et les gardes multi-locataires déjà écrites
et testées pour Réserver — pour un produit qui ne change que la manière de
compter les places, pas leur isolation par organisation.

### Décision 2 — Des tables NOMMÉES et affectées, pas une jauge de couverts

`reserve_table` fait un **meilleur ajustement** (`best fit`) : elle retient la
plus petite table dont le nombre de places couvre l'effectif demandé, avec un
ordre déterministe (`order by seats asc, name asc`).

**Écarté** : une jauge globale de couverts pour tout l'établissement, sur le
modèle « nombre maximal de personnes ». Elle aurait laissé asseoir un groupe de
six sur trois tables de deux prises séparément — correct en somme de couverts,
faux en usage réel d'une salle.

### Décision 3 — `max_party` plutôt que « places restantes »

`reservation_tables_state` rend le plus grand effectif **plaçable sur une
seule table**, jamais la somme des couverts libres de l'établissement : douze
couverts libres répartis sur six tables de deux ne prennent pas un groupe de
quatre, et un total aurait affirmé le contraire à l'écran.

### Décision 4 — `table_turn_minutes` reste distinct de `duration_minutes`

Le premier dit combien de temps une table reste occupée une fois prise, le
second tous les combien de temps on propose un nouveau créneau. Un service
d'1 h 30 sur une grille au quart d'heure fait naturellement se chevaucher
plusieurs créneaux sur la **même** table pendant qu'elle est occupée — c'est
le réglage normal d'un restaurant. Fusionner les deux réglages l'aurait rendu
impossible. Conséquence directe : le verrou d'avis (`for update`) de
`reserve_table` porte sur l'**activité**, pas sur le créneau qu'une occupation
traverse — un créneau n'est qu'une lecture dérivée des occupations en cours.

### Décision 5 — La liste d'attente NOTIFIE, elle ne TIENT pas de table

`reservation_table_freed_targets` (RDV-8, #231) rend la liste de qui prévenir
quand une table se libère ; plusieurs personnes reçoivent le même email, et la
première qui revient et confirme prend la table sous le verrou d'avis de
`reserve_table`. L'email et l'écran commerçant le disent en toutes lettres —
ce n'est pas une réservation garantie, c'est une notification.

**Écarté** : tenir la table pour une seule personne de la liste. Cela aurait
demandé une colonne `table_id` sur `reservation_waitlist_entries` **et** un
`create or replace` de `claim_waitlist_offer` — une fonction de 150 lignes déjà
recopiée une fois dans l'historique de ce dépôt, à l'origine d'une régression
en production. Et surtout : tenir la table **gèle** la salle si l'email n'est
pas lu à temps, un risque qu'une notification à plusieurs destinataires évite.
Corollaire : `reservation_offer_next` (le socle Moments) n'est **jamais**
appelée sur une activité en `booking_mode = 'rendez_vous'` — elle compte des
places, pas des tables, et son offre serait de toute façon rejetée par le
trigger `reservations_require_table`.

### Décision 6 — Les droits de colonne de Réserver sont NOMINATIFS, et rien ne le rappelle

`reservations`, `reservation_activities` et `reservation_waitlist_entries`
n'accordent pas leurs droits table par table : ils les accordent **colonne
par colonne**, pour tenir `email` hors de portée du commerçant qui n'a droit
qu'aux colonnes opérationnelles. C'est un choix de sécurité délibéré et
correct — mais sa conséquence directe, jamais écrite nulle part avant ce
chantier, est qu'**une colonne neuve n'hérite d'aucun droit**. Ni en lecture,
ni en écriture. Rien dans PostgreSQL ni PostgREST ne l'accorde par défaut.

Ce chantier l'a démontré trois fois sur trois lots distincts : deux lectures
oubliées (`reservations.table_id`, `reservation_waitlist_entries.party_size`,
RDV-6) et une écriture oubliée, totale, sur les cinq colonnes de réglage de
`reservation_activities` posées en RDV-1 et RDV-6 — voir
`docs/bugs.md`. Cette dernière rendait le produit **inutilisable en
production depuis le tableau de bord** : `enregistrerReglagesRendezVous`
écrit avec le client de session, et l'`update` était refusé en bloc, donc
aucune activité ne pouvait jamais passer en `booking_mode = 'rendez_vous'`.

Les deux formes de panne diffèrent, et la seconde est la pire à diagnostiquer.
Une lecture manquante fait **disparaître l'écran entier** — PostgREST refuse
en bloc un `select` qui touche une colonne non accordée, donc la panne se lit
« les réservations ont disparu ». Une écriture manquante rend un message
générique qui ne désigne rien.

**Corollaire vérifié par contrôle négatif** : le grant et la policy ne
protègent pas la même chose. Le grant dit QUELLES COLONNES un rôle peut
toucher ; la policy (`with check (...)`) dit QUELLES LIGNES. Rédiger la
migration de réparation a d'abord affirmé à tort qu'`organization_id` n'est
pas insérable sur `reservation_activities` — il l'est, et doit l'être, la
server action l'écrit depuis la session. Ce qui empêche de déclarer
l'organisation du voisin est `is_org_editor(...)` en policy, pas le grant. La
garde retenue porte donc sur ce qui est vraiment fermé : `organization_id` ne
se **modifie** pas après création.

**Écarté** : une garde générique qui croiserait les grants de colonnes de
`information_schema.column_privileges` avec les colonnes citées dans
`src/actions/`. Une piste réelle, mais pas évaluée pour son coût ni pour son
risque de faux positifs sur les tables à grant de table entier — reste en
dette ouverte dans `docs/bugs.md`, pas une décision prise ici.

**Dette signalée** (`docs/bugs.md`) : les RPC du socle Réserver
(`reserve_slot`, `waitlist_join`, `reservation_offer_next`) vérifient encore le
droit `vitrine`, pas `rendez_vous` — héritage d'avant la séparation des clés
par produit (RDV-5). Un commerçant qui ne détiendrait que `rendez_vous` sans
`vitrine` verrait ses Moments muets.

**Références** : `supabase/migrations/20261106120000_reservation_horaires.sql`,
`20261107120000_rendez_vous_cle_produit.sql`,
`20261108120000_reservation_tables.sql`,
`20261109120000_plan_salle_lecture.sql`,
`20261110120000_liste_attente_effectif.sql`,
`20261112120000_reglages_rendez_vous_ecrivables.sql`.

## ADR-123 — La Vitrine prend l'allure d'une maquette : les défauts SONT la référence, et seuls les écarts sont stockés

**Date** : 2026-08-31
**Statut** : Accepté
**Contexte** : demande du propriétaire — que la vitrine publique ressemble
« exactement » à une carte digitale de référence fournie en maquette, tout en
ouvrant ses réglages visuels et en servant sept métiers (restaurant, bar,
coiffeur, fleuriste, hôtel, spa, autre commerce). Les trois demandes tirent en
sens contraire : la fidélité veut UNE allure, l'ouverture des réglages en
autorise des milliers, et le multi-métier en suggère sept. VIT-13 (PR #276,
migration `20261121120000`).

### Décision 1 — Les défauts sont la maquette, au pixel

Les vingt-cinq réglages d'allure ont pour valeur par défaut celle de la carte
de référence. Une vitrine à laquelle personne n'a touché sort donc exactement
comme elle, et les réglages ne sont que des écarts VOLONTAIRES.
`src/components/vitrine/allure.test.ts` recopie les valeurs de `data-props` de
la maquette à la main et les compare au code : une dérive rougit.

**Écarté** : des défauts neutres, avec la maquette à reconstituer réglage par
réglage. C'était la lecture littérale de « on ouvre tout », et elle aurait fait
de la maquette une destination qu'aucun commerçant n'atteint — donc la seule
lecture qui trahit la demande tout en la satisfaisant sur le papier.

### Décision 2 — Seuls les ÉCARTS sont écrits en base

`composerAllure` compare chaque champ à son défaut et n'écrit que ce qui en
diffère. Un formulaire entièrement laissé tel quel n'écrit rien du tout.

**Écarté** : écrire les vingt-cinq valeurs, ce que le formulaire poste
pourtant. Deux raisons, et la seconde est la vraie. D'abord un document qui
recopie vingt-cinq défauts fait croire à vingt-cinq décisions, et rend
impossible la lecture « ce commerçant a-t-il personnalisé son allure ? ».
Surtout : le jour où un défaut de la maquette change, AUCUNE vitrine déjà
enregistrée n'en profiterait — elles porteraient toutes l'ancienne valeur,
figée le jour de leur enregistrement, et il faudrait une migration de données
pour rattraper un changement de style.

### Décision 3 — Le secteur choisit les MOTS, jamais la mise en page

Sept métiers changent le vocabulaire public (« Nos cartes » → « Nos
prestations » → « Nos chambres ») et posent un préréglage de palette que la
couleur du commerçant écrase toujours. La structure d'écran — hero, onglets,
chips, fiches, barre basse — est rigoureusement la même pour les sept, et un
test garde qu'aucun préréglage ne porte de clé d'allure.

**Écarté** : une mise en page par métier. Elle aurait donné sept écrans à tenir
d'accord au lieu d'un, pour une différence que le vocabulaire et la palette
suffisent à porter.

### Décision 4 — Remplissage rétroactif `restaurant`, défaut de colonne `commerce`

`add column ... default 'restaurant'` remplit les lignes existantes, puis
`alter column ... set default 'commerce'` bascule la colonne pour les vitrines
à naître.

**Écarté** : créer la colonne directement avec le neutre. Les vitrines DÉJÀ EN
LIGNE affichent le vocabulaire de la restauration parce que c'était le seul qui
existait ; le neutre aurait changé les mots de chaque page publiée, en
production, sans que le commerçant l'ait demandé ni même su. Le prix de ce
choix est que la fonctionnalité est INERTE jusqu'à ce que chacun désigne son
métier — c'est le bon prix : un réglage qu'on n'a pas fait ne doit pas
s'appliquer tout seul.

**Corollaire dans le seed** : `db reset` applique les migrations sur une base
vide, donc le remplissage rétroactif ne remplit rien et les lignes semées
héritent du défaut neutre. `supabase/seed.sql` déclare donc explicitement le
métier de ses deux vitrines.

### Décision 5 — Un témoin de présence pour la section d'allure

Les sept interrupteurs valent `true` par défaut, et une case NON RENDUE se
poste exactement comme une case DÉCOCHÉE. Sans distinction, tout formulaire ne
portant pas la section écrivait sept `false` — en-tête collant, capitales,
compteurs, monogramme, favoris et recherche éteints d'un coup, sans message et
sans trace. Le champ caché `allure_rendue` sépare les deux ; sans lui, l'allure
n'est pas touchée.

**Écarté** : compter sur le fait que l'écran rend toujours les cases. C'est ce
que fait déjà `caseNative` pour `active` et `disponible`, avec la limite écrite
en toutes lettres dans son commentaire — et c'est exactement la classe de panne
(RDV-12, ADR-122) que ce dépôt paie le plus cher : un enregistrement qui
réussit en ayant fait autre chose que ce qu'on croit.

### Ce que le lot a appris sur les gardes existantes

Deux gardes ont rougi pour des raisons qui ne les concernaient pas, et les deux
sont TEXTUELLES. `check-unsafe-casts.mjs` compte les doubles casts dans le
fichier, COMMENTAIRES COMPRIS : citer la construction pour l'expliquer suffit à
la faire rougir. `vitrine.test.sql` compte les occurrences quotées des sept
polices dans TOUT le corps de `is_valid_vitrine_theme` : la valeur `sans` de
`photo_taille` en faisait une huitième, et le commentaire SQL qui l'expliquait
une neuvième — `prosrc` porte les commentaires.

La valeur a été renommée `aucune` plutôt que d'élargir la garde : elle n'est
pas fausse, elle est grossière. Mais la fragilité reste entière pour le
prochain vocabulaire contenant `mono`, `script`, `liste` ou `social`.


## ADR-124 — Deux compteurs de fidélité : un solde qui se dépense, un total qui ne recule jamais

**Date** : 2026-08-31
**Statut** : Accepté
**Contexte** : bascule du programme de fidélité de la visite au point (migration
`20261114120000`). Le niveau d'un client (les paliers, les avantages qui en
dépendent) devait reposer sur une mesure qui ne redescend jamais — sans quoi un
client qui dépense les points qu'il a gagnés perdrait le statut qu'il a
mérité en les gagnant.

**Décision** : `loyalty_members` porte deux colonnes distinctes.
`points_balance` se dépense : il descend à chaque récompense échangée, c'est
le nombre affiché comme « à dépenser ». `points_earned_total` ne descend
jamais : il ne fait qu'augmenter à chaque gain, et c'est lui seul qui porte le
niveau et les paliers.

**Écarté** : un compteur unique, qui aurait porté à la fois la dépense et le
niveau. C'est la lecture la plus simple du schéma, et c'est celle qui casse
en premier : un client au palier « or » qui échange ses points contre un café
verrait son solde chuter sous le seuil, et perdrait son statut en utilisant
la récompense que ce statut lui a values — un système de fidélité qui punit
la fidélité qu'il vient de récompenser.

**Conséquence visible** : la carte à tampons a disparu de l'écran passeport.
Elle affichait une progression par cases cochées vers une récompense unique ;
un modèle à points cumulés et paliers n'a plus cette forme, et une case
cochée affirmait implicitement « on ne recule jamais » — ce que seul
`points_earned_total` peut désormais garantir.

## ADR-125 — Le QR de la carte Google Wallet porte l'URL du passeport, jamais un laissez-passer

**Date** : 2026-08-31
**Statut** : Accepté
**Contexte** : FID-6 (Google Wallet, PR #274). La carte de fidélité Google
Wallet doit porter un code scannable en caisse. Deux familles de solutions
existent pour ce genre de carte : un identifiant stable que la caisse résout
elle-même, ou un renvoi vers l'écran qui porte la logique de check-in.

**Décision** : le code de la carte Wallet encode l'URL publique du passeport
du client, pas un identifiant de porteur. Le jeton de check-in réel — celui
qui autorise un tampon — est émis par `src/lib/loyalty-checkin.ts` et vit
3 minutes ; une carte Wallet, elle, vit des mois sans être renouvelée.

**Écarté, et pourquoi** :
- **Un identifiant de porteur stable, résolu par la caisse.** Cela réintroduit
  exactement le QR photographiable que `loyalty-checkin.ts` a été écrit pour
  supprimer — un code fixe, revu chez le client, vaut pour toujours et se
  transmet aussi bien qu'un ticket volé. Renverser une décision de sécurité
  déjà documentée demande une revue dédiée, pas un effet de bord dans un lot
  « ajouter un bouton Wallet ».
- **Un code tournant côté client (TOTP `rotatingBarcode`)** — Google Wallet
  l'expose nativement. Il exige une famille de secrets côté serveur
  (dérivation, rotation, stockage) et l'accord explicite de Google sur le
  compte émetteur pour ce mode : hors de proportion pour ce lot, et sans
  bénéfice sur un jeton de check-in déjà revu et déjà court.

**Conséquence** : scanner la carte Wallet ouvre le même passeport public que
scanner le QR imprimé ; le geste de check-in proprement dit reste entièrement
porté par le jeton existant, inchangé par ce lot.

## ADR-126 — La mise à jour du solde Wallet part en tâche différée, jamais dans le geste de comptoir

**Date** : 2026-08-31
**Statut** : Accepté
**Contexte** : chaque tampon ou dépense de points doit répercuter le nouveau
solde sur la carte Google Wallet du client, si elle existe. Cette
répercussion demande un aller-retour réseau vers l'API Google Wallet.

**Décision** : la mise à jour du solde Wallet est déclenchée depuis `after()`
(exécution différée après la réponse), jamais synchrone dans la server action
qui enregistre le tampon.

**Justification** : le geste de comptoir — appuyer sur le bouton qui tamponne
la carte d'un client qui attend — ne doit jamais dépendre de la latence ni de
la disponibilité de Google. Deux allers-retours réseau vers un service tiers
n'ont pas leur place dans un chemin que le commerçant vit comme instantané,
et un défaut ou un ralentissement de l'API Wallet ne doit en aucun cas faire
échouer l'enregistrement du tampon lui-même : la fidélité du client est
acquise dès l'écriture en base, la carte Wallet n'est qu'un miroir de cet
état, à jour avec un léger différé.

**Conséquence** : un défaut Google Wallet peut laisser la carte affichée sur
le téléphone du client temporairement en retard d'un solde, jamais bloquer ou
faire échouer un encaissement.

## ADR-127 — `loyalty_members` n'est pas sous régime de droits par colonne (contrairement à Réservation)

**Date** : 2026-08-31
**Statut** : Accepté (correction d'une croyance erronée)
**Contexte** : en briefant ce chantier, l'hypothèse de départ était que
`loyalty_members` suivait le même régime que `reservations`,
`reservation_activities` et `reservation_waitlist_entries` — des grants
**colonne par colonne**, posés pour tenir une colonne sensible (`email` côté
Réservation) hors de portée du rôle `authenticated`. Cette hypothèse a été
donnée telle quelle à un agent d'exécution ; il a vérifié le catalogue de
droits au lieu de la prendre pour acquise, et elle s'est révélée fausse.

**Décision, telle qu'elle existe dans le code** : `loyalty_members` porte un
`grant select` **de table entière** à `authenticated`
(`supabase/migrations/20260725120000_loyalty_passport.sql:305`), qui couvre
donc automatiquement toute colonne future ajoutée à cette table. C'est
l'inverse du régime de `reservations` et consorts, où une colonne neuve
n'hérite d'aucun droit tant qu'un `grant select (colonne)` explicite n'est pas
posé pour elle (voir ADR-122 et `docs/bugs.md`, entrée RDV du 2026-08-29).

**Ce qu'il ne faut PAS faire, et pourquoi ce serait nuisible** : poser un
`grant select (colonne)` supplémentaire et redondant sur `loyalty_members`
« pour être cohérent avec Réservation », ou pour se prémunir par analogie
contre le défaut qui a mordu RDV-6/RDV-1. Un tel grant ne changerait rien
fonctionnellement — le droit de table couvre déjà tout — mais il ferait
croire, à la prochaine lecture, que `loyalty_members` est sous régime
colonne par colonne. Cette fausse lecture inviterait ensuite à faire évoluer
un droit qui fonctionne aujourd'hui vers une liste nominative de colonnes,
c'est-à-dire le régime précis qui, sur Réservation, a laissé passer trois
colonnes sans aucun droit pendant plusieurs lots.

**Repère à conserver** : dans ce dépôt, seules `reservations`,
`reservation_activities` et `reservation_waitlist_entries` sont sous régime
colonne par colonne, et seulement parce qu'elles portent une colonne
(`email`) qu'il fallait explicitement soustraire du rôle `authenticated`.
`loyalty_members` — comme la majorité des tables du dépôt — est sous régime
de table entière : une colonne neuve y est lisible par défaut, sans geste
supplémentaire.
