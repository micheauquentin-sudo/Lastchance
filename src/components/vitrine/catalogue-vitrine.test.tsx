// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CatalogueVitrine,
  decoderFragment,
} from "@/components/vitrine/catalogue-vitrine";
import { FicheVitrine } from "@/components/vitrine/fiche-vitrine";
import type { VitrineCarteView } from "@/lib/vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";

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
        action: null,
        fiches: [
          {
            id: "e2f10000-0000-4000-8000-000000000031",
            nom: "Velouté de potiron",
            description: "Crème légère, graines torréfiées maison.",
            prix_affiche: "à partir de 8 €",
            photo_path: null,
            photo_alt: null,
            facettes: [],
            action: null,
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
            photo_alt: null,
            facettes: [],
            action: null,
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
        action: null,
        fiches: [
          {
            id: "e2f10000-0000-4000-8000-000000000033",
            nom: "Tartare de bœuf",
            description: "Coupé au couteau, frites maison.",
            prix_affiche: "19 €",
            photo_path: null,
            photo_alt: null,
            facettes: [],
            action: null,
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
            photo_alt: null,
            facettes: [],
            action: null,
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
        action: null,
        fiches: [
          // BADGES ET ALLERGÈNES VIDES — le cas qu'un rendu naïf transforme
          // en « [] ».
          {
            id: "e2f10000-0000-4000-8000-000000000035",
            nom: "Côtes-du-rhône",
            description: "Domaine de la Tour, 2023.",
            prix_affiche: "5,5 / 24 €",
            photo_path: null,
            photo_alt: null,
            facettes: [],
            action: null,
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
            photo_alt: null,
            facettes: [],
            action: null,
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

/**
 * LES PROPS QUI NE VARIENT PAS D'UN TEST À L'AUTRE (VIT-13).
 *
 * L'allure vient de `resoudreThemeVitrine` et NON d'un littéral recopié : ces
 * tests doivent voir exactement les défauts que voit la page publique, et un
 * objet écrit à la main ici aurait cessé de les refléter au premier défaut qui
 * change — sans qu'aucun test ne rougisse.
 */
const ALLURE = resoudreThemeVitrine(null).allure;
const SOCLE = {
  secteur: "restaurant",
  allure: ALLURE,
  slug: "e2e-comptoir",
  histoire: null,
  horaires: null,
} as const;
const SOCLE_FICHE = {
  secteur: "restaurant",
  allure: ALLURE,
  favori: false,
  onBasculerFavori: null,
} as const;

describe("CatalogueVitrine — rendu public (seed e2e-comptoir)", () => {
  it("rend les deux cartes en onglets et la première carte par défaut", () => {
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="fr" portesOuvertes={[]} />);

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
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="fr" portesOuvertes={[]} />);

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
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="fr" portesOuvertes={[]} />);

    // Onglet "Vins & boissons" pour atteindre la fiche sans badges.
    fireEvent.click(screen.getByRole("button", { name: "Vins & boissons" }));

    const article = screen.getByText("Côtes-du-rhône").closest("article");
    expect(article).toBeTruthy();
    expect(article?.textContent).not.toContain("[]");
  });

  it("le filet nom/prix et le prix s'affichent sur une même ligne", () => {
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="fr" portesOuvertes={[]} />);

    const article = screen
      .getByText("Velouté de potiron")
      .closest("article") as HTMLElement;
    expect(within(article).getByText("à partir de 8 €")).toBeTruthy();
  });

  it("les allergènes sont repliés dans un <details>", () => {
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="fr" portesOuvertes={[]} />);

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
    render(<FicheVitrine {...SOCLE_FICHE} fiche={ficheDisponible} styleCartes="liste" lang="fr" portesOuvertes={[]} />);
    expect(screen.getByText("Velouté de potiron")).toBeTruthy();
    expect(
      screen.getByText("Crème légère, graines torréfiées maison."),
    ).toBeTruthy();
    expect(screen.getByText("🥗 Végétarien")).toBeTruthy();
    expect(screen.queryByText("Indisponible aujourd'hui")).toBeNull();
  });

  it("le monogramme n'apparaît qu'en dehors du style liste", () => {
    const { container: liste } = render(
      <FicheVitrine {...SOCLE_FICHE} fiche={ficheDisponible} styleCartes="liste" lang="fr" portesOuvertes={[]} />,
    );
    // Le monogramme porte `h-16`/`h-28` ; le filet nom/prix porte aussi
    // `aria-hidden`, donc on cible la classe propre au monogramme.
    expect(liste.querySelector(".h-16, .h-28")).toBeNull();
    cleanup();

    const { container: grille } = render(
      <FicheVitrine {...SOCLE_FICHE} fiche={ficheDisponible} styleCartes="grille" lang="fr" portesOuvertes={[]} />,
    );
    expect(grille.textContent).toContain("V");
  });

  it("une fiche indisponible est grisée avec la mention textuelle", () => {
    render(<FicheVitrine {...SOCLE_FICHE} fiche={ficheIndisponible} styleCartes="grille" lang="fr" portesOuvertes={[]} />);
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
      <FicheVitrine {...SOCLE_FICHE} fiche={ficheIndisponible} styleCartes="grille" lang="en" portesOuvertes={[]} />,
    );
    expect(screen.getByText("Unavailable today")).toBeTruthy();
    expect(screen.queryByText("Indisponible aujourd'hui")).toBeNull();
    expect(screen.getByText("Allergens")).toBeTruthy();
  });

  it("le libellé de recherche et l'état vide basculent aussi", () => {
    render(<CatalogueVitrine {...SOCLE} cartes={CARTES} styleCartes="grille" lang="en" portesOuvertes={[]} />);
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

/**
 * LA NOUVELLE STRUCTURE D'ÉCRAN (VIT-13) — onglets, chips filtrantes, favoris.
 *
 * Ce bloc garde ce que la maquette de référence a changé au catalogue, et
 * surtout les DEUX endroits où la fidélité à la maquette aurait pu faire perdre
 * quelque chose : l'histoire remontée en onglet, et les rubriques passées d'un
 * sommaire qui défile à un filtre qui masque.
 */
describe("CatalogueVitrine — onglets, filtres et favoris (VIT-13)", () => {
  it("« Notre histoire » devient un onglet, devant les cartes", () => {
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
        histoire="Trois générations."
        horaires={"Mardi au dimanche\n12h-14h"}
      />,
    );

    const onglet = screen.getByRole("button", { name: "Notre histoire" });
    expect(onglet.getAttribute("aria-pressed")).toBe("false");

    // À L'ARRIVÉE, C'EST LA CARTE QUI EST OUVERTE, pas la biographie du lieu :
    // le client qui scanne à table veut la carte.
    expect(
      screen.getByRole("button", { name: "Carte du midi" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(onglet);
    expect(onglet.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Trois générations.")).toBeTruthy();
    // Les horaires voyagent AVEC l'histoire, dans le même onglet.
    expect(screen.getByText(/Mardi au dimanche/)).toBeTruthy();
  });

  it("sans histoire ni horaires, aucun onglet supplémentaire n'apparaît", () => {
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Notre histoire" })).toBeNull();
  });

  it("toutes les rubriques sont visibles à l'arrivée, et « tout » est actif", () => {
    // ÉCART ASSUMÉ À LA MAQUETTE, qui ouvre sur la première rubrique : une carte
    // de restaurant se lit d'abord en entier, et n'en montrer qu'un septième
    // ferait croire à une carte vide chez qui n'a que trois plats par rubrique.
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    const rubriques = CARTES[0].categories;
    expect(rubriques.length).toBeGreaterThan(1);
    for (const r of rubriques) {
      expect(screen.getByRole("heading", { name: r.nom })).toBeTruthy();
    }
  });

  it("une chip filtre sur sa seule rubrique, et « tout » les rouvre", () => {
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    const [premiere, seconde] = CARTES[0].categories;

    fireEvent.click(screen.getByRole("button", { name: premiere.nom }));
    expect(screen.getByRole("heading", { name: premiere.nom })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: seconde.nom })).toBeNull();

    // Le bouton « tout » porte le nom accessible du groupe de rubriques : c'est
    // un glyphe (⌂) à l'œil, et il ne doit pas être muet à l'oreille.
    fireEvent.click(screen.getAllByRole("button", { name: "Rubriques" })[0]);
    expect(screen.getByRole("heading", { name: seconde.nom })).toBeTruthy();
  });

  it("une recherche ROUVRE toutes les rubriques", () => {
    // Filtrer deux fois — par rubrique ET par mot — ferait répondre « aucun
    // résultat » sur un plat qui existe deux rubriques plus bas.
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    const [premiere, seconde] = CARTES[0].categories;
    fireEvent.click(screen.getByRole("button", { name: premiere.nom }));
    expect(screen.queryByRole("heading", { name: seconde.nom })).toBeNull();

    const cherche = seconde.fiches[0].nom;
    fireEvent.change(screen.getByLabelText(/Rechercher dans/), {
      target: { value: cherche },
    });
    expect(screen.getByRole("heading", { name: seconde.nom })).toBeTruthy();
  });

  it("le cœur porte le NOM du plat, jamais un libellé répété trente fois", () => {
    // Une carte porte trente boutons identiques : « Ajouter aux favoris »
    // trente fois ne dit rien à qui parcourt les contrôles au lecteur d'écran.
    render(
      <CatalogueVitrine
        {...SOCLE}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    const plat = CARTES[0].categories[0].fiches[0];
    const coeur = screen.getByRole("button", { name: `Favori : ${plat.nom}` });
    expect(coeur.getAttribute("aria-pressed")).toBe("false");
  });

  it("les favoris éteints par l'allure ne rendent AUCUN cœur", () => {
    render(
      <CatalogueVitrine
        {...SOCLE}
        allure={{ ...ALLURE, favoris: false }}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Favori/ })).toBeNull();
  });

  it("la recherche éteinte par l'allure retire le champ, pas les plats", () => {
    render(
      <CatalogueVitrine
        {...SOCLE}
        allure={{ ...ALLURE, recherche: false }}
        cartes={CARTES}
        styleCartes="liste"
        lang="fr"
        portesOuvertes={[]}
      />,
    );
    expect(screen.queryByLabelText(/Rechercher dans/)).toBeNull();
    expect(
      screen.getByRole("heading", { name: CARTES[0].categories[0].nom }),
    ).toBeTruthy();
  });
});
