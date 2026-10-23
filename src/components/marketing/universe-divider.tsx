"use client";

import React from "react";

export interface UniverseDividerProps {
  /** Couleur de remplissage de la section inférieure */
  bottomColor: string;
  /** Style de la ligne de découpe : fin, doux et élégant */
  variant?: "curve" | "wave" | "scallop" | "clouds";
  /** Badge discret annonçant le changement d'univers */
  badge?: {
    icon: string;
    title: string;
    subtitle?: string;
    accentColor?: string;
  };
  className?: string;
}

/**
 * Transitions fines, fluides et simples entre chaque univers thématique du site.
 * - Ligne fine et discrète (stroke 1.5px, pas de gros aplats noirs lourds)
 * - Badge flottant d'entrée de zone pour comprendre instantanément le changement d'univers
 * - Respect rigoureux de la DA kermesse / néo-brutaliste épurée
 */
export function UniverseDivider({
  bottomColor,
  variant = "curve",
  badge,
  className = "",
}: UniverseDividerProps) {
  return (
    <div className={`relative w-full overflow-visible leading-none select-none z-20 ${className}`}>
      {/* Badge central délicat signalant la nouvelle zone */}
      {badge && (
        <div className="relative z-30 flex justify-center -mb-2.5 sm:-mb-3 pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#181512] bg-white px-3.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:scale-105">
            <span className="text-xs sm:text-sm">{badge.icon}</span>
            <span>{badge.title}</span>
            {badge.subtitle && (
              <span className="hidden sm:inline font-bold text-[#181512]/60">
                · {badge.subtitle}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 1. Ligne en courbe douce et fluide */}
      {variant === "curve" && (
        <svg
          viewBox="0 0 1440 26"
          preserveAspectRatio="none"
          className="w-full h-5 sm:h-6 block"
        >
          <path
            d="M0,0 C480,24 960,24 1440,0 L1440,26 L0,26 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* 2. Ligne en vague asymétrique fine */}
      {variant === "wave" && (
        <svg
          viewBox="0 0 1440 26"
          preserveAspectRatio="none"
          className="w-full h-5 sm:h-6 block"
        >
          <path
            d="M0,14 C360,0 720,24 1080,8 C1240,0 1360,10 1440,16 L1440,26 L0,26 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* 3. Feston d'auvent kermesse allégé et fin */}
      {variant === "scallop" && (
        <svg
          viewBox="0 0 1440 22"
          preserveAspectRatio="none"
          className="w-full h-4 sm:h-5 block"
        >
          <path
            d="M0,0 
               Q36,18 72,0 Q108,18 144,0 Q180,18 216,0 Q252,18 288,0 
               Q324,18 360,0 Q396,18 432,0 Q468,18 504,0 Q540,18 576,0 
               Q612,18 648,0 Q684,18 720,0 Q756,18 792,0 Q828,18 864,0 
               Q900,18 936,0 Q972,18 1008,0 Q1044,18 1080,0 Q1116,18 1152,0 
               Q1188,18 1224,0 Q1260,18 1296,0 Q1332,18 1368,0 Q1404,18 1440,0 
               L1440,22 L0,22 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* 4. Nuages doux et délicats */}
      {variant === "clouds" && (
        <svg
          viewBox="0 0 1440 28"
          preserveAspectRatio="none"
          className="w-full h-5 sm:h-7 block"
        >
          <path
            d="M0,18 Q90,4 180,16 Q270,26 360,14 Q450,2 540,16 Q630,26 720,12 Q810,0 900,14 Q990,26 1080,12 Q1170,0 1260,14 Q1350,26 1440,16 L1440,28 L0,28 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
