// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CarteRepliable } from "@/components/dashboard/carte-repliable";

/**
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI CHAQUE POINT EST FRAGILE.
 *
 * 1. **Ouvert par défaut** — les E2E cliquent dans ces blocs sans les déplier.
 *    Un jour où le défaut basculerait à « replié », `referral.spec.ts` et les
 *    ancres `#suivi`/`#reglages` tomberaient d'un coup, loin d'ici.
 * 2. **L'ancre survit au repli** — c'est la seule raison pour laquelle l'`id`
 *    vit sur l'enveloppe et non sur l'enfant : replier un bloc ne doit pas
 *    faire disparaître la cible d'un lien de la Carte de l'Aventure.
 * 3. **Le titre replié n'est pas un heading** — sinon deux `<h2>` du même nom
 *    coexisteraient à l'ouverture et `getByRole("heading", { name })`
 *    deviendrait ambigu.
 */

afterEach(cleanup);

describe("CarteRepliable", () => {
  it("rend son contenu déplié par défaut, avec un bouton « Réduire »", () => {
    render(
      <CarteRepliable titre="Parrainage ludique" id="parrainage">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.getByText("Contenu du bloc")).toBeTruthy();
    const bouton = screen.getByRole("button", {
      name: "Réduire « Parrainage ludique »",
    });
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
  });

  it("replie le bloc : le contenu disparaît, le titre reste lisible", () => {
    render(
      <CarteRepliable titre="Performance par lot">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Réduire « Performance par lot »" }),
    );

    expect(screen.queryByText("Contenu du bloc")).toBeNull();
    const bouton = screen.getByRole("button", {
      name: "Développer « Performance par lot »",
    });
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Performance par lot")).toBeTruthy();
  });

  it("rouvre le bloc au second clic", () => {
    render(
      <CarteRepliable titre="Réglages">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Réduire « Réglages »" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Développer « Réglages »" }),
    );

    expect(screen.getByText("Contenu du bloc")).toBeTruthy();
  });

  it("garde l'ancre sur l'enveloppe dans les deux états", () => {
    const { container } = render(
      <CarteRepliable titre="Réglages" id="reglages">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(container.querySelector("#reglages")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Réduire « Réglages »" }),
    );
    expect(container.querySelector("#reglages")).toBeTruthy();
  });

  it("n'expose aucun heading : le bloc enveloppé garde le sien", () => {
    render(
      <CarteRepliable titre="Réglages">
        <h2>Réglages</h2>
      </CarteRepliable>,
    );

    expect(screen.getAllByRole("heading")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Réduire « Réglages »" }),
    );
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });

  it("respecte defaultOuvert={false}", () => {
    render(
      <CarteRepliable titre="Enregistrer comme modèle" defaultOuvert={false}>
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.queryByText("Contenu du bloc")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Développer « Enregistrer comme modèle »" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
