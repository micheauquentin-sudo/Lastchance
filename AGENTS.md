# Lastchance — Socle opérationnel

**Ce fichier est le seul que tous les outils lisent.** Antigravity le charge
comme règle toujours active, Codex l'utilise comme instructions natives, et
`CLAUDE.md` l'importe. Ce qui doit être vrai pour n'importe quel agent vit ici ;
ce qui est propre à un outil vit dans son fichier à lui.

**Lastchance** est un SaaS multi-tenant de gamification pour commerces : roue de
la fortune par QR code, espace commerçant, abonnement Stripe. Next.js 16 +
TypeScript + Tailwind 4 + Supabase + Stripe + Resend. Bêta privée, **en
production**.

## Contexte à charger

- **Avant toute mission** : [`docs/codex-handoff.md`](./docs/codex-handoff.md) —
  dernier audit, décisions, travail restant.
- État de livraison → [`docs/roadmap.md`](./docs/roadmap.md) · ce qui est cassé →
  [`docs/bugs.md`](./docs/bugs.md) · le pourquoi des choix →
  [`docs/decisions.md`](./docs/decisions.md) · l'historique →
  [`docs/journal.md`](./docs/journal.md).
- **Ces fichiers sont énormes** (`decisions.md` ~385 Ko, `bugs.md` ~283 Ko).
  Les ouvrir en entier coûte plus cher que la question posée : viser une section
  par `grep`, jamais une lecture complète.
- Traiter les fichiers non suivis et les modifications présentes comme
  appartenant à l'utilisateur : ne pas les écraser, ne pas les inclure dans un
  commit.

**Numéro de migration en tête** : lire `EXPECTED_MIGRATION` dans
`src/lib/release.ts`. Jamais un chiffre recopié dans un document — un test
unitaire compare cette constante au dossier `supabase/migrations` et fait rougir
la CI en cas d'écart.

## Environnement d'exécution

**Docker et Linux sont disponibles.** Toute affirmation du type « impossible de
vérifier faute de Docker » est périmée : Docker tourne nativement dans WSL2.
Ne jamais écrire qu'une vérification est impossible — l'exécuter.

| Ressource | État |
|---|---|
| Distro | WSL2 `Ubuntu` 26.04, systemd actif |
| Docker | Engine natif Linux + Compose (pas Docker Desktop) |
| Node | v22, dans `~/.local/bin` |
| Supabase local | Postgres 15.8, projet `lastchance` |
| Playwright | chromium + WebKit — `mobile-chrome`, `mobile-safari`, `desktop-smoke` |

**Deux arbres, ne pas les confondre.** `~/workspaces/lastchance` (WSL) est le
clone de référence : c'est là que tournent Docker, pgTAP et l'app. Le répertoire
Windows `C:\Users\MISHOW\Documents\LastChance\Lastchance` est le point d'entrée
de session et **peut être en retard sur `origin/main`** — vérifier avant d'agir.

### Les cinq pièges qui coûtent le plus

Les douze sont dans la skill **`environnement-wsl`** ; ceux-ci sont ceux qu'on
paie le plus souvent.

1. **`bash -l` obligatoire** — Node vit dans `~/.local/bin`, absent du PATH d'un
   shell non-login : `npx` retombe sur le `npx.cmd` Windows et échoue sur
   « chemins UNC non pris en charge ».
2. **Une seule invocation `wsl` par tâche, jamais de commande inline** — la
   distro s'éteint entre deux appels, et le quoting PowerShell mange guillemets
   et `$`. Écrire un `.sh`, puis l'appeler.
3. **`supabase db reset` NE SÈME RIEN** — appliquer le seed explicitement, sinon
   l'app tourne sur une base vide et tous les E2E échouent sans cause visible.
4. **« no tests » n'est pas une suite vide** — c'est le cache
   `node_modules/.vite` corrompu. Purger et rejouer **avant** de conclure quoi
   que ce soit. Le piège est qu'il ressemble à un succès.
5. **Jamais deux runs de test concurrents sur le même arbre** — Vitest côté
   Windows, `.next` côté WSL. Deux agents télescopés donnent un cache corrompu
   ou `ENOENT _buildManifest`.

## Boucle de vérification

**Local d'abord, CI en recours.** La CI distante coûte l'aller-retour ; on y
bascule quand le local est bloqué (Docker/WSL gelé, RAM saturée) ou pour la
suite E2E complète. Détail et durées dans la skill **`verification-locale`**.

```bash
npm run typecheck                  # ~20 s
npm run lint                       # ~15 s
npx vitest run <chemin>            # ciblé, secondes
npm test                           # complet, ~55 s
```

**Dès qu'une migration est touchée** — ces deux gardes échouent en secondes là
où la CI met huit minutes :

```bash
npm run sql:check && npm run migrations:check
node scripts/generate-db-types.mjs --local   # et NON `npm run types:generate`,
                                             # qui interroge la PRODUCTION
```

## Périmètres

Un changement se traite dans le périmètre qui lui correspond — sous forme de
sous-agent (Claude Code), de skill (Antigravity) ou d'agent Codex, selon l'outil.
Les briefs font foi dans `.claude/agents/` et sont dérivés en skills par
`node .agents/scripts/sync-skills-depuis-agents.mjs`.

| Périmètre | Couvre |
|---|---|
| `db-supabase` | Schéma, migrations SQL, RLS, triggers, seed, tests SQL (`supabase/`) |
| `backend-api` | Server actions, routes API, logique métier `src/lib/` (hors Stripe) |
| `frontend-ui` | Composants React, pages App Router, Tailwind, roue 3D, dashboard, parcours joueur, site public `site/` |
| `stripe-billing` | Stripe : webhooks, abonnements, checkout, billing |
| `vercel-release` | Vercel : env, previews, production, logs, promotion, rollback |
| `qa-verify` | Typecheck, lint, Vitest, Playwright, build — valide chaque chantier |
| `security-review` | Revue sécurité **lecture seule** : multi-tenant, RLS, endpoints publics |
| `docs-scribe` | Documentation `docs/`, ADR, bugs, état de session |

- Tâche transverse → découper ; les périmètres disjoints se traitent en parallèle.
- Changement significatif → `qa-verify` valide.
- Auth / RLS / endpoint public / webhook / token → aussi `security-review`.
- Livraison → `vercel-release`, **après** QA.
- Fin de chantier notable → `docs-scribe`.

## Orchestration

- **Codex pilote** ses propres agents pour les audits, l'analyse, l'architecture,
  la qualité et les changements significatifs. Un audit complet mobilise les
  regards pertinents ; un audit ciblé, seulement ceux qui apportent une preuve
  utile. Avant un travail significatif, annoncer l'agent choisi et pourquoi.
- **Claude Code et Antigravity restent autonomes.** Ils récupèrent les décisions
  et le dernier état dans `docs/codex-handoff.md`, puis choisissent eux-mêmes
  leurs agents, leur modèle et leur déroulement. Codex ne se connecte pas à leurs
  sessions et ne modifie ni leurs réglages ni leurs autorisations.
- Après chaque audit, proposition ou décision, **mettre à jour
  `docs/codex-handoff.md`** avec l'état réel et le travail restant.
- Toute proposition précise le constat ou l'hypothèse **vérifiable**, le bénéfice
  concret pour commerçant ou joueur, la priorité, le coût et le risque. Les
  propositions sans valeur démontrable sont écartées.

## Contrat de livraison

- Diff minimal, aucune refonte opportuniste.
- Travailler sur la branche explicitement demandée. Priorité : simplicité,
  stabilité, qualité du code, expérience commerçant.
- Entrées externes validées, isolation multi-tenant préservée, aucun secret ni
  renseignement personnel dans les logs et les réponses.
- Une migration Supabase est appliquée et vérifiée **avant** le code de
  production qui en dépend.
- Un déploiement de production, une promotion, un rollback ou une mutation
  financière Stripe exige une **demande explicite** de l'utilisateur.
- Ne jamais déployer un arbre de travail sale sans avoir isolé et confirmé les
  changements inclus.
- Toute livraison significative se termine par les vérifications adaptées, un
  résumé des fichiers touchés, des commandes exécutées et des risques résiduels.

## Où vivent les réglages

| Outil | Lit | Contient |
|---|---|---|
| Tous | `AGENTS.md` | ce fichier |
| Antigravity | `.agents/skills/`, `.agents/hooks.json` | skills dérivées + 2 écrites à la main, 4 hooks |
| Claude Code | `CLAUDE.md`, `.claude/` | sous-agents, hooks, permissions, orchestrateur |
| Codex | `AGENTS.md` | ce fichier |

`.agents/README.md` détaille les hooks et leur interrupteur.
