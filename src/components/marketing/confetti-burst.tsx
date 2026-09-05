"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Explosion de confettis, maison et sans dépendance.
 *
 * Tout le mouvement est porté par UNE animation CSS (`k-confetti`, dans
 * `globals.css`) paramétrée par des variables par particule : pas de boucle
 * `requestAnimationFrame`, donc rien à annuler, rien qui puisse continuer à
 * tourner après coup. Le composant n'existe que le temps du vol — le parent le
 * monte au clic et le démonte sur `onDone`. Aucun confetti en vol = aucun coût.
 *
 * Le tirage aléatoire est posé sur le DOM depuis un effet, jamais rendu :
 * `Math.random` pendant le rendu rendrait le composant impur, et un rendu
 * concurrent redistribuerait les confettis en plein vol. Les particules
 * naissent donc sans dimensions — invisibles — et l'effet de disposition les
 * habille avant la peinture.
 *
 * Purement décoratif : `aria-hidden`, inerte au pointeur. Le parent ne le monte
 * pas du tout sous « mouvement réduit » : la récompense (le code) ne dépend
 * jamais de l'animation.
 */

/** Charte kermesse + la teinte du décor au moment du clic. */
const PALETTE = [
  "var(--color-k-yellow)",
  "var(--color-k-pink)",
  "var(--color-k-blue)",
  "var(--color-k-orange)",
  "var(--color-k-green)",
  "var(--backdrop-accent, var(--color-k-orange))",
  "var(--backdrop-accent, var(--color-k-pink))",
];

const COUNT = 32;
/** Durée du vol le plus long, retard maximal compris. */
const LIFETIME_MS = 1250;

/** Habille une particule d'un tirage neuf. */
function dress(node: HTMLElement) {
  const angle = Math.random() * Math.PI * 2;
  const distance = 55 + Math.random() * 95;
  const size = 6 + Math.random() * 7;
  const round = Math.random() < 0.4;
  node.style.width = `${size.toFixed(1)}px`;
  node.style.height = `${(size * (round ? 1 : 1.6)).toFixed(1)}px`;
  node.style.borderRadius = round ? "50%" : "2px";
  node.style.backgroundColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  node.style.animationDelay = `${(Math.random() * 110).toFixed(0)}ms`;
  node.style.animationDuration = `${(780 + Math.random() * 360).toFixed(0)}ms`;
  node.style.setProperty("--k-cx", `${(Math.cos(angle) * distance).toFixed(1)}px`);
  /* Élan initial vers le haut : sans lui, la moitié des confettis part vers le
     bas et l'explosion ressemble à une fuite. */
  node.style.setProperty(
    "--k-cy",
    `${(Math.sin(angle) * distance * 0.8 - 45).toFixed(1)}px`,
  );
  node.style.setProperty("--k-cr", `${(Math.random() * 900 - 450).toFixed(0)}deg`);
}

type ConfettiBurstProps = {
  /** Appelé une fois le dernier confetti retombé — le parent démonte alors. */
  onDone: () => void;
};

export function ConfettiBurst({ onDone }: ConfettiBurstProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    for (const node of Array.from(host.children)) {
      if (node instanceof HTMLElement) dress(node);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(onDone, LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-[4] block h-0 w-0"
    >
      {Array.from({ length: COUNT }, (_, i) => (
        <span key={i} className="k-confetti absolute block" />
      ))}
    </span>
  );
}
