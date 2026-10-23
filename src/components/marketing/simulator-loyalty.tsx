"use client";

import { useState } from "react";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

type LoyaltySimTab = "tampons" | "jackpot" | "coffre" | "ticket-or";

export function SimulatorLoyalty() {
  const [activeTab, setActiveTab] = useState<LoyaltySimTab>("tampons");
  const [burst, setBurst] = useState(0);

  // State : Tampons
  const [stamps, setStamps] = useState(7);
  const maxStamps = 10;

  // State : Jackpot collectif
  const [jackpotGauge, setJackpotGauge] = useState(82);
  const [jackpotWinner, setJackpotWinner] = useState<string | null>(null);

  // State : Missions & Coffre
  const [keysCollected, setKeysCollected] = useState(2);
  const [chestOpened, setChestOpened] = useState(false);

  // State : Ticket d'Or
  const [goldenTicketSent, setGoldenTicketSent] = useState(false);

  // Actions
  const handleAddStamp = () => {
    if (stamps < maxStamps) {
      const next = stamps + 1;
      setStamps(next);
      if (next === maxStamps) {
        setBurst((b) => b + 1);
      }
    }
  };

  const handleAddJackpotScan = () => {
    if (jackpotGauge < 100) {
      const next = Math.min(100, jackpotGauge + 6);
      setJackpotGauge(next);
      if (next === 100) {
        setBurst((b) => b + 1);
        setJackpotWinner("Thomas D. (#LC-4821)");
      }
    }
  };

  const handleCompleteMission = () => {
    if (keysCollected < 3) {
      const next = keysCollected + 1;
      setKeysCollected(next);
      if (next === 3) {
        setBurst((b) => b + 1);
      }
    }
  };

  const handleOpenChest = () => {
    setChestOpened(true);
    setBurst((b) => b + 1);
  };

  const handleSendGoldenTicket = () => {
    setGoldenTicketSent(true);
    setBurst((b) => b + 1);
  };

  const handleResetAll = () => {
    setStamps(4);
    setJackpotGauge(75);
    setJackpotWinner(null);
    setKeysCollected(1);
    setChestOpened(false);
    setGoldenTicketSent(false);
  };

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border-[2.5px] border-[#181512] bg-white p-4 sm:p-6 md:p-7 shadow-[0_4px_0_#181512]">
      <ConfettiBurst count={burst} />

      {/* En-tête du simulateur */}
      <div className="flex flex-col gap-3 pb-5 border-b border-[#181512]/15 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#181512]/70">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5C93] animate-pulse" />
            Simulateur Club Fidélité &amp; Jeux
          </span>
          <h3 className="mt-1 text-xl sm:text-2xl font-black text-[#181512]" style={DISPLAY}>
            Tout ce que vous pouvez créer avec le Passeport
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#FFE600] border border-[#181512] px-2.5 py-0.5 text-[10px] font-black text-[#181512] shadow-[0_1px_0_#181512]">
            Apple &amp; Google Wallet
          </span>
          <span className="rounded-full bg-[#FF5C93]/20 border border-[#181512] px-2.5 py-0.5 text-[10px] font-black text-[#181512] shadow-[0_1px_0_#181512]">
            Club VIP Gamifié
          </span>
        </div>
      </div>

      {/* Les 4 Onglets d'expériences autour du passeport */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("tampons")}
          className={`flex items-center gap-2 rounded-xl border-2 border-[#181512] px-3.5 py-2 text-xs font-black transition-all cursor-pointer ${
            activeTab === "tampons"
              ? "bg-[#FF5C93] text-white shadow-[0_2px_0_#181512] -translate-y-0.5"
              : "bg-[#FFFDF8] text-[#181512] hover:bg-[#FFE600]"
          }`}
        >
          <span>🎟️</span>
          <span>Tampons Wallet</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("jackpot")}
          className={`flex items-center gap-2 rounded-xl border-2 border-[#181512] px-3.5 py-2 text-xs font-black transition-all cursor-pointer ${
            activeTab === "jackpot"
              ? "bg-[#FFE600] text-[#181512] shadow-[0_2px_0_#181512] -translate-y-0.5"
              : "bg-[#FFFDF8] text-[#181512] hover:bg-[#FFE600]"
          }`}
        >
          <span>🎰</span>
          <span>Jackpot Collectif</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("coffre")}
          className={`flex items-center gap-2 rounded-xl border-2 border-[#181512] px-3.5 py-2 text-xs font-black transition-all cursor-pointer ${
            activeTab === "coffre"
              ? "bg-[#FF6B35] text-white shadow-[0_2px_0_#181512] -translate-y-0.5"
              : "bg-[#FFFDF8] text-[#181512] hover:bg-[#FFE600]"
          }`}
        >
          <span>🏆</span>
          <span>Missions &amp; Coffre</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ticket-or")}
          className={`k-btn flex items-center gap-2 rounded-2xl border-2 border-k-ink px-4 py-2.5 text-xs sm:text-sm font-black transition-all ${
            activeTab === "ticket-or"
              ? "bg-k-green text-k-bg shadow-[0_4px_0_var(--color-k-ink)] -translate-y-0.5"
              : "bg-white text-k-body hover:bg-k-yellow/30"
          }`}
        >
          <span>✨</span>
          <span>Ticket d&apos;Or VIP</span>
        </button>
      </div>

      {/* Grille principale : Paramètres Commerçant + Écran Smartphone Joueur */}
      <div className="mt-7 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Colonne gauche : Panneau commerçant et explications */}
        <div className="space-y-5 rounded-2xl border-2 border-k-ink/15 bg-white/80 p-5 sm:p-6 backdrop-blur-sm">
          {/* 1. Onglet TAMPONS */}
          {activeTab === "tampons" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-k-muted">
                  Action caisse : Tamponner le Wallet
                </p>
                <span className="rounded-md bg-k-pink text-k-ink px-2 py-0.5 text-[11px] font-black">
                  Apple & Google
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-k-body leading-relaxed">
                Le client présente son pass ou son QR code. Un clic sur votre écran suffit pour ajouter un tampon et rapprocher votre client de sa récompense.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddStamp}
                  disabled={stamps >= maxStamps}
                  className="k-btn flex-1 rounded-xl border-2 border-k-ink bg-k-orange py-3 text-sm font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)] disabled:opacity-50"
                >
                  {stamps >= maxStamps ? "Palier atteint ! 🎉" : "+1 Tamponner un passage ☕"}
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-xl border border-k-ink/30 bg-white px-3 py-2 text-xs font-bold text-k-body"
                >
                  ↺
                </button>
              </div>
              <div className="rounded-xl border border-k-ink/20 bg-k-bg p-3 text-xs font-bold text-k-body">
                💡 <strong>Le saviez-vous ?</strong> Le pass envoie une notification discrète sur le téléphone dès que le client passe à moins de 300m de votre boutique.
              </div>
            </div>
          )}

          {/* 2. Onglet JACKPOT COLLECTIF */}
          {activeTab === "jackpot" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-k-muted">
                  Jauge solidaire de l&apos;établissement
                </p>
                <span className="rounded-md bg-k-yellow text-k-ink px-2 py-0.5 text-[11px] font-black">
                  Tirage au sort
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-k-body leading-relaxed">
                Chaque visite d&apos;un client porteur du passeport fait monter la jauge collective. Dès que les 100 % sont atteints, un tirage au sort automatique désigne le gagnant parmi tous les participants du mois !
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddJackpotScan}
                  disabled={jackpotGauge >= 100}
                  className="k-btn flex-1 rounded-xl border-2 border-k-ink bg-k-yellow py-3 text-sm font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)] disabled:opacity-50"
                >
                  {jackpotGauge >= 100 ? "Jackpot déclenché ! 🎊" : "+1 Passage client (+6%) 🎰"}
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-xl border border-k-ink/30 bg-white px-3 py-2 text-xs font-bold text-k-body"
                >
                  ↺
                </button>
              </div>
              <div className="rounded-xl border border-k-ink/20 bg-k-bg p-3 text-xs font-bold text-k-body">
                💡 <strong>Bénéfice :</strong> Crée une dynamique de groupe et une vraie raison de revenir consommer pour aider à faire grimper la cagnotte.
              </div>
            </div>
          )}

          {/* 3. Onglet MISSIONS & COFFRE */}
          {activeTab === "coffre" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-k-muted">
                  Progression & Défis Gamifiés
                </p>
                <span className="rounded-md bg-k-orange text-k-ink px-2 py-0.5 text-[11px] font-black">
                  Méta-jeu
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-k-body leading-relaxed">
                Proposez des défis simples à vos clients (« Déjeuner un mardi », « Tester le dessert du chef », « Recommander un collègue »). Chaque mission rapporte une clé 🗝️ pour ouvrir le coffre aux trésors !
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCompleteMission}
                  disabled={keysCollected >= 3}
                  className="k-btn flex-1 rounded-xl border-2 border-k-ink bg-k-orange py-3 text-sm font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)] disabled:opacity-50"
                >
                  {keysCollected >= 3 ? "3 clés obtenues ! 🗝️" : "Valider un défi (+1 Clé) 🗝️"}
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-xl border border-k-ink/30 bg-white px-3 py-2 text-xs font-bold text-k-body"
                >
                  ↺
                </button>
              </div>
              <div className="rounded-xl border border-k-ink/20 bg-k-bg p-3 text-xs font-bold text-k-body">
                💡 <strong>Bénéfice :</strong> Vos clients jouent le jeu toute la semaine pour collecter leurs 3 clés et découvrir la surprise du coffre.
              </div>
            </div>
          )}

          {/* 4. Onglet TICKET D'OR */}
          {activeTab === "ticket-or" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-k-muted">
                  Geste de Service VIP en Caisse
                </p>
                <span className="rounded-md bg-k-green text-k-bg px-2 py-0.5 text-[11px] font-black">
                  Surprise instantanée
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-k-body leading-relaxed">
                Envie de surprendre un client fidèle à l&apos;improviste ? Émettez un Ticket d&apos;Or en caisse en 1 clic. Le client reçoit un pass doré étincelant avec un cadeau exceptionnel tracé dans votre registre.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSendGoldenTicket}
                  disabled={goldenTicketSent}
                  className="k-btn flex-1 rounded-xl border-2 border-k-ink bg-k-green py-3 text-sm font-black text-k-bg shadow-[0_3px_0_var(--color-k-ink)] disabled:opacity-50"
                >
                  {goldenTicketSent ? "Ticket d'Or remis ! ✨" : "Émettre un Ticket d'Or VIP ✨"}
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-xl border border-k-ink/30 bg-white px-3 py-2 text-xs font-bold text-k-body"
                >
                  ↺
                </button>
              </div>
              <div className="rounded-xl border border-k-ink/20 bg-k-bg p-3 text-xs font-bold text-k-body">
                💡 <strong>Effet Wouah garanti :</strong> L&apos;expérience client dont on parle à ses collègues et qui s&apos;affiche sur les réseaux sociaux.
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite : Mockup Smartphone Joueur */}
        <div className="relative mx-auto w-full max-w-[320px]">
          <div className="k-border k-hard rounded-[38px] bg-k-ink p-3.5 shadow-2xl">
            <div className="relative flex flex-col rounded-[30px] bg-k-bg p-4 min-h-[460px] border border-k-ink/20 overflow-hidden text-center">
              {/* Encoche */}
              <div className="mx-auto h-3.5 w-20 rounded-full bg-k-ink/20 mb-2" />

              {/* 1. ÉCRAN SMARTPHONE : TAMPONS WALLET */}
              {activeTab === "tampons" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border-2 border-k-ink bg-gradient-to-br from-k-yellow via-k-yellow/60 to-k-orange/40 p-3.5 shadow-md text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-k-ink text-xs shadow-sm">
                          🥐
                        </span>
                        <div>
                          <p className="text-[10px] font-black uppercase text-k-ink">Le Café des Amis</p>
                          <p className="text-[9px] font-bold text-k-muted">Passeport Fidélité VIP</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-k-ink text-k-bg px-2 py-0.5 text-[8px] font-black">
                        Wallet
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl bg-white/90 p-2.5 border border-k-ink/20 shadow-sm">
                      <div className="flex items-baseline justify-between text-[10px]">
                        <span className="font-black uppercase text-k-muted">Solde</span>
                        <span className="font-black text-k-orange-text">{stamps} / {maxStamps} tampons</span>
                      </div>
                      <div className="mt-1 h-2.5 w-full rounded-full border border-k-ink bg-k-bg overflow-hidden">
                        <div
                          className="h-full bg-k-orange transition-all duration-500 rounded-full"
                          style={{ width: `${(stamps / maxStamps) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-1">
                      {Array.from({ length: maxStamps }).map((_, index) => {
                        const isStamped = index < stamps;
                        const isLast = index === maxStamps - 1;
                        return (
                          <div
                            key={index}
                            className={`flex h-8 items-center justify-center rounded-lg border-2 text-[11px] font-black ${
                              isStamped
                                ? "border-k-ink bg-k-orange text-k-ink shadow-sm"
                                : isLast
                                ? "border-dashed border-k-pink bg-k-pink/20 text-k-ink"
                                : "border-dashed border-k-ink/30 bg-white/60 text-k-muted"
                            }`}
                          >
                            {isStamped ? "☕" : isLast ? "🎁" : index + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {stamps >= maxStamps ? (
                    <div className="animate-in zoom-in-95 rounded-xl border-2 border-k-ink bg-k-green/20 p-3 shadow">
                      <span className="text-2xl">🎉</span>
                      <p className="text-xs font-black text-k-green uppercase">Palier Atteint !</p>
                      <p className="text-xs font-black text-k-ink">Formule offerte débloquée</p>
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[9px] font-black border border-k-ink">
                        <span>Code caisse :</span>
                        <span className="font-mono text-k-orange-text">FID-8821</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-k-ink/15 bg-white/80 p-2.5 text-left text-[10px] font-bold text-k-body">
                      Plus que {maxStamps - stamps} tampons avant votre cadeau gourmand !
                    </div>
                  )}
                </div>
              )}

              {/* 2. ÉCRAN SMARTPHONE : JACKPOT COLLECTIF */}
              {activeTab === "jackpot" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border-2 border-k-ink bg-gradient-to-br from-k-yellow via-k-yellow/50 to-k-blue/30 p-4 shadow text-center">
                    <span className="text-3xl">🎰</span>
                    <h5 className="mt-1 text-sm font-black text-k-ink" style={DISPLAY}>
                      Jackpot Collectif de la Salle
                    </h5>
                    <p className="text-[10px] font-bold text-k-body">
                      À chaque passage, la cagnotte monte !
                    </p>

                    <div className="mt-4 rounded-xl bg-white/90 p-3 border border-k-ink/20">
                      <div className="flex items-baseline justify-between text-xs font-black">
                        <span className="text-k-muted">Jauge commune</span>
                        <span className="text-k-orange-text font-mono text-sm">{jackpotGauge} %</span>
                      </div>
                      <div className="mt-1.5 h-4 w-full rounded-full border border-k-ink bg-k-bg overflow-hidden p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-k-orange to-k-yellow transition-all duration-500 rounded-full"
                          style={{ width: `${jackpotGauge}%` }}
                        />
                      </div>
                    </div>

                    {jackpotGauge >= 100 ? (
                      <div className="mt-3 animate-in zoom-in-95 rounded-xl border-2 border-k-ink bg-k-green p-2.5 text-k-bg font-black text-xs">
                        🎉 JACKPOT GAGNÉ !<br />
                        <span className="text-[11px] font-normal">Gagnant : {jackpotWinner}</span>
                      </div>
                    ) : (
                      <p className="mt-3 text-[10px] font-bold text-k-body">
                        🎯 Lot en jeu : 1 dîner pour 2 personnes offert
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 3. ÉCRAN SMARTPHONE : MISSIONS & COFFRE */}
              {activeTab === "coffre" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border-2 border-k-ink bg-k-yellow/25 p-3.5 text-center">
                    <h5 className="text-sm font-black text-k-ink" style={DISPLAY}>
                      Missions & Coffre Mystère
                    </h5>
                    <div className="mt-2 flex justify-center gap-2">
                      {[1, 2, 3].map((k) => (
                        <div
                          key={k}
                          className={`h-9 w-9 rounded-xl border-2 border-k-ink flex items-center justify-center text-base ${
                            k <= keysCollected ? "bg-k-yellow shadow-sm" : "bg-white/60 opacity-40 border-dashed"
                          }`}
                        >
                          🗝️
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] font-black text-k-ink">
                      {keysCollected}/3 clés collectées
                    </p>

                    {/* Coffre interactif */}
                    <div className="mt-4 p-3 rounded-2xl border-2 border-k-ink bg-white shadow-inner">
                      {chestOpened ? (
                        <div className="animate-in zoom-in-90">
                          <span className="text-4xl">👑</span>
                          <p className="mt-1 text-xs font-black text-k-orange-text">Coffre Ouvert !</p>
                          <p className="text-[10px] font-bold text-k-body">Badge VIP + Boisson offerte</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-4xl">🧰</span>
                          <p className="mt-1 text-xs font-black text-k-ink">Coffre verrouillé</p>
                          {keysCollected >= 3 && (
                            <button
                              type="button"
                              onClick={handleOpenChest}
                              className="mt-2 rounded-lg bg-k-orange border border-k-ink px-3 py-1 text-xs font-black text-k-ink animate-bounce"
                            >
                              Ouvrir le coffre !
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. ÉCRAN SMARTPHONE : TICKET D'OR */}
              {activeTab === "ticket-or" && (
                <div className="space-y-3">
                  {goldenTicketSent ? (
                    <div className="animate-in zoom-in-95 rounded-2xl border-4 border-k-yellow bg-gradient-to-b from-k-yellow via-yellow-100 to-k-orange/40 p-4 text-center shadow-lg">
                      <span className="text-4xl">✨</span>
                      <h5 className="mt-1 text-base font-black text-k-ink" style={DISPLAY}>
                        TICKET D&apos;OR VIP
                      </h5>
                      <p className="mt-1 text-[11px] font-bold text-k-body">
                        Offert par la direction pour votre fidélité
                      </p>
                      <div className="my-3 rounded-xl border-2 border-k-ink bg-white p-2 text-xs font-black text-k-orange-text">
                        🎁 Bouteille de champagne offerte
                      </div>
                      <p className="text-[9px] font-mono text-k-muted">
                        Pass n° LC-GOLD-7701 · Valable 30 jours
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-k-ink/30 bg-white/60 p-6 text-center">
                      <span className="text-4xl opacity-50">🎫</span>
                      <p className="mt-2 text-xs font-bold text-k-muted">
                        Aucun ticket d&apos;or émis pour le moment. Cliquez sur « Émettre » à gauche pour surprendre votre client !
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
