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
| Repartir d'une base vide en staging | ⬜ | procédure, jamais exécutée |
| Appliquer les 65 (désormais 74) migrations | ⬜ | idem |
| Exécuter les 16 (désormais 20) suites pgTAP | ⬜ | **impossible en local** — ni Docker ni CLI Supabase ; seul le job CI `database-security` fait autorité |
| Exécuter tous les E2E sur Chromium et WebKit | ⬜ | non lancés depuis le chantier |
| Doc de production obsolète (33 migrations / 262 tests) | ✅ | `docs/production-readiness.md` rafraîchi |
| **Snapshot `src/types/database.generated.ts` régénéré** | ⬜ | **BLOQUANT CI** : le snapshot date du 25/07 11h36, les 9 migrations de 14h47–14h49. Le job « Types TypeScript — dérive schéma vs snapshot » échouera. Régénération impossible ici (ni Docker ni CLI Supabase) — à faire sur une machine qui les a, via `npm run types:generate` |
| **Dette reconduite** | ⚠️ | les 9 migrations neuves sont datées `2026-08-05`, **encore dans le futur** — exactement le reproche de l'audit. Le script n'impose que la monotonie |

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
| **Migration des cookies existants** | ⬜ | les cookies par expérience cohabitent toujours ; aucun plan de bascule |

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

| Tâche | État | Preuve / reste |
|---|---|---|
| Socle SQL | ✅ | `20260805200000_meta_progression.sql` (1 713 l.), **14 tables** : missions (+ versions, progression, contributions), collections (+ items), badges (+ badges joueur), coffres (+ items, ouvertures), saisons (+ saisons joueur), items joueur |
| Cycle de vie des saisons | ✅ | `20260805210000_meta_progression_lifecycle.sql` (1 566 l., `bf2c3d3`) : clôture / archivage / suppression, édition et suppression **bornées au brouillon**, sel serveur `progression_chests.loot_seed`, `progression_engine_failures` |
| Durcissement sécurité | ✅ | `20260805220000_meta_progression_hardening.sql` (1 380 l., `3174cbd`) : suites de la revue GO conditionnel |
| Missions multi-jeux | 🟡 | le **moteur** progresse depuis les 9 expériences via le trigger `apply_meta_progression_event()` sur `experience_events` ; la **visibilité** au joueur ne couvre que la roue (`/play/[slug]`) — pas les 14 jeux rapides, ni passeport/calendrier/quiz/chasse/jackpot/événement |
| Collections et badges | ✅ | lus/écrits par les 27 RPC, panneau joueur |
| Clés et coffres | ✅ | ouverture via RPC, sel serveur sur le tirage, invariant **non monétaire** (aucun `reward_issuances`, aucune colonne `*_cents`, vérifié par grep inverse) |
| Pass saisonnier | ✅ | clôture définitive (aucune réactivation), archive joueur incluant les saisons échues non closes |
| **Backend** | ✅ | `src/lib/meta-progression.ts`, `src/actions/meta-progression.ts` — **27 RPC exposées**, 9e RPC de purge au cron `purge-data`, sonde SLO dans `src/lib/admin/ops.ts` |
| **UI** | ✅ | éditeur `/dashboard/progression`, panneau joueur greffé au parcours public existant `/play/[slug]` (aucune nouvelle surface publique) |
| Interrupteur d'arrêt | ✅ | `set_progression_mission_enabled` / `set_progression_chest_enabled`, seul geste autorisé sur une saison lancée |
| Tests | ✅ | 1 303 tests unitaires, pgTAP 799 assertions (293 + 506), `e2e/progression.spec.ts` — **pgTAP et E2E jamais exécutés** (Docker inatteignable sur cette machine) |
| Parcours personnalisés | ⬜ | non entamé, hors périmètre — aucune des 14 tables ne le porte |
| Validation d'achat (POS / ticket) | ⬜ | non entamé, hors périmètre |
| Défis entre équipes | ⬜ | non entamé, hors périmètre |
| Campagnes réseau | ⬜ | non entamé, hors périmètre |

---

## Ce qui reste, par ordre de valeur

1. **Basculer la caisse sur le moteur unique** (item 4) — sans quoi le registre reste un miroir.
2. **Terminer l'identité** (item 5) — magic link et récupération de progression, dépendance des missions.
3. **Prouver la DB** (item 2) — pgTAP + E2E + replay staging. Rien n'a été exécuté contre un vrai Postgres.
   La cause est désormais confirmée structurelle (Docker exige un build Windows
   ≥ 19045, cette machine est figée en LTSC 2021 / 19044) — la seule preuve
   praticable passe par la CI, donc par une PR.
4. **Résorber la dette d'architecture** (items 8 et 9) — découpage des 6 gros fichiers, 53 casts.
5. **Limites anti-fraude par appareil** et rate limits partagés (item 12).
6. **Étendre la visibilité de la méta-progression** au-delà de la roue — les
   missions progressent déjà depuis les 14 jeux rapides, le passeport, le
   calendrier, le quiz, la chasse, le jackpot et l'événement live, mais le
   panneau joueur n'est affiché que sur `/play/[slug]`.

**Fait depuis l'établissement de ce backlog** : ~~UI des blueprints (item 11)~~ —
la galerie de modèles est branchée sur `/dashboard/discover`. ~~Brancher la
méta-progression (item 13)~~ — livré le 2026-07-26 (ADR-044, roadmap V1.18),
**mais non poussé**.
