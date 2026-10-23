"use client";

import React from "react";

interface WorldConnectorProps {
  icon: string;
  label: string;
  step?: string;
  className?: string;
}

/**
 * Connecteur vertical subtil et raffiné ("Le Fil d'Ariane du Joueur").
 * Au lieu de barrer l'écran avec une ligne horizontale qui crée des blocs séparés,
 * ce connecteur vertical guide le regard et matérialise le passage d'une attraction à l'autre
 * avec une finesse graphique absolue.
 */
export function WorldConnector({
  icon,
  label,
  step,
  className = "",
}: WorldConnectorProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative z-20 flex flex-col items-center justify-center -my-3 sm:-my-4 select-none pointer-events-none ${className}`}
    >
      {/* 1. Ligne pointillée supérieure */}
      <div className="h-6 sm:h-10 w-0 border-r-[2px] border-dashed border-[#181512]/25" />

      {/* 2. Balise de passage fine & délicate */}
      <div className="my-1.5 flex items-center gap-2 rounded-full border-[1.5px] border-[#181512] bg-white/95 backdrop-blur-md px-3.5 py-1 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512] transition-transform">
        <span className="text-xs sm:text-sm">{icon}</span>
        {step && (
          <span className="rounded-full bg-[#181512]/10 px-1.5 py-0.2 text-[9px] font-extrabold text-[#181512]">
            {step}
          </span>
        )}
        <span>{label}</span>
      </div>

      {/* 3. Ligne pointillée inférieure */}
      <div className="h-6 sm:h-10 w-0 border-r-[2px] border-dashed border-[#181512]/25" />
    </div>
  );
}
