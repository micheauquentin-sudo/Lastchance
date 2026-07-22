import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signLoyaltyCheckin,
  verifyLoyaltyCheckin,
} from "./loyalty-checkin";
import {
  computePlayerKey,
  nextPlayWindowStart,
  pickWeightedIndex,
  playWindowStart,
  signClaimToken,
  verifyClaimToken,
} from "./spin";
import { signInviteToken, verifyInviteToken } from "./team-invite";

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

describe("nextPlayWindowStart", () => {
  // Mercredi 15 janvier 2025, 14:30
  const now = new Date(2025, 0, 15, 14, 30);

  it("unlimited/once → null (pas de compte à rebours)", () => {
    expect(nextPlayWindowStart("unlimited", now)).toBeNull();
    expect(nextPlayWindowStart("once", now)).toBeNull();
  });

  it("daily → minuit du lendemain", () => {
    const next = nextPlayWindowStart("daily", now)!;
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });

  it("weekly → lundi de la semaine suivante", () => {
    const next = nextPlayWindowStart("weekly", now)!;
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20); // lundi 20 janvier 2025
    expect(next.getHours()).toBe(0);
  });

  it("weekly depuis un dimanche → lundi suivant (lendemain)", () => {
    const sunday = new Date(2025, 0, 19, 23, 0);
    const next = nextPlayWindowStart("weekly", sunday)!;
    expect(next.getDate()).toBe(20);
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

  it("rejette un exp trop lointain (jeton mal émis)", () => {
    // Jeton CORRECTEMENT signé mais à échéance 24 h : au-delà de la TTL
    // nominale du claim, il redeviendrait un bearer longue durée.
    const secret = process.env.CLAIM_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const body = Buffer.from(
      JSON.stringify({ spinId: "spin-123", exp: Date.now() + 24 * 3600 * 1000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", secret)
      .update(`claim:${body}`)
      .digest("base64url");
    expect(verifyClaimToken(`${body}.${sig}`)).toBeNull();
  });

  it("borne supérieure : tolère quelques secondes de dérive d'horloge", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    // Jeton signé par une instance en avance de 3 s : accepté (sans marge, il
    // serait refusé pendant toute la durée de la dérive).
    const ahead = signClaimToken("spin-123", new Date(now.getTime() + 3_000));
    expect(verifyClaimToken(ahead, now)?.spinId).toBe("spin-123");
    // Au-delà de la marge (5 s), la borne mord toujours.
    const wayAhead = signClaimToken("spin-123", new Date(now.getTime() + 60_000));
    expect(verifyClaimToken(wayAhead, now)).toBeNull();
  });

  it("accepte l'ancien secret listé dans CLAIM_TOKEN_SECRET_PREVIOUS", () => {
    const previousClaimSecret = process.env.CLAIM_TOKEN_SECRET;
    const previousList = process.env.CLAIM_TOKEN_SECRET_PREVIOUS;
    const previousLegacySecret = process.env.SPIN_TOKEN_SECRET;

    try {
      process.env.SPIN_TOKEN_SECRET = "legacy-secret";
      delete process.env.CLAIM_TOKEN_SECRET;
      delete process.env.CLAIM_TOKEN_SECRET_PREVIOUS;
      const legacyToken = signClaimToken("spin-legacy");

      // Clé dédiée provisionnée SANS rotation déclarée : le secret historique
      // n'est plus implicitement accepté (sinon SPIN_TOKEN_SECRET resterait
      // éternellement valable pour toutes les familles de jetons).
      process.env.CLAIM_TOKEN_SECRET = "new-claim-secret";
      expect(verifyClaimToken(legacyToken)).toBeNull();

      // Chemin de rotation explicite : on liste l'ancien secret.
      process.env.CLAIM_TOKEN_SECRET_PREVIOUS = "legacy-secret";
      expect(verifyClaimToken(legacyToken)?.spinId).toBe("spin-legacy");
    } finally {
      if (previousClaimSecret === undefined) delete process.env.CLAIM_TOKEN_SECRET;
      else process.env.CLAIM_TOKEN_SECRET = previousClaimSecret;
      if (previousList === undefined) delete process.env.CLAIM_TOKEN_SECRET_PREVIOUS;
      else process.env.CLAIM_TOKEN_SECRET_PREVIOUS = previousList;
      if (previousLegacySecret === undefined) delete process.env.SPIN_TOKEN_SECRET;
      else process.env.SPIN_TOKEN_SECRET = previousLegacySecret;
    }
  });
});

// ────────────────────────────────────────────────────────────
// Séparation de domaine entre familles de jetons signés
//
// Toutes les familles partagent le repli SPIN_TOKEN_SECRET tant que leur clé
// dédiée n'est pas provisionnée (c'est le cas en CI). Le préfixe du message
// signé garantit qu'un jeton d'une famille n'est jamais vérifiable par une
// autre, même à secret identique.
// ────────────────────────────────────────────────────────────

describe("séparation de domaine des jetons signés", () => {
  const HASH = "a".repeat(64);
  const PROGRAM = "00000000-0000-4000-8000-000000000001";

  it("un check-in fidélité n'est pas vérifiable comme claim, ni l'inverse", () => {
    const { token: checkin } = signLoyaltyCheckin({
      programId: PROGRAM,
      memberTokenHash: HASH,
    });
    // Le corps du claim et celui du check-in sont structurellement différents ;
    // on vérifie donc la SIGNATURE en réutilisant le corps de l'autre famille.
    const claim = signClaimToken("spin-1");
    const checkinBody = checkin.slice(0, checkin.lastIndexOf("."));
    const claimBody = claim.slice(0, claim.lastIndexOf("."));
    const checkinSig = checkin.slice(checkin.lastIndexOf(".") + 1);
    const claimSig = claim.slice(claim.lastIndexOf(".") + 1);

    // Signatures croisées : rejetées des deux côtés.
    expect(verifyClaimToken(`${claimBody}.${checkinSig}`)).toBeNull();
    expect(verifyLoyaltyCheckin(`${checkinBody}.${claimSig}`)).toBeNull();

    // Un corps signé par la famille invitation ne passe pas non plus.
    const invite = signInviteToken("invitation-1");
    const inviteSig = invite.slice(invite.lastIndexOf(".") + 1);
    expect(verifyClaimToken(`${claimBody}.${inviteSig}`)).toBeNull();
  });

  it("le message signé porte bien le préfixe de sa famille", () => {
    const secret = process.env.CLAIM_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const claim = signClaimToken("spin-1");
    const body = claim.slice(0, claim.lastIndexOf("."));
    const sig = claim.slice(claim.lastIndexOf(".") + 1);

    expect(
      createHmac("sha256", secret).update(`claim:${body}`).digest("base64url"),
    ).toBe(sig);
    // Ancienne forme (corps nu) : plus jamais émise, plus jamais acceptée.
    const legacySig = createHmac("sha256", secret)
      .update(body)
      .digest("base64url");
    expect(verifyClaimToken(`${body}.${legacySig}`)).toBeNull();
  });

  it("invitation d'équipe : la forme legacy reste acceptée en transition", () => {
    const secret =
      process.env.TEAM_INVITE_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const invite = signInviteToken("invitation-1");
    const body = invite.slice(0, invite.lastIndexOf("."));

    // Émission : toujours préfixée.
    expect(invite.slice(invite.lastIndexOf(".") + 1)).toBe(
      createHmac("sha256", secret).update(`invite:${body}`).digest("base64url"),
    );
    // Vérification : les liens déjà partis par email (7 j) restent valides.
    const legacySig = createHmac("sha256", secret)
      .update(body)
      .digest("base64url");
    expect(verifyInviteToken(`${body}.${legacySig}`)?.invitationId).toBe(
      "invitation-1",
    );
  });

  it("invitation d'équipe : borne SUPÉRIEURE sur exp (avec marge d'horloge)", () => {
    const secret =
      process.env.TEAM_INVITE_TOKEN_SECRET ?? process.env.SPIN_TOKEN_SECRET!;
    const forge = (exp: number) => {
      const body = Buffer.from(
        JSON.stringify({ invitationId: "invitation-1", exp }),
      ).toString("base64url");
      const sig = createHmac("sha256", secret)
        .update(`invite:${body}`)
        .digest("base64url");
      return `${body}.${sig}`;
    };
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;

    // Jeton correctement signé mais à échéance 30 j : refusé (l'état en base
    // fait foi, mais un jeton mal émis ne doit pas vivre plus que sa TTL).
    expect(verifyInviteToken(forge(now + 30 * 24 * 3600 * 1000))).toBeNull();
    // Émission normale, y compris depuis une instance en légère avance.
    expect(verifyInviteToken(forge(now + sevenDays + 3_000))?.invitationId).toBe(
      "invitation-1",
    );
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
