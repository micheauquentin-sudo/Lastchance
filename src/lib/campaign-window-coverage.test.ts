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
    // L'assertion portait la forme EXACTE `import { campaignWindowState } from
    // "…"`, sur une seule ligne. Le module porte désormais un second prédicat
    // dérivé (`repriseBudgetRequise`, wagon 4) : le jour où un écran importe
    // les deux, l'import passe en multi-lignes et cette garde rougirait sur un
    // changement de MISE EN FORME, pas de propriété. Elle a déjà été
    // contournée une fois pour cette raison exacte, ailleurs
    // (`destructive-confirm-coverage.test.ts`).
    //
    // On vérifie donc ce qu'elle voulait dire : le fichier IMPORTE
    // `campaignWindowState` DEPUIS ce module. Le vrai danger — recopier la
    // comparaison de dates — reste attrapé par le test de /play ci-dessus.
    for (const rel of [
      "app/dashboard/campaigns/page.tsx",
      "app/dashboard/campaigns/[id]/page.tsx",
    ]) {
      const src = lire(rel).replace(/\r\n/g, "\n");
      const blocs = src.match(
        /import\s*\{[^}]*\}\s*from\s*"@\/lib\/campaign-window"/g,
      );
      expect(blocs, `aucun import de campaign-window dans ${rel}`).toBeTruthy();
      expect(blocs!.some((b) => b.includes("campaignWindowState"))).toBe(true);
    }
  });
});

describe("checklist de démarrage", () => {
  it("connaît le rôle et marque l'étape owner-only", () => {
    const src = lire("app/dashboard/page.tsx");
    // La checklist n'a plus sa carte en bas de page : le bloc « Votre prochaine
    // action » l'absorbe (elle y arrivait en dixième position, après dix cartes
    // de zéros). Le filtrage par rôle des étapes, lui, reste le même module.
    expect(src).toContain(
      "visibleOnboardingSteps(onboardingSteps, role)",
    );
    expect(src).not.toContain("<OnboardingChecklist");
    // L'étape qui pointe sur /dashboard/settings (owner-only) est marquée.
    const etapeLogo = src.slice(
      src.indexOf('key: "logo"'),
      src.indexOf('key: "activate"'),
    );
    expect(etapeLogo).toContain('href: "/dashboard/settings"');
    expect(etapeLogo).toContain("ownerOnly: true");
  });
});
