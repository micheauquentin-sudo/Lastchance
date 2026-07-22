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

  it("fidélité : les compteurs de clé PARTAGÉE sont des seuils d'alerte, pas des portes", () => {
    // Aucun seau de CRÉATION fail-closed ne subsiste : les verrous économiques
    // (stock fini, palier >= visite 2) rendent une identité fabriquée sans
    // valeur, et un seau fail-closed sur clé partagée n'était plus qu'un
    // interrupteur (« déni d'inscription d'un programme entier »).
    expect(RATE_LIMITS).not.toHaveProperty("loyaltyPassportCreateIp");
    expect(RATE_LIMITS).not.toHaveProperty("loyaltyPassportCreateProgram");
    expect(RATE_LIMITS).not.toHaveProperty("loyaltyStampCodeNoviceProgram");

    // Les compteurs restants sur clé partagée sont larges : le dépassement
    // signale, il ne refuse pas (cf. observeSharedKey dans actions/loyalty.ts).
    expect(RATE_LIMITS.loyaltyStampIp).toEqual({ limit: 1200, windowSeconds: 600 });
    expect(RATE_LIMITS.loyaltyPassportCreationBurst).toEqual({
      limit: 60,
      windowSeconds: 600,
    });
  });

  it("fidélité : le seau d'évaluation de code par PASSEPORT reste le plus serré", () => {
    // Seule clé où `failClosed` est admis dans le parcours public : elle
    // n'appartient qu'à un porteur, la saturer ne coupe que lui.
    expect(RATE_LIMITS.loyaltyStampCodeMember).toEqual({
      limit: 6,
      windowSeconds: 300,
    });
    const perSecond =
      RATE_LIMITS.loyaltyStampCodeMember.limit /
      RATE_LIMITS.loyaltyStampCodeMember.windowSeconds;
    expect(perSecond).toBeLessThan(
      RATE_LIMITS.loyaltyStampIp.limit / RATE_LIMITS.loyaltyStampIp.windowSeconds,
    );
  });

  it("fidélité : les compteurs de caisse sont jumeaux (ratio nouveaux/connus)", () => {
    // Même fenêtre et même limite : c'est le RAPPORT entre les deux clés qui
    // fait signal pour l'exploitant.
    expect(RATE_LIMITS.loyaltyStaffPassportCreation).toEqual(
      RATE_LIMITS.loyaltyStaffKnownVisit,
    );
    // Calibrage généreux : une caisse bridée est une caisse en panne, le débit
    // du poste reste borné par `cashier` (fail-closed, même clé d'opérateur).
    expect(RATE_LIMITS.loyaltyStaffPassportCreation.limit).toBeGreaterThanOrEqual(
      100,
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
