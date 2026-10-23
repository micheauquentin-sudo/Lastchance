"use client";

import React from "react";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

/**
 * Ruban Serpentin Dynamique en Pleine Largeur (Inspiration MILU / HOLY) :
 * - Traverse tout l'écran avec une onde fluide et joyeuse
 * - Bande de texte défilant en continu ("ILS SCANNENT ★ ILS JOUENT ★ ILS GAGNENT...")
 * - Tampons graphiques ronds rétro-modernes ("100% MOBILE", "0% COMMISSION", "EN 1 SCAN")
 */
export function WavyRibbonTicker() {
  const line = "ILS SCANNENT ★ ILS JOUENT ★ ILS GAGNENT ★ ILS REVIENNENT ★ ⚡ 1 SCAN EN CAISSE ★ 📱 SANS APPLI · 100% WEB ★ 🍀 TOUTES LES CHANCES ★ ".repeat(3);

  return (
    <div className="relative w-full overflow-hidden py-4 sm:py-6 select-none pointer-events-none">
      {/* Conteneur du ruban incliné et fluide */}
      <div className="relative w-[110%] -left-[5%] rotate-[-2.2deg] transition-transform duration-300">
        {/* Ruban jaune kermesse vibrant avec ombre douce */}
        <div className="relative rounded-full border-2 border-k-ink bg-k-yellow py-2.5 sm:py-3.5 shadow-[0_12px_28px_rgba(33,29,22,0.12)]">
          {/* Ticker défilant */}
          <div className="flex w-max whitespace-nowrap overflow-hidden">
            <div
              className="ticker-track flex w-max whitespace-nowrap text-base sm:text-xl font-black tracking-[0.08em] text-k-ink"
              style={DISPLAY}
            >
              <span className="pr-12">{line}</span>
              <span className="pr-12">{line}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
