import type { ExperienceKind } from "@/platform/experiences/contract";
import type {
  BlueprintParseResult,
  ExperienceBlueprintAdapter,
  StoredBlueprintVersion,
} from "@/platform/experiences/templates/contract";
import {
  blueprintAssetsSchema,
  blueprintRewardsSchema,
  calendarBlueprintSchema,
  eventBlueprintSchema,
  huntBlueprintSchema,
  loyaltyBlueprintSchema,
  pronosticsBlueprintSchema,
  quizBlueprintSchema,
  unsupportedBlueprintSchema,
} from "@/platform/experiences/templates/schemas";

function countPreview(
  kind: ExperienceKind,
  label: string,
  itemLabel: string,
  configuration: { name: string },
  itemCount: number,
  assetCount: number,
  rewardCount: number,
  warnings: string[] = [],
) {
  return {
    kind,
    title: configuration.name,
    summary: `${itemCount} ${itemLabel} · ${label}`,
    itemCount,
    assetCount,
    rewardCount,
    warnings,
  };
}

/**
 * Fige le type de configuration de CHAQUE adaptateur au lieu de le diluer dans
 * le registre : l'inférence part du schéma Zod de l'entrée et alimente son
 * `preview`. Sans ce passage par une fonction générique, le registre devrait
 * être contraint par un type existentiel — que TypeScript n'a pas, d'où le
 * `any` qu'on remplace ici. `unknown` casserait l'inférence de `preview`,
 * `never` celle du schéma.
 */
function defineAdapter<TConfiguration>(
  adapter: ExperienceBlueprintAdapter<TConfiguration>,
): ExperienceBlueprintAdapter<TConfiguration> {
  return adapter;
}

export const EXPERIENCE_BLUEPRINT_ADAPTERS = {
  quiz: defineAdapter({
    kind: "quiz",
    label: "Quiz libre-service",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: quizBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "quiz",
        "brouillon inerte",
        "question(s)",
        configuration,
        configuration.questions.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  hunt: defineAdapter({
    kind: "hunt",
    label: "Chasse au trésor",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: huntBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "hunt",
        "QR régénérés",
        "étape(s)",
        configuration,
        configuration.steps.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  calendar: defineAdapter({
    kind: "calendar",
    label: "Calendrier",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: calendarBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "calendar",
        "slug régénéré",
        "case(s)",
        configuration,
        configuration.days.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  loyalty: defineAdapter({
    kind: "loyalty",
    label: "Passeport fidélité",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: loyaltyBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "loyalty",
        "secret tournant régénéré",
        "palier(s)",
        configuration,
        configuration.milestones.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  event: defineAdapter({
    kind: "event",
    label: "Événement live",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: eventBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "event",
        "session draft et code neuf",
        "question(s)",
        configuration,
        configuration.questions.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  pronostics: defineAdapter({
    kind: "pronostics",
    label: "Pronostics",
    support: { supported: true },
    supportedSchemaVersions: [1],
    configurationSchema: pronosticsBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "pronostics",
        "slug régénéré",
        "match(s)",
        configuration,
        configuration.matches.length,
        assets.length,
        defaultRewards.length,
      ),
  }),
  campaign: defineAdapter({
    kind: "campaign",
    label: "Campagne roue",
    support: {
      supported: false,
      reason: "Utilisez les modèles de campagne existants, qui gèrent la roue et ses lots.",
    },
    supportedSchemaVersions: [1],
    configurationSchema: unsupportedBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "campaign",
        "application via le moteur historique uniquement",
        "élément",
        configuration,
        0,
        assets.length,
        defaultRewards.length,
        ["Ce modèle ne peut pas être appliqué par le moteur universel V1."],
      ),
  }),
  jackpot: defineAdapter({
    kind: "jackpot",
    label: "Jackpot",
    support: {
      supported: false,
      reason: "La copie d’un jackpot risquerait de dupliquer une économie active.",
    },
    supportedSchemaVersions: [1],
    configurationSchema: unsupportedBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "jackpot",
        "adaptateur non pris en charge",
        "élément",
        configuration,
        0,
        assets.length,
        defaultRewards.length,
        ["Aucune instance ne sera créée par cet adaptateur."],
      ),
  }),
  referral: defineAdapter({
    kind: "referral",
    label: "Parrainage",
    support: {
      supported: false,
      reason: "Les règles de parrainage et leurs cibles ne sont pas portables en V1.",
    },
    supportedSchemaVersions: [1],
    configurationSchema: unsupportedBlueprintSchema,
    preview: ({ configuration, assets, defaultRewards }) =>
      countPreview(
        "referral",
        "adaptateur non pris en charge",
        "élément",
        configuration,
        0,
        assets.length,
        defaultRewards.length,
        ["Aucune instance ne sera créée par cet adaptateur."],
      ),
  }),
} satisfies Record<ExperienceKind, ExperienceBlueprintAdapter<unknown>>;

export function getExperienceBlueprintAdapter(kind: ExperienceKind) {
  return EXPERIENCE_BLUEPRINT_ADAPTERS[kind] as ExperienceBlueprintAdapter;
}

export function parseBlueprintVersion(version: StoredBlueprintVersion): BlueprintParseResult {
  const adapter = getExperienceBlueprintAdapter(version.kind);
  if (!adapter.supportedSchemaVersions.includes(version.schemaVersion)) {
    return {
      ok: false,
      error: `Version de schéma ${version.schemaVersion} incompatible avec ${version.kind}.`,
    };
  }
  const configuration = adapter.configurationSchema.safeParse(version.configuration);
  if (!configuration.success) {
    return {
      ok: false,
      error: configuration.error.issues[0]?.message ?? "Configuration invalide",
    };
  }
  const assets = blueprintAssetsSchema.safeParse(version.assets);
  if (!assets.success) {
    return { ok: false, error: assets.error.issues[0]?.message ?? "Assets invalides" };
  }
  const rewards = blueprintRewardsSchema.safeParse(version.defaultRewards);
  if (!rewards.success) {
    return {
      ok: false,
      error: rewards.error.issues[0]?.message ?? "Dotations invalides",
    };
  }
  return {
    ok: true,
    configuration: configuration.data,
    assets: assets.data,
    defaultRewards: rewards.data,
  };
}

export function previewBlueprintVersion(version: StoredBlueprintVersion) {
  const adapter = getExperienceBlueprintAdapter(version.kind);
  const parsed = parseBlueprintVersion(version);
  if (!parsed.ok) return parsed;
  return {
    ok: true as const,
    preview: adapter.preview({
      configuration: parsed.configuration,
      assets: parsed.assets,
      defaultRewards: parsed.defaultRewards,
    }),
  };
}
