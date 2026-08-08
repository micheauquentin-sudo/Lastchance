// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { annoncerToast, lireToasts, MAX_TOASTS, viderToasts } from "@/lib/toast-bus";
import {
  DUREE_TOAST_MS,
  ToastEnregistrement,
} from "@/components/ui/toast-enregistrement";

/**
 * LE SEUL SIGNAL QUI RESTE QUAND LE BOUTON DISPARAÎT.
 *
 * Avec l'enregistrement automatique, il n'y a plus de bouton « Enregistrer » à
 * regarder. Ce bandeau est donc la preuve que le geste est parti — et pour un
 * commerçant qui n'utilise pas la souris, cette preuve est un rôle ARIA ou
 * rien. D'où les deux vérifications non cosmétiques : `status` (poli) pour un
 * succès annoncé pendant la frappe, `alert` (assertif) pour un échec qui
 * demande un geste.
 */

beforeEach(() => {
  viderToasts();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  viderToasts();
});

function annoncer(message: string, ton?: "succes" | "erreur") {
  act(() => {
    annoncerToast({ message, ton });
  });
}

describe("ToastEnregistrement", () => {
  it("affiche le message annoncé après le montage", () => {
    render(<ToastEnregistrement />);
    expect(screen.queryByText("Enregistré.")).toBeNull();

    annoncer("Enregistré.");
    expect(screen.getByText("Enregistré.")).toBeTruthy();
  });

  it("annonce un succès POLIMENT et un échec ASSERTIVEMENT", () => {
    render(<ToastEnregistrement />);
    annoncer("Enregistré.", "succes");
    annoncer("Non enregistré.", "erreur");

    const succes = screen.getByRole("status");
    expect(succes.textContent).toBe("Enregistré.");
    expect(succes.getAttribute("aria-live")).toBe("polite");

    const echec = screen.getByRole("alert");
    expect(echec.textContent).toBe("Non enregistré.");
    // `alert` porte déjà `assertive` : ne pas le rétrograder en `polite`, ce
    // qui mettrait le refus en file derrière la frappe en cours.
    expect(echec.getAttribute("aria-live")).toBeNull();
  });

  it("s'efface tout seul au bout du délai", () => {
    render(<ToastEnregistrement />);
    annoncer("Enregistré.");

    act(() => {
      vi.advanceTimersByTime(DUREE_TOAST_MS - 100);
    });
    expect(screen.queryByText("Enregistré.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Enregistré.")).toBeNull();
    expect(lireToasts()).toEqual([]);
  });

  it("chaque ligne a SON minuteur : la seconde ne meurt pas avec la première", () => {
    render(<ToastEnregistrement />);
    annoncer("Premier");
    act(() => {
      vi.advanceTimersByTime(DUREE_TOAST_MS - 200);
    });
    annoncer("Second");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Premier")).toBeNull();
    expect(screen.queryByText("Second")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(DUREE_TOAST_MS);
    });
    expect(screen.queryByText("Second")).toBeNull();
  });

  it("empile au plus trois messages — le plus ancien sort", () => {
    render(<ToastEnregistrement />);
    for (const message of ["A", "B", "C", "D"]) annoncer(message);

    expect(screen.getAllByRole("status")).toHaveLength(MAX_TOASTS);
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.queryByText("D")).toBeTruthy();
  });

  it("laisse passer les clics : le bandeau flotte, il ne bloque pas l'écran", () => {
    // Un conteneur `fixed` en haut à droite couvre une bande de l'interface.
    // Sans `pointer-events-none`, il avalerait les clics du contenu dessous —
    // y compris quand il est vide.
    render(<ToastEnregistrement />);
    const conteneur = screen.getByTestId("toasts");
    expect(conteneur.className).toContain("pointer-events-none");
  });

  it("garde sa région montée quand il n'y a rien à dire", () => {
    // Une région live insérée en même temps que son texte n'est pas annoncée
    // de façon fiable : le conteneur existe donc dès le montage du layout.
    render(<ToastEnregistrement />);
    expect(screen.getByTestId("toasts")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("cesse d'écouter au démontage — pas de fuite d'abonnement", () => {
    const { unmount } = render(<ToastEnregistrement />);
    unmount();
    // Sans désabonnement, React avertirait d'une mise à jour hors arbre ;
    // ici l'annonce doit simplement ne toucher personne.
    expect(() => annoncerToast({ message: "Après" })).not.toThrow();
    expect(lireToasts()).toHaveLength(1);
  });
});
