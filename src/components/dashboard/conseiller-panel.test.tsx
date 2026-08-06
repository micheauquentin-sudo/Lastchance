// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConseillerPanel } from "@/components/dashboard/conseiller-panel";
import type { ConseilCommercant } from "@/lib/conseiller-commercant";

/**
 * CE QUE LE TEST DE BACKEND NE VOIT PAS.
 *
 * Le calcul des conseils est prouvé côté serveur. Ce fichier prouve la surface :
 * que le panneau RENDE bien la liste, qu'un conseil sans destination ne devienne
 * jamais un lien mort, et — le filet « surface sans chemin » du dépôt — que le
 * panneau soit effectivement MONTÉ dans la vue d'ensemble. Un composant pur,
 * vert en CI mais monté nulle part, resterait invisible au commerçant.
 */

afterEach(cleanup);

// `priorite` : plus haut = plus urgent (contrat backend). Volontairement
// désordonnés à la construction pour vérifier que le panneau les remet
// dans l'ordre décroissant.
const conseils: ConseilCommercant[] = [
  {
    key: "astuce-affiche",
    categorie: "decouverte",
    // Sans href : reste un repère, jamais un bouton mort.
    texte: "Une affiche personnalisée attire davantage de scans.",
    priorite: 0,
  },
  {
    key: "creer-campagne",
    categorie: "operationnel",
    texte: "Créez votre première campagne pour lancer votre roue.",
    href: "/dashboard/campaigns",
    priorite: 100,
  },
  {
    key: "module-chasse",
    categorie: "module",
    texte: "La chasse au trésor prolonge la visite en boutique.",
    href: "/dashboard/hunts",
    priorite: 50,
  },
];

describe("ConseillerPanel — ce que le commerçant voit", () => {
  it("affiche chaque conseil et son texte", () => {
    render(<ConseillerPanel conseils={conseils} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("Créez votre première campagne pour lancer votre roue."),
    ).toBeTruthy();
    expect(
      screen.getByText("Une affiche personnalisée attire davantage de scans."),
    ).toBeTruthy();
  });

  it("rend un vrai lien pour un conseil avec href", () => {
    render(<ConseillerPanel conseils={conseils} />);
    const liens = screen.getAllByRole("link");
    const cibles = liens.map((lien) => lien.getAttribute("href")).sort();
    expect(cibles).toEqual(["/dashboard/campaigns", "/dashboard/hunts"]);
  });

  it("ne rend PAS de lien pour un conseil sans href", () => {
    render(<ConseillerPanel conseils={conseils} />);
    // « affiche personnalisée » n'a pas de href : pas de lien mort.
    expect(
      screen
        .getByText("Une affiche personnalisée attire davantage de scans.")
        .closest("a"),
    ).toBeNull();
    // Deux conseils sur trois portent un href : exactement deux liens.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("ne rend RIEN quand la liste est vide", () => {
    const { container } = render(<ConseillerPanel conseils={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("affiche les conseils par priorité décroissante (plus urgent d'abord)", () => {
    render(<ConseillerPanel conseils={conseils} />);
    const textes = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(textes[0]).toContain("Créez votre première campagne");
    expect(textes[1]).toContain("La chasse au trésor");
    expect(textes[2]).toContain("Une affiche personnalisée");
  });

  it("donne un titre accessible à la section", () => {
    render(<ConseillerPanel conseils={conseils} />);
    expect(screen.getByRole("region", { name: "Conseils" })).toBeTruthy();
  });
});

describe("ConseillerPanel — monté sur la vue d'ensemble", () => {
  const source = readFileSync("src/app/dashboard/page.tsx", "utf8");

  it("construit les conseils et rend le panneau", () => {
    expect(source).toContain("construireConseils");
    expect(source).toContain("<ConseillerPanel");
  });
});
