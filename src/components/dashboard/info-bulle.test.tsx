// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InfoBulle, infoBulleTexteId } from "@/components/dashboard/info-bulle";

/**
 * UNE INFO-BULLE QUI NE RELIE PAS SON TEXTE N'EST PAS UNE INFO-BULLE.
 *
 * Sans `aria-describedby` résolu, un lecteur d'écran annonce le résumé et rien
 * d'autre : le commerçant aveugle entend « Ce qui va se passer » sans jamais
 * savoir ce qui va se passer. Le lien entre les deux est un attribut ; un
 * attribut se casse en silence à la première renommage d'`id`.
 */

afterEach(cleanup);

describe("InfoBulle", () => {
  it("relie le résumé à son texte par aria-describedby", () => {
    render(
      <InfoBulle id="creation-quiz" resume="Ce qui va se passer">
        Le bouton prépare un brouillon.
      </InfoBulle>,
    );

    const resume = screen.getByText("Ce qui va se passer").closest("summary")!;
    const cible = resume.getAttribute("aria-describedby")!;

    expect(cible).toBe(infoBulleTexteId("creation-quiz"));
    expect(document.getElementById(cible)?.textContent).toBe(
      "Le bouton prépare un brouillon.",
    );
  });

  it("expose un id de texte que d'autres champs peuvent viser", () => {
    // C'est tout l'intérêt d'un `id` fourni plutôt que d'un `useId` : un
    // champ de formulaire peut décrire sa case avec cette même explication.
    expect(infoBulleTexteId("creation-chasse")).toBe("creation-chasse-texte");
  });

  it("reste repliée par défaut, et sait s'ouvrir d'emblée", () => {
    const { unmount } = render(
      <InfoBulle id="a" resume="Résumé">
        Texte
      </InfoBulle>,
    );
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(false);
    unmount();

    render(
      <InfoBulle id="b" resume="Résumé" defaultOpen>
        Texte
      </InfoBulle>,
    );
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("n'annonce pas ses décorations aux lecteurs d'écran", () => {
    render(
      <InfoBulle id="c" resume="Ce qui va se passer">
        Texte
      </InfoBulle>,
    );
    const resume = document.querySelector("summary")!;

    // L'ampoule et le chevron sont des repères visuels : entendus, ils
    // parasiteraient la phrase utile.
    for (const decor of resume.querySelectorAll("[aria-hidden]")) {
      expect(decor.getAttribute("aria-hidden")).toBe("true");
    }
    expect(resume.querySelectorAll("[aria-hidden]").length).toBeGreaterThan(0);
  });

  it("porte l'id demandé sur le bloc, pour être ancrable", () => {
    render(
      <InfoBulle id="creation-jackpot" resume="Résumé">
        Texte
      </InfoBulle>,
    );
    expect(document.getElementById("creation-jackpot")?.tagName).toBe("DETAILS");
  });
});
