# Chaîne d'approvisionnement logicielle (supply chain)

Revue complète des dépendances réalisée le 2026-07-10.

## 1. Inventaire et dépendances inutilisées

Chaque dépendance de `package.json` a été confrontée aux imports réels du
code (`src/`, `e2e/`, fichiers de config racine) :

- **15 dépendances runtime** : toutes utilisées. `react-dom` n'apparaît
  dans aucun import direct mais est une peer dependency obligatoire de
  Next/React (rendu client) — à conserver. `passkit-generator` (ajout
  2026-07-21) signe les pass Apple Wallet (src/lib/apple-wallet.ts),
  inactif sans certificats APPLE_WALLET_*.
- **16 devDependencies** : toutes utilisées (Playwright, Tailwind/PostCSS,
  types, ESLint, TypeScript, Vitest, outillage E2E
  `local-ssl-proxy`/`wait-on`/`pngjs`).
- **Aucun import fantôme** : tout paquet importé dans le code est déclaré
  dans `package.json` (pas de dépendance transitive utilisée directement).

**Résolu le 2026-08-18 (MORT-2)** : la mascotte Lumoz a été supprimée, et
avec elle tout ce qui ne servait qu'à elle — `three` + `@types/three`
(runtime/dev), `@gltf-transform/core` + `@gltf-transform/functions` (dev),
`src/components/marketing/lumoz-{guide.tsx,model.ts}`,
`scripts/lumoz-paint-glb.mjs` et `public/lumoz.glb` (812 Ko servis
publiquement). **Et la permission CSP qui n'existait que pour elle** :
`'wasm-unsafe-eval'`, ouverte sur les trois surfaces dont `sensitive`
(back-office), pour le décodeur meshopt du modèle 3D. Une dépendance morte se
voit dans `package.json` ; une PERMISSION morte ne se voit nulle part, et
c'est elle qui coûtait le plus cher.

Ce qui a été vérifié avant de retirer la directive : aucune occurrence de
`WebAssembly`, `.wasm`, `meshopt` ou `draco` dans `src/` ni `e2e/`, et la roue
est du canvas 2D — `three` n'était importé que par `lumoz-model.ts`.

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

> **Cet override vaut aujourd'hui `^8.5.25`, et il est GLOBAL, plus seulement
> scopé à `next`.** La forme ci-dessus est conservée parce qu'elle documente le
> raisonnement d'origine ; les chiffres, eux, ont bougé — voir la section
> suivante, qui explique pourquoi ils bougeront encore.

## 2bis. Le piège des overrides : un plancher qui devient le problème

**Consigné le 2026-08-03, après que le motif se soit produit TROIS FOIS dans la
même journée.** Ce n'est pas une anecdote d'exploitation : c'est une propriété
structurelle de la façon dont les advisories évoluent, et elle se reproduira.

| override | valait | plage vulnérable au moment de l'alerte |
| --- | --- | --- |
| `brace-expansion` | `^5.0.8` | `4.0.0 - 5.0.8` |
| `fast-uri` | `^3.1.4` | `3.0.0 - 3.1.4` |
| `postcss` | `^8.5.10` (scopé `next`) | `<= 8.5.22` |

Les trois overrides pointaient **exactement sur la borne haute de la plage
vulnérable**, ou dessous. Ce n'est pas une coïncidence, et ce n'est la faute de
personne : on pose un override sur « la version corrigée du jour », puis
l'advisory est **élargie vers le haut** quand on découvre que ce correctif était
incomplet. Les trois advisories du 2026-08-03 sont d'ailleurs toutes des
*incomplete fix* d'une CVE antérieure — c'est le cas NORMAL, pas l'exception.

Conséquence : **un override écrit pour protéger devient le plancher du
problème.** Il fige l'arbre sur une version que l'advisory finit par couvrir, et
il le fait en silence, puisque rien ne relit un override une fois posé.

### Le corollaire, mesuré deux fois le même jour

Le caret `^3.1.4` autorisait **déjà** `3.1.5`, et `^8.5.10` autorisait **déjà**
`8.5.25`. Les deux arbres résolvaient pourtant la version vulnérable : c'est le
**lockfile** qui décidait. Une contrainte permissive ne suffit donc pas — il faut
monter la contrainte pour forcer la régénération du lock.

### Ce qu'il faut faire quand `npm audit` rougit sur un paquet déjà overridé

1. **Lire la plage de l'advisory, pas seulement le numéro « corrigé dans ».**
   Si l'override est dans la plage, c'est lui qu'il faut monter.
2. **Vérifier qu'un correctif existe dans la ligne majeure courante** avant
   d'accepter un bump majeur. `fast-uri` avait `3.1.5` ; `npm` proposait `4.1.2`,
   inutile ici. Pour `postcss`, `npm audit fix --force` annonçait
   `next@9.3.3` — une **rétrogradation de sept majeures** de Next, parce que npm
   remonte la chaîne `postcss → next → @sentry/nextjs` et ne trouve pas d'autre
   point de coupe. Ce n'est pas un correctif, c'est la destruction de l'app pour
   fermer une advisory modérée.
3. **Vérifier la PORTÉE de l'override.** Celui de `postcss` était scopé à `next`
   alors que `@tailwindcss/postcss` et `vite` le tirent aussi : il ne fermait
   qu'un tiers de l'arbre.
4. **Rejouer les DEUX audits.** Le job CI en lance deux — la racine et `site/`,
   qui a son propre `package.json` et son propre lockfile. `npm audit` à la
   racine ne dit **rien** du sous-projet ; une correction partielle laisse la CI
   rouge et fait croire à un correctif inefficace.
5. **Ne pas se fier à la couleur d'un check sans regarder sa DATE.** Sur une PR
   Dependabot, `gh pr checks` a affiché « pass » pour un `npm audit` joué quinze
   heures plus tôt, donc avant publication des advisories. Sur une PR de
   dépendances, **l'âge du check compte autant que sa couleur** : les advisories
   bougent sans que le code change.

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
