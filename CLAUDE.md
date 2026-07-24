# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique (2026-07-24) — bêta privée (Passeport GA en production ; Jackpot collectif en production ; Mode événement live, Calendrier de l'Avent et Parrainage ludique prêts pour la prod, revues passées sans bloquant ; Parrainage non encore poussé/déployé)
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
- **By**: Chantier Parrainage ludique — prêt pour la prod (addon `addon_referral`, miroir `addon_calendar`, gating `hasReferralAccess`, opt-in PAR CAMPAGNE sur les campagnes ROUE : un joueur satisfait devient PARRAIN (code partageable `PR-…` → lien `/play/[slug]?ref=PR-…`, aucune nouvelle surface publique), chaque filleul qui vient JOUER un spin fait progresser une jauge d'« équipe » PARTAGÉE. Preuve = PARTICIPATION réelle jamais un clic (`validate_referral` exige un `proof_spin_id` — spin réel du device filleul, non forgeable/non rejouable/unique — appelé APRÈS le spin). 3 versements en CONFIG LIBRE commerçant, chacun `none`/`spin`/`lot` : parrain (par filleul) / filleul (bienvenue) / coffre collectif au seuil (`chest_threshold`, défaut 3) ; `lot` = code `PARRAIN-…` stock fini (ADR-031), `spin` = tour offert (`spins.source='referral'`, ADR-029). « Équipe » = jauge/coffre PARTAGÉS, sans classement. Anti-abus 100 % serveur borné par l'économie : self/boucle directe bloqués, 1 filleul/campagne/device, fenêtre + plafond, no-oracle (`rejected` unique) + défense en profondeur (`referral_public_state` re-gate), rate-limit ADR-032 (failClosed device, IP fail-open observe). Caisse unifiée `source: 'referral'` (7e préfixe `PARRAIN-`, `redeem_referral_reward`), purge RGPD `purge_expired_referral_data`. Revue sécurité GO SANS bloquant, QA verte ; 3 résidus FAIBLE assumés (dédup email inerte post-spin, amplification ~3× en spin+spin bornée par stock fini, entropie code 40 bits). Migration `20260729120000`, ADR-036, commits `abf6204`→`6d7bfba` (NON poussés/déployés). Chantier précédent : Calendrier de l'Avent (ADR-035, migration `20260728120000`)
