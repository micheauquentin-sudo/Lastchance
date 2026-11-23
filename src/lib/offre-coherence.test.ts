// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PLAN_TIERS } from "@/lib/plans";

const ROOT = process.cwd();

function loadOffreJs(): {
  FORMULES: Array<{ id: string; prix: number; essai: number }>;
} {
  const code = readFileSync(path.join(ROOT, "public/shared/offre.js"), "utf8");
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.LC_OFFRE as {
    FORMULES: Array<{ id: string; prix: number; essai: number }>;
  };
}

function listFilesRecursive(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(path.relative(base, full).replaceAll("\\", "/"));
    }
  }
  return out.sort();
}

describe("Cohérence offre, tarifs, JSON-LD et miroir vitrine", () => {
  it("public/shared/offre.js correspond strictement à PLAN_TIERS (ids, prix, essai = 0)", () => {
    const { FORMULES } = loadOffreJs();
    expect(FORMULES.map((f) => f.id)).toEqual(PLAN_TIERS.map((p) => p.id));

    for (const tier of PLAN_TIERS) {
      const f = FORMULES.find((x) => x.id === tier.id);
      expect(f, `Formule manquante dans offre.js : ${tier.id}`).toBeDefined();
      expect(f!.prix).toBe(tier.priceMonthly);
      expect(f!.essai).toBe(0);
    }
  });

  it("site/src/content/pricing.{ts,generated.ts} reste aligné sur PLAN_TIERS et sans mention '0 jours gratuits'", () => {
    const pricingTs = readFileSync(
      path.join(ROOT, "site/src/content/pricing.ts"),
      "utf8",
    );
    const pricingGenerated = readFileSync(
      path.join(ROOT, "site/src/content/pricing.generated.ts"),
      "utf8",
    );
    expect(pricingTs).not.toMatch(/0\s+jours?\s+gratuits?/i);
    expect(pricingTs).not.toMatch(/essai\s+gratuit\s+de\s+0/i);

    for (const tier of PLAN_TIERS) {
      expect(pricingGenerated).toContain(`"priceMonthly": ${tier.priceMonthly}`);
    }
  });

  it("les JSON-LD de public/h-site-final-20k/{index,abonnements}.html reflètent min/max de PLAN_TIERS", () => {
    const prices = PLAN_TIERS.map((p) => p.priceMonthly);
    const minPrice = String(Math.min(...prices));
    const maxPrice = String(Math.max(...prices));

    type JsonLdNode = {
      "@graph"?: JsonLdNode[];
      offers?: { lowPrice?: string; highPrice?: string };
    };

    for (const file of ["index.html", "abonnements.html"]) {
      const html = readFileSync(
        path.join(ROOT, "public/h-site-final-20k", file),
        "utf8",
      );
      const blocks = [
        ...html.matchAll(
          /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
        ),
      ];
      expect(blocks.length).toBeGreaterThan(0);

      let foundOffer = false;
      for (const m of blocks) {
        const parsed = JSON.parse(m[1]) as JsonLdNode;
        const nodes = Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
        for (const node of nodes) {
          if (node.offers?.lowPrice && node.offers?.highPrice) {
            expect(["0", minPrice]).toContain(node.offers.lowPrice);
            expect(node.offers.highPrice).toBe(maxPrice);
            foundOffer = true;
          }
        }
      }
      expect(foundOffer, `AggregateOffer manquant dans ${file}`).toBe(true);
    }
  });

  it("propositions-site/h-site-final-20k/ est identique octet pour octet à public/h-site-final-20k/", () => {
    const srcDir = path.join(ROOT, "public/h-site-final-20k");
    const mirrorDir = path.join(ROOT, "propositions-site/h-site-final-20k");

    const srcFiles = listFilesRecursive(srcDir);
    const mirrorFiles = listFilesRecursive(mirrorDir);
    expect(mirrorFiles).toEqual(srcFiles);

    for (const rel of srcFiles) {
      const a = readFileSync(path.join(srcDir, rel));
      const b = readFileSync(path.join(mirrorDir, rel));
      expect(
        a.equals(b),
        `Écart détecté sur ${rel} — lancer \`npm run vitrine:sync\``,
      ).toBe(true);
    }
  });
});
