import { describe, expect, it } from "vitest";
import {
  visibleOnboardingSteps,
  type OnboardingStep,
} from "@/components/dashboard/onboarding-checklist";

const steps: OnboardingStep[] = [
  { key: "campaign", label: "Campagne", href: "/a", done: true },
  { key: "logo", label: "Logo", href: "/dashboard/settings", done: false, ownerOnly: true },
  { key: "activate", label: "Activer", href: "/c", done: true },
];

describe("visibleOnboardingSteps", () => {
  it("cache au non-propriétaire l'étape qu'il ne peut pas accomplir", () => {
    for (const role of ["editor", "cashier"] as const) {
      const vus = visibleOnboardingSteps(steps, role);
      expect(vus.map((s) => s.key)).not.toContain("logo");
      // Le dénominateur suit : sinon on remplace « bloqué à 5/6 » par
      // « bloqué à 5/6 » sous un autre nom.
      expect(vus.length).toBe(2);
      expect(vus.filter((s) => s.done).length).toBe(vus.length);
    }
  });

  it("laisse l'étape au propriétaire", () => {
    expect(visibleOnboardingSteps(steps, "owner").map((s) => s.key)).toContain(
      "logo",
    );
  });

  it("ne présente aucun lien owner-only à un rôle inconnu (null)", () => {
    expect(visibleOnboardingSteps(steps, null).map((s) => s.key)).not.toContain(
      "logo",
    );
  });

  it("n'écarte que les étapes marquées ownerOnly", () => {
    const libres = steps.filter((s) => !s.ownerOnly);
    expect(visibleOnboardingSteps(libres, "editor")).toEqual(libres);
  });
});
