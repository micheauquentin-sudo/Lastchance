import { describe, expect, it } from "vitest";
import {
  attentionCount,
  getAnimationCenterMetrics,
  teamTasksAffichees,
} from "@/components/dashboard/animation-center-state";
import {
  getTeamActionBoardSnapshot,
  type TeamAction,
} from "@/components/dashboard/team-action-board-state";

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

/**
 * LE CHIFFRE DE LA TUILE ET LA LONGUEUR DE LA LISTE, TENUS ENSEMBLE.
 *
 * La tuile « Tâches d'équipe » lisait `teamTasks`, dérivé côté serveur AVANT le
 * masquage par le hero : elle annonçait 4 quand la liste juste en dessous, dans
 * la MÊME carte, en affichait 3.
 */
describe("teamTasksAffichees", () => {
  const action = (key: string, status: TeamAction["status"]): TeamAction => ({
    key,
    label: key,
    description: key,
    assigneeRole: "editor",
    availableTo: ["owner", "editor"],
    status,
    href: "/dashboard/campaigns",
  });

  const ACTIONS: TeamAction[] = [
    action("remettre-les-gains", "ready"),
    action("tester-les-qr", "ready"),
    action("recharger-les-lots", "ready"),
    action("terminer-les-brouillons", "done"),
    action("verifier-les-modules", "blocked"),
  ];

  it("ne compte que les actions à faire, et jamais celle que le hero a prise", () => {
    expect(teamTasksAffichees(ACTIONS, [])).toBe(3);
    expect(teamTasksAffichees(ACTIONS, ["remettre-les-gains"])).toBe(2);
    // Masquer une action déjà faite ou bloquée ne retire rien : elle n'était
    // pas comptée.
    expect(teamTasksAffichees(ACTIONS, ["terminer-les-brouillons"])).toBe(3);
    expect(teamTasksAffichees(ACTIONS, ["verifier-les-modules"])).toBe(3);
  });

  it("rend EXACTEMENT le nombre de lignes que le tableau d'équipe affiche", () => {
    const cas = [
      [],
      ["remettre-les-gains"],
      ["tester-les-qr"],
      ["recharger-les-lots"],
      ["terminer-les-brouillons"],
      ["verifier-les-modules"],
    ];
    for (const masquees of cas) {
      const promues = new Set(masquees);
      const snapshot = getTeamActionBoardSnapshot(
        ACTIONS.filter((a) => !promues.has(a.key)),
        "owner",
      );
      expect(teamTasksAffichees(ACTIONS, masquees)).toBe(snapshot.aFaire.length);
    }
  });

  it("rend 0 sur une liste vide plutôt qu'un compteur orphelin", () => {
    expect(teamTasksAffichees([], ["remettre-les-gains"])).toBe(0);
  });
});
