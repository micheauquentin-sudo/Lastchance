import fs from "node:fs";
import path from "node:path";
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

  /**
   * CHAQUE ADRESSE MÈNE QUELQUE PART.
   *
   * Duo et Bande ont pointé `/dashboard/vitrine` pendant des mois alors que
   * leurs écrans sont sous `/dashboard/salons/`. Rien ne l'a signalé : ce
   * champ n'est lu par personne aujourd'hui — `plans.ts` n'en prend que le
   * `label` — donc l'erreur dormait, prête à se réveiller au premier lien.
   *
   * On vérifie sur le SYSTÈME DE FICHIERS et non contre une liste écrite à
   * la main : une seconde liste aurait le même défaut que la première, celui
   * de pouvoir mentir. Les segments dynamiques (`[id]`) sont acceptés parce
   * qu'aucune adresse du catalogue n'en porte — si l'une en portait un jour,
   * ce test le dirait au lieu de le deviner.
   */
  it("mène à une page qui existe vraiment", () => {
    // La résolution imite le routeur : à chaque segment, un dossier LITTÉRAL
    // ou un segment DYNAMIQUE `[x]`. Les groupes `(nom)` sont transparents
    // dans l'URL, on les traverse donc sans les consommer — c'est ainsi que
    // `/dashboard/salons/duo` trouve `salons/[jeu]/page.tsx`.
    const racine = path.join(process.cwd(), "src", "app");

    const resout = (dossier: string, segments: string[]): boolean => {
      if (segments.length === 0) {
        return fs.existsSync(path.join(dossier, "page.tsx"));
      }
      const [tete, ...reste] = segments;
      let entrees: string[];
      try {
        entrees = fs.readdirSync(dossier);
      } catch {
        return false;
      }

      // 1. Le dossier qui porte exactement ce nom.
      if (entrees.includes(tete) && resout(path.join(dossier, tete), reste)) {
        return true;
      }
      // 2. Un segment dynamique, quel que soit le nom du paramètre.
      for (const entree of entrees) {
        if (entree.startsWith("[") && resout(path.join(dossier, entree), reste)) {
          return true;
        }
      }
      // 3. Un groupe de routes, invisible dans l'URL : on redescend avec les
      //    MÊMES segments.
      for (const entree of entrees) {
        if (entree.startsWith("(") && resout(path.join(dossier, entree), segments)) {
          return true;
        }
      }
      return false;
    };

    const manquantes: string[] = [];
    for (const entree of entrees) {
      const segments = entree.dashboardHref.replace(/^\//, "").split("/").filter(Boolean);
      if (!resout(racine, segments)) {
        manquantes.push(`${entree.label} → ${entree.dashboardHref}`);
      }
    }
    expect(manquantes, manquantes.join(" · ")).toEqual([]);

    // CONTRÔLE NÉGATIF : sans lui, un résolveur qui rend `true` partout
    // passerait ce test et ne prouverait rien.
    expect(resout(racine, ["dashboard", "cette-page-nexiste-pas"])).toBe(false);
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
