// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// L'éditeur et l'import montent une douzaine d'actions. Aucune n'est APPELÉE
// par un rendu — `useActionForm` ne les touche qu'à la soumission — mais elles
// doivent exister à l'import du module.
vi.mock("@/actions/vitrine", () => ({
  createVitrineCarte: vi.fn(),
  updateVitrineCarte: vi.fn(),
  deleteVitrineCarte: vi.fn(),
  createVitrineRubrique: vi.fn(),
  updateVitrineRubrique: vi.fn(),
  deleteVitrineRubrique: vi.fn(),
  createVitrineFiche: vi.fn(),
  updateVitrineFiche: vi.fn(),
  deleteVitrineFiche: vi.fn(),
  toggleVitrineFicheDisponibilite: vi.fn(),
  reorderVitrineCartes: vi.fn(),
  reorderVitrineRubriques: vi.fn(),
  reorderVitrineFiches: vi.fn(),
  importVitrineCarte: vi.fn(),
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PageCarteStudio } = await import(
  "@/components/vitrine/studio/page-carte"
);
const { resumerCartes } = await import(
  "@/components/vitrine/studio/carte-resume"
);

import {
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS_CLES,
  type VitrineCarteView,
} from "@/lib/vitrine";

/**
 * LA PAGE « LA CARTE » DU STUDIO (VIT-23).
 *
 * Trois choses sont tenues ici, et chacune ferme un défaut qui ne se voit pas
 * à la relecture :
 *
 *  1. Le résumé distingue le vide de l'APERÇU du vide de la page PUBLIQUE.
 *     L'aperçu du studio ne filtre pas les cartes décochées ; la RPC publique,
 *     si. Sans ce compte séparé, une carte entièrement masquée s'affiche pleine
 *     au commerçant et vide au client, et rien ne le dit.
 *  2. Aucun contrôle de cette page ne porte un `name` des RÉGLAGES. Un seul
 *     suffirait à faire voyager la charge du studio depuis cette page, puis à
 *     l'en faire disparaître dès qu'on la quitte.
 *  3. Aucun formulaire imbriqué. L'éditeur et l'import en portent une douzaine
 *     à eux deux ; le studio en pose un treizième, VOISIN. Un seul `form` dans
 *     un `form` tue l'hydratation de l'écran entier (VIT-16).
 */

afterEach(cleanup);

function fiche(id: string) {
  return {
    id,
    nom: `Plat ${id}`,
    description: null,
    prix_affiche: null,
    photo_path: null,
    photo_alt: null,
    facettes: [],
    action: null,
    badges: [],
    allergenes: [],
    disponible: true,
    ordre: 0,
  };
}

function carte(
  id: string,
  active: boolean,
  fiches: string[][],
): VitrineCarteView {
  return {
    id,
    nom: `Carte ${id}`,
    ordre: 0,
    active,
    categories: fiches.map((ids, i) => ({
      id: `${id}-r${i}`,
      nom: `Rubrique ${i}`,
      ordre: i,
      action: null,
      fiches: ids.map(fiche),
    })),
  };
}

describe("resumerCartes", () => {
  it("compte les cartes, leurs rubriques et leurs fiches", () => {
    const r = resumerCartes([
      carte("a", true, [["f1", "f2"], ["f3"]]),
      carte("b", true, [["f4"]]),
    ]);

    expect(r.cartes).toBe(2);
    expect(r.rubriques).toBe(3);
    expect(r.fiches).toBe(4);
  });

  it("sépare les cartes affichées des cartes masquées", () => {
    const r = resumerCartes([
      carte("a", true, [["f1"]]),
      carte("b", false, [["f2"]]),
      carte("c", false, [["f3"]]),
    ]);

    expect(r.actives).toBe(1);
    expect(r.masquees).toBe(2);
  });

  it("une carte sans aucune fiche vide l'aperçu", () => {
    const r = resumerCartes([carte("a", true, [[]])]);

    expect(r.apercuVide).toBe(true);
    expect(r.publicVide).toBe(true);
  });

  it("LE CAS QUI TROMPE : l'aperçu est plein, la page publique est vide", () => {
    // La carte a des fiches, donc l'aperçu la montre — il ne regarde pas
    // `active`. Elle est décochée, donc la RPC publique ne la rend pas. C'est
    // exactement l'écart qu'un commerçant ne découvre qu'en scannant son QR.
    const r = resumerCartes([carte("a", false, [["f1", "f2"]])]);

    expect(r.apercuVide).toBe(false);
    expect(r.publicVide).toBe(true);
  });

  it("une carte affichée et pleine ne vide ni l'un ni l'autre", () => {
    const r = resumerCartes([carte("a", true, [["f1"]])]);

    expect(r.apercuVide).toBe(false);
    expect(r.publicVide).toBe(false);
    expect(r.masquees).toBe(0);
  });
});

describe("page « La carte » — ce qu'elle dit au commerçant", () => {
  it("sans carte, elle invite à en composer une plutôt que d'afficher du vide", () => {
    render(<PageCarteStudio nbCartes={0} cartes={[]} peutEditer />);

    // Le libellé exact du RÉSUMÉ : l'éditeur en dessous dit lui aussi
    // « Aucune carte pour l'instant », et un motif plus court attraperait les
    // deux sans rien prouver.
    expect(
      screen.getByText(/Importez la vôtre ou créez-la ci-dessous/),
    ).toBeTruthy();
  });

  it("prévient quand aucune carte n'est affichée aux clients", () => {
    render(
      <PageCarteStudio
        nbCartes={1}
        cartes={[carte("a", false, [["f1"]])]}
        peutEditer
      />,
    );

    expect(
      screen.getByText(/Aucune de vos cartes n'est affichée à vos clients/),
    ).toBeTruthy();
  });

  it("signale les cartes masquées quand d'autres sont bien affichées", () => {
    render(
      <PageCarteStudio
        nbCartes={2}
        cartes={[carte("a", true, [["f1"]]), carte("b", false, [["f2"]])]}
        peutEditer
      />,
    );

    expect(screen.getByText(/1 carte masquée/)).toBeTruthy();
  });

  it("monte l'éditeur du catalogue et l'import, sur la page elle-même", () => {
    // C'est le geste du lot : composer sa carte EN VOYANT l'aperçu, et non
    // repartir vers l'atelier. Un renvoi rendrait l'aperçu inutile.
    render(<PageCarteStudio nbCartes={0} cartes={[]} peutEditer />);

    expect(screen.getByRole("heading", { name: "Vos cartes" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Importer une carte existante" }),
    ).toBeTruthy();
  });

  it("n'offre ni éditeur d'import ni bouton de création en lecture seule", () => {
    render(
      <PageCarteStudio
        nbCartes={1}
        cartes={[carte("a", true, [["f1"]])]}
        peutEditer={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /Créer la carte/ })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Importer une carte existante" }),
    ).toBeNull();
  });
});

describe("page « La carte » — les invariants du studio", () => {
  /** Tout ce que `saveVitrineSettings` lit dans son `FormData`. */
  const CHAMPS_REGLAGES = new Set([
    "secteur",
    "accroche",
    "histoire",
    "horaires_texte",
    "badge_ouverture",
    "couleurs_rendues",
    "couleur_primary",
    "couleur_secondary",
    "polices_rendues",
    "police_heading",
    "police_body",
    "style_cartes_rendu",
    "style_cartes",
    "blocs_rendus",
    "ordre_blocs",
    "allure_rendue",
    ...VITRINE_ALLURE_ENUMS_CLES,
    ...VITRINE_ALLURE_CHIFFRES,
  ]);

  function rendreTout() {
    // Une carte, une rubrique, une fiche : le seul jeu qui déplie les trois
    // niveaux de formulaires en même temps.
    return render(
      <PageCarteStudio
        nbCartes={1}
        cartes={[carte("a", true, [["f1"]])]}
        peutEditer
      />,
    );
  }

  it("aucun contrôle ne porte un `name` appartenant aux réglages", () => {
    // Sinon il partirait avec « Enregistrer » depuis CETTE page, et
    // disparaîtrait de la charge dès qu'on en change — le défaut que
    // `ChampsCachesStudio` existe pour rendre impossible.
    const { container } = rendreTout();

    const intrus = [...container.querySelectorAll("[name]")]
      .map((n) => n.getAttribute("name"))
      .filter((n): n is string => Boolean(n) && CHAMPS_REGLAGES.has(n!));

    expect(intrus).toEqual([]);
  });

  it("porte des formulaires, et aucun n'en contient un autre", () => {
    const { container } = rendreTout();

    expect(container.querySelectorAll("form").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });
});
