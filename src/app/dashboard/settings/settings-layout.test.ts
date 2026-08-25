import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
const LOADING = readFileSync("src/app/dashboard/settings/loading.tsx", "utf8");

describe("la page Réglages utilise la largeur disponible", () => {
  it("passe d'une colonne mobile à deux colonnes sur grand écran", () => {
    expect(PAGE).toContain(
      'className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2"',
    );
    expect(PAGE).not.toContain('className="space-y-4 max-w-lg"');
  });

  it("garde les cartes denses sur toute la largeur desktop", () => {
    expect(PAGE).toMatch(
      /<Card className="lg:col-span-2">\s*<h2 className="font-semibold mb-1">Webhooks sortants<\/h2>/,
    );
    expect(PAGE).toContain('<Card id="subscription" className="lg:col-span-2">');
  });

  it("aligne le squelette sur la même grille responsive", () => {
    expect(LOADING).toContain(
      'className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2"',
    );
    expect(LOADING).toContain('i >= 9 ? "lg:col-span-2"');
  });
});
