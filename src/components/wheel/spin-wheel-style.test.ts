import { describe, expect, it } from "vitest";
import { resolveWheelStyle } from "@/lib/wheel-style";
import { SPIN_WHEEL_STYLE } from "./spin-wheel-style";

/**
 * `SPIN_WHEEL_STYLE` recopie les défauts de `wheelStyleSchema` pour rester
 * zod-free côté client (voir l'en-tête de `spin-wheel-style.ts`). Une copie de
 * valeurs par défaut est une seconde source de vérité : sans cette garde, un
 * défaut modifié dans le schéma laisserait les quatre roues offertes sur
 * l'ancienne valeur, en silence, et la divergence ne se verrait qu'à l'œil sur
 * un écran de joueur.
 *
 * Le test tourne en Node : zod y est gratuit, c'est le client qu'on protège.
 */
describe("SPIN_WHEEL_STYLE", () => {
  it("ne diverge pas des défauts du schéma", () => {
    // Les six champs délibérément choisis pour la roue offerte, et eux seuls.
    const choix = {
      ring: SPIN_WHEEL_STYLE.ring,
      ringColor: SPIN_WHEEL_STYLE.ringColor,
      hub: SPIN_WHEEL_STYLE.hub,
      hubColor: SPIN_WHEEL_STYLE.hubColor,
      pointerColor: SPIN_WHEEL_STYLE.pointerColor,
      labelColor: SPIN_WHEEL_STYLE.labelColor,
    };
    expect(SPIN_WHEEL_STYLE).toEqual(resolveWheelStyle(choix));
  });
});
