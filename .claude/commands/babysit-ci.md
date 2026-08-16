---
description: Surveille la CI d'une PR jusqu'au vert, corrige si rouge, fusionne sur l'ordre permanent, puis vérifie la santé post-déploiement.
argument-hint: "[numéro de PR] (sinon : la PR de la branche courante)"
---

# Babysit CI → fusion → santé

Conçue pour tourner en boucle : `/loop /babysit-ci` (auto-cadencée) ou
`/loop 10m /babysit-ci`. **Cadence : 8 à 10 minutes.** Une CI complète de ce
dépôt (E2E Chromium+WebKit, pgTAP, CodeQL, build, audit, site) prend plusieurs
minutes ; se réveiller toutes les minutes coûte un aller-retour de contexte
complet pour lire « en cours » — la même information, six fois plus cher.

Cible : `$ARGUMENTS` s'il porte un numéro de PR, sinon la PR de la branche
courante.

## Le principe

À chaque réveil, **établir l'état réel, agir une fois, puis rendre la main.**
Ne jamais dérouler les étapes suivantes « par anticipation » : si la CI tourne
encore, l'unique action correcte est de le dire et d'attendre.

## 1 · Établir l'état — sur le SHA, jamais sur la pastille

```bash
gh pr view <n> --json number,headRefName,headRefOid,mergeable,mergeStateStatus,state,url
gh run list --branch <branche> --limit 5 --json databaseId,headSha,status,conclusion,workflowName,createdAt
```

**La pastille verte ment.** Ce piège s'est produit trois fois sur ce dépôt : un
run vert affiché alors qu'il portait sur un SHA antérieur. **Comparer
`headSha` du run à `headRefOid` de la PR.** Si aucun run ne porte le SHA de
tête, la CI n'a pas été déclenchée — ce n'est pas « en attente ».

Le 2026-08-06, la file d'attente GitHub a cessé de prendre les événements
pendant cinq heures et quatre commits sont partis en production sans CI. C'est
pour ce cas que `ci.yml` porte un `workflow_dispatch` :

```bash
gh workflow run ci.yml --ref <branche>   # après ~10 min sans run sur le bon SHA
```

Si `gh` est introuvable (fréquent dans un shell de fond), reprendre le chemin
complet déclaré dans `.claude/settings.json`.

## 2 · Agir selon l'état

**En cours** → une ligne (quels jobs restent, depuis combien de temps), puis
attendre. Aucune autre action.

**Rouge** → lire les logs du job tombé, pas seulement son nom :

```bash
gh run view <id> --log-failed
```

Diagnostiquer, corriger, commiter, pousser — puis reprendre au point 1 au
réveil suivant. Trois causes récurrentes, à écarter avant de suspecter le code :

- **dérive des types** — le job `PostgreSQL · ACL · RLS` échoue sur
  `database.generated.ts`. Correctif : `node scripts/generate-db-types.mjs --local`
  (pas `npm run types:generate`, qui interroge la production), puis commiter.
  L'artefact `database-generated-types` du job porte déjà le bon fichier.
- **advisory npm ambiante** — le job `audit` rougit sans qu'on ait touché aux
  dépendances (sharp, dompurify…). Correctif : bump du lockfile ou `overrides`,
  à cherry-picker sur toutes les PR ouvertes.
- **E2E flaky** — rejouer le spec isolément avant de conclure. Les traces sont
  publiées en artefact `playwright-traces` sur échec ; elles disent en un coup
  d'œil ce qu'un « element not found » cache.

**Verte sur le bon SHA** → passer au point 3.

## 3 · Fusionner — ordre permanent

Le propriétaire a donné un ordre permanent : **« migre tout dès la réponse de
la CI »**. CI intégralement verte sur le SHA de tête ⇒ fusionner en squash,
sans redemander.

```bash
gh pr merge <n> --squash --delete-branch
```

Deux conditions d'arrêt qui priment sur l'ordre permanent :

- `mergeStateStatus` vaut `DIRTY`/`BLOCKED` (conflit) — **s'arrêter et le dire.**
  Sur ce dépôt, une branche fille chaînée derrière une PR déjà squashée devient
  `CONFLICTING` sans que la CI `pull_request` ne parte jamais : merger d'abord
  `origin/main` dans la fille, attendre la re-CI, et seulement ensuite fusionner.
- La PR porte une **migration** — vérifier que l'ordre est tenable : la migration
  doit précéder la promotion du build, sinon fenêtre de `42703` côté joueur.

## 4 · Après la fusion — la santé, pas l'espoir

Récupérer le SHA de squash, puis surveiller **sur ce SHA** :

- la CI `main` ;
- le workflow **« Santé après déploiement »**, déclenché par le
  `deployment_status` de production (il joue `scripts/verify-production-health.mjs`).

Si la PR portait une migration, confirmer qu'elle est appliquée en production.
Ensuite seulement, `main` local est à remettre à jour — `gh pr merge` laisse le
dépôt local en arrière.

## 5 · Terminer la boucle

**Arrêter** dès que l'un de ces états est atteint, en le disant :

- fusionnée **et** santé post-déploiement verte → c'est fini ;
- conflit, ou CI rouge pour une cause qui demande un arbitrage produit ;
- trois réveils sans le moindre changement d'état → l'attente n'apporte plus
  rien, remonter la situation.

## Bornes — ce que cette boucle ne fait jamais seule

L'autonomie accordée s'arrête à la fusion. **Jamais sans demande explicite :**
rollback ou promotion Vercel, migration appliquée à la main en production,
action Stripe, `--force` sur quoi que ce soit, réécriture d'historique.
En cas de doute sur l'un de ces gestes : s'arrêter et demander.
