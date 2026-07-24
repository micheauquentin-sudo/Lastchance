# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique + Jeux rapides (moteur de tirage partagé + jeux skill-gated) (2026-07-24) — bêta privée (Passeport GA en production ; Jackpot collectif en production ; Jeux rapides vague 1 [7 jeux de révélation] en production ; Mode événement live, Calendrier de l'Avent et Parrainage ludique prêts pour la prod, revues passées sans bloquant ; Parrainage et Jeux rapides vague 2 [6 jeux skill-gated] non encore poussés/déployés)
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
- **By**: Chantier Jeux rapides — moteur de tirage partagé + jeux skill-gated (2 vagues). Formalise le point d'extension existant `wheels.game_type` (roue/grattage partagent déjà `spinWheel`/`perform_atomic_spin`/`claimPrize`) en SOCLE et l'étend à 13 nouveaux jeux. **VAGUE 1 — EN PROD** : 7 jeux de RÉVÉLATION (`flip_card`, `cups`, `slot`, `memory`, `chest`, `dice`, `draw_card`), migration `20260730120000`, socle `<GameShell>` extrait du grattage (idle/gagné/perdu/bloqué + spin/réclamation/partage/captcha/analytics/thèmes) — SERVEUR-AUTORITATIF : le lot vient de `spinWheel`, l'interaction ne fait que RÉVÉLER l'`outcome` (cosmétique). Revue vague 1 GO 0 bloquant. **VAGUE 2 — LOCAL, non poussée** : 6 jeux de DÉFI *skill-gated* (`rps`, `reflex`, `gauge`, `puzzle`, `mystery_word`, `estimate`), migration `20260731120000` (`skill_config jsonb` à secrets SERVER-ONLY ; `perform_atomic_spin` recréée 7-args avec `p_force_losing`, corps normal identique → zéro régression). Socle `<SkillGameShell>` à 2 temps + moteur `src/lib/skill.ts`/`src/actions/skill.ts` : `startSkillChallenge` présente le défi (vue publique sans secret) + jeton HMAC domaine-séparé `skill-challenge:` lié device ; `submitSkillChallenge` ÉVALUE le défi CÔTÉ SERVEUR puis `perform_atomic_spin(p_force_losing => !succeeded)` (réussite→tirage normal, échec→spin perdant forcé), participation consommée dans les 2 cas (anti-brute-force). Invariant central : le tirage est le PLAFOND (ADR-031). Revue vague 2 NO-GO→GO (`8a3c60e`) : (ÉLEVÉ) contournement du défi par appel direct `spinWheel` fermé par garde `isSkillGameType` ; (MOYEN) brute-force de secret fermé (`unlimited` interdit sur jeux à secret + oracle `succeeded` retiré). QA verte. EXPECTED_MIGRATION `20260731120000`. Commits `d957f46`→`5710641` (v1), `125eb99`→`8a3c60e` (v2). ADR-037. 3 résidus FAIBLE assumés (reflex/gauge *client-reported* bornés éco ; jeux à secret exigent `play_limit` borné ; verrouillage du défi sur erreur transitoire). Chantier précédent : Parrainage ludique (ADR-036, migration `20260729120000`, non poussé)
