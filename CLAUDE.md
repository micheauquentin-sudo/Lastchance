# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique + Jeux rapides (moteur de tirage partagé + jeux skill-gated) + Pronostics génériques (le football devient un modèle) + Place de marché de campagnes (10 modèles + modèles privés) + Créateur de quiz (4 formes de réponse, 7 modèles, 5 modes de récompense) (2026-07-25) — bêta privée (Passeport GA en production ; Jackpot collectif, Mode événement live, Calendrier de l'Avent, Parrainage ludique, Jeux rapides [vague 1 : 7 jeux de révélation ; vague 2 : 6 jeux skill-gated] en production, revues passées sans bloquant ; Pronostics génériques et Place de marché de campagnes poussés sur `origin/main` le 2026-07-25, application des migrations `20260801120000` / `20260802120000` non revérifiée). **⚠️ Exception — le Créateur de quiz (V1.16) est le SEUL chantier NON POUSSÉ / NON DÉPLOYÉ** : 6 commits locaux `cb92b19`→`fe1e57b`, migration `20260803120000` non appliquée en prod.
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
- **Date**: 2026-07-25
- **By**: Chantier **Créateur de quiz** — un quiz jouable depuis un QR / un lien, en LIBRE-SERVICE et ASYNCHRONE (restaurant, cave/bar, salon pro, boutique, musée, entreprise, club sportif). **3 arbitrages client** : (1) **module DÉDIÉ** — ni un `event_kind` des pronostics ni une extension de l'événement live : l'intention « je crée un quiz » est distincte et la **sémantique de la vérité diffère** (dans un pronostic la réponse est inconnue de tous jusqu'au résultat ; dans un quiz elle existe DÈS la création, la non-fuite devient un invariant à démontrer), le cycle de vie aussi (`event_sessions` SYNCHRONE / `quizzes` ASYNCHRONE) ; (2) les **7 types de questions** ; (3) les **5 modes de récompense**. **MODÉLISATION** : **4 formes de réponse** (`question_type in ('choice','number','ranking','text')`) + **2 dimensions transversales** (`time_limit_seconds`, `image_url`) + un `preset` libre de forme portant les 7 modèles d'UI (`multiple_choice`, `true_false`, `mystery_image`, `estimate`, `timed`, `ranking`, `free_prediction`) — un type « chronométré » aurait interdit le « choix multiple chronométré » ; `choice`/`number`/`ranking` **réutilisent les validateurs des pronostics** (`is_valid_contest_options`/`is_valid_contest_answer`), seule la réponse libre est neuve ; 8e modèle = une entrée de catalogue, sans migration. DB : migration `20260803120000_quizzes.sql` — `addon_quiz` + 5 tables (`quizzes`, `quiz_questions`, `quiz_players`, `quiz_answers`, `quiz_rewards`), 10 RPC `service_role` (+5 helpers, +1 interne), pgTAP `quizzes.test.sql` + audit ACL central. Backend : `src/lib/quiz.ts` / `quiz-context.ts` / `validations/quiz.ts` / `src/actions/quiz.ts`, caisse **8e préfixe `QUIZ-`**, rate-limit ADR-032, purge RGPD au cron. Frontend : éditeur `dashboard/quiz/*` + parcours joueur `/quiz/[slug]`. **6 INVARIANTS** : non-fuite de la bonne réponse en **3 couches** (RPC → mapper → type jouable sans champ de vérité) ; **chronomètre inforgeable** (aucune RPC n'accepte de paramètre de temps, `elapsed_ms` en base, `started_at` posé une fois et gelé même pour le `service_role`) ; réponse **unique et immuable** ; tirage **idempotent** (3 verrous) ; **stock fini obligatoire** (ADR-031) ; multi-tenant / ADR-032. **Revue sécurité GO conditionnel → tout corrigé (`fe1e57b`)** : E1 ÉLEVÉ bloquant (le mode `instant` émettait un lot **sans aucune réponse** — boucle vidant le stock depuis une IP) → émission conditionnée à la complétion réelle ; E2 ÉLEVÉ Sybil → Turnstile sur le SEUL appel émetteur `finishQuiz` et seulement si un lot est en jeu ; M1/M2 RGPD (email sans consentement, purge laissant les réponses LIBRES) ; M3 tirage à vide figeant la dotation → état `no_participants`, relançable. QA verte (1116 tests ✓). EXPECTED_MIGRATION `20260803120000`. Commits `cb92b19`→`fe1e57b`. ADR-040, roadmap V1.16. **⚠️ NON POUSSÉ / NON DÉPLOYÉ — seul chantier du projet dans cet état.** 7 résidus assumés (Sybil borné par `reward_stock` seul ; pas de borne minimale de temps humain ; `out_of_stock` terminal ; purge par anonymisation ; tour offert insensible à l'état de la roue ; prénom non modéré ; dérogation destructive au trigger de gel). **Défaut de PRODUCTION corrigé au passage (`b483740`)** : 8 addons en base, 6 seulement au back-office (et 2 non lues par `admin/data.ts`) — le module **Parrainage, en production, ne pouvait être activé pour AUCUN commerçant** ; les 8 sont désormais basculables et lues. Chantier précédent : Place de marché de campagnes (V1.15, ADR-039, migration `20260802120000`, poussée le 2026-07-25). Détail des chantiers antérieurs : docs/roadmap.md et .claude/state/checkpoint.md.
