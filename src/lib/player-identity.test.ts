// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieValue: null as string | null,
  cookieWrites: [] as Array<{ name: string; value: string; options: unknown }>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  resolveData: [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000002",
      experience_membership_id: "10000000-0000-4000-8000-000000000003",
      should_rotate: false,
    },
  ] as unknown,
  resolveError: null as unknown,
  resolveResponses: null as
    | Array<{ data: unknown; error: unknown }>
    | null,
  rotationData: [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000004",
    },
  ] as unknown,
  rotationError: null as unknown,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "lc-player" && state.cookieValue
        ? { value: state.cookieValue }
        : undefined,
    set: (name: string, value: string, options: unknown) => {
      state.cookieValue = value;
      state.cookieWrites.push({ name, value, options });
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "resolve_player_identity" && state.resolveResponses) {
        const response = state.resolveResponses.shift();
        if (response) return response;
      }
      return name === "rotate_player_device"
        ? { data: state.rotationData, error: state.rotationError }
        : { data: state.resolveData, error: state.resolveError };
    },
  }),
}));

import {
  ensurePlayerDeviceCookie,
  ensureProgressivePlayerIdentity,
  generatePlayerDeviceToken,
  hashPlayerDeviceToken,
  PLAYER_COOKIE_NAME,
  PLAYER_DEVICE_TOKEN_PATTERN,
  PLAYER_IDENTITY_HASH_PATTERN,
} from "./player-identity";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "20000000-0000-4000-8000-000000000002";
const QR_ID = "20000000-0000-4000-8000-000000000003";
const LEGACY_HASH = "a".repeat(64);

beforeEach(() => {
  state.cookieValue = null;
  state.cookieWrites = [];
  state.rpcCalls = [];
  state.resolveData = [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000002",
      experience_membership_id: "10000000-0000-4000-8000-000000000003",
      should_rotate: false,
    },
  ];
  state.resolveError = null;
  state.resolveResponses = null;
  state.rotationData = [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000004",
    },
  ];
  state.rotationError = null;
});

describe("jeton lc-player", () => {
  it("génère un jeton opaque de 256 bits et un hash domaine-séparé", () => {
    const token = generatePlayerDeviceToken();
    const hash = hashPlayerDeviceToken(token);

    expect(token).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(hash).toMatch(PLAYER_IDENTITY_HASH_PATTERN);
    expect(hash).not.toContain(token);
    expect(hashPlayerDeviceToken(token)).toBe(hash);
  });

  it("pose une seule fois le cookie commun sans appeler la base", async () => {
    await ensurePlayerDeviceCookie();
    const first = state.cookieValue;
    await ensurePlayerDeviceCookie();

    expect(first).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieWrites[0].name).toBe(PLAYER_COOKIE_NAME);
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("ensureProgressivePlayerIdentity", () => {
  it("lazy-link le hash legacy sans envoyer les jetons bruts", async () => {
    state.cookieValue = "A".repeat(43);

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
      acquisitionSource: "qr",
      acquisitionQrCodeId: QR_ID,
    });

    expect(result).toEqual({
      ok: true,
      playerId: "10000000-0000-4000-8000-000000000001",
      deviceId: "10000000-0000-4000-8000-000000000002",
      experienceMembershipId: "10000000-0000-4000-8000-000000000003",
    });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "resolve_player_identity",
      args: {
        p_organization_id: ORGANIZATION_ID,
        p_experience_kind: "campaign",
        p_experience_id: CAMPAIGN_ID,
        p_legacy_identity_hash: LEGACY_HASH,
        p_acquisition_source: "qr",
        p_acquisition_qr_code_id: QR_ID,
      },
    });
    expect(state.rpcCalls[0].args.p_device_token_hash).toMatch(
      PLAYER_IDENTITY_HASH_PATTERN,
    );
    expect(JSON.stringify(state.rpcCalls[0])).not.toContain(state.cookieValue);
    expect(state.cookieWrites).toEqual([]);
  });

  it("ne persiste un nouveau cookie qu'après la résolution DB", async () => {
    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
    });

    expect(result.ok).toBe(true);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(state.rpcCalls[0].args).toMatchObject({
      p_legacy_identity_hash: null,
      p_acquisition_qr_code_id: null,
    });
  });

  it("fait tourner le cookie lorsque la base le demande", async () => {
    state.cookieValue = "B".repeat(43);
    state.resolveData = [
      {
        player_id: "10000000-0000-4000-8000-000000000001",
        device_id: "10000000-0000-4000-8000-000000000002",
        experience_membership_id: "10000000-0000-4000-8000-000000000003",
        should_rotate: true,
      },
    ];

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      deviceId: "10000000-0000-4000-8000-000000000004",
    });
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      "resolve_player_identity",
      "rotate_player_device",
    ]);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).not.toBe("B".repeat(43));
  });

  it("récupère via le hash legacy si un ancien cookie roté a expiré", async () => {
    const expiredToken = "C".repeat(43);
    state.cookieValue = expiredToken;
    state.resolveResponses = [
      {
        data: null,
        error: {
          code: "22023",
          message: "expired player device token",
        },
      },
      {
        data: state.resolveData,
        error: null,
      },
    ];

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
    });

    expect(result.ok).toBe(true);
    expect(
      state.rpcCalls.filter((call) => call.name === "resolve_player_identity"),
    ).toHaveLength(2);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).not.toBe(expiredToken);
  });

  it("reste best-effort si le pont DB est indisponible", async () => {
    state.resolveData = null;
    state.resolveError = { code: "PGRST202" };

    await expect(
      ensureProgressivePlayerIdentity({
        organizationId: ORGANIZATION_ID,
        experienceKind: "campaign",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: LEGACY_HASH,
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(state.cookieWrites).toEqual([]);
  });

  it("refuse localement un scope ou un hash non conforme", async () => {
    await expect(
      ensureProgressivePlayerIdentity({
        organizationId: "pas-un-uuid",
        experienceKind: "campaign",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: "hash-brut",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    expect(state.rpcCalls).toEqual([]);
  });
});
