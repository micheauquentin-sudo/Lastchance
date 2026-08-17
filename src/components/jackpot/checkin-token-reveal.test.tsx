// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CheckinTokenReveal } from "./checkin-token-reveal";

/**
 * LE JETON NE DOIT PAS ÊTRE DANS LE DOM QUAND LE PLI EST FERMÉ (INFO-1).
 *
 * Un `<details>` replié garde son contenu : le jeton de check-in y serait
 * lisible par une extension de navigateur, un traducteur de page ou un
 * enregistreur de session — alors que le QR, lui, ne vit qu'en dataURL d'image.
 * La première assertion ci-dessous échoue sur la version d'origine du pli, qui
 * rendait `{token}` inconditionnellement.
 *
 * La seconde tient la promesse inverse, et elle compte autant : le geste de la
 * caisse (ouvrir le pli, lire ou copier le code) doit marcher DÈS le clic. Le
 * `<details>` reste donc natif — c'est son événement `toggle` qui monte le
 * texte, pas un bouton à nous.
 */

const JETON = "abcdefghijklmnopqrstuvwx.signature-du-jeton";

/**
 * Ouvre le pli PAR LE GESTE RÉEL : un clic sur le résumé, comme au comptoir et
 * comme l'E2E de caisse. Aucun raccourci d'état, aucun événement fabriqué à la
 * main — c'est l'ouverture native qui doit faire apparaître le texte, sinon le
 * geste de la caisse tomberait sur un pli muet.
 */
const resume = () => screen.getByText(/Afficher le code/);

/** Referme le pli par le même geste (le clic bascule dans les deux sens). */
const basculer = () => fireEvent.click(resume());

afterEach(cleanup);

describe("CheckinTokenReveal", () => {
  it("pli fermé : le jeton n'est NULLE PART dans le DOM", () => {
    const { container } = render(<CheckinTokenReveal token={JETON} />);
    expect(resume()).toBeTruthy();
    // Ni en texte, ni en attribut : c'est tout le contenu du pli qui n'est pas
    // monté, pas seulement caché.
    expect(container.innerHTML).not.toContain(JETON);
    expect(screen.queryByText(JETON)).toBeNull();
  });

  it("pli ouvert : le jeton apparaît, sélectionnable d'un geste", async () => {
    render(<CheckinTokenReveal token={JETON} />);
    basculer();

    const code = await screen.findByText(JETON);
    expect(code).toBeTruthy();
    // `select-all` : au comptoir, un appui long suffit à tout prendre.
    expect(code.className).toContain("select-all");
    expect(screen.getByText(/se saisit à la main/)).toBeTruthy();
  });

  it("pli refermé : le jeton quitte de nouveau le DOM", async () => {
    const { container } = render(<CheckinTokenReveal token={JETON} />);
    basculer();
    await screen.findByText(JETON);

    basculer();
    await waitFor(() => expect(container.innerHTML).not.toContain(JETON));
  });

  it("le jeton renouvelé remplace le précédent tant que le pli est ouvert", async () => {
    const { container, rerender } = render(<CheckinTokenReveal token={JETON} />);
    basculer();
    await screen.findByText(JETON);

    // Le jeton se renouvelle toutes les ~3 min : un pli ouvert doit suivre,
    // sinon le client dicterait un code expiré au comptoir.
    rerender(<CheckinTokenReveal token="frais.nouvelle-signature" />);
    expect(screen.getByText("frais.nouvelle-signature")).toBeTruthy();
    expect(container.innerHTML).not.toContain(JETON);
  });
});
