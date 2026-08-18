import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Scan d'accessibilité axe-core (WCAG 2.0/2.1 niveaux A + AA), branché
 * en fin de parcours dans les specs existantes.
 *
 * Politique du chantier a11y :
 * - violations `serious` / `critical` → échec du test ;
 * - `moderate` / `minor` → loggées sur stdout (et attachées au rapport
 *   Playwright) mais non bloquantes ;
 * - `incomplete` → COMPTÉ, loggé et attaché, jamais bloquant (voir ci-dessous) ;
 * - `disableRules` écarte un faux positif connu — chaque exclusion doit
 *   être justifiée en commentaire AU SITE D'APPEL. Aucune exclusion
 *   globale, et aucune exclusion tout court à ce jour.
 *
 * ── `incomplete` : SIGNALÉ, PAS BLOQUANT — et ce que ça a coûté ─────
 *
 * axe range ses résultats en trois piles : `passes`, `violations`, et
 * `incomplete` — ce qu'il n'a PAS PU trancher seul. Ce module ne lisait que
 * `violations`, et l'audit du 2026-08-16 lui reprochait de laisser passer les
 * récidives de contraste : `color-contrast` tombe en `incomplete` dès que le
 * fond est un dégradé, une image ou une couche translucide, c'est-à-dire
 * partout dans la DA Kermesse.
 *
 * Le rendre bloquant a été essayé, et MESURÉ sur la suite complète, trois
 * navigateurs : **280 indécidables, ZÉRO violation**, 35 tests rouges. Pas
 * seulement sur les dégradés — axe rend aussi `incomplete` sur les `transform`
 * et les empilements de contextes : les `li` d'étapes de chasse, un chevron
 * `.transition-transform` sur la caisse et sur la liste clients. L'indécidable
 * est ENDÉMIQUE par construction, pas exceptionnel.
 *
 * D'où deux conclusions, et l'arbitrage :
 *  1. écarter au cas par cas ne tient pas : il aurait fallu suivre quinze
 *    specs, puis chaque surface neuve, et chaque exclusion désactivait
 *    `color-contrast` EN ENTIER sur sa page — donc aussi les vraies
 *    violations. Le remède coûtait la couverture qu'il prétendait défendre ;
 *  2. un capteur qui rougit toujours cesse d'être lu, et le premier réflexe
 *    devant 35 rouges dont 0 vrai est de désactiver le scan entier.
 *
 * `incomplete` est donc compté, loggé par page (visible dans les logs CI) et
 * attaché au rapport avec ses nœuds, au même format `[serious/indécidable]` —
 * il reste lisible pour qui enquête, il ne décide plus rien.
 *
 * LA GARANTIE DE CONTRASTE NE REPOSE PAS SUR AXE, et c'est ce qui rend cet
 * arbitrage tenable : elle est CALCULÉE sur les jetons eux-mêmes par
 * `src/lib/play-contrast.test.ts` (ratios exacts, tous les presets, y compris
 * les combinaisons qu'aucun parcours E2E ne visite) et tenue en source par les
 * interdictions de couleurs de ce fichier et de `dashboard-contrast.test.ts`.
 * Le calcul est plus fort que l'échantillon.
 *
 * Ce que le passage par ce détour a rapporté, et qui reste : les surfaces
 * jamais scannées le sont désormais (sept specs, `a11y.spec.ts` étendue à six
 * pages), et c'est PARCE QUE ces scans existent que deux vrais défauts ont été
 * trouvés — le séparateur de /login à 2,5:1, et le champ de fichier du logo
 * sans nom accessible.
 */

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Violation = AxeResults["violations"][number];

/** Impacts qui font échouer le test. */
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/** Résumé lisible d'une liste de violations (règle, aide, cibles CSS). */
function formatViolations(violations: Violation[], pile = "violation"): string {
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ");
      // LA PILE EST DANS LE MESSAGE, et ce n'est pas cosmétique : « axe a
      // MESURÉ un contraste insuffisant » et « axe n'a PAS PU mesurer » se
      // corrigent de deux façons opposées — la première se répare dans la
      // feuille de styles, la seconde ne se répare pas du tout. Les deux
      // tombaient dans le même message, indiscernables, et c'est ce qui a fait
      // prendre 280 mesures impossibles pour 280 défauts.
      return `  - [${v.impact}/${pile}] ${v.id} — ${v.help} (${v.nodes.length} nœud(s)) → ${targets}`;
    })
    .join("\n");
}

/**
 * Analyse la page courante et échoue sur toute violation serious/critical.
 * Les violations complètes sont attachées au rapport (axe-violations.json)
 * pour le diagnostic en CI.
 */
export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  options: { disableRules?: string[] } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }
  const results = await builder.analyze();

  // SEULES les violations décident. `incomplete` est relevé juste en dessous,
  // avec autant de détail, et ne fait jamais échouer — voir l'en-tête.
  const blocking = results.violations.filter((v) =>
    BLOCKING_IMPACTS.has(v.impact ?? ""),
  );
  const advisory = results.violations.filter(
    (v) => !BLOCKING_IMPACTS.has(v.impact ?? ""),
  );

  if (advisory.length > 0) {
    console.log(
      `[a11y] ${page.url()} — ${advisory.length} violation(s) moderate/minor (non bloquantes) :\n${formatViolations(advisory)}`,
    );
  }
  if (results.incomplete.length > 0) {
    // Le COMPTE est dans les logs CI, pas seulement dans une pièce jointe
    // qu'il faut penser à ouvrir : c'est ce qui permet de voir une dérive
    // (« cette page est passée de 3 à 40 indécidables ») sans rien télécharger.
    const noeuds = results.incomplete.reduce((n, v) => n + v.nodes.length, 0);
    console.log(
      `[a11y] ${page.url()} — ${results.incomplete.length} règle(s) indécidable(s), ` +
        `${noeuds} nœud(s) (non bloquantes) :\n` +
        formatViolations(results.incomplete, "indécidable"),
    );
  }
  if (results.violations.length > 0 || results.incomplete.length > 0) {
    await testInfo.attach("axe-violations.json", {
      body: JSON.stringify(
        { violations: results.violations, incomplete: results.incomplete },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }

  expect(
    blocking.length,
    `violations axe serious/critical sur ${page.url()}\n${formatViolations(blocking)}`,
  ).toBe(0);
}
