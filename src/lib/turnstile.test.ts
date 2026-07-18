import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileEnabled, turnstileRequired, verifyTurnstile } from "./turnstile";

const KEY = "TURNSTILE_SECRET_KEY";
const REQUIRED = "TURNSTILE_REQUIRED";
const ALLOWED_HOSTS = "TURNSTILE_ALLOWED_HOSTS";

afterEach(() => {
  delete process.env[KEY];
  delete process.env[REQUIRED];
  delete process.env[ALLOWED_HOSTS];
  vi.restoreAllMocks();
});

describe("turnstileRequired", () => {
  it("respecte l'activation explicite hors production", () => {
    process.env[REQUIRED] = "true";
    expect(turnstileRequired()).toBe(true);
  });

  it("bloque sans secret lorsque la protection est obligatoire", async () => {
    process.env[REQUIRED] = "true";
    delete process.env[KEY];
    expect(await verifyTurnstile(undefined)).toBe(false);
  });
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

  it("vérifie l'action attendue pour chaque parcours", async () => {
    process.env[KEY] = "secret";
    process.env[ALLOWED_HOSTS] = "localhost";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        success: true,
        action: "prono-register",
        hostname: "localhost",
      }),
    } as Response);

    expect(await verifyTurnstile("token", "127.0.0.1", "prono-register")).toBe(true);
    expect(await verifyTurnstile("token", "127.0.0.1", "play")).toBe(false);
  });

  it("refuse un jeton anormalement volumineux sans appel réseau", async () => {
    process.env[KEY] = "secret";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await verifyTurnstile("x".repeat(2049))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
