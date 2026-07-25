# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

**Status**: V1 + Studio créatif + Pronostics enrichi (ligues, TV, saisie rapide) + Automatisations commerçant + Chasse au trésor multi-QR + Passeport de fidélité ludique + Jackpot collectif + Mode événement en direct + Calendrier de l'Avent & campagnes quotidiennes + Parrainage ludique + Jeux rapides (moteur de tirage partagé + jeux skill-gated) + Pronostics génériques (le football devient un modèle) + Place de marché de campagnes (10 modèles + modèles privés) + Créateur de quiz (4 formes de réponse, 7 modèles, 5 modes de récompense) (2026-07-25) — bêta privée (Passeport GA en production ; Jackpot collectif, Mode événement live, Calendrier de l'Avent, Parrainage ludique, Jeux rapides [vague 1 : 7 jeux de révélation ; vague 2 : 6 jeux skill-gated] en production, revues passées sans bloquant ; Pronostics génériques et Place de marché de campagnes poussés sur `origin/main` le 2026-07-25, application des migrations `20260801120000` / `20260802120000` non revérifiée). **⚠️ Exception — le Créateur de quiz (V1.16) est le SEUL chantier NON POUSSÉ / NON DÉPLOYÉ** : 6 commits locaux `cb92b19`→`fe1e57b`, migration `20260803120000` non appliquée en prod. **↳ Correction constatée le 2026-07-25 en fin de journée** : le Créateur de quiz **a été poussé depuis** (`origin/main` = `eb3193d`, qui inclut `cb92b19`→`fe1e57b` + les correctifs de collisions de contraintes `6b4df8f`/`3214bf0` et le pgTAP `eb3193d`) — l'application de sa migration en prod reste non vérifiée, et l'encaissement en caisse des lots de pronostics (V1.17) **a été poussé lui aussi** (`origin/main` = `f873b77`), application de `20260804120000` en prod non vérifiée. **↳ Écart local/distant au 2026-07-25 au soir** : le chantier **audit 3** vit sur la branche `chantier/audit-3` (5 commits, 9 migrations `20260805*`, non poussée) — voir [le backlog de l'audit](./docs/audit-3-backlog.md) pour l'état item par item.
**Branch**: `chantier/audit-3` (partie de `main` = `f873b77`)

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
Le projet utilise un orchestrateur avec 8 agents spécialisés définis dans `.claude/agents/`.
`AGENTS.md` rend leurs règles natives pour Codex ; le bloc `orchestrator` de
`.claude/settings.json` conserve le routage Claude.

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
| `vercel-release` | Vercel : environnements, previews, production, logs, promotion et rollback |
| `qa-verify` | Typecheck, lint, tests Vitest/Playwright, build — valide chaque chantier |
| `security-review` | Revue sécurité lecture seule : multi-tenant, RLS, endpoints publics |
| `docs-scribe` | Documentation `docs/`, CLAUDE.md, ADR, état de session |

- Tâche transverse → découper : chaque agent traite sa part, en parallèle si indépendantes.
- Après tout changement significatif → `qa-verify` valide (typecheck, tests ciblés, build si besoin).
- Changement touchant auth / RLS / endpoint public / webhook / token → passer aussi `security-review`.
- Livraison → `vercel-release` intervient après QA ; production, promotion et rollback uniquement sur demande explicite.
- Fin de chantier notable → `docs-scribe` met à jour la doc et l'état de session.

## Token Optimization & Orchestration

**Fragmenter par étape** : chaque chantier demande une orchestration efficace des agents pour minimiser les tokens.

Pattern optimal :
1. **DB seule** — `db-supabase` (migrations, RLS, tests SQL), commit et vérif rapide.
2. **Backend par domaine** — `backend-api` (un appel unique pour couvrir son périmètre, pas de parallélisation inutile), commit.
3. **Frontend idem** — `frontend-ui` (un appel unique), commit.
4. **Validation+revue en parallèle** — `qa-verify` et `security-review` (ces deux valent le coût car finales et indépendantes).
5. **Documentation** — `docs-scribe`.
6. **Release** — `vercel-release`, uniquement si une livraison a été demandée.

Chaque agent :
- Reçoit un brief complet et des chemins exacts (pas de re-discovery).
- Rend un rapport **ultra-court** : vert = « N tests ✓, build OK, commit {hash} » ; rouge = corrige, relance, court résumé du fix.
- Pas de listing exhaustif de fichiers ni de snapshot de code.

Raison : chaque agent inhère le contexte de session complet (architecture, mémoire). Les parallélisations excessives (5 agents à la fois) amplifient ce coût sans gain wallclock significatif pour des tâches séquentielles. Seules `qa-verify` et `security-review` sont vraiment indépendantes.

## Last Updated
- **Date**: 2026-07-25
- **By (dernier chantier)**: **Encaissement en caisse des récompenses de pronostics — 9e source**. Correction d'une **anomalie fonctionnelle EN PRODUCTION** : `finalize_contest` posait déjà un code `PRONO-…` que le joueur voyait et que l'UI lui disait de présenter en caisse, mais `lookupRedeemCode` ne routait que **8 sources** et le seul chemin de remise (`set_contest_award_status`) exige `is_org_editor` — **un caissier ne pouvait pas remettre le lot**. DB (`e310606`, migration `20260804120000`) : `contest_awards.delivered_at` **renommée `redeemed_at`** (une seule colonne de vérité, alignée sur les 7 modules frères) + `redeemed_by` / `basket_cents` / `redeem_expires_at`, CHECK `(status='delivered') = (redeemed_at is not null)`, index unique `(organization_id, code)` précédé d'un contrôle de doublons explicite, `contests.code_ttl_seconds` (**3600–7776000 s**, borne volontairement différente de celle des campagnes car le décompte part de la CLÔTURE du championnat, pas du passage en caisse) + trigger d'échéance, RPC `redeem_contest_award` atomique / idempotente / auditée / `service_role` seule. Backend (`700a253`) : `normalizeContestCode`, `lookupContestAwardByCode`, `redeemContestAward`, routage 9e source, `code_ttl_seconds` aux validations. Frontend (`0a95ae8`) : `ContestResult` + `ContestRedeemButton` en caisse, palmarès enrichi (quand / par qui / panier), expiration réglée en jours, échéance affichée au joueur. E2E (`931c21b`) : boucle complète clôture → code lu par le joueur → saisie en caisse → remise avec panier → **seconde tentative refusée**, assertée sur les deux faces. Finitions : `76c72dc` (TTL non représentable en jours entiers), `f873b77` (M1 + doublons). **Revue sécurité GO conditionnel, aucun CRITIQUE ni ÉLEVÉ** : M1 = fuite potentielle du nom du championnat et du **prénom du gagnant** d'une autre organisation si `contest_awards.organization_id` se désynchronisait de `contests` → jointures org-scopées, **étendues à l'`UPDATE`** (ne scoper que la lecture aurait produit un état pire : lot consommé et audité pendant que la caisse affiche « code inconnu »). QA : **1147 tests ✓**, typecheck / lint / build verts. **⚠️ pgTAP JAMAIS exécutés** (ni Docker ni CLI Supabase) : 43 assertions `contest_awards.test.sql` + 4 à l'audit ACL central, prouvées seulement au job CI `database-security` — c'est le trou réel du chantier. **⚠️ NON POUSSÉ** (`origin/main` = `eb3193d`), migration `20260804120000` non appliquée en prod. **Résidu M2 non livré** : chaque famille de codes consomme son propre jeton `cashier:lookup` — une saisie NUE de 8 caractères en consomme **9** (≈3 recherches/minute pour le caissier, refus affiché « code introuvable » sur un lot valide) ; correctif écrit et vert (1222 tests) mais **non commité**, `src/actions/participations.ts` mêlant 495 lignes de ce correctif et du chantier « registre universel » en cours ; concerne les **9** sources. Autres résidus assumés : dérogation éditeur à l'expiration, pas de garde `hasPronosticsAccess` sur la remise (cohérent avec les 8 autres sources), bascule de tie-break sur les codes nus, lot **annulé** encore présenté comme encaissable au joueur (préexistant, UX), refus de remise non audités, `finalize_contest` sans boucle anti-collision, `set_contest_award_status` scopé sans revérifier `contests`. EXPECTED_MIGRATION `20260804120000`. ADR-043, roadmap V1.17, docs/bugs.md.
- **By**: Chantier **Créateur de quiz** — un quiz jouable depuis un QR / un lien, en LIBRE-SERVICE et ASYNCHRONE (restaurant, cave/bar, salon pro, boutique, musée, entreprise, club sportif). **3 arbitrages client** : (1) **module DÉDIÉ** — ni un `event_kind` des pronostics ni une extension de l'événement live : l'intention « je crée un quiz » est distincte et la **sémantique de la vérité diffère** (dans un pronostic la réponse est inconnue de tous jusqu'au résultat ; dans un quiz elle existe DÈS la création, la non-fuite devient un invariant à démontrer), le cycle de vie aussi (`event_sessions` SYNCHRONE / `quizzes` ASYNCHRONE) ; (2) les **7 types de questions** ; (3) les **5 modes de récompense**. **MODÉLISATION** : **4 formes de réponse** (`question_type in ('choice','number','ranking','text')`) + **2 dimensions transversales** (`time_limit_seconds`, `image_url`) + un `preset` libre de forme portant les 7 modèles d'UI (`multiple_choice`, `true_false`, `mystery_image`, `estimate`, `timed`, `ranking`, `free_prediction`) — un type « chronométré » aurait interdit le « choix multiple chronométré » ; `choice`/`number`/`ranking` **réutilisent les validateurs des pronostics** (`is_valid_contest_options`/`is_valid_contest_answer`), seule la réponse libre est neuve ; 8e modèle = une entrée de catalogue, sans migration. DB : migration `20260803120000_quizzes.sql` — `addon_quiz` + 5 tables (`quizzes`, `quiz_questions`, `quiz_players`, `quiz_answers`, `quiz_rewards`), 10 RPC `service_role` (+5 helpers, +1 interne), pgTAP `quizzes.test.sql` + audit ACL central. Backend : `src/lib/quiz.ts` / `quiz-context.ts` / `validations/quiz.ts` / `src/actions/quiz.ts`, caisse **8e préfixe `QUIZ-`**, rate-limit ADR-032, purge RGPD au cron. Frontend : éditeur `dashboard/quiz/*` + parcours joueur `/quiz/[slug]`. **6 INVARIANTS** : non-fuite de la bonne réponse en **3 couches** (RPC → mapper → type jouable sans champ de vérité) ; **chronomètre inforgeable** (aucune RPC n'accepte de paramètre de temps, `elapsed_ms` en base, `started_at` posé une fois et gelé même pour le `service_role`) ; réponse **unique et immuable** ; tirage **idempotent** (3 verrous) ; **stock fini obligatoire** (ADR-031) ; multi-tenant / ADR-032. **Revue sécurité GO conditionnel → tout corrigé (`fe1e57b`)** : E1 ÉLEVÉ bloquant (le mode `instant` émettait un lot **sans aucune réponse** — boucle vidant le stock depuis une IP) → émission conditionnée à la complétion réelle ; E2 ÉLEVÉ Sybil → Turnstile sur le SEUL appel émetteur `finishQuiz` et seulement si un lot est en jeu ; M1/M2 RGPD (email sans consentement, purge laissant les réponses LIBRES) ; M3 tirage à vide figeant la dotation → état `no_participants`, relançable. QA verte (1116 tests ✓). EXPECTED_MIGRATION `20260803120000`. Commits `cb92b19`→`fe1e57b`. ADR-040, roadmap V1.16. **⚠️ NON POUSSÉ / NON DÉPLOYÉ — seul chantier du projet dans cet état.** 7 résidus assumés (Sybil borné par `reward_stock` seul ; pas de borne minimale de temps humain ; `out_of_stock` terminal ; purge par anonymisation ; tour offert insensible à l'état de la roue ; prénom non modéré ; dérogation destructive au trigger de gel). **Défaut de PRODUCTION corrigé au passage (`b483740`)** : 8 addons en base, 6 seulement au back-office (et 2 non lues par `admin/data.ts`) — le module **Parrainage, en production, ne pouvait être activé pour AUCUN commerçant** ; les 8 sont désormais basculables et lues. Chantier précédent : Place de marché de campagnes (V1.15, ADR-039, migration `20260802120000`, poussée le 2026-07-25). Détail des chantiers antérieurs : docs/roadmap.md et .claude/state/checkpoint.md.
