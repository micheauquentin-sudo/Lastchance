import { describe, expect, it } from "vitest";
import {
  HUNT_MIN_STEPS,
  manquesActivationChasse,
  MESSAGES_ACTIVATION_CHASSE,
  refusActivationChasse,
} from "@/lib/activation/hunts";

describe("refusActivationChasse — la précondition d'ouverture", () => {
  it("laisse passer une chasse dotée et à deux étapes", () => {
    expect(
      refusActivationChasse({ rewardLabel: "Un café offert", stepCount: 2 }),
    ).toBeNull();
  });

  it("refuse une chasse sans lot final, avec le message du serveur", () => {
    expect(refusActivationChasse({ rewardLabel: "", stepCount: 5 })).toBe(
      "Renseignez le lot final avant d'activer la chasse.",
    );
  });

  it("traite un lot fait d'espaces comme un lot absent", () => {
    expect(refusActivationChasse({ rewardLabel: "   ", stepCount: 5 })).toBe(
      MESSAGES_ACTIVATION_CHASSE.lot,
    );
  });

  it("refuse une chasse sous le plancher d'étapes", () => {
    expect(
      refusActivationChasse({ rewardLabel: "Un dessert", stepCount: 1 }),
    ).toBe("Ajoutez au moins 2 étapes avant d'activer la chasse.");
  });

  it("annonce le LOT d'abord quand tout manque — l'ordre du serveur", () => {
    expect(refusActivationChasse({ rewardLabel: "", stepCount: 0 })).toBe(
      MESSAGES_ACTIVATION_CHASSE.lot,
    );
  });
});

describe("manquesActivationChasse — pour l'étape de vérification", () => {
  it("rend TOUS les manques, là où l'action n'en montre qu'un", () => {
    expect(manquesActivationChasse({ rewardLabel: "", stepCount: 0 })).toEqual([
      "lot",
      "etapes",
    ]);
  });

  it("ne rend rien quand la chasse est prête", () => {
    expect(
      manquesActivationChasse({ rewardLabel: "Lot", stepCount: HUNT_MIN_STEPS }),
    ).toEqual([]);
  });

  it("n'isole que l'étape manquante quand le lot est posé", () => {
    expect(manquesActivationChasse({ rewardLabel: "Lot", stepCount: 1 })).toEqual(
      ["etapes"],
    );
  });
});
