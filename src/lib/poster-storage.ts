import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  posterConfigSchema,
  posterImageRef,
  posterImageStoragePath,
  type PosterConfig,
} from "@/lib/poster";
import { createAdminClient } from "@/lib/supabase/admin";

export const POSTER_IMAGES_BUCKET = "poster-images";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_NORMALIZED_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 20_000_000;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

type AdminClient = ReturnType<typeof createAdminClient>;

export class PosterImageError extends Error {}

export function posterImagePaths(config: PosterConfig): string[] {
  return config.elements.flatMap((element) => {
    const path = posterImageStoragePath(element.src);
    return path ? [path] : [];
  });
}

function assertOwnedPath(path: string, organizationId: string, qrId: string) {
  if (!path.startsWith(`${organizationId}/${qrId}-`)) {
    throw new PosterImageError("Référence d'image non autorisée");
  }
}

async function normalizeDataImage(src: string): Promise<Buffer> {
  const match = DATA_IMAGE.exec(src);
  if (!match) throw new PosterImageError("Image invalide");
  const input = Buffer.from(match[2], "base64");
  if (input.length === 0 || input.length > MAX_SOURCE_BYTES) {
    throw new PosterImageError("Image trop lourde");
  }

  try {
    const normalized = await sharp(input, {
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    if (normalized.length > MAX_NORMALIZED_BYTES) {
      throw new PosterImageError("Image trop complexe après traitement");
    }
    return normalized;
  } catch (error) {
    if (error instanceof PosterImageError) throw error;
    throw new PosterImageError("Fichier image invalide ou dimensions excessives");
  }
}

export async function removePosterImages(
  paths: Iterable<string>,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 100) {
    const { error } = await admin.storage
      .from(POSTER_IMAGES_BUCKET)
      .remove(unique.slice(index, index + 100));
    if (error) console.warn("[poster] purge Storage:", error.message);
  }
}

/**
 * Remplace toutes les data URLs par des références Storage. Les fichiers
 * créés sont retournés pour permettre un rollback si l'écriture SQL échoue.
 */
export async function materializePosterImages(
  config: PosterConfig,
  context: { organizationId: string; qrId: string },
  admin: AdminClient = createAdminClient(),
): Promise<{ config: PosterConfig; uploadedPaths: string[] }> {
  const uploadedPaths: string[] = [];
  const elements = [];

  try {
    for (const element of config.elements) {
      if (element.type !== "image" || !element.src) {
        elements.push(element);
        continue;
      }

      const existingPath = posterImageStoragePath(element.src);
      if (existingPath) {
        assertOwnedPath(existingPath, context.organizationId, context.qrId);
        elements.push(element);
        continue;
      }

      const normalized = await normalizeDataImage(element.src);
      const path = `${context.organizationId}/${context.qrId}-${randomUUID()}.webp`;
      const { error } = await admin.storage
        .from(POSTER_IMAGES_BUCKET)
        .upload(path, normalized, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
      if (error) throw new PosterImageError("Envoi de l'image impossible");
      uploadedPaths.push(path);
      elements.push({ ...element, src: posterImageRef(path) });
    }

    return {
      config: posterConfigSchema.parse({ ...config, elements }),
      uploadedPaths,
    };
  } catch (error) {
    await removePosterImages(uploadedPaths, admin);
    throw error;
  }
}

/** Migration paresseuse des anciennes affiches à leur première ouverture. */
export async function migrateLegacyPosterImages(input: {
  qrId: string;
  organizationId: string;
  poster: unknown;
}): Promise<unknown> {
  const parsed = posterConfigSchema.safeParse(input.poster);
  if (!parsed.success) return input.poster;
  const hasDataImages = parsed.data.elements.some(
    (element) => element.type === "image" && element.src?.startsWith("data:image/"),
  );
  if (!hasDataImages) return parsed.data;

  const admin = createAdminClient();
  try {
    const result = await materializePosterImages(
      parsed.data,
      { organizationId: input.organizationId, qrId: input.qrId },
      admin,
    );
    const { data, error } = await admin
      .from("qr_codes")
      .update({ poster: result.config })
      .eq("id", input.qrId)
      .eq("organization_id", input.organizationId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      await removePosterImages(result.uploadedPaths, admin);
      console.error("[poster] migration SQL:", error?.message ?? "QR introuvable");
      return input.poster;
    }
    return result.config;
  } catch (error) {
    console.error("[poster] migration Storage:", error);
    return input.poster;
  }
}
