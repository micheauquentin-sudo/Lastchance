// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QrCodeCard } from "@/components/dashboard/qr-code-card";
import type { QrStyle } from "@/types/database";

vi.mock("@/components/dashboard/qr-designer", () => ({
  QrDesigner: () => null,
}));

vi.mock("@/components/dashboard/qr-forms", () => ({
  DeleteQrButton: () => null,
}));

vi.mock("@/lib/qr-render", () => ({
  renderQr: vi.fn().mockResolvedValue(undefined),
}));

const QR_ID = "00000000-0000-4000-8000-000000000001";
const QR_STYLE: QrStyle = {
  dark: "#211d16",
  light: "#ffffff",
  pattern: "square",
  eyeStyle: "square",
  frame: "banner",
  frameText: "SCANNEZ-MOI",
  frameColor: "#211d16",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QrCodeCard", () => {
  it("charge et affiche automatiquement les ouvertures et gains, avec les trois actions QR", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ rewardCount: 3 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <QrCodeCard
        id={QR_ID}
        slug="roue-rentree"
        label="Vitrine rentrée"
        campaignName="La roue de la rentrée"
        url="https://app.lastchance.test/play/roue-rentree"
        scanCount={1}
        initialStyle={QR_STYLE}
        posterHref={`/poster/${QR_ID}`}
        posterConfigured
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("3 gains attribués")).toBeTruthy();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/dashboard/qr-distribution?kind=campaign&id=${QR_ID}`,
      { cache: "no-store" },
    );
    expect(screen.getByLabelText("Résultats du QR").textContent).toContain(
      "1 ouverture",
    );
    expect(screen.getByLabelText("Résultats du QR").textContent).toContain(
      "3 gains attribués",
    );
    expect(screen.getByRole("button", { name: "Télécharger le QR (PNG)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Personnaliser le QR" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Éditer l'affiche" }).getAttribute("href")).toBe(
      `/poster/${QR_ID}`,
    );
    expect(screen.queryByText("Afficher les gains attribués")).toBeNull();
  });

  it("signale des gains indisponibles si leur lecture échoue, sans laisser un chargement infini", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    render(
      <QrCodeCard
        id={QR_ID}
        slug="roue-rentree"
        label="Vitrine rentrée"
        campaignName="La roue de la rentrée"
        url="https://app.lastchance.test/play/roue-rentree"
        scanCount={1}
        initialStyle={QR_STYLE}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Gains indisponibles")).toBeTruthy();
    });

    expect(screen.getByLabelText("Résultats du QR").textContent).toContain(
      "1 ouverture",
    );
    expect(screen.queryByText("Chargement des gains…")).toBeNull();
  });
});
