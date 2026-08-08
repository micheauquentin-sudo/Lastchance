import { describe, expect, it } from "vitest";
import { FOND_KEYS } from "./fonds-ecran";
import {
  GAME_OBJECT_KEYS,
  SCRATCH_COVER_DEFAULT,
  SLOT_SYMBOL_SETS,
  SLOT_SYMBOL_SET_KEYS,
  WHEEL_PRESETS,
  gameObjectColor,
  getPreset,
  playBackground,
  playSurface,
  resolveWheelStyle,
  scratchCover,
  slotSymbols,
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

/**
 * Le fond d'écran est le seul champ VISUEL du schéma que le commerçant choisit
 * pour ce qu'il MONTRE (un stade, une salle) et non pour ses couleurs. Il vit
 * donc dans le jsonb, contrairement au `decor` porté par le preset.
 */
describe("wheelStyleSchema.fond — fond d'écran thématique", () => {
  it("absent par défaut : les styles déjà enregistrés n'en ont pas", () => {
    expect(resolveWheelStyle({}).fond).toBeUndefined();
    expect(resolveWheelStyle(null).fond).toBeUndefined();
  });

  it("accepte les dix clés du catalogue", () => {
    for (const cle of FOND_KEYS) {
      expect(resolveWheelStyle({ fond: cle }).fond).toBe(cle);
    }
  });

  /**
   * `.catch(undefined)` : une clé retirée du catalogue et relue en base rend
   * une page SANS fond — jamais une validation en échec qui ferait perdre au
   * commerçant ses vingt couleurs à cause d'une image disparue.
   */
  it("replie une clé inconnue SANS emporter le reste du style", () => {
    const s = resolveWheelStyle({ fond: "halloween", pointerColor: "#ff0000" });
    expect(s.fond).toBeUndefined();
    expect(s.pointerColor).toBe("#ff0000");
    expect(resolveWheelStyle({ fond: 42 }).fond).toBeUndefined();
  });

  it("aucun preset n'écrit de fond — le choix reste au commerçant", () => {
    for (const p of WHEEL_PRESETS) {
      expect(p.style.fond).toBeUndefined();
    }
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

describe("games — personnalisation par mécanique", () => {
  it("est absent par défaut : un style vierge n'écrit rien en base", () => {
    expect(resolveWheelStyle({}).games).toBeUndefined();
    // Ce que le jsonb reçoit réellement : `undefined` disparaît à la
    // sérialisation, aucune migration, aucun champ requis ajouté.
    expect(JSON.stringify(resolveWheelStyle({}))).not.toContain("games");
  });

  /**
   * PROPRIÉTÉ DES PRESETS : ils décrivent une ambiance de PAGE, appliquée
   * avant même que le commerçant ait choisi sa mécanique. Aucun ne doit
   * écrire dans `games` — sinon appliquer « Néon » recolorerait les gobelets.
   */
  it("aucun preset n'écrit le sous-objet", () => {
    for (const p of WHEEL_PRESETS) {
      expect(p.style.games, p.key).toBeUndefined();
    }
  });

  it("conserve les réglages valides, mécanique par mécanique", () => {
    const s = resolveWheelStyle({
      games: {
        scratch: { coverFrom: "#111111", coverMid: "#222222", coverTo: "#333333" },
        slot: { symbols: "bijoux" },
        cups: { color: "#ff0000" },
      },
    });
    expect(scratchCover(s)).toEqual(["#111111", "#222222", "#333333"]);
    expect(slotSymbols(s)).toEqual(SLOT_SYMBOL_SETS.bijoux);
    expect(gameObjectColor(s, "cups")).toBe("#ff0000");
  });

  it("défauts à la LECTURE : couche métallisée, symboles fruits, objets sans couleur", () => {
    const s = resolveWheelStyle({});
    expect(scratchCover(s)).toEqual([...SCRATCH_COVER_DEFAULT]);
    expect(slotSymbols(s)).toEqual(SLOT_SYMBOL_SETS.fruits);
    for (const k of GAME_OBJECT_KEYS) {
      // ABSENCE ≠ VALEUR : sans couleur, le composant garde l'habillage du
      // thème (blanc sur kermesse, translucide sur nuit). Un hex par défaut
      // figerait l'un des deux.
      expect(gameObjectColor(s, k), k).toBeUndefined();
    }
  });

  /**
   * Un sous-objet corrompu ne doit pas emporter les vingt autres champs :
   * sans le `.catch(undefined)`, `resolveWheelStyle` renvoyait tous les
   * défauts et le commerçant perdait ses couleurs de page à cause d'une
   * couleur de gobelet.
   */
  it("un games corrompu dégrade LOCALEMENT, sans effacer le reste du style", () => {
    const s = resolveWheelStyle({
      bgFrom: "#123456",
      ring: "gold",
      games: { cups: { color: "javascript:alert(1)" } },
    });
    expect(s.bgFrom).toBe("#123456");
    expect(s.ring).toBe("gold");
    expect(s.games).toBeUndefined();
    expect(gameObjectColor(s, "cups")).toBeUndefined();
  });

  it("les trois jeux de symboles ont six symboles chacun et des clés stables", () => {
    for (const k of SLOT_SYMBOL_SET_KEYS) {
      expect(SLOT_SYMBOL_SETS[k], k).toHaveLength(6);
    }
    // Référence STABLE : SlotReveal la met dans les dépendances de `start`.
    const s = resolveWheelStyle({ games: { slot: { symbols: "fete" } } });
    expect(slotSymbols(s)).toBe(slotSymbols(s));
  });

  it("un style complet reste sérialisable et relisable à l'identique", () => {
    const s = resolveWheelStyle({
      games: { dice: { color: "#abc" }, memory: { color: "#001122" } },
    });
    expect(resolveWheelStyle(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
