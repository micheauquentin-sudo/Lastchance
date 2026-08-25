// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamActionBoard } from "@/components/dashboard/team-action-board";
import type { TeamAction } from "@/components/dashboard/team-action-board-state";

/**
 * TROIS DÉFAUTS QUE SEUL UN RENDU MONTRE.
 *
 * 1. Le composant recopiait le prédicat « ceci devient-il un lien ? ». Le test
 *    d'état ne pouvait pas voir la copie : il n'interroge que le module d'état.
 *    Ici on vérifie le DOM, donc la règle réellement appliquée à l'écran.
 * 2. Un tableau vide rendait `null` — le bloc disparaissait entièrement.
 *    Aucune assertion d'état ne pouvait le remarquer, et à l'écran c'est
 *    indistinguable d'un écran cassé.
 * 3. Les actions faites et les actions interdites au rôle s'affichaient en
 *    lignes pleines, les secondes en ROUGE avec une phrase d'excuse. Un employé
 *    arrivait sur des alertes qu'il n'avait aucun moyen de résoudre. Elles se
 *    replient désormais en une ligne neutre, et c'est ce rendu qui le prouve.
 */

afterEach(cleanup);

const actions: TeamAction[] = [
  {
    key: "offer",
    label: "Vérifier l'offre",
    description: "Le propriétaire valide le droit de publication.",
    assigneeRole: "owner",
    status: "ready",
    availableTo: ["owner"],
    href: "/dashboard/settings",
  },
  {
    key: "content",
    label: "Relire les questions",
    description: "L'éditeur finalise le contenu.",
    assigneeRole: "editor",
    status: "ready",
    availableTo: ["editor"],
    href: "/dashboard/quiz/demo",
  },
  {
    key: "counter",
    label: "Préparer la caisse",
    description: "La caisse connaît le retrait des lots.",
    assigneeRole: "cashier",
    status: "done",
    availableTo: [],
  },
];

describe("TeamActionBoard — qui reçoit un lien, et qui n'en reçoit pas", () => {
  it("n'offre au propriétaire que la destination de son rôle", () => {
    render(<TeamActionBoard actions={actions} actorRole="owner" />);
    const liens = screen.getAllByRole("link");

    expect(liens).toHaveLength(1);
    expect(liens[0].getAttribute("href")).toBe("/dashboard/settings");
  });

  it("montre la même responsabilité à un autre rôle, mais sans lien", () => {
    render(<TeamActionBoard actions={actions} actorRole="cashier" />);

    // La caisse LIT que le propriétaire doit vérifier l'offre…
    expect(screen.getByText("Vérifier l'offre")).toBeTruthy();
    // …mais on ne lui propose pas d'y aller pour se faire refouler.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("ne donne aucun lien à un rôle inconnu", () => {
    render(<TeamActionBoard actions={actions} actorRole={null} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("TeamActionBoard — ce qui se replie au lieu de crier", () => {
  it("n'affiche PAS de ligne rouge pour une action réservée : une ligne neutre", () => {
    const { container } = render(
      <TeamActionBoard
        actions={[
          {
            ...actions[0],
            status: "blocked",
            href: undefined,
            blockedReason: "Cet écran est réservé au propriétaire du commerce.",
          },
        ]}
        actorRole="editor"
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    // La phrase anxiogène a disparu de l'écran…
    expect(
      screen.queryByText(/réservé au propriétaire du commerce/),
    ).toBeNull();
    // …remplacée par un décompte neutre.
    expect(container.textContent).toContain("1 action réservée au propriétaire");
    // Et la ligne elle-même n'est plus rendue.
    expect(screen.queryByText("Vérifier l'offre")).toBeNull();
  });

  it("replie les actions faites en une seule ligne, sans score concurrent", () => {
    const { container } = render(
      <TeamActionBoard actions={actions} actorRole="owner" />,
    );

    // Une seule action `done` sur trois : elle n'occupe plus une ligne pleine.
    expect(container.textContent).toContain("1 déjà faite ✓");
    expect(screen.queryByText("Préparer la caisse")).toBeNull();
    // Plus de pastille « x/y fait » : la progression se lit dans le hero.
    expect(screen.queryByText("1/3 fait")).toBeNull();
    // Seules les deux actions ouvertes restent listées.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("affiche un état vide EXPLICITE plutôt que de disparaître", () => {
    render(<TeamActionBoard actions={[]} actorRole="owner" />);

    // Le bloc reste là, avec son titre : une section absente laisserait croire
    // à un écran cassé plutôt qu'à une équipe à jour.
    expect(screen.getByText("Les prochains coups de main")).toBeTruthy();
    expect(screen.getByText(/Rien à répartir pour le moment/)).toBeTruthy();
  });

  it("garde son titre même quand tout est déjà fait", () => {
    const { container } = render(
      <TeamActionBoard
        actions={actions.map((a) => ({ ...a, status: "done" as const }))}
        actorRole="owner"
      />,
    );
    expect(screen.getByText("Les prochains coups de main")).toBeTruthy();
    expect(container.textContent).toContain("3 déjà faites ✓");
    expect(screen.getByText(/Rien à répartir pour le moment/)).toBeTruthy();
  });
});
