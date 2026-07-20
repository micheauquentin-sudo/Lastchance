import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./security-headers";

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
