import { describe, expect, it } from "vitest";
import {
  attentionCount,
  getAnimationCenterMetrics,
} from "@/components/dashboard/animation-center-state";

describe("getAnimationCenterMetrics", () => {
  it("conserve les six repères confirmés du Centre d'animation", () => {
    const metrics = getAnimationCenterMetrics({
      drafts: 2,
      qrToTest: 1,
      liveExperiences: 3,
      lowStockPrizes: 4,
      rewardsToHandOver: 5,
      teamTasks: 6,
    });

    expect(metrics.map((metric) => metric.key)).toEqual([
      "drafts",
      "qrToTest",
      "liveExperiences",
      "lowStockPrizes",
      "rewardsToHandOver",
      "teamTasks",
    ]);
    expect(attentionCount(metrics)).toBe(4);
  });

  it("ne transforme jamais un compteur invalide en alerte", () => {
    const metrics = getAnimationCenterMetrics({
      drafts: -1,
      qrToTest: Number.NaN,
      liveExperiences: 1.9,
      lowStockPrizes: Number.POSITIVE_INFINITY,
      rewardsToHandOver: -5,
      teamTasks: 0,
    });

    expect(metrics.map((metric) => metric.count)).toEqual([0, 0, 1, 0, 0, 0]);
    expect(attentionCount(metrics)).toBe(0);
  });

  it("distingue une animation en cours d'une action à traiter", () => {
    const metrics = getAnimationCenterMetrics({
      drafts: 0,
      qrToTest: 0,
      liveExperiences: 1,
      lowStockPrizes: 1,
      rewardsToHandOver: 0,
      teamTasks: 0,
    });

    expect(metrics.find((metric) => metric.key === "liveExperiences")?.tone).toBe("live");
    expect(metrics.find((metric) => metric.key === "lowStockPrizes")?.tone).toBe("attention");
  });

  it("reste une synthèse passive : aucune destination n'est décidée ici", () => {
    const metrics = getAnimationCenterMetrics({
      drafts: 0,
      qrToTest: 0,
      liveExperiences: 0,
      lowStockPrizes: 0,
      rewardsToHandOver: 0,
      teamTasks: 0,
    });

    // Les liens viennent de la prop `links` du parent, jamais de cet état :
    // c'est la page serveur qui sait quel rôle peut aller où.
    expect(metrics.every((metric) => !("href" in metric) && !("action" in metric))).toBe(true);
  });

  it("n'écrit jamais une étiquette qui promet plus que le compteur ne mesure", () => {
    const metrics = getAnimationCenterMetrics({
      drafts: 0,
      qrToTest: 1,
      liveExperiences: 0,
      lowStockPrizes: 1,
      rewardsToHandOver: 0,
      teamTasks: 0,
    });
    const label = (key: string) => metrics.find((m) => m.key === key)?.label ?? "";

    // Le compteur derrière `qrToTest` est `scan_count = 0` : il sait qu'un QR
    // n'a jamais été scanné, pas qu'il « reste à tester ».
    expect(label("qrToTest")).toBe("QR jamais scannés");
    // Le seuil de stock n'existe que sur les lots de la roue : sans la
    // parenthèse, un zéro rassurerait à tort sur un calendrier ou une chasse.
    expect(label("lowStockPrizes")).toBe("Stocks faibles (roue)");
  });
});
