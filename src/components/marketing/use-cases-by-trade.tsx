"use client";

import { useState } from "react";
import Link from "next/link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { prixOffre } from "@/components/marketing/prix";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface TradeJourneyStep {
  num: string;
  badge: string;
  title: string;
  desc: string;
  emoji: string;
}

interface TradeModule {
  name: string;
  tag: string;
  desc: string;
  href: string;
}

interface TradeData {
  id: string;
  trade: string;
  emoji: string;
  catchphrase: string;
  benefitStat: string;
  offerName: string;
  offerPrice: string;
  steps: [TradeJourneyStep, TradeJourneyStep, TradeJourneyStep];
  modules: TradeModule[];
}

const TRADES: readonly TradeData[] = [
  {
    id: "restaurant",
    trade: "Restaurant & Brasserie",
    emoji: "🍽️",
    catchphrase: "Remplir les tables du midi, animer le soir et faire revenir sans brader vos prix.",
    benefitStat: "0 € de commission sur vos réservations & +25% de revisite",
    offerName: "Sur Place",
    offerPrice: `${prixOffre("place")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "À table ou au comptoir",
        title: "Le client scanne le QR code",
        desc: "Posé sur la table ou le porte-addition. La carte s'affiche en français ou en anglais instantanément sans télécharger d'application.",
        emoji: "📱",
      },
      {
        num: "02",
        badge: "Pendant le repas",
        title: "Il joue et gagne un avantage",
        desc: "Roue de la fortune ou ticket à gratter : il remporte un café ou un dessert valable pour sa prochaine visite en semaine.",
        emoji: "🎁",
      },
      {
        num: "03",
        badge: "En caisse & après",
        title: "Vous encaissez et il revient",
        desc: "Votre équipe valide le gain au scanner en 1 seconde. Le client reçoit son rappel et réserve sa table en direct sans commission.",
        emoji: "💳",
      },
    ],
    modules: [
      {
        name: "Vitrine & Réservation sans frais",
        tag: "0% commission",
        desc: "Carte bilingue toujours à jour et réservations directes dans votre agenda.",
        href: "/vitrine-reservation",
      },
      {
        name: "Jeux instantanés sur addition",
        tag: "Collecte RGPD",
        desc: "Faites gagner un lot différé pour inciter à revenir dans les 15 jours.",
        href: "/jeux-instantanes",
      },
      {
        name: "Passeport fidélité Wallet",
        tag: "Google Wallet",
        desc: "Fidélisez les habitués du quartier sans cartes en carton froissées.",
        href: "/passeport-fidelite",
      },
    ],
  },
  {
    id: "bar",
    trade: "Bar, Pub & Café",
    emoji: "🍻",
    catchphrase: "Créer une ambiance festive, prolonger les tournées et enflammer les soirs de match.",
    benefitStat: "+1h passée à table en moyenne & ambiance garantie",
    offerName: "Le Grand Jeu",
    offerPrice: `${prixOffre("live")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "En arrivant",
        title: "Vos clients rejoignent le jeu",
        desc: "Un QR code sur les sous-bocks ou les tables : les groupes se connectent sur leur téléphone en 5 secondes.",
        emoji: "📲",
      },
      {
        num: "02",
        badge: "Pendant la soirée",
        title: "Pronostics & Quiz en direct",
        desc: "Les scores du match et les classements s'affichent en temps réel sur la télé du bar. L'ambiance monte d'un cran.",
        emoji: "🏆",
      },
      {
        num: "03",
        badge: "À chaque tournée",
        title: "Jackpot collectif & Lots",
        desc: "Chaque commande alimente la jauge du bar. Au coup de sifflet final, la tournée ou le lot gagnant est tiré au sort.",
        emoji: "🍻",
      },
    ],
    modules: [
      {
        name: "Championnat de Pronostics",
        tag: "Sport & TV",
        desc: "Faites de votre bar le QG des passionnés avec classement des habitués.",
        href: "/jeux-instantanes",
      },
      {
        name: "Quiz & Blind Tests sur écran",
        tag: "Animation live",
        desc: "Buzzer sur smartphone et projection des questions sur grand écran.",
        href: "/jeux-instantanes",
      },
      {
        name: "Jackpot collectif au comptoir",
        tag: "Effet de salle",
        desc: "Fédérez toute la salle autour d'une jauge commune qui monte à chaque verre.",
        href: "/passeport-fidelite",
      },
    ],
  },
  {
    id: "boutique",
    trade: "Boutique, Mode & Retail",
    emoji: "🛍️",
    catchphrase: "Attirer les passants en rayon, animer l'encaissement et générer des achats répétés.",
    benefitStat: "+35% de circulation en boutique & emails qualifiés",
    offerName: "Le Club",
    offerPrice: `${prixOffre("engagement")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "En vitrine",
        title: "L'affiche qui fait entrer",
        desc: "Une affiche stylée avec QR code à l'entrée : le passant joue pour tenter de débloquer une remise immédiate.",
        emoji: "🚪",
      },
      {
        num: "02",
        badge: "Dans les rayons",
        title: "Chasse au QR dans le magasin",
        desc: "3 QR codes dissimulés font visiter l'ensemble des collections pour valider l'avantage avant le passage en caisse.",
        emoji: "🗺️",
      },
      {
        num: "03",
        badge: "Au comptoir",
        title: "Passeport & Bons d'achat",
        desc: "Validation en 1 seconde en caisse. Le client repart avec son achat et son passeport enregistré dans son Google Wallet.",
        emoji: "✨",
      },
    ],
    modules: [
      {
        name: "Jeux instantanés vitrine",
        tag: "Trafic entrant",
        desc: "Roue ou machine à sous pour transformer les passants en acheteurs.",
        href: "/jeux-instantanes",
      },
      {
        name: "Chasse aux QR codes",
        tag: "Découverte rayons",
        desc: "Faites circuler les visiteurs dans les rayons du fond sans effort.",
        href: "/vitrine-reservation",
      },
      {
        name: "Passeport fidélité & Relances",
        tag: "Fidélisation VIP",
        desc: "Rappelez automatiquement vos clientes quand une nouvelle collection arrive.",
        href: "/passeport-fidelite",
      },
    ],
  },
  {
    id: "salon",
    trade: "Salon, Beauté & Bien-être",
    emoji: "✂️",
    catchphrase: "Zéro rendez-vous manqué, fin des cartes papier et remplissage des créneaux creux.",
    benefitStat: "Zéro no-show & rappels de rendez-vous 100% automatiques",
    offerName: "Sur Place",
    offerPrice: `${prixOffre("place")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "24h/24 en ligne",
        title: "Réservation directe sans commission",
        desc: "Vos clientes réservent leur coupe ou leur soin directement depuis votre vitrine mobile sans vous déranger pendant vos prestations.",
        emoji: "📅",
      },
      {
        num: "02",
        badge: "En fin de soin",
        title: "1 bip pour tamponner le Wallet",
        desc: "La cliente présente son smartphone : votre équipe bipe son passeport Google Wallet en 1 seconde.",
        emoji: "🎟️",
      },
      {
        num: "03",
        badge: "4 semaines plus tard",
        title: "Relance automatique bienveillante",
        desc: "Le système invite automatiquement votre cliente à reprendre son créneau avant qu'elle ne vous oublie.",
        emoji: "⏰",
      },
    ],
    modules: [
      {
        name: "Passeport fidélité Google Wallet",
        tag: "Modernité",
        desc: "Toujours dans le smartphone, notifications sur écran de verrouillage.",
        href: "/passeport-fidelite",
      },
      {
        name: "Réservation d'agenda 24/7",
        tag: "Zéro appel",
        desc: "Vos créneaux libres se remplissent automatiquement de jour comme de nuit.",
        href: "/vitrine-reservation",
      },
      {
        name: "Tickets d'Or VIP",
        tag: "Geste de service",
        desc: "Offrez un soin ou un produit surprise à vos clientes les plus fidèles.",
        href: "/passeport-fidelite",
      },
    ],
  },
];

export function UseCasesByTrade() {
  const [selectedId, setSelectedId] = useState<string>("restaurant");
  const current = TRADES.find((t) => t.id === selectedId) ?? TRADES[0];

  return (
    <div className="relative">
      {/* En-tête asymétrique dé-zoomé */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-k-ink/10 pb-5">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.16em] text-k-ink/70">
            <span className="h-2 w-2 rounded-full bg-k-orange animate-pulse" />
            Votre Commerce En Situation Réelle
          </span>
          <h3 className="mt-1.5 text-xl sm:text-[24px] font-black text-k-ink" style={DISPLAY}>
            Conçu pour votre activité, pensé pour vos clients
          </h3>
          <p className="mt-1 max-w-xl text-xs sm:text-sm font-bold text-k-body leading-relaxed">
            Parcours client fluide en 3 étapes et sélection des modules activables immédiatement dans votre commerce.
          </p>
        </div>

        {/* 4 Onglets Métier Pilules Modernes et Compacts alignés à droite */}
        <div className="flex flex-wrap items-center gap-1.5 self-start md:self-end">
          {TRADES.map((t) => {
            const isActive = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`k-pill flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black transition-all ${
                  isActive
                    ? "bg-k-yellow text-k-ink border-2 border-k-ink shadow-xs scale-105"
                    : "bg-white/85 border border-k-ink/15 text-k-body hover:border-k-ink/30 hover:bg-white"
                }`}
              >
                <span className="text-base">{t.emoji}</span>
                <span>{t.trade}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bannière de promesse métier compacte */}
      <div className="mt-6 rounded-[20px] border border-k-ink/12 bg-gradient-to-r from-amber-50/70 via-yellow-50/50 to-amber-50/70 p-3.5 sm:p-4 text-center shadow-2xs">
        <p className="text-sm sm:text-[15px] font-black text-k-ink leading-snug" style={DISPLAY}>
          « {current.catchphrase} »
        </p>
        <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 text-[11px] font-black text-k-ink">
          <span className="rounded-full bg-k-green text-k-bg px-2.5 py-0.5">
            ✓ {current.benefitStat}
          </span>
          <span className="rounded-full bg-white border border-k-ink/15 px-2.5 py-0.5 shadow-2xs">
            Formule {current.offerName} ({current.offerPrice})
          </span>
        </div>
      </div>

      {/* Parcours en 3 étapes compact */}
      <div className="mt-6">
        <h4 className="text-center text-[10px] font-black uppercase tracking-wider text-k-muted">
          Le parcours client en 3 étapes concrètes :
        </h4>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {current.steps.map((step) => (
            <Tilt3D key={step.num} intensity={4}>
              <div className="k-card-pop flex flex-col justify-between rounded-[20px] p-4 sm:p-5 bg-white border border-k-ink/10 h-full shadow-2xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{step.emoji}</span>
                    <span className="rounded-full bg-k-ink text-k-bg px-2.5 py-0.5 text-[10px] font-black font-mono">
                      Étape {step.num}
                    </span>
                  </div>
                  <span className="mt-2.5 inline-block rounded-full bg-amber-50 border border-k-ink/12 px-2.5 py-0.5 text-[9px] font-black uppercase text-k-orange-text">
                    {step.badge}
                  </span>
                  <h5 className="mt-1.5 text-sm sm:text-base font-black text-k-ink" style={DISPLAY}>
                    {step.title}
                  </h5>
                  <p className="mt-1 text-xs font-semibold text-k-body leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            </Tilt3D>
          ))}
        </div>
      </div>

      {/* Les modules clés recommandés avec liens directs */}
      <div className="mt-8 pt-5 border-t border-dashed border-k-ink/15">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-k-muted text-center sm:text-left">
          Les modules inclus activables en 1 clic :
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {current.modules.map((m) => (
            <div
              key={m.name}
              className="rounded-[16px] border border-k-ink/10 bg-white/90 p-4 flex flex-col justify-between shadow-2xs hover:border-k-ink/30 hover:shadow-xs transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-k-ink">{m.name}</span>
                  <span className="rounded-full bg-k-yellow/50 px-2 py-0.5 text-[9px] font-black text-k-ink whitespace-nowrap">
                    {m.tag}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-k-body leading-snug">
                  {m.desc}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-k-ink/10">
                <Link
                  href={m.href}
                  className="text-xs font-black text-k-orange-text hover:underline flex items-center justify-between"
                >
                  <span>Découvrir la démo</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

