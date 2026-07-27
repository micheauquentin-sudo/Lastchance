# Backlog de l'audit 3 — état réel, point par point

**Source** : `src/app/Audit 3.txt` (258 lignes, reçu le 2026-07-25).
**Méthode** : chaque puce de l'audit devient une ligne de ce tableau. L'état est
constaté dans le code, pas déclaré : chaque ligne « fait » cite le fichier, la
migration ou la RPC qui la prouve.

**Légende** : ✅ fait · 🟡 partiel · ⬜ à faire

**Vérifications au moment de l'établissement de ce backlog** : typecheck ✓,
lint ✓, 1223 tests unitaires ✓, 5 gardes CI neuves ✓. pgTAP et E2E **non
exécutés** (ni Docker ni CLI Supabase en local) — c'est le trou de vérification
qui traverse tout ce document.

**Mise à jour au 2026-07-26** (chantier méta-progression, item 13, ADR-044,
commits `8a4324f` → `793100a`) : typecheck ✓, lint ✓, **1303 tests unitaires ✓**
(83 fichiers), pgTAP **799 assertions** (293 `meta_progression.test.sql` + 506
`security_acl.test.sql`), **jamais exécutées** (même trou, cause structurelle
désormais confirmée : Docker exige un build Windows ≥ 19045, cette machine est
figée en LTSC 2021 / 19044 pour toute sa durée de vie). 77 migrations,
`EXPECTED_MIGRATION` = `20260805220000`, `migrations:check` vert. **Fait
nouveau, vérifié à la CLI Supabase** (`supabase migration list --linked`) : la
production porte toutes les migrations jusqu'à `20260804120000` incluse — les
mentions « application non revérifiée » qui traînaient sur `20260801120000`,
`20260802120000`, `20260803120000` et `20260804120000` sont closes.

**Mise à jour au 2026-07-27 — le trou pgTAP/E2E est comblé pour cette
branche** : la branche a été poussée et une **PR #29** ouverte spécifiquement
pour obtenir la preuve que Docker ne permettait pas en local. 13 passages CI
plus tard : **PR entièrement verte (6/6 jobs)**, **22/22 suites pgTAP,
1 781 assertions, E2E verts, 1 304 tests unitaires, snapshot de types à
jour**. L'exécution a trouvé **8 défauts réels** qu'aucune relecture n'avait
vus (fonctions SQL inappelables via `pg_catalog.coalesce`/`greatest`/`least`,
ambiguïté de colonne dans `resolve_player_identity`, le registre universel
des récompenses qui mettait son veto sur les tables legacy, une RPC Stripe
rendant deux lignes, une pagination Stripe non gérée, un contraste a11y sous
le seuil AA sur le bouton `danger` partout dans le produit, un harnais E2E
Stripe désaligné, une suite pgTAP sans contexte d'appel) — détail dans
`docs/bugs.md`.

**Mise à jour au 2026-07-27 (suite) — ce constat « E2E verts » est dépassé,
noir sur blanc.** Le bloc `describe.serial` « méta-progression — cycle de vie
complet » (`e2e/progression.spec.ts`) a été réactivé (`a8c31c7`) puis observé
**instable sur six passages CI consécutifs** : l'échec se déplace d'un
passage à l'autre (titre de saison, collection, objet, mission,
réactivation, coffre) avec un code identique. **Décision du client
(`ba0cdbf`) : garder ce test ACTIF et rouge plutôt que de le neutraliser.**
La **PR #29 reste donc rouge sur ce seul point**, tous les autres jobs verts
(22/22 pgTAP, 1 804 assertions, 1 304 tests unitaires). Ce n'est pas un
défaut applicatif (le module reste prouvé par pgTAP, contrôle négatif
inclus, et ce parcours est passé intégralement plusieurs fois) mais la
longueur de la chaîne de test (treize étapes serveur en série sur un seul
projet). Correction juste identifiée mais non faite ici : semer la
configuration de saison en base, ne faire porter l'E2E que sur les
comportements d'écran. Détail complet dans `docs/bugs.md` (Medium Priority).
**Deux erreurs personnelles** ont aussi été commises et
corrigées : `router.refresh()` créant le blocage qu'il prétendait résoudre
(annulé), et une sur-généralisation de sélecteur E2E à quatre noms sur la
preuve d'un seul. **Fait produit majeur** : l'item 5 ci-dessous est
**requalifié de dette en prérequis** de l'item 13 — voir ADR-045.
Reste : le trou pgTAP/E2E « jamais exécuté » n'est comblé que pour ce qui a
tourné dans cette PR ; toute nouvelle migration hors de cette branche repart
sans preuve locale tant que Docker reste inatteignable sur cette machine.

**Mise à jour au 2026-07-27 (suite), `a963583`** : la cause posée par
ADR-045 pour l'item 5 est **corrigée** — juste dans l'effet (aucune mission
ne progressait depuis la roue), fausse dans la cause (« les deux systèmes
d'identité ne se rencontrent jamais »). La résolution `player_id` depuis
`player_legacy_identities` existait déjà et fonctionnait, dans
`append_experience_event_internal`. La vraie cause : `resolve_player_identity`
insère l'adhésion avant la ligne de pont (FK composite), et c'est le trigger
de l'adhésion qui portait le rattrapage — il lisait un pont pas encore écrit.
Rattrapage décalé d'une visite entière, pas absent. Corrigé par un trigger
`AFTER INSERT` sur `player_legacy_identities`
(`20260805230000_experience_identity_backfill.sql`), qui corrige au passage
un second défaut trouvé en mesurant (source `direct` dégradée en `unknown`
au premier passage). `supabase test db` → 1 804 assertions PASS (1 781
avant), contrôle négatif concluant. **L'item 5 passe de prérequis à traité.**
Le test `e2e/progression.spec.ts` reste néanmoins en `test.fixme` — non
réactivé dans ce chantier.

**Second chantier du 2026-07-27, `1cf46cf`** : troisième défaut
d'accessibilité réel de la branche (après le bouton `danger` et le texte
secondaire), celui-ci en production — `.play-in`, seule animation d'entrée
de `/play` absente du bloc `prefers-reduced-motion: reduce`, faisait
traverser une zone de contraste sous le seuil AA à tout le petit texte de
l'écran pendant 450 ms, pour tous les joueurs (pas seulement ceux en
mouvement réduit). Corrigé : classe ajoutée au bloc, opacité de départ
`0 → 0.75`, jeton `--color-k-muted`, contournement JS retiré. Voir ADR-046.

---

## 1. Décalage horaire sur les jackpots

| Tâche | État | Preuve / reste |
|---|---|---|
| Interpréter toutes les dates avec `organization.timezone` | ✅ | `src/lib/date-time.ts` propagé à `actions/{calendar,campaigns,hunts,jackpot,pronostics}.ts`, `api/cron/automations` et 5 pages |
| Créer une fonction commune `zonedDateTimeToIso` | ✅ | `src/lib/date-time.ts:120` |
| Afficher explicitement le fuseau dans les formulaires | 🟡 | Présent sur l'éditeur jackpot (« Heure de l'établissement ») — **à propager** aux éditeurs calendrier, chasse, pronostics, campagnes |
| Tester le passage heure d'été / hiver | ✅ | 4 cas DST dans `src/lib/date-time.test.ts` |
| Traiter les heures inexistantes ou ambiguës | ✅ | couvert par les mêmes tests |
| Couvrir tirages, verrouillages, débuts, fins, automatisations | 🟡 | tirages / verrouillages / bornes faits ; **relecture à faire** sur les automatisations récurrentes |

## 2. Validation complète des migrations

| Tâche | État | Preuve / reste |
|---|---|---|
| Identifiant de migration > head actuel | ✅ | `scripts/check-migration-order.mjs` (368 l.) |
| Script CI qui vérifie cet ordre | ✅ | job dédié dans `.github/workflows/ci.yml`, comparaison via `MIGRATION_BASE_REF` |
| Ne jamais renommer une migration déployée | ✅ | contrôle d'immutabilité dans le même script |
| Repartir d'une base vide en staging | ⬜ | procédure, jamais exécutée localement — mais chaque run CI de la PR #29 repart d'une base vide |
| Appliquer les 65 (désormais 77) migrations | ✅ | prouvé par la PR #29 : `migrations:check` + application complète en CI, 22/22 suites pgTAP passées dessus |
| Exécuter les 22 suites pgTAP | ✅ | **2026-07-27, PR #29, 13 passages CI** : 22/22 suites, 1 781 assertions — impossible en local (ni Docker ni CLI Supabase en mode `--local`), le job CI `database-security` a fait autorité comme prévu |
| Exécuter tous les E2E sur Chromium et WebKit | 🟡 | **2026-07-27, PR #29** : verts sur les deux moteurs lors des 13 premiers passages, traces publiées en artefact (`a3e135a`). **Depuis la réactivation du bloc `describe.serial` de `e2e/progression.spec.ts` (`a8c31c7`) : instable sur six passages consécutifs.** Écrite et exécutable, PAS stable — décision client de la garder active et rouge plutôt que de la neutraliser (`ba0cdbf`). Détail : docs/bugs.md |
| Doc de production obsolète (33 migrations / 262 tests) | ✅ | `docs/production-readiness.md` rafraîchi |
| **Snapshot `src/types/database.generated.ts` régénéré** | ✅ | régénéré et commité (`48fa440`), récupéré depuis l'artefact CI `database-generated-types` publié par `792f2a3` — seul chemin praticable en l'absence de Docker/CLI Supabase locaux |
| **Dette reconduite** | ⚠️ | les migrations `20260805*` restent datées dans le futur relatif au moment de leur écriture — le script n'impose que la monotonie, pas une date passée |

## 3. Activation réelle des workers

| Tâche | État | Preuve / reste |
|---|---|---|
| Contrôle bloquant de présence des secrets | ✅ | `scripts/verify-production-health.mjs` + workflow `production-health.yml` |
| Test de bout en bout de la file de jobs | 🟡 | sonde `ops_workers_health` en place ; **pas de test E2E** de la file |
| Alerte sur l'âge du plus ancien job | ✅ | notion de `stale` dans `20260805120000_worker_operations.sql` |
| Alerte sur le dernier passage des crons | ✅ | même migration |
| Bouton admin de test sans effet métier | ✅ | `src/components/admin/worker-probe-button.tsx` + `admin/(protected)/monitoring/actions.ts` |

## 4. Registre universel des récompenses — le chantier majeur

| Tâche | État | Preuve / reste |
|---|---|---|
| Table `reward_issuances` (17 colonnes) | ✅ | `20260805150000_universal_rewards.sql` (879 l.) |
| Moteur unique `redeem_reward_by_code(...)` | ✅ | RPC créée, appelée depuis 2 fichiers |
| Contrôle de l'organisation | ✅ | 51 occurrences d'`organization_id` — scoping systématique |
| Contrôle du rôle | ✅ | présent |
| Expiration | ✅ | `expires_at` (27 occurrences) |
| Annulation | ✅ | `cancelled_at` (29 occurrences) |
| Rédemption concurrente | 🟡 | **à prouver** par pgTAP (verrou non vérifié par exécution) |
| Décrémentation / restauration de stock | 🟡 | colonnes présentes, **restauration à l'annulation non vérifiée** |
| Journal d'audit | 🟡 | une seule référence — **à renforcer** |
| Automatisations | ⬜ | aucun branchement trouvé |
| Wallet | ✅ | `wallet_status` (11 occurrences) |
| Analytics | ✅ | trigger `track_reward_issuance_analytics` |
| Migration progressive (nouvelles récompenses d'abord) | ✅ | miroirs/synchro par triggers depuis les tables historiques, aucune réécriture globale |
| **Bascule réelle de la caisse sur le moteur** | ⬜ | l'encaissement tourne toujours sur les **9 chemins** existants ; le registre est alimenté mais pas encore la source de vérité |

## 5. Identité joueur unifiée

| Tâche | État | Preuve / reste |
|---|---|---|
| Un seul cookie opaque `lc-player` | ✅ | `src/lib/player-identity.ts` |
| Table centrale `players` | ✅ | `20260805140000_player_identity.sql` (719 l.) |
| `player_devices` avec rotation des jetons | ✅ | RPC `rotate_player_device` |
| Adhésions séparées par organisation et expérience | ✅ | scope vérifié par `assert_player_experience_scope` |
| Séparation stricte entre organisations | ✅ | même garde |
| Consentement explicite avant rapprochement nominatif | ✅ | hérité de la politique PII existante |
| Liaison email facultative par magic link | ⬜ | **absent** |
| Récupération de progression (multi-appareils) | ⬜ | `lookup_player_identity` existe mais **n'est jamais appelée** |
| **Migration des cookies existants** | ✅ | **traité le 2026-07-27** (`a963583`). La cause posée par ADR-045 était erronée : la résolution `player_id` depuis `player_legacy_identities` existait déjà et fonctionne (`append_experience_event_internal`, `20260805160000:382-393`). La vraie cause était un **ordre d'écriture** — `resolve_player_identity` insère l'adhésion avant la ligne de pont (FK composite), or c'est le trigger de l'adhésion qui portait le rattrapage, et il lisait un pont pas encore écrit : rattrapage décalé d'une visite entière, pas absent. Correctif : trigger `AFTER INSERT` sur `player_legacy_identities` (`20260805230000_experience_identity_backfill.sql`), posé là où la correspondance devient vraie, indépendant de l'ordre côté serveur. Corrige aussi un second défaut trouvé en mesurant : `v_source`/`v_qr_code_id` étaient NULLifiés sur non-correspondance (source `direct` dégradée en `unknown` à chaque premier passage). Preuve : `supabase test db` → **1 804 assertions PASS** (contre 1 781), contrôle négatif (migration retirée → 8 assertions tombent). Voir ADR-045 (addendum de correction) |

## 6. Événements live — charge

| Tâche | État | Preuve / reste |
|---|---|---|
| Souscription Supabase Realtime côté client | ✅ | `src/components/event/use-event-poll.ts:141` — c'est précisément ce que l'audit disait introuvable |
| Numéro de révision à chaque transition | ✅ | `20260805130000_event_realtime_revision.sql`, révision monotone, aucun incrément sur réponses/scores |
| Recharger l'état uniquement après notification | ✅ | coalescence à 2,5 s, garde anti-révision forgée |
| Polling de secours adaptatif (2,5 s ↔ 30 s) | ✅ | `EVENT_POLL_MAX_MS = 30_000`, bascule selon l'état de la souscription |
| Ralentissement exponentiel en cas d'erreur | 🟡 | **à vérifier** — seul le palier connecté/déconnecté est visible |
| Calculer ou mettre en cache le classement | 🟡 | notion de classement présente dans `security_equity` ; **cache non confirmé** |
| Tester 100 / 500 / 1 000 participants | ⬜ | aucun test de charge |
| Définir une capacité par offre commerciale | ✅ | `event_participant_capacity` + `snapshot_event_participant_capacity` |

## 7. Statistiques communes

| Tâche | État | Preuve / reste |
|---|---|---|
| Les 9 événements métier | ✅ | `EXPERIENCE_EVENT_NAMES` dans `src/lib/experience-analytics.ts` |
| Enregistrement côté serveur, hors PostHog | ✅ | alimentation **par triggers** (`track_experience_activity`, `track_experience_completion`, `track_event_session_completion`, `track_player_experience_membership`, `track_reward_issuance_analytics`) — indépendant du consentement analytics |
| Dimensions (expérience, QR, organisation, joueur anonymisé, date, campagne, récompense, panier) | 🟡 | table `experience_events` + métadonnées validées (`is_safe_experience_metadata`) ; **couverture dimension par dimension à auditer** |
| Nouveau tableau de bord | ✅ | `ExperienceAnalytics` branché dans `src/app/dashboard/page.tsx:174` |
| Les 7 questions commerciales | 🟡 | agrégat `org_experience_analytics` en place ; **toutes les questions ne sont pas encore répondues** (coût moyen d'un gain, CA associé, points d'abandon) |
| Purge / rétention | ✅ | `purge_expired_experience_events` |

## 8. Architecture de développement

| Tâche | État | Preuve / reste |
|---|---|---|
| Contrat commun `ExperienceDefinition` | ✅ | `src/platform/experiences/contract.ts`, 9 `ExperienceKind`, catalogue + adaptateurs |
| Structure `platform/` | 🟡 | `platform/experiences` existe ; `identity`, `rewards`, `redemption`, `eligibility`, `stock`, `analytics`, `notifications` **restent dans `src/lib/`** |
| Structure `features/<experience>/` | ⬜ | inexistante |
| Découper les gros fichiers | ⬜ | **aucun découpage** : pronostics 2 272 l. (2 185 à l'audit — la dette a **augmenté**), participations 1 686, quiz-editor 1 677, quiz-experience 1 625, quiz 1 522, loyalty 1 333 |
| Actions serveur minces | ⬜ | non entamé |

## 9. Types Supabase

| Tâche | État | Preuve / reste |
|---|---|---|
| Interdire les nouveaux `as unknown as` | ✅ | `scripts/check-unsafe-casts.mjs` + `unsafe-casts-baseline.json` (dette gelée) |
| Typer les clients Supabase avec le `Database` généré | 🟡 | `src/lib/supabase/client.ts` fait ; **`server.ts` et `admin.ts` non** |
| Utiliser `Tables<>` et les types RPC générés | ⬜ | non entamé |
| Supprimer les doubles définitions | ⬜ | `src/types/database.ts` reste le miroir principal |
| Résorber la dette | ⬜ | **53 `as unknown as`** subsistent |

## 10. Produit et monétisation

| Tâche | État | Preuve / reste |
|---|---|---|
| Site marketing à jour | ✅ | `site/src/content/{features,pricing}.ts`, `site/src/app/tarifs/page.tsx` |
| Droits issus des items de souscription Stripe | ✅ | `20260805170000_subscription_entitlements.sql` + `apply_stripe_subscription_event_v2` + pgTAP dédié |
| Protection contre l'écrasement manuel | ✅ | `protect_stripe_managed_entitlements` |
| Offres par objectifs (Core / Engagement / Live / Full) | 🟡 | modèle de droits en place ; **le packaging commercial reste à arbitrer** |
| Navigation : seulement les expériences actives | ✅ | `src/components/dashboard/nav.tsx:165` filtre sur `EXPERIENCE_CATALOG` |
| Galerie « Découvrir » pour les modules inactifs | ✅ | `src/app/dashboard/discover/page.tsx` |

## 11. ExperienceBlueprint universel

| Tâche | État | Preuve / reste |
|---|---|---|
| Champs du blueprint (kind, schema_version, configuration, assets, default_rewards, publication_status, created_by, published_version) | ✅ | `20260805180000_experience_blueprints.sql` (849 l.), 3 tables |
| Versions publiées immuables | ✅ | trigger `protect_experience_blueprint_version` |
| Application transactionnelle | ✅ | `apply_experience_blueprint_version` |
| Contrôle de compatibilité de schéma | ✅ | `supportedSchemaVersions` par adaptateur + `is_valid_experience_blueprint_payload` |
| Aperçu avant application | ✅ | `previewBlueprintVersion` |
| Retour arrière | ✅ | `restore_experience_blueprint_version` |
| Création de nouveaux secrets à l'instanciation | 🟡 | **à vérifier** adaptateur par adaptateur |
| Modèles pour quiz, chasse, calendrier, fidélité, événement, pronostics | 🟡 | 6 adaptateurs supportés ; **campagne, jackpot et parrainage explicitement non portables en V1** |
| Server actions | ✅ | `src/actions/experience-blueprints.ts` — **corrigé le 2026-07-25** (13 erreurs de typage, contexte éditeur non narrowé) |
| **Interface utilisateur** | ✅ | section « Mes modèles d'expérience » sur `/dashboard/discover` : création depuis les 6 modèles de départ, aperçu, publication, application en brouillon, restauration. Les 4 wrappers de formulaire redirigeaient déjà vers cette page — il ne manquait que la section. Décisions d'affichage isolées dans `experience-blueprint-state.ts` et couvertes par 12 tests |
| **pgTAP** | ⬜ | pas de suite dédiée |

## 12. Sécurité et équité

| Tâche | État | Preuve / reste |
|---|---|---|
| Alias générés ou filtre de grossièretés | ✅ | `upsert_player_alias`, `player_alias_is_allowed`, `normalize_player_alias`, `src/lib/player-alias.ts` |
| Bannissement / modération pendant les événements | ✅ | `moderate_event_player`, `keep_moderated_event_score_zero` |
| Détection des scores physiquement impossibles | ✅ | `detect_impossible_answer_elapsed` |
| Règle économique centrale (stock, valeur max distribuable) | ✅ | `apply_economic_distribution_policy`, `assert_economic_policy_scope` |
| Date de naissance trop précise | ✅ | `minimize_newsletter_birth_date` |
| Temps de départ signé par le serveur | ✅ | acquis du chantier quiz (chronomètre inforgeable), étendu aux événements |
| Turnstile à la première inscription | 🟡 | widget touché ; **couverture réelle à confirmer** hors quiz |
| Limites par appareil, compte et campagne | ⬜ | aucune trace dans la migration |
| Sybil multi-cookie sur événements et quiz | 🟡 | l'identité unifiée est la fondation ; **exploitation anti-Sybil pas encore branchée** |
| Rate limits `failClosed` partagés (Wi-Fi public) | ⬜ | non traité — voir le **résidu M2 de V1.17** (une saisie nue en caisse consomme 9 jetons), correctif écrit mais non commité |
| Expiration / annulation / restauration de stock sur **toutes** les récompenses | 🟡 | garanti par le registre universel, mais tant que la caisse n'y bascule pas, les 9 sources gardent leurs règles |

## 13. Méta-progression

**Mise à jour 2026-07-26** : branché de bout en bout. Commits `8a4324f` →
`793100a` (16 commits), ADR-044, roadmap V1.18. **NON POUSSÉ** — `origin` ne
connaît pas la branche.

**Mise à jour 2026-07-27** : branche poussée, **PR #29 verte (6/6 jobs)**
après 13 passages CI incluant 8 correctifs (commits `7f8ef49` → `c131340`,
détaillés dans docs/bugs.md). **Fait produit corrigé le même jour** : l'item
5 (« migration des cookies existants »), un temps requalifié en prérequis
bloquant de cet item (ADR-045), est **traité** depuis `a963583` — la cause
initiale (« les deux systèmes d'identité ne se rencontrent jamais ») était
fausse ; la vraie cause était un ordre d'écriture, corrigée par un trigger
`AFTER INSERT` sur `player_legacy_identities`. **La méta-progression
progresse désormais dès le premier tour de roue**, y compris pour un joueur
neuf sans pont préexistant. Voir ADR-045 (addendum) et l'item 5 ci-dessus.

**Mise à jour 2026-07-27 (suite)** : ce « 6/6 jobs » ne tient plus. Le bloc
`describe.serial` de `e2e/progression.spec.ts` (réactivé par `a8c31c7`) s'est
révélé **instable** (échec qui se déplace d'un passage CI à l'autre, sur six
passages consécutifs). Le client a choisi de le **garder actif et rouge**
plutôt que de le neutraliser (`ba0cdbf`) : **la PR #29 est désormais rouge
sur ce seul point**, tous les autres jobs verts. Ne pas présenter cette
couverture E2E comme close — elle est écrite et exécutable, pas stable.
Détail : docs/bugs.md (Medium Priority).

| Tâche | État | Preuve / reste |
|---|---|---|
| Socle SQL | ✅ | `20260805200000_meta_progression.sql` (1 713 l.), **14 tables** : missions (+ versions, progression, contributions), collections (+ items), badges (+ badges joueur), coffres (+ items, ouvertures), saisons (+ saisons joueur), items joueur |
| Cycle de vie des saisons | ✅ | `20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`) : clôture / archivage / suppression, édition et suppression **bornées au brouillon**, sel serveur `progression_chests.loot_seed`, `progression_engine_failures` |
| Durcissement sécurité | ✅ | `20260805220000_meta_progression_hardening.sql` (1 380 l., `3174cbd`) : suites de la revue GO conditionnel |
| Missions multi-jeux | 🟡 | le **moteur** est branché sur `experience_events` via `apply_meta_progression_event()` mais **ne progresse PAS depuis la roue** : `experience_started`/`experience_completed`, émis par le spin, ne portent qu'un `player_key`, jamais `player_id` — le moteur renonce à sa première garde (0 ligne en base, mesuré). Requalifié en prérequis item 5 (ADR-045). La **visibilité** au joueur, elle, ne couvre que la roue (`/play/[slug]`) — pas les 14 jeux rapides, ni passeport/calendrier/quiz/chasse/jackpot/événement |
| Collections et badges | ✅ | lus/écrits par les 27 RPC, panneau joueur |
| Clés et coffres | ✅ | ouverture via RPC, sel serveur sur le tirage, invariant **non monétaire** (aucun `reward_issuances`, aucune colonne `*_cents`, vérifié par grep inverse) |
| Pass saisonnier | ✅ | clôture définitive (aucune réactivation), archive joueur incluant les saisons échues non closes |
| **Backend** | ✅ | `src/lib/meta-progression.ts`, `src/actions/meta-progression.ts` — **27 RPC exposées**, 9e RPC de purge au cron `purge-data`, sonde SLO dans `src/lib/admin/ops.ts` |
| **UI** | ✅ | éditeur `/dashboard/progression`, panneau joueur greffé au parcours public existant `/play/[slug]` (aucune nouvelle surface publique) |
| Interrupteur d'arrêt | ✅ | `set_progression_mission_enabled` / `set_progression_chest_enabled`, seul geste autorisé sur une saison lancée |
| Tests | 🟡 | 1 304 tests unitaires, pgTAP 799 assertions (293 + 506), `e2e/progression.spec.ts` — **exécutés le 2026-07-27 via PR #29** : 22/22 suites pgTAP (1 804 assertions au total, Docker restant inatteignable sur cette machine, seule la CI a pu les lancer). **E2E : instable**, pas vert — le bloc `describe.serial` « cycle de vie complet » échoue de façon mobile sur six passages consécutifs, gardé actif et rouge par décision client (`ba0cdbf`), voir docs/bugs.md |
| Parcours personnalisés | ⬜ | non entamé, hors périmètre — aucune des 14 tables ne le porte |
| Validation d'achat (POS / ticket) | ⬜ | non entamé, hors périmètre |
| Défis entre équipes | ⬜ | non entamé, hors périmètre |
| Campagnes réseau | ⬜ | non entamé, hors périmètre |

---

## Ce qui reste, par ordre de valeur

1. **Basculer la caisse sur le moteur unique** (item 4) — sans quoi le registre reste un miroir.
2. **Item 5 — la migration des cookies existants (le blocage de progression)
   est traitée** depuis `a963583` (2026-07-27, ADR-045 addendum) : la
   méta-progression progresse dès le premier tour de roue. Reste sur cet
   item, hors blocage : magic link (⬜) et `lookup_player_identity` toujours
   jamais appelée pour la récupération multi-appareils (⬜).
3. **Prouver la DB** (item 2) — ✅ largement fait pour la branche `chantier/audit-3`
   via la PR #29 (22/22 pgTAP, types régénérés). **E2E : écrits et exécutables,
   mais instables** sur le bloc « cycle de vie complet » — pas à présenter
   comme clos (docs/bugs.md). Reste : fusionner sur `main`, fiabiliser ce bloc
   E2E par un seed en base (roadmap V1.18), et reproduire la preuve pour tout
   futur chantier qui n'ouvrirait pas de PR — la cause reste structurelle
   (Docker exige un build Windows ≥ 19045, cette machine est figée en LTSC
   2021 / 19044), seule la CI fait
   autorité.
4. **Résorber la dette d'architecture** (items 8 et 9) — découpage des 6 gros fichiers, 53 casts.
5. **Limites anti-fraude par appareil** et rate limits partagés (item 12).
6. **Étendre la visibilité de la méta-progression** au-delà de la roue — les
   missions progressent déjà en base depuis les 14 jeux rapides, le passeport,
   le calendrier, le quiz, la chasse, le jackpot et l'événement live (à
   vérifier module par module que chacun pose bien `player_id`, ce que la
   roue ne fait PAS — item 2 ci-dessus), mais le panneau joueur n'est affiché
   que sur `/play/[slug]`.

**Fait depuis l'établissement de ce backlog** : ~~UI des blueprints (item 11)~~ —
la galerie de modèles est branchée sur `/dashboard/discover`. ~~Brancher la
méta-progression (item 13)~~ — livré le 2026-07-26 (ADR-044, roadmap V1.18),
poussé et **prouvé vert en CI le 2026-07-27** (PR #29, ADR-045 pour le
défaut d'identité découvert au passage, corrigé le même jour par `a963583` —
voir addendum ADR-045), toujours non fusionné sur `main`. ~~Item 5, migration
des cookies existants~~ — traité le 2026-07-27 (`a963583`) : trigger
`AFTER INSERT` sur `player_legacy_identities`.
