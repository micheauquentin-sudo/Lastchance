"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Magnetic } from "./magnetic";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface TradePreset {
  id: string;
  name: string;
  emoji: string;
  ticket: number;
  clients: number;
  participationRate: number;
  returnRate: number;
  planName: string;
  planPrice: number;
  focusText: string;
}

const TRADE_PRESETS: readonly TradePreset[] = [
  {
    id: "restaurant",
    name: "Restaurant",
    emoji: "🍽️",
    ticket: 28,
    clients: 120,
    participationRate: 0.35,
    returnRate: 0.24,
    planName: "Sur Place (79€)",
    planPrice: 79,
    focusText: "Addition + Roue + Réservation directe sans commission",
  },
  {
    id: "bar",
    name: "Bar & Pub",
    emoji: "🍻",
    ticket: 16,
    clients: 160,
    participationRate: 0.42,
    returnRate: 0.26,
    planName: "Le Grand Jeu (89€)",
    planPrice: 89,
    focusText: "Happy hour gamifié + Soirées pronostics en direct",
  },
  {
    id: "boutique",
    name: "Boutique",
    emoji: "🛍️",
    ticket: 42,
    clients: 70,
    participationRate: 0.32,
    returnRate: 0.22,
    planName: "Le Club (59€)",
    planPrice: 59,
    focusText: "Tickets à gratter + Passeport fidélité Apple/Google Wallet",
  },
  {
    id: "salon",
    name: "Salon & Beauté",
    emoji: "💇",
    ticket: 45,
    clients: 40,
    participationRate: 0.45,
    returnRate: 0.30,
    planName: "Coup d'envoi (29€)",
    planPrice: 29,
    focusText: "Roue VIP + Parrainage et fidélité dématérialisée",
  },
];

export function TradeRoiSimulator() {
  const [selectedTrade, setSelectedTrade] = useState<TradePreset>(TRADE_PRESETS[0]);
  const [clientsPerDay, setClientsPerDay] = useState<number>(TRADE_PRESETS[0].clients);
  const [ticketPrice, setTicketPrice] = useState<number>(TRADE_PRESETS[0].ticket);

  const clientsInputId = useId();
  const ticketInputId = useId();

  const handleTradeChange = (trade: TradePreset) => {
    setSelectedTrade(trade);
    setClientsPerDay(trade.clients);
    setTicketPrice(trade.ticket);
  };

  // Calculs réalistes de retombées mensuelles
  const monthlyClients = clientsPerDay * 30;
  const monthlyPlayers = Math.round(monthlyClients * selectedTrade.participationRate);
  const monthlyReturns = Math.round(monthlyPlayers * selectedTrade.returnRate);
  const estimatedRevenue = Math.round(monthlyReturns * ticketPrice);
  const daysToRoi = Math.max(1, Math.round(selectedTrade.planPrice / Math.max(1, estimatedRevenue / 30)));

  return (
    <div className="w-full rounded-2xl border-[2.5px] border-[#181512] bg-white p-3.5 sm:p-5 md:p-5.5 shadow-[0_4px_0_#181512]">
      {/* Choix du secteur d'activité */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/60">
          1. Sélectionnez votre activité
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {TRADE_PRESETS.map((trade) => {
            const isSelected = selectedTrade.id === trade.id;
            return (
              <button
                key={trade.id}
                type="button"
                onClick={() => handleTradeChange(trade)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#181512] px-2.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#FFE600] text-[#181512] shadow-[0_2px_0_#181512] scale-[1.01]"
                    : "bg-[#FFFDF8] text-[#181512]/75 hover:bg-white hover:text-[#181512]"
                }`}
              >
                <span className="text-sm">{trade.emoji}</span>
                <span>{trade.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid items-center gap-4 lg:grid-cols-12">
        {/* Curseur et paramètres */}
        <div className="space-y-3 lg:col-span-7">
          {/* Slider 1 : Clients par jour */}
          <div className="rounded-xl border-2 border-[#181512]/15 bg-[#FFFDF8] p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={clientsInputId} className="text-xs font-black text-[#181512]">
                Clients accueillis par jour
              </label>
              <span className="rounded-full border-2 border-[#181512] bg-[#fcca59] px-2 py-0.5 text-[11px] font-black text-[#181512] shadow-[0_1.5px_0_#181512]">
                {clientsPerDay} clients / j
              </span>
            </div>
            <input
              id={clientsInputId}
              type="range"
              min={20}
              max={400}
              step={5}
              value={clientsPerDay}
              onChange={(e) => setClientsPerDay(Number(e.target.value))}
              className="mt-2 w-full accent-[#FF6B35] cursor-pointer"
            />
            <div className="mt-0.5 flex justify-between text-[9px] font-bold text-[#181512]/50">
              <span>20 clients</span>
              <span>200 clients</span>
              <span>400 clients</span>
            </div>
          </div>

          {/* Slider 2 : Panier moyen */}
          <div className="rounded-xl border-2 border-[#181512]/15 bg-[#FFFDF8] p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={ticketInputId} className="text-xs font-black text-[#181512]">
                Panier moyen par client
              </label>
              <span className="rounded-full border-2 border-[#181512] bg-white px-2 py-0.5 text-[11px] font-black text-[#181512] shadow-[0_1.5px_0_#181512]">
                {ticketPrice} €
              </span>
            </div>
            <input
              id={ticketInputId}
              type="range"
              min={10}
              max={100}
              step={1}
              value={ticketPrice}
              onChange={(e) => setTicketPrice(Number(e.target.value))}
              className="mt-2 w-full accent-[#FF6B35] cursor-pointer"
            />
            <div className="mt-0.5 flex justify-between text-[9px] font-bold text-[#181512]/50">
              <span>10 €</span>
              <span>50 €</span>
              <span>100 €</span>
            </div>
          </div>

          {/* Détail d'usage pour ce commerce */}
          <div className="rounded-xl border-2 border-[#181512]/15 bg-white p-2.5 text-xs font-bold text-[#181512]/80">
            <span className="font-black text-[#FF6B35]">💡 En pratique : </span>
            {selectedTrade.focusText}
          </div>
        </div>

        {/* Bloc résultats et ROI */}
        <div className="lg:col-span-5">
          <div className="relative rounded-2xl border-[2.5px] border-[#181512] bg-[#FFFBEB] p-4 sm:p-4.5 pb-4.5 text-center shadow-[0_4px_0_#181512]">
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-white px-2.5 py-0.5 text-[10px] font-black text-[#181512] shadow-[0_1.5px_0_#181512]">
              <span>📈</span> Estimation mensuelle
            </div>

            <div className="mt-2.5">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#181512]/60">
                Chiffre d&apos;affaires additionnel estimé
              </div>
              <div
                className="mt-0.5 text-2xl sm:text-3xl font-black text-[#181512]"
                style={DISPLAY}
              >
                +{estimatedRevenue.toLocaleString("fr-FR")} €
              </div>
              <div className="text-[10px] font-bold text-[#181512]/60">
                par mois de retombées directes
              </div>
            </div>

            <div className="my-3 border-t-2 border-[#181512]/15" />

            {/* Chiffres clés décomposés */}
            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="rounded-lg border border-[#181512]/15 bg-white p-2">
                <div className="text-[9px] font-bold text-[#181512]/60">Joueurs / mois</div>
                <div className="text-sm font-black text-[#181512]" style={DISPLAY}>
                  ~{monthlyPlayers}
                </div>
              </div>
              <div className="rounded-lg border border-[#181512]/15 bg-white p-2">
                <div className="text-[9px] font-bold text-[#181512]/60">Revisites générées</div>
                <div className="text-sm font-black text-[#10B981]" style={DISPLAY}>
                  +{monthlyReturns}
                </div>
              </div>
            </div>

            {/* Badge de rentabilité express */}
            <div className="mt-2.5 rounded-lg border-2 border-[#181512] bg-[#fcca59] p-2 text-[10px] font-black text-[#181512] shadow-[0_1.5px_0_#181512]">
              ⚡ {selectedTrade.planName} · Rentabilisé en {daysToRoi} {daysToRoi > 1 ? "jours" : "jour"} !
            </div>

            <div className="mt-3">
              <Magnetic className="block w-full">
                <Link
                  href="/signup"
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FF6B35] py-2 text-xs font-black text-white shadow-[0_2px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_0_#181512] active:translate-y-0.5"
                >
                  Tester 7 jours offerts →
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
