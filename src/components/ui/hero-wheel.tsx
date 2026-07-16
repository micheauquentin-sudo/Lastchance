"use client";

import { useRef, useState } from "react";
import {
  WheelSvg,
  WheelPointer,
  type WheelSegment,
} from "@/components/wheel/wheel-svg";

/**
 * Roue de démonstration du hero — la vraie roue du produit (WheelSvg),
 * cliquable pour montrer l'expérience en une interaction.
 * Style volontairement épuré : pas d'ampoules, couleurs fixes pendant
 * la rotation, palette de la direction artistique.
 */

const DEMO_SEGMENTS: WheelSegment[] = [
  { id: "1", label: "-10 %", color: "#E17A5F" },
  { id: "2", label: "Café offert", color: "#4ECDC4" },
  { id: "3", label: "Dessert offert", color: "#6BCF7F" },
  { id: "4", label: "-5 %", color: "#FFB84D" },
  { id: "5", label: "Surprise", color: "#9B8FFF" },
  { id: "6", label: "Retentez !", color: "#FF9F7B" },
];

const DEMO_STYLE = {
  ring: "classic" as const,
  ringColor: "#1a1a2e",
  lights: false,
  segmentBorderColor: "#fbf8f5",
  segmentBorderWidth: 3,
  labelColor: "#ffffff",
  labelOutline: true,
  hub: "dot" as const,
  hubColor: "#1a1a2e",
};

const SPIN_DURATION_MS = 4400;

export function HeroWheel() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    // 4 tours complets + angle aléatoire, toujours vers l'avant
    const extra = 4 * 360 + Math.floor(Math.random() * 360);
    setRotation((r) => r + extra);
    timeoutRef.current = setTimeout(() => setSpinning(false), SPIN_DURATION_MS + 200);
  };

  return (
    <div className="relative w-full max-w-sm mx-auto select-none">
      <div className="relative">
        <WheelPointer color="#E17A5F" variant="triangle" />
        <button
          type="button"
          onClick={spin}
          aria-label="Faire tourner la roue de démonstration"
          className="block w-full cursor-pointer rounded-full transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-light"
        >
          <WheelSvg
            segments={DEMO_SEGMENTS}
            rotation={rotation}
            spinning={spinning}
            spinDurationMs={SPIN_DURATION_MS}
            style={DEMO_STYLE}
          />
        </button>
      </div>
      <p className="mt-5 text-center text-sm font-medium text-text-secondary">
        {spinning ? "La roue tourne…" : "Cliquez sur la roue pour l'essayer"}
      </p>
    </div>
  );
}
