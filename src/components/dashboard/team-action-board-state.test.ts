import { describe, expect, it } from "vitest";
import {
  getTeamActionBoardSnapshot,
  isNavigableAction,
  roleLabel,
  type TeamAction,
} from "@/components/dashboard/team-action-board-state";

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

describe("getTeamActionBoardSnapshot", () => {
  it("ne retient comme prochaine action que celle qui a une destination autorisée", () => {
    const snapshot = getTeamActionBoardSnapshot(actions, "owner");

    expect(snapshot).toMatchObject({ total: 3, done: 1 });
    expect(snapshot.nextAction?.key).toBe("offer");
  });

  it("ne transforme jamais une action bloquée en lien", () => {
    const snapshot = getTeamActionBoardSnapshot([
      { ...actions[0], status: "blocked", blockedReason: "Droit suspendu.", href: undefined },
      actions[1],
    ], "owner");

    expect(snapshot.nextAction).toBeNull();
  });

  it("garde les trois libellés de rôle compréhensibles", () => {
    expect(roleLabel("owner")).toBe("Propriétaire");
    expect(roleLabel("editor")).toBe("Éditeur");
    expect(roleLabel("cashier")).toBe("Caisse");
  });

  it("montre la responsabilité mais jamais le lien d'un autre rôle", () => {
    const snapshot = getTeamActionBoardSnapshot(actions, "cashier");

    expect(snapshot.nextAction).toBeNull();
  });

  it("ne donne aucune action à un rôle absent", () => {
    expect(getTeamActionBoardSnapshot(actions, null).nextAction).toBeNull();
  });
});

describe("isNavigableAction", () => {
  /**
   * Ce prédicat était recopié dans le composant. Il est exporté pour qu'il
   * n'existe qu'une seule règle de « ceci devient-il un lien ? » — et il est
   * testé ici cas par cas, ce que le seul `nextAction` ne montrait pas : le
   * snapshot ne rend que la PREMIÈRE action navigable, donc les refus des
   * suivantes passaient inaperçus.
   */
  it("n'accorde un lien qu'à une action prête, autorisée au rôle, et pourvue d'une destination", () => {
    expect(isNavigableAction(actions[0], "owner")).toBe(true);
  });

  it("refuse sans destination, même si le rôle est autorisé", () => {
    expect(isNavigableAction(actions[1], "editor")).toBe(false);
  });

  it("refuse un rôle absent de `availableTo`, même avec une destination", () => {
    expect(isNavigableAction(actions[0], "cashier")).toBe(false);
    expect(isNavigableAction(actions[0], "editor")).toBe(false);
  });

  it("refuse une action déjà faite ou bloquée", () => {
    expect(isNavigableAction({ ...actions[0], status: "done" }, "owner")).toBe(false);
    expect(isNavigableAction({ ...actions[0], status: "blocked" }, "owner")).toBe(false);
  });

  it("refuse un rôle inconnu", () => {
    expect(isNavigableAction(actions[0], null)).toBe(false);
  });
});
