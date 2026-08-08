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

afterEach(() => {
  cleanup();
  // L'ancre est un état GLOBAL : un test qui la laisse traîner rouvrirait le
  // bloc du suivant, et l'échec se lirait à trois tests de sa cause.
  window.location.hash = "";
});

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

  it("rend le numéro dans les deux états", () => {
    render(
      <CarteRepliable titre="Dotation" numero={3}>
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Réduire/ }));
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("dit le statut dans l'aria-label, jamais par la seule couleur", () => {
    const { rerender } = render(
      <CarteRepliable titre="Dotation" numero={3} statut="complet">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(
      screen.getByRole("button", { name: "Réduire « 3. Dotation — complet »" }),
    ).toBeTruthy();

    rerender(
      <CarteRepliable titre="Dotation" numero={3} statut="incomplet">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(
      screen.getByRole("button", {
        name: "Réduire « 3. Dotation — il manque quelque chose »",
      }),
    ).toBeTruthy();
  });

  it("garde l'aria-label historique quand ni numéro ni statut ne sont fournis", () => {
    render(
      <CarteRepliable titre="Réglages">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(
      screen.getByRole("button", { name: "Réduire « Réglages »" }),
    ).toBeTruthy();
  });

  it("n'affiche le résumé QUE replié", () => {
    render(
      <CarteRepliable titre="Dotation" resume="4 lots, 120 en stock">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.queryByText("4 lots, 120 en stock")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Réduire/ }));
    expect(screen.getByText("4 lots, 120 en stock")).toBeTruthy();
  });

  it("s'ouvre au montage quand l'ancre de l'URL est la sienne", () => {
    window.location.hash = "#reglages";

    render(
      <CarteRepliable titre="Réglages" id="reglages" defaultOuvert={false}>
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.getByText("Contenu du bloc")).toBeTruthy();
  });

  it("ne s'ouvre pas pour l'ancre d'un autre bloc", () => {
    window.location.hash = "#suivi";

    render(
      <CarteRepliable titre="Réglages" id="reglages" defaultOuvert={false}>
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    expect(screen.queryByText("Contenu du bloc")).toBeNull();
  });

  it("rouvre un bloc replié à la main quand on resaute sur son ancre", () => {
    render(
      <CarteRepliable titre="Réglages" id="reglages">
        <p>Contenu du bloc</p>
      </CarteRepliable>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Réduire « Réglages »" }));
    expect(screen.queryByText("Contenu du bloc")).toBeNull();

    window.location.hash = "#reglages";
    fireEvent(window, new Event("hashchange"));

    expect(screen.getByText("Contenu du bloc")).toBeTruthy();
  });
});
