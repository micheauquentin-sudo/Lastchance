// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InvitationAvantJeu } from "@/components/wheel/invitation-avant-jeu";
import { resolveWheelStyle } from "@/lib/wheel-style";

/**
 * L'INVITATION EST UNE PROPOSITION — PROUVÉ PAR LE RENDU, PAS PAR UN COMMENTAIRE.
 *
 * L'ancêtre de cet écran (`engagement-gate`) débloquait le jeu sous condition.
 * Ce fichier verrouille la propriété inverse : « Continuer vers le jeu » est
 * présent et actionnable AVANT tout clic sur une tuile, y compris quand les
 * trois liens sont là.
 */

const style = resolveWheelStyle({ buttonFrom: "#112233", buttonTo: "#445566" });

const GOOGLE = "https://g.page/r/CxAbCdEf/review";
const INSTAGRAM = "https://www.instagram.com/chez-marcel";
const TIKTOK = "https://www.tiktok.com/@chezmarcel";

function monter(invitation: {
  google?: string;
  instagram?: string;
  tiktok?: string;
}) {
  return render(
    <InvitationAvantJeu
      slug="chez-marcel"
      organizationName="Chez Marcel"
      invitation={invitation}
      kermesse={false}
      style={style}
    >
      <div>LE JEU</div>
    </InvitationAvantJeu>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("InvitationAvantJeu", () => {
  it("rend une tuile PAR LIEN PRÉSENT, et aucune pour les absents", () => {
    monter({ google: GOOGLE, tiktok: TIKTOK });
    expect(screen.getByRole("link", { name: /Google/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /TikTok/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Instagram/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("porte les href EXACTS du contexte et le rel complet, en nouvel onglet", () => {
    monter({ google: GOOGLE, instagram: INSTAGRAM, tiktok: TIKTOK });
    const attendus: Array<[RegExp, string]> = [
      [/Google/, GOOGLE],
      [/Instagram/, INSTAGRAM],
      [/TikTok/, TIKTOK],
    ];
    for (const [nom, href] of attendus) {
      const lien = screen.getByRole("link", { name: nom });
      expect(lien.getAttribute("href")).toBe(href);
      expect(lien.getAttribute("target")).toBe("_blank");
      // `noreferrer` ferme la fuite d'URL de jeu, `noopener` le window.opener,
      // `nofollow` refuse de prêter l'autorité de la page à un lien commerçant.
      expect(lien.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    }
  });

  it("« Continuer vers le jeu » est là D'EMBLÉE et n'est jamais désactivé", () => {
    monter({ google: GOOGLE, instagram: INSTAGRAM, tiktok: TIKTOK });
    const bouton = screen.getByRole("button", { name: "Continuer vers le jeu" });
    expect(bouton.hasAttribute("disabled")).toBe(false);
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    // Aucune tuile n'a été touchée : le jeu s'ouvre quand même.
    fireEvent.click(bouton);
    expect(screen.getByText("LE JEU")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuer vers le jeu" })).toBeNull();
  });

  it("le jeu n'est PAS monté tant que l'invitation est à l'écran", () => {
    monter({ google: GOOGLE });
    expect(screen.queryByText("LE JEU")).toBeNull();
  });

  it("mémorise « déjà vu » par slug : au retour, le jeu s'affiche directement", () => {
    const premier = monter({ google: GOOGLE });
    fireEvent.click(screen.getByRole("button", { name: "Continuer vers le jeu" }));
    expect(sessionStorage.getItem("lastchance:invitation:chez-marcel")).toBe("vu");
    premier.unmount();

    monter({ google: GOOGLE });
    expect(screen.getByText("LE JEU")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuer vers le jeu" })).toBeNull();

    // Un AUTRE slug n'hérite pas de la mémoire du premier.
    cleanup();
    render(
      <InvitationAvantJeu
        slug="autre-boutique"
        organizationName="Chez Marcel"
        invitation={{ google: GOOGLE }}
        kermesse={false}
        style={style}
      >
        <div>LE JEU</div>
      </InvitationAvantJeu>,
    );
    expect(screen.getByRole("button", { name: "Continuer vers le jeu" })).toBeTruthy();
  });

  it("annonce explicitement que le gain n'en dépend pas", () => {
    monter({ instagram: INSTAGRAM });
    expect(screen.getByText(/votre gain n'en\s+dépendent pas/)).toBeTruthy();
  });
});
