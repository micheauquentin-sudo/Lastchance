// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CarteAventure } from "@/components/dashboard/carte-aventure";
import type { GuidedJourneyStep } from "@/components/dashboard/guided-journey-state";

/**
 * CE QUE CE FICHIER GARDE, ET QUE `guided-journey.test.tsx` NE GARDE PAS.
 *
 * `GuidedJourney` reste testé pour son contenu (les tuiles, l'étape bloquée
 * sans lien). Ici on ne teste QUE l'enveloppe : elle naît repliée sur les huit
 * pages détail, elle n'entre pas dans la checklist numérotée, et sa barre dit
 * la phase réelle. Les trois se contrediraient sans bruit — une carte qui
 * reprendrait un numéro, par exemple, décalerait la lecture de toute la page
 * sans faire échouer quoi que ce soit d'autre.
 */

afterEach(cleanup);

const steps: GuidedJourneyStep[] = [
  {
    key: "idea",
    label: "Choisir votre idée",
    description: "Partir d'un modèle adapté.",
    href: "/dashboard/templates",
    status: "complete",
  },
  {
    key: "draft",
    label: "Préparer l'animation",
    description: "Ajoutez les questions et les lots.",
    href: "/dashboard/quiz/demo",
    status: "current",
  },
];

describe("CarteAventure — la boussole, repliée", () => {
  it("naît repliée : le parcours est caché, la barre porte le titre", () => {
    render(<CarteAventure steps={steps} />);

    expect(
      screen.queryByRole("heading", { name: "Carte de l'Aventure" }),
    ).toBeNull();
    expect(screen.queryByText("Choisir votre idée")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Développer «.*Carte de l'Aventure/ }),
    ).toBeTruthy();
  });

  it("dit la phase réelle dans sa barre, pas une phrase figée", () => {
    render(<CarteAventure steps={steps} />);

    expect(
      screen.getByText("1/2 — prochaine étape : Préparer l'animation"),
    ).toBeTruthy();
  });

  it("déploie le parcours complet au clic", () => {
    render(<CarteAventure steps={steps} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Développer «.*Carte de l'Aventure/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Carte de l'Aventure" }),
    ).toBeTruthy();
    expect(screen.getByText("Préparer l'animation")).toBeTruthy();
  });

  it("n'entre pas dans la checklist : ni rang ni verdict dans son nom accessible", () => {
    render(<CarteAventure steps={steps} />);

    const bouton = screen.getByRole("button", { name: /Carte de l'Aventure/ });
    // Le nom accessible d'une tuile numérotée est « 3. Dotation — complet ».
    // Celui de la carte n'a ni l'un ni l'autre : c'est une boussole.
    expect(bouton.getAttribute("aria-label")).toBe(
      "Développer « Carte de l'Aventure »",
    );
  });

  it("ne rend RIEN sans étape — pas une barre qui ne promet rien", () => {
    const { container } = render(<CarteAventure steps={[]} />);

    expect(container.innerHTML).toBe("");
  });
});
