import { afterEach, describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "./request-ip";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_PROVIDER;
    delete process.env.VERCEL;
  });

  it("préfère l'en-tête Cloudflare vérifié", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "cloudflare";
    expect(clientIpFromHeaders(headers({
      "cf-connecting-ip": "203.0.113.4",
      "x-forwarded-for": "1.2.3.4",
    }))).toBe("203.0.113.4");
  });

  it("utilise le proxy le plus proche dans X-Forwarded-For", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";
    expect(clientIpFromHeaders(headers({
      "x-forwarded-for": "1.2.3.4, 198.51.100.8",
    }))).toBe("198.51.100.8");
  });

  it("ignore les valeurs invalides", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";
    expect(clientIpFromHeaders(headers({ "x-real-ip": "invalide" }))).toBe("unknown");
  });

  it("ignore les en-têtes forgeables sans proxy déclaré", () => {
    expect(clientIpFromHeaders(headers({
      "x-real-ip": "203.0.113.8",
      "x-forwarded-for": "203.0.113.9",
    }))).toBe("unknown");
  });
});
