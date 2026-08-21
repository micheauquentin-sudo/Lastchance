// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/lobby", () => ({ closeOrgLobby: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { SalonsOuverts } = await import("@/components/vitrine/salons-ouverts");

import type { OrgLobbyView } from "@/lib/lobby";

/**
 * LA CARTE DE SUPERVISION — contrepartie du finding E-1.
 *
 * Ce qui se grave ici n'est pas la mise en page, c'est la moitié VISIBLE d'un
 * arbitrage de sécurité : le commerçant doit reconnaître une salle-squat
 * (vieille et vide) et pouvoir la fermer, SANS que l'écran lui apprenne quoi que
 * ce soit de ses clients. La seconde propriété est celle qui compte vraiment —
 * un `join_code` qui remonterait un jour de la base ferait de cette carte un
 * annuaire ouvrant toutes les salles de la maison.
 *
 * AUCUNE HORLOGE FEINTE ICI, et c'est le composant qui le permet : l'origine des
 * durées est une PROP (`luA`, stampée par `loadOrgLobbies`), pas un `Date.now()`
 * lu en plein rendu. Un test qui aurait dû figer l'horloge du processus pour
 * lire « il y a 12 min » aurait signalé que le composant regarde l'heure tout
 * seul — c'est-à-dire exactement ce qu'on ne veut pas.
 */

afterEach(cleanup);

/** L'instant de la lecture. Toutes les durées ci-dessous en découlent. */
const LU_A = "2026-08-21T12:30:00Z";

function salon(surcharge: Partial<OrgLobbyView> = {}): OrgLobbyView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "bande",
    status: "lobby",
    membres: 4,
    createdAt: "2026-08-21T12:18:00Z",
    expiresAt: "2026-08-21T12:48:00Z",
    ...surcharge,
  };
}

describe("SalonsOuverts", () => {
  it("ne se peint pas du tout sans salon — c'est le cas normal", () => {
    // Zéro salle vivante est de très loin le cas le plus fréquent : une carte
    // vide occuperait le tableau de bord tous les jours pour un incident qui
    // n'a peut-être jamais lieu.
    const { container } = render(<SalonsOuverts salons={[]} luA={LU_A} />);
    expect(container.innerHTML).toBe("");
  });

  it("dit le compte, le résumé de chaque salle, et offre le geste", () => {
    render(<SalonsOuverts salons={[salon()]} luA={LU_A} />);

    expect(screen.getByText("Salons ouverts")).toBeTruthy();
    expect(
      screen.getByText(
        "bande · en attente · 4 personnes · ouvert il y a 12 min · expire dans 18 min",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
  });

  it("NE MONTRE NI PSEUDO NI CODE DE PARTAGE", () => {
    // La propriété tient à trois endroits — la RPC ne les rend pas, le mappeur
    // ne leur donne pas de place, et l'écran n'en peint aucun. Ce test garde le
    // troisième : c'est le seul que quelqu'un pourrait « améliorer » de bonne
    // foi en ajoutant « mais qui est dedans ? ».
    const { container } = render(
      <SalonsOuverts salons={[salon()]} luA={LU_A} />,
    );

    expect(container.textContent).not.toMatch(/code/i);
    expect(container.textContent).not.toMatch(/pseudo/i);
    // Le NOMBRE de personnes, lui, est là — il distingue le ménage d'une
    // salle-squat de l'interruption de vrais clients.
    expect(container.textContent).toContain("4 personnes");
  });

  it("un bouton par salle, et le singulier suit le compte", () => {
    render(
      <SalonsOuverts
        salons={[
          salon({ id: "a" }),
          salon({ id: "b", kind: "duo", membres: 1 }),
          salon({ id: "c" }),
        ]}
        luA={LU_A}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Fermer" })).toHaveLength(3);
    expect(
      screen.getByText(
        "duo · en attente · 1 personne · ouvert il y a 12 min · expire dans 18 min",
      ),
    ).toBeTruthy();
  });

  it("une salle qui vient de mourir n'annonce pas une durée négative", () => {
    // Une salle peut expirer entre la lecture de la liste et le rendu de la
    // ligne. « expire dans -1 min » est une phrase que personne ne sait lire.
    render(
      <SalonsOuverts
        salons={[salon({ expiresAt: "2026-08-21T12:29:00Z" })]}
        luA={LU_A}
      />,
    );

    expect(screen.getByText(/expire dans 0 min$/)).toBeTruthy();
  });

  it("dit les heures au-delà de soixante minutes", () => {
    // Le plafond dur d'une salle est de vingt-quatre heures : « 95 min » se lit
    // moins bien que « 1 h 35 » sur un écran qu'on survole.
    render(
      <SalonsOuverts
        salons={[salon({ createdAt: "2026-08-21T10:55:00Z" })]}
        luA={LU_A}
      />,
    );

    expect(screen.getByText(/ouvert il y a 1 h 35/)).toBeTruthy();
  });

  it("une date illisible ne peint pas « NaN min »", () => {
    // Le mappeur laisse passer n'importe quelle chaîne — il vérifie qu'elle est
    // LÀ, pas qu'elle est une date. C'est ici qu'on refuse de la mettre en
    // français.
    render(
      <SalonsOuverts salons={[salon({ createdAt: "hier" })]} luA={LU_A} />,
    );

    expect(screen.getByText(/ouvert il y a —/)).toBeTruthy();
  });

  it("une origine illisible dégrade les durées, sans cacher les salles", () => {
    // `luA` vide arrive du repli de la page (garde refusée). La liste est alors
    // vide en pratique, mais si elle ne l'était pas, mieux vaut afficher les
    // salles fermables sans leur âge que de faire disparaître le geste.
    const { container } = render(
      <SalonsOuverts salons={[salon()]} luA="" />,
    );

    expect(container.textContent).toContain("bande · en attente · 4 personnes");
    expect(container.textContent).not.toMatch(/NaN/);
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
  });
});
