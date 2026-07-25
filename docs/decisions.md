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
