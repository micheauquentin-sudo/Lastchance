import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  playOnLightSurface,
  resolveWheelStyle,
  WHEEL_PRESETS,
  type WheelStyle,
} from "@/lib/wheel-style";

/**
 * GARDE MÉCANIQUE — le texte de /play doit rester lisible sur le fond que le
 * commerçant a réellement choisi.
 *
 * ── Le défaut (2026-07-30) ──
 *
 * Deux presets livrés portaient un dégradé CLAIR en gardant `pageTheme:
 * "nuit"`, donc un titre `text-white` :
 *
 *   Pastel  (#fbcfe8 → #fda4af) → 1,38:1
 *   Cartoon (#fef08a → #f59e0b) → 1,16:1      (seuil AA-large : 3:1)
 *
 * Permanent, sans animation : tout commerçant choisissant l'un de ces styles
 * publiait une page dont le titre était pratiquement invisible. Personne ne
 * l'avait vu parce que les seules roues semées en E2E utilisent des styles
 * sombres — le capteur ne pouvait structurellement pas l'atteindre.
 *
 * ── Ce que cette garde vérifie, et pourquoi elle vaut mieux qu'un correctif ──
 *
 * `bgFrom` et `bgTo` sont des champs de couleur LIBRES. Corriger deux presets
 * n'aurait rien fermé. Ce test refait le calcul WCAG à chaque exécution, pour
 * chaque preset, avec la palette que `playOnLightSurface` choisira vraiment —
 * donc il tient pour le preset qui sera ajouté demain.
 *
 * Ce qu'il NE couvre PAS, et c'est assumé : les couleurs libres saisies à la
 * main par un commerçant. Rien ici ne les borne — un fond de demi-teinte
 * (l'ambre `#f59e0b` en est un) est hostile au texte clair COMME au texte
 * sombre, et aucune palette à deux états ne peut le sauver. Une validation à
 * la saisie serait le prolongement naturel ; elle n'existe pas.
 */

/**
 * Valeurs relues dans `src/app/globals.css` (jetons `--color-k-*`) et, pour
 * `zinc-300`, converties depuis l'oklch de Tailwind 4
 * (`oklch(87.1% 0.006 286.286)` → `#d4d4d8`). La conversion a été validée sur
 * `zinc-400`, dont elle retrouve `#9f9fa9` exactement — la valeur Tailwind 3
 * `#a1a1aa` que trois lectures avaient reprise de mémoire est FAUSSE ici.
 */
const JETONS = {
  blanc: "#ffffff",
  zinc300: "#d4d4d8",
  kInk: "#211d16",
  kBody: "#3d382f",
} as const;

/**
 * Ce que `playText` rendra, résolu en couleur. Miroir volontaire de
 * `play-theme.tsx` : si l'un change sans l'autre, un test tombe.
 */
function palette(surfaceClaire: boolean) {
  return {
    // `title` : 30 px gras sur /play → seuil AA-large.
    titre: { couleur: surfaceClaire ? JETONS.kInk : JETONS.blanc, seuil: 3 },
    // `body` et `muted` : 11–14 px → seuil AA normal.
    corps: { couleur: surfaceClaire ? JETONS.kBody : JETONS.zinc300, seuil: 4.5 },
    mention: { couleur: surfaceClaire ? JETONS.kBody : JETONS.zinc300, seuil: 4.5 },
  };
}

/**
 * Le dégradé est `radial-gradient(circle at 50% -10%, bgFrom, bgTo 75%)` : le
 * titre est haut (près de `bgFrom`), les mentions sont basses (près de `bgTo`).
 * On exige les DEUX extrémités — le texte défile par-dessus.
 */
function pire(couleur: string, style: WheelStyle): number {
  return Math.min(
    contrastRatio(couleur, style.bgFrom),
    contrastRatio(couleur, style.bgTo),
  );
}

describe("contraste de /play — chaque preset, avec la palette qu'il déclenche", () => {
  for (const preset of WHEEL_PRESETS) {
    it(`« ${preset.label} » reste lisible`, () => {
      const style = preset.style;
      // Le thème kermesse repeint la page en crème et jette le dégradé : ses
      // couleurs de fond ne décrivent alors plus rien de ce qu'on voit.
      if (style.pageTheme === "kermesse") {
        expect(playOnLightSurface(style)).toBe(true);
        return;
      }
      const p = palette(playOnLightSurface(style));
      for (const [nom, { couleur, seuil }] of Object.entries(p)) {
        const ratio = pire(couleur, style);
        expect(
          ratio,
          `${preset.label} — ${nom} (${couleur}) sur ${style.bgFrom}→${style.bgTo} : ${ratio.toFixed(2)}:1, seuil ${seuil}:1`,
        ).toBeGreaterThanOrEqual(seuil);
      }
    });
  }

  it("le style par défaut, sans aucun preset, est lisible aussi", () => {
    const style = resolveWheelStyle({});
    const p = palette(playOnLightSurface(style));
    for (const { couleur, seuil } of Object.values(p)) {
      expect(pire(couleur, style)).toBeGreaterThanOrEqual(seuil);
    }
  });
});

describe("playOnLightSurface — la règle, et son contrôle négatif", () => {
  it("classe les deux presets clairs comme clairs", () => {
    // Ce sont EUX le défaut d'origine. Si un jour ils repassent « sombres »
    // sans que leurs couleurs changent, la règle a été cassée.
    const clairs = WHEEL_PRESETS.filter((p) => playOnLightSurface(p.style)).map(
      (p) => p.key,
    );
    expect(clairs).toContain("candy"); // « Pastel »
    expect(clairs).toContain("cartoon"); // « Cartoon »
  });

  it("classe les fonds sombres comme sombres", () => {
    const sombre = resolveWheelStyle({ bgFrom: "#2e1065", bgTo: "#000000" });
    expect(playOnLightSurface(sombre)).toBe(false);
  });

  it("bascule dès qu'UNE seule extrémité devient claire", () => {
    // CONTRÔLE NÉGATIF de la règle : un dégradé sombre → blanc doit compter
    // comme clair, sinon le titre blanc disparaîtrait dans le bas de l'écran.
    // Sans cette assertion, `playOnLightSurface` pourrait ne regarder que
    // `bgFrom` et les trois tests précédents resteraient verts.
    const mixte = resolveWheelStyle({ bgFrom: "#000000", bgTo: "#ffffff" });
    expect(playOnLightSurface(mixte)).toBe(true);
  });

  it("calcule un vrai rapport WCAG", () => {
    // Valeurs de référence connues : noir/blanc = 21:1, une couleur avec
    // elle-même = 1:1. Si `contrastRatio` dérivait, tout le reste mentirait
    // en silence.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#7f1d1d", "#7f1d1d")).toBeCloseTo(1, 5);
  });
});
