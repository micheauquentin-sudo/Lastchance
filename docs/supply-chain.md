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

**Ajout 2026-09-01 (VIT-18)** : `tesseract.js` 7.0.0, une dépendance runtime,
**chargée en import dynamique uniquement** (`src/components/vitrine/import-ocr.ts`,
lui-même importé dynamiquement par `import-fichier.ts`) — elle ne pèse donc rien
sur le paquet initial et n'est téléchargée que par le commerçant qui dépose une
carte photographiée.

Elle vient avec **4,1 Mo de binaires vendorisés dans `public/ocr/`**, et c'est
la partie qui mérite d'être écrite ici :

| Fichier | Poids | Rôle |
|---|---|---|
| `fra.traineddata` | 1,08 Mo | dictionnaire français, variante `tessdata_fast` |
| `tesseract-core-lstm.wasm` | 2,72 Mo | moteur de reconnaissance |
| `tesseract-core-lstm.js` | ~0,2 Mo | amorçage emscripten du moteur |
| `worker.min.js` | ~0,1 Mo | fil d'exécution de `tesseract.js` |

**Pourquoi vendorisés et non chargés depuis un CDN** : `tesseract.js` va
chercher ces quatre fichiers sur un hôte public **par défaut**, et cet
oubli-là ne casse rien — l'image fait simplement un aller-retour chez un tiers,
sans que personne le voie. La contrainte du lot était « sans service externe » ;
un hôte tiers interrogé depuis le navigateur du commerçant reste un service
externe. Trois chemins (`workerPath`, `corePath`, `langPath`) les ramènent chez
nous, et `import-ocr.test.ts` LIT LA SOURCE pour vérifier qu'aucun `https://`
n'y subsiste — éprouvée par mutation. `public/**` est entré dans
`globalIgnores` d'ESLint à cette occasion : du code minifié vendorisé n'a pas à
être relu par notre linter.

**Ce qui n'a PAS été fait, et qui bloque la fonctionnalité** : ces binaires
compilent du WebAssembly, et la CSP de ce dépôt ne l'autorise plus depuis
MORT-2. Voir `docs/bugs.md`, entrée « la lecture de carte photographiée est
bloquée par la CSP » — la dépendance est bien installée et servie depuis notre
domaine, mais le navigateur refuse de l'exécuter.


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


### La récidive du 2026-09-02 : `fast-uri`, une seconde fois

**Ce paragraphe n'est pas une anecdote de plus : c'est la vérification du
motif.** §2bis annonçait, le 2026-08-03, qu'un override posé sur « la version
corrigée du jour » deviendrait le plancher du problème dès que l'advisory
serait élargie vers le haut — et que ces élargissements sont le cas NORMAL,
puisque la plupart des avis sont des correctifs incomplets d'un avis antérieur.

Trente jours plus tard, quatre advisories couvrant `fast-uri 3.0.0 - 3.1.5`
sont publiées. Notre override valait `^3.1.5` : **exactement la borne haute de
la nouvelle plage**, et posé pour fermer l'avis précédent. La note ne décrivait
donc pas un incident passé, elle prédisait celui-ci.

Le même jour, `browserslist` a subi le même sort — deux avis élargissant une
plage jusqu'à `<= 4.28.6`, alors que rien n'était overridé. Deux paquets, un
seul mécanisme.

#### Ce que la récidive change au point 2

Le point 2 disait : vérifier qu'un correctif existe dans la ligne majeure
courante avant d'accepter un bump majeur, et citait `fast-uri` en exemple de
majeur INUTILE (`3.1.5` suffisait, `4.1.2` était de trop).

**Cet exemple s'est retourné.** La ligne 3.x est désormais vulnérable EN ENTIER,
dernière version comprise : il n'y a plus de correctif à y prendre, et le
majeur devient obligatoire. Le point 2 reste juste — c'est sa RÉPONSE qui
dépend du jour. Un exemple gravé dans une règle vieillit ; la règle, elle,
tient.

#### Ce qui a rendu le majeur acceptable, et qui n'est pas un raisonnement

`ajv@8.20.0` déclare `fast-uri: ^3.0.1`. Forcer la 4.x SORT de sa plage
déclarée — c'est précisément la situation où un `audit fix --force` détruit une
application (point 2, l'épisode `next@9.3.3`).

Le contrôle n'a donc pas été « ça devrait aller » mais **un `npm run build`
complet**, toutes routes rendues, `/v/[slug]` en SSG compris. C'est le seul
niveau de preuve proportionné à un override qui contredit une dépendance
déclarée.

Chaîne concernée, pour mémoire : `@sentry/nextjs` → `@sentry/webpack-plugin` →
`webpack` → `schema-utils` → `ajv-formats` → `ajv` → `fast-uri`. Dépendance de
BUILD, jamais servie au navigateur — ce qui abaisse le risque réel, sans changer
la décision.

#### Pourquoi on corrige quand même un risque faible

Ni `browserslist` ni `fast-uri` ne partent au navigateur. On aurait pu ne rien
faire et laisser l'audit rouge.

**Une CI qui rougit pour une cause qu'on juge acceptable est une CI qu'on
apprend à ignorer** — et c'est le mécanisme par lequel un vrai avis passe
inaperçu. Le coût de la correction est un override et un build ; le coût de
l'accoutumance est de ne plus voir le prochain.

#### La valeur à choisir

`^4.1.4`, la plus haute de la ligne — et non `4.0.1`, la première version hors
plage. Même geste que pour `browserslist` (`^4.28.8` et non `4.28.7`) : ne
jamais s'asseoir sur la borne qu'on vient de fuir, sous peine de rejouer ce
paragraphe dans trente jours.

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
