import { describe, expect, it } from "vitest";
import { RATE_LIMITS, rateLimitBucket } from "./rate-limit";

describe("rateLimitBucket", () => {
  it("assemble les parties avec un séparateur stable", () => {
    expect(rateLimitBucket("spin", "wheel-1", "abc")).toBe("spin:wheel-1:abc");
  });

  it("sérialise les nombres", () => {
    expect(rateLimitBucket("ip", 42)).toBe("ip:42");
  });

  it("des empreintes différentes produisent des seaux différents", () => {
    const a = rateLimitBucket("spin", "wheel-1", "player-a");
    const b = rateLimitBucket("spin", "wheel-1", "player-b");
    expect(a).not.toBe(b);
  });
});

describe("RATE_LIMITS — cohérence des règles", () => {
  it("toutes les règles ont des bornes strictement positives", () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThanOrEqual(1);
      expect(rule.windowSeconds, name).toBeGreaterThanOrEqual(1);
    }
  });

  it("le seau anti-course (burst) est plus strict que le débit soutenu", () => {
    expect(RATE_LIMITS.spinBurst.limit).toBeLessThanOrEqual(
      RATE_LIMITS.spin.limit,
    );
  });
});
