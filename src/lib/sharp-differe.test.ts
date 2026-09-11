import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chargerSharp — décodeur HEIF/AVIF bloqué", () => {
  it("applique le blocage central une seule fois avant de rendre sharp", () => {
    const source = readFileSync("src/lib/sharp-differe.ts", "utf8");
    const garde = 'sharp.block({ operation: ["VipsForeignLoadHeif"] });';

    expect(source).toContain(garde);
    expect(source.split(garde)).toHaveLength(2);
    expect(source.indexOf(garde)).toBeLessThan(source.indexOf("return sharp;"));
  });
});
