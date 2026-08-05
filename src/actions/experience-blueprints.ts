"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { OrganizationSummary } from "@/lib/active-organization";
import { getUserAndOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toJson } from "@/lib/supabase/json";
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

/**
 * Fenêtre de repli de l'idempotence d'application, quand l'appelant ne fournit
 * pas sa propre clé. Deux soumissions du même éditeur sur la même version dans
 * cette fenêtre partagent le `request_id` dérivé, donc la contrainte unique
 * `(organization_id, request_id)` fait REJOUER l'application : la RPC rend le
 * module déjà créé au lieu d'en créer un second.
 *
 * 10 s, contre 5 s pour l'ouverture d'un coffre (`meta-progression`), parce que
 * l'attente perçue n'est pas la même : appliquer un modèle écrit un module
 * entier — questions, étapes, dotations — en une transaction, et c'est vers la
 * troisième ou quatrième seconde qu'un commerçant recharge ou reclique. Passé ce
 * délai, une seconde application est un geste DÉLIBÉRÉ et doit aboutir : tirer
 * deux quiz du même modèle est un usage légitime, pas un doublon à absorber.
 */
const APPLY_REQUEST_WINDOW_MS = 10_000;

/**
 * Dérive un UUID déterministe (forme v4) à partir de l'éditeur, du modèle, de la
 * version visée et d'un seau de temps.
 *
 * Déterministe = idempotent, et c'est toute la question : la RPC porte déjà la
 * garantie (journal `experience_blueprint_applications`, unique sur
 * `(organization_id, request_id)`, relecture avant écriture), mais elle ne vaut
 * que si la clé est STABLE d'une tentative à l'autre. Un UUID tiré au hasard à
 * chaque appel la neutralise entièrement : le double-clic sur « Appliquer »
 * passait deux fois la garde et laissait le commerçant avec DEUX expériences
 * en brouillon à trier, dont une à supprimer.
 *
 * L'acteur entre dans la dérivation : deux éditeurs d'une même organisation qui
 * appliquent le même modèle au même moment veulent chacun le leur, alors que la
 * contrainte d'unicité est portée par l'organisation. Le modèle et la version en
 * font partie aussi, ce qui rend impossible le « idempotency key already used »
 * que lève la RPC quand une même clé est présentée pour une autre cible.
 */
function deriveApplyRequestId(
  actorId: string,
  blueprintId: string,
  version: number,
  now: number = Date.now(),
): string {
  const bucket = Math.floor(now / APPLY_REQUEST_WINDOW_MS);
  const digest = createHash("sha256")
    .update(`experience-blueprint-apply:v1:${actorId}:${blueprintId}:${version}:${bucket}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  // Version 4 + variant RFC 4122 : la valeur reste un uuid valide pour Postgres.
  digest[12] = "4";
  digest[16] = "89ab"[Number.parseInt(digest[16], 16) % 4];
  const hex = digest.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
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

  // `parseBlueprintVersion` rend la configuration en `unknown` : le schéma de
  // l'adaptateur est déclaré `ZodType<unknown>`, TypeScript ne peut donc pas
  // savoir qu'elle est sérialisable. On le PROUVE au lieu de le supposer — la
  // colonne cible est un jsonb, et une valeur non sérialisable y entrerait
  // déformée sans que rien ne le signale. En pratique le schéma de
  // l'adaptateur vient déjà de l'accepter : cette passe ne devrait jamais
  // échouer, elle borne le cas où un adaptateur laisserait passer autre chose.
  const configuration = z.json().safeParse(parsed.configuration);
  if (!configuration.success) {
    return { ok: false, error: "Configuration du modèle non sérialisable." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_experience_blueprint", {
    p_organization_id: context.organization.id,
    p_actor_id: context.user.id,
    p_kind: kind.data,
    p_name: name.data,
    p_description: description.data || null,
    p_schema_version: input.schemaVersion,
    p_configuration: configuration.data,
    p_assets: toJson(parsed.assets),
    p_default_rewards: toJson(parsed.defaultRewards),
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

// `createExperienceBlueprintVersion` a été retirée ici : elle enveloppait
// `create_experience_blueprint_version` sans qu'AUCUN appelant n'existe nulle
// part dans le dépôt. Ce n'était pas du code en attente de branchement mais un
// point d'entrée HTTP de plus — dans un module « use server », chaque export est
// une route publique — acceptant une configuration `unknown` venue du client,
// sans écran, sans test unitaire et sans pgTAP pour le surveiller. La RPC, elle,
// reste en base : le jour où un éditeur de modèle existera, l'action qui
// l'appelle sera dessinée par cet éditeur (quels champs, quel verrou optimiste),
// pas héritée de celle-ci.

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

/**
 * Recopie une version PUBLIÉE dans une nouvelle version brouillon.
 *
 * ⚠️ INJOIGNABLE, et c'est démontrable plutôt que supposé. Le seul chemin vers
 * cette action est le formulaire « Revenir à » de la galerie, rendu à la seule
 * condition que `restorableVersions(latestVersion)` ne soit pas vide, donc qu'il
 * existe une version ≥ 2. Or plus rien ne produit de version ≥ 2 : l'autre
 * producteur (`createExperienceBlueprintVersion`) n'avait aucun appelant et
 * vient d'être retiré. Reste cette restauration, qui exige précisément la
 * version ≥ 2 qu'elle serait seule à savoir créer. Le formulaire ne s'affiche
 * jamais, et tout modèle du produit reste indéfiniment en v1.
 *
 * Ce qui manque n'est pas un branchement mais un ÉDITEUR de modèle : la seule
 * création possible passe par `createStarterExperienceBlueprintForm`, qui écrit
 * un contenu figé issu de `STARTER_BLUEPRINTS`. Deux versions d'un même modèle
 * seraient identiques au bit près — le versionnage n'a aucun effet observable
 * tant que le commerçant ne peut rien modifier, et le brancher aujourd'hui
 * offrirait un « Revenir à » qui ne revient sur rien.
 *
 * On conserve donc ce binding, aligné sur une RPC qui existe et fonctionne,
 * SANS prétendre qu'il sert : le supprimer casserait l'import de la galerie, un
 * fichier hors du périmètre de ce correctif. Le retrait cohérent porte sur deux
 * fichiers — cette action et son wrapper de formulaire ici, le bloc « Revenir
 * à » dans `experience-blueprint-gallery.tsx` — et se tranche en même temps que
 * le sort de l'éditeur de modèle.
 */
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

/**
 * Applique une version PUBLIÉE : crée une expérience en brouillon, déjà
 * configurée. Rien n'est publié, aucun QR n'est diffusé.
 *
 * IDEMPOTENCE — le point sensible, parce que le geste n'est pas rejouable à la
 * main : une application ratée en double laisse deux modules à trier. Deux
 * niveaux, comme pour l'ouverture d'un coffre :
 *  · `requestId` fourni par l'appelant — mécanisme PRÉFÉRÉ, une clé par geste,
 *    réutilisée telle quelle par toute reprise de la même soumission ;
 *  · à défaut, une clé DÉRIVÉE de (acteur, modèle, version, seau de 10 s), donc
 *    stable, sur laquelle double-clic et rejeu réseau retombent.
 * Le repli existe parce que le formulaire de la galerie est du HTML nu : il ne
 * peut pas porter de clé par geste tant qu'aucun champ caché ne la transporte.
 */
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
    p_request_id:
      parsed.data.requestId ??
      deriveApplyRequestId(
        context.user.id,
        parsed.data.blueprintId,
        parsed.data.version,
      ),
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
