// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/campaigns", () => ({
  deleteCampaign: vi.fn(),
  duplicateCampaign: vi.fn(),
  updateCampaign: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignStatusControls } = await import(
  "@/components/dashboard/campaign-settings"
);
const { CampaignStatusProvider } = await import(
  "@/components/dashboard/campaign-status-live"
);
const { updateCampaign } = await import("@/actions/campaigns");

import type { Campaign } from "@/types/database";

/**
 * LA CARTE STATUT N'OFFRE PLUS UN GESTE QUI NE PEUT QU'ÉCHOUER (FIA-4),
 * ET DIT CE QU'ELLE DÉSARME (FIA-3).
 *
 * « Rouvrir aux joueurs » s'affichait sur TOUTE pause : un commerçant dont le
 * budget de gains était atteint cliquait, et le serveur refusait — sans que
 * l'écran ait jamais nommé le vrai geste (relever le plafond depuis la
 * bannière). Symétriquement, « Mettre en pause » désarme la programmation
 * automatique sans le dire : la campagne ne se rouvrait plus jamais toute
 * seule, et rien à l'écran n'expliquait pourquoi.
 *
 * Les deux contrôles négatifs comptent autant que le cas rouge : sans eux, un
 * filtre trop large (qui retirerait le bouton sur toute pause) passerait pour
 * une correction.
 */

afterEach(() => {
  cleanup();
  vi.mocked(updateCampaign).mockReset();
});

function campagne(patch: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    organization_id: "org-1",
    name: "Roue de l'été",
    status: "paused",
    starts_at: null,
    ends_at: null,
    auto_schedule: false,
    budget_cents: null,
    budget_spent_cents: 0,
    paused_reason: null,
    engagement: {} as Campaign["engagement"],
    collect_email: false,
    collect_phone: false,
    code_ttl_seconds: null,
    prejeu_invitation: false,
    share_enabled: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

const bouton = (nom: string) => screen.queryByRole("button", { name: nom });

function renderStatus(campaign: Campaign) {
  return render(
    <CampaignStatusProvider initialStatus={campaign.status}>
      <CampaignStatusControls campaign={campaign} />
    </CampaignStatusProvider>,
  );
}

describe("CampaignStatusControls — reprise après budget", () => {
  it("applique immédiatement le statut renvoyé après la publication", async () => {
    vi.mocked(updateCampaign).mockResolvedValue({
      ok: true,
      data: { status: "active" },
    });
    renderStatus(campagne({ status: "draft" }));

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir aux joueurs" }));

    await waitFor(() => {
      expect(bouton("Ouvrir aux joueurs")).toBeNull();
    });
    expect(bouton("Mettre en pause")).not.toBeNull();
    expect(
      screen.getByText(
        "Ouverte aux joueurs — un client qui scanne le QR code peut jouer.",
      ),
    ).toBeTruthy();
  });

  it("retire « Rouvrir aux joueurs » sur une pause budget non résorbée", () => {
    renderStatus(
      campagne({
        paused_reason: "budget_reached",
        budget_cents: 20000,
        budget_spent_cents: 30000,
      }),
    );
    expect(bouton("Rouvrir aux joueurs")).toBeNull();
    // Témoin de non-vacuité : la carte rend bien ses autres transitions.
    expect(bouton("Clôturer")).not.toBeNull();
  });

  it("le retire aussi sur une pause « droit expiré »", () => {
    // Le planificateur rouvre la campagne de lui-même au rachat, et la base
    // refuserait le geste manuel : la bannière le dit, le bouton ne doit pas
    // le contredire.
    renderStatus(campagne({ paused_reason: "droit_expire" }));
    expect(bouton("Rouvrir aux joueurs")).toBeNull();
    expect(bouton("Clôturer")).not.toBeNull();
  });

  it("laisse le bouton sur une pause manuelle (aucun motif)", () => {
    renderStatus(campagne({ paused_reason: null }));
    expect(bouton("Rouvrir aux joueurs")).not.toBeNull();
  });

  it("laisse le bouton dès que le plafond a été relevé", () => {
    renderStatus(
      campagne({
        paused_reason: "budget_reached",
        budget_cents: 50000,
        budget_spent_cents: 30000,
      }),
    );
    expect(bouton("Rouvrir aux joueurs")).not.toBeNull();
  });
});

describe("CampaignStatusControls — désarmement de la programmation", () => {
  it("annonce le désarmement sous les boutons qui le produisent", () => {
    renderStatus(campagne({ status: "active", auto_schedule: true }));
    expect(bouton("Mettre en pause")).not.toBeNull();
    expect(
      screen.getAllByText(/programmation automatique est désarmée/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Programmation et budget/)).toBeTruthy();
  });

  it("ne parle pas de désarmement sur « Ouvrir aux joueurs »", () => {
    renderStatus(campagne({ status: "draft" }));
    expect(bouton("Ouvrir aux joueurs")).not.toBeNull();
    // « Clôturer » est offerte depuis un brouillon et porte la note : c'est
    // elle qui doit la porter, pas l'ouverture.
    const notes = screen.getAllByText(/programmation automatique est désarmée/);
    expect(notes).toHaveLength(1);
  });
});
