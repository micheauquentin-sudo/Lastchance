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

  it("le seau de scan de chasse par IP tolère un Wi-Fi partagé (mall/festival)", () => {
    // Recalibré à 200/600 s : un NAT public (mall, festival) porte plusieurs
    // dizaines de joueurs à ~4 scans/10 min sans épuiser le budget commun.
    // La sécurité anti-abus repose sur le seau par cookie + l'entropie des
    // jetons, pas sur ce plafond réseau (cf. pronoPredictIp, scanIp).
    expect(RATE_LIMITS.huntScanIp).toEqual({ limit: 200, windowSeconds: 600 });
    // Le seau par cookie reste bien plus strict que le plafond réseau.
    expect(RATE_LIMITS.huntScanPlayer.limit).toBeLessThan(
      RATE_LIMITS.huntScanIp.limit,
    );
  });
});
