---
name: verification-locale
description: >-
  Boucle de vérification du projet Lastchance : quoi lancer, dans quel ordre,
  avec quelles durées attendues, pour prouver qu'un changement tient — typecheck,
  lint, Vitest, gardes SQL statiques, pgTAP, E2E ciblé, build. À charger avant
  de valider un chantier, quand la CI est rouge, ou pour décider entre vérifier
  en local et pousser sur la CI distante.
---

# Boucle de vérification

**Local d'abord, CI en recours.** La CI distante n'est pas le premier réflexe :
elle coûte l'aller-retour. On y bascule quand le local est bloqué (Docker ou WSL
gelé, RAM saturée) ou pour la suite E2E complète.

## Ordre, du moins cher au plus cher

| Étape | Commande | Durée | Quand |
|---|---|---|---|
| Typecheck | `npm run typecheck` | ~20 s | après tout changement TS |
| Lint | `npm run lint` | ~15 s | idem |
| Gardes SQL statiques | `npm run sql:check` puis `npm run migrations:check` | secondes | dès qu'une migration est touchée |
| Vitest ciblé | `npx vitest run <chemin>` | secondes | périmètre modifié |
| Vitest complet | `npm test` | ~55 s | validation finale d'un chantier |
| pgTAP | voir skill `environnement-wsl` | ~15 s | schéma, RLS, fonctions Postgres |
| E2E ciblé | `scripts/run-e2e-local.sh --project=mobile-chrome <spec>` | minutes | parcours touché |
| Build | `npm run build` | lourd | avant livraison |

## Les gardes qui échouent en secondes là où la CI met huit minutes

Dès qu'un fichier de `supabase/migrations/` est touché :

```bash
npm run sql:check        # COALESCE/GREATEST/LEAST/NULLIF qualifiés pg_catalog.
npm run migrations:check # ordre des migrations
```

`pg_catalog.COALESCE(...)` **passe** l'application de la migration et casse au
premier appel réel. C'est exactement l'erreur qu'on ne veut pas découvrir en
ligne.

**Puis régénérer les types** — et attention au piège :

```bash
node scripts/generate-db-types.mjs --local   # ✅ la base locale
npm run types:generate                       # ❌ interroge la PRODUCTION (--linked)
```

`npm run types:generate` interroge la production, où les migrations de la
branche ne sont pas appliquées. Sans les types régénérés, les clients serveur
deviennent non typés et seule la CI l'attrape. Commiter
`src/types/database.generated.ts`.

## Deux pièges qui font mentir le résultat

1. **« no tests » n'est pas une suite vide.** C'est le symptôme du cache
   `node_modules/.vite` corrompu. Purger et rejouer **avant** de conclure :
   `rm -rf node_modules/.vite`. Le piège est qu'il ressemble à un succès — la
   suite se termine sans rouge.
2. **Jamais deux runs concurrents sur le même arbre** (Vitest côté Windows, E2E
   côté WSL). Deux agents télescopés produisent un `.vite` corrompu ou un
   `ENOENT _buildManifest`. Un seul run à la fois par arbre ; en parallèle,
   utiliser l'autre copie.

Juger un run E2E par `test-results/.last-run.json`, jamais par la sortie d'un
pipe (voir piège 10 de la skill `environnement-wsl`).

## Modifier CLAUDE.md

Le plafond de contexte est gardé mécaniquement :

```bash
npx vitest run src/lib/claude-md-budget.test.ts
```

Le dernier chantier **remplace** le précédent dans `## Last Updated` ; l'ancien
part en tête de `docs/journal.md`. **Ne pas relever le plafond** pour faire
passer un ajout — c'est le geste, répété une trentaine de fois, qui a produit
les 39 000 tokens que ce test existe pour empêcher.

## Ce qu'une validation doit produire

Un rapport court, pas un listing : `N tests ✓, typecheck 0, build OK, commit
{hash}`. Si c'est rouge : corriger, relancer, et résumer le correctif en une
ou deux phrases. Jamais de dump de fichier ni de snapshot de code — ce qui est
recopié doit être relu.
