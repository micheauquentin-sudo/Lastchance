// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LienPortefeuille } from "@/components/wallet/lien-portefeuille";

/**
 * LE PREMIER TEST DE RENDU DE CE DÉPÔT.
 *
 * ── CE QU'IL CHANGE ─────────────────────────────────────────────────
 *
 * Jusqu'ici, toute garde portant sur un composant était TEXTUELLE, et les
 * en-têtes le disaient : « prouve une présence, jamais une atteignabilité »
 * (ADR-074). Ce n'était pas une préférence de style mais une contrainte —
 * `vitest.config.ts` n'incluait que `src/**\/*.test.ts` et tournait en
 * `environment: "node"`. Un test de composant n'y était pas rouge : **il
 * n'était pas collecté**, ce qui est le pire des silences.
 *
 * La contrainte est levée (happy-dom + @testing-library/react, `.tsx` dans
 * `include`). Les gardes textuelles ne disparaissent pas pour autant : elles
 * se dérivent du système de fichiers, donc elles attrapent l'écran ajouté
 * demain que personne n'aura pensé à tester. **L'écart entre les deux formes
 * est la démonstration** — la textuelle couvre l'exhaustivité, celle-ci
 * couvre la réalité du rendu.
 */

afterEach(cleanup);

describe("LienPortefeuille — rendu réel", () => {
  it("rend un lien atteignable vers la route fixe", () => {
    render(<LienPortefeuille />);
    const lien = screen.getByRole("link");
    // `getByRole` échoue si l'élément n'est pas dans l'arbre accessible :
    // un `<a>` sans `href` n'a pas le rôle `link`. On prouve donc à la fois
    // la présence ET la navigabilité, ce qu'un grep ne pouvait pas faire.
    expect(lien).toHaveProperty("tagName", "A");
    expect(lien.getAttribute("href")).toBe("/portefeuille");
  });

  it("porte un nom accessible qui dit où l'on va, emoji exclu", () => {
    render(<LienPortefeuille />);

    // ── CE TEST A DÉJÀ CORRIGÉ SA PROPRE MÉTHODE ──
    // Première rédaction : `getByRole("link").textContent`. Elle a rougi, et
    // elle avait raison de rougir — `textContent` concatène TOUT le DOM, y
    // compris ce qui porte `aria-hidden`, alors que le nom accessible est
    // calculé par l'algorithme accname qui l'EXCLUT. Mesurer `textContent`
    // pour parler d'accessibilité, c'est mesurer ce qu'un lecteur d'écran
    // n'annonce justement pas. L'option `name` de `getByRole` passe par le
    // vrai calcul (dom-accessibility-api) : c'est la seule forme qui
    // prouve ce que la phrase affirme.
    const lien = screen.getByRole("link", {
      name: "Mes récompenses — retrouver tous mes lots et leur validité",
    });
    expect(lien).toBeDefined();

    // L'emoji est décoratif : présent à l'écran, absent de l'annonce.
    expect(lien.textContent).toContain("🎁");
    expect(
      screen.queryByRole("link", { name: /🎁/ }),
    ).toBeNull();
  });

  it("accepte une classe sans perdre les siennes", () => {
    render(<LienPortefeuille className="mt-4" />);
    const classes = screen.getByRole("link").className;
    expect(classes).toContain("mt-4");
    // Le style de base doit survivre à la surcharge : un appelant qui ajoute
    // une marge ne doit pas effacer le soulignement qui fait lire « lien ».
    expect(classes).toContain("underline");
  });
});
