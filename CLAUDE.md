# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique + Jeux rapides (moteur de tirage partagé + jeux skill-gated) + Pronostics génériques (le football devient un modèle) + Place de marché de campagnes (10 modèles + modèles privés) (2026-07-25) — bêta privée (Passeport GA en production ; Jackpot collectif, Mode événement live, Calendrier de l'Avent, Parrainage ludique, Jeux rapides [vague 1 : 7 jeux de révélation ; vague 2 : 6 jeux skill-gated] en production, revues passées sans bloquant ; Pronostics génériques poussé sur `origin/main` le 2026-07-25, application de la migration `20260801120000` non revérifiée). **⚠️ Exception — Place de marché de campagnes (V1.15) est le SEUL chantier NON POUSSÉ / NON DÉPLOYÉ** : 5 commits locaux `ed50271`→`4457b20`, migration `20260802120000` non appliquée en prod.
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
- **By**: Chantier **Place de marché de campagnes** — le commerçant part d'un MODÈLE au lieu de configurer une campagne de zéro. 10 modèles (Saint-Valentin, Halloween, Noël, ouverture de boutique, anniversaire, match de football, fête des Mères, happy hour, soldes, lancement de produit), chacun portant **7 promesses** : visuel, jeu, textes, récompenses suggérées, emails, durée, règles. **3 arbitrages client** : (1) **catalogue Lastchance EN CODE** (`src/lib/campaign-templates.ts`, versionné) **+ modèles PRIVÉS** enregistrés par le commerçant et visibles de sa seule organisation — **pas** de place de marché partagée entre commerçants (écartée : modération, isolation du contenu publié, propriété des visuels) ; (2) appliquer un modèle crée une campagne **EN BROUILLON complète** ; (3) emails fournis en **TEXTES, jamais activés**. DB : migration `20260802120000_campaign_templates.sql` — table `campaign_templates` (nom unique par org, `blueprint jsonb` objet borné à 32 Ko, `source_campaign_id`, `created_by` par trigger), **FK composite** `(source_campaign_id, organization_id)` → `campaigns(id, organization_id)`, `organization_id` hors grant UPDATE, pgTAP avec sentinelle anti-`anon`/`public`. Backend : `blueprintToDraft` (pur), Zod (la base ne garantit que « objet ≤ 32 Ko », la FORME est validée côté app dans les DEUX chemins), actions `applyCampaignTemplate` / `saveCampaignAsTemplate` / `deleteCampaignTemplate`. Frontend : galerie serveur en 2 sections, aperçu des 7 promesses en lecture défensive. **3 INVARIANTS D'INNOCUITÉ** (testés sur l'ACTION, mutation-testés) : **BROUILLON INERTE** (`status: 'draft'` ET `auto_schedule: false` verrouillé au niveau du TYPE — sans lui le cron `run_campaign_schedule()` publiait la campagne tout seul) ; **AUCUN ENVOI** (`automation_settings`/`enqueueJob`/`@/lib/resend` absents du chemin, modèle enregistré avec `emails: []`) ; **MULTI-TENANT** (org et rôle de la session, client de SESSION sous RLS + filtre org, aucun `createAdminClient`). **Revue sécurité GO 0 bloquant — 1 MOYEN corrigé (`4457b20`)** : le blueprint recopiant `wheels.skill_config`, la lecture ouverte à `is_org_member` exposait les SECRETS des jeux de défi et le paramétrage commercial (poids, stocks, `cost_cents`, budget) aux CAISSIERS → policy unique `campaign_templates: editors`, pgTAP inversé + non-fuite du secret + audit RLS central. QA verte (1021 tests ✓). EXPECTED_MIGRATION `20260802120000`. Commits `ed50271`→`4457b20`. ADR-039, roadmap V1.15. **⚠️ NON POUSSÉ / NON DÉPLOYÉ — seul chantier du projet dans cet état.** 6 résidus assumés (blueprint privé sans lot perdant possible ; application non transactionnelle ; ni quota ni rate-limit ; secret de défi dupliqué dans le blueprint ; seule la roue principale capturée ; bouton visible pour un caissier). Chantier précédent : Pronostics génériques — le football devient un modèle, pas le cœur (V1.14, ADR-038, migration `20260801120000`, poussé sur `origin/main` le 2026-07-25). Détail des chantiers antérieurs : docs/roadmap.md et .claude/state/checkpoint.md.
