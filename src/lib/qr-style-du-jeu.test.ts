// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LAVIS_SAISON } from "@/components/ui/theme-lavis";
import { FOND_KEYS } from "@/lib/fonds-ecran";
import { isScannable } from "@/lib/qr-render";
import { qrStyleDuJeu } from "@/lib/qr-style-du-jeu";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

function style(champs: Record<string, unknown>): WheelStyle {
  return resolveWheelStyle(champs);
}

describe("qrStyleDuJeu — l'invariant prime sur le goût", () => {
  /**
   * LE test du module : un QR joli et non scanné est un QR raté. Les dix fonds
   * sont croisés avec des accents choisis pour couvrir les trois branches —
   * franc (nominal), demi-teinte (blanchiment nuit), presque blanc (repli
   * encre) — dans les deux ambiances de page.
   */
  it("tout style rendu reste scannable, sur les 10 fonds", () => {
    const accents = [
      "#7c3aed",
      "#f5793b",
      "#40a", // trois chiffres, franc
      "#abc", // trois chiffres, trop pâle → repli
      "#a0a0a0",
      "#fefefe",
      "#ffffff",
    ];
    for (const fond of FOND_KEYS) {
      for (const buttonFrom of accents) {
        for (const pageTheme of ["nuit", "kermesse"] as const) {
          const derive = qrStyleDuJeu(style({ fond, buttonFrom, pageTheme }));
          expect(derive, `${fond}/${buttonFrom}/${pageTheme}`).not.toBeNull();
          expect(isScannable(derive), `${fond}/${buttonFrom}/${pageTheme}`).toBe(true);
        }
      }
    }
  });

  it("pose le lavis du fond et l'accent du commerçant", () => {
    const derive = qrStyleDuJeu(style({ fond: "noel", buttonFrom: "#7c3aed" }));

    expect(derive).toEqual({
      dark: "#7c3aed",
      light: LAVIS_SAISON.noel,
      eyeColor: "#7c3aed",
    });
  });

  it("étend un hex de trois chiffres en six", () => {
    // `wheelStyleSchema` accepte `#abc`, `qrStyleSchema` (studio QR) exige six
    // chiffres : sans l'expansion, le studio refuserait de ré-enregistrer la
    // couleur qu'il vient d'afficher.
    const derive = qrStyleDuJeu(style({ fond: "espace", buttonFrom: "#40a" }));

    expect(derive?.dark).toBe("#4400aa");
    expect(derive?.eyeColor).toBe("#4400aa");
  });

  it("retombe sur l'encre quand l'accent ne tient pas le contraste", () => {
    // Presque blanc sur un lavis presque blanc : illisible. En « kermesse », le
    // crème EST l'univers du site, on ne blanchit pas — c'est l'encre qui vient.
    const derive = qrStyleDuJeu(
      style({ fond: "soldes", buttonFrom: "#fefefe", pageTheme: "kermesse" }),
    );

    expect(derive).toEqual({
      dark: "#211d16",
      light: LAVIS_SAISON.soldes,
      eyeColor: "#211d16",
    });
  });

  it("blanchit le fond du QR en « nuit » pour sauver une demi-teinte", () => {
    // #a0a0a0 rend 2,2:1 sur le lavis (sous le seuil) et 2,6:1 sur blanc : la
    // couleur du commerçant est gardée, le fond du QR seul est blanchi.
    const derive = qrStyleDuJeu(
      style({ fond: "football", buttonFrom: "#a0a0a0", pageTheme: "nuit" }),
    );

    expect(derive).toEqual({
      dark: "#a0a0a0",
      light: "#ffffff",
      eyeColor: "#a0a0a0",
    });
  });

  it("sans fond, l'ambiance « kermesse » donne l'encre sur crème", () => {
    const derive = qrStyleDuJeu(style({ pageTheme: "kermesse" }));

    expect(derive?.dark).toBe("#211d16");
    expect(derive?.light).toBe("#fdf6e3");
    expect(derive?.eyeColor).toBe("#f5793b");
    expect(isScannable(derive)).toBe(true);
  });

  it("sans fond ni kermesse, ne dérive RIEN", () => {
    // CONTRÔLE NÉGATIF : une roue jamais habillée doit garder le noir sur blanc
    // du défaut, pas hériter d'une couleur inventée à partir de rien.
    expect(qrStyleDuJeu(style({}))).toBeNull();
    expect(qrStyleDuJeu(style({ pageTheme: "nuit", buttonFrom: "#7c3aed" }))).toBeNull();
  });
});
