"use client";

import React from "react";

export type KermesseTransitionVariant =
  | "ticket-gold"
  | "circus-awning"
  | "wave"
  | "scallop"
  | "clouds";

interface KermesseWorldTransitionProps {
  /** Couleur de la section supérieure (au-dessus de la démarcation) */
  topColor?: string;
  /** Couleur de la section inférieure (remplissage du dessous) */
  bottomColor: string;
  /** Forme de transition : ticket d'or forain grand format, auvent forain, vague, etc. */
  variant?: KermesseTransitionVariant;
  /** Données du Ticket d'Or Forain / Badge */
  badge?: {
    icon: string;
    stage?: string;
    title: string;
    subtitle?: string;
    ticketNumber?: string;
    ticketType?: string;
    ticketColor?: string;
    ticketGradient?: string;
    tagLeft?: string;
    tagRight?: string;
    badgeBg?: string;
    badgeText?: string;
  };
  className?: string;
}

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

// 16 points pour les ampoules sous les festons
const BULB_X = [
  45, 135, 225, 315, 405, 495, 585, 675, 765, 855, 945, 1035, 1125, 1215, 1305, 1395,
];

interface TicketTheme {
  gradientClass: string;
  accentColor: string;
  sealColor: string;
  sealText: string;
  rivetBg: string;
  buttonShadow: string;
}

const TICKET_PALETTES: Record<string, TicketTheme> = {
  // 1. Jaune Solaire Arcade / Kermesse (Stage 1 Jeux)
  "#FFF385": {
    gradientClass: "from-[#FFFDE7] via-[#FFF385] to-[#FDD835]",
    accentColor: "#F59E0B",
    sealColor: "bg-[#10B981]",
    sealText: "text-white",
    rivetBg: "#FFE600",
    buttonShadow: "#FFE600",
  },
  // 2. Vert Menthe Fraîche / Bistrot (Stage 2 Vitrine & Résa)
  "#BFF0D4": {
    gradientClass: "from-[#E6FFFA] via-[#BFF0D4] to-[#6EE7B7]",
    accentColor: "#10B981",
    sealColor: "bg-[#059669]",
    sealText: "text-white",
    rivetBg: "#10B981",
    buttonShadow: "#10B981",
  },
  // 3. Mauve / Lilas Cockpit Commerçant (Stage 3 Cockpit & ROI)
  "#EBDCFF": {
    gradientClass: "from-[#FAF5FF] via-[#EBDCFF] to-[#C4B5FD]",
    accentColor: "#A855F7",
    sealColor: "bg-[#7C3AED]",
    sealText: "text-white",
    rivetBg: "#A855F7",
    buttonShadow: "#A855F7",
  },
  // 4. Pêche / Abricot Chaud (Stage 4 Billetterie & Formules)
  "#FED7AA": {
    gradientClass: "from-[#FFF7ED] via-[#FED7AA] to-[#FDBA74]",
    accentColor: "#FB923C",
    sealColor: "bg-[#EA580C]",
    sealText: "text-white",
    rivetBg: "#FB923C",
    buttonShadow: "#FB923C",
  },
  // 5. Bleu Azur / Ciel Kiosque (Stage 5 FAQ & Aide)
  "#BAE6FD": {
    gradientClass: "from-[#F0F9FF] via-[#BAE6FD] to-[#7DD3FC]",
    accentColor: "#0284C7",
    sealColor: "bg-[#0284C7]",
    sealText: "text-white",
    rivetBg: "#0284C7",
    buttonShadow: "#0284C7",
  },
  // 6. Orange Pop Vif
  "#FF6B35": {
    gradientClass: "from-[#FFEDD5] via-[#FB923C] to-[#FF6B35]",
    accentColor: "#FF6B35",
    sealColor: "bg-[#C2410C]",
    sealText: "text-white",
    rivetBg: "#FF6B35",
    buttonShadow: "#FF6B35",
  },
};

function getTicketTheme(color?: string): TicketTheme {
  if (!color) {
    return TICKET_PALETTES["#FFF385"];
  }
  const upper = color.toUpperCase();
  if (TICKET_PALETTES[upper]) {
    return TICKET_PALETTES[upper];
  }
  for (const [key, value] of Object.entries(TICKET_PALETTES)) {
    if (key.toLowerCase() === color.toLowerCase()) {
      return value;
    }
  }
  return {
    gradientClass: "from-[#FFE082] via-[#FFD54F] to-[#FFCA28]",
    accentColor: "#F59E0B",
    sealColor: "bg-[#10B981]",
    sealText: "text-white",
    rivetBg: "#FFE600",
    buttonShadow: "#FFE600",
  };
}

/**
 * Transitions festives et foraines de la DA Kermesse :
 * - ticket-gold : Grand Ticket Forain VIP dont la couleur correspond à celle du bloc annoncé
 * - circus-awning : Auvent de chapiteau festonné avec ampoules guinguette
 * - wave / scallop / clouds : découpes cartoon néo-brutalistes
 */
export function KermesseWorldTransition({
  topColor = "transparent",
  bottomColor,
  variant = "ticket-gold",
  badge,
  className = "",
}: KermesseWorldTransitionProps) {
  const isTicketGold = variant === "ticket-gold";
  const isCircusAwning = variant === "circus-awning";
  const ticketTheme = getTicketTheme(badge?.ticketColor || bottomColor);

  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-visible leading-none select-none z-20 -mb-[1px] ${className}`}
      style={{ backgroundColor: topColor }}
    >
      {/* ═══════════════════════════════════════════════════════════════
         LE GRAND TICKET FORAIN VIP (COULEUR ASSORTIE AU BLOC VISÉ)
         ═══════════════════════════════════════════════════════════════ */}
      {isTicketGold && badge && (
        <div className="relative z-30 flex items-center justify-center w-full px-2 sm:px-4 lg:px-6 -mb-10 sm:-mb-14 md:-mb-16 lg:-mb-18 pointer-events-none">
          {/* CÔTÉ GAUCHE : Rail forain continu & Puce satellite connectée */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-2 lg:gap-3 min-w-0 pr-1 sm:pr-2">
            <div className="flex-1 h-0 border-t-[3px] border-dashed border-[#181512]/40" />
            {badge.tagLeft && (
              <div className="pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#181512] bg-[#FFFBEB] px-3 py-1.5 text-[11px] font-black text-[#181512] shadow-[0_3px_0_#181512] transition-transform hover:-translate-y-0.5">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: ticketTheme.accentColor }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: ticketTheme.accentColor }}
                  />
                </span>
                <span className="font-mono uppercase">{badge.tagLeft}</span>
              </div>
            )}
            <div className="w-4 lg:w-8 h-0 border-t-[3px] border-dashed border-[#181512]/70" />
            {/* Rivet / Œillet d'amarrage assorti */}
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-[#181512] shadow-[0_1.5px_0_#181512] flex-shrink-0"
              style={{ backgroundColor: ticketTheme.rivetBg }}
            />
          </div>

          {/* LE GRAND TICKET VIP NÉO-BRUTALISTE (COULEUR DU BLOC VISÉ) */}
          <div
            className={`pointer-events-auto relative w-full max-w-xl sm:max-w-3xl lg:max-w-5xl flex-shrink-0 -rotate-1 sm:-rotate-[1deg] rounded-3xl border-[3.5px] border-[#181512] bg-gradient-to-r ${
              badge.ticketGradient || ticketTheme.gradientClass
            } shadow-[0_10px_0_#181512] transition-all duration-300 hover:rotate-0 hover:-translate-y-1.5 hover:shadow-[0_14px_0_#181512]`}
          >
            {/* Shimmer / Reflet métallisé lumineux */}
            <div className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 opacity-60" />
            </div>

            {/* Cadre intérieur ouvragé façon grand billet forain */}
            <div className="relative flex flex-col sm:flex-row items-stretch overflow-hidden rounded-[20px] m-1 sm:m-2 border-2 border-dashed border-[#181512]/35 bg-white/50 backdrop-blur-[2px]">
              
              {/* SOUCHE GAUCHE : Talon de contrôle VIP avec Code-barres Forain */}
              <div className="relative hidden sm:flex flex-col justify-between items-center p-3.5 sm:p-5 border-r-2 border-dashed border-[#181512]/35 bg-black/[0.03] min-w-[130px] lg:min-w-[155px]">
                {/* Numéro de série forain */}
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#181512]/80 font-mono">
                  <span>🎟️</span>
                  <span>{badge.ticketNumber || "N° 04829"}</span>
                </div>
                
                {/* Code-barres forain stylisé */}
                <div className="my-2.5 flex items-center justify-center gap-[3px] h-9 sm:h-10 opacity-90">
                  <span className="w-1 h-full bg-[#181512] rounded-full" />
                  <span className="w-0.5 h-full bg-[#181512]" />
                  <span className="w-1.5 h-full bg-[#181512]" />
                  <span className="w-0.5 h-full bg-[#181512]" />
                  <span className="w-1 h-full bg-[#181512]" />
                  <span className="w-2.5 h-full bg-[#181512]" />
                  <span className="w-0.5 h-full bg-[#181512]" />
                  <span className="w-1.5 h-full bg-[#181512]" />
                  <span className="w-0.5 h-full bg-[#181512]" />
                  <span className="w-1 h-full bg-[#181512]" />
                </div>

                {/* Sceau d'admission forain */}
                <div
                  className={`rounded-full border-2 border-[#181512] px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black shadow-[0_1.5px_0_#181512] ${ticketTheme.sealColor} ${ticketTheme.sealText}`}
                >
                  ★ ADMISSION VIP ★
                </div>
              </div>

              {/* CORPS CENTRAL : Grand Titre, Sous-titre & Étape Kermesse */}
              <div className="flex-1 p-3.5 sm:p-5 lg:p-6 flex flex-col justify-center">
                {/* Bandeau d'en-tête du ticket */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {badge.stage && (
                      <span
                        className={`rounded-full border-2 border-[#181512] px-3 py-0.5 text-[11px] sm:text-xs font-black shadow-[0_2px_0_#181512] ${
                          badge.badgeBg || "bg-[#FF6B35]"
                        } ${badge.badgeText || "text-white"}`}
                      >
                        {badge.stage}
                      </span>
                    )}
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[#181512]/80">
                      {badge.ticketType || "★ BILLET PRIVILÈGE KERMESSE ★"}
                    </span>
                  </div>
                  <span className="text-[11px] sm:text-xs font-black text-[#181512]/60 hidden sm:inline-flex items-center gap-1">
                    <span>✨</span>
                    <span>ACCÈS ILLIMITÉ</span>
                  </span>
                </div>

                {/* Titre Principal & Pictogramme 3D */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="text-3xl sm:text-4xl lg:text-5xl drop-shadow-sm flex-shrink-0">
                    {badge.icon}
                  </span>
                  <div>
                    <h3
                      className="text-base sm:text-xl lg:text-2xl xl:text-3xl font-black text-[#181512] leading-tight"
                      style={DISPLAY}
                    >
                      {badge.title}
                    </h3>
                    {badge.subtitle && (
                      <p className="mt-1 text-xs sm:text-sm lg:text-base font-bold text-[#181512]/80 leading-snug">
                        {badge.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* CONTREMARQUE DROITE : Bouton d'accès forain & Perforation */}
              <div className="flex sm:flex-col justify-between sm:justify-center items-center p-3.5 sm:p-5 lg:p-6 border-t-2 sm:border-t-0 sm:border-l-2 border-dashed border-[#181512]/35 bg-black/[0.02] sm:min-w-[140px] lg:min-w-[170px]">
                <div className="hidden sm:block text-[9px] font-black uppercase tracking-widest text-[#181512]/60 mb-2">
                  CONTREMARQUE
                </div>
                <div
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#181512] px-4 py-2 sm:py-2.5 text-xs font-black text-white transition-transform hover:scale-105"
                  style={{ boxShadow: `0 3px 0 ${ticketTheme.buttonShadow}` }}
                >
                  <span>DÉCOUVRIR</span>
                  <span
                    className="text-sm font-black animate-pulse"
                    style={{ color: ticketTheme.buttonShadow }}
                  >
                    ➜
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* CÔTÉ DROIT : Œillet d'amarrage + Puce satellite connectée + Rail forain */}
          <div className="hidden md:flex flex-1 items-center justify-start gap-2 lg:gap-3 min-w-0 pl-1 sm:pl-2">
            {/* Rivet / Œillet d'amarrage assorti */}
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-[#181512] shadow-[0_1.5px_0_#181512] flex-shrink-0"
              style={{ backgroundColor: ticketTheme.rivetBg }}
            />
            <div className="w-4 lg:w-8 h-0 border-t-[3px] border-dashed border-[#181512]/70" />
            {badge.tagRight && (
              <div className="pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#181512] bg-[#FFFBEB] px-3 py-1.5 text-[11px] font-black text-[#181512] shadow-[0_3px_0_#181512] transition-transform hover:-translate-y-0.5">
                <span className="font-mono uppercase">{badge.tagRight}</span>
                <span className="text-xs">✨</span>
              </div>
            )}
            <div className="flex-1 h-0 border-t-[3px] border-dashed border-[#181512]/40" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         AUVENT FORAIN FESTONNÉ (Option circus-awning)
         ═══════════════════════════════════════════════════════════════ */}
      {isCircusAwning && badge && (
        <div className="relative z-30 flex flex-col items-center justify-center pt-2 -mb-3 sm:-mb-4 pointer-events-none">
          <div className="flex items-center justify-between w-48 sm:w-64 px-6 mb-[-5px]">
            <div className="w-1.5 h-5 rounded-full border-2 border-[#181512] bg-[#fcd34d]" />
            <div className="w-1.5 h-5 rounded-full border-2 border-[#181512] bg-[#fcd34d]" />
          </div>
          <div className="pointer-events-auto inline-flex items-center gap-2.5 sm:gap-3 rounded-2xl border-[3.5px] border-[#181512] bg-[#FFE600] px-5 sm:px-7 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-[#181512] shadow-[0_5px_0_#181512] transition-transform hover:-translate-y-1 hover:shadow-[0_7px_0_#181512]">
            <span className="text-xl sm:text-2xl drop-shadow-sm">{badge.icon}</span>
            {badge.stage && (
              <span
                className={`rounded-full border-[2px] border-[#181512] px-2.5 py-0.5 text-[11px] sm:text-xs font-black shadow-[0_2px_0_#181512] ${
                  badge.badgeBg || "bg-[#FF6B35]"
                } ${badge.badgeText || "text-white"}`}
              >
                {badge.stage}
              </span>
            )}
            <span className="tracking-tight text-sm sm:text-base font-black text-[#181512]" style={DISPLAY}>
              {badge.title}
            </span>
            <span className="text-sm font-black text-[#FF6B35]">➜</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         BADGE PAR DÉFAUT (Pour les autres variantes wave, scallop, clouds)
         ═══════════════════════════════════════════════════════════════ */}
      {!isTicketGold && !isCircusAwning && badge && (
        <div className="relative z-30 flex items-center justify-center -mb-5 sm:-mb-6 pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 sm:gap-2.5 rounded-full border-[3px] border-[#181512] bg-white px-4 sm:px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-[#181512] shadow-[0_4px_0_#181512] transition-transform hover:-translate-y-1 hover:shadow-[0_6px_0_#181512]">
            <span className="text-base sm:text-lg">{badge.icon}</span>
            {badge.stage && (
              <span
                className={`rounded-full border border-[#181512] px-2 py-0.5 text-[10px] sm:text-[11px] font-black ${
                  badge.badgeBg || "bg-[#FFE600]"
                } ${badge.badgeText || "text-[#181512]"}`}
              >
                {badge.stage}
              </span>
            )}
            <span className="tracking-tight font-black">{badge.title}</span>
            <span className="text-xs font-black text-[#FF6B35]">➜</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         DÉCOUPES VECTORIELLES SANS BANDE BLANCHE (Base rect = topColor)
         ═══════════════════════════════════════════════════════════════ */}

      {/* 1. DÉCOUPE VAGUE FLUIDE (Pour Ticket d'Or et Wave) */}
      {(isTicketGold || variant === "wave") && (
        <svg
          viewBox="0 0 1440 65"
          preserveAspectRatio="none"
          className="w-full h-12 sm:h-16 lg:h-20 block"
        >
          {/* Fond supérieur pour continuité absolue */}
          <rect width="1440" height="65" fill={topColor} />

          {/* Ombre portée néo-brutaliste de la vague */}
          <path
            d="M0,32 C340,66 700,-2 1060,54 C1240,72 1380,52 1440,36 L1440,65 L0,65 Z"
            fill="#181512"
          />
          {/* Corps de la vague avec bordure nette */}
          <path
            d="M0,27 C340,61 700,-7 1060,49 C1240,67 1380,47 1440,31 L1440,65 L0,65 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* 2. Auvent de Chapiteau Forain avec Ampoules Guinguette */}
      {isCircusAwning && (
        <svg
          viewBox="0 0 1440 65"
          preserveAspectRatio="none"
          className="w-full h-12 sm:h-16 block"
        >
          <rect width="1440" height="65" fill={topColor} />
          <path
            d="M0,0 
               Q45,38 90,0 Q135,38 180,0 Q225,38 270,0 Q315,38 360,0 
               Q405,38 450,0 Q495,38 540,0 Q585,38 630,0 Q675,38 720,0 
               Q765,38 810,0 Q855,38 900,0 Q945,38 990,0 Q1035,38 1080,0 
               Q1125,38 1170,0 Q1215,38 1260,0 Q1305,38 1350,0 Q1395,38 1440,0 
               L1440,65 L0,65 Z"
            fill="#181512"
          />
          <path
            d="M0,0 
               Q45,34 90,0 Q135,34 180,0 Q225,34 270,0 Q315,34 360,0 
               Q405,34 450,0 Q495,34 540,0 Q585,34 630,0 Q675,34 720,0 
               Q765,34 810,0 Q855,34 900,0 Q945,34 990,0 Q1035,34 1080,0 
               Q1125,34 1170,0 Q1215,34 1260,0 Q1305,34 1350,0 Q1395,34 1440,0 
               L1440,65 L0,65 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {BULB_X.map((x) => (
            <g key={x}>
              <line x1={x} y1={28} x2={x} y2={35} stroke="#181512" strokeWidth="2" />
              <rect x={x - 3} y={34} width={6} height={3.5} rx={1} fill="#181512" />
              <circle cx={x} cy={42} r={7.5} fill="#FFE600" fillOpacity="0.4" />
              <circle cx={x} cy={42} r={4.5} fill="#FFFBEB" stroke="#181512" strokeWidth="1.5" />
            </g>
          ))}
        </svg>
      )}

      {/* 3. Auvent Scallop Standard */}
      {variant === "scallop" && (
        <svg
          viewBox="0 0 1440 50"
          preserveAspectRatio="none"
          className="w-full h-10 sm:h-14 block"
        >
          <rect width="1440" height="50" fill={topColor} />
          <path
            d="M0,0 
               Q45,38 90,0 Q135,38 180,0 Q225,38 270,0 Q315,38 360,0 
               Q405,38 450,0 Q495,38 540,0 Q585,38 630,0 Q675,38 720,0 
               Q765,38 810,0 Q855,38 900,0 Q945,38 990,0 Q1035,38 1080,0 
               Q1125,38 1170,0 Q1215,38 1260,0 Q1305,38 1350,0 Q1395,38 1440,0 
               L1440,50 L0,50 Z"
            fill="#181512"
          />
          <path
            d="M0,0 
               Q45,32 90,0 Q135,32 180,0 Q225,32 270,0 Q315,32 360,0 
               Q405,32 450,0 Q495,32 540,0 Q585,32 630,0 Q675,32 720,0 
               Q765,32 810,0 Q855,32 900,0 Q945,32 990,0 Q1035,32 1080,0 
               Q1125,32 1170,0 Q1215,32 1260,0 Q1305,32 1350,0 Q1395,32 1440,0 
               L1440,50 L0,50 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* 4. Collines de Nuages Cartoon */}
      {variant === "clouds" && (
        <svg
          viewBox="0 0 1440 55"
          preserveAspectRatio="none"
          className="w-full h-11 sm:h-15 block"
        >
          <rect width="1440" height="55" fill={topColor} />
          <path
            d="M0,28 Q120,6 240,24 Q360,42 480,20 Q600,-2 720,24 Q840,46 960,18 Q1080,-2 1200,22 Q1320,44 1440,26 L1440,55 L0,55 Z"
            fill="#181512"
          />
          <path
            d="M0,22 Q120,0 240,18 Q360,36 480,14 Q600,-8 720,18 Q840,40 960,12 Q1080,-8 1200,16 Q1320,38 1440,20 L1440,55 L0,55 Z"
            fill={bottomColor}
            stroke="#181512"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
