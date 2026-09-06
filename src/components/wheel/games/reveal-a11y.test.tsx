// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiceReveal } from "@/components/wheel/games/dice-reveal";
import { SlotReveal } from "@/components/wheel/games/slot-reveal";
import { FlipCardReveal } from "@/components/wheel/games/flip-card-reveal";
import { WheelSvg } from "@/components/wheel/wheel-svg";
import { resolveWheelStyle } from "@/lib/wheel-style";

/**
 * `aria-disabled` SANS `disabled` EST UNE ANNONCE QUE LE DOM DÉMENT.
 *
 * Les sept révélations annonçaient « indisponible » à un lecteur d'écran sur
 * des boutons que le clavier atteignait encore et que le doigt pouvait retaper
 * pendant l'animation. Les gardes de rentrée (`pickedRef`, `startedRef`)
 * empêchaient déjà tout second effet — ce n'est donc pas un défaut
 * d'intégrité, c'est un écran qui dit le contraire de ce qu'il fait.
 */

/** Le `matchMedia` de happy-dom, réglable par cas. */
function poserPreferenceMouvement(reduit: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduit && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // unsafe-cast-justification: doublure de `matchMedia` réduite aux 4 membres que le hook lit ; l'implémenter en entier n'ajouterait rien au test
  })) as unknown as typeof window.matchMedia;
}

const outcome = {
  label: "Un café offert",
  description: "À retirer au comptoir",
  isLosing: false,
  claimToken: "jeton",
} as never;

beforeEach(() => poserPreferenceMouvement(false));
afterEach(cleanup);

describe("Révélations — le bouton est VRAIMENT désactivé une fois engagé", () => {
  it("le dé : après le lancer, le bouton porte `disabled`, pas seulement l'attribut ARIA", () => {
    vi.useFakeTimers();
    render(<DiceReveal outcome={outcome} onRevealed={() => undefined} />);
    const bouton = screen.getByRole("button", { name: "Lancer le dé" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);

    fireEvent.click(bouton);
    expect(bouton.disabled).toBe(true);
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    vi.useRealTimers();
  });

  it("les rouleaux : même règle", () => {
    vi.useFakeTimers();
    render(<SlotReveal outcome={outcome} onRevealed={() => undefined} />);
    const bouton = screen.getByRole("button", {
      name: "Lancer les rouleaux",
    }) as HTMLButtonElement;
    fireEvent.click(bouton);
    expect(bouton.disabled).toBe(true);
    vi.useRealTimers();
  });

  it("la carte à retourner : une fois retournée, elle n'est plus actionnable", () => {
    vi.useFakeTimers();
    render(<FlipCardReveal outcome={outcome} onRevealed={() => undefined} />);
    const bouton = screen.getByRole("button", {
      name: "Retourner la carte",
    }) as HTMLButtonElement;
    fireEvent.click(bouton);
    expect(
      (screen.getByRole("button", { name: "Carte retournée" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    vi.useRealTimers();
  });
});

/**
 * LA ROUE SOUS `prefers-reduced-motion`.
 *
 * La transition est un STYLE INLINE : le bloc `@media` de `globals.css` ne
 * l'atteint pas. Tant que la neutralisation dépendait des cinq appelants, le
 * mieux qu'ils obtenaient était un TOUR COMPLET en 300 ms — plus violent, pas
 * plus calme. Le composant lit désormais la préférence lui-même.
 */
describe("WheelSvg — le mouvement réduit est décidé DANS le composant", () => {
  const style = resolveWheelStyle({});
  const segments = [
    { id: "a", label: "Café", color: "#112233" },
    { id: "b", label: "Thé", color: "#445566" },
  ];

  it("sans préférence, la transition de rotation existe pendant le tour", () => {
    const { container } = render(
      <WheelSvg segments={segments} rotation={720} spinning spinDurationMs={4400} style={style} />,
    );
    expect(container.innerHTML).toContain("transform 4400ms");
  });

  it("sous `prefers-reduced-motion`, AUCUNE transition — même si l'appelant l'oublie", () => {
    poserPreferenceMouvement(true);
    const { container } = render(
      <WheelSvg segments={segments} rotation={720} spinning spinDurationMs={4400} style={style} />,
    );
    expect(container.innerHTML).not.toContain("transform 4400ms");
    expect(container.innerHTML).not.toContain("transform 300ms");
  });
});
