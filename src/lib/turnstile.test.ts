import { afterEach, describe, expect, it } from "vitest";
import { turnstileEnabled, verifyTurnstile } from "./turnstile";

const KEY = "TURNSTILE_SECRET_KEY";

afterEach(() => {
  delete process.env[KEY];
});

describe("turnstileEnabled", () => {
  it("désactivé sans clé secrète", () => {
    delete process.env[KEY];
    expect(turnstileEnabled()).toBe(false);
  });

  it("activé avec clé secrète", () => {
    process.env[KEY] = "secret";
    expect(turnstileEnabled()).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  it("accepte tout quand la protection est désactivée (pas de clé)", async () => {
    delete process.env[KEY];
    expect(await verifyTurnstile(undefined)).toBe(true);
    expect(await verifyTurnstile("nimporte-quoi")).toBe(true);
  });

  it("refuse un jeton absent quand la protection est activée", async () => {
    process.env[KEY] = "secret";
    // Aucun appel réseau : court-circuité sur jeton manquant.
    expect(await verifyTurnstile(undefined)).toBe(false);
    expect(await verifyTurnstile("")).toBe(false);
    expect(await verifyTurnstile(null)).toBe(false);
  });
});
