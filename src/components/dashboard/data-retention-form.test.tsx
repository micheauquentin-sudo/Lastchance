// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * LE RÉGLAGE DIT MOINS QUE CE QU'IL FAIT.
 *
 * La purge nocturne (`/api/cron/purge-data`) n'archive pas : elle ANONYMISE les
 * participations. Or la limite « une seule fois par personne » d'une roue
 * (`play_limit = 'once'`) se vérifie contre ces mêmes participations. La
 * garantie n'est donc pas « une fois, jamais plus » mais « une fois PAR PÉRIODE
 * DE CONSERVATION » : un joueur qui revient après le délai rejoue, et le
 * commerçant qui a choisi 12 mois croyait ne régler qu'une durée d'archivage.
 *
 * Le mécanisme ne change pas — c'est le prix de l'anonymisation, et ce choix
 * est assumé. Ce qui change, c'est qu'il est ÉCRIT à l'endroit où la décision
 * se prend. Cette garde tient cette phrase : la retirer par « allègement
 * visuel » remettrait le commerçant devant une promesse qu'il ne peut pas tenir.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/privacy", () => ({
  updateDataRetention: vi.fn(async () => ({ ok: true as const, data: null })),
}));

import { DataRetentionForm } from "./data-retention-form";

afterEach(cleanup);

describe("DataRetentionForm — l'aveu sur les limites de jeu", () => {
  it("annonce que les limites « une seule fois » repartent de zéro", () => {
    render(<DataRetentionForm months={12} />);
    const aide = document.getElementById("retention-anonymisation");
    expect(aide, "la phrase d'aide a disparu").not.toBeNull();
    expect(aide!.textContent).toContain("anonymisées");
    expect(aide!.textContent).toContain("une seule fois par personne");
    expect(aide!.textContent).toContain("repartent de zéro");
  });

  it("la phrase est RATTACHÉE au champ, pas juste posée à côté", () => {
    // Un lecteur d'écran ne lit pas ce qui traîne autour d'un select : sans
    // `aria-describedby`, l'avertissement n'existe que pour qui voit la page.
    render(<DataRetentionForm months={null} />);
    const select = screen.getByLabelText("Conserver les données personnelles");
    expect(select.getAttribute("aria-describedby")).toBe(
      "retention-anonymisation",
    );
  });

  it("le formulaire poste toujours la clé `months`", () => {
    // CONTRÔLE NÉGATIF du remaniement de mise en page : le champ a changé de
    // niveau dans l'arbre, son nom et sa valeur par défaut ne doivent pas.
    render(<DataRetentionForm months={24} />);
    const select = screen.getByLabelText(
      "Conserver les données personnelles",
    ) as HTMLSelectElement;
    expect(select.name).toBe("months");
    expect(select.value).toBe("24");
  });
});
