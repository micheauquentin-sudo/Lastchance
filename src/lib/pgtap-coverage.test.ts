// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde anti-oubli : tout fichier pgTAP de supabase/tests/ doit figurer
 * dans la commande `supabase test db` du job database-security.
 *
 * Raison d'être : automation.test.sql a existé plusieurs semaines sans
 * jamais être exécuté en CI (absent de cette liste), masquant un bug de
 * production réel (RPC de ligue cassée). Rien ne le signalait — d'où ce
 * test, calqué sur release.test.ts qui garde EXPECTED_MIGRATION.
 *
 * Si ce test casse : ajoutez le fichier à la commande `supabase test db`
 * dans .github/workflows/ci.yml, dans le même commit.
 */
describe("couverture pgTAP — CI", () => {
  it("exécute tous les fichiers de supabase/tests/ dans le job pgTAP", () => {
    const root = process.cwd();
    const testFiles = readdirSync(join(root, "supabase", "tests"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const workflow = readFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    const missing = testFiles.filter(
      (f) => !workflow.includes(`supabase/tests/${f}`),
    );

    expect(testFiles.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
