import { describe, expect, it } from "vitest";
import {
  activeExperienceKinds,
  EXPERIENCE_CATALOG,
  isExperienceActive,
  MODULE_CATALOG,
  sousTitreTableauDeBord,
} from "./catalog";

const addons = {
  addon_pronostics: false,
  addon_hunts: true,
  addon_loyalty: false,
  addon_jackpot: false,
  addon_events: true,
  addon_calendar: false,
  addon_referral: false,
  addon_quiz: false,
};

/**
 * LA GARDE NE FIGE AUCUNE PHRASE, ET C'EST LE POINT.
 *
 * Un test qui compare une description à sa copie ne prouve que sa propre
 * existence : il rougit à chaque reformulation légitime et laisse passer le
 * jargon. Il interdit donc DEUX choses seulement — le vide (une entrée sans
 * explication, l'accident qu'on veut éviter en ajoutant un module) et le
 * vocabulaire interne, qui ne veut rien dire à un commerçant.
 */
const JARGON = [
  "entitlement",
  "addon",
  "module",
  "compétition",
  "expérience",
];

describe("descriptions du catalogue", () => {
  const entrees = [...EXPERIENCE_CATALOG, ...MODULE_CATALOG];

  it.each(entrees)("$label est expliqué sans jargon", (entree) => {
    for (const texte of [entree.shortDescription, entree.dashboardSubtitle]) {
      expect(texte.trim().length).toBeGreaterThanOrEqual(40);
      for (const mot of JARGON) {
        expect(texte.toLowerCase()).not.toContain(mot);
      }
    }
  });

  it("sert la phrase d'en-tête des deux catalogues par leur droit", () => {
    expect(sousTitreTableauDeBord("pronostics")).toContain("classement");
    expect(sousTitreTableauDeBord("reserver")).toContain("Ateliers");
    expect(sousTitreTableauDeBord("core")).toBeTruthy();
  });
});

describe("experience catalog", () => {
  it("nomme la chasse de manière cohérente", () => {
    expect(EXPERIENCE_CATALOG.find((item) => item.kind === "hunt")?.label).toBe(
      "Chasse au QR",
    );
  });

  it("possède des kinds et droits uniques", () => {
    expect(new Set(EXPERIENCE_CATALOG.map((item) => item.kind)).size).toBe(
      EXPERIENCE_CATALOG.length,
    );
    expect(new Set(EXPERIENCE_CATALOG.map((item) => item.entitlement)).size).toBe(
      EXPERIENCE_CATALOG.length,
    );
  });

  it("n'affiche dans la navigation que le cœur et les modules actifs", () => {
    expect(activeExperienceKinds(addons)).toEqual(["campaign", "event", "hunt"]);
    expect(isExperienceActive(addons, "pronostics")).toBe(false);
  });

  it("rend tout le catalogue actif pour un accès offert complet", () => {
    expect(activeExperienceKinds(addons, true)).toHaveLength(
      EXPERIENCE_CATALOG.length,
    );
  });
});
