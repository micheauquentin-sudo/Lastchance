"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { OrganizationSummary } from "@/lib/active-organization";
import { getUserAndOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasCompAccess } from "@/lib/subscription";
import type { ActionResult } from "@/lib/utils";
import type { MemberRole } from "@/types/database";
import { EXPERIENCE_CATALOG, isExperienceActive } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import {
  getExperienceBlueprintAdapter,
  parseBlueprintVersion,
  previewBlueprintVersion,
} from "@/platform/experiences/templates/adapters";
import { EXPERIENCE_BLUEPRINT_SCHEMA_VERSION } from "@/platform/experiences/templates/contract";
import { STARTER_BLUEPRINTS } from "@/platform/experiences/templates/starters";

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const blueprintIdSchema = z.object({
  blueprintId: z.string().uuid(),
  version: z.number().int().positive(),
});
const newVersionSchema = blueprintIdSchema.extend({
  expectedLatestVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  configuration: z.unknown(),
  assets: z.unknown(),
  defaultRewards: z.unknown(),
});
const experienceKindSchema = z.enum([
  "campaign",
  "pronostics",
  "hunt",
  "loyalty",
  "jackpot",
  "event",
  "calendar",
  "quiz",
  "referral",
]);

interface BlueprintRow {
  id: string;
  kind: ExperienceKind;
  name: string;
  description: string | null;
  publication_status: "draft" | "published" | "archived";
  published_version: number | null;
  created_at: string;
}

interface BlueprintVersionRow {
  blueprint_id: string;
  version: number;
  schema_version: number;
  configuration: unknown;
  assets: unknown;
  default_rewards: unknown;
  publication_status: "draft" | "published";
  restored_from_version: number | null;
  created_at: string;
}

/**
 * Contexte éditeur garanti NON NULLABLE.
 *
 * Le type de retour est explicite à dessein : sans annotation, TypeScript
 * n'applique pas l'analyse de flux du `never` de `redirect()` au retour
 * inféré, et `organization` resterait nullable chez les dix appelants. Les
 * modules frères (campaign-templates, calendar, events…) posent la même garde
 * en ligne dans chaque action ; on la factorise ici sans en perdre le typage.
 */
type EditorContext = {
  user: NonNullable<Awaited<ReturnType<typeof getUserAndOrg>>["user"]>;
  organization: OrganizationSummary;
  role: Extract<MemberRole, "owner" | "editor">;
};

async function editorContext(): Promise<EditorContext | null> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return null;
  return { user, organization, role };
}

function safeRpcError(error: { message?: string } | null) {
  if (!error?.message) return GENERIC_ERROR;
  if (error.message.includes("version conflict")) {
    return "Une version plus récente existe déjà. Rechargez la galerie.";
  }
  if (error.message.includes("duplicate key")) {
    return "Un modèle porte déjà ce nom.";
  }
  if (error.message.includes("unsupported blueprint adapter")) {
    return "Ce type de modèle n’est pas encore applicable par le moteur universel.";
  }
  if (error.message.includes("not found")) return "Modèle ou version introuvable.";
  return GENERIC_ERROR;
}

export async function createExperienceBlueprint(input: {
  kind: ExperienceKind;
  name: string;
  description?: string;
  schemaVersion: number;
  configuration: unknown;
  assets?: unknown;
  defaultRewards?: unknown;
}): Promise<ActionResult<{ blueprintId: string; version: number }>> {
  const context = await editorContext();
  if (!context) return { ok: false, error: NOT_EDITOR };

  const kind = experienceKindSchema.safeParse(input.kind);
  const name = z.string().trim().min(1).max(120).safeParse(input.name);
  const description = z.string().trim().max(500).safeParse(input.description ?? "");
  if (!kind.success || !name.success || !description.success) {
    return { ok: false, error: "Métadonnées du modèle invalides." };
  }

  const parsed = parseBlueprintVersion({
    blueprintId: crypto.randomUUID(),
    version: 1,
    schemaVersion: input.schemaVersion,
    kind: kind.data,
    configuration: input.configuration,
    assets: input.assets ?? [],
    defaultRewards: input.defaultRewards ?? [],
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_experience_blueprint", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_kind: kind.data,
    p_name: name.data,
    p_description: description.data || null,
    p_schema_version: input.schemaVersion,
    p_configuration: parsed.configuration,
    p_assets: parsed.assets,
    p_default_rewards: parsed.defaultRewards,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.blueprint_id) return { ok: false, error: safeRpcError(error) };
  revalidatePath("/dashboard/discover");
  return {
    ok: true,
    data: { blueprintId: row.blueprint_id as string, version: row.version as number },
  };
}

export async function createStarterExperienceBlueprint(
  input: { kind: ExperienceKind },
): Promise<ActionResult<{ blueprintId: string }>> {
  const kind = experienceKindSchema.safeParse(input.kind);
  if (!kind.success) return { ok: false, error: "Type de modèle invalide." };
  const starter = STARTER_BLUEPRINTS[kind.data];
  const adapter = getExperienceBlueprintAdapter(kind.data);
  if (!starter || !adapter.support.supported) {
    return {
      ok: false,
      error:
        adapter.support.supported === false
          ? adapter.support.reason
          : "Aucun starter n’est disponible.",
    };
  }
  const result = await createExperienceBlueprint({
    ...starter,
    schemaVersion: EXPERIENCE_BLUEPRINT_SCHEMA_VERSION,
  });
  if (!result.ok) return result;
  return { ok: true, data: { blueprintId: result.data.blueprintId } };
}

export async function createExperienceBlueprintVersion(
  input: z.input<typeof newVersionSchema>,
): Promise<ActionResult<{ version: number }>> {
  const context = await editorContext();
  if (!context) return { ok: false, error: NOT_EDITOR };
  const validInput = newVersionSchema.safeParse(input);
  if (!validInput.success) return { ok: false, error: "Version invalide." };

  const admin = createAdminClient();
  const { data: blueprint } = await admin
    .from("experience_blueprints")
    .select("kind")
    .eq("id", validInput.data.blueprintId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();
  if (!blueprint) return { ok: false, error: "Modèle introuvable." };

  const parsed = parseBlueprintVersion({
    blueprintId: validInput.data.blueprintId,
    version: validInput.data.expectedLatestVersion + 1,
    schemaVersion: validInput.data.schemaVersion,
    kind: blueprint.kind as ExperienceKind,
    configuration: validInput.data.configuration,
    assets: validInput.data.assets,
    defaultRewards: validInput.data.defaultRewards,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { data, error } = await admin.rpc("create_experience_blueprint_version", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_blueprint_id: validInput.data.blueprintId,
    p_expected_latest_version: validInput.data.expectedLatestVersion,
    p_schema_version: validInput.data.schemaVersion,
    p_configuration: parsed.configuration,
    p_assets: parsed.assets,
    p_default_rewards: parsed.defaultRewards,
  });
  if (error || typeof data !== "number") {
    return { ok: false, error: safeRpcError(error) };
  }
  revalidatePath("/dashboard/discover");
  return { ok: true, data: { version: data } };
}

export async function publishExperienceBlueprintVersion(
  input: { blueprintId: string; version: number },
): Promise<ActionResult> {
  const context = await editorContext();
  if (!context) return { ok: false, error: NOT_EDITOR };
  const parsed = blueprintIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Version invalide." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("publish_experience_blueprint_version", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_blueprint_id: parsed.data.blueprintId,
    p_version: parsed.data.version,
  });
  if (error) return { ok: false, error: safeRpcError(error) };
  revalidatePath("/dashboard/discover");
  return { ok: true, data: undefined };
}

export async function restoreExperienceBlueprintVersion(input: {
  blueprintId: string;
  sourceVersion: number;
  expectedLatestVersion: number;
}): Promise<ActionResult<{ version: number }>> {
  const context = await editorContext();
  if (!context) return { ok: false, error: NOT_EDITOR };
  const parsed = z
    .object({
      blueprintId: z.string().uuid(),
      sourceVersion: z.number().int().positive(),
      expectedLatestVersion: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Restauration invalide." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("restore_experience_blueprint_version", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_blueprint_id: parsed.data.blueprintId,
    p_source_version: parsed.data.sourceVersion,
    p_expected_latest_version: parsed.data.expectedLatestVersion,
  });
  if (error || typeof data !== "number") {
    return { ok: false, error: safeRpcError(error) };
  }
  revalidatePath("/dashboard/discover");
  return { ok: true, data: { version: data } };
}

export async function applyExperienceBlueprintVersion(input: {
  blueprintId: string;
  version: number;
  requestId?: string;
}): Promise<ActionResult<{ targetId: string; dashboardHref: string }>> {
  const context = await editorContext();
  if (!context) return { ok: false, error: NOT_EDITOR };
  const parsed = blueprintIdSchema
    .extend({ requestId: z.string().uuid().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Application invalide." };

  const admin = createAdminClient();
  const { data: blueprint } = await admin
    .from("experience_blueprints")
    .select("kind")
    .eq("id", parsed.data.blueprintId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();
  if (!blueprint) return { ok: false, error: "Modèle introuvable." };
  const kind = blueprint.kind as ExperienceKind;
  const adapter = getExperienceBlueprintAdapter(kind);
  if (!adapter.support.supported) {
    return { ok: false, error: adapter.support.reason };
  }
  if (!isExperienceActive(context.organization, kind, hasCompAccess(context.organization))) {
    return { ok: false, error: "Ce module n’est pas actif dans votre abonnement." };
  }

  const { data, error } = await admin.rpc("apply_experience_blueprint_version", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_blueprint_id: parsed.data.blueprintId,
    p_version: parsed.data.version,
    p_request_id: parsed.data.requestId ?? crypto.randomUUID(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.target_id) return { ok: false, error: safeRpcError(error) };
  const catalog = EXPERIENCE_CATALOG.find((entry) => entry.kind === kind);
  const dashboardHref = catalog?.dashboardHref ?? "/dashboard/discover";
  revalidatePath(dashboardHref);
  revalidatePath("/dashboard/discover");
  return {
    ok: true,
    data: { targetId: row.target_id as string, dashboardHref },
  };
}

export async function previewExperienceBlueprint(input: {
  blueprintId: string;
  version: number;
}) {
  const context = await editorContext();
  if (!context) return { ok: false as const, error: NOT_EDITOR };
  const parsed = blueprintIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Version invalide." };

  const admin = createAdminClient();
  const { data: blueprint } = await admin
    .from("experience_blueprints")
    .select("kind")
    .eq("id", parsed.data.blueprintId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();
  if (!blueprint) return { ok: false as const, error: "Modèle introuvable." };
  const { data: version } = await admin
    .from("experience_blueprint_versions")
    .select("schema_version, configuration, assets, default_rewards")
    .eq("blueprint_id", parsed.data.blueprintId)
    .eq("organization_id", context.organization.id)
    .eq("version", parsed.data.version)
    .maybeSingle();
  if (!version) return { ok: false as const, error: "Version introuvable." };
  return previewBlueprintVersion({
    blueprintId: parsed.data.blueprintId,
    version: parsed.data.version,
    schemaVersion: version.schema_version as number,
    kind: blueprint.kind as ExperienceKind,
    configuration: version.configuration,
    assets: version.assets,
    defaultRewards: version.default_rewards,
  });
}

export async function listExperienceBlueprints() {
  const context = await editorContext();
  if (!context) return [];
  const admin = createAdminClient();
  const [{ data: blueprints }, { data: versions }] = await Promise.all([
    admin
      .from("experience_blueprints")
      .select(
        "id, kind, name, description, publication_status, published_version, created_at",
      )
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("experience_blueprint_versions")
      .select(
        "blueprint_id, version, schema_version, configuration, assets, default_rewards, publication_status, restored_from_version, created_at",
      )
      .eq("organization_id", context.organization.id)
      .order("version", { ascending: false })
      .limit(250),
  ]);
  const typedVersions = (versions ?? []) as BlueprintVersionRow[];
  return ((blueprints ?? []) as BlueprintRow[]).map((blueprint) => {
    const blueprintVersions = typedVersions.filter(
      (version) => version.blueprint_id === blueprint.id,
    );
    const latest = blueprintVersions[0] ?? null;
    const preview = latest
      ? previewBlueprintVersion({
          blueprintId: blueprint.id,
          version: latest.version,
          schemaVersion: latest.schema_version,
          kind: blueprint.kind,
          configuration: latest.configuration,
          assets: latest.assets,
          defaultRewards: latest.default_rewards,
        })
      : null;
    return {
      ...blueprint,
      latestVersion: latest?.version ?? 0,
      latestStatus: latest?.publication_status ?? "draft",
      preview: preview?.ok ? preview.preview : null,
      compatibilityError: preview && !preview.ok ? preview.error : null,
    };
  });
}

export async function createStarterExperienceBlueprintForm(formData: FormData) {
  const kind = experienceKindSchema.safeParse(formData.get("kind"));
  if (!kind.success) redirect("/dashboard/discover?blueprint_error=type");
  const result = await createStarterExperienceBlueprint({ kind: kind.data });
  if (!result.ok) {
    redirect(`/dashboard/discover?blueprint_error=${encodeURIComponent(result.error)}`);
  }
  redirect("/dashboard/discover?blueprint_created=1");
}

export async function publishExperienceBlueprintVersionForm(formData: FormData) {
  const result = await publishExperienceBlueprintVersion({
    blueprintId: String(formData.get("blueprint_id") ?? ""),
    version: Number(formData.get("version")),
  });
  if (!result.ok) {
    redirect(`/dashboard/discover?blueprint_error=${encodeURIComponent(result.error)}`);
  }
  redirect("/dashboard/discover?blueprint_published=1");
}

export async function applyExperienceBlueprintVersionForm(formData: FormData) {
  const result = await applyExperienceBlueprintVersion({
    blueprintId: String(formData.get("blueprint_id") ?? ""),
    version: Number(formData.get("version")),
  });
  if (!result.ok) {
    redirect(`/dashboard/discover?blueprint_error=${encodeURIComponent(result.error)}`);
  }
  redirect(result.data.dashboardHref);
}

export async function restoreExperienceBlueprintVersionForm(formData: FormData) {
  const result = await restoreExperienceBlueprintVersion({
    blueprintId: String(formData.get("blueprint_id") ?? ""),
    sourceVersion: Number(formData.get("source_version")),
    expectedLatestVersion: Number(formData.get("latest_version")),
  });
  if (!result.ok) {
    redirect(`/dashboard/discover?blueprint_error=${encodeURIComponent(result.error)}`);
  }
  redirect("/dashboard/discover?blueprint_restored=1");
}
