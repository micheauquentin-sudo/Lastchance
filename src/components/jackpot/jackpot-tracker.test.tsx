// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JackpotPublicGauge } from "@/actions/jackpot";
import type { JackpotGaugeView } from "@/lib/jackpot-context";
import type { JackpotGaugeProps } from "./jackpot-tracker";

vi.mock("@/actions/jackpot", () => ({
  getJackpotCheckinToken: vi.fn(),
  getJackpotState: vi.fn(),
  participateJackpot: vi.fn(),
}));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const { getJackpotState } = await import("@/actions/jackpot");
const { JackpotTracker } = await import("./jackpot-tracker");

/**
 * LA JAUGE NE RECHARGE PLUS LA PAGE.
 *
 * Le suivi appelait `router.refresh()` toutes les 20 s : un rendu serveur
 * complet de la page publique (contexte, gains, contenu marchand) pour ne
 * rafraîchir qu'un compteur et un montant. Une lecture ciblée le fait à la
 * minute — et, comme le calendrier, elle CONSERVE la dernière photo saine :
 * une coupure au comptoir ne doit pas remettre la cagnotte à zéro sous les yeux
 * du client.
 */

const jauge: JackpotGaugeProps = {
  currentCount: 10,
  threshold: 100,
  cycle: 1,
  displayAmountCents: 1_000,
  drawAt: null,
  drawDone: false,
  drawnAt: null,
  soldOut: false,
};

function vueJauge(over: Partial<JackpotGaugeView> = {}): JackpotGaugeView {
  return {
    ...jauge,
    drawMode: "threshold_draw",
    validationMode: "rotating_code",
    ...over,
  };
}

function etatPublic(over: Partial<JackpotGaugeView> = {}): JackpotPublicGauge {
  return { state: "ok", gauge: vueJauge(over) };
}

/** Refus indistinct du module : `gauge` est alors null. */
const INDISPONIBLE: JackpotPublicGauge = { state: "unavailable", gauge: null };

function rendre() {
  return render(
    <JackpotTracker
      campaignId="camp-1"
      organizationName="Café des Sports"
      logoUrl={null}
      campaignName="La grande cagnotte"
      validationMode="rotating_code"
      drawMode="threshold_draw"
      rewardLabel="Un panier garni"
      rewardDetails={null}
      merchantContent={null}
      gauge={jauge}
      wins={[]}
    />,
  );
}

/** Laisse passer un cycle de poll (60 s) et ses promesses. */
async function unPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61_000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getJackpotState).mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("JackpotTracker — jauge partagée sans rechargement", () => {
  it("fusionne une photo SAINE : le compteur et le montant montent", async () => {
    vi.mocked(getJackpotState).mockResolvedValue(
      etatPublic({ currentCount: 42, displayAmountCents: 4_200 }),
    );
    const { container } = rendre();
    expect(container.textContent).toContain("10 / 100");

    await unPoll();
    expect(getJackpotState).toHaveBeenCalledWith({ campaignId: "camp-1" });
    expect(container.textContent).toContain("42 / 100");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  });

  it("CONSERVE la dernière photo saine sur un état indisponible", async () => {
    vi.mocked(getJackpotState).mockResolvedValue(
      etatPublic({ currentCount: 42, displayAmountCents: 4_200 }),
    );
    const { container } = rendre();
    await unPoll();
    expect(container.textContent).toContain("42 / 100");

    vi.mocked(getJackpotState).mockResolvedValue(INDISPONIBLE);
    await unPoll();
    // La cagnotte ne retombe pas à zéro devant le client.
    expect(container.textContent).toContain("42 / 100");
  });

  it("CONSERVE la photo saine quand l'action jette (réseau coupé)", async () => {
    vi.mocked(getJackpotState).mockResolvedValue(etatPublic({ currentCount: 42 }));
    const { container } = rendre();
    await unPoll();

    vi.mocked(getJackpotState).mockRejectedValue(new Error("offline"));
    await unPoll();
    expect(container.textContent).toContain("42 / 100");
  });

  it("relit immédiatement au retour d'onglet, sans recharger la page", async () => {
    vi.mocked(getJackpotState).mockResolvedValue(etatPublic({ currentCount: 55 }));
    const { container } = rendre();
    expect(getJackpotState).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getJackpotState).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("55 / 100");
  });
});
