// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const updateWheel = vi.fn();
const updatePrize = vi.fn();
const addPrize = vi.fn();
const deletePrize = vi.fn();
vi.mock("@/actions/prizes", () => ({
  updateWheel,
  updatePrize,
  addPrize,
  deletePrize,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { WheelSettings } = await import("@/components/dashboard/wheel-settings");
const { PrizeEditor } = await import("@/components/dashboard/prize-editor");

import {
  PHRASES_GARDE_LOT,
  type LotValeurUnitaire,
} from "@/lib/lot-forte-valeur";
import type { Prize, Wheel } from "@/types/database";

/**
 * L'AVERTISSEMENT « LOT DE FORTE VALEUR MAL GARDÉ », SUR LES DEUX ÉCRANS.
 *
 * La règle produit — ne pas adosser un lot de valeur unitaire élevée à la seule
 * `play_limit`, qui repose sur un cookie que le joueur peut effacer — ne vivait
 * que dans un commentaire de `anonymous-player.ts` et une entrée de
 * `docs/bugs.md`. Ce test tient les deux invariants qui la font exister devant
 * le commerçant :
 *
 * 1. elle se voit LÀ OÙ LA DÉCISION SE PREND — au moment où la valeur franchit
 *    le seuil, et au moment où la limite bascule sur « Illimité » ;
 * 2. elle N'EMPÊCHE RIEN — aucun bouton désactivé, aucune soumission refusée.
 *    Des campagnes tournent déjà chez des commerçants qui n'ont jamais vu cette
 *    règle ; un blocage rétroactif les casserait sans préavis.
 *
 * Les textes attendus sont lus dans `PHRASES_GARDE_LOT` — la source unique —
 * pour qu'une reformulation là-bas ne laisse pas ce test vert sur une chaîne
 * périmée.
 */
afterEach(cleanup);

const ROUE = {
  id: "w1",
  campaign_id: "c1",
  name: "Roue principale",
  game_type: "wheel",
  play_limit: "once",
  style: {},
  position: 0,
  created_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture de test partielle — seuls les champs lus par l'étape « Le jeu » sont posés
} as unknown as Wheel;

const LOT_CHER = {
  id: "p1",
  wheel_id: "w1",
  label: "Bouteille de champagne",
  description: "",
  color: "#f5793b",
  emoji: null,
  weight: 10,
  stock: null,
  low_stock_threshold: null,
  cost_cents: null,
  value_cents: 4000,
  is_active: true,
  is_losing: false,
  position: 0,
  created_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture de test partielle — seuls les champs rendus par l'éditeur de lots sont posés
} as unknown as Prize;

describe("Étape « Le jeu » — la limite face aux lots de valeur", () => {
  function monter(
    wheel: Wheel = ROUE,
    lots: (LotValeurUnitaire & { label: string })[] = [
      { label: "Bouteille de champagne", value_cents: 4000, is_losing: false },
    ],
  ) {
    return render(
      <WheelSettings
        wheel={wheel}
        campaignId="c1"
        organizationName="Café des Sports"
        lots={lots}
      />,
    );
  }

  it("nomme le lot et renvoie vers le Ticket d'Or sous une limite contournable", () => {
    monter();
    expect(
      screen.getByText(PHRASES_GARDE_LOT.limite_contournable),
    ).toBeTruthy();
    expect(screen.getByText(/Bouteille de champagne/)).toBeTruthy();
  });

  it("bascule sur l'autre phrase AU CHANGEMENT du select, sans enregistrement", () => {
    monter();
    fireEvent.change(screen.getByLabelText("Chaque client peut jouer"), {
      target: { value: "unlimited" },
    });
    expect(screen.getByText(PHRASES_GARDE_LOT.sans_limite)).toBeTruthy();
    // Les deux niveaux ne se confondent pas : « aucune limite » n'est pas
    // « une limite contournable ».
    expect(
      screen.queryByText(PHRASES_GARDE_LOT.limite_contournable),
    ).toBeNull();
    expect(updateWheel).not.toHaveBeenCalled();
  });

  it("n'avertit ni sur un lot sous le seuil, ni sur un segment perdant", () => {
    monter(ROUE, [
      { label: "Café offert", value_cents: 250, is_losing: false },
      { label: "Dommage !", value_cents: 5000, is_losing: true },
    ]);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("refuse de considérer un lot gagnant sans valeur comme sûr", () => {
    monter(ROUE, [
      { label: "Valeur non renseignée", value_cents: null, is_losing: false },
    ]);
    expect(screen.getByText(PHRASES_GARDE_LOT.valeur_inconnue)).toBeTruthy();
  });

  it("n'empêche pas d'enregistrer : le bouton reste actif", () => {
    monter();
    const enregistrer = screen.getByRole("button", { name: "Enregistrer" });
    expect((enregistrer as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Éditeur de lots — l'avertissement suit la saisie", () => {
  function monter(prizes: Prize[] = [LOT_CHER], playLimit = "once" as const) {
    return render(
      <PrizeEditor
        wheelId="w1"
        prizes={prizes}
        totalWeight={10}
        playLimit={playLimit}
      />,
    );
  }

  it("avertit sur la valeur DÉJÀ enregistrée, sans attendre une frappe", () => {
    monter();
    expect(
      screen.getByText(PHRASES_GARDE_LOT.limite_contournable),
    ).toBeTruthy();
  });

  it("apparaît et disparaît PENDANT la frappe, au franchissement du seuil", () => {
    monter([
      // unsafe-cast-justification: même fixture partielle que LOT_CHER, valeur ramenée sous le seuil
      { ...LOT_CHER, value_cents: 300 } as unknown as Prize,
    ]);
    expect(screen.queryByRole("note")).toBeNull();

    const valeur = screen.getByLabelText("Valeur affichée (€)");
    fireEvent.change(valeur, { target: { value: "25,00" } });
    expect(
      screen.getByText(PHRASES_GARDE_LOT.limite_contournable),
    ).toBeTruthy();

    fireEvent.change(valeur, { target: { value: "3,00" } });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("tombe au clic sur « Segment perdant » : un lot perdant ne fait rien gagner", () => {
    monter();
    fireEvent.click(screen.getByLabelText("Segment perdant"));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("se tait quand la limite de participation n'est pas connue", () => {
    render(<PrizeEditor wheelId="w1" prizes={[LOT_CHER]} totalWeight={10} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("n'empêche pas d'enregistrer la ligne avertie", () => {
    monter();
    const enregistrer = screen.getByRole("button", { name: "Enregistrer" });
    expect((enregistrer as HTMLButtonElement).disabled).toBe(false);
  });
});
