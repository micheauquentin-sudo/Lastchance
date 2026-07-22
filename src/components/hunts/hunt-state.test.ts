import { describe, expect, it } from "vitest";
import {
  huntProgressLabel,
  huntStampCells,
  isHuntComplete,
  messageForScanState,
} from "./hunt-state";

describe("messageForScanState", () => {
  it("scanned → succès", () => {
    const m = messageForScanState("scanned");
    expect(m.tone).toBe("success");
    expect(m.title).toMatch(/validé/i);
  });

  it("already → info sans erreur", () => {
    expect(messageForScanState("already").tone).toBe("info");
  });

  it("too_soon interpole les secondes (singulier/pluriel)", () => {
    expect(messageForScanState("too_soon", { retryInSeconds: 1 }).body).toContain(
      "1 seconde",
    );
    expect(messageForScanState("too_soon", { retryInSeconds: 12 }).body).toContain(
      "12 secondes",
    );
  });

  it("too_soon sans délai reste générique", () => {
    const m = messageForScanState("too_soon", { retryInSeconds: null });
    expect(m.tone).toBe("warning");
    expect(m.body).toMatch(/quelques secondes/i);
  });

  it("wrong_order ne divulgue que le numéro de l'étape attendue", () => {
    const m = messageForScanState("wrong_order", { expectedPosition: 3 });
    expect(m.body).toContain("étape 3");
  });

  it("wrong_order sans position reste vague", () => {
    expect(messageForScanState("wrong_order", {}).body).toMatch(/précédente/i);
  });

  it("hunt_full et unavailable sont des erreurs", () => {
    expect(messageForScanState("hunt_full").tone).toBe("error");
    expect(messageForScanState("unavailable").tone).toBe("error");
  });

  it("completed → succès", () => {
    expect(messageForScanState("completed").tone).toBe("success");
  });
});

describe("huntProgressLabel", () => {
  it("formate X / Y", () => {
    expect(huntProgressLabel(2, 5)).toBe("2 / 5");
  });

  it("borne done dans [0, total]", () => {
    expect(huntProgressLabel(9, 5)).toBe("5 / 5");
    expect(huntProgressLabel(-3, 5)).toBe("0 / 5");
  });
});

describe("isHuntComplete", () => {
  it("vrai quand toutes les étapes sont tamponnées", () => {
    expect(isHuntComplete(5, 5)).toBe(true);
    expect(isHuntComplete(6, 5)).toBe(true);
  });

  it("faux si incomplet ou chasse vide", () => {
    expect(isHuntComplete(4, 5)).toBe(false);
    expect(isHuntComplete(0, 0)).toBe(false);
  });
});

describe("huntStampCells", () => {
  it("marque pleines les positions tamponnées", () => {
    const cells = huntStampCells(3, [1, 3]);
    expect(cells).toEqual([
      { position: 1, filled: true },
      { position: 2, filled: false },
      { position: 3, filled: true },
    ]);
  });

  it("ignore les positions hors bornes et gère le vide", () => {
    expect(huntStampCells(2, [5])).toEqual([
      { position: 1, filled: false },
      { position: 2, filled: false },
    ]);
    expect(huntStampCells(0, [])).toEqual([]);
  });
});
