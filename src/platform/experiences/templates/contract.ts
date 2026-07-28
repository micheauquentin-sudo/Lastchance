import type { ZodType } from "zod";
import type { ExperienceKind } from "@/platform/experiences/contract";

export const EXPERIENCE_BLUEPRINT_SCHEMA_VERSION = 1;

export type BlueprintSupport =
  | { supported: true }
  | { supported: false; reason: string };

export interface BlueprintAsset {
  key: string;
  url: string;
  alt?: string;
}

export interface BlueprintReward {
  slot: string;
  label: string;
  details?: string;
  stock: number;
}

export interface BlueprintPreview {
  kind: ExperienceKind;
  title: string;
  summary: string;
  itemCount: number;
  assetCount: number;
  rewardCount: number;
  warnings: string[];
}

export interface ExperienceBlueprintAdapter<TConfiguration = unknown> {
  kind: ExperienceKind;
  label: string;
  support: BlueprintSupport;
  supportedSchemaVersions: readonly number[];
  configurationSchema: ZodType<TConfiguration>;
  preview(input: {
    configuration: TConfiguration;
    assets: BlueprintAsset[];
    defaultRewards: BlueprintReward[];
  }): BlueprintPreview;
}

export interface StoredBlueprintVersion {
  blueprintId: string;
  version: number;
  schemaVersion: number;
  kind: ExperienceKind;
  configuration: unknown;
  assets: unknown;
  defaultRewards: unknown;
}

export type BlueprintParseResult =
  | {
      ok: true;
      configuration: unknown;
      assets: BlueprintAsset[];
      defaultRewards: BlueprintReward[];
    }
  | { ok: false; error: string };
