// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExperienceAnalytics } from "@/components/dashboard/experience-analytics";
import type {
  ExperienceAnalyticsRow,
  ExperienceAnalyticsSnapshot,
} from "@/lib/experience-analytics-dashboard";

/**
 * LES TUILES COMPTENT DES PERSONNES, ET LE DISENT.
 *
 * « Personnes ayant vu un jeu » affichait `views`, un cumul d'ouvertures de
 * page : trois visites d'un même client faisaient trois personnes, et le taux
 * de départ tombait à 33 % pour une animation où TOUT LE MONDE avait joué. Le
 * chiffre restait juste, le mot au-dessus était faux — et c'est le mot que le
 * commerçant lit.
 *
 * Le cas ci-dessous est exactement ce piège : 120 ouvertures, 40 personnes,
 * 40 joueurs. La réponse attendue est 40 et 100 %, pas 120 et 33 %.
 */

afterEach(cleanup);

const metrics: Omit<
  ExperienceAnalyticsRow,
  "experienceKind" | "experienceId" | "experienceName"
> = {
  views: 120,
  uniqueViewers: 40,
  joins: 0,
  starts: 60,
  uniqueStarters: 40,
  completions: 30,
  uniqueFinishers: 25,
  rewardsIssued: 0,
  rewardsClaimed: 0,
  rewardsRedeemed: 0,
  returningPlayers: 0,
  shares: 0,
  uniquePlayers: 40,
  basketObservations: 0,
  basketRevenueCents: 0,
  rewardCostObservations: 0,
  rewardCostCents: 0,
  marginObservations: 0,
  attributableMarginCents: 0,
};

const snapshot: ExperienceAnalyticsSnapshot = {
  periodDays: 30,
  totalEvents: 210,
  summary: metrics,
  experiences: [
    {
      experienceKind: "campaign",
      experienceId: "camp-1",
      experienceName: "Roue de l'été",
      ...metrics,
    },
  ],
  sources: [],
};

/**
 * La valeur rendue sous un libellé de TUILE. Deux libellés vivent aussi en
 * en-tête de colonne du tableau comparatif : on ne retient que le `<p>` de la
 * carte, jamais le `<th>`.
 */
function valeurSousLibelle(libelle: string): string {
  const tuile = screen
    .getAllByText(libelle)
    .find((noeud) => noeud.tagName === "P");
  return tuile?.parentElement?.querySelectorAll("p")[1]?.textContent ?? "";
}

describe("ExperienceAnalytics — les tuiles comptent des personnes", () => {
  it("affiche le nombre de personnes, pas le cumul d'ouvertures", () => {
    render(<ExperienceAnalytics analytics={snapshot} />);
    expect(valeurSousLibelle("Personnes ayant vu un jeu")).toBe("40");
    // Le cumul n'est pas perdu : il devient l'indice, sous son vrai nom.
    expect(screen.getByText(/120 ouvertures cumulées/)).toBeTruthy();
  });

  it("rapporte les joueurs aux personnes, et non aux ouvertures", () => {
    render(<ExperienceAnalytics analytics={snapshot} />);
    expect(valeurSousLibelle("Joueurs ayant joué")).toBe("40");
    expect(screen.getByText("100 % des personnes")).toBeTruthy();
  });

  it("compte les abandons entre personnes distinctes", () => {
    render(<ExperienceAnalytics analytics={snapshot} />);
    // 40 joueurs, 25 arrivés au bout : 15 partis en route (et non 60 − 30).
    expect(valeurSousLibelle("Joueurs partis en cours de route")).toBe("15");
  });
});
