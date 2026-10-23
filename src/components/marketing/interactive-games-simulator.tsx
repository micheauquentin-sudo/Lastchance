"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export type ConfigurableModuleKey =
  | "jeux"
  | "pronostic"
  | "calendrier"
  | "ticket_or"
  | "fidelite"
  | "quizz";

interface ConfigurableModule {
  id: ConfigurableModuleKey;
  label: string;
  shortLabel: string;
  emoji: string;
  badge: string;
  tagline: string;
  href: string;
  hrefLabel: string;
  accent: string;
  configTitle: string;
  configDescription: string;
  configOptions: string[];
}

const CONFIGURABLE_MODULES: readonly ConfigurableModule[] = [
  {
    id: "jeux",
    label: "Jeux Instantanés",
    shortLabel: "Jeux",
    emoji: "🎰",
    badge: "15 mécaniques",
    tagline: "Roue de la fortune, tickets à gratter, machine à sous et défi réflexe au QR code sans application.",
    href: "/jeux-instantanes",
    hrefLabel: "Explorer les 15 jeux instantanés",
    accent: "bg-[#FF6B35] text-white",
    configTitle: "Personnalisation des lots & probabilités",
    configDescription: "Définissez le lot débloqué, la limitation des gains journaliers et le stock de cadeaux.",
    configOptions: ["Café offert ☕", "-15% addition 🏷️", "Planche apéro 🧀", "Cocktail du jour 🍹"],
  },
  {
    id: "pronostic",
    label: "Pronostics Sportifs",
    shortLabel: "Pronostic",
    emoji: "⚽",
    badge: "L1, C1, Top 14",
    tagline: "Faites pronostiquer vos habitués sur les grands matchs pour remplir votre salle les soirs d'événement.",
    href: "/jeux-instantanes#pronostics",
    hrefLabel: "Découvrir le module Pronostics",
    accent: "bg-[#00E5FF] text-[#181512]",
    configTitle: "Gestion des matchs & classements",
    configDescription: "Choisissez le match de la semaine, l'heure limite de validation et le lot pour le meilleur scoreur.",
    configOptions: ["1 Tournée offerte 🍻", "Burger du chef 🍔", "Bon d'achat 20€ 🎁"],
  },
  {
    id: "calendrier",
    label: "Calendrier Surprise",
    shortLabel: "Calendrier",
    emoji: "📅",
    badge: "7 à 24 jours",
    tagline: "Calendrier de l'Avent ou défis flash : chaque jour une case débloque une offre éphémère exclusive.",
    href: "/jeux-instantanes#calendrier",
    hrefLabel: "Explorer le Calendrier Surprise",
    accent: "bg-[#EF4444] text-white",
    configTitle: "Programmation des cadeaux quotidiens",
    configDescription: "Réglez la durée (7 à 24 jours) et associez un avantage surprise par date du calendrier.",
    configOptions: ["Dessert offert 🍰", "Double tampons ⚡", "-20% sur la carte 🏷️"],
  },
  {
    id: "ticket_or",
    label: "Ticket d'Or en Caisse",
    shortLabel: "Ticket d'Or",
    emoji: "🎫",
    badge: "Gain exceptionnel",
    tagline: "Émission surprise en caisse d'un ticket doré pour récompenser vos meilleurs clients ou un gros panier.",
    href: "/passeport-fidelite#ticket-or",
    hrefLabel: "Voir le Ticket d'Or",
    accent: "bg-[#FFE600] text-[#181512]",
    configTitle: "Règles d'attribution du Ticket d'Or",
    configDescription: "Définissez le seuil panier (dès 35€) et la rareté du ticket doré (ex: 1 ticket sur 50).",
    configOptions: ["Panier dès 30€ 🛒", "1 chance sur 25 🎯", "Repas duo offert 🍽️"],
  },
  {
    id: "fidelite",
    label: "Passeport Fidélité Wallet",
    shortLabel: "Passeport Wallet",
    emoji: "📲",
    badge: "Apple & Google Wallet",
    tagline: "Tampons numériques, points de fidélité et notifications push directement dans le wallet du smartphone.",
    href: "/passeport-fidelite",
    hrefLabel: "Découvrir le Passeport Wallet",
    accent: "bg-[#FF5C93] text-white",
    configTitle: "Barème de tampons & récompenses",
    configDescription: "Choisissez le nombre de passages requis pour débloquer la récompense et le push de rappel.",
    configOptions: ["8 tampons = Cadeau 🎁", "1€ dépensé = 10 pts ⭐️", "Rappel SMS J+14 💬"],
  },
  {
    id: "quizz",
    label: "Quiz & Blind Tests",
    shortLabel: "Quizz",
    emoji: "🧠",
    badge: "Défi chrono",
    tagline: "Questions rapides et ludiques sur vos spécialités ou votre histoire pour valoriser vos clients passionnés.",
    href: "/jeux-instantanes#quiz",
    hrefLabel: "Explorer les Quiz Commerçant",
    accent: "bg-[#A855F7] text-white",
    configTitle: "Questions & temps imparti",
    configDescription: "Personnalisez la question, les 3 choix, le chrono (15s) et le code promo remis aux gagnants.",
    configOptions: ["Chrono 15 sec ⏱️", "Question personnalisée ✍️", "Gain automatique 🎁"],
  },
] as const;

export function InteractiveGamesSimulator() {
  const [selectedModuleKey, setSelectedModuleKey] = useState<ConfigurableModuleKey>("jeux");

  // Sous-jeu pour la catégorie "jeux"
  const [selectedSubGame, setSelectedSubGame] = useState<"roue" | "grattage" | "slots" | "reflexe">("roue");

  // Personnalisation commerçant
  const [prizeName, setPrizeName] = useState("Café offert ☕");
  const [burst, setBurst] = useState(0);

  // États jeux instantanés
  const [_instantWon, setInstantWon] = useState(false);
  const [playingInstant, setPlayingInstant] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [scratched, setScratched] = useState(false);
  const [slotSymbols, setSlotSymbols] = useState(["🍒", "🍋", "⭐"]);
  const [_reflexSuccess, setReflexSuccess] = useState<boolean | null>(null);

  // États pronostics
  const [homeScore, setHomeScore] = useState(2);
  const [awayScore, setAwayScore] = useState(1);
  const [pronoSubmitted, setPronoSubmitted] = useState(false);

  // État quiz
  const [quizAnswered, setQuizAnswered] = useState<number | null>(null);
  const correctQuizOption = 1;

  // État calendrier
  const [openedDay, setOpenedDay] = useState<number | null>(5);

  // État Ticket d'Or
  const [_goldTicketRevealed, setGoldTicketRevealed] = useState(false);

  // État Wallet Tampons
  const [walletStamps, setWalletStamps] = useState(6);

  const resetAll = () => {
    setInstantWon(false);
    setPlayingInstant(false);
    setScratched(false);
    setSlotSymbols(["🍒", "🍋", "⭐"]);
    setReflexSuccess(null);
    setPronoSubmitted(false);
    setQuizAnswered(null);
    setGoldTicketRevealed(false);
  };

  const triggerCelebration = () => {
    setInstantWon(true);
    setPlayingInstant(false);
    setBurst((b) => b + 1);
  };

  const spinWheel = () => {
    if (playingInstant) return;
    setPlayingInstant(true);
    setInstantWon(false);
    const extraDegrees = 1440 + Math.floor(Math.random() * 360);
    setWheelRotation((prev) => prev + extraDegrees);
    setTimeout(() => {
      triggerCelebration();
    }, 2200);
  };

  const scratchTicket = () => {
    if (scratched || playingInstant) return;
    setPlayingInstant(true);
    setScratched(true);
    setTimeout(() => {
      triggerCelebration();
    }, 450);
  };

  const spinSlots = () => {
    if (playingInstant) return;
    setPlayingInstant(true);
    setInstantWon(false);
    let count = 0;
    const interval = setInterval(() => {
      const items = ["🍒", "🍋", "⭐", "🎁", "🔔"];
      setSlotSymbols([
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)],
      ]);
      count++;
      if (count > 8) {
        clearInterval(interval);
        setSlotSymbols(["🎁", "🎁", "🎁"]);
        triggerCelebration();
      }
    }, 110);
  };

  const handleReflex = () => {
    if (playingInstant) {
      setPlayingInstant(false);
      setReflexSuccess(true);
      triggerCelebration();
    } else {
      setPlayingInstant(true);
      setInstantWon(false);
      setReflexSuccess(null);
    }
  };

  const currentModule =
    CONFIGURABLE_MODULES.find((m) => m.id === selectedModuleKey) ?? CONFIGURABLE_MODULES[0];

  return (
    <div className="relative w-full rounded-3xl border-[3px] border-[#181512] bg-white p-4 sm:p-6 md:p-8 shadow-[0_8px_0_#181512]">
      <ConfettiBurst count={burst} />

      {/* SÉLECTEUR DES MODULES CONFIGURABLES : Grille ultra-visible et cliquable */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#181512]/15 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#FF6B35] animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-[#181512]">
              Sélecteur des 6 modules de jeux &amp; fidélité
            </span>
          </div>
          <span className="text-xs font-bold text-[#181512]/65">
            Cliquez sur un module pour tester sa configuration en direct ↓
          </span>
        </div>

        {/* Grille des 6 modules configurables */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-2.5">
          {CONFIGURABLE_MODULES.map((mod) => {
            const isSelected = mod.id === selectedModuleKey;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  setSelectedModuleKey(mod.id);
                  resetAll();
                }}
                className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 p-3 text-center transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-[#181512] bg-[#FFE600] shadow-[0_4px_0_#181512] -translate-y-1"
                    : "border-[#181512]/20 bg-[#FFFDF8] hover:border-[#181512] hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_2px_0_#181512]"
                }`}
              >
                <span className="text-2xl sm:text-3xl transition-transform group-hover:scale-110">
                  {mod.emoji}
                </span>
                <span
                  className="mt-1.5 text-xs font-black text-[#181512] leading-tight"
                  style={DISPLAY}
                >
                  {mod.shortLabel}
                </span>
                <span className="mt-0.5 text-[10px] font-bold text-[#181512]/60">
                  {mod.badge}
                </span>

                {isSelected ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#181512] px-2 py-0.5 text-[9px] font-black text-[#FFE600]">
                    ● En direct
                  </span>
                ) : (
                  <span className="mt-1.5 text-[9px] font-bold text-[#181512]/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    Tester →
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* BANDEAU CLAIR : Message "Configurez autant que vous voulez" + Bouton En Savoir + */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border-2 border-[#181512]/15 bg-[#FFFDF8] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#10B981] text-white text-xs font-black shadow-[0_1.5px_0_#181512]">
            ✓
          </span>
          <p className="text-xs sm:text-sm font-black text-[#181512]">
            <span className="text-[#FF6B35]">Modules 100% combinables :</span> activez autant de modules que vous le souhaitez en simultané selon vos besoins. Tout est inclus !
          </p>
        </div>

        {/* Bouton direct vers l'onglet / page correspondant */}
        <Link
          href={currentModule.href}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FF6B35] px-4 py-1.5 text-xs font-black text-white shadow-[0_2px_0_#181512] transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-[0_4px_0_#181512]"
        >
          <span>En savoir + sur {currentModule.shortLabel}</span>
          <span>→</span>
        </Link>
      </div>

      {/* GRILLE DOUBLE VUE : Côté Commerçant (gauche) + Vue Smartphone Joueur (droite) */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        {/* Colonne Gauche : Configuration Commerçant (Épurée & Fluide) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border-2 border-[#181512] bg-[#FFFDF8] p-4 sm:p-5 shadow-[0_3px_0_#181512]">
            {/* En-tête du module actif */}
            <div className="flex items-center justify-between border-b border-[#181512]/15 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{currentModule.emoji}</span>
                  <h3 className="text-base sm:text-lg font-black text-[#181512]" style={DISPLAY}>
                    {currentModule.label}
                  </h3>
                  <span className={`rounded-full border border-[#181512] px-2.5 py-0.5 text-[10px] font-black ${currentModule.accent}`}>
                    {currentModule.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#181512]/75 font-bold">
                  {currentModule.tagline}
                </p>
              </div>
            </div>

            {/* Sous-sélection de mécanique si Jeux instantanés */}
            {selectedModuleKey === "jeux" && (
              <div className="mt-4">
                <div className="text-[11px] font-black uppercase tracking-wider text-[#181512]/70 mb-2">
                  1. Choisissez la mécanique de jeu :
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: "roue" as const, label: "Roue", emoji: "🎡" },
                    { id: "grattage" as const, label: "Grattage", emoji: "🎫" },
                    { id: "slots" as const, label: "Machine à sous", emoji: "🎰" },
                    { id: "reflexe" as const, label: "Défi Réflexe", emoji: "⚡" },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setSelectedSubGame(sub.id);
                        resetAll();
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#181512] px-2.5 py-2 text-xs font-black transition-all cursor-pointer ${
                        selectedSubGame === sub.id
                          ? "bg-[#FF6B35] text-white shadow-[0_2px_0_#181512] scale-[1.02]"
                          : "bg-white text-[#181512] hover:bg-[#FFE600]"
                      }`}
                    >
                      <span>{sub.emoji}</span>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Réglage en direct commerçant */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wider text-[#181512]/70">
                  {selectedModuleKey === "jeux" ? "2. Lot mis en jeu :" : "Personnalisation en direct :"}
                </div>
                <span className="rounded-full bg-[#10B981]/15 px-2 py-0.5 text-[10px] font-black text-[#059669]">
                  Modifiable en 1 clic
                </span>
              </div>

              <div className="mt-2 text-xs font-black text-[#181512]">
                {currentModule.configTitle}
              </div>
              <p className="mt-0.5 text-xs text-[#181512]/70 font-bold">
                {currentModule.configDescription}
              </p>

              {/* Raccourcis de réglages / options */}
              <div className="mt-3 flex flex-wrap gap-2">
                {currentModule.configOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setPrizeName(opt);
                      setBurst((b) => b + 1);
                    }}
                    className="rounded-xl border-2 border-[#181512] bg-white px-3 py-1.5 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] hover:bg-[#FFE600] transition-all hover:-translate-y-0.5 cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Piliers techniques épurés */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 text-left border-t border-[#181512]/10 pt-4">
              <div className="rounded-xl border border-[#181512]/15 bg-white p-2.5">
                <div className="text-[10px] font-bold text-[#181512]/60">Sécurité &amp; Anti-triche</div>
                <div className="text-xs font-black text-[#181512]">Tirage serveur chiffré</div>
                <div className="text-[10px] text-[#181512]/60 font-medium">1 scan unique = 1 gain</div>
              </div>
              <div className="rounded-xl border border-[#181512]/15 bg-white p-2.5">
                <div className="text-[10px] font-bold text-[#181512]/60">Validation en caisse</div>
                <div className="text-xs font-black text-[#10B981]">Scanner 1 seconde</div>
                <div className="text-[10px] text-[#181512]/60 font-medium">Zéro appli sur smartphone</div>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne Droite : Smartphone Joueur Dézoomé */}
        <div className="flex flex-col items-center lg:col-span-5">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/60 mb-2">
            2. Expérience mobile du client
          </div>

          <div className="relative w-full max-w-[245px] overflow-hidden rounded-[28px] border-[3.5px] border-[#181512] bg-[#FFFDF8] p-3 shadow-[0_6px_0_#181512] min-h-[340px] flex flex-col justify-between">
            {/* Encoche smartphone */}
            <div className="mx-auto h-3.5 w-20 rounded-full bg-[#181512]/15 mb-2" />

            {/* CONTENU MOBILE SELON LE MODULE SÉLECTIONNÉ */}

            {/* 1. JEUX INSTANTANÉS */}
            {selectedModuleKey === "jeux" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Votre commerce · QR Code
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  {selectedSubGame === "roue" && "Roue de la fortune"}
                  {selectedSubGame === "grattage" && "Ticket à gratter"}
                  {selectedSubGame === "slots" && "Machine à sous"}
                  {selectedSubGame === "reflexe" && "Défi Réflexe"}
                </div>

                {/* Roue */}
                {selectedSubGame === "roue" && (
                  <div className="mt-3 flex flex-col items-center">
                    <div className="relative h-32 w-32">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 text-base">▼</div>
                      <div
                        className="h-full w-full rounded-full border-[3px] border-[#181512] shadow-[0_4px_0_#181512] transition-transform duration-[2200ms] ease-out flex items-center justify-center overflow-hidden"
                        style={{
                          transform: `rotate(${wheelRotation}deg)`,
                          background:
                            "conic-gradient(#FF6B35 0deg 45deg, #FFE600 45deg 90deg, #FF5C93 90deg 135deg, #00E5FF 135deg 180deg, #10B981 180deg 225deg, #A855F7 225deg 270deg, #EF4444 270deg 315deg, #F59E0B 315deg 360deg)",
                        }}
                      >
                        <div className="h-9 w-9 rounded-full border-2 border-[#181512] bg-white shadow-inner flex items-center justify-center text-xs">
                          🎁
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={spinWheel}
                      disabled={playingInstant}
                      className="mt-3 w-full rounded-full border-2 border-[#181512] bg-[#FF6B35] py-2 text-xs font-black text-white shadow-[0_3px_0_#181512] hover:bg-orange-600 transition-all cursor-pointer"
                    >
                      {playingInstant ? "La roue tourne..." : "Tourner la roue !"}
                    </button>
                  </div>
                )}

                {/* Ticket à gratter */}
                {selectedSubGame === "grattage" && (
                  <div className="mt-3 w-full flex flex-col items-center">
                    <div
                      onClick={scratchTicket}
                      className="relative w-full h-28 rounded-2xl border-2 border-[#181512] bg-gradient-to-br from-[#FEF08A] to-[#FDE047] p-3 shadow-[0_3px_0_#181512] flex flex-col items-center justify-center cursor-pointer overflow-hidden select-none"
                    >
                      {!scratched ? (
                        <div className="absolute inset-0 bg-[#94A3B8] flex flex-col items-center justify-center text-white z-10">
                          <span className="text-xl">✨</span>
                          <span className="text-[11px] font-black">Grattez ici avec le doigt !</span>
                        </div>
                      ) : (
                        <div className="text-center animate-in zoom-in-50">
                          <span className="text-2xl">🎉</span>
                          <div className="text-xs font-black text-[#181512] mt-1">{prizeName}</div>
                          <span className="text-[10px] font-bold text-[#10B981]">Gagné !</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={scratchTicket}
                      className="mt-3 w-full rounded-full border-2 border-[#181512] bg-[#FFE600] py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] cursor-pointer"
                    >
                      {scratched ? "Ticket gratté !" : "Gratter le ticket"}
                    </button>
                  </div>
                )}

                {/* Slots */}
                {selectedSubGame === "slots" && (
                  <div className="mt-3 w-full flex flex-col items-center">
                    <div className="flex gap-2 rounded-2xl border-2 border-[#181512] bg-[#181512] p-2.5 shadow-[0_3px_0_#181512]">
                      {slotSymbols.map((sym, idx) => (
                        <div
                          key={idx}
                          className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl border-2 border-[#181512] shadow-inner"
                        >
                          {sym}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={spinSlots}
                      disabled={playingInstant}
                      className="mt-3 w-full rounded-full border-2 border-[#181512] bg-[#10B981] py-2 text-xs font-black text-white shadow-[0_3px_0_#181512] cursor-pointer"
                    >
                      {playingInstant ? "Les rouleaux tournent..." : "Tirer la manette !"}
                    </button>
                  </div>
                )}

                {/* Réflexe */}
                {selectedSubGame === "reflexe" && (
                  <div className="mt-3 w-full flex flex-col items-center">
                    <div className="w-full rounded-2xl border-2 border-[#181512] bg-white p-3 shadow-[0_2px_0_#181512] text-center">
                      <div className="text-[10px] font-bold text-[#181512]/60">Arrêtez dans la cible :</div>
                      <div className="mt-2 h-4 w-full rounded-full bg-slate-200 border border-[#181512] relative overflow-hidden">
                        <div className="absolute left-[40%] w-[20%] h-full bg-[#10B981]" />
                        <div className="absolute left-[48%] w-1.5 h-full bg-[#EF4444] animate-ping" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleReflex}
                      className="mt-3 w-full rounded-full border-2 border-[#181512] bg-[#00E5FF] py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] cursor-pointer"
                    >
                      {playingInstant ? "STOPPÉ !" : "Tester mon réflexe"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. PRONOSTICS */}
            {selectedModuleKey === "pronostic" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Ligue 1 · Soirée Match
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  Paris vs Marseille
                </div>

                {!pronoSubmitted ? (
                  <div className="mt-3 w-full rounded-2xl border-2 border-[#181512] bg-white p-3 shadow-[0_2px_0_#181512]">
                    <div className="flex items-center justify-around">
                      <div className="text-center">
                        <div className="text-lg">🔵</div>
                        <div className="text-[10px] font-black mt-0.5">Paris</div>
                        <div className="mt-1 flex items-center gap-1 justify-center">
                          <button
                            type="button"
                            onClick={() => setHomeScore((s) => Math.max(0, s - 1))}
                            className="h-5 w-5 rounded bg-slate-100 border border-[#181512] text-xs font-black cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-sm font-black w-4 text-center">{homeScore}</span>
                          <button
                            type="button"
                            onClick={() => setHomeScore((s) => s + 1)}
                            className="h-5 w-5 rounded bg-slate-100 border border-[#181512] text-xs font-black cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-black text-[#181512]/40">VS</div>

                      <div className="text-center">
                        <div className="text-lg">⚪</div>
                        <div className="text-[10px] font-black mt-0.5">Marseille</div>
                        <div className="mt-1 flex items-center gap-1 justify-center">
                          <button
                            type="button"
                            onClick={() => setAwayScore((s) => Math.max(0, s - 1))}
                            className="h-5 w-5 rounded bg-slate-100 border border-[#181512] text-xs font-black cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-sm font-black w-4 text-center">{awayScore}</span>
                          <button
                            type="button"
                            onClick={() => setAwayScore((s) => s + 1)}
                            className="h-5 w-5 rounded bg-slate-100 border border-[#181512] text-xs font-black cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPronoSubmitted(true)}
                      className="mt-3 w-full rounded-full border-2 border-[#181512] bg-[#00E5FF] py-1.5 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] cursor-pointer"
                    >
                      Valider mon pronostic !
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 w-full rounded-2xl border-2 border-[#181512] bg-[#D1FAE5] p-3 text-center">
                    <span className="text-xl">🏆</span>
                    <div className="text-xs font-black text-[#065F46] mt-0.5">Prono enregistré !</div>
                    <div className="text-[10px] text-[#065F46] font-bold mt-1">
                      Score : {homeScore} - {awayScore} · 1ère place
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. CALENDRIER */}
            {selectedModuleKey === "calendrier" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Défis Flash · 7 jours
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  Calendrier Surprise
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5 w-full">
                  {[1, 2, 3, 4, 5, 6].map((day) => {
                    const isToday = day === 5;
                    const isOpened = openedDay === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setOpenedDay(day)}
                        className={`h-12 rounded-xl border-2 border-[#181512] flex flex-col items-center justify-center text-xs font-black transition-all cursor-pointer ${
                          isToday
                            ? "bg-[#FFE600] shadow-[0_2px_0_#181512] scale-105"
                            : isOpened
                            ? "bg-[#D1FAE5]"
                            : "bg-white text-[#181512]/60"
                        }`}
                      >
                        <span className="text-[10px]">Jour {day}</span>
                        <span>{isOpened ? "🎁" : "🔒"}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 text-[10px] font-bold text-[#181512]/70 bg-white p-1.5 rounded-lg border border-[#181512]/15 w-full">
                  Jour 5 : Cocktail offert jusqu&apos;à 22h ! 🍸
                </div>
              </div>
            )}

            {/* 4. TICKET D'OR */}
            {selectedModuleKey === "ticket_or" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Émission en Caisse
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  Ticket d&apos;Or Surprise
                </div>

                <div className="mt-3 w-full rounded-2xl border-[3px] border-[#181512] bg-gradient-to-br from-[#FEF08A] via-[#FDE047] to-[#F59E0B] p-3 text-center shadow-[0_4px_0_#181512]">
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#181512] px-2 py-0.5 text-[9px] font-black text-[#FFE600]">
                    ★ TICKET D&apos;OR OFFICIEL
                  </div>
                  <div className="text-xs font-black text-[#181512] mt-2">
                    FÉLICITATIONS !
                  </div>
                  <div className="text-[11px] font-bold text-[#181512] mt-0.5">
                    1 Repas duo offert 🍽️
                  </div>
                  <div className="mt-2 text-[9px] font-mono bg-white/80 rounded py-0.5 border border-[#181512]/20">
                    CODE: GOLD-8842
                  </div>
                </div>

                <div className="mt-2 text-[10px] font-bold text-[#10B981]">
                  ✓ Validable en 1 seconde au scanner
                </div>
              </div>
            )}

            {/* 5. PASSEPORT FIDÉLITÉ WALLET */}
            {selectedModuleKey === "fidelite" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Apple &amp; Google Wallet
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  Passeport de Fidélité
                </div>

                <div className="mt-3 w-full rounded-2xl border-2 border-[#181512] bg-[#181512] p-3 text-white text-left shadow-[0_3px_0_#181512]">
                  <div className="flex justify-between items-center text-[10px] text-white/60">
                    <span>VOTRE COMMERCE</span>
                    <span className="text-[#10B981] font-black">NIVEAU VIP ★</span>
                  </div>
                  <div className="text-xs font-black text-white mt-1">
                    Carte 8 passages
                  </div>

                  {/* Tampons */}
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <div
                        key={s}
                        className={`h-7 rounded-lg border border-white/20 flex items-center justify-center text-xs ${
                          s <= walletStamps ? "bg-[#FFE600] text-[#181512]" : "bg-white/10 text-white/40"
                        }`}
                      >
                        {s <= walletStamps ? "☕" : s}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setWalletStamps((s) => (s < 8 ? s + 1 : 1))}
                  className="mt-2 w-full rounded-full border-2 border-[#181512] bg-[#FF5C93] py-1.5 text-xs font-black text-white shadow-[0_2px_0_#181512] cursor-pointer"
                >
                  +1 Tampon en caisse
                </button>
              </div>
            )}

            {/* 6. QUIZ */}
            {selectedModuleKey === "quizz" && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/50">
                  Défi Chrono · 15 sec
                </div>
                <div className="text-xs font-black text-[#181512] mt-0.5" style={DISPLAY}>
                  Quiz du Commerçant
                </div>

                <div className="mt-3 w-full rounded-2xl border-2 border-[#181512] bg-white p-3 text-left">
                  <div className="text-[11px] font-black text-[#181512] text-center">
                    En quelle année notre restaurant a-t-il été fondé ?
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {["2018", "2020", "2023"].map((opt, idx) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setQuizAnswered(idx);
                          if (idx === correctQuizOption) setBurst((b) => b + 1);
                        }}
                        className={`w-full rounded-lg border border-[#181512] p-1.5 text-xs font-black text-center transition-all cursor-pointer ${
                          quizAnswered === idx
                            ? idx === correctQuizOption
                              ? "bg-[#10B981] text-white"
                              : "bg-[#EF4444] text-white"
                            : "bg-[#FFFDF8] hover:bg-slate-50 text-[#181512]"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}


            {/* Badge de réassurance bas smartphone */}
            <div className="mt-2 text-center text-[9px] font-black text-[#181512]/60">
              ⚡ 0 application à télécharger · Valable sur Safari &amp; Chrome
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
