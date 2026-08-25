// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const activerExperiencesVitrine = vi.fn();

vi.mock("@/actions/vitrine", () => ({ activerExperiencesVitrine }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { ExperiencesVisibilite } = await import("./experiences-visibilite");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  activerExperiencesVitrine.mockResolvedValue({
    ok: true,
    data: { active: true },
  });
});

describe("ExperiencesVisibilite", () => {
  it("explique que les deux jeux sont masqués et les affiche par un geste explicite", async () => {
    render(<ExperiencesVisibilite peutEditer />);

    expect(screen.getByRole("heading", { name: "Afficher vos jeux" })).toBeTruthy();
    expect(screen.getByText(/ni Portrait de la Bande ni Duo Miroir/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Afficher les jeux" }));

    await waitFor(() => expect(activerExperiencesVitrine).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toContain(
      "Jeux affichés sur votre vitrine.",
    );
  });

  it("ne propose pas de mutation à un rôle en lecture seule", () => {
    render(<ExperiencesVisibilite peutEditer={false} />);

    expect(screen.queryByRole("button", { name: "Afficher les jeux" })).toBeNull();
  });
});
