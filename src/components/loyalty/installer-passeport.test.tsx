// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InstallerPasseport } from "@/components/loyalty/installer-passeport";

/**
 * LE BOUTON WALLET N'EXISTE PAS TANT QUE LES CLÉS N'EXISTENT PAS.
 *
 * `lienWallet` vaut `null` dès que le compte émetteur Google n'est pas
 * configuré — l'état de tous les déploiements aujourd'hui. Ce que ces cas
 * gardent, c'est qu'ALORS le passeport se rend exactement comme avant : aucun
 * bouton, aucun bouton grisé, aucun message, et aucune erreur. Un client n'a
 * jamais à lire la configuration manquante de son commerçant.
 *
 * Le second invariant est l'INDÉPENDANCE des deux chemins : l'écran d'accueil
 * n'existe que sur les navigateurs qui savent le décrire (aucun ici, faute
 * d'événement `beforeinstallprompt` et d'UA iOS), tandis que Wallet ne dépend
 * que de son lien. Le premier a longtemps été seul : rien ne garantissait que
 * son absence n'emporte pas le second.
 */

afterEach(cleanup);

const BOUTON_WALLET = "Ajouter à Google Wallet";
const LIEN = "https://pay.google.com/gp/v/save/entete.corps.signature";

describe("InstallerPasseport — Google Wallet non configuré", () => {
  it("ne rend RIEN quand il n'y a ni lien Wallet ni invite d'installation", () => {
    const { container } = render(
      <InstallerPasseport commerce="Café des Sports" lienWallet={null} />,
    );
    // Pas même un cadre vide : le composant s'efface entièrement.
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("link", { name: BOUTON_WALLET })).toBeNull();
  });

  it("ne lève pas et ne rend rien quand la prop est simplement absente", () => {
    // Signature d'avant ce lot : un appelant qui ne passe pas `lienWallet` doit
    // se comporter comme avant, pas planter.
    expect(() =>
      render(<InstallerPasseport commerce="Café des Sports" />),
    ).not.toThrow();
    expect(screen.queryByText(/Google Wallet/)).toBeNull();
  });
});

describe("InstallerPasseport — Google Wallet configuré", () => {
  it("propose un LIEN au libellé officiel, même sans invite d'installation", () => {
    render(<InstallerPasseport commerce="Café des Sports" lienWallet={LIEN} />);

    const lien = screen.getByRole("link", { name: BOUTON_WALLET });
    expect(lien.getAttribute("href")).toBe(LIEN);
    // Il quitte le site : nouvel onglet, et jamais d'accès à `window.opener`.
    expect(lien.getAttribute("target")).toBe("_blank");
    expect(lien.getAttribute("rel")).toContain("noopener");
  });

  it("n'affiche PAS l'invitation à l'écran d'accueil pour autant", () => {
    render(<InstallerPasseport commerce="Café des Sports" lienWallet={LIEN} />);

    // Aucun `beforeinstallprompt` n'a été émis et l'UA n'est pas iOS : le
    // chemin « écran d'accueil » reste muet, celui de Wallet parle seul.
    expect(
      screen.queryByRole("button", { name: /écran d'accueil/i }),
    ).toBeNull();
    expect(screen.queryByText(/Sur iPhone/)).toBeNull();
  });

  it("garde le bouton Google Wallet HORS de l'habillage du produit", () => {
    render(<InstallerPasseport commerce="Café des Sports" lienWallet={LIEN} />);
    const classes = screen.getByRole("link", { name: BOUTON_WALLET }).className;

    // Règles de marque : le bouton reste noir sur blanc, il ne se repeint pas
    // en jaune « Kermesse » comme le reste de la page.
    expect(classes).toContain("bg-black");
    expect(classes).not.toContain("k-yellow");
  });

  it("n'écrit AUCUN emoji dans le nom accessible du bouton", () => {
    render(<InstallerPasseport commerce="Café des Sports" lienWallet={LIEN} />);
    const nom = screen.getByRole("link", { name: BOUTON_WALLET }).textContent;
    // Un U+FE0F invisible dans un nom accessible rend le lien introuvable pour
    // Playwright — et le timeout ne nomme jamais sa cause.
    expect(nom).toBe(BOUTON_WALLET);
    expect(/\p{Extended_Pictographic}|️/u.test(nom ?? "")).toBe(false);
  });
});
