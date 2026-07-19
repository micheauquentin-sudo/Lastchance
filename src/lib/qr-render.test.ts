// @vitest-environment node
import { describe, expect, it } from "vitest";
import { QR_PRESETS, contrastRatio, isScannable, resolveQrStyle } from "./qr-render";
import type { QrEyeStyle, QrPattern } from "@/types/database";

const patterns: QrPattern[] = [
  "square", "rounded", "dots", "diamond",
  "fluid", "lines-h", "lines-v", "classy",
];
const eyes: QrEyeStyle[] = ["square", "rounded", "circle", "leaf"];

describe("styles QR", () => {
  it("résout les 32 couples motif × yeux sans perdre leur configuration", () => {
    for (const pattern of patterns) {
      for (const eyeStyle of eyes) {
        const resolved = resolveQrStyle({ pattern, eyeStyle });
        expect(resolved.pattern).toBe(pattern);
        expect(resolved.eyeStyle).toBe(eyeStyle);
        expect(isScannable(resolved), `${pattern}/${eyeStyle}`).toBe(true);
      }
    }
  });

  it("tous les préréglages gardent un contraste scannable", () => {
    for (const preset of QR_PRESETS) {
      expect(isScannable(preset.style), preset.key).toBe(true);
    }
  });

  it("rejette les couleurs trop proches et conserve une zone sombre lisible", () => {
    expect(contrastRatio("#18181b", "#ffffff")).toBeGreaterThan(15);
    expect(isScannable({ dark: "#eeeeee", light: "#ffffff" })).toBe(false);
  });
});
