import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LOYALTY_CHECKIN_TTL_MS,
  signLoyaltyCheckin,
  verifyLoyaltyCheckin,
} from "./loyalty-checkin";

/**
 * Forge un jeton VALIDEMENT signé à partir d'un payload arbitraire (miroir
 * exact de la production : préfixe de famille + repli SPIN_TOKEN_SECRET quand
 * la clé dédiée n'est pas provisionnée, cf. lib/token-secrets.ts).
 */
function signWithRealSecret(payload: Record<string, unknown>): string {
  const secret =
    process.env.LOYALTY_CHECKIN_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`loyalty-checkin:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

// ────────────────────────────────────────────────────────────
// Jeton de check-in du passeport : signé HMAC, TTL très court.
// Le QR présenté au comptoir ne porte QUE ce jeton — jamais la valeur du
// cookie passeport (bearer 180 j).
// ────────────────────────────────────────────────────────────

const PROGRAM = "00000000-0000-4000-8000-000000000001";
const OTHER_PROGRAM = "00000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);

describe("signLoyaltyCheckin / verifyLoyaltyCheckin", () => {
  it("un jeton fraîchement signé se vérifie et rend son payload", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    const { token, expiresAt } = signLoyaltyCheckin(
      { programId: PROGRAM, memberTokenHash: HASH },
      now,
    );

    expect(expiresAt).toBe(now.getTime() + LOYALTY_CHECKIN_TTL_MS);
    const payload = verifyLoyaltyCheckin(token, now);
    expect(payload).not.toBeNull();
    expect(payload!.programId).toBe(PROGRAM);
    expect(payload!.memberTokenHash).toBe(HASH);
    expect(payload!.exp).toBe(expiresAt);
  });

  it("TTL court : ~3 min, et le jeton devient inerte après expiration", () => {
    expect(LOYALTY_CHECKIN_TTL_MS).toBe(3 * 60 * 1000);

    const now = new Date("2026-07-22T10:00:00Z");
    const { token } = signLoyaltyCheckin(
      { programId: PROGRAM, memberTokenHash: HASH },
      now,
    );

    // Une seconde avant l'échéance : encore valide.
    expect(
      verifyLoyaltyCheckin(token, new Date(now.getTime() + LOYALTY_CHECKIN_TTL_MS - 1000)),
    ).not.toBeNull();
    // Après : un QR photographié ne vaut plus rien.
    expect(
      verifyLoyaltyCheckin(token, new Date(now.getTime() + LOYALTY_CHECKIN_TTL_MS + 1000)),
    ).toBeNull();
  });

  it("borne SUPÉRIEURE : un exp au-delà de la TTL est refusé", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    // Jeton CORRECTEMENT signé mais à échéance 24 h (bug d'émission, horloge
    // folle) : il redeviendrait un bearer longue durée.
    const farToken = signWithRealSecret({
      programId: PROGRAM,
      memberTokenHash: HASH,
      exp: now.getTime() + 24 * 60 * 60 * 1000,
    });
    expect(verifyLoyaltyCheckin(farToken, now)).toBeNull();

    // La borne est inclusive : exp = now + TTL reste valide.
    const legit = signLoyaltyCheckin(
      { programId: PROGRAM, memberTokenHash: HASH },
      now,
    ).token;
    expect(verifyLoyaltyCheckin(legit, now)).not.toBeNull();
  });

  it("borne supérieure : tolère quelques secondes de dérive d'horloge", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    // Jeton émis par une instance en avance de 3 s : la vérification doit
    // l'accepter (sinon il serait refusé pendant toute la durée de la dérive).
    const ahead = signLoyaltyCheckin(
      { programId: PROGRAM, memberTokenHash: HASH },
      new Date(now.getTime() + 3_000),
    ).token;
    expect(verifyLoyaltyCheckin(ahead, now)).not.toBeNull();

    // Au-delà de la marge (5 s), la borne mord toujours.
    const wayAhead = signLoyaltyCheckin(
      { programId: PROGRAM, memberTokenHash: HASH },
      new Date(now.getTime() + 30_000),
    ).token;
    expect(verifyLoyaltyCheckin(wayAhead, now)).toBeNull();
  });

  it("le programme est porté par le payload signé (non falsifiable)", () => {
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM,
      memberTokenHash: HASH,
    });
    // L'appelant compare programId au programme visé : un jeton d'un autre
    // programme ne peut pas être rejoué ici.
    expect(verifyLoyaltyCheckin(token)!.programId).not.toBe(OTHER_PROGRAM);

    // Réécrire le corps invalide la signature.
    const body = Buffer.from(
      JSON.stringify({
        programId: OTHER_PROGRAM,
        memberTokenHash: HASH,
        exp: Date.now() + LOYALTY_CHECKIN_TTL_MS,
      }),
    ).toString("base64url");
    const forged = `${body}.${token.slice(token.lastIndexOf(".") + 1)}`;
    expect(verifyLoyaltyCheckin(forged)).toBeNull();
  });

  it("signature forgée, jeton tronqué ou malformé : rejet", () => {
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM,
      memberTokenHash: HASH,
    });
    const body = token.slice(0, token.lastIndexOf("."));

    expect(verifyLoyaltyCheckin(`${body}.signature-bidon`)).toBeNull();
    expect(verifyLoyaltyCheckin(body)).toBeNull();
    expect(verifyLoyaltyCheckin("")).toBeNull();
    expect(verifyLoyaltyCheckin(".")).toBeNull();
    expect(verifyLoyaltyCheckin("pas-un-jeton")).toBeNull();
    // Corps non JSON mais signature cohérente : rejet propre (pas d'exception).
    expect(verifyLoyaltyCheckin("bm9wZQ.x")).toBeNull();
  });

  it("un hash de passeport malformé dans le payload est refusé", () => {
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM,
      memberTokenHash: "pas-un-hash",
    });
    // Signature valide mais payload hors format (miroir du CHECK SQL sur
    // loyalty_members.token_hash) : la RPC ne doit jamais le recevoir.
    expect(verifyLoyaltyCheckin(token)).toBeNull();
  });

  it("le jeton ne contient jamais le jeton d'identité du passeport", () => {
    const cookieToken = "s3cr3t-cookie-du-passeport";
    const { token } = signLoyaltyCheckin({
      programId: PROGRAM,
      memberTokenHash: HASH,
    });
    expect(token).not.toContain(cookieToken);
    const decoded = Buffer.from(
      token.slice(0, token.lastIndexOf(".")),
      "base64url",
    ).toString();
    expect(decoded).not.toContain(cookieToken);
    expect(JSON.parse(decoded)).toEqual({
      programId: PROGRAM,
      memberTokenHash: HASH,
      exp: expect.any(Number),
    });
  });
});
