// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlocExperiences } from "@/components/vitrine/portes";
import { VITRINE_JEUX, type ChoixJeuxVitrine } from "@/lib/vitrine";

/** Ce que rend le résolveur quand le thème ne dit rien (ADR-129). */
const TOUT_COCHE = Object.fromEntries(
  VITRINE_JEUX.map((cle) => [cle, true]),
) as ChoixJeuxVitrine;

describe("BlocExperiences", () => {
  it("propose les calendriers et pronostics publiés avec leur route publique", () => {
    render(
      <BlocExperiences
        slug="le-comptoir"
        lang="fr"
        // VIT-16, élargi VIT-32 : l'ABSENCE de choix vaut « tout » à la
        // résolution ; ce test décrit donc le cas par défaut.
        jeux={TOUT_COCHE}
        portes={{
          duo: false,
          bande: false,
          quiz: [],
          calendars: [{ slug: "calendrier-noel", titre: "Calendrier de Noël" }],
          pronostics: [{ slug: "euro-2028", titre: "Euro 2028" }],
          loyalty: [],
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
