import { describe, expect, it } from "vitest";
import {
  LOYALTY_MIN_MILESTONES,
  manquesActivationFidelite,
  MESSAGES_ACTIVATION_FIDELITE,
  refusActivationFidelite,
} from "@/lib/activation/loyalty";

describe("refusActivationFidelite — la précondition d'ouverture", () => {
  it("laisse passer un programme qui porte au moins un palier", () => {
    expect(
      refusActivationFidelite({ milestoneCount: LOYALTY_MIN_MILESTONES }),
    ).toBeNull();
  });

  it("refuse un programme sans palier, avec le message du serveur", () => {
    expect(refusActivationFidelite({ milestoneCount: 0 })).toBe(
      "Ajoutez au moins un palier avant d'activer le programme.",
    );
  });

  it("rend le manque nommé pour l'étape de vérification", () => {
    expect(manquesActivationFidelite({ milestoneCount: 0 })).toEqual(["paliers"]);
    expect(manquesActivationFidelite({ milestoneCount: 3 })).toEqual([]);
    expect(MESSAGES_ACTIVATION_FIDELITE.paliers).toContain("au moins un palier");
  });
});
