"use client";

import React from "react";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface Continuous3dRibbonProps {
  className?: string;
}

/**
 * Le Ruban 3D Fluide Continu ("The Rollercoaster Ribbon" — Inspiration Marmoris & Re-feel).
 * - Colonne vertébrale visuelle qui traverse toute la page sans coupure
 * - Effet de tube 3D volumétrique laqué rose bonbon avec reflets caustiques
 * - Élimine la sensation de "sections séparées" en guidant le regard
 * - Flottement doux et micro-tampons forains attachés à la trajectoire
 */
export function Continuous3dRibbon({ className = "" }: Continuous3dRibbonProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 bottom-0 z-30 overflow-hidden select-none ${className}`}
    >
      {/* SVG haute résolution avec lueur et dégradé volumétrique */}
      <svg
        viewBox="0 0 1440 4800"
        fill="none"
        preserveAspectRatio="none"
        className="w-full h-full opacity-85"
      >
        <defs>
          {/* Dégradé cylindrique pour donner un volume 3D tubulaire */}
          <linearGradient id="tubeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D93B73" />
            <stop offset="25%" stopColor="#FF7AA8" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#FF5C93" />
            <stop offset="100%" stopColor="#A81E48" />
          </linearGradient>

          {/* Ombre portée douce sur le fond */}
          <filter id="ribbonShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#181512" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Tracé de l'onde 3D continue traversant le site en zigzag doux */}
        <path
          d="
            M -80, 280
            C 400, 320 850, 480 1150, 680
            C 1400, 850 1420, 1150 1200, 1380
            C 920, 1650 350, 1550 180, 1850
            C 20, 2150 150, 2450 520, 2720
            C 950, 3020 1380, 3150 1320, 3550
            C 1250, 3950 680, 4120 320, 4350
            C 80, 4520 -50, 4680 -80, 4800
          "
          stroke="url(#tubeGradient)"
          strokeWidth="36"
          strokeLinecap="round"
          filter="url(#ribbonShadow)"
        />

        {/* Reflet de brillance intérieure ultra-fine */}
        <path
          d="
            M -80, 280
            C 400, 320 850, 480 1150, 680
            C 1400, 850 1420, 1150 1200, 1380
            C 920, 1650 350, 1550 180, 1850
            C 20, 2150 150, 2450 520, 2720
            C 950, 3020 1380, 3150 1320, 3550
            C 1250, 3950 680, 4120 320, 4350
            C 80, 4520 -50, 4680 -80, 4800
          "
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeOpacity="0.65"
        />
      </svg>

      {/* Badges stickers forains fixés en apesanteur le long du trajet du ruban */}
      <div className="absolute top-[680px] right-[8%] sm:right-[15%] rotate-[-6deg] hidden md:block">
        <div className="flex items-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FFE600] px-4 py-1.5 shadow-[0_4px_0_#181512]">
          <span className="text-sm">⚡</span>
          <span className="text-xs font-black uppercase tracking-wider text-[#181512]" style={DISPLAY}>
            1 Scan en Caisse = Joué
          </span>
        </div>
      </div>

      <div className="absolute top-[1820px] left-[5%] sm:left-[10%] rotate-[8deg] hidden md:block">
        <div className="flex items-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FF5C93] px-4 py-1.5 text-white shadow-[0_4px_0_#181512]">
          <span className="text-sm">🎟️</span>
          <span className="text-xs font-black uppercase tracking-wider text-white" style={DISPLAY}>
            Zéro Application à Télécharger
          </span>
        </div>
      </div>

      <div className="absolute top-[3150px] right-[6%] sm:right-[12%] rotate-[-4deg] hidden md:block">
        <div className="flex items-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#10B981] px-4 py-1.5 text-white shadow-[0_4px_0_#181512]">
          <span className="text-sm">💳</span>
          <span className="text-xs font-black uppercase tracking-wider text-white" style={DISPLAY}>
            Apple &amp; Google Wallet 1-Clic
          </span>
        </div>
      </div>
    </div>
  );
}
