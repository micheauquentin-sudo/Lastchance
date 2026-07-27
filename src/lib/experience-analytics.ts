import "server-only";

import { z } from "zod";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

export const EXPERIENCE_EVENT_NAMES = [
  "experience_viewed",
  "experience_joined",
  "experience_started",
  "experience_completed",
  "reward_issued",
  "reward_claimed",
  "reward_redeemed",
  "player_returned",
  "experience_shared",
] as const;

export const EXPERIENCE_KINDS = [
  "campaign",
  "hunt",
  "loyalty",
  "jackpot",
  "event",
  "calendar",
  "referral",
  "contest",
  "quiz",
] as const;

export const EXPERIENCE_SOURCES = [
  "direct",
  "qr",
  "share",
  "referral",
  "unknown",
] as const;

export type ExperienceEventName = (typeof EXPERIENCE_EVENT_NAMES)[number];
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];
export type ExperienceSource = (typeof EXPERIENCE_SOURCES)[number];

const uuidOrNull = z.string().uuid().nullable().optional();
const playerKeySchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable()
  .optional();
const metadataValueSchema = z.union([
  z.string().max(160),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const forbiddenMetadataKey = /email|phone|name|address|token|code|secret|ip|user.?agent/i;

export const experienceEventSchema = z
  .object({
    organizationId: z.string().uuid(),
    eventName: z.enum(EXPERIENCE_EVENT_NAMES),
    experienceKind: z.enum(EXPERIENCE_KINDS),
    experienceId: z.string().uuid(),
    source: z.enum(EXPERIENCE_SOURCES).default("unknown"),
    playerId: uuidOrNull,
    playerKey: playerKeySchema,
    qrCodeId: uuidOrNull,
    campaignId: uuidOrNull,
    rewardIssuanceId: uuidOrNull,
    basketCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
    rewardCostCents: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .nullable()
      .optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^[a-zA-Z0-9:_-]+$/)
      .nullable()
      .optional(),
    metadata: z
      .record(z.string().max(48), metadataValueSchema)
      .refine(
        (metadata) =>
          Object.keys(metadata).every((key) => !forbiddenMetadataKey.test(key)),
        "Les métadonnées analytics contiennent une clé interdite",
      )
      .default({}),
  })
  .superRefine((event, context) => {
    if (
      event.eventName !== "reward_redeemed" &&
      (event.basketCents != null || event.rewardCostCents != null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["basketCents"],
        message: "Les montants sont réservés au retrait d'une récompense",
      });
    }
    if (
      event.rewardIssuanceId != null &&
      !["reward_issued", "reward_claimed", "reward_redeemed"].includes(
        event.eventName,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["rewardIssuanceId"],
        message: "La récompense ne correspond pas à cet événement",
      });
    }
  });

export type ExperienceEventInput = z.input<typeof experienceEventSchema>;

type AnalyticsAdmin = Pick<ReturnType<typeof createAdminClient>, "rpc">;

/**
 * Enregistre un événement métier côté serveur. La télémétrie est strictement
 * best-effort : validation ou indisponibilité de la base ne doit jamais casser
 * le parcours joueur ou la remise d'un lot.
 */
export async function captureExperienceEvent(
  admin: AnalyticsAdmin,
  input: ExperienceEventInput,
): Promise<boolean> {
  const parsed = experienceEventSchema.safeParse(input);
  if (!parsed.success) {
    reportError("analytics.capture.invalid", new Error("Invalid analytics event"));
    return false;
  }

  const event = parsed.data;
  try {
    const { data, error } = await admin.rpc("record_experience_event", {
      p_organization_id: event.organizationId,
      p_event_name: event.eventName,
      p_experience_kind: event.experienceKind,
      p_experience_id: event.experienceId,
      p_source: event.source,
      p_player_id: event.playerId ?? null,
      p_player_key: event.playerKey ?? null,
      p_qr_code_id: event.qrCodeId ?? null,
      p_campaign_id: event.campaignId ?? null,
      p_reward_issuance_id: event.rewardIssuanceId ?? null,
      p_basket_cents: event.basketCents ?? null,
      p_reward_cost_cents: event.rewardCostCents ?? null,
      p_idempotency_key: event.idempotencyKey ?? null,
      p_metadata: event.metadata,
    });
    if (error) {
      reportError("analytics.capture.rpc", new Error(error.message));
      return false;
    }
    return data !== null;
  } catch (error) {
    reportError("analytics.capture.rpc", error);
    return false;
  }
}
