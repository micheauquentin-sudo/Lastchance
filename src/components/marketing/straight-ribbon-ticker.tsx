"use client";

import React from "react";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

/**
 * Bandeau défilant horizontal droit en pleine largeur, placé directement sous le Hero.
 * - Bordures franches supérieure et inférieure
 * - Fond rose pâle simple et élégant (fini le jaune flashy)
 * - Défilement continu et fluide
 */
export function StraightRibbonTicker({
  bgColor = "bg-[#FFD6E8]",
  textColor = "text-[#181512]",
  borderColor = "border-[#181512]",
  className = "",
}: {
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  className?: string;
}) {
  const line =
    "ILS SCANNENT ★ ILS JOUENT ★ ILS GAGNENT ★ ILS REVIENNENT ★ ⚡ 1 SCAN EN CAISSE ★ 📱 SANS APPLI · 100% WEB ★ 🍀 TOUTES LES CHANCES ★ ";

  return (
    <div
      role="region"
      aria-label="Informations clés défilantes"
      className={`ticker relative z-20 w-full overflow-hidden select-none border-y-[3px] ${borderColor} ${bgColor} py-3.5 sm:py-4 shadow-sm ${className}`}
    >
      <div className="flex w-max whitespace-nowrap overflow-hidden">
        <div
          className={`ticker-track flex w-max whitespace-nowrap text-base sm:text-xl font-black tracking-[0.08em] ${textColor}`}
          style={DISPLAY}
        >
          <span className="pr-12">{line.repeat(2)}</span>
          <span className="pr-12">{line.repeat(2)}</span>
        </div>
      </div>
    </div>
  );
}
