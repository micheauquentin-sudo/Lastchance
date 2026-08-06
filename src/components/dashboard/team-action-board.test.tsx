// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamActionBoard } from "@/components/dashboard/team-action-board";
import type { TeamAction } from "@/components/dashboard/team-action-board-state";

/**
 * DEUX DÉFAUTS QUE SEUL UN RENDU MONTRE.
 *
 * 1. Le composant recopiait le prédicat « ceci devient-il un lien ? ». Le test
 *    d'état ne pouvait pas voir la copie : il n'interroge que le module d'état.
 *    Ici on vérifie le DOM, donc la règle réellement appliquée à l'écran.
 * 2. Un tableau vide rendait `null` — la section disparaissait entièrement.
 *    Aucune assertion d'état ne pouvait le remarquer, et à l'écran c'est
 *    indistinguable d'un écran cassé.
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

  it("n'offre jamais de lien sur une action bloquée, et affiche sa raison", () => {
    render(
      <TeamActionBoard
        actions={[
          {
            ...actions[0],
            status: "blocked",
            blockedReason: "Votre offre ne couvre pas encore ce module.",
          },
        ]}
        actorRole="owner"
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(
      screen.getByText("Votre offre ne couvre pas encore ce module."),
    ).toBeTruthy();
  });

  it("affiche un état vide EXPLICITE plutôt que de disparaître", () => {
    render(<TeamActionBoard actions={[]} actorRole="owner" />);

    // La section reste là, avec son titre : une section absente laisserait
    // croire à un écran cassé plutôt qu'à une équipe à jour.
    expect(screen.getByText("Qui fait quoi ?")).toBeTruthy();
    expect(screen.getByText(/Rien à répartir pour le moment/)).toBeTruthy();
    // Pas de « 0/0 fait », qui ne veut rien dire.
    expect(screen.queryByText("0/0 fait")).toBeNull();
  });

  it("compte les actions faites sur le total", () => {
    render(<TeamActionBoard actions={actions} actorRole="owner" />);
    expect(screen.getByText("1/3 fait")).toBeTruthy();
  });
});
