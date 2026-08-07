// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProchaineActionPanel } from "@/components/dashboard/prochaine-action";
import type { ProchaineAction } from "@/components/dashboard/prochaine-action-state";

/**
 * CE QUE LE TEST D'ÉTAT NE VOIT PAS.
 *
 * Le choix de l'action est prouvé côté état. Ce fichier prouve la SURFACE : que
 * la page porte enfin un vrai bouton (elle n'en avait aucun — que des liens
 * texte et des cartes cliquables), que la barre de progression soit annoncée
 * aux lecteurs d'écran, et — filet « surface sans chemin » du dépôt — que le
 * panneau soit réellement MONTÉ sur la vue d'ensemble.
 */

afterEach(cleanup);

const demarrage: ProchaineAction = {
  kind: "demarrage",
  key: "demarrage",
  titre: "Pour bien démarrer",
  phrase: "Étape 2 sur 3.",
  cta: { label: "Configurer au moins un lot", href: "/dashboard/campaigns" },
  progression: { faites: 1, total: 3 },
  restantes: [
    { key: "qr", label: "Générer un QR code", href: "/dashboard/qr-codes", done: false },
  ],
};

describe("ProchaineActionPanel — ce que le commerçant voit en premier", () => {
  it("affiche le titre, la phrase et UN bouton vers la destination", () => {
    render(<ProchaineActionPanel action={demarrage} />);

    expect(screen.getByText("Pour bien démarrer")).toBeTruthy();
    expect(screen.getByText("Étape 2 sur 3.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Configurer au moins un lot/ })
        .getAttribute("href"),
    ).toBe("/dashboard/campaigns");
  });

  it("annonce la progression aux lecteurs d'écran", () => {
    render(<ProchaineActionPanel action={demarrage} />);
    const barre = screen.getByRole("progressbar");
    expect(barre.getAttribute("aria-valuenow")).toBe("1");
    expect(barre.getAttribute("aria-valuemax")).toBe("3");
  });

  it("propose les étapes suivantes en second plan, sans les confondre avec le CTA", () => {
    render(<ProchaineActionPanel action={demarrage} />);
    const liens = screen.getAllByRole("link");
    expect(liens.map((l) => l.getAttribute("href"))).toEqual([
      "/dashboard/campaigns",
      "/dashboard/qr-codes",
    ]);
  });

  it("sans progression ni étapes restantes, il reste un bloc simple", () => {
    render(
      <ProchaineActionPanel
        action={{
          kind: "action",
          key: "gains",
          titre: "3 gains à remettre",
          phrase: "Des clients attendent leur lot.",
          cta: { label: "Ouvrir la caisse", href: "/dashboard/redeem" },
        }}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("donne un titre accessible à la section", () => {
    render(<ProchaineActionPanel action={demarrage} />);
    expect(
      screen.getByRole("region", { name: "Pour bien démarrer" }),
    ).toBeTruthy();
  });
});

describe("ProchaineActionPanel — monté sur la vue d'ensemble", () => {
  const source = readFileSync("src/app/dashboard/page.tsx", "utf8");

  it("la page construit l'action et rend le hero", () => {
    expect(source).toContain("construireProchaineAction");
    expect(source).toContain("<ProchaineActionPanel");
  });

  it("la checklist n'est PLUS montée une seconde fois en bas de page", () => {
    // Le hero l'absorbe : deux blocs de démarrage sur le même écran, c'est le
    // doublon que cette refonte supprime.
    expect(source).not.toContain("<OnboardingChecklist");
    // Mais le filtrage par rôle des étapes, lui, reste utilisé.
    expect(source).toContain("visibleOnboardingSteps");
  });

  it("le conseil que le hero affiche déjà est retiré du Conseiller", () => {
    expect(source).toContain("conseilsRecouvertsParHero");
  });
});
