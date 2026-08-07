// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DECOR_KEYS,
  ThemeDecor,
  decorEstVide,
  type DecorKey,
} from "@/components/ui/theme-decor";
import {
  CALENDAR_THEME_ORDER,
  calendarThemeTokens,
} from "@/components/calendar/calendar-theme";
import { QUIZ_THEME_ORDER, quizThemeTokens } from "@/components/quiz/quiz-theme";
import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import { WHEEL_PRESETS, playDecor, resolveWheelStyle } from "@/lib/wheel-style";

/**
 * CE QUI EST VÉRIFIÉ ICI, ET POURQUOI ÇA VAUT UN TEST.
 *
 * Le décor est du papier peint : personne ne le lit à voix haute, personne ne
 * clique dessus. Ses trois garanties sont donc invisibles à l'œil et ne se
 * cassent qu'en silence —
 *
 *  1. `aria-hidden` : sans lui, un lecteur d'écran plonge dans une centaine de
 *     `<path>` avant d'atteindre la première question du joueur.
 *  2. `pointer-events-none` : ce n'est PAS qu'un confort de clic.
 *     `document.elementsFromPoint` — donc axe-core, qui s'en sert pour résoudre
 *     le fond d'un texte — ignore les éléments qui le portent. Le retirer
 *     ferait mesurer le contraste des pages joueur contre un dessin.
 *  3. Aucune position aléatoire : un `Math.random()` dans le rendu ferait
 *     diverger serveur et client à l'hydratation. Le test le prouve en rendant
 *     deux fois et en comparant le balisage.
 */

afterEach(cleanup);

describe("ThemeDecor", () => {
  it("chaque clé du domaine rend une scène (sauf « aucun », qui ne rend rien)", () => {
    for (const decor of DECOR_KEYS) {
      const { container, unmount } = render(<ThemeDecor decor={decor} />);
      const svg = container.querySelector("svg");
      if (decor === "aucun") {
        expect(decorEstVide(decor)).toBe(true);
        expect(svg).toBeNull();
      } else {
        expect(decorEstVide(decor)).toBe(false);
        expect(svg).not.toBeNull();
        // Les motifs sont des <svg> imbriqués : au moins un par emplacement.
        expect(svg!.querySelectorAll("svg").length).toBeGreaterThan(4);
      }
      unmount();
    }
  });

  it("est masqué à l'assistance et transparent au pointeur", () => {
    const { container } = render(<ThemeDecor decor="noel" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("class")).toContain("pointer-events-none");
    expect(svg.getAttribute("class")).toContain("absolute");
  });

  it("atténue par les attributs SVG, jamais par une opacité de conteneur", () => {
    const { container } = render(<ThemeDecor decor="noel" />);
    const svg = container.querySelector("svg")!;

    // `opacity` sur le conteneur créerait un contexte d'empilement, et la
    // mesure de contraste retomberait sur le crème du <body> — le défaut
    // documenté dans `play-backdrop.tsx` (1,07:1 relevé par axe-core).
    expect(svg.getAttribute("opacity")).toBeNull();
    expect(svg.getAttribute("style") ?? "").not.toContain("opacity");
    // Le SEUIL EST UN PLANCHER, plus un plafond, et c'est le correctif de
    // fond de cette version : à 12 % (la valeur précédente) les motifs
    // ressortaient en taches beiges indistinctes du fond — « on ne distingue
    // ni personnage ni thème ». Un dessin de papier peint doit se voir ; ce
    // qui protège les textes, c'est la carte des emplacements, pas le voile.
    expect(Number(svg.getAttribute("fill-opacity"))).toBeGreaterThanOrEqual(0.6);
    expect(Number(svg.getAttribute("stroke-opacity"))).toBeGreaterThanOrEqual(
      0.8,
    );
    // …mais jamais l'opacité pleine : le décor doit rester d'un cran derrière
    // les cartes blanches du contenu.
    expect(Number(svg.getAttribute("fill-opacity"))).toBeLessThan(1);
  });

  it("réserve les grandes vignettes du haut aux grands écrans", () => {
    // Sur mobile — le parcours QR en boutique, donc le cas courant — la
    // colonne de contenu (`max-w-md`) prend toute la largeur : une vignette
    // de 160 px en haut passerait sous le titre de la page, qui n'est PAS
    // encarté. Les emplacements concernés portent donc `hidden md:block`.
    const { container } = render(<ThemeDecor decor="noel" />);
    const motifs = [...container.querySelectorAll("svg svg")];
    const grands = motifs.filter(
      (m) => Number(m.getAttribute("width")) >= 100,
    );

    const haut = (el: Element) =>
      Number.parseFloat(el.getAttribute("y") ?? "0") < 30;

    expect(grands.length).toBeGreaterThanOrEqual(2);
    for (const m of grands.filter(haut)) {
      expect(m.getAttribute("class")).toBe("hidden md:block");
    }
    // …et le mobile n'est pas privé de grande illustration pour autant :
    // celles de la bande basse, hors du couloir du pied de page, restent.
    expect(grands.some((m) => !haut(m) && m.getAttribute("class") === null))
      .toBe(true);
  });

  it("ne porte aucun gestionnaire d'événement", () => {
    const { container } = render(<ThemeDecor decor="ballons" />);
    for (const el of container.querySelectorAll("*")) {
      for (const attr of el.getAttributeNames()) {
        expect(attr.startsWith("on")).toBe(false);
      }
    }
  });

  it("est déterministe : deux rendus donnent exactement le même balisage", () => {
    const a = render(<ThemeDecor decor="fanions" />).container.innerHTML;
    cleanup();
    const b = render(<ThemeDecor decor="fanions" />).container.innerHTML;
    expect(a).toBe(b);
  });

  it("la vignette d'éditeur reste plus légère que la page", () => {
    const page = render(<ThemeDecor decor="noel" />).container.querySelectorAll(
      "svg svg",
    ).length;
    cleanup();
    const vignette = render(
      <ThemeDecor decor="noel" variant="vignette" />,
    ).container.querySelectorAll("svg svg").length;

    expect(vignette).toBeGreaterThan(0);
    expect(vignette).toBeLessThan(page);
  });
});

describe("cohérence des tables de thèmes", () => {
  const connue = (decor: DecorKey) => DECOR_KEYS.includes(decor);

  it("les six thèmes du calendrier déclarent un décor connu", () => {
    for (const key of CALENDAR_THEME_ORDER) {
      expect(connue(calendarThemeTokens(key).decor)).toBe(true);
    }
  });

  it("les sept habillages de quiz déclarent un décor connu", () => {
    for (const key of QUIZ_THEME_ORDER) {
      expect(connue(quizThemeTokens(key).decor)).toBe(true);
    }
  });

  it("les six thèmes de pronostics déclarent un décor connu", () => {
    for (const key of CONTEST_THEME_ORDER) {
      expect(connue(contestThemeTokens(key).decor)).toBe(true);
    }
  });

  it("les huit presets de roue déclarent un décor connu", () => {
    for (const preset of WHEEL_PRESETS) {
      expect(connue(preset.decor)).toBe(true);
      // Le décor est LU depuis le preset de départ enregistré dans le style.
      expect(playDecor(preset.style)).toBe(preset.decor);
    }
  });

  it("un style sans preset — ou dont le preset a disparu — garde un décor", () => {
    expect(playDecor(resolveWheelStyle({}))).toBe("confetti");
    expect(playDecor(resolveWheelStyle({ preset: "disparu" }))).toBe("confetti");
  });

  it("les thèmes saisonniers partagent le décor entre calendrier et pronostics", () => {
    // Même clé SQL, même saison : un « Noël » de calendrier et un « Noël » de
    // championnat ne peuvent pas montrer deux fonds différents au même client.
    for (const key of CONTEST_THEME_ORDER) {
      expect(contestThemeTokens(key).decor).toBe(calendarThemeTokens(key).decor);
    }
  });
});
