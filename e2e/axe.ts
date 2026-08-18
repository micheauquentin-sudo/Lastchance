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
 *   globale à ce jour : `SURFACE_A_DEGRADE`, plus bas, est une exclusion
 *   NOMMÉE que chaque page doit demander elle-même.
 *
 * ── `incomplete` N'EST PAS « RIEN À SIGNALER » ──────────────────────
 *
 * axe range ses résultats en trois piles : `passes`, `violations`, et
 * `incomplete` — ce qu'il n'a PAS PU trancher tout seul. Ce module ne lisait
 * que `violations`, et c'est par là que quinze récidives de contraste sont
 * passées : `color-contrast` tombe en `incomplete`, jamais en `violation`,
 * dès que le fond est un dégradé, une image ou une couleur translucide.
 * C'est-à-dire sur TOUTE la page /play, dont le fond est le dégradé du
 * commerçant, et sur les cartes à ombre dure de la DA Kermesse.
 *
 * Autrement dit : l'endroit précis où le contraste est difficile à obtenir
 * est exactement celui où le capteur se taisait. `color-contrast` en
 * `incomplete` fait donc échouer le test, au même titre qu'une violation. Ce
 * qui est réellement indécidable (un texte sur photo, par exemple) s'écarte
 * par `disableRules` AU SITE D'APPEL, avec sa justification — le même
 * mécanisme que pour les violations, et la même exigence de motif écrit.
 */

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Violation = AxeResults["violations"][number];

/**
 * L'exclusion — la SEULE, et elle reste opt-in, page par page.
 *
 * Depuis que `incomplete` est bloquant (voir ci-dessus), il faut dire ce
 * qu'on fait des surfaces où axe ne peut structurellement RIEN calculer :
 * un texte posé sur un dégradé, sur du SVG, ou sur une couche translucide
 * n'a pas de « couleur de fond » que le navigateur puisse rendre. Ce n'est
 * pas un contraste douteux, c'est une mesure impossible — la laisser active
 * ne mesurerait que l'impuissance de l'outil, et un capteur qui rougit
 * toujours cesse d'être lu.
 *
 * Ce que ces pages perdent est repris ailleurs, et mieux : le contraste réel
 * de la DA est CALCULÉ sur les jetons eux-mêmes par
 * `src/lib/play-contrast.test.ts` — ratios exacts, tous les presets, y compris
 * les combinaisons qu'aucun parcours E2E ne visite — et les couleurs fautives
 * sont interdites en source par `play-contrast.test.ts` et
 * `dashboard-contrast.test.ts`. Le calcul est plus fort que l'échantillon.
 *
 * Passée EXPLICITEMENT au site d'appel, jamais posée par défaut ici : une
 * page neuve est scannée en entier tant que personne n'a écrit pourquoi elle
 * ne peut pas l'être.
 */
export const SURFACE_A_DEGRADE = { disableRules: ["color-contrast"] };

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
      // corrigent de deux façons opposées — l'un se répare dans la feuille de
      // styles, l'autre s'écarte par `SURFACE_A_DEGRADE`. Les deux tombaient
      // dans le même message, indiscernables, et le premier diagnostic du
      // wagon 6 a dû se faire sans cette information.
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

  // Indécidable sur le contraste = bloquant (voir l'en-tête). Les autres
  // règles `incomplete` restent indicatives : elles demandent un jugement
  // humain que ce capteur n'a pas à trancher.
  const contrasteIndecidable = results.incomplete.filter(
    (v) => v.id === "color-contrast",
  );
  const violationsBloquantes = results.violations.filter((v) =>
    BLOCKING_IMPACTS.has(v.impact ?? ""),
  );
  const blocking = [...violationsBloquantes, ...contrasteIndecidable];
  const advisory = results.violations.filter(
    (v) => !BLOCKING_IMPACTS.has(v.impact ?? ""),
  );
  const autresIndecis = results.incomplete.filter((v) => v.id !== "color-contrast");

  if (advisory.length > 0) {
    console.log(
      `[a11y] ${page.url()} — ${advisory.length} violation(s) moderate/minor (non bloquantes) :\n${formatViolations(advisory)}`,
    );
  }
  if (autresIndecis.length > 0) {
    console.log(
      `[a11y] ${page.url()} — ${autresIndecis.length} règle(s) indécidable(s) hors contraste (non bloquantes) :\n${formatViolations(autresIndecis, "indécidable")}`,
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
    `violations axe serious/critical sur ${page.url()}\n` +
      `${formatViolations(violationsBloquantes)}\n` +
      `${formatViolations(contrasteIndecidable, "indécidable")}`,
  ).toBe(0);
}
