"use client";

import { useState } from "react";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export type GameKey = "roue" | "grattage" | "slots" | "reflexe";

interface GameOption {
  id: GameKey;
  label: string;
  category: "hasard" | "adresse";
  emoji: string;
  tagline: string;
}

const GAMES: readonly GameOption[] = [
  { id: "roue", label: "Roue de la fortune", category: "hasard", emoji: "🎡", tagline: "Le classique indémodable qui attire l'œil en caisse ou à table." },
  { id: "grattage", label: "Ticket à gratter", category: "hasard", emoji: "🎫", tagline: "Le frisson immédiat du doigt qui gratte et révèle le lot." },
  { id: "slots", label: "Machine à sous", category: "hasard", emoji: "🎰", tagline: "Trois rouleaux qui s'alignent pour déclencher le jackpot." },
  { id: "reflexe", label: "Jeu de réflexe", category: "adresse", emoji: "⚡", tagline: "Arrêter le chrono dans la zone verte avant le tirage." },
] as const;

export function SimulatorGames() {
  const [selectedGame, setSelectedGame] = useState<GameKey>("roue");
  const [prizeName, setPrizeName] = useState("Café offert ☕");
  const [playing, setPlaying] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [burst, setBurst] = useState(0);

  // Roue state
  const [wheelRotation, setWheelRotation] = useState(0);

  // Grattage state
  const [scratched, setScratched] = useState(false);

  // Slots state
  const [slotSymbols, setSlotSymbols] = useState(["🍒", "🍋", "⭐"]);

  // Reflexe state
  const [reflexScore, setReflexScore] = useState<number | null>(null);

  const resetState = () => {
    setPlaying(false);
    setHasWon(false);
    setScratched(false);
    setSlotSymbols(["🍒", "🍋", "⭐"]);
    setReflexScore(null);
  };

  const handleSelectGame = (game: GameKey) => {
    setSelectedGame(game);
    resetState();
  };

  const triggerWin = () => {
    setHasWon(true);
    setPlaying(false);
    setBurst((b) => b + 1);
  };

  // Jouer à la roue
  const spinWheel = () => {
    if (playing) return;
    setPlaying(true);
    setHasWon(false);
    const extraDegrees = 1440 + Math.floor(Math.random() * 360);
    const newRotation = wheelRotation + extraDegrees;
    setWheelRotation(newRotation);

    setTimeout(() => {
      triggerWin();
    }, 2500);
  };

  // Jouer au grattage
  const scratchTicket = () => {
    if (scratched || playing) return;
    setPlaying(true);
    setScratched(true);
    setTimeout(() => {
      triggerWin();
    }, 600);
  };

  // Jouer aux slots
  const spinSlots = () => {
    if (playing) return;
    setPlaying(true);
    setHasWon(false);

    let count = 0;
    const interval = setInterval(() => {
      const items = ["🍒", "🍋", "⭐", "🎁", "🔔"];
      setSlotSymbols([
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)],
      ]);
      count++;
      if (count > 10) {
        clearInterval(interval);
        setSlotSymbols(["🎁", "🎁", "🎁"]);
        triggerWin();
      }
    }, 120);
  };

  // Jouer au réflexe
  const testReflex = () => {
    if (playing) {
      setPlaying(false);
      setReflexScore(100);
      triggerWin();
    } else {
      setPlaying(true);
      setHasWon(false);
      setReflexScore(null);
    }
  };

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border-[2.5px] border-[#181512] bg-white p-4 sm:p-6 md:p-7 shadow-[0_4px_0_#181512]">
      <ConfettiBurst count={burst} />

      {/* En-tête du simulateur */}
      <div className="flex flex-col gap-3 pb-5 border-b border-[#181512]/15 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#181512]/70">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B35] animate-pulse" />
            Simulateur en direct · 15 mécaniques
          </span>
          <h3 className="mt-1 text-xl sm:text-2xl font-black text-[#181512]" style={DISPLAY}>
            Testez le jeu comme vos clients
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#FFE600] border border-[#181512] px-2.5 py-0.5 text-[10px] font-black text-[#181512] shadow-[0_1px_0_#181512]">
            ⚡ Zéro appli
          </span>
          <span className="rounded-full bg-[#10B981]/20 border border-[#181512] px-2.5 py-0.5 text-[10px] font-black text-[#065F46] shadow-[0_1px_0_#181512]">
            🛡️ Sécurisé
          </span>
        </div>
      </div>

      {/* Sélecteur de mécanique */}
      <div className="mt-4 flex flex-wrap gap-2">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => handleSelectGame(g.id)}
            className={`flex items-center gap-2 rounded-xl border-2 border-[#181512] px-3.5 py-2 text-xs font-black transition-all cursor-pointer ${
              selectedGame === g.id
                ? "bg-[#FF6B35] text-white shadow-[0_2px_0_#181512] -translate-y-0.5"
                : "bg-[#FFFDF8] text-[#181512] hover:bg-[#FFE600]"
            }`}
          >
            <span className="text-lg">{g.emoji}</span>
            <span>{g.label}</span>
          </button>
        ))}
      </div>

      {/* Grille principale : Paramètres Commerçant + Écran Smartphone Joueur */}
      <div className="mt-7 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Colonne gauche : Panneau de réglages commerçant */}
        <div className="space-y-5 rounded-2xl border-2 border-k-ink/15 bg-white/75 p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-k-muted">
              1. Côté commerçant (Dashboard)
            </p>
            <span className="rounded-md bg-k-ink text-k-bg px-2 py-0.5 text-[11px] font-black">
              Temps réel
            </span>
          </div>

          <div>
            <label htmlFor="sim-prize" className="block text-sm font-black text-k-ink">
              Lot à faire gagner :
            </label>
            <input
              id="sim-prize"
              type="text"
              value={prizeName}
              onChange={(e) => setPrizeName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-bold text-k-ink shadow-inner focus:outline-none focus:ring-2 focus:ring-k-orange"
              placeholder="Ex: Café offert, -15% sur l'addition..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl border border-k-ink/20 bg-k-bg/80 p-3">
              <p className="text-[11px] font-bold text-k-muted">Distribution</p>
              <p className="text-sm font-black text-k-ink">Pondération sécurisée</p>
              <p className="mt-1 text-[11px] text-k-body font-semibold">Tirage cryptographique sur serveur</p>
            </div>
            <div className="rounded-xl border border-k-ink/20 bg-k-bg/80 p-3">
              <p className="text-[11px] font-bold text-k-muted">Validation Caisse</p>
              <p className="text-sm font-black text-k-ink">Code unique universel</p>
              <p className="mt-1 text-[11px] text-k-body font-semibold">Scanné en 1 seconde en boutique</p>
            </div>
          </div>

          <div className="rounded-xl border-2 border-k-ink bg-k-yellow/30 p-3.5">
            <p className="text-xs font-black text-k-ink flex items-center gap-1.5">
              <span>💡</span> Ce que voit votre client :
            </p>
            <p className="mt-1 text-xs text-k-body font-bold leading-relaxed">
              {GAMES.find((g) => g.id === selectedGame)?.tagline}
            </p>
          </div>
        </div>

        {/* Colonne droite : Mockup Smartphone Joueur */}
        <div className="relative mx-auto w-full max-w-[320px]">
          <div className="k-border k-hard rounded-[38px] bg-k-ink p-3.5 shadow-2xl">
            <div className="relative flex flex-col items-center justify-between rounded-[30px] bg-k-bg p-5 text-center min-h-[440px] border border-k-ink/20 overflow-hidden">
              {/* Encoche & En-tête mobile */}
              <div className="w-full">
                <div className="mx-auto h-4 w-24 rounded-full bg-k-ink/20 mb-3" />
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-k-muted">
                  Bistrot des Amis
                </p>
                <h4 className="text-base font-black text-k-ink" style={DISPLAY}>
                  {GAMES.find((g) => g.id === selectedGame)?.label}
                </h4>
              </div>

              {/* Zone centrale selon le jeu */}
              <div className="my-auto w-full py-4 flex flex-col items-center justify-center">
                {/* 1. ROUE */}
                {selectedGame === "roue" && (
                  <div className="relative flex flex-col items-center">
                    <div className="relative h-44 w-44">
                      {/* Pointeur */}
                      <div
                        className="absolute left-1/2 -top-3 -translate-x-1/2 z-20"
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "10px solid transparent",
                          borderRight: "10px solid transparent",
                          borderTop: "18px solid var(--color-k-ink)",
                        }}
                      />
                      {/* Disque roue */}
                      <div
                        className="h-full w-full rounded-full border-4 border-k-ink shadow-md transition-transform duration-[2500ms] ease-out"
                        style={{
                          transform: `rotate(${wheelRotation}deg)`,
                          background:
                            "conic-gradient(#f5793b 0 45deg, #fcca59 45deg 90deg, #f296bd 90deg 135deg, #99b7f5 135deg 180deg, #267f53 180deg 225deg, #f5793b 225deg 270deg, #fcca59 270deg 315deg, #f296bd 315deg 360deg)",
                        }}
                      />
                      {/* Moyeu central */}
                      <div className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-k-ink bg-white font-black text-sm shadow">
                        🎁
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. GRATTAGE */}
                {selectedGame === "grattage" && (
                  <div className="w-full">
                    <div
                      onClick={scratchTicket}
                      className={`k-border mx-auto h-36 w-48 rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all ${
                        scratched
                          ? "bg-k-yellow/30 border-dashed"
                          : "bg-gradient-to-br from-k-orange to-k-pink text-white shadow-md hover:scale-105"
                      }`}
                    >
                      {scratched ? (
                        <div className="animate-in fade-in zoom-in-90 duration-300">
                          <span className="text-3xl">🎉</span>
                          <p className="mt-1 text-xs font-black uppercase text-k-ink">Bravo !</p>
                          <p className="text-sm font-black text-k-orange-text">{prizeName}</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-3xl">🪙</span>
                          <p className="mt-1 text-xs font-black uppercase tracking-wider">
                            Touchez pour gratter
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. SLOTS */}
                {selectedGame === "slots" && (
                  <div className="w-full">
                    <div className="k-border mx-auto flex h-24 w-52 items-center justify-around rounded-2xl bg-white p-2 shadow-inner">
                      {slotSymbols.map((sym, idx) => (
                        <div
                          key={idx}
                          className="flex h-16 w-14 items-center justify-center rounded-xl bg-k-bg border border-k-ink/20 text-3xl font-black shadow-sm"
                        >
                          {sym}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. RÉFLEXE */}
                {selectedGame === "reflexe" && (
                  <div className="w-full">
                    <div className="k-border mx-auto h-28 w-48 rounded-2xl bg-white p-4 flex flex-col items-center justify-center">
                      {playing ? (
                        <div className="space-y-2">
                          <p className="text-xs font-black text-k-green animate-pulse">
                            STOPPEZ AU BON MOMENT !
                          </p>
                          <div className="h-4 w-36 rounded-full bg-k-bg border border-k-ink overflow-hidden relative">
                            <div className="h-full w-8 bg-k-green absolute left-14" />
                            <div className="h-full w-2 bg-k-ink absolute animate-bounce" />
                          </div>
                        </div>
                      ) : reflexScore ? (
                        <div>
                          <span className="text-2xl">⚡ 100%</span>
                          <p className="text-xs font-black text-k-green">Réflexe parfait !</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-3xl">🎯</span>
                          <p className="text-xs font-bold text-k-muted">Épreuve d&apos;adresse</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Carte de gain universelle */}
                {hasWon && (
                  <div className="mt-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-xl border-2 border-k-ink bg-k-yellow p-2.5 text-center shadow">
                    <p className="text-[11px] font-black uppercase text-k-ink">
                      Gain remporté !
                    </p>
                    <p className="text-sm font-black text-k-ink">{prizeName}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-black border border-k-ink">
                      <span>🎟️ Code caisse :</span>
                      <span className="font-mono text-k-orange-text">LC-8842</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton d'action du joueur */}
              <div className="w-full pt-2">
                {selectedGame === "roue" && (
                  <button
                    type="button"
                    disabled={playing}
                    onClick={spinWheel}
                    className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-orange py-2.5 text-sm font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] disabled:opacity-50"
                  >
                    {playing ? "La roue tourne..." : "Tourner la roue !"}
                  </button>
                )}

                {selectedGame === "grattage" && (
                  <button
                    type="button"
                    onClick={scratchTicket}
                    className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow py-2.5 text-sm font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]"
                  >
                    {scratched ? "Réinitialiser" : "Gratter la carte"}
                  </button>
                )}

                {selectedGame === "slots" && (
                  <button
                    type="button"
                    disabled={playing}
                    onClick={spinSlots}
                    className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-pink py-2.5 text-sm font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] disabled:opacity-50"
                  >
                    {playing ? "Tirage en cours..." : "Lancer les rouleaux"}
                  </button>
                )}

                {selectedGame === "reflexe" && (
                  <button
                    type="button"
                    onClick={testReflex}
                    className={`k-btn w-full rounded-2xl border-2 border-k-ink py-2.5 text-sm font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] ${
                      playing ? "bg-k-green text-k-bg" : "bg-k-blue text-k-ink"
                    }`}
                  >
                    {playing ? "STOP !" : reflexScore ? "Recommencer" : "Démarrer l'épreuve"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
