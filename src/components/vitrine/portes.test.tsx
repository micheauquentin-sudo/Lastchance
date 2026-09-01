// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlocExperiences } from "@/components/vitrine/portes";

describe("BlocExperiences", () => {
  it("propose les calendriers et pronostics publiés avec leur route publique", () => {
    render(
      <BlocExperiences
        slug="le-comptoir"
        lang="fr"
        // VIT-16 : l'ABSENCE de choix vaut « les deux » à la résolution ;
        // ce test décrit donc le cas par défaut.
        jeux={{ duo: true, bande: true }}
        portes={{
          duo: false,
          bande: false,
          quiz: [],
          calendars: [{ slug: "calendrier-noel", titre: "Calendrier de Noël" }],
          pronostics: [{ slug: "euro-2028", titre: "Euro 2028" }],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Calendrier de Noël" }).getAttribute("href")).toBe(
      "/calendar/calendrier-noel",
    );
    expect(screen.getByRole("link", { name: "Euro 2028" }).getAttribute("href")).toBe(
      "/pronos/euro-2028",
    );
  });
});
