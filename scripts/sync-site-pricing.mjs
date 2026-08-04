/**
 * Écrit `site/src/content/pricing.generated.ts` depuis le packaging de
 * l'application (`src/lib/plans.ts` + `src/platform/experiences/catalog.ts`).
 *
 * POURQUOI GÉNÉRER PLUTÔT QU'IMPORTER : `site/` est un projet Next séparé, avec
 * son propre `package.json`, ses propres `node_modules` et son propre alias
 * `@/*` pointant vers `site/src`. Un import TypeScript inter-projets couplerait
 * les deux builds et casserait la construction isolée du site. On génère donc
 * un module, on le committe, et une garde de la suite racine
 * (`src/lib/site-pricing.test.ts`) échoue si le committé diverge de la source.
 *
 * CE SCRIPT NE CONTIENT AUCUN CHIFFRE ET AUCUN NOM D'OFFRE : il ne fait que
 * charger le catalogue et déléguer la mise en forme à `site-pricing-template.mjs`.
 *
 * Usage : `npm run site:pricing`
 *
 * `src/lib/plans.ts` est du TypeScript qui importe par alias `@/…`. Node 24
 * retire les annotations de type tout seul ; seul l'alias demande un hook de
 * résolution, installé ci-dessous et strictement limité au préfixe `@/`.
 */

import { registerHooks } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  GENERATED_FILE_RELATIVE_PATH,
  renderSitePricingModule,
} from "./site-pricing-template.mjs";

const repoRoot = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) {
      return nextResolve(specifier, context);
    }
    const target = new URL(`src/${specifier.slice(2)}.ts`, repoRoot);
    // `format` explicite : sans lui, Node reparse le fichier et avertit
    // (MODULE_TYPELESS_PACKAGE_JSON) à chaque module chargé par alias.
    return { url: target.href, format: "module-typescript", shortCircuit: true };
  },
});

// Chargé par alias, comme le fait l'application : c'est le hook ci-dessus qui
// résout, ce qui évite aussi le reparsing signalé par Node sur un `.ts` nu.
const plans = await import("@/lib/plans");

const output = renderSitePricingModule(plans);
const destination = new URL(GENERATED_FILE_RELATIVE_PATH, repoRoot);

await writeFile(destination, output, "utf8");

console.log(
  `${GENERATED_FILE_RELATIVE_PATH} écrit (${plans.PLAN_TIERS.length} offres, ${plans.ADDON_OFFERS.length} add-ons, packaging ${plans.PACKAGING_VERSION}) — ${fileURLToPath(destination)}`,
);
