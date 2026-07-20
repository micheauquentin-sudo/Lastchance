import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
} from "./security-headers";

describe("Content Security Policy", () => {
  it("retire unsafe-inline des scripts avec un nonce", () => {
    const policy = buildContentSecurityPolicy("nonce-test");
    const script = policy.split("; ").find((directive) => directive.startsWith("script-src"));
    expect(script).toContain("'nonce-nonce-test'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("conserve une politique statique compatible avec l'ISR public", () => {
    expect(buildContentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("autorise la compilation WebAssembly (décodeur meshopt de la mascotte)", () => {
    for (const policy of [buildContentSecurityPolicy(), buildContentSecurityPolicy("n")]) {
      const script = policy.split("; ").find((d) => d.startsWith("script-src"));
      expect(script).toContain("'wasm-unsafe-eval'");
    }
  });
});

describe("Permissions-Policy", () => {
  it("autorise la caméra sur notre origine (scanner de QR en caisse)", () => {
    // Régression : camera=() bloquait getUserMedia en production et le
    // scanner échouait après accord de l'utilisateur.
    expect(buildPermissionsPolicy()).toContain("camera=(self)");
  });

  it("interdit tout le reste, iframes comprises", () => {
    const policy = buildPermissionsPolicy();
    for (const feature of [
      "microphone", "geolocation", "payment", "usb",
      "magnetometer", "gyroscope", "accelerometer", "browsing-topics",
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
    // Une seule directive caméra, et jamais en libre accès.
    expect(policy).not.toContain("camera=()");
    expect(policy).not.toContain("camera=*");
  });
});
