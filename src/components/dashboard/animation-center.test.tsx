// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnimationCenter } from "@/components/dashboard/animation-center";
import type { AnimationCenterInput } from "@/components/dashboard/animation-center-state";

/**
 * CE QUE LE TEST D'ÉTAT NE VOIT PAS.
 *
 * `animation-center-state.test.ts` prouve que les six repères existent et que
 * leurs étiquettes sont honnêtes. Il ne peut pas prouver que le composant les
 * RENDE tous les six — un `.slice(0, 4)` malheureux y serait invisible — ni
 * qu'une tuile ne devienne un lien que si le parent en a fourni un. C'est
 * précisément la garde qui compte ici : la carte ne fabrique aucun href, donc
 * elle ne peut pas inventer une destination interdite au rôle courant.
 */

afterEach(cleanup);

const counts: AnimationCenterInput = {
  drafts: 2,
  qrToTest: 1,
  liveExperiences: 3,
  lowStockPrizes: 4,
  rewardsToHandOver: 0,
  teamTasks: 0,
};

describe("AnimationCenter — ce que le commerçant voit", () => {
  it("affiche les six tuiles", () => {
    render(<AnimationCenter counts={counts} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("écrit les étiquettes honnêtes, pas celles qui promettent trop", () => {
    render(<AnimationCenter counts={counts} />);
    // « QR jamais scannés » et non « QR à tester » : le compteur est un proxy
    // `scan_count = 0`, il ne sait rien d'un test réellement effectué.
    expect(screen.getByText("QR jamais scannés")).toBeTruthy();
    // La parenthèse « (roue) » dit le périmètre du seuil de stock.
    expect(screen.getByText("Stocks faibles (roue)")).toBeTruthy();
    expect(screen.queryByText("QR à tester")).toBeNull();
  });

  it("ne rend AUCUN lien quand le parent n'en fournit pas", () => {
    render(<AnimationCenter counts={counts} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("ne rend un lien que pour les clés que le parent a autorisées", () => {
    render(
      <AnimationCenter
        counts={counts}
        links={{ drafts: "/dashboard/campaigns", qrToTest: "/dashboard/qr" }}
      />,
    );
    const liens = screen.getAllByRole("link");

    expect(liens).toHaveLength(2);
    expect(liens.map((lien) => lien.getAttribute("href")).sort()).toEqual([
      "/dashboard/campaigns",
      "/dashboard/qr",
    ]);
  });

  it("compte les points à regarder, et se tait quand il n'y en a aucun", () => {
    const { unmount } = render(<AnimationCenter counts={counts} />);
    // `qrToTest` et `lowStockPrizes` sont > 0 : deux points, pas six.
    expect(screen.getByText("2 points à regarder")).toBeTruthy();
    unmount();

    render(
      <AnimationCenter
        counts={{
          drafts: 0,
          qrToTest: 0,
          liveExperiences: 2,
          lowStockPrizes: 0,
          rewardsToHandOver: 0,
          teamTasks: 0,
        }}
      />,
    );
    expect(screen.queryByText(/point.? à regarder/)).toBeNull();
  });

  it("donne un titre accessible à la section", () => {
    render(<AnimationCenter counts={counts} />);
    const section = screen.getByRole("region", { name: "Où en sont vos animations" });
    expect(section).toBeTruthy();
  });

  it("accueille les coups de main DANS la même section, pas dans une seconde", () => {
    // Le tableau d'équipe vivait dans sa propre carte, avec son propre score de
    // progression qui contredisait celui de la checklist voisine. Une seule
    // section, un seul landmark : le contenu fourni par le parent est rendu ici.
    render(
      <AnimationCenter counts={counts}>
        <p>Les prochains coups de main</p>
      </AnimationCenter>,
    );
    const section = screen.getByRole("region", {
      name: "Où en sont vos animations",
    });
    expect(section.textContent).toContain("Les prochains coups de main");
    // Une seule région : le second landmark a disparu.
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("la tuile « Brouillons » dit où les retrouver au lieu de mentir sur sa destination", () => {
    render(<AnimationCenter counts={counts} />);
    expect(
      screen.getByText("à terminer, dans la page de chaque module"),
    ).toBeTruthy();
  });
});
