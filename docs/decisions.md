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
- Aucune dÃ©cision en attente : stack (ADR-005), base de donnÃ©es et
  multi-tenant RLS (ADR-006), tests (Vitest + suite E2E Playwright exÃ©cutÃ©e
  en CI), API (Server Actions + routes `src/app/api/`) et exigences de
  performance ([Performance Report](./perf-report.md)) sont actÃ©s et
  implÃ©mentÃ©s.

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
**Context** : Pivot vers un SaaS multi-tenant de gamification pour commerces. Besoin d'un MVP robuste, dÃ©ployable rapidement, sur plans gratuits.

**Decision** : Next.js 16 App Router (TS + Tailwind 4), Supabase (Auth + PostgreSQL RLS), Stripe Checkout + webhook, Resend, PostHog, Vercel. Server Actions plutÃ´t que routes API (sauf webhook Stripe et export CSV).

**Rationale** : un seul repo, zÃ©ro infra Ã  gÃ©rer, RLS = isolation multi-tenant au niveau base, plans gratuits suffisants pour le pilote.

---

## ADR-006 : Multi-tenant par organization_id + RLS
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : toutes les tables mÃ©tier portent organization_id ; policies RLS via is_org_member() (SECURITY DEFINER). Le parcours public n'utilise jamais l'anon key : Server Actions + service role avec validations explicites.

**Consequences** : isolation vÃ©rifiÃ©e par tests SQL (intrus bloquÃ© en lecture et Ã©criture) ; un membre pourra appartenir Ã  plusieurs orgs plus tard sans migration.

---

## ADR-007 : Spin tracÃ© au lancer + claim token HMAC
**Date** : 2026-07-06
**Status** : Accepted
**Context** : le gain est rÃ©vÃ©lÃ© avant le formulaire ; il faut empÃªcher (a) de relancer jusqu'au lot dÃ©sirÃ©, (b) de forger un gain.

**Decision** : table spins insÃ©rÃ©e au moment du lancer (la limite de jeu s'y vÃ©rifie) ; rÃ©sultat signÃ© HMAC-SHA256 15 min renvoyÃ© au client ; participations.spin_id UNIQUE contre le double-claim ; stock rÃ©servÃ© atomiquement au spin (dÃ©sormais via perform_atomic_spin, qui verrouille la fenÃªtre de jeu, tire et dÃ©crÃ©mente le stock dans la mÃªme transaction).

**Trade-off acceptÃ©** : un gagnant qui abandonne le formulaire consomme une unitÃ© de stock (prÃ©fÃ©rable Ã  distribuer plus que le stock).

---

## ADR-008 : RGPD by design
**Date** : 2026-07-06
**Status** : Accepted
**Decision** : consentement CGU obligatoire (CHECK SQL + case non prÃ©-cochÃ©e), opt-in marketing sÃ©parÃ©, identitÃ© joueur pseudonymisÃ©e (SHA-256 salÃ© IP+UA, jamais d'IP brute), gain jamais conditionnÃ© Ã  un avis en ligne, donnÃ©es visibles uniquement par l'org propriÃ©taire (RLS).

---

## ADR-009 : DÃ©lai de grÃ¢ce de 14 jours sur les impayÃ©s (past_due)
**Date** : 2026-07-11
**Status** : Accepted
**Context** : `past_due` coupait les roues publiques immÃ©diatement, alors que Stripe relance la carte pendant plusieurs jours (dunning) avant de rÃ©silier. Une carte expirÃ©e Ã©teignait le jeu du commerÃ§ant sans prÃ©avis.

**Decision** : pendant `past_due`, l'accÃ¨s est maintenu 14 jours Ã  partir de l'entrÃ©e en impayÃ© (`organizations.past_due_since`, posÃ©e par le webhook Ã  la transition, effacÃ©e Ã  la sortie). `hasActiveAccess` coupe au-delÃ  de cette borne â€” mÃªme si le webhook final de Stripe (canceled/unpaid) n'arrivait jamais. BanniÃ¨re dÃ©diÃ©e dans le dashboard avec la date de coupure et un lien vers le portail de paiement.

**Consequences** : la coupure est exacte au spin (revalidation serveur Ã  chaque lancer) et â‰¤ 30 s sur la page /play (ISR). Un impayÃ© non datÃ© (transition en cours) ne coupe pas â€” l'Ã©tat incomplet est transitoire, le webhook date l'entrÃ©e.

---

## ADR-010 : Organisation active explicite par cookie validÃ© sous RLS
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le modÃ¨le autorise plusieurs appartenances, mais le dashboard
sÃ©lectionnait la premiÃ¨re ligne retournÃ©e par PostgreSQL avec `limit(1)`, sans
ordre ni choix utilisateur.

**Decision** : conserver l'id du tenant actif dans un cookie HTTP-only. Ã€ chaque
requÃªte, charger les appartenances de l'utilisateur sous RLS et n'accepter le
cookie que s'il correspond toujours Ã  l'une d'elles. Sans prÃ©fÃ©rence valide,
choisir l'appartenance la plus ancienne avec un ordre dÃ©terministe. Afficher un
sÃ©lecteur dans le dashboard lorsque plusieurs organisations sont disponibles.

**Consequences** : aucune confiance d'autorisation n'est placÃ©e dans le cookie ;
un membre retirÃ© bascule automatiquement vers une organisation encore valide.
L'acceptation d'une invitation active immÃ©diatement l'Ã©tablissement rejoint.

---

## ADR-011 : Gardes applicatives pour tout accÃ¨s public service-role
**Date** : 2026-07-17
**Status** : Accepted
**Context** : le parcours public doit contourner la RLS, mais des clÃ©s Ã©trangÃ¨res
simples ne garantissent pas Ã  elles seules que toutes les lignes reliÃ©es portent
le mÃªme `organization_id`.

**Decision** : centraliser les invariants dans `public-resource-guards.ts` et
vÃ©rifier explicitement les relations QR â†’ campagne â†’ roue â†’ lots et spin â†’
campagne â†’ roue â†’ lot avant toute dÃ©cision ou Ã©criture publique. Filtrer les
relectures de claim par tenant et limiter les colonnes d'organisation chargÃ©es
par le rendu public.

**Consequences** : une incohÃ©rence inter-tenant est refusÃ©e avec un message
gÃ©nÃ©rique et signalÃ©e au monitoring. Toute nouvelle opÃ©ration publique utilisant
la service-role doit rÃ©utiliser ces gardes ou fournir une frontiÃ¨re Ã©quivalente
testÃ©e.

---

## ADR-012 : Classement Pronostics en SQL et worker de synchronisation 10 min
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le classement chargeait tous les joueurs et pronostics puis
agrÃ©geait en JavaScript (intenable Ã  plusieurs milliers de participants), et la
synchronisation des rÃ©sultats reposait sur un cron Vercel quotidien (plan Hobby)
plus une synchro paresseuse Ã  la visite â€” un rÃ©sultat pouvait attendre le
lendemain, et des requÃªtes simultanÃ©es doublaient les appels fournisseur.

**Decision** :
- classement agrÃ©gÃ© en base : RPC `contest_leaderboard` (totaux, `exact_count`,
  `prediction_count`, rang Â« competition Â», pagination, garde service-role /
  propriÃ©taire) et `contest_player_rank` (position du joueur courant) â€”
  la page publique affiche le top 50 + la ligne du joueur, le dashboard pagine ;
- worker frÃ©quent SANS quitter le plan Hobby : pg_cron + pg_net cÃ´tÃ© Supabase
  appellent `/api/cron/sync-contests` toutes les 10 minutes (URL et secret lus
  dans Vault Ã  l'exÃ©cution, job inactif tant qu'ils n'existent pas â€” le cron
  Vercel quotidien reste en filet) ;
- rafraÃ®chissement fournisseur verrouillÃ© par ligue (`claim_fixture_refresh`,
  reprise sur verrou expirÃ©), une paire d'appels par ligue distribuÃ©e Ã  tous
  les championnats, ligues les plus pÃ©rimÃ©es d'abord, budget temps 45 s avec
  report au passage suivant ;
- supervision : `contests.last_synced_at`/`last_sync_error`,
  `fixture_cache.provider_status`/`last_error`, alerte Sentry
  `cron.sync-contests.lag` au-delÃ  de 3 h sans rÃ©sultat.

**Consequences** : pas de table de rÃ©sumÃ© matÃ©rialisÃ©e Ã  ce stade (l'agrÃ©gat
indexÃ© suffit largement Ã  l'Ã©chelle visÃ©e) â€” Ã  rÃ©Ã©valuer si un championnat
dÃ©passe ~50 000 pronostics. L'activation prod du worker est une insertion Vault
unique (docs/observability.md). rankPlayers() reste la rÃ©fÃ©rence mÃ©tier testÃ©e
du rang Â« competition Â», dÃ©sormais reproduit par la RPC (pgTAP).

---

## ADR-013 : RÃ¨gles de compÃ©tition â€” ex Ã¦quo, gel du rÃ¨glement, clÃ´ture
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le rang Â« competition Â» (1, 2, 2, 4) pouvait attribuer une mÃªme
rÃ©compense Ã  plusieurs joueurs, et rien n'empÃªchait un commerÃ§ant de modifier
barÃ¨me ou rÃ©compenses aprÃ¨s avoir vu les rÃ©sultats.

**Decision** :
- politique d'ex Ã¦quo explicite, appliquÃ©e en SQL : points > nb de scores
  exacts > nb de bons Ã©carts > question subsidiaire (Ã©cart absolu Ã  la rÃ©ponse
  officielle, posÃ©e Ã  l'inscription) > tirage dÃ©terministe et auditable
  (`md5(contest_id, player_id)` â€” prÃ©-engagÃ©, aucun acteur ne peut l'influencer),
  le tirage n'Ã©tant appliquÃ© qu'Ã  la clÃ´ture pour garantir un joueur par rang ;
- gel du rÃ¨glement dÃ¨s le premier pronostic ou coup d'envoi : barÃ¨me,
  rÃ©compenses et suppression de matchs pronostiquÃ©s exigent un motif
  (â‰¥ 10 caractÃ¨res) journalisÃ© dans audit_logs ; question subsidiaire figÃ©e ;
  transitions de statut via RPC (matrice draftâ†”activeâ†’finished, rÃ©ouverture
  motivÃ©e) â€” les colonnes status/rewards ne sont plus modifiables en direct ;
- clÃ´ture (`finalize_contest`, propriÃ©taire) : photographie du classement final
  (`contest_final_standings`, rangs uniques) servie ensuite telle quelle par
  `contest_leaderboard`, attribution des lots (`contest_awards` : rang, joueur,
  lot, code de retrait PRONO-XXXXXXXX, statut remis/annulÃ© auditÃ©), puis plus
  aucune modification ni rÃ©ouverture possible.

**Consequences** : les paliers du barÃ¨me sont strictement dÃ©croissants (les
compteurs d'exacts/Ã©carts servent de dÃ©partage). Une correction post-clÃ´ture
impossible par construction â€” en cas d'erreur avÃ©rÃ©e, seule voie : annuler les
lots un Ã  un avec motif, le palmarÃ¨s restant la trace de ce qui a Ã©tÃ© publiÃ©.
Comportement verrouillÃ© par pgTAP (supabase/tests/contest_leaderboard.test.sql)
et un parcours E2E de clÃ´ture.

---

## ADR-014 : RÃ©cupÃ©ration d'identitÃ© joueur par lien magique
**Date** : 2026-07-21
**Status** : Accepted
**Context** : l'identitÃ© joueur Pronostics tient Ã  un cookie httpOnly de
180 jours. Cookie effacÃ© ou tÃ©lÃ©phone changÃ© : l'email est reconnu Â« dÃ©jÃ 
inscrit Â» mais la grille est inaccessible.

**Decision** : lien magique par email (Â« Retrouver mes pronostics Â» sur la
page publique, y compris championnat terminÃ© â€” un gagnant doit retrouver son
code) : jeton hachÃ© SHA-256 Ã  usage unique, 30 minutes, une demande invalide
les prÃ©cÃ©dentes ; rÃ©ponse toujours neutre (pas d'oracle d'inscription) ;
double rate limit (championnat+IP, email ciblÃ©) + Turnstile ; consommation
UNIQUEMENT au clic (les scanners d'emails suivent les liens) ; Ã  la
confirmation, ROTATION du jeton appareil â€” les autres appareils sont
dÃ©connectÃ©s â€” et rÃ©cupÃ©ration journalisÃ©e (contest.player.recovered).
Un compte joueur transversal multi-concours est volontairement diffÃ©rÃ©
tant que l'usage rÃ©el ne le justifie pas.

**Consequences** : la rÃ©cupÃ©ration suppose la collecte d'email activÃ©e sur le
championnat (sinon le lien Â« Retrouver Â» n'apparaÃ®t pas â€” rien Ã  envoyer).
L'Ã©chec d'envoi est signalÃ© au joueur (pas de faux Â« email parti Â»). Table
`contest_recovery_tokens` service-role uniquement, parcours E2E complet via la
boÃ®te mail de test du stub Resend (GET /_last).

---

## ADR-015 : File de travaux gÃ©nÃ©rique â€” les traitements longs hors HTTP
**Date** : 2026-07-21
**Status** : Accepted
**Context** : newsletter (jusqu'Ã  1 000 destinataires), relance clients
(toutes les organisations) et webhooks sortants vivaient dans des requÃªtes
HTTP synchrones ; le cron webhooks Ã©tait quotidien alors que les retys sont
pensÃ©s en minutes â€” une livraison pouvait attendre 24 h.

**Decision** : table `jobs` unique (type, payload jsonb, statut queued/
running/completed/partial/failed, run_after, attempts/max_attempts,
locked_until, idempotency_key, last_error) rÃ©clamÃ©e par `claim_jobs` (FOR
UPDATE SKIP LOCKED) avec reprise des zombies (`requeue_stale_jobs`) et
backoff 1/5/15/60 min. Worker unique `/api/cron/jobs` toutes les 5 minutes
(pg_cron + Vault, secret partagÃ© avec le worker de synchro ; cron Vercel
quotidien en filet) :
- `newsletter.send` â€” l'action ne fait plus que journaliser la campagne
  (statut queued, segment mÃ©morisÃ©) et dÃ©poser le job ; le journal expose
  queued â†’ sending â†’ completed / partial / failed avec bouton Â« Relancer Â»
  (jamais de double envoi : une campagne complÃ¨te est refusÃ©e au rejeu) ;
- `reengage.org` â€” le cron quotidien dÃ©pose UN job par organisation
  (idempotent par jour), le worker relance org par org, erreurs isolÃ©es ;
- webhooks sortants â€” la file `webhook_deliveries` existante est drainÃ©e Ã 
  chaque tick (retys en minutes rÃ©els) ; l'Ã©puisement des 12 tentatives est
  matÃ©rialisÃ© (`failed_at` = dead-letter) et rejouable depuis les RÃ©glages.
Extensible aux prochains usages (exports, rappels pronostics, passes
Wallet) : un type + un handler.

**Consequences** : `org_segment_emails` accepte le service role (le ciblage
se fait au worker). `recipient_count` dÃ©signe dÃ©sormais les CIBLÃ‰S et
`sent_count` les envoyÃ©s (historique backfillÃ©). Activation prod = un secret
Vault `jobs_worker_url` (le secret d'auth existe dÃ©jÃ ). Comportement
verrouillÃ© par pgTAP (supabase/tests/jobs_queue.test.sql) et l'E2E newsletter
qui dÃ©clenche le worker comme pg_cron le fait.

---

## ADR-016 : Monitoring mesurÃ© â€” SLO affichÃ©s, plus d'Ã©tat Â« OK Â» statique
**Date** : 2026-07-21
**Status** : Accepted
**Context** : la page monitoring du back-office marquait des services
Â« fonctionnels Â» en dur, et le healthcheck ne vÃ©rifiait que l'accÃ¨s base +
configuration â€” pas l'Ã©tat fonctionnel rÃ©el.

**Decision** :
- `monitored()` Ã©crit chaque opÃ©ration critique dans `ops_metrics`
  (durÃ©e, issue â€” best-effort, jamais bloquant, purge 30 j) : latences
  p50/p95 et taux d'erreur affichÃ©s sont des MESURES ;
- RPC de santÃ© : `cron_last_success()` (dernier passage/succÃ¨s de chaque job
  pg_cron), `applied_migrations_info()` (version appliquÃ©e) comparÃ©e Ã 
  `EXPECTED_MIGRATION` (src/lib/release.ts) â€” un test unitaire lit le dossier
  des migrations et fait Ã©chouer la CI si la constante n'est pas Ã  jour ;
  SHA de release via VERCEL_GIT_COMMIT_SHA ;
- la page affiche quatre objectifs mesurÃ©s : participation/rÃ©clamation
  erreur < 1 % (24 h), webhook sortant en file < 5 min, rÃ©sultat sportif
  < 15 min aprÃ¨s la fin attendue d'un match, aucun job actif > 30 min â€”
  plus files (jobs, webhooks, dead-letters), synchro sportive, Ã¢ge du cache
  fournisseur, dernier webhook Stripe, acceptation emails 7 j.

**Consequences** : les rebonds email restent non instrumentÃ©s (webhooks
Resend non branchÃ©s) â€” affichÃ© comme limitation explicite plutÃ´t que faux
vert. Toute nouvelle migration exige le bump d'EXPECTED_MIGRATION dans le
mÃªme commit (le test release.test.ts y veille).

---

## ADR-017 : Cycle complet du gain â€” expiration serveur, panier, ROI, Wallet
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le compte Ã  rebours du code n'Ã©tait qu'un affichage client
(une capture d'Ã©cran ou l'email gardait le code utilisable), l'Ã©conomie des
lots n'Ã©tait pas suivie, et seul Google Wallet existait, sans invalidation.

**Decision** :
- expiration SERVEUR : `redeem_expires_at` figÃ© Ã  la rÃ©clamation (trigger,
  depuis le TTL de la campagne, historique backfillÃ©) et VÃ‰RIFIÃ‰ par
  `redeem_by_code` â€” la caisse affiche Â« Code expirÃ© Â» et la RPC refuse ;
- cycle complet : retrait (avec `basket_cents` facultatif saisi en caisse),
  annulation motivÃ©e (`cancel_participation` : audit + restock), expiration
  dÃ©rivÃ©e â€” statuts visibles sur la caisse et le tableau des participations ;
- Ã©conomie : `prizes.cost_cents` / `value_cents` (Ã©diteur de roue), RPC
  `org_prize_funnel` â€” taux gagnÃ© â†’ rÃ©clamÃ© â†’ retirÃ©, revenu attribuable
  (somme des paniers), coÃ»t des lots retirÃ©s, ROI estimÃ© affichÃ©s sur la
  page Participations (30 j) ;
- Wallet : le pass Google porte `validTimeInterval` (expiration automatique
  cÃ´tÃ© portefeuille) et il est passÃ© Ã  l'Ã©tat EXPIRED via l'API Ã  chaque
  retrait/annulation (best-effort) ; Apple Wallet ajoutÃ© (`passkit-generator`,
  route /api/wallet/apple/[code]) derriÃ¨re les variables APPLE_WALLET_* â€”
  sans certificats Apple Developer, le bouton n'apparaÃ®t pas.

**Consequences** : le Â« void Â» en direct d'un pass Apple dÃ©jÃ  installÃ©
exigerait le web service de mise Ã  jour Apple â€” assumÃ© hors pÃ©rimÃ¨tre : le
pass porte son expirationDate, la route refuse tout re-tÃ©lÃ©chargement d'un
gain mort, et l'Ã©chÃ©ance serveur fait foi en caisse quoi qu'il arrive.
L'activation d'Apple Wallet demande un compte Apple Developer (Pass Type ID,
certificats WWDR + signature) fourni par l'exploitant.

---

## ADR-018 : Budget de gains imputÃ© au claim, jamais remis Ã  zÃ©ro
**Date** : 2026-07-21
**Status** : Accepted
**Context** : un commerÃ§ant veut borner ce qu'une campagne peut distribuer.
Le point de dÃ©pense rÃ©el est la rÃ©clamation (un spin gagnant abandonnÃ© ne
coÃ»te rien) ; imputer au spin surestimerait, imputer au retrait arriverait
trop tard.

**Decision** : `campaigns.budget_cents` / `budget_spent_cents` ; le coÃ»t du
lot (`prizes.cost_cents`) est imputÃ© ATOMIQUEMENT dans `claim_winning_spin`.
Ã€ l'atteinte du budget, la campagne est mise en pause dans la mÃªme
transaction (`paused_reason = budget_reached`) et un job
`automation.budget-paused` prÃ©vient le commerÃ§ant. La relance
(`resumeCampaignAfterBudget`, garde owner/editor) rouvre le jeu sans jamais
remettre `budget_spent_cents` Ã  zÃ©ro : pour redonner de la marge, on
augmente le budget.

**Consequences** : un lÃ©ger dÃ©passement d'un lot est acceptÃ© par design (le
claim en cours au moment de l'atteinte aboutit â€” prÃ©fÃ©rable Ã  refuser un
gain dÃ©jÃ  annoncÃ© au joueur). Le compteur cumulatif rend la dÃ©pense
auditable sur toute la vie de la campagne.

---

## ADR-019 : Anniversaire â€” double consentement, date complÃ¨te stockÃ©e
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le scÃ©nario `birthday` a besoin d'une date de naissance, une
donnÃ©e plus sensible qu'un simple email ; l'opt-in marketing gÃ©nÃ©rique ne
suffit pas Ã  la justifier.

**Decision** : double consentement â€” la date n'est persistÃ©e
(`newsletter_subscribers.birth_date`) que si l'opt-in marketing ET la case
anniversaire dÃ©diÃ©e (sous-option indentÃ©e, jamais requise, visible
seulement si l'opt-in marketing est cochÃ©) ET un email sont prÃ©sents ;
Ã¢ge bornÃ© 13..120. La prÃ©sence de `birth_date` vaut consentement explicite.
La date complÃ¨te est stockÃ©e ; les anniversaires sont fÃªtÃ©s dans le fuseau
de l'organisation (29/02 â†’ 28/02).

**Consequences** : minimisation RGPD perfectible â€” jour + mois suffiraient
au scÃ©nario, l'annÃ©e complÃ¨te est stockÃ©e (Ã©volution possible notÃ©e).
Limitation assumÃ©e (revue sÃ©curitÃ©, FAIBLE) : un gagnant claimant avec
l'email d'un abonnÃ© existant de la mÃªme organisation peut Ã©craser sa
birth_date (impact : mauvaise date de vÅ“ux ; durcissement possible : ne
poser birth_date que sur une ligne crÃ©Ã©e par le claim). Suivi dans
docs/bugs.md.

---

## ADR-020 : Rangs de ligue re-numÃ©rotÃ©s 1..n
**Date** : 2026-07-21
**Status** : Accepted
**Context** : une ligue privÃ©e est un sous-ensemble des joueurs du
championnat. Afficher les rangs globaux dans une ligue (ex. 12, 47, 103)
serait illisible et rÃ©vÃ©lerait la position globale de joueurs qui n'ont
consenti qu'au classement de leur ligue.

**Decision** : `contest_leaderboard` et `contest_player_rank` acceptent
`p_league_id` et recalculent les rangs 1..n au sein de la ligue, avec la
mÃªme politique d'ex Ã¦quo que le gÃ©nÃ©ral (ADR-013) â€” y compris aprÃ¨s
clÃ´ture, oÃ¹ les rangs de ligue sont re-numÃ©rotÃ©s Ã  partir du palmarÃ¨s figÃ©.

**Consequences** : le rang de ligue est un affichage dÃ©rivÃ© â€” seuls le
classement gÃ©nÃ©ral et `contest_final_standings` font foi pour les
rÃ©compenses. Aucune table supplÃ©mentaire : la re-numÃ©rotation est faite
par la RPC.

---

## ADR-021 : Coexistence reengage / scÃ©nario inactive assumÃ©e
**Date** : 2026-07-21
**Status** : Accepted
**Context** : le cron de rÃ©engagement historique (`auto_reengage`,
refroidissement 30 j) et le nouveau scÃ©nario `inactive` (paliers 30/60 j,
dÃ©dupliquÃ© par `email_log`) ciblent des populations qui se recouvrent.
Les fusionner pendant le chantier aurait mÃªlÃ© refonte et nouveautÃ©.

**Decision** : les deux mÃ©canismes restent indÃ©pendants. Une organisation
qui active les deux peut doubler des relances ; un avertissement explicite
est affichÃ© dans l'UI des automatisations quand `auto_reengage` est actif.
L'arbitrage produit (fusion, migration ou exclusion mutuelle) est
volontairement laissÃ© ouvert.

**Consequences** : pas de double envoi silencieux â€” le commerÃ§ant est
prÃ©venu au moment du rÃ©glage. Ã€ trancher avant la sortie de bÃªta ; suivi
en roadmap (Â« Suites ouvertes Â»).

---

## ADR-022 : Mode TV â€” lecture publique fail-open derriÃ¨re cache CDN
**Date** : 2026-07-21
**Status** : Accepted
**Context** : l'Ã©cran TV en boutique doit rester affichÃ© des heures sans
intervention. Un rate limit fail-closed (comme sur les Ã©critures publiques)
transformerait une panne d'Upstash en Ã©cran noir chez le commerÃ§ant.

**Decision** : `GET /api/pronos/[slug]/tv` est en lecture seule, sans PII
(top 30, prÃ©noms seuls), avec `s-maxage=30` (le CDN absorbe l'essentiel du
trafic), `noindex` et 404 gÃ©nÃ©rique. Le rate limit (30/min par IP) est
volontairement FAIL-OPEN : en cas de panne du limiteur, la route continue
de servir. Le client TV tolÃ¨re les pannes (polling 45 s, conserve le
dernier classement affichÃ©).

**Consequences** : exception documentÃ©e Ã  la rÃ¨gle fail-closed du parcours
public â€” justifiÃ©e uniquement parce que la route ne rÃ©vÃ¨le rien de
sensible et ne fait aucune Ã©criture. Toute Ã©volution ajoutant des donnÃ©es
personnelles Ã  cette route devra repasser en fail-closed.

---

## ADR-023 : Chasse au trÃ©sor â€” addon d'organisation, rÃ©compense en lot direct
**Date** : 2026-07-22
**Status** : Accepted
**Context** : nouveau module de gamification â€” un parcours de QR codes
(Ã©tapes) Ã  travers la boutique ou le quartier menant Ã  un lot final. Deux
choix structurants : comment l'activer, et comment rÃ©compenser la
complÃ©tion. La roue existe dÃ©jÃ  avec tout son cycle (tirage anti-triche,
claim HMAC, stock, expiration, Wallet).

**Decision** : addon d'organisation `organizations.addon_hunts`, miroir
exact d'`addon_pronostics` â€” activÃ© depuis le back-office admin (option
payante ou incluse dans un plan), gating par `hasHuntsAccess` (addon +
`hasActiveAccess` : un essai expirÃ© coupe aussi les chasses). La rÃ©compense
finale n'est PAS une roue : lot DIRECT dÃ©crit sur la chasse
(`reward_label`/`reward_details`, `reward_stock` optionnel), matÃ©rialisÃ© Ã 
la complÃ©tion par un code de retrait `CHASSE-XXXXXXXX` (mÃªme alphabet sans
I/O/0/1 que `GAIN-`/`PRONO-`), remis en caisse.

**Consequences** : aucune rÃ©utilisation du tirage/claim de la roue (il n'y
a aucun alÃ©a â€” la complÃ©tion EST le gain). La remise passe par une RPC
DÃ‰DIÃ‰E `redeem_hunt_completion` plutÃ´t que d'Ã©tendre `redeem_by_code`, dont
le contrat de retour est faÃ§onnÃ© participation (lot de roue, campagne,
panier, expiration) : l'Ã©tendre casserait ses appelants. La caisse est
unifiÃ©e Ã  la LECTURE (`lookupRedeemCode` â†’ `CashierMatch` discriminÃ© par
`source: 'wheel' | 'hunt'`) mais chaque source garde sa RPC de remise. Pas
d'expiration du code de chasse en V1 (contrairement Ã  la roue, ADR-017) â€”
Ã©volution possible.

---

## ADR-024 : Attache-email de la complÃ©tion Ã  usage unique
**Date** : 2026-07-22
**Status** : Accepted
**Context** : le code de retrait s'affiche Ã  l'Ã©cran dÃ¨s la complÃ©tion ;
l'email n'est qu'un rappel OPTIONNEL. La premiÃ¨re implÃ©mentation acceptait
un email Ã  chaque appel de `claimHuntReward`, sur une chasse dÃ©jÃ  terminÃ©e.
La revue sÃ©curitÃ© l'a classÃ© Ã‰LEVÃ‰ : email-bombing depuis le domaine Resend
du commerÃ§ant, et empoisonnement de sa newsletter par rappels successifs
avec un destinataire arbitraire. La roue n'a pas ce trou (l'email est fixÃ©
une seule fois dans `claim_winning_spin`).

**Decision** : l'attache-email devient Ã  usage unique par compare-and-swap
atomique â€” `update â€¦ set email=â€¦ where id=â€¦ and email is null` suivi de
`.select()`. Seul le PREMIER email rattache la ligne ; l'envoi Resend ET
l'abonnement newsletter (opt-in) ne se dÃ©clenchent que si une ligne a
effectivement Ã©tÃ© mise Ã  jour. Tout rappel ultÃ©rieur (email diffÃ©rent
inclus) est un no-op idempotent (`emailed=false`), le code restant
consultable Ã  l'Ã©cran.

**Consequences** : paritÃ© anti-abus avec la roue atteinte sans table ni
verrou supplÃ©mentaires (l'invariant se porte sur `email is null`). Un
joueur qui se trompe d'email au premier essai ne peut pas le corriger par
ce canal â€” acceptÃ© (le code reste affichÃ©, le rappel mail est un confort).
Couvert par Vitest (2áµ‰ email â†’ 0 envoi, 0 abonnement).

---

## ADR-025 : Rate-limit de scan portÃ© par l'entropie des jetons, pas par le seau IP
**Date** : 2026-07-22
**Status** : Accepted
**Context** : une chasse se joue lÃ  oÃ¹ le public partage une IP (galerie
marchande, festival, NAT d'opÃ©rateur mobile). Un plafond IP serrÃ©, calibrÃ©
comme les Ã©critures publiques sensibles, verrouillerait tous les joueurs
lÃ©gitimes derriÃ¨re un mÃªme NAT dÃ¨s qu'ils sont nombreux â€” l'incident
`pronoPredictIp` a dÃ©jÃ  montrÃ© ce risque.

**Decision** : la sÃ©curitÃ© du scan repose d'abord sur l'ENTROPIE des jetons
d'Ã©tape (`randomCode(16)` sur un alphabet de 32 caractÃ¨res, â‰ˆ 2â¸â° â€” non
Ã©numÃ©rables) et sur un seau PAR COOKIE joueur (`huntScanPlayer`, 30/h) ; le
seau IP (`huntScanIp`) est un simple garde-fou anti-bot, relevÃ© de 20 Ã 
200 / 600 s (â‰ˆ 50 joueurs actifs derriÃ¨re un NAT ; un bot mono-IP reste
captÃ© Ã  ~20 complÃ©tions / 10 min). Les deux seaux restent fail-closed avec
repli SQL `check_rate_limit` (le scan requiert dÃ©jÃ  Postgres) â€” jamais de
verrouillage global sur panne Upstash.

**Consequences** : un attaquant ne peut de toute faÃ§on pas deviner un jeton
d'Ã©tape ; le rÃ´le du seau IP est rÃ©duit Ã  ce qu'il peut rÃ©ellement porter.
Le tampon se fait au POST du bouton (jamais au GET : anti-prefetch), seul
point d'Ã©criture. Recalibrage issu de la revue sÃ©curitÃ© (MOYEN), couvert
par un test de la nouvelle valeur.

---

## ADR-026 : Aucune gÃ©olocalisation â€” anti-partage par dÃ©lai minimal optionnel
**Date** : 2026-07-22
**Status** : Accepted
**Context** : garantir qu'un joueur est physiquement passÃ© Ã  chaque Ã©tape
plaiderait pour une vÃ©rification GPS ou une distance minimale entre scans.
Mais le principe fondateur du produit est qu'aucune donnÃ©e personnelle
n'est requise pour jouer (ADR-008) â€” la position en est une, sensible.

**Decision** : refus EXPLICITE de toute gÃ©olocalisation / distance
minimale. Le seul garde-fou anti-triche est un dÃ©lai minimal OPTIONNEL
entre deux scans d'un mÃªme joueur (`hunts.min_scan_interval_seconds`,
0 = dÃ©sactivÃ©, plafond 24 h), qui dÃ©courage le partage de photos des QR
sans jamais lire la position. L'ordre imposÃ© optionnel
(`order_mode = 'ordered'`) ajoute une contrainte de parcours, Ã©galement
sans localisation.

**Consequences** : le produit n'a aucune preuve de prÃ©sence physique â€” un
joueur dÃ©terminÃ© peut se faire envoyer les photos des QR. Compromis assumÃ©
au nom de la vie privÃ©e. Le dÃ©faut `min_scan_interval_seconds = 0` est Ã 
l'Ã©tude (un dÃ©faut > 0 frictionnerait le partage d'entrÃ©e de jeu) â€” suivi
en roadmap.

---

## ADR-027 : Chasse au trÃ©sor V1 mono-organisation
**Date** : 2026-07-22
**Status** : Accepted
**Context** : une chasse Â« de quartier Â» rÃ©unissant plusieurs commerÃ§ants
partenaires (Ã©tapes dans des boutiques distinctes, lot commun) est une
demande naturelle. Mais toutes les tables de la chasse portent un
`organization_id` unique et les gardes inter-tenant (RLS, FK composites
`(id, organization_id)`, gardes service-role) supposent une seule
organisation propriÃ©taire.

**Decision** : la V1 est dÃ©libÃ©rÃ©ment mono-organisation. Ã‰tapes, joueurs,
scans et complÃ©tion appartiennent Ã  la mÃªme organisation ; l'intÃ©gritÃ©
inter-tenant est vÃ©rifiÃ©e par des FK composites `(step/player, hunt,
organization)` et une rÃ©ponse gÃ©nÃ©rique unique cÃ´tÃ© public. Le
multi-commerÃ§ants partenaires (multi-tenant croisÃ© : qui possÃ¨de la chasse,
qui voit les joueurs, qui honore le lot) est un chantier distinct, reportÃ©.

**Consequences** : le modÃ¨le de donnÃ©es et les gardes restent l'exact
miroir de Pronostics â€” aucune complexitÃ© multi-tenant croisÃ©e introduite
prÃ©maturÃ©ment. L'ouverture au multi-commerÃ§ants demandera un modÃ¨le de
propriÃ©tÃ© partagÃ©e et une refonte des gardes ; notÃ© en roadmap (Â« suites
ouvertes Â»).

---

## ADR-028 : Passeport de fidÃ©litÃ© â€” addon d'organisation, rÃ©compense mixte lot/spin
**Date** : 2026-07-22
**Status** : Accepted
**Context** : nouveau module de gamification â€” le client cumule des visites
(Â« tampons Â») sur un passeport dÃ©matÃ©rialisÃ©, avec des paliers configurables
et des niveaux bronze/argent/or. Deux choix structurants, comme pour la
chasse : comment l'activer, et comment rÃ©compenser un palier.

**Decision** : addon d'organisation `organizations.addon_loyalty`, miroir
exact d'`addon_hunts` â€” activÃ© depuis le back-office admin (option payante ou
incluse dans un plan), gating par `hasLoyaltyAccess` (addon +
`hasActiveAccess` : un essai expirÃ© coupe aussi la fidÃ©litÃ©). Cumul de visites
â†’ tampon numÃ©rique ; niveaux `bronze/silver/gold` calquÃ©s sur `visit_count`
(seuils `silver_threshold`/`gold_threshold` configurables). Les paliers
(`loyalty_milestones`, Ã  N visites) portent une rÃ©compense MIXTE, choisie par
palier : `reward_type = 'lot'` (lot direct dÃ©crit sur le palier, code de
retrait `FIDELITE-XXXXXXXX` remis en caisse via `redeem_loyalty_reward`)
OU `reward_type = 'spin'` (tour de roue offert â€” ADR-029).
V1 mono-organisation (multi-Ã©tablissements reportÃ©).

> **Mise Ã  jour GA (ADR-031, supersede ce point)** : le stock du palier,
> dÃ©crit ici Ã  l'origine comme Â« optionnel Â», est devenu **obligatoire et
> fini** sur les DEUX types de palier (`lot` et `spin`), et un palier ne peut
> plus se dÃ©clencher avant la visite 2. C'est ce qui borne l'engagement
> financier du commerÃ§ant. Voir ADR-031.

**Consequences** : 5 tables (`loyalty_programs`/`_milestones`/`_members`/
`_stamps`/`_rewards`), miroir du modÃ¨le chasse (FK composites tenant, RLS
`is_org_member` en lecture d'Ã©quipe, `is_org_editor` en Ã©criture). Le code
`FIDELITE-` partage l'alphabet sans I/O/0/1 des autres codes mais son prÃ©fixe
distinct sert au routage caisse par type. Le niveau (`tier`) est dÃ©normalisÃ© :
un lÃ©ger retard aprÃ¨s changement de seuil est rattrapÃ© au tampon suivant. Pas
d'expiration du code de fidÃ©litÃ© en V1 (comme la chasse, contrairement Ã  la
roue). Remise par RPC dÃ©diÃ©e `redeem_loyalty_reward` (contrat identique Ã 
`redeem_hunt_completion` : atomique, auditÃ©e, org-scopÃ©e).

---

## ADR-029 : Tour de roue offert â€” grant Ã  usage unique branchÃ© sur le moteur de spin
**Date** : 2026-07-22
**Status** : Accepted
**Context** : un palier de fidÃ©litÃ© peut offrir un tour de roue. La roue existe
avec tout son cycle (tirage pondÃ©rÃ© anti-triche, claim HMAC, stock, expiration,
Wallet) et une limite de jeu par-fenÃªtre. Il faut offrir un spin MÃ‰RITÃ‰ sans
dupliquer ce moteur ni affaiblir l'anti-triche du gain.

**Decision** : un palier `reward_type = 'spin'` cible une roue de la MÃŠME
organisation (`target_wheel_id`, FK composite tenant â€” impossible d'offrir la
roue d'une autre org). L'atteindre crÃ©e une ligne `loyalty_rewards` portant un
`grant_token` Ã  usage unique (48 hex). `consume_loyalty_spin_grant` Ã©change ce
jeton contre EXACTEMENT un tirage atomique sur la roue cible â€” mÃªme algorithme
pondÃ©rÃ© que `perform_atomic_spin` (rÃ©servation de stock incluse) mais SANS la
limite de jeu par-fenÃªtre (le joueur a mÃ©ritÃ© ce spin). Le spin insÃ©rÃ© porte
`source = 'loyalty'` (valeur ajoutÃ©e Ã  la contrainte `spins.source`) et
dÃ©bouche sur le FLUX DE GAIN NORMAL : jeton HMAC signÃ© cÃ´tÃ© app â†’
`claim_winning_spin` â†’ participation + code `GAIN-â€¦`. Anti-rejeu par verrou de
ligne (`for update of r`) plus lien grantâ†”passeport (le grant seul, sans le
cookie du membre, ne consomme rien).

**Consequences** : le moteur spin/claim/Wallet n'est pas modifiÃ© â€” seule la
valeur `'loyalty'` s'ajoute Ã  `spins.source` (spin journalisÃ© distinctement,
hors stats direct/share et hors limite de jeu). Si la roue cible n'a plus
aucun lot disponible, le grant reste NON consommÃ© (rejouable au
rÃ©approvisionnement). Le client passe du passeport au tirage puis au retrait
de gain sans couture ni double comptage.

---

## ADR-030 : Passeport â€” deux modes de validation de visite, limites fermÃ©es avant GA
**Date** : 2026-07-22
**Status** : Accepted
**Context** : valider qu'un client est rÃ©ellement venu est le cÅ“ur du module.
Deux approches, au choix du commerÃ§ant, aux compromis opposÃ©s.

**Decision** : le mode est portÃ© par le PROGRAMME (`validation_mode`), jamais
par l'appelant :
- `rotating_code` : un code type TOTP Ã  6 chiffres tourne sur un Ã©cran au
  comptoir (`current_loyalty_code`, RPC service role). Le serveur recalcule le
  code attendu depuis `rotating_secret` et l'horloge, avec une fenÃªtre Â±1
  pÃ©riode pour la dÃ©rive. Le secret NE SORT JAMAIS cÃ´tÃ© client (colonne exclue
  des grants `authenticated`, gÃ©nÃ©rÃ©e par trigger `SECURITY DEFINER`).
- `staff` : un membre owner/editor/cashier valide la visite depuis la caisse
  (scan du QR passeport) ; la RPC exige `p_validated_by` (identitÃ© du staff).
  L'action backend authentifie le rÃ´le AVANT d'appeler avec le service role,
  ce qui ferme le chemin public sur un programme staff (un tampon staff sans
  validateur est refusÃ©).

Cooldown anti-abus `min_stamp_interval_seconds` (dÃ©faut 24 h) ; tampon au POST
uniquement (jamais au GET) ; identitÃ© joueur = cookie HTTP-only + hash SHA-256
(aucune PII), miroir chasse.

Les deux limites initialement assumÃ©es pour la bÃªta ont Ã©tÃ© FERMÃ‰ES avant la
GA (8 revues sÃ©curitÃ© successives, 2026-07-22) :
- mode `staff` : le QR n'encode plus le jeton de session (bearer 180 j) mais un
  **jeton de check-in signÃ© HMAC, TTL 3 min**, qui n'autorise QUE la validation
  d'une visite par un staff authentifiÃ© â€” un QR photographiÃ© est inerte aprÃ¨s
  expiration et ne donne accÃ¨s ni aux codes de retrait ni aux tours offerts ;
- rejeu dans la fenÃªtre : planchers de cooldown durcis en base â€” 300 s en mode
  `staff` (TTL du jeton + marge) et `max(2 Ã— pÃ©riode, 300 s)` en mode
  `rotating_code`, de sorte que la durÃ©e de validitÃ© d'un code soit TOUJOURS
  couverte par le cooldown. Un code lu une fois ne vaut donc jamais 2 tampons.

LIMITE RÃ‰SIDUELLE RÃ‰ELLEMENT ASSUMÃ‰E : en mode `rotating_code`, le code est
affichÃ© publiquement par conception ; il peut donc Ãªtre relayÃ© Ã  distance dans
sa fenÃªtre. Aucun mode ne prouve une prÃ©sence physique â€” cohÃ©rent avec le refus
de gÃ©olocalisation (ADR-026). Ce qui borne l'abus n'est PAS le contrÃ´le d'accÃ¨s
mais l'Ã©conomie du programme (ADR-031) : un passeport fabriquÃ© ne vaut rien
(palier â‰¥ visite 2) et la perte totale est plafonnÃ©e par un stock fini
obligatoire.

**Consequences** : le mode `staff` est structurellement plus fort (un humain
atteste la visite) ; le mode `rotating_code` est livrÃ© parce que sa faiblesse
est neutralisÃ©e Ã©conomiquement, pas parce qu'elle est nÃ©gligeable. Le cooldown
reste la borne par passeport (au plus 1 tampon / passeport / intervalle).

---

## ADR-031 : Passeport â€” la boucle economique est fermee par des bornes produit, pas par du rate limiting
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
1. **Stock fini OBLIGATOIRE sur tous les paliers** â€” pour un palier `lot` il
   plafonne les codes de retrait emis ; pour un palier `spin` il plafonne les
   GRANTS emis. Plus de `reward_stock` null (Â« illimite Â»).
2. **Palier minimum a la visite 2** â€” un passeport fraichement cree ne declenche
   AUCUNE recompense, ce qui rend la frappe de masse d'identites sans objet.

En defense en profondeur : un tour offert par la fidelite ne peut pas tirer un
lot a stock illimite (la roue publique le tolere car elle est bornee par la
limite de jeu et la fenetre de campagne ; le tour offert n'a aucune de ces
bornes), et `consume_loyalty_spin_grant` verifie le statut et les dates de la
campagne ciblee.

**Consequences** : la perte maximale d'un commercant sous attaque optimale est
CHIFFRABLE et FINIE â€” mesuree a ~150 EUR de marchandise pour une configuration
type, atteinte en ~12 min, apres quoi le programme est sterile. Le commercant
perd deux libertes de configuration (Â« cadeau des la 1re visite Â», lot
Â« illimite Â») ; c'est le prix de la borne, et l'editeur l'explique. Limite
residuelle assumee : un tour offert GAGNANT preleve une unite du stock de la
campagne publique ciblee et s'impute a son budget â€” transfert de cout que le
commercant fixe, desormais annonce dans l'UI.

---

## ADR-032 : Regle transverse â€” aucun seau fail-closed sur une cle partagee dans un parcours public
**Date** : 2026-07-22
**Status** : Accepted

**Context** : le meme piege s'est reproduit SIX fois pendant le chantier
passeport, y compris dans des correctifs censes durcir : un rate limit
`failClosed` pose sur une cle PARTAGEE entre utilisateurs (IP, programme,
organisation) est un INTERRUPTEUR. N'importe qui derriere le meme Wi-Fi de
commerce ou le meme CGNAT mobile coupe le service pour tous les autres, a un
cout derisoire (Â« deni d'inscription d'un programme entier pour ~10 EUR/jour Â»,
Â« interrupteur permanent a 0,1 req/s Â»). Le codebase documentait deja la lecon
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
`prono:*` et `spin:ip` â€” suivi dans docs/bugs.md.

---

## ADR-033 : Jackpot collectif â€” jauge partagÃ©e, tirage atomique Ã©quitable et vÃ©rifiable
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable Ã  Pronostics / Chasse /
Passeport) â€” une CAGNOTTE COLLECTIVE : au lieu d'un tirage individuel par joueur,
tous les clients d'un commerce alimentent une mÃªme jauge partagÃ©e (chaque
participation validÃ©e = +1 sur un compteur global affichÃ© en temps rÃ©el), et le
gain se dÃ©clenche au niveau de cette jauge. Trois choix structurants : comment
dÃ©clencher le gain sur un compteur partagÃ©, comment garantir un tirage juste et
prouvable, et comment rÃ©utiliser l'anti-triche et les verrous Ã©conomiques dÃ©jÃ 
Ã©prouvÃ©s sur le Passeport (ADR-030, ADR-031, ADR-032).

**Decision** :
- **Addon d'organisation `organizations.addon_jackpot`** (miroir exact
  d'`addon_loyalty`), activÃ© depuis le back-office admin, gating par
  `hasJackpotAccess` (addon + `hasActiveAccess`). V1 mono-organisation : une
  seule jauge, une seule organisation propriÃ©taire (le multi-commerces sur une
  mÃªme jauge = multi-tenant croisÃ©, reportÃ© â€” cf. ADR-027/ADR-028).
- **Jauge PARTAGÃ‰E sans kill-switch** : le compteur global (`current_count`) est
  incrÃ©mentÃ© de 1 par participation validÃ©e sous le verrou de la campagne. La
  participation publique applique STRICTEMENT ADR-032 â€” aucun seau `failClosed`
  sur une clÃ© partagÃ©e (IP, campagne, organisation) ; la sÃ©curitÃ© repose sur
  l'anti-triche par identitÃ© et sur les bornes Ã©conomiques, jamais sur
  l'Ã©tranglement d'une clÃ© commune (qui, sur une jauge de commerce, serait un
  interrupteur de dÃ©ni de participation pour tous).
- **Anti-triche RÃ‰UTILISÃ‰ du Passeport** (ADR-030) portÃ© par la campagne
  (`validation_mode`) : `rotating_code` (code type TOTP Ã  6 chiffres sur l'Ã©cran
  comptoir, secret jamais exposÃ© au client, fenÃªtre Â±1 pÃ©riode) ou `staff`
  (jeton de check-in signÃ© HMAC, domaine `jackpot-checkin:`, validÃ© par un membre
  owner/editor/cashier authentifiÃ©). Cooldown par joueur
  (`min_participation_interval_seconds`) Ã  plancher durci â‰¥ 300 s : un code lu
  une fois ne vaut jamais 2 participations.
- **3 modes de rÃ©solution** (`draw_mode`) :
  - `threshold_draw` : Ã  l'atteinte du seuil, tirage automatique et atomique
    parmi TOUS les participants du cycle ;
  - `rescan_win` : jauge pleine = campagne ARMÃ‰E ; chaque participation
    ultÃ©rieure est une chance de gain INSTANTANÃ‰ (le gagnant est toujours
    l'appelant) ;
  - `date_draw` : tirage Ã  date via le cron `jackpot-draws`
    (`run_jackpot_date_draws`, pg_cron SQL direct).
- **Tirage ATOMIQUE, Ã‰QUITABLE et VÃ‰RIFIABLE** : le tirage se fait sous verrou de
  la campagne, avec source cryptographique (`gen_random_bytes`), et l'unicitÃ©
  `unique(campaign_id, cycle)` sur `jackpot_wins` garantit UN SEUL gagnant par
  cycle â€” jamais de sur-Ã©mission. La graine du tirage (`draw_seed`) est
  JOURNALISÃ‰E pour l'auditabilitÃ© (tirage reproductible / vÃ©rifiable).
- **RÃ©compense = lot unique `JACKPOT-â€¦`** remis en caisse (RPC dÃ©diÃ©e
  `redeem_jackpot_prize`, miroir de `redeem_loyalty_reward`). **Stock fini
  OBLIGATOIRE** (ADR-031) = nombre de gagnants / cycles ; c'est ce qui borne
  l'engagement financier du commerÃ§ant.
- **`date_draw` = tirage UNIQUE (one-shot)** : aprÃ¨s un tirage Ã  date, le cycle
  N'EST PAS rouvert (`reward_claimed_count + 1` seul, pas de `cycle + 1` ni de
  remise Ã  zÃ©ro de la jauge). Le garde `not exists jackpot_wins (â€¦cycleâ€¦)` exclut
  ensuite dÃ©finitivement la campagne des cron suivants. La campagne reste
  `active` (NON archivÃ©e) pour que le gagnant, tirÃ© de faÃ§on asynchrone, puisse
  rÃ©cupÃ©rer son code `JACKPOT-â€¦` sur la page publique (`loadJackpotContext` exige
  `status = 'active'`).
- **ConfidentialitÃ© du code (ADR-032 / dÃ©fense en profondeur)** : en
  `threshold_draw`, le dÃ©clencheur du seuil n'est pas forcÃ©ment le gagnant tirÃ© ;
  le code de retrait n'est renvoyÃ© QU'AU gagnant rÃ©el â€” deux couches :
  `case when v_is_winner then v_win_code else null` cÃ´tÃ© SQL, et
  `code: isWinner ? â€¦ : null` dans `mapJackpotParticipation` cÃ´tÃ© app. Le vrai
  gagnant rÃ©cupÃ¨re son code via la page publique (`jackpot_wins` filtrÃ© sur
  `winner_token_hash`).
- **Page publique suivable `/jackpot/[id]`** installable (PWA, manifest par
  campagne `manifest.webmanifest`) affichant la jauge en temps rÃ©el, un montant
  d'affichage croissant PUREMENT COSMÃ‰TIQUE (`display_amount_cents`, aucun lien
  avec le stock rÃ©el) et un bloc de contenu commerÃ§ant. Ã‰cran comptoir temps rÃ©el
  (`/dashboard/jackpot/[id]/comptoir`). Caisse unifiÃ©e par `source`.

**Consequences** :
- La perte maximale d'un commerÃ§ant est CHIFFRABLE et FINIE (stock fini
  obligatoire = nombre de gagnants), comme sur le Passeport (ADR-031).
- **RGPD** : la purge (`purge_expired_jackpot_players`) conserve les hashes
  anonymes des tirages (`winner_token_hash`, SHA-256 d'un jeton alÃ©atoire
  192 bits, aucune PII) pour la vÃ©rifiabilitÃ© du palmarÃ¨s â€” conforme (aucune
  donnÃ©e personnelle retenue). IdentitÃ© joueur = cookie HTTP-only + hash, aucune
  PII Ã  la participation (miroir Passeport / Chasse).
- **Limites V1 assumÃ©es** (suivi docs/bugs.md, prioritÃ© basse) : (1) le stock
  rÃ©siduel d'un `date_draw` non distribuÃ© (un seul gagnant tirÃ©, stock > 1) reste
  non attribuÃ© ; (2) aprÃ¨s un tirage `date_draw`, les scans post-tirage
  incrÃ©mentent SEULEMENT la jauge cosmÃ©tique sans produire de gain. Ces deux
  compromis dÃ©coulent directement du choix Â« tirage Ã  date unique Â».
- Le moteur anti-triche, les verrous Ã©conomiques et la caisse ne sont pas
  dupliquÃ©s : le module rÃ©utilise les mÃ©canismes du Passeport et n'ajoute que la
  logique de jauge partagÃ©e et les 3 modes de rÃ©solution.

---

## ADR-034 : Mode Ã©vÃ©nement en direct â€” expÃ©rience synchronisÃ©e Ã  trois interfaces, machine Ã  Ã©tats serveur
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable Ã  Pronostics / Chasse /
Passeport / Jackpot) â€” une animation LIVE dans le commerce (bar, salle) oÃ¹ un
organisateur enchaÃ®ne des questions face Ã  un public : l'Ã©cran de la salle
affiche la question, chaque client rÃ©pond sur son tÃ©lÃ©phone, et un classement
s'actualise en direct. Trois choix structurants : comment tenir SYNCHRONISÃ‰ES
trois surfaces distinctes (Ã©cran, tÃ©lÃ©phones, tÃ©lÃ©commande), comment garantir
qu'aucune bonne rÃ©ponse ne fuite avant la rÃ©vÃ©lation, et comment scorer la
rapiditÃ© sans jamais faire confiance Ã  l'horloge d'un client.

**Decision** :
- **Addon d'organisation `organizations.addon_events`** (miroir exact
  d'`addon_jackpot`), activÃ© depuis le back-office admin, gating par
  `hasEventsAccess` (addon + `hasActiveAccess`). V1 mono-organisation.
- **Trois interfaces d'une mÃªme RUN, synchronisÃ©es** :
  - **Ã©cran public** (TV du bar, `/event/[code]/screen`) â€” question, dÃ©compte,
    rÃ©partition/podium, plein Ã©cran ;
  - **tÃ©lÃ©phone joueur** (`/event/[code]`, public) â€” le client rejoint avec un
    **pseudo + avatar** (aucune PII), rÃ©pond, voit son rang ;
  - **tÃ©lÃ©commande organisateur** (`/dashboard/events/[id]/remote`,
    AUTHENTIFIÃ‰E) â€” pilote la machine Ã  Ã©tats. `[code]` est le `join_code` de la
    session (rÃ©solu par `event-context.ts`, service-role + garde inter-tenant).
- **Moteur Â« question Â» gÃ©nÃ©rique** (`event_questions.kind`), un seul chemin de
  code pour trois usages : `quiz` (bonne rÃ©ponse prÃ©dÃ©finie, scorÃ©e),
  `poll`/sondage (AUCUNE bonne rÃ©ponse, on affiche la rÃ©partition des votes),
  `prono` (pas de bonne rÃ©ponse Ã  la crÃ©ation â€” l'organisateur la DÃ‰SIGNE au
  reveal, `reveal_event_question(p_correct_option_id)`).
- **SÃ©paration CONTENU / RUN** : le CONTENU rÃ©utilisable
  (`event_games` / `event_questions` / `event_question_options`) est Ã©ditÃ© Ã 
  froid dans le dashboard ; la RUN jetable
  (`event_sessions` / `event_players` / `event_answers` / `event_wins`) porte
  l'Ã©tat live. Un mÃªme jeu peut Ãªtre rejouÃ© en plusieurs sessions.
- **Machine Ã  Ã©tats SERVEUR** portÃ©e par `event_sessions.phase`
  (`lobby â†’ question_active â†’ question_locked â†’ reveal â†’ leaderboard â†’ ended`),
  chaque transition Ã©tant une RPC `is_org_editor`
  (`start_event_session`, `launch_event_question`, `lock_event_question`,
  `reveal_event_question`, `show_event_leaderboard`, `end_event_session`).
  L'organisateur ne Â« pousse Â» jamais d'Ã©tat : il fait avancer la machine, les
  trois surfaces relisent l'Ã©tat officiel.
- **RÃ©compense = podium Ã  l'Ã©cran + lot fini `EVENT-â€¦`** remis en caisse (RPC
  dÃ©diÃ©e `redeem_event_prize`, miroir de `redeem_jackpot_prize`). **Stock fini
  OBLIGATOIRE** (ADR-031) = nombre de gagnants du podium ; c'est ce qui borne
  l'engagement financier du commerÃ§ant.
- Migration `20260727120000_events_live.sql`.

**INVARIANTS DE SÃ‰CURITÃ‰** :
- **Non-fuite de la bonne rÃ©ponse â€” 4 dÃ©fenses redondantes** (vÃ©rifiÃ©es sur les
  payloads rÃ©els par la revue). La colonne `event_question_options.is_correct`
  (quiz) et la dÃ©signation `prono` ne doivent JAMAIS Ãªtre lisibles par le public
  avant la phase `reveal` : (1) grants anon RÃ‰VOQUÃ‰S sur toutes les tables du
  module (le public n'a aucun accÃ¨s SQL direct) ; (2) lecture publique UNIQUEMENT
  via la RPC `event_public_state`, qui EXCLUT la correction tant que
  `phase â‰  'reveal'` ; (3) le mapping backend (`mapEventPublicState`) re-filtre
  la correction hors reveal, pour qu'une rÃ©gression SQL ne puisse pas re-fuiter ;
  (4) AUCUN autre chemin public n'expose la correction (join/submit ne la
  renvoient jamais).
- **Scoring SERVEUR-AUTORITATIF** : `launch_event_question` pose
  `event_sessions.current_question_started_at = now()` (serveur) ; au submit,
  `elapsed_ms = now() - current_question_started_at` est calculÃ© EN BASE â€” aucune
  valeur de temps client n'est jamais acceptÃ©e. `submit_event_answer` refuse
  toute rÃ©ponse hors fenÃªtre ou hors phase (`phase â‰  question_active`, autre
  question courante, dÃ©lai dÃ©passÃ©), l'unicitÃ© `(session, question, joueur)` rend
  la rÃ©ponse immuable, et le verrou `for update` est homogÃ¨ne entre reveal et
  submit (pas de course). Les points ne sont Ã©crits qu'au reveal, par
  `reveal_event_question` (SECURITY DEFINER).
- **Transport temps rÃ©el â€” polling PRIMAIRE, Realtime ping-only** (premiÃ¨re
  brique temps rÃ©el du projet). Le canal nominal est le POLLING de `getEventState`
  (â†’ `event_public_state`) : les trois surfaces marchent SANS Supabase Realtime.
  Le broadcast Realtime est une OPTIMISATION de latence activable
  (`EVENTS_REALTIME_ENABLED`) qui ne diffuse QU'UN ping Â« refresh Â» horodatÃ©
  (aucun Ã©tat mÃ©tier sur le canal â†’ rien Ã  fuiter, la bonne rÃ©ponse ne transite
  jamais par le broadcast) : le client, au ping, redÃ©clenche un `getEventState`
  service-role. Coupable Ã  tout moment sans perte de correction.
- **Rate limiting (ADR-032)** : `join`/`submit` sont publics et jouÃ©s Ã  IP
  PARTAGÃ‰E (Wi-Fi du bar) â†’ aucun seau `failClosed` sur une clÃ© partagÃ©e. Seuls
  les seaux d'identitÃ© (cookie joueur) et d'opÃ©rateur (session/organisateur) sont
  bloquants ; l'IP n'est qu'en observabilitÃ© fail-open.

**Rationale** : une seule source de vÃ©ritÃ© (l'Ã©tat serveur relu par les trois
surfaces) Ã©vite toute divergence entre Ã©cran, tÃ©lÃ©phones et tÃ©lÃ©commande sans
protocole de synchronisation applicatif. Le moteur Â« question Â» gÃ©nÃ©rique livre
quiz, sondage et prono par configuration, pas par trois chemins de code. Le
polling primaire garantit que le module fonctionne mÃªme sans le canal Realtime du
projet (qui n'existait pas avant ce chantier), ce dernier n'apportant que de la
latence.

**Consequences** :
- RÃ©utilisation directe d'ADR-031 (stock fini obligatoire borne la perte
  commerÃ§ant) et d'ADR-032 (parcours public Ã  clÃ© partagÃ©e, jamais de kill-switch).
- **Limites V1 assumÃ©es** (suivi docs/bugs.md) :
  - **Capture du podium par sybil multi-cookie** : un joueur peut recrÃ©er
    plusieurs identitÃ©s (cookies/pseudos) et truster le podium. L'abus est BORNÃ‰
    par le stock fini du lot (ADR-031) ; parade optionnelle non retenue en V1 :
    Turnstile au premier `join`.
  - **RGPD** : la purge (`purge_expired_event_sessions`) supprime les pseudos et
    les rÃ©ponses des sessions expirÃ©es ; le registre des sessions
    (`event_sessions`) et des gains (`event_wins`) est conservÃ© ANONYME (aucune
    PII â€” pseudo/avatar publics par conception, hash de jeton, aucune coordonnÃ©e
    Ã  la participation). Conforme.
  - Le pseudo est durci contre le brouillage d'affichage (refus des caractÃ¨res
    de contrÃ´le/formatage Unicode Cc/Cf â€” bidi, zÃ©ro-largeur ; pas de faille XSS,
    React Ã©chappe, mais Ã©vite l'usurpation et le brouillage de l'Ã©cran TV â€”
    finding FAIBLE de la revue, rÃ©solu `e39a40c`).

---

## ADR-035 : Calendrier de l'Avent & campagnes quotidiennes â€” gating temporel serveur, non-fuite du contenu non ouvert
**Date** : 2026-07-23
**Status** : Accepted
**Context** : nouveau module de gamification (comparable Ã  Pronostics / Chasse /
Passeport / Jackpot / Ã‰vÃ©nement) â€” une campagne QUOTIDIENNE Ã  mÃ©canique
ANNUELLE : le joueur, venu par le lien/QR du commerce, revient chaque jour ouvrir
UNE case (Avent, semaine anniversaire, compte Ã  rebours, 7 jours de cadeaux,
festival multi-jours, lancement produit, semaine soldes), OU suit le calendrier Ã 
distance en s'abonnant Ã  un rappel email. Deux propriÃ©tÃ©s sont le cÅ“ur du
produit et de la sÃ©curitÃ© : il doit Ãªtre IMPOSSIBLE d'ouvrir une case en avance,
et le contenu d'une case non encore ouverte ne doit JAMAIS fuiter.

**Decision** :
- **Addon d'organisation `organizations.addon_calendar`** (miroir exact
  d'`addon_events`), activÃ© depuis le back-office admin, gating par
  `hasCalendarAccess` (addon + `hasActiveAccess`). V1 mono-organisation.
- **4 types de case** (`calendar_days.kind`) : `content` (message/offre affichÃ©),
  `lot` (code de retrait `CADEAU-â€¦` Ã  stock fini), `spin` (tour de roue offert â†’
  branchÃ© sur le moteur de spin existant, grant Ã  usage unique via
  `consume_calendar_spin_grant`, source `spins.source = 'calendar'` â€” miroir du
  tour offert Passeport, ADR-029), plus une **rÃ©compense d'assiduitÃ© finale**
  (toutes les cases ouvertes â†’ un `CADEAU-â€¦` supplÃ©mentaire). Une case peut Ãªtre
  marquÃ©e Â« spÃ©ciale Â» et partagÃ©e.
- **Migration `20260728120000_calendar_campaigns.sql`** : 5 tables `calendars`,
  `calendar_days`, `calendar_openings`, `calendar_rewards`, `calendar_players`
  (FK composites tenant, RLS org-scopÃ©e `is_org_member`/`is_org_editor`, aucun
  accÃ¨s anon). RPC service-role : `join_calendar`, `open_calendar_box`,
  `consume_calendar_spin_grant`, `calendar_public_state`,
  `calendar_reminder_targets`, `redeem_calendar_reward`,
  `purge_expired_calendar_players` (+ trigger `calendars_set_defaults` qui dÃ©rive
  les `unlock_at`). `spins.source` Ã©tendu Ã  `'calendar'`.
- **RÃ©compense = lot fini `CADEAU-â€¦`** remis en caisse (RPC dÃ©diÃ©e
  `redeem_calendar_reward`, miroir de `redeem_event_prize` â€” org-scopÃ©e, auditÃ©e),
  couvrant DEUX origines du mÃªme prÃ©fixe : une case-lot (`calendar_openings`) et
  la rÃ©compense d'assiduitÃ© (`calendar_rewards`). **Stock fini OBLIGATOIRE**
  (ADR-031) borne l'engagement financier du commerÃ§ant. Caisse unifiÃ©e par
  `source` â€” `lookupRedeemCode` route dÃ©sormais **6 prÃ©fixes**
  (roue/chasse/fidÃ©litÃ©/jackpot/Ã©vÃ©nement/calendrier).
- **Transport = polling** (miroir des autres parcours publics ; le Realtime
  ping-only introduit par l'Ã‰vÃ©nement â€” ADR-034 â€” n'est pas requis ici, une case
  se dÃ©verrouille Ã  Ã©chÃ©ance fixe, pas en direct).
- **5 thÃ¨mes Â« carton Â»** (`calendar-theme.ts` : neutre / noÃ«l / anniversaire /
  soldes / festival) ; page publique `/calendar/[slug]` installable (PWA,
  `manifest.webmanifest` par calendrier). Rappel quotidien opt-in via le cron
  Vercel `/api/cron/calendar-reminders` (`15 9 * * *`).

**INVARIANTS DE SÃ‰CURITÃ‰ (2 neufs, confirmÃ©s par revue adversariale)** :
- **Gating temporel SERVEUR-AUTORITATIF** : `open_calendar_box` tranche sur
  `now()` (horloge base) contre `unlock_at`, jamais sur un horodatage client.
  `unlock_at` est DÃ‰RIVÃ‰ serveur (minuit civil de `start_date + offset` dans le
  fuseau du calendrier, recalculÃ© Ã  chaque modification de grille â€” robuste au
  changement d'heure via `Intl.DateTimeFormat`, `calendarDayUnlockAt`) et
  modifiable seulement par `is_org_editor`. Ouvrir une case en avance est
  impossible par construction.
- **Non-fuite du contenu d'une case non ouverte â€” quadruple dÃ©fense** : (1) la RPC
  `calendar_public_state` n'expose, hors Ã©tat `opened`, que
  `{day_index, unlock_at, status, is_special}` â€” jamais le contenu ; (2) le
  mapper backend force le contenu Ã  `null` pour toute case non ouverte ; (3) une
  tentative trop prÃ©coce (`too_early`) ne renvoie AUCUN contenu ; (4)
  RLS/grants â€” le public n'a aucun accÃ¨s SQL direct.

**Rationale** : le dÃ©verrouillage Ã  Ã©chÃ©ance fixe et l'absence de fuite reposent
sur une source de vÃ©ritÃ© unique (l'Ã©tat serveur : `now()` en base et `unlock_at`
dÃ©rivÃ© serveur), jamais sur le client. Le module rÃ©utilise les mÃ©canismes
Ã©prouvÃ©s â€” moteur de spin et flux de gain (ADR-029, tour offert), stock fini
obligatoire (ADR-031), rÃ¨gle rate-limit (ADR-032), caisse unifiÃ©e par `source`
(ADR-023) â€” et n'ajoute que la logique de cases temporisÃ©es et de rappel.

**Consequences** :
- **Rate-limit (ADR-032)** : parcours public Ã  clÃ© partagÃ©e (Wi-Fi du commerce) â€”
  aucun seau `failClosed` sur clÃ© partagÃ©e ; seuls les seaux d'identitÃ© (cookie
  joueur) et d'opÃ©rateur authentifiÃ© sont bloquants, l'IP reste en observabilitÃ©
  fail-open.
- **DÃ©cision anti-spoiler (finding de revue, corrigÃ© `5c4d89f`)** : le
  prÃ©chargement des roues cibles des cases `spin` rÃ©vÃ©lait, dans le payload RSC,
  les segments (lots) et la config de collecte de TOUTES les roues visÃ©es, y
  compris des cases de jours VERROUILLÃ‰S (un visiteur pouvait lire le lot rare
  d'une case future). L'invariant strict #2 n'Ã©tait PAS cassÃ© (aucune association
  jourâ†’roue, aucun code de retrait exposÃ©), mais le spoiler Ã©tait rÃ©el. Fix :
  prÃ©chargement limitÃ© aux roues des cases DÃ‰JÃ€ ouvertes par le joueur, et
  `openCalendarBox` renvoie le bundle de la case qu'il vient d'ouvrir (module
  `src/lib/calendar-spin-bundle.ts`, `loadCalendarSpinBundles` ; `organizationId`
  ajoutÃ© au contexte d'action ; cÃ´tÃ© client `allBundles` = prÃ©chargÃ© +
  Ã -la-volÃ©e). VÃ©rifiÃ© : typecheck âœ“, eslint âœ“, 775 tests âœ“.
- **RÃ©sidus assumÃ©s** (suivi docs/bugs.md, prioritÃ© basse) :
  - **UUID des cases (`dayIds`) exposÃ©s au client, futurs compris** â€”
    ASSUMÃ‰/neutralisÃ© : `open_calendar_box` sur un UUID verrouillÃ© renvoie
    `too_early` sans aucun contenu ; les restreindre casserait le dÃ©verrouillage
    Ã  minuit page ouverte (les `dayIds` ne sont pas rafraÃ®chis par le poll).
  - **Purge RGPD conditionnÃ©e Ã  l'archivage** â€”
    `purge_expired_calendar_players` ne purge que les calendriers `archived` ;
    l'archivage automatique n'a lieu que pour les organisations Ã 
    `data_retention_months` non nul (opt-in commerÃ§ant assumÃ©, relayÃ© par le cron
    de rappel/archivage).
  - `calendar_public_state` ne re-vÃ©rifie pas addon/statut actif (service-role
    only ; les server actions gatent avant appel) â€” sans consÃ©quence.
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `calendar.test.sql`, E2E
  `e2e/calendar.spec.ts`, seed.

---

## ADR-036 : Parrainage ludique â€” validation par PARTICIPATION rÃ©elle, Ã©conomie bornÃ©e, jauge d'Ã©quipe partagÃ©e
**Date** : 2026-07-24
**Status** : Accepted
**Context** : nouveau module de croissance (comparable Ã  Pronostics / Chasse /
Passeport / Jackpot / Ã‰vÃ©nement / Calendrier) greffÃ© sur les campagnes ROUE â€” un
joueur satisfait devient PARRAIN et invite ses proches ; chaque filleul qui vient
JOUER fait progresser une jauge d'Â« Ã©quipe Â» partagÃ©e et dÃ©bloque des rÃ©compenses
pour le parrain, le filleul et, au seuil, un coffre collectif. Quatre choix
structurants ont Ã©tÃ© tranchÃ©s avec le propriÃ©taire du produit : (1) sur quoi porte
le parrainage et comment l'activer, (2) ce qui vaut Â« parrainage validÃ© Â», (3) qui
gagne quoi et comment le commerÃ§ant le configure, (4) ce qu'est une Â« Ã©quipe Â». Le
module fabrique de la valeur encaissable (codes `PARRAIN-â€¦`, tours de roue offerts)
Ã  partir d'une identitÃ© ANONYME et GRATUITE â€” mÃªme profil de risque que le Passeport
(ADR-031) et le Jackpot (ADR-033).

**Decision (4 arbitrages)** :
1. **PÃ©rimÃ¨tre & activation** : parrainage sur les campagnes ROUE uniquement,
   opt-in PAR CAMPAGNE (`referral_programs.enabled`) SOUS un addon global
   d'organisation `organizations.addon_referral` (miroir exact d'`addon_calendar`,
   activÃ© au back-office admin). Le lien de parrainage est un paramÃ¨tre de la page
   de jeu existante `/play/[slug]?ref=PR-â€¦` â€” aucune nouvelle surface publique.
2. **Preuve = PARTICIPATION rÃ©elle, jamais un clic** : un filleul n'est validÃ© que
   lorsqu'il a rÃ©ellement JOUÃ‰ un spin sur la campagne (gagnant OU perdant =
   Â« participant Â»). `validate_referral` exige un `proof_spin_id` â€” un spin rÃ©el du
   device filleul sur la campagne, non forgeable, non rejouable, unique â€” et n'est
   appelÃ© qu'APRÃˆS le spin rÃ©el. Un lien ouvert sans jouer ne vaut rien. Ce choix
   sert aussi l'intention produit (Â« le parrain gagne quand un ami PARTICIPE Â»).
3. **RÃ©compenses en CONFIG LIBRE, Ã  trois versements** : le commerÃ§ant configure
   librement, par campagne, trois versements indÃ©pendants, chacun `none | spin |
   lot` : au PARRAIN (par filleul validÃ©), au FILLEUL (bienvenue) et un COFFRE
   collectif au SEUIL (`chest_threshold`, dÃ©faut 3 filleuls). `lot` = code de
   retrait `PARRAIN-â€¦` Ã  STOCK FINI remis en caisse ; `spin` = tour offert sur la
   roue de la campagne (grant Ã  usage unique â†’ tirage â†’ flux de gain normal
   `GAIN-â€¦`, ADR-029, `spins.source = 'referral'`).
4. **Â« Ã‰quipe Â» = groupe parrain+filleuls Ã  jauge/coffre PARTAGÃ‰S, sans
   classement** : la jauge (`referral_sponsors.validated_count`) et le coffre sont
   collectifs et dÃ©bloquÃ©s une seule fois au seuil ; il n'y a AUCUN classement entre
   parrains (choix explicite : coopÃ©ratif, pas compÃ©titif).

**ModÃ¨le** â€” migration `20260729120000_referral.sql` : colonne `addon_referral` ;
`spins.source` Ã©tendu Ã  `'referral'` ; 4 tables org-scopÃ©es (FK composites tenant,
RLS `is_org_member`/`is_org_editor`, aucun accÃ¨s anon) : `referral_programs`
(1/campagne, les 3 versements `{sponsor,filleul,chest}_reward_{kind,label,details,
stock,claimed_count}`), `referral_sponsors` (device `sponsor_key`, code partageable
`PR-â€¦`, jauge `validated_count`, `chest_rewarded`), `referral_signups` (filleul
validÃ©, `proof_spin_id`, unique device Ã— campagne), `referral_rewards` (versement
Ã©mis : code `PARRAIN-â€¦` OU `spin_grant_token`). 7 fonctions SECURITY DEFINER
(6 RPC service-role â€” `ensure_referral_sponsor`, `referral_public_state`,
`validate_referral` [cÅ“ur anti-abus], `consume_referral_spin_grant`,
`redeem_referral_reward`, `purge_expired_referral_data` â€” + 1 helper interne
`referral_emit_reward`). Caisse unifiÃ©e : `lookupRedeemCode` route dÃ©sormais
**7 prÃ©fixes** (roue/chasse/fidÃ©litÃ©/jackpot/Ã©vÃ©nement/calendrier + parrainage).

**INVARIANTS DE SÃ‰CURITÃ‰ (revue GO, 0 bloquant)** â€” l'anti-abus est 100 % serveur et
bornÃ© par l'Ã‰CONOMIE (ADR-031) plus que par les rate limits (ADR-032) :
1. **Pas de rÃ©compense sur un clic** : `validate_referral` exige un spin RÃ‰EL
   (`proof_spin_id` non forgeable / non rejouable / unique).
2. **Auto-parrainage et boucle directe bloquÃ©s** : self (mÃªme device ou mÃªme email)
   et boucle Aâ†’Bâ†’A refusÃ©s. Les cycles â‰¥ 3 ne sont pas dÃ©tectÃ©s mais restent bornÃ©s
   par le plafond + la fenÃªtre + le COÃ›T (N spins rÃ©els de N devices).
3. **Bornes device** : 1 filleul par campagne et par device, fenÃªtre `window_days`,
   plafond `sponsor_max_filleuls`.
4. **RÃ©compenses plafonnÃ©es** : stock FINI obligatoire sur tout `lot` (ADR-031),
   dÃ©crÃ©ment atomique conditionnel, coffre versÃ© une seule fois sous verrou.
5. **Multi-tenant** : tables org-scopÃ©es (RLS + FK composites), `redeem_referral_reward`
   org-scopÃ©e et indistinguable, `saveReferralProgram` n'Ã©crit JAMAIS les
   `*_claimed_count` (compteurs pilotÃ©s en base seulement).
6. **Non-fuite** : `referral_public_state` ne renvoie que le parrain courant ; le
   prop public `referral` de la page de jeu ne porte que des libellÃ©s et des `kind`,
   jamais de stock, de compteur ni de code.
7. **Rate-limit (ADR-032)** : `failClosed` sur la seule clÃ© d'IDENTITÃ‰ device
   (`anonymousPlayerKey`, hash SHA-256, seau `referralPlayerAction` 60/60 s) ; la clÃ©
   IP partagÃ©e ne porte qu'un seau LARGE fail-OPEN d'observabilitÃ©
   (`referralPublicIp` 1200/600 s), jamais de refus.
8. **Jetons & RGPD** : `spin_grant_token` 192 bits anti-rejeu ; codes `PR-â€¦` /
   `PARRAIN-â€¦` CSPRNG (`gen_random_bytes`) ; `purge_expired_referral_data` neutralise
   les emails opt-in des parrains expirÃ©s.

**Durcissements de fin de chantier** (`6d7bfba`) : (a) NO-ORACLE â€” `validateReferral`
collapse tous les Ã©tats de refus (self, boucle, hors fenÃªtre, plafond, addon/campagne
inactive, code inconnu) en un `rejected` unique cÃ´tÃ© action, pour ne rien apprendre Ã 
un attaquant ; (b) DÃ‰FENSE EN PROFONDEUR â€” `referral_public_state` re-vÃ©rifie en
interne addon + `enabled` + campagne active (les server actions gatent dÃ©jÃ  avant
appel).

**Rationale** : le module rÃ©utilise les mÃ©canismes Ã©prouvÃ©s â€” moteur de spin et flux
de gain (ADR-029), stock fini obligatoire (ADR-031), rÃ¨gle rate-limit (ADR-032),
caisse unifiÃ©e par `source` (ADR-023) â€” et n'ajoute que la logique de parrainage. La
preuve par PARTICIPATION rÃ©elle (et non par clic) est ce qui rend la fraude coÃ»teuse :
fabriquer un filleul coÃ»te un spin rÃ©el d'un device distinct, et la perte maximale
reste plafonnÃ©e par le stock fini.

**Consequences** :
- Perte maximale du commerÃ§ant CHIFFRABLE et FINIE (stock fini obligatoire), comme
  Passeport (ADR-031) et Jackpot (ADR-033).
- **RÃ©sidus assumÃ©s** (revue GO, suivi docs/bugs.md, prioritÃ© basse) :
  - **DÃ©dup EMAIL inerte dans le flux post-spin** : `validateReferral` Ã©tant appelÃ©
    APRÃˆS le spin (donc avant le claim qui collecte l'email), `filleul_email` est
    toujours absent au moment de la validation â€” la dÃ©dup email SQL, prÃ©sente et
    correcte, n'est jamais alimentÃ©e. AcceptÃ© : la dÃ©dup email ne borne PAS le
    vecteur multi-devices (dÃ©corative) ; la vraie borne est stock fini + plafond +
    fenÃªtre + spin rate-limitÃ©. CÃ¢blage best-effort au claim = amÃ©lioration future.
  - **Amplification ~3Ã— des tirages** en configuration sponsor=`spin` ET
    filleul=`spin` (les tours offerts contournent `play_limit`, comme fidÃ©litÃ© /
    calendrier) : BORNÃ‰E par le stock fini des lots de la roue (ADR-031). Note de
    dimensionnement commerÃ§ant : garder â‰¥ 1 lot Ã  stock fini sur la roue (sinon
    `no_prize` sur les tours offerts).
  - **Entropie `referral_code` = 40 bits** (`PR-` + 8 caractÃ¨res sur un alphabet de
    32) : suffisant pour un identifiant PARTAGEABLE non secret (â‰  `spin_grant_token`,
    192 bits).
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `referral.test.sql`, E2E
  `e2e/referral.spec.ts`, seed `PARRAIN-E2ECHEST`.

---

## ADR-037 : Jeux rapides â€” moteur de tirage partagÃ© (socle GameShell) + jeux skill-gated (moteur Ã  2 temps)
**Date** : 2026-07-24
**Status** : Accepted
**Context** : demande client â€” ajouter BEAUCOUP de mini-jeux qui partagent le mÃªme
moteur de campagne (Ã©ligibilitÃ©, probabilitÃ©s, lots, stocks, rÃ©clamation,
statistiques, thÃ¨me, consentement, partage), de sorte qu'Â« ajouter un jeu = ajouter
une interface Â». Le point d'extension existait dÃ©jÃ  : `wheels.game_type` (V1.4, la
roue et la carte Ã  gratter partagent `spinWheel` / `perform_atomic_spin` /
`claimPrize`). Il restait Ã  le FORMALISER en socle et Ã  l'Ã©tendre. Deux arbitrages
ont Ã©tÃ© tranchÃ©s avec le propriÃ©taire du produit : (1) livrer 13 nouveaux jeux, (2)
en faire deux familles â€” des jeux de pure RÃ‰VÃ‰LATION (le rÃ©sultat est dÃ©jÃ  dÃ©cidÃ©
serveur) et des jeux de DÃ‰FI *skill-gated* (l'issue dÃ©pend d'une rÃ©ussite du joueur,
sans jamais affaiblir l'anti-triche du gain).

**Decision (2 vagues)** :

- **Vague 1 â€” 7 jeux de RÃ‰VÃ‰LATION** (`flip_card`, `cups`, `slot`, `memory`,
  `chest`, `dice`, `draw_card`). Migration `20260730120000_quick_games_reveal.sql` :
  simple extension de la contrainte `wheels_game_type_check`. Socle client
  `game-shell.tsx` (`<GameShell>`) EXTRAIT du grattage : il factorise les Ã©tats
  idle / gagnÃ© / perdu / bloquÃ© et mutualise `spinWheel` / rÃ©clamation / partage /
  captcha / analytics / thÃ¨mes. Chaque jeu = `games/<jeu>-reveal.tsx` (animation) +
  `<jeu>-experience.tsx` (~12 lignes). **Serveur-autoritatif** : le lot vient de
  `spinWheel` (dÃ©cidÃ© serveur) ; l'interaction (choix de gobelet / coffre / carte,
  dÃ©, memory) ne fait que RÃ‰VÃ‰LER l'`outcome` â€” cosmÃ©tique, aucun poids au client.

- **Vague 2 â€” 6 jeux de DÃ‰FI *skill-gated*** (`rps`, `reflex`, `gauge`, `puzzle`,
  `mystery_word`, `estimate`). Migration `20260731120000_quick_games_skill.sql` :
  extension de `game_type` ; colonne `wheels.skill_config jsonb` (paramÃ¨tres du
  dÃ©fi ; les SECRETS `mystery_word.word` / `estimate.target` / `estimate.tolerance`
  / `puzzle.order` sont SERVER-ONLY, jamais sÃ©rialisÃ©s au client) ;
  `perform_atomic_spin` recrÃ©Ã©e en **7 arguments** avec `p_force_losing boolean
  default false` (corps normal identique au correctif 42702 de `20260720150500` â†’
  zÃ©ro rÃ©gression). Moteur backend Ã  **2 temps** (`src/lib/skill.ts` +
  `src/actions/skill.ts`) :
  - `startSkillChallenge` prÃ©sente le dÃ©fi (vue PUBLIQUE `SkillChallengePublic`,
    sans secret) + un jeton HMAC signÃ© (domaine-sÃ©parÃ© `skill-challenge:`, repli
    `SPIN_TOKEN_SECRET`, liÃ© device / campagne / roue / gameType / seed) ; AUCUN
    tirage Ã  ce stade ;
  - `submitSkillChallenge` vÃ©rifie le jeton + l'identitÃ© device, Ã‰VALUE le dÃ©fi
    CÃ”TÃ‰ SERVEUR (rps : coup serveur dÃ©rivÃ© HMAC, Ã©galitÃ© = Ã©chec ; mystery_word :
    Ã©galitÃ© normalisÃ©e ; estimate : |x âˆ’ cible| â‰¤ tolÃ©rance ; puzzle : ordre
    vÃ©rifiÃ© ; reflex / gauge : rÃ©ussite *client-reported*), puis appelle
    `perform_atomic_spin(p_force_losing => !succeeded)` â€” rÃ©ussite â†’ tirage pondÃ©rÃ©
    NORMAL, Ã©chec â†’ spin PERDANT forcÃ©. La participation / `play_limit` est
    CONSOMMÃ‰E dans les deux cas (anti-brute-force). Socle client
    `skill-game-shell.tsx` (Ã  2 temps) + `games/<jeu>-challenge.tsx`.
  - Ã‰diteur commerÃ§ant (`wheel-settings.tsx`) : sÃ©lecteur de jeu + sous-formulaire
    Â« RÃ©glages du dÃ©fi Â» (les champs secrets sont marquÃ©s). La vague 2 a aussi
    corrigÃ© un manque de la vague 1 (`ac27384`) : `updateWheel` refusait de
    sauvegarder les nouveaux `game_type` (schÃ©ma limitÃ© Ã  `wheel`/`scratch`) â†’
    enum complet.

**INVARIANTS DE SÃ‰CURITÃ‰** â€” revue dÃ©diÃ©e vague 2 : **NO-GO initial
(1 Ã‰LEVÃ‰ + 1 MOYEN) â†’ corrigÃ©s â†’ GO** (`8a3c60e`). Invariant central : le TIRAGE
est le PLAFOND â€” un tricheur ne dÃ©passe jamais les odds / stock configurÃ©s
(ADR-031). Ce qui a Ã©tÃ© corrigÃ© et ce qui tenait dÃ©jÃ  :
1. **Ã‰LEVÃ‰ (corrigÃ©)** : `spinWheel` ne gardait pas le `game_type` â†’ un appel direct
   Ã  `spinWheel` contournait le dÃ©fi (tirage sans rÃ©ussir le skill). Garde
   `isSkillGameType` ajoutÃ©e dans `spinWheelInner`, AVANT tout tirage : un
   `game_type` skill ne peut Ãªtre jouÃ© que par le chemin `submitSkillChallenge`.
2. **MOYEN (corrigÃ©)** : sous `play_limit = unlimited`, jeton rejouable + oracle
   `succeeded` renvoyÃ© au client = brute-force d'un secret (mystery_word / estimate
   / puzzle). FermÃ© en deux portes : (a) `unlimited` INTERDIT pour les jeux Ã  secret
   (verrou produit + sÃ©curitÃ©) ; (b) `succeeded` retirÃ© de la rÃ©ponse cliente.
3. **Invariants SAINS confirmÃ©s** : secrets jamais sÃ©rialisÃ©s (la page `/play` ne
   passe pas `skill_config` ; `toPublicChallenge` strippe) ; jeton HMAC
   domaine-sÃ©parÃ©, liÃ© device, expirant, non rejouable sous `play_limit` bornÃ© ;
   `perform_atomic_spin` 7-args sans rÃ©gression, `p_force_losing` sans toucher au
   stock ; RLS / grants `service_role` ; rÃ¨gle rate-limit ADR-032 (failClosed sur
   la clÃ© device, IP fail-open en observabilitÃ©).

**Rationale** : le socle rÃ©utilise l'intÃ©gralitÃ© du moteur Ã©prouvÃ© (tirage
anti-triche, claim HMAC, stock, expiration, Wallet, caisse) â€” aucun nouveau chemin
de gain, aucune nouvelle surface publique. Les jeux de rÃ©vÃ©lation sont gratuits en
risque (le serveur dÃ©cide, le client anime). Les jeux de dÃ©fi ajoutent la seule
notion de Â« rÃ©ussite Â», Ã©valuÃ©e SERVEUR, qui dÃ©cide entre tirage normal et spin
perdant forcÃ©, sans jamais permettre de dÃ©passer l'Ã©conomie de la campagne.

**Consequences** :
- **Vague 1 dÃ©ployÃ©e EN PRODUCTION** (migration `20260730120000` en prod, revue
  sÃ©curitÃ© vague 1 : GO 0 bloquant). **Vague 2 Ã©galement dÃ©ployÃ©e EN PRODUCTION**
  (migration `20260731120000`) ; EXPECTED_MIGRATION bumpÃ© Ã  `20260731120000`
  (vague 2). Commits `d957f46`â†’`5710641` (vague 1), `125eb99`â†’`8a3c60e` (vague 2).
- **RÃ©sidus assumÃ©s** (revue GO, suivi docs/bugs.md, prioritÃ© basse) :
  - **reflex / gauge = rÃ©ussite *client-reported*** (non vÃ©rifiable serveur) :
    BORNÃ‰E par l'Ã©conomie (ADR-031) â€” un bot qui Â« rÃ©ussit Â» toujours obtient au
    mieux un tirage NORMAL par participation (baseline roue), jamais au-dessus des
    poids / stock. Acceptable.
  - **Jeux Ã  secret (mystery_word / estimate / puzzle) exigent un `play_limit`
    bornÃ©** (`unlimited` interdit) â€” verrou produit + sÃ©curitÃ©.
  - **Divergence UX mineure** : sur erreur transitoire au submit, le composant de
    dÃ©fi se verrouille (le shell prÃ©voyait un rÃ©-essai) ; recharger relance un dÃ©fi
    (`start` ne consomme rien). FAIBLE, Ã  surveiller.
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `quick_games_skill.test.sql`,
  E2E `skill-games.spec.ts`, seed.

---

## ADR-038 : Pronostics gÃ©nÃ©riques â€” le football devient un modÃ¨le, pas le cÅ“ur
**Date** : 2026-07-24
**Status** : Accepted â€” construit et validÃ© ; **poussÃ© depuis** (les 8 commits sont
prÃ©sents sur `origin/main` au 2026-07-25 ; l'application effective de la migration
en production n'a pas Ã©tÃ© revÃ©rifiÃ©e dans cette session)
**Context** : demande client â€” le moteur de pronostics ne servait qu'au football
(matchs, scores, calendrier importÃ© d'un fournisseur). Il doit dÃ©sormais servir Ã 
tout Ã©vÃ©nement Ã  rÃ©sultat : cÃ©rÃ©monie, Eurovision, Ã©lection interne ou
associative, remise de prix, compÃ©tition d'entreprise, concours culinaire, finale
d'une Ã©mission, classement d'un tournoi local, rÃ©sultat d'une course, rÃ©sultat
d'un Ã©vÃ©nement e-sport. ModÃ¨le cible : **Ã©vÃ©nement â†’ questions prÃ©dictives â†’ date
de verrouillage â†’ rÃ©sultat â†’ barÃ¨me â†’ classement â†’ rÃ©compenses**. Le football
devient donc un MODÃˆLE PRÃ‰CONFIGURÃ‰ parmi d'autres, plus le cÅ“ur technique â€” sans
qu'un seul championnat existant ne rÃ©gresse.

**Decision** â€” trois arbitrages tranchÃ©s avec le propriÃ©taire du produit :

1. **4 types de questions** (`contest_matches.question_type`) : `score` (deux
   camps affrontÃ©s â€” le football historique, strictement inchangÃ©), `choice`
   (choix unique dans une liste), `ranking` (ordre d'un top N), `number`
   (estimation chiffrÃ©e).
2. **Football + 10 modÃ¨les prÃ©configurÃ©s** (plus `custom`).
3. **Verrouillage PAR QUESTION, avec une date par dÃ©faut au niveau de
   l'Ã©vÃ©nement.**

**ModÃ¨le de donnÃ©es** (migration `20260801120000_generic_contests.sql`) :
- `contests` : `event_kind` (texte, dÃ©faut `football`, forme contrainte par
  `EVENT_KIND_PATTERN` `^[a-z][a-z0-9_]{1,39}$` â€” ajouter un modÃ¨le ne demande
  AUCUNE migration), `default_locks_at`, `scoring` jsonb Ã©tendu aux paliers
  gÃ©nÃ©riques ;
- `contest_matches` devient le **REGISTRE DE QUESTIONS** : `question_type`
  (dÃ©faut `score`), `prompt`, `options`, `correct_answer`, `ranking_size`,
  `locks_at` â€” les colonnes football (`home_*`/`away_*`, `kickoff_at`) restent en
  place et servent de socle au type `score` ;
- `contest_predictions` : `home_score`/`away_score` rendus NULLABLE, colonne
  `answer jsonb` pour les rÃ©ponses gÃ©nÃ©riques ;
- nouvelles RPC : `submit_contest_answer`, `set_contest_question_result`,
  `update_contest_generic_scoring`, `update_contest_event_settings` ; validateurs
  de forme en base (`is_valid_contest_question`, `is_valid_contest_options`,
  `is_valid_contest_answer`, `is_valid_contest_scoring`) ; barÃ¨me gÃ©nÃ©rique
  calculÃ© en SQL (`contest_generic_points`, `contest_scoring_points`).

**RÃ¨gle de verrouillage par type** (le point le plus sensible du chantier) :

```
score     â†’ coalesce(locks_at, kickoff_at)
gÃ©nÃ©rique â†’ coalesce(locks_at, default_locks_at, kickoff_at)
```

posÃ©e dans les **4 fonctions SQL** concernÃ©es (`contest_is_locked`,
`submit_contest_prediction`, `submit_contest_answer`,
`set_contest_question_result`) ET dans son miroir TS `effectiveLocksAt` â€” l'UI ne
doit jamais annoncer Â« verrouillÃ© Â» sur une question que le serveur accepte
encore, ni l'inverse. Cette rÃ¨gle est le produit direct de la revue sÃ©curitÃ©
(findings E1 et M1 ci-dessous) ; le champ Â« verrouillage par dÃ©faut Â» est masquÃ©
dans l'UI pour le modÃ¨le football.

**BarÃ¨me par type** â€” clÃ©s de `contests.scoring`, dÃ©fauts appliquÃ©s AU CALCUL (un
championnat football ne porte pas ces clÃ©s et n'est jamais rÃ©Ã©crit) :
`choice` (3), `ranking_exact` (5), `ranking_partial` (1, Ã— nombre d'Ã©lÃ©ments Ã  la
bonne position), `number_exact` (5), `number_close` (2), `number_tolerance` (0,
Ã©cart absolu tolÃ©rÃ©). Les paliers football (`exact` 3 / `diff` 2 / `winner` 1)
sont inchangÃ©s. Une question `score` reste scorÃ©e par `scorePrediction`, un type
inconnu ne rapporte rien.

**ModÃ¨les prÃ©configurÃ©s** (`contest-event-kinds.ts`, catalogue d'INTERFACE) :
`football`, `ceremony`, `eurovision`, `election`, `remise_prix`, `entreprise`,
`culinaire`, `emission`, `tournoi`, `course`, `esport`, `custom`. Un modÃ¨le
propose des questions BROUILLON (qui remplissent le formulaire d'ajout) et un
barÃ¨me conseillÃ© â€” il **n'Ã©crit jamais rien en base**, et surtout **aucune option
factice** : candidats, nommÃ©s, plats ou Ã©quipes sont saisis par le commerÃ§ant
(les exemples ne sont que des `placeholder`). La synchro du fournisseur de
calendriers ne part QUE pour le football, sous double verrou
(`event_kind === DEFAULT_EVENT_KIND` ET compÃ©tition du catalogue).

**Non-fuite du rÃ©sultat** : `publicCorrectAnswer` est le POINT DE SÃ‰RIALISATION
UNIQUE de la bonne rÃ©ponse â€” elle ne quitte le serveur que lorsque la question est
`finished`.

**Revue sÃ©curitÃ© : NO-GO conditionnel â†’ corrigÃ©.** GO franc sur le volet
gÃ©nÃ©rique (verrouillage serveur-autoritatif sÃ©rialisÃ© sous `for update`,
non-fuite du rÃ©sultat dÃ©montrÃ©e sur un point de passage unique, validation de
forme en base, multi-tenant, rÃ¨gle ADR-032 respectÃ©e). Le blocage portait
entiÃ¨rement sur la **non-rÃ©gression football** :
1. **E1 (Ã‰LEVÃ‰, corrigÃ©)** : le backfill `locks_at = kickoff_at` figeait la
   fenÃªtre de chaque match Ã  l'instant de la migration, alors que la synchro
   (`contest-sync.ts`) ne met Ã  jour que `kickoff_at`. Au premier match REPORTÃ‰ â€”
   routine, dÃ©clenchÃ©e par le cron â€” les pronostics se seraient fermÃ©s
   silencieusement sur un match non jouÃ©, avec un message trompeur ; un match
   AVANCÃ‰ aurait laissÃ© la base accepter un pronostic pendant la rencontre.
   **Correctif** : backfill SUPPRIMÃ‰, `locks_at` reste NULL sur les matchs, le
   repli tombe sur `kickoff_at` â€” qui suit les reports par construction.
2. **M1 (MOYEN, corrigÃ©)** : `default_locks_at` primait sur `kickoff_at` pour
   TOUS les types â†’ un commerÃ§ant football renseignant une date par dÃ©faut
   fermait d'un coup tout un championnat importÃ©. **Correctif** : la date par
   dÃ©faut ne s'applique JAMAIS Ã  une question `score` (rÃ¨gle de verrouillage
   ci-dessus, SQL + miroir TS), et le champ est masquÃ© cÃ´tÃ© UI pour le football.
   Couvert par les tests pgTAP Â« match reportÃ© / match avancÃ© / date par dÃ©faut
   ignorÃ©e Â» et 5 tests TS.

**Rationale** : gÃ©nÃ©raliser le registre plutÃ´t que crÃ©er un second module. Tout
ce qui est Ã©prouvÃ© reste partagÃ© et INCHANGÃ‰ â€” identitÃ© joueur par cookie,
classement SQL et politique d'ex Ã¦quo (ADR-012, ADR-013), ligues (ADR-020), mode
TV (ADR-022), rÃ©cupÃ©ration par lien magique (ADR-014), gel du rÃ¨glement, clÃ´ture
et rÃ©compenses. Aucune nouvelle surface publique. Le football garde son chemin
d'origine bit pour bit : un championnat existant ne voit aucune diffÃ©rence.

**Consequences** :
- **Au 2026-07-24, NON DÃ‰PLOYÃ‰** â€” les 8 commits (`4973736` â†’ `f09ee89`) Ã©taient
  LOCAUX, non poussÃ©s, et la migration `20260801120000` n'Ã©tait pas appliquÃ©e en
  production ; c'Ã©tait alors le seul chantier du projet dans cet Ã©tat, et
  EXPECTED_MIGRATION valait `20260801120000`. **Au 2026-07-25, ces commits sont
  prÃ©sents sur `origin/main`** (donc poussÃ©s) et le seul chantier NON POUSSÃ‰ est
  dÃ©sormais la place de marchÃ© de campagnes (ADR-039, EXPECTED_MIGRATION
  `20260802120000`). L'application effective de la migration `20260801120000` en
  production n'a pas Ã©tÃ© revÃ©rifiÃ©e dans cette session.
- **RÃ©sidus assumÃ©s** (suivi docs/bugs.md) :
  - **M2** : `update_contest_event_settings` permet de dÃ©placer
    `default_locks_at` vers le futur sur un championnat verrouillÃ© (motif d'audit
    exigÃ©), ce qui peut ROUVRIR une question dont `locks_at` est NULL.
    AttÃ©nuations rÃ©elles : l'UI Ã©crit toujours `locks_at` Ã  la crÃ©ation d'une
    question (il faudrait un INSERT PostgREST direct pour l'Ã©viter), une question
    rÃ©solue reste fermÃ©e, l'opÃ©ration est journalisÃ©e avec son motif, et c'est de
    l'auto-traitement sur son propre tenant.
  - **I1** : `scoreAnswer` / `scorePrediction` (TS) n'ont AUCUN appelant en
    production â€” les points sont Ã©crits exclusivement en SQL. C'est un miroir de
    test ; la paritÃ© SQLâ†”TS a Ã©tÃ© vÃ©rifiÃ©e ligne Ã  ligne (aucune divergence) mais
    n'est garantie que par les tests unitaires.
  - **exact_count / diff_count** (dÃ©partage d'ex Ã¦quo, ADR-013) comptent le
    PALIER et non le TYPE : strictement inchangÃ© sur un championnat 100 %
    football, imprÃ©cis seulement sur un Ã©vÃ©nement mixte.
  - **I2** : `number_tolerance` accepte un dÃ©cimal Ã  l'Ã©criture mais l'ignore au
    calcul (non atteignable via l'UI ni PostgREST).
  - **I4** : les nouvelles RPC sont couvertes par `generic_contests.test.sql` et
    non par l'audit ACL central `security_acl.test.sql` (Ã  rapatrier).
  - **I5** (prÃ©-existant) : `tiebreaker_answer` est chargÃ© dans le contexte
    public mais jamais transmis au client (projections explicites) â€”
    durcissement souhaitable.
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `generic_contests.test.sql`,
  E2E `e2e/pronostics-generic.spec.ts`, seed `E2EPRONO3`.

---

## ADR-039 : Place de marchÃ© de campagnes â€” catalogue en code, modÃ¨les privÃ©s en base
**Date** : 2026-07-25
**Status** : Accepted â€” **construit et validÃ©, NON POUSSÃ‰ / NON DÃ‰PLOYÃ‰ Ã  ce jour**
**Context** : demande client â€” un commerÃ§ant qui crÃ©e une campagne part d'une page
blanche et doit tout paramÃ©trer (visuel, mÃ©canique, textes, lots, rÃ¨gles, durÃ©e).
Il doit pouvoir partir d'un MODÃˆLE. Dix modÃ¨les Ã©taient demandÃ©s :
Saint-Valentin, Halloween, NoÃ«l, ouverture de boutique, anniversaire, match de
football, fÃªte des MÃ¨res, happy hour, soldes, lancement de produit â€” chacun
portant **7 promesses** : le visuel, le jeu, les textes, les
rÃ©compenses suggÃ©rÃ©es, les emails, la durÃ©e, les rÃ¨gles.

**Decision** â€” trois arbitrages tranchÃ©s avec le propriÃ©taire du produit :

1. **Catalogue Lastchance EN CODE + modÃ¨les PRIVÃ‰S en base.** Les 10 modÃ¨les
   vivent dans `src/lib/campaign-templates.ts`, versionnÃ©s avec l'application :
   pas de seed Ã  maintenir, pas de migration pour retoucher un texte, et surtout
   pas de table lisible par toutes les organisations. En plus, un commerÃ§ant peut
   enregistrer sa propre campagne comme modÃ¨le rÃ©utilisable, visible de sa SEULE
   organisation. La **place de marchÃ© partagÃ©e entre commerÃ§ants a Ã©tÃ© Ã‰CARTÃ‰E**
   (modÃ©ration du contenu publiÃ©, isolation d'un contenu inter-tenant, propriÃ©tÃ©
   des visuels) : c'est un projet Ã  part, et rien n'est prÃ©parÃ© pour elle ici.
2. **Appliquer un modÃ¨le = crÃ©er une campagne EN BROUILLON complÃ¨te** (campagne +
   jeu + lots), que le commerÃ§ant relit, ajuste et active LUI-MÃŠME.
3. **Les emails sont fournis en TEXTES, jamais activÃ©s.** Un modÃ¨le transporte des
   sujets et des corps ; aucun scÃ©nario d'emailing n'est armÃ©.

**ModÃ¨le de donnÃ©es** (migration `20260802120000_campaign_templates.sql`) â€” une
seule table, `campaign_templates`, pour les modÃ¨les PRIVÃ‰S :
- `name` (1..80, **unique par organisation** â€” deux commerÃ§ants ont chacun droit Ã 
  leur Â« NoÃ«l Â» ; unicitÃ© exacte non normalisÃ©e, le doublon franc 23505 est
  traduit en Â« Un modÃ¨le porte dÃ©jÃ  ce nom. Â») ; `description` (â‰¤ 300) ;
- `blueprint jsonb` â€” la recette complÃ¨te, bornÃ©e par deux garde-fous qu'un client
  ne peut pas contourner : c'est un **objet** (`jsonb_typeof = 'object'`) et il est
  **bornÃ© Ã  32 Ko** (`pg_column_size`, mÃªme patron que `wheels_skill_config_size_check`
  Ã  8 Ko ; une bibliothÃ¨que de modÃ¨les sans borne est un vecteur de gonflement de
  la base Ã  coÃ»t nul). La FORME n'est PAS validÃ©e en base : elle suivra l'Ã©volution
  des jeux, un CHECK figÃ© imposerait une migration par champ ;
- `source_campaign_id` â€” traÃ§abilitÃ© seule, en **FK COMPOSITE**
  `(source_campaign_id, organization_id) â†’ campaigns(id, organization_id)` : sans le
  couple, un Ã©diteur pouvait faire pointer son modÃ¨le sur la campagne d'une AUTRE
  organisation. `on delete set null (source_campaign_id)` avec liste de colonnes
  explicite (PostgreSQL 15+) â€” un `set null` nu annulerait aussi `organization_id`,
  qui est NOT NULL, et la suppression d'une campagne Ã©chouerait ;
- `created_by` posÃ© par le trigger `protect_campaign_template_attribution` depuis
  la session (jamais depuis le corps de la requÃªte), `organization_id` et
  `created_by` immuables Ã  l'UPDATE ;
- RLS : **une seule policy `campaign_templates: editors`** (`for all`,
  `is_org_editor`) â€” voir la revue sÃ©curitÃ© ci-dessous. `organization_id` est hors
  du **grant UPDATE** : un utilisateur Ã©diteur de deux organisations ne peut pas
  dÃ©placer un modÃ¨le de l'une Ã  l'autre. Aucune policy `anon`/`public`, aucun slug
  public : la table n'est jamais dans le chemin d'un parcours joueur.

**Le blueprint** (`src/lib/campaign-templates.ts`, module PUR) : `version` 1,
`texts` (nom de campagne, nom du jeu, accroche joueur), `visual` (clÃ© d'un
prÃ©rÃ©glage EXISTANT de `WHEEL_PRESETS` + surcharges), `game` (`game_type` +
`skill_config`), `prizes`, `rules` (`play_limit`, collecte, `code_ttl_seconds`,
`engagement`, `budget_cents`), `durationDays` et `emails`. **DurÃ©e RELATIVE en
jours (1..365), jamais de date absolue** â€” sinon un modÃ¨le pÃ©rime. `blueprintToDraft`
(pure, `now` injectÃ©, ne jette jamais) traduit la recette en valeurs concrÃ¨tes ; un
style corrompu retombe sur les dÃ©fauts via `resolveWheelStyle`. Les 10 modÃ¨les
choisissent une mÃ©canique qui a du SENS pour l'occasion (`flip_card` Ã  la
Saint-Valentin, `cups` Ã  Halloween, `chest` Ã  NoÃ«l sur 24 jours, `memory`,
`dice`, `scratch`, `slot`, `draw_card`, `wheel`) et respectent ADR-031 :
4 lots gagnants Ã  **stock fini** + 1 lot perdant **sans stock** (un Â« pas de
chance Â» ne doit jamais s'Ã©puiser).

**LES TROIS INVARIANTS D'INNOCUITÃ‰** â€” c'est le cÅ“ur du design, et ils sont
vÃ©rifiÃ©s au niveau de l'ACTION (`src/actions/campaign-templates.ts`), seul endroit
qui Ã‰CRIT :

1. **BROUILLON INERTE** â€” `status: 'draft'` **ET** `auto_schedule: false`, ce
   dernier verrouillÃ© au niveau du TYPE (littÃ©ral `false` dans `CampaignDraft`).
   Sans lui, `run_campaign_schedule()` (pg_cron, toutes les 10 min) aurait fait
   passer la campagne `draft â†’ active` dÃ¨s `starts_at` atteint, c'est-Ã -dire
   immÃ©diatement : **un modÃ¨le appliquÃ© se serait publiÃ© tout seul.** Le schÃ©ma Zod
   `campaignBlueprintSchema` ne comporte AUCUN champ `status` / `auto_schedule` /
   `starts_at` / `ends_at` : un blueprint privÃ© trafiquÃ© ne peut pas les forcer
   (testÃ©, avec `status: "active"` injectÃ© dans le jsonb).
2. **AUCUN ENVOI** â€” appliquer ou enregistrer un modÃ¨le n'active aucune
   automatisation, ne dÃ©pose aucun job, n'envoie aucun email :
   `automation_settings`, `enqueueJob` et `@/lib/resend` sont ABSENTS du chemin
   (audit statique des 7 sources du chantier, commentaires retirÃ©s). Le jeu de
   tables visitÃ©es est figÃ© : `campaigns` / `wheels` / `prizes` Ã  l'application,
   `campaigns` / `campaign_templates` Ã  l'enregistrement. Un modÃ¨le enregistrÃ© part
   avec `emails: []` â€” il ne peut pas propager un scÃ©nario d'emailing d'une
   campagne Ã  une autre.
3. **MULTI-TENANT PAR LA SESSION** â€” organisation et rÃ´le viennent de
   `getUserAndOrg()` (owner|editor exigÃ©), jamais du formulaire ; un modÃ¨le privÃ©
   est lu avec le client de **SESSION** (donc sous RLS) PLUS un filtre
   `organization_id` explicite ; **aucun `createAdminClient` sur ce chemin**, ce
   que verrouille une sentinelle de test. Le blueprint est **revalidÃ© par Zod dans
   les DEUX chemins** (catalogue et privÃ©) : la base ne garantit que Â« objet jsonb
   â‰¤ 32 Ko Â», la FORME est validÃ©e lÃ .

**Interface** (`/dashboard/campaigns`) : galerie SERVEUR en deux sections â€”
Â« ModÃ¨les Lastchance Â» et Â« Mes modÃ¨les Â», jamais mÃ©langÃ©es ni prÃ©sentÃ©es comme un
catalogue commun. Les blueprints ne traversent pas le rÃ©seau : les vignettes sont
rendues cÃ´tÃ© serveur, seuls les boutons appliquer / supprimer sont clients. Chaque
carte rÃ©sume les 7 promesses via un module pur Ã  **lecture DÃ‰FENSIVE**
(`campaign-template-preview.ts`) â€” un blueprint Ã©crit par une version antÃ©rieure
s'affiche en dÃ©gradÃ© (ou avec un message) au lieu de casser la page des campagnes.
La promesse Â« appliquer crÃ©e un BROUILLON, rien n'est publiÃ©, aucun email n'est
envoyÃ© Â» est rÃ©pÃ©tÃ©e en bandeau, sous chaque bouton et jusque dans l'`aria-label` ;
les emails sont annoncÃ©s Â« fournis en texte, non activÃ©s Â».

**Revue sÃ©curitÃ© : GO, 0 bloquant â€” 1 MOYEN corrigÃ©** (`4457b20`).
- **MOYEN (corrigÃ©)** : le blueprint d'un modÃ¨le privÃ© recopie
  `wheels.skill_config`, donc les **SECRETS des jeux de dÃ©fi** (mot mystÃ¨re, nombre
  cible et tolÃ©rance, ordre du puzzle â€” ADR-037). La policy de lecture accordait le
  SELECT Ã  `is_org_member`, alors que la SOURCE de ces secrets (`wheels`,
  `campaigns`, `prizes`) est rÃ©servÃ©e aux Ã‰DITEURS : le secret passait
  d'Â« Ã©diteurs seulement Â» Ã  Â« toute l'Ã©quipe, **CAISSIERS compris** Â». Un caissier
  pouvait lire le blueprint via l'API REST avec son propre jeton de session et
  rÃ©ussir systÃ©matiquement le dÃ©fi (gain bornÃ© par ADR-031, mais c'est la mÃªme
  classe que la fuite dÃ©jÃ  traitÃ©e sur les jeux de dÃ©fi) ; effet de bord : poids,
  stocks, `cost_cents` (la marge) et budget devenaient lisibles par un caissier.
  **Correctif** : policy unique `campaign_templates: editors`, miroir exact de
  `campaigns: editors`. Aucune perte produit â€” les 3 actions exigeaient dÃ©jÃ 
  owner|editor et la liste des campagnes est dÃ©jÃ  vide pour un caissier. pgTAP :
  assertion caissier **INVERSÃ‰E** (0 modÃ¨le lu, mÃªme ciblÃ© par id), assertion
  dÃ©diÃ©e Ã  la non-fuite du secret, et contre-Ã©preuve cÃ´tÃ© Ã©diteur (c'est bien le
  rÃ´le qui masque, pas un blueprint vide). `campaign_templates` rejoint aussi
  l'audit RLS central `security_acl.test.sql`.
- **INFO corrigÃ©s** : `budget_cents` passÃ© en `min(1)` (`campaigns.budget_cents`
  porte un CHECK `> 0` â€” un 0 passait Zod puis cassait l'INSERT).
- **Sains par construction** : isolation A/B (lecture, Ã©criture, suppression,
  insertion croisÃ©e), FK composite tenant, `organization_id` hors grant UPDATE,
  attribution par trigger, sentinelle pgTAP qui Ã‰CHOUE si une policy venait Ã 
  citer `anon`/`public`, aucun `service_role` sur le chemin.

**Rationale** : la valeur du chantier est un gain de temps commerÃ§ant, pas une
nouvelle mÃ©canique â€” donc il ne devait ouvrir AUCUNE surface. Le catalogue en code
supprime d'emblÃ©e la question de la lisibilitÃ© inter-tenant, le brouillon inerte
supprime celle de la publication accidentelle, et les emails en texte celle de
l'envoi accidentel : les trois risques rÃ©els de ce type de fonctionnalitÃ©
sont fermÃ©s par construction plutÃ´t que par du contrÃ´le. Tout le reste rÃ©utilise
l'existant tel quel (Ã©diteur de campagne, Ã©diteur de lots, roue, thÃ¨mes).

**Consequences** :
- **NON POUSSÃ‰ / NON DÃ‰PLOYÃ‰** â€” les 5 commits (`ed50271` â†’ `4457b20`) sont
  LOCAUX et la migration `20260802120000` n'est pas appliquÃ©e en production.
  EXPECTED_MIGRATION vaut dÃ©jÃ  `20260802120000` : il faudra pousser migration et
  code ensemble. C'est le seul chantier du projet dans cet Ã©tat.
- **RÃ©sidus assumÃ©s** (revue GO, suivi docs/bugs.md, prioritÃ© basse) :
  - un blueprint **PRIVÃ‰** peut dÃ©crire une roue sans lot perdant ou Ã  gagnant
    illimitÃ© â€” le CATALOGUE, lui, respecte ADR-031 (testÃ©). Pas une escalade : le
    mÃªme Ã©diteur peut dÃ©jÃ  crÃ©er cette roue dans l'Ã©diteur de lots (auto-prÃ©judice,
    aucun effet inter-tenant) ;
  - **application non transactionnelle** : si l'INSERT du jeu ou des lots Ã©choue,
    un brouillon orphelin subsiste (mÃªme patron que `createCampaign`). Sans effet
    jouable â€” `draft`, sans QR code, et le contexte de jeu exige `active` ;
  - **ni quota ni rate-limit** sur `applyCampaignTemplate` /
    `saveCampaignAsTemplate`, alignÃ© sur `createCampaign` (les actions dashboard ne
    sont pas rate-limitÃ©es par convention) ;
  - le secret d'un jeu de dÃ©fi reste **DUPLIQUÃ‰** dans
    `campaign_templates.blueprint` : sa confidentialitÃ© repose dÃ©sormais
    entiÃ¨rement sur la policy Ã©diteurs de cette table (l'option Â« ne pas
    sÃ©rialiser le secret Â» a Ã©tÃ© Ã©cartÃ©e pour la V1) ;
  - `saveCampaignAsTemplate` ne capture que la **roue principale** (premiÃ¨re par
    position) : un modÃ¨le porte une mÃ©canique, pas une grille multi-roues ;
  - la galerie affiche Â« Utiliser ce modÃ¨le Â» Ã  un caissier qui ne peut pas
    l'appliquer (l'action refuse) â€” comportement prÃ©existant du bouton
    Â« + Nouvelle campagne Â» juste Ã  cÃ´tÃ©.
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `campaign_templates.test.sql`
  (ajoutÃ© au job d'audit ACL), E2E `e2e/campaign-templates.spec.ts`, seed.
  Unitaires : 29 tests d'action (dont les invariants BROUILLON et INNOCUITÃ‰
  mutation-testÃ©s : `auto_schedule: true` â†’ 11 rouges, filtre organisation retirÃ©
  â†’ 2 rouges), 1021 tests au total âœ“.
- **PoussÃ© sur `origin/main` le 2026-07-25** (commits prÃ©sents jusqu'Ã  `e22e655`) ;
  l'application effective de la migration en production n'a pas Ã©tÃ© revÃ©rifiÃ©e.
  Le chantier Â« CrÃ©ateur de quiz Â» (ADR-040) est dÃ©sormais le seul en attente de
  poussÃ©e.

## ADR-040 : CrÃ©ateur de quiz â€” module DÃ‰DIÃ‰, 4 formes de rÃ©ponse, 5 modes de rÃ©compense
**Date** : 2026-07-25
**Status** : Accepted â€” **construit, QA verte, revue sÃ©curitÃ© passÃ©e de Â« GO
conditionnel Â» Ã  corrigÃ© ; NON POUSSÃ‰ / NON DÃ‰PLOYÃ‰ Ã  ce jour**
**Context** : demande client â€” un **crÃ©ateur de quiz** jouable depuis un QR ou un
lien, en LIBRE-SERVICE. Usages visÃ©s : restaurant (questions sur la cuisine),
cave / bar (dÃ©gustation), salon professionnel (les exposants), boutique
(dÃ©couverte des produits), musÃ©e (parcours culturel), entreprise (team building),
club sportif. Le client a prÃ©cisÃ© que Â« le moteur des pronostics pourra Ãªtre
rÃ©utilisÃ© pour une grande partie du classement Â» : la parentÃ© est assumÃ©e, elle
n'implique pas la fusion.

**Decision** â€” trois arbitrages tranchÃ©s avec le propriÃ©taire du produit :

1. **Module DÃ‰DIÃ‰**, ni un `event_kind` des pronostics, ni une extension du mode
   Â« Ã‰vÃ©nement en direct Â». L'intention commerÃ§ant Â« je crÃ©e un quiz Â» est
   distincte, et surtout la **sÃ©mantique de la vÃ©ritÃ© diffÃ¨re** : dans un
   pronostic la bonne rÃ©ponse est inconnue de TOUS jusqu'au rÃ©sultat (la
   non-fuite est gratuite, il n'y a rien Ã  cacher) ; dans un quiz elle existe
   **dÃ¨s la crÃ©ation**, stockÃ©e Ã  cÃ´tÃ© de la question â€” la rÃ¨gle de non-fuite
   change donc de nature et devient un invariant Ã  dÃ©montrer. Le cycle de vie
   diffÃ¨re aussi : `event_sessions` est SYNCHRONE (l'organisateur lance chaque
   question, machine Ã  Ã©tats, Ã©cran partagÃ©) alors qu'un quiz est ASYNCHRONE
   (c'est le JOUEUR qui dÃ©marre chaque question, Ã  son rythme, sans animateur).
2. **Les 7 types de questions demandÃ©s** : choix multiple, vrai/faux, image
   mystÃ¨re, estimation numÃ©rique, question chronomÃ©trÃ©e, classement de rÃ©ponses,
   pronostic libre.
3. **Les 5 modes de rÃ©compense demandÃ©s** : seuil de bonnes rÃ©ponses, tirage au
   sort parmi les meilleurs, classement, gain instantanÃ©, aucun lot.

**MODÃ‰LISATION â€” le point de design central : 4 FORMES DE RÃ‰PONSE, pas 7 types.**
Stocker les 7 modÃ¨les comme 7 valeurs de `question_type` aurait dupliquÃ© trois
fois la mÃªme mÃ©canique, car deux d'entre eux ne sont pas des formes de rÃ©ponse :
- Â« question chronomÃ©trÃ©e Â» est une **dimension transversale** â€”
  `time_limit_seconds` (nullable), applicable Ã  N'IMPORTE QUEL type. En faire un
  type aurait interdit le Â« choix multiple chronomÃ©trÃ© Â», pourtant l'usage le
  plus courant ;
- Â« vrai/faux Â» est un **choix Ã  deux options** : mÃªme stockage, mÃªme
  Ã©valuation, seul le rendu diffÃ¨re ;
- Â« image mystÃ¨re Â» est un **mÃ©dia** attachÃ© Ã  la question (`image_url`, seconde
  dimension transversale) : on peut faire reconnaÃ®tre une image par un choix
  multiple OU par une rÃ©ponse libre.

D'oÃ¹ le couple, repris TEXTUELLEMENT du patron `contests.event_kind` vs
`contest_matches.question_type` (ADR-038) :
- `quiz_questions.question_type` = **LE MOTEUR**, 4 valeurs, une par forme de
  rÃ©ponse : `choice` (choix multiple ET vrai/faux), `number` (estimation, avec
  `tolerance`), `ranking` (tableau ordonnÃ© d'identifiants), `text` (chaÃ®ne
  comparÃ©e Ã  des formulations acceptÃ©es) ;
- `quiz_questions.preset` = **LE MODÃˆLE D'UI**, contraint en FORME seulement
  (`^[a-z][a-z0-9_]{1,39}$`, aucune Ã©numÃ©ration figÃ©e) : il porte les 7 modÃ¨les
  du besoin â€” `multiple_choice`, `true_false`, `mystery_image`, `estimate`,
  `timed`, `ranking`, `free_prediction`. **Le moteur IGNORE `preset`** : il ne
  lit que `question_type`, `options`, `correct_answer`, `tolerance`,
  `ranking_size` et `time_limit_seconds`.

**ConsÃ©quence pratique â€” ajouter un 8e modÃ¨le = une entrÃ©e de catalogue, sans
migration.** CÃ´tÃ© UI, `quizFormShape(preset, questionType)` rend des boolÃ©ens que
le formulaire lit tel quel. **Et `choice` / `number` / `ranking` RÃ‰UTILISENT les
validateurs du moteur de pronostics** (`is_valid_contest_options` /
`is_valid_contest_answer`, migration `20260801120000`) : trois des quatre formes
ne coÃ»tent aucune ligne de validation neuve ; seule la rÃ©ponse libre (`text`) est
du code propre au quiz â€” normalisation `quiz_normalize_text` (minuscules, accents
franÃ§ais repliÃ©s, non-alphanumÃ©rique ramenÃ© Ã  l'espace, espaces collapsÃ©s),
`IMMUTABLE` et **serveur seulement**, jamais rejouÃ©e cÃ´tÃ© client.

**ModÃ¨le de donnÃ©es** (migration `20260803120000_quizzes.sql`) : addon
d'organisation `addon_quiz` (miroir exact d'`addon_calendar` / `addon_events` /
`addon_jackpot` / `addon_loyalty` / `addon_hunts`, activÃ© au back-office) et
5 tables org-scopÃ©es â€” `quizzes` (7 thÃ¨mes, `public_slug`, `reward_mode` et ses
champs propres, `reward_stock` / `reward_claimed_count`, `draw_state`,
`target_wheel_id`), `quiz_questions`, `quiz_players` (cookie httpOnly, hash du
jeton, prÃ©nom + avatar, email opt-in seulement), `quiz_answers` (rÃ©ponse
immuable, `started_at` / `elapsed_ms` serveur), `quiz_rewards` (code `QUIZ-â€¦` ou
`grant_token` de tour offert). 16 fonctions : 10 RPC `service_role`
(`join_quiz`, `start_quiz_question`, `submit_quiz_answer`, `finish_quiz`,
`consume_quiz_spin_grant`, `quiz_public_state`, `quiz_leaderboard`,
`draw_quiz_winners`, `redeem_quiz_reward`, `purge_expired_quiz_players`),
5 helpers de validation / Ã©valuation et 1 helper interne `quiz_emit_reward`.
`spins.source` accepte `'quiz'`. pgTAP `quizzes.test.sql` + 5 lignes RLS et
10 assertions dans l'audit ACL central `security_acl.test.sql`.

**LES 5 MODES DE RÃ‰COMPENSE** (`reward_mode`, CHECK de cohÃ©rence par mode) :
`threshold` (lot dÃ¨s X bonnes rÃ©ponses, Ã©mis par `finish_quiz`), `instant` (lot Ã 
la clÃ´ture sans exigence de justesse, mais **seulement si toutes les questions
ont Ã©tÃ© rÃ©pondues** â€” voir E1), `draw` (tirage au sort parmi les `draw_top_n`
meilleurs, DIFFÃ‰RÃ‰), `ranking` (top dÃ©terministe score dÃ©croissant PUIS temps
total croissant, DIFFÃ‰RÃ‰), `none` (participation gratuite, stock forcÃ© Ã  0). Les
deux modes diffÃ©rÃ©s partagent **une seule RPC** `draw_quiz_winners` (mÃªme verrou,
mÃªme idempotence, aucun second chemin d'Ã©mission Ã  auditer). Le lot est un code
de retrait en caisse `QUIZ-â€¦` (**8e prÃ©fixe**) ou un **tour de roue offert**
(`target_wheel_id` + `grant_token`, patron ADR-029), ce dernier rÃ©servÃ© aux modes
Ã  Ã©mission immÃ©diate (`threshold` / `instant`) : un jeton de spin Ã©mis des heures
plus tard, hors prÃ©sence du joueur, n'a pas de sens ergonomique
(`quizzes_wheel_mode_check`).

**LES SIX INVARIANTS DE SÃ‰CURITÃ‰** (confirmÃ©s SAINS par la revue) :

1. **NON-FUITE DE LA BONNE RÃ‰PONSE â€” trois couches.** La vÃ©ritÃ© existe dÃ¨s la
   crÃ©ation : (a) `quiz_public_state` ne l'attache qu'aux questions dÃ©jÃ  rÃ©pondues
   par CE joueur (patron exact de `calendar_public_state`, oÃ¹ le contenu d'une
   case n'est joint qu'aux cases ouvertes) et `start_quiz_question` ne la renvoie
   jamais ; (b) le mapper TS re-force bonne rÃ©ponse / justesse / temps Ã  `null`
   hors statut Â« rÃ©pondu Â» (patron `mapPublicDay`) ; (c) le type de question
   JOUABLE ne porte **structurellement aucun champ de vÃ©ritÃ©** â€” il n'y a rien Ã 
   masquer dans le payload RSC. Un refus `invalid_answer` n'est **pas un oracle**
   (validation de FORME seulement). Le hash d'identitÃ© vient TOUJOURS du cookie
   httpOnly, jamais du client : lire l'Ã©tat d'un autre joueur est impossible ; le
   classement ne publie que prÃ©nom / avatar / score / temps, sans aucun email.
2. **CHRONOMÃˆTRE SERVEUR-AUTORITATIF ET INFORGEABLE.** Aucune RPC n'accepte de
   paramÃ¨tre de temps â€” une assertion pgTAP le vÃ©rifie sur
   `pg_get_function_arguments`. `start_quiz_question` pose `started_at = now()`
   **une seule fois** (`on conflict do nothing` : un second appel renvoie le
   `started_at` dÃ©jÃ  posÃ©, aucun rembobinage), `submit_quiz_answer` calcule
   `elapsed_ms = now() - started_at` **en base**, et un trigger de gel interdit
   tout dÃ©placement de `started_at` â€” **service_role inclus**. CÃ´tÃ© client la
   borne initiale vient du couple `server_now` / `started_at` (calcul pur, aucun
   `Date.now()` au rendu, aucun Ã©cart d'hydratation) : seule la dÃ©crue suit
   l'horloge locale, la base tranche (`too_late`).
3. **UNE SEULE RÃ‰PONSE PAR (joueur, question), IMMUABLE.** UnicitÃ©
   `(player_id, question_id)` + trigger `quiz_answers_freeze` qui refuse toute
   rÃ©Ã©criture d'une ligne dÃ©jÃ  rÃ©pondue : aucune seconde tentative pour deviner â€”
   crucial pour l'estimation avec tolÃ©rance et pour la rÃ©ponse libre. Corollaire
   assumÃ© : une rÃ©ponse **hors dÃ©lai est ENREGISTRÃ‰E** (hors barÃ¨me) plutÃ´t que
   rejetÃ©e ; la rejeter rouvrirait une tentative gratuite.
4. **TIRAGE IDEMPOTENT.** `draw_quiz_winners` est atomique sous `for update` :
   un `draw_state = 'done'` renvoie le tirage existant SANS rien Ã©mettre.
   AlÃ©a cryptographique, vivier respectÃ©, **trois verrous indÃ©pendants** contre
   la sur-Ã©mission (drapeau `draw_state`, unicitÃ©s `(quiz_id, player_id)` /
   `(quiz_id, rank)`, CHECK `claimed <= stock`) : le bug de re-dÃ©clenchement
   rencontrÃ© sur le jackpot est fermÃ© d'emblÃ©e.
5. **BORNES Ã‰CONOMIQUES (ADR-031).** `reward_stock` **FINI et OBLIGATOIRE** dÃ¨s
   qu'un mode Ã©met (CHECK par mode, Ã  la maniÃ¨re de
   `calendar_days_lot_stock_check`), dÃ©crÃ©ment **atomique et conditionnel** sous
   le verrou du quiz, `out_of_stock` propre, verrou structurel
   `quizzes_reward_bounds_check (reward_claimed_count <= reward_stock)` : aucun
   des 5 modes ne peut sur-Ã©mettre.
6. **MULTI-TENANT ET ADR-032.** Les 5 tables sont RLS org-scopÃ©es (lecture
   `is_org_member`, Ã©criture `is_org_editor`, FK composites tenant, compteurs et
   `draw_state` RPC-only par grants de colonnes) ; aucun droit `anon`, le parcours
   public passe exclusivement par le `service_role` ; la caisse est
   indistinguable inter-organisation. Rate-limit : `failClosed` **uniquement** sur
   la clÃ© d'identitÃ© (hash du cookie, seau `quizPlayerAction`) et APRÃˆS
   rÃ©solution de celle-ci ; la clÃ© partagÃ©e quiz + IP ne porte qu'un compteur
   d'observabilitÃ© **fail-OPEN** (`quizPublicIp`) â€” plusieurs joueurs derriÃ¨re le
   Wi-Fi d'un restaurant ou d'un salon ne doivent jamais se bloquer entre eux.
   4 gardes de source le vÃ©rifient, dont Â« aucun seau avant l'identitÃ© Â» et
   Â« aucun paramÃ¨tre de temps ou de score envoyÃ© aux RPC Â».

**Revue sÃ©curitÃ© : GO CONDITIONNEL â†’ tout corrigÃ©** (`fe1e57b` : 1 Ã‰LEVÃ‰
bloquant, 1 Ã‰LEVÃ‰, 3 MOYEN).
- **E1 â€” Ã‰LEVÃ‰, BLOQUANT (lot gratuit)** : le mode `instant` Ã©mettait le lot
  **sans qu'aucune rÃ©ponse existe** (`v_answered` Ã©tait calculÃ© mais jamais
  utilisÃ© comme garde). Deux appels â€” rejoindre, terminer â€” suffisaient Ã  obtenir
  un code `QUIZ-â€¦` ; l'identitÃ© Ã©tant un cookie gratuit (donc un seau `failClosed`
  neuf Ã  chaque tour) et le seau IP fail-open par conception, une boucle vidait
  tout le stock promotionnel depuis une seule IP. **Correctif** : Ã©mission
  conditionnÃ©e Ã  la complÃ©tion RÃ‰ELLE (`v_answered >= v_total and v_total > 0`).
- **E2 â€” Ã‰LEVÃ‰ (Sybil)** : le corrigÃ© est rendu au joueur dÃ¨s sa rÃ©ponse â€” il lui
  est dÃ» â€” mais une passe jetable collecte ainsi le corrigÃ© COMPLET, aprÃ¨s quoi
  chaque identitÃ© neuve franchit le seuil Ã  coup sÃ»r ; de mÃªme un bot rafle les
  premiers rangs avec un temps â‰ˆ latence rÃ©seau. **Correctif** : Turnstile sur le
  **SEUL appel Ã©metteur** (`finishQuiz`) et seulement **si un lot est en jeu** ;
  RIEN sur `join` / `start` / `submit` â€” aucune friction sur le chemin de jeu,
  aucun contrÃ´le avant l'identitÃ© (ADR-032).
- **M1 â€” RGPD** : l'email Ã©tait persistÃ© **sans consentement** (le couplage
  n'existait que dans le composant client) â†’ refus explicite au schÃ©ma et email
  jamais transmis Ã  la base sans opt-in, lÃ  oÃ¹ l'Ã©criture se produit.
- **M2 â€” RGPD** : la purge laissait les **rÃ©ponses LIBRES**, qui contiennent
  couramment de la PII (Â« comment s'appelle notre chef ? Â») â†’ rÃ©ponses `text`
  neutralisÃ©es, score et registre des codes conservÃ©s.
- **M3 â€” piÃ¨ge irrÃ©versible** : un tirage lancÃ© avant que quiconque ait terminÃ©
  posait `draw_state = 'done'` Ã  0 gagnant et **figeait dÃ©finitivement la
  dotation** (aucune RPC ne revient Ã  `pending`) â†’ le drapeau n'est posÃ©
  qu'**aprÃ¨s Ã©mission rÃ©elle**, nouvel Ã©tat `no_participants` (cÃ¢blÃ© jusqu'au TS,
  rendu en information neutre) et **tirage relanÃ§able** : Â« non rejouable Â» ne
  doit pas vouloir dire Â« impossible Ã  faire une seule fois Â».
- **INFO retenus** : verrou global inutile retirÃ© de `submit`, oracle d'existence
  du classement uniformisÃ©, gardes addon / statut en dÃ©fense en profondeur, motif
  d'URL portÃ© dans le CHECK `image_url`, et `retryable` remplace une comparaison
  de TEXTE d'erreur cÃ´tÃ© Ã©diteur (une reformulation cassait l'affichage).
- **ConsÃ©quence d'E1 traitÃ©e cÃ´tÃ© UI** : une question chronomÃ©trÃ©e abandonnÃ©e est
  dÃ©sormais **SOUMISE** (hors barÃ¨me) au lieu d'Ãªtre sautÃ©e â€” sinon un joueur
  honnÃªte qui laisse filer le temps perdait sa rÃ©compense, la complÃ©tion Ã©tant
  devenue la condition d'Ã©mission.

**Rationale** : le module rÃ©utilise ce qui existe (validateurs de pronostics pour
3 des 4 formes, patron de non-fuite du calendrier, chronomÃ©trage du mode
Ã©vÃ©nement, moteur de spin pour le tour offert, caisse) et n'invente que ce que la
sÃ©mantique du quiz impose : une vÃ©ritÃ© qui prÃ©existe Ã  la partie, donc une
non-fuite Ã  dÃ©montrer, et un chronomÃ¨tre dont l'autoritÃ© ne peut pas Ãªtre
dÃ©lÃ©guÃ©e au client. Le couple `question_type` / `preset` fait porter la richesse
produit (7 modÃ¨les, et plus demain) par le CATALOGUE d'interface, pas par le
schÃ©ma.

**Consequences** :
- **NON POUSSÃ‰ / NON DÃ‰PLOYÃ‰** â€” les 6 commits (`cb92b19` â†’ `fe1e57b`) sont
  LOCAUX et la migration `20260803120000` n'est pas appliquÃ©e en production.
  `EXPECTED_MIGRATION` vaut dÃ©jÃ  `20260803120000` : migration et code devront
  Ãªtre poussÃ©s ensemble. C'est **le seul chantier du projet dans cet Ã©tat** ; la
  place de marchÃ© de campagnes (ADR-039), qui l'Ã©tait encore le 2026-07-25, a
  depuis Ã©tÃ© poussÃ©e.
- **Un dÃ©faut de PRODUCTION a Ã©tÃ© corrigÃ© au passage** (`b483740`, hors pÃ©rimÃ¨tre
  du quiz) : la base portait **8 addons**, le back-office n'en exposait que **6**
  et `src/lib/admin/data.ts` ne LISAIT mÃªme pas les deux manquantes. ConsÃ©quence
  rÃ©elle : le module **Parrainage, en production depuis plusieurs jours, ne
  pouvait Ãªtre activÃ© pour AUCUN commerÃ§ant**. Les 8 sont dÃ©sormais basculables
  et lues (`getUserAndOrg` sÃ©lectionnait dÃ©jÃ  les 8 : le blocage venait bien de
  l'admin). RÃ©sidu notÃ© : `setMerchantCompAccess` (accÃ¨s offert) ne couvre que
  4 addons â€” incohÃ©rence prÃ©existante, que les bascules dÃ©diÃ©es supplÃ©ent.
- **RÃ©sidus assumÃ©s** (suivi docs/bugs.md) :
  - **Sybil Ã©conomique** : l'identitÃ© est un cookie gratuit et le corrigÃ© est dÃ»
    au joueur ; le plafond est et reste `reward_stock` (ADR-031) â€” rien ne
    garantit que les lots aillent Ã  des humains DISTINCTS. Turnstile sur la
    clÃ´ture rÃ©duit la surface ; sans clÃ©s provisionnÃ©es, aucun challenge n'est
    prÃ©sentÃ© (miroir exact du compromis fidÃ©litÃ© / jackpot) ;
  - **aucune borne minimale de temps humain** en SQL : un bot garde l'avantage
    sur les modes `ranking` et `draw` ;
  - **`out_of_stock` est terminal** : un joueur touchÃ© en rupture ne sera plus
    dotÃ© mÃªme aprÃ¨s rÃ©approvisionnement (unicitÃ© joueur Ã— quiz, patron
    calendrier) â€” Ã  documenter cÃ´tÃ© commerÃ§ant ;
  - **purge par ANONYMISATION** : hash du jeton, score, temps, rÃ©ponses non
    libres et registre des codes survivent Ã  la rÃ©tention (arbitrage assumÃ© au
    regard du registre de caisse) ;
  - `consume_quiz_spin_grant` **ignore l'Ã©tat de la roue / campagne cibles**
    (miroir calendrier) : un tour offert peut atterrir sur une roue en pause ;
  - **prÃ©nom joueur affichÃ© au classement, non modÃ©rÃ©** (identique aux
    pronostics et au mode Ã©vÃ©nement) ;
  - **dÃ©rogation au trigger de gel** : la purge peut vider une rÃ©ponse `text`, et
    SEULEMENT cela (toutes les autres colonnes doivent rester identiques, sinon
    refus) â€” dÃ©rogation purement destructive, verrouillÃ©e par deux tests.
- VÃ©rifs CI-only (Docker absent en local) : pgTAP `quizzes.test.sql`, E2E
  `e2e/quiz.spec.ts`, seed. Unitaires : typecheck âœ“, lint âœ“, **1116 tests âœ“**.

## ADR-041 : IdentitÃ© joueur commune par pont pseudonyme progressif

**Date** : 2026-07-25
**Status** : Accepted

**Context** : chaque expÃ©rience publique possÃ¨de historiquement son propre
cookie HTTP-only et sa propre table joueur. Ce cloisonnement protÃ¨ge la
progression existante, mais empÃªche une continuitÃ© cohÃ©rente entre les parcours.
Une bascule immÃ©diate vers un compte joueur central aurait crÃ©Ã© deux risques :
perdre la progression au premier dÃ©faut de migration et inventer une
authentification nominative sans fournisseur ni parcours de consentement.

**Decision** : ajouter une identitÃ© centrale pseudonyme et additive :

- `lc-player` est un jeton opaque commun de 256 bits ; seule une empreinte
  SHA-256 salÃ©e et sÃ©parÃ©e par domaine est stockÃ©e dans `player_devices` ;
- `players`, les adhÃ©sions organisation/expÃ©rience et les liens legacy sont
  privÃ©s (`service_role`-only, RLS sans accÃ¨s marchand direct) ;
- `resolve_player_identity` valide en base le couple expÃ©rience/organisation,
  lazy-link le hash historique et rattache un nouveau device au joueur dÃ©jÃ 
  connu lorsque l'ancien cookie subsiste ;
- les cookies et tables historiques restent autoritaires. Le pont n'est appelÃ©
  qu'aprÃ¨s une opÃ©ration publique reconnue, en best-effort, et ne peut pas
  invalider son rÃ©sultat mÃ©tier ;
- un device Ã¢gÃ© de 90 jours est rotÃ© ; l'ancien hash est rÃ©voquÃ© avec cinq
  minutes de grÃ¢ce pour les requÃªtes concurrentes ;
- aucune API de liaison nominative n'est exposÃ©e. Une future liaison
  `auth_user_id` est contrainte par une preuve de consentement explicite,
  horodatÃ©e et versionnÃ©e.

**Rationale** : le double chemin permet de dÃ©ployer, observer et Ã©ventuellement
revenir en arriÃ¨re sans supprimer ni rÃ©interprÃ©ter une progression existante.
Les FK composites, la validation polymorphe de la ressource et l'absence de
lecture marchande directe empÃªchent qu'un identifiant central devienne un canal
de corrÃ©lation inter-tenant. Ne pas simuler de lien magique Ã©vite de transformer
le systÃ¨me d'authentification marchand actuel en identitÃ© joueur par accident.

**Consequences** :

- roue standard/skill-gated, chasse, fidÃ©litÃ©, jackpot, Ã©vÃ©nement live,
  calendrier et quiz alimentent le pont ; Pronostics reste traitÃ© par son
  chantier sÃ©parÃ© et le parrainage n'a pas encore d'adhÃ©sion centrale dÃ©diÃ©e ;
- effacer `lc-player` ne perd pas la progression : si l'ancien cookie
  d'expÃ©rience subsiste, le lazy-link rattache le nouveau device au mÃªme joueur ;
- effacer aussi le cookie historique rend la reprise automatique impossible en
  l'absence volontaire de compte joueur ou de rÃ©cupÃ©ration nominative ;
- le schÃ©ma est prÃªt pour une liaison consentie future, mais cette capacitÃ©
  restera inactive tant qu'un fournisseur et un parcours de consentement
  vÃ©rifiable ne seront pas dÃ©finis.

## ADR-042 : Catalogue d'expÃ©riences et droits Stripe progressifs

**Date** : 2026-07-25  
**Status** : Accepted

**Context** : le produit ne se limite plus Ã  la roue, mais la navigation, le
site marketing et la facturation continuaient Ã  prÃ©senter ou activer les
modules comme une liste de boolÃ©ens administratifs. Un passage brutal Ã  de
nouveaux Price IDs aurait coupÃ© les organisations bÃªta et inventÃ© des tarifs
qui ne sont pas encore validÃ©s.

**Decision** :

- un catalogue typÃ© unique classe les expÃ©riences par objectif
  (`AcquÃ©rir`, `FidÃ©liser`, `Animer en direct`, `CrÃ©er du trafic`) et associe
  chaque module Ã  un droit fonctionnel ;
- les offres deviennent `Core`, `Engagement`, `Live & Events` et
  `Full Platform`. Seul le tarif Core dÃ©jÃ  Ã©tabli est affichÃ© ; les autres
  restent Â« sur devis Â» tant que leurs prix ne sont pas dÃ©cidÃ©s ;
- le webhook relit les items de l'abonnement Stripe et applique statut, plan
  et photographie des droits dans une seule RPC idempotente et ordonnÃ©e ;
- les anciens `addon_*` restent des projections compatibles. Les activations
  existantes sont reprises comme source `legacy`, puis sont masquÃ©es dÃ¨s le
  premier snapshot Stripe, mÃªme si celui-ci dÃ©sactive tous les droits ;
- lorsqu'un snapshot Stripe existe, un trigger interdit de modifier
  directement le plan ou les projections d'addons. La transaction du webhook
  est la seule Ã  ouvrir temporairement cette Ã©criture ;
- la navigation principale n'affiche que les expÃ©riences actives. Les autres
  restent visibles dans une galerie `DÃ©couvrir`, sans simuler un achat lorsque
  le Price ID correspondant n'est pas configurÃ©.

**Rationale** : cette double lecture permet une migration sans coupure tout en
crÃ©ant une borne nette : avant Stripe, le back-office admin conserve le pilotage
des comptes legacy ; aprÃ¨s Stripe, la facture redevient l'unique source de
vÃ©ritÃ©. Les Price IDs restent des secrets de configuration serveur et aucun
montant commercial non validÃ© n'est codÃ© dans l'application.

**Consequences** :

- un Price ID inconnu fait Ã©chouer le webhook afin que Stripe le retente ; il
  ne rÃ©voque jamais silencieusement des modules ;
- les commandes manuelles de plan/addons refusent les organisations dÃ©jÃ 
  pilotÃ©es par Stripe, mais l'accÃ¨s offert (`comp_access`) demeure une voie
  explicite, sÃ©parÃ©e et auditÃ©e ;
- les migrations et le webhook doivent Ãªtre dÃ©ployÃ©s ensemble avant d'activer
  les nouveaux Price IDs ;
- le catalogue fournit le premier port commun aux futurs modules
  `ExperienceDefinition`, sans imposer une rÃ©Ã©criture globale des actions
  historiques.

## ADR-043 : Encaissement en caisse â€” module unifiÃ© Ã  9 sources, une seule colonne de vÃ©ritÃ© (`redeemed_at`), TTL divergent par famille
**Date** : 2026-07-25
**Status** : Accepted â€” commitÃ© sur `main` (commits `e310606` â†’ `f873b77`,
migration `20260804120000`, `EXPECTED_MIGRATION` bumpÃ©) mais **NON POUSSÃ‰ au
2026-07-25** (`origin/main` = `eb3193d`), donc migration non appliquÃ©e en
production. **Les assertions pgTAP n'ont jamais Ã©tÃ© exÃ©cutÃ©es** (ni Docker ni CLI Supabase disponibles) : elles ne
seront prouvÃ©es qu'au job `database-security` de la CI.

**Context** : les pronostics Ã©mettaient dÃ©jÃ  un code de retrait. `finalize_contest`
pose `contest_awards.code` au format `PRONO-â€¦`, le joueur le voit sur
`/pronos/[slug]` et l'interface lui dit de le **prÃ©senter en caisse**. Mais
`lookupRedeemCode` ne routait que **8 sources** (roue, chasse, fidÃ©litÃ©, jackpot,
Ã©vÃ©nement live, calendrier, parrainage, quiz) : saisi au comptoir, un code
`PRONO-â€¦` rÃ©pondait Â« code introuvable Â». Le seul chemin de remise existant,
`set_contest_award_status`, exige `is_org_editor` â€” **un caissier ne pouvait pas
remettre le lot**, et un owner devait le faire Ã  la main depuis le dashboard.
Anomalie fonctionnelle **en production**, sur une promesse dÃ©jÃ  affichÃ©e au joueur.

**Decision** :

1. **9e source de caisse, au contrat strictement identique aux 8 autres.**
   `lookupRedeemCode` route la forme `PRONO-â€¦` vers
   `CashierMatch { source: 'contest' }` (lecture org-scopÃ©e
   `lookupContestAwardByCode`), et l'Ã©criture passe par une RPC dÃ©diÃ©e
   `redeem_contest_award(uuid, text, text, integer)` â€” `service_role` seule,
   `authenticated` et `anon` explicitement rÃ©voquÃ©s. Elle est **atomique**
   (recherche, validation, remise et audit dans un seul `UPDATE â€¦ returning`),
   **idempotente** (la seconde tentative ne matche plus rien : `redeemed_at is
   null` fait partie du prÃ©dicat), **auditÃ©e** (`contest.award.redeem` avec
   `actor` obligatoire et `basket_cents`), **deny-by-default** (`status =
   'pending'` seulement â€” les statuts ajoutÃ©s plus tard seront refusÃ©s sans qu'on
   y repense) et **indistinguable** pour un code inconnu comme pour un code
   d'une autre organisation (aucune ligne rendue : pas d'oracle d'existence).
2. **Une seule colonne de vÃ©ritÃ© pour la remise.** `contest_awards.delivered_at`
   est **renommÃ©e `redeemed_at`**, alignÃ©e sur les 7 modules frÃ¨res
   (`quiz_rewards.redeemed_at`, `calendar_rewards`, â€¦), plutÃ´t que d'ajouter un
   second horodatage Ã  cÃ´tÃ©. S'y ajoutent `redeemed_by`, `basket_cents` et
   `redeem_expires_at`, et surtout un CHECK qui rend l'Ã©tat incohÃ©rent
   **impossible** : `(status = 'delivered') = (redeemed_at is not null)`. Un
   index unique `(organization_id, code)` remplace la portÃ©e Â« par championnat Â»
   de l'unicitÃ© existante, prÃ©cÃ©dÃ© d'un **contrÃ´le de doublons explicite** qui
   Ã©choue avec un message actionnable plutÃ´t que sur un Â« could not create unique
   index Â» muet.
3. **Deux chemins, deux ACL.** La caisse utilise `redeem_contest_award`
   (`service_role`, via une Server Action authentifiÃ©e). L'Ã©diteur garde
   `set_contest_award_status` (`is_org_editor`) pour l'annulation motivÃ©e et la
   remise depuis le dashboard. Ce ne sont pas deux implÃ©mentations de la mÃªme
   chose : ce sont deux autoritÃ©s diffÃ©rentes sur le mÃªme objet.
4. **Bornes de TTL dÃ©libÃ©rÃ©ment divergentes.** `contests.code_ttl_seconds`
   (nullable, rÃ©glable en jours dans l'Ã©diteur) est bornÃ© **3 600 s Ã 
   7 776 000 s (1 h Ã  90 j)**, lÃ  oÃ¹ `campaigns.code_ttl_seconds` est bornÃ©
   **10 s Ã  600 s**. MÃªme nom, mÃªme unitÃ©, mÃªme patron de trigger figeant
   l'Ã©chÃ©ance Ã  l'Ã©mission â€” mais pas la mÃªme borne, et c'est intentionnel.
5. **Aucune confiance Ã  la colonne dÃ©normalisÃ©e.** L'`UPDATE` **et** le `SELECT`
   final de la RPC exigent que `contests` **et** `contest_players`
   appartiennent aussi Ã  l'organisation qui encaisse, avec un filtre
   rigoureusement identique des deux cÃ´tÃ©s.

**Rationale** :

- **Pourquoi une 9e source et pas un droit de plus au caissier.** Ã‰largir
  `set_contest_award_status` au rÃ´le `cashier` aurait donnÃ© au comptoir le
  pouvoir d'**annuler** un lot, et aurait laissÃ© la remise hors du contrat commun
  (pas de panier, pas d'expiration serveur, pas de rÃ©ponse indistinguable). Le
  module de caisse est dÃ©jÃ  un point unique de lecture pour 8 familles de codes :
  la 9e coÃ»te un prÃ©fixe et une RPC, et le caissier n'apprend rien de nouveau.
- **Pourquoi une seule colonne et un renommage.** Conserver `delivered_at` et
  ajouter `redeemed_at` aurait crÃ©Ã© deux horodatages qui divergent au premier
  chemin d'Ã©criture oubliÃ©, et un doute permanent sur celui qui fait foi. Le
  renommage est plus coÃ»teux une fois (migration, types, UI) et gratuit ensuite.
  Le CHECK dÃ©place l'invariant de la discipline du code vers la base : les deux
  RPC sont contraintes, y compris une future troisiÃ¨me.
- **Pourquoi les bornes de TTL divergent.** Sur la roue, le dÃ©compte part du
  moment oÃ¹ le joueur **vient de gagner et se trouve devant la caisse** : la
  fenÃªtre courte est prÃ©cisÃ©ment ce qui empÃªche de rÃ©utiliser une capture
  d'Ã©cran. Sur un championnat, le dÃ©compte part de la **clÃ´ture**, pas d'un
  joueur prÃ©sent en boutique : le gagnant doit Ãªtre prÃ©venu, puis se dÃ©placer.
  Toute borne de l'ordre de la minute expirerait 100 % des codes **avant le
  premier retrait possible**. Uniformiser les bornes aurait uniformisÃ© un chiffre
  au prix de la fonction qu'il remplit.
- **Pourquoi l'org-scoping va jusqu'Ã  l'`UPDATE`.** La revue a relevÃ© que
  `c.name` (le championnat) et `pl.first_name` (le **prÃ©nom du gagnant**) sont
  les deux champs affichÃ©s au comptoir : ne scoper que la lecture aurait produit
  un Ã©tat **pire** que le dÃ©faut d'origine â€” le lot consommÃ© et auditÃ© pendant
  que la caisse affiche Â« code inconnu Â».

**Consequences** :

- la caisse (`/dashboard/redeem`) reconnaÃ®t dÃ©sormais **9 familles de codes** ;
  le palmarÃ¨s du championnat affiche quand, par qui et pour quel panier chaque
  lot a Ã©tÃ© remis, et le joueur voit l'Ã©chÃ©ance de son code ;
- **bascule de tie-break assumÃ©e** : une saisie **nue** de 8 caractÃ¨res (sans
  prÃ©fixe) rÃ©sout vers les pronostics **avant** le repli roue. Comportement
  testÃ© et voulu, mais c'est un changement de rÃ©solution pour les codes nus ;
- **rÃ©sidu M2, non livrÃ©** : chaque famille consomme son propre jeton
  `cashier:lookup`, donc une saisie nue en consomme dÃ©sormais **9** et ramÃ¨ne le
  caissier Ã  ~3 recherches/minute, le refus s'affichant Â« code introuvable Â» sur
  un lot valide. Le correctif est Ã©crit et vert (1 222 tests) mais **non
  commitÃ©** â€” il concerne les 9 sources, pas les seuls pronostics (docs/bugs.md) ;
- `set_contest_award_status('delivered')` **ne teste pas** `redeem_expires_at` :
  un owner peut honorer depuis le dashboard un code pÃ©rimÃ©. Le TTL protÃ¨ge le
  commerÃ§ant, c'est donc lui qui en dÃ©roge â€” dÃ©rogation assumÃ©e, pas oubli ;
- aucune garde `hasPronosticsAccess` sur la remise, **cohÃ©rent avec les 8 autres
  sources** : on n'annule pas des lots dÃ©jÃ  dus parce qu'un abonnement a expirÃ© ;
- l'index unique Ã©largit la portÃ©e anti-collision de Â« par championnat Â» Ã  Â« par
  organisation Â» alors que `finalize_contest` n'a **pas** de boucle de reprise sur
  le code (~5Â·10â»â· pour 1 000 lots ; la clÃ´ture avorte en transaction et reste
  rejouable) ;
- les 43 assertions pgTAP de `supabase/tests/contest_awards.test.sql` et les 4 de
  l'audit ACL central **restent Ã  prouver en CI** : c'est le trou rÃ©el du
  chantier.

---

## ADR-044 : MÃ©ta-progression â€” moteur par trigger, invariant non monÃ©taire, interrupteur d'arrÃªt comme seul geste sur une saison lancÃ©e
**Date** : 2026-07-26 (mis Ã  jour 2026-07-27)
**Status** : Accepted â€” branche `chantier/audit-3` poussÃ©e, **PR #29 ouverte
et entiÃ¨rement verte (6/6 jobs)** aprÃ¨s 13 passages CI. Migrations
`20260805200000` / `20260805210000` / `20260805220000`, `EXPECTED_MIGRATION` =
`20260805220000`, non fusionnÃ©e sur `main` Ã  ce stade. **pgTAP et E2E ont Ã©tÃ©
exÃ©cutÃ©s pour la premiÃ¨re fois** via cette PR â€” 22/22 suites, 1 781
assertions, E2E verts â€” puisque Docker Desktop exige un build Windows â‰¥ 19045
et que la machine de dÃ©veloppement est figÃ©e en LTSC 2021 / 19044 pour toute
sa durÃ©e de vie (seule la CI fait autoritÃ©, voir mÃ©moire utilisateur
Â« Docker impossible, la CI est seul juge Â»). L'exÃ©cution a trouvÃ© 8 dÃ©fauts
qu'aucune relecture n'avait vus (docs/bugs.md), et a rÃ©vÃ©lÃ© qu'un correctif
antÃ©rieur (`15364ee`) crÃ©ait lui-mÃªme le blocage qu'il prÃ©tendait rÃ©soudre â€”
annulÃ© par `c131340`.

**Context** : 1 713 lignes de SQL dormaient depuis un chantier antÃ©rieur de
l'audit 3 â€” 14 tables `progression_*` (missions, collections, badges, coffres,
saisons, items joueur) et 13 fonctions, mais **aucune RPC appelÃ©e par le code**
et **aucune UI**. C'Ã©tait la seule fondation du projet entiÃ¨rement morte, et le
nÂ°1 du backlog de l'audit (`docs/audit-3-backlog.md`, item 13).

**Decision** :

1. **Le moteur est un trigger, pas un appel.** `apply_meta_progression_event()`
   est branchÃ© sur `experience_events` : les missions progressent depuis les
   9 expÃ©riences existantes **sans une seule ligne applicative**. ConsÃ©quence
   directe : brancher ce module consistait Ã  livrer la lecture, l'Ã©criture de
   configuration et l'ouverture de coffre â€” la progression elle-mÃªme tournait
   dÃ©jÃ , silencieusement, avant ce chantier.
2. **Invariant NON MONÃ‰TAIRE.** ClÃ©s, badges, objets et coffres sont des
   marqueurs d'engagement, pas des rÃ©compenses commerciales. Aucun code de
   caisse, aucune ligne `reward_issuances`, aucune colonne `*_cents` sur les
   14 tables. VÃ©rifiÃ© par **grep inverse** : aucun autre module du projet ne
   lit ces tables â€” l'Ã©conomie de clÃ©s est close sur elle-mÃªme. Une rÃ©compense
   commerciale continue d'Ãªtre Ã©mise par sa source d'origine (roue, quiz,
   pronostics, â€¦), jamais par la progression.
3. **Sel serveur sur le butin.** Le tirage d'origine Ã©tait
   `order by md5(request_id â€– item.id)` avec un `request_id` **fourni par le
   client** : meulable hors ligne pour choisir son objet. CorrigÃ© par
   `progression_chests.loot_seed`, gÃ©nÃ©rÃ© et conservÃ© cÃ´tÃ© serveur, qui ne sort
   jamais de la base (`20260805210000_meta_progression_lifecycle.sql`,
   `bf2c3d3`). L'idempotence par `request_id` est prÃ©servÃ©e â€” c'Ã©tait la
   contrainte difficile de ce correctif.
4. **L'interrupteur d'arrÃªt est le seul geste autorisÃ© sur une saison
   lancÃ©e.** Toute l'Ã©dition (missions, coffres, dotations, rÃ¨gles) est bornÃ©e
   au brouillon. `set_progression_mission_enabled` et
   `set_progression_chest_enabled` font seuls exception, et ne touchent
   **que** la colonne `enabled` â€” jamais les rÃ¨gles ni les dotations. Sans cet
   interrupteur, corriger une mission trop gÃ©nÃ©reuse en cours de saison
   exigeait de clore toute la saison et de basculer chaque joueur sur son
   archive.
5. **`canConfigure` distingue Â« rien n'est configurÃ© Â» de Â« tu n'as pas le
   droit de le voir Â».** Un tableau vide muet aurait laissÃ© croire Ã  un
   commerÃ§ant sans droit d'Ã©dition qu'aucune saison n'existe.
6. **La clÃ´ture est dÃ©finitive.** Aucune RPC ne rÃ©active une saison une fois
   close â€” arbitrage produit assumÃ©, Ã©noncÃ© dans l'UI avant le clic.
7. **`z.boolean()` strict, pas `z.coerce.boolean()`**, sur les entrÃ©es de
   l'interrupteur d'arrÃªt â€” seul Ã©cart de style du chantier, dÃ©libÃ©rÃ© : la
   coercition transforme la chaÃ®ne `"false"` en `true`, ce qui ferait d'un
   interrupteur d'arrÃªt un relanceur de ce qu'il est censÃ© couper.
8. **Deux arbitrages client** : Ã©dition et suppression de saison sont
   possibles, mais **bornÃ©es aux saisons Ã  l'Ã©tat brouillon** ; et **aucun
   `addon_progression`** n'a Ã©tÃ© crÃ©Ã© â€” la monÃ©tisation du module est reportÃ©e
   au packaging commercial (item 10 du backlog de l'audit).
9. **L'archive joueur inclut les saisons Ã©chues non encore closes.** Sans
   cela, les badges d'un joueur auraient disparu de son Ã©cran pendant toute la
   fenÃªtre entre `ends_at` et la clÃ´ture manuelle par le commerÃ§ant.

**Rationale** :

- **Pourquoi un trigger et pas un appel explicite dans chaque action de jeu.**
  Les 9 expÃ©riences (roue, quiz, pronostics, chasse, passeport, jackpot,
  Ã©vÃ©nement live, calendrier, parrainage) auraient chacune dÃ» apprendre Ã 
  notifier la progression â€” 9 points d'oubli possibles, et un dixiÃ¨me Ã  chaque
  nouvelle expÃ©rience. Le trigger sur `experience_events`, dÃ©jÃ  la source
  commune d'analytics (`track_experience_activity`), rend la connexion
  automatique et rÃ©troactive : les 9 expÃ©riences existantes progressent les
  missions sans modification de leur propre code.
- **Pourquoi l'invariant non monÃ©taire, explicitement.** Le module manipule du
  stock (coffres, dotations) et pourrait facilement glisser vers une
  ressource Ã©changeable. Fixer l'invariant dÃ¨s l'ADR â€” et le vÃ©rifier par grep
  inverse plutÃ´t que par affirmation â€” empÃªche qu'un futur chantier fasse
  lire ces tables par un module de caisse sans re-dÃ©cider consciemment le
  changement de nature de la ressource.
- **Pourquoi le sel serveur plutÃ´t qu'un durcissement du `request_id` client.**
  Interdire au client de choisir son `request_id` aurait cassÃ© l'idempotence
  existante (le client doit pouvoir rejouer sa propre requÃªte aprÃ¨s une
  coupure rÃ©seau). SÃ©parer Â« la clÃ© d'idempotence Â» (client, rejouable) de
  Â« la graine de tirage Â» (serveur, secrÃ¨te) rÃ©sout les deux exigences sans
  compromettre l'une pour l'autre.
- **Pourquoi l'interrupteur d'arrÃªt et rien de plus.** Autoriser l'Ã©dition
  complÃ¨te d'une saison lancÃ©e aurait permis de modifier rÃ©troactivement des
  rÃ¨gles dÃ©jÃ  appliquÃ©es Ã  des joueurs ayant dÃ©jÃ  progressÃ© â€” un problÃ¨me
  d'Ã©quitÃ©. Autoriser seulement `enabled` donne au commerÃ§ant le seul geste
  dont l'effet est prÃ©visible : arrÃªter, sans rÃ©Ã©crire l'histoire.

**Consequences** :

- 27 RPC exposÃ©es (`src/actions/meta-progression.ts`), backend
  `src/lib/meta-progression.ts` / `src/lib/validations/meta-progression.ts`,
  nouveaux seaux de rate-limit `progressionDevice` / `progressionPlayerAction`
  / `progressionPublicIp`, 9e RPC de purge dans le cron `purge-data`, sonde
  SLO du journal moteur dans `src/lib/admin/ops.ts` ;
- Ã©diteur commerÃ§ant `/dashboard/progression` et panneau joueur greffÃ© au
  parcours public **existant** `/play/[slug]` â€” **aucune nouvelle surface
  publique** : la progression est scopÃ©e par organisation et n'a aucun objet
  propre Ã  adresser par une URL ;
- **le panneau joueur n'est visible que depuis la roue.** Les missions
  **progressent** pourtant dÃ©jÃ  depuis les 14 jeux rapides, le passeport, le
  calendrier, le quiz, la chasse, le jackpot et l'Ã©vÃ©nement live â€” c'est la
  visibilitÃ© qui est partielle, pas le mÃ©canisme (docs/bugs.md) ;
- **rÃ©sidu M3 corrigÃ©** : l'interrupteur d'arrÃªt (dÃ©cision 4) rÃ©pond au MOYEN
  de la revue sÃ©curitÃ© qui notait l'absence de tout geste correctif sur une
  saison lancÃ©e ;
- **rÃ©sidu assumÃ©** : le seau de rate-limit par appareil borne un cookie, pas
  un humain â€” cohÃ©rent avec les 7 modules frÃ¨res, rien de monÃ©taire en jeu ;
- **Mise Ã  jour 2026-07-27** : preuve obtenue â€” PR #29 verte (6/6 jobs), 22/22
  suites pgTAP, 1 781 assertions, E2E verts. Voir ADR-045 pour le prÃ©requis
  d'identitÃ© dÃ©couvert au passage, et docs/bugs.md pour les 8 dÃ©fauts que
  l'exÃ©cution a rÃ©vÃ©lÃ©s dans d'autres migrations du mÃªme chantier.

**References** :
- `supabase/migrations/20260805200000_meta_progression.sql` (1 713 l.)
- `supabase/migrations/20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`)
- `supabase/migrations/20260805220000_meta_progression_hardening.sql` (1 380 l., `3174cbd`)
- `supabase/tests/meta_progression.test.sql` (293 assertions)
- `src/lib/meta-progression.ts`, `src/actions/meta-progression.ts`
- `src/app/dashboard/progression`, `src/components/progression`, `src/components/wheel/progression-panel.tsx`
- `docs/audit-3-backlog.md` (item 13), `docs/roadmap.md` (V1.18), `docs/bugs.md`
- ADR-045 (identitÃ© joueur, prÃ©requis)

## ADR-045 : L'identitÃ© joueur unifiÃ©e est un prÃ©requis de la mÃ©ta-progression, pas une dette annexe
**Date** : 2026-07-27
**Status** : Accepted â€” constat, aucun code livrÃ© par cette dÃ©cision.

**Context** : ADR-044 (item 13 du backlog) a branchÃ© le moteur de
mÃ©ta-progression sur `experience_events` via un trigger. En rejouant le
parcours joueur **en local contre un vrai Postgres et un vrai navigateur**
(premiÃ¨re fois du projet, `c131340`), il apparaÃ®t que deux des neuf
Ã©vÃ©nements mÃ©tier â€” prÃ©cisÃ©ment ceux qu'Ã©met la roue, l'expÃ©rience phare â€”
ne portent pas l'identitÃ© que le moteur exige :

```
experience_viewed    â†’ player_id âœ…   (identitÃ© unifiÃ©e, cookie lc-player)
experience_joined    â†’ player_id âœ…
experience_started   â†’ player_id âœ—   player_key seul  â† Ã©mis par le spin
experience_completed â†’ player_id âœ—   player_key seul  â† Ã©mis par le spin
```

`apply_meta_progression_event()` exige `player_id` et renonce dÃ¨s sa premiÃ¨re
garde. `spins.player_key` (cookie legacy par expÃ©rience, ADR antÃ©rieur Ã 
l'identitÃ© unifiÃ©e) ne correspond Ã  **aucun** `player_devices.token_hash` â€”
jointure vide, mesurÃ©e, pas supposÃ©e. Les deux systÃ¨mes d'identitÃ© â€” le cookie
historique par expÃ©rience et `players`/`player_devices` (identitÃ© joueur
unifiÃ©e, item 5 du backlog) â€” **ne se rencontrent jamais**. ConsÃ©quence
produit directe : aucune mission fondÃ©e sur Â« lancer Â» ou Â« terminer Â» une
expÃ©rience ne peut progresser depuis la roue. Preuve en base : 0
`progression_mission_progress`, 0 `progression_player_seasons`, et
`progression_engine_failures` **vide** â€” le moteur ne plante pas, il renonce
en silence (invisible sans la sonde SLO ajoutÃ©e en `1051bea`).

**Decision** :

1. L'item 5 du backlog de l'audit 3 (Â« migration des cookies existants Â»,
   `docs/audit-3-backlog.md`) est **requalifiÃ© de dette en prÃ©requis** du
   module 13. Tant qu'il n'est pas traitÃ©, la mÃ©ta-progression reste
   fonctionnelle uniquement pour les modules qui posent dÃ©jÃ  `player_id` sur
   leurs Ã©vÃ©nements (les 7 autres expÃ©riences, Ã  vÃ©rifier module par module),
   jamais pour la roue.
2. Le test E2E du panneau joueur (`e2e/progression.spec.ts`) est laissÃ© en
   `test.fixme` avec la raison Ã©crite en commentaire, plutÃ´t que supprimÃ© ou
   laissÃ© rouge â€” pour qu'il documente le manque et reparte au vert dÃ¨s que
   le prÃ©requis est traitÃ©, sans qu'un futur chantier ait Ã  redÃ©couvrir le
   mÃªme fait.
3. Aucun correctif n'est tentÃ© ici : faire Ã©mettre `player_id` par le spin
   sans traiter la migration des cookies existants aurait recrÃ©Ã©, Ã  l'envers,
   le mÃªme dÃ©faut (identitÃ© qui change sous un joueur dÃ©jÃ  engagÃ©).

**Rationale** : documenter un constat vÃ©rifiÃ© en base plutÃ´t que de le
laisser se reproduire silencieusement dans un futur chantier qui croirait le
module 13 entiÃ¨rement fonctionnel parce que ses tests unitaires (qui ne
traversent pas un vrai Postgres) passent.

**Consequences** :
- `docs/audit-3-backlog.md` item 5 marque explicitement le lien vers l'item 13 ;
- tout chantier qui reprend l'item 5 doit vÃ©rifier, en plus de la migration
  des cookies, que le spin Ã©mette bien `player_id` sur `experience_started`
  et `experience_completed` ;
- aucune rÃ©gression de sÃ©curitÃ© : le moteur renonce fail-closed (aucune
  mission n'avance Ã  tort), le dÃ©faut est un manque de fonctionnalitÃ©, pas
  une fuite.

**Addendum â€” correction de la cause, 2026-07-27 (`a963583`)** : le diagnostic
ci-dessus Ã©tait **juste dans l'effet, faux dans la cause**. La rÃ©solution
`player_id` depuis `player_legacy_identities` n'Ã©tait pas absente : elle
existait dÃ©jÃ  et fonctionne, dans `append_experience_event_internal`
(`20260805160000:382-393`), point d'Ã©mission unique des 10 branches
d'Ã©vÃ©nements â€” donc pas seulement la roue. MesurÃ© contre un vrai Postgres :
la vraie cause est un **ordre d'Ã©criture**. `resolve_player_identity` insÃ¨re
l'adhÃ©sion AVANT la ligne de pont (`player_legacy_identities`), la FK
composite l'impose ; or c'est le trigger de l'adhÃ©sion qui portait le
rattrapage, et il lisait un pont pas encore Ã©crit. 1re rÃ©solution aprÃ¨s un
join â†’ `player_id` nul ; 2e â†’ attribuÃ©. Le rattrapage existait donc bel et
bien, dÃ©calÃ© d'une visite entiÃ¨re â€” pas absent comme l'ADR l'affirmait ; le
tout premier tour de roue d'un joueur neuf (cas le plus frÃ©quent sur un
produit Ã  QR code) ne faisait progresser aucune mission au moment oÃ¹ il
avait lieu.

Second dÃ©faut trouvÃ© en mesurant, absent du diagnostic initial : le
`select ... into` de `resolve_player_identity` NULLifiait aussi
`v_source`/`v_qr_code_id` sur non-correspondance â€” la source `direct` de la
roue Ã©tait dÃ©gradÃ©e en `unknown` sur tout Ã©vÃ©nement Ã©mis avant la pose de son
pont, faussant l'attribution d'acquisition Ã  chaque premier passage.

**Correctif** : trigger `AFTER INSERT` sur `player_legacy_identities`
(migration `20260805230000_experience_identity_backfill.sql`), posÃ© lÃ  oÃ¹ la
correspondance hash â†’ `player_id` devient vraie â€” indÃ©pendant de l'ordre
d'Ã©criture cÃ´tÃ© serveur, donc insensible Ã  un futur rÃ©ordonnancement de
`resolve_player_identity`. VÃ©rifiÃ© `supabase test db` : **1 804 assertions
PASS** (contre 1 781 avant ce correctif). **ContrÃ´le nÃ©gatif** : migration
retirÃ©e, 8 assertions tombent â€” la preuve porte sur le dÃ©faut rÃ©el, pas sur
une tautologie. `EXPLAIN` confirme l'usage des deux index concernÃ©s.
`EXPECTED_MIGRATION` bumpÃ© Ã  `20260805230000`.

**Status final** : **Resolved** (le prÃ©requis constatÃ© par cet ADR est
traitÃ©). Le test `e2e/progression.spec.ts` reste toutefois en `test.fixme`
au 2026-07-27 malgrÃ© ce correctif â€” non rÃ©activÃ© dans ce chantier, Ã  faire
sÃ©parÃ©ment (voir docs/audit-3-backlog.md, item 5).

## ADR-046 : Une transition d'entrÃ©e hors `prefers-reduced-motion` peut casser le contraste calculÃ©, pas seulement l'accessibilitÃ© au mouvement
**Date** : 2026-07-27
**Status** : Accepted â€” rÃ©solu par `1cf46cf`.

**Context** : troisiÃ¨me dÃ©faut d'accessibilitÃ© rÃ©el trouvÃ© sur `/play`, aprÃ¨s
le bouton `danger` sous le seuil AA (`6973d13`) et le texte secondaire
(passeport). `.play-in` Ã©tait la seule animation d'entrÃ©e de `/play` absente
du bloc `prefers-reduced-motion: reduce` de `globals.css` (22 classes s'y
trouvaient, elle manquait). Son keyframe animait `opacity: 0 â†’ 1` sur 450 ms.
axe-core replie l'opacitÃ© des ancÃªtres dans le calcul du contraste du texte :
pendant la transition, tout le petit texte de l'Ã©cran traversait une zone
sous le seuil AA â€” pour **tout** joueur, y compris ceux SANS prÃ©fÃ©rence de
mouvement rÃ©duit, Ã  chaque changement d'Ã©cran. 20 points d'appel dans 5
composants : tous les parcours `/play`, pas seulement les 14 jeux rapides.
Explique l'intermittence observÃ©e en CI : `progression.spec.ts` pose
`reducedMotion: "reduce"` et Ã©chappe au fondu, `skill-games.spec.ts` non.

**Decision** :
1. `.play-in` ajoutÃ© au bloc `prefers-reduced-motion: reduce` de
   `globals.css:601`.
2. OpacitÃ© de dÃ©part portÃ©e de `0` Ã  `0.75` â€” le `translateY(14px)` porte
   seul l'arrivÃ©e. Corrige le cas SANS prÃ©fÃ©rence de mouvement rÃ©duit, que
   le point 1 seul ne couvre pas.
3. Jeton `--color-k-muted: #6b6459` introduit (5,4:1 sur crÃ¨me) pour la
   grappe `opacity-*` sur du texte (`puzzle` Ã—2, `gauge`, `estimate` Ã—2,
   `mystery-word` Ã—2, `rps`) ; les 4 boutons de validation recopiÃ©s Ã 
   l'identique factorisÃ©s dans `challengeButtonTone()`
   (`src/components/play/play-theme.tsx`).
4. Le contournement JS du panneau de progression
   (`reducedMotion ? "" : "play-in"`) redevient inconditionnel â€” sa raison
   d'Ãªtre disparaÃ®t une fois le point 1 traitÃ©. Le hook
   `usePrefersReducedMotion` est conservÃ© : il sert encore une `transition`
   inline (jauge) hors de portÃ©e d'une feuille de style.
5. LaissÃ© volontairement : `chest-reveal` et `cups-reveal` gardent
   `opacity-40` â€” leur bouton ne contient qu'un emoji dÃ©coratif, aucune rÃ¨gle
   de contraste ne s'y applique.

**Rationale** : la classe d'erreur est gÃ©nÃ©rale, pas propre Ã  ce composant â€”
toute transition d'opacitÃ© sur un conteneur de texte, non couverte par
`prefers-reduced-motion`, dÃ©grade le contraste calculÃ© pour l'ensemble des
utilisateurs pendant sa durÃ©e, pas seulement pour ceux visÃ©s par la media
query. Vaut d'Ãªtre retenue au-delÃ  de `/play`.

**Consequences** :
- diagnostic Ã©tabli sur piÃ¨ces (lecture de `globals.css` et des composants),
  confirmÃ© par exÃ©cution ensuite : CI verte.
- rÃ©siduel : aucune spec ne scanne encore un Ã©tat post-soumission
  (`opacity-40`/`opacity-60` sur des contrÃ´les verrouillÃ©s) â€” la premiÃ¨re qui
  le fera devra vÃ©rifier le mÃªme invariant de contraste.

**References** :
- `src/lib/meta-progression.ts` (`apply_meta_progression_event`)
- `supabase/migrations/20260805140000_player_identity.sql`
- `docs/audit-3-backlog.md` (items 5 et 13)
- ADR-044

## ADR-047 : Une shorthand CSS `background` peut effacer la couleur de fond posÃ©e avant elle, pas seulement la peindre

**Date** : 2026-07-27
**Status** : Accepted â€” rÃ©solu par `d96acbd`.

**Context** : quatriÃ¨me dÃ©faut d'accessibilitÃ© rÃ©el trouvÃ© sur `/play`, celui-ci
**en production** depuis le lancement du thÃ¨me commerÃ§ant. `src/app/play/[slug]/page.tsx`
peint le thÃ¨me Â« nuit Â» avec la shorthand CSS `background` : `background-image` (le
dÃ©gradÃ© du commerÃ§ant) et `background-color` sont posÃ©s dans la mÃªme
dÃ©claration, donc quand seul le dÃ©gradÃ© est fourni, la shorthand **remet
`background-color` Ã  sa valeur initiale (`transparent`)** â€” mÃªme si une
couleur avait Ã©tÃ© posÃ©e juste avant dans la cascade. Sous `/play`, la seule
peinture opaque restante Ã©tait alors celle du `body` du site vitrine :
**crÃ¨me** (`#fdf6e3`). Tant que le dÃ©gradÃ© du commerÃ§ant peint effectivement,
invisible Ã  l'Å“il â€” le dÃ©gradÃ© recouvre tout. Le jour oÃ¹ il ne peint pas
(chargement lent, dÃ©gradÃ© retirÃ©, repaint partiel, ou tout outil qui empile
les fonds pour calculer un contraste, tel axe-core), le texte blanc du thÃ¨me
nuit se retrouve sur fond crÃ¨me : 1,07:1 pour l'accroche, 1,05:1 pour le nom
du commerce â€” annulant tout le travail de contraste par ailleurs correct.
TrouvÃ© par un scan axe sur `e2e/player-win.spec.ts`, jamais par relecture.

**Decision** : reposer la couleur pleine du thÃ¨me (`bgTo`) **aprÃ¨s** la
shorthand `background`, dans `PlayShell` et dans l'aperÃ§u de l'Ã©diteur qui
recopiait la mÃªme construction. Ã€ l'Ã©cran, rien ne change â€” le dÃ©gradÃ© la
recouvre toujours â€” mais le fond de `/play` n'est plus, en dernier ressort,
celui d'une page claire.

**Rationale** : la classe d'erreur est gÃ©nÃ©rale, pas propre Ã  ce composant â€”
toute shorthand CSS qui combine `background-image` et une couleur implicite
efface silencieusement une `background-color` posÃ©e ailleurs dans la cascade,
y compris par une rÃ¨gle jugÃ©e hors de cause. Un audit de contraste qui ne
regarde que les propriÃ©tÃ©s explicitement dÃ©clarÃ©es sur l'Ã©lÃ©ment manque ce
cas ; seul l'empilement rÃ©el des fonds (calcul d'axe-core, ou un repaint qui
expose la couche du dessous) le rÃ©vÃ¨le.

**Consequences** :
- mÃªme chantier, un second dÃ©faut de couleur traitÃ© comme une **classe** :
  `text-zinc-500` (4,21:1) et `text-k-body/70` (4,49:1), sous le seuil AA aux
  tailles oÃ¹ ils servent dans les deux thÃ¨mes, remplacÃ©s par un jeton partagÃ©
  `playText.muted()` dans 11 recopies.
- rÃ©siduel : aucune garde automatisÃ©e n'empÃªche une future shorthand
  `background` de reproduire ce dÃ©faut â€” seul le scan axe de
  `e2e/player-win.spec.ts` le couvre aujourd'hui.

**References** :
- `src/app/play/[slug]/page.tsx`, `src/components/dashboard/wheel-style-editor.tsx` (aperÃ§u)
- `src/components/wheel/play-theme.tsx` (jeton `playText.muted()`)
- ADR-046 (mÃªme chantier, dÃ©faut d'accessibilitÃ© voisin â€” transition d'opacitÃ©)
- `docs/bugs.md` (Resolved)

---

## ADR-048 : Un repli silencieux ne se retire pas â€” il se mesure d'abord

**Date** : 2026-07-29
**Statut** : acceptÃ©

**Context** :
`20260805150000_universal_rewards.sql` a installÃ© le registre universel
`reward_issuances`, ses dix triggers de miroir et le moteur unique
`redeem_reward_by_code`. Son en-tÃªte assume une Â« migration sans big-bang Â» :
**rien n'a Ã©tÃ© rÃ©tro-alimentÃ©**. Tout lot Ã©mis avant cette migration est donc
invisible du moteur, qui sort en zÃ©ro ligne.

Personne ne s'en apercevait, et c'est le point : la caisse tente le moteur,
obtient zÃ©ro ligne, et **retombe silencieusement** sur la RPC historique de la
famille. Le test `universal_rewards.test.sql:311-341` prouve littÃ©ralement que
c'est ce repli qui sauve ces codes â€” il supprime la ligne de registre pour
simuler une Ã©mission antÃ©rieure.

L'item 4 de l'audit 3 (Â« basculer la caisse sur le moteur unique Â») supposait
qu'il suffisait de retirer les neuf chemins historiques. C'Ã©tait faux, pour
deux raisons distinctes qu'aucune relecture n'avait sÃ©parÃ©es.

**Decision** :
Traiter la bascule comme **trois Ã©tapes ordonnÃ©es**, dont les deux premiÃ¨res
ne changent aucun comportement.

1. **RÃ©tro-alimenter** (`20260807120000`) : rejouer `sync_reward_issuance` sur
   les dix tables historiques. L'outil existait et est idempotent par
   construction ; une boucle plutÃ´t qu'un `insert â€¦ select`, parce que la
   logique par famille (rÃ©solution du joueur, expiration, annulation) vit dÃ©jÃ 
   dans cette fonction â€” la rÃ©Ã©crire en ensembliste recrÃ©erait la seconde
   source de vÃ©ritÃ© que le registre existe pour supprimer.
2. **Mesurer** : compteurs `rewards.registry_miss.<famille>` et
   `rewards.registry_error` dans `ops_metrics`, objectif back-office
   `rewards-registry` vert seulement Ã  zÃ©ro sur 24 h.
3. **Basculer**, famille par famille, **conditionnÃ© Ã  la mesure** â€” pas au
   jugement.

**Consequences** :
- Un repli conÃ§u pour Ãªtre invisible est, par construction, un repli qu'on ne
  peut pas retirer : son silence en rÃ©gime nominal est indistinguable de son
  inutilitÃ©. L'instrumenter n'est pas du confort, c'est la condition de sa
  suppression. ZÃ©ro ligne Ã©tant la valeur saine, l'instrumentation ne coÃ»te
  rien quand tout va bien.
- Les compteurs **nomment la famille** : la bascule se fait module par module,
  un total agrÃ©gÃ© ne dirait pas lequel est prÃªt. Ils ne journalisent **jamais**
  le code (secret porteur).
- `registry_miss` et `registry_error` sont **sÃ©parÃ©s** : registre incomplet et
  registre injoignable interdisent tous deux la bascule, pour des raisons
  opposÃ©es ; les confondre ferait diagnostiquer l'un pour l'autre.
- Aucune table ni migration pour les compteurs â€” `ops_metrics` porte dÃ©jÃ  la
  purge Ã  30 jours et la synthÃ¨se. Un compteur n'a pas mÃ©ritÃ© sa table.
- **MesurÃ©, pas prÃ©sumÃ©, en Ã©crivant la migration** : la colonne de code n'est
  pas uniforme (`participations` porte `redeem_code`, les neuf autres `code`).
  PrÃ©sumer l'uniformitÃ© fait Ã©chouer la migration entiÃ¨re sur un `42703`.
  Corollaire utile : un nom de colonne erronÃ© lÃ¨ve ce `42703` dÃ¨s l'ouverture
  du curseur **mÃªme sur une table vide**, donc Ã  chaque `db reset` de la CI.
- La liste des dix tables a Ã©tÃ© vÃ©rifiÃ©e contre le catalogue vivant (tables
  portant un trigger appelant `sync_reward_issuance`), pas dÃ©duite des noms.
- **RÃ©siduel assumÃ©** : le chemin de **lecture** de la caisse
  (`lookupRedeemCode`, neuf familles) reste hors pÃ©rimÃ¨tre â€” seule
  l'Ã©criture est concernÃ©e. Et la bascule elle-mÃªme reste Ã  faire : ces deux
  Ã©tapes la rendent possible et sÃ»re, elles ne la rÃ©alisent pas.

**References** :
- `supabase/migrations/20260807120000_backfill_reward_issuances.sql`
- `supabase/tests/reward_backfill.test.sql` (12 assertions, contrÃ´le nÃ©gatif)
- `src/lib/monitoring.ts` (`recordCounter`), `src/actions/participations.ts`
- `src/lib/admin/ops.ts` (`evaluateRewardsRegistrySlo`)
- `docs/audit-3-backlog.md` (item 4)
- ADR-043 (les 9 sources d'encaissement et leur colonne de vÃ©ritÃ©)

---

## ADR-049 : `revoke all â€¦ from public, anon` ne retire pas `service_role` â€” vÃ©rifier en base, pas dÃ©duire de l'idiome

**Date** : 2026-07-31
**Statut** : acceptÃ©

**Context** :
Une revue de sÃ©curitÃ© sur `settle_hunt_completions` (voir docs/bugs.md,
2026-07-31) a fait relire l'idiome `revoke all on function â€¦ from public,
anon`, prÃ©sent 81 fois dans 26 fichiers de migration, avec l'hypothÃ¨se
implicite qu'il ferme l'appel Ã  toute autre partie que `service_role`.

MesurÃ© en base plutÃ´t que prÃ©sumÃ© : `pg_default_acl` porte un `alter default
privileges â€¦ grant all on functions to postgres, anon, authenticated,
service_role`, posÃ© par Supabase Ã  l'initialisation du projet. Ce GRANT par
dÃ©faut s'applique Ã  **toute nouvelle fonction**, y compris celles qui ne
rÃ©voquent que `public` et `anon`. ConsÃ©quence vÃ©rifiÃ©e par
`select proacl from pg_proc where pronamespace = 'public'::regnamespace` :
217 des 231 fonctions du schÃ©ma `public` portent `service_role=X` dans leur
ACL, alors que seules 4 occurrences de l'idiome rÃ©voquent explicitement
`service_role`.

**Decision** :
Ne pas traiter cet Ã©cart comme une vulnÃ©rabilitÃ© et ne pas lancer de
migration corrective de masse.

- `service_role` contourne dÃ©jÃ  Row Level Security et lit/Ã©crit les tables en
  accÃ¨s direct : qu'il puisse aussi appeler la fonction par son nom ne lui
  ouvre rien qu'il n'ait dÃ©jÃ . **Ce n'est pas une escalade de privilÃ¨ge.**
- C'est en revanche un Ã©cart entre ce que le code affirme (Â« seul
  `service_role` peut appeler ceci Â») et ce que la base fait rÃ©ellement
  (n'importe quel rÃ´le qui obtiendrait `service_role` â€” ou un audit qui lirait
  l'ACL en la croyant close â€” verrait une porte que le commentaire dit
  fermÃ©e).
- Les quatre fonctions touchÃ©es par le chantier du 2026-07-31
  (`settle_hunt_completions`, `hunt_settlement_preview`, et les deux fonctions
  de gestion d'Ã©quipe) portent dÃ©sormais le `revoke` Ã©crit explicitement
  jusqu'Ã  `service_role`.
- Les 77 autres sites ne sont **pas** corrigÃ©s : une migration de masse sur
  81 occurrences, pour un Ã©cart qui ne change aucun comportement observable,
  coÃ»terait plus qu'elle ne prouverait. Un dÃ©veloppeur qui touche l'une de
  ces fonctions et veut vÃ©rifier son ACL rÃ©elle doit interroger `pg_proc`,
  pas relire le DDL.

**Consequences** :
- Toute future revue de sÃ©curitÃ© qui s'appuie sur la prÃ©sence de
  `revoke all â€¦ from public, anon` pour conclure Â« seul `service_role`
  appelle ceci Â» doit vÃ©rifier `pg_proc.proacl`, pas se fier au texte de la
  migration.
- Le vrai pÃ©rimÃ¨tre de protection de ces fonctions reste ce qu'il a toujours
  Ã©tÃ© : les gardes applicatives (org courante, rÃ´le, addon) exÃ©cutÃ©es DANS le
  corps de la fonction, pas le GRANT/REVOKE au niveau du rÃ´le SQL.

**References** :
- `docs/bugs.md` (Low Priority, Â« `revoke all â€¦ from public, anon` ne retire
  pas `service_role` Â»)
- VÃ©rification : `select proacl from pg_proc where pronamespace =
  'public'::regnamespace and proname = '<nom>';`

---

## ADR-050 : L'abonnement actif se lit par l'Ã©vÃ©nement Stripe reÃ§u, pas par la prÃ©sence d'un client Stripe

**Date** : 2026-07-31
**Statut** : acceptÃ©

**Context** :
`ensureStripeCustomer` Ã©crit `stripe_customer_id` dÃ¨s l'OUVERTURE de la page
de paiement â€” avant tout paiement rÃ©el â€” et rien ne le remet Ã  `null` (le
webhook ne traite pas `checkout.session.expired`). Le prÃ©dicat qui dÃ©cidait
d'afficher le bouton Â« S'abonner Â» testait la prÃ©sence de
`stripe_customer_id`. Un propriÃ©taire qui cliquait Â« Retour Â» sur la page
Stripe repartait donc avec un client Stripe, zÃ©ro abonnement, et plus jamais
de bouton pour payer â€” Ã  sa place le portail Stripe, qui ne sait pas crÃ©er un
premier abonnement (voir docs/bugs.md, 2026-07-31).

**Decision** :
Le discriminant d'Â« a un abonnement actif Â» devient `stripe_event_created_at`,
une colonne Ã©crite **uniquement** par `apply_stripe_subscription_event_v2` â€”
donc seulement quand Stripe a rÃ©ellement annoncÃ© un abonnement, jamais Ã  la
simple crÃ©ation d'un client. La dÃ©cision est extraite en fonction pure
(`billingActions`) plutÃ´t que laissÃ©e dans la page, pour qu'un futur Ã©cran
qui a besoin du mÃªme verdict ne rÃ©invente pas le prÃ©dicat.

Deux garde-fous posÃ©s dans le mÃªme geste, pour ne pas rouvrir une fenÃªtre en
en fermant une autre :
- Entre le retour de paiement (`?checkout=success`) et l'arrivÃ©e du webhook
  (quelques secondes), la page affiche explicitement Â« abonnement en cours
  d'activation Â» plutÃ´t que de rÃ©-afficher un bouton de paiement qui ferait
  payer deux fois.
- `canCheckout` et `canManage` ne s'excluent plus : un abonnement rÃ©siliÃ©
  ouvre les deux (consulter ses anciennes factures ET se rÃ©abonner).
  `inactive` (qui couvre `incomplete` et `paused` â€” un objet abonnement vit
  encore chez Stripe) ne rouvre volontairement PAS le checkout : y proposer
  un paiement facturerait deux fois un abonnement rÃ©cupÃ©rable par le portail.
- La garde anti-double-abonnement est descendue **cÃ´tÃ© serveur**, dans
  `createCheckoutSession`, plutÃ´t que dans la seule visibilitÃ© du bouton â€” un
  bouton masquÃ© n'arrÃªte ni un POST rejouÃ© ni une page laissÃ©e ouverte.

**Consequences** :
- Tout futur Ã©cran ou action qui a besoin de savoir Â« ce commerÃ§ant a-t-il un
  abonnement actif Â» doit lire `stripe_event_created_at` via `billingActions`,
  jamais `stripe_customer_id` seul.
- Le dÃ©lai de grÃ¢ce sur impayÃ© (`past_due_since`, ADR-009) doit Ãªtre maintenu
  par **tout** Ã©crivain de statut d'abonnement, y compris les actions admin â€”
  un Ã©crivain qui l'omet rouvre un accÃ¨s complet indÃ©fini sans que rien ne le
  signale (dÃ©faut trouvÃ© et corrigÃ© le mÃªme jour, voir docs/bugs.md).

**References** :
- `docs/bugs.md` (2026-07-31, Â« Avoir un client Stripe Â» n'est pas Â« avoir un
  abonnement Â»)
- ADR-009 (dÃ©lai de grÃ¢ce sur impayÃ©)
- `src/lib/billingActions.ts`, `src/actions/billing.ts` (`createCheckoutSession`)

---

## ADR-051 : L'autoritÃ© de Stripe sur les droits s'arrÃªte avec l'abonnement, pas avec le client

**Date** : 2026-07-31
**Statut** : acceptÃ©

**Context** :
Le trigger `protect_stripe_managed_entitlements` interdit au back-office
d'Ã©crire `plan` et les colonnes `addon_*` d'une organisation Â« gÃ©rÃ©e par
Stripe Â». Sa condition Ã©tait un `exists` sur `organization_entitlements`
filtrÃ© sur `source = 'stripe'`, sans filtre sur `active`. Or une rÃ©siliation
met `active = false` en laissant les lignes : un commerÃ§ant rÃ©siliÃ© restait
donc gÃ©rÃ© par Stripe **Ã  vie**, alors qu'il est exactement la cible
naturelle d'un accÃ¨s offert (partenaire, compensation, presse, reconquÃªte
d'un client parti). L'administrateur obtenait Â« Ã‰chec de la mise Ã  jour Â»
sans issue. Ce point avait Ã©tÃ© laissÃ© ouvert le 2026-07-31 (voir
docs/bugs.md, entrÃ©e Â« Avoir un client Stripe Â») prÃ©cisÃ©ment parce que le
corriger dÃ©place une assertion de sÃ©curitÃ© existante â€” voir plus bas.

**Decision** :
Le prÃ©dicat du trigger devient `source = 'stripe' and active` : Stripe ne
fait autoritÃ© que tant qu'il gouverne rÃ©ellement l'organisation.
`org_effective_entitlements` porte le mÃªme `exists` sans `active` et n'est
**dÃ©libÃ©rÃ©ment pas corrigÃ©e Ã  l'identique** : elle n'a aucun appelant
applicatif, et y ajouter le prÃ©dicat ferait rejaillir les droits legacy d'un
rÃ©siliÃ© â€” un risque sans bÃ©nÃ©fice mesurable aujourd'hui. `comp_access` reste
un droit orthogonal accordÃ© par le back-office ; il n'est jamais couplÃ© Ã 
l'Ã©tat Stripe.

`subscription_entitlements.test.sql` plaÃ§ait ses deux `throws_ok` 42501
**aprÃ¨s** l'Ã©vÃ©nement de rÃ©siliation, lÃ  oÃ¹ la propriÃ©tÃ© qu'ils protÃ¨gent
devient fausse. Ils ont Ã©tÃ© remontÃ©s sur l'abonnement vivant â€” leur
placement d'origine tenait Ã  la commoditÃ© d'Ã©criture, pas Ã  une intention â€”
avec un miroir aprÃ¨s rÃ©siliation qui **relit la valeur** plutÃ´t qu'un simple
`lives_ok` (un `lives_ok` seul resterait vert si un autre trigger annulait
la ligne en silence), et la frontiÃ¨re `past_due` contrÃ´lÃ©e sÃ©parÃ©ment
(`v_access_active` reste vrai, les droits doivent rester bloquÃ©s).

**Consequences** :
- Toute future lecture de Â« ce commerÃ§ant est-il gÃ©rÃ© par Stripe Â» doit
  filtrer sur `active`, sous peine de reproduire ce mÃªme verrou permanent.
- `org_effective_entitlements` reste une trappe Ã  corriger le jour oÃ¹ elle
  gagnera un appelant applicatif â€” pas avant, et pas par cohÃ©rence
  cosmÃ©tique avec le trigger.
- Un dÃ©placement d'assertion de sÃ©curitÃ© (et non un simple ajout) doit Ãªtre
  mesurÃ© : la preuve retenue ici est que le fichier de test au HEAD, jouÃ©
  contre la fonction corrigÃ©e, rend exactement les deux rouges attendus et
  aucun autre.

**References** :
- `docs/bugs.md` (2026-07-31, Â« Avoir un client Stripe Â» n'est pas Â« avoir un
  abonnement Â» â€” clos)
- ADR-049 (`revoke â€¦ from service_role`, mÃªme migration)
- `supabase/migrations/20260818120000_*.sql`
- `supabase/tests/subscription_entitlements.test.sql`

---

## ADR-052 : Un essai que Stripe ne confirme pas finit rÃ©siliÃ© â€” Stripe interrogÃ© avant chaque bascule, jamais l'inverse

**Date** : 2026-07-31
**Statut** : acceptÃ©

**Context** :
Demande du client : qu'un commerÃ§ant en essai soit rÃ©siliÃ© si Stripe ne
remonte jamais de paiement actif. Un essai expirÃ© sans souscription restait
`trialing` indÃ©finiment â€” pas un trou d'accÃ¨s (`hasActiveAccess` coupe dÃ©jÃ 
Ã  `trial_ends_at`), mais un mensonge de statut : la base affichait Â« en
essai Â» sur des comptes finis depuis des mois, et le back-office comptait
ces prospects parmi les essais en cours.

**Decision** :
Nouveau cron quotidien `GET /api/cron/expire-trials`, sur le modÃ¨le des huit
crons existants, avec trois garde-fous ordonnÃ©s par ce qu'ils coÃ»tent s'ils
manquent :
1. On **demande Ã  Stripe** avant chaque bascule (`hasLiveStripeSubscription`).
   Seul un `stripe_customer_id` nul (aucune page de paiement jamais ouverte)
   autorise une rÃ©siliation sans appel.
2. Une **panne Stripe ne rÃ©silie personne** : l'organisation est sautÃ©e et
   journalisÃ©e, rÃ©essayÃ©e le lendemain. PropriÃ©tÃ© la plus importante du
   lot â€” un incident chez Stripe ne doit jamais se traduire par une
   rÃ©siliation de masse.
3. Un abonnement **vivant chez Stripe** alors que le statut local dit
   `trialing` est un webhook perdu, pas un cas normal : remontÃ©, jamais
   rÃ©siliÃ©.

Le dÃ©lai de grÃ¢ce de 3 jours n'est **pas** la protection contre le faux
positif â€” c'est la garde 1 qui l'assure. Le dÃ©lai n'est que la fenÃªtre de
rÃ©essai d'un webhook Stripe : une panne complÃ¨te de notre rÃ©ception se
rattrape Ã  l'intÃ©rieur de la marge. L'Ã©criture est un `UPDATE` conditionnel
sur `subscription_status = 'trialing'` (un webhook hors ordre garde la
main) qui ne touche que le statut â€” Ã©crire `plan` ou `addon_*` lÃ¨verait le
42501 de l'ADR-051.

`comp_access` n'est **pas** exclu du calcul : c'est un droit accordÃ© par le
back-office, orthogonal Ã  l'Ã©tat Stripe ; les coupler ferait dire deux
choses au mÃªme champ.

18 lecteurs de `trialing` ont Ã©tÃ© auditÃ©s, 7 modifiÃ©s. `isTrialExpired`
reÃ§oit un discriminant `ever_subscribed`, optionnel et testÃ© `=== false` :
un appelant qui ne sait pas garde l'ancien comportement, pour ne pas
remplacer le bandeau Â« Votre essai gratuit est terminÃ© Â» par un Â« abonnement
inactif Â» gÃ©nÃ©rique sur exactement la population visÃ©e. Le discriminant se
replie sur `true` en cas de panne â€” on dÃ©grade vers le vague, jamais vers le
faux.

**Consequences** :
- `ops_worker_runs.worker` Ã©tant une clÃ© Ã©trangÃ¨re, tout nouveau cron doit
  Ãªtre inscrit au registre des workers **dans la mÃªme migration** qui
  l'active â€” sans quoi son heartbeat est refusÃ© et `startWorkerRunSafely`
  avale l'Ã©chec en silence (le worker tournerait sans laisser de trace).
- `resolveStripeEntitlements` doit toujours rendre un couple auto-cohÃ©rent
  (droits du plan retenu semÃ©s en sortie) â€” un couple `[]`/`core` sans
  droits avait Ã©tÃ© trouvÃ© et corrigÃ© dans ce mÃªme chantier.
- Les sept crons quotidiens restent inscrits mais **non supervisÃ©s**
  (`enabled = false`), `expire-trials` compris : un worker sans exÃ©cution
  rÃ©ussie serait dÃ©clarÃ© `never_succeeded` dÃ¨s l'application de la
  migration. Lever la supervision est un `UPDATE`, pas une migration, et
  reste Ã  faire une fois le premier passage constatÃ© en production.
- Toute assertion pgTAP qui compte des workers par nombre plutÃ´t que par nom
  masque la nature d'un Ã©cart (ajout vs perte) â€” voir le rÃ©sidu corrigÃ© dans
  `ops_monitoring.test.sql` (docs/bugs.md).

**References** :
- `docs/bugs.md` (2026-07-31, Â« Un essai que Stripe ne confirme pas restait
  `trialing` indÃ©finiment Â»)
- ADR-051 (l'autoritÃ© de Stripe et le mÃªme verrou d'Ã©criture)
- ADR-009 (dÃ©lai de grÃ¢ce sur impayÃ©, `past_due_since`)
- `supabase/migrations/20260819120000_*.sql`
- `src/lib/worker-health.test.ts` (registre dÃ©rivÃ© du dossier de migrations)

---

## ADR-053 : Superviser un worker = un `UPDATE` conditionnel, pas une liste en dur ni une migration

**Date** : 2026-07-31
**Statut** : acceptÃ©

**Context** :
`20260805240000` avait inscrit les six crons quotidiens (`automations`,
`calendar-reminders`, `jackpot-draws`, `purge-data`, `reengage`,
`webhooks`) Ã  `ops_worker_definitions.enabled = false`, avec un motif juste
Ã  l'Ã©poque : Â« faux tant que la route du worker n'Ã©crit pas de heartbeat ;
un worker jamais branchÃ© serait sinon rouge Ã  tort Â». Ce motif est caduc â€”
mesurÃ©, pas supposÃ© : les six routes appellent toutes
`startWorkerRunSafely` / `finishWorkerRunSafely` depuis des semaines. Elles
dÃ©posaient donc des lignes dans `ops_worker_runs` sans que
`ops_workers_health()`, et donc l'objectif de service du back-office, ne
les voie jamais. Une purge RGPD qui Ã©chouerait chaque nuit ne rÃ©veillerait
personne â€” mÃªme classe de dÃ©faut que Â« un back-office qui n'enregistrait
que ses succÃ¨s Â», en miroir : ici la trace existe, elle n'est lue par rien.

**Decision** :
Migration `20260820120000` : un seul `UPDATE`, conditionnel, sans fonction
crÃ©Ã©e ni redÃ©finie â€”

```sql
update public.ops_worker_definitions d
   set enabled = true
 where not d.enabled
   and exists (
     select 1 from public.ops_worker_runs r
      where r.worker = d.worker and r.status = 'succeeded'
   );
```

Une **rÃ¨gle**, pas une liste Ã©numÃ©rant les six noms : tout worker ayant
**dÃ©jÃ  dÃ©posÃ© un succÃ¨s** devient supervisÃ©. La table le dit d'elle-mÃªme
depuis sa crÃ©ation : Â« brancher un worker = un `UPDATE` de `enabled`, pas
une migration Â» â€” l'Ã©tat de supervision dÃ©pend de l'**environnement**
(a-t-il dÃ©jÃ  tournÃ© avec succÃ¨s quelque part), pas du schÃ©ma. Ã‰crire
`enabled = true` en dur pour ces six noms l'aurait imposÃ© aussi Ã  une base
neuve (CI, poste de dÃ©veloppement) oÃ¹ aucun worker n'a jamais tournÃ© :
`ops_workers_health()` les aurait tous dÃ©clarÃ©s `never_succeeded`, objectif
rouge en permanence, partout, pour une raison qui n'est pas un incident. La
condition rÃ¨gle les deux cas d'un mÃªme geste : en production les six
passent supervisÃ©s ; sur une base fraÃ®chement remise Ã  zÃ©ro,
`ops_worker_runs` est vide et rien ne change.

`expire-trials` (ADR-052), dÃ©ployÃ© le jour mÃªme, n'a pas encore tournÃ©
(cron Ã  05:10) et **reste Ã  `false`** â€” on ne supervise pas une promesse,
on supervise un historique. Il se branchera de lui-mÃªme au prochain passage
de la rÃ¨gle, une fois son premier succÃ¨s constatÃ©.

`ops_worker_runs` Ã©tant purgÃ©e Ã  30 jours (cron `purge-data`), Â« a dÃ©jÃ 
rÃ©ussi Â» signifie en pratique Â« a rÃ©ussi dans le mois Â» â€” un worker Ã©teint
depuis plus longtemps ne serait pas rallumÃ© par erreur en rejouant cette
migration.

**Deux erreurs de mÃ©thode dans la vÃ©rification, consignÃ©es parce qu'elles
valent l'enseignement** :
1. Le premier contrÃ´le nÃ©gatif ne prouvait rien : l'insertion du heartbeat
   de test portait `2>/dev/null` â€” sur la commande dont l'Ã©chec Ã©tait
   prÃ©cisÃ©ment l'information cherchÃ©e. Refait sans redirection, six sondes
   numÃ©rotÃ©es, concluant (`INSERT 0 1`, `UPDATE 1`, supervisÃ©s devenant
   `jobs`, `purge-data`, `sync-contests`). L'Ã©chec du premier tour reste
   inexpliquÃ© â€” l'information a Ã©tÃ© dÃ©truite avec la redirection, ce qui
   est Ã©crit tel quel plutÃ´t que par une cause inventÃ©e.
2. Une assertion pgTAP ajoutÃ©e pour Â« Ã©tablir la prÃ©misse Â» (Â« aucun succÃ¨s
   n'est enregistrÃ© Â») est tombÃ©e et avait tort : le fichier de test sÃ¨me
   lui-mÃªme des exÃ©cutions plus haut pour Ã©prouver la sonde de santÃ©. Elle
   mesurait l'Ã©tat aprÃ¨s ses propres insertions. RetirÃ©e plutÃ´t que
   rafistolÃ©e.

**Rationale** :
Une liste en dur aurait Ã©tÃ© plus simple Ã  lire mais aurait figÃ© la
supervision au jour de la migration â€” tout futur worker serait restÃ©
`enabled = false` jusqu'Ã  une migration dÃ©diÃ©e, exactement le dÃ©faut que ce
chantier corrige. La rÃ¨gle conditionnelle rend la supervision
**auto-entretenue** : elle s'applique Ã  `expire-trials` sans qu'il ait
fallu l'anticiper, et Ã  tout worker Ã  venir de la mÃªme faÃ§on.

**Consequences** :
- Un worker nouvellement inscrit au registre n'est **jamais** supervisÃ©
  tant qu'il n'a pas dÃ©posÃ© un succÃ¨s â€” un dÃ©ploiement le jour mÃªme ne
  suffit pas, c'est voulu.
- Rejouer cette migration (ou une rÃ¨gle Ã©quivalente) sur une base ayant
  accumulÃ© des succÃ¨s rallumera tout worker restÃ© Ã  `false` par erreur ;
  c'est un filet, pas seulement un correctif ponctuel.
- Sur une base neuve (CI, poste de dÃ©veloppement), le comportement est
  inchangÃ© â€” aucun worker n'est rallumÃ©, l'objectif de service ne devient
  pas rouge par construction.

**References** :
- [Bugs â€” supervision des workers](./bugs.md)
- Migration `supabase/migrations/20260820120000_supervise_workers_with_proven_heartbeat.sql`
- ADR-052 (`expire-trials`)

---

## ADR-054 : Quand une garde mÃ©canique refuse un nouveau cas, c'est parfois le cas qui n'y appartient pas

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
En corrigeant la permutation de libellÃ©s d'options d'Ã©vÃ©nement live (voir
`docs/bugs.md`, Â« Deux invitations vivantesâ€¦ et deux libellÃ©s permutÃ©s Â»,
PR #78), la nouvelle garde a d'abord Ã©tÃ© inscrite dans
`src/lib/destructive-confirm-coverage.test.ts` â€” le registre qui asserte
que les quatre confirmations de suppression du projet (calendrier,
Ã©vÃ©nement, chasse, campagne) portent toutes le mÃªme marqueur textuel. Trois
de ses assertions sont tombÃ©es, et elles avaient raison : ce registre est
bÃ¢ti pour une famille prÃ©cise â€” quatre gestes de mÃªme espÃ¨ce, quatre
SUPPRESSIONS, un seul champ de formulaire libre (`name=""`) â€” et il
vÃ©rifie prÃ©cisÃ©ment que leurs marqueurs **convergent**. La confirmation de
permutation ne dÃ©truit rien ; son marqueur doit au contraire **diffÃ©rer**
de celui des suppressions, pour ne jamais apparaÃ®tre sous le mauvais texte
dans un Ã©cran qui porte les deux refus cÃ´te Ã  cÃ´te (un piÃ¨ge frÃ´lÃ© pendant
ce mÃªme chantier : une premiÃ¨re rÃ©daction rÃ©utilisait Â« Cochez la case de
confirmationâ€¦ Â», propre Ã  la suppression).

**Decision** :
La garde de permutation reste un fichier sÃ©parÃ©
(`src/lib/answer-meaning-guard.test.ts`), avec son motif de sÃ©paration
Ã©crit en tÃªte, plutÃ´t que d'Ãªtre forcÃ©e dans le registre des quatre. Deux
options avaient Ã©tÃ© pesÃ©es et Ã©cartÃ©es : affaiblir les invariants du
registre existant (perdre la garantie de convergence pour les quatre
suppressions), ou adopter ici un design moins bon â€” boolÃ©en typÃ© cÃ´tÃ©
serveur au lieu d'un `name=""` â€” pour ressembler au registre. Aucune des
deux ne valait la simplicitÃ© d'un fichier de plus.

La distinction entre les deux gestes eux-mÃªmes (permutation dangereuse vs.
correction de coquille lÃ©gitime) est tranchÃ©e par une **mesure**, pas une
intention dÃ©clarÃ©e : on compare l'ensemble des libellÃ©s, triÃ©s, avant et
aprÃ¨s Ã©criture. Une permutation laisse cet ensemble identique â€” seul
l'ordre ou l'affectation change ; une coquille corrigÃ©e le modifie. Un
premier geste, plus large, taxait toute modification de libellÃ© et aurait
dÃ©fait la correction de coquille que le chantier prÃ©cÃ©dent avait
dÃ©libÃ©rÃ©ment rendue gratuite ; trois tests existants l'ont signalÃ©
immÃ©diatement.

**Rationale** :
Un registre qui vÃ©rifie qu'un ensemble de gardes se ressemblent perd sa
valeur dÃ¨s qu'on y admet une garde qui doit leur ressembler *sauf sur le
point qu'il teste*. Le signal utile d'un registre de convergence est binaire
â€” appartient Ã  la famille, ou non â€” et forcer l'appartenance coÃ»te plus cher
en confusion future que de nommer une seconde famille.

**Consequences** :
- Toute future confirmation qui ne dÃ©truit rien (rÃ©Ã©crit un sens, un Ã©tat,
  une affectation) devrait suivre le mÃªme rÃ©flexe : vÃ©rifier d'abord si un
  registre existant l'engloberait honnÃªtement, crÃ©er un fichier sÃ©parÃ©
  sinon.
- Une assertion du registre voisin a Ã©tÃ© corrigÃ©e Ã  cette occasion : elle
  exigeait la forme exacte `import { X } from "â€¦"` sur une seule ligne et
  tombait dÃ¨s qu'un second marqueur du mÃªme module faisait passer l'import
  en plusieurs lignes â€” corrigÃ©e pour vÃ©rifier ce qu'elle voulait dire
  (le composant importe ce marqueur depuis ce module), pas sa mise en forme.

**References** :
- [Bugs â€” invitations en vol et permutation de libellÃ©s](./bugs.md)
- `src/lib/answer-meaning-guard.test.ts`
- `src/lib/destructive-confirm-coverage.test.ts`
- PR #78

---

## ADR-055 : Le portefeuille du joueur ne prend aucun paramÃ¨tre â€” la garantie Â« pas de jeton dans l'URL Â» est tenue par le compilateur

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
Le registre universel des rÃ©compenses (ADR antÃ©rieur, migration
`20260805150000`) portait dÃ©jÃ  tout ce qu'il faut pour montrer Ã  un joueur
l'ensemble de ses gains, toutes familles confondues â€” code, libellÃ© gravÃ©,
Ã©chÃ©ance, Ã©tat â€” mais rien ne le lisait cÃ´tÃ© joueur. Un lien de type
`/portefeuille?player=<id>` ou `?token=<jwt>` aurait Ã©tÃ© le dessin le plus
direct, et le plus dangereux : partagÃ©, transfÃ©rÃ©, ou simplement laissÃ© dans
un historique de navigateur, il listerait les codes de retrait d'un autre
joueur.

**Decision** :
`/portefeuille` ne lit aucun paramÃ¨tre d'URL. La page identifie le joueur par
le cookie posÃ© sur l'appareil qui a scannÃ©, et la garantie Â« aucun jeton dans
l'URL Â» n'est pas vÃ©rifiÃ©e par un test qui pourrait un jour manquer un cas â€”
elle est structurelle : `loadPlayerWallet()` et `PortefeuillePage()` ne
prennent aucun argument. Un sabotage qui rouvrirait un paramÃ¨tre (ajouter un
`searchParams` Ã  la signature pour, par exemple, filtrer par organisation)
fait Ã©chouer `tsc`, pas un test qu'on pourrait oublier d'Ã©crire ou de
maintenir.

Le code de retrait n'est journalisÃ© nulle part cÃ´tÃ© serveur : la seule
remontÃ©e d'erreur possible ne porte que le code Postgres, jamais le message,
qui recopierait les paramÃ¨tres de l'appel â€” donc indirectement le hash du
cookie.

**Rationale** :
Une garantie de sÃ©curitÃ© posÃ©e dans le systÃ¨me de types survit aux futures
modifications d'une faÃ§on qu'un test ne garantit pas : le test peut Ãªtre
supprimÃ© ou contournÃ© sans que rien d'autre ne casse, la signature de
fonction ne le peut pas sans casser la compilation de tout appelant.

**Consequences** :
- Le portefeuille est strictement liÃ© Ã  l'appareil : changer de tÃ©lÃ©phone
  perd l'accÃ¨s (aucun mÃ©canisme de rÃ©cupÃ©ration par email n'existe Ã  ce
  stade â€” cohÃ©rent avec l'absence d'identitÃ© joueur email-first dans le
  reste du produit).
- Toute Ã©volution future qui voudrait un lien partageable (ex. Â« envoyer mon
  portefeuille par SMS Â») devra Ãªtre un choix de conception explicite et non
  un ajout de paramÃ¨tre incrÃ©mental.

**References** :
- [Architecture â€” Portefeuille du client](./architecture.md)
- `src/lib/player-wallet.ts`, `src/app/portefeuille/page.tsx`
- Migration `20260822120000_player_wallet.sql`
- PR #80

---

## ADR-056 : Le canal SMS passe par Brevo, expÃ©diteur alphanumÃ©rique, crÃ©dit prÃ©payÃ© non-divergent

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
Le produit ne notifiait un gagnant que par e-mail (Resend). Un client
demandait un canal SMS pour les joueurs qui laissent un numÃ©ro de tÃ©lÃ©phone
plutÃ´t qu'une adresse â€” jusqu'ici, ces gagnants ne recevaient aucune
notification. Deux contraintes rÃ©glementaires franÃ§aises, vÃ©rifiÃ©es sur
sources publiques avant tout choix technique : la charte AF2M impose qu'un
expÃ©diteur alphanumÃ©rique fasse au plus 11 caractÃ¨res, corresponde au nom
commercial rÃ©el du commerÃ§ant et soit dÃ©clarÃ© (pas de provisionnement
instantanÃ©) ; et un expÃ©diteur alphanumÃ©rique ne peut structurellement pas
recevoir de rÃ©ponse â€” un SMS Â« STOP Â» envoyÃ© par un client n'atteint jamais
le commerÃ§ant.

**Decision** :
Prestataire **Brevo** (sociÃ©tÃ© et hÃ©bergement franÃ§ais), crÃ©dits prÃ©payÃ©s
sans abonnement ni expiration, facturÃ©s Ã  l'unitÃ© par le commerÃ§ant. Le STOP
transite par le numÃ©ro court du prestataire et une route webhook dÃ©diÃ©e
(`/api/sms/webhook`) plutÃ´t que par une rÃ©ponse au numÃ©ro du commerÃ§ant, qui
ne pourrait jamais l'atteindre. Le solde de crÃ©dits est **matÃ©rialisÃ©**
(colonne rapide Ã  lire) mais adossÃ© Ã  un **grand livre en ajout seul** (3
triggers appliquent les mouvements), pour que solde et historique ne puissent
pas diverger structurellement plutÃ´t que par discipline applicative. Le coÃ»t
est stockÃ© en **micros** â€” 0,045 â‚¬ ne se reprÃ©sente pas en centimes entiers.
La normalisation E.164 se fait Ã  un seul endroit, imposÃ©e par des colonnes
calculÃ©es : un futur chemin d'Ã©criture qui ignorerait les RPC porterait quand
mÃªme la bonne clÃ© de consentement.

**Rationale** :
`not_enough_credits` arrive chez Brevo en HTTP 400, au mÃªme titre qu'un
numÃ©ro invalide. Classer l'Ã©chec sur le seul statut HTTP aurait traitÃ© un
solde Ã©puisÃ© comme dÃ©finitif : le message aurait Ã©tÃ© remboursÃ© au
commerÃ§ant ET plus jamais renvoyable, alors qu'un solde rechargÃ© le rendrait
Ã  nouveau envoyable. Le code d'erreur est donc lu avant le statut, rÃ¨gle :
Â« dÃ©finitif = rejouer donnerait la mÃªme rÃ©ponse Â».

**Consequences** :
- Le crÃ©dit ne peut pas dÃ©couvrir sous concurrence : prouvÃ© (pas seulement
  visÃ©) par un contrÃ´le oÃ¹ deux envois simultanÃ©s sous un solde de 1 rendent
  un succÃ¨s et un refus avec un seul mouvement au grand livre, le second
  appel ayant rÃ©ellement attendu le verrou (chronomÃ©trÃ© Ã  2 174 ms).
  `0612345678` et `+33612345678` comptaient pour deux consentements avant la
  normalisation â€” corrigÃ©, un STOP vaut dÃ©sormais pour les deux graphies.
- Le multi-segment reste un point ouvert : le grand livre dÃ©bite 1 crÃ©dit par
  envoi quel que soit le nombre de segments SMS rÃ©els facturÃ©s par Brevo.
- La mention STOP du texte de consentement ne peut porter le numÃ©ro court
  rÃ©el tant que le compte Brevo n'est pas ouvert.
- L'achat de crÃ©dits reste manuel, via le back-office plateforme ; aucun
  parcours Stripe de recharge n'existe encore.

**References** :
- [Architecture â€” Canal SMS](./architecture.md)
- `src/lib/brevo.ts`, `src/lib/sms-dispatch.ts`, `src/lib/sms-prize.ts`
- Migrations `20260823120000_sms_foundation.sql`,
  `20260824120000_sms_sender_identity.sql`,
  `20260825120000_sms_credit_ledger.sql`,
  `20260826120000_sms_e164_and_send_gate.sql`
- PR #80

---

## ADR-057 : Le rapport hebdomadaire n'envoie que si l'une des deux derniÃ¨res semaines porte de l'activitÃ©

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
Le client a demandÃ© un e-mail hebdomadaire au commerÃ§ant, comparant la
semaine Ã©coulÃ©e Ã  la prÃ©cÃ©dente (joueurs, lots remis, panier attribuable,
podium). La vue existante `org_prize_funnel` ne convenait pas : elle ne voit
que la roue, ne compte aucun joueur et ne compare rien Ã  une pÃ©riode
antÃ©rieure. Un envoi inconditionnel chaque lundi poserait un problÃ¨me
d'engagement Ã©vident pour tout commerÃ§ant en pause saisonniÃ¨re ou peu
actif : un Â« 0 joueur cette semaine, 0 la prÃ©cÃ©dente Â» rÃ©pÃ©tÃ© tue
l'ouverture du mail Ã  moyen terme.

**Decision** :
`org_weekly_digest` lit les neuf familles du registre universel des
rÃ©compenses en un aller-retour et rend les deux fenÃªtres (semaine Ã©coulÃ©e,
semaine prÃ©cÃ©dente). L'envoi est **auto-limitant** : le cron n'envoie que si
la semaine Ã©coulÃ©e OU la semaine prÃ©cÃ©dente porte de l'activitÃ©. Une chute Ã 
zÃ©ro aprÃ¨s une semaine active reste donc envoyÃ©e â€” c'est l'alerte la plus
utile de l'annÃ©e pour un commerÃ§ant (QR dÃ©collÃ©, campagne arrÃªtÃ©e par
erreur) â€” mais deux semaines vides consÃ©cutives ne peuvent jamais produire
deux rapports vides d'affilÃ©e : la seconde semaine vide est couverte par la
condition Â« OU la prÃ©cÃ©dente Â», donc son propre successeur retombe en
silence dÃ¨s la troisiÃ¨me semaine vide.

Les montants ne partent qu'aux rÃ´les owner et editor. La RPC est appelÃ©e par
le cron en `service_role`, donc sans rÃ´le applicatif que la base pourrait
vÃ©rifier : la garde est entiÃ¨rement applicative, doublÃ©e d'un gabarit qui
n'Ã©met pas la ligne de montant du tout plutÃ´t que d'y Ã©crire un zÃ©ro qui se
lirait comme une mesure rÃ©elle.

**Rationale** :
Un seuil binaire (Â« la semaine Ã©coulÃ©e a de l'activitÃ© Â») aurait supprimÃ© le
signal le plus important â€” la rupture â€” puisqu'une semaine qui tombe Ã  zÃ©ro
aprÃ¨s en avoir eu Ã©chouerait ce test. Regarder les deux fenÃªtres avant de
dÃ©cider d'envoyer prÃ©serve ce signal sans revenir Ã  l'envoi inconditionnel.

**Consequences** :
- Un commerÃ§ant qui n'a jamais eu d'activitÃ© ne reÃ§oit jamais ce rapport â€”
  cohÃ©rent avec l'objectif (rien Ã  comparer), mais signifie que l'e-mail ne
  sert pas d'incitation Ã  dÃ©marrer.
- Le worker `weekly-digest` est inscrit au registre de supervision mais reste
  hors de l'objectif de service tant qu'il n'a pas dÃ©posÃ© un premier succÃ¨s
  (mÃªme rÃ¨gle qu'ADR-053).

**References** :
- [Architecture â€” Rapport hebdomadaire](./architecture.md)
- `src/lib/weekly-digest.ts`, `src/app/api/cron/weekly-digest/route.ts`
- Migration `20260821120000_weekly_digest.sql`
- PR #80

---

## ADR-058 : Les segments SMS se calculent cÃ´tÃ© serveur avant l'envoi, jamais en croyant Brevo aprÃ¨s

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
ADR-056 avait laissÃ© ouvert l'Ã©cart entre facturation Brevo (au segment SMS
rÃ©el â€” 160 caractÃ¨res en GSM-7, 70 dÃ¨s qu'un seul caractÃ¨re hors alphabet
bascule le message entier en UCS-2) et dÃ©bit interne (une unitÃ© par message,
quel que soit son contenu). Le compteur `sms.multipart`, dÃ©jÃ  en place,
mesurait l'Ã©cart sans jamais le facturer : Brevo annonce le nombre rÃ©el de
segments dans sa rÃ©ponse d'envoi, *aprÃ¨s* l'envoi.

**Decision** :
`smsSegments()` (`src/lib/sms-segments.ts`) recalcule le nombre de segments
cÃ´tÃ© serveur, sur le contenu final du message, **avant** toute rÃ©servation de
crÃ©dit â€” remplissage segment par segment sur la table d'extension GSM-7,
jamais une division qui sous-compte les messages Ã  cheval sur une frontiÃ¨re
de segment. `claim_sms_delivery` reÃ§oit ce compte en paramÃ¨tre
supplÃ©mentaire (`p_segments`, migration `20260827120000`) et dÃ©bite ce
nombre d'unitÃ©s dans la mÃªme transaction que la rÃ©servation, Ã  l'insertion
comme Ã  la reprise. Un message de plus de 6 segments est refusÃ© avant tout
dÃ©bit (`sms.too_long`). Le compte rÃ©el renvoyÃ© par Brevo aprÃ¨s l'envoi est
comparÃ© au compte prÃ©-calculÃ© ; un Ã©cart incrÃ©mente `sms.segment_mismatch`
au lieu d'ajuster silencieusement le grand livre.

**Rationale** :
La question n'Ã©tait pas Â« comment compter les segments Â» â€” l'algorithme est
un fait GSM connu â€” mais **quand** compter. Attendre la rÃ©ponse de Brevo
pour dÃ©biter aurait exigÃ© une seconde transaction aprÃ¨s un appel rÃ©seau
externe, avec toute la fenÃªtre de panne que cela ouvre entre rÃ©servation et
dÃ©bit rÃ©el. Calculer avant l'envoi garde le dÃ©bit dans la mÃªme transaction
atomique que la rÃ©servation du job, au prix d'une hypothÃ¨se : que le calcul
local reproduit fidÃ¨lement la segmentation GSM/UCS-2 de Brevo. Cette
hypothÃ¨se n'est pas affirmÃ©e Ã  l'aveugle â€” `sms.segment_mismatch` la rend
mesurable en production, plutÃ´t que de la laisser prÃ©sumÃ©e indÃ©finiment.

**Consequences** :
- Un solde de 2 crÃ©dits refuse dÃ©sormais un message de 3 segments â€” avant ce
  chantier, il partait pour le prix d'un seul.
- Un accent dans un nom de lot ou une enseigne peut faire basculer un message
  entier en UCS-2 (70 caractÃ¨res/segment au lieu de 160) sans avertissement
  visible pour le commerÃ§ant ; `sms.claim_refused` ne distingue toujours pas
  ce cas d'un crÃ©dit Ã©puisÃ© ou d'un STOP (dette assumÃ©e, `docs/bugs.md`).
- `sms.segment_mismatch` n'a encore aucun lecteur dÃ©diÃ© (pas d'alerte, pas de
  tableau de bord) â€” il existe pour permettre la mesure, pas pour la
  produire automatiquement.

**References** :
- [Architecture â€” Canal SMS](./architecture.md)
- `src/lib/sms-segments.ts`, `src/lib/sms-dispatch.ts`
- Migration `20260827120000_sms_segments.sql`
- ADR-056
- Branche `feat/canal-sms-utilisable`

## ADR-059 : L'idempotence d'un grand livre se pose dans la base, jamais chez l'appelant

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
La revue sÃ©curitÃ© de `feat/canal-sms-utilisable` a confirmÃ© deux dÃ©fauts qui
partagent une mÃªme racine, distincte de leurs symptÃ´mes. **Ã‰LEVÃ‰ 1** :
`request_sms_sender` remettait Ã  `pending` toute ligne existante non
`declared` et non retirÃ©e â€” le commentaire de la migration ne dÃ©crivait que
le cas `retired`, la branche `else` couvrait aussi `rejected` **et**
`suspended`. La RPC n'avait alors aucun appelant applicatif : la faute
dormait, invisible et sans consÃ©quence. Ce chantier lui a ouvert un
appelant (`requestSmsSender`, l'Ã©cran commerÃ§ant) â€” sans rien changer Ã  la
RPC elle-mÃªme, la rendant du mÃªme coup atteignable. **Ã‰LEVÃ‰ 2** :
`creditSmsPack` (webhook Stripe) prenait l'Ã©vÃ©nement dans `stripe_events`
avant de crÃ©diter, puis relÃ¢chait la prise si `credit_sms_balance` rendait
une erreur, sous l'hypothÃ¨se Â« erreur = rien n'a Ã©tÃ© Ã©crit Â». Cette
hypothÃ¨se est fausse au point d'appel : `supabase-js` rend `{ error }` de
la mÃªme faÃ§on pour un rollback complet et pour une coupure survenue
**aprÃ¨s** le commit (pooler coupÃ©, redÃ©ploiement pendant la rÃ©ponse) â€” le
code appelant ne peut pas distinguer les deux cas depuis sa seule rÃ©ponse
rÃ©seau.

**Decision** :
1. **Ouvrir un appelant sur une RPC `security definer` dormante revue son
   corps entier avant de le faire**, pas seulement la signature et le nom.
   Une branche jamais atteinte n'a jamais Ã©tÃ© mise Ã  l'Ã©preuve d'un vrai
   appelant ; son commentaire peut dÃ©crire un sous-ensemble de ce qu'elle
   fait sans que rien ne le contredise. Publier un chemin vers une fonction,
   c'est publier tout ce qu'elle fait, y compris ce que personne n'a relu
   depuis qu'elle a Ã©tÃ© Ã©crite.
2. **L'idempotence d'un mouvement de grand livre se pose dans la base, pas
   dans l'appelant.** Un index unique partiel porte la garante
   (`sms_credit_entries_one_purchase_per_reference`, sur
   `(organization_id, reference)` oÃ¹ `reason = 'purchase'`) ; la RPC
   `credit_sms_balance` rend l'entrÃ©e **dÃ©jÃ  existante** sur conflit au lieu
   de lever, avec sa signature inchangÃ©e â€” l'appelant reÃ§oit toujours un
   `entryId` valide, qu'il ait crÃ©Ã© une ligne ou retrouvÃ© la prÃ©cÃ©dente. Ce
   n'est pas un raffinement de gestion d'erreur : c'est le dÃ©placement de la
   garantie du seul endroit qui sait rÃ©ellement ce qui a Ã©tÃ© commitÃ©.

**Rationale** :
Un `try/catch` autour d'un appel RPC ne peut raisonner que sur ce que le
rÃ©seau lui a rendu, jamais sur ce que la transaction a rÃ©ellement fait â€”
Â« erreur donc rien n'a Ã©tÃ© Ã©crit Â» est un raisonnement cÃ´tÃ© client sur un
fait cÃ´tÃ© serveur, et il est faux dÃ¨s qu'une coupure survient aprÃ¨s le
commit. Un index unique dÃ©place la question Â« ce paiement a-t-il dÃ©jÃ  Ã©tÃ©
crÃ©ditÃ© ? Â» Ã  l'endroit qui peut y rÃ©pondre avec certitude : la
transaction suivante, dans la mÃªme base, protÃ©gÃ©e par la mÃªme contrainte.

**Consequences** :
- Toute future RPC de grand livre (crÃ©dit, dÃ©bit, remboursement) doit
  porter sa propre garde d'unicitÃ© en base plutÃ´t que de faire confiance Ã 
  la gestion d'erreur de l'appelant â€” le motif est rÃ©utilisable au-delÃ  du
  canal SMS.
- Cette mÃªme revue a trouvÃ© un rÃ©sidu que ce dÃ©placement de garantie n'a
  pas anticipÃ© : `creditMerchantSmsBalance` (back-office) ne compare pas
  l'`entryId` rendu Ã  une valeur attendue et affiche Â« crÃ©dit effectuÃ© Â»
  mÃªme quand la RPC a en rÃ©alitÃ© rendu l'entrÃ©e d'un doublon dÃ©jÃ  Ã©crit â€”
  consignÃ© ouvert dans `docs/bugs.md`. Rendre une valeur de repli sur
  conflit rÃ©sout l'idempotence du grand livre, pas la fidÃ©litÃ© de tous ses
  lecteurs.
- Toute RPC dormante restant dans le catalogue doit Ãªtre relue en entier,
  et pas seulement sa signature, avant qu'un premier appelant applicatif
  ne lui soit ouvert.

**References** :
- [Bugs â€” Canal SMS](./bugs.md)
- Migration `20260828120000_sms_findings.sql`,
  `supabase/tests/sms_findings.test.sql`
- ADR-058 (segments SMS, mÃªme chantier)
- Branche `feat/canal-sms-utilisable`

## ADR-060 : La fenÃªtre horaire lÃ©gale est un module pur, appliquÃ©e sans distinction de nature du message â€” la distinction reste Ã  trancher

**Date** : 2026-08-01
**Statut** : acceptÃ©, avec une question produit ouverte

**Context** :
Rien ne bornait l'heure d'envoi d'un SMS sur ce canal : un lot gagnÃ© Ã 
23h30 dÃ©clenchait un message Ã  23h35. La prospection commerciale par SMS
est interdite en France entre 22h et 8h, le dimanche et les jours fÃ©riÃ©s
(charte AF2M, doctrine CNIL) â€” la mÃªme source qui impose dÃ©jÃ  Ã  ce canal
l'expÃ©diteur alphanumÃ©rique et la mention STOP. Une contre-revue du
troisiÃ¨me tour a aussi Ã©tabli, par la mesure et non l'hypothÃ¨se, que la
cadence rÃ©elle de la file de jobs est **quotidienne** (`vercel.json`,
`20 4 * * *`), pas les 5 minutes que sept commentaires affirmaient : un
code de retrait peut donc lÃ©gitimement arriver jusqu'Ã  24h aprÃ¨s le gain,
fenÃªtre horaire ou non.

**Decision** :
1. La rÃ¨gle vit dans un module pur et sÃ©parÃ© du worker
   (`src/lib/sms-window.ts`) : une fonction d'un instant vers un verdict,
   Ã©prouvable sans base, sans job, sans prestataire â€” ce dÃ©pÃ´t n'a pas
   d'environnement de rendu et a payÃ© plusieurs fois le coÃ»t d'une logique
   enfouie dans un composant ou un worker que personne ne peut vÃ©rifier
   isolÃ©ment.
2. Le fuseau est une **donnÃ©e nommÃ©e** (`Europe/Paris`), jamais l'heure du
   processus : Vercel exÃ©cute en UTC, oÃ¹ la fenÃªtre s'ouvrirait Ã  6h ou 7h
   selon la saison â€” en plein cÅ“ur des heures qu'elle existe pour
   interdire.
3. Dans le worker, la garde tombe **avant** `claim_sms_delivery`, donc
   avant tout dÃ©bit de crÃ©dit, et rend `retry`, jamais `failed` : un
   message hors fenÃªtre n'est pas fautif, il est prÃ©maturÃ© ; un `failed`
   le perdrait pour toujours.
4. **La fenÃªtre s'applique aujourd'hui sans distinction de nature du
   message** : un code de retrait de gain (que le joueur attend, sans
   contenu promotionnel) est retardÃ© exactement comme un SMS publicitaire.
   Ce point n'est **pas tranchÃ© ici** â€” reclasser ce message en
   transactionnel est dÃ©fendable et l'affranchirait de la fenÃªtre, mais
   c'est une dÃ©cision du client, consignÃ©e ouverte dans `docs/bugs.md`.

**Rationale** :
La contrainte lÃ©gale porte sur la *prospection*, pas sur toute
communication SMS â€” mais le canal ne portait, Ã  sa livraison, qu'un seul
type de message (le code de retrait). Appliquer la fenÃªtre uniformÃ©ment
est le choix le plus sÃ»r en l'absence d'une classification explicite des
messages ; il coÃ»te de la latence sur un cas qui n'en a peut-Ãªtre pas
besoin, jamais l'inverse.

**Consequences** :
- Un gain remportÃ© en soirÃ©e peut ne recevoir son SMS que le lendemain
  matin â€” combinÃ© Ã  la cadence quotidienne de la file, le budget de
  reprise (`max_attempts = 5`) peut s'Ã©puiser avant la rÃ©ouverture de la
  fenÃªtre ; consignÃ© ouvert dans `docs/bugs.md` avec sa sortie (activer
  `lastchance-jobs-worker`, pg_cron Ã  5 minutes, par la pose de deux
  secrets Vault).
- Les deux jours fÃ©riÃ©s propres Ã  l'Alsace-Moselle ne sont pas couverts :
  ils dÃ©pendent du dÃ©partement du destinataire, que le produit ne
  connaÃ®t pas â€” rÃ©sidu nommÃ© et testÃ©, pas une couverture supposÃ©e.
- Toute future famille de SMS (rappel, relance) doit explicitement
  choisir de passer ou non par `smsMarketingWindow`, plutÃ´t que d'hÃ©riter
  silencieusement du comportement du seul appelant existant.

**References** :
- [Bugs â€” Canal SMS](./bugs.md)
- `src/lib/sms-window.ts`, `src/lib/sms-window.test.ts`
- `src/app/api/cron/jobs/route.ts` (en-tÃªte, cadence rÃ©elle)
- ADR-059 (idempotence du grand livre, mÃªme chantier)
- Branche `feat/canal-sms-utilisable`

---

## ADR-062 : L'application pose elle-mÃªme ses secrets d'exploitation au Vault â€” parce que les noms des cases Ã©crites viennent du registre, jamais de l'appelant

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
`docs/production-readiness.md` Â§5bis demandait au propriÃ©taire de poser Ã 
la main deux secrets Vault Supabase (`jobs_worker_url`,
`sync_contests_secret`) pour faire passer `lastchance-jobs-worker` d'un
passage quotidien (`vercel.json`, `20 4 * * *`) Ã  un passage toutes les
5 minutes (`pg_cron`) â€” la sortie dÃ©jÃ  identifiÃ©e pour que la file de jobs
SMS ne fasse plus reporter un mÃªme envoi jour aprÃ¨s jour (ADR-061). Poser
`jobs_worker_url` exige de construire une URL qui embarque `CRON_SECRET` en
en-tÃªte ou en requÃªte : un secret d'exploitation qui vit dÃ©jÃ  dans
l'environnement de l'application, recopiÃ© Ã  la main par un humain dans une
console d'administration.

**Decision** :
Une action serveur (`enableWorkerFastCadence`) lit `CRON_SECRET` et l'URL
de l'application dans son **propre** environnement â€” jamais depuis un
paramÃ¨tre client â€” et les dÃ©pose au Vault via une RPC dÃ©diÃ©e. Ce qui rend
le geste sÃ»r n'est pas qu'il soit automatique, c'est que **les noms des
cases Ã©crites viennent du registre `ops_worker_definitions`, jamais de
l'appelant** : un appelant compromis ne peut faire Ã©crire que ce que le
registre lui dÃ©signe, pas une case arbitraire du Vault. Trois gardes
supplÃ©mentaires, dans l'ordre : (1) permission dÃ©diÃ©e `monitoring.cadence`,
super_admin seul, `requireFresh`, refus tracÃ© ; (2) l'URL est refusÃ©e si
elle n'est pas en `https://` ou si elle dÃ©signe un hÃ´te local ou privÃ©
(loopback `127.0.0.0/8`, `::1`, `0.0.0.0`, plages `10/172.16-31/192.168`,
lien-local, `.local`) ; (3) `CRON_SECRET` absente vaut refus explicite,
jamais un Vault posÃ© avec une valeur vide.

**Rationale** :
La garde (2) est la moins Ã©vidente et la plus importante. Sans elle, poser
une URL non-production dans le Vault ferait interroger Postgres, toutes
les 5 minutes, une adresse qui n'est pas l'application rÃ©elle â€” avec le
secret d'exploitation dans l'en-tÃªte de chaque appel â€” pendant que l'Ã©cran
de supervision afficherait Â« worker configurÃ© Â», sans aucun moyen de le
dÃ©tecter autrement qu'en observant l'absence d'effet.

**Consequences** :
- Le secret ne sort jamais en clair d'un canal observable : aucun
  paramÃ¨tre de formulaire ne le porte, aucune sortie (succÃ¨s, erreur,
  journal) ne le recopie â€” seul le SQLSTATE Postgres est journalisÃ© sur
  Ã©chec.
- Le geste reste, aprÃ¨s ce chantier, **possible sans identifiants** â€” il
  ne se substitue pas Ã  la dÃ©cision du propriÃ©taire. Le bouton doit encore
  Ãªtre cliquÃ© en production ; tant qu'il ne l'a pas Ã©tÃ©, la file continue
  de tourner une fois par jour (`docs/production-readiness.md` Â§5bis).

**Addendum (2026-08-01, mÃªme branche, migration `20260831120000_worker_vault_write.sql`,
commits `f127f8f`/`b362993`/`1d30c6b`)** â€” la RPC `set_worker_vault_secrets` est
livrÃ©e, et sa revue a produit un enseignement qui dÃ©passe ce chantier :

- **Un refus prÃ©visible qui LÃˆVE fuit son paramÃ¨tre vers un public plus
  large que celui qui dÃ©tient dÃ©jÃ  le secret.** L'appelant applicatif passe
  le jeton `CRON_SECRET` en paramÃ¨tre de l'appel PostgREST. Une exception
  Postgres journalise l'instruction fautive **avec ses paramÃ¨tres**
  (`log_min_error_statement = error`, mesurÃ©) ; ce journal est lisible par
  tout membre du projet Supabase, y compris sans accÃ¨s direct Ã  la base â€”
  donc par un public plus large que celui qui peut dÃ©jÃ  lire
  `vault.decrypted_secrets`. RÃ¨gle retenue : un refus **prÃ©visible** (worker
  inconnu, prÃ©requis Vault absents, valeur vide, panne du Vault) doit Ãªtre
  **rendu** comme une valeur de retour, jamais levÃ©. La seule exception
  assumÃ©e est le refus d'**autorisation** (appelant â‰  `service_role`) : lui
  seul continue de lever, parce qu'il est un Ã©vÃ©nement de sÃ©curitÃ© qui doit
  laisser une trace, et que ce chemin est inatteignable depuis l'appelant
  applicatif lÃ©gitime â€” l'atteindre suppose dÃ©jÃ  un appelant illÃ©gitime.
- **Effet de bord assumÃ©, sous condition Ã©crite et non conclue** :
  `ops_worker_definitions` fait porter Ã  `jobs` et Ã  `sync-contests` le
  mÃªme `vault_shared_secret`. Armer l'un rÃ©Ã©crit donc l'entrÃ©e Vault de
  l'autre. C'est bÃ©nin **tant qu'un seul `CRON_SECRET` existe** pour
  authentifier les deux routes de cron ; le jour oÃ¹ ils devraient porter
  des valeurs diffÃ©rentes, le partage devient une Ã©criture silencieuse
  par-dessus le voisin. La RPC rend `also_affects_workers` (calculÃ© depuis
  le registre) pour que l'appelant le sache avant d'agir, et le panneau
  l'affiche avant le clic.
- Revue sÃ©curitÃ© (lecture seule, HEAD `1d30c6b`) : **GO, 0 CRITIQUE,
  0 Ã‰LEVÃ‰, 1 MOYEN, 4 INFO**. Le MOYEN restant est distinct de la RPC :
  rien n'empÃªche d'armer la cadence depuis un dÃ©ploiement non-production
  (`worker-cadence.ts` valide `https://` + hÃ´te public, pas Â« c'est bien
  nous Â») â€” une URL de preview ferait Ã©mettre le `CRON_SECRET` de
  production vers un hÃ´te tiers, 288Ã—/jour, pendant que l'Ã©cran affiche
  Â« configurÃ© Â». Correctif proposÃ© : refuser si `VERCEL_ENV â‰  production`,
  non livrÃ© dans ce chantier.

**Second addendum (2026-08-01, mÃªme branche, commits `b97f344`/`4bfa714`/
`8c87128`)** â€” le MOYEN de la revue est fermÃ©, une justification fausse est
corrigÃ©e, et un avertissement voisin sous-dÃ©clarait ce qu'il touchait :

- **La garde d'environnement, `checkCadenceEnvironment`** (module pur,
  `src/lib/admin/worker-cadence.ts`), deux angles : `VERCEL_ENV` doit valoir
  `production` (absente hors Vercel = refus, un poste local n'arme rien) ;
  et quand `VERCEL_PROJECT_PRODUCTION_URL` est exposÃ©e, son hÃ´te est comparÃ©
  Ã  celui de `NEXT_PUBLIC_APP_URL` â€” le seul angle qui attrape une `APP_URL`
  **pÃ©rimÃ©e sur une vraie production**, cas que `VERCEL_ENV` seule laisse
  passer puisqu'elle dit bien `production`. PlacÃ©e **aprÃ¨s** la garde d'URL
  et non avant : les deux refuseraient un `http://localhost:3000`, mais la
  garde d'URL le refuse en **nommant l'adresse locale**, lÃ  oÃ¹ la garde
  d'environnement dirait seulement Â« pas le domaine de production Â» â€” sans
  cet ordre, les 4 tests d'URL existants seraient devenus vacants (message
  gÃ©nÃ©rique remplaÃ§ant un message qui pointe la vraie cause). L'ordre est
  Ã©pinglÃ© par une assertion. Ce que la garde ne couvre pas est Ã©crit et non
  tu : `VERCEL_PROJECT_PRODUCTION_URL` n'a pas Ã©tÃ© vÃ©rifiÃ©e Ã  l'exÃ©cution
  sur ce projet ; en son absence, la comparaison d'hÃ´te n'a pas lieu et une
  production Ã  l'`APP_URL` pÃ©rimÃ©e serait armÃ©e quand mÃªme â€” bloquer
  rendrait la cadence inarmable, donc on autorise, mais `hostChecked` part
  Ã  l'audit sous `production_host_verified` pour que ce cas se relise
  aprÃ¨s coup.
- **La justification de la garde Â« refus prÃ©visible rendu, jamais levÃ© Â»
  Ã©tait fausse â€” le design reste juste pour une autre raison.** Le
  chantier avait justifiÃ© ce choix par une fuite de `CRON_SECRET` dans les
  journaux d'erreur Postgres (`log_min_error_statement = error`, mesurÃ©).
  Faux : ce GUC gouverne le **texte** de l'instruction fautive, jamais ses
  **valeurs liÃ©es** â€” celles-ci relÃ¨vent de
  `log_parameter_max_length_on_error`, qui vaut **0** (mesurÃ© en base) :
  aucun paramÃ¨tre liÃ© n'est journalisÃ©, PostgREST lie le corps en `$1`, et
  une levÃ©e n'aurait jamais montrÃ© le jeton. La fuite dÃ©crite n'a jamais
  existÃ© sur cette configuration. **Le design est conservÃ© quand mÃªme**,
  pour une raison diffÃ©rente de celle qui l'a motivÃ© : un refus
  **prÃ©visible** (worker inconnu, prÃ©requis Vault absents, valeur vide) n'a
  rien Ã  faire dans un journal d'**erreur**, et cette propriÃ©tÃ© ne dÃ©pend
  d'**aucun** rÃ©glage de journalisation â€” elle reste vraie le jour oÃ¹
  quelqu'un relÃ¨ve ces GUC pour diagnostiquer autre chose. Les quatre
  endroits qui portaient l'ancienne justification (migration, son
  `comment on function`, son test pgTAP, l'action et son test) sont
  corrigÃ©s dans le mÃªme sens. Commentaires et tests seuls, aucune logique
  touchÃ©e.
- **`listWorkerCadenceDefinitions` sous-dÃ©clarait le voisin rÃ©ellement
  touchÃ©.** Le panneau prÃ©vient l'administrateur des AUTRES workers dont
  une entrÃ©e Vault sera rÃ©Ã©crite par son clic ; il les calculait sur une
  liste dÃ©jÃ  filtrÃ©e par `vault_url_secret is not null` â€” le filtre des
  lignes AFFICHABLES (celles qui portent un bouton). Or `set_worker_vault_secrets`
  rÃ©Ã©crit sur `vault_url_secret` **ou** `vault_shared_secret` : un worker
  n'ayant que le second n'a pas de bouton mais **est** rÃ©Ã©crit par le clic
  du voisin. Le filtre d'affichage n'a plus sa place dans la requÃªte qui
  nourrit aussi l'avertissement â€” il reste oÃ¹ il est testÃ©, dans le module
  pur.
- ContrÃ´les nÃ©gatifs jouÃ©s et restaurÃ©s : `checkCadenceEnvironment`
  neutralisÃ©e â†’ 14 rouges (9 module + 5 cÃ¢blage de l'action, prouvÃ©s
  sÃ©parÃ©ment) ; filtre `ops.ts` rÃ©introduit â†’ 2 rouges, dont l'assertion
  qui nomme le dÃ©faut (`['sync-contests']` au lieu de
  `['sms-relance','sync-contests']`).

**TroisiÃ¨me addendum (2026-08-02)** â€” la prÃ©misse de tout ce chantier Ã©tait
fausse, mesurÃ©e et non dÃ©duite ; et une phrase de la **Decision** d'origine
ne rÃ©siste pas Ã  la lecture du catalogue de droits vivant.

- **La prÃ©misse.** Le journal du workflow `production-health.yml` sur le
  commit `46c33dc` rend Â« Production saine (0.1.0) : database, workers,
  security_configuration Â» Ã  17h36 UTC. `checkWorkers()`
  (`src/app/api/health/route.ts`) exige `jobs` **et** `sync-contests`
  `healthy = true`, ce qui suppose Ã  la fois les entrÃ©es Vault posÃ©es et
  un battement rÃ©cent (`tolerance_seconds = 900`, 15 min, pour `jobs`) ;
  le cron Vercel de secours ne passe qu'Ã  04h20 UTC, treize heures avant
  cette sonde. Un battement de treize heures ne satisfait pas une
  tolÃ©rance de quinze minutes : les secrets Vault existaient dÃ©jÃ  en
  production et le pg_cron toutes les 5 minutes tournait dÃ©jÃ , avant mÃªme
  l'ouverture de ce chantier. **ConsÃ©quence** : le bouton livrÃ© n'est pas
  un dÃ©blocage, c'est une **rotation** par-dessus une configuration qui
  fonctionne â€” le risque s'inverse, un mauvais armement ne dÃ©bloque rien
  dans le vide, il **casse une file qui tourne**. Les gardes dÃ©jÃ  posÃ©es
  (garde d'URL, `checkCadenceEnvironment`) en valent donc davantage, pas
  moins ; aucune n'est retirÃ©e par ce constat.
- **Â« Un appelant compromis ne peut faire Ã©crire que ce que le registre
  lui dÃ©signe Â» (Decision, ci-dessus) est faux tel quel.** `service_role`
  â€” l'identitÃ© sous laquelle tourne l'action serveur et sous laquelle la
  RPC `set_worker_vault_secrets` s'exÃ©cute â€” a **dÃ©jÃ ** l'exÃ©cution sur
  `vault.create_secret` et la lecture sur `vault.decrypted_secrets` dans
  Postgres : un `service_role` compromis peut Ã©crire n'importe quelle case
  du Vault directement, sans passer par cette RPC ni par son registre. Ce
  que la phrase visait, et ce qui reste vrai, c'est plus Ã©troit : **la RPC
  borne le chemin exposÃ© par PostgREST** â€” c'est-Ã -dire l'unique chemin
  qu'un appelant HTTP muni du jeton `monitoring.cadence` (et non du
  `service_role` Postgres lui-mÃªme) peut emprunter. La garde protÃ¨ge la
  surface applicative, pas le compte `service_role` sous-jacent, qui reste
  et a toujours Ã©tÃ© un compte Ã  pleins pouvoirs sur la base.

**References** :
- ADR-061 (la sortie que ce geste active)
- `src/lib/admin/worker-cadence.ts`, `src/app/admin/(protected)/monitoring/actions.ts`
- `supabase/migrations/20260831120000_worker_vault_write.sql`
- `docs/production-readiness.md` Â§5bis
- Branche `chantier/cadence-file`

---

## ADR-061 : Le code de retrait par SMS est TRANSACTIONNEL â€” et un report de fenÃªtre ne consomme pas le budget des pannes

**Date** : 2026-08-01
**Statut** : acceptÃ©

**Context** :
ADR-060 laissait une question explicitement ouverte : la fenÃªtre horaire
lÃ©gale s'appliquait **sans distinction de nature du message**, et le seul
producteur du canal â€” le code de retrait d'un lot gagnÃ© â€” Ã©tait donc
retardÃ© comme une offre commerciale. Une contre-revue a par ailleurs
mesurÃ© que le report lui-mÃªme ne tenait pas : `retry` fait monter le
backoff `[1, 5, 15, 60]` minutes sur `max_attempts = 5`, soit **81
minutes** d'horizon, contre **10 h** de fermeture nocturne et **34 h** du
samedi 22 h au lundi 8 h. Un SMS publicitaire postÃ© le soir mourait avant
la rÃ©ouverture â€” quelle que soit la cadence du worker. Les deux points
sont traitÃ©s ensemble parce qu'ils se croisent : reclasser le code de
retrait le sort du chemin dÃ©faillant, mais ne rÃ©pare pas le chemin.

**Decision** :
1. **Le code de retrait est transactionnel** (`marketing: false` dans
   `enqueuePrizeRedeemSms`). Trois faits cumulatifs, Ã©crits dans le code :
   le message part **Ã  la suite d'une action explicite** du joueur, il ne
   porte **aucun contenu promotionnel**, et il est **nÃ©cessaire au service
   demandÃ©** â€” sans lui, le lot dÃ©jÃ  dÃ©crÃ©mentÃ© du stock n'est pas
   retirable. C'est la dÃ©finition d'un message transactionnel, pas de la
   prospection. DÃ©cision du client.
2. Ce que cela emporte, traitÃ© point par point plutÃ´t qu'en basculant un
   boolÃ©en : (a) la fenÃªtre 22 hâ€“8 h / dimanche / fÃ©riÃ©s ne s'applique plus
   Ã  ce message â€” un gain de 23 h 30 part Ã  23 h 30, c'est l'objet du
   changement ; (b) la catÃ©gorie dÃ©clarÃ©e Ã  Brevo devient
   `transactional`, chemin de remise distinct, le bon pour un code
   attendu ; (c) la garde mÃ©canique de la mention STOP ne s'arme plus, mais
   **la mention reste dans le message** â€” quelques caractÃ¨res pour le seul
   rappel du droit de retrait que ce client recevra jamais ; (d) le
   **consentement reste exigÃ©**, `claim_sms_delivery` inchangÃ©e : le numÃ©ro
   n'est dÃ©tenu que parce que la personne a cochÃ© la case. Reclasser le
   message ne reclasse pas la collecte.
3. **Le coÃ»t de (c) est mesurÃ©, pas supposÃ©** : le message type mesurÃ© par
   `smsSegments` tient en **un segment GSM-7**, avec ou sans numÃ©ro court.
   Un seul accent dans la partie fixe basculerait le message entier en
   UCS-2 (70 caractÃ¨res par segment), et le grand livre dÃ©bite une unitÃ©
   par segment depuis `20260827120000` : ces caractÃ¨res sont de l'argent.
   Un test le verrouille.
4. **Une garde nommÃ©e** (`sms-prize.test.ts`, Â« LE CODE DE RETRAIT EST
   TRANSACTIONNEL, ET DOIT LE RESTER Â») Ã©choue si ce message redevient
   publicitaire, et porte la raison dans son corps. Sans elle, un futur
   lecteur rÃ©tablirait le dÃ©faut Â« par prudence Â» en croyant bien faire.
5. **Un report de fenÃªtre n'est pas une panne** : nouvel Ã©tat de sortie
   `deferred` (`src/lib/jobs.ts`), qui repose `run_after` Ã  la **prochaine
   ouverture** calculÃ©e par `nextSmsMarketingOpening` et **rend la
   tentative** consommÃ©e par `claim_jobs`. Une attente prÃ©vue et datÃ©e et
   un incident sont deux choses diffÃ©rentes ; elles n'avaient aucune raison
   de partager un compteur.
6. Puisque `max_attempts` ne borne plus cette boucle, un **plafond d'Ã¢ge**
   la borne : sept jours (la plus longue fermeture lÃ©gale dure 58 h). Au
   delÃ , `sms.window_deferral_exhausted` et Ã©chec propre.

**Rationale** :
La contrainte AF2M/CNIL porte sur la *prospection*. Le canal ne portait Ã 
sa livraison qu'un seul type de message, et appliquer la fenÃªtre
uniformÃ©ment Ã©tait le choix le plus sÃ»r **en l'absence de classification**
â€” pas une position sur le fond. La classification Ã©tant dÃ©sormais prise et
motivÃ©e, maintenir le retard reviendrait Ã  protÃ©ger personne au prix d'un
service que le joueur a explicitement demandÃ©.

`nextSmsMarketingOpening` **n'implÃ©mente aucune rÃ¨gle** : elle interroge
`smsMarketingWindow` heure par heure. Une formule fermÃ©e devrait rejouer
nuit, dimanche et fÃ©riÃ©s mobiles et leurs enchaÃ®nements â€” c'est-Ã -dire
dupliquer la rÃ¨gle, avec la certitude que les deux copies divergeront.

**Consequences** :
- La fenÃªtre horaire n'a plus **aucun producteur rÃ©el** : le seul message
  du canal en est sorti. Le mÃ©canisme reste testÃ© sur des envois
  explicitement publicitaires (`sms-dispatch.test.ts`, payload par dÃ©faut
  sans `marketing`), pour qu'il ne devienne pas du code mort non couvert
  le jour oÃ¹ une famille publicitaire apparaÃ®tra.
- **Ce qui n'est pas rÃ©parÃ©, et doit Ãªtre dit** : la **cadence**. Le worker
  passe Ã  05 h 20 Paris, *dans* la fenÃªtre interdite, tous les jours : un
  message publicitaire reportÃ© Ã  8 h ne sera rÃ©clamÃ© qu'au passage suivant,
  donc reportÃ© encore. Il Ã©choue proprement au bout de sept jours au lieu
  de tourner sans fin â€” ce n'est pas une rÃ©paration. La sortie reste la
  pose des deux secrets Vault qui activent `lastchance-jobs-worker`
  (pg_cron, 5 minutes), dÃ©cision de plan qui appartient au client.
- Une ligne `sms_log` figÃ©e en `sending` porte des crÃ©dits dÃ©bitÃ©s sans
  envoi prouvÃ© : `countStaleSmsDeliveries` la **compte** dÃ©sormais
  (`sms.stale_sending`), l'index `sms_log_stale_idx` cessant d'Ãªtre sans
  lecteur. **On ne rembourse pas** : une ligne figÃ©e peut aussi bien
  signifier Â« mort avant l'appel Â» que Â« Brevo a acceptÃ© puis mort avant la
  clÃ´ture Â», et rembourser un SMS rÃ©ellement parti ferait diverger le grand
  livre â€” le dÃ©faut exact que ce canal a passÃ© un chantier Ã  fermer.

**References** :
- ADR-060 (la question ouverte que celui-ci tranche), ADR-056, ADR-058
- `src/lib/sms-prize.ts`, `src/lib/sms-window.ts`, `src/lib/jobs.ts`,
  `src/lib/sms-dispatch.ts`
- [Bugs â€” Canal SMS](./bugs.md)
- Branche `feat/canal-sms-utilisable`

---

## ADR-063 : Une garde destructive compte avec le client admin, jamais avec le client RLS â€” et un comptage qui Ã©choue REFUSE

**Date** : 2026-08-02
**Statut** : acceptÃ©

**Context** :
Six gestes d'entretien du tableau de bord dÃ©truisaient en cascade des codes
de retrait Ã©mis et non retirÃ©s : suppression d'une roue (`participations`
â†’ `GAIN-`), d'une chasse (`hunt_completions` â†’ `CHASSE-`), d'un calendrier
(`calendar_openings` **et** les rÃ©compenses d'assiduitÃ© â†’ `CADEAU-`), d'un
quiz (`QUIZ-`), d'un palier et d'un programme de fidÃ©litÃ© (`FIDELITE-`).
Le client se prÃ©sentait au comptoir et lisait Â« Code introuvable Â». Le
dÃ©pÃ´t avait pourtant dÃ©jÃ  tranchÃ© ce danger un cran au-dessus, pour la
suppression de campagne : compter les codes en attente, refuser tant qu'une
case n'est pas cochÃ©e, et **nommer le chiffre** dans le refus.

Le patron a donc Ã©tÃ© reportÃ© sur les six gestes â€” et la revue sÃ©curitÃ© a
trouvÃ© que le patron lui-mÃªme, tel qu'il Ã©tait Ã©crit, ne gardait rien pour
le rÃ´le qui l'exÃ©cutera le plus souvent :

- **Le comptage passait par le client RLS.** La policy de lecture de
  `participations` est owner-only (`participations: owner select`,
  `00017`:98) alors que `deleteWheel` laisse `wheels: editors` trancher qui
  agit. Pour un `editor`, RLS rendait zÃ©ro ligne â€” donc Â« aucun code en
  attente Â», donc aucune case, aucun chiffre, et **la suppression passait
  en silence**. Le propriÃ©taire, lui, voyait le refus : le dÃ©faut Ã©tait
  invisible Ã  qui ne teste qu'avec un compte owner, et tous les tests
  existants montaient un compte owner. Le mÃªme trou, prÃ©existant,
  affectait `deleteCampaign`.
- **Le comptage Ã©chouait OUVERT.** Toutes les gardes s'Ã©crivaient
  `const { count } = await supabaseâ€¦` puis `(count ?? 0) > 0`. `error`
  n'Ã©tait jamais lu, et `count` vaut `null` dÃ¨s que la requÃªte n'aboutit
  pas â€” coupure rÃ©seau, dÃ©lai PostgREST dÃ©passÃ©, policy absente le temps
  d'une migration. Le `?? 0` transformait Â« je n'ai pas pu savoir Â» en
  Â« il n'y a rien Ã  perdre Â».
- **Une garde ne voyait que la moitiÃ© de sa cascade** : deux tables
  descendent de `calendars` et portent le prÃ©fixe `CADEAU-`, une seule
  Ã©tait comptÃ©e.

**Decision** :
1. Le comptage d'une garde destructive se fait avec le **client admin**,
   org-scopÃ© explicitement, en ne lisant que la colonne `id` â€” et le
   contrÃ´le de rÃ´le est Ã©crit dans l'action, Ã  cÃ´tÃ©. Le client RLS n'est
   pas un contrÃ´le d'autorisation pour un comptage : c'est un filtre de
   lecture dont la portÃ©e n'a aucune raison de coÃ¯ncider avec celle du
   geste gardÃ©.
2. La dÃ©cision est extraite dans un module pur, `src/lib/codes-en-attente.ts`,
   qui rend un **verdict Ã  trois issues** et non un boolÃ©en :
   `aucun` (le geste passe), `en-attente` avec son nombre (refus
   cochable, le chiffre est nommÃ©), `indisponible` avec son motif (refus
   **sans case Ã  cocher**). Un boolÃ©en Ã©crase deux de ces trois issues, et
   la pire des confusions serait de proposer une case Ã  cocher
   qu'aucun chiffre n'accompagne : cela n'apprendrait au commerÃ§ant qu'Ã 
   cocher sans lire, exactement ce que le registre des confirmations
   destructives existe pour Ã©viter.
3. Le refus est **rendu**, jamais levÃ© â€” mÃªme rÃ¨gle qu'ADR-062 : un refus
   prÃ©visible, et une base momentanÃ©ment injoignable en est un, n'a rien Ã 
   faire dans un journal d'erreur sous forme d'exception.
4. Les six gardes entrent au registre
   `src/lib/destructive-confirm-coverage.test.ts`, qui asserte leur
   convergence textuelle.

**Rationale** :
Une garde qui Ã©choue ouvert protÃ¨ge exactement les jours oÃ¹ rien ne va
mal. Et une garde dont la portÃ©e de lecture dÃ©pend d'une policy Ã©crite
pour un autre usage est une garde dont personne ne peut dire, en la
lisant, pour qui elle s'arme : le seul moyen de le savoir Ã©tait de la
jouer sous chaque rÃ´le â€” ce que les tests ne faisaient pas.

**Consequences** :
- **Enseignement portÃ© au-delÃ  de ce chantier** : un dÃ©faut de garde peut
  Ãªtre invisible au rÃ´le qui Ã©crit le test. Toute garde posÃ©e sur une
  action ouverte Ã  `editor` doit Ãªtre Ã©prouvÃ©e sous `editor`, pas sous le
  rÃ´le le plus commode Ã  monter.
- Le comptage par client admin Ã©largit la surface `service_role` de ces
  actions ; le contrepoids est Ã©crit : org-scope explicite dans la
  requÃªte, une seule colonne lue, contrÃ´le de rÃ´le en tÃªte de l'action.
- ~~Les gardes ne ferment pas le cas de bout en bout~~ â€” **corrigÃ© le
  2026-08-03 (ADR-068)**. Les six gardes rÃ©duisaient la frÃ©quence du cas
  sans le fermer : `player_wallet` lit `reward_issuances` **sans jointure
  sur la table source**, donc aprÃ¨s une suppression confirmÃ©e le client
  continuait de voir son lot Â« active Â» pendant que la caisse le refusait.
  `20260902120000` pose les dix triggers `after delete` qui manquaient :
  la ligne de registre est dÃ©sormais **annulÃ©e** avec sa source, le
  portefeuille est cohÃ©rent avec la caisse, et le client lit une
  explication au lieu de constater une disparition. La suppression reste
  possible, et voulue, une fois la case cochÃ©e â€” les gardes gardent tout
  leur sens : elles nomment le nombre de codes qui deviendront caducs.

**References** :
- ADR-062 (le refus rendu et jamais levÃ©), ADR-054 (le registre des
  confirmations destructives)
- `src/lib/codes-en-attente.ts`, `src/lib/destructive-confirm-coverage.test.ts`
- [Bugs â€” six cascades qui dÃ©truisaient des codes en main](./bugs.md)
- `docs/chasse-parcours-2026-08-02.md`

---

## ADR-064 : Le gel d'un engagement porte sur la VALEUR, pas sur la prÃ©sence de la clÃ©

**Date** : 2026-08-02
**Statut** : acceptÃ©

**Context** :
`20260814120000` a gelÃ© le **libellÃ©** d'un lot Ã©mis dans le registre
universel, et son propre en-tÃªte Ã©crivait que la moitiÃ© affichage restait
ouverte. Elle l'Ã©tait doublement : le gel substituait la seule ligne
`label = excluded.label` de l'`on conflict`, laissant intacte la ligne
voisine `metadata = excluded.metadata` â€” or `metadata` porte la clÃ©
`reward_details`, la **description**, Ã©crite par huit des neuf familles.
Elle Ã©tait donc rÃ©Ã©crite Ã  chaque resynchronisation du miroir, y compris
celle que dÃ©clenche la remise en caisse elle-mÃªme. Au comptoir, le titre
de la carte portait le libellÃ© gravÃ© (Â« CafÃ© offert Â») et la ligne juste en
dessous la description courante (Â« un croissant pur beurre, hors
boissons Â») : les deux lignes de la mÃªme carte se contredisaient, et c'est
la seconde qui Ã©nonce les conditions que le caissier applique.

**Decision** :
Le gel porte sur **`reward_details` seule**, et il est Ã©crit comme un
`case` sur la **valeur** : une description absente ou vide peut Ãªtre
remplie, une description dÃ©jÃ  gravÃ©e n'est jamais Ã©crasÃ©e.

Deux choses ont Ã©tÃ© explicitement Ã©cartÃ©es :
- **Figer `metadata` en bloc** serait plus court et faux. `metadata`
  mÃ©lange une PROMESSE faite au client (`reward_details`, et elle seule) et
  du CONTEXTE (`legacy_table`, dont dÃ©pend le rattrapage de
  `20260822120000` pour router son rejeu, `experience_label`, `rank`,
  `cycle`, `beneficiary`â€¦). Rien de ce contexte n'a Ã©tÃ© promis Ã 
  quiconque, et le figer empÃªcherait toute clÃ© ajoutÃ©e par une future
  version de `sync_reward_issuance` d'apparaÃ®tre sur les lignes dÃ©jÃ 
  Ã©crites.
- **Tester `jsonb_exists`**, c'est-Ã -dire la prÃ©sence de la clÃ©. DÃ©faut
  trouvÃ© par la mesure dans la premiÃ¨re rÃ©daction : `prizes.description`
  est `not null default ''`, donc sur la roue â€” la famille qui Ã©met le
  plus â€” la clÃ© existe **toujours** et vaut la chaÃ®ne vide. Geler sur la
  prÃ©sence aurait gravÃ© une chaÃ®ne vide Ã  perpÃ©tuitÃ©, et un commerÃ§ant
  dÃ©crivant son lot le lendemain ne l'aurait jamais vu apparaÃ®tre.

**Rationale** :
Â« Cette valeur a-t-elle Ã©tÃ© promise ? Â» ne se rÃ©pond pas par Â« cette clÃ©
existe-t-elle ? Â» dÃ¨s qu'une colonne source porte un `default ''`. Le gel
reprend donc exactement la rÃ¨gle dÃ©jÃ  Ã©prouvÃ©e par le gel du libellÃ©
(`when label = '' then excluded.label`) : remplir oui, Ã©craser jamais.

**Consequences** :
- Deux populations profitent du Â« remplir Â» : les lignes rÃ©tro-alimentÃ©es
  par `20260807120000` et le lot dont le commerÃ§ant Ã©crit la description
  aprÃ¨s l'avoir crÃ©Ã©.
- Tant que la migration n'est pas appliquÃ©e, un correctif d'affichage
  dÃ©fensif tient la caisse : quand le libellÃ© gravÃ© diffÃ¨re du libellÃ©
  courant, `descriptionDeCaisse` (`src/lib/caisse-remise.ts`) **retire** la
  description plutÃ´t que d'en afficher une pÃ©rimÃ©e. Il assume par Ã©crit sa
  moitiÃ© manquante â€” une description rÃ©Ã©crite SANS renommage passe
  inaperÃ§ue. Une fois la description gravÃ©e, la caisse affiche la bonne
  plutÃ´t que rien.
- `contest` est la seule famille Ã  n'Ã©crire aucun `reward_details` : le gel
  n'a rien Ã  y faire, et ce n'est pas un oubli.

**References** :
- `supabase/migrations/20260901120000_freeze_reward_details.sql`,
  `supabase/tests/reward_details_freeze.test.sql`
- `src/lib/caisse-remise.ts` (`descriptionDeCaisse`)
- ADR-048 (le registre universel), PR #68 (le gel du libellÃ©)

---

## ADR-065 : Le stock ne s'Ã©crit que sous tÃ©moin de ce que le champ AFFICHAIT â€” un contrÃ´le contre l'accident, pas contre un appelant

**Date** : 2026-08-02
**Statut** : acceptÃ©

**Context** :
`prizes.stock` n'est pas un total mais le **restant**, dÃ©crÃ©mentÃ© par
chaque tirage (`update prizes set stock = stock - 1`, dix RPC). Le champ
Â« Stock (vide = illimitÃ©) Â» de l'Ã©diteur est un input non contrÃ´lÃ© dont le
`defaultValue` vaut le restant **au chargement de la page**, et
`updatePrize` rÃ©Ã©crivait la colonne en bloc. Corriger une coquille de
libellÃ© sur une page ouverte depuis une heure recrÃ©ditait donc les lots
gagnÃ©s entre-temps : la roue redistribuait des cafÃ©s que le commerÃ§ant
n'avait plus, et rien Ã  l'Ã©cran ne le disait.

**Decision** :
`updatePrize` compare **trois** valeurs et non deux : ce que le champ
affichait au chargement (tÃ©moin `stock_seen`, postÃ© par le formulaire), ce
que le client POSTE maintenant, et ce que la base porte au moment de
l'Ã©criture. Le stock n'est Ã©crit que si le commerÃ§ant l'a rÃ©ellement
changÃ© ; si la base a bougÃ© sous lui sans qu'il touche au champ, l'Ã©criture
de cette colonne est abandonnÃ©e plutÃ´t que d'Ã©craser.

La piste d'origine â€” comparer simplement la valeur postÃ©e Ã  la valeur en
base â€” a Ã©tÃ© Ã©cartÃ©e aprÃ¨s mesure : elle est insuffisante et
contradictoire. Sans tÃ©moin de ce que le champ AFFICHAIT, Â« il a
dÃ©libÃ©rÃ©ment saisi 12 Â» et Â« 12 traÃ®nait dans le champ depuis le
chargement Â» sont **indistinguables au serveur**.

**Rationale** :
La question Ã  laquelle il fallait rÃ©pondre n'est pas Â« cette valeur
est-elle correcte ? Â» mais Â« ce commerÃ§ant a-t-il voulu Ã©crire cette
valeur ? Â» â€” et l'intention ne se dÃ©duit que d'un Ã©cart entre ce qu'on lui
a montrÃ© et ce qu'il renvoie.

**Consequences** :
- **Ã€ Ã©crire noir sur blanc, sous peine de mal lire ce mÃ©canisme** :
  `stock_seen` vient du client. Poster la valeur rÃ©elle de la base y fait
  passer n'importe quelle Ã©criture. Ce n'est **pas** une garde contre un
  appelant â€” un `editor` a parfaitement le droit de fixer le stock de ses
  lots ; c'est un contrÃ´le contre l'**accident**, dans la seule classe oÃ¹
  l'accident est certain et silencieux.
- Le module Quiz portait dÃ©jÃ  la garde jumelle (stock total +
  `reward_claimed_count` + refus nommÃ©) : les deux modÃ¨les coexistent, le
  quiz stockant un total et la roue un restant.

**References** :
- `src/actions/prizes.ts`, `src/lib/validations/prizes.ts`
- `docs/chasse-parcours-2026-08-02.md` (`stock-du-lot-remis-a-sa-valeur-affichee`)

---

## ADR-066 : Le pont d'identitÃ© se pose au point d'Ã©criture â€” un rejeu rÃ©troactif par migration ne rachÃ¨te rien

**Date** : 2026-08-02
**Statut** : acceptÃ©

**Context** :
`ensureProgressivePlayerIdentity` est le seul Ã©crivain de
`player_legacy_identities`, le pont entre la clÃ© de jeu d'une famille et
l'identitÃ© joueur globale. Il Ã©tait appelÃ© pour sept familles sur neuf :
**pronostics et parrainage ne le posaient jamais**. ConsÃ©quences mesurÃ©es :
`reward_player_from_legacy(â€¦, 'contest'|'referral', â€¦)` rendait toujours
`null`, donc `reward_issuances.player_id` restait `null`, donc
`player_wallet` â€” qui filtre sur `player_id` â€” n'affichait jamais ces lots,
alors que la documentation promet un portefeuille Â« toutes familles
confondues Â» ; et `apply_meta_progression_event` sort sur
`player_id is null`, donc une mission de saison portant sur ces deux
familles ne progressait pour personne, alors que l'Ã©diteur les propose.

**Decision** :
Les deux appels manquants sont posÃ©s **au point d'Ã©criture** (inscription
au championnat, mise en place du parrain). Le **rejeu rÃ©troactif des
`player_id` n'a pas Ã©tÃ© Ã©crit**, et le motif est structurel, pas
circonstanciel : une migration s'applique **avant** le dÃ©ploiement de
l'application qui pose ces ponts ; au moment du rejeu, aucun pont
contest/referral n'existe, et `reward_player_from_legacy` â€” fonction
`stable`, qui ne fait que **lire** le pont â€” rendrait `null` pour chaque
ligne. ZÃ©ro rachat, par construction.

Mesure de contexte qui confirme le non-geste : `contest_awards` et
`referral_rewards` comptent **0 ligne en production**.

**Rationale** :
Le geste utile, s'il devient nÃ©cessaire, n'est pas un rejeu one-shot mais
un **trigger `after insert on player_legacy_identities`** qui rattrape les
lignes du registre au moment oÃ¹ le pont apparaÃ®t â€” c'est exactement le
motif dÃ©jÃ  adoptÃ© par `20260805230000` pour corriger l'ordre d'Ã©criture de
l'identitÃ©, et il fonctionne quel que soit l'ordre migration/dÃ©ploiement.

**Consequences** :
- ~~Une seconde population reste sans pont~~ â€” **corrigÃ© le 2026-08-03**.
  Un lot de roue gagnÃ© via un **tour offert** (calendrier, fidÃ©litÃ©, quiz,
  parrainage) posait le pont pour SA famille, jamais pour `campaign` â€” or
  la participation crÃ©Ã©e ensuite cherche un pont `campaign`, donc le lot
  Ã©tait absent de `/portefeuille`. `bridgeOfferedSpinToCampaign` pose ce
  pont au retour des quatre RPC de consommation. Le point qui compte :
  elle relit `organization_id`, `campaign_id` et `player_key` **sur le
  spin**, jamais sur l'appelant â€” c'est la mÃªme source que celle que le
  miroir interrogera, donc le triplet pontÃ© ne peut pas diverger de celui
  qui sera cherchÃ©. `acquisitionSource: "unknown"` et non `direct` :
  `resolve_player_identity` ne remplace une source posÃ©e que si elle vaut
  `unknown`, donc `direct` serait **collant** et mentirait
  dÃ©finitivement ; en dÃ©clarant l'ignorance, on laisse un futur scan de QR
  sur cette mÃªme campagne Ã©crire la vÃ©ritÃ©.
- ~~`ensureProgressivePlayerIdentity` avale toute panne~~ â€” **corrigÃ© le
  2026-08-03**. Chaque sortie en Ã©chec Ã©met dÃ©sormais un `reportError` et
  un compteur `player-identity.bridge-failed.<motif>.<famille>`,
  **Ã©touffÃ©s par fenÃªtre de 60 s et par cause**. L'Ã©touffement n'est pas
  une commoditÃ© : sans lui, une cause gÃ©nÃ©rale (sel mal dÃ©ployÃ©, RPC en
  Ã©chec aprÃ¨s migration) produisait un Ã©vÃ©nement Sentry **et un `insert`
  `ops_metrics`** par requÃªte joueur â€” l'observabilitÃ© se serait dÃ©truite
  elle-mÃªme au moment prÃ©cis oÃ¹ l'on en a besoin. Le compteur ne mesure
  donc plus l'amplitude mais les **fenÃªtres porteuses d'Ã©chec** ; zÃ©ro
  reste la valeur saine, et une population non nulle nomme toujours la
  famille dont les lots n'atteindront pas `/portefeuille`. Rien n'entre
  dans la clÃ© qui ne soit un littÃ©ral ou une valeur d'Ã©numÃ©ration fermÃ©e.
- Question **tranchÃ©e par la mesure et close** : le pont fonctionne bien en
  production. Les deux seules lignes de `reward_issuances` portent
  `player_id` null par **antÃ©rioritÃ©** â€” trois clÃ©s de spin distinctes
  existent, le pont a Ã©tÃ© posÃ© pour la derniÃ¨re Ã  l'horodatage exact du
  dernier spin, et les deux lots pointent vers des participations Ã  clÃ©
  antÃ©rieure remontÃ©es par le rattrapage. `PLAYER_KEY_SALT` n'est pas en
  cause. Ne pas rouvrir ce point.

**References** :
- ADR-045 (l'identitÃ© joueur unifiÃ©e), ADR-055 (le portefeuille),
  ADR-044 (la mÃ©ta-progression)
- `src/lib/player-identity.ts`, `src/actions/pronostics.ts`,
  `src/actions/referral.ts`
- [Bugs â€” pont d'identitÃ©](./bugs.md)

---

## ADR-067 : Un rejeu de rÃ©clamation rend le code dÃ©jÃ  Ã©mis â€” et ce qu'on ne sait pas distinguer, on le COMPTE avant de le rÃ©Ã©mettre

**Date** : 2026-08-02
**Statut** : acceptÃ©

**Context** :
Le joueur gagne, valide Â« RÃ©cupÃ©rer mon gain Â», la requÃªte est committÃ©e
mais la rÃ©ponse se perd (4G qui dÃ©croche au fond du magasin). L'Ã©cran lui
dit Â« Connexion perdue [â€¦] rÃ©essayez Â» â€” ce que le commentaire du bouton
promettait comme sÃ»r (Â« idempotente sur son jeton Â»). Il rÃ©essaye et lit
Â« Ce gain a dÃ©jÃ  Ã©tÃ© enregistrÃ©. Â» : `claimPrizeInner` relisait le spin,
voyait `claimed = true` et sortait **sans jamais rendre le code**.
Recharger ne le sauvait pas non plus, `recoverPendingWin` filtrant sur
`claimed = false`. Le lot Ã©tait dÃ©comptÃ©, la participation et le
`redeem_code` existaient en base, le joueur n'avait rien Ã  prÃ©senter.

La revue a trouvÃ©, au passage, que la branche Â« deux rejeux concurrents Â»
Ã©crite pour ce chemin Ã©tait **du code mort** : elle dÃ©cidait sur le TEXTE
de l'exception (`already claimed`), or la dÃ©finition vivante de
`claim_winning_spin` ouvre sur un `select â€¦ for update` qui **sÃ©rialise** â€”
le second appel attend, relit `claimed = true` et sort par l'autre porte.
CoÃ»t rÃ©el : un double-tap donnait une impasse devant un gain rÃ©el (il
fallait un troisiÃ¨me tap) et une alerte sur un chemin nominal.

**Decision** :
1. Sur un rejeu, la dÃ©cision porte sur un **fait** â€” la participation
   existe-t-elle pour ce `spin_id` ? â€” et non sur le texte d'une exception
   ni sur un drapeau lu en amont. Si elle existe, son `redeem_code` (et les
   URL Wallet) sont rendus **en succÃ¨s**. Le jeton signÃ© dÃ©signe dÃ©jÃ  CE
   spin : aucune seconde participation n'est crÃ©Ã©e, la propriÃ©tÃ©
   Â« transaction Ã  usage unique Â» est conservÃ©e.
2. Ce qu'on ne sait pas distinguer, on ne le devine pas. Quand l'invocation
   meurt **aprÃ¨s** le commit de la RPC, l'e-mail et le SMS ne sont pas
   partis â€” mais aucune trace par participation ne permet de sÃ©parer ce cas
   de la simple rÃ©ponse perdue en transit, oÃ¹ ils SONT partis. RÃ©Ã©mettre Ã 
   l'aveugle ferait des doublons dans le cas frÃ©quent. On **compte**
   (`play.claim-replay-sans-renvoi`).

**Rationale** :
MÃªme rÃ¨gle qu'ADR-048 : un repli silencieux ne se retire pas, il se mesure
d'abord. Si le compteur s'avÃ¨re non nul, le correctif juste est une
**trace d'envoi par participation**, qui rend les deux cas distinguables â€”
pas un renvoi Ã  l'aveugle dÃ©cidÃ© sans donnÃ©e.

**Consequences** :
- **L'enseignement le plus cher du chantier vient du contrÃ´le nÃ©gatif de
  ce correctif** : en rÃ©tablissant le dÃ©faut d'origine, la suite entiÃ¨re
  restait VERTE. Les deux tests qui semblaient l'Ã©prouver n'atteignent
  jamais cette branche â€” les doubles Ã©tant synchrones, le second appel voit
  `spin.claimed = true` Ã  la lecture amont et part par le chemin voisin
  sans appeler la RPC. **Le cas central du correctif n'Ã©tait couvert par
  rien.** Test ajoutÃ© ; le sabotage rend dÃ©sormais un rouge nommÃ©. Deux
  autres montages ne mordaient pas davantage, faute de dissocier Â« le spin
  est dÃ©jÃ  rÃ©clamÃ© Â» de Â« la RPC refuse Â».
- Le pavÃ© de commentaire qui dÃ©crivait le mÃ©canisme concurrent inexistant
  a Ã©tÃ© rendu **vrai**, pas rÃ©Ã©crit : c'est le motif dÃ©jÃ  consignÃ© le
  2026-08-01 (un en-tÃªte qui affirme une propriÃ©tÃ© que le code ne tient
  pas se corrige en rendant la phrase vraie).

**References** :
- ADR-048 (mesurer un repli avant de le retirer)
- `src/actions/play.ts`, `src/components/wheel/claim-form.tsx`
- [Bugs â€” claim non idempotent](./bugs.md)

---

## ADR-068 : Une source qui disparaÃ®t ANNULE son lot au registre, elle ne l'efface pas â€” et la rÃ©tention n'est pas une annulation comme les autres

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
`reward_issuances.source_id` est **polymorphe** : il dÃ©signe dix tables et
ne porte aucune clÃ© Ã©trangÃ¨re. Rien ne reliait donc mÃ©caniquement la ligne
de registre Ã  sa ligne source, et les dix triggers de miroir Ã©taient
`after insert or update`, **jamais `delete`**. Quand la cascade emportait
la source â€” roue, chasse, calendrier, quiz, palier ou programme de
fidÃ©litÃ© supprimÃ©s â€” la ligne de registre survivait, orpheline : le client
lisait toujours son lot Â« Ã€ retirer Â» sur `/portefeuille` pendant que la
caisse lui rÃ©pondait Â« Code introuvable Â». Les six gardes d'ADR-063
rÃ©duisaient la frÃ©quence du cas ; elles ne le fermaient pas, la
suppression restant possible et voulue une fois la case cochÃ©e.

**Decision** :
1. **Marquer, jamais dÃ©truire.** Dix triggers `after delete` posent
   `cancelled_at` sur la ligne de registre.
2. **La cause de la disparition est portÃ©e par un rÃ©glage de session**,
   `lastchance.purge_maintenance`, posÃ© par les cinq purges qui
   suppriment rÃ©ellement une ligne joueur â€” le trigger ne voit qu'un
   `old`, jamais le pourquoi.
3. **Une annulation par la rÃ©tention n'est pas TERMINÃ‰E** au sens de
   `purge_expired_reward_issuances` : la clause
   `cancelled_reason is distinct from 'source purgÃ©e'` l'en exclut.
   L'annulation par le geste du commerÃ§ant, elle, reste purgeable.

> **CorrigÃ©e le 2026-08-03 par ADR-071 et ADR-072** (branche
> `chantier/derniers-ouverts`). Les points 2 et 3 ci-dessus **ne dÃ©crivent
> plus le code** : la cause ne se lit plus dans `cancelled_reason` mais dans
> la colonne dÃ©diÃ©e `reward_issuances.cancelled_source` (ADR-072), et
> l'exclusion de purge n'est plus inconditionnelle â€” elle est **bornÃ©e par
> une grÃ¢ce de `least(3 mois, fenÃªtre de rÃ©tention de l'organisation)** Ã 
> compter de `cancelled_at` (ADR-071), et elle s'applique dÃ©sormais aux
> **deux** causes collatÃ©rales, `purged` comme `source_deleted`.

**Rationale** :
Supprimer la ligne aurait rÃ©tabli la cohÃ©rence en une ligne de SQL. Le
marquage est retenu pour quatre raisons dont trois sont **mesurables dans
ce dÃ©pÃ´t** : l'Ã©tat `cancelled` existe dÃ©jÃ  de bout en bout (le
portefeuille le calcule, l'Ã©cran l'affiche, `redeem_reward_by_code` le lit
**avant** toute route legacy) â€” donc le client lit une explication lÃ  oÃ¹
la suppression lui aurait fait constater une disparition, et un lot gagnÃ©
qui s'Ã©vapore, c'est un produit qui a l'air cassÃ© ; `org_weekly_digest`
compte les lots Ã‰MIS et son propre commentaire dit qu'un lot annulÃ© reste
Ã©mis â€” dÃ©truire ferait baisser aprÃ¨s coup le chiffre d'une semaine passÃ©e,
sur le seul document que le commerÃ§ant reÃ§oit chaque lundi ; la caisse a
dÃ©jÃ  l'issue cohÃ©rente cÃ¢blÃ©e ; et la trace n'est pas Ã©ternelle pour
autant, une annulation par le commerÃ§ant devenant purgeable Ã  l'Ã©chÃ©ance
de rÃ©tention.

Le point 3 est le plus important, et c'est **la revue sÃ©curitÃ© qui l'a
trouvÃ©, sur une consÃ©quence non dÃ©clarÃ©e de la migration elle-mÃªme**.
`purge_expired_*` supprime les lignes joueur sur le **seul critÃ¨re
d'Ã¢ge** â€” `data_retention_months` vaut `default 12`, ce n'est pas un
opt-in, chaque organisation purge. Les tables de lots cascadent, le
nouveau trigger posait `cancelled_at`, et une ligne annulÃ©e est TERMINÃ‰E
donc dÃ©truite la nuit mÃªme (les deux purges tournent dans le mÃªme
`Promise.all`, ordre non dÃ©terministe). **Avant cette migration, cette
ligne Ã©tait protÃ©gÃ©e Ã  vie.** Sans la distinction de cause, un correctif
de cohÃ©rence d'affichage serait devenu un annulateur de masse.

**Consequences** :
- L'invariant de `20260810120000` (Â« on ne supprime jamais un lot encore
  encaissable Â») devient **conditionnel** : il ne tient plus par la seule
  vertu de son prÃ©dicat, mais aussi par la clause ci-dessus. Son en-tÃªte
  est sur `main` et `scripts/check-migration-order.mjs` compare des
  octets â€” la correction est donc Ã©crite dans la migration nouvelle, pas
  en place. C'est la rÃ¨gle dÃ©jÃ  consignÃ©e le 2026-08-01.
- **Cinq purges instrumentÃ©es, pas neuf, et c'est vÃ©rifiÃ© et non
  supposÃ©** : `quiz` et `referral` **anonymisent** sans supprimer (aucun
  `after delete` ne peut s'y dÃ©clencher) ; `jackpot_wins` n'a **aucune
  FK** vers `jackpot_players` ; `event_wins` rÃ©fÃ©rence `event_sessions`,
  que sa purge ne touche pas. Ces deux derniÃ¨res familles sont
  structurellement hors d'atteinte â€” leur registre anonyme de gains
  survit dÃ©jÃ  Ã  la purge du joueur.
- La dÃ©finition vivante des cinq purges **dÃ©mÃ©nage** dans cette
  migration : `grep -l "function public.purge_expired_hunt_players"` rend
  dÃ©sormais deux fichiers. La rÃ¨gle du catalogue vivant s'applique â€” elle
  a dÃ©jÃ  coÃ»tÃ© deux dÃ©fauts Ã  ce dÃ©pÃ´t. Les cinq corps ont Ã©tÃ© extraits
  **par script**, une seule ligne insÃ©rÃ©e, aller-retour vÃ©rifiÃ© Ã  l'octet
  prÃ¨s : aucune ligne recopiÃ©e Ã  la main.
- **Ce que le marquage ne ferme pas** : sept familles sur neuf n'ont
  aucune expiration au registre (`sync_reward_issuance` Ã©crit `null` pour
  hunt, loyalty, jackpot, event, calendar Ã—2, referral, quiz ; seuls
  `wheel` et `contest` en portent une). Un lot Â« source purgÃ©e Â» de ces
  familles Ã©tait donc conservÃ© **indÃ©finiment**. ~~ConsignÃ© ouvert.~~
  **FERMÃ‰ le 2026-08-03 par ADR-071** : la ligne d'explication reÃ§oit une
  Ã©chÃ©ance bornÃ©e. Ce qui reste vrai, et reste ouvert, est plus Ã©troit :
  ces sept familles n'ont toujours aucune Ã©chÃ©ance pour les lots **non
  annulÃ©s**, que rien ne clÃ´t jamais.

**References** :
- ADR-063 (les six gardes destructives), ADR-055 (le portefeuille),
  ADR-069 (la cause rendue au client)
- `supabase/migrations/20260902120000_cancel_reward_on_source_delete.sql`,
  `supabase/tests/reward_source_deletion.test.sql`
- [Bugs â€” rÃ©sidus de la chasse par parcours vÃ©cu](./bugs.md)

---

## ADR-069 : La cause d'une annulation est un vocabulaire FERMÃ‰ â€” le motif libre du commerÃ§ant ne franchit jamais la frontiÃ¨re du client

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
ADR-068 crÃ©e une troisiÃ¨me cause d'annulation. Deux surfaces affirmaient
pourtant un motif **unique** : le portefeuille du client (Â« Le commerÃ§ant
a annulÃ© ce lot. Â») et la carte d'annulation de la caisse (Â« l'opÃ©ration
qui le portait a Ã©tÃ© supprimÃ©e Â»). Les deux textes devenaient faux, et
faux dans le sens le plus coÃ»teux : ils imputent Ã  un commerÃ§ant un geste
qu'il n'a pas fait â€” et le caissier rÃ©pÃ¨te la phrase **au client, en
face**. En mars 2028, une purge de rÃ©tention aurait fait affirmer Ã  un
employÃ©, devant un vrai gagnant, que son patron avait supprimÃ©
l'opÃ©ration.

La voie Ã©vidente Ã©tait de faire remonter `cancelled_reason` jusqu'au
portefeuille. Elle a Ã©tÃ© **Ã©cartÃ©e aprÃ¨s vÃ©rification** : ce champ est du
**texte libre saisi par le commerÃ§ant** (300 caractÃ¨res, lu d'un
formulaire par `cancelParticipation`). Le publier dÃ©poserait des notes
internes â€” Â« client indÃ©sirable Â», Â« suspicion de fraude Â» â€” sur l'Ã©cran
que le client ouvre, et sur celui que le caissier lui montre.

**Decision** :
1. `player_wallet` rend une **cause normalisÃ©e**, `cancelled_cause`,
   vocabulaire fermÃ© Ã  trois valeurs (`purged`, `source_deleted`,
   `merchant`) plus `null`. Elle dit **qui a agi**, rien de plus. Le motif
   libre ne franchit jamais la frontiÃ¨re.
2. Les deux tables de texte vivent dans un module pur,
   `src/lib/annulation-cause.ts`, en `Record<CauseAnnulation, string>` :
   ajouter une cause fait Ã©chouer `tsc` tant que les deux audiences n'ont
   pas Ã©tÃ© traitÃ©es. La garantie Â« aucune branche muette Â» est tenue par
   le compilateur â€” ce dÃ©pÃ´t a dÃ©jÃ  payÃ© deux fois une branche d'affichage
   oubliÃ©e sur une seule famille.
3. Les deux audiences ne partagent pas leur phrase. Le client lit un Ã©cran
   de tÃ©lÃ©phone et n'a rien Ã  corriger ; le caissier lit la sienne Ã  voix
   haute et a besoin de savoir s'il doit faire retaper la saisie.
4. Une cause inconnue â€” toute annulation **antÃ©rieure** Ã  ce chantier â€” ne
   retombe pas sur `merchant` mais sur une phrase qui n'accuse personne.
   Le repli par dÃ©faut *Ã©tait* le dÃ©faut d'origine.

> **Partiellement RETOURNÃ‰E le 2026-08-03 par ADR-072** (branche
> `chantier/derniers-ouverts`). Le principe â€” vocabulaire fermÃ©, motif libre
> qui ne franchit jamais la frontiÃ¨re â€” tient et est renforcÃ©. Ce qui Ã©tait
> faux est le **mÃ©canisme** : la premiÃ¨re implÃ©mentation *dÃ©rivait* la cause
> de `cancelled_reason`, c'est-Ã -dire du champ de texte libre que cette ADR
> disait prÃ©cisÃ©ment ne pas publier. Un `editor` qui saisissait exactement
> `source purgÃ©e` â€” au formulaire, ou par un `PATCH` PostgREST direct qui ne
> laisse aucune trace d'audit â€” fabriquait la sentinelle et faisait afficher
> Â« Personne ne l'a annulÃ© Â». L'ADR Ã©tait donc retournÃ©e contre elle-mÃªme :
> au lieu d'imputer au commerÃ§ant un geste automatique, on laissait le
> commerÃ§ant imputer Ã  l'automatisme son propre geste. La cause vit
> dÃ©sormais dans une colonne dÃ©diÃ©e (ADR-072). Le point 4 (repli sur une
> phrase qui n'accuse personne) est Ã©galement **abandonnÃ© Ã  la lecture** :
> le repli est `merchant`, et le motif de ce choix est Ã©crit dans ADR-072.

**Rationale** :
Le mÃ©canisme qui rend la cause connaissable mÃ©rite d'Ãªtre Ã©crit, parce que
la voie Ã©lÃ©gante est **refusÃ©e par la plateforme, mesurÃ© et non supposÃ©** :
`alter function â€¦ set lastchance.purge_maintenance` â€” qui aurait posÃ© le
rÃ©glage sans toucher un seul corps de fonction â€” Ã©choue avec
`permission denied to set parameter`. Ce n'est pas une affaire de
guillemets : la forme non quotÃ©e, seule correcte au regard de la
grammaire, rend la mÃªme erreur. La cause est le modÃ¨le de rÃ´les Supabase â€”
`postgres`, sous lequel tournent les migrations, n'est pas superutilisateur,
et fixer un paramÃ¨tre *custom* par `alter function â€¦ set` l'exige. Une
migration qui l'aurait tentÃ© aurait Ã©chouÃ© **en entier**, et c'est
exactement ce qui s'est passÃ© au premier `db reset` : les dix triggers, la
purge corrigÃ©e et le portefeuille n'ont jamais existÃ©, silencieusement,
derriÃ¨re un `Result: FAIL` qui ne nommait que les tests. Repli sur
`set_config(â€¦, is_local => true)` dans les corps â€” l'idiome
`audit_maintenance` dÃ©jÃ  en production depuis `20260826120000`.

**Consequences** :
- La caisse n'a **pas** d'autre chemin : elle lit `reward_issuances` en
  direct (`lookupUniversalRewardRoute`), pas `player_wallet`, qui est
  scopÃ©e au joueur porteur du cookie. Les deux motifs SQL sont donc
  recopiÃ©s en constantes (`MOTIF_PURGE`, `MOTIF_SUPPRESSION`) et
  confinÃ©s Ã  ce seul endroit.
- **La garde de ces deux littÃ©raux ne prouvait pas ce qu'on croyait** :
  `annulation-cause.test.ts` les comparait au **fichier de migration**,
  jamais Ã  `pg_proc`. ~~ConsignÃ© ouvert.~~ **FERMÃ‰ le 2026-08-03** : deux
  assertions pgTAP lisent `pg_proc.prosrc` â€” la dÃ©finition que Postgres
  exÃ©cutera â€” et **nomment** les constantes TypeScript Ã  dÃ©placer. La
  mesure a d'ailleurs corrigÃ© l'entrÃ©e : cinq assertions prÃ©existantes
  rougissaient dÃ©jÃ  sur ce sabotage, donc Â« une redÃ©finition passerait
  sans que rien ne rougisse Â» Ã©tait **trop large** ; ce qui manquait
  n'Ã©tait pas la dÃ©tection mais la **dÃ©signation** â€” les cinq
  prÃ©existantes font corriger la fixture, pas la constante. Le point est
  par ailleurs devenu secondaire : la caisse ne dÃ©rive plus aucune cause
  d'un littÃ©ral (ADR-072).
- `WheelResult` et `ContestResult` rendent encore Â« annulÃ© Â» sans cause :
  ces chemins lisent la table parente **vivante**, donc leur cause est
  toujours `merchant` â€” la distinction n'y est simplement pas Ã©noncÃ©e.

**References** :
- ADR-068 (marquer plutÃ´t que dÃ©truire), ADR-055 (le portefeuille)
- `src/lib/annulation-cause.ts`, `src/lib/annulation-cause.test.ts`,
  `src/app/dashboard/redeem/page.tsx`,
  `src/components/wallet/player-wallet-screen.tsx`

---

## ADR-070 : Un seau qui garde une LECTURE de dernier recours Ã©choue OUVERT â€” et l'exception ne s'exporte pas

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
`loadHuntRecallContext` est le chemin par lequel un gagnant relit son code
`CHASSE-â€¦` **quand la chasse est close** â€” il existe prÃ©cisÃ©ment parce que
ce code n'est lisible nulle part ailleurs Ã  ce moment-lÃ . Il s'ajoutait au
chargeur strict sur une page publique `force-dynamic`, atteignable par
quiconque photographie le QR d'une Ã©tape en boutique, et ne portait aucune
borne : chaque requÃªte coÃ»tait trois lectures `service_role`, y compris
sur une chasse archivÃ©e. Amplification pure â€” aucune donnÃ©e n'en sort sans
le cookie de complÃ©tion â€” mais un travail non bornÃ© offert Ã  Internet
reste un travail offert.

**Decision** :
Trois gardes ordonnÃ©es du moins cher au plus cher : aucun cookie de chasse
sur l'appareil â†’ refus Ã  **zÃ©ro requÃªte** ; cookie prÃ©sent mais pas celui
de CETTE chasse â†’ refus Ã  **une requÃªte** ; puis un seau sur le hash du
cookie joueur, **`failClosed: false`**.

**Rationale** :
Le calcul du fail-closed suppose qu'un rejeu non bornÃ© coÃ»te quelque
chose. Ici il ne coÃ»te rien d'exploitable : ce chargeur **n'Ã©crit rien**,
ne rend pas le client admin, et exige une complÃ©tion dÃ©jÃ  acquise. En
regard, une panne de la table de compteurs aurait fermÃ© cette page Ã  des
gagnants lÃ©gitimes â€” et de travers : pendant le **mÃªme** incident, une
chasse encore ACTIVE aurait continuÃ© de rÃ©pondre, `loadHuntStepContext` ne
portant aucun seau. Une chasse close aurait Ã©tÃ© moins accessible qu'une
chasse ouverte, au moment prÃ©cis oÃ¹ son seul recours est cette page.

**Ce raisonnement ne s'exporte pas.** Les autres seaux d'identitÃ©
(`huntScanPlayer`, `loyaltyStampMember`, `cashier:lookup`) gardent des
**Ã©critures**, oÃ¹ un rejeu non bornÃ© consomme du stock, tamponne un
passeport ou remet un lot. L'exception tient Ã  ce que ce chemin est en
lecture seule, pas Ã  ce qu'il est public.

**Consequences** :
- **Ce seau ne borne pas un dÃ©bit, et l'affirmer serait faux.** Sa clÃ©
  contient le sha256 de la **valeur** d'un cookie `httpOnly` â€” cachÃ© Ã 
  JavaScript, pas Ã  l'utilisateur, qui peut en changer la valeur Ã  chaque
  requÃªte : les deux gardes amont passent (elles ne regardent que le NOM),
  le hash est neuf Ã  chaque coup, aucun seau ne se remplit. Il borne un
  porteur **coopÃ©ratif** â€” l'onglet laissÃ© ouvert, le rÃ©seau capricieux.
  Une premiÃ¨re rÃ©daction du commentaire annonÃ§ait qu'Â« un script en
  atteint le plafond en quelques secondes Â» : la **phrase a Ã©tÃ© corrigÃ©e
  plutÃ´t qu'une fausse garde ajoutÃ©e**. Un seau sur le jeton d'Ã©tape serait
  l'interrupteur qu'ADR-032 interdit â€” la carte de victoire de tous les
  joueurs d'un mÃªme lieu, fermÃ©e par un seul abuseur.
  > **Correction du 2026-08-03 (ADR-073)** : la phrase Â« l'IP est proscrite
  > par ADR-032 Â» citait l'ADR **Ã  contresens**, et la mÃªme erreur figurait
  > dans l'en-tÃªte de `loadHuntStepContext`. ADR-032 proscrit de **refuser**
  > sur une clÃ© partagÃ©e ; elle **prescrit** Ã  la place un seau large et
  > fail-open, Ã  valeur d'observabilitÃ©. Le raisonnement concluait de
  > Â« aucune clÃ© ne peut porter un refus Â» Ã  Â« rien Ã  faire Â», en sautant le
  > terme moyen que l'ADR pose â€” et que le dÃ©pÃ´t implÃ©mentait dÃ©jÃ  deux
  > fonctions plus loin (`observeSharedKey` + `huntScanIp`).
  >
  > **Suite du 2026-08-03 (`chantier/solde-bugs`) â€” ce constat n'est plus
  > seul : quelque chose est POSÃ‰ Ã€ CÃ”TÃ‰.** Â« Ce seau ne borne pas un
  > dÃ©bit Â» reste exact et le seau est dÃ©libÃ©rÃ©ment conservÃ© pour ce qu'il
  > borne rÃ©ellement (un porteur coopÃ©ratif). Mais le dÃ©bit qu'il ne borne
  > pas est dÃ©sormais **comptÃ©** : `observeSharedKey` sur (chasse, IP),
  > rÃ¨gle `huntRecallIp`, **fail-open**, intercalÃ© **entre la garde 2 et la
  > garde 3** â€” exactement la population que la garde 3 prÃ©tendait borner,
  > et l'IP est la seule clÃ© de ce chemin que l'appelant ne choisit pas.
  > **Le `failClosed: false` ci-dessus est intact : un compteur ne refuse
  > rien**, `observeSharedKey` ne rend aucune valeur. Seau **distinct** de
  > `huntStepIp` bien que les deux chargeurs servent la **mÃªme requÃªte** â€”
  > le rappel ne s'exÃ©cute qu'aprÃ¨s le refus du chargeur d'Ã©tape, qui a
  > dÃ©jÃ  consommÃ© son compteur, donc une clÃ© commune compterait un passage
  > pour deux (la raison mÃªme qui tient `huntStepIp` sÃ©parÃ© de
  > `huntScanIp`). SÃ©parÃ©s, **leur rapport est l'information** : la part du
  > trafic d'une chasse qui retombe sur le repli. Calibrage **dÃ©rivÃ© et non
  > inventÃ©** â€” identique Ã  `huntStepIp`, dont les requÃªtes comptÃ©es ici
  > sont un sous-ensemble strict.
- `loadHuntStepContext` reste non bornÃ© sur la mÃªme page (~4 lectures
  `service_role` par requÃªte) â€” prÃ©existant, hors pÃ©rimÃ¨tre, et c'est lui
  qui relativise le seau posÃ© : **l'attaquant n'obtient ici rien qu'il
  n'ait dÃ©jÃ ** par ce chemin-lÃ . ~~ConsignÃ© ouvert.~~ **RequalifiÃ© le
  2026-08-03 (ADR-073)** : le refus reste refusÃ©, mais le coÃ»t est
  dÃ©sormais **mesurÃ©** (3 lectures sans cookie, 4 avec un cookie
  arbitraire, 6 pour un joueur retrouvÃ© â€” le Â« ~4 Â» n'avait jamais Ã©tÃ©
  comptÃ©) et un compteur `huntStepIp` rend l'amplification visible.
- La vraie borne du chemin est ailleurs, et elle est Ã©crite : les deux
  gardes de cookie, l'exigence d'une complÃ©tion acquise, et l'absence
  d'Ã©criture.

**References** :
- ADR-032 (une clÃ© partagÃ©e ne porte jamais un REFUS ; elle peut porter un
  compteur large et fail-open â€” voir ADR-073, qui corrige la lecture qu'en
  faisait cette ADR)
- `src/lib/hunt-context.ts`, `src/lib/rate-limit.ts` (`RATE_LIMITS.huntRecall`,
  `RATE_LIMITS.huntStepIp`)


---

## ADR-071 : Une explication a une Ã©chÃ©ance â€” la grÃ¢ce va au COLLATÃ‰RAL, jamais Ã  la dÃ©cision

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
ADR-068 avait exclu de `purge_expired_reward_issuances` les annulations
causÃ©es par la rÃ©tention. Cette clause **n'avait pas d'Ã©chÃ©ance**, et
`sync_reward_issuance` Ã©crit `null::timestamptz as expires_at` pour HUIT de
ses dix branches â€” seules la roue et les pronostics reportent une Ã©chÃ©ance,
et les deux colonnes sources sont nullables. Pour ces familles, une ligne
annulÃ©e n'Ã©tait terminale pour aucune des trois branches du prÃ©dicat :
**aucun chemin ne la supprimait jamais**, alors qu'elle porte un `player_id`
et qu'il n'existe aucune purge de `public.players`. Une conservation de fait,
sans fin, sur une ligne rattachable Ã  une personne.

Le second dÃ©faut est une **asymÃ©trie sans fondement** : la grÃ¢ce allait Ã 
`purged` (la rÃ©tention) et pas Ã  `source_deleted` (le geste d'entretien du
commerÃ§ant), qui Ã©tait dÃ©truite la nuit mÃªme.

**Decision** :
1. Un **dÃ©lai de grÃ¢ce** court Ã  compter de `cancelled_at`, et non une
   conservation infinie ni une destruction immÃ©diate. La ligne n'est plus
   encaissable par aucun chemin dÃ¨s que sa source disparaÃ®t ; sa seule valeur
   restante est d'**expliquer** au client et au caissier, et une explication a
   une Ã©chÃ©ance.
2. La durÃ©e est **bornÃ©e** : `least(3 mois, fenÃªtre de rÃ©tention de
   l'organisation)`. La grÃ¢ce ne dÃ©passe jamais ce que l'organisation a
   dÃ©clarÃ©.
3. La grÃ¢ce va au **collatÃ©ral** â€” `purged` **et** `source_deleted` â€” jamais Ã 
   la **dÃ©cision** (`merchant`, et le repli des lignes sans cause connue).
4. Le point de dÃ©part est `cancelled_at`, **jamais** `issued_at`. La clause
   est **ANDÃ©e** au critÃ¨re d'Ã¢ge, jamais substituÃ©e : le dÃ©lai rÃ©el est le
   maximum des deux horloges.

**Rationale** :
**Trois mois est un arbitrage produit assumÃ©, sans appui mesurable â€” et c'est
la revue sÃ©curitÃ© qui a dÃ©moli les deux appuis que la premiÃ¨re rÃ©daction
avanÃ§ait, tous deux gravÃ©s dans un `comment on function`.** (a) Â« la plus
longue vie qu'un code de retrait puisse avoir ici Â», qui citait
`contests.code_ttl_seconds` plafonnÃ© Ã  90 jours : faux, cette colonne est
**nullable** et son propre commentaire dit Â« null : sans limite Â»,
`campaigns.code_ttl_seconds` de mÃªme, et les sept familles oÃ¹ cette grÃ¢ce
dÃ©cide de quelque chose n'ont **aucune colonne d'Ã©chÃ©ance** â€” leur code ne
meurt jamais. 90 jours est la plus longue Ã©chÃ©ance *finie configurable*, pas
la plus longue vie d'un code. (b) Â« le quart de la plus courte rÃ©tention
dÃ©clarable Â», qui citait un `<select>` Ã  12/24/36 mois : c'est du **client**.
La frontiÃ¨re serveur est `src/lib/validations/privacy.ts` (`min(1).max(60)`)
et le CHECK `00016:15` ; un propriÃ©taire qui poste `months=1` est acceptÃ©, et
trois mois y seraient le **triple** de la rÃ©tention, pas le quart. Les deux
appuis sont **retirÃ©s et non rÃ©Ã©crits** : rien dans ce produit ne borne la
durÃ©e pendant laquelle un client conserve un code devenu mort, et prÃ©tendre
le contraire est le motif rÃ©current que ce dÃ©pÃ´t se reproche. Ce qui est
Ã©noncÃ© dans le `comment on function` est donc la seule chose relisible dans
le code : la **borne**.

**Le motif de l'extension Ã  `source_deleted` est FACTUEL et non d'Ã©quitÃ©.**
Avant `20260902120000`, les triggers de miroir Ã©taient `after insert or
update` : quelle que soit la cause, la disparition de la source laissait la
ligne `cancelled_at is null`, donc **non terminale, donc jamais purgÃ©e â€” pour
les deux causes**. Cette migration a converti Â« jamais purgÃ©e Â» en Â« purgÃ©e
dÃ¨s le passage suivant du cron Â» pour les deux, et n'en a protÃ©gÃ© qu'une :
l'asymÃ©trie suivait le contour du risque que la revue prÃ©cÃ©dente avait nommÃ©
Ã  ce moment-lÃ , pas un principe. Le scÃ©nario qu'elle laissait ouvert est
rÃ©el â€” rÃ©tention 12 mois, un `CHASSE-â€¦` gagnÃ© il y a 14 mois et jamais
retirÃ© (la famille chasse n'a aucune Ã©chÃ©ance, rien ne l'avait clos), le
commerÃ§ant supprime la chasse aujourd'hui et coche la case d'ADR-063 :
`issued_at` est dÃ©jÃ  au-delÃ  de la rÃ©tention, le cron de la nuit mÃªme dÃ©truit
la ligne, et le client perd l'explication **alors mÃªme qu'il a quelqu'un Ã  qui
la demander**. La rÃ¨gle retenue ne porte donc pas sur Â« qui a dÃ©cidÃ© Â» mais
sur Â« cette ligne a-t-elle Ã©tÃ© close par une dÃ©cision PORTANT SUR CE LOT Â».

**`cancelled_at` et jamais `issued_at`** : pour la roue, `issued_at` **est**
`participations.created_at`, le critÃ¨re exact que `purge_expired_personal_data`
vient d'appliquer pour supprimer la source. Ancrer la grÃ¢ce dessus la rendrait
nulle pour la famille la plus frÃ©quente et rouvrirait, dÃ¨s le passage suivant
du cron, le trou fermÃ© la veille.

**Consequences** :
- Une ligne d'explication meurt au plus tard trois mois aprÃ¨s l'annulation, et
  plus tÃ´t si l'organisation a dÃ©clarÃ© une rÃ©tention plus courte.
- **Ce que la migration ne fait pas, Ã©crit ici plutÃ´t que dÃ©couvert** : elle
  ne donne d'Ã©chÃ©ance Ã  aucune des sept familles. Un lot **non annulÃ©** et
  jamais remis y reste conservÃ© sans fin, comme le veut `20260810120000`.
  Seul le sous-ensemble annulÃ© en collatÃ©ral est bornÃ©. ConsignÃ© ouvert.
- `cancelled_reason` continue de porter les deux sentinelles textuelles :
  elles ne dÃ©cident plus rien (ADR-072), mais restent un texte que le
  commerÃ§ant peut imiter.

**References** :
- ADR-068 (marquer plutÃ´t que dÃ©truire, partiellement corrigÃ©e), ADR-072 (la
  cause devient une colonne), ADR-063 (les six gardes destructives)
- `supabase/migrations/20260903120000_purged_reward_grace.sql`,
  `supabase/tests/reward_retention.test.sql`

---

## ADR-072 : La cause d'annulation est une colonne que l'application ne peut pas NOMMER â€” fiable par absence d'Ã©crivain, pas par contrÃ´le

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
ADR-069 posait le bon principe â€” vocabulaire fermÃ©, motif libre du commerÃ§ant
qui ne franchit jamais la frontiÃ¨re du client â€” et l'implÃ©mentait par le
mauvais mÃ©canisme : la cause se **dÃ©rivait du texte**, la caisse comparant
`cancelled_reason` aux deux sentinelles que le trigger y Ã©crit
(`causeDepuisMotif`). Or ce champ n'est pas Ã  nous. Il arrive dans le registre
par deux chemins, tous deux ouverts : `cancel_participation`, dont le motif
n'exige que cinq caractÃ¨res et que `sync_reward_issuance` recopie **tel quel**
pour la roue ; et, plus court encore, un `PATCH /rest/v1/participations` â€”
`00018:24` accorde `update` sur **toutes** les colonnes Ã  `authenticated`,
`00017:100` ouvre la policy Ã  l'`owner` â€” qui obtient le mÃªme rÃ©sultat **sans
la ligne `audit_logs`** que la RPC Ã©crit.

Ce qu'un commerÃ§ant obtenait en saisissant exactement `source purgÃ©e` : le
portefeuille affichait Ã  SON client Â« Personne ne l'a annulÃ© Â», le caissier
disait au client en face Â« Ce n'est une dÃ©cision de personne â€” ni la vÃ´tre, ni
celle de votre Ã©quipe Â», et la ligne gagnait la protection de rÃ©tention
rÃ©servÃ©e aux annulations automatiques. **ADR-069 retournÃ©e contre elle-mÃªme** :
au lieu d'imputer au commerÃ§ant un geste automatique, on laissait le
commerÃ§ant imputer Ã  l'automatisme son propre geste.

**Decision** :
La cause vit dans une colonne dÃ©diÃ©e, `reward_issuances.cancelled_source`, Ã 
`check` de vocabulaire fermÃ©, posÃ©e par **un seul Ã©crivain** â€” le trigger
`cancel_reward_issuance_on_source_delete`. Le repli Ã  la **lecture**, jamais
stockÃ©, est `merchant`.

**Rationale** :
**Ce qui rend la colonne fiable n'est pas un contrÃ´le, c'est une ABSENCE.**
`upsert_reward_issuance` â€” le miroir, seul chemin par lequel une Ã©criture
legacy atteint le registre â€” **ne nomme pas la colonne**, ni Ã  l'`insert`, ni
Ã  l'`on conflict do update` ; et `reward_issuances` est rÃ©voquÃ©e en entier de
`public, anon, authenticated`, donc aucun chemin PostgREST direct n'existe,
pour aucune colonne. Un `PATCH` sur `participations` ne peut donc pas
l'atteindre, quel que soit le texte postÃ©. Une garde qu'on peut oublier
d'appeler protÃ¨ge moins qu'un chemin d'Ã©criture qui n'existe pas.

Le repli `merchant` est le **sens sÃ»r** : une annulation dont on ne sait rien
est traitÃ©e comme une dÃ©cision, ce qui n'accorde aucune des faveurs rÃ©servÃ©es
Ã  l'automatique â€” ni la grÃ¢ce d'ADR-071, ni la phrase qui n'accuse personne.

**Aucune contrainte d'Ã©tat ne lie la colonne Ã  `cancelled_at`**, et ce n'est
pas un oubli : `upsert_reward_issuance` Ã©crit `cancelled_at = excluded.â€¦`, y
compris `null`, sans toucher `cancelled_source` ; un `check` lÃ¨verait alors
**dans le trigger `after` du miroir**, donc Ã  l'intÃ©rieur de la transaction de
l'Ã©criture legacy, et la ferait ROLLBACK. C'est trÃ¨s exactement le droit de
**veto** du miroir sur l'autoritÃ© que `20260805150000` refuse dÃ©jÃ  deux fois.
Les deux lecteurs testent `cancelled_at` avant de consulter la colonne.

**Consequences** :
- `causeDepuisMotif` et les deux sentinelles recopiÃ©es cÃ´tÃ© applicatif sont
  **retirÃ©es** : la duplication qu'elles gardaient n'existe plus. La garde des
  littÃ©raux SQL demeure, dÃ©sormais adossÃ©e Ã  `pg_proc` et non Ã  un fichier.
- **Le repli `merchant` est indistinguable** entre Â« annulation dÃ©cidÃ©e Ã  la
  main Â» et Â« cause illisible Â» : aucune surface ne peut plus signaler une
  valeur hors vocabulaire. Alignement **dÃ©libÃ©rÃ©** entre la caisse et le
  portefeuille â€” deux Ã©crans qui parlent au mÃªme client ne doivent pas se
  contredire â€” mais Ã©crit ici pour ne pas Ãªtre dÃ©couvert.
- `cancelled_reason` reste Ã©crit par le trigger et reste du texte libre que le
  commerÃ§ant peut imiter. Il ne gouverne plus aucune dÃ©cision.
- Rattrapage des lignes dÃ©jÃ  annulÃ©es par un `update` unique â€” le seul endroit
  du fichier oÃ¹ le texte dÃ©cide d'une cause, et il ne s'exÃ©cute qu'une fois.
  **MesurÃ© en production le 2026-08-03** : `reward_issuances` y porte 2 lignes
  et ZÃ‰RO annulÃ©e ; ce rattrapage n'y touche rien, il existe pour la CI, le
  seed et les bases de dÃ©veloppement.

**References** :
- ADR-069 (le principe, retournÃ© dans son mÃ©canisme), ADR-071 (la grÃ¢ce, qui
  s'appuie sur cette cause dÃ©sormais fiable), ADR-055 (le portefeuille)
- `supabase/migrations/20260903120000_purged_reward_grace.sql`,
  `src/lib/annulation-cause.ts`

---

## ADR-073 : Une clÃ© partagÃ©e ne peut pas REFUSER â€” mais elle peut COMPTER, et Â« rien Ã  faire Â» saute ce terme moyen

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
`loadHuntStepContext` sert la page publique d'Ã©tape de chasse, atteignable par
quiconque photographie un QR de vitrine, et n'Ã©tait bornÃ© par **rien**.
**Quatre chantiers successifs l'ont consignÃ© Â« non bornÃ© Â» sans rien poser**,
chacun concluant par le mÃªme raisonnement : le jeton d'Ã©tape est sur un QR
partagÃ© (un seau dessus fermerait la chasse Ã  tout le lieu), le cookie de
chasse n'existe pas au premier scan â€” or le premier scan **est** le produit â€”
et Â« l'IP est proscrite par ADR-032 Â».

**Cette derniÃ¨re phrase cite ADR-032 Ã  contresens.** L'ADR dit l'inverse :
une clÃ© partagÃ©e ne porte **jamais un refus**, mais elle porte un seau
**large et fail-open, Ã  valeur d'observabilitÃ©**. C'est *refuser* sur l'IP qui
est proscrit, pas *compter*. Et le dÃ©pÃ´t implÃ©mentait dÃ©jÃ  exactement cela
deux fonctions plus loin (`observeSharedKey` + `huntScanIp`). Le raisonnement
concluait de Â« aucune clÃ© ne peut porter un refus Â» Ã  Â« rien Ã  faire Â», en
sautant le terme moyen que l'ADR prescrit.

**Decision** :
1. **Le seau bloquant reste REFUSÃ‰**, et c'est dÃ©sormais une dÃ©cision Ã©crite,
   pas une dette qui traÃ®ne. Recopier ici le seau de `loadHuntRecallContext`
   serait **pire qu'ailleurs** : l'amplification passe par le chemin **sans
   cookie**, donc le seau siÃ©gerait sur la seule route que l'abuseur ne prend
   jamais.
2. **Le coÃ»t public est MESURÃ‰ et Ã©pinglÃ© table par table** : trois lectures
   `service_role` sans cookie, quatre avec un cookie `lc-hunt-<id>` arbitraire
   (qui coÃ»te une lecture de plus sans rien ouvrir), six pour un joueur
   retrouvÃ©. Les documents annonÃ§aient Â« ~4 Â» â€” personne n'avait comptÃ©.
3. Un `observeSharedKey` sur (chasse, IP), seau `huntStepIp`, **fail-open,
   jamais un refus**, posÃ© **aprÃ¨s** la rÃ©solution de l'Ã©tape.

**Rationale** :
Le seau est **distinct** de `huntScanIp` et non partagÃ© avec lui :
`stampHuntStep` traverse ce chargeur avant de tamponner, les fondre ferait
compter deux fois un mÃªme geste et rendrait les deux signaux illisibles. Le
rapport entre les deux est d'ailleurs l'information utile â€” beaucoup de pages
pour peu de tampons, c'est un balayage ; l'inverse n'existe pas.

L'ordre compte : le compteur est posÃ© **aprÃ¨s** la garde d'Ã©tape, sinon il
mesurerait aussi les requÃªtes qu'on rejette dÃ©jÃ  pour rien.

**Consequences** :
- ~~`clientIpFromHeaders` rend `"unknown"` hors proxy dÃ©clarÃ© : le compteur ne
  mesure quelque chose que lÃ  oÃ¹ `TRUSTED_PROXY_PROVIDER`/`VERCEL` est posÃ©.~~
  **TraitÃ© le 2026-08-03 (`chantier/solde-bugs`), et sur CE module â€” pas
  ailleurs.** Le dÃ©faut rÃ©el n'Ã©tait pas le `"unknown"` (dÃ©libÃ©rÃ© : les
  en-tÃªtes gÃ©nÃ©riques sont forgeables) mais sa **concatÃ©nation telle quelle**
  dans la clÃ©, qui versait tous les visiteurs dans une seule ligne agrÃ©gÃ©e Ã  un
  seuil calibrÃ© pour un seul d'entre eux. `pressionParIp`
  (`src/lib/request-ip.ts`) pose dÃ©sormais la clÃ© `ip-non-mesuree` et suffixe
  l'Ã©vÃ©nement en `.ip_non_mesuree` : **on garde la dÃ©tection, on perd
  l'attribution, et on le dit deux fois** â€” s'abstenir de compter aurait jetÃ©
  la premiÃ¨re avec la seconde, alors que sous un dÃ©bit rÃ©el l'agrÃ©gat franchit
  le seuil et reste le seul signal lÃ  oÃ¹ aucun proxy n'est dÃ©clarÃ©. **Ne
  couvre que `huntStepIp` et `huntRecallIp`** : la vingtaine d'autres
  compteurs par IP du dÃ©pÃ´t gardent l'ancien comportement, ce qui est Ã©crit
  dans le docstring de la fonction plutÃ´t que prÃ©sentÃ© comme une garde
  transverse.
- **Le calibrage (200 / 10 min) est hÃ©ritÃ© de `huntScanIp` sans mesure propre
  Ã  cette page.** MÃªme lieu, mÃªme Wi-Fi, mÃªme ordre de grandeur de visiteurs :
  c'est un point de dÃ©part raisonnÃ©, pas un chiffre mesurÃ©. Ã‰crit comme tel.
  **Et `huntRecallIp` en hÃ©rite Ã  son tour (2026-08-03) : trois seuils, une
  seule origine.** Aucune mesure n'est possible aujourd'hui â€” la production
  porte une seule organisation, celle du propriÃ©taire ; un chiffre inventÃ© ne
  vaudrait pas mieux qu'un chiffre hÃ©ritÃ© et raisonnÃ©.
- Ne **pas** repasser `huntStepIp` en `failClosed` : ce serait l'interrupteur
  qu'ADR-032 interdit, sur la page la plus exposÃ©e du module.

**References** :
- ADR-032 (le principe, citÃ© ici jusqu'Ã  son terme moyen), ADR-070 (le seau du
  chemin voisin, et sa section Consequences corrigÃ©e)
- `src/lib/hunt-context.ts`, `src/lib/rate-limit.ts` (`RATE_LIMITS.huntStepIp`)

---

## ADR-074 : Une garde TEXTUELLE et une garde COMPORTEMENTALE ne prouvent pas la mÃªme chose â€” on garde les deux, et on Ã©crit ce qu'aucune ne prouve

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
`player-identity-coverage.test.ts` Ã©tait censÃ© garantir que les quatre modules
d'offre de tour (calendrier, fidÃ©litÃ©, quiz, parrainage) posent bien le pont
d'identitÃ© `campaign` qu'ADR-066 exige. Il est **textuel** : il cherche l'appel
dans le fichier. QA l'a dÃ©montrÃ© aveugle en prÃ©fixant les quatre appels par
`void 0 &&` â€” la suite est restÃ©e **entiÃ¨rement verte**. Elle prouvait qu'un
appel *existe dans un fichier*, jamais qu'il est *atteignable*.

**Decision** :
Un second fichier, `src/actions/offered-spin-bridge.test.ts`, **exÃ©cute** les
quatre actions contre des doubles et observe l'appel, avec deux
contre-exemples par module (tour perdant, roue sans lot) pour qu'un pont posÃ©
inconditionnellement ne passe pas non plus. **L'assertion textuelle est
CONSERVÃ‰E**, et l'en-tÃªte dit dÃ©sormais qui prouve quoi â€” et ce qu'aucune des
deux ne prouve.

**Rationale** :
Les deux gardes ont des angles morts **complÃ©mentaires**, et c'est la seule
raison de payer les deux. La textuelle se **dÃ©rive du dossier `src/actions`** :
un cinquiÃ¨me module d'offre y arrive tout seul, et sera couvert le jour oÃ¹
quelqu'un l'Ã©crira. La comportementale Ã©numÃ¨re quatre modules **Ã  la main** :
elle ne verra jamais le cinquiÃ¨me, mais elle est la seule Ã  distinguer un
appel atteignable d'un appel mort.

**L'Ã©cart entre les deux fichiers EST la dÃ©monstration**, et il est mesurÃ© :
sur le mÃªme sabotage (`void 0 &&`, vÃ©rifiÃ© par `grep -c` sur disque), la
comportementale rend **4 rouges / 8 verts**, la textuelle **15 verts, 0
rouge**. La cÃ©citÃ© est reproduite, pas supposÃ©e.

**Consequences** :
- Un cinquiÃ¨me module d'offre sera attrapÃ© par la textuelle mais **pas** par
  la comportementale, qu'il faudra Ã©tendre Ã  la main. Ã‰crit dans l'en-tÃªte du
  fichier, pas seulement ici.
- GÃ©nÃ©ralisation retenue au-delÃ  de ce cas : **une garde qui lit du texte
  prouve une prÃ©sence, jamais une atteignabilitÃ©.** Quand elle garde un
  invariant qui coÃ»te de l'argent ou de la confiance, elle demande une
  jumelle qui exÃ©cute.

**Addendum du 2026-08-04 â€” la jumelle est enfin possible pour les composants.**
Cette ADR a Ã©tÃ© appliquÃ©e pendant un an aux seules *actions*, et jamais aux
*composants*, pour une raison qui n'Ã©tait Ã©crite nulle part ici : il n'existait
aucun moyen d'exÃ©cuter du JSX dans ce dÃ©pÃ´t. Une douzaine d'en-tÃªtes le
disaient Ã  sa place (Â« le projet n'a pas d'environnement de rendu React Â»),
transformant une limite d'outillage en doctrine. Cette limite est levÃ©e
(ADR-076) et la doctrine ne change pas d'un mot : les deux formes restent
complÃ©mentaires, **la textuelle pour l'exhaustivitÃ©, l'exÃ©cutable pour
l'atteignabilitÃ©**. Ce qui change est le pÃ©rimÃ¨tre â€” un composant dont une
branche non rendue coÃ»terait cher relÃ¨ve dÃ©sormais de la seconde phrase de la
gÃ©nÃ©ralisation, pas de la premiÃ¨re.

**References** :
- ADR-066 (le pont d'identitÃ© posÃ© au point d'Ã©criture)
- ADR-076 (l'environnement de rendu qui rend la jumelle possible cÃ´tÃ© Ã©cran)
- `src/lib/player-identity-coverage.test.ts`,
  `src/actions/offered-spin-bridge.test.ts`

---

## ADR-075 : Une IP qu'on n'a pas su lire se COMPTE quand mÃªme â€” mais sous une Ã©tiquette et un nom d'Ã©vÃ©nement qui l'avouent

**Date** : 2026-08-03
**Statut** : acceptÃ©

**Context** :
`clientIpFromHeaders` rend `"unknown"` dÃ¨s qu'aucun proxy de confiance n'est
dÃ©clarÃ© (`TRUSTED_PROXY_PROVIDER` / `VERCEL`), et c'est **dÃ©libÃ©rÃ©** : les
en-tÃªtes gÃ©nÃ©riques sont forgeables si l'origine est joignable en direct. Le
dÃ©faut n'Ã©tait pas lÃ . Il Ã©tait que les appelants **concatÃ©naient cette valeur
telle quelle** dans leur clÃ© de seau : tous les visiteurs tombaient alors dans
une **unique ligne agrÃ©gÃ©e** `â€¦:unknown`, Ã  un seuil calibrÃ© pour **un seul**
d'entre eux. Deux confusions en dÃ©coulaient, et aucune n'est signalÃ©e nulle
part : un dÃ©passement nommait un seau qui ne dÃ©signe personne (impossible de
distinguer une vraie pression mono-IP d'un agrÃ©gat), et un zÃ©ro sain Ã©tait
indistinguable d'un zÃ©ro aveugle.

**Decision** :
Un module pur, `pressionParIp` (`src/lib/request-ip.ts`), traversÃ© par les
compteurs avant toute mise en seau. Quand l'IP est illisible : la composante de
clÃ© devient `ip-non-mesuree`, et le nom de l'Ã©vÃ©nement gagne le suffixe
`.ip_non_mesuree`. **On compte quand mÃªme.**

**Rationale** :
L'alternative honnÃªte â€” ne rien compter quand on ne sait pas qui compter â€”
aurait jetÃ© la **dÃ©tection** avec l'**attribution**. Sous un dÃ©bit rÃ©el,
l'agrÃ©gat franchit le seuil : c'est le seul signal qui subsiste lÃ  oÃ¹ aucun
proxy n'est dÃ©clarÃ©, c'est-Ã -dire prÃ©cisÃ©ment sur les dÃ©ploiements les moins
instrumentÃ©s. On garde donc la dÃ©tection, on assume la perte d'attribution, et
on la **dit deux fois** : dans la **clÃ©** (`ip-non-mesuree` ne peut pas se lire
comme une adresse, contrairement Ã  `unknown` qui ressemble Ã  une valeur) et
dans le **nom de l'Ã©vÃ©nement** (sÃ©rie distincte, que personne n'agrÃ¨ge par
mÃ©garde avec la sÃ©rie attribuÃ©e). Deux sÃ©ries qu'aucun tableau de bord ne peut
confondre, ni par clÃ© ni par nom.

La rÃ¨gle gÃ©nÃ©rale : **une mesure qu'on ne peut pas attribuer reste une mesure,
Ã  condition qu'elle avoue son dÃ©faut d'attribution dans son propre nom.** Le
piÃ¨ge n'est pas de mesurer grossiÃ¨rement, c'est de rendre un chiffre grossier
sous le nom d'un chiffre fin.

**Consequences** :
- **Seuls `huntStepIp` et `huntRecallIp` passent par ce module.** La vingtaine
  d'autres `observeSharedKey` clÃ©s sur l'IP (quiz, calendrier, jackpot,
  fidÃ©litÃ©, parrainage, Ã©vÃ©nement, pronostics, skill, play, mÃ©ta-progression)
  concatÃ¨nent toujours l'IP brute et retombent dans le seau agrÃ©gÃ©. **Ã‰crit
  dans le docstring de `pressionParIp`**, Ã  l'endroit exact oÃ¹ quelqu'un
  croirait tenir une garde transverse â€” et non seulement ici.
- Les migrer casserait plusieurs gardes **textuelles** existantes
  (`quiz.test.ts`, `calendar.test.ts`, `referral.test.ts` matchent la source Ã 
  la regex) : c'est un chantier Ã  part entiÃ¨re, pas une ligne.
- Le suffixe crÃ©e une **seconde sÃ©rie** par compteur migrÃ©. Un tableau de bord
  qui ne connaÃ®trait que la sÃ©rie d'origine deviendrait silencieux hors proxy
  dÃ©clarÃ© â€” c'est le comportement voulu (un zÃ©ro attribuÃ© **est** vrai), mais
  il faut lire les deux sÃ©ries pour avoir le total.

**References** :
- ADR-032 (une clÃ© partagÃ©e ne porte jamais un REFUS), ADR-073 (le terme moyen :
  elle porte un compteur large et fail-open), ADR-070 (le seau voisin)
- `src/lib/request-ip.ts`, `src/lib/hunt-context.ts`,
  `src/lib/rate-limit.ts` (`huntStepIp`, `huntRecallIp`)

---

## ADR-076 : Le rendu React devient possible en test â€” mais `node` reste le dÃ©faut, et les gardes textuelles restent

**Date** : 2026-08-04
**Statut** : acceptÃ©

**Context** :
Douze en-tÃªtes de ce dÃ©pÃ´t affirmaient Â« le projet n'a pas d'environnement de
rendu React Â», et s'en servaient pour justifier deux pratiques : extraire toute
logique hors des composants (modules purs), et garder le markup par des gardes
**textuelles** qui lisent la source. La phrase Ã©tait exacte â€”
`vitest.config.ts` n'incluait que `src/**/*.test.ts` et tournait en
`environment: "node"`. Elle avait une consÃ©quence que personne n'avait Ã©crite :
un test de composant n'y Ã©tait pas *rouge*, **il n'Ã©tait pas collectÃ©**.

Le chantier `chantier/echeance-lots` a butÃ© dessus deux fois. `RedeemCodeScreen`
a **deux vues mutuellement exclusives** (code valable / code expirÃ©) et le lien
vers le portefeuille doit Ãªtre dans les deux : un import unique en tÃªte de
fichier satisfait une garde textuelle mÃªme si le lien n'est posÃ© que dans
l'une, et le cas manquÃ© serait le plus utile. Et le champ cachÃ© de
`CodeTtlDaysField` â€” le maillon dont dÃ©pendent les deux gardes du chantier â€”
n'Ã©tait vÃ©rifiÃ© par personne, parce que ce qu'il faut mesurer est *ce que le
navigateur enverrait*.

**Decision** :
`happy-dom` + `@testing-library/react`, et `src/**/*.test.tsx` ajoutÃ© Ã 
`include`. **`environment: "node"` reste le dÃ©faut** : un fichier qui rend un
composant demande le sien par la directive `// @vitest-environment happy-dom`.

**Les gardes textuelles existantes sont CONSERVÃ‰ES, sans exception.**

**Rationale** :
Le dÃ©faut `node` n'est pas une timiditÃ©. Les ~2860 tests de logique n'ont aucun
besoin d'un DOM ; le leur imposer coÃ»terait du temps Ã  chaque exÃ©cution, pour
rien. MesurÃ© : +17 s d'environnement sur la suite, pour trois fichiers de
rendu. Le coÃ»t est payÃ© par ceux qui en profitent et par personne d'autre.

Conserver les gardes textuelles n'est pas de la prudence non plus, c'est leur
angle mort qui est le bon : elles **se dÃ©rivent du systÃ¨me de fichiers**, donc
elles attrapent l'Ã©cran Ã©crit demain que personne n'aura pensÃ© Ã  tester â€” c'est
exactement ce qui a trouvÃ© les pronostics manquants au chantier prÃ©cÃ©dent. Un
test de rendu ne voit que les composants qu'on a dÃ©cidÃ© de monter.

Deux d'entre elles gagnent mÃªme un motif **plus fort** qu'avant : celles de
`player-wallet-screen.test.ts` ferment des interdits d'**absence** (pas de
jeton dans l'URL, pas de code journalisÃ©, pas de cookie posÃ©), or un rendu ne
prouve jamais qu'une chose n'existe nulle part â€” seulement qu'elle n'apparaÃ®t
pas sur le montage qu'on a choisi.

**La dÃ©monstration est chiffrÃ©e**, comme ADR-074 l'exige : sabotage retirant le
lien de la **seule** vue expirÃ©e, import laissÃ© en place (`grep` : 2 â†’ 1
occurrence). Une garde textuelle sur l'import serait restÃ©e **verte**. Le test
de rendu rend **1 rouge / 3 verts**, et le rouge dÃ©signe la vue exacte.

**Consequences** :
- Les **quinze** en-tÃªtes de code (plus `docs/architecture.md` et une entrÃ©e de
  `docs/bugs.md`) sont corrigÃ©s en place â€” c'est le motif que ce dÃ©pÃ´t se
  reproche depuis cinq chantiers (une entrÃ©e qui affirme un Ã©tat dÃ©passÃ©), et
  il se paierait ici Ã  chaque relecture. **Le chiffre a d'abord Ã©tÃ© annoncÃ© Ã 
  douze, et il Ã©tait faux** : le recensement passait par `grep â€¦ | head -12`,
  et le plafond a Ã©tÃ© lu comme un total â€” voir la consÃ©quence suivante.
  **Aucune conclusion n'est annulÃ©e** :
  les modules purs restent extraits, pour une raison qui ne dÃ©pendait pas de la
  contrainte â€” une rÃ¨gle se teste sur ses entrÃ©es et n'a pas Ã  exiger le
  montage d'un Ã©cran.
- PiÃ¨ge mesurÃ© et consignÃ© dans le test : **`textContent` n'est pas le nom
  accessible**. Il concatÃ¨ne tout le DOM, `aria-hidden` compris, que
  l'algorithme accname exclut. Mesurer `textContent` pour parler
  d'accessibilitÃ©, c'est mesurer ce qu'un lecteur d'Ã©cran n'annonce pas â€”
  utiliser l'option `name` de `getByRole`, qui passe par le vrai calcul.
- **Occurrence NEUVE du motif Â« le dÃ©tecteur ment Â», et elle ne vient d'aucun
  test** : le recensement des en-tÃªtes Ã  corriger a Ã©tÃ© fait par
  `grep â€¦ | head -12`, et le plafond a rendu exactement douze lignes â€” lues
  comme un total. Trois fichiers de code et deux documents sont restÃ©s faux,
  **publiÃ©s comme corrigÃ©s** dans un commit, une PR et quatre documents. Ni un
  sabotage qui ne mord pas, ni un dÃ©tecteur muet : un **plafond d'affichage lu
  comme une mesure**. RattrapÃ© non par un test mais par une question du
  propriÃ©taire (Â« il ne reste plus rien ? Â») suivie d'un recomptage sans
  plafond, qui a en outre trouvÃ© une variante de formulation
  (`sms-window.ts`, Â« pas d'environnement de rendu Â» sans Â« React Â») qu'aucune
  des deux passes prÃ©cÃ©dentes n'aurait vue. **RÃ¨gle retenue : un compte qu'on
  publie ne se lit jamais sur une sortie tronquÃ©e â€” `wc -l` avant `head`, et
  une recherche de variantes avant de conclure Ã  l'exhaustivitÃ©.**
- Trois fichiers de rendu seulement : l'environnement n'est pas une invitation
  Ã  monter tous les Ã©crans. La rÃ¨gle Â« extraire ce qui se teste Â» reste la
  premiÃ¨re rÃ©ponse ; le rendu sert aux branches **d'affichage** qu'aucune
  extraction ne peut sortir du composant.

**References** :
- ADR-074 (textuelle vs exÃ©cutable â€” la doctrine, inchangÃ©e, addendum du mÃªme jour)
- `vitest.config.ts`, `src/components/wheel/claim-form.test.tsx`,
  `src/components/dashboard/code-ttl-days-field.test.tsx`,
  `src/components/wallet/lien-portefeuille.test.tsx`

## ADR-077 : Une rÃ¨gle Ã©crite huit fois n'est pas Â« Ã  corriger huit fois Â», c'est une FORME Ã  supprimer â€” et une frontiÃ¨re d'agent n'est pas une frontiÃ¨re de domaine

**Date** : 2026-08-04
**Statut** : acceptÃ©

**Context** :
Le droit effectif d'un module â€” Â« ce commerÃ§ant peut-il publier ce jeu ? Â» â€”
Ã©tait Ã©crit **huit fois** en TypeScript : six fonctions `hasâ€¦Access` dans
`src/lib/subscription.ts`, plus `hasQuizAccess` dans `quiz-context.ts` et
`hasReferralAccess` dans `referral-context.ts`.

Le lot P0.2 (migration `20260907120000`) a changÃ© cette rÃ¨gle : Â« tout add-on
peut Ãªtre achetÃ© seul Â» (docs/codex-handoff.md Â§2) fait qu'un **octroi datÃ©
vivant** ouvre le module sans exiger ni abonnement ni boolÃ©en `addon_*`. La
garde SQL `org_has_module_access` porte la nouvelle branche, et **six** des
huit fonctions TypeScript l'ont reÃ§ue : exactement celles qui se trouvaient
dans le fichier qu'on avait ouvert.

Les deux autres ne l'ont pas reÃ§ue, et leur en-tÃªte disait pourquoi :

> dÃ©fini LOCALEMENT (le fichier `subscription.ts` relÃ¨ve de l'agent
> stripe-billing, comme pour le parrainage)

Ce n'est pas une frontiÃ¨re technique, c'est une frontiÃ¨re de **rÃ©partition du
travail entre agents**. Elle a tenu tant que la rÃ¨gle ne bougeait pas.

ConsÃ©quence mesurÃ©e avant correction : un commerÃ§ant qui achÃ¨te le seul **Quiz
express** (15 â‚¬/7 j au catalogue) ou le seul **Bouche-Ã -oreille** (12 â‚¬/mois)
obtient de Postgres le droit de publier son module, et de l'Ã©cran un refus.
Exactement le module qu'il vient de payer, et le seul qu'il ait payÃ©.

**Decision** :
La rÃ¨gle est **retirÃ©e des huit** et concentrÃ©e dans `droitEffectifModule`,
miroir unique de `org_has_module_access`. Les huit fonctions **restent** â€”
quelque quatre-vingts appelants les nomment â€” mais comme **faÃ§ades sans
rÃ¨gle** : un `return droitEffectifModule("hunts", org, now)`.

Deux propriÃ©tÃ©s sont confiÃ©es au compilateur plutÃ´t qu'Ã  la vigilance :

* `MODULE_ADDON_COLUMN` porte l'association module â†’ colonne `addon_*`, avec
  `wheel: null` **Ã©crit** plutÃ´t qu'absent, pour que `satisfies` oblige Ã 
  constater qu'aucun add-on ne conditionne la roue ;
* `ChampsModule<M>` **calcule depuis cette table** les champs qu'un appelant
  doit fournir. Demander le droit du quiz sans avoir sÃ©lectionnÃ© `addon_quiz`
  ne compile plus.

La paritÃ© avec le SQL n'est pas recopiÃ©e mais **lue** : `module-access-parity`
parse le `case p_module` de la migration et le compare Ã  la constante.

**Consequences** :
* Le dÃ©faut ne peut plus se reproduire par oubli local : il n'y a plus de lieu
  local. Une rÃ¨gle qui change se corrige Ã  un endroit, ou ne se corrige nulle
  part â€” et le second cas est visible.
* La classe de dÃ©faut Â« colonne jamais chargÃ©e qui se lit `undefined` et se
  comporte comme `false` Â», dÃ©jÃ  payÃ©e deux fois sur ce dÃ©pÃ´t, est fermÃ©e pour
  ce chemin : `tsc` rÃ©clame la colonne.
* **Ce que la garde de paritÃ© ne prouve pas** : elle lit un **fichier** de
  migration, pas `pg_proc`. Une redÃ©finition ultÃ©rieure de
  `org_has_module_access` passerait inaperÃ§ue. Garde textuelle au sens
  d'ADR-074 â€” elle prouve que les deux dÃ©clarations sont d'accord, pas que
  celle-ci est la derniÃ¨re.
* **RÃ¨gle gÃ©nÃ©rale retenue** : une rÃ¨gle Ã©crite N fois ne se corrige pas N
  fois. On ne corrige jamais que les copies qu'on a sous les yeux, et le
  nombre de copies restantes est prÃ©cisÃ©ment ce que personne ne mesure. Le
  geste juste est de supprimer la forme, pas de rattraper l'Ã©cart.
* **Corollaire sur l'organisation du travail** : dÃ©couper le code selon le
  pÃ©rimÃ¨tre des agents qui l'Ã©crivent fabrique des frontiÃ¨res qui ne
  correspondent Ã  rien dans le domaine. Un droit de module est **une** question
  et doit avoir **un** lieu de rÃ©ponse, quel que soit l'agent qui le touche.

**References** :
- ADR-074 (garde textuelle vs comportementale â€” ce qu'une garde qui lit un
  fichier prouve et ne prouve pas)
- `src/lib/subscription.ts` (`droitEffectifModule`, `MODULE_ADDON_COLUMN`,
  `ChampsModule`), `src/lib/module-access-parity.test.ts`
- migration `20260907120000_p0_lot2_octrois_dates.sql` (`org_has_module_access`)

## ADR-078 : DÃ©couvrir, prÃ©parer, publier â€” un seul boolÃ©en d'accÃ¨s faisait payer pour voir ce qu'on achÃ¨terait

**Date** : 2026-08-04
**Statut** : acceptÃ©

**Context** :
Le cahier partagÃ© (docs/codex-handoff.md Â§3) demande de Â« sÃ©parer et revalider
partout `canExplore`, `canEditDraft` et `canPublish` Â». Aucun des trois
n'existait : le dÃ©pÃ´t n'avait qu'un boolÃ©en d'accÃ¨s par module, et il gardait
tout ou rien. Sept pages de module rendaient, sans le droit, **uniquement** une
carte d'offre â€” pas de liste, pas de formulaire, rien Ã  faire.

Le produit vend pourtant la **publication**, pas la dÃ©couverte. Avec un boolÃ©en
unique, un commerÃ§ant ne voit rien avant d'avoir payÃ©, donc ne sait pas ce
qu'il achÃ¨terait ; et il ne peut pas prÃ©parer son calendrier de l'Avent en
octobre pour ne payer qu'en dÃ©cembre.

**Decision** :
Trois capacitÃ©s distinctes, calculÃ©es par `capacitesModule` (module pur) :

* **`canExplore`** â€” ouvert Ã  `owner` et `editor`, toujours. Le caissier est
  refusÃ© **avant** tout calcul de droit : inutile de parler d'achat Ã  quelqu'un
  que l'achat n'ouvrirait pas.
* **`canEditDraft`** â€” ouvert si le module est payÃ©, sinon bornÃ© Ã  **un**
  brouillon par organisation et par module.
* **`canPublish`** â€” le droit effectif, et lui seul.

`droitEffectif` est une **entrÃ©e** de ce module, jamais un calcul : le
recalculer y refabriquerait la seconde source de vÃ©ritÃ© qu'ADR-077 vient de
supprimer.

Le message est calibrÃ© sur l'audience : le propriÃ©taire lit une invitation Ã 
ouvrir le module ; l'Ã©diteur lit Â« demandez au propriÃ©taire Â», **sans prix,
sans Stripe, sans abonnement** â€” il ne peut rien en faire, et le lui montrer
l'envoie chercher un Ã©cran qu'il n'a pas le droit d'ouvrir.

**Consequences** :
* **`canPublish` est un calcul d'AFFICHAGE et ne garde rien.** Ce qui empÃªche
  rÃ©ellement de publier vit en base depuis le lot P0.1 :
  `assert_module_publish_allowed`, le trigger `guard_module_publication` et les
  rÃ©vocations de colonne `status` qui ferment le `PATCH` PostgREST direct. Un
  Ã©cran Ã©vite de proposer un bouton qui Ã©chouera ; il ne protÃ¨ge pas.
* **Le quota de brouillon borne une COURTOISIE, pas une recette.** Le
  contourner ne donne qu'un second brouillon, jamais une expÃ©rience publiÃ©e.
  C'est le motif explicite de son **absence de contrepartie SQL** : neuf
  triggers pour borner un inconvÃ©nient seraient un coÃ»t sans rapport avec ce
  qu'ils Ã©vitent. Il est nÃ©anmoins appliquÃ© cÃ´tÃ© serveur dans les huit actions
  de crÃ©ation â€” une server action reste POSTable en direct â€” avec le **mÃªme
  calcul** que l'Ã©cran, pour qu'une page et son action ne puissent pas rÃ©pondre
  diffÃ©remment.
* `brouillonsExistants` est **requis** et non optionnel Ã  zÃ©ro : un appelant
  qui l'oublierait obtiendrait `canEditDraft` vrai en toutes circonstances,
  soit le refus le plus permissif possible. Le rendre obligatoire fait Ã©chouer
  `tsc` lÃ  oÃ¹ un dÃ©faut aurait produit un silence.
* Le sens des erreurs est dÃ©libÃ©rÃ© : le chargeur d'octrois dÃ©grade vers le
  refus (une panne ne doit jamais accorder un module payant), et le compteur de
  brouillons **aussi** â€” rendre 0 sur panne transformerait une base
  indisponible en quota illimitÃ©.
* **Reste ouvert** : les huit contextes **publics** ne renseignent pas
  `live_module_grants`, donc un module ouvert par un octroi seul reste fermÃ© au
  **joueur**. Sans effet tant qu'aucun chemin d'achat ne crÃ©e d'octroi ; Ã 
  fermer avec le lot de paiement, faute de quoi la premiÃ¨re vente d'add-on
  autonome produira des pages de jeu introuvables.

**References** :
- ADR-077 (le droit effectif, source unique)
- `src/lib/module-capabilities.ts`, `src/lib/module-capabilities-server.ts`,
  `src/lib/quota-brouillons.ts`, `src/lib/module-resources.ts`
- migration `20260905120000_p0_gardes_publication.sql` (ce qui garde vraiment)

---

## ADR-079 : Quand la correction Ã©vidente est pire que le dÃ©faut, la bonne livraison est une GARDE â€” et elle se pose lÃ  oÃ¹ elle ferme les trois portes

**Date** : 2026-08-05
**Statut** : AcceptÃ© â€” **garde LEVÃ‰E le 2026-08-05 par ADR-081**

> **Ce que cette ADR dÃ©crit n'est plus l'Ã©tat du code.** La garde
> `venteEnLigneOuverte` a Ã©tÃ© levÃ©e le jour mÃªme : les deux add-ons mensuels
> sont vendables. Sa section Â« Ce qu'il faudra pour lever la garde Â» a Ã©tÃ©
> exÃ©cutÃ©e point par point â€” voir ADR-081.
>
> Le raisonnement reste valable et c'est pourquoi cette ADR n'est pas
> supprimÃ©e : il explique pourquoi la correction *Ã©vidente* (ignorer le prix
> inconnu) aurait Ã©tÃ© **pire que le dÃ©faut**, et cette conclusion a directement
> dictÃ© la forme de la solution finale â€” partitionner les prix **avant** toute
> rÃ©solution, plutÃ´t que de les faire tolÃ©rer par `resolveStripeEntitlements`.
**Contexte** : P0.4, chemin d'achat des add-ons autonomes

### Le constat

Le catalogue vend huit add-ons Â« achetables seuls Â» (cahier Â§2). Six sont des
achats uniques, deux sont mensuels. Le chemin d'achat livrÃ© ici les traite tous
de la mÃªme faÃ§on : `resolveAddonCheckout` rend un `priceId` et un `mode`, et
`modeCheckout` renvoie `subscription` pour les deux mensuels.

Or un `mode: "subscription"` crÃ©e chez Stripe un abonnement **sÃ©parÃ©** de
l'abonnement principal, et Stripe Ã©met alors `customer.subscription.created`.
Le webhook y rÃ©sout les prix par `resolveStripeEntitlements`
(`src/lib/stripe.ts:403`), qui ne connaÃ®t que les prix d'offre et ceux
d'`ADDON_PRICE_ENV`. Un prix `STRIPE_PRICE_ID_PASS_*` en ressort donc
Â« inconnu Â», et la route rÃ©pond **500** â€” en boucle, puisque Stripe rejoue trois
jours avant de dÃ©sactiver le point d'entrÃ©e. Ce qui couperait aussi la
synchronisation des abonnements principaux.

### Ce qui rend la dÃ©cision non triviale

La correction Ã©vidente â€” apprendre Ã  `resolveStripeEntitlements` Ã  ignorer ces
prix â€” **est pire que le dÃ©faut**. `PLANS[0]` est l'offre la moins chÃ¨re, et la
fonction y retombe quand aucun prix d'offre n'est reconnu :
`apply_stripe_subscription_event_v2` Ã©craserait alors le plan payÃ© de
l'organisation. Un 500 casse un webhook et se voit dans les journaux ; le
dÃ©classement silencieux d'un client Ã  jour de ses paiements ne se voit pas.

S'y ajoute une seconde face. Les termes d'un mensuel posent `ends_at: null`
(`octroi-termes.ts`, dÃ©libÃ©rÃ©ment : une fin Ã  trente jours couperait le module
au premier renouvellement) et **rien ne rÃ©voque** l'octroi Ã  la rÃ©siliation. Le
panneau d'administration cache d'ailleurs le bouton de rÃ©vocation pour
`source = 'stripe'` (`module-grants-panel.tsx:157`) : la rÃ©vocation automatique
est le chemin prÃ©vu, et elle n'existe pas.

### La dÃ©cision

**Fermer la vente des deux mensuels, en amont, plutÃ´t que livrer un chemin qui
casse ou un correctif qui corrompt.** `venteEnLigneOuverte` refuse
`recurring-monthly`, et cette seule fonction ferme les trois portes :

1. l'Ã©cran ne montre pas de bouton (`addonAchetableEnLigne`) ;
2. l'action refuse si le formulaire est postÃ© Ã  la main
   (`resolveAddonCheckout`) ;
3. donc aucun abonnement de pass n'existe jamais chez Stripe.

Poser la garde dans l'action, ou dans l'Ã©cran, en aurait fermÃ© une seule.

**Les six achats uniques ne sont pas concernÃ©s** : mode `payment`, aucun
abonnement crÃ©Ã©, donc aucun `customer.subscription.*`. Ils sont livrÃ©s.

### Ce qu'il faudra pour lever la garde

Isoler le chemin des abonnements autonomes dans le webhook : les **reconnaÃ®tre**
avant `resolveStripeEntitlements`, ne **pas** les faire passer par la
synchronisation d'abonnement â€” qui Ã©crirait le plan de l'organisation â€” et
**rÃ©voquer** leur octroi `recurring` sur `customer.subscription.deleted`. Trois
gestes, pas un ; c'est ce qui justifie un lot distinct plutÃ´t qu'un correctif
glissÃ© dans celui-ci.

### Ce que les tests verrouillent

Un test vÃ©rifie que **poser le prix en variable d'environnement ne suffit pas**
Ã  ouvrir la vente. Sans lui, la garde se lÃ¨verait toute seule le jour oÃ¹
quelqu'un configure Stripe â€” c'est-Ã -dire exactement le jour oÃ¹ le dÃ©faut
deviendrait atteignable.

Deux tests d'Ã©tanchÃ©itÃ© entre les deux familles de variables ont dÃ» Ãªtre
**basculÃ©s de `loyalty` vers `hunts`** : la garde ferme dÃ©sormais `loyalty`, donc
ils passaient sans plus rien prouver de ce qu'ils annonÃ§aient. Un test qui passe
pour la mauvaise raison est plus coÃ»teux qu'un test absent â€” il fait croire Ã 
une couverture.

### ConsÃ©quences

- Six add-ons sur huit sont vendables ; les deux mensuels affichent
  Â« Ã©crivez-nous Â», message qui dit au commerÃ§ant quoi **faire** et n'expose pas
  la raison technique.
- La garde est Ã  **un seul endroit**, et le jour du lot d'isolation elle se lÃ¨ve
  lÃ  et nulle part ailleurs.
- Aucun produit ni prix Stripe n'est crÃ©Ã© (cahier Â§2, Â« BloquÃ© Â») : sans
  variable, la page affiche huit options et zÃ©ro bouton. Le code est livrable Ã 
  froid.

**References** :
- ADR-078 (dÃ©couvrir, prÃ©parer, publier)
- `src/lib/octroi-checkout.ts` (la garde), `src/lib/octroi-termes.ts` (les
  termes), `src/actions/billing.ts` (l'action)
- `src/lib/stripe.ts:403` (`resolveStripeEntitlements`),
  `src/app/api/stripe/webhook/route.ts:106` (le 500)
- migration `20260908120000_p0_lot4_octroi_par_paiement.sql`

---

## ADR-080 : Deux durÃ©es vendues sÃ©parÃ©ment doivent Ãªtre appliquÃ©es sÃ©parÃ©ment â€” et celle qui manquait ne se voyait pas, parce qu'elle n'avait pas de geste

**Date** : 2026-08-05
**Statut** : AcceptÃ©
**Contexte** : P0.4 (suite), activation des pass achetÃ©s

### Le constat

Le catalogue vend deux durÃ©es distinctes par pass : Â« 29 â‚¬ / **30 jours**,
activable dans les **90 jours** Â» (cahier Â§2). ADR-079 a livrÃ© la seconde â€”
`activate_by` est posÃ© Ã  l'achat, diffÃ©renciÃ© (90 jours, mais **30** pour la
SoirÃ©e en jeu). La premiÃ¨re ne l'Ã©tait pas.

`termesDepuisCatalogue` pose dÃ©libÃ©rÃ©ment `starts_at: null` sur un achat
unique : les trente jours payÃ©s ne doivent pas s'Ã©couler pendant que le
commerÃ§ant rÃ©dige ses lots. Mais **rien ne faisait sortir l'octroi de cet
Ã©tat** â€” aucune RPC, aucun trigger, aucune action ; seul le back-office posait
`starts_at`, Ã  la main. Or `chargerOctroisVivants` filtre sur
`starts_at is null`.

Cinq add-ons sur six encaissaient donc sans ouvrir le module. Et `activeDays`
(30 / 31 / 7 / 30) comme `preparationDays` + `playHours` (7 j + 24 h)
n'apparaissaient que dans **l'affichage du tarif** â€” jamais dans un calcul de
fenÃªtre.

### Ce qui rend le dÃ©faut instructif

Il Ã©tait invisible Ã  toutes les preuves du lot prÃ©cÃ©dent : typecheck, lint,
3121 tests, build, pgTAP. Chaque piÃ¨ce Ã©tait correcte **prise sÃ©parÃ©ment** â€” le
catalogue portait les bonnes durÃ©es, le webhook posait les bons termes, l'Ã©cran
affichait les bons prix. Ce qui manquait n'Ã©tait dans aucune piÃ¨ce : c'Ã©tait le
**geste** qui les relie.

Une donnÃ©e que personne ne lit ne fait rougir aucun test. La seule chose qui
l'aurait attrapÃ©e est la question qu'a posÃ©e le propriÃ©taire : *oÃ¹ va cette
valeur ?* â€” et elle n'allait nulle part.

### La dÃ©cision

**Un bouton explicite Â« DÃ©marrer Â», et non un dÃ©marrage Ã  la publication.**

L'alternative Ã©tait d'activer l'octroi quand le commerÃ§ant publie sa chasse ou
son quiz : un geste de moins. Ã‰cartÃ©e â€” le compteur partirait sur une
publication faite Â« pour voir Â», et il n'existe aucun retour en arriÃ¨re sur une
durÃ©e payÃ©e. Le Â§2 dit Â« activable dans les 90 jours Â», ce qui dÃ©crit un geste
dÃ©libÃ©rÃ©, pas un effet de bord.

Corollaire retenu : **le bouton annonce la date de fin avant le clic**. DÃ©marrer
est irrÃ©versible ; sans cette date, un commerÃ§ant lance son Quiz express de sept
jours trois semaines trop tÃ´t et ne le dÃ©couvre qu'une fois la fenÃªtre passÃ©e.

### Ce qui garde quoi

- **La RPC** (`service_role`, comme `grant_module_from_payment`) porte le
  cloisonnement **dans son `where`** et non dans un contrÃ´le aprÃ¨s coup : un
  identifiant d'octroi trouvÃ© dans un journal ne **dÃ©signe** rien chez un autre
  commerÃ§ant, au lieu d'Ãªtre lu puis refusÃ©.
- **Le trigger de gel du lot 2 avait anticipÃ© ce geste** â€” Â« passer de null Ã 
  une valeur est l'acte d'achat/de dÃ©marrage, et doit rester possible Â». La
  double activation est donc impossible **en base**, indÃ©pendamment de la RPC.
  On rend malgrÃ© tout un verdict plutÃ´t qu'une exception : l'appelant est un
  Ã©cran, et Â« ce pass a dÃ©jÃ  dÃ©marrÃ© Â» n'est pas une panne.
- **Le module est relu en base, jamais postÃ©.** C'est lui qui dÃ©cide de la
  durÃ©e : le laisser transiter par le navigateur permettrait de dÃ©marrer une
  Chasse de trente jours en dÃ©clarant un Calendrier de trente-et-un.

### ConsÃ©quences

- Les six add-ons vendables ouvrent rÃ©ellement leur module, et pour la durÃ©e
  exacte du catalogue â€” vÃ©rifiÃ© une par une : 30, 31, 7, 30 jours, et **8 jours**
  pour la SoirÃ©e en jeu (7 de prÃ©paration + 24 h de jeu).
- Un pass dont la fenÃªtre d'activation est passÃ©e n'est **pas affichÃ©** avec un
  bouton grisÃ© : il est exclu par le chargeur. Ce qui est proposÃ© est ce qui
  aboutit.
- Reste hors pÃ©rimÃ¨tre : `ends_at` n'est pas gelÃ© par le trigger du lot 2 (seuls
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

## ADR-081 : Une rÃ¨gle produit peut supprimer une colonne â€” Â« un seul actif Â» a remplacÃ© la traÃ§abilitÃ© qu'on croyait devoir Ã©crire

**Date** : 2026-08-05
**Statut** : AcceptÃ©
**Contexte** : P0.5, ouverture des deux add-ons mensuels

### Le problÃ¨me tel qu'il se prÃ©sentait

ADR-079 avait fermÃ© la vente des `recurring-monthly` et listÃ© trois gestes pour
la rouvrir. Une exploration en a trouvÃ© un quatriÃ¨me, plus coÃ»teux : **rien ne
permettait de savoir quel octroi rÃ©voquer.**

`grant_module_from_payment` Ã©crit `source_reference = ` l'identifiant de la
**session de checkout**. Ã€ `customer.subscription.deleted`, le webhook ne dispose
que de l'identifiant d'**abonnement**. Et rien n'interdisait deux achats
successifs du mÃªme mensuel : l'index d'idempotence porte sur
`(organization_id, source_reference)`, et deux sessions distinctes ne se
heurtent pas. Un commerÃ§ant dont le webhook tarde, qui rachÃ¨te, se retrouvait
avec deux abonnements prÃ©levÃ©s et deux octrois indiscernables.

Les trois issues Ã©taient toutes mauvaises : rÃ©voquer au hasard ferme une fois sur
deux le module encore payÃ© ; tout rÃ©voquer coupe un service prÃ©levÃ©
indÃ©finiment ; ne rien rÃ©voquer laisse vivant un octroi sans terme. Et aucun
rattrapage n'existe â€” le back-office refuse de toucher un octroi `source =
'stripe'`.

La solution technique Ã©vidente Ã©tait d'ajouter une colonne pour l'identifiant
d'abonnement, plus une migration, plus un index.

### La dÃ©cision, et elle est produit

**Le propriÃ©taire a tranchÃ© : un commerÃ§ant ne peut pas racheter un add-on
mensuel qu'il a dÃ©jÃ  actif.**

Cette rÃ¨gle **supprime le problÃ¨me au lieu de le tracer**. Si un seul octroi
`recurring` vivant peut exister par `(organisation, module)`, alors ce couple
*est* la clÃ© : la rÃ©vocation devient non ambiguÃ« sans qu'aucun identifiant
Stripe n'ait besoin d'Ãªtre persistÃ©. La colonne, sa migration et son index
disparaissent du plan.

C'est le point Ã  retenir au-delÃ  de ce lot : **une contrainte produit bien
choisie coÃ»te moins cher qu'une traÃ§abilitÃ© gÃ©nÃ©rale**, et il vaut la peine de
poser la question au propriÃ©taire avant d'Ã©crire le schÃ©ma qui contourne son
absence.

### Ce qui garde quoi

- **L'index unique partiel est la garde rÃ©elle**, pas le refus cÃ´tÃ© action.
  Entre la vÃ©rification de l'action et l'Ã©criture du webhook, un double clic
  ouvre une fenÃªtre oÃ¹ deux sessions de paiement partent. Le prÃ©dicat est
  **immuable** (`kind = 'recurring' and revoked_at is null and ends_at is null`)
  â€” pas de `now()`, qu'un index ne peut pas porter : c'est la projection
  intemporelle de Â« vivant Â» pour un rÃ©current, dont les termes posent
  `starts_at` Ã  l'achat et `ends_at: null` par construction.
- **Le refus au checkout reste, mais comme confort** : il dit au commerÃ§ant
  Â« vous l'avez dÃ©jÃ  Â» plutÃ´t que de le laisser aller jusqu'Ã  Stripe pour se
  faire refuser aprÃ¨s avoir sorti sa carte.
- **Une troisiÃ¨me issue Ã  `grant_module_from_payment`.** L'index aurait fait
  lever la RPC sur `unique_violation`, donc 500 en boucle sur un conflit
  *dÃ©finitif* que Stripe rejouerait sans fin. Elle rattrape la violation **par
  son `constraint_name`** (tout autre nom est relevÃ©, pour ne pas avaler un
  conflit qu'on n'a pas prÃ©vu) et rend `(null, false)` â€” refus de cumul,
  distinct du rejeu `(id, false)`.
- **La partition prÃ©cÃ¨de la rÃ©solution.** `partitionnerPrix` sÃ©pare les prix de
  pass des prix d'offre **avant** `resolveStripeEntitlements`. C'est la
  conclusion directe d'ADR-079 : faire *tolÃ©rer* le prix inconnu Ã  cette
  fonction l'aurait fait retomber sur `PLANS[0]` et Ã©craser le plan payÃ©.
- **Le chemin de pass ne CRÃ‰E aucun octroi**, il ne fait que refermer. La
  crÃ©ation reste Ã  `checkout.session.completed`, comme pour les six achats
  uniques â€” deux crÃ©ateurs auraient posÃ© deux octrois pour un seul paiement.

### Ce que le lot ne ferme pas, Ã©crit et non arrondi

- **La vente n'est pas ouverte en pratique** : `STRIPE_PRICE_ID_PASS_LOYALTY` et
  `_REFERRAL` doivent Ãªtre posÃ©es. La levÃ©e de garde est nÃ©cessaire, pas
  suffisante â€” geste du propriÃ©taire.
- **Un mensuel `past_due` reste ouvert** jusqu'Ã  l'annulation Stripe.
  DÃ©libÃ©rÃ© : mÃªme grÃ¢ce que l'abonnement principal.
- **Le back-office** rend un message opaque quand un admin crÃ©e un rÃ©current qui
  doublerait un vivant. Hors pÃ©rimÃ¨tre, Ã  traiter.
- **L'index couvre les deux sources** (`stripe` et back-office), mais la
  **rÃ©vocation filtre `source = 'stripe'`** â€” sinon une rÃ©siliation Stripe
  refermerait un accÃ¨s offert Ã  la main par le propriÃ©taire.

**References** :
- ADR-079 (la garde, dÃ©sormais levÃ©e), ADR-080 (l'activation)
- migration `20260910120000_p0_lot5_recurrent_unique.sql`,
  `supabase/tests/module_grant_recurring.test.sql`
- `src/lib/octroi-checkout.ts`, `src/app/api/stripe/webhook/route.ts`,
  `src/actions/billing.ts`

---

## ADR-082 : `DROP FUNCTION` emporte les privilÃ¨ges â€” et une fonction `security definer` payante redevient appelable par `anon`

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : P0.6, changement du type de retour de `grant_module_from_payment`

### Ce qui a Ã©tÃ© constatÃ©

Changer le type de retour d'une fonction Postgres impose `DROP` + `CREATE` â€”
`CREATE OR REPLACE` Ã©choue explicitement :

```
ERROR: cannot change return type of existing function
DETAIL: Row type defined by OUT parameters is different
HINT: Use DROP FUNCTION â€¦ first
```

**Ce que la documentation ne met pas en avant, et qui coÃ»te cher** : le `DROP`
emporte aussi les `GRANT`/`REVOKE`. AprÃ¨s le `CREATE`, Postgres rÃ©applique son
dÃ©faut â€” `EXECUTE` accordÃ© Ã  `PUBLIC`. MesurÃ© :
`has_function_privilege('public', â€¦)` repasse Ã  `true`.

`grant_module_from_payment` est `security definer` et **octroie des modules
payants**. Sans rÃ©Ã©mission des `REVOKE`, elle redevenait donc appelable par
`anon` : n'importe qui pouvait s'accorder un add-on depuis PostgREST.

### La dÃ©cision

**Toute migration qui `DROP` une fonction rÃ©Ã©met ses `REVOKE` et ses `GRANT`
dans la mÃªme migration**, et le pgTAP le vÃ©rifie â€” pas par lecture du fichier,
mais en interrogeant `has_function_privilege` aprÃ¨s application.

Le contrÃ´le qui tranche :

```sql
select has_function_privilege('public', p.oid, 'execute')      -- doit Ãªtre false
```

### Pourquoi la garde vit dans pgTAP et non dans une relecture

Parce que l'oubli est **invisible au diff**. Une migration qui `DROP` puis
`CREATE` se lit comme un remplacement anodin ; rien dans son texte ne signale
que les privilÃ¨ges viennent de disparaÃ®tre. Seul un test qui interroge le
catalogue **aprÃ¨s** application peut le voir.

C'est la mÃªme famille que les gardes dÃ©rivÃ©es de ce dÃ©pÃ´t : ce qui n'est pas
mesurÃ© sur l'objet rÃ©el n'est pas prouvÃ©.

### PortÃ©e

Cette ADR ne concerne pas que la fonction en cause. **Toute** migration future
qui change une signature â€” ajout d'un argument, changement de type de retour â€”
passera par un `DROP`, donc par ce trou. Les rÃ©vocations ne sont pas un dÃ©tail
de style : elles font partie de la dÃ©finition.

**References** :
- migration `20260913120000_p0_octroi_outcome.sql`
- `supabase/tests/module_grant_payment.test.sql`
- ADR-081 (l'index unique dont ce changement de retour dÃ©rive)

---

## ADR-083 : Un compteur qui promet plus qu'il ne mesure â€” et le grain d'un identifiant polymorphe Ã©tait dÃ©jÃ  tranchÃ©

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : P0.6, compteur d'ouvertures des QR

### Le nom mentait, et le corriger valait mieux que le justifier

La roue comptait ses Â« scans Â» depuis le socle V1 : colonne `qr_codes.scan_count`,
RPC `increment_qr_scan`, route `/api/scan`, composant `ScanBeacon`.

**Le beacon ne compte pas des scans.** Il se dÃ©clenche Ã  chaque **chargement de
page** : un rechargement, un retour arriÃ¨re, un lien partagÃ© par messagerie
incrÃ©mentent aussi. Le mot promettait une mesure d'acquisition physique lÃ  oÃ¹ le
chiffre mesure des ouvertures.

En gÃ©nÃ©ralisant le compteur Ã  huit modules, deux voies s'ouvraient : reproduire
le vocabulaire existant par cohÃ©rence, ou nommer ce qui est rÃ©ellement mesurÃ©.

**DÃ©cision : nommer honnÃªtement.** `open_count`, `module_page_opens`,
`/api/page-opens`, `PageOpenBeacon`, et l'Ã©cran dit au commerÃ§ant que chaque
chargement compte â€” Â« ce n'est donc pas un nombre de visiteurs distincts Â».

Le libellÃ© de la roue est corrigÃ© au passage : sa colonne historique reste,
le mot affichÃ© change. **La donnÃ©e est livrÃ©e, le mensonge non.**

### Le grain de `resource_id` Ã©tait dÃ©jÃ  dÃ©cidÃ©, et personne ne l'avait lu

La chasse au trÃ©sor avait d'abord Ã©tÃ© Ã©cartÃ©e du compteur, au motif que Â« ses
affiches sont par Ã©tape Â» et qu'un compteur unique confondrait des Ã©tapes
distinctes. Le motif Ã©tait juste ; la conclusion, non.

En relisant la migration du compteur, le grain y Ã©tait : pour `events`,
`resource_id` porte `event_sessions.id` â€” un **sous-objet** d'`event_games`, et
le commentaire de colonne le nomme. Le grain effectif n'a jamais Ã©tÃ© Â« la tÃªte
du module Â» mais **ce que CE QR dÃ©signe**, une ligne par affiche. Une Ã©tape de
chasse a exactement cette forme.

ConsÃ©quence : **ni colonne ni table ajoutÃ©e**. Compter la chasse aurait, lui,
exigÃ© une colonne â€” pour produire le chiffre dont on venait d'Ã©tablir qu'il ne
rÃ©pond pas Ã  la question du commerÃ§ant.

**Ce qu'il faut en retenir** : avant d'Ã©largir un schÃ©ma pour un cas qu'on croit
particulier, relire ce que le schÃ©ma fait dÃ©jÃ  des cas voisins. La forme
cherchÃ©e y est parfois, sans commentaire qui l'annonce.

### Deux gardes que ce lot a rendues nÃ©cessaires

- **La RPC rÃ©sout l'identifiant public contre la table du module** et ne crÃ©e
  rien s'il ne dÃ©signe aucune ressource. Sans cela, un POST en boucle avec des
  chaÃ®nes alÃ©atoires ferait croÃ®tre la table depuis Internet â€” la porte
  `service_role` ne protÃ¨ge pas de Ã§a, puisque c'est le serveur qui appelle.
- **Un test vÃ©rifie que le chemin appelÃ© par le beacon existe.** CÃ´tÃ©
  `sendBeacon`, le navigateur n'attend pas la rÃ©ponse : un **404 est
  indiscernable d'un 204**. Un renommage de route pouvait donc tuer le compteur
  en silence â€” c'est exactement ce que ce lot faisait.

**References** :
- migrations `20260911120000`, `20260912120000`
- `src/app/api/page-opens/route.ts`, `src/components/page-open-beacon.tsx`
- ADR-074 (ce qu'une garde textuelle prouve et ne prouve pas)

## ADR-084 : La classe des champs non rendus est fermÃ©e par ses propriÃ©tÃ©s, pas par sa forme

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : `chantier/formulaires-null-classe`, suite de V1.38/V1.39 et de
l'entrÃ©e `docs/bugs.md` qui annonÃ§ait Ã  tort la classe close le 2026-08-05.

### Deux modes de panne, et un seul avait Ã©tÃ© fermÃ©

`FormData.get` rend `null` â€” pas `undefined` â€” pour un champ **non rendu**
dans le DOM soumis. Deux schÃ©mas y rÃ©agissent diffÃ©remment :
- **Mode bruyant** : un schÃ©ma qui n'absorbe pas `null` (`z.string()` sans
  `.nullable()`) rejette avec une erreur Zod. Visible, corrigÃ© au cas par cas
  en V1.38/V1.39.
- **Mode silencieux** : `z.coerce.number()` sans `.nullable()` convertit
  `null` en `0` (`Number(null) === 0`), sans lever d'erreur. Invisible Ã  tout
  grep sur des messages d'erreur, invisible Ã  l'audit prÃ©cÃ©dent qui ne
  cherchait que le rejet.

Mesure faite en ouvrant ce chantier : **26 violations, dont 3 bruyantes et
23 silencieuses.** Le mode silencieux ne frappait que les champs dont la
borne basse descend Ã  0 : un `min(1)` refusait `null` **par accident**
(0 < 1) â€” la mÃªme faute Ã©tait muette ou bruyante selon une borne sans rapport
avec elle. Les plus coÃ»teuses : les trois cooldowns anti-rejeu (chasse,
fidÃ©litÃ©, jackpot) oÃ¹ 0 est une valeur mÃ©tier (Â« anti-partage dÃ©sactivÃ© Â») â€”
un champ non rendu dÃ©sarmait la protection en la faisant passer pour un choix
du commerÃ§ant ; et `weight` (`prizes.ts`), un lot de poids 0 jamais tirÃ© sans
erreur, ou un barÃ¨me de pronostics remis Ã  0.

### DÃ©cision

Un point unique, `src/lib/validations/champ-formulaire.ts` (sept primitives :
`texteOptionnel`, `entierOptionnel`, `entierRequis`, `nonRenduVaut`,
`absentSiNonRendu`, `caseACochee`, `nombreRequis`, `videSiNonRendu`), ferme la
classe par ses **propriÃ©tÃ©s** plutÃ´t que par la forme du code qui l'exprime :
- **EntrÃ©e tolÃ©rante, sortie inchangÃ©e.** Les primitives absorbent `null`
  sans changer le type de sortie exposÃ© Ã  l'appelant, pour ne pas casser les
  types en aval de 62 dÃ©clarations sur 12 modules.
- **Un champ requis refuse `null` explicitement â€” jamais 0 silencieux.**
  Aucune exception : c'est l'invariant qui aurait empÃªchÃ© les 23 conversions
  silencieuses de naÃ®tre.
- **Ordre impÃ©ratif : schÃ©ma d'abord, appelant ensuite.** Corriger chez
  l'appelant (98 `??`) a dÃ©jÃ  dÃ©montrÃ© son coÃ»t en V1.38 â€” un site avait
  Ã©chappÃ© au filet malgrÃ© 131 `??`/`formData.has()` dÃ©jÃ  posÃ©s ailleurs. Le
  schÃ©ma est le seul endroit qui ne peut pas Ãªtre oubliÃ© un jour d'ajout.
- **Garde comportementale, pas textuelle.**
  `champ-formulaire-coverage.test.ts` vÃ©rifie ce que les schÃ©mas **font** â€”
  deux invariants sur 300+ champs de 24 modules, Ã©numÃ©rÃ©s depuis les modules
  â€” jamais leur forme Ã©crite. Une garde textuelle rougit sur un retour Ã  la
  ligne et ne voit ni `.optional()` ni `.default(` : elle n'aurait jamais vu
  le mode silencieux. L'invariant B (requis refuse `null`) n'a aucune
  exclusion ; les 37 exclusions de l'invariant A sont nominatives, motivÃ©es,
  et leur mortalitÃ© est dÃ©tectÃ©e.
- **JSON-only reste strict.** Les schÃ©mas qui valident des blueprints ou des
  payloads de webhook ne reÃ§oivent pas la tolÃ©rance : y absorber `null`
  masquerait une corruption de donnÃ©es plutÃ´t qu'un champ de formulaire
  simplement non rendu.

### ConsÃ©quences

- 62 dÃ©clarations converties, 98 `??` d'appelant supprimÃ©s (5 survivent,
  chacun commentÃ© : 4 sur champs obligatoires, 1 oÃ¹ `undefined` â‰  `null` par
  conception).
- **Risque rÃ©siduel assumÃ©, non fermÃ©** : un champ **rendu** mais **vidÃ©**
  (`""`) vaut toujours 0 par coercition sur les entiers requis. C'est un
  comportement d'origine, hors de cette classe â€” le champ a bien Ã©tÃ© rendu â€”
  et le changer refuserait des enregistrements aujourd'hui acceptÃ©s.
  DocumentÃ© dans `nombreRequis` plutÃ´t que corrigÃ©.
- Deux contrÃ´les nÃ©gatifs jouÃ©s et restaurÃ©s : `.nullable()` retirÃ© â†’
  invariant A rouge sur `hunts` ; `weight` ramenÃ© Ã  `z.coerce.number()` â†’
  invariant B rouge sur les 3 chemins `prizes`.

**References** :
- `src/lib/validations/champ-formulaire.ts`,
  `src/lib/validations/champ-formulaire-coverage.test.ts`
- roadmap V1.41, `docs/bugs.md` (entrÃ©e requalifiÃ©e le 2026-08-06)

## ADR-085 : Le dashboard guidÃ© â€” compteurs honnÃªtes, relance par blueprint, un Ã©tat de cycle de vie qui manquait

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : `chantier/dashboard-guide`, cahier Â§5/Â§9.3 â€” crÃ©ation guidÃ©e,
Carte de l'Aventure, Relancer une formule, Tableau d'Ã©quipe, Centre
d'animation. Migration `20260914120000`.

### Compteurs honnÃªtes plutÃ´t que prometteurs

Le Centre d'animation affiche des tuiles qui auraient pu enjoliver l'Ã©tat du
commerce. DÃ©cidÃ© : chaque Ã©tiquette dit ce qu'elle mesure, pas ce qu'elle
suggÃ¨re. Â« QR Ã  tester Â» devient **Â« QR jamais scannÃ©s Â»**, parce que le
compteur est un proxy `scan_count = 0` et non une preuve d'absence de test.
Â« Stocks faibles Â» ne porte que sur la roue, parce que le seuil de stock
n'existe que sur `prizes` â€” les autres modules n'ont rien Ã  afficher lÃ , pas
un zÃ©ro qui laisserait croire Ã  une vÃ©rification faite.

### Le Tableau d'Ã©quipe ne dÃ©rive jamais un chiffre inventÃ©

`teamTasks` est strictement la projection des actions dÃ©jÃ  Â« prÃªtes Â» dans
les modules existants (brouillon publiable, lot en rupture, gain Ã  valider).
Aucun total, aucune moyenne, aucune extrapolation : une ligne du tableau qui
n'a pas de source directe dans une table n'est pas affichÃ©e.

### Un cinquiÃ¨me Ã©tat manquait dans le cycle de vie

Le cahier dÃ©crit cinq phases (idÃ©e â†’ brouillon â†’ rÃ©pÃ©tition â†’ en cours â†’
clÃ´turÃ©e) pour projeter les Ã©tats hÃ©tÃ©rogÃ¨nes des 8 modules Ã©quipÃ©s
(referral exclu : pas de statut propre, il vit sous une campagne).
MesurÃ© en Ã©crivant la projection : un module publiÃ© mais pas encore jouable
(programmÃ©, en pause, fenÃªtre pas ouverte) n'a sa place dans aucune des cinq
â€” confondu avec Â« en cours Â», la Carte aurait affichÃ© Â« ouverte aux joueurs Â»
sur une page inatteignable. DÃ©cision : un sixiÃ¨me Ã©tat intermÃ©diaire,
**Â« prÃªte Â»**, entre brouillon et en cours. Seul l'Ã©vÃ©nement porte
rÃ©ellement la rÃ©pÃ©tition (sessions de lobby) ; les autres modules la
traversent sans s'y arrÃªter.

### Relancer une formule sÃ©rialise un blueprint, jamais des donnÃ©es joueur

Â« Relancer une formule Â» (6 des 8 kinds â€” ni campagnes, oÃ¹ Dupliquer existe
dÃ©jÃ , ni jackpot, dont l'Ã©conomie active n'est pas portable) part d'une
instance publiÃ©e et produit un **blueprint** : structure et rÃ©glages
seulement, validÃ©s par les mÃªmes schÃ©mas `.strict()` que la crÃ©ation. Jamais
de participants, de gains ou de scans â€” la relance est une remise Ã  blanc,
pas une copie d'historique. Le nom du brouillon crÃ©Ã© reste celui de la
source ; seul le blueprint porte Â« Relance de â€¦ Â», pour que l'origine reste
traÃ§able sans se substituer au nommage du commerÃ§ant.

### Une dÃ©cision corrigÃ©e en cours de revue : le discriminant vient du serveur

Le brief initial proposait de reconnaÃ®tre les relances en rafale par un
discriminant transmis par le client. La revue sÃ©curitÃ© a montrÃ© que ce choix
supprimait le seul frein anti-crÃ©ation-en-masse : un discriminant fabriquÃ©
cÃ´tÃ© client se falsifie. CorrigÃ© avant fusion â€” le discriminant (seau de
10 s par source) est dÃ©rivÃ© cÃ´tÃ© serveur ; le `requestId` client ne sert
plus qu'Ã  l'idempotence de la requÃªte, jamais Ã  la limite de frÃ©quence.

### Une RPC unique plutÃ´t que dix-huit comptages

Le Centre d'animation aurait pu accumuler un appel par module. DÃ©cidÃ© :
une RPC unique, `org_animation_center_counts`, security definer,
`is_org_editor` vÃ©rifiÃ© en premier geste, REVOKE/GRANT rÃ©Ã©mis aprÃ¨s le
`DROP FUNCTION` (ADR-082 appliquÃ©e une seconde fois) et prouvÃ©s au
catalogue par pgTAP plutÃ´t que supposÃ©s tenus par dÃ©faut.

**ConsÃ©quences** :
- La chasse au trÃ©sor et le calendrier avaient chacun un piÃ¨ge que la
  mesure a rÃ©vÃ©lÃ© plutÃ´t que l'hypothÃ¨se de dÃ©part : dix tables d'Ã©mission
  de rÃ©compenses et non neuf (le calendrier en porte deux â€” openings et
  rewards) ; sept familles sur neuf prouvent l'annulation par l'ABSENCE de
  ligne (purge en cascade), `cancelled_at` n'existant que sur les
  participations. Trois exclusions supplÃ©mentaires (redeem_code null = tour
  perdant, code null = rupture, reward_type/kind = 'lot') Ã©vitaient un
  compteur Ã  18 quand la caisse en sert 10.
- Les IDs d'options de quiz divergeaient entre `OPTION_ID_PATTERN` et le
  schÃ©ma blueprint : un quiz rÃ©el aurait Ã©tÃ© refusÃ© Ã  sa propre relance.
  CorrigÃ© par une renumÃ©rotation `o1, o2â€¦` avec remappage de
  `correct_option_id` au moment de la sÃ©rialisation.
- `contest_matches` porte deux clÃ©s Ã©trangÃ¨res vers `contests` : l'embed de
  sÃ©rialisation doit dÃ©sambiguÃ¯ser explicitement, sous peine d'erreur
  PostgREST silencieuse en ambiguÃ¯tÃ© de jointure.

**References** :
- migration `20260914120000`
- `src/lib/experience-lifecycle.ts`, `src/lib/centre-animation-server.ts`,
  `src/lib/experience-relance.ts`, `src/actions/experience-relance.ts`
- roadmap V1.42, ADR-082 (privilÃ¨ges emportÃ©s par `DROP FUNCTION`)

## ADR-086 : Le Passeport post-jeu est une proposition strictement navigationnelle

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : `chantier/passeport-post-jeu`, cahier Â§7, point 4 de l'ordre
impÃ©ratif (Â§9.4). AprÃ¨s un jeu, proposer au joueur de crÃ©er/continuer un
Passeport de fidÃ©litÃ©.

### GagnÃ© et perdu, sans distinction

Le cahier dit Â« aprÃ¨s un jeu Â», pas Â« aprÃ¨s un gain Â». DÃ©cidÃ© : la carte
s'affiche dans les deux cas â€” c'est le joueur qui perd qu'on veut le plus
retenir, et une carte rÃ©servÃ©e aux gagnants aurait exclu la majoritÃ© des
parties.

### Un lien, jamais un tampon

Â« Un lien partagÃ© ne tamponne jamais Â» est vrai par construction : la carte
`ProposerPasseport` ne fait que naviguer vers `/passeport/<programId>`.
Aucun appel Ã  `record_loyalty_stamp` ne part de ce composant â€” le tamponnage
reste le monopole du parcours QR de commande (ADR-087) et de la visite en
caisse existante.

### `invitationPasseport` calquÃ©e sur `getPlayerProgression`, anti-oracle

L'action publique lit une seule fois, bornÃ©e Ã  l'organisation demandÃ©e, et
rend au plus `{programId, programName}`. Org inconnue, org sans programme de
fidÃ©litÃ©, et module fermÃ© rendent tous les trois le mÃªme `null` â€” aucun des
trois Ã©tats ne se distingue de l'extÃ©rieur (prouvÃ© par test jusqu'au
`Object.keys` de la rÃ©ponse).

### Un exemplaire par page

Sur les pages qui combinent plusieurs ancrages potentiels (le filleul
gagnant, par exemple), un garde empÃªche que la carte s'affiche deux fois.
Le parrainage reste au gain seul, sans Ã©cran de fin dÃ©diÃ© â€” aucun second
ancrage n'y a Ã©tÃ© ajoutÃ©.

**ConsÃ©quences** :
- 8 ancrages couvrent 7 modules (roue/RedeemCodeScreen, quiz, chasse,
  calendrier, jackpot, Ã©vÃ©nement, pronostics) plus les 13 jeux de rÃ©vÃ©lation
  via la plomberie `organizationId` dÃ©jÃ  partagÃ©e.
- Une organisation sans programme de fidÃ©litÃ© actif n'affiche jamais la
  carte â€” pas de lien mort vers un passeport qui n'existe pas.

**References** :
- `src/actions/invitation-passeport.ts` (ou Ã©quivalent), composant
  `ProposerPasseport`
- roadmap V1.43

## ADR-087 : QR de commande unique â€” usage unique atomique portÃ© par `consumed_at`

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : `chantier/passeport-post-jeu`, cahier Â§7. Un QR/code unique
par commande de livraison doit crÃ©er/continuer le Passeport et ajouter
exactement un tampon, une seule fois. Migrations `20260915120000` et
`20260916120000`.

### Le jeton contourne le cooldown, par dÃ©cision produit

`record_loyalty_stamp` passait dÃ©jÃ  par un cooldown anti-rejeu pour les
visites en caisse. Pour la commande, l'anti-abus retenu est l'**usage
unique** du jeton, pas le cooldown : un client qui passe deux commandes la
mÃªme minute doit recevoir deux tampons. Le jeton `p_order_token` contourne
donc explicitement le cooldown existant plutÃ´t que de le partager.

### L'usage unique est atomique, portÃ© par une seule colonne

`update loyalty_order_codes set consumed_at = now() where token = â€¦ and
consumed_at is null returning â€¦` : la course entre deux requÃªtes simultanÃ©es
sur le mÃªme jeton est tranchÃ©e par Postgres, pas par une lecture puis une
Ã©criture applicative. Un jeton dÃ©jÃ  consommÃ© rend l'Ã©tat `order_invalid`,
au mÃªme rang que jeton inconnu ou expirÃ© cÃ´tÃ© rÃ©ponse publique.

### FK simple, pas composite en cascade â€” pour ne pas ressusciter Ã  la purge

Une FK composite en `cascade` vers la ligne de rÃ©compense aurait, Ã  la purge
RGPD, effacÃ© la ligne de `loyalty_order_codes` et donc **remis `consumed_at`
Ã  zÃ©ro Ã  la prochaine relecture** â€” un jeton dÃ©pensÃ© serait redevenu
utilisable aprÃ¨s une purge, silencieusement. Choisi : une FK simple `on
delete set null`, avec `consumed_at` comme unique porteur de la rÃ¨gle
d'usage unique â€” indÃ©pendant de ce qui advient de la ligne pointÃ©e.

### ADR-082 appliquÃ©e frontalement

Le passage de `record_loyalty_stamp` en 5-aires impose un `drop function` +
`create` (changement de signature). RÃ©Ã©mission systÃ©matique des
`revoke`/`grant` aprÃ¨s recrÃ©ation, vÃ©rifiÃ©e au catalogue par pgTAP â€” mÃªme
geste que le lot prÃ©cÃ©dent (ADR-082), appliquÃ© ici en connaissance de cause
plutÃ´t que dÃ©couvert une seconde fois.

### `create or replace` Ã  signature identique prÃ©serve l'ACL â€” le corollaire utile d'ADR-082

Le correctif FAIBLE 3 (purge du `label` sur les codes consommÃ©s hors
rÃ©tention) ne change pas la signature de la fonction de purge : un simple
`create or replace`, qui **ne** perd **pas** les privilÃ¨ges, contrairement au
`drop` + `create` d'une signature modifiÃ©e. La distinction n'est pas
Â« migration risquÃ©e Â» contre Â« migration sÃ»re Â» en gÃ©nÃ©ral â€” c'est
prÃ©cisÃ©ment le changement de signature qui dÃ©clenche la perte, et rien
d'autre.

### Refus et succÃ¨s empruntent le mÃªme escalier

Un jeton inconnu posait d'abord le dÃ©fi Turnstile avant toute RPC : un
attaquant distinguait un jeton existant d'un jeton inventÃ© selon qu'un
captcha lui Ã©tait prÃ©sentÃ© ou non. CorrigÃ© : la rÃ©solution d'identitÃ© et le
challenge se dÃ©roulent identiquement que le jeton soit valide, expirÃ©,
consommÃ© ou inexistant ; seule la RPC finale distingue les cas, dans une
rÃ©ponse elle-mÃªme uniforme cÃ´tÃ© page publique.

**ConsÃ©quences** :
- Le grain public `/commande/[token]` garde un flou volontaire 404/200
  (bugs.md) â€” identique Ã  `/hunt`, assumÃ©, non rÃ©solu par ce chantier.
- MVP sans pÃ©remption ni rÃ©vocation de jeton (au-delÃ  du delete bloquÃ© en
  FAIBLE 2) ; Ã  reprendre si l'usage rÃ©el le demande.

**References** :
- migrations `20260915120000`, `20260916120000`
- `src/lib/loyalty-order-codes.ts` (ou Ã©quivalent), `stampLoyaltyOrder`,
  `createLoyaltyOrderCodes`, `src/app/commande/[token]/`
- ADR-082 (privilÃ¨ges emportÃ©s par `DROP FUNCTION`), roadmap V1.43

## ADR-088 : Un conseiller dÃ©terministe plutÃ´t qu'une IA facturÃ©e

**Date** : 2026-08-06
**Statut** : AcceptÃ©
**Contexte** : `chantier/conseiller-gratuit`. Le lot prÃ©cÃ©dent (#123) avait
livrÃ© un assistant de crÃ©ation appelant l'API Anthropic au jeton â€”
`ia-provider`, `ia-assistant`, `ANTHROPIC_API_KEY`, `iaSuggestion`, plus une
3áµ‰ source `blueprint` dans `applyCampaignTemplate`. Le propriÃ©taire ne
voulait pas d'IA facturÃ©e : il voulait un accompagnement simple, dans le
code, gratuit, pour aiguiller le commerÃ§ant vers les actions utiles et les
modules pertinents.

### Retrait complet plutÃ´t que coexistence

L'assistant IA payant est revertÃ© intÃ©gralement (commit `be7fdef`) plutÃ´t que
dÃ©sactivÃ© derriÃ¨re un flag : une clÃ© API absente qui laisse du code mort
capable de l'appeler est un risque qu'on prÃ©fÃ¨re ne pas porter. Le retrait
est prouvÃ© par `git grep` : plus aucune occurrence de `ia-provider`,
`ia-assistant`, `ANTHROPIC_API_KEY` ou `iaSuggestion` hors documentation.

### Des rÃ¨gles sur des donnÃ©es dÃ©jÃ  chargÃ©es, pas un nouvel appel

Le conseiller (`src/lib/conseiller-commercant.ts`, fonction pure
`construireConseils`) ne fait ni IO ni rÃ©seau : il projette deux sources dÃ©jÃ 
en mÃ©moire â€” les compteurs du Centre d'animation et le catalogue des
modules avec les kinds actifs â€” en une liste de conseils triÃ©s et bornÃ©s Ã 
6. Il ne Â« comprend Â» rien : il applique des rÃ¨gles fixes, un compteur au-delÃ 
de zÃ©ro dÃ©clenche une phrase, un module absent des kinds actifs en dÃ©clenche
une autre.

### Ton sobre, non commercial â€” dÃ©cision explicite du propriÃ©taire

Le conseiller signale, il ne survend pas : Â« 3 gains Ã  remettre. Â», Â« Module
Passeport fidÃ©litÃ© disponible (objectif : FidÃ©liser). Â» â€” comptes exacts,
phrases neutres, aucune formule d'incitation. Choix produit assumÃ©, pas une
limitation technique : rien n'empÃªchait un ton plus commercial, il a Ã©tÃ©
Ã©cartÃ©.

### ZÃ©ro RPC en plus â€” la fonction pure reÃ§oit ce que la page a dÃ©jÃ 

La page `/dashboard` charge `chargerCentreAnimation` une seule fois pour
l'AnimationCenter et transmet son rÃ©sultat directement Ã 
`construireConseils`. Un premier wrapper `chargerConseils` relanÃ§ait la RPC
pour son propre compte ; la revue sÃ©curitÃ© l'a signalÃ© (finding perf), le
correctif l'a fait disparaÃ®tre, et le wrapper â€” devenu sans appelant â€” a Ã©tÃ©
retirÃ© dans la foulÃ©e (commit `66cdd31`), plutÃ´t que laissÃ© en place Â« au
cas oÃ¹ Â».

**ConsÃ©quences** :
- Aucun coÃ»t par usage, aucune clÃ©, aucune dÃ©pendance externe : le
  conseiller fonctionne identiquement en local, en CI et en production.
- Extensible sans coÃ»t marginal : ajouter une rÃ¨gle ne consomme ni jeton ni
  quota.
- Ce n'est pas une IA : pas de reformulation, pas d'adaptation au contexte
  au-delÃ  des compteurs et du catalogue dÃ©jÃ  modÃ©lisÃ©s.

**References** :
- `src/lib/conseiller-commercant.ts`, `src/components/dashboard/conseiller-panel.tsx`
- commits `be7fdef` (retrait), `e98f2c7` (conseiller), `dd01c3a` (panneau),
  `2b23414` et `66cdd31` (correctif RPC en double)
- roadmap V1.44

## ADR-089 : Refonte clartÃ© espace commerÃ§ant â€” une question par Ã©cran, un vocabulaire unique

**Date** : 2026-08-07
**Statut** : AcceptÃ©
**Contexte** : `chantier/clarte-commercant`, PR #125. Demande directe du
propriÃ©taire : l'espace commerÃ§ant plus clair, plus ludique, plus simple ; le
commerÃ§ant doit savoir immÃ©diatement oÃ¹ il est et quoi faire. Une
cartographie prÃ©alable (7 explorateurs parallÃ¨les) a chiffrÃ© le problÃ¨me
plutÃ´t que de le dÃ©crire : ~31 rectangles bordÃ©s sur `/dashboard` pour un
nouveau propriÃ©taire, Â« gains Ã  remettre Â» rÃ©pÃ©tÃ© 5 fois avec deux calculs
diffÃ©rents, menu Ã  plat de 11 Ã  18 entrÃ©es, aucun wizard dans le dÃ©pÃ´t.

### Une seule question par Ã©cran

Principe retenu pour la Vue d'ensemble : Â« je fais quoi maintenant ? Â» n'a
qu'une rÃ©ponse visible en premier, portÃ©e par un vrai bouton â€” le hero
Â« Votre prochaine action Â» (`src/components/dashboard/prochaine-action.tsx`),
qui absorbe l'ancienne checklist d'onboarding plutÃ´t que de coexister avec
elle. Sept prioritÃ©s en cascade (dÃ©marrage incomplet â†’ gains Ã  remettre â†’
stock faible â†’ brouillons â†’ QR jamais scannÃ©s â†’ aucune animation ouverte â†’
Â« Tout roule Â»), chaque candidate validÃ©e par `lienSelonRole` avant d'Ãªtre
retenue : jamais de lien mort proposÃ© comme la prochaine action.

### Un fait, une seule case

Â« Gains Ã  remettre Â» apparaissait 5 fois sur `/dashboard`, avec deux calculs
qui pouvaient diverger. La tuile doublon Â« VÃ©rifier les participations Ã 
valider Â» (Tableau d'Ã©quipe) est supprimÃ©e : Centre d'animation et Tableau
d'Ã©quipe fusionnent en une seule section, un compteur unique par fait.

### Vocabulaire unifiÃ© â€” un module, un nom ; un Ã©tat, un mot

Le libellÃ© du menu (`EXPERIENCE_CATALOG.label`) devient la rÃ©fÃ©rence
canonique ; les h1 des pages liste s'alignent dessus. Cinq Ã©tats d'animation
reÃ§oivent chacun un badge et un libellÃ© uniques dans tout le produit
(`src/components/ui/status-badge.tsx` : Brouillon, ProgrammÃ©e, En pause,
Ouverte aux joueurs, ClÃ´turÃ©e) et les verbes de transition sont fixÃ©s
(Â« Ouvrir aux joueurs Â», Â« Mettre en pause Â», Â« ClÃ´turer Â», Â« Repartir de
cette formule Â») â€” remplaÃ§ant un mÃ©lange d'Â« Activer Â», Â« Archiver Â»,
Â« Relancer Â» qui dÃ©signait des actions diffÃ©rentes selon la page.

### Le guidage se distingue visuellement des rÃ©glages

Fond `k-yellow`/`k-bg` (palette Kermesse) rÃ©servÃ© aux blocs de guidage (hero,
Carte de l'Aventure) ; carte blanche pour le contenu et les rÃ©glages. DÃ©cision
hÃ©ritÃ©e des gardes existantes du design system, appliquÃ©e systÃ©matiquement
plutÃ´t que laissÃ©e Ã  l'apprÃ©ciation de chaque page.

### Le Â« Bravo Â» conditionnÃ© remplace l'inconditionnel â€” Ã©cartÃ© sur preuve

`experience-lifecycle.ts` affichait Â« Bravo, votre animation est prÃªte Ã  Ãªtre
partagÃ©e ! Â» dÃ¨s qu'une animation quittait l'Ã©tat brouillon, y compris
**en pause** ou programmÃ©e â€” un bug prouvÃ©, pas une supposition. La version
inconditionnelle est remplacÃ©e par une lecture du vrai statut : le bravo
n'apparaÃ®t que si l'animation est rÃ©ellement ouverte aux joueurs ; en pause
ou programmÃ©e, l'Ã©tape affiche la situation exacte (Â« ProgrammÃ©e â€” ouvrira le
J Â» / Â« En pause â€” vos clients ne peuvent pas jouer pour le moment Â»).
Alternative Ã©cartÃ©e : garder le message gÃ©nÃ©rique et corriger seulement le
cas pause â€” rejetÃ©e parce que la mÃªme classe d'erreur (un message qui ne lit
pas le vrai statut) aurait pu se reproduire ailleurs sur le mÃªme composant.

### Token de contraste `--color-k-orange-text`, trouvÃ© par le scan axe en CI

L'ajout d'un scan `expectNoA11yViolations` au test owner de
`e2e/dashboard-home.spec.ts` (peu coÃ»teux, un test dÃ©jÃ  lancÃ©) a fait
remonter de vraies violations de contraste sur le petit texte orange
(sur-titres, marqueurs Â« â†’ Â», titres de groupe du menu). CorrigÃ© Ã  la racine
par un token unique `--color-k-orange-text: #b45309` (4.66:1 sur fond crÃ¨me,
5.02:1 sur fond blanc, calculÃ©s) plutÃ´t qu'au cas par cas sur chaque
occurrence â€” la mÃªme classe de dÃ©faut ne peut plus se reproduire par simple
oubli d'un composant.

**ConsÃ©quences** :
- Aucune migration, aucune route API, aucune action serveur touchÃ©e : le
  chantier est entiÃ¨rement `src/components/` et `src/lib/experience-lifecycle.ts`.
- PR #125 reste ouverte vers `main`, fusion en attente d'une dÃ©cision du
  propriÃ©taire â€” la CI complÃ¨te est verte sur `f0ba41d` (E2E Chromium+WebKit,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit npm).
- Hors pÃ©rimÃ¨tre assumÃ© : vrai wizard de crÃ©ation multi-Ã©crans, unification
  des 9 cartes de caisse, gÃ©nÃ©ralisation de `PageHeader` aux pages dÃ©tail
  (consignÃ© en roadmap V1.45 et docs/bugs.md).

**References** :
- `src/components/dashboard/prochaine-action.tsx`, `-state.ts`,
  `src/components/ui/status-badge.tsx`, `src/components/ui/page-header.tsx`,
  `src/lib/experience-lifecycle.ts`
- commits `349ab27`, `92a4223`, `62b41b4`, `57cd55e`, `e1ad5af`, `5be9f57`,
  `9aa56aa`, `5568f57`, `f0ba41d`
- roadmap V1.45, PR #125

## ADR-090 : L'Atelier du jeu â€” un wizard sur la route existante, jamais de champ repostÃ© en hidden

**Date** : 2026-08-07
**Statut** : AcceptÃ©
**Contexte** : `chantier/assistant-creation`, PR #126. Demande propriÃ©taire :
un accompagnement de crÃ©ation en Ã©tapes, guidÃ© et dÃ©terministe, sans IA â€” la
suite de la clÃ´ture de la refonte clartÃ© V1.45. Un diagnostic prÃ©alable (5
explorateurs) a chiffrÃ© la page `/dashboard/campaigns/[id]/wheel` : 102
contrÃ´les interactifs simultanÃ©s, 6 actions d'Ã©criture rÃ©parties sur 12
boutons Enregistrer sans Ã©tat global, Â« Ouvrir aux joueurs Â» sans
prÃ©condition mÃ©tier (une campagne sans lot tirable pouvait Ãªtre publiÃ©e), 13
mÃ©caniques sur 15 recevant des rÃ©glages de roue sans effet visible, aucune
spec E2E ni scan axe sur cette page.

### Le wizard vit sur la route existante, pas une nouvelle

`/dashboard/campaigns/[id]/wheel` devient l'Atelier ; l'Ã©tape choisie est un
paramÃ¨tre `?etape=` sur la MÃŠME URL, le `?wheel=` multi-roues prÃ©servÃ©.
Raison directe : 6 `revalidatePath(â€¦/wheel)` dans `src/actions/prizes.ts` et
3 appelants de cette URL restent valides sans un seul changement â€” une
nouvelle route aurait cassÃ© silencieusement `revalidate-coverage.test.ts` et
toute page qui pointe vers l'atelier.

### Une Ã©tape = un POST complet d'une action existante, jamais un champ en hidden

ZÃ©ro nouvelle action serveur, zÃ©ro nouveau module de validations. Chaque
Ã©tape mappe une action dÃ©jÃ  en production (`updateWheel`, `addPrize` /
`updatePrize` / `deletePrize`, `updateWheelStyle`, `updateWheelSchedule`) et
la soumet **complÃ¨te**. Alternative Ã©cartÃ©e : reposter en champ cachÃ© ce
qu'une autre Ã©tape a dÃ©jÃ  rÃ©glÃ© â€” c'est la classe de dÃ©faut Â« champ non
rendu, valeur perdue au submit suivant Â» que le dÃ©pÃ´t documente dÃ©jÃ 
ailleurs. C'est pourquoi la mÃ©canique, les rÃ©glages du dÃ©fi et la limite de
jeu restent dans une seule et mÃªme Ã©tape : `updateWheel` exige les trois
ensemble.

### La publication reste hors de l'Atelier â€” un seul endroit publie

L'Ã©tape VÃ©rification n'a pas de bouton Â« Ouvrir aux joueurs Â» : elle calcule
une checklist pure (mÃ©canique choisie, lot gagnant tirable au miroir de
`perform_atomic_spin`, poids total > 0, QR existant, fenÃªtre via
`campaignWindowState` importÃ© â€” jamais recopiÃ©) et renvoie, si tout est vert,
vers `/dashboard/campaigns/<id>#statut`, la position unifiÃ©e par la refonte
clartÃ© V1.45. La garde mÃ©tier rÃ©elle (le trou reste POSTable en direct sur
`set_campaign_status`) est un arbitrage de base non tranchÃ© ici, consignÃ©
dans `docs/bugs.md`.

### Catalogue de mÃ©caniques et calcul de part unique

Le catalogue des 15 mÃ©caniques et le calcul `partSur10` existaient en trois
copies divergentes (roue, Ã©diteur de lots, prÃ©visualisations) ; extraits en
modules purs testÃ©s et partagÃ©s par l'Ã©tape Lots et l'Ã©tape VÃ©rification â€”
la mÃªme classe de dÃ©faut (deux calculs pour un seul fait) que la refonte
clartÃ© avait dÃ©jÃ  fermÃ©e sur Â« gains Ã  remettre Â».

**ConsÃ©quences** :
- Aucune migration, aucune route API, aucune RLS, aucun webhook ni token
  touchÃ©s : revue sÃ©curitÃ© dÃ©diÃ©e jugÃ©e non requise pour ce lot, seule la
  cible d'un redirect interne change (`createCampaign` â†’ l'Atelier au lieu
  du dÃ©tail).
- Nouvelle spec `e2e/wheel-wizard.spec.ts` (8 tests, premier scan axe de
  cette page) a dÃ©busquÃ© 13 violations d'accessibilitÃ© rÃ©elles prÃ©existantes
  (contrastes, selects/case/curseur sans nom accessible), corrigÃ©es Ã  la
  racine plutÃ´t que contournÃ©es dans le test.
- PR #126 reste ouverte vers `main`, fusion en attente d'une dÃ©cision du
  propriÃ©taire (comme PR #125) â€” CI complÃ¨te verte sur `0faa05a`.
- Hors pÃ©rimÃ¨tre assumÃ© : prÃ©conditions de publication en base, toggle
  `is_active` / rÃ©ordonnancement des segments, quota brouillon sur
  `applyCampaignTemplate` (consignÃ© en roadmap V1.46 et `docs/bugs.md`).

**References** :
- `src/app/dashboard/campaigns/[id]/wheel/page.tsx`,
  `src/components/dashboard/atelier-verification-state.ts`
- commits `d009bf6`, `7b19ee1`, `2682708`, `146aed1`, `0faa05a`
- roadmap V1.46, PR #126

## ADR-091 : L'Atelier partout â€” le patron des deux visages gÃ©nÃ©ralisÃ© Ã  7 modules

**Date** : 2026-08-07
**Statut** : AcceptÃ©
**Contexte** : `chantier/atelier-modules`, PR #127. Ordre propriÃ©taire aprÃ¨s
fusion de V1.46 : Â« fais l'extension du modÃ¨le atelier aux autres modules de
crÃ©ation Â». Cartographie prÃ©alable (5 explorateurs, une fiche par module)
pour dÃ©couper quiz, calendrier de l'Avent, chasse au trÃ©sor, passeport de
fidÃ©litÃ©, jackpot collectif, Ã©vÃ©nement live et pronostics selon le mÃªme
patron que la roue.

### Le patron des deux visages, jamais de sous-route

Chaque route dÃ©tail existante garde une seule URL, Ã  deux lectures : sans
`?etape=`, la vue **suivi** (en-tÃªte, Carte de l'Aventure, carte Statut,
blocs de suivi, carte de relance, et une carte d'entrÃ©e d'Atelier listant
les Ã©tapes) ; avec `?etape=<clÃ©>`, le mode **atelier** (stepper + carte de
l'Ã©tape + navigation prÃ©cÃ©dent/suivant + retour au suivi). Raison directe,
identique Ã  celle de V1.46 : les ~90 `revalidatePath` par module visent la
page dÃ©tail nue, et `revalidate-coverage.test.ts` ignore la query â€” une
sous-route aurait cassÃ© cette couverture en silence. La Carte de l'Aventure
pointe dÃ©sormais `liens.editeur` vers `?etape=<clÃ©-rÃ©glages>` ; `liens.suivi`,
statut et relance restent des ancres de la vue par dÃ©faut : jamais d'ancre
morte.

### Les Ã©tapes sont calÃ©es sur la sÃ©mantique des sauvegardes existantes

Une Ã©tape = un POST complet d'une action dÃ©jÃ  en production, jamais un champ
d'une autre Ã©tape repostÃ© en hidden â€” la mÃªme rÃ¨gle que l'ADR-090. Les cinq
cartes RÃ©glages monolithiques (`updateQuiz`, `updateCalendar`, `updateHunt`,
`updateLoyaltyProgram`, `updateJackpotCampaign`) restent chacune une Ã©tape
indivisible : aucun schÃ©ma n'a Ã©tÃ© assoupli pour l'occasion (consignÃ© en
dette dans `docs/bugs.md`, pas rÃ©solu ici). Le jackpot est le seul module au
stepper adaptatif (2 ou 3 Ã©tapes selon `validation_mode` : l'Ã©cran comptoir
ne s'affiche que dans le mode qui le produit) ; les gestes d'exploitation
(le tirage dÃ©finitif du quiz, la clÃ´ture des pronostics) restent hors du
fil de prÃ©paration, dans la vue suivi.

### VÃ©rification = modules purs Ã  double consommation

Chaque prÃ©condition privÃ©e de publication (`activationBlocker` de quiz.ts,
calendar.ts, jackpot.ts ; blocs inline de hunts.ts, loyalty.ts, events.ts)
est extraite dans `src/lib/activation/<module>.ts`, pure et testÃ©e,
consommÃ©e Ã  la fois par l'action serveur et par l'Ã©tape Â« La vÃ©rification Â»
â€” une seule vÃ©ritÃ©, sur le modÃ¨le de `atelier-verification-state.ts`
important `campaignWindowState` en V1.46 plutÃ´t que de le recopier.
Pronostics est le cas limite : aucune prÃ©condition n'existe cÃ´tÃ© serveur
(un championnat sans match ni rÃ©compense reste publiable), donc son Ã©tape de
vÃ©rification ne fait que RACONTER l'Ã©tat â€” matchs, questions, rÃ©compenses,
Ã©chÃ©ances â€” sans rien bloquer ; la garde en base reste une dette ouverte
(`docs/bugs.md`).

### Un invariant dÃ©couvert en Ã©crivant le filet E2E

`e2e/atelier-modules.spec.ts` a tentÃ© de fabriquer une case de calendrier
Â« incomplÃ¨te Â» en Ã©ditant `day_count` Ã  la hausse aprÃ¨s coup, pour tester le
message de vÃ©rification qui nomme la case fautive. Le serveur refuse ce
geste (`refusCase`) : une case du calendrier ne peut PAS devenir invalide
par Ã©dition â€” invariant jusqu'ici non documentÃ©, dÃ©sormais couvert par le
test qui l'a dÃ©busquÃ© plutÃ´t que contournÃ©.

**ConsÃ©quences** :
- Cinq bugs vivants fermÃ©s au passage : l'effacement silencieux de
  `default_locks_at` des pronostics (hidden non prÃ©-rempli), cinq 404
  injustifiÃ©s sur le droit payÃ© (via `capacitesDuModule` +
  `ModuleCapabilityNotice`), deux ancres `#reglages` menteuses, l'Ã©cran
  comptoir jackpot affichÃ© hors de son mode.
- `e2e/pronostics.spec.ts` et `e2e/referral.spec.ts` restent vertes sans
  modification â€” critÃ¨re d'acceptation de la vue par dÃ©faut, comme
  `e2e/wheel-wizard.spec.ts` pour la roue.
- Revue sÃ©curitÃ© dÃ©diÃ©e : GO, 0 critique/Ã©levÃ©/moyen. L'Ã©largissement
  d'accÃ¨s des pages dÃ©tail ne change que Â« qui voit sa propre donnÃ©e Â» ; la
  publication reste verrouillÃ©e en base via `assert_module_publish_allowed`
  (inchangÃ© par ce chantier) ; 2 INFO corrigÃ©es avant fusion (dont la
  gÃ©nÃ©ralisation `createLoyaltyOrderCodes`), 2 INFO consignÃ©es en suivi.
- PR #127 ouverte vers `main`, fusion en attente d'une dÃ©cision du
  propriÃ©taire (comme #125 et #126) â€” CI complÃ¨te verte sur `93319ea`.
- Hors pÃ©rimÃ¨tre assumÃ© : assouplissement des cinq schÃ©mas monolithiques en
  partiel, garde de publication en base pour les modules qui n'en ont
  aucune (pronostics), fusion des 3 formulaires `updateContest`, Ã©criture de
  questions de pronostics (INSERT-only), leaderboard quiz non lu par la
  vue suivi (consignÃ© en roadmap V1.47 et `docs/bugs.md`).

**References** :
- `src/lib/activation/` (7 modules + `controle.ts`),
  `src/components/dashboard/atelier-etapes.ts`,
  `e2e/atelier-modules.spec.ts`
- commits `3390c63`, `1cd2595`, `fe79eeb`, `fde377c`, `3160e61`, `573270b`,
  `cd7648b`, `fbbe7e2`, `76341d4`, `93319ea`
- roadmap V1.47, PR #127

## ADR-092 : ClartÃ© dashboard â€” rappels fermables par liste blanche de prÃ©fixes, cartes repliables sans `<details>`

**Date** : 2026-08-07
**Statut** : AcceptÃ©
**Contexte** : `chantier/apparence-dashboard`, PR Ã  ouvrir. Demande
propriÃ©taire du jour : amÃ©liorer l'apparence et la clartÃ© du dashboard (7
points), sans migration. Deux mÃ©canismes transverses introduits au passage
mÃ©ritent d'Ãªtre fixÃ©s comme patron plutÃ´t que redÃ©couverts au prochain
bandeau ou Ã  la prochaine carte repliable.

### Rappels fermables : liste blanche de prÃ©fixes de clÃ©, jamais une liste noire

Les bandeaux d'accueil (Â« AccÃ¨s offert Â», Â« Essai gratuit Â», le Conseiller)
deviennent fermables par un cookie posÃ© via `src/actions/rappels.ts`, lu cÃ´tÃ©
serveur dans `src/app/dashboard/layout.tsx` (zÃ©ro flash : pas de rendu suivi
d'un retrait client). Les 3 bandeaux bloquants (incident de paiement,
abonnement inactif, essai terminÃ©) doivent rester impossibles Ã  fermer mÃªme
si un futur composant improvise une nouvelle clÃ© de cookie. Alternative
Ã©cartÃ©e : une liste noire de clÃ©s interdites â€” elle protÃ¨ge tant que
personne n'oublie d'y ajouter la nouvelle clÃ© bloquante, et l'oubli est
silencieux (le bandeau se fermerait sans erreur). Retenu : une **liste
blanche de prÃ©fixes de clÃ©** acceptÃ©s par `src/lib/rappels.ts`, testÃ©e ; une
clÃ© bloquante non listÃ©e est refusÃ©e par construction, pas par vigilance.
ConsÃ©quence directe : le cookie est bornÃ© au path `/dashboard` (ne part pas
sur le trafic joueur) et purgÃ© au logout â€” prÃ©fÃ©rence de rappel par
navigateur et non par utilisateur, assumÃ©, bornÃ© par cette purge (voir
`docs/bugs.md`).

### Cartes repliables : composant client Ã  `aria-expanded`, jamais `<details>`/`<summary>`

`CarteRepliable` (6 blocs secondaires de la page dÃ©tail campagne) est un
composant client avec un bouton `aria-expanded`, pas l'Ã©lÃ©ment HTML natif
`<details>`. Raison mesurÃ©e, pas stylistique : Chromium retire le rÃ´le
`heading` aux titres qui descendent d'un `<summary>`, ce qui aurait cassÃ©
les locators E2E fondÃ©s sur le rÃ´le (`getByRole("heading", â€¦)`) dans tout
bloc repliÃ© par dÃ©faut. Les 6 blocs restent ouverts par dÃ©faut prÃ©cisÃ©ment
pour ne pas changer ce que les specs existantes trouvent ; l'Ã©tat de repli
n'est pas persistÃ© (perdu Ã  la navigation), comme l'aurait Ã©tÃ© un
`<details>` natif â€” ce choix n'ajoute donc pas de rÃ©gression de confort par
rapport Ã  l'alternative Ã©cartÃ©e, seulement l'accessibilitÃ© du titre.

**ConsÃ©quences** :
- `src/lib/rappels.ts` (pur, testÃ©) fixe la liste blanche de prÃ©fixes ;
  toute nouvelle clÃ© de rappel fermable doit matcher un prÃ©fixe listÃ©,
  toute clÃ© bloquante doit explicitement ne pas en avoir.
- Revue sÃ©curitÃ© dÃ©diÃ©e avant PR : GO, 0 critique/Ã©levÃ© ; 2 MOYEN corrigÃ©s
  (liste blanche de prÃ©fixes, garde de rÃ´le sur les 3 actions QR mutantes
  ajoutÃ©es Ã  la mÃªme page) ; 4 INFO, dont 2 corrigÃ©es (cookie bornÃ© au path,
  purge au logout) et 2 documentÃ©es sans action (ombrage de cookie â€”
  nÃ©cessite XSS â€”, absence de rate-limit â€” conforme au pattern des actions
  dashboard).
- `CarteRepliable` est rÃ©utilisable pour toute prochaine page dÃ©tail qui
  voudrait replier des blocs secondaires ; ne pas rÃ©introduire `<details>`
  sur une page portant des locators E2E par rÃ´le.

**References** :
- `src/lib/rappels.ts`, `src/lib/rappels.test.ts`, `src/actions/rappels.ts`,
  `src/components/dashboard/rappel-fermable.tsx`
- `src/components/dashboard/carte-repliable.tsx`,
  `src/components/dashboard/carte-repliable.test.tsx`
- commits `eaf50a2`, `dabf9ec`, `18dddd1`, `4b77353`, `1cb13a5`

## ADR-093 : Fonds thÃ©matiques cartoon â€” dÃ©cors par tables de tokens pures, enum saisonniÃ¨re partagÃ©e

**Date** : 2026-08-07
**Statut** : AcceptÃ©
**Contexte** : `chantier/themes-cartoon`. Demande propriÃ©taire : quand un
thÃ¨me est choisi (NoÃ«l, Saint-Valentinâ€¦), le fond doit suivre â€” remplacer
les lignes fades par des dÃ©cors cartoon, sur toutes les surfaces et aussi
pour les pronostics, qui n'avaient encore aucun thÃ¨me.

### Une seule palette saisonniÃ¨re, pas deux

`contests.theme` reÃ§oit exactement les six clÃ©s de `calendars.theme`
(`neutre`, `noel`, `saint_valentin`, `anniversaire`, `soldes`, `festival`),
et non un vocabulaire propre : deux Ã©numÃ©rations pour la mÃªme idÃ©e
obligeraient chaque Ã©cran Ã  savoir laquelle il regarde, et la premiÃ¨re clÃ©
ajoutÃ©e d'un cÃ´tÃ© manquerait de l'autre. Le quiz ne change pas â€” ses clÃ©s
(`gourmand`, `degustation`, `culture`) nomment un usage mÃ©tier, pas une
saison, et restent hors de cette enum. `src/lib/seasonal-theme.ts` devient
la source unique cÃ´tÃ© application (repli neutre en lecture, refus en
saisie) ; `lib/calendar.ts` la consomme au lieu de sa copie locale.

### Optionnel-prÃ©servant, pas optionnel-effaÃ§ant

`updateContest` traite `theme` comme les autres primitives champ-formulaire :
absent du `FormData`, la colonne n'est pas touchÃ©e. La classe de bug
`default_locks_at` (un champ hidden non prÃ©-rempli qui efface une valeur en
base sur un simple no-op) ne peut donc pas se reproduire avec ce champ,
pour les 3 formulaires qui postent ce schÃ©ma. La garantie porte sur
l'absence, pas sur le vide : `""` reste refusÃ© par l'enum, Ã  savoir avant
d'Ã©crire un 4e formulaire.

### DÃ©cors par tables de tokens pures, un seul composant

`ThemeDecor` peint 16 scÃ¨nes cartoon (28 motifs, facture contour encre /
aplats pastel) Ã  partir de tables de tokens pures et testÃ©es
(`contest-theme.ts` sur le patron de `calendar-theme.ts` / `quiz-theme.ts`),
avec 13 emplacements dÃ©terministes â€” zÃ©ro `Math.random`, zÃ©ro id SVG â€”
pour ne jamais collisionner quand plusieurs vignettes cohabitent sur un
mÃªme Ã©cran. `PlayerPageShell` factorise les 4 shells joueur (quiz,
calendrier, pronostics, rÃ©cupÃ©ration) qui recopiaient chacun le bandeau
kermesse en ligne. Les aperÃ§us Ã©diteurs (calendrier, quiz, roue) rendent le
mÃªme composant que le joueur : l'aperÃ§u reste ce que verront les clients.

**ConsÃ©quences** :
- CHECK du calendrier Ã©largi Ã  `saint_valentin` (contrainte nommÃ©e Ã  part
  pour les pronostics, contrainte en ligne hÃ©ritÃ©e pour le calendrier â€”
  lives_ok garde le point que le drop a bien atteint sa cible).
- Revue sÃ©curitÃ© dÃ©diÃ©e : GO, 0 critique/Ã©levÃ©/moyen/faible, 4 INFO. INFO-1
  (clÃ© hÃ©ritÃ©e du prototype rendant le repli neutre inopÃ©rant) corrigÃ©e
  avant fusion sur les 3 tables de tokens. 3 INFO en suivi dans
  `docs/bugs.md` : ordre de dÃ©ploiement migrationâ†’build (sinon le select
  public de `/pronos` Ã©choue en 42703 le temps de la promotion), paritÃ©
  palette SQLâ†”TS jamais testÃ©e entre les deux cÃ´tÃ©s, portÃ©e exacte de
  l'optionnel-prÃ©servant.
- Hors pÃ©rimÃ¨tre assumÃ© : le quiz garde ses 7 thÃ¨mes d'usage sans saison ;
  `/play` en branche nuit reste sans dÃ©cor (dÃ©gradÃ© libre du commerÃ§ant) ;
  le mode TV pronostics reste neutre.

**References** :
- `supabase/migrations/20260917120000_themes_saisonniers.sql`,
  `supabase/tests/themes_saisonniers.test.sql`
- `src/lib/seasonal-theme.ts`, `src/components/pronos/contest-theme.ts`,
  `src/components/ui/player-page-shell.tsx`
- commits `030265c`, `7286746`, `cce05a6`, `e8a1f89`
- roadmap V1.48
