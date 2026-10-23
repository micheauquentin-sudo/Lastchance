"use client";

import { useState } from "react";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

type Lang = "fr" | "en";
type Tab = "menu" | "reservation";

interface MenuItem {
  id: string;
  nameFr: string;
  nameEn: string;
  descFr: string;
  descEn: string;
  price: string;
  tagFr: string;
  tagEn: string;
  emoji: string;
}

const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: "1",
    nameFr: "Burger Fermier & Frites maison",
    nameEn: "Farmhouse Burger & House Fries",
    descFr: "Bœuf charolais, cheddar affiné 18 mois, sauce secrète fumée.",
    descEn: "Charolais beef, 18-month aged cheddar, secret smoked sauce.",
    price: "17,50 €",
    tagFr: "Best-seller",
    tagEn: "Bestseller",
    emoji: "🍔",
  },
  {
    id: "2",
    nameFr: "Cocktail Signature « La Kermesse »",
    nameEn: "Signature Cocktail « La Kermesse »",
    descFr: "Gin artisanal, liqueur de sureau, purée de framboise et bulles.",
    descEn: "Artisanal gin, elderflower liqueur, raspberry puree & bubbles.",
    price: "11,00 €",
    tagFr: "Création",
    tagEn: "Special",
    emoji: "🍹",
  },
  {
    id: "3",
    nameFr: "Tiramisu Spéculoos & Café d'Éthiopie",
    nameEn: "Speculoos Tiramisu & Ethiopian Coffee",
    descFr: "Mascarpone onctueux, biscuit croquant et cacao grand cru.",
    descEn: "Velvety mascarpone, crunchy biscuit and single-origin cocoa.",
    price: "7,50 €",
    tagFr: "Fait maison",
    tagEn: "Homemade",
    emoji: "☕",
  },
] as const;

export function SimulatorVitrine() {
  const [lang, setLang] = useState<Lang>("fr");
  const [tab, setTab] = useState<Tab>("menu");
  const [guests, setGuests] = useState(2);
  const [slot, setSlot] = useState("19:30");
  const [booked, setBooked] = useState(false);
  const [burst, setBurst] = useState(0);

  const handleBook = () => {
    setBooked(true);
    setBurst((b) => b + 1);
  };

  const handleResetBooking = () => {
    setBooked(false);
  };

  return (
    <div className="k-card relative overflow-hidden rounded-3xl p-5 sm:p-8 shadow-xl">
      <ConfettiBurst count={burst} />

      {/* En-tête du simulateur */}
      <div className="flex flex-col gap-3 pb-6 border-b-2 border-k-ink/15 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-k-ink/70">
            <span className="h-2.5 w-2.5 rounded-full bg-k-yellow animate-pulse" />
            Simulateur en direct · Vitrine & Réservation
          </span>
          <h3 className="mt-1 text-2xl sm:text-3xl font-black text-k-ink" style={DISPLAY}>
            Votre carte vivante & vos réservations sans commission
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-k-green/20 border-2 border-k-ink px-3 py-1 text-xs font-black text-k-ink">
            0 % de commission
          </span>
          <span className="rounded-full bg-k-blue/20 border-2 border-k-ink px-3 py-1 text-xs font-black text-k-ink">
            Bilingue FR / EN
          </span>
        </div>
      </div>

      {/* Contrôles du simulateur : bascule de langue et de mode */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase text-k-muted">Langue du client :</span>
          <div className="inline-flex rounded-xl border-2 border-k-ink bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setLang("fr")}
              className={`rounded-lg px-3 py-1 text-xs font-black transition-colors ${
                lang === "fr" ? "bg-k-orange text-k-ink shadow-sm" : "text-k-body hover:bg-k-yellow/30"
              }`}
            >
              🇫🇷 Français
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-lg px-3 py-1 text-xs font-black transition-colors ${
                lang === "en" ? "bg-k-orange text-k-ink shadow-sm" : "text-k-body hover:bg-k-yellow/30"
              }`}
            >
              🇬🇧 English
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase text-k-muted">Parcours testé :</span>
          <div className="inline-flex rounded-xl border-2 border-k-ink bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab("menu")}
              className={`rounded-lg px-3 py-1 text-xs font-black transition-colors ${
                tab === "menu" ? "bg-k-yellow text-k-ink shadow-sm" : "text-k-body hover:bg-k-yellow/30"
              }`}
            >
              📜 Carte & Menu
            </button>
            <button
              type="button"
              onClick={() => setTab("reservation")}
              className={`rounded-lg px-3 py-1 text-xs font-black transition-colors ${
                tab === "reservation" ? "bg-k-yellow text-k-ink shadow-sm" : "text-k-body hover:bg-k-yellow/30"
              }`}
            >
              📅 Réservation de table
            </button>
          </div>
        </div>
      </div>

      {/* Grille principale : Argumentaire / Dashboard + Écran Smartphone */}
      <div className="mt-7 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Colonne gauche : Bénéfices et vue commerçant */}
        <div className="space-y-5 rounded-2xl border-2 border-k-ink/15 bg-white/75 p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-k-muted">
              1. Côté commerçant (Gestion sans friction)
            </p>
            <span className="rounded-md bg-k-green text-k-bg px-2 py-0.5 text-[11px] font-black">
              Sans intermédiaire
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-k-ink/20 bg-k-bg/80 p-3.5 flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-green text-sm font-black text-k-bg">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Fini les commissions de 2 € à 3 € par couvert</p>
                <p className="mt-0.5 text-xs text-k-body font-semibold">
                  Vos clients réservent en direct depuis le QR code ou votre lien Instagram/Google. Vous gardez 100 % de votre marge.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-k-ink/20 bg-k-bg/80 p-3.5 flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-yellow text-sm font-black text-k-ink">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">Bilingue instantané pour touristes</p>
                <p className="mt-0.5 text-xs text-k-body font-semibold">
                  Testez ci-dessus la bascule FR/EN : le client lit la carte dans sa langue sans que vous ayez à imprimer deux jeux de menus.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-k-ink/20 bg-k-bg/80 p-3.5 flex items-start gap-3">
              <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-pink text-sm font-black text-k-ink">
                ✓
              </span>
              <div>
                <p className="text-sm font-black text-k-ink">File d&apos;attente &amp; Roue d&apos;attente gamifiée</p>
                <p className="mt-0.5 text-xs text-k-body font-semibold">
                  Votre salle est pleine ? Vos clients s&apos;inscrivent sur liste d&apos;attente et tournent la roue en attendant qu&apos;une table se libère.
                </p>
              </div>
            </div>
          </div>

          {booked && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-xl border-2 border-k-ink bg-k-green/20 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-k-green flex items-center gap-1.5">
                  <span>🔔</span> Nouvelle réservation reçue dans votre agenda !
                </p>
                <button
                  type="button"
                  onClick={handleResetBooking}
                  className="text-[11px] font-black underline text-k-ink"
                >
                  Réinitialiser
                </button>
              </div>
              <p className="mt-1 text-xs text-k-body font-bold">
                Table pour {guests} personnes · Créneau {slot} · 0 € de commission prélevée
              </p>
            </div>
          )}
        </div>

        {/* Colonne droite : Mockup Smartphone Joueur */}
        <div className="relative mx-auto w-full max-w-[320px]">
          <div className="k-border k-hard rounded-[38px] bg-k-ink p-3.5 shadow-2xl">
            <div className="relative flex flex-col rounded-[30px] bg-k-bg p-4 min-h-[460px] border border-k-ink/20 overflow-hidden text-left">
              {/* Encoche */}
              <div className="mx-auto h-3.5 w-20 rounded-full bg-k-ink/20 mb-2" />

              {/* Header Vitrine */}
              <div className="rounded-2xl border-2 border-k-ink bg-k-yellow p-3 text-center shadow-sm">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white border border-k-ink text-base shadow">
                  🍷
                </span>
                <h4 className="mt-1 text-base font-black text-k-ink" style={DISPLAY}>
                  Le Bistrot des Halles
                </h4>
                <p className="text-[10px] font-bold text-k-body">
                  {lang === "fr" ? "Ouvert aujourd'hui jusqu'à 23h30" : "Open today until 11:30 PM"}
                </p>
                {/* Micro onglets internes smartphone */}
                <div className="mt-2.5 flex rounded-xl border border-k-ink/25 bg-white/70 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTab("menu")}
                    className={`flex-1 rounded-lg py-1 text-[11px] font-black transition-colors ${
                      tab === "menu" ? "bg-k-ink text-k-bg" : "text-k-body"
                    }`}
                  >
                    {lang === "fr" ? "La Carte" : "Menu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("reservation")}
                    className={`flex-1 rounded-lg py-1 text-[11px] font-black transition-colors ${
                      tab === "reservation" ? "bg-k-ink text-k-bg" : "text-k-body"
                    }`}
                  >
                    {lang === "fr" ? "Réserver" : "Book a table"}
                  </button>
                </div>
              </div>

              {/* Contenu : CARTE / MENU */}
              {tab === "menu" && (
                <div className="mt-3 space-y-2.5 overflow-y-auto max-h-[300px] pr-1">
                  {MENU_ITEMS.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-k-ink/20 bg-white p-2.5 shadow-sm hover:border-k-ink transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl">{item.emoji}</span>
                          <div>
                            <p className="text-xs font-black text-k-ink leading-tight">
                              {lang === "fr" ? item.nameFr : item.nameEn}
                            </p>
                            <span className="inline-block rounded bg-k-yellow/40 px-1.5 py-0.2 text-[9px] font-black text-k-ink mt-0.5">
                              {lang === "fr" ? item.tagFr : item.tagEn}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-k-orange-text whitespace-nowrap">
                          {item.price}
                        </span>
                      </div>
                      <p className="mt-1 text-[10.5px] font-semibold text-k-body leading-snug">
                        {lang === "fr" ? item.descFr : item.descEn}
                      </p>
                    </div>
                  ))}
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setTab("reservation")}
                      className="k-btn w-full rounded-xl border-2 border-k-ink bg-k-orange py-2 text-xs font-black text-k-ink shadow-sm"
                    >
                      {lang === "fr" ? "Réserver une table →" : "Book a table now →"}
                    </button>
                  </div>
                </div>
              )}

              {/* Contenu : RÉSERVATION */}
              {tab === "reservation" && (
                <div className="mt-3 space-y-3">
                  {booked ? (
                    <div className="animate-in fade-in zoom-in-95 duration-300 rounded-2xl border-2 border-k-ink bg-k-green/20 p-4 text-center">
                      <span className="text-3xl">🎉</span>
                      <h5 className="mt-1 text-sm font-black text-k-ink" style={DISPLAY}>
                        {lang === "fr" ? "Réservation confirmée !" : "Booking confirmed!"}
                      </h5>
                      <p className="mt-1 text-[11px] font-bold text-k-body">
                        {lang === "fr"
                          ? `Table pour ${guests} personnes réservée à ${slot}.`
                          : `Table for ${guests} guests booked at ${slot}.`}
                      </p>
                      <p className="mt-2 text-[10px] text-k-muted">
                        {lang === "fr"
                          ? "SMS de confirmation envoyé. À tout à l'heure !"
                          : "Confirmation text sent. See you soon!"}
                      </p>
                      <button
                        type="button"
                        onClick={handleResetBooking}
                        className="mt-3 rounded-lg border border-k-ink bg-white px-3 py-1 text-[10px] font-black text-k-ink"
                      >
                        {lang === "fr" ? "Modifier ou nouvelle résa" : "New booking"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Choix des couverts */}
                      <div>
                        <label className="block text-[11px] font-black uppercase text-k-ink">
                          {lang === "fr" ? "Couverts :" : "Guests:"}
                        </label>
                        <div className="mt-1 flex gap-1.5">
                          {[2, 4, 6, 8].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setGuests(num)}
                              className={`flex-1 rounded-lg border border-k-ink py-1 text-xs font-black transition-colors ${
                                guests === num ? "bg-k-orange text-k-ink shadow-sm" : "bg-white text-k-body"
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Choix du créneau */}
                      <div>
                        <label className="block text-[11px] font-black uppercase text-k-ink">
                          {lang === "fr" ? "Créneau disponible :" : "Available time:"}
                        </label>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {["12:30", "13:00", "19:30", "20:00", "20:30", "21:00"].map((time) => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => setSlot(time)}
                              className={`rounded-lg border border-k-ink py-1 text-xs font-black transition-colors ${
                                slot === time ? "bg-k-yellow text-k-ink shadow-sm" : "bg-white text-k-body"
                              }`}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleBook}
                        className="k-btn mt-2 w-full rounded-xl border-2 border-k-ink bg-k-green py-2.5 text-xs font-black text-k-bg shadow-[0_3px_0_var(--color-k-ink)]"
                      >
                        {lang === "fr" ? `Confirmer (${guests} pers. · ${slot})` : `Confirm (${guests} guests · ${slot})`}
                      </button>
                    </>
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
