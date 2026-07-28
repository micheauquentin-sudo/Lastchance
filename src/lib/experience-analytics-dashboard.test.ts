import { describe, expect, it } from "vitest";
import {
  analyticsRate,
  parseExperienceAnalytics,
} from "./experience-analytics-dashboard";

describe("parseExperienceAnalytics", () => {
  it("normalise les nombres PostgreSQL et les tableaux", () => {
    const result = parseExperienceAnalytics({
      period_days: 30,
      total_events: "12",
      summary: {
        views: "8",
        starts: 4,
        basket_observations: "2",
        basket_revenue_cents: "2500",
        margin_observations: "1",
        attributable_margin_cents: "900",
      },
      experiences: [
        {
          experience_kind: "quiz",
          experience_id: "quiz-1",
          experience_name: "Quiz du vendredi",
          views: "8",
          starts: "4",
          completions: "3",
        },
      ],
      sources: [{ source: "qr", views: "6", starts: "3" }],
    });

    expect(result.totalEvents).toBe(12);
    expect(result.summary.basketRevenueCents).toBe(2500);
    expect(result.summary.basketObservations).toBe(2);
    expect(result.summary.attributableMarginCents).toBe(900);
    expect(result.experiences[0]).toMatchObject({
      experienceKind: "quiz",
      starts: 4,
      completions: 3,
    });
    expect(result.sources[0]).toMatchObject({ source: "qr", views: 6 });
  });

  it("retombe sur un état vide sûr pour une réponse absente", () => {
    expect(parseExperienceAnalytics(null)).toMatchObject({
      periodDays: 30,
      totalEvents: 0,
      experiences: [],
      sources: [],
    });
  });
});

describe("analyticsRate", () => {
  it("calcule un pourcentage arrondi et évite les divisions par zéro", () => {
    expect(analyticsRate(3, 4)).toBe(75);
    expect(analyticsRate(0, 0)).toBeNull();
  });
});
