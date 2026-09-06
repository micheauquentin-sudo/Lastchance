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

  /* ────────────────────────────────────────────────────────────
   * AUCUNE MISDELIVERY MUETTE SUR LE PORT
   *
   * Un audit a signalé le `port: 443` en dur de `postSafeWebhook` comme
   * pouvant détourner un `https://host:8443/hook` vers 443 sans rien dire.
   * MESURE FAITE : le cas n'existe pas — `parseWebhookUrl`, appelé par
   * `postSafeWebhook` avant tout envoi comme par l'enregistrement, refuse
   * l'URL. Le port explicite ne parvient jamais à la couche transport.
   *
   * Le `443` en dur n'en restait pas moins une SECONDE source de vérité :
   * assouplir la garde de parsing aurait silencieusement fait partir la
   * livraison au mauvais endroit. Il est désormais dérivé de l'URL. Ces deux
   * tests gardent l'invariant des deux côtés — le refus, et le fait que la
   * seule valeur qui puisse en sortir aujourd'hui est vide (donc 443).
   * ──────────────────────────────────────────────────────────── */
  it("un port explicite est REFUSÉ, pas silencieusement réécrit en 443", () => {
    expect(() => parseWebhookUrl("https://hooks.example.com:8443/hook")).toThrow(
      /port/i,
    );
    // 443 écrit à la main reste accepté et se normalise en port vide.
    expect(parseWebhookUrl("https://hooks.example.com:443/hook").port).toBe("");
  });

  it("une URL acceptée ne porte jamais de port à transporter", () => {
    // C'est CETTE propriété qui rend `port: url.port || 443` équivalent au
    // `443` en dur qu'il remplace, aujourd'hui et tant que la garde tient.
    for (const valeur of [
      "https://hooks.example.com/lastchance",
      "https://hooks.example.com:443/lastchance",
      "https://8.8.8.8/lastchance",
    ]) {
      expect(parseWebhookUrl(valeur).port).toBe("");
    }
  });
});
