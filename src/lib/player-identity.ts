import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { requiredEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const PLAYER_COOKIE_NAME = "lc-player";
export const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const PLAYER_DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PLAYER_IDENTITY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export const PLAYER_EXPERIENCE_KINDS = [
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

export type PlayerExperienceKind = (typeof PLAYER_EXPERIENCE_KINDS)[number];

export const PLAYER_ACQUISITION_SOURCES = [
  "direct",
  "qr",
  "share",
  "referral",
  "unknown",
] as const;

export type PlayerAcquisitionSource =
  (typeof PLAYER_ACQUISITION_SOURCES)[number];

const progressiveIdentitySchema = z.object({
  organizationId: z.uuid(),
  experienceKind: z.enum(PLAYER_EXPERIENCE_KINDS),
  experienceId: z.uuid(),
  legacyIdentityHash: z
    .string()
    .regex(PLAYER_IDENTITY_HASH_PATTERN)
    .optional(),
  acquisitionSource: z.enum(PLAYER_ACQUISITION_SOURCES).default("unknown"),
  acquisitionQrCodeId: z.uuid().optional(),
});

export interface ProgressivePlayerIdentityInput {
  organizationId: string;
  experienceKind: PlayerExperienceKind;
  experienceId: string;
  legacyIdentityHash?: string;
  acquisitionSource?: PlayerAcquisitionSource;
  acquisitionQrCodeId?: string;
}

export type ProgressivePlayerIdentityResult =
  | {
      ok: true;
      playerId: string;
      deviceId: string;
      experienceMembershipId: string;
    }
  | { ok: false; reason: "invalid_input" | "unavailable" };

interface ResolveIdentityRow {
  player_id: string;
  device_id: string;
  experience_membership_id: string;
  should_rotate: boolean;
}

interface RotateDeviceRow {
  player_id: string;
  device_id: string;
}

function isExpiredDeviceError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "22023" &&
    candidate.message === "expired player device token"
  );
}

/** Jeton opaque à forte entropie. Seul son hash salé quitte ce module. */
export function generatePlayerDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash domaine-séparé du cookie global. La base ne reçoit jamais la valeur
 * brute, et ce hash n'est pas interchangeable avec les hashes legacy.
 */
export function hashPlayerDeviceToken(token: string): string {
  return createHash("sha256")
    .update(`${requiredEnv("PLAYER_KEY_SALT")}:player-device:v1:${token}`)
    .digest("hex");
}

/**
 * Hash du device courant en LECTURE SEULE : ne pose JAMAIS le cookie et ne
 * touche jamais la base (miroir de `peekAnonymousPlayerKey`). Sert aux chemins
 * qui n'ont rien à créer — lire une progression, ouvrir un coffre : un visiteur
 * sans identité n'a par construction aucune progression à voir. `null` si le
 * cookie est absent, malformé, ou si le sel n'est pas configuré (la lecture ne
 * doit jamais faire tomber la page).
 */
export async function peekPlayerDeviceTokenHash(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get(PLAYER_COOKIE_NAME)?.value;
    if (!token || !PLAYER_DEVICE_TOKEN_PATTERN.test(token)) return null;
    return hashPlayerDeviceToken(token);
  } catch {
    return null;
  }
}

function setPlayerCookie(
  store: Awaited<ReturnType<typeof cookies>>,
  token: string,
): void {
  store.set(PLAYER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE,
    priority: "high",
  });
}

/**
 * Pose seulement le cookie global, sans aller-retour base. Utile sur les
 * écrans qui préparent déjà l'ancien cookie avant l'action économique.
 */
export async function ensurePlayerDeviceCookie(): Promise<void> {
  const store = await cookies();
  const existing = store.get(PLAYER_COOKIE_NAME)?.value;
  if (existing && PLAYER_DEVICE_TOKEN_PATTERN.test(existing)) return;
  setPlayerCookie(store, generatePlayerDeviceToken());
}

function firstRow<T>(data: unknown): T | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] as T;
}

/**
 * Résout l'identité centrale puis lazy-link le hash du cookie historique.
 *
 * Cette couche est volontairement best-effort : la progression reste écrite
 * et relue via les tables/cookies legacy pendant la transition. Une panne du
 * nouveau pont ne doit donc jamais bloquer un spin, un tampon ou un join.
 */
export async function ensureProgressivePlayerIdentity(
  input: ProgressivePlayerIdentityInput,
): Promise<ProgressivePlayerIdentityResult> {
  const parsed = progressiveIdentitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };

  try {
    const store = await cookies();
    const cookieValue = store.get(PLAYER_COOKIE_NAME)?.value;
    const existingToken =
      cookieValue && PLAYER_DEVICE_TOKEN_PATTERN.test(cookieValue)
        ? cookieValue
        : null;
    let token = existingToken ?? generatePlayerDeviceToken();
    let deviceTokenHash = hashPlayerDeviceToken(token);
    let shouldPersistToken = !existingToken;
    const admin = createAdminClient();
    const identityArgs = {
      p_organization_id: parsed.data.organizationId,
      p_experience_kind: parsed.data.experienceKind,
      p_experience_id: parsed.data.experienceId,
      p_legacy_identity_hash: parsed.data.legacyIdentityHash ?? null,
      p_acquisition_source: parsed.data.acquisitionSource,
      p_acquisition_qr_code_id: parsed.data.acquisitionQrCodeId ?? null,
    };

    let { data, error } = await admin.rpc("resolve_player_identity", {
      p_device_token_hash: deviceTokenHash,
      ...identityArgs,
    });

    // Si une rotation DB a réussi mais que le Set-Cookie n'est jamais arrivé au
    // navigateur, l'ancien token finit par expirer. Le hash legacy permet alors
    // une reprise sûre vers un nouveau device, sans perdre la progression.
    if (
      existingToken &&
      parsed.data.legacyIdentityHash &&
      isExpiredDeviceError(error)
    ) {
      token = generatePlayerDeviceToken();
      deviceTokenHash = hashPlayerDeviceToken(token);
      shouldPersistToken = true;
      ({ data, error } = await admin.rpc("resolve_player_identity", {
        p_device_token_hash: deviceTokenHash,
        ...identityArgs,
      }));
    }

    const resolved = firstRow<ResolveIdentityRow>(data);
    if (error || !resolved?.player_id || !resolved.device_id) {
      return { ok: false, reason: "unavailable" };
    }

    // Ne persiste le nouveau cookie qu'après résolution atomique en base.
    if (shouldPersistToken) setPlayerCookie(store, token);

    let deviceId = resolved.device_id;
    if (resolved.should_rotate) {
      const rotatedToken = generatePlayerDeviceToken();
      const { data: rotationData, error: rotationError } = await admin.rpc(
        "rotate_player_device",
        {
          p_old_token_hash: deviceTokenHash,
          p_new_token_hash: hashPlayerDeviceToken(rotatedToken),
        },
      );
      const rotation = firstRow<RotateDeviceRow>(rotationData);
      if (!rotationError && rotation?.player_id === resolved.player_id) {
        deviceId = rotation.device_id;
        setPlayerCookie(store, rotatedToken);
      }
    }

    return {
      ok: true,
      playerId: resolved.player_id,
      deviceId,
      experienceMembershipId: resolved.experience_membership_id,
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
