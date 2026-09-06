// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameIdleScreen } from "@/components/wheel/game-idle-screen";
import { gameIdle } from "@/lib/game-idle";
import { resolveWheelStyle } from "@/lib/wheel-style";

/**
 * L'APERÇU DE L'ÉDITEUR EST LITTÉRALEMENT L'ÉCRAN DU JOUEUR — PROUVÉ PAR LE RENDU.
 *
 * Une garde textuelle ne suffirait pas ici. Ce qui était faux, ce n'était pas
 * un import manquant : c'était que l'éditeur RECOPIAIT la mise en page de
 * `game-shell.tsx` avec un 🎁 en dur et un bouton « Jouer », sous une phrase
 * promettant « exactement ce que verront vos clients ». Les deux surfaces
 * importaient déjà les mêmes jetons de thème et divergeaient quand même.
 *
 * Ce fichier monte le composant DANS SES DEUX VARIANTES avec le même style et
 * la même mécanique, et vérifie qu'elles disent la même chose.
 */

const style = resolveWheelStyle({ buttonFrom: "#112233", buttonTo: "#445566" });

afterEach(cleanup);

describe("GameIdleScreen — l'écran d'accueil du joueur", () => {
  it("montre l'emoji, l'accroche et le verbe DE LA MÉCANIQUE, pas un carton générique", () => {
    const idle = gameIdle("cups");
    render(
      <GameIdleScreen
        style={style}
        organizationName="Chez Marcel"
        emoji={idle.emoji}
        title={idle.accroche}
        buttonLabel={idle.buttonLabel}
        kermesse={false}
        onStart={() => undefined}
      />,
    );
    expect(screen.getByText("Chez Marcel")).toBeTruthy();
    expect(screen.getByText("Trouvez le bon gobelet !")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Choisir un gobelet" }),
    ).toBeTruthy();
    // Le 🎁 en dur de l'ancien aperçu ne doit plus pouvoir apparaître ailleurs
    // que sur la mécanique « coffre », qui est la seule à le porter.
    expect(screen.queryByText("🎁")).toBeNull();
    expect(screen.getByText("🥤")).toBeTruthy();
  });

  it("l'accroche du COMMERÇANT n'est pas décidée ici — le composant rend ce qu'on lui donne", () => {
    render(
      <GameIdleScreen
        style={style}
        organizationName="Chez Marcel"
        emoji="🎲"
        title="Deux euros le lancer !"
        buttonLabel="Lancer le dé"
        kermesse={false}
      />,
    );
    expect(screen.getByText("Deux euros le lancer !")).toBeTruthy();
  });

  /**
   * L'aperçu vit DANS le formulaire de réglages. Un vrai `<button>` y serait
   * focusable au clavier et cliquable sans rien faire — pire, il pourrait
   * soumettre le formulaire qui l'entoure.
   */
  it("sans `onStart`, le bouton devient un pavé inerte (aperçu de l'éditeur)", () => {
    const { container } = render(
      <GameIdleScreen
        variant="apercu"
        style={style}
        organizationName="Chez Marcel"
        emoji="🎰"
        title="Alignez les rouleaux !"
        buttonLabel="Lancer la machine"
        kermesse={false}
      />,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(screen.getByText("Lancer la machine")).toBeTruthy();
  });

  it("les deux variantes disent la MÊME chose — c'est toute la promesse de l'aperçu", () => {
    const idle = gameIdle("scratch");
    const props = {
      style,
      organizationName: "Chez Marcel",
      emoji: idle.emoji,
      title: idle.accroche,
      buttonLabel: idle.buttonLabel,
      kermesse: false,
    };
    const joueur = render(<GameIdleScreen {...props} onStart={() => undefined} />);
    const textesJoueur = joueur.container.textContent;
    cleanup();
    const apercu = render(<GameIdleScreen {...props} variant="apercu" />);
    expect(apercu.container.textContent).toBe(textesJoueur);
  });

  it("un visuel fourni remplace le cadre + emoji (la roue, seule à en poser un)", () => {
    render(
      <GameIdleScreen
        variant="apercu"
        style={style}
        organizationName="Chez Marcel"
        emoji="🎡"
        title="Tournez la roue !"
        buttonLabel="Lancer la roue"
        kermesse={false}
        visuel={<div data-testid="roue-svg" />}
      />,
    );
    expect(screen.getByTestId("roue-svg")).toBeTruthy();
    expect(screen.queryByText("🎡")).toBeNull();
  });

  it("le dégradé du bouton vient du style du commerçant, dans les deux variantes", () => {
    for (const variant of ["play", "apercu"] as const) {
      const { container } = render(
        <GameIdleScreen
          variant={variant}
          style={style}
          organizationName="Chez Marcel"
          emoji="🎲"
          title="Lancez le dé !"
          buttonLabel="Lancer le dé"
          kermesse={false}
        />,
      );
      expect(
        container.innerHTML.includes("#112233") &&
          container.innerHTML.includes("#445566"),
        variant,
      ).toBe(true);
      cleanup();
    }
  });
});

/**
 * L'ATTENTE DE LANCEMENT, DITE À L'ÉCRAN.
 *
 * L'intégrité n'a jamais été en cause : les shells posent leur garde de rentrée
 * avant l'`await`, et le serveur ferme la course de son côté. Ce qui manquait
 * était PERCEPTUEL — sur un réseau de boutique, deux à quatre secondes
 * s'écoulaient entre l'appui et le moindre changement à l'écran, le joueur
 * retapait cinq fois et concluait que l'application était cassée.
 */
describe("GameIdleScreen — l'état d'attente du bouton", () => {
  it("sans `pending`, le bouton reste cliquable et porte le verbe du jeu", () => {
    render(
      <GameIdleScreen
        style={style}
        organizationName="Chez Marcel"
        emoji="🎁"
        title="Ouvrez le bon coffre !"
        buttonLabel="Ouvrir le coffre"
        kermesse={false}
        onStart={() => undefined}
      />,
    );
    const bouton = screen.getByRole("button", { name: "Ouvrir le coffre" });
    expect((bouton as HTMLButtonElement).disabled).toBe(false);
  });

  it("sous `pending`, le bouton se désactive ET change de verbe", () => {
    const onStart = vi.fn();
    render(
      <GameIdleScreen
        style={style}
        organizationName="Chez Marcel"
        emoji="🎁"
        title="Ouvrez le bon coffre !"
        buttonLabel="Ouvrir le coffre"
        kermesse={false}
        onStart={onStart}
        pending
      />,
    );
    const bouton = screen.getByRole("button", { name: "Un instant…" });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(bouton.getAttribute("aria-busy")).toBe("true");
    // Le nom accessible SUIT le verbe visible : plus d'« Ouvrir le coffre »
    // annoncé sur un bouton grisé.
    expect(screen.queryByRole("button", { name: "Ouvrir le coffre" })).toBeNull();
    fireEvent.click(bouton);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("l'APERÇU du studio n'attend jamais : il ne fait aucun appel", () => {
    render(
      <GameIdleScreen
        variant="apercu"
        style={style}
        organizationName="Chez Marcel"
        emoji="🎁"
        title="Ouvrez le bon coffre !"
        buttonLabel="Ouvrir le coffre"
        kermesse={false}
        pending
      />,
    );
    expect(screen.getByText("Ouvrir le coffre")).toBeTruthy();
    expect(screen.queryByText("Un instant…")).toBeNull();
  });
});
