import { describe, expect, it } from "vitest";
import { isPublicIpAddress, parseWebhookUrl } from "./webhook-url";

describe("webhook SSRF protection", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.2", "::1", "fd00::1", "::127.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b:1::1", "2001:db8::1", "3fff::1"])(
    "refuse l'adresse non publique %s",
    (ip) => expect(isPublicIpAddress(ip)).toBe(false),
  );

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepte l'adresse publique %s",
    (ip) => expect(isPublicIpAddress(ip)).toBe(true),
  );

  it("refuse HTTP, localhost, les identifiants et les ports alternatifs", () => {
    expect(() => parseWebhookUrl("http://example.com/hook")).toThrow();
    expect(() => parseWebhookUrl("https://localhost/hook")).toThrow();
    expect(() => parseWebhookUrl("https://user:pass@example.com/hook")).toThrow();
    expect(() => parseWebhookUrl("https://example.com:8443/hook")).toThrow();
  });

  it("accepte une URL HTTPS publique syntaxiquement sûre", () => {
    expect(parseWebhookUrl("https://hooks.example.com/lastchance").hostname).toBe("hooks.example.com");
  });
});
