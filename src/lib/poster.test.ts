import { describe, expect, it } from "vitest";
import {
  POSTER_FONTS,
  POSTER_TEMPLATES,
  contrastText,
  getPosterTemplate,
  posterConfigSchema,
  posterFont,
  posterFontsHref,
  posterImageRef,
  posterImageStoragePath,
  posterImageUrl,
  resolvePosterConfig,
} from "./poster";

describe("resolvePosterConfig", () => {
  it("retombe sur le modèle Kermesse pour un jsonb vide/corrompu", () => {
    const c = resolvePosterConfig({});
    expect(c.template).toBe("kermesse");
    expect(c.elements.length).toBeGreaterThan(5);
    expect(resolvePosterConfig(null).template).toBe("kermesse");
    expect(resolvePosterConfig("junk").template).toBe("kermesse");
  });

  it("conserve une configuration v2 valide", () => {
    const saved = {
      version: 2,
      bg: "#123456",
      bgPattern: "dots",
      elements: [
        { id: "a", type: "qr", x: 50, y: 50, w: 40, rot: 0, z: 1 },
        {
          id: "b", type: "text", x: 50, y: 10, w: 80, rot: 0, z: 2,
          text: "Coucou", font: "lilita", size: 6, color: "#ffffff",
        },
      ],
    };
    const c = resolvePosterConfig(saved);
    expect(c.bg).toBe("#123456");
    expect(c.elements).toHaveLength(2);
    expect(c.elements[1].text).toBe("Coucou");
  });

  it("migre l'ancien modèle v1 en éléments (rien n'est perdu)", () => {
    const legacy = {
      bgFrom: "#fffbeb",
      bgTo: "#fef3c7",
      accent: "#b45309",
      textColor: "#292524",
      title: "Un café gagnant vous attend !",
      subtitle: "Scannez, tournez la roue, dégustez.",
      step1: "Scannez le QR code",
      step2: "Tournez la roue",
      step3: "Montrez votre gain en caisse",
      footer: "Jeu gratuit",
      qrScale: "lg",
    };
    const c = resolvePosterConfig(legacy);
    expect(c.bg).toBe("#fffbeb");
    const texts = c.elements.filter((el) => el.type === "text").map((el) => el.text);
    expect(texts).toContain("Un café gagnant vous attend !");
    expect(texts.join("\n")).toContain("Tournez la roue");
    const qr = c.elements.find((el) => el.type === "qr");
    expect(qr?.w).toBe(50); // qrScale lg
  });
});

describe("posterConfigSchema — garde-fous", () => {
  it("rejette couleurs invalides, textes trop longs et images énormes", () => {
    const el = { id: "a", type: "text", x: 0, y: 0, w: 10 };
    expect(
      posterConfigSchema.safeParse({ bg: "red", elements: [] }).success,
    ).toBe(false);
    expect(
      posterConfigSchema.safeParse({
        elements: [{ ...el, text: "x".repeat(500) }],
      }).success,
    ).toBe(false);
    expect(
      posterConfigSchema.safeParse({
        elements: [{ id: "i", type: "image", x: 0, y: 0, w: 10, src: "data:image/png;base64," + "A".repeat(600_000) }],
      }).success,
    ).toBe(false);
    expect(
      posterConfigSchema.safeParse({
        elements: Array.from({ length: 61 }, (_, i) => ({ ...el, id: `e${i}` })),
      }).success,
    ).toBe(false);
  });

  it("rejette les identifiants dupliqués et un rognage qui vide l'image", () => {
    const base = { type: "image", x: 50, y: 50, w: 30 };
    expect(
      posterConfigSchema.safeParse({
        elements: [
          { ...base, id: "same" },
          { ...base, id: "same" },
        ],
      }).success,
    ).toBe(false);
    expect(
      posterConfigSchema.safeParse({
        elements: [{ ...base, id: "crop", cropL: 60, cropR: 40 }],
      }).success,
    ).toBe(false);
  });
});

describe("modèles d'affiche", () => {
  it("chaque modèle est complet, valide et retrouvable", () => {
    for (const t of POSTER_TEMPLATES) {
      expect(posterConfigSchema.safeParse(t.config).success, t.key).toBe(true);
      expect(t.config.template).toBe(t.key);
      expect(t.config.elements.some((el) => el.type === "qr"), t.key).toBe(true);
    }
    expect(getPosterTemplate("nuit")?.config.bg).toBe("#211d16");
    expect(getPosterTemplate("nope")).toBeUndefined();
  });
});

describe("catalogue de polices", () => {
  it("clés uniques, résolution et URL Google Fonts", () => {
    const keys = POSTER_FONTS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(POSTER_FONTS.length).toBeGreaterThanOrEqual(28);
    expect(posterFont("lilita").family).toBe("Lilita One");
    expect(posterFont("inexistante").family).toBe(POSTER_FONTS[0].family);
    const href = posterFontsHref(["lilita", "nunito"]);
    expect(href).toContain("family=Lilita+One");
    expect(href).toContain("family=Nunito");
    expect(href).not.toContain("family=Anton");
    expect(href).toContain("display=swap");
    expect(posterFontsHref([])).toBeUndefined();
  });
});

describe("images d'affiche Storage", () => {
  const path =
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222-33333333-3333-4333-8333-333333333333.webp";

  it("valide et résout une référence Storage courte", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const ref = posterImageRef(path);
    expect(posterImageStoragePath(ref)).toBe(path);
    expect(posterImageUrl(ref)).toBe(
      `https://project.supabase.co/storage/v1/object/public/poster-images/${path}`,
    );
    expect(
      posterImageStoragePath("poster-image:------------------------------------/bad.webp"),
    ).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  });

  it("conserve les data URLs pour la migration au prochain enregistrement", () => {
    const src = "data:image/png;base64,AAAA";
    expect(posterImageStoragePath(src)).toBeNull();
    expect(posterImageUrl(src)).toBe(src);
    expect(
      posterConfigSchema.safeParse({
        version: 2,
        elements: [{ id: "image", type: "image", x: 50, y: 50, w: 20, src }],
      }).success,
    ).toBe(true);
  });
});

describe("contrastText", () => {
  it("texte sombre sur fond clair, blanc sur fond sombre", () => {
    expect(contrastText("#ffffff")).toBe("#18181b");
    expect(contrastText("#fcca59")).toBe("#18181b");
    expect(contrastText("#211d16")).toBe("#ffffff");
    expect(contrastText("#fff")).toBe("#18181b"); // hex court
  });
});
