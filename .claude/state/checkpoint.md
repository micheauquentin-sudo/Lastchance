# Checkpoint — Lastchance

## Jalon 2026-07-27 : PR #29 verte en 13 passages — la CI devient juge (🟢)
**Date** : 2026-07-27
**Contenu** : la branche `chantier/audit-3` a été poussée et la PR #29
ouverte spécifiquement pour obtenir ce qu'aucune relecture locale ne pouvait
donner — la preuve d'exécution des 22 suites pgTAP et des E2E (Docker
Desktop exige un build Windows ≥ 19045, la machine reste figée en LTSC 2021 /
19044). **Rien n'avait jamais tourné avant cette PR.** État final après
13 passages CI : **PR entièrement verte (6/6 jobs), 22/22 suites pgTAP,
1 781 assertions, E2E verts, 1 304 tests unitaires, snapshot de types à
jour**.

- **8 défauts réels trouvés par l'exécution, invisibles à la relecture**
  (détail commit par commit, docs/bugs.md) :
  1. `4c6a010` — 4 fonctions SQL inappelables (`pg_catalog.coalesce`/
     `greatest`/`least`), **récidive** (2 précédents), garde CI ajoutée
     (`81a521e`, `scripts/check-sql-parser-constructs.mjs`).
  2. `c0d5549` — référence ambiguë dans `resolve_player_identity`
     (`#variable_conflict use_column`).
  3. `573c724` — le registre universel des récompenses violait ses propres
     CHECK sur les 10 tables legacy en miroir (AFTER trigger dans la
     transaction d'origine) — bloquait le seed, donc TOUS les E2E.
  4. `4e899c7` — `apply_stripe_subscription_event_v2` rendait deux lignes
     (`return query` sans `return`) ; **pas en production** (v1 encore active).
  5. `03be9ea` — pagination des items Stripe non gérée (latent, 9 prix
     possibles).
  6. `3409544` — harnais E2E Stripe désaligné (faux positif, pas le code).
  7. `4ecf165` — suite `subscription_entitlements.test.sql` sans contexte
     d'appel, 21 autres suites balayées par prudence (aucune autre touchée).
  8. `6973d13` — bouton `danger` sous le seuil AA, **global et préexistant**
     (admin, quiz, événement, campagnes), trouvé par une trace Playwright
     publiée grâce à `a3e135a`.
- **2 erreurs personnelles commises et corrigées dans ce même durcissement** :
  - `15364ee` (annulé par `c131340`) — un `router.refresh()` censé résoudre un
    écran vide **créait** le blocage : appelé dans `startTransition`, il
    maintient `pending` vrai jusqu'au rendu serveur complet et réinitialise
    les champs non contrôlés du formulaire suivant. Établi en rejouant le
    parcours **en local contre un vrai Postgres et un vrai navigateur**
    (première fois du projet).
  - `602d4eb` (corrigé par `20ff8e8`) — égalité stricte sur 4 sélecteurs E2E
    généralisée depuis la preuve de markup d'un seul nom.
- **Fait produit majeur** : l'item 5 du backlog (identité joueur unifiée) est
  **requalifié en prérequis** de l'item 13 (méta-progression), pas en dette
  annexe. `experience_started`/`experience_completed`, émis par le spin de la
  roue, ne portent qu'un `player_key`, jamais `player_id` ;
  `apply_meta_progression_event()` renonce à sa première garde ;
  `spins.player_key` ne rejoint aucun `player_devices.token_hash` (jointure
  vide, mesurée). Aucune mission ne progresse depuis la roue. Voir ADR-045.
  Le test E2E du panneau joueur passe en `test.fixme`, raison écrite en
  commentaire.
- ADR-044 (mis à jour), ADR-045 (nouveau), roadmap V1.18 (🟢), 
  docs/audit-3-backlog.md (item 5 requalifié, item 13 nuancé, en-tête pgTAP/E2E
  clos pour cette branche), docs/bugs.md, docs/architecture.md.
- **Reste** : fusionner la PR #29 sur `main` ; traiter l'item 5 comme
  prérequis ; étendre la visibilité du panneau joueur au-delà de la roue.

## Jalon 2026-07-26 : Méta-progression branchée 🟡 (commité, NON POUSSÉ)
**Date** : 2026-07-26
**Contenu** (commits `8a4324f` → `793100a`, 16 commits, branche
`chantier/audit-3`, **NON POUSSÉE** — `origin` ne connaît pas la branche) :
- **Constat de départ** : 1 713 lignes de SQL dormaient (14 tables
  `progression_*`, 13 fonctions, **aucune RPC appelée par le code**, aucune
  UI) — la seule fondation entièrement morte du projet, n°1 du backlog de
  l'audit 3 (item 13, `docs/audit-3-backlog.md`).
- **DB — 3 migrations** : `20260805200000_meta_progression.sql` (1 713 l.,
  préexistante) ; `20260805210000_meta_progression_lifecycle.sql` (1 566 l.,
  `bf2c3d3`) — 18 fonctions : clôture / archivage / suppression de saison,
  édition et suppression **bornées au brouillon**, sel serveur
  `progression_chests.loot_seed` (corrige un tirage
  `md5(request_id ‖ item.id)` meulable via un `request_id` client, sans
  casser l'idempotence), table `progression_engine_failures`, purge
  corrigée ; `20260805220000_meta_progression_hardening.sql` (1 380 l.,
  `3174cbd`) — suites de la revue de sécurité. `EXPECTED_MIGRATION` =
  `20260805220000`, 77 migrations, `migrations:check` vert.
- **Décision centrale** : **le moteur est un trigger, pas un appel**
  (`apply_meta_progression_event()` sur `experience_events`) — les missions
  progressent depuis les 9 expériences sans code applicatif à ajouter dans
  chacune. Brancher le module a livré lecture / configuration / ouverture de
  coffre, jamais la progression elle-même, qui tournait déjà.
- **Invariant NON MONÉTAIRE** vérifié par grep inverse : clés, badges, objets,
  coffres sont des marqueurs d'engagement, aucun `reward_issuances`, aucune
  colonne `*_cents`.
- **Interrupteur d'arrêt** (`set_progression_mission_enabled` /
  `set_progression_chest_enabled`) : seul geste autorisé sur une saison
  lancée, ne touche que `enabled`.
- **Backend** : `src/lib/meta-progression.ts`,
  `src/actions/meta-progression.ts` (**27 RPC exposées**), seaux de
  rate-limit `progressionDevice` / `progressionPlayerAction` /
  `progressionPublicIp`, 9e RPC de purge au cron `purge-data`, sonde SLO dans
  `src/lib/admin/ops.ts`.
- **Frontend** : éditeur `/dashboard/progression`, panneau joueur greffé au
  parcours public **existant** `/play/[slug]` (aucune nouvelle surface
  publique).
- **Sécurité** : revue **GO conditionnel**, 0 CRITIQUE, 0 ÉLEVÉ. 3 MOYEN
  corrigés — M1 seau `failClosed` composé sur un `organizationId` **client**
  (débit non borné, rafale invisible au monitoring) → seau sur la clé
  d'identité, observation hissée avant le contrôle ; M2 commentaire
  d'invariant **faux** sur `org_progression_snapshot` (infirmé sur 4 points)
  → corrigé et réécrit ; M3 absence d'interrupteur d'arrêt → livré. 5 FAIBLE
  corrigés dont F1 (idempotence du butin ignorant `chest_id`) et F2
  (`progression_engine_failures` sans lecteur).
- **QA** : **1 303 tests unitaires ✓** (83 fichiers), typecheck ✓, lint ✓,
  build ✓. **pgTAP (799 assertions : 293 + 506) et E2E
  (`e2e/progression.spec.ts`) JAMAIS EXÉCUTÉS** — Docker Desktop exige un
  build Windows ≥ 19045, cette machine est figée en LTSC 2021 / 19044 pour
  toute sa durée de vie, pas un manque temporaire. Deux défauts
  d'`e2e/progression.spec.ts` trouvés par **relecture du markup** (heading
  impossible, libellé sans « maintenant »), aucun par exécution.
- **`792f2a3`** : CI réparatrice — la garde anti-dérive des types publie le
  snapshot régénéré en artefact `database-generated-types` au lieu de le
  jeter (seul chemin praticable pour rafraîchir
  `src/types/database.generated.ts`, périmé depuis 9 migrations).
- **`ef721aa`** : CLI Supabase en devDependency (inspection distante,
  pas `--local`).
- **Fait confirmé le 2026-07-26 à la CLI Supabase**
  (`supabase migration list --linked`) : la production porte toutes les
  migrations jusqu'à `20260804120000` incluse — clôt les mentions
  « application non revérifiée » sur `20260801120000`, `20260802120000`,
  `20260803120000` et `20260804120000` qui traînaient dans la doc.
- **Résidus assumés** (docs/bugs.md) : seau par appareil borné à un cookie ;
  `observeProgressionPressure` toujours keyée sur l'`organizationId` client
  (plafonnée en amont) ; sonde F2 sans test dédié ; **panneau joueur visible
  seulement depuis la roue** alors que les missions progressent déjà depuis
  les 14 jeux rapides, le passeport, le calendrier, le quiz, la chasse, le
  jackpot et l'événement live ; pas de garde d'addon (monétisation reportée) ;
  couverture E2E du coffre écartée (miroir de la mission) ; branche
  `mission already has player progress` inatteignable aujourd'hui ;
  réordonnancement des collections non exposé en UI. 4 sous-items hors
  périmètre (parcours personnalisés, validation d'achat POS/ticket, défis
  entre équipes, campagnes réseau).
- ADR-044, roadmap V1.18, docs/audit-3-backlog.md (item 13).

## Outillage : orchestration Codex + agent Vercel ✅
**Date** : 2026-07-25
- Ajout de `AGENTS.md` à la racine : routage natif Codex vers les playbooks
  existants, règles de coordination, sécurité du worktree et contrat de livraison.
- Ajout du 8e agent `vercel-release` : environnements, previews, production,
  inspection, logs, promotion et rollback Vercel.
- Routage synchronisé dans `.claude/settings.json` et `CLAUDE.md`.
- Garde-fous : QA avant release, migration Supabase avant le code dépendant,
  aucun secret affiché, et confirmation explicite avant toute mutation de
  production.
- Aucun déploiement ni changement distant effectué pendant ce chantier.

## Jalon 2026-07-25 (fin de journée) : Encaissement en caisse des lots de pronostics — 9e source 🟡 (commité, NON POUSSÉ)
**Date** : 2026-07-25
**Contenu** (commits `e310606` → `f873b77`, **sur `main` mais NON POUSSÉS** —
`origin/main` = `eb3193d`, migration `20260804120000` non appliquée en prod) :
- **Constat de départ — anomalie fonctionnelle EN PRODUCTION** : `finalize_contest`
  posait déjà un code `PRONO-…` dans `contest_awards.code`, le joueur le voyait sur
  `/pronos/[slug]` et l'UI lui disait de le **présenter en caisse**. Or
  `lookupRedeemCode` ne routait que **8 sources**, et le seul chemin de remise
  existant (`set_contest_award_status`) exige `is_org_editor` : **un caissier ne
  pouvait pas remettre le lot**. La promesse était affichée, le chemin n'existait pas.
- **DB** (`e310606`, `20260804120000_contest_award_redemption.sql`) : `delivered_at`
  **renommée `redeemed_at`** — une seule colonne de vérité, alignée sur les 7 modules
  frères (`quiz_rewards.redeemed_at`) plutôt que deux horodatages qui divergent — plus
  `redeemed_by`, `basket_cents`, `redeem_expires_at` ; CHECK
  `(status='delivered') = (redeemed_at is not null)` (l'état incohérent devient
  IMPOSSIBLE pour les deux chemins d'écriture) ; index unique
  `(organization_id, code)` précédé d'un **contrôle de doublons explicite** (message
  actionnable au lieu d'un « could not create unique index » muet) ;
  `contests.code_ttl_seconds` **borné 3600–7776000 s** + trigger figeant l'échéance
  à l'émission ; RPC `redeem_contest_award` atomique, idempotente, auditée,
  deny-by-default (`status='pending'`), réponse indistinguable, `service_role` seule.
  `EXPECTED_MIGRATION` bumpé dans le même commit.
- **Bornes de TTL divergentes, assumées** : campagnes 10–600 s (le joueur vient de
  gagner et est DEVANT la caisse — la fenêtre courte est ce qui tue la capture
  d'écran) vs pronostics 1 h–90 j (le décompte part de la CLÔTURE, le gagnant doit
  être prévenu puis se déplacer ; toute borne à la minute expirerait 100 % des codes
  avant le premier retrait possible). Même nom, même unité, même trigger — pas la
  même borne, et c'est le point de l'ADR.
- **Backend** (`700a253`) : `normalizeContestCode` (`src/lib/utils.ts`),
  `lookupContestAwardByCode`, `redeemContestAward`, routage 9e source dans
  `src/actions/participations.ts`, `code_ttl_seconds` aux validations Zod.
- **Frontend** (`0a95ae8`) : `ContestResult` + `ContestRedeemButton` en caisse,
  palmarès enrichi (quand / par qui / quel panier), expiration réglée **en jours**,
  échéance affichée au joueur.
- **E2E** (`931c21b`) : clôture → le joueur lit son code → saisie en caisse → remise
  validée avec panier → **seconde tentative refusée**, assertée sur les DEUX faces.
- **Finitions** : `76c72dc` (le formulaire n'écrase plus un TTL non représentable en
  jours entiers) ; `f873b77` (M1 + contrôle de doublons).
- **Sécurité** : revue **GO conditionnel, aucun CRITIQUE ni ÉLEVÉ**. M1 (MOYEN) —
  fuite potentielle du nom du championnat et du **PRÉNOM DU GAGNANT** d'une autre
  organisation si `contest_awards.organization_id` se désynchronisait de `contests` /
  `contest_players` (colonne dénormalisée qu'aucun CHECK ne garantit, et que
  `service_role` peut écrire) → jointures org-scopées, **étendues à l'`UPDATE`** :
  ne scoper que la lecture aurait produit un état PIRE que le défaut d'origine — le
  lot consommé et audité pendant que la caisse affiche « code inconnu ».
- **QA** : **1147 tests ✓**, typecheck ✓, lint ✓, build ✓ (exécutés).
  **⚠️ pgTAP JAMAIS EXÉCUTÉS** — ni Docker ni CLI Supabase disponibles : les
  **43 assertions** de `contest_awards.test.sql` et les **4** de l'audit ACL central
  ne seront prouvées qu'au job CI `database-security`. C'est le trou réel du chantier.
- **⚠️ Résidu M2 NON LIVRÉ** : chaque famille de codes consomme son propre jeton
  `cashier:lookup` — une saisie NUE de 8 caractères en consomme **9**, ramenant le
  caissier à ~3 recherches/minute, le refus s'affichant « code introuvable » sur un
  lot valide. Correctif **écrit et vert (1222 tests) mais NON COMMITÉ** :
  `src/actions/participations.ts` porte 495 lignes mêlant ce correctif et le chantier
  « registre universel » en cours. Concerne les **9** sources. À reprendre quand
  l'arbre sera au propre.
- 7 autres résidus assumés (docs/bugs.md) : dérogation éditeur à l'expiration ; pas de
  garde `hasPronosticsAccess` sur la remise (cohérent avec les 8 autres sources) ;
  bascule de tie-break sur les codes nus (résolution pronostics avant le repli roue) ;
  lot **annulé** encore présenté comme encaissable au joueur (préexistant, UX) ; refus
  de remise non audités (dette partagée avec `redeem_quiz_reward`) ;
  `finalize_contest` sans boucle anti-collision ; `set_contest_award_status` scopé
  sans revérifier `contests`.
- **Écart doc/code corrigé au passage** : la documentation affirmait que le Créateur
  de quiz était « le seul chantier non poussé ». C'est faux depuis que `origin/main`
  pointe sur `eb3193d` (2026-07-25 10:47), qui contient `cb92b19` → `fe1e57b` plus
  `15eb181`, `6b4df8f`, `3214bf0` et `eb3193d`. L'écart local/distant, ce sont
  désormais les 6 commits de CE chantier.
- ADR-043, roadmap V1.17, docs/bugs.md, docs/architecture.md (« Encaissement en
  caisse — les 9 sources »).

## Dernier jalon : Créateur de quiz 🟡 (construit, NON POUSSÉ)
**Date** : 2026-07-25
**Contenu** (commits `cb92b19` → `fe1e57b`, **LOCAUX — non poussés, migration
`20260803120000` non appliquée en prod ; seul chantier du projet dans cet état**) :
- **Besoin client** : un **créateur de quiz** jouable depuis un QR ou un lien, en
  LIBRE-SERVICE et **ASYNCHRONE** (chacun à son rythme, sans animateur). Usages :
  restaurant (cuisine), cave / bar (dégustation), salon professionnel (exposants),
  boutique (produits), musée (parcours culturel), entreprise (team building), club
  sportif. Le client a précisé que « le moteur des pronostics pourra être réutilisé
  pour une grande partie du classement ».
- **3 arbitrages client** : (1) **module DÉDIÉ** — ni un `event_kind` des
  pronostics, ni une extension de l'événement live : l'intention « je crée un
  quiz » est distincte et la **sémantique de la vérité diffère** (pronostic =
  réponse inconnue de tous jusqu'au résultat ; quiz = réponse existante **dès la
  création**, donc non-fuite à démontrer), le cycle de vie aussi
  (`event_sessions` SYNCHRONE / `quizzes` ASYNCHRONE) ; (2) les **7 types de
  questions** ; (3) les **5 modes de récompense**.
- **MODÉLISATION (point de design)** : **4 formes de réponse**
  (`question_type in ('choice','number','ranking','text')`) + **2 dimensions
  transversales** (`time_limit_seconds`, `image_url`) + un **`preset`** libre de
  forme portant les 7 modèles d'UI (`multiple_choice`, `true_false`,
  `mystery_image`, `estimate`, `timed`, `ranking`, `free_prediction`), ignoré du
  moteur. Un type « chronométré » aurait interdit le « choix multiple
  chronométré » ; « vrai/faux » = un choix à 2 options ; « image mystère » = un
  média. Même couple `event_kind`/`question_type` que les pronostics, dont
  `choice`/`number`/`ranking` **réutilisent les validateurs**
  (`is_valid_contest_options`/`is_valid_contest_answer`) — seule la réponse libre
  est neuve. **8e modèle = une entrée de catalogue, sans migration.**
- **DB** (`20260803120000_quizzes.sql`) : `addon_quiz` + 5 tables (`quizzes`,
  `quiz_questions`, `quiz_players`, `quiz_answers`, `quiz_rewards`), **10 RPC
  `service_role`** + 5 helpers + 1 interne, `spins.source` étendu à `'quiz'`,
  pgTAP `quizzes.test.sql` + audit ACL central complété.
- **Backend** : `src/lib/quiz.ts` (mappers purs), `quiz-context.ts`,
  `validations/quiz.ts`, `src/actions/quiz.ts` ; caisse **8e préfixe `QUIZ-`** ;
  rate-limit ADR-032 ; purge RGPD au cron `purge-data`.
- **Frontend** : éditeur `dashboard/quiz/*` (7 modèles via `quizFormShape`,
  dotation des 5 modes, bouton de tirage) + parcours joueur `/quiz/[slug]`
  (sas « je suis prêt·e », correction immédiate, classement, partage, a11y).
- **6 invariants** : non-fuite de la bonne réponse en **3 couches** (RPC → mapper →
  type jouable sans champ de vérité) ; **chronomètre inforgeable** (aucun paramètre
  de temps en RPC, `elapsed_ms` en base, `started_at` posé une fois et gelé même
  pour le `service_role`) ; réponse **unique et immuable** (hors délai =
  enregistrée hors barème, jamais rejetée) ; tirage **idempotent** (3 verrous) ;
  **stock fini obligatoire** (ADR-031) ; multi-tenant + ADR-032 (`failClosed` sur
  l'identité seule, IP partagée fail-open en observabilité).
- **Sécurité** : revue **GO CONDITIONNEL → tout corrigé** (`fe1e57b`) — E1 ÉLEVÉ
  BLOQUANT (le mode `instant` émettait un lot **sans aucune réponse** : 2 appels
  suffisaient, une boucle vidait le stock depuis une seule IP) → complétion réelle
  exigée ; E2 ÉLEVÉ Sybil (le corrigé complet collecté par une passe jetable) →
  **Turnstile sur le SEUL appel émetteur** `finishQuiz`, et seulement si un lot est
  en jeu ; M1 email sans consentement ; M2 purge laissant les réponses LIBRES
  (PII) ; M3 tirage à vide **figeant définitivement la dotation** → état
  `no_participants`, relançable. Conséquence UI d'E1 : une question chronométrée
  abandonnée est SOUMISE (hors barème) au lieu d'être sautée.
- **Défaut de PRODUCTION corrigé au passage** (`b483740`) : 8 addons en base,
  **6 seulement au back-office** (et 2 non lues par `admin/data.ts`) — le module
  **Parrainage, en production, ne pouvait être activé pour AUCUN commerçant**. Les
  8 sont désormais basculables et lues ; résidu : `setMerchantCompAccess` limité à
  4 addons (préexistant).
- **CI / QA** : typecheck ✓, lint ✓, **1116 tests ✓** ; E2E `e2e/quiz.spec.ts` +
  seed déterministe + 6 gardes de chemin ; pgTAP et E2E CI-only (Docker absent en
  local). EXPECTED_MIGRATION `20260803120000`. ADR-040, roadmap V1.16.
- **Points ouverts** : pousser et déployer ; 7 résidus assumés (docs/bugs.md) —
  Sybil borné par `reward_stock` seul, pas de borne minimale de temps humain,
  `out_of_stock` terminal, purge par anonymisation, tour offert insensible à l'état
  de la roue cible, prénom non modéré au classement, dérogation destructive au
  trigger de gel.

## Jalon précédent : Place de marché de campagnes ✅ (poussé le 2026-07-25)
**Date** : 2026-07-25
**Contenu** (commits `ed50271` → `4457b20`, **locaux le 2026-07-25, depuis présents
sur `origin/main` ; application de la migration `20260802120000` non revérifiée**) :
- **Besoin client** : le commerçant part d'un MODÈLE au lieu de configurer une
  campagne de zéro. **10 modèles** (Saint-Valentin, Halloween, Noël, ouverture de
  boutique, anniversaire, match de football, fête des Mères, happy hour, soldes,
  lancement de produit), chacun portant **7 promesses** : le visuel, le jeu, les
  textes, les récompenses suggérées, les emails, la durée, les règles.
- **3 arbitrages client** : (1) **catalogue Lastchance EN CODE** (versionné avec
  l'app) **+ modèles PRIVÉS** enregistrés par le commerçant, visibles de sa seule
  organisation — **pas de place de marché partagée entre commerçants** (écartée :
  modération, isolation du contenu publié, propriété des visuels ; projet à part) ;
  (2) **appliquer = créer une campagne EN BROUILLON complète** ; (3) **emails
  fournis en TEXTES, jamais activés**.
- **DB** (`20260802120000_campaign_templates.sql`) : table `campaign_templates`
  (modèles privés seulement) — `name` unique par organisation, `description`,
  `blueprint jsonb` (**objet**, **borné à 32 Ko** ; la FORME reste validée côté
  applicatif pour suivre l'évolution des jeux), `source_campaign_id`, `created_by`
  posé par trigger depuis la session. **FK COMPOSITE** `(source_campaign_id,
  organization_id) → campaigns(id, organization_id)` ; `organization_id` hors du
  grant UPDATE ; policy unique `campaign_templates: editors` ; aucune policy
  `anon`/`public`. pgTAP `campaign_templates.test.sql` avec **sentinelle** qui
  échoue si une policy venait à citer `anon`/`public`.
- **Backend** : `src/lib/campaign-templates.ts` (module pur — `CampaignBlueprint`,
  `blueprintToDraft`, les 10 modèles ; durée RELATIVE en jours),
  `src/lib/validations/campaign-templates.ts` (Zod, dans les DEUX chemins),
  `src/actions/campaign-templates.ts` (`applyCampaignTemplate`,
  `saveCampaignAsTemplate`, `deleteCampaignTemplate`).
- **Frontend** : galerie serveur en deux sections (« Modèles Lastchance » / « Mes
  modèles »), aperçu des 7 promesses en **lecture défensive** (un blueprint d'une
  version antérieure s'affiche en dégradé au lieu de casser la page),
  enregistrement et suppression ; les blueprints ne traversent pas le réseau.
- **3 invariants d'innocuité** (vérifiés sur l'ACTION, mutation-testés) :
  **BROUILLON INERTE** (`status: 'draft'` ET `auto_schedule: false` verrouillé au
  niveau du TYPE — sans lui le cron `run_campaign_schedule()` publiait la campagne
  tout seul dès `starts_at` ; aucun champ `status`/`auto_schedule`/`starts_at`/
  `ends_at` dans le schéma Zod) ; **AUCUN ENVOI** (`automation_settings`,
  `enqueueJob`, `@/lib/resend` absents du chemin ; modèle enregistré avec
  `emails: []`) ; **MULTI-TENANT** (org et rôle de la session, client de SESSION
  sous RLS + filtre organisation, aucun `createAdminClient`).
- **Sécurité** : revue **GO, 0 bloquant — 1 MOYEN corrigé** (`4457b20`). Le
  blueprint recopie `wheels.skill_config`, donc les SECRETS des jeux de défi ; la
  lecture ouverte à `is_org_member` les faisait passer d'« éditeurs seulement » à
  « toute l'équipe, CAISSIERS compris » (effet de bord : poids, stocks,
  `cost_cents`, budget) → policy unique `campaign_templates: editors`, pgTAP
  inversé + assertion de non-fuite du secret + contre-épreuve éditeur ; table
  intégrée à l'audit RLS central. INFO : `budget_cents` en `min(1)`.
- **CI / QA** : 29 tests d'action, E2E `e2e/campaign-templates.spec.ts` (preuve
  prise sur l'ÉTAT réel : badge « Brouillon », programmation décochée), pgTAP
  ajouté au job d'audit ACL (Docker absent en local) ; typecheck ✓, lint ✓,
  1021 tests ✓. EXPECTED_MIGRATION `20260802120000`. ADR-039, roadmap V1.15.
- **Points ouverts** : vérifier l'application de la migration en production ;
  6 résidus assumés (docs/bugs.md) —
  blueprint privé pouvant décrire une roue sans lot perdant, application non
  transactionnelle (brouillon orphelin), ni quota ni rate-limit, secret de défi
  dupliqué dans le blueprint, seule la roue principale capturée, « Utiliser ce
  modèle » visible pour un caissier.

## Jalon précédent : Pronostics au-delà du sport ✅ (poussé le 2026-07-25)
**Date** : 2026-07-24
**Contenu** (commits `4973736` → `f09ee89` — **LOCAUX au 2026-07-24, présents sur
`origin/main` au 2026-07-25 ; l'application effective de la migration
`20260801120000` en production n'a pas été revérifiée**) :
- **Besoin client** : le moteur de pronostics cesse d'être football-centré. Il
  doit servir à tout événement à résultat (cérémonie, Eurovision, élection
  interne/associative, remise de prix, compétition d'entreprise, concours
  culinaire, finale d'émission, tournoi local, course, e-sport), sur le modèle
  `événement → questions prédictives → date de verrouillage → résultat → barème →
  classement → récompenses`. **Le football devient un MODÈLE préconfiguré, pas le
  cœur technique.** Aucune nouvelle surface publique ; classement, ex æquo,
  ligues, TV, clôture et récompenses restent partagés et INCHANGÉS.
- **3 arbitrages client** : (1) 4 types de questions — `score` (2 camps, le foot
  historique inchangé), `choice`, `ranking`, `number` ; (2) football + 10 modèles
  préconfigurés ; (3) verrouillage PAR QUESTION avec date par défaut au niveau de
  l'événement.
- **DB** (`20260801120000_generic_contests.sql`) : `contests` (`event_kind` défaut
  `football`, `default_locks_at`, `scoring` étendu) ; `contest_matches` devient le
  **REGISTRE DE QUESTIONS** (`question_type`, `prompt`, `options`,
  `correct_answer`, `ranking_size`, `locks_at`) ; `contest_predictions` (scores
  NULLABLE + `answer jsonb`) ; RPC `submit_contest_answer`,
  `set_contest_question_result`, `update_contest_generic_scoring`,
  `update_contest_event_settings` ; barème par type en SQL ; pgTAP
  `generic_contests.test.sql`.
- **Règle de verrouillage par type** : `score → coalesce(locks_at, kickoff_at)` /
  `générique → coalesce(locks_at, default_locks_at, kickoff_at)`, dans les 4
  fonctions SQL concernées ET dans le miroir TS `effectiveLocksAt` ; champ masqué
  en UI pour le football.
- **Backend / Frontend** : miroir TS du barème, Zod par type, `publicCorrectAnswer`
  (point de sérialisation UNIQUE de la bonne réponse) ; création d'événement typée,
  réglages de verrouillage éditables (événement reporté, audités), constructeur de
  questions typées, saisie du résultat par type, parcours joueur générique,
  `ranking-picker` ; 11 modèles + `custom` (`contest-event-kinds.ts`) avec
  questions suggérées et barème conseillé, **aucune option factice écrite** ;
  synchro fournisseur réservée au football (double verrou).
- **Sécurité** : revue **NO-GO conditionnel → corrigé** (`f3c5752`). GO franc sur
  le volet générique ; blocage sur la NON-RÉGRESSION football — **ÉLEVÉ** :
  backfill `locks_at = kickoff_at` figeant la fenêtre alors que la synchro ne met à
  jour que `kickoff_at` (match reporté → fermeture silencieuse sur un match non
  joué ; match avancé → pronostic accepté pendant la rencontre) → backfill
  supprimé ; **MOYEN** : `default_locks_at` primant sur `kickoff_at` fermait d'un
  coup un championnat importé → jamais appliquée à une question `score` (volet UI
  `f09ee89` : champ masqué sur le modèle football). Tests pgTAP « reporté /
  avancé / date par défaut ignorée » + 5 tests TS. QA verte.
- **CI** : E2E `e2e/pronostics-generic.spec.ts` + seed `E2EPRONO3` ; pgTAP
  (Docker absent en local). EXPECTED_MIGRATION `20260801120000`. ADR-038,
  roadmap V1.14.
- **Points ouverts** : confirmer l'application de la migration en production ;
  résidus assumés (docs/bugs.md) — M2
  (`update_contest_event_settings` peut rouvrir une question à `locks_at` NULL),
  I1 (miroir TS du barème sans appelant prod), ex æquo par palier et non par type,
  I2 (`number_tolerance` décimal ignoré), I4 (RPC hors `security_acl.test.sql`),
  I5 (`tiebreaker_answer` chargé mais jamais transmis) ; fragilité E2E
  PRÉ-EXISTANTE `e2e/pronostics.spec.ts:40`.

## Jalon précédent : Jeux rapides — moteur de tirage partagé + skill-gated ✅
**Date** : 2026-07-24
**Contenu** (commits `d957f46`→`5710641` vague 1 — **déployée en prod** ;
`125eb99`→`8a3c60e` vague 2 — **déployée en prod**) :
- **Concept** : `wheels.game_type` (V1.4 : roue et grattage partagent déjà
  `spinWheel`/`perform_atomic_spin`/`claimPrize`) FORMALISÉ en socle et étendu à
  13 nouveaux jeux. « Ajouter un jeu = ajouter une interface » — éligibilité,
  probabilités, lots, stocks, réclamation, stats, thème, consentement, partage,
  caisse et Wallet mutualisés et INCHANGÉS. Aucune nouvelle surface publique.
- **VAGUE 1 — 7 jeux de RÉVÉLATION (EN PROD)** : `flip_card`, `cups`, `slot`,
  `memory`, `chest`, `dice`, `draw_card`. Migration
  `20260730120000_quick_games_reveal.sql` (extension `wheels_game_type_check`).
  Socle client `game-shell.tsx` (`<GameShell>`) extrait du grattage. SERVEUR-
  AUTORITATIF : le lot vient de `spinWheel`, l'interaction ne fait que RÉVÉLER
  l'`outcome` (cosmétique, aucun poids au client). Chaque jeu =
  `games/<jeu>-reveal.tsx` + `<jeu>-experience.tsx` (~12 l.). Revue vague 1 GO
  0 bloquant.
- **VAGUE 2 — 6 jeux de DÉFI *skill-gated* (EN PROD)** : `rps`, `reflex`, `gauge`,
  `puzzle`, `mystery_word`, `estimate`. Migration
  `20260731120000_quick_games_skill.sql` : `game_type` étendu ;
  `wheels.skill_config jsonb` (secrets `mystery_word.word`/`estimate.target`/
  `estimate.tolerance`/`puzzle.order` SERVER-ONLY) ; `perform_atomic_spin`
  recréée en **7-args** avec `p_force_losing boolean default false` (corps normal
  identique au correctif 42702 → zéro régression).
- **Moteur à 2 temps** (`src/lib/skill.ts` + `src/actions/skill.ts`) :
  `startSkillChallenge` présente le défi (vue publique sans secret,
  `toPublicChallenge` strippe) + jeton HMAC domaine-séparé `skill-challenge:` lié
  device ; `submitSkillChallenge` vérifie jeton+device, ÉVALUE le défi CÔTÉ SERVEUR
  (rps coup serveur HMAC / mystery_word égalité normalisée / estimate tolérance /
  puzzle ordre / reflex+gauge *client-reported*), puis
  `perform_atomic_spin(p_force_losing => !succeeded)`. Participation CONSOMMÉE
  dans les 2 cas (anti-brute-force). Socle `skill-game-shell.tsx` +
  `games/<jeu>-challenge.tsx` ; éditeur `wheel-settings.tsx` (sélecteur +
  « Réglages du défi », secrets marqués). Fix vague 1 (`ac27384`) : `updateWheel`
  refusait les nouveaux `game_type` → enum complet.
- **Sécurité** : revue vague 2 **NO-GO→GO** (`8a3c60e`). Invariant central : le
  tirage est le PLAFOND (ADR-031). ÉLEVÉ corrigé — garde `isSkillGameType` dans
  `spinWheelInner` contre le contournement du défi par appel direct `spinWheel`.
  MOYEN corrigé — `unlimited` interdit sur jeux à secret + oracle `succeeded`
  retiré de la réponse (anti brute-force). Rate-limit ADR-032 (failClosed device,
  IP fail-open). QA verte. EXPECTED_MIGRATION `20260731120000`.
- **CI** : pgTAP `quick_games_skill.test.sql` + E2E `skill-games.spec.ts` + seed
  (Docker absent en local).
- Migrations `20260730120000` / `20260731120000` (prod), ADR-037.
- **Points ouverts (résidus FAIBLE assumés, docs/bugs.md)** : reflex/gauge
  *client-reported* (bornés par l'économie) ; jeux à secret exigent `play_limit`
  borné ; verrouillage du défi sur erreur transitoire au submit.

## Jalon précédent : Parrainage ludique (prod-ready) ✅
**Date** : 2026-07-24
**Contenu** (commits `abf6204` DB, `2ade1ed` + `f63dbf2` backend, `757d0fb`
frontend, `1f048b8` E2E, `6d7bfba` durcissements — **déployés en prod**) :
- **Module** addon `addon_referral` (miroir `addon_calendar`, gating
  `hasReferralAccess`), opt-in PAR CAMPAGNE (`referral_programs.enabled`) sur les
  campagnes ROUE : un joueur satisfait devient PARRAIN (code partageable `PR-…` →
  lien `/play/[slug]?ref=PR-…`, aucune nouvelle surface publique) ; chaque filleul
  qui vient JOUER un spin fait progresser une jauge d'« équipe » PARTAGÉE. V1
  mono-organisation.
- **DB** (migration `20260729120000_referral.sql`) : colonne `addon_referral` ;
  `spins.source` étendu à `'referral'` ; 4 tables org-scopées `referral_programs` /
  `referral_sponsors` / `referral_signups` / `referral_rewards` (FK composites
  tenant, RLS `is_org_member`/`is_org_editor`, aucun accès anon). 7 fonctions
  SECURITY DEFINER : 6 RPC service-role (`ensure_referral_sponsor`,
  `referral_public_state`, `validate_referral` [cœur anti-abus],
  `consume_referral_spin_grant`, `redeem_referral_reward`,
  `purge_expired_referral_data`) + 1 helper interne `referral_emit_reward`.
  EXPECTED_MIGRATION bumpé. pgTAP `referral.test.sql`.
- **Backend** : `referral.ts` (mappers purs), `referral-context.ts`,
  `validations/referral.ts`, `actions/referral.ts` (ensureReferralSponsor,
  validateReferral, consumeReferralSpin, getReferralState, saveReferralProgram),
  caisse unifiée `source: 'referral'` (`lookupRedeemCode` route 7 préfixes),
  rate-limit ADR-032 (`referralPlayerAction` failClosed device / `referralPublicIp`
  fail-open observe), cron `purge-data` branché. Fix `getUserAndOrg` (sélectionnait
  tous les addons sauf `addon_referral`).
- **Frontend** : éditeur campagne `referral-program-settings.tsx` (config libre des
  3 versements) + `referral-redeem-button.tsx` (caisse) ; `ReferralPanel` (parrain :
  CTA, partage, jauge/coffre/équipe) et `ReferralSpinExperience` (filleul par
  `?ref=PR-…` → `validateReferral` APRÈS le spin réel) branchés dans
  `play-experience.tsx` ; la page de jeu ISR expose un prop public `referral`
  (libellés/kinds seulement).
- **Preuve = PARTICIPATION réelle** (jamais un clic) : `validate_referral` exige un
  `proof_spin_id` (spin réel du device filleul, non forgeable/non rejouable/unique).
  **3 versements CONFIG LIBRE** `none`/`spin`/`lot` : parrain / filleul / coffre au
  seuil (`chest_threshold`, défaut 3) ; `lot` = `PARRAIN-…` STOCK FINI (ADR-031),
  `spin` = tour offert (`spins.source='referral'`, ADR-029). « Équipe » =
  jauge/coffre PARTAGÉS, sans classement (coopératif).
- **Invariants (8)** : pas de récompense sur un clic ; self (device+email)/boucle
  A→B→A bloqués ; 1 filleul/campagne/device + fenêtre + plafond ; stock fini
  obligatoire + coffre une fois sous verrou ; multi-tenant (RLS + FK composites,
  `saveReferralProgram` n'écrit jamais les `*_claimed_count`) ; non-fuite
  (`referral_public_state` = parrain courant seul, prop `referral` = libellés/kinds) ;
  rate-limit ADR-032 (failClosed clé device seule) ; jetons (`spin_grant_token`
  192 bits anti-rejeu, codes CSPRNG, purge neutralise les emails). Durcissements
  `6d7bfba` : no-oracle (`rejected` unique) + défense en profondeur
  (`referral_public_state` re-gate addon/enabled/active).
- **Revue sécurité** : verdict GO, 0 finding bloquant ; anti-abus borné par
  l'ÉCONOMIE (stock fini, ADR-031) plus que par les rate limits (ADR-032). QA verte.
- **CI** : `referral.test.sql` (pgTAP) + `e2e/referral.spec.ts` (éditeur, parrain+
  lien, filleul post-spin, caisse double-retrait, axe) + seed `PARRAIN-E2ECHEST`.
  Vérifs CI-only (Docker absent local).
- Migration `20260729120000`, ADR-036.
- **Points ouverts (résidus FAIBLE assumés, docs/bugs.md)** : dédup email inerte
  dans le flux post-spin (validation avant collecte d'email) ; amplification ~3× en
  config spin+spin (bornée par stock fini des lots de la roue) ; entropie
  `referral_code` 40 bits (identifiant partageable non secret). **Suites ouvertes** :
  câblage best-effort de l'email au claim, multi-commerces, parrainage sur d'autres
  mécaniques.

## Jalon précédent : Calendrier de l'Avent & campagnes quotidiennes (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `6b5e2aa` DB, `7a13a25` backend, `df63433` frontend,
`d420fdd` E2E, `5c4d89f` fix anti-spoiler — **déployés en prod**) :
- **Module** addon `addon_calendar` (miroir `addon_events`, gating
  `hasCalendarAccess`) : campagne QUOTIDIENNE à mécanique ANNUELLE — le joueur
  revient chaque jour ouvrir UNE case (Avent, semaine anniversaire, compte à
  rebours, 7 jours de cadeaux, festival, lancement produit, semaine soldes), ou
  suit à distance via un rappel email opt-in. V1 mono-organisation.
- **DB** (migration `20260728120000_calendar_campaigns.sql`) : colonne
  `addon_calendar` ; 5 tables `calendars` / `calendar_days` / `calendar_openings`
  / `calendar_rewards` / `calendar_players` (FK composites tenant, RLS org-scopée
  `is_org_member`/`is_org_editor`, aucun accès anon) ; `spins.source` étendu à
  `'calendar'`. RPC service-role : `join_calendar`, `open_calendar_box`,
  `consume_calendar_spin_grant`, `calendar_public_state`,
  `calendar_reminder_targets`, `redeem_calendar_reward`,
  `purge_expired_calendar_players` (+ trigger `calendars_set_defaults` dérivant
  les `unlock_at`). EXPECTED_MIGRATION bumpé. pgTAP `calendar.test.sql`.
- **Backend** : `calendar.ts` (mappers purs + `calendarDayUnlockAt` DST-robuste
  via `Intl`), `calendar-context.ts`, `actions/calendar.ts` (join/open/
  consumeSpin/getState + CRUD dashboard), `calendar-reminders.ts` (cron rappel +
  archivage), `calendar-spin-bundle.ts` (`loadCalendarSpinBundles`),
  `resend.ts` (email rappel), caisse unifiée `source: 'calendar'`
  (`lookupRedeemCode` route 6 préfixes), cron `vercel.json`
  `/api/cron/calendar-reminders` (`15 9 * * *`).
- **Frontend** : `/calendar/[slug]` (page suivable, grille de cases) + manifest
  PWA, dashboard `src/app/dashboard/calendar/*`, `calendar-theme.ts` (5 thèmes
  carton neutre/noël/anniversaire/soldes/festival), `calendar-tracker.tsx`.
- **4 types de case** `content` / `lot` (`CADEAU-…` stock fini) / `spin` (tour
  de roue offert, ADR-029) + récompense d'assiduité finale ; stock fini
  OBLIGATOIRE (ADR-031).
- **Invariants (2 neufs)** : gating temporel SERVEUR-AUTORITATIF
  (`open_calendar_box` : `now()` base vs `unlock_at` dérivé serveur, ouvrir en
  avance impossible) ; non-fuite du contenu d'une case non ouverte (quadruple
  défense : `calendar_public_state` sans contenu + mapper null + `too_early` muet
  + RLS). Rate-limit ADR-032 strict (clé partagée jamais failClosed).
- **Revue finale** : prêt pour la prod, 0 finding bloquant. FAIBLE anti-spoiler
  corrigé (`5c4d89f`) : le préchargement révélait dans le payload RSC les lots
  des roues de cases `spin` de jours VERROUILLÉS (invariant strict NON cassé,
  spoiler réel) → préchargement limité aux cases DÉJÀ ouvertes + bundle renvoyé
  par `openCalendarBox`.
- **CI** : `calendar.test.sql` (pgTAP) + `e2e/calendar.spec.ts` (grille + axe).
  775 tests. Vérifs CI-only (Docker absent local) : pgTAP, E2E, seed.
- Migration `20260728120000`, ADR-035.
- **Points ouverts (résidus assumés, docs/bugs.md)** : UUID `dayIds` futurs
  exposés mais neutralisés par `too_early` muet ; purge RGPD conditionnée à
  l'archivage (opt-in commerçant, borné par `data_retention_months`).
  **Suites ouvertes** : multi-commerces sur un même calendrier, calendriers
  hebdo/mensuels.

## Jalon précédent : Mode événement en direct (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `ad80a59` DB, `22796c0` backend, `f749fe6` frontend,
`e39a40c` E2E + fix pseudo) :
- **Module** addon `addon_events` : animation LIVE synchronisée à 3 interfaces —
  écran public `/event/[code]/screen`, téléphone joueur `/event/[code]`
  (pseudo+avatar), télécommande orga `/dashboard/events/[id]/remote`.
- **Moteur question générique** quiz/sondage/prono ; séparation CONTENU
  (`event_games`/`questions`/`options`) et RUN (`event_sessions`/`players`/
  `answers`/`wins`) ; machine à états SERVEUR (phase `lobby→…→ended`, transitions
  RPC `is_org_editor`).
- **Invariants** : non-fuite de la bonne réponse (4 défenses, `is_correct` hors
  `event_public_state` avant reveal) ; scoring SERVEUR-autoritatif (`elapsed_ms`
  serveur, verrou homogène). **Transport** : polling primaire sur
  `event_public_state` + Realtime ping-only activable (`EVENTS_REALTIME_ENABLED`)
  — 1re brique temps réel. Podium + lot `EVENT-` stock fini (ADR-031) ; ADR-032
  strict sur join/submit (Wi-Fi bar).
- **Revue sécurité** : déployable SANS bloquant. FAIBLE pseudo Cc/Cf corrigé.
  MOYEN sybil podium (borné stock fini) + INFO = tradeoffs V1 assumés (bugs.md).
- Migration `20260727120000`, ADR-034. 713 tests, CI verte.
- **Points ouverts** : suites V2 (blind test/bingo/roue géante/team battle,
  tirage parmi participants, Turnstile anti-sybil, activation Realtime prod).

## Jalon précédent : Jackpot collectif (prod-ready) ✅
**Date** : 2026-07-23
**Contenu** (commits `13eb81c` DB, `fbb2c3c` backend, `03bc7bd` frontend,
`1292b16` E2E, `45f704c` + `624224f` fixes sécurité) :
- **DB** (migration `20260726120000_jackpot_collective.sql`) : addon
  `addon_jackpot` (miroir `addon_loyalty`) ; 4 tables jackpot_campaigns /
  _players / _participants / _wins (FK composites tenant, RLS complète, aucun
  accès anon, écritures joueur via RPC service-role). Jauge PARTAGÉE
  `current_count` (+1/participation). RPC `record_jackpot_participation` (tout
  atomique sous verrou de campagne : mode, cooldown, +1 jauge, tirage),
  `run_jackpot_date_draws` (pg_cron), `current_jackpot_code` (TOTP comptoir),
  `redeem_jackpot_prize` (caisse, miroir redeem_loyalty_reward),
  `purge_expired_jackpot_players` (RGPD, conserve les hashes de tirage).
- **Backend** : `jackpot-context.ts` (page suivable, résolution id|slug, lecture
  seule), `jackpot-checkin.ts` (jeton de check-in HMAC, domaine
  `jackpot-checkin:`), `jackpot.ts` (`mapJackpotParticipation`),
  `actions/jackpot.ts`, cron `/api/cron/jackpot-draws`, caisse unifiée
  `source: 'jackpot'`.
- **Frontend** : `/jackpot/[id]` (page suivable PWA, jauge temps réel, montant
  cosmétique croissant, bloc commerçant), `manifest.webmanifest` par campagne,
  écran comptoir `/dashboard/jackpot/[id]/comptoir`, dashboard
  `/dashboard/jackpot` + `[id]`, éditeur, bouton caisse, back-office addon.
- **Anti-triche** réutilisé du Passeport (ADR-030) : `validation_mode`
  `rotating_code`/`staff`, cooldown par joueur ≥ 300 s. Économie ADR-031 :
  `reward_stock` FINI et OBLIGATOIRE, `unique(campaign_id, cycle)` → 1 gagnant
  par cycle. **3 modes de tirage** : `threshold_draw` / `rescan_win` /
  `date_draw`. Tirage atomique + vérifiable (`draw_seed`, `gen_random_bytes`).
- **Fixes sécurité (2 bloquants)** : CRITIQUE-1 — code du gagnant fuité au
  déclencheur du seuil en `threshold_draw` → réservé au gagnant, 2 couches
  (`case when v_is_winner` SQL + `code: isWinner ? … : null` app) ; ÉLEVÉ-1 —
  `date_draw` re-tirait à chaque cron → clôture ONE-SHOT (cycle figé), campagne
  laissée `active` pour la récupération asynchrone du code.
- **CI** : `jackpot.test.sql` (pgTAP, sections 12-13 pour les 2 régressions) +
  `e2e/jackpot.spec.ts` (page suivable : affichage + axe + 404) ;
  `security_acl.test.sql` étendu ; EXPECTED_MIGRATION bumpé.
**ADR** : 033 (jauge partagée, tirage atomique/équitable/vérifiable, 3 modes,
réutilisation anti-triche + verrous économiques, date_draw one-shot, RGPD hashes
de tirage conservés).
**Verdict sécurité** : prêt pour la prod, 2 bloquants corrigés et vérifiés.
**Points ouverts (limites V1 assumées, docs/bugs.md)** : scans post-`date_draw`
incrémentent la jauge cosmétique sans gain ; stock résiduel d'un `date_draw`
non distribué. **Suites ouvertes** : multi-commerces sur une même jauge
(multi-tenant croisé) ; état « tirage effectué » sur la page publique ; stopper
les participations après `draw_at`.

## Jalon précédent : Passeport de fidélité ludique (GA, production) ✅
**Date** : 2026-07-22 → 2026-07-23 (GA)
**Contenu** (commits `5a4e1de`→`5ba06a1`, 8 revues sécurité) :
- **DB** (migrations `20260725120000`→`20260725200000`) : addon `addon_loyalty` ;
  tables loyalty_programs / _milestones / _members / _stamps / _rewards
  (FK composites tenant, RLS is_org_member/editor, secret du code tournant
  service-role-only) ; RPC `record_loyalty_stamp` (tampon atomique sous verrou :
  mode, cooldown, niveau, paliers → lot `FIDELITE-…` ou grant de spin),
  `current_loyalty_code` (code TOTP comptoir), `consume_loyalty_spin_grant`
  (grant → tirage atomique sur roue cible, `source='loyalty'`),
  `redeem_loyalty_reward` (remise caisse), `purge_expired_loyalty_members`
  (RGPD, borne sur la dernière activité).
- **Backend** : `loyalty-context.ts`, `loyalty-checkin.ts` (jeton de check-in
  HMAC TTL 3 min), `actions/loyalty.ts`, caisse unifiée `source: 'loyalty'`.
- **Frontend** : `/passeport/[programId]` (tampons, niveau, paliers, spin
  offert), écran comptoir, éditeur commerçant, dashboard, back-office addon.
- **Durcissement GA** (8 revues, chaque fix révélant le défaut sous le
  précédent) : QR staff bearer 180 j → jeton de check-in signé TTL 3 min ;
  rejeu → planchers de cooldown durcis (staff 300 s, rotating
  `max(2 × période, 300 s)`) ; seaux kill-switch → 3 DoS avant fermeture par
  clé d'identité + retrait ; frappe de masse → verrous économiques (stock fini
  obligatoire + palier ≥ 2) ; palier spin non borné → stock fini aussi sur spin
  + exclusion du lot illimité + vérif de campagne ; `select("*")` éditeur
  (aurait 404) ; action Turnstile récupération pronos ; contraste a11y
  paliers/tampons.
- **CI** : `loyalty.test.sql` (pgTAP) + `e2e/loyalty.spec.ts` ;
  `security_acl.test.sql` étendu ; garde-fou CI « tout pgTAP exécuté » (`383c675`).
**ADR** : 028 (addon + récompense mixte), 029 (spin offert = grant à usage
unique), 030 (2 modes, limites fermées avant GA), 031 (bornes économiques :
stock fini + palier ≥ 2), 032 (règle rate-limit : aucun failClosed sur clé
partagée en parcours public).
**Verdict sécurité** : GA, 0 finding bloquant ; perte maximale bornée ≈ 150 €.
**Points ouverts** :
- Dette rate-limit PRÉEXISTANTE hors module (`hunt:scan:ip`, `hunt:claim:ip`,
  `prono:*`, `spin:ip` — seaux failClosed sur clé partagée, disponibilité
  seule) : **en cours dans un chantier séparé** (autre agent), non résolue ici
  (ADR-032, docs/bugs.md).
- Résiduels FAIBLE : grants de spin injouables dont `reward_claimed_count`
  n'est pas restitué (sous-distribution, pas de faille) ; UX du transfert de
  coût d'un tour offert gagnant vers la campagne ciblée.

## Jalon précédent : Chasse au trésor multi-QR ✅
**Date** : 2026-07-22
**Contenu** (8 commits `f5525df`→`88db5bc`) :
- **DB** (`20260724120000_treasure_hunts.sql`) : addon `addon_hunts` ;
  tables hunts / hunt_steps / hunt_players / hunt_scans / hunt_completions
  (FK composites tenant, RLS is_org_member/editor, audit) ; RPC
  `record_hunt_scan` (scan atomique sous verrou : tampon idempotent, ordre,
  délai, complétion + code `CHASSE-…` + stock), `redeem_hunt_completion`
  (remise caisse), `purge_expired_hunt_players` (RGPD).
- **Backend** : `hunt-context.ts` (contexte public étape→chasse→joueur,
  gardes inter-tenant, `hasHuntsAccess`), `actions/hunts.ts` (CRUD éditeur,
  `stampHuntStep` au POST anti-prefetch, `claimHuntReward` email optionnel à
  usage unique), caisse unifiée `lookupRedeemCode` → `CashierMatch` par
  `source`, `redeemHuntCompletion`.
- **Frontend** : `/hunt/[token]` (carnet de tampons, indices, complétion +
  rappel email), éditeur commerçant (`hunt-editor`, réordonnancement,
  affiches QR par étape), bouton caisse chasse, back-office addon.
- **Sécurité** : revue passée — 1 ÉLEVÉ corrigé (claim email à usage unique,
  `88db5bc`), 1 MOYEN corrigé (rate-limit scan IP partagée) ; 4 INFO
  consignés FAIBLE (docs/bugs.md).
- **Fix routage caisse** (`e1dea3a` saisie, `46d8868` scanner) :
  `normalizeRedeemCode` préfixait de force en `GAIN-` → branche chasse morte.
- **CI** : `hunts.test.sql` (pgTAP) + `automation.test.sql` rebranché
  (`842d7e3`) + `e2e/hunt.spec.ts` (`06937f5`).
**ADR** : 023 (addon + lot direct), 024 (claim email usage unique),
025 (rate-limit scan IP partagée), 026 (pas de géoloc / délai minimal),
027 (V1 mono-organisation).
**Vérifié** : typecheck, lint, 385 tests, build — vert localement.
**Reste pour la CI** : pgTAP et E2E Playwright (Docker absent localement).
**Points ouverts** : 4 INFO FAIBLE (token CHECK 8 vs 16, webhook newsletter
non émis au claim chasse, contention verrou scan, réordonnancement chasse
pleine) ; suites produit (multi-commerçants partenaires, mini-jeux d'étape,
récompenses intermédiaires, défaut délai > 0).

## Jalon précédent : Accessibilité volet 2 ✅
**Date** : 2026-07-21 (commits `ce2eb78`, `bc9615c`, `028717d`)
- **Contraste auto des labels de roue** : `src/lib/contrast.ts`
  (luminance/ratio WCAG), `labelColor: "auto"` — défaut des styles
  vierges uniquement, hex existants intacts — calcul par segment dans
  `wheel-svg.tsx`, case « Contraste auto » + avertissement < 3:1 dans
  le Studio.
- **Lien d'évitement** : `src/components/ui/skip-link.tsx`, posé sur
  landing, dashboard, `/play/[slug]` et `/pronos/[slug]`
  (`<main id="contenu" tabIndex={-1}>`).
- **axe-core dans Playwright** : `@axe-core/playwright`, helper
  `e2e/axe.ts` (échec serious/critical, moderate/minor loggées, zéro
  règle exclue) ; scans intégrés aux specs player-win, pronostics,
  roles + spec dédiée `e2e/a11y.spec.ts` pour la landing.
- **Vraies violations corrigées au passage** (`bc9615c`) : 3 contrastes
  `bg-k-green` sur la landing (texte passé à 4.59:1) + `aria-label` sur
  l'input code du poste caisse.
**Vérifié** : 338 tests, build OK (local).
**Point ouvert** : premier run CI des scans axe à surveiller (E2E non
exécutés localement, Docker absent). Le bloc accessibilité de l'audit
est désormais entièrement traité (docs/roadmap.md).

## Jalon précédent : Quick wins maintenabilité & accessibilité ✅
**Date** : 2026-07-21 (commits `a5fc2cb`, `b7db502`)
- **Types Supabase générés** : snapshot `src/types/database.generated.ts`
  commité (`npm run types:generate`, source `--linked`) + garde CI
  anti-dérive dans le job `database-security` (régénération `--local` +
  `git diff --exit-code -I 'PostgrestVersion'`).
  **Nouveau réflexe dev : migration → `npm run types:generate` → commit,
  sinon CI rouge.** `database.ts` manuel conservé (en-tête ajouté),
  migration progressive vers les types générés (roadmap).
- **A11y roue** : `prefers-reduced-motion` → spin 4400→300 ms, 1 tour,
  easing linéaire, hook matchMedia sans mismatch d'hydratation
  (`play-experience.tsx`, prop `reducedMotion` de `wheel-svg.tsx`).
  Carte à gratter vérifiée non concernée.
- **A11y onglets Player Hub** : WAI-ARIA Tabs complet (roving tabIndex,
  ArrowLeft/Right avec wrap, Home/End, focus suit la sélection) ; helper
  pur `src/components/pronos/tab-nav.ts` + 8 tests.
**Vérifié** : qa-verify vert — 324 tests, build OK.
**Suite** : règles de « refactoring opportuniste » consignées dans
docs/roadmap.md (découpage des gros fichiers au fil de l'eau, avatars
lazy, axe-core en E2E, items reportés en arbitrage produit).

## Jalon précédent : V1.6 — Pronostics avancé + Automatisations commerçant ✅
**Date** : 2026-07-21
**Contenu** (5 commits `69f158f`→`bc3f60b` + fix sécurité en cours de commit) :
- **DB** (`20260723100000` + `20260723110000`) : ligues privées
  (contest_leagues/members, RPC create/join/leave, leaderboard/rank avec
  `p_league_id` re-numéroté 1..n) ; budget/programmation de campagne
  (imputation atomique dans claim_winning_spin, pause auto,
  run_campaign_schedule en pg_cron SQL direct */10 min) ; alerte stock
  (trigger réarmé au restock) ; automation_settings + email_log
  (dedup_key unique) ; newsletter_subscribers.birth_date ; 4 RPC de
  ciblage service-role ; pgTAP automation.test.sql ;
  EXPECTED_MIGRATION=20260723110000.
- **Backend pronos** : addContestMatches (lot 1..30 tout-ou-rien),
  route publique /api/pronos/[slug]/tv (top 30 sans PII, s-maxage=30,
  fail-open), actions ligues (rate limits dédiés fail-closed).
- **Backend automatisations** : jobs automation.budget-paused/low-stock/
  run-scenarios, cron /api/cron/automations 09:30 (idempotent par
  org+jour), src/lib/automations.ts, 6 emails Resend (transactionnel vs
  marketing List-Unsubscribe), claimPrize avec double consentement
  anniversaire (13..120 ans).
- **UI** : saisie rapide + progression + page TV + onglet Ligues ;
  page /dashboard/settings/automations, carte Programmation et budget,
  bannières budget_reached/schedule_end, seuil stock, case 🎂 dans le
  claim-form.
- **Sécurité** : revue non bloquante, 0 critique/élevé ; MOYEN corrigé
  (garde owner/editor sur updateCampaignAutomation et
  resumeCampaignAfterBudget) ; 2 FAIBLE assumés → docs/bugs.md.
**ADR** : 018 (budget au claim), 019 (anniversaire double consentement),
020 (rangs de ligue), 021 (reengage/inactive), 022 (TV fail-open).
**Vérifié** : typecheck 0 erreur, lint 0 warning, Vitest 316/316, build OK.
**Reste pour la CI** : pgTAP (supabase test db) et 73 E2E Playwright
(Docker absent localement ; --list OK). Chevauchement reengage/inactive :
arbitrage produit ouvert (ADR-021).

## Jalon précédent : V1.2 — réglages de jeu par campagne ✅
**Date** : 2026-07-07 (nuit)
**Contenu** :
- Les actions d'engagement se configurent désormais **par campagne**
  (page campagne, carte « Actions avant de jouer ») — plus dans Réglages.
- Nouvelle carte « Après le gain » par campagne : demander email et/ou
  téléphone avant d'afficher le code (ou rien → code direct, participation
  anonyme), compte à rebours optionnel (10-600 s) avant masquage du code.
- `claimPrize` revalide les exigences côté serveur ; participation avec
  email/prénom nullable + colonne phone ; email de gain envoyé seulement
  si email collecté ; export CSV avec téléphone.
**Migration à appliquer en prod** : `00004_campaign_play_settings.sql`
(après la 00003 ; recopie la config org existante sur les campagnes puis
supprime organizations.engagement).
**Vérifié** : build ✓, lint ✓, 26 tests ✓.

## Jalon précédent : V1.1 — retours du premier déploiement ✅
**Date** : 2026-07-07 (soir)
**Contenu** : app déployée en prod par l'utilisateur (Supabase + Stripe +
Vercel opérationnels, « tout fonctionne »). Trois évolutions livrées suite
aux premiers tests réels :
1. **Email de gain fiabilisé** — logs détaillés `[resend]` (variable
   manquante, id d'envoi, erreur exacte) + guide de dépannage README.
   Cause la plus probable côté prod : env vars Resend absentes de Vercel
   ou domaine non vérifié (mode test = envoi uniquement au propriétaire).
2. **Actions d'engagement pré-spin** — newsletter / Instagram / TikTok /
   avis Google, configurables par le commerçant (Réglages), gate côté
   joueur, revalidation serveur, table `newsletter_subscribers` + export
   CSV, traçabilité `spins.engagement_action`.
3. **Essai 7 jours** (au lieu de 14) — `organizations.trial_ends_at`,
   gating : essai expiré = QR codes toujours créables mais campagnes non
   activables et roues publiques désactivées. Bannières dashboard
   (jours restants / essai terminé). Checkout Stripe : reprend les jours
   d'essai restants (pas de réarmement).
**Migration à appliquer en prod** : `00003_engagement_and_trial.sql`.
**Vérifié** : build ✓, lint ✓, 26 tests unitaires ✓.

## Jalon précédent : V1 MVP complète ✅
**Date** : 2026-07-07
**Contenu** : les 11 étapes du plan V1 sont livrées, vérifiées
(build/lint/15 tests unitaires/tests SQL RLS) et poussées sur
`claude/project-template-init-gvkmn5`.

### Critères de succès du /goal
- [x] Architecture propre (plan validé puis implémenté)
- [x] Base de données bien conçue (8 tables, RLS, fonctions atomiques)
- [x] Authentification sécurisée (Supabase SSR + proxy)
- [x] Système multi-tenant (organization_id partout + RLS testée)
- [x] Dashboard administrateur (5 sections)
- [x] Roue entièrement configurable (lots, poids, stocks, couleurs)
- [x] Parcours utilisateur complet (scan → roue → formulaire → gain)
- [x] Génération de QR Code (PNG téléchargeable + compteur)
- [x] Stripe fonctionnel (checkout, webhook, sync, gating)
- [x] Déployable sur Vercel (guide README ; nécessite les clés services)

## Prochain jalon suggéré : Pilote réel
1. Provisionner Supabase/Stripe/Resend (15 min, guide README)
2. Déployer sur Vercel
3. Tester le parcours complet en conditions réelles
4. Premier commerce pilote → alimenter la roadmap V1.1

## Historique
- 2026-07-06 : Initialisation projet (docs + mémoire)
- 2026-07-06→07 : Développement V1 complet (11 étapes, 1 commit/étape)
