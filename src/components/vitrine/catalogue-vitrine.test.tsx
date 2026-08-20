// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CatalogueVitrine,
  decoderFragment,
} from "@/components/vitrine/catalogue-vitrine";
import { FicheVitrine } from "@/components/vitrine/fiche-vitrine";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * LA COUVERTURE DU RENDU PUBLIC — au niveau du composant.
 *
 * `/v/{slug}` est OUVERTE depuis L11 et `e2e/vitrine.spec.ts` la parcourt
 * vraiment. Ces tests-ci ne font donc plus office de contournement : ils
 * gardent ce que l'E2E ne sait pas viser sans base — les états de la fiche
 * (épuisée, badges vides), le repli d'un tableau vide, et le CHROME dans les
 * deux langues. Les données reproduisent `supabase/seed.sql` (vitrine
 * `e2e-comptoir`) plutôt que de l'importer : ce fichier ne dépend d'aucune base.
 *
 * `lang="fr"` PARTOUT sauf dans le dernier bloc : le chrome français est ce que
 * la très grande majorité des visiteurs voit, et le rendu anglais se prouve une
 * fois, sur ce qui change vraiment.
 */

afterEach(cleanup);

// Reproduction fidèle du seed (supabase/seed.sql, bloc « Vitrine — catalogue
// QR PUBLIÉ (VIT-1a) ») : deux cartes, trois rubriques, six fiches — dont une
// épuisée et une aux badges/allergènes vides.
const CARTES: VitrineCarteView[] = [
  {
    id: "e2f10000-0000-4000-8000-000000000011",
    nom: "Carte du midi",
    ordre: 1,
    active: true,
    categories: [
      {
        id: "e2f10000-0000-4000-8000-000000000021",
        nom: "Entrées",
        ordre: 1,
        fiches: [
          {
            id: "e2f10000-0000-4000-8000-000000000031",
            nom: "Velouté de potiron",
            description: "Crème légère, graines torréfiées maison.",
            prix_affiche: "à partir de 8 €",
            photo_path: null,
            badges: ["vegetarien", "sain", "fait_maison"],
            allergenes: ["lait", "celeri"],
            disponible: true,
            ordre: 1,
          },
          {
            id: "e2f10000-0000-4000-8000-000000000032",
            nom: "Houmous du jour",
            description: "Pois chiches, citron confit, huile d'olive.",
            prix_affiche: "7 €",
            photo_path: null,
            badges: ["vegan", "sain"],
            allergenes: ["sesame"],
            disponible: true,
            ordre: 2,
          },
        ],
      },
      {
        id: "e2f10000-0000-4000-8000-000000000022",
        nom: "Plats",
        ordre: 2,
        fiches: [
          {
            id: "e2f10000-0000-4000-8000-000000000033",
            nom: "Tartare de bœuf",
            description: "Coupé au couteau, frites maison.",
            prix_affiche: "19 €",
            photo_path: null,
            badges: ["traditionnel"],
            allergenes: ["oeufs", "moutarde"],
            disponible: true,
            ordre: 1,
          },
          // LA FICHE ÉPUISÉE — grisée et dite, jamais retirée.
          {
            id: "e2f10000-0000-4000-8000-000000000034",
            nom: "Curry de légumes grillés",
            description: "Épicé, servi avec un riz complet.",
            prix_affiche: "16 €",
            photo_path: null,
            badges: ["vegan", "epice", "grille"],
            allergenes: ["fruits_a_coque", "soja"],
            disponible: false,
            ordre: 2,
          },
        ],
      },
    ],
  },
  {
    id: "e2f10000-0000-4000-8000-000000000012",
    nom: "Vins & boissons",
    ordre: 2,
    active: true,
    categories: [
      {
        id: "e2f10000-0000-4000-8000-000000000023",
        nom: "Au verre",
        ordre: 1,
        fiches: [
          // BADGES ET ALLERGÈNES VIDES — le cas qu'un rendu naïf transforme
          // en « [] ».
          {
            id: "e2f10000-0000-4000-8000-000000000035",
            nom: "Côtes-du-rhône",
            description: "Domaine de la Tour, 2023.",
            prix_affiche: "5,5 / 24 €",
            photo_path: null,
            badges: [],
            allergenes: ["sulfites"],
            disponible: true,
            ordre: 1,
          },
          {
            id: "e2f10000-0000-4000-8000-000000000036",
            nom: "Limonade artisanale",
            description: null,
            prix_affiche: "4 €",
            photo_path: null,
            badges: ["nouveau", "fait_maison"],
            allergenes: [],
            disponible: true,
            ordre: 2,
          },
        ],
      },
    ],
  },
];

describe("CatalogueVitrine — rendu public (seed e2e-comptoir)", () => {
  it("rend les deux cartes en onglets et la première carte par défaut", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="fr" />);

    expect(
      screen
        .getByRole("button", { name: "Carte du midi" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Vins & boissons" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    // Les rubriques de la carte active sont rendues, pas celles de l'autre.
    expect(screen.getByRole("heading", { name: "Entrées" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Plats" })).toBeTruthy();
    expect(screen.queryByText("Au verre")).toBeNull();
  });

  it("la fiche épuisée est grisée ET dite, jamais retirée", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="fr" />);

    const article = screen
      .getByText("Curry de légumes grillés")
      .closest("article");
    expect(article).toBeTruthy();
    expect(article?.className).toContain("opacity-70");
    expect(
      within(article as HTMLElement).getByText("Indisponible aujourd'hui"),
    ).toBeTruthy();
  });

  it("badges et allergènes vides ne rendent aucun « [] »", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="fr" />);

    // Onglet "Vins & boissons" pour atteindre la fiche sans badges.
    fireEvent.click(screen.getByRole("button", { name: "Vins & boissons" }));

    const article = screen.getByText("Côtes-du-rhône").closest("article");
    expect(article).toBeTruthy();
    expect(article?.textContent).not.toContain("[]");
  });

  it("le filet nom/prix et le prix s'affichent sur une même ligne", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="fr" />);

    const article = screen
      .getByText("Velouté de potiron")
      .closest("article") as HTMLElement;
    expect(within(article).getByText("à partir de 8 €")).toBeTruthy();
  });

  it("les allergènes sont repliés dans un <details>", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="fr" />);

    const article = screen
      .getByText("Velouté de potiron")
      .closest("article") as HTMLElement;
    const details = within(article).getByText("Allergènes").closest("details");
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(within(article).getByText("Lait · Céleri")).toBeTruthy();
  });
});

describe("FicheVitrine — rendu isolé", () => {
  const ficheDisponible = CARTES[0].categories[0].fiches[0];
  const ficheIndisponible = CARTES[0].categories[1].fiches[1];

  it("nom, description, prix et badges d'une fiche disponible", () => {
    render(<FicheVitrine fiche={ficheDisponible} styleCartes="liste" lang="fr" />);
    expect(screen.getByText("Velouté de potiron")).toBeTruthy();
    expect(
      screen.getByText("Crème légère, graines torréfiées maison."),
    ).toBeTruthy();
    expect(screen.getByText("🥗 Végétarien")).toBeTruthy();
    expect(screen.queryByText("Indisponible aujourd'hui")).toBeNull();
  });

  it("le monogramme n'apparaît qu'en dehors du style liste", () => {
    const { container: liste } = render(
      <FicheVitrine fiche={ficheDisponible} styleCartes="liste" lang="fr" />,
    );
    // Le monogramme porte `h-16`/`h-28` ; le filet nom/prix porte aussi
    // `aria-hidden`, donc on cible la classe propre au monogramme.
    expect(liste.querySelector(".h-16, .h-28")).toBeNull();
    cleanup();

    const { container: grille } = render(
      <FicheVitrine fiche={ficheDisponible} styleCartes="grille" lang="fr" />,
    );
    expect(grille.textContent).toContain("V");
  });

  it("une fiche indisponible est grisée avec la mention textuelle", () => {
    render(<FicheVitrine fiche={ficheIndisponible} styleCartes="grille" lang="fr" />);
    expect(screen.getByText("Indisponible aujourd'hui")).toBeTruthy();
  });
});

/**
 * LE CHROME ANGLAIS — ce qui NE VIENT PAS de la base.
 *
 * Les noms et descriptions arrivent déjà traduits par le SQL : les passer en
 * anglais ici ne prouverait que la capacité de ce test à écrire de l'anglais.
 * Ce qui se prouve, c'est que le chrome et le vocabulaire de plateforme
 * basculent — et que la mention d'indisponibilité, seul état que l'écran doit
 * DIRE plutôt que masquer, le dit dans la langue servie.
 */
describe("rendu anglais — chrome et vocabulaire de plateforme", () => {
  const ficheIndisponible = CARTES[0].categories[1].fiches[1];

  it("la mention d'indisponibilité et le pli des allergènes sont en anglais", () => {
    render(
      <FicheVitrine fiche={ficheIndisponible} styleCartes="grille" lang="en" />,
    );
    expect(screen.getByText("Unavailable today")).toBeTruthy();
    expect(screen.queryByText("Indisponible aujourd'hui")).toBeNull();
    expect(screen.getByText("Allergens")).toBeTruthy();
  });

  it("le libellé de recherche et l'état vide basculent aussi", () => {
    render(<CatalogueVitrine cartes={CARTES} styleCartes="grille" lang="en" />);
    expect(screen.getByLabelText("Search in Carte du midi")).toBeTruthy();

    // Le nom de la carte, lui, reste tel que la base l'a rendu : le chrome se
    // traduit ici, le contenu du commerçant se traduit en SQL.
    fireEvent.change(screen.getByLabelText("Search in Carte du midi"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("No dish matches your search.")).toBeTruthy();
  });
});

/**
 * `decoderFragment` — la garde M1 de la revue L12 : le fragment vient du
 * visiteur, et `decodeURIComponent` lève sur un pourcentage incomplet. Sans
 * repli, `#%` dans un lien partagé remplaçait la vitrine par l'écran d'erreur.
 */
describe("decoderFragment", () => {
  it("décode les fragments valides et retire le croisillon", () => {
    expect(decoderFragment("#carte-abc")).toBe("carte-abc");
    expect(decoderFragment("#fiche-%C3%A9")).toBe("fiche-é");
    expect(decoderFragment("")).toBe("");
  });

  it("un pourcentage incomplet rend la chaîne brute, jamais une exception", () => {
    for (const brut of ["#%", "#%zz", "#%E0%A4%A", "#%F0%9F"]) {
      expect(() => decoderFragment(brut)).not.toThrow();
      expect(decoderFragment(brut)).toBe(brut.slice(1));
    }
  });
});
