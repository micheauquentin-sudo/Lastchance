# Chaîne d'approvisionnement logicielle (supply chain)

Revue complète des dépendances réalisée le 2026-07-10.

## 1. Inventaire et dépendances inutilisées

Chaque dépendance de `package.json` a été confrontée aux imports réels du
code (`src/`, `e2e/`, fichiers de config racine) :

- **15 dépendances runtime** : toutes utilisées, hormis `three` qui ne
  sert plus que la mascotte Lumoz démontée (fichiers dormants
  `src/components/marketing/lumoz-*`). `react-dom` n'apparaît
  dans aucun import direct mais est une peer dependency obligatoire de
  Next/React (rendu client) — à conserver.
- **18 devDependencies** : utilisées (Playwright, Tailwind/PostCSS, types,
  ESLint, TypeScript, Vitest, outillage E2E
  `local-ssl-proxy`/`wait-on`/`pngjs`), sauf `@gltf-transform/*` qui ne
  sert plus que le pipeline de la mascotte Lumoz démontée
  (`scripts/lumoz-paint-glb.mjs`).
- **Aucun import fantôme** : tout paquet importé dans le code est déclaré
  dans `package.json` (pas de dépendance transitive utilisée directement).

**Résultat : `three` (runtime) et `@gltf-transform/*` (dev) ne servent
plus que la mascotte Lumoz démontée — à supprimer ou à réactiver.** Le
reste du périmètre est minimal.

## 2. Vulnérabilités corrigées

État initial : `npm audit` remontait 3 entrées « moderate », toutes causées
par une seule vulnérabilité réelle :

| Advisory | Paquet | Sévérité | Chemin |
| --- | --- | --- | --- |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — XSS via `</style>` non échappé dans la sortie stringify | `postcss` < 8.5.10 | Modérée (CVSS 6.1) | `next@16.2.10` épingle `postcss@8.4.31` en interne (les entrées `next` et `@sentry/nextjs` de l'audit ne sont que la propagation) |

**Correctif** : `next@16.2.10` étant déjà la dernière version stable, un
[`override` npm](../package.json) force `postcss@^8.5.10` dans l'arbre de
`next`. PostCSS 8.x a une API stable ; typecheck, lint, 98 tests et build
de production revérifiés après coup.

```json
"overrides": { "next": { "postcss": "^8.5.10" } }
```

À retirer quand une version de Next embarquera nativement postcss ≥ 8.5.10
(vérifier avec `npm ls postcss` après montée de version).

État final : **0 vulnérabilité** (`npm audit`).

## 3. Surveillance continue

- **Dependabot** ([.github/dependabot.yml](../.github/dependabot.yml)) :
  PR hebdomadaires (lundi matin) pour npm et pour les actions GitHub de la
  CI. Patches/mineures regroupées en une PR ; les majeures restent
  individuelles. Les alertes de sécurité Dependabot ouvrent des PR dès
  publication d'une advisory, indépendamment du planning.
- **CI** ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) : sur
  chaque PR et push sur `main` — installation reproductible (`npm ci`),
  typecheck, lint, tests, build, et un job `npm audit
  --audit-level=moderate` qui fait échouer la CI dès qu'une vulnérabilité
  modérée ou plus touche le lockfile.

## 4. Bonnes pratiques en place

- `package-lock.json` commité → installations reproductibles (`npm ci`).
- Versions en plages `^` (semver) + lockfile : les montées de version
  passent par des PR Dependabot revues, jamais silencieusement.
- Aucun script `postinstall` custom dans le projet.
- Secrets absents du dépôt (`.env*` gitignoré — voir
  [security-audit.md](./security-audit.md)).
