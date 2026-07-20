// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { normalizeRedeemCode } from "./utils";

/**
 * Verrouille le repli jsQR du scanner de caisse (chemin Safari/Firefox
 * et Chrome sans service de détection) : un QR généré par la même lib
 * que les écrans de gain doit se décoder en pixels bruts, et le code lu
 * doit se normaliser tel quel.
 */
describe("décodage QR (repli jsQR du scanner)", () => {
  it("décode un QR de code de gain et le normalise à l'identique", async () => {
    const code = "GAIN-E2ETEST2";
    const png = PNG.sync.read(
      await QRCode.toBuffer(code, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      }),
    );

    const hit = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, {
      inversionAttempts: "dontInvert",
    });

    expect(hit).not.toBeNull();
    expect(hit!.data).toBe(code);
    expect(normalizeRedeemCode(hit!.data)).toBe(code);
  });

  it("reste muet sur une image sans QR (pas de faux positif)", () => {
    const blank = new Uint8ClampedArray(360 * 360 * 4).fill(255);
    expect(jsQR(blank, 360, 360)).toBeNull();
  });
});
