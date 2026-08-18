# Transmission Codex → Claude Code

> Document local de référence partagé. Claude Code le lit avant toute mission
> demandée par l'utilisateur et peut y ajouter son avancement réel selon la
> règle ci-dessous. Codex le met à jour après chaque audit, décision, lot validé
> ou constat d'écart.

## Règle de travail

- Codex pilote le développement : il conduit les audits, définit les priorités,
  rédige les propositions et contrôle les résultats. Pour un audit complet, il
  mobilise ses agents Codex pertinents sur produit, architecture, qualité,
  performance et sécurité ; pour un audit ciblé, il choisit les agents dont le
  regard apporte une preuve utile.
- Chaque audit distingue les faits vérifiés des hypothèses et couvre, selon le
  périmètre, la valeur métier, l'expérience et l'accessibilité, la fiabilité et
  la performance, ainsi que la sécurité, la confidentialité et le multi-tenant.
- Chaque proposition Codex doit être justifiée par un constat ou une hypothèse
  vérifiable, le bénéfice concret pour le commerçant ou le joueur, le risque,
  le coût de mise en œuvre, les dépendances, une métrique de succès et une
  priorité. Les idées décoratives ou non reliées à une friction, un risque, un
  coût ou un résultat mesurable ne sont pas retenues ; les pistes écartées sont
  signalées avec leur raison.
- Après chaque audit, demande d'amélioration, décision ou proposition, Codex
  met à jour ce document : état réel, éléments faits, éléments non faits,
  risques et prochaine décision. Ce document est le journal partagé unique.
- Codex ne lance plus Claude Code, ne lit plus ses sessions et ne modifie pas
  ses réglages.
- Claude intervient seulement à la demande directe de l'utilisateur dans VS
  Code. Avant d'agir, il lit ce document, `CLAUDE.md`, les états
  `.claude/state/`, puis vérifie `git status --short`.
- Claude choisit et coordonne lui-même ses agents selon ses règles existantes.
  Codex ne lui impose ni agent, ni modèle, ni séquencement d'exécution.
- **Autorisation utilisateur (2026-08-06) :** Claude peut mettre à jour ce
  document après chaque avancée significative d'un lot (début confirmé,
  modification prête à relire, validation, blocage ou clôture). Il ajoute une
  entrée datée dans **Journal d'avancement Claude**, en tête de cette section,
  sans supprimer, réécrire ni déplacer une décision Codex, un périmètre validé
  ou une entrée historique.
- Chaque entrée Claude contient uniquement : lot et objectif, branche/commit
  s'ils existent, état (**en cours**, **à relire**, **bloqué** ou **terminé**),
  faits et fichiers réellement touchés, validations réellement exécutées et
  leurs résultats, risque/blocage, puis prochaine action. Une validation non
  exécutée reste explicitement « non exécutée » ; aucun secret, donnée
  personnelle, lien de session ou résultat inventé n'y est ajouté.
- Claude exécute le besoin demandé par l'utilisateur en tenant compte de ce
  document. Son droit d'ajout ne l'autorise pas à modifier les décisions produit
  ni à approuver seul un commit, push, fusion, déploiement, migration distante
  ou action Stripe. Il termine aussi par un résumé court pour l'utilisateur.
- Codex compare ce document au dépôt lors de sa prochaine revue. Toute ligne
  prouvée comme faite passe dans **Terminé** ; seules les lignes non réalisées
  restent dans **À exécuter** ou **Bloqué**.

## Journal d'avancement Claude

> Claude ajoute ses entrées les plus récentes juste sous cette note, sans effacer
> les précédentes. Ce journal décrit l'exécution ; les décisions et priorités
> Codex restent dans les sections qui suivent.

### 2026-08-17 — Train de correction de l'audit transverse : wagon 5 « La soirée live tient sa promesse » — **fusionné, déployé, santé verte**

- **Lot et objectif** : cinquième wagon du train — fusionner les trois
  allers-retours de lecture d'état live en un seul RPC, cacher la part
  partagée d'une session, redescendre la jauge vendue à ce qu'un banc a
  réellement prouvé, et faire dire vrai au rapport de performance (EVT-1,
  EVT-2, JOU-4, JOU-5, DOC-1 perf-report, JKP-1, plafond jauge 500).
- **Branche/commits** : `chantier/audit-p1-live`, tête `f48b83d`, 11 commits.
  Une migration : `20260929120000_soiree_live.sql`. **PR #152 : CI de la PR
  intégralement verte sur le SHA de tête `cd8e8c9` (6 jobs). Fusion squash
  `4b614b8` sur l'ordre permanent le 2026-08-18 ; CI `main` success sur
  `4b614b8` ; « Santé après déploiement » success sur `4b614b8`, job
  « Base · Workers · Sécurité » réellement exécuté (09:12:36→09:12:46 UTC,
  pas sauté) — migration `20260929120000` appliquée en production.**
- **Arbitrages portés par l'ADR-106** : le cache mémoire d'1 s par session et
  par instance retenu comme levier de capacité dominant (le drapeau Realtime
  seul laisse ~217 req/s pour ~150 disponibles) ; la fusion des gardes de
  module/session en base, parité vérifiée à la main par la revue de sécurité ;
  la jauge vendable plafonnée à 500 tant qu'aucun banc n'a prouvé 1000 ;
  `server_now` figé jusqu'à 1 s par le cache, assumé ; l'écran de salle sans
  bouton de reconnexion, assumé.
- **Faits** : `event_etat_partage` (part commune — classement, question,
  chrono serveur, garde de module/session fusionnée : `unavailable` sur
  session brouillon/archivée ou module fermé) et `event_etat_joueur` (bloc
  `you` seul : score, rang, code de retrait — jamais appelée seule, invariant
  côté application) remplacent les trois allers-retours dupliqués du rendu
  serveur et du repli polling ; équivalence champ à champ avec
  `event_public_state` prouvée par pgTAP, avec et sans jeton ;
  `event_participant_capacity` redescend `full`/`live` de 1000 à **500** —
  l'accès offert reste à 1000 ; `src/lib/plans.ts` rétrécit l'union
  `eventParticipants` à `100 | 500` ; `src/lib/event-etat.ts` (nouveau) cache
  la part partagée 1 s, uniquement quand `state === "ok"` ; l'observation de
  pression du jackpot est rattachée par `after()`, hors du chemin de réponse
  au joueur (correctifs MOYEN 1-2 de la revue) ; bandeau « Reconnexion… » +
  bouton « Actualiser » côté téléphone joueur dès le 2ᵉ échec de sondage,
  même bandeau sans bouton côté écran de salle ; chrono ancré sur l'horloge
  serveur des deux côtés ; jauge du jackpot rafraîchie par action ciblée
  toutes les 60 s ; `docs/perf-report.md` §7 cesse de décrire comme livré un
  cache et un tableau A/B qui n'avaient jamais existé.
- **Preuve** : pgTAP 63 fichiers / 3614 assertions PASS ×2 (vide et semée),
  `verif-complete.sh --rapide` 0 échec (6 min 29 — typecheck, lint,
  casts/sql/migrations + gardes, build, Vitest complet, site), E2E ciblé
  57/57 verts sur 3 navigateurs (event, jackpot, jackpot-staff-checkin,
  player-win, wheel-wizard). Revue sécurité **GO** (0 critique/élevé, 2 MOYEN
  + 1 FAIBLE + 5 INFO, les 2 MOYEN, le FAIBLE et 1 INFO fermés dans le
  wagon).
- **Reste ouvert** : 4 INFO consignés sans correctif dans `docs/bugs.md`
  (wagon 5) + une exclusion ESLint mineure pour `supabase/.temp`. Activation
  de `EVENTS_REALTIME_ENABLED` en production reste un geste d'exploitation
  hors code (case NON cochée dans `docs/roadmap.md`). Wagons 6 et 7 à venir.

### 2026-08-17 — Train de correction de l'audit transverse : wagon 4 « Le commerçant garde la main, les chiffres disent vrai » — **fusionné, déployé, santé verte**

- **Lot et objectif** : quatrième wagon du train (brief `docs/wagon-4-brief.md`) —
  fermer les publications sans garde métier, refermer la matrice d'états de la
  campagne, réparer une mesure d'analytique d'expérience, border pagination,
  index et comptage de listes (FIA-1..FIA-6, EXP-2, EXP-3, NUM-1, SCAN-1,
  LIST-1, IDX-1, CNT-1).
- **Branche/commits** : `chantier/audit-p1-controle`, tête `86db376` puis
  commit docs `bc5e209`. Une migration : `20260928120000_controle_commercant.sql`.
  **PR #151 fusionnée en squash `c32dfc4` sur l'ordre permanent le
  2026-08-17** : CI de la PR verte sur `bc5e209`, CI `main` verte sur
  `c32dfc4`, « Santé après déploiement » verte sur `c32dfc4`, job
  « Base · Workers · Sécurité » réellement exécuté (20:13:34→20:13:42 UTC,
  pas sauté) — migration `20260928120000` appliquée en production.
- **Arbitrages propriétaire (2026-08-17) portés par l'ADR-105** : FIA-2 en
  gardes **applicatives** (pas de descente en base — ferme l'arbitrage laissé
  ouvert par l'ADR-090), périmètre du prédicat campagne = « aucun lot gagnant
  tirable » **et** « poids total nul » ; FIA-3 en branche A (`set_campaign_status`
  désarme `auto_schedule`) ; FIA-5 en refus sec ; NUM-1 en clés datées, rupture
  de série assumée sans backfill ; CNT-1 en plafond constant 500 pages, repli
  silencieux ; LIST-1 en motif `events`, pas de RPC de comptage.
- **Faits** : `start_event_session` refuse un lobby sur un jeu non `active` ;
  `updateCampaign`/`updateContest` refusent une publication sans lot gagnant
  tirable, sans poids ou sans match, via `src/lib/lot-tirable.ts` (prédicats
  déplacés, pas dupliqués) et `blocageActivationContest` ; `set_campaign_status`
  désarme `auto_schedule` et refuse `archived → active` sur la seule campagne
  — les sept autres RPC de publication restent permissives sur cette
  transition, prouvé par une section pgTAP dédiée plutôt qu'affirmé par
  commentaire ; `deletePrize` refuse de supprimer le dernier lot gagnant
  tirable d'une campagne active ; `deleteEventQuestion` exige une confirmation
  nommée et devient impossible pendant une session en direct ; les clés
  d'idempotence d'analytique d'expérience sont datées au jour local, trois
  compteurs de personnes ajoutés ; trois index de FK posés
  (`spins.campaign_id`, `spins.prize_id`, `participations.prize_id`) ; les deux
  RPC de pagination PostgREST bornent leur offset au même plafond que
  TypeScript. **Toutes les gardes neuves sont applicatives et contournables
  par un éditeur du même tenant en PostgREST direct** : contournement connu et
  assumé, listé RPC par RPC dans `docs/bugs.md`, jamais qualifié
  d'« impossible » (exigence de la revue sécurité).
- **Validations** : typecheck 0, lint 0, `casts:check`/`sql:check`/
  `migrations:check` verts, build vert, Vitest complet vert, `site:check`
  vert, pgTAP **62 fichiers / 3561 assertions PASS** ×2 (vide et semée), E2E
  ciblé mobile-chrome (dashboard-home, atelier-modules, wheel-wizard,
  campaign-templates, event) **41 passed / 3 skipped / 0 failed**. Revue
  sécurité : **GO, 0 critique/élevé, 1 MOYEN + 2 FAIBLE + 7 INFO** — le MOYEN
  (plafond de page manquant sur un 6ᵉ écran) et un FAIBLE fermés dans le
  wagon. CI GitHub intégralement verte sur le SHA de tête `bc5e209`.
- **Documentation** : ADR-105 (`docs/decisions.md`), roadmap V1.60, `docs/bugs.md`
  (deux entrées fermées — pronostics et campagne, la seconde clôturant la
  question ouverte par l'ADR-090 — dix entrées ouvertes : sept points
  consignés sans correctif du wagon + F-2/INFO-3/INFO-5 de la revue sécurité),
  `docs/chantier-audit-2026-08-16.md` (ligne wagon 4 → ✅ fusionné `c32dfc4`,
  déployé, santé verte ; journal des fusions complété), `CLAUDE.md` (wagon 4
  remplace wagon 3, wagon 3 versé en tête de `docs/journal.md`).
- **Suite** : wagon 5 (`chantier/audit-p1-live`).

### 2026-08-17 — Train de correction de l'audit transverse : wagon 3 « La boucle joueur → gain se ferme » — **terminé**

- **Lot et objectif** : troisième wagon du train (voir entrée 2026-08-16
  ci-dessous pour le cadrage complet) — fermer ce qui empêchait la boucle
  joueur → gain d'aboutir : reprise d'un gain non réclamé trop courte,
  écrans « tour offert » sans repli réseau ni sortie de blocage, nonce de
  défi jamais consommé, mode caisse jackpot staff sans écran (JOU-1, UI-1,
  UI-2, JOB-8, SEC-2 skill, MORT-1).
- **Branche/commits** : `chantier/audit-p0-joueur`, tête `65c25e5`, arbre
  propre, 11 commits (`git log origin/main..HEAD`). Une migration :
  `20260927120000_boucle_joueur_gain.sql`. PR non encore ouverte.
- **Faits** : RPC `recover_pending_spin(p_wheel_id, p_player_key)` — la
  reprise couvre toute la fenêtre de `play_limit` au lieu d'un cutoff fixe
  de 30 min (JOU-1), calcul de fenêtre recopié de `perform_atomic_spin`
  (source unique SQL, aucun miroir TS — décision), prédicat élargi aux
  spins sans clé de fenêtre (les gains de parrainage passent par la même
  clé joueur sans `play_window_key`, trouvé pendant le chantier),
  `unlimited` sans borne (bornée en pratique par la purge de rétention,
  ADR-102) ; resserrement assumé : un gain sans clé à cheval sur une
  frontière de fenêtre n'est plus repris. `perform_atomic_spin` passe à 8
  arguments avec `p_idempotency_key` (rejeu → même issue, lookup borné au
  joueur sous le verrou consultatif) + `spins.idempotency_key` + index
  unique partiel ; le submit d'un défi skill-gated transmet `'skill:' +
  nonce` en clé (SEC-2, JOB-8, le nonce se consomme enfin). Backend :
  `recoverPendingWin` passe par la RPC, `GAUGE_MIN_SUCCESS_MS` relevé à
  300 ms (arbitrage : durcir sans retirer). Frontend : try/catch sur les 4
  écrans « tour offert » (calendrier, quiz, passeport, parrainage, UI-1) +
  retentative unique de `recoverPendingWin` + lien vers le portefeuille sur
  les 4 écrans bloqués (UI-2) ; écran caisse `jackpot-staff-checkin.tsx`
  calqué sur le tampon fidélité, monté sur `/dashboard/redeem` —
  `participateJackpotStaff` trouve son appelant (MORT-1, arbitrage : écrire
  plutôt que retirer le mode) ; repli `<details>` sous le QR joueur ;
  mention honnête dans l'atelier Réflexe/Jauge.
- **Validations** : pgTAP 61 fichiers / 3522 assertions PASS ×2 (vide et
  semée) avant revue ; après revue, `boucle_joueur_gain.test.sql` 28/28 et
  `security_acl` 567 rejoués en direct, dérive de types nulle. Campagne
  finale qa-verify sur `65c25e5` : typecheck 0, lint 0, build 47/47 pages,
  migrations rejouées proprement ; E2E : spec caisse jackpot staff neuve
  verte (mobile-chrome + mobile-safari), non-régression
  `jackpot`/`player-win`/`skill-games` verte, `wheel-wizard` 23/23 en run
  isolé (2 échecs du run groupé diagnostiqués comme pollution de fixture
  d'un script local, pas la CI). Vitest ciblé par périmètre : backend
  100+101, frontend 480+344. Suite Vitest complète et CI GitHub **non
  rejouées localement en fin de chantier — la CI de PR les joue**. Revue
  sécurité : GO (0 critique/élevé, 3 MOYEN + 1 FAIBLE + 5 INFO), les 3
  MOYEN et l'INFO-1 fermés avant PR (commits `f0584a4`, `ab44efc`,
  `eabde69`).
- **Risque/blocage** : aucun bloquant. JOU-7/C4 précisé (consigné, pas un
  bug — le démarrage d'un défi skill ne consomme rien, C4 réfuté pour les
  mini-jeux) ; FAIBLE-1 à surveiller (`skill_impossible_timing`, plancher
  Jauge peut faire consommer le `play_limit` à un joueur très rapide de
  bonne foi) ; INFO-2 et INFO-4 consignés dans `docs/bugs.md`.
- **Prochaine action** : ouvrir la PR, laisser CI + babysit-CI conclure la
  fusion, puis dérouler le wagon 4 (`chantier/audit-p1-controle`).

### 2026-08-17 — Train de correction de l'audit transverse : wagon 2 « Le catalogue Stripe dit vrai » — **terminé**

- **Lot et objectif** : deuxième wagon du train (voir entrée 2026-08-16
  ci-dessous pour le cadrage complet) — aligner le catalogue Stripe sur les
  droits réellement ouverts (SD-1..SD-7, SD-9) et appliquer l'arbitrage
  produit du 2026-08-04 : un pass n'ouvre que son module (SD-4).
- **Branche/commits** : `chantier/audit-p0-stripe`, tête `68343a7`, PR #149
  fusionnée en squash `7db27ee` sur `main` (ordre permanent). Deux
  migrations : `20260925120000_droits_stripe.sql` et
  `20260926120000_pass_expire_lisible.sql`. `EXPECTED_MIGRATION =
  20260926120000`, appliquée en production.
- **Faits** : `org_has_module_access(_for_resource)` ferme le socle roue aux
  pass (SD-4) ; Saison de pronostics bornée à une compétition, resserrée par
  trigger à la clôture (SD-5) ; capacité d'événement au `max()` des octrois
  vivants, paliers 10/30/50 (SD-1) ; rachat pendant la grâce réactive au lieu
  de doubler (SD-6) ; webhook Stripe reprend `charge.refunded` /
  `charge.dispute.created`, désormais borné par `organization_id` (SD-2) ;
  garde de checkout par famille de prix — un abonnement 100 % pass ne ferme
  plus la vente de l'offre (SD-3) ; `.env.example` documente les dix
  `STRIPE_PRICE_ID_PASS_*` (SD-7) ; grâce d'impayé d'un pass ancrée sur
  l'événement de SON abonnement, jamais `past_due_since`, bornée monotone ;
  `run_campaign_schedule` gardée par le droit du module, motif `droit_expire`
  visible + e-mail au propriétaire au lieu d'un refus silencieux (SD-9,
  décision renversée de la migration `20260906120000`, consignée en
  ADR-103).
- **Validations** : typecheck 0, lint 0, build 47/47 pages, Vitest complet
  vert, pgTAP 60 fichiers / 3493 assertions (vide et semée), E2E local WSL
  `mobile-chrome` 39 passed / 6 skipped sur 5 specs ciblées. Revue sécurité :
  première passe NO-GO (1 ÉLEVÉ, 2 MOYEN, 1 FAIBLE, 4 INFO), les quatre
  corrigés dans le wagon, contre-vérification GO — 5 reliquats INFO
  consignés dans `docs/bugs.md`. CI de la PR #149 verte sur le SHA de tête
  `68343a7` (6 jobs) ; CI `main` verte sur `7db27ee` ; workflow « Santé après
  déploiement » vert sur `7db27ee`, job « Base · Workers · Sécurité »
  réellement exécuté (13:11:49→13:12:00 UTC, pas sauté) — les deux
  migrations sont appliquées en production.
- **Risque/blocage** : aucun. Reliquats INFO sans action requise (détail
  dans `docs/bugs.md`).
- **Prochaine action** : dérouler le wagon 3 (`chantier/audit-p0-joueur`).

### 2026-08-16 — Train de correction de l'audit transverse (7 wagons) — **en cours**

- **Lot et objectif** : ordre direct du propriétaire — s'approprier l'audit
  transverse du 2026-08-16 (`docs/audit-transverse-2026-08-16.md` : 99
  constats, 94 confirmés après contre-expertise, dont les 8 constats Codex du
  2026-08-10 tous confirmés) et **tout régler en un seul train**, sans
  relance : chaque PR verte est fusionnée sur `main` sur l'ordre permanent et
  le wagon suivant s'enchaîne. Quatre arbitrages produit tranchés par le
  propriétaire le 2026-08-16 : écran caisse jackpot écrit (pas de retrait du
  mode staff) ; Réflexe/Jauge durcis + mention honnête (pas de retrait) ;
  reprise de gain alignée sur la fenêtre de rejeu et affichée d'elle-même
  (pas d'émission au registre) ; périmètre add-on appliqué selon la décision
  du 2026-08-04 (un pass n'ouvre que son module).
- **Branche/commits** : suivi wagon par wagon dans
  `docs/chantier-audit-2026-08-16.md` (tableau + journal des fusions), mis à
  jour à chaque fusion. Wagon 1 : `chantier/audit-p0-sorties`, PR #146.
- **Faits** : composition des 7 wagons — (1) sorties de données P0
  (export newsletter, policy `audit_logs`, jetons dans PostHog/Sentry, IP
  parrainage, purge `spins`, privacy Brevo/Upstash) ; (2) alignement
  catalogue Stripe P0 ; (3) boucle joueur→gain P0 ; (4) contrôle des
  publications + chiffres justes P1 ; (5) capacité live P1 ; (6) poids
  client + états UI + a11y P2 ; (7) workers, surface publique, capteurs de
  test P2/P3. **Wagon 1 livré** : export CSV newsletter exclut les
  désinscrits ; policy `audit_logs` ferme l'échappatoire
  `organization_id is null` (faille réelle confirmée) ; jetons porteurs
  `/commande`, `/hunt`, `/invite` et `next` masqués dans PostHog
  (`before_send`, session recording désactivé) et Sentry (`scrubText` +
  `beforeSendTransaction` sur les 3 runtimes), `p_ip` retiré, en-têtes
  no-referrer/no-store/noindex ; `referral_signups.ip` supprimée ;
  `purge_expired_personal_data` anonymise `spins.player_key` au-delà de la
  rétention (migration `20260924120000`, ADR-102 sur la conséquence
  assumée : « une seule fois » devient « une seule fois par période de
  conservation ») ; privacy déclare Brevo/Upstash.
- **Validations** : wagon 1 — pgTAP 59 fichiers/3372 assertions (vide+semée),
  `verif-complete.sh --rapide` 0 échec, E2E local mobile-chrome passed, CI
  11/11 verte, revue sécurité GO (2 MOYEN/1 FAIBLE/3 INFO — MOYEN 2, FAIBLE
  3, INFO 4 et 6 fermés avant fusion ; MOYEN 1 documenté ADR-102 ; INFO 5
  consigné `docs/bugs.md`). Wagons suivants : `verif-complete.sh` (WSL) + CI
  complète de PR par wagon ; revue sécurité dédiée prévue sur les wagons 1 à
  5 et 7.
- **Risque/blocage** : aucun sur le wagon 1 — PR #146 verte, fusion
  imminente sur l'ordre permanent. Les 4 INCERTAINS de l'audit et les gestes
  propriétaire (rk_live_, jeton Vercel, Brevo/AF2M, prix Stripe) restent hors
  train, consignés dans le suivi.
- **Prochaine action** : fusionner la PR #146 (wagon 1), puis dérouler les
  wagons 2 à 7 ; ce journal reçoit une entrée de clôture quand le train est
  terminé.

### 2026-08-16 — Boucles d'outillage : script de vérif, hooks, babysit CI — **terminé**

- **Lot et objectif** : demande du propriétaire — créer des « boucles » pour
  faciliter le développement. Quatre mécanismes distingués d'abord, parce que
  les confondre est l'erreur habituelle : boucle de session (`/loop`), cron
  cloud (qui ne voit pas la machine, donc ni pgTAP ni E2E), hooks d'événement,
  et script déterministe. Trois retenus par le propriétaire ; la veille
  quotidienne en cron cloud a été écartée.
- **Branche/commits** : `chantier/boucles-outillage`, 1 commit `f532db1`,
  PR #144 fusionnée en squash **`a63ef55`** sur l'ordre permanent. Aucune
  migration.
- **Faits et fichiers** : `scripts/verif-complete.sh` (313 lignes) encode six
  pièges du CLAUDE.md — seed explicite (4), attendre un Postgres qui *répond*
  (5), purge des `pg_prove` orphelins (6), pgTAP vide **et** semée (7), sortie
  en fichier jamais en tube (10), parade du cache `.vite` (12) — plus la garde
  qui manquait en local, la **dérive des types**, que seule la CI voyait à huit
  minutes d'aller-retour ; verrou `flock` ; options `--rapide`, `--db-seul`,
  `--continuer`, `--e2e`. `.claude/hooks/` : `apres-ecriture.mjs` (les 2 gardes
  SQL jouées à l'écriture d'une migration + rappel
  `generate-db-types.mjs --local`, et non `--linked` qui interroge la
  production), `apres-bash.mjs` (interdit de conclure sur un « no tests » avant
  purge de `.vite` et rejeu), `fin-de-tour.mjs` (rappel de ce journal).
  `.claude/commands/babysit-ci.md`. `.gitattributes` (`*.sh text eol=lf`).
  `.claude/settings.json` : bloc `hooks` + 5 permissions.
- **Validations réellement exécutées** : `--rapide` dans le clone WSL —
  13 étapes, 0 échec, 7 min 43 s ; `--db-seul` — 9 étapes, 0 échec, 1 min 25 s,
  avec pgTAP **58 fichiers / 3359 assertions PASS deux fois** (base vide puis
  semée) et dérive des types nulle ; verrou prouvé par deux runs concurrents,
  le second refusé ; les trois hooks testés au tuyau dans les deux sens, celui
  sur `Bash` vu se déclencher en direct ; `fin-de-tour.mjs` élargi puis retesté
  sur 5 cas. CI de la PR #144 : 9 checks verts, sur le SHA de tête **vérifié
  identique** au `headRefOid`. CI `main` sur `a63ef55` : 6 jobs verts.
  « Santé après déploiement » : job **réellement exécuté** (« Healthcheck
  bloquant » `success`), et non ignoré — vérifié, un workflow dont l'unique job
  est sauté rapporte `success` lui aussi.
- **Non exécuté, explicitement** : l'enchaînement `--e2e` de
  `verif-complete.sh` vers `run-e2e-local.sh`. Revue sécurité non requise selon
  la règle du dépôt (aucune migration, route, auth, RLS, webhook ni token) —
  décision explicite, pas une omission.
- **Risque/blocage** : `Bash(gh pr merge *)` entre dans l'allowlist du projet,
  sans quoi la boucle CI s'arrête sur une confirmation à l'instant précis où
  elle doit fusionner. À retirer si l'autonomie doit être réduite. Le hook
  `fin-de-tour.mjs` a d'abord été livré avec un angle mort — il ne regardait que
  les commits *au-dessus* de la base et se taisait donc juste après une fusion ;
  élargi le jour même au dernier commit récent, avec une fenêtre de 12 h pour
  qu'un rappel ne devienne pas du harcèlement.
- **Prochaine action** : aucune côté Claude. Le clone de référence WSL a été
  remis sur `main` (`a63ef55`) ; deux fichiers non commités y ont été **mis de
  côté sans perte** dans `stash@{0}` — dont un correctif de contraste réel sur
  `src/app/dashboard/customers/page.tsx` (`text-orange-600` →
  `text-k-orange-text`, lien `zinc-500` → `text-k-body`/`text-k-ink`), qui
  relève de la dette d'accessibilité déjà consignée : à arbitrer par le
  propriétaire.

### 2026-08-09 — Tris et filtres partout — **terminé**

- **Lot et objectif** : quatre propositions retenues par le propriétaire (2,
  3, 4, 6) parmi une liste de six — recherche/filtre/tri sur Clients et
  Participations avec export fidèle, filtre État + « jamais scanné » sur le
  hub QR, pagination sur les sept listes de modules de la Vue d'ensemble.
- **Branche/commits** : `chantier/tris-filtres-partout`, 14 commits
  au-dessus de `origin/main` (`b441672` … `d9c8704`). PR non encore ouverte.
  Migration `20260923120000`.
- **Faits et fichiers** : `org_qr_hub` (`p_etat`, `p_jamais_scanne`) et
  `org_customer_profiles_page` (`p_q`/`p_segment`/`p_tri`,
  `customer_segment_matches` factorisée) ; page Clients (recherche, segment,
  tri, export CSV, téléphone exclu) ; Participations (période au fuseau
  local, 4 statuts, filtre par lot, export désormais filtré comme l'écran —
  il ne l'était pas avant) ; hub QR (select État + case « jamais scannés ») ;
  3 tuiles de la Vue d'ensemble cliquables vers des listes pré-filtrées ; les
  7 listes de modules gagnent `module-list-filters.tsx` (recherche, statut,
  pagination, elles chargeaient tout sans plafond).
- **Validations réellement exécutées** : typecheck 0, lint 0, `casts:check`
  0, Vitest 264 fichiers / 4161 tests, build vert (47 pages), pgTAP 58
  fichiers / 3359 assertions PASS (vide puis semée, ×2), `migrations:check`
  127 fichiers / tête `20260923120000`, E2E WSL mobile-chrome verts
  (customers, qr-hub, dashboard-home, module-list-filters,
  campaign-templates). CI GitHub de la PR : non exécutée, PR pas encore
  ouverte.
- **Risque/blocage** : revue sécurité GO, 2 MOYEN fermés avant la PR (500 sur
  les participations aux bascules DST à minuit ; export clients mal borné,
  troncature désormais explicite), 4 INFO consignés sans action dans
  `docs/bugs.md`. Aucun blocage technique. CI GitHub de la PR #139 :
  intégralement verte ; fusion squash `379471c` sur l'ordre permanent, puis
  CI `main` et « Santé après déploiement » verts sur ce SHA — migration
  `20260923120000` appliquée en production.
- **État** : terminé, déployé. Prochaine action : aucune. Roadmap V1.56,
  ADR-101.

### 2026-08-09 — Hub QR par type de jeu — **terminé**

- **Lot et objectif** : `/dashboard/qr-codes` n'affichait que les QR de
  campagne ; sept autres modules (chasse, événement, jackpot, fidélité,
  calendrier, quiz, parrainage, pronostics) sans support QR propre restaient
  invisibles depuis ce hub.
- **Branche/commits** : `chantier/qr-hub-types`, 6 commits au-dessus de
  `origin/main` (`dbb6d8b`, `047dfbc`, `95a4f01`, `26a2e4d`, `d55aae0`,
  `53f89cf`). PR non encore ouverte. Sans migration.
- **Faits et fichiers** : RPC `org_qr_hub` (union des QR/liens des 8 types
  de jeux, garde `is_org_editor` calquée sur la RLS vivante, `ilike`
  échappé, `limit` plafonné 100) et son pgTAP dédié
  (`supabase/tests/qr_hub.test.sql`, 51 assertions) ; types régénérés ;
  page `/dashboard/qr-codes` réécrite (sélecteur « Type de jeu » filtré par
  modules actifs, cartes campagne inchangées, nouvelles cartes
  `jeu-lien-card.tsx` pour les autres modules, écran dédié caisse,
  pagination par débordement, filtre campagne conservé) ; scan axe fermant
  40 nœuds `color-contrast` sur `QrCodeCard` ; correctifs post-revue
  sécurité (reportError sur l'échec RPC, assertion `prosecdef`).
- **Validations réellement exécutées** : typecheck 0, lint 0, `casts:check`
  0, Vitest suite complète 262 fichiers / 4131 tests, build vert, pgTAP 57
  fichiers / 3266 assertions PASS (vide puis semée), `migrations:check` 126
  fichiers / tête `20260922120000`, E2E WSL 3 projets (qr-hub +
  campaign-templates + atelier-modules) 61 passed / 6 skipped. CI GitHub de
  la PR #138 : intégralement verte ; fusion squash `0ce78ae` sur l'ordre
  permanent, puis CI `main` et « Santé après déploiement » verts sur ce
  SHA — migration `20260922120000` appliquée en production.
- **Risque/blocage** : revue sécurité dédiée GO, 0 critique/élevé/moyen,
  3 INFO — 2 fermées avant PR, 1 consignée sans action dans `docs/bugs.md`
  (repli du filtre type + octrois datés absents des options ; modules hors
  campagne sans style QR persisté). Aucun blocage.
- **État** : terminé, déployé. Prochaine action : aucune. Roadmap V1.55,
  ADR-100.

### 2026-08-09 — Correctif V1.54.1 : bouton « Voir le jeu » sur les tuiles Statut — **terminé**

- **Lot et objectif** : demande propriétaire immédiate après V1.54 — accéder
  au jeu côté joueur depuis le haut de la page, à côté du raccourci
  « 🛠️ Modifier dans l'atelier ».
- **Branche/commit** : `chantier/bouton-voir-le-jeu`, 1 commit `2dfe831`
  au-dessus de `origin/main`. PR #137 fusionnée en squash `8a88812` après
  CI intégralement verte ; CI `main` et « Santé après déploiement » verts
  sur ce SHA.
- **Faits et fichiers** : composant frère `VoirLeJeu` dans
  `src/components/dashboard/atelier-raccourci.tsx` (classes factorisées avec
  le raccourci atelier) — bouton « 👀 Voir le jeu » (`target=_blank
  rel=noopener`) à côté de « 🛠️ Modifier dans l'atelier » dans les 8 tuiles
  Statut, masqué (`null`) tant que le jeu n'est pas accessible. Les 8 pages
  (`calendar`, `campaigns`, `events`, `hunts`, `jackpot`, `loyalty`,
  `pronostics`, `quiz`) passent `hrefJeu` = exactement l'expression de leur
  lien `apercu` existant, aucune règle recalculée. Roue : `/play/<slug>` du
  premier QR de la liste déjà chargée, sans QR pas de bouton. 3 tests
  unitaires nouveaux + assertion E2E dans `atelier-modules.spec.ts`.
- **Validations réellement exécutées** : typecheck 0, lint 0, Vitest suite
  complète 261 fichiers / 4131 tests, build vert, E2E WSL mobile-chrome
  atelier-modules + campaign-templates 26 passed / 3 skipped
  (`.last-run.json` passed). Aucune migration. CI GitHub de la PR #137 :
  intégralement verte.
- **Risque/blocage** : aucun changement serveur ni auth/RLS/endpoint
  public/webhook/token — revue sécurité non requise selon la règle du
  dépôt (décision explicite, pas une omission).
- **État** : terminé, déployé. Prochaine action : aucune. Roadmap V1.54.1.

### 2026-08-09 — Sept retours propriétaire — **terminé**

- **Lot et objectif** : sept demandes ponctuelles du propriétaire après
  capture d'écran et test à la main de V1.53 (fonds d'écran thématiques).
- **Branche/commits** : `chantier/sept-retours-proprietaire`, 9 commits
  au-dessus de `main` (`500ecd4`, `d1fb464`, `abfc131`, `467791b`, `42b539e`,
  `e6d9c67`, `67f6f0b`, `f27b01f`, `b957f19`) — PR #136 fusionnée en squash
  `de3ccd2` sur l'ordre permanent après CI intégralement verte ; CI `main` et
  « Santé après déploiement » verts sur ce SHA. Sans migration.
- **Faits et fichiers** : retrait complet de `ThemeDecor` (945 lignes + test,
  champ `decor` retiré des 3 tables de tokens et des presets, `playDecor` et
  classes `decor-float` purgés) — voir ADR-099, qui inverse partiellement
  ADR-093 sur décision propriétaire. 18 presets d'habillage en deux familles
  (« Ambiances » n'écrasent plus le fond choisi, « Univers » posent couleurs
  ET fond, le fond porté par l'objet style et non le preset — OPTION A).
  `src/lib/qr-style-du-jeu.ts` dérive le style d'un QR créé depuis la page du
  jeu (lavis d'univers + accent, 100 % serveur), libellé prérempli avec le
  nom du jeu. « Progression » renommée « Missions & coffres » (🗝️), déplacée
  d'Outils vers la fin de « Vos animations », route inchangée. Zone
  dangereuse et Partage/parrainage rentrent dans une Card unique par tuile
  (capture propriétaire fermée). Page QR codes : recherche, filtre campagne,
  Réinitialiser, jointure du nom de campagne. Bouton « 🛠️ Modifier dans
  l'atelier » dans les 8 tuiles Statut (`atelier-raccourci.tsx`).
- **Validations réellement exécutées** : typecheck 0, lint 0, casts:check ok,
  Vitest 261 fichiers / 4128 tests, build vert, aucune migration (tête
  inchangée `20260921120000`), E2E WSL : wheel-wizard+calendar 16 ✓ (scans
  axe Habillage 18 boutons + page joueur sans décor), referral 4/4 +
  progression 4/4 + atelier-modules 26 ✓ mobile-chrome et 14/14
  desktop-smoke + campaign-templates 1/1, puis quiz 1 + pronostics 2 +
  player-win 7 (scans axe post-retrait) — 0 rouge au total. Revue sécurité
  dédiée exécutée : GO, 0 critique/élevé/moyen, 2 INFO consignés sans action
  dans `docs/bugs.md`. CI GitHub de la PR #136 : intégralement verte (E2E
  Chromium+WebKit, pgTAP/ACL/RLS, CodeQL, typecheck/lint/Vitest/build, site,
  audit) ; fusion squash `de3ccd2` sur l'ordre permanent, puis CI `main` et
  « Santé après déploiement » verts sur ce SHA.
- **État** : terminé, déployé. Roadmap V1.54, ADR-099. Prochaine action :
  aucune.

### 2026-08-08 — Fonds d'écran thématiques — **terminé**

- **Lot et objectif** : palette d'habillage saisonnière partagée
  (calendrier/pronostics/quiz/roue) élargie de 6 à 11 clés — univers non
  saisonniers en plus des fêtes — et fond d'écran image sur les surfaces
  joueur, plus un choix explicite de fond pour la roue (le décor de roue
  reste au preset, contrairement aux 3 autres surfaces qui suivent le thème
  choisi).
- **Branche/commits** : `chantier/fonds-ecran-themes`, 6 commits au-dessus
  de `origin/main` — `95c32de` (40 WebP dans `public/fonds` +
  `scripts/optimiser-fonds.mjs`), `815459e` (palette 6→11 dans 5 recopies,
  `src/lib/fonds-ecran.ts`, `wheelStyleSchema.fond`), `7a158a8` (migration
  `20260921120000_habillages_univers.sql`, pgTAP 29→41 assertions),
  `b3d218d` (composant `FondEcran`, 4 surfaces joueur, atelier roue),
  `b63fed1` (3 INFO revue fermés : `Object.hasOwn`, `wheelStyleWriteSchema`
  qui refuse un fond inconnu à l'écriture, `asFondKey` retiré), `c7214bd`
  (E2E : radio sr-only 1×1 px devenue couche cliquable pleine tuile, cause
  du flake = `scroll-behavior: smooth`).
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **260 fichiers /
  4108 tests** (campagne QA complète) + re-runs ciblés verts après les 2
  commits correctifs (154 et 297 tests) ; build vert ; pgTAP **56 fichiers /
  3215 assertions** PASS vide et semée ; migrations:check 125/tête
  `20260921120000` ; sql:check, casts:check ok ; E2E WSL mobile-chrome
  (calendar, player-win, pronostics, quiz, wheel-wizard) — tous les scans
  axe verts sans retoucher le voile ; wheel-wizard 12/12 après correctif,
  sélecteur rejoué ×3 vert ; suite complète rejouée sur l'arbre final
  (docs comprises) : **261 fichiers / 4117 tests**. Revue sécurité dédiée :
  **GO, 0 critique/élevé/moyen, 3 INFO fermés avant PR**. CI GitHub de la
  PR #135 : intégralement verte (E2E Chromium+WebKit, pgTAP/ACL/RLS, CodeQL,
  typecheck/lint/Vitest/build, site, audit) ; fusion squash `c955108` sur
  l'ordre permanent du propriétaire, puis CI `main` et « Santé après
  déploiement » verts sur ce SHA — migration `20260921120000` appliquée en
  production.
- **Reste ouvert** : `games.style` garde un `.catch(undefined)` aussi à
  l'écriture (même forme que l'INFO fermée) ; `wheelStyleSchema.partial()`
  des modèles de campagne tolère un fond inconnu à l'écriture (défendable,
  désormais écrit) ; `scroll-behavior: smooth` reste un piège pour tout
  futur `click()` E2E sur cible petite et basse ; fonds natifs 1672 px,
  léger étirement assumé au-delà ; `espace` partage l'`accentChip` de
  `festival`. Détails dans `docs/bugs.md`. ADR-098, roadmap V1.53.
  **Prochaine action : aucune** — PR #135 fusionnée et déployée, santé
  post-déploiement verte.

### 2026-08-08 — Partage après jeu : un réglage par surface — **terminé**

- **Lot et objectif** : le propriétaire décoche « Activer le parrainage sur
  cette campagne » et voit toujours côté joueur « Faites gagner vos proches /
  Partager sur WhatsApp / Copier le lien ». Cause identifiée : deux widgets
  distincts — `ReferralPanel` (parrainage récompensé, correctement gaté) et
  `ShareInvite` (partage générique post-partie, rendu sans aucun réglage sur
  les 4 coquilles de `/play`). Audit de 8 surfaces publiques en parallèle :
  même défaut sur le quiz ; calendrier déjà correct ; chasse, fidélité,
  jackpot, événement, portefeuille et commande propres.
- **Branche/commits** : `chantier/partage-apres-jeu`, 8 commits au-dessus de
  `origin/main` — `4baff77` (DB campagne), `f56e81c` (types), `f0e51d0` (DB
  quiz), `404f771` (types), `0f83ebc` (frontend), `944a031` (backend),
  `58c487e` (revue sécurité : refus honnête à 0 ligne), `c6ad6d9` (revue
  sécurité : défaut `!== false` aligné sur `/play`). Migrations
  `20260919120000_partage_apres_jeu.sql` et
  `20260920120000_partage_apres_jeu_quiz.sql`.
- **Faits et fichiers touchés** : `campaigns.share_enabled` et
  `quizzes.share_enabled` (boolean not null default true, grants additifs) ;
  `updateCampaignShareInvite` (`src/actions/campaigns.ts`),
  `updateQuizShareInvite` (`src/actions/quiz.ts`) ; `QuizPublicContext.shareEnabled`
  (lu `!== false`) ; prop `shareEnabled` requise enfilée de `/play` à travers
  13 wrappers jusqu'aux 4 coquilles ; case « Proposer le partage du jeu après
  une partie » dans la tuile campagne renommée « Partage et parrainage »
  (`campaign-share-settings.tsx`, autosave) ; `QuizShareSettings` dans
  l'éditeur quiz.
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **259 fichiers /
  4085 tests** (puis re-run ciblé 80 tests incluant les 4 nouveaux des
  correctifs de revue) ; build vert (46 pages) ; pgTAP **56 fichiers / 3203
  assertions** PASS base vide et semée ; migrations:check 124/tête
  `20260920120000` ; sql:check et casts:check ok ; E2E WSL desktop-smoke
  15/15 (player-win 5, skill-games 3, quiz 1, campaign-templates 1,
  auth.setup 4) + re-run `referral.spec.ts` 4/4 réellement joué sur
  mobile-chrome et campaign-templates 1/1. CI GitHub de la PR #134 :
  intégralement verte (E2E Chromium+WebKit, pgTAP/ACL/RLS, CodeQL,
  typecheck/lint/Vitest/build, site, audit) ; fusion squash `10821b9` sur
  l'ordre permanent du propriétaire, puis CI `main` et « Santé après
  déploiement » verts sur ce SHA — migrations appliquées en production.
- **Risque/blocage** : revue sécurité dédiée GO, 0 critique/élevé ; 1 MOYEN
  fermé avant PR (`58c487e` : les actions campagne partage et prejeu
  refusaient un update à 0 ligne sans le signaler — refus honnête via
  `.select("id")`, message fondu anti-oracle, harnais de mock durci) ; 1
  FAIBLE fermé (`c6ad6d9` : défaut d'absence de colonne aligné entre `/play`
  et le quiz). Reliquats consignés sans action dans `docs/bugs.md` :
  `?ref=share` reste accepté par les mécaniques d'acquisition même partage
  décoché (question produit) ; suite ACL sans assertion de liste fermée des
  colonnes writables ; ligues de pronostics sans réglage commerçant sur leurs
  codes d'invitation ; aucun test comportemental sur `share_enabled=false`
  (couverture structurelle) ; `referral.spec.ts` sans tag `@smoke`.
- **Prochaine action** : aucune — PR #134 fusionnée et déployée, santé
  post-déploiement verte. Les reliquats sans action vivent dans
  `docs/bugs.md`.

### 2026-08-08 — Correctif V1.51.1 : trois états de tuile, tout se replie — **à relire**

- **Lot et objectif** : retour propriétaire immédiat après V1.51, capture à
  l'appui — un QR absent s'affichait VERT (la règle ne connaissait que
  rouge/vert), le statut devait être plus visuel, et tout devait se replier
  uniformément sur les 8 pages.
- **Branche/commits** : `chantier/checklist-3-etats`, `739e8a9` (3 états :
  `attention` orange « À compléter » pour un contrôle non-bloquant !ok — le
  vert redevient réservé au vraiment-rempli ; badge lisible patron
  StatusBadge + liseré teinté, fini le point de 12 px) + `573bea7` (les 8
  vues nues n'ont plus qu'un bloc ouvert — le Statut ; Carte de l'Aventure
  en tuile-boussole résumée par la phase réelle, porte d'atelier repliée
  avec résumé par module, rang et verdict conservés — c'est elle qui porte
  les contrôles d'ouverture). Aucune migration.
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **258 fichiers /
  4066 tests** ; build vert ; E2E local WSL desktop-smoke atelier-modules +
  wheel-wizard **15 ✓** (specs adaptées via ouvrirTuile ; wheel-wizard sans
  changement). CI de la PR : à venir au moment de l'écriture, fusion sur
  l'ordre permanent dès verte.
- **Prochaine action** : aucune côté Claude après fusion.

### 2026-08-08 — Tuiles checklist + autosave — **à relire**

- **Lot et objectif** : demande propriétaire — sur chaque page de jeu, toutes
  les tuiles refermées par défaut, numérotées dans l'ordre des tâches,
  pastille rouge (obligatoire manquant) / verte (complet — vide-mais-optionnel
  valide) ; tout réglage s'enregistre automatiquement, notification en haut à
  droite.
- **Branche/commits** : `chantier/tuiles-checklist-autosave`, 9 commits
  au-dessus de `main` (`8c1ca75`) — `269cbc4` (socle checklist), `a9b2913`
  (socle autosave), `d77e751` (M1 campagnes+roue), `edf5690` (M3
  chasse+fidélité+jackpot), `3685e3a` (M4 événements+pronostics), `c944520`
  (M2 quiz+calendrier), `9d8b5d3`+`f858127` (réparation E2E). PR à ouvrir vers
  `main` (**non fusionnée**, fusion prévue sur l'ordre permanent du
  propriétaire dès la CI verte). Sans migration.
- **Faits** : `src/lib/checklist/` mappe les contrôles d'activation V1.47 vers
  des tuiles ordonnées par page (défauts `bloquant` tranchés par module) ;
  `CarteRepliable` numérote/statue/résume et rouvre par ancre ; `useAutoSave`
  (debounce 800 ms, jamais au montage, flush sortie de champ) + toast global
  (bus sans `Provider`) déployés sur 8 pages détail et ~25 formulaires ;
  correctif de la file dans `useActionForm` (perte silencieuse de la dernière
  frappe en resoumission rapprochée) ; exclusions actées (statuts,
  publication, zones dangereuses, créations, finalize/tirage/résultats,
  motif de verrouillage, uploads) et protections spécifiques conservées
  (`day_count` calendrier, `PrizeRow` compare-and-swap, `ContestEventCard`
  manuelle). Voir ADR-096, roadmap V1.51.
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **256 fichiers /
  4029 tests** ; build vert (via `run-e2e-local` WSL) ; migrations inchangées
  (122, tête `20260918120000`), sql:check ok ; E2E WSL desktop-smoke ciblé
  (pronostics+referral+campaign-templates 9 ✓, calendar+atelier-modules
  15 ✓, wheel-wizard+quiz 6 ✓, referral mobile-chrome 8 ✓). CI de la PR au
  moment de l'écriture : à venir.
- **Risque/blocage** : aucun bloquant identifié. État de repli des tuiles non
  persisté, `useAutoSave` peut perdre la dernière frappe sur navigation sans
  `blur` avant l'échéance du debounce (borné par le flush sortie de champ) —
  consignés dans `docs/bugs.md`, non corrigés (impact nul en prod, 1 org de
  test).
- **Prochaine action** : PR ouverte, fusion sur l'ordre permanent dès CI
  verte ; matrice E2E mobile complète en reliquat CI.

### 2026-08-08 — Correctif V1.50.1 : l'aperçu suit le clic, émojis de nav — **à relire**

- **Lot et objectif** : retour propriétaire immédiat après V1.50 — « quand je
  sélectionne le jeu à gratter, l'aperçu montre toujours la roue » + émojis
  demandés dans la barre latérale. Cause reproduite : l'étape « Le jeu »
  n'avait aucun aperçu et L'habillage lit la mécanique ENREGISTRÉE (naviguer
  au stepper sans Enregistrer montrait l'ancienne).
- **Branche/commit** : `chantier/apercu-vivant`, `2bea98f`, aucune migration.
- **Faits** : aperçu vivant à l'étape « Le jeu » (ApercuAccueilJeu extrait de
  l'éditeur d'habillage, piloté par la sélection AU CLIC, avant enregistrement) ;
  carte « Roues du jeu » → « Vos jeux », étiquettes des 15 mécaniques par le
  catalogue (un memory n'est plus une « Roue ») ; émojis de nav en span
  aria-hidden (noms accessibles inchangés, aucun locator E2E touché).
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **248 fichiers /
  3931 tests** (5 nouveaux) ; build vert. CI de la PR au moment de l'écriture :
  à venir (fusion sur l'ordre permanent dès verte).
- **Prochaine action** : aucune côté Claude après fusion.

### 2026-08-08 — Retours propriétaire : six demandes sur V1.48/V1.49 — **à relire**

- **Lot et objectif** : six retours directs du propriétaire sur les
  livraisons dashboard/thèmes/ateliers (V1.48/V1.49) — fonds jugés trop
  discrets, aperçu qui ne montre pas le jeu, case de calendrier vide qui
  bloquait à tort la publication, aucun moyen de demander un avis avant un
  jeu, navigation d'étapes absente en haut des ateliers, titres à
  retravailler.
- **Branche/commits** : `chantier/retours-proprietaire`, 12 commits au-dessus
  de `main` (`7f42b20`) — PR à ouvrir vers `main` (**non fusionnée**, fusion
  prévue sur l'ordre permanent du propriétaire : « migre tout dès la réponse
  de la CI »). `7882f8c` (titres), `d814b39` (fonds redessinés), `5944b8f`
  (navigation d'étapes), `f7a5d3a`+`9d69f58` (migration `20260918120000`,
  invitation avant-jeu), `a94d976`+`afd53b4` (calendrier case vide), `1b1e796`
  (aperçu par jeu + `style.games`), `5868b13` (invitation avant-jeu
  complète), `2472bff` (reprise specs E2E calendrier), `05345ff` (resserrement
  liste blanche Google).
- **Faits et fichiers** : voir CLAUDE.md § Last Updated pour le détail des
  six livraisons ; ADR-094 (invitation avant-jeu) et ADR-095 (calendrier
  case vide) dans `docs/decisions.md` ; roadmap V1.50.
- **Validations réellement exécutées** : typecheck 0 (racine + site), lint
  0, Vitest 247 fichiers / 3926 tests, build racine (46 pages) + site verts,
  migrations:check 122/tête `20260918120000`, sql:check ok, casts:check ok,
  pgTAP 56 fichiers / 3196 assertions PASS vide+semée (dont les 15 ACL
  invitation et les 9 calendrier, jouées pour la première fois — condition
  du GO sécurité), E2E desktop-smoke WSL sur le commit final : 42/42
  (atelier-modules+calendar 15, wheel-wizard 5, pronostics+quiz 9,
  player-win+skill-games 13 ; l'unique rouge de la première passe était un
  serveur résiduel tenant le port, environnemental, prouvé par rejeu).
  **CI GitHub non exécutée au moment de l'écriture** — la PR la jouera.
- **Risque/blocage** : aucun connu. Revue sécurité dédiée close avant PR :
  GO, 0 critique/élevé, 1 MOYEN fermé (liste blanche Google resserrée aux
  hôtes exacts + chemin borné), 2 INFO fermés, 2 INFO documentés sans action
  (`docs/bugs.md`).
- **Prochaine action** : ouvrir la PR vers `main` ; fusion dès la réponse
  verte de la CI, sur l'ordre permanent du propriétaire — aucune décision
  supplémentaire à attendre côté Claude sauf si la CI est rouge.

### 2026-08-07 (soir) — Fusion des PR #128 et #129 sur ordre propriétaire — **terminé**

- **Lot et objectif** : ordre direct du propriétaire — « migre tout dès la
  réponse de la CI ». Les deux CI étaient intégralement vertes.
- **Faits** : PR #128 (apparence dashboard) fusionnée en squash `0c018fd`
  (CI verte sur `509b6a5`) ; puis `main` mergé dans
  `chantier/themes-cartoon`, conflit de docs résolu (les deux PR
  revendiquaient V1.48/ADR-092 depuis le même `main`) : #128 garde
  **V1.48/ADR-092**, le chantier thèmes est renuméroté **V1.49/ADR-093**
  (roadmap, decisions, bugs, CLAUDE.md) ; PR #129 fusionnée après re-CI
  verte sur le commit de merge. Une advisory npm ambiante (dompurify via
  posthog-js, GHSA-55q2-fjhq-7xh7) avait été fermée sur les deux branches
  par bump de lockfile avant fusion.
- **Validations exécutées** : CI complète verte des deux PR avant fusion
  (E2E 3 navigateurs, pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build,
  audit, site) ; re-CI sur le merge de `main` dans #129 avant sa fusion ;
  vérification post-fusion de l'application de la migration
  `20260917120000` et du workflow « Santé après déploiement » sur `main`.
- **Risque/blocage** : aucun. Les entrées détaillées des deux chantiers
  sont ci-dessous, écrites avant fusion (leurs mentions « PR ouverte /
  décision propriétaire en attente » sont donc dépassées par la présente).
- **Prochaine action** : aucune en attente côté Claude.

### 2026-08-07 — Fonds thématiques cartoon — **à relire**

- **Lot et objectif** : demande directe du propriétaire — quand un thème est
  choisi (Noël, Saint-Valentin…), le fond doit suivre : remplacer les lignes
  fades par des décors cartoon (rennes, têtes de Père Noël, sucres
  d'orge…), sur toutes les surfaces et aussi pour les pronostics (qui
  n'avaient encore aucun thème).
- **Branche/commits** : `chantier/themes-cartoon`, 4 commits au-dessus de
  `main` (`56874f3`) — PR à ouvrir vers `main` (**non fusionnée**, décision
  propriétaire en attente). `030265c` (DB, migration
  `20260917120000_themes_saisonniers.sql`), `7286746` (backend), `cce05a6`
  (frontend), `e8a1f89` (durcissement INFO-1).
- **Faits et fichiers** : `contests.theme` reçoit la même palette 6 clés
  que `calendars.theme` (aucune deuxième enum). `updateContest` accepte
  `theme` en optionnel-préservant. `src/lib/seasonal-theme.ts` devient la
  source unique de l'enum. **`ThemeDecor` a été entièrement retiré en V1.54
  (2026-08-09), sur décision propriétaire — voir ADR-099 ; la description
  ci-dessous reste celle du composant tel qu'il a existé du 2026-08-07 au
  2026-08-09.** `ThemeDecor` (16 scènes, 28 motifs cartoon,
  13 emplacements déterministes) posé sur `PlayerPageShell` (les 4 shells
  joueur factorisés), `/play`, et les 3 aperçus éditeurs (calendrier, quiz,
  roue). Pronostics gagne un sélecteur 6 vignettes et une Saint-Valentin
  restylée. `Object.hasOwn` ajouté sur les 3 tables de tokens (INFO-1 de
  la revue sécurité).
- **Validations réellement exécutées** : typecheck 0, lint 0, Vitest
  238 fichiers / 3803 tests, build vert, migrations:check 121 (tête
  `20260917120000`), sql:check ok, casts:check ok, pgTAP 56 fichiers /
  3172 assertions PASS (base vide et semée), E2E ciblé WSL (pronostics,
  calendar, quiz, player-win — 3 projets, scans axe) : 42 passed / 6
  skipped / 0 failed. Revue sécurité dédiée exécutée : GO, 0
  critique/élevé/moyen/faible, 4 INFO (1 corrigée avant fusion, 3 en suivi
  `docs/bugs.md`). CI GitHub Actions **non jouée** au moment de l'écriture
  de cette entrée (la PR la jouera dès son ouverture) — explicitement non
  exécutée.
- **Risque/blocage** : cette branche part de `main` **sans** la PR #128
  (« apparence dashboard », ouverte, non fusionnée), qui modifie aussi
  CLAUDE.md/journal/roadmap/handoff/bugs. Un conflit de docs trivial est
  attendu entre les deux PR — la seconde fusionnée devra merger `main`
  d'abord (gotcha squash-branches-chaînées déjà connu du dépôt). Ordre de
  déploiement à respecter à la fusion : la migration doit précéder la
  promotion du build Vercel (sinon 42703 côté `/pronos` le temps de la
  fenêtre).
- **Prochaine action** : ouvrir la PR, attendre la CI complète, puis
  décision propriétaire de fusion (comme #125, #126, #127).

### 2026-08-07 — Apparence dashboard : clarté et rappels fermables — **à relire**

- **Lot et objectif** : demande directe du propriétaire — améliorer
  l'apparence et la clarté du dashboard, 7 points, sans migration.
- **Branche/commits** : `chantier/apparence-dashboard` (5 commits au-dessus
  de `main` `56874f3`) — **aucune migration**. `eaf50a2` (shell : fin du
  débordement horizontal, sidebar défilante, rappels fermables), `dabf9ec`
  (page du jeu repliable + QR embarqué), `18dddd1` (titres de cartes
  uniformisés), `4b77353` (accueil dédoublonné, Conseiller fermable),
  `1cb13a5` (revue sécurité fermée avant PR : 2 MOYEN + 3 INFO corrigés).
  **PR #128 ouverte vers `main`** (CI lancée sur `6d0d902`) ; fusion =
  décision propriétaire (comme #125, #126, #127).
- **Faits et fichiers** : slot actions de `PageHeader` (`min-w-0 max-w-full`
  au lieu de `shrink-0`) et 8 formulaires de création bornés (`max-w-xl`)
  corrigent le débordement à la source. `src/lib/rappels.ts` (pur, testé) +
  `src/actions/rappels.ts` + `RappelFermable` : rappels fermables par cookie
  à liste blanche de préfixes de clé (les 3 bandeaux bloquants restent
  impossibles à fermer par construction) ; voir ADR-092. Page détail
  campagne : 6 blocs repliables via `CarteRepliable` (bouton `aria-expanded`,
  pas `<details>` — Chromium retire le rôle heading aux descendants d'un
  `<summary>`) ; QR embarqué directement sur la page du jeu, fin de
  l'aller-retour vers l'onglet QR Codes. `Card` impose désormais
  `[&>h2]:text-lg [&>h2]:font-black` en un point unique (67 titres alignés).
  Accueil : suppression des 4 règles opérationnelles du Conseiller
  redondantes avec des tuiles existantes ; Conseiller fermable.
- **Validations exécutées** : typecheck 0, lint 0, Vitest **237 fichiers /
  3806 tests** verts, migrations:check / sql:check / casts:check ok, build
  vert (46 pages) — campagne locale complète. **CI distante pas encore
  jouée au moment de l'écriture** (la PR la déclenchera). E2E ciblé WSL
  (Supabase reset+seedé, build réel, 3 projets) sur dashboard-home,
  referral, wheel-wizard, campaign-templates : 35 passed / 1 skipped /
  1 failed — l'unique rouge est un flake WebKit préexistant sur la caisse
  (titre du test porte déjà « comportement préexistant »), confirmé bénin
  par rejeu isolé ×3 vert.
- **Risque/blocage** : aucun technique. Fusion = décision propriétaire.
- **Prochaine action** : ouvrir la PR vers `main`, fusion sur décision
  propriétaire. Chantier suivant annoncé par le propriétaire : fonds
  thématiques cartoon par thème (décors SVG, thème pronostics avec
  migration `contests.theme`), en préparation, PR séparée.

### 2026-08-07 — L'Atelier partout : extension aux 7 modules de création — **à relire**

- **Lot et objectif** : demande directe du propriétaire — « fais l'extension
  du modèle atelier aux autres modules de création », après fusion de
  V1.46. Généraliser le patron des deux visages (vue suivi / atelier par
  `?etape=`) livré sur la roue aux 7 modules restants : quiz, calendrier de
  l'Avent, chasse au trésor, passeport de fidélité, jackpot collectif,
  événement live, pronostics.
- **Branche/commits** : `chantier/atelier-modules`, PR #127 ouverte vers
  `main` (**non fusionnée**, décision propriétaire en attente) — **aucune
  migration**. `3390c63` (primitives génériques extraites de la roue),
  `1cd2595` (chasse + fidélité), `fe79eeb` (quiz + calendrier), `fde377c`
  (pronostics), `3160e61` (jackpot + événement), `573270b` (factorisation :
  porte d'entrée unique, type `ControleActivation` partagé, 2 correctifs
  INFO sécurité), `cd7648b` (specs E2E des 7 ateliers + balayage a11y),
  `fbbe7e2` + `76341d4` + `93319ea` (trois tours de correction CI).
- **Faits et fichiers** : chaque route détail garde une seule URL — sans
  `?etape=`, vue suivi (Carte de l'Aventure, statut, QR/stats/classement,
  relance, porte « Ouvrir l'atelier ») ; avec `?etape=`, mode atelier
  (stepper Kermesse, une carte par étape). Primitives génériques
  `atelier-etapes.ts` / `AtelierStepper` / `AtelierNavigationEtape`
  extraites de la roue V1.46, qui migre dessus sans changer de comportement
  (`e2e/wheel-wizard.spec.ts` vert sans modification). Zéro migration, zéro
  nouvelle action : chaque étape poste une action existante complète ; les
  5 cartes Réglages monolithiques restent des étapes indivisibles.
  Préconditions de publication (`activationBlocker` de quiz/calendar/
  jackpot, blocs inline de hunts/loyalty/events) extraites en modules purs
  testés sous `src/lib/activation/` (7 modules + `controle.ts`), consommés
  par l'action ET par l'étape « La vérification ». Trois bugs vivants
  corrigés : pronostics effaçait `default_locks_at` sur un
  no-op (`contest-settings.tsx:446-450`, hidden désormais pré-rempli,
  bouton grisé prouvé par E2E) ; cinq 404 injustifiés sur des pages détail
  refusant le droit payé alors que le brouillon est gratuit
  (`capacitesDuModule` + `ModuleCapabilityNotice`) ; deux ancres
  `#reglages` menteuses et un écran comptoir jackpot hors de son mode.
  Nouvelle spec `e2e/atelier-modules.spec.ts` (19 tests, premiers E2E et
  scans axe de ces 7 pages) a fait fermer sur trois tours de CI des
  violations de contraste préexistantes (liens retour zinc-500, liens
  orange bruts des affiches/cartes de commande — dette V1.45 pelée sur ces
  surfaces) et débusqué un invariant : une case de calendrier ne peut pas
  devenir invalide par édition, le serveur la refuse.
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check 120 (aucun SQL) ; sql:check ok ; Vitest **235 fichiers /
  3775 tests** ; build vert. **CI complète VERTE sur `93319ea`** (run
  31188136154). Revue sécurité dédiée : **GO, 0 critique/élevé/moyen** —
  l'élargissement d'accès ne change que « qui voit sa propre donnée », la
  publication reste verrouillée en base via `assert_module_publish_allowed`
  (inchangé), 2 INFO corrigées avant fusion, 2 INFO en suivi (`docs/bugs.md`).
- **Risque/blocage** : aucun technique — la CI est verte de bout en bout.
  Seul point en attente : décision du propriétaire sur la fusion de la PR
  #127 (comme #125 et #126, toujours en attente). Hors périmètre assumé et
  consigné (roadmap V1.47, `docs/bugs.md`) : cinq schémas monolithiques non
  assouplis en partiel, garde de publication en base absente pour
  pronostics (rien côté serveur), 3 formulaires `updateContest` non
  fusionnés, questions de pronostics INSERT-only, leaderboard quiz non lu,
  `createLoyaltyOrderCodes` sans garde de module propre (impact nul).
- **Prochaine action** : décision propriétaire sur la fusion des PR #125,
  #126 et #127 vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-07 — L'Atelier du jeu — **à relire**

- **Lot et objectif** : demande directe du propriétaire — « lance le
  chantier proposé », l'assistant de création en étapes proposé en clôture
  de la refonte clarté V1.45. Accompagnement guidé et DÉTERMINISTE, sans IA
  (décision propriétaire du retrait de l'IA payante réaffirmée).
- **Branche/commits** : `chantier/assistant-creation`, PR #126 ouverte vers
  `main` (**non fusionnée**) — **aucune migration**. `d009bf6` (5 étapes
  nommées, la roue se règle par carte), `7b19ee1` (extraction `partSur10` en
  module pur partagé Lots/Vérification), `2682708` (spec E2E + scan axe de
  bout en bout), `146aed1` + `0faa05a` (correctifs des 13 violations
  d'accessibilité débusquées par le nouveau scan axe : contrastes, selects
  et cases sans nom accessible).
- **Faits et fichiers** : diagnostic préalable (5 explorateurs) sur
  `/dashboard/campaigns/[id]/wheel` — 102 contrôles interactifs simultanés,
  6 actions d'écriture sur 12 boutons Enregistrer sans état global,
  « Ouvrir aux joueurs » sans précondition métier, 13 mécaniques sur 15 sans
  effet visible des réglages, aucune spec E2E ni scan axe. La page devient
  l'Atelier : 5 étapes (Le jeu / Les lots / L'habillage / Le créneau / La
  vérification) navigables par `?etape=` sur la MÊME route (les 6
  `revalidatePath` restent valides), zéro nouvelle action serveur, zéro
  migration — chaque étape poste une sauvegarde EXISTANTE complète. Étape
  Vérification : `src/components/dashboard/atelier-verification-state.ts`,
  module pur testé, lot gagnant tirable au miroir de
  `perform_atomic_spin`, CTA unique vers `#statut` (seul endroit qui
  publie). `createCampaign` redirige désormais vers l'Atelier ;
  `applyCampaignTemplate` garde le détail. Nouvelle spec
  `e2e/wheel-wizard.spec.ts` (8 tests, premier E2E et premier scan axe de
  cette page).
- **Validations exécutées** : typecheck 0 ; lint 0 ; Vitest **225 fichiers /
  3654 tests** ; build vert. **CI complète VERTE sur `0faa05a`** (run
  31167771881 : E2E 3 navigateurs dont la nouvelle spec wheel-wizard,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit). Revue sécurité
  dédiée **non requise** selon la règle du dépôt : aucune migration, route
  API, auth, RLS, webhook ni token touchés — seule la cible d'un redirect
  interne change (documenté explicitement, pas une omission).
- **Risque/blocage** : aucun technique — la CI est verte de bout en bout.
  Le seul point en attente est une décision du propriétaire sur la fusion
  de la PR #126 (comme la PR #125, toujours en attente). Hors périmètre
  assumé et consigné (roadmap V1.46, bugs.md) : préconditions de
  publication en base (`set_campaign_status` sans garde métier), toggle
  `is_active`, réordonnancement des segments, quota brouillon sur
  `applyCampaignTemplate`.
- **Prochaine action** : décision propriétaire sur la fusion des PR #125 et
  #126 vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-07 — Refonte clarté espace commerçant — **à relire**

- **Lot et objectif** : demande directe du propriétaire — l'espace
  commerçant beaucoup plus clair, plus ludique, plus simple ; savoir
  immédiatement où l'on est et quoi faire ; étapes précises ; fin des
  « cases dans tous les sens ». Cartographie préalable par 7 explorateurs
  parallèles, puis trois lots : Vue d'ensemble recomposée autour d'un hero
  « Votre prochaine action », navigation groupée en 4 zones avec en-têtes
  unifiés, et un pas-à-pas exact (états nommés, publication au même
  endroit sur les 8 pages détail).
- **Branche/commits** : `chantier/clarte-commercant`, PR #125 ouverte vers
  `main` (**non fusionnée**) — **aucune migration**. `349ab27` (navigation
  groupée + correctif accès offert au menu), `92a4223` (Vue d'ensemble),
  `62b41b4` (pas-à-pas exact), `57cd55e` (2 correctifs revue sécurité),
  `e1ad5af` (merge `origin/main`, résolution du conflit du squash PR #124
  prouvée sans perte), `5be9f57` + `9aa56aa` + `5568f57` + `f0ba41d`
  (réparation E2E CI : locators nommés + token de contraste
  `--color-k-orange-text`).
- **Faits et fichiers** : hero `src/components/dashboard/prochaine-action.tsx`
  (+ `-state.ts`) absorbe la checklist d'onboarding ; fusion Centre
  d'animation + Tableau d'équipe ; Conseiller réduit à 4 conseils max ;
  correctif `layout.tsx` (accès offert manquant dans
  `activeExperienceKinds`) ; `src/components/ui/status-badge.tsx` et
  `src/components/ui/page-header.tsx` nouveaux ; `experience-lifecycle.ts`
  ne montre plus « Bravo, prête à être partagée ! » sur une campagne en
  pause (bug prouvé, corrigé) ; ancres `#reglages/#statut/#suivi/#relance`
  sur les 8 pages détail ; token `--color-k-orange-text: #b45309` (4.66:1
  crème, 5.02:1 blanc) appliqué après que le scan axe ajouté à
  `e2e/dashboard-home.spec.ts` a trouvé de vraies violations de contraste.
- **Validations exécutées** : typecheck 0 ; lint 0 ; `casts:check` 0 ;
  `migrations:check` 120 (aucun SQL, aucune migration) ; `sql:check` ok ;
  Vitest **222 fichiers / 3626 tests** ; build vert. **CI complète VERTE
  sur `f0ba41d`** (run 31158677255 : E2E Chromium+WebKit 3 projets,
  pgTAP/RLS, CodeQL, typecheck/lint/Vitest/build, audit npm, site
  vitrine). Revue sécurité dédiée : **GO, 0 critique/élevé/moyen**, 2 INFO
  corrigés avant fusion, 2 INFO laissés en suivi dans `docs/bugs.md`
  (pages en lecture seule sans redirect de rôle, préexistant ; liens
  orange sous 4.5:1 hors pages scannées par le nouveau token).
- **Risque/blocage** : aucun technique — la CI est verte de bout en bout.
  Le seul point en attente est une décision du propriétaire sur la fusion
  de la PR #125. Hors périmètre assumé et consigné (roadmap V1.45,
  bugs.md) : wizard de création multi-écrans, boutons « Enregistrer »
  multiples sans état global, unification des 9 cartes de caisse,
  généralisation de `PageHeader` aux pages détail.
- **Prochaine action** : décision propriétaire sur la fusion de la PR #125
  vers `main`. Aucune action Claude en attente sur ce lot.

### 2026-08-06 — Correctif produit : l'IA payante retirée, un conseiller gratuit à la place — **terminé**

- **Lot et objectif** : le lot D (§9.5, assistant de création) avait été livré
  avec un **appel à l'API payante d'Anthropic** (facturation au jeton). **Le
  propriétaire ne voulait pas d'IA facturée** — il voulait un accompagnement
  simple, dans le code, gratuit. Ce lot **retire** l'IA payante et la
  **remplace** par un conseiller déterministe.
- **Branche/commits** : `chantier/conseiller-gratuit` — **aucune migration**.
  Revert du lot D `be7fdef` ; conseiller `e98f2c7` (règles) + `dd01c3a`
  (panneau) ; correctif perf `page.tsx` + retrait du wrapper sans appelant
  (`66cdd31`) ; docs `67169c8`.
- **Faits et fichiers** : retrait complet de l'assistant IA payant
  (`ia-provider`, `ia-assistant`, `ANTHROPIC_API_KEY`, `iaSuggestion`, 3áµ‰ source
  `blueprint`), prouvé sans résidu (`git grep` = 0 hors docs). Conseiller
  `src/lib/conseiller-commercant.ts` — fonction **pure** `construireConseils`,
  **zéro appel externe, zéro clé, zéro coût** : de simples règles sur les
  compteurs déjà chargés du Centre d'animation + le catalogue. Ton **sobre,
  informatif, non commercial**. Trois catégories (opérationnel / module /
  découverte), bornées à 6, hrefs filtrés par `lienSelonRole`. Panneau sur
  `/dashboard`. La revue sécurité a fait corriger une RPC en double (le
  conseiller réutilise désormais les compteurs déjà chargés, pas de seconde
  requête) et retirer le wrapper devenu sans appelant.
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check 120 (aucun SQL) ; sql:check ok ; Vitest **220 fichiers /
  3567 tests** ; build vert. Revue sécurité dédiée : **GO, 0 critique/élevé/
  moyen** (retrait sans résidu, lecture seule sur données de session, aucun
  secret, texte échappé, hrefs filtrés par rôle).
- **Risque/blocage** : aucun. Le conseiller n'est **pas une IA** — il applique
  des règles, il ne « comprend » rien ; extensible sans coût. Plus aucune
  dépendance payante dans le produit.
- **Prochaine action** : PR puis fusion. Après ce correctif, plus rien du §9
  n'est en suspens et aucune facturation IA ne subsiste.

### 2026-08-06 — Lot D (§9.5) : IA MVP, l'assistant de création dormant — **RETIRÉ** (voir entrée du dessus)

> Cette entrée décrit un lot **annulé** : l'assistant de création qu'elle
> documente appelait l'API payante d'Anthropic ; le propriétaire l'a fait
> retirer le même jour, remplacé par le conseiller gratuit ci-dessus. Conservée
> pour la traçabilité de la décision.

### 2026-08-06 — Lot C (§9.4) : Passeport post-jeu + QR de commande unique — **terminé**

- **Lot et objectif** : le point 4 de l'ordre d'exécution impératif (§9) et le
  §7 du cahier. Deux moitiés : une invitation au Passeport après un jeu, et un
  QR de commande unique pour la livraison/e-commerce.
- **Branche/commits** : `chantier/passeport-post-jeu` — migrations
  `20260915120000` (`loyalty_order_codes` + `record_loyalty_stamp` 5-aire) et
  `20260916120000` (hygiène : retrait du droit `delete`, purge du `label`).
  Commits `0f8d41b` → `c74b85c`.
- **Faits et fichiers** : **C1** — action publique `invitationPasseport`
  (anti-oracle : org inconnue ≡ sans programme ≡ module fermé → même `null` ;
  sortie bornée à `{programId, programName}`), composant `ProposerPasseport`
  sur 8 écrans de fin (gagné ET perdu — le cahier ne distingue pas) + les
  13 jeux de révélation, strictement navigationnel (un lien ne tamponne
  jamais, vrai par construction), garde un-exemplaire-par-page. **C2** —
  `loyalty_order_codes` (jeton copié de `hunt_steps`), `record_loyalty_stamp`
  gagne `p_order_token` : usage unique **atomique** (`update … where
  consumed_at is null returning`), le jeton contourne le cooldown (l'anti-abus
  est l'usage unique), état `order_invalid` ; page `/commande/[token]`
  mobile-first, bloc marchand avec export PNG par lot. Trouvailles : dix tables
  d'émission (le calendrier en porte deux) ; une FK composite en cascade aurait
  fait de la purge RGPD une machine à ressusciter les jetons dépensés (FK
  simple retenue) ; l'oracle Turnstile trouvé par son propre test anti-oracle.
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  sql:check ok ; migrations:check 120 / tête `20260916120000` ; Vitest
  **218 fichiers / 3554 tests** ; build vert ; pgTAP **55 fichiers /
  3143 assertions** PASS base vide ET semée ; security:audit-db 540 ; preuve
  mesurée de l'embed PostgREST sur base réelle (HTTP 200). Revue sécurité
  dédiée : **GO, 0 critique/élevé, 2 MOYEN + 3 FAIBLE — les cinq fermés avant
  fusion** (Set-Cookie qui trahissait le jeton → pose différée ; page sans
  compteur de pression → seau IP fail-open ; commentaire Turnstile faux →
  corrigé ; résurrection de jeton par delete/insert → droit `delete` retiré ;
  `label` non purgé → purge étendue).
- **Risque/blocage** : le 404/200 de la page `/commande` reste ouvert (assumé,
  identique à `/hunt`) ; ni péremption ni révocation des jetons en MVP ; le
  jeton voyage dans l'URL (comme `/hunt`). Tous consignés dans bugs.md.
- **Prochaine action** : PR puis fusion (ordre utilisateur du jour), puis
  lot §9.5 (IA MVP — assistant de création dormant sans clé).

### 2026-08-06 — Lot B (§9.3) : Dashboard guidé, Carte de l'Aventure, Relance, Tableau d'équipe, Centre d'animation — **terminé**

- **Lot et objectif** : le point 3 de l'ordre d'exécution impératif (§9) et les
  cinq décisions du §5. Quatre starters Codex (composants purs, non commités,
  worktrees du 2026-08-03) intégrés après correction (lint, accents,
  étiquettes honnêtes) ; le cinquième (carte de partage) était dépassé par
  `PublicShare` (V1.37) et a été écarté.
- **Branche/commits** : `chantier/dashboard-guide` — migration
  `20260914120000` (RPC `org_animation_center_counts`), commits `40fcc16` →
  `f9a8f28` (14 commits).
- **Faits et fichiers** : Centre d'animation + Tableau d'équipe sur
  `/dashboard` (RPC unique au lieu de 18 allers-retours ; compteurs étiquetés
  honnêtement : « QR jamais scannés », « Stocks faibles (roue) » ; tâches
  d'équipe dérivées, jamais inventées ; liens filtrés par `lienSelonRole`).
  Carte de l'Aventure sur 8 pages de détail (5 phases du cahier ; état
  « prête » ajouté — publiée mais pas jouable — sans lui la Carte aurait
  affiché « ouverte aux joueurs » sur une page inatteignable ; parrainage
  exclu, sans statut propre). « Relancer une formule » sur 6 modules
  (sérialiseur instance→blueprint, structure et réglages seulement, jamais de
  données joueur ; campagnes → Dupliquer existant ; jackpot non portable).
  Info-bulles sur les 8 formulaires de création. Spec E2E
  `dashboard-home.spec.ts`. Correctif d'outillage : `run-e2e-local.sh`
  appelait la CLI supabase en binaire global inexistant.
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  sql:check ok ; migrations:check 118/synchronisée ; Vitest **212 fichiers /
  3460 tests** verts (arbre final) ; build vert ; pgTAP **53 fichiers /
  3049 assertions** PASS sur base vide ET semée ; security:audit-db 535.
  Revue sécurité dédiée : **GO, 0 critique/élevé, 2 MOYEN fermés avant
  fusion** (refus de relance invisibles → `RelanceErreur role="alert"` ;
  discriminant de nom venu du client → dérivé serveur, seau 10 s). E2E ciblé
  local : **non exécuté** (bloqué par le défaut d'outillage ci-dessus,
  corrigé depuis) — relancé, et la CI de la PR joue la suite complète.
- **Risque/blocage** : plafond de relance 1 blueprint/10 s/source (un vrai
  rate-limit dashboard serait un chantier à part) ; jetons d'étape de chasse
  lisibles par le rôle caisse (préexistant, consigné OUVERT dans bugs.md).
- **Prochaine action** : PR puis fusion (ordre utilisateur du jour), puis
  lot §9.4 (Passeport post-jeu + QR de commande unique).

### 2026-08-06 — Lot A : la classe « champ non rendu » fermée au schéma — **terminé**

- **Lot et objectif** : fermer la classe « `FormData.get` rend `null` pour un
  champ non rendu » — les deux modes de panne, pas seulement le bruyant — et la
  verrouiller mécaniquement. Préalable aux lots §9.3/§9.4/§9.5 qui ajoutent des
  formulaires.
- **Branche/commits** : `chantier/formulaires-null-classe`, commits `db4e54e`,
  `e255297`, `f5fbe55`, `61281c9`, `f04e9bf`, docs `323e7c4`.
- **Faits et fichiers** : mesure réelle de la classe : 26 violations (3
  bruyantes, 23 silencieuses — `z.coerce.number()` convertit `null` en 0 ; ne
  frappait que les bornes basses à 0, `min(1)` refusait `null` par accident).
  Les plus coûteuses : trois cooldowns anti-rejeu (chasse, fidélité, jackpot)
  désarmables par un champ non rendu, et le poids d'un lot mis à 0 (jamais
  tiré). Livré : `src/lib/validations/champ-formulaire.ts` (7 primitives),
  62 déclarations converties sur 12 modules, 98 `??` d'appelant supprimés (5
  survivent, commentés), garde comportementale
  `champ-formulaire-coverage.test.ts` (2 invariants sur 300+ champs de 24
  modules ; invariant « un requis refuse null » sans aucune exclusion ;
  37 exclusions JSON-only justifiées), 45 tests, contrôles négatifs joués et
  restaurés. Docs : roadmap V1.41, ADR-084, bugs.md requalifié (l'entrée
  « CLOS » du 2026-08-05 comptait les rejets, pas les conversions silencieuses).
- **Validations exécutées** : typecheck 0 ; lint 0 ; casts:check 0 ;
  migrations:check ok (aucune migration au lot) ; sql:check ok ; Vitest
  **197 fichiers / 3303 tests** verts (+45) ; build vert. pgTAP **non exécuté**
  (aucun SQL touché) ; E2E locale **non exécutée** (déléguée à la CI).
- **Risque/blocage** : résiduel assumé et documenté — un champ rendu mais vidé
  (`""`) vaut toujours 0 par coercition sur les entiers requis (comportement
  d'origine, hors classe).
- **Prochaine action** : PR puis fusion — **demandées explicitement par
  l'utilisateur ce jour** (« fusionne tout ce que tu as à fusionner ») — puis
  lot §9.3 (Dashboard guidé, Carte de l'Aventure, Relancer une formule).

_Aucune entrée créée par Codex : Claude renseigne ce journal à sa prochaine
avancée significative._

## Dernière demande utilisateur

Codex pilote le développement de LastChance. Les audits doivent être précis et
transverses ; les propositions doivent améliorer concrètement l'expérience des
commerçants et des joueurs, la performance ou la sécurité. Chaque demande,
constat, proposition et décision Codex doit être consigné ici.

## État vérifié par Codex — 2026-08-04 (à lire avant un nouveau lot)

**Constat de dépôt, en lecture seule :** le clone consulté est sur `main`, sans
modification locale, à `0b41219` (« P0 lot 2 »). Aucun chantier en cours n'est
visible dans l'arbre Git. Ceci ne vaut pas observation d'une session Claude :
Codex ne les lit pas. Les preuves de tests ci-dessous sont celles consignées
dans les commits intégrés ; elles restent à requalifier localement avant une
nouvelle livraison ou une mutation distante.

| Sujet | État réel | Ce que cela apporte | Limite restante |
| --- | --- | --- | --- |
| Catalogue et site public | **Terminé dans `e93963f` / PR #98.** Les quatre offres et les huit add-ons dérivent du catalogue racine ; le site ne recopie plus prix, droits ni limites. | Le prospect lit la même offre que le dashboard. | Catalogue descriptif seulement : aucun produit, Price ID, checkout ou droit Stripe n'a été créé. Le site n'a pas de runner de tests propre ; ses typecheck/lint/build doivent être exécutés séparément. |
| P0 lot 1 : publication payante | **Terminé dans `623e1aa` / PR #99.** Les transitions de publication passent par des RPC SQL gardées : rôle, droit du module, droit effectif et audit. | Un éditeur ne peut plus activer un module par appel PostgREST direct lorsque le droit est absent ou inactif. | Le retour à un brouillon reste volontairement permis ; ne pas le confondre avec une publication. |
| P0 lot 2 : droits datés et add-ons autonomes | **Terminé dans `0b41219` / PR #102.** Un octroi porte ses fenêtres ; SQL et TypeScript restent en parité ; le back-office peut accorder, lire et révoquer les octrois non Stripe. | Une Chasse, un Quiz ou une Soirée achetée seule peut ouvrir son seul module, puis cesser de façon sûre à l'expiration. | Aucun flux de paiement/webhook ne crée encore ces octrois. Les montants et durées du catalogue ne sont pas injectés en base. |

### Prochain lot précis proposé à Claude — P0.3 : rendre le dashboard cohérent avec le droit effectif

**Hypothèse à vérifier d'abord :** aucun `canExplore` ni `canEditDraft` n'est
présent dans `src/` ou `site/`. Le seul `canPublish` trouvé concerne la
publication d'une *version de blueprint* dans
`experience-blueprint-state.ts`, pas le droit effectif d'une expérience. La
règle « un brouillon non payé par organisation et par module » n'a pas été
retrouvée. Les lots P0.1/P0.2 ferment la porte de publication en base ; ils ne
suffisent donc pas à démontrer toute l'expérience de découverte et de brouillon
du dashboard.

- **Bénéfice commerçant :** il peut préparer une animation sans payer ni se
  tromper sur ce qui est publiable ; un éditeur sait quand demander au
  propriétaire au lieu de tomber sur un échec technique.
- **Priorité :** P0, avant le QR universel. **Coût :** moyen (lecture droits,
  règles de brouillon, surfaces dashboard et tests). **Risque :** élevé si la
  séparation est seulement visuelle : les actions, routes et RPC doivent rester
  cohérentes avec les gardes SQL déjà livrées.
- **Périmètre autorisable après validation utilisateur :** cartographier les
  neuf modules et leurs actions, définir un type/contrat unique pour les trois
  capacités, appliquer la limite de brouillon, rendre le message propriétaire/
  éditeur, puis tester les parcours sans droit, avec droit et à expiration.
  Aucun checkout, produit Stripe, Price ID, appel réel Stripe, migration
  distante, commit, push ou déploiement ne fait partie de ce lot sans accord
  distinct.
- **Preuves minimales :** migrations et pgTAP si le schéma évolue ; tests
  TypeScript/actions pour les trois capacités ; revue de toutes les routes/RPC
  de publication ; typecheck, lint, build racine et `npm --prefix site run
  typecheck`, `lint`, `build` si le site est touché. Préférer WSL/Docker pour
  l'équivalent local avant CI.

**Décision attendue :** l'utilisateur confirme P0.3 ou choisit un autre lot.
Le QR universel sur une expérience pilote ne démarre qu'après ce verdict P0.

## A LIRE EN PREMIER — decisions produit utilisateur (2026-08-04)

**Ce bloc est la source de verite produit pour Claude.** Il remplace les noms
historiques `Core / Engagement / Live & Events / Full Platform` encore presents
plus bas. Ne creer aucun produit Stripe, Price ID, checkout, abonnement ou
migration distante a partir des montants ci-dessous : ce sont les tarifs et
durees de reference produit, a revalider commercialement avant mise en vente.

### 1. Offres mensuelles — noms confirmes

| Offre | Promesse affichee |
| --- | --- |
| **Coup d'envoi** | lancer une animation |
| **Le Club** | fideliser |
| **Le Grand Jeu** | animer regulierement |
| **La Totale** | reunir toutes les briques |

« La Totale » remplace definitivement « La Grande Aventure ». Les objectifs
restent des sous-titres : ils ne doivent pas etre deduits du seul nom de l'offre.

### 2. Add-ons — tous independants d'un abonnement

**Decision confirmee :** tout add-on peut etre achete seul. Il embarque les
briques communes strictement necessaires (organisation, QR/publication, lots,
caisse et gardes), sans deverrouiller les autres modules. Un client peut cumuler
plusieurs droits actifs, chacun borne a son module et, pour un pass, a sa
ressource propre.

| Add-on | Prix/duree de reference | Regle confirmee |
| --- | --- | --- |
| Passeport des habitues | 19 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Bouche-a-oreille / Parrainage | 12 EUR/mois | recurrent, sans engagement, actif jusqu'a la fin de la periode payee |
| Chasse au tresor | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Calendrier a surprises | 29 EUR / une campagne jusqu'a 31 jours | achat unique, activable dans les 90 jours |
| Quiz express | 15 EUR / 7 jours | achat unique, activable dans les 90 jours |
| Cagnotte collective | 29 EUR / 30 jours | achat unique, activable dans les 90 jours |
| Saison de pronostics | 39 EUR / une competition | voir regle longue ci-dessous |
| Soiree en jeu | 10 joueurs : 9 EUR ; 30 : 19 EUR ; 50 : 29 EUR | voir regle de jauge ci-dessous |

Les mecaniques continues sont mensuelles ; les mecaniques de campagne ou
d'evenement sont des achats uniques a duree fixe. Aucun essai add-on : l'essai,
si conserve, reste celui de l'offre principale. Les credits SMS restent un achat
distinct sans expiration seulement quand Brevo/STOP/AF2M sont prets.

#### Regles particulieres validees

- **Saison de pronostics :** une seule competition identifiee et un seul
  `contest_id`, de l'activation jusqu'a sept jours apres la finale ou la cloture
  manuelle, avec plafond dur de douze mois. Ligue 1 et Ligue des champions ne
  doivent jamais etre coupees artificiellement a 90 jours. Les donnees restent
  consultables/exportables 30 jours apres ; le droit de jouer ne continue pas.
- **Soiree en jeu :** pass autonome incluant temporairement Coup d'envoi,
  Evenements et Quiz. Jauge choisie avant paiement, enregistree et jamais
  ajustee ou facturee retroactivement. Sept jours de preparation puis 24 heures
  de jeu, activation dans les 30 jours. Ne pas vendre de jauge superieure avant
  un benchmark de capacite live concluant.
- A l'expiration d'un pass, la ressource est mise en pause de facon sure ; les
  donnees et exports restent lisibles. Ne jamais prolonger silencieusement.

### 3. Dashboard ouvert, publication strictement payante

- Tous les neuf modules sont visibles avec leur cas d'usage, modele, tarif et
  etat d'acces. Un client peut preparer **un brouillon non paye par organisation
  et par module**, y compris depuis un blueprint.
- Le dashboard donne acces a tout pour decouvrir ; seule la **publication** est
  verrouillee au droit effectivement paye par l'offre ou l'add-on exact.
- Aucun QR, URL publique, ecran de salle, participation, caisse, lot, tirage,
  gain, remise ou campagne active ne peut sortir d'un brouillon non couvert.
- Un proprietaire peut acheter ; un editeur voit le catalogue mais recoit
  « Demander au proprietaire », jamais un controle Stripe.
- Apres webhook de paiement, le brouillon redevient **pret a publier**, sans
  ressaisie ; publier reste un clic explicite, jamais une exposition automatique.
- Separer et revalider partout `canExplore`, `canEditDraft` et `canPublish`.
  `comp_access` n'est pas un entitlement a tous les jeux ni un droit live.

### 4. QR universel — decision confirmee

Chaque jeu, quiz et experience joueur publiable doit proposer **un QR et un
lien**. Le lien reste compatible, mais n'est jamais l'unique entree. QR/lien ne
confere aucun droit, ne contient aucun secret et ne rend pas un brouillon,
module suspendu ou impaye jouable. Priorite : droits effectifs P0, puis QR.

### 5. Dashboard simple et ludique — decisions confirmees

- Creation guidee pas a pas pour chaque experience, avec informations-bulles et
  explications simples.
- **Carte de l'Aventure** : idee → brouillon → repetition → en cours → cloturee,
  avec fanions et tampons ; elle rend la progression lisible sans remplacer les
  vrais boutons.
- **Relancer une formule** : repartir d'une animation reussie vers un brouillon
  propre pour Noel, soldes, match ou anniversaire.
- **Tableau d'equipe** : rendre visuellement les actions attribuees au
  proprietaire, a l'editeur ou a la caisse.
- **Centre d'animation** : une vue des brouillons, QR a tester, jeux en cours,
  stocks faibles, gains a remettre et taches d'equipe.

### 6. IA — perimetre confirme

Assistant de creation uniquement : aide au choix et trois idees editables.
Sortie structuree cote serveur, sans PII joueur inutile, sans publication,
paiement ou action automatique. L'IA propose ; le commercant choisit et valide.

### 7. Passeport — continuite joueur confirmee

- Apres un jeu, proposer de creer ou continuer un Passeport, sans forcer la
  creation d'un compte.
- Un lien partage cree/continue le Passeport mais **n'ajoute jamais de tampon**.
- Un QR officiel marchand eligible ou un achat/caisse valide ajoute un tampon,
  de facon idempotente. Un QR transferable prouve le support officiel, pas la
  presence physique.
- Livraison/e-commerce : une carte/QR/code unique par commande cree/continue le
  Passeport apres confirmation et ajoute un tampon une seule fois. Code generique
  = zero tampon. L'integration API Uber Eats/Deliveroo reste future et non
  approuvee ; ne pas la commencer.

### 8. Pistes a ne pas demarrer sans nouvelle validation

Le jeu de deduction sociale inspire du loup-garou (« La Nuit des Masques »),
integrations caisse, API Uber/Deliveroo, Passeport des decouvertes, Bingo de
quartier, Kit de lancement, prochaine meilleure action, Player Hub complet,
Calendrier d'occasions et multi-etablissement restent des pistes a arbitrer,
pas des lots autorises.

### 9. Ordre d'execution imperatif

1. P0 : droit effectif unique, gardes SQL/actions/routes/RPC et transitions
   publiques impossibles sans droit.
2. QR universel sur une experience pilote.
3. Dashboard guide, Carte de l'Aventure et Relancer une formule.
4. Passeport post-jeu et QR de commande unique.
5. IA MVP, puis les pistes non validees seulement sur nouvelle demande.

## Registre Codex

| Date | Type | Décision / proposition | État |
| --- | --- | --- | --- |
| 2026-08-17 | Décision produit utilisateur — nettoyage du portefeuille | **À écarter des pistes actives :** Le Geste, Le Défi Produit et Le Choix des habitués. Motif : le Quiz couvre déjà l'intention ludique de 3/4 et ces propositions ne répondent pas assez largement à l'ambition recherchée. **À conserver :** Ticket d'Or, Minute Chance, Coffre des habitués et Ticket à offrir. Nouvelle demande : ouvrir un éventail d'améliorations simples et vendables, au-delà des tickets, QR, quiz et soirées ; inclure nouvelles interactions, nouveaux jeux et services que le commerçant peut proposer avec LastChance. | Audit produit large en cours ; aucune de ces pistes écartées ne doit devenir un lot. |
| 2026-08-17 | Audit Codex produit, lecture seule — portefeuille élargi à arbitrer | **Constat :** le produit couvre déjà roue/grattage, révélations, défis, Quiz, chasse, fidélité, jackpot, calendrier, parrainage, pronostics et live ; une variante de quiz/coffre/carte n'est donc pas un manque prouvé. **Portefeuille proposé :** (1) services métier : Boussole de choix, Rendez-vous Express, Drop anti-gaspi, Liste Prioritaire, File sereine, Invitations privées ; (2) interactions de valeur : Choix du cadeau, Thermomètre/Radar Client, Favoris du lieu, Objectif Stock ; (3) jeu réellement distinct : Défi Duo coopératif. **Axes de valeur :** vendre mieux, remplir des créneaux, écouler un stock fini, capter une demande perdue, personnaliser une offre et retenir un client. Les briques existantes (portefeuille, caisse, stock atomique, QR, créneaux, SMS/segments) doivent être réutilisées ; aucune nouvelle plateforme de jeu isolée. | **Sélection utilisateur :** Boussole de choix, Drop anti-gaspi, Rendez-vous Express, Choix du cadeau, File sereine et Invitation privée sont retenus pour cadrage, sans développement autorisé. Le prochain arbitrage porte sur un pilier unifié de réservation (créneau, attente, liste prioritaire, invitation, réservation de stock) ; Carte cadeau reste hors MVP tant que comptabilité, fraude et cadre légal ne sont pas cadrés. |
| 2026-08-17 | Cadrage Codex produit, lecture seule — pilier « Réserver » | **Décision de cadrage :** une primitive de réservation unique, non huit calendriers. Promesse : « Prendre un créneau, rejoindre la file, récupérer une place. » **MVP :** Rendez-vous Express (activité, créneaux à capacité finie, réservation QR, annulation, check-in staff). **Déclinaisons dans le même socle :** File sereine (rang réel, pas d'ETA fictif), Liste prioritaire puis Place libérée (offre à une personne, expiration), Accès en petit comité/Invitation privée, Dernière minute, puis Réserve ton offre/Drop anti-gaspi (stock bloqué temporairement et retrait en caisse). | Aucun développement autorisé. Ordre recommandé : créneau+capacité+check-in → liste/place libérée → file → réservation de stock/dernière minute. Invariants : fuseau de l'organisation, capacité atomique, annulation idempotente, jeton limité et non transférable, isolation organisation, consentement distinct pour rappels et purge des données ; pas de sanction automatique du no-show. |
| 2026-08-17 | Décision produit utilisateur — **LastChance Réserver** | **Retenu :** faire de « LastChance Réserver » un produit/axe explicite, pas un simple calendrier. L'attente doit devenir une expérience : après avoir rejoint une file ou réservé un créneau, le client peut lancer des jeux ou Quiz déjà disponibles. **Règle de produit :** ces animations occupent et informent, mais ne doivent jamais modifier le rang, l'accès, la priorité, l'heure estimée ou le droit à une place ; tout gain reste borné et décidé côté serveur. | Cadrage d'expériences d'attente en cours, sans développement autorisé. À livrer comme une couche facultative du socle Réserver, non comme une seconde file ou un nouveau moteur de jeu. |
| 2026-08-17 | Cadrage Codex produit, lecture seule — attente active de Réserver | **MVP recommandé :** écran d'attente sobre (« vous êtes 4e », « on vous prévient ») puis choix facultatif : Quiz éclair d'attente, Pause Chance (une tentative plafonnée par attente) ou voir l'activité. **Suites :** découverte avant passage, Défi Duo volontaire, souvenir post-check-in. Le jeu est interrompu proprement à l'appel ; les gains potentiels sont remis après check-in ou hors flux de file. | À spécifier avec le noyau Réserver seulement après validation de l'ordre de construction. Ne pas annoncer d'ETA tant que la donnée n'est pas fiable ; une session serveur doit séparer strictement file et animation. |
| 2026-08-17 | Décision produit utilisateur — développement **LastChance Réserver** | L'utilisateur autorise l'ajout au périmètre de développement de LastChance Réserver, de ses déclinaisons (Rendez-vous Express, File sereine, Liste prioritaire/Place libérée, Invitation privée, Dernière minute, Réserve ton offre/Drop anti-gaspi) et du Mode Attente active (Quiz éclair, Pause Chance, choix d'animation, puis découverte/Duo/souvenir post-check-in). Le cahier de développement et ses invariants sont dans `docs/lastchance-reserver.md`. Boussole de choix et Choix du cadeau restent également des extensions retenues, hors noyau Réserver. | **Autorisé au cadrage et au développement séquencé**, pas de commit/push/déploiement/migration distante implicite. Commencer par RES-1, obtenir les validations appropriées, puis RES-2 à RES-5 ; ne pas mélanger stock réservé et gains de jeu. |
| 2026-08-17 | Décision produit utilisateur — **LastChance Vitrine** | La Vitrine présente le commerce autant que ses plats, produits ou prestations : histoire/ambiance/savoir-faire du lieu, sélections éditoriales et fiches de découverte. Elle mène ensuite vers la Boussole, une réservation, une file, une invitation ou un retrait limité. **Ajout retenu :** CRM léger et agenda de réservation réservés aux organisations ayant souscrit l'offre Vitrine. Le CRM couvre uniquement fiche client minimale, consentements, réservations/arrivées/interactions et segments factuels ; pas de CRM lourd. | Autorisé au cadrage/développement, sans caisse, commande, livraison, synchronisation POS ou stock temps réel au MVP. Le droit Vitrine doit être vérifié côté serveur sur chaque page/action/RPC ; aucun produit, prix ou checkout Stripe n'est créé sans décision explicite ultérieure. |
| 2026-08-18 | Décision produit utilisateur — Vitrine comme mini-site de marque | **Retenu pour le développement :** Vitrine à trois couches : (1) lieu/identité personnalisable dans un cadre guidé ; (2) carte ou catalogue illustré ; (3) expérience facultative. QR entrée → accueil, QR table → carte directe, QR produit → fiche. Jeux facultatifs de Vitrine : **Quiz, Duo Miroir et Portrait de la Bande**, toujours à lancement volontaire. Liens Instagram/TikTok configurables et contenus mis en avant manuellement ; lien d'avis Google discret en bas **et en rappel facultatif sur l'écran final d'un jeu**. **Ajout :** traduction anglaise automatique proposée au visiteur en bas de chaque page publique Vitrine, sans aucune action du commerçant. | Ordre validé : VIT-1 identité/carte → VIT-2 QR contextuels → VIT-3 Réserver/Expérience/jeux facultatifs → VIT-4 liens sociaux/avis → **VIT-5 anglais automatique**. Traduction côté serveur, à la demande et mise en cache par version ; français toujours accessible comme référence, repli français si indisponible. L'avis reste neutre, sans filtre, incitation, gain ou remise. Exclusions : site-builder libre, e-commerce, commande cuisine, paiement, POS, flux sociaux/API et tout avis récompensé ou filtré. |
| 2026-08-18 | Décision produit utilisateur — inspiration menus QR modernes | L'utilisateur veut que Vitrine propose le socle attendu d'un menu QR moderne : éditeur rapide de carte/plats/boissons, images, prix, informations alimentaires, disponibilité/rupture instantanée, ordre des catégories, QR stables contextuels imprimables, import assisté photo/PDF/tableur avec revue obligatoire, traduction automatique et analytics de consultation. **Différenciation LastChance :** après la carte, conduire vers Réserver, Expériences Signature et jeux facultatifs. | Retenu pour le développement Vitrine : VIT-1 devient éditeur de carte restaurant ; VIT-2 import assisté + QR ; VIT-4 analytics. Hors périmètre assumé : commande à table, appel serveur, note, paiement, cuisine/POS et stock temps réel. L'inspiration est fonctionnelle, sans copie d'interface ou promesse de Menoo. |
| 2026-08-18 | Direction produit utilisateur — référence Mennoo HORECA | L'utilisateur souhaite s'inspirer fortement de Mennoo pour la qualité attendue de Vitrine HORECA : catalogue QR multilingue, mobile et visuel ; plusieurs cartes par lieu ; modèles par métier ; QR en table/comptoir/vitrine/réception ; import ou conversion de carte sans effort ; mises à jour simples ; support de présentation imprimable. LastChance garde sa différence : carte → Boussole/Réserver/Expérience Signature/jeux, sans devenir POS. | Retenu : **VIT-1 devient catalogue HORECA, modèles métier et langues automatiques dès le socle** ; VIT-2 devient import assisté + service de création + QR imprimables ; VIT-5 étendra les langues et la qualité de traduction. **À arbitrer plus tard :** « Raconte-moi ce plat », présentation IA strictement ancrée aux données de la carte. |
| 2026-08-18 | **Directive utilisateur à Claude — implémentation Vitrine HORECA** | S'inspirer **fortement** de Mennoo (`https://www.mennoo.gr/fr/`) comme barre de qualité produit : QR → catalogue mobile visuel, multilingue, rapide, modèles HORECA, conversion de carte sans friction, mise à jour simple et supports QR soignés. Ne pas copier son interface, son contenu ou sa marque. Brancher chaque partie nativement dans l'univers LastChance : organisation et droit serveur `vitrine`, identité/branding, QR contextuels, Vitrine/carte, traduction automatique, CRM léger, agenda Réserver, Boussole, Moment Signature, Atelier Duo, Quiz/Duo Miroir/Portrait de la Bande, analytics, liens sociaux et avis Google neutre. | **Prérequis avant code :** analyser Mennoo sur ses ressources publiques : parcours et bundles client lisibles, comportement de traduction, écrans/tarifs/limites/renouvellement d'abonnement, onboarding, import, QR, menus et déclassement ; puis comparer aux entitlements, traduction et abonnements LastChance. Consigner faits, URLs et inférences séparément dans le handoff. Jamais de contournement d'authentification, d'accès privé, de secret, de scraping agressif ou de copie de code. Ensuite lire `docs/lastchance-reserver.md` et conserver un seul parcours cohérent, **carte → Boussole/Réserver/Expérience/jeu facultatif**, pas un produit ou dashboard isolé. Réutiliser les primitives mutualisées ; ne pas créer POS, commande à table, paiement, cuisine, stock caisse, copie d'UI ou intégration sociale API. Soumettre chaque lot à la validation Codex habituelle. |
| 2026-08-17 | Portefeuille Codex produit, lecture seule — expérience client au-delà du jeu | **Fil rouge :** découvrir → choisir → réserver → préparer → arriver → revenir. Pistes à arbitrer : **LastChance Accueil** (besoin du jour fermé, préparation de visite, arrivée autonome), Agenda vivant/Carte du moment, Groupe confirmé, Demande sur mesure, Conseil à emporter, Mes envies/Alerte désirée, Reprendre le même, Retrait programmé, Brief d'équipe du jour et point d'entrée Accueil QR. **Recommandation :** après le noyau Réserver, prioriser Accueil (Mon besoin du jour + Accueil prêt + arrivée staff), Groupe confirmé et Conseil à emporter ; valeur directe sans devenir CRM, POS ou jeu. | Aucune nouvelle piste n'est autorisée au développement tant que l'utilisateur n'a pas choisi. Gardes : motifs fermés et temporaires, pas de données sensibles ni texte libre par défaut, consentement séparé pour toute alerte, aucune synchronisation de stock/commande ou promesse de vente non mesurée. |
| 2026-08-17 | Retour utilisateur — portefeuille « expérience client » | L'utilisateur n'est pas convaincu par le portefeuille Accueil/Agenda/Conseil, qui ne répond pas à la valeur recherchée. **À ne pas pousser ni ajouter au développement :** LastChance Accueil, Agenda vivant, Accueil prêt, Arrivée autonome, Groupe confirmé, Demande sur mesure, Mes envies/Alerte désirée, Conseil à emporter, Reprendre le même, Brief d'équipe du jour et offres analogues de CRM léger. | Recherche à reprendre : viser une proposition plus ambitieuse, désirable et identitaire, qui permette au commerçant de faire vivre ou vendre une expérience — pas seulement d'organiser sa relation client. |
| 2026-08-17 | Direction produit utilisateur — nouvelle recherche | Le critère retenu est double : une proposition doit **faire venir** des clients et **rendre le commerce réellement différent** de ses concurrents. L'optimisation CRM, l'upsell et les outils d'organisation ne répondent pas à cette ambition. | Recherche de concepts d'expérience « destination » en cours ; aucun nouveau lot de développement tant que l'utilisateur n'a pas arbitré une proposition précise. |
| 2026-08-17 | Décision produit utilisateur — expériences « destination » | **Retenus pour le développement :** Moment Signature et Atelier Duo. Ils sont deux templates du même socle Expérience Signature (page, promesse, durée, capacité, préparation, check-in, liste d'attente éventuelle), pas deux moteurs. Moment Signature : 20–45 min et trois étapes de découverte ; Atelier Duo : hôte + accompagnant, capacité atomique par personne, aucune compétition ni gain. | Autorisé au développement après le noyau Réserver, sans paiement, billetterie, partage de revenus ou matériel d'animation au MVP. À vérifier avec pilotes : temps staff, capacité et régularité. Les autres pistes destination restent non retenues. |
| 2026-08-17 | Décision produit utilisateur — jeu de présence | **Retenu seul pour le développement : Duo Miroir.** Deux personnes présentes choisissent secrètement, parmi 3 à 6 produits/sélections Vitrine réels, ce qu'elles offriraient ou recommanderaient à l'autre ; révélation simultanée puis proposition maison. Sans gain, score, classement, achat ni profil durable. **Écartés pour l'instant :** Match des sens, Création minute, Défi des mains, Carte à deux mains, Première main et Scène du lieu. | Autorisé au développement après le socle Vitrine et une session duo sécurisée. Présence vérifiée par session courte sur place ou staff ; aucun impact sur rang, capacité ou priorité Réserver. |
| 2026-08-17 | Décision produit utilisateur — jeu social de groupe | **Retenu pour le développement : Le Portrait de la Bande.** Session privée de 2 à 12 : chacun répond à une question du type « qui est le plus… ? » en choisissant discrètement une personne du groupe ; dès que toutes les réponses sont verrouillées, révélation immédiate du pourcentage, du nombre de voix et des égalités, jamais de l'identité des votants. Packs de questions éditorialisés uniquement ; pas de questions sensibles ou humiliantes, de texte libre, de chat, de profil durable, de gain ni de classement global. | Autorisé au développement après une session de groupe sécurisée. États, critères d'acceptation, limites de capacité et garde-fous consignés dans `docs/lastchance-reserver.md`. Aucun impact sur rang, capacité, priorité Réserver, achat ou accès à une offre. |
| 2026-08-17 | Piste Codex produit, lecture seule — découverte en lieu | **Piste de jeu simple : « Le Défi Produit ».** Un QR posé près d'un produit, d'un menu ou d'une vitrine pose une question dont la réponse est réellement observable sur place ; une bonne réponse ouvre une chance à valeur bornée. Promesse : « Faites découvrir vos produits sans discours commercial. » Le Quiz Express, les QR, le tirage/récompense et la caisse existants en portent l'essentiel : le premier test est un blueprint vertical, pas un nouveau moteur. La question doit être factuelle, accessible sans achat obligatoire et ne pas créer de secret facilement partageable ; pour une valeur élevée, une preuve staff ou une rotation courte reste nécessaire. Valeur commerçant : attention réelle sur une offre ou un savoir-faire ; valeur joueur : découverte et surprise. Coût faible/moyen, risque faible/moyen. **Mesures :** réponses, gains retirés et produits/espaces explorés déclarés, sans inventer une conversion de vente. | À tester dans une cave, boutique spécialisée ou musée avant généralisation. |
| 2026-08-17 | Hypothèse Codex produit, lecture seule — récupération de service | **Piste distincte : « Le Geste ».** Un membre du staff peut, après une attente, une erreur ou une déception, remettre au client une compensation limitée, expirante et traçable à utiliser à la prochaine visite. Promesse : « Transformez un problème en retour. » Le produit s'appuie sur émission de récompense, portefeuille, caisse, rôle staff et audit existants, sans e-mail obligatoire ni avis conditionné. Garde nécessaire : catégories de motif non personnelles, plafond organisation/jour, stock ou budget fini, autorisation staff dédiée, et émission/annulation serveur idempotente. Valeur commerçant : réparer sans improviser ni perdre le client ; valeur joueur : un geste concret, pas une promesse. Coût moyen, risque moyen (économie/abus). **Mesures :** gestes remis, utilisés, puis retour dans la période définie ; ne jamais déduire ou afficher un avis public. | À comparer à Ticket d'Or : une boucle de récupération, non d'acquisition. |
| 2026-08-17 | Hypothèse Codex produit, lecture seule — décision client | **Piste distincte : « Le Choix des habitués ».** Le commerce soumet deux ou trois options fermées (prochaine recette, couleur, produit ou animation) ; les clients votent par QR, voient le résultat et le commerçant s'engage à publier l'issue. Promesse : « Faites choisir demain par vos clients. » Cela ne doit pas être un sondage décoratif : résultat horodaté, choix modifiables seulement avant les premiers votes, et une récompense éventuelle indépendante de l'option votée pour éviter l'achat de voix. Valeur commerçant : un signal local pour décider et un prétexte légitime de retour quand le choix devient réel ; valeur joueur : une influence visible. Coût moyen, risque moyen (abstention, confiance, modération des choix). **Mesures :** votes, issue effectivement publiée et retours lors du lancement de l'option gagnante. | À tester d'abord dans une verticale qui renouvelle réellement ses produits. |
| 2026-08-17 | Piste Codex produit, lecture seule — acquisition vérifiée | **Prolongement à étudier après Ticket d'Or : « Ticket à offrir ».** Un client peut transmettre une invitation unique à un proche ; ce proche obtient sa première chance ou son premier avantage lors d'une visite vérifiée, et le donneur ne reçoit son bonus qu'à cette condition. Promesse : « Faites découvrir votre adresse, vous gagnerez tous les deux à son premier passage. » C'est une présentation concrète du Parrainage existant, pas un QR de parrainage figé — une image publique ne doit jamais attribuer tous les scans au même parrain. Les invitations restent liées au joueur, expirantes, à usage unique et validées serveur. Valeur : acquisition par recommandation sans réclamer un avis ni installer une application. Coût moyen, risque moyen (fraude/cannibalisation) ; à limiter à une première visite vérifiée et un stock/budget fini. **Mesures :** invitations activées, premières visites vérifiées et retours des deux personnes à 30 jours. | À comparer à Ticket d'Or ; ne pas démarrer deux boucles d'acquisition avant un pilote. |
| 2026-08-17 | Décision produit utilisateur — axe « visite → retour » | **Les trois offres à conserver et approfondir sont :** (1) **Ticket d'Or** — priorité la plus haute ; (2) **Minute Chance** ; (3) **Coffre des habitués** (promesse commerciale du Passeport existant). Filtre permanent de découverte : ne retenir qu'une idée formulable en une phrase, déclenchée par une action physique vérifiée, apportant un bénéfice immédiat au joueur et un retour mesurable au commerçant ; pas un jeu isolé, un tableau de bord ou une intégration externe. Les prochaines propositions doivent d'abord chercher à renforcer cette boucle, sans recréer identité, QR, gain, portefeuille, caisse ou fidélité. | Actif — Ticket d'Or à spécifier en premier lorsque l'utilisateur autorisera un lot. |
| 2026-08-17 | Proposition Codex produit, lecture seule — activation d'heures creuses | **Piste légère : « La Minute Chance ».** Une fenêtre courte, annoncée par le commerce (« 16 h 30–17 h : une chance à saisir »), ouvre une expérience QR avec un budget/stock strictement borné. Promesse vendable : « Faites venir du monde quand votre commerce est calme. » Le socle campagne, créneau planifié, QR, limite de jeu, lots, expiration et caisse existe déjà ; le premier lot peut donc être un blueprint/preset et une présentation commerciale, sans nouveau moteur ni calendrier d'occasions. Valeur : l'offre a une raison claire d'exister pour le commerçant et une urgence honnête pour le joueur. Coût faible, risque faible/moyen : ne pas simuler une rareté ou un stock, ni laisser un QR statique contourner la fenêtre ; la décision serveur de campagne fait foi. **Mesures :** participations et retraits dans le créneau, puis part des joueurs revenant sur un autre créneau. | À tester comme pack de contenu, sans nouveau add-on ni promesse de revenu causal. |
| 2026-08-17 | Proposition Codex produit, lecture seule — boucle d'achat | **Piste simple : « Ticket d'Or ».** Après un achat ou une visite vérifiée par le commerçant, le client reçoit une chance unique de découvrir un avantage à utiliser lors de sa prochaine venue. Promesse vendable : « Un achat aujourd'hui, une bonne raison de revenir demain. » Le QR/ticket est à usage unique et la récompense reste stockée, expirante, retrouvable dans le portefeuille et remise en caisse : aucune intégration POS n'est requise au MVP, aucune image de QR statique ne prouve l'achat. La preuve de départ doit donc être le geste existant du staff ou un code de commande unique ; le ticket public seul ne vaut rien. Valeur : transforme une transaction terminée en retour mesurable, sans compte obligatoire. Coût moyen, risque moyen (économie/anti-abus) ; dépend du registre universel de récompenses et des gardes serveur existantes. **Mesures :** tickets activés, gains remis et retours à 30 jours ; jamais un panier ou un revenu supposé. | Décision utilisateur attendue : placer Ticket d'Or devant Retour gagné, ou les fusionner dans une seule boucle. |
| 2026-08-17 | Hypothèse Codex produit, lecture seule — coopération événementielle | **Piste : « La Jauge de salle ».** Les bonnes réponses de toute la salle remplissent une jauge commune et débloquent une finale (question bonus, révélation ou tirage final borné) ; elle rend utile la participation d'un joueur même quand son équipe ne peut plus gagner. Le socle Jackpot collectif et les événements live rendent l'intention crédible, mais leur pont n'est pas présumé existant : à spécifier comme une seule transaction serveur, avec seuil, éligibilité et stock bornés. Ne jamais promettre un lot à tous sans budget/stock fini ; le premier MVP débloque une finale, pas une remise automatique. Valeur : moins de perdants passifs, plus d'ambiance et une conclusion mémorable pour l'organisateur. Coût moyen/élevé, risque moyen (économie et équité) ; à tester au sein d'une Soirée Signature, jamais comme jeu séparé. **Mesure :** taux de réponse après élimination individuelle et taux de session menée jusqu'à la finale. | Décision utilisateur attendue : garder comme manche de second pilote, après les fondamentaux live. |
| 2026-08-17 | Hypothèse Codex produit, lecture seule — rétention événementielle | **Piste à confronter au pilote : « La Ligue du Comptoir ».** Quatre à six Soirées Signature récurrentes forment une saison ; le joueur retrouve son pseudo, cumule un score de soirée en soirée et vise une finale. C'est plus puissant qu'une soirée unique pour un lieu qui veut remplir un créneau hebdomadaire : le produit vend un rendez-vous, non un jeu. Le socle live, l'identité joueur et la méta-progression réduisent le coût, mais aucune table de classement transverse d'événements n'est présumée existante : c'est une hypothèse à spécifier et sécuriser avant code. **Règles nécessaires :** identité pseudonyme récupérable sans PII imposée, score et récompense finale calculés exclusivement côté serveur, fenêtre de saison/bornes de lots, récupération après changement d'appareil et mécanisme anti-Sybil proportionné à la valeur du lot. Coût élevé, risque moyen/élevé ; à placer après une Soirée Signature pilote réussie, pas avant. **Mesure décisive :** part des participants présents à au moins deux soirées, plutôt que scans ou inscriptions. | Décision utilisateur attendue : garder comme suite de rétention après pilote, non comme MVP. |
| 2026-08-17 | Proposition Codex produit, lecture seule — format événementiel | **Option potentiellement plus désirable que le Blind Test seul : « La Soirée Signature ».** Ce n'est pas un jeu supplémentaire mais un format complet de 30/45/60 min prêt à animer : accueil QR et constitution de la salle, manches guidées, finale collective et remise. Le commerçant achète une soirée qu'il peut annoncer et exécuter, plutôt que des outils à combiner ; le joueur vit un spectacle social à rythme clair. **Manches candidates ajoutées sur demande propriétaire :** (1) Blind Test animé sans streaming LastChance ; (2) **Bataille des tables** — équipes choisies à l'entrée, score collectif affiché, réponses individuelles conservées pour éviter qu'un seul téléphone joue pour la table ; (3) **Bingo de salle** — cartons individuels et tirage serveur au sein d'une seule session live, distinct du Bingo de quartier explicitement hors périmètre ; (4) **Roue géante finale** — écran spectaculaire, mais sélection/éligibilité/tirage et stock exclusivement serveur, jamais décidés par l'écran. Ces manches restent des extensions du squelette live, pas des droits/add-ons indépendants. La valeur est forte pour bars, cavistes, restaurants, clubs et team-buildings, sans réinventer identité, score, caisse ou récompenses. **Coût moyen/élevé, risque moyen/élevé :** il faut composer plusieurs sessions/contenus sans promesse de synchronisation ou de capacité non qualifiée, et terminer par une vraie répétition animateur. Dépendances : MVP Blind Test sans média hébergé, Realtime/capacité qualifiés, et droit de diffusion vérifié au niveau du lieu. **Succès pilote :** temps de préparation, sessions réellement terminées, taux de participation par manche, réachat/réservation d'une nouvelle soirée ; jamais seulement le nombre de scans. | Décision utilisateur attendue : prioriser la Soirée Signature avant, avec ou après le Blind Test. |
| 2026-08-17 | Exploration Codex ciblée, lecture seule — Blind Test | **Constat vérifié :** le mode Événement live contient déjà la machine d'états, les trois surfaces synchronisées (écran, téléphone, télécommande), le chrono, la non-fuite de réponse, le score serveur, le classement et la remise `EVENT-`. La roadmap identifie explicitement le Blind Test comme « question + média audio » sur ce squelette : ce doit donc être un mode de **Soirée en jeu**, pas un dixième module ni un nouvel add-on. **MVP proposé, à arbitrer :** 10 à 20 manches `quiz` à choix multiple, le commerçant/animateur diffuse localement son extrait autorisé, puis commande question → verrouillage → révélation → classement depuis la télécommande. LastChance n'héberge aucun morceau, n'offre aucun catalogue ni lien de streaming : au MVP, elle orchestre la manche et garde le média hors de ses données. La colonne SQL `media_url` est une réserve non câblée ; elle reste hors MVP. La configuration porte un repère privé d'animateur (« piste 7 ») et des choix/réponse déjà sécurisés par le moteur. Score fixe recommandé : le bonus de vitesse actuel ne doit pas être vendu comme équitable dans une salle. **Limites à acter avant code :** droits de diffusion publique à la charge du lieu/organisateur, alternative visuelle/indice pour l'accessibilité, aucun lot de valeur tant que l'équité d'accès n'est pas traitée, et pilote à petite jauge seulement. Realtime en production et benchmark/soak avec p50/p95/p99 restent des prérequis avant toute promesse commerciale de capacité. **Valeur :** le bar, caviste, restaurant ou club obtient une vraie soirée collective, sans installer une application ni préparer un score à la main ; le joueur répond sur son téléphone sans compte. **Succès pilote :** délai de lancement, taux de participation de salle, réponses par manche, fin de session et retours de l'organisateur ; tester 10/25/50/100 joueurs, réponses simultanées, verrouillage/révélation et soak avant d'aller au-delà. Coût moyen, risque élevé (droits, a11y, temps réel). | Décision utilisateur attendue : valider ce périmètre MVP sans média hébergé, ou préciser le niveau d'ambition audio voulu. |
| 2026-08-17 | Proposition Codex produit, lecture seule — différenciation à forte désirabilité | **Constat vérifié :** LastChance possède déjà un catalogue très large (roue/grattage, 13 révélations, 6 défis, quiz, chasse, passeport, jackpot, live, calendrier, parrainage, pronostics) et les primitives communes de QR, portefeuille, remise et analytics. Une mécanique supplémentaire seule diluerait donc la promesse. Le « lancement garanti en 10 min » et les mini-jeux de chasse sont déjà des suites répertoriées : ils ne sont pas reformulés en nouveauté et le premier reste un prérequis d'activation. **Proposition P1 à arbitrer : « QR permanent de l'enseigne ».** Une affiche QR imprimée une fois mène toujours vers l'expérience éligible choisie/schedulée par le commerçant (ou une attente honnête), sans réimpression à chaque campagne. Elle réemploie les expériences existantes et porte une attribution distincte pour lire le funnel affiche → jeu → gain → remise. **Garde produit actée : un QR permanent est une adresse publique copiable, jamais une preuve de présence ni un secret.** Le scan seul ne donne donc aucun gain/tampon ; les limites et l'idempotence restent contrôlées côté serveur. Une récompense de valeur ou un tampon en boutique exige la preuve existante appropriée (caisse, code tournant ou QR de commande unique), sans tenter de rendre l'affiche statique anti-copie. Valeur : le commerçant installe un rituel durable, le joueur retrouve toujours une animation fraîche. Coût moyen, risque moyen : aucune destination inactive ou hors organisation ne doit pouvoir être servie, et le repli doit éviter une promesse morte. Dépendance : terminer les gardes de publication et les chiffres justes du train transverse. **P2 à valider seulement après ce signal : « Retour gagné »**, pont optionnel remise → prochaine visite via le Passeport et le portefeuille existants ; métrique centrale = part des joueurs revenus à 30 jours, jamais un revenu inventé. **Jeu manquant : aucun à ce stade.** Le Blind Test est le seul prolongement événementiel déjà recensé, mais n'est pas prioritaire avant qualification Realtime/capacité ; les pistes explicitement écartées restent hors lot. | Décision utilisateur attendue : arbitrer QR permanent, Retour gagné, ou ne rien lancer avant preuve pilote. |
| 2026-08-10 | Audit Codex ciblé, lecture seule — expériences joueur, frontend et backend | **Constats P0/P1 vérifiés :** (1) la formule live 1 000 participants n'est pas qualifiée sans Realtime : le rapport mesure ~400 polls/s et conclut que la pile ne tient pas ; bloquer cette capacité ou activer puis rebench Realtime avant vente. (2) `set_contest_status` et `set_campaign_status` n'imposent pas encore les prérequis métier de publication : une expérience vide/non distribuable peut devenir publique. (3) Réflexe/Jauge acceptent un succès déclaré par le navigateur : ne pas les associer à un gain de valeur avant protocole vérifiable serveur. **Lots P1 à arbitrer :** reprise idempotente des mini-jeux après coupure, indicateur de synchronisation live, garde RLS des jetons de chasse face au rôle caisse, exactitude de « Scans QR » (actuellement ouvertures de pages), E2E complet live et calendrier. Aucun code, migration, commit, push ou déploiement effectué. | Décision utilisateur attendue : choisir un lot, en commençant par capacité live ou gardes de publication/équité. |
| 2026-08-06 | Audit Codex complet, lecture seule | **P0.1 à P0.5, QR universel, dashboard guidé et Passeport/QR commande sont intégrés à `main`** ; le seul lot hors `main` est `chantier/conseiller-gratuit`, 7 commits devant (`896c4af`), sans migration. Retrait Anthropic et conseiller gratuit confirmés ; contrôles locaux typecheck, migrations, casts et SQL verts. **CI de ce SHA rouge** : 5 E2E `dashboard-home` échouent car le nouveau conseil duplique le texte visé par un sélecteur générique ; ne pas fusionner avant correction et CI complète verte. pgtap/RLS et build CI sont verts ; CodeQL a échoué sur indisponibilité GitHub, sans analyse ; audit/site ont été annulés. Restes produit réels : paiement Stripe de bout en bout, décision RLS sur lecture des jetons de chasse par caisse, capacité live mesurée. | Bloqué avant PR/fusion |
| 2026-07-28 | Gouvernance | Audits complets menés avec les agents Codex pertinents ; propositions filtrées par impact client, preuve, risque et coût. | Actif |

## Archive — dernier constat Codex du 2026-07-28

- Aucun chantier Claude actif.
- Le lot « Packaging et prix » est déclaré terminé par Claude, mais reste à
  relire et valider par Codex avant toute publication.
- L'arbre de travail contient des modifications non publiées de plusieurs lots
  (observabilité des workers, instrumentation des cron, Sentry/CSP et
  packaging). Elles sont à préserver et ne doivent pas être mélangées à un
  commit sans périmètre explicitement confirmé.
- Aucun commit, push, déploiement, migration distante ni création Stripe n'est
  autorisé par ce document.

## Livraison Codex — 2026-08-02 : P0 tests d'idempotence Stripe

- Les scénarios 400/409 de `ensureStripeCustomer` simulent désormais la course
  réelle : lecture initiale vide, erreur idempotente de `customers.create`, puis
  relecture de l'association gagnante. Chaque scénario vérifie que Stripe a été
  appelé une fois ; le précédent montage court-circuitait ce chemin.
- Périmètre : `src/lib/stripe.test.ts` seulement. Aucun code de production,
  appel Stripe réel, migration, secret ou configuration externe.
- Preuves : revue QA indépendante, `npm test -- src/lib/stripe.test.ts` (57
  tests verts), `npm run typecheck`, `npm run lint` et `git diff --check`
  verts.

## Terminé — à préserver

- Catalogue versionné de quatre offres : Core 29 €, Engagement 59 €, Live &
  Events 89 €, Full Platform 129 €.
- Accès aux modules et messages d'upgrade alignés sur ce catalogue dans le
  dashboard.
- Paiement sécurisé par identifiants Stripe d'environnement : aucune somme de
  vitrine n'est facturable directement.
- Claude a déclaré : tests unitaires, typecheck, lint, build et contrôles de
  migrations verts. Ces preuves devront être revérifiées avant publication.

## Archive — cahier détaillé des six blocs du 2026-07-28

> Cet ancien cahier est conservé pour traçabilité. Les blocs 1 et 2 ont été
> dépassés par les lots intégrés ci-dessus ; il ne définit plus la prochaine
> action. Le P0.3 ci-dessus est la seule proposition active de Codex.

### 1. Validation et consolidation des lots locaux

**Objectif :** relire les changements non publiés (workers, cron, Sentry, CSP
et packaging), confirmer leurs preuves et séparer un périmètre publiable.

**Limites :** préserver les modifications existantes ; pas de commit, push,
déploiement, migration distante ou changement Stripe.

**Preuves :** `git diff --check`, tests adaptés, typecheck, lint, build, puis
liste précise des écarts et risques résiduels.

### 2. Site public cohérent avec le packaging

**Objectif :** remplacer les anciennes offres « Starter », « Pronostics
+9 €/mois » et « Pass Compétition 49 € » par Core / Engagement / Live & Events
/ Full Platform.

**Limites :** réutiliser `src/lib/plans.ts` ; ne pas dupliquer prix, droits ou
limites ; pas de produit Stripe, Price ID, checkout ou déploiement ; conserver
la demande de contact si Stripe n'est pas configuré.

**Preuves :** tests ciblés, typecheck, lint, build et écarts restants.

### 3. Boucle de preuve de valeur J7 / J14 / J30

**Objectif :** montrer au commerçant activation, participation, rétention et
résultat commercial observable après 7, 14 et 30 jours.

**Limites :** événements mesurables avant les messages ; segmentation,
opt-in, désinscription, fuseau horaire et consentement ; aucun envoi réel sans
configuration et accord séparés.

**Preuves :** règles de calcul documentées, tests des segments et cas sans
donnée, démonstration ou E2E ciblé.

### 4. Player Hub transversal sans compte obligatoire

**Objectif :** donner au joueur une continuité entre expériences : historique
utile, récompenses et prochaines actions, sans compte imposé.

**Limites :** identité légère et révocable, isolation stricte par organisation,
aucune donnée personnelle inutile, compatibilité démontrée avec les parcours
publics existants.

**Preuves :** scénario nouveau joueur/joueur récurrent, contrôles multi-tenant
et RLS si la base évolue, tests de parcours et revue sécurité.

### 5. Simulateur ROI et démo interactive

**Objectif :** faire comprendre l'offre à un prospect et estimer un bénéfice
plausible avant contact.

**Limites :** hypothèses explicites, résultats présentés comme estimations,
aucun chiffre inventé ni promesse de revenu, sans compte ni appel Stripe.

**Preuves :** calculs testés, cas limites, accessibilité clavier/mobile et
mesure analytique non intrusive.

### 6. Marketing verticalisé et améliorations techniques structurantes

**Objectif :** créer des parcours par secteur sans dupliquer le code, tout en
traitant les risques techniques avant l'élargissement de l'offre.

**Limites :** composants et données partagés ; pas de copier-coller de pages ;
prioriser workers, routes publiques, webhooks, sécurité Stripe et performance ;
toute mutation distante reste soumise à autorisation séparée.

**Preuves :** architecture de contenu réutilisable, tests de rendu et liens,
contrôles de sécurité, validation Docker/WSL et rapport des risques ouverts.

## Bloqué / décision utilisateur nécessaire

- Création des produits et prix Stripe, et renseignement des
  `STRIPE_PRICE_ID_CORE`, `STRIPE_PRICE_ID_ENGAGEMENT`,
  `STRIPE_PRICE_ID_LIVE`, `STRIPE_PRICE_ID_FULL` : nécessite une autorisation
  explicite et les décisions commerciales finales.
- Commit, push, fusion, migration distante et déploiement : nécessitent une
  autorisation explicite distincte.

## Préparations propriétaire — sans nouveau chantier de code

- Confirmer le packaging commercial final : prix, période d'essai, TVA,
  politique de changement d'offre et marché de lancement. Cette décision est
  nécessaire avant de créer les produits et prix Stripe.
- Préparer l'identité légale et opérationnelle : raison sociale, adresse,
  contact support, domaine d'envoi et personne responsable des données. Ne pas
  inventer ces informations dans le produit.
- Définir une première cohorte bêta et son objectif mesurable : type de
  commerce, nombre de commerces, durée, activation visée et signal de valeur.
- Valider les indicateurs de réussite J7/J14/J30 avec les futurs commerces :
  ils doivent correspondre à leur réalité métier, pas seulement à des métriques
  techniques.
- Préparer les accès administratifs nécessaires uniquement quand une mise en
  ligne sera décidée : Stripe, domaine/email, Vercel, Supabase et analytics.
  Aucun accès, secret ou changement distant n'est demandé à ce stade.
