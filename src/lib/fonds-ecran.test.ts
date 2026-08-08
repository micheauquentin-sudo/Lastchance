import { describe, expect, it } from "vitest";

import {
  FOND_KEYS,
  FOND_LABELS,
  fondPourQuizTheme,
  fondPourTheme,
  fondSrc,
  fondSrcSet,
} from "./fonds-ecran";
import { SEASONAL_THEMES } from "./seasonal-theme";
import { QUIZ_THEMES, type QuizTheme } from "./quiz";
import type { SeasonalTheme } from "@/types/database";

describe("FOND_KEYS — la table des fichiers livrés", () => {
  it("porte les dix clés, une par illustration de public/fonds", () => {
    expect([...FOND_KEYS]).toEqual([
      "prairie",
      "noel",
      "saint_valentin",
      "anniversaire",
      "soldes",
      "festival",
      "musique",
      "football",
      "restaurant",
      "espace",
    ]);
  });

  it("chaque clé a un libellé non vide", () => {
    for (const cle of FOND_KEYS) {
      expect(FOND_LABELS[cle]).toBeTruthy();
    }
    expect(Object.keys(FOND_LABELS).sort()).toEqual([...FOND_KEYS].sort());
  });
});

describe("fondSrc / fondSrcSet — les URL publiques", () => {
  it("compose le chemin des quatre variantes", () => {
    expect(fondSrc("noel", 960)).toBe("/fonds/noel-960.webp");
    expect(fondSrc("noel", 1280)).toBe("/fonds/noel-1280.webp");
    expect(fondSrc("noel", 1672)).toBe("/fonds/noel-1672.webp");
    expect(fondSrc("saint_valentin", "vignette")).toBe(
      "/fonds/saint_valentin-vignette.webp",
    );
  });

  /**
   * La vignette (360 px) est EXCLUE du srcset : mélangée aux largeurs de
   * rendu, un petit mobile la choisirait comme fond plein écran.
   */
  it("le srcset porte les trois largeurs de rendu, jamais la vignette", () => {
    expect(fondSrcSet("football")).toBe(
      "/fonds/football-960.webp 960w, /fonds/football-1280.webp 1280w, /fonds/football-1672.webp 1672w",
    );
    expect(fondSrcSet("football")).not.toContain("vignette");
  });

  it("chaque clé produit un srcset à trois entrées", () => {
    for (const cle of FOND_KEYS) {
      expect(fondSrcSet(cle).split(", ")).toHaveLength(3);
    }
  });
});

describe("fondPourTheme — la palette partagée", () => {
  it("« neutre » ne porte AUCUN fond (absence voulue, pas un trou)", () => {
    expect(fondPourTheme("neutre")).toBeNull();
  });

  /**
   * Le Record est exhaustif au compilateur ; ce test tient la promesse à
   * l'exécution : toute clé de la palette hors « neutre » a bien un fond, et
   * ce fond fait partie des fichiers livrés.
   */
  it("toute autre clé rend un fond réellement livré", () => {
    for (const theme of SEASONAL_THEMES) {
      const fond = fondPourTheme(theme);
      if (theme === "neutre") continue;
      expect(fond).not.toBeNull();
      expect(FOND_KEYS).toContain(fond);
    }
  });

  it("les dix clés d'univers et de saison portent leur homonyme", () => {
    for (const theme of SEASONAL_THEMES) {
      if (theme === "neutre") continue;
      expect(fondPourTheme(theme)).toBe(theme);
    }
  });

  /**
   * Le `Record` est exhaustif au COMPILATEUR ; à l'exécution, une valeur relue
   * en base n'a rien à prouver. `FOND_PAR_THEME["constructor"]` rendrait la
   * fonction héritée d'`Object.prototype` — truthy, donc un `??` ne replierait
   * pas et la « clé » finirait dans le `src` de l'image.
   */
  it("une clé héritée du prototype ne rend AUCUN fond", () => {
    for (const heritee of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(fondPourTheme(heritee as SeasonalTheme)).toBeNull();
    }
  });
});

describe("fondPourQuizTheme — correspondance d'USAGE, pas d'extension", () => {
  it("gourmand → restaurant, sport → football", () => {
    expect(fondPourQuizTheme("gourmand")).toBe("restaurant");
    expect(fondPourQuizTheme("sport")).toBe("football");
  });

  it("tout le reste du vocabulaire quiz reste sans fond", () => {
    for (const theme of QUIZ_THEMES) {
      if (theme === "gourmand" || theme === "sport") continue;
      expect(fondPourQuizTheme(theme)).toBeNull();
    }
  });

  /** Le vocabulaire quiz garde ses SEPT clés — il ne suit pas la palette. */
  it("le vocabulaire quiz n'a pas été élargi", () => {
    expect(QUIZ_THEMES).toHaveLength(7);
  });

  /** Même garde `Object.hasOwn` que sur la palette partagée. */
  it("une clé héritée du prototype ne rend AUCUN fond", () => {
    for (const heritee of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(fondPourQuizTheme(heritee as QuizTheme)).toBeNull();
    }
  });
});
