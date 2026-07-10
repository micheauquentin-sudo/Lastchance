import { describe, expect, it } from "vitest";
import {
  POSTER_TEMPLATES,
  getPosterTemplate,
  posterBackground,
  posterConfigSchema,
  resolvePosterConfig,
} from "./poster";

describe("resolvePosterConfig", () => {
  it("retourne les défauts pour un jsonb vide/corrompu", () => {
    const c = resolvePosterConfig({});
    expect(c.title).toBe("Tentez votre chance !");
    expect(c.qrScale).toBe("md");
    expect(resolvePosterConfig(null)).toEqual(c);
    expect(resolvePosterConfig("junk").accent).toBe("#7c3aed");
    expect(resolvePosterConfig({ qrScale: "xxl" }).qrScale).toBe("md");
  });

  it("conserve les personnalisations valides", () => {
    const c = resolvePosterConfig({ title: "Jeu de l'été", accent: "#ff0000" });
    expect(c.title).toBe("Jeu de l'été");
    expect(c.accent).toBe("#ff0000");
    expect(c.subtitle).toBe("Tournez la roue, gagnez un cadeau.");
  });
});

describe("posterConfigSchema — garde-fous", () => {
  it("rejette couleurs invalides et textes trop longs", () => {
    expect(posterConfigSchema.safeParse({ accent: "red" }).success).toBe(false);
    expect(
      posterConfigSchema.safeParse({ title: "x".repeat(100) }).success,
    ).toBe(false);
    expect(
      posterConfigSchema.safeParse({ footer: "x".repeat(200) }).success,
    ).toBe(false);
  });
});

describe("templates d'affiche", () => {
  it("chaque template est complet, valide et retrouvable", () => {
    for (const t of POSTER_TEMPLATES) {
      expect(posterConfigSchema.safeParse(t.config).success, t.key).toBe(true);
      expect(t.config.template).toBe(t.key);
    }
    expect(getPosterTemplate("bold")?.config.textColor).toBe("#ffffff");
    expect(getPosterTemplate("nope")).toBeUndefined();
  });
});

describe("contrastText", () => {
  it("texte sombre sur fond clair, blanc sur fond sombre", async () => {
    const { contrastText } = await import("./poster");
    expect(contrastText("#ffffff")).toBe("#18181b");
    expect(contrastText("#facc15")).toBe("#18181b");
    expect(contrastText("#18181b")).toBe("#ffffff");
    expect(contrastText("#7c3aed")).toBe("#ffffff");
    expect(contrastText("#fff")).toBe("#18181b"); // hex court
  });
});

describe("posterBackground", () => {
  it("couleur unie si from == to, dégradé sinon", () => {
    expect(
      posterBackground(resolvePosterConfig({ bgFrom: "#fff", bgTo: "#fff" })),
    ).toBe("#fff");
    expect(
      posterBackground(resolvePosterConfig({ bgFrom: "#111111", bgTo: "#222222" })),
    ).toContain("linear-gradient");
  });
});
