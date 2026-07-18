import { describe, expect, it } from "vitest";
import {
  hasActiveAccess,
  hasCompAccess,
  isTrialExpired,
  PAST_DUE_GRACE_DAYS,
  pastDueGraceEndsAt,
  trialDaysLeft,
} from "./subscription";

const NOW = new Date("2026-07-07T12:00:00Z");

function org(
  status: "trialing" | "active" | "past_due" | "canceled" | "inactive",
  trialEndsAt: string,
  pastDueSince: string | null = null,
  comp: { comp_access?: boolean; comp_access_until?: string | null } = {},
) {
  return {
    subscription_status: status,
    trial_ends_at: trialEndsAt,
    past_due_since: pastDueSince,
    comp_access: comp.comp_access ?? false,
    comp_access_until: comp.comp_access_until ?? null,
  } as const;
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

  it("abonnement annulé / inactif → accès refusé", () => {
    for (const status of ["canceled", "inactive"] as const) {
      expect(hasActiveAccess(org(status, "2099-01-01T00:00:00Z"), NOW)).toBe(
        false,
      );
    }
  });
});

describe("hasActiveAccess — accès offert (comp)", () => {
  it("accès offert illimité → accès complet malgré un statut coupé", () => {
    expect(
      hasActiveAccess(
        org("canceled", "2020-01-01T00:00:00Z", null, { comp_access: true }),
        NOW,
      ),
    ).toBe(true);
  });

  it("accès offert daté et non dépassé → accès complet", () => {
    expect(
      hasActiveAccess(
        org("inactive", "2020-01-01T00:00:00Z", null, {
          comp_access: true,
          comp_access_until: "2026-08-01T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("accès offert expiré → retombe sur l'état Stripe (refusé ici)", () => {
    expect(
      hasActiveAccess(
        org("canceled", "2020-01-01T00:00:00Z", null, {
          comp_access: true,
          comp_access_until: "2026-07-01T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("hasCompAccess", () => {
  it("faux si non accordé", () => {
    expect(hasCompAccess({ comp_access: false, comp_access_until: null }, NOW)).toBe(false);
  });
  it("vrai si accordé sans date de fin", () => {
    expect(hasCompAccess({ comp_access: true, comp_access_until: null }, NOW)).toBe(true);
  });
  it("respecte la date de fin", () => {
    expect(
      hasCompAccess({ comp_access: true, comp_access_until: "2026-07-08T00:00:00Z" }, NOW),
    ).toBe(true);
    expect(
      hasCompAccess({ comp_access: true, comp_access_until: "2026-07-06T00:00:00Z" }, NOW),
    ).toBe(false);
  });
});

describe("hasActiveAccess — délai de grâce des impayés", () => {
  it("impayé récent → accès maintenu pendant la relance Stripe", () => {
    expect(
      hasActiveAccess(
        org("past_due", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z"),
        NOW,
      ),
    ).toBe(true);
  });

  it("impayé au-delà du délai de grâce → accès coupé", () => {
    expect(
      hasActiveAccess(
        org("past_due", "2020-01-01T00:00:00Z", "2026-06-01T00:00:00Z"),
        NOW,
      ),
    ).toBe(false);
  });

  it("la coupure tombe exactement à la fin de la grâce", () => {
    const since = "2026-06-23T12:00:00Z"; // NOW - 14 jours pile
    const o = org("past_due", "2020-01-01T00:00:00Z", since);
    expect(hasActiveAccess(o, NOW)).toBe(false);
    expect(hasActiveAccess(o, new Date(NOW.getTime() - 1))).toBe(true);
  });

  it("impayé non daté (transition webhook en cours) → ne coupe pas", () => {
    expect(
      hasActiveAccess(org("past_due", "2020-01-01T00:00:00Z", null), NOW),
    ).toBe(true);
  });
});

describe("pastDueGraceEndsAt", () => {
  it("date d'entrée + délai de grâce", () => {
    const end = pastDueGraceEndsAt(
      org("past_due", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z"),
    );
    expect(end?.toISOString()).toBe(
      new Date(
        new Date("2026-07-04T00:00:00Z").getTime() +
          PAST_DUE_GRACE_DAYS * 86_400_000,
      ).toISOString(),
    );
  });

  it("null hors impayé ou sans date d'entrée", () => {
    expect(
      pastDueGraceEndsAt(org("active", "2020-01-01T00:00:00Z", "2026-07-04T00:00:00Z")),
    ).toBeNull();
    expect(
      pastDueGraceEndsAt(org("past_due", "2020-01-01T00:00:00Z", null)),
    ).toBeNull();
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
