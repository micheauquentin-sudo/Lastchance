"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export interface ModuleData {
  id: string;
  level: string;
  name: string;
  subtitle: string;
  pitch: string;
  stat: string;
  statLabel: string;
  badge: string;
  badgeColor: string;
  image: string;
  alt: string;
  href: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  icon: string;
  tag: string;
  featureSnippet: {
    label: string;
    value: string;
    sub: string;
  };
}

const INITIAL_MODULES: ModuleData[] = [
  {
    id: "jeux",
    level: "STAGE 1",
    name: "15 Jeux Instantanés",
    subtitle: "Roue 3D · Grattage · Machine à sous",
    pitch: "Vos clients scannent et jouent en 30s à table ou en caisse. Zéro appli, tirage instantané infalsifiable.",
    stat: "98%",
    statLabel: "de conversion joueur",
    badge: "🔥 BEST-SELLER",
    badgeColor: "bg-[#FF6B35] text-white",
    image: "/marketing/module-roue-3d.jpg",
    alt: "Roue de la fortune 3D colorée LastChance",
    href: "/jeux-instantanes",
    accentBg: "bg-[#FF6B35]",
    accentBorder: "border-[#FF6B35]",
    accentText: "text-[#FF6B35]",
    icon: "🎡",
    tag: "MINI-JEUX",
    featureSnippet: {
      label: "TIRAGE EN COURS",
      value: "☕ 1 Café offert",
      sub: "Probabilité : 1/5",
    },
  },
  {
    id: "vitrine",
    level: "STAGE 2",
    name: "Vitrine & Résa 0%",
    subtitle: "Carte interactive · 0€ de commission",
    pitch: "Adieu les PDF flous et les 2,50€ par couvert aux centrales. Vos réservations directes sans intermédiaire.",
    stat: "0 €",
    statLabel: "de commission par couvert",
    badge: "⚡ 100% EN DIRECT",
    badgeColor: "bg-[#10B981] text-white",
    image: "/marketing/module-showcase-3d.jpg",
    alt: "Vitrine restaurant 3D au QR code",
    href: "/vitrine-reservation",
    accentBg: "bg-[#10B981]",
    accentBorder: "border-[#10B981]",
    accentText: "text-[#059669]",
    icon: "🍽️",
    tag: "RESTAURATION",
    featureSnippet: {
      label: "RÉSERVATION DIRECTE",
      value: "Table 4 pers. · 20h00",
      sub: "Commission : 0,00 €",
    },
  },
  {
    id: "fidelite",
    level: "STAGE 3",
    name: "Passeport Wallet",
    subtitle: "Apple Wallet & Google Wallet",
    pitch: "Fini les cartons perdus au fond du sac. Tampons digitaux, tickets d'or et jackpots collectifs en caisse.",
    stat: "+40%",
    statLabel: "de fréquence de visite",
    badge: "📲 0 CARTE PERDUE",
    badgeColor: "bg-[#FF5C93] text-white",
    image: "/marketing/module-wallet-3d.jpg",
    alt: "Passeport de fidélité 3D sur smartphone",
    href: "/passeport-fidelite",
    accentBg: "bg-[#FF5C93]",
    accentBorder: "border-[#FF5C93]",
    accentText: "text-[#E11D48]",
    icon: "🎟️",
    tag: "WALLET",
    featureSnippet: {
      label: "SOLDE DU JOUEUR",
      value: "8 / 10 Tampons",
      sub: "🎁 Prochain lot : Dessert",
    },
  },
  {
    id: "tournois",
    level: "STAGE 4",
    name: "Pronos & Soirées Live",
    subtitle: "Ligue 1 · Calendrier · Grand Écran",
    pitch: "Faites pronostiquer vos clients avant les matchs. Ils viennent en salle consommer leur lot entre amis.",
    stat: "100%",
    statLabel: "de revisite en salle",
    badge: "🏆 11 COMPÉTITIONS",
    badgeColor: "bg-[#00E5FF] text-[#181512]",
    image: "/marketing/module-trophee-3d.jpg",
    alt: "Trophée cartoon 3D et confettis",
    href: "/championnats-evenements",
    accentBg: "bg-[#00E5FF]",
    accentBorder: "border-[#00E5FF]",
    accentText: "text-[#0284C7]",
    icon: "⚽",
    tag: "ANIMATION",
    featureSnippet: {
      label: "MATCH DU SOIR",
      value: "PSG 2 - 1 OM (88')",
      sub: "42 parieurs en salle",
    },
  },
];

/**
 * Synthétiseur de carillons arcade Web Audio API natif (0kb, aucun fichier externe)
 */
function playArcadeSound(type: "hover" | "click" | "shuffle") {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === "hover") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "click") {
      const notes = [659.25, 880];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.05, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.09);
      });
    } else if (type === "shuffle") {
      const arpeggio = [523.25, 659.25, 783.99, 1046.5];
      arpeggio.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.07, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.12);
      });
    }
  } catch {
    // Silencieux si audio bloqué
  }
}

/**
 * Borne de Jeu 3D Interactive (Pleine Largeur, Gyroscope & Holographie)
 */
function ArcadeModuleCard({
  module,
  index,
  isHovered,
  isSpecial,
  onHover,
  onLeave,
}: {
  module: ModuleData;
  index: number;
  isHovered: boolean;
  isSpecial: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glare, setGlare] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rX = ((y - centerY) / centerY) * -12;
    const rY = ((x - centerX) / centerX) * 12;

    setRotateX(rX);
    setRotateY(rY);
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseEnter = () => {
    onHover();
    playArcadeSound("hover");
  };

  const handleMouseLeave = () => {
    onLeave();
    setRotateX(0);
    setRotateY(0);
  };

  // Cadence de lévitation désynchronisée
  const bobs = [
    "animate-[k-bob_4.2s_ease-in-out_infinite]",
    "animate-[k-bob_4.8s_ease-in-out_infinite_0.9s]",
    "animate-[k-bob_4.5s_ease-in-out_infinite_1.8s]",
    "animate-[k-bob_5.1s_ease-in-out_infinite_2.7s]",
  ];

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative flex-1 transition-all duration-300 ease-out select-none ${bobs[index % 4]}`}
      style={{ perspective: "1200px" }}
    >
      <Link
        href={module.href}
        onClick={() => playArcadeSound("click")}
        className={`relative flex flex-col h-full rounded-[28px] border-[3.5px] border-[#181512] bg-white transition-all duration-300 overflow-hidden ${
          isSpecial
            ? "ring-4 ring-[#FF5722] shadow-[0_16px_0_#181512] -translate-y-3"
            : isHovered
              ? "shadow-[0_16px_0_#181512] -translate-y-3"
              : "shadow-[0_7px_0_#181512] hover:shadow-[0_14px_0_#181512] hover:-translate-y-2"
        }`}
        style={{
          transform: isHovered
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.025, 1.025, 1.025)`
            : "rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Reflet holographique dynamique qui balaie la surface */}
        <div
          className="pointer-events-none absolute inset-0 z-30 transition-opacity duration-300"
          style={{
            background: isHovered
              ? `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 65%)`
              : "none",
            opacity: isHovered ? 1 : 0,
          }}
        />

        {/* 1. Bandeau supérieur style Borne d'Arcade */}
        <div className="flex items-center justify-between border-b-[2.5px] border-[#181512] bg-[#FFF8D6] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10B981] animate-ping" />
            <span className="text-[11px] font-black uppercase tracking-wider text-[#181512]">
              {module.level}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#181512] bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#181512]">
            <span>{module.icon}</span> {module.tag}
          </span>
        </div>

        {/* 2. Écran Visuel 3D immersif */}
        <div className="relative aspect-[16/11] w-full overflow-hidden bg-gradient-to-b from-[#FFFDF0] to-[#EFE7D3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={module.image}
            alt={module.alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-108"
          />

          {/* Badge festif néo-brutaliste flottant */}
          <div className="absolute top-3 right-3 z-10">
            <span
              className={`inline-block rounded-full border-2 border-[#181512] ${module.badgeColor} px-2.5 py-0.5 text-[10px] font-black tracking-wider shadow-[0_2px_0_#181512]`}
            >
              {module.badge}
            </span>
          </div>

          {/* Statistique clé en étiquette décollée */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white/95 backdrop-blur-sm px-3 py-1 shadow-[0_2px_0_#181512]">
            <span className={`text-xs sm:text-sm font-black ${module.accentText}`}>
              {module.stat}
            </span>
            <span className="text-[10px] font-bold text-[#181512]/80">{module.statLabel}</span>
          </div>
        </div>

        {/* 3. Bloc descriptif et simulation interactive */}
        <div className="flex flex-col flex-1 justify-between p-4 sm:p-5 bg-white">
          <div>
            <h3
              className="text-lg sm:text-xl font-black text-[#181512] leading-tight group-hover:text-[#FF5722] transition-colors"
              style={DISPLAY}
            >
              {module.name}
            </h3>
            <p className="mt-0.5 text-[11px] font-black text-[#181512]/60 uppercase tracking-wide">
              {module.subtitle}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#181512]/75 font-bold">
              {module.pitch}
            </p>

            {/* Micro-carte de prévisualisation en direct façon carte à jouer */}
            <div className="mt-3 rounded-xl border border-[#181512]/20 bg-[#FFFDF9] p-2.5 transition-all group-hover:border-[#181512] group-hover:bg-[#FFF8D6]/40">
              <div className="flex items-center justify-between text-[10px] font-black uppercase text-[#181512]/60">
                <span>{module.featureSnippet.label}</span>
                <span className="text-[#10B981]">● ACTIF</span>
              </div>
              <div className="mt-1 text-xs font-black text-[#181512]">
                {module.featureSnippet.value}
              </div>
              <div className="text-[10px] font-bold text-[#181512]/60">
                {module.featureSnippet.sub}
              </div>
            </div>
          </div>

          {/* 4. Bouton de lancement de jeu arcade */}
          <div className="mt-4 pt-3 border-t-2 border-[#181512]/10 flex items-center justify-between">
            <span className="text-xs font-black text-[#181512] group-hover:translate-x-1 transition-transform">
              Découvrir le jeu ➜
            </span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#181512] ${module.accentBg} text-white text-xs font-black shadow-[0_2px_0_#181512] transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110`}
            >
              ▶
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/**
 * SECTION LES 4 MODULES DE JEU — PLEINE LARGEUR & ANIMATION IMMERSIVE
 * Remplace l'ancien bloc "Comment ça marche" pour un enchaînement direct depuis le Hero
 */
export function InteractiveModulesDeck() {
  const [modules, setModules] = useState<ModuleData[]>(INITIAL_MODULES);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [specialId, setSpecialId] = useState<string | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [confetti, setConfetti] = useState(0);

  // Mélanger le deck et tirer au sort un module vedette
  const handleShuffle = () => {
    setShuffling(true);
    setConfetti((prev) => prev + 1);
    playArcadeSound("shuffle");

    setTimeout(() => {
      setModules((prev) => {
        const copy = [...prev];
        const first = copy.shift();
        if (first) copy.push(first);
        return copy;
      });

      // Tirer au sort une carte mise en vedette
      const randomIdx = Math.floor(Math.random() * 4);
      setSpecialId(modules[randomIdx]?.id || null);
      setShuffling(false);

      setTimeout(() => setSpecialId(null), 3000);
    }, 280);
  };

  return (
    <section
      id="modules"
      className="relative z-10 w-full bg-[#FFF8D6] py-14 sm:py-20 text-[#181512] overflow-hidden"
    >
      {confetti > 0 && <ConfettiBurst key={confetti} />}

      {/* Éléments de décor kermesse flottants aux 4 coins */}
      <div className="pointer-events-none absolute top-4 left-6 text-3xl opacity-20 select-none animate-[k-bob_6s_ease-in-out_infinite]">
        🎲
      </div>
      <div className="pointer-events-none absolute top-8 right-10 text-4xl opacity-20 select-none animate-[k-bob-r_7s_ease-in-out_infinite]">
        ✨
      </div>
      <div className="pointer-events-none absolute bottom-4 left-12 text-3xl opacity-20 select-none animate-[k-bob_5s_ease-in-out_infinite_1.2s]">
        🪙
      </div>
      <div className="pointer-events-none absolute bottom-6 right-8 text-4xl opacity-20 select-none animate-[k-bob-r_6s_ease-in-out_infinite_2s]">
        🎯
      </div>

      {/* CONTENEUR PLEINE LARGEUR ÉTENDUE */}
      <div className="w-full px-3 sm:px-6 lg:px-10 xl:px-12 2xl:px-16">
        {/* En-tête panoramique : Titre immersif + Bouton fun de mélange */}
        <div className="flex flex-col items-center justify-between gap-4 text-center lg:flex-row lg:text-left mb-8 sm:mb-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2.5px_0_#181512]">
              <span className="h-2 w-2 rounded-full bg-[#FF6B35] animate-ping" />
              🕹️ Les 4 Piliers LastChance · Choisissez votre attraction
            </div>
            <h2
              className="mt-3 text-[clamp(1.9rem,3.4vw,2.9rem)] font-black tracking-tight text-[#181512]"
              style={DISPLAY}
            >
              4 modules de jeu 3D pour transformer votre établissement
            </h2>
            <p className="mt-1 max-w-3xl text-xs sm:text-base font-bold text-[#181512]/75">
              100% combinables et activables à la carte. Survolez chaque carte pour explorer son univers immersif.
            </p>
          </div>

          {/* Bouton de jeu interactif pour mélanger les cartes */}
          <div className="flex-none">
            <button
              type="button"
              onClick={handleShuffle}
              aria-label="Mélanger le deck de cartes"
              className={`inline-flex items-center gap-2.5 rounded-full border-[3px] border-[#181512] bg-[#FFE600] px-6 py-3 text-xs sm:text-sm font-black text-[#181512] shadow-[0_4px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_#181512] active:translate-y-1 active:shadow-[0_1.5px_0_#181512] cursor-pointer ${
                shuffling ? "scale-95 rotate-2" : ""
              }`}
            >
              <span className={`text-lg transition-transform ${shuffling ? "rotate-180" : ""}`}>
                🎲
              </span>
              <span>Mélanger le deck</span>
              <span className="rounded-full bg-white border border-[#181512] px-2 py-0.5 text-[10px]">
                🔀
              </span>
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            LES 4 MODULES PLEINE LARGEUR SIMULTANÉS (GRILLE PANORAMIQUE RESPONSIVE)
            ═══════════════════════════════════════════════════════════════ */}
        <div
          className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 transition-all duration-300 ${
            shuffling ? "opacity-60 scale-98 blur-[1px]" : "opacity-100 scale-100"
          }`}
        >
          {modules.map((mod, idx) => (
            <ArcadeModuleCard
              key={mod.id}
              module={mod}
              index={idx}
              isHovered={hoveredIdx === idx}
              isSpecial={specialId === mod.id}
              onHover={() => setHoveredIdx(idx)}
              onLeave={() => setHoveredIdx(null)}
            />
          ))}
        </div>

        {/* Micro-réassurance festive sous les bornes */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs font-black text-[#181512]/75">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1.5 shadow-[0_2px_0_#181512]">
            <span>✨</span> Moteur 3D gyroscopique interactif
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1.5 shadow-[0_2px_0_#181512]">
            <span>🎯</span> Zéro commission sur vos commandes et réservations
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1.5 shadow-[0_2px_0_#181512]">
            <span>📲</span> Aucun téléchargement pour vos clients
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1.5 shadow-[0_2px_0_#181512]">
            <span>🎁</span> 7 jours d&apos;essai gratuit inclus
          </span>
        </div>
      </div>
    </section>
  );
}
