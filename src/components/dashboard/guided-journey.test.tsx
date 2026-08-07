// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GuidedJourney } from "@/components/dashboard/guided-journey";
import type { GuidedJourneyStep } from "@/components/dashboard/guided-journey-state";

/**
 * L'ÉTAPE BLOQUÉE EST LE CAS QUI COMPTE.
 *
 * Le module d'état garantit qu'une étape bloquée ne devient jamais la
 * `nextStep`. Il ne dit rien de la TUILE elle-même : le composant décide
 * séparément si chaque étape est cliquable, et c'est là qu'un lien vers une
 * page qui refusera l'accès pourrait réapparaître.
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
  {
    key: "rehearsal",
    label: "Faire une répétition",
    description: "Jouez une partie avant l'ouverture.",
    href: "/dashboard/quiz/demo/preview",
    status: "upcoming",
  },
  {
    key: "live",
    label: "Ouvrir aux joueurs",
    description: "Affichez le QR en boutique.",
    // Bloquée AVEC un href : le piège exact. Le parent ne devrait pas en
    // passer un, mais s'il le fait le composant ne doit pas s'en servir.
    href: "/dashboard/quiz/demo/publish",
    status: "blocked",
    blockedReason: "Ajoutez au moins une question avant d'ouvrir.",
  },
  {
    key: "closed",
    label: "Clôturer",
    description: "Remettez les derniers lots.",
    status: "upcoming",
  },
];

describe("GuidedJourney — le parcours à l'écran", () => {
  it("rend les cinq étapes", () => {
    render(<GuidedJourney steps={steps} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("ne rend JAMAIS de lien sur une étape bloquée, même si un href est passé", () => {
    render(<GuidedJourney steps={steps} />);
    const cibles = screen
      .getAllByRole("link")
      .map((lien) => lien.getAttribute("href"));

    expect(cibles).not.toContain("/dashboard/quiz/demo/publish");
    expect(screen.getByText("Ajoutez au moins une question avant d'ouvrir.")).toBeTruthy();
  });

  it("ne rend pas de lien sur une étape sans destination", () => {
    render(<GuidedJourney steps={steps} />);
    // « Clôturer » n'a pas de href : elle reste un repère, pas un bouton mort.
    expect(screen.getByText("Clôturer").closest("a")).toBeNull();
  });

  it("décrit sa progression sur la barre, en valeurs et en texte", () => {
    render(<GuidedJourney steps={steps} />);
    const barre = screen.getByRole("progressbar");

    expect(barre.getAttribute("aria-valuemin")).toBe("0");
    expect(barre.getAttribute("aria-valuemax")).toBe("5");
    expect(barre.getAttribute("aria-valuenow")).toBe("1");
    expect(barre.getAttribute("aria-valuetext")).toBe("20 % terminé");
  });

  it("propose de continuer sur l'étape en cours", () => {
    render(<GuidedJourney steps={steps} />);
    const suite = screen.getByRole("link", {
      name: "Continuer : Préparer l'animation",
    });
    expect(suite.getAttribute("href")).toBe("/dashboard/quiz/demo");
  });

  it("ne promet plus rien quand il n'y a plus d'étape — et ne félicite pas", () => {
    render(
      <GuidedJourney
        steps={steps.map((step) => ({ ...step, status: "complete" as const }))}
      />,
    );

    expect(screen.queryByRole("link", { name: /^Continuer/ })).toBeNull();
    // Le « Bravo, votre animation est prête à être partagée ! » était
    // INCONDITIONNEL : il s'affichait aussi sur une campagne en pause et sur un
    // brouillon dont les étapes étaient bloquées faute de droits. Sans
    // conclusion fournie, la carte se tait.
    expect(screen.queryByText(/Bravo/)).toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "100 % terminé",
    );
  });

  it("rend la conclusion et son CTA quand le parent en fournit une", () => {
    render(
      <GuidedJourney
        steps={steps.map((step) => ({ ...step, status: "complete" as const }))}
        conclusion={{
          message: "Animation clôturée.",
          cta: { label: "Repartir de cette formule", href: "#relance" },
        }}
      />,
    );

    expect(screen.getByText("Animation clôturée.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Repartir de cette formule" })
        .getAttribute("href"),
    ).toBe("#relance");
  });

  it("le bouton du bas préfère le libellé du GESTE au nom de la phase", () => {
    render(
      <GuidedJourney
        steps={steps.map((step) =>
          step.key === "draft"
            ? { ...step, ctaLabel: "Compléter les réglages" }
            : step,
        )}
      />,
    );

    expect(screen.queryByRole("link", { name: /^Continuer/ })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Compléter les réglages" })
        .getAttribute("href"),
    ).toBe("/dashboard/quiz/demo");
  });
});
