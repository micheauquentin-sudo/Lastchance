import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Les modules Node ne descendent pas dans le navigateur.
 *
 * ── Ce que la règle empêche, et ce qu'elle a coûté de ne pas avoir ──
 *
 * Rien ne CASSE quand un composant client atteint `node:crypto` : Next.js
 * substitue silencieusement un polyfill navigateur (`crypto-browserify` et sa
 * suite) et la page fonctionne. Elle pèse simplement ~121 Ko gzip de plus, et
 * personne ne le voit — ni au build, ni en revue.
 *
 * C'est exactement ce qui s'est produit deux fois, et jamais par un import
 * direct : `quiz-editor.tsx` importait UN littéral de message de
 * `validations/quiz.ts`, qui importait cinq bornes de `lib/pronostics.ts`, qui
 * importe `node:crypto` pour deux fonctions d'identité joueur situées 500
 * lignes plus bas. `progression-season-card.tsx` importait vingt-six constantes
 * de `lib/meta-progression.ts`, dont l'en-tête PROMETTAIT d'être importable
 * côté client — promesse devenue fausse le jour où une seule fonction y a
 * ajouté un `createHash`.
 *
 * ── Pourquoi elle porte sur les chemins et non sur `"use client"` ──
 *
 * La bonne frontière serait « tout fichier portant la directive `"use client"`,
 * et tout ce qu'il atteint ». ESLint ne sait pas la tracer : la configuration
 * plate sélectionne des CHEMINS, jamais un contenu de fichier, et aucune règle
 * standard ne suit une chaîne d'imports transitive.
 *
 * Le compromis retenu est donc `src/components/**` — là où vivent, à une
 * exception près, les composants clients — avec deux retraits :
 *
 *  · les fichiers de test, qui lisent le disque (`node:fs`) pour vérifier une
 *    forme de source ; ils ne sont jamais empaquetés ;
 *  · `relaunch-formula-action.tsx`, composant SERVEUR qui tire `randomUUID`
 *    AU RENDU pour une clé d'idempotence — un identifiant tiré côté navigateur
 *    aurait changé à chaque envoi, ce qui vide la clé de son sens.
 *
 * Cette exception est nommée à la main plutôt que devinée : une convention de
 * nommage (`*.server.tsx`) aurait demandé de renommer un fichier existant pour
 * satisfaire un linter, et un `eslint-disable` en tête du fichier aurait rendu
 * le retrait invisible depuis ici. Une liste courte et lisible dit mieux
 * combien d'exceptions existent réellement : une.
 *
 * La règle ne remplace pas la garde de chaîne — elle attrape l'import DIRECT,
 * `src/lib/import-sans-crypto.test.ts` attrape la chaîne transitive.
 */
const interditsClient = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["node:*", "node:*/*"],
          message:
            "Module Node interdit dans un composant client : le bundler y substitue un polyfill (jusqu'à ~121 Ko gzip) sans rien signaler. Déplacer le code concerné dans un module serveur de src/lib et n'importer ici que des données pures.",
        },
      ],
      paths: [
        "crypto",
        "buffer",
        "stream",
        "fs",
        "path",
        "os",
        "net",
        "dns",
        "zlib",
      ].map((name) => ({
        name,
        message:
          "Module Node interdit dans un composant client (et sa forme nue est de toute façon ambiguë avec un paquet npm homonyme). Déplacer le code concerné dans un module serveur de src/lib.",
      })),
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Le site vitrine est un projet indépendant (site/eslint.config.mjs).
    "site/**",
    // Captures et scripts de référence locaux, hors application.
    "Input/**",
  ]),
  {
    name: "lastchance/pas-de-node-dans-le-client",
    files: ["src/components/**/*.ts", "src/components/**/*.tsx"],
    ignores: [
      // Gardes de source : elles LISENT les fichiers, elles ne sont pas servies.
      "src/components/**/*.test.ts",
      "src/components/**/*.test.tsx",
      // Composant SERVEUR — voir l'en-tête de ce fichier.
      "src/components/dashboard/relaunch-formula-action.tsx",
    ],
    rules: interditsClient,
  },
]);

export default eslintConfig;
