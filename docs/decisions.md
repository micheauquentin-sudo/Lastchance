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
