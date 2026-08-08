// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import type { EtapeAtelier } from "@/components/dashboard/atelier-etapes";

/**
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI CHAQUE POINT EST FRAGILE.
 *
 * Le stepper rend désormais une navigation précédent/suivant EN HAUT, juste
 * sous le fil des étapes. Quatre invariants tiennent les E2E de huit ateliers
 * (`e2e/wheel-wizard.spec.ts`, `e2e/atelier-modules.spec.ts`), qui interrogent
 * tous `getByRole("navigation", { name: "Étapes de l'atelier" })` SANS
 * `.first()` — donc en mode strict :
 *
 * 1. **Une seule `<nav>` nommée « Étapes de l'atelier »** — un second `<nav>`
 *    portant ce nom ferait échouer chaque locator d'un coup.
 * 2. **Les liens haut/bas sont HORS de cette `<nav>`** — sinon le compte de
 *    `listitem` du fil dériverait.
 * 3. **Un seul `aria-current` dans le fil** — `toHaveCount(1)`.
 * 4. **Le conteneur des liens n'a ni rôle ni `aria-label`** commençant par
 *    « Étape » : `section[aria-label^='Étape']` est lui aussi visé sans
 *    `.first()`.
 */

const ETAPES: readonly EtapeAtelier[] = [
  { cle: "lots", titre: "Les lots" },
  { cle: "regles", titre: "Les règles", resume: "Qui joue, et combien" },
  { cle: "verif", titre: "La vérification" },
];

afterEach(cleanup);

describe("AtelierStepper", () => {
  it("ne rend QU'UNE navigation nommée « Étapes de l'atelier »", () => {
    render(
      <AtelierStepper
        etapes={ETAPES}
        courante="regles"
        hrefPour={(cle) => `/dashboard/x?etape=${cle}`}
      />,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Étapes de l'atelier" }),
    ).toHaveLength(1);
  });

  it("garde les liens précédent/suivant HORS du fil, qui n'a que ses étapes", () => {
    render(
      <AtelierStepper
        etapes={ETAPES}
        courante="regles"
        hrefPour={(cle) => `/dashboard/x?etape=${cle}`}
      />,
    );

    const fil = screen.getByRole("navigation", {
      name: "Étapes de l'atelier",
    });
    expect(within(fil).getAllByRole("listitem")).toHaveLength(ETAPES.length);
    expect(within(fil).queryByText(/Passer à/)).toBeNull();

    // Les deux liens du haut existent bien, mais en dehors du fil.
    expect(screen.getByRole("link", { name: "← Les lots" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Passer à La vérification →" }),
    ).toBeTruthy();
  });

  it("ne pose qu'un seul aria-current, et seulement dans le fil", () => {
    const { container } = render(
      <AtelierStepper
        etapes={ETAPES}
        courante="regles"
        hrefPour={(cle) => `/dashboard/x?etape=${cle}`}
      />,
    );

    expect(container.querySelectorAll("[aria-current]")).toHaveLength(1);
    const fil = screen.getByRole("navigation", {
      name: "Étapes de l'atelier",
    });
    expect(fil.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("n'expose aucun second conteneur nommé « Étape… »", () => {
    const { container } = render(
      <AtelierStepper
        etapes={ETAPES}
        courante="regles"
        hrefPour={(cle) => `/dashboard/x?etape=${cle}`}
      />,
    );

    expect(container.querySelectorAll("[aria-label^='Étape']")).toHaveLength(1);
  });

  it("suit la liste reçue : deux étapes (cagnotte courte) n'inventent pas de voisin", () => {
    render(
      <AtelierStepper
        etapes={ETAPES.slice(0, 2)}
        courante="lots"
        hrefPour={(cle) => `/dashboard/x?etape=${cle}`}
      />,
    );

    expect(screen.queryByText(/^←/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Passer à Les règles →" }),
    ).toBeTruthy();
  });
});

describe("AtelierNavigationEtape", () => {
  it("ne rend rien quand il n'y a ni précédente ni suivante", () => {
    const { container } = render(
      <AtelierNavigationEtape
        precedente={null}
        suivante={null}
        hrefPour={(cle) => `/x?etape=${cle}`}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("borde en haut ou en bas selon `position`, sans changer les libellés", () => {
    const { container: bas } = render(
      <AtelierNavigationEtape
        precedente={ETAPES[0]}
        suivante={ETAPES[2]}
        hrefPour={(cle) => `/x?etape=${cle}`}
      />,
    );
    const classesBas = bas.firstElementChild?.className ?? "";
    expect(classesBas).toContain("border-t-2");
    expect(classesBas).toContain("mt-6");

    cleanup();

    const { container: haut } = render(
      <AtelierNavigationEtape
        precedente={ETAPES[0]}
        suivante={ETAPES[2]}
        hrefPour={(cle) => `/x?etape=${cle}`}
        position="haut"
      />,
    );
    const classesHaut = haut.firstElementChild?.className ?? "";
    expect(classesHaut).toContain("border-b-2");
    expect(classesHaut).toContain("mb-6");
    expect(
      screen.getByRole("link", { name: "Passer à La vérification →" }),
    ).toBeTruthy();
  });
});
