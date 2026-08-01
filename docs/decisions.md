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
- Ce chantier livre l'appelant, pas l'écriture : la RPC `set_worker_vault_secrets`
  n'existe pas encore côté base au moment de cet ADR (aucune occurrence
  dans `supabase/migrations/`) ; l'action échoue proprement (PGRST202)
  tant qu'elle n'est pas livrée. Cette RPC devra faire l'objet d'une revue
  sécurité dédiée à sa livraison — elle seule décide, en base, quelles
  clés Vault un appelant peut toucher.
- Le geste reste, après ce chantier, **possible sans identifiants** — il
  ne se substitue pas à la décision du propriétaire. Le bouton doit encore
  être cliqué en production ; tant qu'il ne l'a pas été, la file continue
  de tourner une fois par jour (`docs/production-readiness.md` §5bis).

**References** :
- ADR-061 (la sortie que ce geste active)
- `src/lib/admin/worker-cadence.ts`, `src/app/admin/(protected)/monitoring/actions.ts`
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
