import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { destinationApresCreation, CHAMP_GRAND_ECRAN } from "./atterrissage-studio";

/**
 * L'ATTERRISSAGE APRÈS CRÉATION, ET SES DEUX MOITIÉS (VIT-51).
 *
 * Le mécanisme n'a de sens que si les deux côtés existent ENSEMBLE : une action
 * qui consulte le champ mais un formulaire qui ne l'envoie pas retombe
 * silencieusement sur l'atelier — c'est-à-dire le comportement d'avant, sans
 * que rien ne rougisse. C'est la forme la plus courante de régression sur ce
 * dépôt : la moitié qui reste fonctionne, donc personne ne voit que l'autre
 * manque.
 *
 * La garde apparie donc les deux, et elle est TEXTUELLE (ADR-074) : elle prouve
 * qu'un appel est écrit, jamais qu'il s'exécute.
 */

/** Les sept modules qui créent une animation puis redirigent. */
const CREATIONS = [
  { action: "src/actions/calendar.ts", formulaire: "src/components/dashboard/new-calendar-form.tsx" },
  { action: "src/actions/events.ts", formulaire: "src/components/dashboard/new-event-form.tsx" },
  { action: "src/actions/hunts.ts", formulaire: "src/components/dashboard/new-hunt-form.tsx" },
  { action: "src/actions/jackpot.ts", formulaire: "src/components/dashboard/new-jackpot-form.tsx" },
  { action: "src/actions/loyalty.ts", formulaire: "src/components/dashboard/new-loyalty-form.tsx" },
  { action: "src/actions/pronostics.ts", formulaire: "src/components/dashboard/new-contest-form.tsx" },
  { action: "src/actions/quiz.ts", formulaire: "src/components/dashboard/new-quiz-form.tsx" },
];

const lire = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

describe("atterrissage après création — le studio sur grand écran", () => {
  it("choisit le studio quand le formulaire l'a dit, l'atelier sinon", () => {
    const avec = new FormData();
    avec.set(CHAMP_GRAND_ECRAN, "1");
    expect(destinationApresCreation(avec, "/studio/x/1", "/atelier?etape=a")).toBe(
      "/studio/x/1",
    );

    const sans = new FormData();
    sans.set(CHAMP_GRAND_ECRAN, "0");
    expect(destinationApresCreation(sans, "/studio/x/1", "/atelier?etape=a")).toBe(
      "/atelier?etape=a",
    );
  });

  it("un champ ABSENT retombe sur l'atelier, jamais sur le studio", () => {
    // JavaScript coupé, requête forgée, navigateur exotique : le repli le moins
    // coûteux est celui qui fonctionne aux deux tailles. L'inverse enverrait un
    // téléphone dans un écran conçu pour deux colonnes.
    expect(
      destinationApresCreation(new FormData(), "/studio/x/1", "/atelier?etape=a"),
    ).toBe("/atelier?etape=a");
  });

  it.each(CREATIONS)(
    "$action consulte le champ au lieu de rediriger en dur",
    ({ action }) => {
      expect(lire(action)).toContain("destinationApresCreation(");
    },
  );

  it.each(CREATIONS)(
    "$formulaire envoie le champ",
    ({ formulaire }) => {
      // L'autre moitié. Sans elle, l'action consulte un champ que personne
      // n'envoie et retombe sur l'atelier — le comportement d'avant, en silence.
      expect(lire(formulaire)).toContain("<ChampGrandEcran />");
    },
  );

  it("aucune création ne redirige encore DIRECTEMENT vers une étape d'atelier", () => {
    // La forme fautive est `redirect(hrefEtapeX(...))` sans passer par le
    // choix. Un huitième module ajouté demain doit rougir ici.
    const fautifs: string[] = [];
    for (const f of readdirSync("src/actions").filter((n) => n.endsWith(".ts") && !n.includes(".test."))) {
      const src = lire(join("src/actions", f));
      for (const m of src.matchAll(/redirect\(\s*hrefEtape\w+\(/g)) {
        fautifs.push(`${f} @${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
