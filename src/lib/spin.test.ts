import { describe, expect, it } from "vitest";
import {
  computePlayerKey,
  drawPrizeWithStock,
  pickWeightedIndex,
  playWindowStart,
  signClaimToken,
  verifyClaimToken,
  type DrawablePrize,
} from "./spin";

describe("pickWeightedIndex", () => {
  const items = [{ weight: 40 }, { weight: 20 }, { weight: 10 }, { weight: 30 }];

  it("respecte les bornes des poids", () => {
    // total = 100 ; cumuls : [0,40) → 0, [40,60) → 1, [60,70) → 2, [70,100) → 3
    expect(pickWeightedIndex(items, 0)).toBe(0);
    expect(pickWeightedIndex(items, 0.399)).toBe(0);
    expect(pickWeightedIndex(items, 0.4)).toBe(1);
    expect(pickWeightedIndex(items, 0.599)).toBe(1);
    expect(pickWeightedIndex(items, 0.6)).toBe(2);
    expect(pickWeightedIndex(items, 0.7)).toBe(3);
    expect(pickWeightedIndex(items, 0.999999)).toBe(3);
  });

  it("ignore les poids nuls et les stocks épuisés", () => {
    const withEmpty = [
      { weight: 0 },
      { weight: 10, outOfStock: true },
      { weight: 5 },
    ];
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickWeightedIndex(withEmpty, r)).toBe(2);
    }
  });

  it("retourne -1 si rien n'est tirable", () => {
    expect(pickWeightedIndex([], 0.5)).toBe(-1);
    expect(pickWeightedIndex([{ weight: 0 }], 0.5)).toBe(-1);
    expect(pickWeightedIndex([{ weight: 10, outOfStock: true }], 0.5)).toBe(-1);
  });

  it("distribution approximative sur 100k tirages", () => {
    const counts = [0, 0, 0, 0];
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      counts[pickWeightedIndex(items)]++;
    }
    expect(counts[0] / N).toBeGreaterThan(0.38);
    expect(counts[0] / N).toBeLessThan(0.42);
    expect(counts[2] / N).toBeGreaterThan(0.085);
    expect(counts[2] / N).toBeLessThan(0.115);
  });
});

describe("drawPrizeWithStock", () => {
  const prize = (
    id: string,
    weight: number,
    opts: Partial<DrawablePrize> = {},
  ): DrawablePrize => ({ id, weight, is_losing: false, stock: null, ...opts });

  const alwaysReserve = async () => true;
  const neverReserve = async () => false;

  it("retourne l'index du lot tiré et réserve son stock", async () => {
    const prizes = [prize("a", 40), prize("b", 60)];
    const reserved: string[] = [];
    const idx = await drawPrizeWithStock(
      prizes,
      async (id) => {
        reserved.push(id);
        return true;
      },
      () => 0.1, // tombe sur "a"
    );
    expect(idx).toBe(0);
    expect(reserved).toEqual(["a"]);
  });

  it("un lot perdant ne consomme pas de stock", async () => {
    const prizes = [prize("perdu", 100, { is_losing: true })];
    let reserveCalled = false;
    const idx = await drawPrizeWithStock(prizes, async () => {
      reserveCalled = true;
      return true;
    });
    expect(idx).toBe(0);
    expect(reserveCalled).toBe(false);
  });

  it("exclut un lot à stock 0 sans tenter de réservation", async () => {
    const prizes = [prize("vide", 90, { stock: 0 }), prize("ok", 10)];
    const reserved: string[] = [];
    const idx = await drawPrizeWithStock(prizes, async (id) => {
      reserved.push(id);
      return true;
    });
    expect(idx).toBe(1);
    expect(reserved).toEqual(["ok"]);
  });

  it("retire un autre lot si la réservation échoue (course sur le stock)", async () => {
    // "rare" affiche stock 1 mais un joueur concurrent vient de le prendre :
    // la réservation échoue, le tirage doit retomber sur "commun".
    const prizes = [prize("rare", 99, { stock: 1 }), prize("commun", 1)];
    const idx = await drawPrizeWithStock(
      prizes,
      async (id) => id !== "rare",
      () => 0.5, // tombe d'abord sur "rare"
    );
    expect(idx).toBe(1);
  });

  it("retourne -1 quand tout est épuisé", async () => {
    expect(await drawPrizeWithStock([], alwaysReserve)).toBe(-1);
    expect(
      await drawPrizeWithStock([prize("a", 10, { stock: 0 })], alwaysReserve),
    ).toBe(-1);
    expect(
      await drawPrizeWithStock(
        [prize("a", 10), prize("b", 20)],
        neverReserve,
      ),
    ).toBe(-1);
  });

  it("un lot perdant reste tirable même si tous les gagnants sont épuisés", async () => {
    const prizes = [
      prize("gagnant", 80),
      prize("perdu", 20, { is_losing: true }),
    ];
    const idx = await drawPrizeWithStock(prizes, neverReserve);
    expect(idx).toBe(1);
  });
});

describe("playWindowStart", () => {
  // Mercredi 15 janvier 2025, 14:30
  const now = new Date(2025, 0, 15, 14, 30);

  it("unlimited → null", () => {
    expect(playWindowStart("unlimited", now)).toBeNull();
  });

  it("once → epoch", () => {
    expect(playWindowStart("once", now)!.getTime()).toBe(0);
  });

  it("daily → minuit du jour", () => {
    const start = playWindowStart("daily", now)!;
    expect(start.getFullYear()).toBe(2025);
    expect(start.getDate()).toBe(15);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("weekly → lundi 00:00 de la semaine courante", () => {
    const start = playWindowStart("weekly", now)!;
    expect(start.getDay()).toBe(1); // lundi
    expect(start.getDate()).toBe(13); // lundi 13 janvier 2025
    expect(start.getHours()).toBe(0);
  });

  it("weekly depuis un dimanche → lundi précédent", () => {
    const sunday = new Date(2025, 0, 19, 23, 0);
    const start = playWindowStart("weekly", sunday)!;
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(13);
  });

  it("weekly depuis un lundi matin → le même lundi", () => {
    const monday = new Date(2025, 0, 13, 0, 5);
    const start = playWindowStart("weekly", monday)!;
    expect(start.getDate()).toBe(13);
  });
});

describe("claim token", () => {
  it("round-trip sign → verify", () => {
    const token = signClaimToken("spin-123");
    const payload = verifyClaimToken(token);
    expect(payload?.spinId).toBe("spin-123");
  });

  it("rejette un token falsifié", () => {
    const token = signClaimToken("spin-123");
    const [body] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ spinId: "autre-spin", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    const forged = token.replace(body, forgedBody);
    expect(verifyClaimToken(forged)).toBeNull();
  });

  it("rejette une signature invalide", () => {
    const token = signClaimToken("spin-123");
    expect(verifyClaimToken(token.slice(0, -3) + "AAA")).toBeNull();
    expect(verifyClaimToken("nimporte-quoi")).toBeNull();
    expect(verifyClaimToken("")).toBeNull();
  });

  it("rejette un token expiré", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const token = signClaimToken("spin-123", past);
    expect(verifyClaimToken(token)).toBeNull();
    // mais valide si vérifié à l'époque de sa création
    expect(verifyClaimToken(token, past)?.spinId).toBe("spin-123");
  });
});

describe("computePlayerKey", () => {
  it("déterministe et pseudonymisé", () => {
    const a = computePlayerKey("1.2.3.4", "Mozilla/5.0");
    const b = computePlayerKey("1.2.3.4", "Mozilla/5.0");
    const c = computePlayerKey("5.6.7.8", "Mozilla/5.0");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("1.2.3.4");
  });
});
