import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { reportError } from "@/lib/monitoring";
import {
  captureExperienceEvent,
  experienceEventSchema,
} from "./experience-analytics";

const validEvent = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  eventName: "experience_completed" as const,
  experienceKind: "quiz" as const,
  experienceId: "00000000-0000-4000-8000-000000000002",
  playerKey: "a".repeat(64),
  source: "qr" as const,
};

beforeEach(() => vi.clearAllMocks());

describe("experienceEventSchema", () => {
  it("borne les événements, expériences, sources et montants", () => {
    expect(experienceEventSchema.safeParse(validEvent).success).toBe(true);
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        eventName: "arbitrary_event",
      }).success,
    ).toBe(false);
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        basketCents: -1,
      }).success,
    ).toBe(false);
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        basketCents: 1200,
      }).success,
    ).toBe(false);
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        idempotencyKey: "spaces are forbidden",
      }).success,
    ).toBe(false);
  });

  it("refuse les identifiants joueur bruts et les clés de métadonnées PII", () => {
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        playerKey: "device-token",
      }).success,
    ).toBe(false);
    expect(
      experienceEventSchema.safeParse({
        ...validEvent,
        metadata: { customer_email: "alice@example.test" },
      }).success,
    ).toBe(false);
  });
});

describe("captureExperienceEvent", () => {
  it("transmet uniquement le contrat RPC borné", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });

    await expect(
      captureExperienceEvent({ rpc } as never, {
        ...validEvent,
        metadata: { score: 12, completed: true },
      }),
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("record_experience_event", {
      p_organization_id: validEvent.organizationId,
      p_event_name: "experience_completed",
      p_experience_kind: "quiz",
      p_experience_id: validEvent.experienceId,
      p_source: "qr",
      p_player_id: null,
      p_player_key: validEvent.playerKey,
      p_qr_code_id: null,
      p_campaign_id: null,
      p_reward_issuance_id: null,
      p_basket_cents: null,
      p_reward_cost_cents: null,
      p_idempotency_key: null,
      p_metadata: { score: 12, completed: true },
    });
  });

  it("reste best-effort sur payload invalide ou erreur RPC", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("db unavailable"));
    await expect(
      captureExperienceEvent({ rpc } as never, {
        ...validEvent,
        experienceId: "not-a-uuid",
      }),
    ).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();

    await expect(
      captureExperienceEvent({ rpc } as never, validEvent),
    ).resolves.toBe(false);
    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
