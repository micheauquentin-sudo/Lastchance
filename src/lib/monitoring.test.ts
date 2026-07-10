import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  startSpan: (_opts: unknown, fn: () => unknown) => fn(),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { monitored, reportError, slowThresholdMs } from "./monitoring";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.SLOW_OPERATION_THRESHOLD_MS;
  vi.restoreAllMocks();
});

describe("slowThresholdMs", () => {
  it("2000ms par défaut", () => {
    expect(slowThresholdMs()).toBe(2000);
  });

  it("configurable via SLOW_OPERATION_THRESHOLD_MS", () => {
    process.env.SLOW_OPERATION_THRESHOLD_MS = "500";
    expect(slowThresholdMs()).toBe(500);
  });

  it("ignore les valeurs invalides", () => {
    process.env.SLOW_OPERATION_THRESHOLD_MS = "abc";
    expect(slowThresholdMs()).toBe(2000);
    process.env.SLOW_OPERATION_THRESHOLD_MS = "-5";
    expect(slowThresholdMs()).toBe(2000);
  });
});

describe("monitored", () => {
  it("renvoie le résultat de l'opération", async () => {
    expect(await monitored("op", async () => 42)).toBe(42);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("propage les erreurs", async () => {
    await expect(
      monitored("op", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("signale une opération lente", async () => {
    process.env.SLOW_OPERATION_THRESHOLD_MS = "1";
    await monitored("op-lente", async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(console.warn).toHaveBeenCalledOnce();
    expect(captureMessage).toHaveBeenCalledWith(
      "Opération lente : op-lente",
      expect.objectContaining({ level: "warning" }),
    );
  });
});

describe("reportError", () => {
  it("journalise et remonte l'erreur à Sentry", () => {
    const err = new Error("boom");
    reportError("scope.test", err);
    expect(console.error).toHaveBeenCalledWith("[scope.test]", err);
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { scope: "scope.test" },
    });
  });
});
