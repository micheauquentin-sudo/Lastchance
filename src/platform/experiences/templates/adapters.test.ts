import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_BLUEPRINT_ADAPTERS,
  parseBlueprintVersion,
  previewBlueprintVersion,
} from "@/platform/experiences/templates/adapters";
import { STARTER_BLUEPRINTS } from "@/platform/experiences/templates/starters";
import type { ExperienceKind } from "@/platform/experiences/contract";

describe("experience blueprint adapters", () => {
  it("déclare un adaptateur pour chaque ExperienceKind", () => {
    expect(Object.keys(EXPERIENCE_BLUEPRINT_ADAPTERS).sort()).toEqual(
      [
        "calendar",
        "campaign",
        "event",
        "hunt",
        "jackpot",
        "loyalty",
        "pronostics",
        "quiz",
        "referral",
      ].sort(),
    );
  });

  it.each(["quiz", "hunt", "calendar", "loyalty", "event", "pronostics"] as const)(
    "valide et prévisualise le starter %s",
    (kind) => {
      const starter = STARTER_BLUEPRINTS[kind]!;
      const result = previewBlueprintVersion({
        blueprintId: crypto.randomUUID(),
        version: 1,
        schemaVersion: 1,
        kind,
        configuration: starter.configuration,
        assets: starter.assets,
        defaultRewards: starter.defaultRewards,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.preview.kind).toBe(kind);
    },
  );

  it("refuse une version de schéma inconnue", () => {
    const result = parseBlueprintVersion({
      blueprintId: crypto.randomUUID(),
      version: 1,
      schemaVersion: 99,
      kind: "quiz",
      configuration: {},
      assets: [],
      defaultRewards: [],
    });
    expect(result).toEqual({
      ok: false,
      error: "Version de schéma 99 incompatible avec quiz.",
    });
  });

  it.each(["campaign", "jackpot", "referral"] as ExperienceKind[])(
    "annonce explicitement %s comme non pris en charge",
    (kind) => {
      expect(EXPERIENCE_BLUEPRINT_ADAPTERS[kind].support.supported).toBe(false);
    },
  );

  it("refuse les assets non HTTP et les stocks négatifs", () => {
    const starter = STARTER_BLUEPRINTS.hunt!;
    const result = parseBlueprintVersion({
      blueprintId: crypto.randomUUID(),
      version: 1,
      schemaVersion: 1,
      kind: "hunt",
      configuration: starter.configuration,
      assets: [{ key: "logo", url: "javascript:alert(1)" }],
      defaultRewards: [{ slot: "completion", label: "Lot", stock: -1 }],
    });
    expect(result.ok).toBe(false);
  });
});
