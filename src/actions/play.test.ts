import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// claimPrize — ORDRE DES GARDES et DÉPARTAGE DES SEAUX
//
// Régression fermée ici : le claim se terminait sur `claim:ip`, un seau
// `failClosed` porté par l'IP SEULE, à portée PLATEFORME (toutes organisations
// confondues) et consommé AVANT la vérification du jeton. Deux conséquences,
// toutes deux subies par des joueurs légitimes :
//   · un tiers derrière le même CGNAT / Wi-Fi de commerce épuisait le budget et
//     empêchait les autres d'encaisser leur lot ;
//   · un abus visant UNE organisation coupait les joueurs de TOUTES les autres.
//
// PRINCIPE appliqué (identique au parcours de fidélité) : dans un parcours
// PUBLIC, aucune clé PARTAGÉE entre utilisateurs ne porte de seau fail-closed —
// elle ne porte qu'un compteur LARGE et fail-OPEN, à valeur d'observabilité. Le
// `failClosed` n'est admis que sur une clé propre à UNE identité, ici le
// `spin_id` extrait du jeton de claim VÉRIFIÉ. Et aucun seau n'est consommé
// avant la garde qui identifie l'appelant.
//
// Ce chemin est PARTAGÉ : la roue publique et le tour offert du passeport de
// fidélité appellent tous deux `claimPrize` avec un jeton signé par
// `signClaimToken` (le module @/lib/spin n'est donc PAS mocké : les tests
// signent et vérifient de vrais jetons HMAC).
// ────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const CAMPAIGN_ID = "campaign-1";
const WHEEL_ID = "wheel-1";
const PRIZE_ID = "prize-1";
const SPIN_ID = "11111111-1111-4111-8111-111111111111";
/** Second gain, tiré par un AUTRE joueur : sert à prouver l'isolement. */
const OTHER_SPIN_ID = "22222222-2222-4222-8222-222222222222";

const { state, makeAdmin } = vi.hoisted(() => {
  interface SpinRow {
    id: string;
    organization_id: string;
    campaign_id: string;
    wheel_id: string;
    prize_id: string | null;
    is_losing: boolean;
    claimed: boolean;
  }

  const makeSpin = (id: string): SpinRow => ({
    id,
    organization_id: ORG_ID,
    campaign_id: CAMPAIGN_ID,
    wheel_id: WHEEL_ID,
    prize_id: PRIZE_ID,
    is_losing: false,
    claimed: false,
  });

  // NB : `vi.hoisted` s'exécute AVANT les `const` du module — rien ici ne doit
  // lire ORG_ID/SPIN_ID à l'évaluation. Les identifiants ne sont touchés que
  // par `reset()` et `makeAdmin()`, tous deux appelés plus tard.
  const state = {
    spins: new Map<string, SpinRow>(),
    /** Compteurs de seaux — modèle fidèle de `check_rate_limit` (incrément et
     *  verdict dans le MÊME appel). */
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    /** Seaux dont le verdict a été NÉGATIF : sert à distinguer « le seau a
     *  refusé » de « le seau a seulement alerté ». */
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    ip: "203.0.113.7",
    reset() {
      state.spins = new Map([
        [SPIN_ID, makeSpin(SPIN_ID)],
        [OTHER_SPIN_ID, makeSpin(OTHER_SPIN_ID)],
      ]);
      state.counters = new Map();
      state.rateLimitCalls = [];
      state.rateLimitDenied = [];
      state.rpcCalls = [];
      state.ip = "203.0.113.7";
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name !== "claim_winning_spin") {
          return Promise.resolve({ data: null, error: null });
        }
        const spin = state.spins.get(String(args.p_spin_id));
        // Transaction à usage unique : un spin déjà réclamé ne repasse pas.
        if (!spin || spin.claimed) {
          return Promise.resolve({
            data: null,
            error: { message: "spin already claimed" },
          });
        }
        spin.claimed = true;
        return Promise.resolve({
          data: [
            { participation_id: `participation-${spin.id}`, redeem_code: "GAIN-ABCD2345" },
          ],
          error: null,
        });
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          update: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          maybeSingle: () => {
            const data = (() => {
              switch (table) {
                case "spins":
                  return state.spins.get(String(filters.id)) ?? null;
                case "campaigns":
                  return {
                    id: CAMPAIGN_ID,
                    organization_id: ORG_ID,
                    collect_email: false,
                    collect_phone: false,
                  };
                case "wheels":
                  return {
                    id: WHEEL_ID,
                    organization_id: ORG_ID,
                    campaign_id: CAMPAIGN_ID,
                  };
                case "prizes":
                  return {
                    id: PRIZE_ID,
                    organization_id: ORG_ID,
                    wheel_id: WHEEL_ID,
                    label: "Un café offert",
                    description: "",
                  };
                case "organizations":
                  return { id: ORG_ID, name: "Ma boutique", notify_on_win: false };
                case "participations":
                  return { redeem_expires_at: null };
                default:
                  return null;
              }
            })();
            return Promise.resolve({ data, error: null });
          },
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin };
});

/**
 * Compteur de seaux calqué sur `public.check_rate_limit` : l'incrément et le
 * verdict tiennent dans le même appel. `failClosed` n'entre pas dans le calcul
 * — c'est l'APPELANT qui décide d'honorer ou d'ignorer le verdict, et c'est
 * précisément ce que ces tests vérifient.
 */
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    const allowed = next <= rule.limit;
    if (!allowed) state.rateLimitDenied.push(bucket);
    return Promise.resolve(allowed);
  },
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  // Valeurs RÉELLES de src/lib/rate-limit.ts (épinglées par rate-limit.test.ts).
  RATE_LIMITS: {
    claim: { limit: 15, windowSeconds: 60 },
    claimIp: { limit: 600, windowSeconds: 600 },
    spinBurst: { limit: 1, windowSeconds: 4 },
    spin: { limit: 8, windowSeconds: 60 },
    spinIp: { limit: 40, windowSeconds: 60 },
  },
}));

const { reportSecurityEventMock, monitoredMock, sendPrizeEmailMock } = vi.hoisted(
  () => ({
    reportSecurityEventMock:
      vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
    monitoredMock: vi.fn((_name: string, fn: () => unknown) => fn()),
    sendPrizeEmailMock: vi.fn(() => Promise.resolve(true)),
  }),
);

vi.mock("@/lib/monitoring", () => ({
  monitored: monitoredMock,
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/play-context", () => ({ loadPlayContext: vi.fn() }));
vi.mock("@/lib/resend", () => ({
  sendPrizeEmail: sendPrizeEmailMock,
  sendWinNotificationEmail: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("@/lib/merchant-contact", () => ({ getOrgOwnerEmail: vi.fn() }));
vi.mock("@/lib/google-wallet", () => ({ buildGoogleWalletSaveUrl: () => null }));
vi.mock("@/lib/apple-wallet", () => ({ buildAppleWalletPassUrl: () => null }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: () => Promise.resolve(true) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/anonymous-player", () => ({
  anonymousPlayerKey: () => Promise.resolve("anonymous-player-key"),
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => state.ip }));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({}),
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
}));

// Le moteur de jeton de claim n'est PAS mocké : vrais HMAC (secret fourni par
// vitest.config), donc la garde « jeton d'abord » est réellement exercée.
import { signClaimToken } from "@/lib/spin";
import { claimPrize } from "./play";

/** Seau d'IDENTITÉ du gain (fail-closed légitime : clé d'un seul porteur). */
const SPIN_BUCKET = (spinId: string) => `claim:spin:${spinId}`;
/** Seau PARTAGÉ par IP (fail-open, observabilité seule). */
const IP_BUCKET = (ip: string) => `claim:ip:${ip}`;

/** Sature une clé au-delà de toute limite plausible. */
function saturate(bucket: string) {
  state.counters.set(bucket, 99_999);
}

beforeEach(() => {
  state.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("claimPrize — ordre des gardes", () => {
  it("(b) le jeton est vérifié AVANT tout seau : un jeton forgé n'en consomme aucun", async () => {
    const res = await claimPrize({ claimToken: "jeton-forge-sans-signature" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("expiré");
    // AUCUN seau touché : un flot de jetons forgés ne peut pas entamer le
    // budget d'un joueur légitime, ni même gonfler le compteur d'observabilité.
    expect(state.rateLimitCalls).toEqual([]);
    // Aucune requête non plus : la vérification est purement locale (HMAC).
    expect(state.rpcCalls).toEqual([]);
  });

  it("un jeton EXPIRÉ est refusé sans consommer de seau", async () => {
    const expired = signClaimToken(SPIN_ID, new Date(Date.now() - 60 * 60 * 1000));

    const res = await claimPrize({ claimToken: expired });

    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });

  it("jeton valide : identité D'ABORD, puis observabilité IP", async () => {
    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    // Ordre exact : seau d'identité (fail-closed) puis seau partagé (fail-open).
    expect(state.rateLimitCalls).toEqual([
      SPIN_BUCKET(SPIN_ID),
      IP_BUCKET("203.0.113.7"),
    ]);
    // Plus AUCUN seau fail-closed sur une clé partagée.
    expect(state.rateLimitCalls).not.toContain("claim:ip");
  });
});

describe("claimPrize — la clé partagée ne refuse jamais", () => {
  it("(c) un tiers qui sature la clé IP n'empêche pas un porteur de jeton valide", async () => {
    // Voisin de CGNAT / Wi-Fi de commerce : même IP, budget épuisé.
    saturate(IP_BUCKET("203.0.113.7"));

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    // Le gain est délivré : la clé partagée alerte, elle ne refuse pas.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rateLimitDenied).toEqual([IP_BUCKET("203.0.113.7")]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "claim_ip_pressure",
      expect.objectContaining({ spin_id: SPIN_ID }),
    );
  });

  it("le seau d'identité d'un gain ne coupe PAS le gain d'un autre joueur", async () => {
    saturate(SPIN_BUCKET(OTHER_SPIN_ID));

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([]);
  });
});

describe("claimPrize — le rejeu d'un même jeton reste borné", () => {
  it("(d) 15 passages par gain, le 16e est refusé — et seul CE gain est bridé", async () => {
    const token = signClaimToken(SPIN_ID);

    // 1er appel : le gain est délivré et le spin passe à `claimed`.
    const first = await claimPrize({ claimToken: token });
    expect(first.ok).toBe(true);

    // Rejeux : la transaction refuse déjà (« déjà enregistré »), mais chaque
    // passage consomme le seau d'IDENTITÉ — c'est lui qui borne la boucle.
    for (let i = 2; i <= 15; i++) {
      const replay = await claimPrize({ claimToken: token });
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.error).toContain("déjà été enregistré");
    }

    const refused = await claimPrize({ claimToken: token });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toEqual([SPIN_BUCKET(SPIN_ID)]);
    // Le refus interrompt la chaîne AVANT le seau d'observabilité.
    expect(state.counters.get(IP_BUCKET("203.0.113.7"))).toBe(15);

    // Un autre gain, même IP : intact.
    const other = await claimPrize({ claimToken: signClaimToken(OTHER_SPIN_ID) });
    expect(other.ok).toBe(true);
  });

  it("changer d'IP ne relâche pas la borne de rejeu (clé = le gain, pas le réseau)", async () => {
    const token = signClaimToken(SPIN_ID);
    for (let i = 0; i < 15; i++) {
      await claimPrize({ claimToken: token });
      // Rotation d'IP à chaque tour (proxy, réseau mobile…).
      state.ip = `198.51.100.${i}`;
    }

    const refused = await claimPrize({ claimToken: token });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Trop de tentatives");
  });
});

describe("claimPrize — non-régression des parcours consommateurs", () => {
  it("roue publique : un jeton signé sur un spin gagnant délivre le code", async () => {
    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rpcCalls[0]).toMatchObject({
      name: "claim_winning_spin",
      args: { p_spin_id: SPIN_ID },
    });
  });

  it("tour offert du passeport : même jeton, même chemin, même code", async () => {
    // consumeLoyaltySpin signe exactement le même jeton (signClaimToken sur le
    // spin_id renvoyé par consume_loyalty_spin_grant) : le claim ne distingue
    // pas les deux origines, et ne doit pas commencer à le faire.
    const res = await claimPrize({ claimToken: signClaimToken(OTHER_SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rateLimitCalls).toEqual([
      SPIN_BUCKET(OTHER_SPIN_ID),
      IP_BUCKET("203.0.113.7"),
    ]);
  });

  it("un gain déjà réclamé reste refusé (transaction à usage unique)", async () => {
    const token = signClaimToken(SPIN_ID);
    await claimPrize({ claimToken: token });

    const second = await claimPrize({ claimToken: token });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("déjà été enregistré");
  });
});
