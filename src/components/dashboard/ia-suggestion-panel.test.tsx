// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Assistant de création — la surface UI.
 *
 * Ce que ce fichier garde :
 *  · DORMANCE — sans clé, aucun bouton, aucun formulaire, juste une note.
 *    C'est la vente qui ne s'allume qu'à la pose de la clé ; un bouton qui
 *    mènerait à un refus serait pire que rien.
 *  · L'IA PROPOSE, LE COMMERÇANT VALIDE — une idée n'est appliquée qu'au clic
 *    « Appliquer », jamais au rendu. Le défaut redouté : appliquer à
 *    l'affichage créerait des brouillons fantômes à chaque suggestion.
 *  · UN RETOUR PARTIEL (moins de 3 idées) s'affiche sans casser.
 *  · SURFACE SANS CHEMIN — le panneau est bien monté dans la page, sinon il
 *    n'existe pour personne.
 */

const applyCampaignTemplate = vi.fn().mockResolvedValue({
  ok: true,
  data: { campaignId: "camp-1" },
});
vi.mock("@/actions/campaign-templates", () => ({ applyCampaignTemplate }));
// La server action IA n'est pas exercée par ces rendus (le formulaire n'est
// pas soumis) : un stub suffit à résoudre l'import du composant.
vi.mock("@/actions/ia-assistant", () => ({ suggererIdeesCampagne: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { IaSuggestionPanel } = await import(
  "@/components/dashboard/ia-suggestion-panel"
);
const { IdeesResultat } = await import(
  "@/components/dashboard/ia-suggestion-form"
);

/** Blueprint minimal mais lisible par `summarizeBlueprint`. */
function blueprint(nom: string) {
  return {
    version: 1 as const,
    texts: { campaignName: nom, wheelName: "Jeu", wheelTitle: "Tentez votre chance !" },
    visual: { preset: "classic" },
    game: { game_type: "wheel", skill_config: null },
    prizes: [
      { label: "Un café offert", description: "", color: "#ff8800", weight: 1, is_losing: false, stock: 10, cost_cents: null },
      { label: "Pas de chance", description: "", color: "#cccccc", weight: 1, is_losing: true, stock: null, cost_cents: null },
    ],
    rules: {
      play_limit: "once" as const,
      collect_email: false,
      collect_phone: false,
      code_ttl_seconds: null,
      engagement: {},
      budget_cents: null,
    },
    durationDays: 14,
    emails: [],
  };
}

afterEach(() => {
  cleanup();
  applyCampaignTemplate.mockClear();
});

describe("IaSuggestionPanel — dormance", () => {
  it("sans clé : une note « bientôt », aucun bouton ni formulaire", () => {
    render(<IaSuggestionPanel isIaConfigured={false} />);

    expect(screen.getByText(/bientôt/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("avec clé : le formulaire et son bouton sont présents", () => {
    render(<IaSuggestionPanel isIaConfigured={true} />);

    expect(
      screen.getByRole("button", { name: /Proposer 3 idées/ }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Votre commerce/)).toBeTruthy();
    expect(screen.getByLabelText(/Votre objectif/)).toBeTruthy();
  });
});

describe("IaSuggestionPanel — les idées proposées", () => {
  it("n'applique rien au rendu, puis applique le blueprint au clic", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<IdeesResultat idees={[{ blueprint: blueprint("Café d'automne") } as any]} />);

    // Au rendu : aucune application.
    expect(applyCampaignTemplate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Appliquer l'idée/ }));

    expect(applyCampaignTemplate).toHaveBeenCalledTimes(1);
    expect(applyCampaignTemplate).toHaveBeenCalledWith({
      blueprint: expect.objectContaining({
        texts: expect.objectContaining({ campaignName: "Café d'automne" }),
      }),
    });
  });

  it("affiche un retour à 2 idées sans erreur", () => {
    render(
      <IdeesResultat
        idees={[
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { blueprint: blueprint("Idée A") } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { blueprint: blueprint("Idée B") } as any,
        ]}
      />,
    );

    expect(screen.getByText("Idée A")).toBeTruthy();
    expect(screen.getByText("Idée B")).toBeTruthy();
    expect(screen.getByText(/2 idées à relire/)).toBeTruthy();
    expect(applyCampaignTemplate).not.toHaveBeenCalled();
  });
});

describe("IaSuggestionPanel — surface sans chemin", () => {
  it("est monté dans la page des campagnes, alimenté par isIaConfigured()", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/dashboard/campaigns/page.tsx"),
      "utf8",
    );
    expect(src).toContain('import { isIaConfigured } from "@/lib/ia-provider"');
    expect(src).toMatch(/<IaSuggestionPanel\s+isIaConfigured=\{isIaConfigured\(\)\}/);
  });
});
