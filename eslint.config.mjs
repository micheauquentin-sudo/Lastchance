import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
