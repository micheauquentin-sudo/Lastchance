"use client";

import React from "react";

interface HeroCloudBackdropProps {
  className?: string;
}

const PANORAMA_SRC = "/panorama/cartoon-3d-panorama-4k.webp";
const PANORAMA_FALLBACK = "/panorama/cartoon-3d-panorama-4k.jpg";

/**
 * Nuage volumétrique 3D réaliste (style aérien Marmoris / Re-feel).
 * Forme cumulus multi-lobes avec dégradé soyeux, éclat spéculaire et ombre atmosphérique.
 */
function RealisticCloud({
  className = "",
  size = 220,
  opacity = 0.92,
  flip = false,
}: {
  className?: string;
  size?: number;
  opacity?: number;
  flip?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none transition-transform duration-700 ${className}`}
      style={{
        width: `${size}px`,
        opacity,
        transform: flip ? "scaleX(-1)" : undefined,
      }}
    >
      <svg
        viewBox="0 0 260 140"
        fill="none"
        className="w-full h-auto drop-shadow-[0_16px_28px_rgba(80,130,200,0.18)]"
      >
        <defs>
          <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.99" />
            <stop offset="55%" stopColor="#F8FBFF" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#D9EBFB" stopOpacity="0.88" />
          </linearGradient>
          <filter id="cloudGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Silhouette de cumulus dense et généreux */}
        <path
          d="
            M 45, 105 
            C 20, 105 10, 85 22, 65 
            C 18, 45 40, 30 65, 40 
            C 80, 15 125, 10 155, 30 
            C 180, 15 220, 28 230, 55 
            C 250, 70 248, 95 225, 105 
            Z
          "
          fill="url(#cloudGrad)"
          filter="url(#cloudGlow)"
        />
        {/* Éclat spéculaire blanc au sommet du dôme */}
        <path
          d="
            M 70, 42 
            C 85, 22 120, 18 145, 32 
            C 135, 22 100, 20 80, 36 
            Z
          "
          fill="#FFFFFF"
          fillOpacity="0.75"
        />
      </svg>
    </div>
  );
}

/**
 * Décor dans les nuages strictement réservé au Hero.
 * - Intègre le panorama panoramique céleste
 * - Déploie les nuages volumétriques 3D flottants en apesanteur
 * - Voile de lisibilité pour contraste textuel parfait
 */
export function HeroCloudBackdrop({ className = "" }: HeroCloudBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden ${className}`}
    >
      {/* 1. Panorama ciel et village en arrière-plan */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PANORAMA_SRC}
        onError={(e) => {
          if (e.currentTarget.src !== PANORAMA_FALLBACK) {
            e.currentTarget.src = PANORAMA_FALLBACK;
          }
        }}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="h-full w-full object-cover object-[center_18%] opacity-90"
      />

      {/* 2. Nuages volumétriques flottants au premier plan (aériens & dynamiques) */}
      <div className="absolute -top-6 -left-10 z-10 animate-drift-right hidden sm:block">
        <RealisticCloud size={270} opacity={0.95} />
      </div>

      <div className="absolute top-10 -right-12 z-10 animate-drift-left hidden sm:block">
        <RealisticCloud size={300} opacity={0.92} flip />
      </div>

      <div className="absolute top-52 -left-6 z-10 animate-float-slow">
        <RealisticCloud size={190} opacity={0.88} />
      </div>

      <div className="absolute top-64 -right-6 z-10 animate-float-reverse">
        <RealisticCloud size={210} opacity={0.88} flip />
      </div>

      <div className="absolute -bottom-8 left-1/4 z-10 animate-float-slow hidden md:block">
        <RealisticCloud size={240} opacity={0.85} />
      </div>

      <div className="absolute -bottom-10 right-1/4 z-10 animate-float-reverse hidden md:block">
        <RealisticCloud size={260} opacity={0.85} flip />
      </div>

      {/* 3. Voile d'éclaircissement très doux pour lisibilité */}
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[0.5px]" />

      {/* 4. Dégradé supérieur pour la navigation */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/70 via-white/25 to-transparent" />

      {/* 5. Fondu inférieur doux */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/60 via-white/20 to-transparent" />
    </div>
  );
}
