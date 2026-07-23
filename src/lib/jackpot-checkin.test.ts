import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  JACKPOT_CHECKIN_TTL_MS,
  signJackpotCheckin,
  verifyJackpotCheckin,
} from "./jackpot-checkin";

/**
 * Forge un jeton VALIDEMENT signé à partir d'un payload arbitraire (miroir
 * exact de la production : préfixe de famille `jackpot-checkin:` + repli
 * SPIN_TOKEN_SECRET quand la clé dédiée n'est pas provisionnée).
 */
function signWithRealSecret(payload: Record<string, unknown>): string {
  const secret =
    process.env.JACKPOT_CHECKIN_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`jackpot-checkin:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

// ────────────────────────────────────────────────────────────
// Jeton de check-in du jackpot : signé HMAC, TTL très court. Le QR présenté au
// comptoir ne porte QUE ce jeton — jamais la valeur du cookie joueur.
// ────────────────────────────────────────────────────────────

const CAMPAIGN = "00000000-0000-4000-8000-000000000001";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);

describe("signJackpotCheckin / verifyJackpotCheckin", () => {
  it("un jeton fraîchement signé se vérifie et rend son payload", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const { token, expiresAt } = signJackpotCheckin(
      { campaignId: CAMPAIGN, playerTokenHash: HASH },
      now,
    );

    expect(expiresAt).toBe(now.getTime() + JACKPOT_CHECKIN_TTL_MS);
    const payload = verifyJackpotCheckin(token, now);
    expect(payload).not.toBeNull();
    expect(payload!.campaignId).toBe(CAMPAIGN);
    expect(payload!.playerTokenHash).toBe(HASH);
    expect(payload!.exp).toBe(expiresAt);
  });

  it("TTL court : ~3 min, et le jeton devient inerte après expiration", () => {
    expect(JACKPOT_CHECKIN_TTL_MS).toBe(3 * 60 * 1000);

    const now = new Date("2026-07-26T10:00:00Z");
    const { token } = signJackpotCheckin(
      { campaignId: CAMPAIGN, playerTokenHash: HASH },
      now,
    );

    expect(
      verifyJackpotCheckin(token, new Date(now.getTime() + JACKPOT_CHECKIN_TTL_MS - 1000)),
    ).not.toBeNull();
    expect(
      verifyJackpotCheckin(token, new Date(now.getTime() + JACKPOT_CHECKIN_TTL_MS + 1000)),
    ).toBeNull();
  });

  it("borne SUPÉRIEURE : un exp au-delà de la TTL est refusé", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const farToken = signWithRealSecret({
      campaignId: CAMPAIGN,
      playerTokenHash: HASH,
      exp: now.getTime() + 24 * 60 * 60 * 1000,
    });
    expect(verifyJackpotCheckin(farToken, now)).toBeNull();
  });

  it("SÉPARATION DE DOMAINE : un jeton d'une autre famille ne se vérifie pas", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    // Même corps, mais signé avec le préfixe de la fidélité : rejeté ici, même
    // quand les deux familles partagent le repli SPIN_TOKEN_SECRET.
    const secret =
      process.env.JACKPOT_CHECKIN_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const body = Buffer.from(
      JSON.stringify({
        campaignId: CAMPAIGN,
        playerTokenHash: HASH,
        exp: now.getTime() + JACKPOT_CHECKIN_TTL_MS,
      }),
    ).toString("base64url");
    const loyaltySig = createHmac("sha256", secret)
      .update(`loyalty-checkin:${body}`)
      .digest("base64url");
    expect(verifyJackpotCheckin(`${body}.${loyaltySig}`, now)).toBeNull();
  });

  it("la campagne est portée par le payload signé (réécrire le corps invalide la signature)", () => {
    const { token } = signJackpotCheckin({ campaignId: CAMPAIGN, playerTokenHash: HASH });
    const body = Buffer.from(
      JSON.stringify({
        campaignId: OTHER_CAMPAIGN,
        playerTokenHash: HASH,
        exp: Date.now() + JACKPOT_CHECKIN_TTL_MS,
      }),
    ).toString("base64url");
    const forged = `${body}.${token.slice(token.lastIndexOf(".") + 1)}`;
    expect(verifyJackpotCheckin(forged)).toBeNull();
  });

  it("signature forgée, jeton tronqué ou malformé : rejet propre", () => {
    const { token } = signJackpotCheckin({ campaignId: CAMPAIGN, playerTokenHash: HASH });
    const body = token.slice(0, token.lastIndexOf("."));

    expect(verifyJackpotCheckin(`${body}.signature-bidon`)).toBeNull();
    expect(verifyJackpotCheckin(body)).toBeNull();
    expect(verifyJackpotCheckin("")).toBeNull();
    expect(verifyJackpotCheckin(".")).toBeNull();
    expect(verifyJackpotCheckin("bm9wZQ.x")).toBeNull();
  });

  it("un hash de joueur malformé dans le payload est refusé", () => {
    const { token } = signJackpotCheckin({
      campaignId: CAMPAIGN,
      playerTokenHash: "pas-un-hash",
    });
    expect(verifyJackpotCheckin(token)).toBeNull();
  });

  it("le jeton ne contient jamais le jeton d'identité du joueur", () => {
    const cookieToken = "s3cr3t-cookie-du-joueur";
    const { token } = signJackpotCheckin({ campaignId: CAMPAIGN, playerTokenHash: HASH });
    expect(token).not.toContain(cookieToken);
    const decoded = Buffer.from(
      token.slice(0, token.lastIndexOf(".")),
      "base64url",
    ).toString();
    expect(JSON.parse(decoded)).toEqual({
      campaignId: CAMPAIGN,
      playerTokenHash: HASH,
      exp: expect.any(Number),
    });
  });
});
