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
        unique_viewers: "5",
        unique_starters: 3,
        unique_finishers: "2",
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
    // Les trois compteurs de PERSONNES arrivent en jsonb comme les autres :
    // parfois en texte, parfois en nombre. Sans eux dans `parseMetrics`, les
    // tuiles diviseraient des événements par des événements (NUM-1).
    expect(result.summary.uniqueViewers).toBe(5);
    expect(result.summary.uniqueStarters).toBe(3);
    expect(result.summary.uniqueFinishers).toBe(2);
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

  it("un compteur de personnes ABSENT vaut zéro, jamais NaN ni undefined", () => {
    // La RPC d'une base pas encore migrée ne rend pas ces trois clés. Sans
    // repli, la tuile afficherait « NaN % des personnes » — et le conseiller,
    // qui compare à zéro, se tairait ou crierait au hasard.
    const result = parseExperienceAnalytics({ summary: { views: 10 } });
    expect(result.summary.uniqueViewers).toBe(0);
    expect(result.summary.uniqueStarters).toBe(0);
    expect(result.summary.uniqueFinishers).toBe(0);
    expect(result.summary.views).toBe(10);
  });
});

describe("analyticsRate", () => {
  it("calcule un pourcentage arrondi et évite les divisions par zéro", () => {
    expect(analyticsRate(3, 4)).toBe(75);
    expect(analyticsRate(0, 0)).toBeNull();
  });
});
