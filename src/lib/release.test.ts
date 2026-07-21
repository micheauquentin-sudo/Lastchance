// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_MIGRATION } from "./release";

describe("EXPECTED_MIGRATION — attente de release synchronisée", () => {
  it("désigne la dernière migration du dossier supabase/migrations", () => {
    const versions = readdirSync(join(process.cwd(), "supabase", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.split("_")[0])
      .sort();
    const latest = versions[versions.length - 1];
    // Si ce test casse : une migration vient d'être ajoutée — mettre à
    // jour EXPECTED_MIGRATION (src/lib/release.ts) dans le même commit.
    expect(EXPECTED_MIGRATION).toBe(latest);
  });
});
