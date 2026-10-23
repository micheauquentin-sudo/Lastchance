"use client";

import React, { useState } from "react";
import { ConfettiBurst } from "./confetti-burst";
import { Magnetic } from "./magnetic";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface InteractiveScratchCardProps {
  className?: string;
}

/**
 * Carte à Gratter Dorée Interactive (Inspiration Fields Good / Kermesse).
 * - Objet physique tactile avec film doré brillant brossé
 * - Grattage interactif au clic ou glissement
 * - Révélation d'un gain commerçant réel avec confettis
 * - Bouton kermesse pour rejouer ou tester une autre mécanique
 */
export function InteractiveScratchCard({ className = "" }: InteractiveScratchCardProps) {
  const [scratched, setScratched] = useState(false);
  const [burst, setBurst] = useState(0);

  const handleScratch = () => {
    if (!scratched) {
      setScratched(true);
      setBurst((prev) => prev + 1);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScratched(false);
  };

  return (
    <div className={`relative mx-auto max-w-sm select-none ${className}`}>
      {/* Halo lumineux d'or forain */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl bg-[radial-gradient(circle_at_50%_50%,rgba(255,215,0,0.35),transparent_70%)] blur-xl"
      />

      {/* Carte physique avec bordure kermesse 3px et ombre dure */}
      <div
        onClick={handleScratch}
        className="group relative cursor-pointer overflow-hidden rounded-3xl border-[3px] border-[#181512] bg-[#FFF9EB] p-5 shadow-[0_6px_0_#181512] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_8px_0_#181512] active:translate-y-0.5 active:shadow-[0_3px_0_#181512]"
      >
        {/* En-tête du ticket */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#181512]/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#181512] bg-[#FFE600] text-sm shadow-[0_2px_0_#181512]">
              ★
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-[#181512]" style={DISPLAY}>
              Ticket d&apos;Or Kermesse
            </span>
          </div>
          <span className="rounded-full border border-[#181512] bg-[#FF5C93] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
            100% Gagnant
          </span>
        </div>

        {/* Corps du ticket */}
        <div className="my-4 text-center">
          <h4 className="text-lg font-black text-[#181512]" style={DISPLAY}>
            GRATTEZ AVEC LE DOIGT !
          </h4>
          <p className="mt-0.5 text-xs font-bold text-[#181512]/70">
            {scratched ? "Félicitations, gain débloqué !" : "Touchez pour révéler le lot instantané"}
          </p>
        </div>

        {/* Zone de grattage tactile */}
        <div className="relative mx-auto flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-[#181512] bg-gradient-to-br from-[#FFE600] via-[#FFD700] to-[#FFA500] p-4 shadow-inner">
          {/* Couche du gain (dessous) */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-3xl animate-bounce">☕🥐</span>
            <div className="mt-1 text-base font-black tracking-tight text-[#181512]" style={DISPLAY}>
              1 CAFÉ &amp; CROISSANT OFFERTS
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#181512]/80">
              Code: LC-GOLD-777
            </span>
          </div>

          {/* Film protecteur doré brossé (dessus) */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-tr from-[#D4AF37] via-[#F3E5AB] to-[#AA771C] transition-all duration-500 ${
              scratched
                ? "pointer-events-none opacity-0 scale-105 blur-sm"
                : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-1.5 rounded-full border border-[#181512] bg-white/90 px-3 py-1 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#FF6B35] animate-ping" />
              <span className="text-xs font-black uppercase tracking-wider text-[#181512]">
                ✨ Gratter ici ✨
              </span>
            </div>
            <span className="mt-2 text-[10px] font-bold text-[#181512]/60">
              Cliquez ou glissez
            </span>
          </div>
        </div>

        {/* Pied du ticket avec bouton réinitialiser */}
        <div className="mt-4 flex items-center justify-between pt-2">
          <span className="text-[11px] font-bold text-[#181512]/60">
            Valable 7 jours en caisse
          </span>
          {scratched && (
            <Magnetic>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border-2 border-[#181512] bg-white px-3 py-1 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] hover:bg-[#FFE600] active:translate-y-0.5 active:shadow-none"
              >
                Rejouer ↺
              </button>
            </Magnetic>
          )}
        </div>

        {/* Effet confettis natif Lastchance */}
        {burst > 0 && <ConfettiBurst onDone={() => {}} />}
      </div>
    </div>
  );
}
