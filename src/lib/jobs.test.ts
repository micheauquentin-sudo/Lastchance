// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backoffMinutes } from "./jobs";

describe("backoffMinutes — délais entre tentatives", () => {
  it("progresse 1, 5, 15, 60 minutes puis plafonne", () => {
    expect(backoffMinutes(1)).toBe(1);
    expect(backoffMinutes(2)).toBe(5);
    expect(backoffMinutes(3)).toBe(15);
    expect(backoffMinutes(4)).toBe(60);
    expect(backoffMinutes(5)).toBe(60);
    expect(backoffMinutes(12)).toBe(60);
  });

  it("tolère un compteur incohérent (0, négatif)", () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(-3)).toBe(1);
  });
});
