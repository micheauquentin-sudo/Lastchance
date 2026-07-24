# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique + Jeux rapides (moteur de tirage partagé + jeux skill-gated) + Pronostics génériques (le football devient un modèle) (2026-07-24) — bêta privée (Passeport GA en production ; Jackpot collectif, Mode événement live, Calendrier de l'Avent, Parrainage ludique et Jeux rapides [vague 1 : 7 jeux de révélation ; vague 2 : 6 jeux skill-gated] en production, revues passées sans bloquant). **⚠️ Exception — Pronostics génériques (V1.14) est le SEUL chantier NON POUSSÉ / NON DÉPLOYÉ** : commits locaux `4973736`→`f3c5752`, migration `20260801120000` non appliquée en prod.
**Branch**: `main`

## Quick Links
- [Architecture](./docs/architecture.md)
- [Roadmap](./docs/roadmap.md)
- [Known Issues](./docs/bugs.md)
- [Architecture Decisions](./docs/decisions.md)
- [Beta Report](./docs/beta-report.md)
- [Observability](./docs/observability.md)
- [Supply Chain](./docs/supply-chain.md)
- [Performance Report](./docs/perf-report.md)
- [Production Readiness](./docs/production-readiness.md)

## Development Guidelines
- Travailler sur la branche explicitement demandée pour la tâche en cours
- Priorité : simplicité, stabilité, qualité du code, expérience commerçant
- Après chaque fonctionnalité : vérifier (tests, typecheck, lint, build), corriger, documenter
- Commit changes with clear descriptive messages

## Orchestrator & Agents
Le projet utilise un orchestrateur avec 7 agents spécialisés définis dans `.claude/agents/`
(configuration détaillée : bloc `orchestrator` de `.claude/settings.json`).

**Règle de routage — IMPORTANT** : pour toute demande de modification, déléguer le travail
à l'agent dont le périmètre correspond (via le tool Agent, `subagent_type` = nom ci-dessous).
Ne pas coder soi-même dans un périmètre couvert par un agent, sauf micro-changement trivial
(< ~5 lignes, un seul fichier).

| Agent | Périmètre |
|---|---|
| `db-supabase` | Schéma, migrations SQL, RLS, seed, tests SQL (`supabase/`) |
| `backend-api` | Server actions, routes API, logique métier `src/lib/` (hors Stripe) |
| `frontend-ui` | Composants React, pages, Tailwind, roue 3D, dashboard, parcours joueur |
| `stripe-billing` | Stripe : webhooks, abonnements, checkout, billing |
| `qa-verify` | Typecheck, lint, tests Vitest/Playwright, build — valide chaque chantier |
| `security-review` | Revue sécurité lecture seule : multi-tenant, RLS, endpoints publics |
| `docs-scribe` | Documentation `docs/`, CLAUDE.md, ADR, état de session |

- Tâche transverse → découper : chaque agent traite sa part, en parallèle si indépendantes.
- Après tout changement significatif → `qa-verify` valide (typecheck, tests ciblés, build si besoin).
- Changement touchant auth / RLS / endpoint public / webhook / token → passer aussi `security-review`.
- Fin de chantier notable → `docs-scribe` met à jour la doc et l'état de session.

## Token Optimization & Orchestration

**Fragmenter par étape** : chaque chantier demande une orchestration efficace des agents pour minimiser les tokens.

Pattern optimal :
1. **DB seule** — `db-supabase` (migrations, RLS, tests SQL), commit et vérif rapide.
2. **Backend par domaine** — `backend-api` (un appel unique pour couvrir son périmètre, pas de parallélisation inutile), commit.
3. **Frontend idem** — `frontend-ui` (un appel unique), commit.
4. **Validation+revue en parallèle** — `qa-verify` et `security-review` (ces deux valent le coût car finales et indépendantes).
5. **Documentation** — `docs-scribe`.

Chaque agent :
- Reçoit un brief complet et des chemins exacts (pas de re-discovery).
- Rend un rapport **ultra-court** : vert = « N tests ✓, build OK, commit {hash} » ; rouge = corrige, relance, court résumé du fix.
- Pas de listing exhaustif de fichiers ni de snapshot de code.

Raison : chaque agent inhère le contexte de session complet (architecture, mémoire). Les parallélisations excessives (5 agents à la fois) amplifient ce coût sans gain wallclock significatif pour des tâches séquentielles. Seules `qa-verify` et `security-review` sont vraiment indépendantes.

## Last Updated
- **Date**: 2026-07-24
- **By**: Chantier Pronostics au-delà du sport — **le moteur cesse d'être football-centré**. Modèle : `événement → questions prédictives → date de verrouillage → résultat → barème → classement → récompenses` ; le football devient un MODÈLE préconfiguré, pas le cœur technique. 3 arbitrages client : **4 types de questions** (`score` = 2 camps, le foot historique / `choice` / `ranking` / `number`), **football + 10 modèles** préconfigurés, **verrouillage par question avec date par défaut au niveau de l'événement**. Migration `20260801120000_generic_contests.sql` : `contests` (`event_kind` défaut `football`, `default_locks_at`, `scoring` étendu), `contest_matches` devient le REGISTRE DE QUESTIONS (`question_type`, `prompt`, `options`, `correct_answer`, `ranking_size`, `locks_at`), `contest_predictions` (scores NULLABLE + `answer jsonb`), RPC `submit_contest_answer`/`set_contest_question_result`/`update_contest_generic_scoring`/`update_contest_event_settings`, barème par type en SQL, pgTAP `generic_contests.test.sql`. Backend : miroir TS du barème, Zod par type, `publicCorrectAnswer` (point de sérialisation UNIQUE de la bonne réponse). Frontend : création typée, constructeur de questions, saisie du résultat par type, parcours joueur générique, `ranking-picker`, 10 modèles + `custom` (clés `^[a-z][a-z0-9_]{1,39}$`, **aucune option factice écrite**). Synchro fournisseur réservée au football (double verrou). **Revue sécurité NO-GO conditionnel → corrigé (`f3c5752`)** : GO franc sur le générique ; blocage sur la NON-RÉGRESSION football — (ÉLEVÉ) backfill `locks_at = kickoff_at` figeant la fenêtre alors que la synchro ne met à jour que `kickoff_at` (match reporté → fermeture silencieuse ; match avancé → pronostic accepté pendant la rencontre) → backfill supprimé ; (MOYEN) `default_locks_at` primant sur `kickoff_at` fermait d'un coup un championnat importé → jamais appliquée à une question `score` (`score → coalesce(locks_at, kickoff_at)`, `générique → coalesce(locks_at, default_locks_at, kickoff_at)`, dans les 4 fonctions SQL + miroir TS `effectiveLocksAt` + champ masqué en UI). QA verte. EXPECTED_MIGRATION `20260801120000`. Commits `4973736`→`f09ee89`. ADR-038, roadmap V1.14. **⚠️ NON POUSSÉ / NON DÉPLOYÉ — seul chantier du projet dans cet état.** Résidus assumés : M2 (`update_contest_event_settings` peut rouvrir une question à `locks_at` NULL), I1 (miroir TS du barème sans appelant prod), départage d'ex æquo par palier et non par type, I2 (`number_tolerance` décimal ignoré), I4 (RPC hors `security_acl.test.sql`), I5 (`tiebreaker_answer` chargé mais non transmis). Chantier précédent : Jeux rapides — moteur de tirage partagé + jeux skill-gated (2 vagues, EN PROD). Formalise le point d'extension existant `wheels.game_type` (roue/grattage partagent déjà `spinWheel`/`perform_atomic_spin`/`claimPrize`) en SOCLE et l'étend à 13 nouveaux jeux. **VAGUE 1 — EN PROD** : 7 jeux de RÉVÉLATION (`flip_card`, `cups`, `slot`, `memory`, `chest`, `dice`, `draw_card`), migration `20260730120000`, socle `<GameShell>` extrait du grattage (idle/gagné/perdu/bloqué + spin/réclamation/partage/captcha/analytics/thèmes) — SERVEUR-AUTORITATIF : le lot vient de `spinWheel`, l'interaction ne fait que RÉVÉLER l'`outcome` (cosmétique). Revue vague 1 GO 0 bloquant. **VAGUE 2 — EN PROD** : 6 jeux de DÉFI *skill-gated* (`rps`, `reflex`, `gauge`, `puzzle`, `mystery_word`, `estimate`), migration `20260731120000` (`skill_config jsonb` à secrets SERVER-ONLY ; `perform_atomic_spin` recréée 7-args avec `p_force_losing`, corps normal identique → zéro régression). Socle `<SkillGameShell>` à 2 temps + moteur `src/lib/skill.ts`/`src/actions/skill.ts` : `startSkillChallenge` présente le défi (vue publique sans secret) + jeton HMAC domaine-séparé `skill-challenge:` lié device ; `submitSkillChallenge` ÉVALUE le défi CÔTÉ SERVEUR puis `perform_atomic_spin(p_force_losing => !succeeded)` (réussite→tirage normal, échec→spin perdant forcé), participation consommée dans les 2 cas (anti-brute-force). Invariant central : le tirage est le PLAFOND (ADR-031). Revue vague 2 NO-GO→GO (`8a3c60e`) : (ÉLEVÉ) contournement du défi par appel direct `spinWheel` fermé par garde `isSkillGameType` ; (MOYEN) brute-force de secret fermé (`unlimited` interdit sur jeux à secret + oracle `succeeded` retiré). QA verte. EXPECTED_MIGRATION `20260731120000`. Commits `d957f46`→`5710641` (v1), `125eb99`→`8a3c60e` (v2). ADR-037. 3 résidus FAIBLE assumés (reflex/gauge *client-reported* bornés éco ; jeux à secret exigent `play_limit` borné ; verrouillage du défi sur erreur transitoire). Chantier précédent : Parrainage ludique (ADR-036, migration `20260729120000`, en production)
