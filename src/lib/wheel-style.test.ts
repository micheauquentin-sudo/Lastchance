import { describe, expect, it } from "vitest";
import {
  WHEEL_PRESETS,
  getPreset,
  playBackground,
  playSurface,
  resolveWheelStyle,
  wheelStyleSchema,
} from "./wheel-style";

describe("resolveWheelStyle — lecture tolérante du jsonb", () => {
  it("retourne les défauts pour un style vide ou absent", () => {
    const s = resolveWheelStyle({});
    expect(s.ring).toBe("classic");
    expect(s.lights).toBe(true);
    expect(s.font).toBe("sans");
    expect(resolveWheelStyle(null)).toEqual(s);
    expect(resolveWheelStyle(undefined)).toEqual(s);
  });

  it("retombe sur les défauts si le jsonb est corrompu", () => {
    expect(resolveWheelStyle("garbage").ring).toBe("classic");
    expect(resolveWheelStyle({ ring: "hacked" }).ring).toBe("classic");
    expect(resolveWheelStyle(42).font).toBe("sans");
  });

  it("conserve les surcharges valides", () => {
    const s = resolveWheelStyle({ ring: "gold", pointerColor: "#ff0000" });
    expect(s.ring).toBe("gold");
    expect(s.pointerColor).toBe("#ff0000");
    // le reste garde ses défauts
    expect(s.buttonFrom).toBe("#7c3aed");
  });

  it("ambiance de page : « nuit » par défaut (rétrocompatible), « kermesse » conservée", () => {
    // Les styles existants en base (sans pageTheme) restent en thème nuit.
    expect(resolveWheelStyle({}).pageTheme).toBe("nuit");
    expect(resolveWheelStyle({ pageTheme: "kermesse" }).pageTheme).toBe("kermesse");
    expect(resolveWheelStyle({ pageTheme: "disco" }).pageTheme).toBe("nuit");
  });
});

describe("wheelStyleSchema — validation à l'écriture", () => {
  it("rejette une couleur non hexadécimale", () => {
    expect(
      wheelStyleSchema.safeParse({ labelColor: "red" }).success,
    ).toBe(false);
    expect(
      wheelStyleSchema.safeParse({ bgFrom: "url(javascript:x)" }).success,
    ).toBe(false);
  });

  it("borne l'épaisseur de bordure et la longueur du titre", () => {
    expect(
      wheelStyleSchema.safeParse({ segmentBorderWidth: 99 }).success,
    ).toBe(false);
    expect(
      wheelStyleSchema.safeParse({ title: "x".repeat(200) }).success,
    ).toBe(false);
  });

  it("accepte les couleurs hex 3 et 6 caractères", () => {
    expect(wheelStyleSchema.safeParse({ hubColor: "#fff" }).success).toBe(true);
    expect(
      wheelStyleSchema.safeParse({ hubColor: "#a1B2c3" }).success,
    ).toBe(true);
  });
});

describe("presets", () => {
  it("chaque preset produit un style complet et valide", () => {
    for (const p of WHEEL_PRESETS) {
      const parsed = wheelStyleSchema.safeParse(p.style);
      expect(parsed.success, `preset ${p.key}`).toBe(true);
      expect(p.style.preset).toBe(p.key);
    }
  });

  it("les clés de presets sont uniques et retrouvables", () => {
    const keys = WHEEL_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(getPreset("neon")?.label).toBe("Néon");
    expect(getPreset("inexistant")).toBeUndefined();
  });

  it("le preset maison « kermesse » active le thème de page assorti", () => {
    expect(getPreset("kermesse")?.style.pageTheme).toBe("kermesse");
    // Les autres presets restent en ambiance nuit.
    expect(getPreset("neon")?.style.pageTheme).toBe("nuit");
    expect(getPreset("cartoon")?.style.pageTheme).toBe("nuit");
  });

  it("les presets restent mélangeables (surcharge champ par champ)", () => {
    const luxe = getPreset("luxe")!.style;
    const mixed = resolveWheelStyle({ ...luxe, font: "script", lights: true });
    expect(mixed.ring).toBe("gold"); // hérité de luxe
    expect(mixed.font).toBe("script"); // surchargé
    expect(mixed.lights).toBe(true); // surchargé
  });
});

describe("playBackground", () => {
  it("construit le dégradé à partir des couleurs du style", () => {
    const s = resolveWheelStyle({ bgFrom: "#111111", bgTo: "#222222" });
    expect(playBackground(s)).toContain("#111111");
    expect(playBackground(s)).toContain("#222222");
  });
});

describe("playSurface — habillage partagé page /play ↔ aperçu éditeur", () => {
  it("kermesse : aucun fond inline (le cadre pose bg-k-bg + bandeau)", () => {
    const s = resolveWheelStyle({ pageTheme: "kermesse", bgFrom: "#111111" });
    expect(playSurface(s)).toEqual({ kermesse: true });
  });

  it("nuit : dégradé radial personnalisé du commerçant", () => {
    const s = resolveWheelStyle({ bgFrom: "#111111", bgTo: "#222222" });
    const surface = playSurface(s);
    expect(surface.kermesse).toBe(false);
    expect(surface.background).toBe(playBackground(s));
  });
});
