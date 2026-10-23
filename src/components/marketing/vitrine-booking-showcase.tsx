"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfettiBurst } from "./confetti-burst";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface DishItem {
  id: string;
  category: "plats" | "desserts" | "boissons";
  emoji: string;
  nameFr: string;
  nameEn: string;
  price: string;
  descriptionFr: string;
  descriptionEn: string;
  tagsFr: string[];
  tagsEn: string[];
}

const DISH_PRESETS: readonly DishItem[] = [
  {
    id: "entrecote",
    category: "plats",
    emoji: "🥩",
    nameFr: "Entrecôte grillée (300g)",
    nameEn: "Grilled Ribeye Steak (300g)",
    price: "24 €",
    descriptionFr: "Frites fraîches maison, sauce poivre vert du chef.",
    descriptionEn: "Fresh homemade fries, chef's green peppercorn sauce.",
    tagsFr: ["Fait maison", "Origine France"],
    tagsEn: ["Homemade", "French Origin"],
  },
  {
    id: "burger",
    category: "plats",
    emoji: "🍔",
    nameFr: "Burger Signature du Chef",
    nameEn: "Chef's Signature Burger",
    price: "19 €",
    descriptionFr: "Bœuf charolais, cheddar affiné 12 mois, oignons caramélisés.",
    descriptionEn: "Charolais beef, 12-month aged cheddar, caramelized onions.",
    tagsFr: ["Pain brioché", "Best-seller"],
    tagsEn: ["Brioche Bun", "Bestseller"],
  },
  {
    id: "bowl",
    category: "plats",
    emoji: "🥗",
    nameFr: "Poke Bowl Saumon & Avocat",
    nameEn: "Salmon & Avocado Poke Bowl",
    price: "17 €",
    descriptionFr: "Saumon mariné au sésame, avocat, riz vinaigré, edamame.",
    descriptionEn: "Sesame-marinated salmon, avocado, vinegared rice, edamame.",
    tagsFr: ["Frais & Léger", "Sans gluten"],
    tagsEn: ["Fresh & Light", "Gluten-free"],
  },
  {
    id: "tiramisu",
    category: "desserts",
    emoji: "🍰",
    nameFr: "Tiramisu traditionnel",
    nameEn: "Traditional Tiramisu",
    price: "9 €",
    descriptionFr: "Mascarpone onctueux, biscuit imbibé expresso et cacao pur.",
    descriptionEn: "Creamy mascarpone, espresso-soaked ladyfingers, pure cocoa.",
    tagsFr: ["Fait maison", "Recette secrète"],
    tagsEn: ["Homemade", "Secret Recipe"],
  },
  {
    id: "fondant",
    category: "desserts",
    emoji: "🍫",
    nameFr: "Fondant Chocolat Noir",
    nameEn: "Dark Chocolate Lava Cake",
    price: "8 €",
    descriptionFr: "Cœur coulant 70% pur cacao, boule de glace vanille Bourbon.",
    descriptionEn: "Warm molten 70% cocoa center, Bourbon vanilla scoop.",
    tagsFr: ["Chaud / Froid", "Gourmand"],
    tagsEn: ["Hot & Cold", "Decadent"],
  },
  {
    id: "spritz",
    category: "boissons",
    emoji: "🍹",
    nameFr: "Spritz Signature Maison",
    nameEn: "House Signature Spritz",
    price: "10 €",
    descriptionFr: "Aperol, Prosecco DOC, trait d'eau pétillante et tranche d'orange.",
    descriptionEn: "Aperol, Prosecco DOC, splash of soda, fresh orange slice.",
    tagsFr: ["Apéritif", "Cocktail"],
    tagsEn: ["Aperitif", "Cocktail"],
  },
];

export function VitrineBookingShowcase() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [selectedCategory, setSelectedCategory] = useState<"plats" | "desserts" | "boissons">("plats");
  const [selectedDishId, setSelectedDishId] = useState<string>("entrecote");
  const [selectedDate, setSelectedDate] = useState<string>("Ce soir");
  const [selectedTime, setSelectedTime] = useState<string>("20h00");
  const [partySize, setPartySize] = useState<number>(2);
  const [reserved, setReserved] = useState<boolean>(false);
  const [burst, setBurst] = useState<number>(0);

  const filteredDishes = DISH_PRESETS.filter((d) => d.category === selectedCategory);
  const currentDish = DISH_PRESETS.find((d) => d.id === selectedDishId) ?? filteredDishes[0] ?? DISH_PRESETS[0];

  const handleBooking = () => {
    setReserved(true);
    setBurst((b) => b + 1);
  };

  const handleCategorySelect = (cat: "plats" | "desserts" | "boissons") => {
    setSelectedCategory(cat);
    const firstInCat = DISH_PRESETS.find((d) => d.category === cat);
    if (firstInCat) {
      setSelectedDishId(firstInCat.id);
    }
  };

  const savedCommission = (partySize * 2.5).toFixed(2).replace(".", ",");

  return (
    <div className="relative flex h-full flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-4 sm:p-5 md:p-6 shadow-[0_4px_0_#181512]">
      <ConfettiBurst count={burst} />

      <div>
        {/* En-tête de la Vitrine avec statut et switch de langue FR / EN */}
        <div className="flex items-center justify-between border-b border-[#181512]/15 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍽️</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-[#181512]" style={DISPLAY}>
                  Le Bistrot Gourmand
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#10B981]/15 px-2 py-0.5 text-[9px] font-black text-[#059669]">
                  ● Ouvert ce soir
                </span>
              </div>
              <div className="text-[11px] font-bold text-[#181512]/60">
                {lang === "fr" ? "Carte interactive & Réservation en direct" : "Interactive Menu & Direct Booking"}
              </div>
            </div>
          </div>

          {/* Toggle FR / EN */}
          <div className="flex items-center rounded-lg border-2 border-[#181512] bg-[#FFFDF8] p-0.5 shadow-[0_1.5px_0_#181512]">
            <button
              type="button"
              onClick={() => setLang("fr")}
              className={`rounded-md px-2 py-0.5 text-xs font-black transition-all cursor-pointer ${
                lang === "fr" ? "bg-[#FFE600] text-[#181512] shadow-[0_1px_0_#181512]" : "text-[#181512]/60 hover:text-[#181512]"
              }`}
            >
              🇫🇷 FR
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-md px-2 py-0.5 text-xs font-black transition-all cursor-pointer ${
                lang === "en" ? "bg-[#FFE600] text-[#181512] shadow-[0_1px_0_#181512]" : "text-[#181512]/60 hover:text-[#181512]"
              }`}
            >
              🇬🇧 EN
            </button>
          </div>
        </div>

        {/* 1. Sélecteur de Catégories de la carte */}
        <div className="mt-3.5 flex items-center gap-1.5 border-b border-[#181512]/10 pb-2.5">
          <button
            type="button"
            onClick={() => handleCategorySelect("plats")}
            className={`rounded-full border-2 px-3 py-1 text-xs font-black transition-all cursor-pointer ${
              selectedCategory === "plats"
                ? "border-[#181512] bg-[#FFE600] text-[#181512] shadow-[0_2px_0_#181512]"
                : "border-transparent bg-[#FFFDF8] text-[#181512]/70 hover:bg-[#181512]/5"
            }`}
          >
            🥩 {lang === "fr" ? "Plats Signature" : "Main Dishes"}
          </button>
          <button
            type="button"
            onClick={() => handleCategorySelect("desserts")}
            className={`rounded-full border-2 px-3 py-1 text-xs font-black transition-all cursor-pointer ${
              selectedCategory === "desserts"
                ? "border-[#181512] bg-[#FFE600] text-[#181512] shadow-[0_2px_0_#181512]"
                : "border-transparent bg-[#FFFDF8] text-[#181512]/70 hover:bg-[#181512]/5"
            }`}
          >
            🍰 {lang === "fr" ? "Desserts" : "Desserts"}
          </button>
          <button
            type="button"
            onClick={() => handleCategorySelect("boissons")}
            className={`rounded-full border-2 px-3 py-1 text-xs font-black transition-all cursor-pointer ${
              selectedCategory === "boissons"
                ? "border-[#181512] bg-[#FFE600] text-[#181512] shadow-[0_2px_0_#181512]"
                : "border-transparent bg-[#FFFDF8] text-[#181512]/70 hover:bg-[#181512]/5"
            }`}
          >
            🍹 {lang === "fr" ? "Boissons" : "Drinks"}
          </button>
        </div>

        {/* Grille des plats de la catégorie active */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {filteredDishes.map((dish) => {
            const isSelected = dish.id === currentDish.id;
            return (
              <button
                key={dish.id}
                type="button"
                onClick={() => setSelectedDishId(dish.id)}
                className={`flex flex-col items-center rounded-xl border-2 p-2 text-center transition-all cursor-pointer ${
                  isSelected
                    ? "border-[#181512] bg-[#FFFBEB] shadow-[0_2px_0_#181512] scale-[1.02]"
                    : "border-[#181512]/15 bg-[#FFFDF8] hover:border-[#181512] hover:bg-white"
                }`}
              >
                <span className="text-2xl">{dish.emoji}</span>
                <span className="mt-1 text-[11px] font-black text-[#181512] leading-tight line-clamp-1">
                  {lang === "fr" ? dish.nameFr : dish.nameEn}
                </span>
                <span className="text-[10px] font-bold text-[#FF6B35]">
                  {dish.price}
                </span>
              </button>
            );
          })}
        </div>

        {/* Détail du plat sélectionné */}
        <div className="mt-2.5 rounded-xl border-2 border-[#181512]/15 bg-[#FFFDF8] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#181512]">
              {currentDish.emoji} {lang === "fr" ? currentDish.nameFr : currentDish.nameEn}
            </span>
            <span className="text-xs font-black text-[#FF6B35]">
              {currentDish.price}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#181512]/75 font-medium leading-snug">
            {lang === "fr" ? currentDish.descriptionFr : currentDish.descriptionEn}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(lang === "fr" ? currentDish.tagsFr : currentDish.tagsEn).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-white border border-[#181512]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#181512]/75 shadow-[0_1px_0_#181512]/10"
              >
                ✓ {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 2. Module de réservation directe 0% commission */}
        <div className="mt-3.5 rounded-xl border-2 border-[#181512] bg-[#FFFBEB] p-3 shadow-[0_3px_0_#181512]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">📅</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#181512]">
                {lang === "fr" ? "Réservation de table en direct" : "Direct Table Booking"}
              </span>
            </div>
            <span className="rounded-full border border-[#181512] bg-[#10B981] px-2 py-0.5 text-[9px] font-black text-white shadow-[0_1px_0_#181512]">
              0€ DE COMMISSION
            </span>
          </div>

          {/* Sélecteur de date & heure */}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-[#181512]/60">Jour :</label>
              <div className="mt-1 flex gap-1">
                {["Ce soir", "Demain", "Ce samedi"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-black transition-all cursor-pointer ${
                      selectedDate === d
                        ? "border-[#181512] bg-[#FFE600] text-[#181512] shadow-[0_1px_0_#181512]"
                        : "border-[#181512]/20 bg-white text-[#181512]/70"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#181512]/60">Service &amp; Heure :</label>
              <div className="mt-1 flex gap-1">
                {["19h30", "20h00", "20h30", "21h00"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTime(t)}
                    className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-black transition-all cursor-pointer ${
                      selectedTime === t
                        ? "border-[#181512] bg-[#FFE600] text-[#181512] shadow-[0_1px_0_#181512]"
                        : "border-[#181512]/20 bg-white text-[#181512]/70"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Nombre de couverts & Bouton Réserver */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#181512]/15 pt-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#181512]/75">Couverts :</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPartySize((p) => Math.max(1, p - 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512] cursor-pointer active:translate-y-0.5"
                >
                  -
                </button>
                <span className="w-5 text-center text-xs font-black text-[#181512]">
                  {partySize}
                </span>
                <button
                  type="button"
                  onClick={() => setPartySize((p) => p + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512] cursor-pointer active:translate-y-0.5"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBooking}
              className={`flex-1 rounded-full border-2 border-[#181512] py-2 text-xs font-black transition-all cursor-pointer ${
                reserved
                  ? "bg-[#D1FAE5] text-[#065F46] shadow-[0_2px_0_#181512]"
                  : "bg-[#10B981] text-white shadow-[0_2px_0_#181512] hover:bg-emerald-600 hover:-translate-y-0.5"
              }`}
            >
              {reserved
                ? `✓ Réservé (${partySize} pers. · ${selectedDate} ${selectedTime})`
                : `Réserver (${partySize} pers. · 0€ frais)`}
            </button>
          </div>

          {/* Feedback interactif après réservation */}
          {reserved && (
            <div className="mt-2.5 rounded-lg border border-[#10B981] bg-[#ECFDF5] p-2 text-center text-[11px] font-bold text-[#065F46] animate-fade-in">
              <span className="font-black">🎉 Réservation confirmée sans commission !</span>
              <span className="block text-[10px] text-[#047857] mt-0.5">
                Vous venez d&apos;économiser <span className="font-black underline">{savedCommission} €</span> de frais TheFork sur cette seule table.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Note d'économie mensuelle & Lien page complète */}
      <div className="mt-3.5 pt-3 border-t border-[#181512]/15">
        <div className="rounded-xl border border-[#181512]/15 bg-[#FFFBEB] p-2.5 text-xs font-bold text-[#181512]/85">
          <span className="font-black text-[#FF6B35]">💡 0 intermédiaire : </span>
          Un restaurant de 60 couverts/jour économise entre <span className="font-black text-[#10B981]">350 € et 900 € chaque mois</span> de commissions !
        </div>

        <div className="mt-2.5">
          <Link
            href="/vitrine-reservation"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FFFDF8] py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:bg-[#FFE600] hover:-translate-y-0.5"
          >
            <span>En savoir + sur la Vitrine &amp; Réservation 0%</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
