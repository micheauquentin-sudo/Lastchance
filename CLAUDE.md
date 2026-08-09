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

## Environnement d'exécution — Docker + Linux disponibles (vérifié 2026-07-28)

**La contrainte historique est levée.** Toutes les mentions antérieures du type
« pgTAP / E2E JAMAIS EXÉCUTÉS — Docker exige un build Windows ≥ 19045, cette
machine est figée en LTSC 2021 / 19044 » sont **périmées** : Docker ne tourne plus
via Docker Desktop mais **nativement dans WSL2**, ce qui contourne l'exigence de
build Windows. Ne plus jamais écrire qu'une vérification est impossible faute de
Docker — l'exécuter.

| Ressource | État vérifié |
|---|---|
| Distro | WSL2 `Ubuntu` 26.04 LTS, noyau 6.18, **systemd actif** |
| Docker | Engine **29.6.2** natif Linux + Compose v5.3.1 (pas Docker Desktop) |
| Node | **v22.22.1** / npm 10.9.4, dans `~/.local/bin` |
| Stack Supabase locale | démarrée, Postgres 15.8, projet `lastchance` — pour la migration en tête, lire `EXPECTED_MIGRATION` dans `src/lib/release.ts`, pas ce tableau (le chiffre qui figurait ici était périmé de trois migrations) ; pgTAP vérifié le 2026-08-08 à **56 fichiers / 3203 assertions** PASS (le compte « 22 fichiers, 1804 assertions » plus bas dans ce document date du 2026-07-28 et est périmé) |
| Playwright | **chromium + WebKit 26.5** (+ headless shell, ffmpeg) — les trois projets `mobile-chrome`, `mobile-safari` et `desktop-smoke` sont jouables en local |

### Dépôt de travail Linux
- **`~/workspaces/lastchance`** = le clone à utiliser : remote GitHub réel,
  `node_modules` Linux installés, `.next` construit. C'est là que tournent
  Docker, pgTAP et l'app.
- `~/lc` — supprimé le 2026-07-28. C'était un miroir du répertoire Windows en
  HEAD détaché ; son seul travail unique s'est révélé être un brouillon déjà
  dépassé par `main`. Ne pas le recréer.
- Le répertoire Windows `C:\Users\MISHOW\Documents\LastChance\Lastchance` reste
  le point d'entrée de session, mais peut être en retard sur `origin/main`.
  Vérifier avant d'agir.

### Douze pièges, appris à la dure
1. **`bash -l` obligatoire.** Node vit dans `~/.local/bin`, absent du PATH d'un
   shell non-login : `npx` retombe alors sur le `npx.cmd` **Windows** via
   l'interop et échoue sur « chemins UNC non pris en charge ».
2. **Une seule invocation `wsl` par tâche.** La distro s'éteint entre deux
   appels : les conteneurs Supabase redémarrent et Postgres repart en recovery
   (~20 s). Attendre la santé de `supabase_db_lastchance` en début de script.
3. **Ne pas passer de commande inline.** Le quoting PowerShell → `wsl.exe` mange
   guillemets, `$` et parenthèses. Écrire un `.sh` dans le scratchpad puis
   `wsl -d Ubuntu -- bash -l /mnt/c/<chemin>/script.sh`.
4. **`supabase db reset` NE SÈME RIEN.** `supabase/config.toml` porte
   `[db.seed] enabled = false` : la CI applique le seed explicitement
   (`psql -f supabase/seed.sql`), il faut faire pareil en local. Sans cela l'app
   tourne sur une base **vide** et tous les E2E échouent sans cause visible.
5. **Attendre un Postgres qui RÉPOND, pas seulement « healthy ».** Le conteneur
   passe `healthy` avant d'accepter les connexions. Boucler sur
   `psql -tAc "select 1;"` en tête de script, jamais sur `docker inspect` seul —
   sinon on lit une base à moitié levée et on en tire de fausses conclusions.
6. **Un `supabase test db` interrompu laisse un conteneur `pg_prove` orphelin
   qui GÈLE tous les runs suivants** — sans message, sans erreur : la commande
   semble simplement ne jamais finir. Trois « échecs » d'une même soirée
   venaient de là (2026-07-30). Nettoyer AVANT toute campagne de tests, et ne
   toucher qu'aux conteneurs non `supabase_` :
   ```bash
   for id in $(docker ps --format '{{.ID}} {{.Names}}' | grep -v supabase_ | awk '{print $1}'); do
     docker stop -t 5 "$id"
   done
   ```
   Symptômes voisins, à ne pas confondre : le service WSL qui expire
   (`Wsl/Service/0x8007274c` → `wsl --shutdown` puis relance) et une base
   laissée sans `supabase_migrations.schema_migrations` après un reset coupé
   (→ `supabase stop --no-backup` puis `supabase start`).
7. **Semer AVANT pgTAP.** La CI le fait depuis le 2026-07-29 et la suite doit
   passer sur base **vide ET semée** : cinq assertions en dépendaient sans le
   dire, vertes en CI par accident d'ordonnancement des jobs, rouges chez tout
   développeur ayant semé sa base.
8. **Le démon Docker de WSL2 peut geler sans message** (2026-07-31) — voisin
   du piège 6 mais distinct : pas un conteneur `pg_prove` orphelin, le démon
   lui-même. Symptôme : `docker ps -a` ne rend plus la main et le script reste
   bloqué sur sa toute première commande, sans erreur. Pour trancher entre
   « la sortie bufferise » et « c'est gelé », regarder la **date de
   modification du fichier de sortie** — 26 min sans qu'elle bouge, zéro
   octet, confirme le gel. Remède : `wsl --shutdown` puis relance (pas le
   nettoyage de conteneurs du piège 6, qui ne s'applique pas ici).
9. **WSL se fige sous charge lourde** (build + serveur + Playwright + les
   conteneurs Docker en même temps) (2026-07-31) — deux symptômes constatés
   la même journée : le démon Docker seul (piège 8, `docker ps` ne rend plus
   la main), puis le **service WSL entier** (`Wsl/Service/0x8007274c`).
   Même remède : `wsl --shutdown` puis relance. Même diagnostic que le
   piège 8 pour séparer « ça travaille » de « c'est gelé » : la **date de
   modification du fichier de sortie**, jamais son contenu. **Conséquence
   pratique adoptée** : local d'abord — pgTAP (~15 s) et l'E2E **ciblé**
   via `scripts/run-e2e-local.sh` (6 Go WSL + swap le rendent jouable) ; la
   CI distante en recours (suite E2E complète, build lourd, ou gel WSL).
10. **Un `| tail` en fin de script E2E WSL simule un gel** (2026-08-09) — le
    tube reste tenu par `next-server`, vivant après la fin du run : le
    script ne rend jamais la main bien que la suite ait fini. Écrire dans
    un **fichier**, juger par `test-results/.last-run.json`, jamais par un
    pipe.
11. **`/tmp` de la distro est VIDÉ à chaque coupure entre invocations
    `wsl`** (2026-08-09, conséquence du piège 2) — loger sous `/mnt/c/...`
    ou le dépôt, jamais `/tmp`.
12. **Jamais deux runs Vitest concurrents sur le même arbre Windows**
    (2026-08-09) — cache `.vite` corrompu : **261 fichiers « no tests »**
    alors que la suite est verte isolément. Un seul run à la fois sur cet
    arbre ; en parallèle, utiliser la copie WSL. Le symptôme est réapparu
    le 2026-08-09 après-midi **sans run concurrent** : au moindre
    « no tests », purger `node_modules/.vite` et rejouer avant de conclure
    quoi que ce soit sur l'état de la suite.

### Commandes de référence

Reproduire l'ordre de la CI en local (reset → seed → suite) :

```powershell
# reset, seed, puis suite complete
wsl -d Ubuntu -- bash -lc "cd ~/workspaces/lastchance && npx --no-install supabase db reset --no-seed && docker exec -i supabase_db_lastchance psql -U postgres -d postgres -q -f - < supabase/seed.sql && npx --no-install supabase test db"
```

```powershell
# pgTAP complet — 56 fichiers, 3203 assertions PASS (vérifié le 2026-08-08)
wsl -d Ubuntu -- bash -lc "cd ~/workspaces/lastchance && npx --no-install supabase test db"
# Docker depuis PowerShell : le shim %APPDATA%\npm\docker.cmd relaie vers WSL
docker ps
```
E2E : les trois projets tournent. WebKit a été installé le 2026-07-28 via
`~/install-webkit.sh` (238 paquets système, `sudo` interactif obligatoire) et
vérifié : il démarre en headless et `mobile-safari` collecte 60 tests sur 20
fichiers. Deux pièges si l'installation est à refaire : `sudo` remet un `PATH`
minimal alors que `node`/`npx` vivent dans `~/.local/bin`, et le navigateur doit
être installé **en tant qu'utilisateur** sinon son cache atterrit dans
`/root/.cache` où Playwright ne le cherche pas.

**Vérifié le 2026-07-28 dans `~/workspaces/lastchance`** : `npm run typecheck`
→ 0 ; `npm test` → **83 fichiers, 1318 tests verts** (55 s) ; Playwright
1.61.1. Le compte pgTAP a évolué depuis : **56 fichiers / 3203 assertions
PASS**, vérifié le 2026-08-08 (chantier « Partage après jeu »).

## Development Guidelines
- Travailler sur la branche explicitement demandée pour la tâche en cours
- Priorité : simplicité, stabilité, qualité du code, expérience commerçant
- Après chaque fonctionnalité : vérifier (tests, typecheck, lint, build), corriger, documenter
- **Vérifier en local d'abord** : typecheck, tests, pgTAP et E2E ciblé (`scripts/run-e2e-local.sh`, `--project`/spec pour rester léger sur 8 Go) dans WSL ; la CI distante n'est le **recours** qu'en cas de blocage local (Docker/WSL gelé, RAM saturée), pas le premier réflexe — on gagne l'aller-retour.
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
- **Date**: 2026-08-09
- **Dernier chantier**: **Correctif V1.54.1 — bouton « Voir le jeu »** (branche `chantier/bouton-voir-le-jeu`, commit `2dfe831`, PR à ouvrir, sans migration), 2026-08-09. Demande propriétaire immédiate après V1.54 : accéder au jeu côté joueur depuis le haut de la page. Composant frère `VoirLeJeu` dans `src/components/dashboard/atelier-raccourci.tsx` — bouton « 👀 Voir le jeu » à côté de « 🛠️ Modifier dans l'atelier » dans les 8 tuiles Statut, masqué tant que le jeu n'est pas accessible ; les 8 pages passent `hrefJeu` = leur lien `apercu` existant (aucune règle recalculée) ; roue = `/play/<slug>` du premier QR. Pas de revue sécurité : rien d'auth/RLS/public/webhook/token touché (décision explicite). Preuve : typecheck 0, lint 0, Vitest **261 fichiers / 4131 tests**, build vert, E2E WSL atelier-modules + campaign-templates 26 passed / 3 skipped. Roadmap V1.54.1.
  **Reste ouvert** : PR à ouvrir vers `main`, fusion sur l'ordre permanent dès CI verte. Deux gestes propriétaire hérités : révoquer la clé `rk_live_` et le jeton de contournement Vercel.
> **L'historique complet des chantiers vit dans [`docs/journal.md`](./docs/journal.md).**
> Il en a été extrait le 2026-08-05 : il pesait **39 062 tokens sur les 42 971 de
> ce fichier — 91 %** — et grossissait d'environ 5 500 tokens par chantier, payés
> une fois par session **et une fois par agent**, soit près de 273 000 tokens de
> prefill par chantier à six agents.
>
> **Ne rien empiler ici.** Le dernier chantier **remplace** le précédent, qui
> part en tête de `docs/journal.md`. Le plafond est gardé mécaniquement par
> `src/lib/claude-md-budget.test.ts` : dépasser le budget fait rougir la CI.
