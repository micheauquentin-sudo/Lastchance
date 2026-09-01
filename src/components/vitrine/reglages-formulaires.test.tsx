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

/**
 * LES TÉMOINS DE SECTION SONT BIEN POSÉS (VIT-19).
 *
 * ── LA PANNE EST SYMÉTRIQUE, ET LES DEUX MOITIÉS SONT SILENCIEUSES ──
 *
 * `composerTheme` ne touche plus une section que si son écran l'a témoignée.
 * Cela ferme une moitié du défaut — un formulaire partiel n'efface plus ce
 * qu'il ne montre pas — et en ouvre exactement une autre : un écran qui rend
 * la section mais OUBLIE son témoin ne l'enregistre plus.
 *
 * Cette moitié-là est la plus vicieuse des deux. Le commerçant règle sa
 * couleur, clique, l'action répond « Vitrine enregistrée. », et rien n'a
 * changé. Aucune erreur, aucune trace, un écran qui recharge sur l'ancienne
 * valeur — et la conclusion naturelle est que le clic n'a pas pris.
 *
 * Les gardes de `src/actions/vitrine.test.ts` ne peuvent pas la voir : elles
 * fabriquent leur `FormData` à la main, donc elles posent les témoins qu'elles
 * décrivent. Seul le rendu réel des deux écrans le dit — d'où ce fichier.
 */
describe("les témoins de section accompagnent les champs qu'ils gardent", () => {
  function temoins(container: HTMLElement): string[] {
    return [...container.querySelectorAll('input[type="hidden"]')]
      .map((n) => n.getAttribute("name") ?? "")
      .filter((n) => n.endsWith("_rendue") || n.endsWith("_rendues") || n.endsWith("_rendu") || n.endsWith("_rendus"));
  }

  it("l'écran de réglages rend les quatre sections, donc les quatre témoins", () => {
    const { container } = render(
      <ReglagesVitrine
        settings={SETTINGS}
        appUrl="https://exemple.test"
        peutEditer
        peutPublier
      />,
    );

    // Chaque champ EST rendu — sans quoi la présence du témoin ne prouverait
    // rien qu'un copier-coller ne prouve.
    expect(container.querySelector('[name="couleur_primary"]')).toBeTruthy();
    expect(container.querySelector('[name="police_heading"]')).toBeTruthy();
    expect(container.querySelector('[name="style_cartes"]')).toBeTruthy();
    expect(container.querySelector('[name="ordre_blocs"]')).toBeTruthy();

    const poses = temoins(container);
    for (const attendu of [
      "couleurs_rendues",
      "polices_rendues",
      "style_cartes_rendu",
      "blocs_rendus",
      "allure_rendue",
    ]) {
      expect(poses, `témoin manquant : ${attendu}`).toContain(attendu);
    }
  });

  it("chaque témoin part avec le MÊME formulaire que son champ", () => {
    // Un témoin posé hors du formulaire qui porte le champ ne serait jamais
    // envoyé — la section deviendrait inenregistrable, et l'écran continuerait
    // de la montrer comme réglable.
    const { container } = render(
      <ReglagesVitrine
        settings={SETTINGS}
        appUrl="https://exemple.test"
        peutEditer
        peutPublier
      />,
    );

    const couples: Array<[string, string]> = [
      ["couleur_primary", "couleurs_rendues"],
      ["police_heading", "polices_rendues"],
      ["style_cartes", "style_cartes_rendu"],
      ["ordre_blocs", "blocs_rendus"],
    ];

    for (const [champ, temoin] of couples) {
      const formChamp = container
        .querySelector(`[name="${champ}"]`)!
        .closest("form");
      const formTemoin = container
        .querySelector(`[name="${temoin}"]`)!
        .closest("form");
      expect(formChamp, `${champ} hors de tout formulaire`).toBeTruthy();
      expect(formTemoin, `${temoin} n'accompagne pas ${champ}`).toBe(formChamp);
    }
  });
});
