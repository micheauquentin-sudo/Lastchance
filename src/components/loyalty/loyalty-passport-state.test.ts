import { describe, expect, it } from "vitest";
import {
  formatDelay,
  loyaltyStampWindow,
  loyaltyTierMeta,
  loyaltyTierProgress,
  messageForSpinBlock,
  messageForStampState,
} from "./loyalty-passport-state";

describe("loyaltyTierMeta", () => {
  it("mappe chaque niveau vers un libellé français", () => {
    expect(loyaltyTierMeta("bronze").label).toBe("Bronze");
    expect(loyaltyTierMeta("silver").label).toBe("Argent");
    expect(loyaltyTierMeta("gold").label).toBe("Or");
  });

  it("l'or utilise la pastille jaune de la DA", () => {
    expect(loyaltyTierMeta("gold").badgeClass).toContain("k-yellow");
  });
});

describe("loyaltyTierProgress", () => {
  const silver = 5;
  const gold = 10;

  it("bronze : jauge du départ vers le seuil argent", () => {
    const p = loyaltyTierProgress(2, silver, gold, "bronze");
    expect(p.nextTier).toBe("silver");
    expect(p.nextThreshold).toBe(5);
    expect(p.remaining).toBe(3);
    expect(p.ratio).toBeCloseTo(2 / 5);
  });

  it("argent : jauge du seuil argent vers le seuil or", () => {
    const p = loyaltyTierProgress(7, silver, gold, "silver");
    expect(p.nextTier).toBe("gold");
    expect(p.remaining).toBe(3);
    expect(p.ratio).toBeCloseTo((7 - 5) / (10 - 5));
  });

  it("or : niveau maximal, jauge pleine, plus rien à parcourir", () => {
    const p = loyaltyTierProgress(14, silver, gold, "gold");
    expect(p.nextTier).toBeNull();
    expect(p.nextThreshold).toBeNull();
    expect(p.remaining).toBe(0);
    expect(p.ratio).toBe(1);
  });

  it("borne le ratio à [0, 1] et n'émet jamais de NaN", () => {
    expect(loyaltyTierProgress(99, silver, gold, "bronze").ratio).toBe(1);
    // Seuils dégénérés (dénominateur nul) : ratio plein plutôt que NaN.
    const degenerate = loyaltyTierProgress(3, 0, 0, "bronze");
    expect(Number.isNaN(degenerate.ratio)).toBe(false);
    expect(degenerate.ratio).toBe(1);
  });
});

describe("loyaltyStampWindow", () => {
  it("remplit les cases jusqu'au compteur, vers le prochain palier", () => {
    const w = loyaltyStampWindow(3, [5, 10]);
    expect(w.windowStart).toBe(0);
    expect(w.windowEnd).toBe(5);
    expect(w.remaining).toBe(2);
    expect(w.cells).toHaveLength(5);
    expect(w.cells.filter((c) => c.filled)).toHaveLength(3);
    expect(w.cells[0]).toEqual({ position: 1, filled: true });
    expect(w.cells[4]).toEqual({ position: 5, filled: false });
  });

  it("après un palier, la fenêtre repart de ce palier vers le suivant", () => {
    const w = loyaltyStampWindow(7, [5, 10]);
    expect(w.windowStart).toBe(5);
    expect(w.windowEnd).toBe(10);
    expect(w.cells).toHaveLength(5);
    // Visites 6 et 7 acquises sur les positions 6..10.
    expect(w.cells.filter((c) => c.filled).map((c) => c.position)).toEqual([6, 7]);
  });

  it("tous les paliers dépassés : fenêtre fermée, sans case", () => {
    const w = loyaltyStampWindow(12, [5, 10]);
    expect(w.windowEnd).toBeNull();
    expect(w.remaining).toBe(0);
    expect(w.cells).toHaveLength(0);
    expect(w.compact).toBe(false);
  });

  it("fenêtre trop large : repli jauge (compact) sans dessiner mille cases", () => {
    const w = loyaltyStampWindow(0, [1000]);
    expect(w.compact).toBe(true);
    expect(w.cells).toHaveLength(0);
    expect(w.windowEnd).toBe(1000);
    expect(w.remaining).toBe(1000);
  });

  it("ignore les doublons et les paliers non positifs", () => {
    const w = loyaltyStampWindow(2, [5, 5, 0, -3]);
    expect(w.windowEnd).toBe(5);
    expect(w.cells).toHaveLength(5);
  });
});

describe("messageForStampState", () => {
  it("stamped → succès", () => {
    expect(messageForStampState("stamped").tone).toBe("success");
  });

  it("invalid_code → erreur explicite", () => {
    const m = messageForStampState("invalid_code");
    expect(m.tone).toBe("error");
    expect(m.title).toMatch(/incorrect/i);
  });

  it("too_soon interpole un délai lisible", () => {
    expect(messageForStampState("too_soon", { retryInSeconds: 7200 }).body).toContain(
      "2 h",
    );
  });

  it("too_soon sans délai reste générique", () => {
    const m = messageForStampState("too_soon", { retryInSeconds: null });
    expect(m.tone).toBe("warning");
    expect(m.body).toBeTruthy();
  });

  it("unavailable reste générique (aucun oracle)", () => {
    expect(messageForStampState("unavailable").tone).toBe("error");
  });
});

describe("messageForSpinBlock", () => {
  it("quota du palier épuisé : ne parle jamais de tour « déjà utilisé »", () => {
    // `out_of_stock` sur un palier `spin` (20260725200000) : AUCUN tour n'a été
    // émis. Le message d'un tour déjà joué serait un contresens.
    const m = messageForSpinBlock("out_of_stock");
    expect(m.title).toMatch(/épuis/i);
    expect(`${m.title} ${m.body}`).not.toMatch(/déjà utilisé/i);
  });

  it("campagne fermée et roue sans lot : le tour est annoncé CONSERVÉ", () => {
    // Les deux refus laissent le grant intact côté base (`unavailable` et
    // `no_prize` sortent sans consommer) : le joueur doit le lire.
    for (const block of ["closed", "no_prize"] as const) {
      expect(messageForSpinBlock(block).body).toMatch(/conserv/i);
    }
  });

  it("échec de l'action : rassure sans évoquer de panne", () => {
    const m = messageForSpinBlock("failed");
    expect(m.body).toMatch(/rien n'est perdu/i);
    expect(m.tone).toBe("warning");
  });

  it("tour déjà joué : ton neutre, aucune promesse de rejeu", () => {
    const m = messageForSpinBlock("consumed");
    expect(m.tone).toBe("info");
    expect(m.body).toBeNull();
  });
});

describe("formatDelay", () => {
  it("choisit l'unité selon l'ordre de grandeur", () => {
    expect(formatDelay(45)).toBe("45 s");
    expect(formatDelay(120)).toBe("2 min");
    expect(formatDelay(7200)).toBe("2 h");
  });

  it("ne renvoie jamais de valeur négative", () => {
    expect(formatDelay(-10)).toBe("0 s");
  });
});
