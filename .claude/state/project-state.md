# Project State — Lastchance

## Statut
**Phase** : bêta privée — V1 + Studio créatif + Pronostics enrichi
(ligues, TV, saisie rapide) + Automatisations commerçant (V1.6) +
Chasse au trésor multi-QR (V1.7) + Passeport de fidélité (V1.8, GA prod) +
Jackpot collectif (V1.9, prod) + Mode événement en direct (V1.10, prod) +
Calendrier de l'Avent & campagnes quotidiennes (V1.11, prod) +
Parrainage ludique (V1.12, prod) +
Jeux rapides (V1.13, vague 1 et vague 2 en prod) +
Pronostics génériques (V1.14, poussé sur `origin/main` le 2026-07-25 ; application de
la migration `20260801120000` non revérifiée) +
**Place de marché de campagnes (V1.15, construit et validé — NON POUSSÉ / NON DÉPLOYÉ)**
**Dernière mise à jour** : 2026-07-25
**Branche** : main (production Vercel, plan Hobby ; 5 commits locaux non poussés —
`ed50271` → `4457b20`, la place de marché de campagnes)

## Dernier chantier : Place de marché de campagnes (2026-07-25, NON POUSSÉ / NON DÉPLOYÉ)
Demande client : le commerçant doit pouvoir partir d'un MODÈLE au lieu de configurer une
campagne de zéro. **10 modèles** — Saint-Valentin, Halloween, Noël, ouverture de boutique,
anniversaire, match de football, fête des Mères, happy hour, soldes, lancement de produit —
chacun portant **7 promesses** : le visuel, le jeu, les textes, les récompenses suggérées,
les emails, la durée, les règles.
**3 arbitrages tranchés par le client** : (1) **catalogue Lastchance EN CODE** (versionné
avec l'app) **+ modèles PRIVÉS** qu'un commerçant enregistre depuis sa propre campagne,
visibles de sa SEULE organisation — **pas de place de marché partagée entre commerçants**
(écartée : modération, isolation du contenu publié, propriété des visuels ; projet à part) ;
(2) **appliquer un modèle = créer une campagne EN BROUILLON complète** (le commerçant relit,
ajuste, active lui-même) ; (3) **emails fournis en TEXTES, jamais activés**.
**DB** (`20260802120000_campaign_templates.sql`) : table `campaign_templates` (modèles privés
uniquement) — `name` unique par organisation, `description`, `blueprint jsonb` (**objet** et
**borné à 32 Ko** ; la FORME n'est PAS contrainte en base pour suivre l'évolution des jeux),
`source_campaign_id`, `created_by` posé par trigger depuis la session. Isolation : policy
unique `campaign_templates: editors` (`for all`, `is_org_editor`), **FK COMPOSITE**
`(source_campaign_id, organization_id) → campaigns(id, organization_id)` (sans le couple, un
éditeur pouvait faire pointer son modèle sur la campagne d'une AUTRE organisation),
`organization_id` hors du **grant UPDATE** (un éditeur de deux organisations ne peut pas
déplacer un modèle), aucune policy `anon`/`public`. pgTAP `campaign_templates.test.sql` avec
une **SENTINELLE** qui échoue si une policy venait à citer `anon`/`public`.
**Backend** : `src/lib/campaign-templates.ts` (module PUR — type `CampaignBlueprint`,
`blueprintToDraft`, les 10 modèles ; durée RELATIVE en jours, jamais de date absolue),
`src/lib/validations/campaign-templates.ts` (Zod — la base ne garantit que « objet jsonb
≤ 32 Ko », la FORME est validée là, dans les DEUX chemins),
`src/actions/campaign-templates.ts` (`applyCampaignTemplate`, `saveCampaignAsTemplate`,
`deleteCampaignTemplate`).
**Frontend** : galerie SERVEUR en deux sections (« Modèles Lastchance » / « Mes modèles »,
jamais un catalogue commun), aperçu des 7 promesses en **lecture DÉFENSIVE** (un blueprint
d'une version antérieure s'affiche en dégradé au lieu de casser la page), enregistrement
d'une campagne comme modèle et suppression. Les blueprints ne traversent pas le réseau.
**LES 3 INVARIANTS D'INNOCUITÉ** (le cœur du design, vérifiés sur l'ACTION — seul endroit qui
écrit — et mutation-testés) :
1. **BROUILLON INERTE** : `status: 'draft'` ET `auto_schedule: false`, ce dernier verrouillé
   au niveau du TYPE (littéral `false`). Sans lui, le cron `run_campaign_schedule()` (10 min)
   faisait passer la campagne `draft → active` dès `starts_at` : **un modèle appliqué se
   serait publié tout seul**. Le schéma Zod ne comporte AUCUN champ
   `status`/`auto_schedule`/`starts_at`/`ends_at` — un blueprint privé trafiqué ne peut pas
   les forcer (testé).
2. **AUCUN ENVOI** : `automation_settings`, `enqueueJob` et `@/lib/resend` sont ABSENTS du
   chemin ; jeu de tables visitées FIGÉ ; un modèle enregistré part avec `emails: []`.
3. **MULTI-TENANT** : organisation et rôle issus de la session (owner|editor) ; modèle privé
   lu avec le client de SESSION (donc sous RLS) + filtre organisation explicite ; **aucun
   `createAdminClient`** (sentinelle de test).
**Revue sécurité GO, 0 bloquant — 1 MOYEN corrigé (`4457b20`)** : le blueprint recopie
`wheels.skill_config`, donc les SECRETS des jeux de défi (mot mystère, nombre cible, ordre du
puzzle) ; la policy de lecture ouverte à `is_org_member` les faisait passer d'« éditeurs
seulement » à « toute l'équipe, **CAISSIERS compris** » — un caissier pouvait lire le
blueprint via l'API REST avec son propre jeton et réussir systématiquement le défi (gain borné
par ADR-031), avec en effet de bord poids, stocks, `cost_cents` (la marge) et budget. → Policy
unique `campaign_templates: editors`, miroir de `campaigns: editors` ; pgTAP INVERSÉ (le
caissier ne lit rien, même ciblé par id) + assertion dédiée à la non-fuite du secret +
contre-épreuve éditeur ; `campaign_templates` rejoint l'audit RLS central
`security_acl.test.sql`. INFO corrigé : `budget_cents` en `min(1)` (le CHECK SQL exige `> 0`).
**QA** : 29 tests d'action (invariants BROUILLON et INNOCUITÉ mutation-testés :
`auto_schedule: true` → 11 rouges, filtre organisation retiré → 2 rouges), E2E
`e2e/campaign-templates.spec.ts` (modèle → brouillon, preuve prise sur l'ÉTAT réel et non sur
un message) ; typecheck ✓, lint ✓, 1021 tests ✓.
Fichiers clés : `supabase/migrations/20260802120000_campaign_templates.sql`,
`supabase/tests/campaign_templates.test.sql`, `src/lib/campaign-templates.ts`,
`src/lib/validations/campaign-templates.ts`, `src/actions/campaign-templates.ts`,
`src/components/dashboard/campaign-template-gallery.tsx`, `campaign-template-preview.ts`,
`campaign-template-actions.tsx`, `save-campaign-as-template.tsx`,
`src/app/dashboard/campaigns/page.tsx`, `e2e/campaign-templates.spec.ts`.
EXPECTED_MIGRATION `20260802120000`. Commits `ed50271` (DB), `c433b49` (catalogue + backend),
`fd50d97` (galerie), `eea434b` (tests + E2E), `4457b20` (correctif de revue).
**⚠️ NON POUSSÉ / NON DÉPLOYÉ — seul chantier du projet dans cet état** : les 5 commits sont
LOCAUX et la migration `20260802120000` n'est pas appliquée en production.
ADR-039, roadmap V1.15.
**Points ouverts : pousser et déployer (migration + code) ; 6 résidus assumés — un blueprint
PRIVÉ peut décrire une roue sans lot perdant (le catalogue respecte ADR-031, testé ;
auto-préjudice, aucun effet inter-tenant), application NON transactionnelle (brouillon
orphelin possible, même patron que `createCampaign`, sans effet jouable), ni quota ni
rate-limit sur les deux actions (aligné sur `createCampaign`), secret de défi DUPLIQUÉ dans le
blueprint (confidentialité portée par la seule policy éditeurs), capture de la seule roue
principale, « Utiliser ce modèle » visible pour un caissier qui ne peut pas l'appliquer.
Vérifs CI-only (Docker absent) : pgTAP, E2E, seed.**

## Chantier précédent : Pronostics au-delà du sport (2026-07-24, poussé le 2026-07-25)
Demande client : le moteur de pronostics cesse d'être football-centré. Il doit servir
à tout événement à résultat — cérémonie, Eurovision, élection interne/associative,
remise de prix, compétition d'entreprise, concours culinaire, finale d'émission,
tournoi local, course, e-sport — sur le modèle `événement → questions prédictives →
date de verrouillage → résultat → barème → classement → récompenses`. **Le football
devient un MODÈLE PRÉCONFIGURÉ, pas le cœur technique.**
**3 arbitrages tranchés par le client** : (1) **4 types de questions** —
`score` (2 camps = le foot historique, inchangé), `choice` (choix unique), `ranking`
(ordre du top N), `number` (estimation) ; (2) **football + 10 modèles** préconfigurés ;
(3) **verrouillage PAR QUESTION, avec date par défaut au niveau de l'événement**.
**DB** (`20260801120000_generic_contests.sql`) : `contests` gagne `event_kind` (défaut
`football`, forme `^[a-z][a-z0-9_]{1,39}$` — ajouter un modèle ne demande AUCUNE
migration), `default_locks_at`, `scoring` jsonb étendu. `contest_matches` devient le
**REGISTRE DE QUESTIONS** (`question_type` défaut `score`, `prompt`, `options`,
`correct_answer`, `ranking_size`, `locks_at` ; colonnes football conservées comme socle
du type `score`). `contest_predictions` : scores NULLABLE + `answer jsonb`. Nouvelles
RPC `submit_contest_answer`, `set_contest_question_result`,
`update_contest_generic_scoring`, `update_contest_event_settings` ; validateurs de forme
en base ; barème par type en SQL (`contest_generic_points`, `contest_scoring_points`).
pgTAP `generic_contests.test.sql`.
**Backend** : miroir TS strict du barème (`src/lib/pronostics.ts` : `scoreAnswer`,
`effectiveLocksAt`), validations Zod par type, actions questions/réponses/résultat,
`publicCorrectAnswer` = **point de sérialisation UNIQUE** de la bonne réponse (rien ne
sort avant `finished`).
**Frontend** : création d'événement typée (`event_kind`, `default_locks_at`), réglages
de verrouillage éditables après création (événement reporté, audités), constructeur de
questions typées (`contest-questions.tsx`), saisie du résultat par type, parcours joueur
générique, `ranking-picker.tsx`. **11 modèles + `custom`**
(`contest-event-kinds.ts` : `football`, `ceremony`, `eurovision`, `election`,
`remise_prix`, `entreprise`, `culinaire`, `emission`, `tournoi`, `course`, `esport`) avec
questions suggérées et barème conseillé — **aucune option factice n'est écrite** (les
listes de candidats/nommés/équipes restent saisies par le commerçant, les exemples sont
de simples `placeholder`). Synchro du fournisseur de calendriers réservée au football
(double verrou `event_kind === DEFAULT_EVENT_KIND` ET compétition du catalogue).
**RÈGLE DE VERROUILLAGE PAR TYPE** (cœur du chantier) :
`score → coalesce(locks_at, kickoff_at)` /
`générique → coalesce(locks_at, default_locks_at, kickoff_at)`, posée dans les **4
fonctions SQL** (`contest_is_locked`, `submit_contest_prediction`,
`submit_contest_answer`, `set_contest_question_result`) ET dans le miroir TS
`effectiveLocksAt` ; champ masqué en UI pour le football.
**Revue sécurité NO-GO conditionnel → corrigé (`f3c5752`)** : GO franc sur le volet
générique (verrouillage serveur-autoritatif sérialisé sous `for update`, non-fuite du
résultat sur point de passage unique, validation de forme en base, multi-tenant,
ADR-032). Blocage sur la NON-RÉGRESSION football — **E1 (ÉLEVÉ)** : le backfill
`locks_at = kickoff_at` figeait la fenêtre à l'instant de la migration alors que
`contest-sync.ts` ne met à jour que `kickoff_at` → au premier match REPORTÉ (routine,
cron) les pronostics se fermaient silencieusement sur un match non joué, message
trompeur ; un match AVANCÉ aurait laissé la base accepter un pronostic pendant la
rencontre. **Fix** : backfill SUPPRIMÉ, `locks_at` reste NULL, repli sur `kickoff_at`
qui suit les reports par construction. **M1 (MOYEN)** : `default_locks_at` primait sur
`kickoff_at` pour tous les types → une date par défaut fermait d'un coup tout un
championnat importé. **Fix** : jamais appliquée à une question `score` (règle ci-dessus)
+ champ masqué en UI. Tests pgTAP « match reporté / avancé / date par défaut ignorée »
+ 5 tests TS. QA verte.
Fichiers clés : `supabase/migrations/20260801120000_generic_contests.sql`,
`supabase/tests/generic_contests.test.sql`, `src/lib/pronostics.ts`,
`src/lib/validations/pronostics.ts`, `src/actions/pronostics.ts`,
`src/lib/pronostics-context.ts`, `src/components/dashboard/contest-event-kinds.ts`,
`contest-questions.tsx`, `new-contest-form.tsx`, `contest-settings.tsx`,
`src/components/pronos/contest-experience.tsx`, `ranking-picker.tsx`,
`e2e/pronostics-generic.spec.ts` (+ seed `E2EPRONO3`).
EXPECTED_MIGRATION `20260801120000`. Commits `4973736` (DB), `9a5d496` (backend),
`3c29354` (création typée + réglages), `6df7570` (frontend), `7d879b7` (10 modèles),
`f3c5752` (correctifs revue E1/M1 côté SQL+TS), `4513699` (E2E + seed), `f09ee89`
(volet UI du même correctif M1 : le champ « verrouillage par défaut » est masqué sur le
modèle football — `new-contest-form.tsx` / `contest-settings.tsx`).
**Poussé le 2026-07-25** : les 8 commits sont présents sur `origin/main` (ils étaient
LOCAUX au 2026-07-24) ; l'application effective de la migration `20260801120000` en
production n'a pas été revérifiée. ADR-038, roadmap V1.14.
**Points ouverts : confirmer l'application de la migration en production ; 6 résidus
assumés — M2
(`update_contest_event_settings` peut ROUVRIR une question dont `locks_at` est NULL, en
déplaçant `default_locks_at` avec motif audité ; atténué : l'UI écrit toujours
`locks_at`, une question résolue reste fermée, auto-traitement sur son propre tenant),
I1 (`scoreAnswer`/`scorePrediction` sans appelant prod — miroir de test, parité SQL↔TS
vérifiée ligne à ligne), départage d'ex æquo par PALIER et non par TYPE (impact seulement
sur un événement mixte), I2 (`number_tolerance` décimal ignoré au calcul, non
atteignable), I4 (nouvelles RPC hors `security_acl.test.sql`), I5 pré-existant
(`tiebreaker_answer` chargé dans le contexte public, jamais transmis au client).
Fragilité E2E PRÉ-EXISTANTE hors chantier : `e2e/pronostics.spec.ts:40` (locator
page-wide `/Enregistré|Modifier/` ambigu avec le bouton « Modifier » permanent du hub
joueur). Vérifs CI-only (Docker absent) : pgTAP, E2E, seed.**

## Chantier antérieur : Jeux rapides — moteur de tirage partagé + skill-gated (2026-07-24, prod)
Formalise le point d'extension `wheels.game_type` (V1.4 : roue et grattage partagent
déjà `spinWheel`/`perform_atomic_spin`/`claimPrize`) en SOCLE et l'étend à 13 nouveaux
jeux, en 2 vagues. Principe « ajouter un jeu = ajouter une interface » : éligibilité,
probabilités, lots, stocks, réclamation, statistiques, thème, consentement, partage,
caisse et Wallet restent mutualisés et INCHANGÉS.
**VAGUE 1 — 7 jeux de RÉVÉLATION (EN PROD)** : `flip_card`, `cups`, `slot`, `memory`,
`chest`, `dice`, `draw_card`. Migration `20260730120000_quick_games_reveal.sql`
(extension `wheels_game_type_check`). Socle client `game-shell.tsx` (`<GameShell>`)
EXTRAIT du grattage : factorise idle/gagné/perdu/bloqué + spin/réclamation/partage/
captcha/analytics/thèmes. Chaque jeu = `games/<jeu>-reveal.tsx` (animation) +
`<jeu>-experience.tsx` (~12 l.). **SERVEUR-AUTORITATIF** : le lot vient de `spinWheel`
(décidé serveur), l'interaction (gobelet/coffre/carte, dé, memory) ne fait que RÉVÉLER
l'`outcome` — cosmétique, aucun poids au client. Revue sécurité vague 1 : GO 0 bloquant.
**Déployée** (migration `20260730120000` en prod).
**VAGUE 2 — 6 jeux de DÉFI *skill-gated* (EN PROD)** : `rps`, `reflex`,
`gauge`, `puzzle`, `mystery_word`, `estimate`. Migration
`20260731120000_quick_games_skill.sql` : `game_type` étendu ; colonne
`wheels.skill_config jsonb` (SECRETS `mystery_word.word`/`estimate.target`/
`estimate.tolerance`/`puzzle.order` SERVER-ONLY, jamais sérialisés) ;
`perform_atomic_spin` recréée en **7-args** avec `p_force_losing boolean default false`
(corps normal identique au correctif 42702 `20260720150500` → zéro régression). Moteur
backend à **2 temps** (`src/lib/skill.ts` + `src/actions/skill.ts`) :
`startSkillChallenge` présente le défi (vue publique `SkillChallengePublic` sans secret,
`toPublicChallenge` strippe) + jeton HMAC domaine-séparé `skill-challenge:` (repli
`SPIN_TOKEN_SECRET`, lié device/campagne/roue/gameType/seed), aucun tirage ;
`submitSkillChallenge` vérifie jeton+identité device, ÉVALUE le défi CÔTÉ SERVEUR
(rps : coup serveur dérivé HMAC, égalité=échec ; mystery_word : égalité normalisée ;
estimate : |x−cible|≤tolérance ; puzzle : ordre vérifié ; reflex/gauge : réussite
*client-reported*), puis `perform_atomic_spin(p_force_losing => !succeeded)` (réussite→
tirage normal, échec→spin perdant forcé). Participation/`play_limit` CONSOMMÉE dans les
2 cas (anti-brute-force). Socle client `skill-game-shell.tsx` (2 temps) +
`games/<jeu>-challenge.tsx` ; éditeur `wheel-settings.tsx` (sélecteur + sous-formulaire
« Réglages du défi », secrets marqués). Corrige aussi un manque vague 1 (`ac27384`) :
`updateWheel` refusait les nouveaux `game_type` (schéma limité wheel/scratch) → enum
complet.
**Invariant central** : le tirage est le PLAFOND (ADR-031) — un tricheur ne dépasse
jamais odds/stock configurés. **Revue vague 2 NO-GO→GO** (`8a3c60e`) : (ÉLEVÉ)
`spinWheel` ne gardait pas `game_type` → contournement du défi par appel direct, fermé
par garde `isSkillGameType` dans `spinWheelInner` avant tout tirage ; (MOYEN) sous
`play_limit=unlimited`, jeton rejouable + oracle `succeeded` → brute-force de secret,
fermé par `unlimited` INTERDIT sur jeux à secret + `succeeded` retiré de la réponse.
Sains : secrets jamais sérialisés (la page /play ne passe pas `skill_config`), jeton
HMAC lié device expirant, RLS/grants service_role, rate-limit ADR-032 (failClosed
device, IP fail-open observe). QA verte. EXPECTED_MIGRATION bumpé à `20260731120000`.
Fichiers clés : migrations `20260730120000`/`20260731120000`,
`src/components/wheel/game-shell.tsx`, `skill-game-shell.tsx`,
`src/components/wheel/games/*` (7×2 révélation + 6×2 défi), `src/lib/skill.ts`,
`src/actions/skill.ts`, `wheel-settings.tsx`. Commits `d957f46`→`5710641` (vague 1,
prod), `125eb99`→`8a3c60e` (vague 2, prod). ADR-037.
**Points ouverts : 3 résidus FAIBLE assumés (reflex/gauge *client-reported* bornés par
l'économie ; jeux à secret exigent `play_limit` borné ; verrouillage du défi sur erreur
transitoire au submit). Vérifs CI-only (Docker absent) :
pgTAP `quick_games_skill.test.sql`, E2E `skill-games.spec.ts`, seed.**

## Chantier du 2026-07-24 : Parrainage ludique (prod)
Nouveau module addon (`addon_referral`, miroir Calendrier, gating `hasReferralAccess`),
opt-in PAR CAMPAGNE (`referral_programs.enabled`) sur les campagnes ROUE : un joueur
satisfait devient PARRAIN (code partageable `PR-…` → lien `/play/[slug]?ref=PR-…`,
aucune nouvelle surface publique) ; chaque filleul qui vient JOUER un spin fait
progresser une jauge d'« équipe » PARTAGÉE et débloque des récompenses. **Preuve =
PARTICIPATION réelle, jamais un clic** : `validate_referral` (cœur anti-abus) exige un
`proof_spin_id` (spin réel du device filleul, non forgeable/non rejouable/unique),
appelé APRÈS le spin réel. **3 versements en CONFIG LIBRE** commerçant, chacun
`none`/`spin`/`lot` : parrain (par filleul validé) / filleul (bienvenue) / coffre
collectif au seuil (`chest_threshold`, défaut 3) ; `lot` = code `PARRAIN-…` STOCK FINI
(ADR-031), `spin` = tour offert (`consume_referral_spin_grant` → tirage
`spins.source='referral'` → flux de gain `GAIN-…`, ADR-029). « Équipe » = jauge
(`validated_count`) + coffre PARTAGÉS, débloqués une seule fois au seuil sous verrou,
PAS de classement (coopératif). **Anti-abus 100 % serveur borné par l'économie** :
self (device+email) et boucle directe A→B→A bloqués, 1 filleul/campagne/device, fenêtre
`window_days` + plafond `sponsor_max_filleuls` (cycles ≥3 non détectés mais bornés par
plafond+fenêtre+coût de N spins réels). Durcissements (`6d7bfba`) : no-oracle
(`rejected` unique côté action) + défense en profondeur (`referral_public_state`
re-gate addon/enabled/active). Rate-limit ADR-032 : failClosed clé device
(`referralPlayerAction`), IP fail-open observe (`referralPublicIp`). Caisse unifiée
`source: 'referral'` (7e préfixe `PARRAIN-`, `redeem_referral_reward` org-scopée/
auditée). Purge RGPD `purge_expired_referral_data` (neutralise les emails opt-in).
Identité device par `anonymousPlayerKey` (hash, aucune PII). V1 mono-organisation.
Fichiers clés : migration `20260729120000_referral.sql`, `src/lib/referral.ts`
(mappers), `src/lib/referral-context.ts`, `src/lib/validations/referral.ts`,
`src/actions/referral.ts` (ensureReferralSponsor, validateReferral, consumeReferralSpin,
getReferralState, saveReferralProgram), caisse `src/actions/participations.ts`,
`src/components/dashboard/referral-program-settings.tsx` (éditeur config libre) +
`referral-redeem-button.tsx`, `src/components/wheel/referral-panel.tsx` +
`referral-spin-experience.tsx` (branchés dans `play-experience.tsx`). Fix
`getUserAndOrg` (sélectionnait tous les addons sauf `addon_referral`).
EXPECTED_MIGRATION bumpé à `20260729120000`. **Revue sécurité GO SANS bloquant, QA
verte.** Commits `abf6204` (DB), `2ade1ed` + `f63dbf2` (backend), `757d0fb`
(frontend), `1f048b8` (E2E), `6d7bfba` (durcissements). **EN PRODUCTION.**
ADR-036. **Points ouverts : 3 résidus FAIBLE assumés (dédup email inerte post-spin ;
amplification ~3× en config spin+spin bornée par stock fini ; entropie code 40 bits) ;
suites produit (câblage email au claim, multi-commerces, parrainage sur autres
mécaniques).** Vérifs CI-only (Docker absent) : pgTAP `referral.test.sql`, E2E
`e2e/referral.spec.ts`, seed `PARRAIN-E2ECHEST`.

## Chantier du 2026-07-23 : Calendrier de l'Avent & campagnes quotidiennes (prod)
Nouveau module addon (`addon_calendar`, miroir Événement) : campagne QUOTIDIENNE à
mécanique ANNUELLE — le joueur revient chaque jour ouvrir UNE case (Avent, semaine
anniversaire, compte à rebours, 7 jours de cadeaux, festival, lancement produit,
semaine soldes), ou suit à distance via un rappel email opt-in. Page publique
suivable `/calendar/[slug]` installable (PWA, manifest par calendrier), 5 thèmes
carton (neutre/noël/anniversaire/soldes/festival). 4 types de case
(`calendar_days.kind`) `content` / `lot` (code `CADEAU-…` à stock fini) / `spin`
(tour de roue offert, grant à usage unique → `consume_calendar_spin_grant` →
tirage `source='calendar'` → flux de gain `GAIN-…`, ADR-029) + récompense
d'assiduité finale (toutes cases ouvertes → `CADEAU-…`). Stock fini OBLIGATOIRE
(ADR-031). **2 invariants neufs** confirmés par revue adversariale : gating
temporel SERVEUR-AUTORITATIF (`open_calendar_box` tranche `now()` base vs
`unlock_at` dérivé serveur — minuit civil du fuseau, DST-robuste via `Intl`,
`calendarDayUnlockAt` — ouvrir en avance impossible) ; non-fuite du contenu d'une
case non ouverte (quadruple défense : `calendar_public_state` sans contenu +
mapper null + `too_early` muet + RLS/grants). Caisse unifiée `source: 'calendar'`
(6 préfixes, `redeem_calendar_reward` couvrant case-lot ET assiduité), cron
`/api/cron/calendar-reminders` (`15 9 * * *`) + archivage, purge RGPD
`purge_expired_calendar_players`. Transport polling. Identité joueur par cookie
HTTP-only + hash (aucune PII). V1 mono-organisation. Fichiers clés : migration
`20260728120000`, `src/lib/calendar.ts` (+ `calendarDayUnlockAt`),
`src/lib/calendar-context.ts`, `src/lib/calendar-reminders.ts`,
`src/lib/calendar-spin-bundle.ts`, `src/actions/calendar.ts`, `/calendar/[slug]`
(+ manifest), `src/app/dashboard/calendar/*`,
`src/components/calendar/*` (dont `calendar-theme.ts`, `calendar-tracker.tsx`).
**Revue finale passée SANS bloquant** ; FAIBLE anti-spoiler corrigé (`5c4d89f`) :
le préchargement révélait dans le payload RSC les lots des roues de cases `spin`
de jours VERROUILLÉS (invariant strict de non-fuite NON cassé, mais spoiler réel)
→ préchargement limité aux cases DÉJÀ ouvertes + bundle renvoyé par
`openCalendarBox`. Commits `6b5e2aa` (DB), `7a13a25` (backend), `df63433`
(frontend), `d420fdd` (E2E), `5c4d89f` (fix). **En production.** ADR-035.
775 tests. **Points ouverts : résidus assumés (UUID `dayIds` futurs exposés mais
neutralisés par `too_early` muet ; purge RGPD conditionnée à l'archivage opt-in
commerçant) ; suites produit (multi-commerces, calendriers hebdo/mensuels).**

## Chantier plus ancien : Mode événement en direct (2026-07-23, prod-ready)
Module addon `addon_events` : animation LIVE synchronisée à 3 interfaces (écran
public `/event/[code]/screen`, téléphone joueur `/event/[code]` pseudo+avatar,
télécommande orga `/dashboard/events/[id]/remote`). Moteur « question » générique
quiz/sondage/prono ; séparation CONTENU (`event_games`/`questions`/`options`) et
RUN (`event_sessions`/`players`/`answers`/`wins`) ; machine à états serveur
`lobby→…→ended`. Invariants : non-fuite de la bonne réponse (4 défenses),
scoring serveur-autoritatif. Transport polling primaire + Realtime ping-only
activable (1re brique temps réel). Podium + lot `EVENT-` stock fini. Migration
`20260727120000`, ADR-034 (détail : checkpoint.md). Revue passée sans bloquant.

## Chantier plus ancien encore : Jackpot collectif (2026-07-23, prod-ready)
Nouveau module addon (`addon_jackpot`, miroir Passeport) : une CAGNOTTE
COLLECTIVE à jauge PARTAGÉE — chaque participation validée = +1 sur un compteur
global (`current_count`) affiché en temps réel. Anti-triche réutilisé du
Passeport (`validation_mode` code tournant TOTP / staff via jeton de check-in
signé domaine `jackpot-checkin:`, cooldown par joueur ≥ 300 s). 3 modes de
tirage (`draw_mode`) : `threshold_draw` (auto au seuil parmi tous les
participants du cycle), `rescan_win` (jauge pleine = armé, chance instantanée par
scan), `date_draw` (cron `jackpot-draws`). Tirage ATOMIQUE (verrou +
`unique(campaign_id, cycle)`) et VÉRIFIABLE (`draw_seed` journalisé,
`gen_random_bytes`). Récompense = lot unique `JACKPOT-…` en caisse
(`redeem_jackpot_prize`), STOCK FINI OBLIGATOIRE (ADR-031). Page publique
suivable `/jackpot/[id]` installable (PWA, manifest par campagne) + écran
comptoir temps réel + caisse unifiée (`source: 'jackpot'`). Identité joueur par
cookie HTTP-only + hash (aucune PII) ; purge RGPD conserve les hashes anonymes
des tirages. V1 mono-organisation. Fichiers clés : migration `20260726120000`,
`src/lib/jackpot-context.ts`, `src/lib/jackpot-checkin.ts`, `src/lib/jackpot.ts`,
`src/actions/jackpot.ts`, `/jackpot/[id]`, `src/components/jackpot/*`,
`/api/cron/jackpot-draws`. **Revue sécurité passée, 2 bloquants corrigés et
vérifiés** : CRITIQUE-1 (code du gagnant fuité au déclencheur du seuil → réservé
au gagnant, 2 couches SQL + app) ; ÉLEVÉ-1 (`date_draw` re-tirage à chaque cron →
clôture one-shot, cycle figé). Commits `13eb81c` (DB), `fbb2c3c` (backend),
`03bc7bd` (frontend), `1292b16` (E2E), `45f704c` + `624224f` (fixes). ADR-033.
**Points ouverts : limites V1 assumées (scans post-date_draw incrémentant la
jauge cosmétique ; stock résiduel non distribué) ; suites produit (multi-commerces
sur une même jauge, état « tirage effectué » sur la page publique, arrêt des
participations après `draw_at`).**

## Chantier du 2026-07-22 → 2026-07-23 : Passeport de fidélité ludique (GA)
Nouveau module addon (`addon_loyalty`, miroir Chasse) livré EN PRODUCTION en
qualité GA. Le client cumule des visites (« tampons ») sur un passeport
dématérialisé ; niveaux bronze/argent/or (seuils configurables) ; paliers à
récompense MIXTE, tous à STOCK FINI OBLIGATOIRE et palier ≥ visite 2 : lot
direct (code `FIDELITE-…` remis en caisse via `redeem_loyalty_reward`) ou tour
de roue offert (grant à usage unique → `consume_loyalty_spin_grant` → tirage
atomique `source='loyalty'` → flux de gain normal `GAIN-…`). Deux modes de
validation au choix du commerçant : code tournant type TOTP sur écran comptoir
(secret jamais exposé) et validation staff en caisse via un jeton de check-in
signé TTL 3 min (fin du bearer 180 j photographiable). Identité joueur par
cookie HTTP-only + hash (aucune PII). `record_loyalty_stamp` atomique sous
verrou du programme. Caisse unifiée roue/chasse/fidélité par `source`. V1
mono-organisation. Fichiers clés : migrations `20260725120000`→`20260725200000`,
`src/lib/loyalty-context.ts`, `src/lib/loyalty-checkin.ts`,
`src/actions/loyalty.ts`, `/passeport/[programId]`, `src/components/loyalty/*`.
**8 revues sécurité** (chaque correctif révélant le défaut sous le précédent) →
verdict GA, 0 finding bloquant, perte maximale bornée ≈ 150 € par les verrous
économiques. Commits `5a4e1de`→`5ba06a1`. ADR-028 à 032. **Points ouverts :
dette rate-limit PRÉEXISTANTE (hunt/prono/spin, seaux failClosed sur clé
partagée — disponibilité seule) en cours dans un chantier séparé (autre agent,
non résolue ici) ; résiduels FAIBLE (grants de spin injouables, UX du transfert
de coût du tour offert) ; suites produit (streak, multiplicateurs/missions,
badges, multi-établissements).**

## Chantier du 2026-07-22 : Chasse au trésor multi-QR
Nouveau module addon (`addon_hunts`, miroir Pronostics) : parcours de 2 à
10 QR codes (étapes), scan → « Valider mon passage » (POST anti-prefetch)
→ tampon + indice → complétion, lot DIRECT avec code de retrait `CHASSE-…`
remis en caisse (RPC `redeem_hunt_completion`). Identité joueur par cookie
HTTP-only + hash (aucune PII). `record_hunt_scan` atomique sous verrou de
chasse (tampon, ordre, délai, complétion + stock). Caisse unifiée
roue/chasse par un champ `source`. Pas de géolocalisation (délai minimal
optionnel seul garde-fou anti-partage). V1 mono-organisation. Fichiers
clés : `20260724120000_treasure_hunts.sql`, `src/lib/hunt-context.ts`,
`src/actions/hunts.ts`, `/hunt/[token]`, `src/components/hunts/*`, caisse
`src/actions/participations.ts`. Sécurité : 1 ÉLEVÉ + 1 MOYEN corrigés
(claim email usage unique, rate-limit scan IP partagée). 385 tests, build
OK (commits `f5525df`→`88db5bc`). ADR-023 à 027. **Points ouverts : 4 INFO
FAIBLE (docs/bugs.md), suites produit (multi-commerçants, mini-jeux,
récompenses intermédiaires, défaut délai > 0).**

## Chantier du 2026-07-21 : accessibilité volet 2
Contraste auto des labels de roue (`src/lib/contrast.ts`,
`labelColor: "auto"` sur les styles vierges uniquement), lien
d'évitement (`skip-link.tsx` sur landing, dashboard, /play, /pronos),
scans axe-core dans Playwright (`e2e/axe.ts`, échec serious/critical,
spec dédiée `e2e/a11y.spec.ts`) ; 3 contrastes landing + `aria-label`
caisse corrigés au passage. 338 tests, build OK (commits `ce2eb78`,
`bc9615c`, `028717d`). **Point ouvert : surveiller le premier run CI
des scans axe (E2E non exécutés localement).**

## Chantier du 2026-07-21 (bis) : quick wins maintenabilité/a11y
Types Supabase générés (`src/types/database.generated.ts` + garde CI
anti-dérive ; **réflexe : migration → `npm run types:generate` → commit,
sinon CI rouge**), roue respectant `prefers-reduced-motion`, onglets
Player Hub au clavier (WAI-ARIA Tabs). 324 tests, build OK (commits
`a5fc2cb`, `b7db502`). Règles de refactoring opportuniste consignées
dans docs/roadmap.md.

## Chantier V1.6 (2026-07-21)
Ligues privées + mode TV + saisie en lot côté Pronostics ; budget de
gains, programmation, alerte stock et 4 scénarios marketing côté
automatisations (détail : .claude/state/checkpoint.md, ADR-018 à 022).
Vérifié : typecheck, lint, Vitest 316/316, build. À couvrir en CI :
pgTAP et 73 E2E Playwright (Docker absent localement).

## Le projet
SaaS multi-tenant de gamification pour commerces : roue de la fortune
par QR code, espace commerçant complet, abonnement Stripe.
Stack : Next.js 16 + TS + Tailwind 4 + Supabase + Stripe + Resend + PostHog.

## Étapes livrées
1. ✅ Scaffold Next.js 16 (build/lint/vitest)
2. ✅ Schéma SQL multi-tenant + RLS (validé sur PG16 local : isolation + stock atomique)
3. ✅ Auth Supabase + middleware/proxy + onboarding org
4. ✅ Dashboard + CRUD campagnes (roue 1:1 auto-créée avec lots par défaut)
5. ✅ Config roue + CRUD lots (poids, stock, couleurs, perdants)
6. ✅ /play/[slug] : spin serveur anti-triche + animation (15 tests unitaires)
7. ✅ Formulaire participation RGPD + claim token + email Resend
8. ✅ QR codes (PNG 512px, téléchargement, scans)
9. ✅ Participations (recherche code, validation remise, export CSV) + stats
10. ✅ Stripe (checkout 14j essai, portail, webhook idempotent, gating)
11. ✅ PostHog + README déploiement + docs à jour

## Vérifications effectuées ici
- `npm run build` ✓ · `npm run lint` ✓ · `npm test` (15 tests) ✓
- Migrations appliquées sur PostgreSQL 16 local avec stubs Supabase
- Tests SQL : isolation RLS inter-org, décrément stock 2→0 puis refus

## Ce qui reste à faire hors code (par l'utilisateur)
La production tourne (Supabase, Stripe, Resend, Vercel configurés ;
migrations auto-appliquées). Restent : les activations Vault des workers
pg_cron (docs/observability.md) et l'arbitrage produit reengage/inactive
(ADR-021).

## Points d'attention pour la suite
- Types Supabase : snapshot généré `database.generated.ts` commité (garde CI
  anti-dérive) ; `src/types/database.ts` manuel migre progressivement vers
  les types générés (refactoring opportuniste, roadmap)
- Le stock est réservé au spin (ADR-007) : un gagnant qui abandonne le
  formulaire consomme une unité
- Postgres local de validation : /tmp/lastchance-pgdata (jetable)
