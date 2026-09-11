"use client";

import Link from "next/link";
import { useState } from "react";
import { PRIX_ENTREE_EUROS } from "@/components/marketing/prix";
import { Tilt3D } from "@/components/ui/tilt-3d";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export type ObjectiveKey = "attirer" | "faire-venir" | "fideliser" | "animer";

interface DetailedModule {
  name: string;
  badge?: string;
  contains: string;
  situation: string;
  benefit: string;
}

interface ObjectiveData {
  id: ObjectiveKey;
  label: string;
  tagline: string;
  dotColor: string;
  activeColor: string;
  href: string;
  ctaText: string;
  modules: DetailedModule[];
  highlight: string;
}

const OBJECTIVES: readonly ObjectiveData[] = [
  {
    id: "attirer",
    label: "Acquérir",
    tagline: "Captez l'attention des passants et convertissez chaque visiteur en contact qualifié.",
    dotColor: "bg-k-orange",
    activeColor: "border-k-orange bg-k-orange/15 text-k-ink",
    href: "/attirer",
    ctaText: "Découvrir les 3 modules d'acquisition →",
    modules: [
      {
        name: "Jeux instantanés (15 mécaniques)",
        badge: `Inclus dès ${PRIX_ENTREE_EUROS}`,
        contains: "9 jeux de hasard (Roue, Grattage, Machine à sous, Bonneteau, Memory, Coffre, Dé, Pioche, Carte retournée) et 6 jeux d'adresse (Réflexe, Jauge, Pierre-feuille-ciseaux, Puzzle, Mot mystère, Estimation).",
        situation: "Sur le comptoir d'accueil, le menu ou l'affiche vitrine pour inciter à entrer et commander.",
        benefit: "Collecte l'email conforme RGPD et fait revenir le client pour retirer son lot.",
      },
      {
        name: "Parrainage & Ambassadeurs",
        badge: "Bouche-à-oreille",
        contains: "Lien de recommandation personnel par SMS/WhatsApp, suivi des filleuls et déblocage de récompenses par paliers.",
        situation: "Pour récompenser vos clients réguliers qui font découvrir votre lieu à leurs collègues ou amis.",
        benefit: "Acquisition de nouveaux clients locaux sans dépenser un centime en publicité en ligne.",
      },
      {
        name: "Vitrine bilingue au QR",
        badge: "Carte & Menu",
        contains: "Carte numérique mobile en français et anglais automatique, suggestions du chef, horaires et réseaux.",
        situation: "Sur chaque table ou en terrasse pour remplacer les cartes papier abîmées et les PDF illisibles.",
        benefit: "Mise à jour depuis votre espace et zéro friction pour les touristes et clients de passage.",
      },
    ],
    highlight: "15 mécaniques de jeu personnalisables à vos couleurs, prêtes sans rien installer.",
  },
  {
    id: "faire-venir",
    label: "Créer du trafic",
    tagline: "Faites circuler les clients entre vos espaces et remplissez vos créneaux creux.",
    dotColor: "bg-k-yellow",
    activeColor: "border-k-yellow bg-k-yellow/20 text-k-ink",
    href: "/faire-venir",
    ctaText: "Découvrir les 3 parcours de trafic →",
    modules: [
      {
        name: "Chasse au QR multi-points",
        badge: "Parcours physique",
        contains: "Parcours de 2 à 10 QR codes à tamponner physiquement dans différents rayons, étages ou points de vente.",
        situation: "Pour faire visiter les recoins calmes d'une boutique ou relier deux commerces partenaires.",
        benefit: "Augmente le panier moyen en forçant la découverte physique de vos produits en rayon.",
      },
      {
        name: "Moments & Ateliers",
        badge: "Anti-gaspillage & Événements",
        contains: "Gestion de créneaux et jauges pour ateliers, dégustations, soirées thématiques ou ventes flash d'invendus.",
        situation: "Un mardi après-midi calme ou en fin de journée pour proposer des paniers ou cours exclusifs.",
        benefit: "Génère du chiffre d'affaires sur vos heures creuses et élimine le gaspillage.",
      },
      {
        name: "Réservation d'agenda",
        badge: "Zéro commission",
        contains: "Synchronisation de vos horaires d'ouverture, créneaux configurables et confirmation directe au client.",
        situation: "Depuis votre Vitrine au QR pour réserver une table ou un soin 24h/24 sans vous téléphoner.",
        benefit: "Économise les commissions des plateformes tierces et supprime les rendez-vous manqués.",
      },
    ],
    highlight: "Reliez vos espaces et transformez les heures calmes en créneaux rentables.",
  },
  {
    id: "fideliser",
    label: "Fidéliser",
    tagline: "Créez une habitude durable et faites revenir vos clients semaine après semaine.",
    dotColor: "bg-k-pink",
    activeColor: "border-k-pink bg-k-pink/20 text-k-ink",
    href: "/fideliser",
    ctaText: "Découvrir les 3 modules de fidélisation →",
    modules: [
      {
        name: "Passeport Apple & Google Wallet",
        badge: "Zéro carte plastique",
        contains: "Carte de fidélité dématérialisée dans le wallet du smartphone, solde de visites et notifications.",
        situation: "À chaque passage en caisse : le client présente son smartphone, validé en 1 bip.",
        benefit: "Toujours dans la poche du client, jamais perdu, et modernité perçue maximale.",
      },
      {
        name: "Calendrier à surprises",
        badge: "Rituel quotidien",
        contains: "Calendrier interactif de 7 à 31 cases à ouvrir chaque jour avec lots et récompenses d'assiduité.",
        situation: "Pendant le mois de Noël, l'anniversaire du commerce ou tout le mois de juin.",
        benefit: "Crée un rendez-vous quotidien addictif et fait exploser la fréquence de visite.",
      },
      {
        name: "Salons Duo Miroir & Bande",
        badge: "Inclus au socle",
        contains: "Duo Miroir (questions complices à 2) et Portrait de la Bande (vote secret de 2 à 12 convives).",
        situation: "À table pendant l'attente des plats ou à l'apéritif entre amis.",
        benefit: "Allonge le temps passé sur place, déclenche de nouvelles commandes et amuse les tables.",
      },
    ],
    highlight: "Des clients reconnus qui reviennent naturellement consommer chez vous.",
  },
  {
    id: "animer",
    label: "Animer en direct",
    tagline: "Mettez le feu à votre salle avec des animations sur grand écran et smartphones.",
    dotColor: "bg-k-blue",
    activeColor: "border-k-blue bg-k-blue/25 text-k-ink",
    href: "/animer",
    ctaText: "Découvrir les 4 modules live →",
    modules: [
      {
        name: "Événements Live sur grand écran",
        badge: "Événements en direct",
        contains: "Quiz et blind tests projetés sur TV/vidéoprojecteur, télécommande animateur et vote smartphone des clients.",
        situation: "Les jeudis soirs de bar, soirées étudiantes ou événements d'entreprise.",
        benefit: "L'ambiance d'un plateau télé qui remplit la salle et prolonge les consommations.",
      },
      {
        name: "Championnat de Pronostics (11 thèmes)",
        badge: "Sport & Culture",
        contains: "Calendriers et classements automatiques sur 11 univers : Foot, Rugby, Tennis, Eurovision, Cérémonies...",
        situation: "Pendant les grandes compétitions (Ligue 1, Euro, Roland-Garros) pour fidéliser le comptoir.",
        benefit: "Donne aux habitués une raison hebdomadaire de venir chez vous suivre les résultats.",
      },
      {
        name: "Jackpot collectif",
        badge: "Jauge partagée",
        contains: "Jauge commune animée sur écran qui monte à chaque consommation jusqu'au tirage du gros lot.",
        situation: "Pendant les grosses soirées du week-end pour encourager les tournées.",
        benefit: "Crée une émulation collective où toute la salle pousse ensemble pour faire tomber le lot.",
      },
      {
        name: "Quiz autonome ou thématique",
        badge: "Culture & Blind tests",
        contains: "Parcours de questions chronométrées avec correction instantanée et scores.",
        situation: "En libre-service au comptoir ou en terrasse pour les clients qui patientent seuls ou à deux.",
        benefit: "Valorise l'expertise de votre lieu (ex: quiz œnologie pour un bar à vins).",
      },
    ],
    highlight: "L'énergie d'un stade ou d'un jeu télévisé directement dans votre commerce.",
  },
];

/* Démo interactive pour l'onglet Acquérir (les 15 mécaniques) */
function MiniMechanicDemo() {
  const [selectedMechanic, setSelectedMechanic] = useState<string>("slot");
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [slotResult, setSlotResult] = useState<[string, string, string]>(["🍒", "🍒", "🍒"]);
  const [scratchRevealed, setScratchRevealed] = useState(false);
  const [diceVal, setDiceVal] = useState(6);

  const mechanicsList = [
    { id: "slot", name: "Machine à sous", emoji: "🎰", type: "hasard" },
    { id: "scratch", name: "Carte à gratter", emoji: "🎟️", type: "hasard" },
    { id: "wheel", name: "Roue de la chance", emoji: "🎡", type: "hasard" },
    { id: "dice", name: "Lancer de dé", emoji: "🎲", type: "hasard" },
    { id: "chest", name: "Coffre mystère", emoji: "🎁", type: "hasard" },
    { id: "cups", name: "Bonneteau 3 verres", emoji: "🥤", type: "hasard" },
    { id: "reflex", name: "Jeu de réflexe", emoji: "⚡", type: "défi" },
    { id: "gauge", name: "Jauge à stopper", emoji: "🎯", type: "défi" },
  ];

  const spinSlot = () => {
    if (slotSpinning) return;
    setSlotSpinning(true);
    const symbols = ["🍒", "🍋", "💎", "⭐", "🔔", "🍇"];
    let ticks = 0;
    const interval = setInterval(() => {
      setSlotResult([
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ]);
      ticks++;
      if (ticks > 7) {
        clearInterval(interval);
        setSlotResult(["💎", "💎", "💎"]);
        setSlotSpinning(false);
      }
    }, 100);
  };

  const rollDice = () => {
    setDiceVal(Math.floor(Math.random() * 6) + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-black uppercase tracking-wider text-k-body">Tester un jeu :</span>
        {mechanicsList.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedMechanic(m.id)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black transition-all ${
              selectedMechanic === m.id
                ? "k-border-thin bg-k-orange text-k-ink shadow-sm"
                : "border border-k-ink/15 bg-white/70 text-k-ink hover:bg-k-yellow/30"
            }`}
          >
            <span>{m.emoji}</span>
            <span>{m.name}</span>
          </button>
        ))}
      </div>

      <div className="k-border-thin flex min-h-[170px] flex-col items-center justify-center rounded-2xl bg-white/90 p-5 text-center shadow-inner">
        {selectedMechanic === "slot" && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border-2 border-k-ink bg-k-ink/90 px-6 py-3 text-3xl shadow-md sm:text-4xl">
              <span className={`inline-block transition-transform duration-100 ${slotSpinning ? "scale-110 blur-[1px]" : ""}`}>
                {slotResult[0]}
              </span>
              <span className="text-k-yellow">|</span>
              <span className={`inline-block transition-transform duration-100 ${slotSpinning ? "scale-110 blur-[1px]" : ""}`}>
                {slotResult[1]}
              </span>
              <span className="text-k-yellow">|</span>
              <span className={`inline-block transition-transform duration-100 ${slotSpinning ? "scale-110 blur-[1px]" : ""}`}>
                {slotResult[2]}
              </span>
            </div>
            <button
              type="button"
              onClick={spinSlot}
              disabled={slotSpinning}
              className="k-border-thin k-btn rounded-full bg-k-yellow px-5 py-2 text-xs font-black text-k-ink"
            >
              {slotSpinning ? "Tirage en cours…" : "Actionner les rouleaux"}
            </button>
            <p className="text-xs font-bold text-k-muted">
              {slotResult[0] === slotResult[1] && slotResult[1] === slotResult[2]
                ? "🎉 Jackpot ! 1 dessert offert pour votre table"
                : "Tentez votre chance !"}
            </p>
          </div>
        )}

        {selectedMechanic === "scratch" && (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              aria-label="Gratter la carte de démonstration"
              onClick={() => setScratchRevealed(true)}
              className="k-border-thin relative flex h-24 w-52 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-dashed bg-gradient-to-br from-amber-100 to-amber-200 p-2 font-black shadow-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              {scratchRevealed ? (
                <div className="animate-in fade-in zoom-in-95 flex flex-col items-center">
                  <span className="text-2xl">☕</span>
                  <span className="text-sm font-black text-k-ink">1 Café offert</span>
                  <span className="text-[10px] text-k-green">Code: DEMO-CAFE</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-k-ink">
                  <span className="text-xl">✨ 🎟️ ✨</span>
                  <span className="text-xs font-black uppercase tracking-wider">Cliquez pour gratter</span>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => setScratchRevealed((v) => !v)}
              className="text-xs font-black text-k-muted underline hover:text-k-ink"
            >
              {scratchRevealed ? "Réinitialiser la carte" : "Révéler immédiatement"}
            </button>
          </div>
        )}

        {selectedMechanic === "dice" && (
          <div className="flex flex-col items-center gap-3">
            <div className="k-border flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-4xl shadow-md">
              {["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][diceVal - 1]}
            </div>
            <button
              type="button"
              onClick={rollDice}
              className="k-border-thin k-btn rounded-full bg-k-orange px-5 py-2 text-xs font-black text-k-ink"
            >
              Lancer le dé 🎲
            </button>
            <p className="text-xs font-bold text-k-muted">Score : {diceVal} / 6</p>
          </div>
        )}

        {selectedMechanic !== "slot" && selectedMechanic !== "scratch" && selectedMechanic !== "dice" && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-3xl">
              {mechanicsList.find((m) => m.id === selectedMechanic)?.emoji}
            </div>
            <p className="text-sm font-black text-k-ink">
              {mechanicsList.find((m) => m.id === selectedMechanic)?.name}
            </p>
            <p className="max-w-xs text-xs font-bold text-k-muted">
              {mechanicsList.find((m) => m.id === selectedMechanic)?.type === "défi"
                ? "Jeu d'adresse : le client doit réussir l'épreuve pour débloquer le tirage."
                : "Jeu instantané : participation en un clic depuis le navigateur."}
            </p>
            <span className="k-border-thin rounded-full bg-k-yellow/60 px-3 py-1 text-[11px] font-black text-k-ink">
              Prêt à jouer au scan du QR code
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* Démo visuelle pour Trafic */
function TrafficDemo() {
  const steps = [
    { title: "QR 1 · Entrée", status: "Tamponné ✓", icon: "🚪" },
    { title: "QR 2 · Rayon phare", status: "Tamponné ✓", icon: "✨" },
    { title: "QR 3 · Caisse", status: "À scanner !", icon: "🎁" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((s, idx) => (
          <div
            key={s.title}
            className={`k-border-thin flex flex-col items-center rounded-xl p-3 text-center transition-all ${
              idx === 2 ? "border-k-yellow bg-k-yellow/20" : "bg-white/90"
            }`}
          >
            <span className="text-2xl">{s.icon}</span>
            <span className="mt-1 text-xs font-black text-k-ink">{s.title}</span>
            <span
              className={`mt-0.5 text-[11px] font-bold ${
                idx === 2 ? "text-k-orange-text font-black" : "text-k-green"
              }`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>

      <div className="k-border-thin flex items-center justify-between rounded-xl bg-white/90 p-3.5">
        <div className="flex items-center gap-3">
          <span className="k-border-thin flex h-10 w-10 items-center justify-center rounded-xl bg-k-yellow text-xl">
            📅
          </span>
          <div className="text-left">
            <p className="text-xs font-black text-k-ink">Atelier dégustation du jeudi</p>
            <p className="text-[11px] font-bold text-k-muted">18h30 · 8 places disponibles</p>
          </div>
        </div>
        <span className="k-border-thin rounded-full bg-k-ink px-3 py-1 text-xs font-black text-k-bg">
          Réservable en 1 clic
        </span>
      </div>
    </div>
  );
}

/* Démo visuelle pour Fidélité */
function LoyaltyDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="k-border-thin rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="k-border-thin flex h-8 w-8 items-center justify-center rounded-full bg-k-pink text-sm font-black">
              🎖️
            </span>
            <div>
              <p className="text-xs font-black text-k-ink">Passeport Gourmand</p>
              <p className="text-[10px] font-bold text-k-muted">Ajouté dans Apple & Google Wallet</p>
            </div>
          </div>
          <span className="rounded-full bg-k-green/20 px-2.5 py-0.5 text-[11px] font-black text-k-ink">
            Niveau Or
          </span>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((st) => (
            <div
              key={st}
              className={`k-border-thin flex h-11 items-center justify-center rounded-lg text-sm font-black ${
                st <= 4 ? "bg-k-yellow text-k-ink" : "border-dashed bg-white/60 text-k-muted"
              }`}
            >
              {st <= 4 ? "⭐" : "5e"}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] font-black text-k-body">
          Plus qu&apos;une visite pour débloquer votre cadeau fidélité !
        </p>
      </div>

      <div className="k-border-thin flex items-center justify-between rounded-xl bg-white/90 p-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">👥</span>
          <div>
            <p className="text-xs font-black text-k-ink">Duo Miroir & Portrait de la Bande</p>
            <p className="text-[11px] font-bold text-k-muted">Jeux collectifs à table · 2 à 12 joueurs</p>
          </div>
        </div>
        <span className="k-border-thin rounded-md bg-k-pink/30 px-2 py-0.5 text-[11px] font-black text-k-ink">
          Inclus au socle
        </span>
      </div>
    </div>
  );
}

/* Démo visuelle pour Live */
function LiveDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="k-border-thin overflow-hidden rounded-2xl bg-k-ink p-4 text-k-bg shadow-md">
        <div className="flex items-center justify-between border-b border-k-bg/20 pb-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-black tracking-wider uppercase text-k-yellow">
              Soirée Live en cours
            </span>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-k-bg/90">
            68 téléphones connectés
          </span>
        </div>

        <div className="mt-3 flex items-center justify-around gap-2 text-center">
          <div>
            <p className="text-2xl font-black text-k-orange">84%</p>
            <p className="text-[10px] font-bold text-k-bg/70">Participation salle</p>
          </div>
          <div className="h-8 w-px bg-k-bg/20" />
          <div>
            <p className="text-2xl font-black text-k-yellow">12 / 15</p>
            <p className="text-[10px] font-bold text-k-bg/70">Question active</p>
          </div>
          <div className="h-8 w-px bg-k-bg/20" />
          <div>
            <p className="text-2xl font-black text-k-green">🥇 Julien M.</p>
            <p className="text-[10px] font-bold text-k-bg/70">Tête du classement</p>
          </div>
        </div>
      </div>

      <div className="k-border-thin flex items-center justify-between rounded-xl bg-white/90 p-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏆</span>
          <div>
            <p className="text-xs font-black text-k-ink">Pronostics sportifs & culture</p>
            <p className="text-[11px] font-bold text-k-muted">11 thèmes : Ligue 1, Coupe du monde, Eurovision…</p>
          </div>
        </div>
        <span className="k-border-thin rounded-md bg-k-blue/40 px-2 py-0.5 text-[11px] font-black text-k-ink">
          Événements en direct
        </span>
      </div>
    </div>
  );
}

export function ExperienceSelector() {
  const [activeTab, setActiveTab] = useState<ObjectiveKey>("attirer");
  const currentObjective = OBJECTIVES.find((o) => o.id === activeTab) ?? OBJECTIVES[0];

  return (
    <div className="k-card relative rounded-[28px] p-6 sm:p-10 shadow-lg">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
          <span className={`h-2 w-2 rounded-full ${currentObjective.dotColor}`} />
          Catalogue complet des 14 modules
        </span>
        <h3 className="mt-2 text-[clamp(1.8rem,3.5vw,2.6rem)] leading-tight text-k-ink" style={DISPLAY}>
          Ce que contient chaque module & pourquoi le choisir
        </h3>
        <p className="mx-auto mt-2 max-w-2xl text-[14px] font-bold text-k-body">
          Chaque module répond à une situation concrète dans votre établissement. Sélectionnez un objectif pour découvrir son contenu exact et son bénéfice commercial.
        </p>
      </div>

      {/* Barre d'onglets */}
      <div
        role="tablist"
        aria-label="Objectifs commerciaux"
        className="mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3"
      >
        {OBJECTIVES.map((obj) => {
          const isActive = obj.id === activeTab;
          return (
            <button
              key={obj.id}
              role="tab"
              id={`tab-${obj.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${obj.id}`}
              type="button"
              onClick={() => setActiveTab(obj.id)}
              className={`group flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-black transition-all duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                isActive
                  ? `k-border k-hard-sm ${obj.activeColor} scale-105`
                  : "border-2 border-k-ink/15 bg-white/70 text-k-body hover:border-k-ink/30 hover:bg-white"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${obj.dotColor}`} />
              <span>{obj.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panneau de contenu détaillé */}
      <div
        role="tabpanel"
        id={`panel-${currentObjective.id}`}
        aria-labelledby={`tab-${currentObjective.id}`}
        className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start"
      >
        {/* Colonne gauche : liste des modules détaillés avec contenu, situation, avantage */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/80 border-2 border-k-ink/15 p-4">
            <h4 className="text-xl font-black text-k-ink" style={DISPLAY}>
              {currentObjective.tagline}
            </h4>
            <p className="mt-1 text-xs font-black text-k-orange-text">
              {currentObjective.highlight}
            </p>
          </div>

          <div className="space-y-3.5">
            {currentObjective.modules.map((m) => (
              <div
                key={m.name}
                className="k-card k-card-hover rounded-2xl p-5 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-base font-black text-k-ink">{m.name}</h5>
                  {m.badge && (
                    <span className="k-border-thin rounded-full bg-k-yellow px-2.5 py-0.5 text-[10px] font-black text-k-ink">
                      {m.badge}
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <p className="font-bold text-k-body">
                    📦 <strong>Ce qu&apos;il contient :</strong> {m.contains}
                  </p>
                  <p className="font-bold text-k-body">
                    📍 <strong>Situation d&apos;usage :</strong> {m.situation}
                  </p>
                  <p className="rounded-xl bg-k-green/10 border border-k-green/20 p-2 font-black text-k-ink">
                    🚀 <strong>Bénéfice direct :</strong> {m.benefit}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Link
              href={currentObjective.href}
              className="k-border k-btn inline-flex items-center gap-2 rounded-full bg-k-yellow px-6 py-3 text-xs sm:text-sm font-black text-k-ink"
            >
              {currentObjective.ctaText}
            </Link>
          </div>
        </div>

        {/* Colonne droite : démo interactive du jeu ou module */}
        <div className="lg:sticky lg:top-24">
          <Tilt3D intensity={6}>
            <div className="k-card-deep rounded-3xl p-5 sm:p-7 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-k-bg/15 pb-3">
                <span className="text-xs font-black uppercase tracking-wider text-k-yellow">
                  Aperçu interactif
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-k-bg">
                  Côté joueur smartphone
                </span>
              </div>

              {activeTab === "attirer" && <MiniMechanicDemo />}
              {activeTab === "faire-venir" && <TrafficDemo />}
              {activeTab === "fideliser" && <LoyaltyDemo />}
              {activeTab === "animer" && <LiveDemo />}
            </div>
          </Tilt3D>
        </div>
      </div>
    </div>
  );
}
