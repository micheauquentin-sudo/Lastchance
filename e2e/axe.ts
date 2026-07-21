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
 * - `disableRules` écarte un faux positif connu — chaque exclusion doit
 *   être justifiée en commentaire AU SITE D'APPEL. Aucune exclusion
 *   globale à ce jour.
 */

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Violation = AxeResults["violations"][number];

/** Impacts qui font échouer le test. */
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

/** Résumé lisible d'une liste de violations (règle, aide, cibles CSS). */
function formatViolations(violations: Violation[]): string {
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ");
      return `  - [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nœud(s)) → ${targets}`;
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
  if (results.violations.length > 0) {
    await testInfo.attach("axe-violations.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  }

  expect(
    blocking.length,
    `violations axe serious/critical sur ${page.url()}\n${formatViolations(blocking)}`,
  ).toBe(0);
}
