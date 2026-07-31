import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde structurelle : la jouabilité d'une campagne (`status` + fenêtre
 * `starts_at`/`ends_at`) doit rester calculée par UN SEUL prédicat. Le
 * défaut d'origine venait précisément d'une divergence — /play calculait le
 * dérivé, le dashboard n'affichait que le stocké. Un futur écran qui
 * recopierait la comparaison, ou une pastille rendue sans `windowState`,
 * rouvrirait le même écart en silence.
 */
const RACINE = join(__dirname, "..");

function lire(rel: string): string {
  return readFileSync(join(RACINE, rel), "utf8");
}

function fichiersSources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) fichiersSources(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("prédicat de fenêtre de campagne", () => {
  it("/play l'appelle au lieu de comparer les dates à la main", () => {
    const src = lire("lib/play-context.ts");
    expect(src).toContain("campaignWindowState(");
    expect(src).not.toMatch(/new Date\(c\.(starts_at|ends_at)\)/);
  });

  it("toute pastille de statut reçoit la fenêtre calculée côté serveur", () => {
    const balises = fichiersSources(RACINE)
      .flatMap((f) => {
        const src = readFileSync(f, "utf8");
        return [...src.matchAll(/<CampaignStatusBadge[\s\S]*?\/>/g)].map(
          (m) => [f, m[0]] as const,
        );
      });
    // Contrôle de non-vacuité : si plus aucune pastille n'est rendue, ce
    // test passerait sans rien vérifier.
    expect(balises.length).toBeGreaterThanOrEqual(2);
    for (const [fichier, balise] of balises) {
      expect(balise, `pastille sans windowState dans ${fichier}`).toContain(
        "windowState",
      );
    }
  });

  it("les deux surfaces commerçant importent le prédicat partagé", () => {
    for (const rel of [
      "app/dashboard/campaigns/page.tsx",
      "app/dashboard/campaigns/[id]/page.tsx",
    ]) {
      expect(lire(rel)).toContain(
        'import { campaignWindowState } from "@/lib/campaign-window"',
      );
    }
  });
});

describe("checklist de démarrage", () => {
  it("connaît le rôle et marque l'étape owner-only", () => {
    const src = lire("app/dashboard/page.tsx");
    expect(src).toContain("<OnboardingChecklist steps={onboardingSteps} role={role} />");
    // L'étape qui pointe sur /dashboard/settings (owner-only) est marquée.
    const etapeLogo = src.slice(
      src.indexOf('key: "logo"'),
      src.indexOf('key: "activate"'),
    );
    expect(etapeLogo).toContain('href: "/dashboard/settings"');
    expect(etapeLogo).toContain("ownerOnly: true");
  });
});
