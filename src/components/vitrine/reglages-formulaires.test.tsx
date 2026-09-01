// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/vitrine", () => ({
  publishVitrine: vi.fn(),
  unpublishVitrine: vi.fn(),
  saveVitrineSettings: vi.fn(),
  setVitrineSlug: vi.fn(),
  resetVitrineCouleurs: vi.fn(),
  // `PhotoChamp`, monté par l'écran de réglages, appelle ces deux-là.
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ReglagesVitrine } = await import(
  "@/components/vitrine/reglages-vitrine"
);

import type { VitrineSettingsView } from "@/lib/vitrine";

/**
 * AUCUN FORMULAIRE IMBRIQUÉ DANS L'ÉCRAN DE RÉGLAGES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME, ET IL A ÉTÉ LIVRÉ ──
 *
 * Un `<form>` dans un `<form>` n'est pas du HTML valide. Le navigateur ne
 * proteste pas : il DÉPLIE en silence, l'arbre rendu cesse de correspondre à
 * celui que React a produit sur le serveur, l'hydratation échoue — et toute
 * l'interactivité de l'écran tombe avec, y compris celle des blocs qui n'ont
 * rien à voir.
 *
 * VIT-14 a posé « Revenir aux couleurs de mon métier », qui a sa propre action
 * donc son propre formulaire, à l'intérieur du `<fieldset>` des couleurs. Le
 * résultat, vu seulement en E2E : « Créer la carte » et « Mettre en avant »
 * cessaient de répondre. Deux tests rouges, sur deux fonctions sans aucun
 * rapport avec les couleurs, pour une balise mal placée.
 *
 * ── POURQUOI CETTE GARDE ET PAS UNE RELECTURE ──
 *
 * L'écran de réglages porte QUATRE formulaires — adresse, identité et thème,
 * couleurs du métier, publication — dans quatre composants différents, séparés
 * par plus de six cents lignes. Aucune relecture ne tient cet invariant, et
 * l'avertissement était pourtant DÉJÀ écrit dans le fichier, pour `PhotoChamp`.
 * Un avertissement qu'on relit et qu'on enfreint quand même est un test qui
 * manque.
 *
 * `form form` est un sélecteur CSS de DESCENDANT, pas d'enfant direct : il
 * attrape aussi le formulaire enfoui sous trois `<div>`, qui est exactement la
 * forme sous laquelle le défaut est arrivé.
 */

afterEach(cleanup);

const SETTINGS: VitrineSettingsView = {
  id: "aaaa0000-0000-4000-8000-000000000001",
  slug: "le-comptoir",
  published: false,
  accroche: null,
  histoire: null,
  horaires_texte: null,
  theme: {},
  cover_path: null,
  cover_alt: null,
  indexable: false,
  secteur: "restaurant",
  badge_ouverture: null,
  updated_at: null,
};

describe("écran de réglages Vitrine — aucun formulaire imbriqué", () => {
  it("ne rend AUCUN <form> à l'intérieur d'un autre, adresse posée", () => {
    const { container } = render(
      <ReglagesVitrine
        settings={SETTINGS}
        appUrl="https://exemple.test"
        peutEditer
        peutPublier
      />,
    );

    // La garde de la garde : sans formulaire du tout, l'assertion suivante
    // passerait en ne mesurant rien.
    expect(container.querySelectorAll("form").length).toBeGreaterThan(2);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });

  it("n'en rend pas davantage quand l'adresse n'est pas encore choisie", () => {
    // `settings` à `null` est l'écran d'une vitrine à moitié créée : il ne rend
    // que le formulaire d'adresse, et c'est un chemin distinct du précédent.
    const { container } = render(
      <ReglagesVitrine
        settings={null}
        appUrl="https://exemple.test"
        peutEditer
        peutPublier
      />,
    );

    expect(container.querySelectorAll("form").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });

  it("le bloc « couleurs du métier » est bien rendu, et hors du formulaire de réglages", () => {
    // Sans cette assertion, déplacer le bloc HORS de l'écran ferait passer la
    // garde ci-dessus pour la pire des raisons : il n'y aurait plus rien à
    // imbriquer.
    const { container } = render(
      <ReglagesVitrine
        settings={SETTINGS}
        appUrl="https://exemple.test"
        peutEditer
        peutPublier
      />,
    );

    const bouton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Revenir aux couleurs de mon métier"),
    );
    expect(bouton, "le bouton de retour aux couleurs du métier est absent").toBeTruthy();
    // Son formulaire à lui existe, et n'a aucun formulaire au-dessus de lui.
    expect(bouton!.closest("form")).toBeTruthy();
    expect(bouton!.closest("form")!.parentElement?.closest("form")).toBeNull();
  });
});
