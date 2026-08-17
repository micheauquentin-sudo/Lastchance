// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import type { CapacitesModule } from "@/lib/module-capabilities";

/**
 * LE BANDEAU QUI MANQUAIT SUR UNE PAGE SUR HUIT (constat SD-9).
 *
 * `campaigns/[id]/page.tsx` LISAIT `capacitesDuModule("wheel")` — pour la Carte
 * de l'Aventure — et ne rendait jamais le bandeau. Conséquence : sans droit, la
 * page détail d'une campagne proposait « Ouvrir aux joueurs » sans un mot sur
 * le refus qui allait suivre, et un pass terminé n'y laissait aucune trace. Le
 * défaut était invisible à la relecture, précisément parce que la donnée était
 * là : rien ne signalait qu'elle n'allait nulle part.
 *
 * D'où une garde qui LIT LES HUIT SOURCES. Un test de rendu ne l'aurait pas
 * attrapée — le composant marchait ; ce qui manquait, c'était l'appel.
 */

const PAGES_DETAIL = [
  "src/app/dashboard/calendar/[id]/page.tsx",
  "src/app/dashboard/campaigns/[id]/page.tsx",
  "src/app/dashboard/events/[id]/page.tsx",
  "src/app/dashboard/hunts/[id]/page.tsx",
  "src/app/dashboard/jackpot/[id]/page.tsx",
  "src/app/dashboard/loyalty/[id]/page.tsx",
  "src/app/dashboard/pronostics/[id]/page.tsx",
  "src/app/dashboard/quiz/[id]/page.tsx",
] as const;

afterEach(cleanup);

describe("Les huit pages détail de module montent le bandeau d'offre", () => {
  for (const page of PAGES_DETAIL) {
    it(`${page} rend ModuleCapabilityNotice`, () => {
      const source = readFileSync(path.join(process.cwd(), page), "utf8");
      expect(source).toContain("<ModuleCapabilityNotice");
    });
  }
});

function capacites(over: Partial<CapacitesModule> = {}): CapacitesModule {
  const base: CapacitesModule = {
    canExplore: true,
    canEditDraft: true,
    canPublish: false,
    raison: "droit_absent",
    passTermineLe: "12/08/2026",
    peutAcheter: true,
    message: "Pass terminé le 12/08/2026.",
  };
  // `Object.assign` et non un spread : `Partial<CapacitesModule>` rend chaque
  // champ `| undefined`, qu'un spread propagerait dans le type de retour.
  return Object.assign(base, over);
}

describe("ModuleCapabilityNotice", () => {
  it("hérite du message du contrat, sans le réécrire", () => {
    render(
      <ModuleCapabilityNotice capacites={capacites()} entitlement="core">
        Roue et lots.
      </ModuleCapabilityNotice>,
    );
    expect(screen.getByText("Pass terminé le 12/08/2026.")).toBeTruthy();
  });

  /**
   * Un module payé ne porte AUCUN bandeau : le silence est la garantie qu'on ne
   * vend rien à qui a déjà acheté. C'est aussi pourquoi les pages le rendent
   * sans conteneur porteur de marge.
   */
  it("ne rend rien du tout quand la publication est ouverte", () => {
    const { container } = render(
      <ModuleCapabilityNotice
        capacites={capacites({ canPublish: true, raison: null, message: null })}
        entitlement="core"
      >
        Roue et lots.
      </ModuleCapabilityNotice>,
    );
    expect(container.innerHTML).toBe("");
  });
});
