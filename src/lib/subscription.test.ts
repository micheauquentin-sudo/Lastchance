import { describe, expect, it } from "vitest";
import { hasActiveAccess, isTrialExpired, trialDaysLeft } from "./subscription";

const NOW = new Date("2026-07-07T12:00:00Z");

function org(
  status: "trialing" | "active" | "past_due" | "canceled" | "inactive",
  trialEndsAt: string,
) {
  return { subscription_status: status, trial_ends_at: trialEndsAt } as const;
}

describe("hasActiveAccess", () => {
  it("abonnement actif → accès complet", () => {
    expect(hasActiveAccess(org("active", "2020-01-01T00:00:00Z"), NOW)).toBe(
      true,
    );
  });

  it("essai en cours → accès complet", () => {
    expect(hasActiveAccess(org("trialing", "2026-07-10T00:00:00Z"), NOW)).toBe(
      true,
    );
  });

  it("essai expiré → accès refusé", () => {
    expect(hasActiveAccess(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
  });

  it("abonnement annulé / impayé / inactif → accès refusé", () => {
    for (const status of ["canceled", "past_due", "inactive"] as const) {
      expect(hasActiveAccess(org(status, "2099-01-01T00:00:00Z"), NOW)).toBe(
        false,
      );
    }
  });
});

describe("isTrialExpired", () => {
  it("uniquement pour un statut trialing dépassé", () => {
    expect(isTrialExpired(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(
      true,
    );
    expect(isTrialExpired(org("trialing", "2026-07-10T00:00:00Z"), NOW)).toBe(
      false,
    );
    expect(isTrialExpired(org("canceled", "2026-07-01T00:00:00Z"), NOW)).toBe(
      false,
    );
  });
});

describe("trialDaysLeft", () => {
  it("arrondit au jour supérieur", () => {
    expect(trialDaysLeft(org("trialing", "2026-07-08T18:00:00Z"), NOW)).toBe(2);
    expect(trialDaysLeft(org("trialing", "2026-07-08T11:00:00Z"), NOW)).toBe(1);
  });

  it("0 si expiré ou hors essai", () => {
    expect(trialDaysLeft(org("trialing", "2026-07-01T00:00:00Z"), NOW)).toBe(0);
    expect(trialDaysLeft(org("active", "2026-07-10T00:00:00Z"), NOW)).toBe(0);
  });
});
