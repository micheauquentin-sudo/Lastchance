// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RelanceErreur } from "@/components/dashboard/relance-erreur";

/**
 * Ce qu'on garde ici : le refus se VOIT, l'absence de refus n'ajoute rien, et
 * le message reste du texte même quand il ressemble à du balisage. Le dernier
 * point est le seul qui puisse devenir une faille : le message vient de l'URL.
 */

afterEach(cleanup);

describe("RelanceErreur", () => {
  it("affiche le message dans une alerte", () => {
    render(<RelanceErreur message="Cette animation a déjà été relancée." />);

    expect(screen.getByRole("alert").textContent).toBe(
      "Cette animation a déjà été relancée.",
    );
  });

  it("ne rend rien sans message, ni pour une chaîne vide", () => {
    const { container, rerender } = render(<RelanceErreur />);
    expect(container.innerHTML).toBe("");

    rerender(<RelanceErreur message="   " />);
    expect(container.innerHTML).toBe("");

    rerender(<RelanceErreur message={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("prend le premier élément quand l'URL répète le paramètre", () => {
    render(<RelanceErreur message={["Source introuvable.", "bruit"]} />);

    expect(screen.getByRole("alert").textContent).toBe("Source introuvable.");
    expect(screen.queryByText(/bruit/)).toBeNull();
  });

  it("rend inerte un message qui ressemble à du balisage", () => {
    const charge = '<img src=x onerror="alert(1)">';
    render(<RelanceErreur message={charge} />);

    const alerte = screen.getByRole("alert");
    // Le texte est là, mais aucune balise n'a été créée : React a échappé.
    expect(alerte.textContent).toBe(charge);
    expect(alerte.querySelector("img")).toBeNull();
    expect(alerte.innerHTML).not.toContain("<img");
  });
});
