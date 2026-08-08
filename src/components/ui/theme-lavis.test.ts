import { describe, expect, it } from "vitest";

import { LAVIS_QUIZ, LAVIS_SAISON } from "@/components/ui/theme-lavis";
import { contrastRatio } from "@/lib/wheel-style";
import {
  CALENDAR_THEME_ORDER,
  calendarThemeTokens,
} from "@/components/calendar/calendar-theme";
import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import { QUIZ_THEME_ORDER, quizThemeTokens } from "@/components/quiz/quiz-theme";

/**
 * CE QUE CE FICHIER GARDE.
 *
 * Le lavis de fond est la seule chose d'un thème qu'un joueur voit AVANT de
 * lire quoi que ce soit. Deux façons de le casser, toutes deux silencieuses :
 *
 *  1. Deux thèmes qui repeignent la même couleur — le choix du commerçant ne
 *     produit alors aucun effet visible. C'est exactement le défaut corrigé
 *     ici : les onze thèmes partageaient le crème `--color-k-bg`.
 *  2. Un lavis assombri au point de manger le texte non encarté (en-tête et
 *     pied de page reposent directement dessus). Le test refait le calcul de
 *     contraste plutôt que de faire confiance au tableau du commentaire.
 */

const K_INK = "#211d16";
const K_BODY = "#3d382f";

describe("lavis de fond des thèmes", () => {
  it("chaque thème saisonnier peint une couleur qui lui est propre", () => {
    const valeurs = Object.values(LAVIS_SAISON);
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });

  it("chaque habillage de quiz peint une couleur qui lui est propre", () => {
    const valeurs = Object.values(LAVIS_QUIZ);
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });

  it("garde les textes non encartés au-dessus du seuil AA, avec marge", () => {
    // 4,5:1 est le seuil ; on exige 7:1, la marge choisie pour absorber le
    // motif qui recouvre le lavis (rayure ou pois) sans avoir à le mesurer
    // pixel par pixel à chaque réglage.
    for (const lavis of [
      ...Object.values(LAVIS_SAISON),
      ...Object.values(LAVIS_QUIZ),
    ]) {
      expect(contrastRatio(K_INK, lavis)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(K_BODY, lavis)).toBeGreaterThanOrEqual(7);
    }
  });

  it("le calendrier et les pronostics peignent le MÊME fond par saison", () => {
    // Même enum SQL, même saison : un client ne peut pas voir deux « Noël »
    // de couleurs différentes selon le module qu'il ouvre.
    expect(CONTEST_THEME_ORDER).toEqual(CALENDAR_THEME_ORDER);
    for (const key of CONTEST_THEME_ORDER) {
      expect(contestThemeTokens(key).pageStyle).toEqual(
        calendarThemeTokens(key).pageStyle,
      );
    }
  });

  it("aucune page joueur ne reste sur le crème par défaut, hors « neutre »", () => {
    for (const key of CALENDAR_THEME_ORDER) {
      if (key === "neutre") continue;
      expect(calendarThemeTokens(key).pageStyle.backgroundColor).not.toBe(
        LAVIS_SAISON.neutre,
      );
    }
    for (const key of QUIZ_THEME_ORDER) {
      if (key === "neutre") continue;
      expect(quizThemeTokens(key).pageStyle.backgroundColor).not.toBe(
        LAVIS_QUIZ.neutre,
      );
    }
  });
});
