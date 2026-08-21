# Lastchance - Project Context

## Project Overview
**Lastchance** est un SaaS multi-tenant de gamification pour commerces :
roue de la fortune par QR code, espace commerçant, abonnement Stripe.
Stack : Next.js 16 + TypeScript + Tailwind 4 + Supabase + Stripe + Resend.

Avant toute mission demandée par l'utilisateur, consulter
[`docs/codex-handoff.md`](./docs/codex-handoff.md) : il contient le dernier
audit, les décisions et les éléments restant à réaliser. Claude conserve le
choix de ses agents et de son organisation de travail.

**Status** : bêta privée, en production. Socle V1 (roue, QR, caisse, abonnement Stripe) plus quinze modules livrés — Studio créatif, Pronostics (dont génériques), Automatisations commerçant, Chasse au trésor, Passeport de fidélité, Jackpot collectif, Mode événement live, Calendrier de l'Avent, Parrainage, Jeux rapides (13 de révélation + 6 skill-gated), Place de marché de campagnes, Créateur de quiz, Méta-progression, Registre universel des récompenses — et trois livraisons transverses : le rapport hebdomadaire commerçant, le portefeuille public du joueur, le canal SMS (Brevo).

*Cette ligne ne porte plus l'historique des livraisons.* Elle l'a porté pendant une semaine, sous forme d'une trentaine de corrections « ↳ » empilées, dont plusieurs se contredisaient — et un audit y a confirmé trois modules encore décrits comme « NON POUSSÉ / NON DÉPLOYÉ » alors qu'ils tournaient en production. Un document qui raconte l'histoire de son propre retard finit par mentir sur le présent. **Pour l'état de livraison : [`docs/roadmap.md`](./docs/roadmap.md). Pour ce qui est cassé : [`docs/bugs.md`](./docs/bugs.md). Pour le pourquoi des choix : [`docs/decisions.md`](./docs/decisions.md).**

**Branch** : `main`, sur **les deux dépôts**, arbres propres. Aucune branche de
chantier ; il ne subsiste sur le distant que `claude/merchant-mvp-build-w8j7et`
(direction artistique jamais appliquée, gardée en archive).
Le dépôt de référence est `~/workspaces/lastchance` (WSL) — voir la section
« Environnement d'exécution » ci-dessous.

*Aucun numéro de migration épinglé ici non plus, et pour la même raison que les
SHA* : la ligne portait `20260805240000` alors que la tête était trois
migrations plus loin. **La source de vérité est `src/lib/release.ts`
(`EXPECTED_MIGRATION`)**, qu'un test unitaire compare au dossier
`supabase/migrations` et qui fait échouer la CI en cas d'écart. Un chiffre
recopié à la main dans un document ne peut pas tenir cette promesse.

*La branche `claude/saas-security-audit-8z3zvv` a été retirée de cette liste* :
elle n'était conservée que pour `create_campaign_with_defaults`, livré depuis
(migration `20260806120000`), et elle n'existe plus sur le distant.

*Aucun SHA ici, volontairement* : cette ligne a été fausse la moitié de la
semaine parce qu'elle en épinglait un et que `main` bouge. Ce qui doit rester
vrai, c'est l'invariant — deux dépôts sur `main`, propres, rien en suspens.

## Quick Links
- [Journal des chantiers](./docs/journal.md) — l'historique complet, extrait d'ici le 2026-08-05
- [Architecture](./docs/architecture.md)
- [Roadmap](./docs/roadmap.md)
- [Known Issues](./docs/bugs.md)
- [Architecture Decisions](./docs/decisions.md)
- [Beta Report](./docs/beta-report.md)
- [Observability](./docs/observability.md)
- [Supply Chain](./docs/supply-chain.md)
- [Performance Report](./docs/perf-report.md)
- [Production Readiness](./docs/production-readiness.md)

## Socle opérationnel — dans AGENTS.md

@AGENTS.md

**Pourquoi là-bas et plus ici.** L'environnement d'exécution, les pièges WSL et
la boucle de vérification ne dépendent d'aucun outil : ils étaient enfermés dans
un fichier que Claude Code est seul à lire, alors qu'Antigravity et Codex en ont
exactement le même besoin. Ils vivent désormais dans `AGENTS.md`, que les trois
lisent, et que la ligne ci-dessus importe ici — le contenu reste donc présent en
contexte, sans être dupliqué.

Ce qui suit est ce qui reste **propre à Claude Code** : le routage des
sous-agents et l'économie de tokens de l'orchestration.

Le détail complet est à un chargement de skill : `environnement-wsl` (les douze
pièges, les commandes de référence) et `verification-locale` (l'ordre des
vérifications, les gardes SQL, la régénération des types).

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
1. **DB seule** — `db-supabase` (migrations, RLS, tests SQL), commit et vérif ciblée.
2. **Backend ET frontend EN PARALLÈLE** — `backend-api` (`src/lib`, `src/actions`) et
   `frontend-ui` (`src/app`, composants) écrivent dans des dossiers **disjoints** :
   un appel unique chacun, lancés dans le **même message**. Séquentiel seulement
   si l'un doit lire ce que l'autre écrit — sinon on paie deux attentes pour un
   seul conflit possible, qui n'existe pas.
3. **Validation + revue en parallèle** — `qa-verify` et `security-review` (finales et indépendantes).
4. **Documentation** — `docs-scribe`.
5. **Release** — `vercel-release`, uniquement si une livraison a été demandée.

**Une seule suite complète, à l'étape 3.** Les étapes 1 et 2 se contentent d'une
vérification **ciblée** — typecheck plus les tests de leur périmètre. Trois suites
complètes coûtent trois fois leur durée pour prouver la même chose, et c'est
`qa-verify` dont c'est le métier.

**Ce pattern est un MAXIMUM, pas une liste à dérouler.** Un chantier sans SQL
n'appelle pas `db-supabase`, un chantier sans paiement n'appelle pas
`stripe-billing` : un agent convoqué sur un périmètre intact paie le contexte
projet en entier pour ne rien produire.

Chaque agent :
- Reçoit un brief complet et des chemins exacts (pas de re-discovery).
- Rend un rapport **ultra-court** : vert = « N tests ✓, build OK, commit {hash} » ; rouge = corrige, relance, court résumé du fix.
- Pas de listing exhaustif de fichiers ni de snapshot de code.

**Ce que « brief complet » veut dire, concrètement.** Un brief qui oblige l'agent
à redécouvrir coûte deux fois : sa recherche, puis la relecture de ce qu'il en
rapporte. Il porte donc :
1. Les **chemins exacts** des fichiers à ouvrir, jamais une description — « le
   module de spin » fait ouvrir dix fichiers pour en trouver un.
2. Ce qui est **déjà établi** : la mesure faite, la décision prise, ce qui a été
   écarté **et pourquoi**. Sans ce dernier point l'agent rouvre un arbitrage
   déjà tranché et le rejoue à sa façon.
3. Le **critère de sortie** — ce qui doit être vrai pour que ce soit fini.
4. Ce qu'il ne doit **pas** toucher, quand son périmètre jouxte celui d'un autre.

Raison : chaque agent inhère le contexte de session complet (architecture, mémoire). Les parallélisations excessives (5 agents à la fois) amplifient ce coût sans gain wallclock significatif pour des tâches séquentielles. Seules `qa-verify` et `security-review` sont vraiment indépendantes. Le poids de ce contexte hérité est borné par `src/lib/claude-md-budget.test.ts`.

**LA LECTURE EST LE CAS INVERSE, et le paragraphe ci-dessus ne la vise pas.** Il
parle des tâches d'**écriture**, séquentielles par nature. Une phase de
découverte ou d'audit n'écrit rien : **N agents `Explore` en parallèle, un par
sous-système, lancés dans le MÊME message**. Aucun conflit n'est possible, c'est
le seul endroit où le parallélisme est gratuit en risque. Chacun reçoit un
sous-système **nommé** et rend une sortie **courte et structurée** — trouvailles
et chemins, jamais un dump de fichier : ce qu'il recopie, on le relit.

Mesuré le 2026-08-05 sur les 25 derniers chantiers : **44 % ne touchent qu'un
périmètre** — le fan-out d'**écriture** ne leur sert à rien — mais tous passent
par une phase de lecture, et l'historique du dépôt est saturé de « 102 pistes
examinées », « 37 candidates, 24 confirmées ». C'est là qu'est le temps.

**En écriture, jamais deux agents sur les mêmes fichiers** : ils s'écrasent.
L'isolation par worktree existe, mais réconcilier N copies divergentes coûte
plus cher qu'écrire en série. Le DAG d'écriture est déjà à son maximum pratique.

**Orchestration multi-agents (fan-out déterministe).** Coûte **300 k à 1 M de
tokens** : ne se déclenche jamais d'elle-même. Mais **ne pas attendre qu'on y
pense non plus** — la PROPOSER, avec le compte de sites et le coût estimé, dès
que les trois conditions sont réunies :
1. La liste de travail est **énumérable par une commande** (`grep`, glob) et rend
   **N ≥ 6** sites — un compte mesuré, pas une impression.
2. Chaque site reçoit **le même geste**, et son traitement ne dépend pas du
   résultat obtenu sur les autres.
3. La décision est **déjà tranchée** : un fan-out sur un arbitrage en suspens
   multiplie la mauvaise réponse par N au lieu de la corriger une fois.

Précédents qui l'auraient méritée : les 8 contextes publics de P0.4, les 8
façades de P0.3, les 19 compteurs d'IP. Sinon — sites couplés, N < 6, décision
en suspens — séquentiel, **et le dire** plutôt que de laisser croire que la
question n'a pas été posée.

## Last Updated
- **Date**: 2026-08-21
- **Dernier chantier**: **Le train Réserver & Vitrine, huit lots (L11→L18) fusionnés et en production** (ADR-115). La Vitrine publique bilingue ouvre (`/v/[slug]/[[...langue]]`, ISR 60 s, adaptateur i18n neutre sans fournisseur ni IA payante — ADR-109), avec import de carte sans IA, portes Réserver/quiz en opt-in, « À la une », traduction commerçant. Le socle lobby ajoute deux jeux joueurs : Duo Miroir (choix scellés, révélation simultanée) et Portrait de la Bande (vote secret, plancher de 3 réponses avant révélation, dénominateur figé par question, 5 packs de questions). PR #167 à #174, migrations `20261012120000` à `20261019120000`. Trois défauts trouvés par la vérification, pas par la lecture : l'ISR n'existait pas (`generateStaticParams` manquant, prouvé par le manifeste de build), une course de scrutin sur `bande_reveal` fermée par verrou en base, et un hôte qui désanonymisait les votes un par un avant le plancher de 3 réponses.
  **Reste ouvert** : `CRON_SECRET` absent des secrets GitHub — la garde de santé ne nomme jamais la cause d'un échec (`docs/bugs.md`, Notes) ; aucun mécanisme de présence dans les salons (l'hôte clôt chaque question) ; `robots: index false` sur la Vitrine (décision de commerce) ; les 5 packs Portrait de la Bande attendent la relecture du propriétaire. **Gestes propriétaire dus** : révoquer la clé Stripe `rk_live_` et le jeton Vercel (`docs/chantier-audit-2026-08-16.md`). **LOBBY-1 : remède ARMÉ**, plus « non armé » — clé publique Turnstile prouvée dans le bundle de production le 2026-08-21, résidu nommé dans `docs/bugs.md`.
> **L'historique complet des chantiers vit dans [`docs/journal.md`](./docs/journal.md).**
> Il en a été extrait le 2026-08-05 : il pesait **39 062 tokens sur les 42 971 de
> ce fichier — 91 %** — et grossissait d'environ 5 500 tokens par chantier, payés
> une fois par session **et une fois par agent**, soit près de 273 000 tokens de
> prefill par chantier à six agents.
>
> **Ne rien empiler ici.** Le dernier chantier **remplace** le précédent, qui
> part en tête de `docs/journal.md`. Le plafond est gardé mécaniquement par
> `src/lib/claude-md-budget.test.ts` : dépasser le budget fait rougir la CI.
