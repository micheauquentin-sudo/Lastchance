// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PosterEditor } from "./poster-editor";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@/actions/qr-codes", () => ({ saveQrPoster: vi.fn() }));
vi.mock("@/lib/use-action-form", () => ({
  useActionForm: () => ({ state: null, pending: false, onSubmit: vi.fn() }),
}));
vi.mock("@/components/poster/poster-canvas", () => ({
  PosterCanvas: () => <div data-testid="poster-canvas" />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => {
    void variant;
    return <button {...props}>{children}</button>;
  },
}));

describe("PosterEditor — sortie d'affiche", () => {
  it("sépare l'aperçu de la seule feuille réservée à l'impression/export", () => {
    render(
      <PosterEditor
        qrId="11111111-1111-4111-8111-111111111111"
        playUrl="https://lastchance.test/play/demo"
        qrStyle={{}}
        initialConfig={{ version: 2, bg: "#ffffff", bgPattern: "none", elements: [] }}
      />,
    );

    expect(screen.getByTestId("poster-preview").className).toContain("poster-preview");
    expect(screen.getByTestId("poster-print-sheet").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByTestId("poster-canvas")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Télécharger l'affiche" })).toBeTruthy();
    expect(screen.getByText("Ajouter une image de fond")).toBeTruthy();
  });
});
