import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// submitSkillChallenge — matérialisation du DÉFI et gardes ADR-032
//
// Vérifie le cœur sensible : l'issue du défi (évaluée SERVEUR) pilote
// perform_atomic_spin via `p_force_losing` (réussite → false, échec → true), le
// jeton lie l'identité device, et le seau `failClosed` porte sur l'IDENTITÉ
// device (jamais sur une clé partagée). Le moteur skill (HMAC, évaluation) n'est
// PAS mocké : vrais jetons signés.
// ────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const CAMPAIGN_ID = "campaign-1";
const WHEEL_ID = "wheel-1";
const PRIZE_ID = "prize-1";
const SPIN_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_KEY = "anonymous-player-key";

const { state, makeAdmin } = vi.hoisted(() => {
  const state = {
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    ip: "203.0.113.7",
    reset() {
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
        if (name === "perform_atomic_spin") {
          const forced = args.p_force_losing === true;
          return Promise.resolve({
            data: [
              {
                spin_id: SPIN_ID,
                prize_id: forced ? null : PRIZE_ID,
                is_losing: forced,
                denial_reason: null,
                next_eligible_at: null,
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  return { state, makeAdmin };
});

const { monitoredMock, reportSecurityEventMock } = vi.hoisted(() => ({
  monitoredMock: vi.fn((_name: string, fn: () => unknown) => fn()),
  reportSecurityEventMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => {
  const rateLimit = (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    const allowed = next <= rule.limit;
    if (!allowed) state.rateLimitDenied.push(bucket);
    return Promise.resolve(allowed);
  };
  return {
    rateLimit,
    rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
    observeSharedKey: async (
      bucket: string,
      rule: { limit: number; windowSeconds: number },
    ) => {
      await rateLimit(bucket, rule);
    },
    RATE_LIMITS: {
      spinBurst: { limit: 1, windowSeconds: 4 },
      spin: { limit: 8, windowSeconds: 60 },
      spinIp: { limit: 40, windowSeconds: 60 },
    },
  };
});

vi.mock("@/lib/monitoring", () => ({
  monitored: monitoredMock,
  reportError: vi.fn(),
  reportSecurityEvent: reportSecurityEventMock,
}));

vi.mock("@/lib/play-context", () => ({ loadPlayContext: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: () => Promise.resolve(true) }));
vi.mock("@/lib/anonymous-player", () => ({
  anonymousPlayerKey: () => Promise.resolve(DEVICE_KEY),
}));
vi.mock("@/lib/request-ip", () => ({ clientIpFromHeaders: () => state.ip }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

// Moteur skill NON mocké : vrais HMAC (secret fourni par vitest.config).
import { loadPlayContext } from "@/lib/play-context";
import { startSkillChallenge, submitSkillChallenge } from "./skill";

const SLUG = "boutique";
const SPIN_BURST = `spin:burst:${WHEEL_ID}:${DEVICE_KEY}`;
const SPIN_SUSTAINED = `spin:${WHEEL_ID}:${DEVICE_KEY}`;

/** Contexte d'un jeu d'estimation (target 50 ± 5), 2 lots dont PRIZE_ID. */
function estimateCtx() {
  return {
    ok: true as const,
    admin: makeAdmin(),
    campaign: { id: CAMPAIGN_ID, organization_id: ORG_ID },
    wheel: {
      id: WHEEL_ID,
      game_type: "estimate",
      skill_config: { target: 50, tolerance: 5, question: null, unit: null, imageUrl: null },
    },
    prizes: [
      { id: PRIZE_ID, label: "Un café offert", description: "" },
      { id: "prize-2", label: "Perdu", description: "" },
    ],
  };
}

function saturate(bucket: string) {
  state.counters.set(bucket, 99_999);
}

/** Émet un vrai jeton de défi pour le contexte estimate ci-dessus. */
async function issueToken(): Promise<string> {
  const res = await startSkillChallenge({ slug: SLUG });
  if (!res.ok) throw new Error(`start failed: ${res.error}`);
  return res.data.challengeToken;
}

beforeEach(() => {
  state.reset();
  vi.mocked(loadPlayContext).mockResolvedValue(
    estimateCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
  );
});

afterEach(() => vi.clearAllMocks());

describe("submitSkillChallenge — le défi pilote le tirage", () => {
  it("RÉUSSITE : tirage normal (p_force_losing=false) → gain + claim", async () => {
    const token = await issueToken();
    state.reset();
    vi.mocked(loadPlayContext).mockResolvedValue(
      estimateCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );

    const res = await submitSkillChallenge({
      slug: SLUG,
      challengeToken: token,
      attempt: { value: 50 },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("won");
      expect(res.data.succeeded).toBe(true);
      expect(res.data.claimToken).toBeTruthy();
      expect(res.data.prizeIndex).toBe(0);
    }
    const spin = state.rpcCalls.find((c) => c.name === "perform_atomic_spin");
    expect(spin?.args.p_force_losing).toBe(false);
    expect(spin?.args.p_player_key).toBe(DEVICE_KEY);
  });

  it("ÉCHEC : spin PERDANT forcé (p_force_losing=true) → perdu, sans claim", async () => {
    const token = await issueToken();
    state.reset();
    vi.mocked(loadPlayContext).mockResolvedValue(
      estimateCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );

    const res = await submitSkillChallenge({
      slug: SLUG,
      challengeToken: token,
      attempt: { value: 999 },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.state).toBe("lost");
      expect(res.data.succeeded).toBe(false);
      expect(res.data.claimToken).toBeNull();
    }
    const spin = state.rpcCalls.find((c) => c.name === "perform_atomic_spin");
    expect(spin?.args.p_force_losing).toBe(true);
  });
});

describe("submitSkillChallenge — gardes ADR-032", () => {
  it("un jeton forgé est refusé SANS consommer de seau ni appeler la RPC", async () => {
    const res = await submitSkillChallenge({
      slug: SLUG,
      challengeToken: "jeton-forge-sans-signature",
      attempt: { value: 50 },
    });
    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("le refus vient de l'IDENTITÉ device (débit soutenu saturé)", async () => {
    const token = await issueToken();
    state.reset();
    vi.mocked(loadPlayContext).mockResolvedValue(
      estimateCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
    saturate(SPIN_SUSTAINED);

    const res = await submitSkillChallenge({
      slug: SLUG,
      challengeToken: token,
      attempt: { value: 50 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toContain(SPIN_SUSTAINED);
    // Aucun tirage n'a eu lieu.
    expect(state.rpcCalls.some((c) => c.name === "perform_atomic_spin")).toBe(false);
  });

  it("anti double-clic : le seau burst d'identité borne le rejeu immédiat", async () => {
    const token = await issueToken();
    state.reset();
    vi.mocked(loadPlayContext).mockResolvedValue(
      estimateCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );

    const first = await submitSkillChallenge({ slug: SLUG, challengeToken: token, attempt: { value: 50 } });
    expect(first.ok).toBe(true);
    const second = await submitSkillChallenge({ slug: SLUG, challengeToken: token, attempt: { value: 50 } });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toContain(SPIN_BURST);
  });
});
