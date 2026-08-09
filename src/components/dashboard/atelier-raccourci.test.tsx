// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RaccourciAtelier,
  VoirLeJeu,
} from "@/components/dashboard/atelier-raccourci";

/**
 * CE QUE CE FICHIER PROTÈGE.
 *
 * 1. **Rien sans URL** — `VoirLeJeu` reçoit `null` de toute page dont le jeu
 *    n'est pas ouvert (ou de la roue sans QR). Un bouton rendu là mènerait le
 *    commerçant sur un écran fermé, ce qui est pire que pas de bouton.
 * 2. **Nouvel onglet, et `rel` complet** — on quitte le dashboard pour la vue
 *    joueur ; le retour doit être un clic sur l'onglet, pas la perte du
 *    contexte d'édition. `noopener` est obligatoire sur une cible `_blank`.
 * 3. **Deux noms accessibles DISTINCTS** — les deux liens vivent côte à côte
 *    dans la tuile « Statut » et les emojis sont hors du nom accessible ; un
 *    locator par rôle+nom doit rester sans ambiguïté.
 */

afterEach(cleanup);

describe("VoirLeJeu", () => {
  it("ne rend rien quand l'URL joueur est absente", () => {
    const { container } = render(<VoirLeJeu href={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("ouvre l'URL joueur dans un nouvel onglet, sans fuite d'opener", () => {
    render(<VoirLeJeu href="https://exemple.test/play/abc" />);
    const lien = screen.getByRole("link", { name: "Voir le jeu" });
    expect(lien.getAttribute("href")).toBe("https://exemple.test/play/abc");
    expect(lien.getAttribute("target")).toBe("_blank");
    expect(lien.getAttribute("rel")).toContain("noopener");
    expect(lien.getAttribute("rel")).toContain("noreferrer");
  });

  it("porte un nom accessible distinct de celui du raccourci atelier", () => {
    render(
      <>
        <RaccourciAtelier href="/dashboard/quiz/1?etape=quiz" />
        <VoirLeJeu href="https://exemple.test/quiz/abc" />
      </>,
    );
    expect(
      screen.getByRole("link", { name: "Modifier dans l'atelier" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voir le jeu" })).toBeTruthy();
  });
});
