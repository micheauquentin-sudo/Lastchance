// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RedeemCodeScreen } from "@/components/wheel/claim-form";

/**
 * LE GAGNANT DE LA ROUE ATTEINT SON PORTEFEUILLE — PROUVÉ PAR LE RENDU.
 *
 * ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────
 *
 * `portefeuille-atteignable.test.ts` garde huit écrans, et il est TEXTUEL :
 * il prouve qu'un fichier importe le lien, jamais qu'il l'affiche. Sur ces
 * huit écrans la limite était acceptable — le lien y est posé dans du JSX
 * inconditionnel, à côté d'une phrase déjà rendue.
 *
 * Ici elle ne l'est pas. `RedeemCodeScreen` a DEUX vues mutuellement
 * exclusives — le code encore valable, et le code expiré — et le lien doit
 * être dans les deux. Un import unique en tête de fichier satisferait une
 * garde textuelle même si le lien n'était posé que dans l'une des deux : le
 * cas le plus utile (le client dont le code vient d'expirer, à qui l'écran
 * ne propose plus rien) serait celui qu'on aurait manqué.
 *
 * ── CE QUE CE COMPOSANT COUVRE ──────────────────────────────────────
 *
 * Huit surfaces : les quatre écrans de roue et les quatre tours offerts
 * (calendrier, fidélité, quiz, parrainage). C'est ce qui rend le lien
 * économique à poser — et un oubli coûteux.
 */

afterEach(cleanup);

const BASE = {
  redeemCode: "ABCD1234",
  emailSent: false,
  walletUrl: null,
  appleWalletUrl: null,
};

describe("RedeemCodeScreen — le lien vers le portefeuille est RENDU", () => {
  it("sur le code encore valable", () => {
    render(<RedeemCodeScreen {...BASE} ttlSeconds={600} />);

    // Le code doit être là — sinon on prouverait le lien sur un écran vide.
    expect(screen.getByText("ABCD1234")).toBeDefined();

    const lien = screen.getByRole("link", { name: /Mes récompenses/ });
    expect(lien.getAttribute("href")).toBe("/portefeuille");
  });

  it("sur le code EXPIRÉ, là où l'écran ne proposait plus rien", () => {
    // `ttlSeconds: 0` fait basculer sur la vue « Ce code n'est plus valable ».
    render(<RedeemCodeScreen {...BASE} ttlSeconds={0} />);

    expect(screen.getByText(/n'est plus valable/)).toBeDefined();
    // Le code, lui, n'est plus affiché : c'est une expiration, pas un
    // masquage — d'où l'intérêt d'un chemin vers les AUTRES lots.
    expect(screen.queryByText("ABCD1234")).toBeNull();

    const lien = screen.getByRole("link", { name: /Mes récompenses/ });
    expect(lien.getAttribute("href")).toBe("/portefeuille");
  });

  it("sans échéance du tout (ttl null), le code reste et le lien aussi", () => {
    render(<RedeemCodeScreen {...BASE} ttlSeconds={null} />);
    expect(screen.getByText("ABCD1234")).toBeDefined();
    expect(screen.getByRole("link", { name: /Mes récompenses/ })).toBeDefined();
  });

  it("un seul lien par écran, jamais deux", () => {
    render(<RedeemCodeScreen {...BASE} ttlSeconds={600} />);
    // Les deux vues sont exclusives ; si une refonte les rendait toutes les
    // deux, le client verrait le lien en double sans qu'aucune autre
    // assertion ne s'en aperçoive.
    expect(screen.getAllByRole("link", { name: /Mes récompenses/ })).toHaveLength(
      1,
    );
  });
});
