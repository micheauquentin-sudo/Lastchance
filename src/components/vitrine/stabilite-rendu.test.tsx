// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/vitrine", () => ({
  importVitrineCarte: vi.fn(),
  updateVitrineFiche: vi.fn(),
  deleteVitrineFiche: vi.fn(),
  toggleVitrineFicheDisponibilite: vi.fn(),
  // VIT-7 : `FicheEditeur` monte `PhotoChamp`, qui appelle ces deux actions.
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ImportCarte } = await import("@/components/vitrine/import-carte");
const { FicheEditeur } = await import("@/components/vitrine/fiche-editeur");

import type { VitrineFicheView } from "@/lib/vitrine";

/**
 * LA STABILITÉ DE RENDU DE L'ÉCRAN VITRINE — ce qu'aucune relecture ne voit.
 *
 * Deux pannes mesurées en E2E WebKit, et SEULEMENT en suite complète (jamais
 * isolées, jamais sur Chromium) : sous charge, un `<select>` de l'aperçu
 * d'import n'atteignait jamais l'état « stable » de Playwright, et la case
 * « 🌱 Vegan » d'une fiche fraîchement créée restait résolue mais `hidden`
 * vingt secondes. Les deux ont la même famille de cause — un état qui n'est
 * pas là où on croit : recalculé dans le corps du rendu d'un côté, laissé au
 * DOM de l'autre.
 *
 * Ces tests-ci gravent la propriété, pas la panne : ce qui a été SAISI survit
 * à un nouveau rendu du parent. Rallonger le délai E2E l'aurait masquée sans
 * la corriger, et la panne serait revenue au premier écran un peu plus chargé.
 */

afterEach(cleanup);

const CARTE_COLLEE = [
  "ENTRÉES",
  "Houmous — pois chiches — 7 €",
  "Soupe — 6,50",
  "PLATS",
  "Risotto — 18 €",
].join("\n");

function analyser() {
  fireEvent.change(screen.getByLabelText("Votre carte, en texte"), {
    target: { value: CARTE_COLLEE },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyser ma carte" }));
}

describe("ImportCarte — l'aperçu ne se recalcule pas sous les doigts", () => {
  it("garde les valeurs saisies et les nœuds de l'aperçu après un rendu du parent", () => {
    const { rerender } = render(<ImportCarte peutEditer />);
    analyser();

    const classements = screen.getAllByLabelText(
      "Classement",
    ) as HTMLSelectElement[];
    expect(classements).toHaveLength(5);
    expect(classements.map((s) => s.value)).toEqual([
      "rubrique",
      "fiche",
      "fiche",
      "rubrique",
      "fiche",
    ]);

    // Une CORRECTION MANUELLE : le classement d'une ligne, et le nom d'une
    // autre. C'est exactement ce que le parseur est censé laisser reprendre.
    fireEvent.change(classements[2], { target: { value: "ignorer" } });
    const nomRisotto = screen.getByLabelText("Nom", {
      selector: `#import-nom-l4`,
    }) as HTMLInputElement;
    fireEvent.change(nomRisotto, { target: { value: "Risotto maison" } });

    // Les nœuds visés AVANT le nouveau rendu du parent, pour prouver qu'ils
    // ne sont pas remplacés : un `<select>` recréé à chaque rendu est
    // précisément ce que Playwright n'arrive jamais à juger stable.
    const avant = screen.getAllByLabelText("Classement");

    rerender(<ImportCarte peutEditer />);

    const apres = screen.getAllByLabelText("Classement") as HTMLSelectElement[];
    expect(apres).toHaveLength(5);
    apres.forEach((noeud, i) => expect(noeud).toBe(avant[i]));

    // LA PREUVE QUE LE PARSE NE TOURNE PLUS DANS LE CORPS DU RENDU : relancé
    // là, il aurait rendu des lignes neuves issues du texte collé, donc
    // « fiche » et « Risotto » — les deux corrections seraient perdues.
    expect(apres[2].value).toBe("ignorer");
    expect(nomRisotto.value).toBe("Risotto maison");
  });

  it("ne fait bouger les comptes que quand les comptes changent", () => {
    render(<ImportCarte peutEditer />);
    analyser();

    const comptes = document.querySelector(
      "#vitrine-import-comptes",
    ) as HTMLElement;
    expect(comptes.getAttribute("aria-live")).toBe("polite");
    expect(within(comptes).getByText("2 rubriques")).toBeTruthy();
    expect(within(comptes).getByText("3 fiches")).toBeTruthy();

    const classements = screen.getAllByLabelText(
      "Classement",
    ) as HTMLSelectElement[];
    fireEvent.change(classements[2], { target: { value: "ignorer" } });
    expect(within(comptes).getByText("2 fiches")).toBeTruthy();

    // …et dans l'autre sens : le reclassement se reprend.
    fireEvent.change(classements[2], { target: { value: "fiche" } });
    expect(within(comptes).getByText("3 fiches")).toBeTruthy();
  });

  it("n'envoie que ce que l'aperçu montre, corrections comprises", () => {
    render(<ImportCarte peutEditer />);
    analyser();

    fireEvent.change(
      screen.getAllByLabelText("Classement")[2] as HTMLSelectElement,
      { target: { value: "ignorer" } },
    );

    const cache = document.querySelector(
      'input[name="import"]',
    ) as HTMLInputElement;
    const charge = JSON.parse(cache.value) as {
      rubriques: { nom: string; fiches: { nom: string }[] }[];
    };
    expect(charge.rubriques.map((r) => r.nom)).toEqual(["ENTRÉES", "PLATS"]);
    expect(charge.rubriques[0].fiches.map((f) => f.nom)).toEqual(["Houmous"]);
  });
});

function fiche(champs: Partial<VitrineFicheView> = {}): VitrineFicheView {
  return {
    id: "f-1",
    nom: "Risotto",
    description: null,
    prix_affiche: "18 €",
    photo_path: null,
    photo_alt: null,
    facettes: [],
    action: null,
    badges: [],
    allergenes: [],
    disponible: true,
    ordre: 1,
    ...champs,
  };
}

describe("FicheEditeur — le pli d'édition survit au rafraîchissement", () => {
  function rendre(f: VitrineFicheView) {
    return (
      <FicheEditeur
        fiche={f}
        index={0}
        total={1}
        peutEditer
        reorderPending={false}
        onDeplacer={() => {}}
      />
    );
  }

  it("reste ouvert quand le parent re-rend avec de nouvelles props serveur", () => {
    const { rerender } = render(rendre(fiche()));

    const pli = document.querySelector("details") as HTMLDetailsElement;
    expect(pli.open).toBe(false);

    fireEvent.click(screen.getByText("Modifier"));
    expect(pli.open).toBe(true);
    expect(screen.getByLabelText("🌱 Vegan")).toBeTruthy();

    // Ce que fait `router.refresh()` : le même composant, à la même `key`,
    // reçoit un OBJET NEUF pour la même fiche. Le pli ne doit pas se refermer
    // sous le formulaire que le commerçant est en train de remplir.
    rerender(rendre(fiche({ nom: "Risotto" })));

    expect(
      (document.querySelector("details") as HTMLDetailsElement).open,
    ).toBe(true);
    const vegan = screen.getByLabelText("🌱 Vegan") as HTMLInputElement;
    expect(vegan.checkVisibility?.() ?? true).toBe(true);
  });

  it("laisse le pli des allergènes suivre le geste, pas la valeur serveur", () => {
    const { rerender } = render(rendre(fiche()));
    fireEvent.click(screen.getByText("Modifier"));

    const allergenes = [...document.querySelectorAll("details")].find((d) =>
      d.querySelector("summary")?.textContent?.includes("Allergènes"),
    ) as HTMLDetailsElement;
    expect(allergenes.open).toBe(false);

    fireEvent.click(allergenes.querySelector("summary") as HTMLElement);
    expect(allergenes.open).toBe(true);

    // Le serveur repasse la fiche SANS allergène : avant, `open` était dérivé
    // de `fiche.allergenes.length`, et ce pli-là se refermait sur la case
    // qu'on venait d'ouvrir pour cocher.
    rerender(rendre(fiche({ allergenes: [] })));
    expect(allergenes.open).toBe(true);
  });

  it("ouvre d'emblée les allergènes déjà renseignés", () => {
    render(rendre(fiche({ allergenes: ["gluten"] })));
    fireEvent.click(screen.getByText("Modifier"));

    const allergenes = [...document.querySelectorAll("details")].find((d) =>
      d.querySelector("summary")?.textContent?.includes("Allergènes"),
    ) as HTMLDetailsElement;
    expect(allergenes.open).toBe(true);
  });
});
