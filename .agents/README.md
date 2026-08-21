# `.agents/` — personnalisations Antigravity

Antigravity découvre ses personnalisations dans `.agents/` (ou `.agent/`,
`_agents/`, `_agent/`) en remontant du répertoire courant jusqu'à la racine du
dépôt, plus `AGENTS.md` / `GEMINI.md` comme règles toujours actives. **Il ne lit
ni `CLAUDE.md` ni `.claude/`.** C'est la raison d'être de ce dossier : sans lui,
l'agent Antigravity travaillait sur ce dépôt sans rien connaître de son
environnement WSL, de ses pièges, ni de ses gardes.

| Chemin | Rôle |
|---|---|
| `hooks.json` | Câblage des quatre hooks |
| `hooks/` | Leur code (Node, ESM) |
| `scripts/sync-skills-depuis-agents.mjs` | Dérive `.agents/skills/` depuis `.claude/agents/` |
| `skills/environnement-wsl/` | Les douze pièges, les commandes de référence |
| `skills/verification-locale/` | L'ordre des vérifications, les gardes SQL, les types |
| `skills/<périmètre>/` | Les huit briefs d'agents, **dérivés** — ne pas éditer ici |
| `.etat/` | État local des hooks (ignoré par git) |

Le socle toujours actif — environnement, pièges principaux, boucle de
vérification, périmètres, contrat de livraison — est dans **`AGENTS.md`** à la
racine, lu par Antigravity, Codex et (par import) Claude Code.

## Les skills dérivées

Les huit briefs de périmètre ont **une seule source de vérité** :
`.claude/agents/*.md`. Les recopier à la main garantirait qu'au troisième
ajustement les deux versions divergent sans qu'on sache laquelle fait foi.
Après toute modification d'un brief :

```bash
node .agents/scripts/sync-skills-depuis-agents.mjs
```

La conversion retire les clés de frontmatter propres à Claude Code (`model`,
`effort`, `tools`) et garde `name` + `description` — les deux seuls champs
qu'Antigravity exige, la `description` étant ce sur quoi il décide de charger la
skill ou non.

## Les quatre hooks

Ils portent les mêmes gardes que ceux de `.claude/hooks/`, mais **le portage
n'est pas une copie** : les contrats diffèrent, et la différence a dicté le
découpage.

| Hook | Événement | Ce qu'il garde |
|---|---|---|
| `pre-commande.mjs` | `PreToolUse` / `run_command` | Deux runs de test concurrents sur le même arbre (piège 12) |
| `apres-outil.mjs` | `PostToolUse` / `run_command` | Libère le verrou posé ci-dessus |
| `rappels.mjs` | `PreInvocation` | Gardes SQL statiques + régénération des types + budget CLAUDE.md |
| `fin-de-tour.mjs` | `Stop` | L'entrée datée dans `docs/codex-handoff.md` |

**Trois contraintes du contrat Antigravity, et ce qu'elles ont imposé :**

1. `PostToolUse` ne reçoit **ni le nom de l'outil ni sa sortie** (seulement
   `stepIdx` et `error`) et n'admet qu'une réponse vide. Le hook Claude
   `apres-ecriture.mjs`, qui se déclenchait sur « Edit a touché tel chemin », ne
   pouvait donc pas être porté tel quel. Il l'a été sur `PreInvocation`, qui lit
   l'état réel de l'arbre par `git status` — ce qui le rend **meilleur que
   l'original** : une migration modifiée à la main, par un script ou par une
   autre session est désormais couverte, alors que l'original ne voyait que ses
   propres écritures.
2. `PreInvocation` se déclenche avant **chaque** appel au modèle. Répéter le même
   rappel à chaque tour le rendrait invisible à force : `rappels.mjs` ne
   réinjecte que lorsque la **signature** de la situation change, mémorisée par
   conversation dans `.etat/`.
3. `Stop` n'offre qu'un seul levier — `decision: "continue"`, qui **rend la main
   à l'agent**. Un rappel y devient une relance. Pour que ce ne soit pas du
   harcèlement, `fin-de-tour.mjs` ne relance **qu'une fois par conversation** ;
   au deuxième arrêt il se tait définitivement, même si le journal n'a pas bougé.
   Le rappel est une aide, pas une serrure.

**Ce qu'aucun hook ne fait, délibérément :** émettre `decision: "allow"`. Un hook
qui approuve d'office élargirait la politique de permissions de l'utilisateur à
toutes les commandes qu'il croise, `rm -rf` compris. `pre-commande.mjs` ne sait
dire que « demande confirmation » ou rien du tout.

**Ils bloquent la boucle** (les hooks Antigravity sont synchrones). D'où la règle
absolue en tête de `hooks/commun.mjs` : ne jamais échouer bruyamment, toute
erreur interne sort en silence avec le code 0. Un hook cassé qui bloque le
travail est pire que pas de hook.

### Interrupteur

Pour désactiver un hook sans le supprimer, ajouter `"enabled": false` à côté de
son nom dans `hooks.json` :

```json
{ "journal-partage": { "enabled": false, "Stop": [ ... ] } }
```

### Les essayer au tuyau

```bash
cd .agents
echo '{"toolCall":{"name":"run_command","args":{"CommandLine":"npm test"}},"conversationId":"essai"}' | node hooks/pre-commande.mjs
echo '{"conversationId":"essai"}' | node hooks/rappels.mjs
echo '{"conversationId":"essai","fullyIdle":true}' | node hooks/fin-de-tour.mjs
```

`fin-de-tour.mjs` accepte `LASTCHANCE_HOOK_BASE`, `LASTCHANCE_HOOK_HEAD` et
`LASTCHANCE_HOOK_FENETRE_H` pour être testable sans fabriquer un faux
`origin/main` ni attendre douze heures.

## Allowlist de commandes

Antigravity n'hérite pas des ~40 règles de permission de
`.claude/settings.json` : sans allowlist, **chaque commande demande une
approbation**. À coller dans *Settings → Command Allowlist* (les entrées
ci-dessous sont en lecture ou en vérification ; volontairement, ni `git push`,
ni `gh pr merge`, ni `vercel deploy`, ni `supabase db reset` — le contrat de
livraison veut une demande explicite de l'utilisateur pour tout ce qui sort de
la machine).

```text
git status
git diff
git log
git show
git branch
git fetch
git add
git commit
gh pr view
gh pr list
gh pr diff
gh pr checks
gh run list
gh run view
gh issue view
gh issue list
npm run typecheck
npm run lint
npm test
npm run sql:check
npm run migrations:check
npm run casts:check
npm run test:sql
npm run test:casts
npm run test:migrations
npx vitest run
node scripts/generate-db-types.mjs --local
node .agents/scripts/sync-skills-depuis-agents.mjs
docker ps
vercel whoami
vercel ls
vercel env ls
vercel logs
vercel inspect
```

Régler aussi, dans les mêmes réglages : *Tool Execution Policy* sur
`request-review` (et non `always-proceed` — voir le contrat de livraison), et
*Notifications* sur les fins de tâche, pour ne pas surveiller un agent qui
travaille.
