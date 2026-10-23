"use client";

import { useState } from "react";
import Link from "next/link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { prixOffre } from "@/components/marketing/prix";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface EventStep {
  num: string;
  badge: string;
  title: string;
  desc: string;
  emoji: string;
}

interface EventAnimationData {
  id: "pronostics" | "calendrier" | "quiz" | "chasse-qr";
  name: string;
  emoji: string;
  badge: string;
  dot: string;
  headline: string;
  subheadline: string;
  benefitStat: string;
  fidelityHook: string;
  steps: [EventStep, EventStep, EventStep];
  recommendedOffer: string;
  offerPrice: string;
}

const EVENT_ANIMATIONS: readonly EventAnimationData[] = [
  {
    id: "pronostics",
    name: "Championnat de Pronostics",
    emoji: "⚽",
    badge: "Fidélisation & Revisite",
    dot: "bg-k-blue",
    headline: "Faites jouer vos clients chaque semaine depuis chez eux… pour les faire revenir en magasin !",
    subheadline: "Un rituel hebdomadaire irrésistible : vos clients pronostiquent à distance sur leur smartphone les grands matchs du week-end pour remporter un lot mis en jeu par votre commerce.",
    benefitStat: "100 % de revisite en boutique pour retirer les lots gagnés",
    fidelityHook: "Le joueur participe tranquillement depuis son canapé ou le bureau. Quand il gagne son burger, sa planche ou sa réduction, il vient obligatoirement dans votre établissement pour en profiter !",
    recommendedOffer: "Le Grand Jeu",
    offerPrice: `${prixOffre("live")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "Chaque semaine à distance",
        title: "Le client pronostique sur son smartphone",
        desc: "Pas besoin d'être sur place ! Depuis son téléphone, il pronostique en 30 secondes les matchs de la semaine (Ligue 1, Ligue des Champions, Top 14) via le lien ou QR de votre commerce.",
        emoji: "📲",
      },
      {
        num: "02",
        badge: "Décompte automatique",
        title: "Le classement s'actualise & le lot est débloqué",
        desc: "Vos clients suivent leur score et le classement des habitués. Le commerçant met en jeu un lot chaque semaine (1 plat offert, 1 tournée, 1 remise VIP).",
        emoji: "🏆",
      },
      {
        num: "03",
        badge: "En boutique / restaurant",
        title: "Le gagnant vient consommer son lot en caisse",
        desc: "Le vainqueur reçoit son bon sécurisé avec QR code unique. Pour en profiter, il franchit votre porte et consomme chez vous avec ses amis ou collègues !",
        emoji: "🍔",
      },
    ],
  },
  {
    id: "calendrier",
    name: "Calendrier à Surprises",
    emoji: "📅",
    badge: "Rituel Quotidien",
    dot: "bg-k-pink",
    headline: "Un rendez-vous quotidien de 7 à 24 jours pour créer une habitude de visite",
    subheadline: "Pour Noël, l'anniversaire de votre commerce ou le lancement d'une saison : chaque jour, vos clients ouvrent une case en ligne pour découvrir un cadeau valable un temps limité.",
    benefitStat: "+40 % d'affluence quotidienne sur la période festive",
    fidelityHook: "Le client ouvre sa case chaque matin sur son téléphone au réveil. La curiosité le pousse à revenir chaque jour pour récupérer sa surprise du jour.",
    recommendedOffer: "Sur Place",
    offerPrice: `${prixOffre("place")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "Chaque matin en ligne",
        title: "Une case quotidienne à débloquer",
        desc: "Accessible en 1 clic via le lien de votre commerce. Le client découvre l'avantage du jour préparé par vos soins (remise, café offert, dessert, goodie).",
        emoji: "🎁",
      },
      {
        num: "02",
        badge: "Validité éclair",
        title: "Un compte à rebours qui déclenche l'achat",
        desc: "L'offre du jour a une durée limitée (ex: valable aujourd'hui avant 15h ou sous 48h). Cela génère un sentiment d'opportunité immédiate.",
        emoji: "⏳",
      },
      {
        num: "03",
        badge: "En caisse",
        title: "Le client passe en boutique pour l'utiliser",
        desc: "Il présente son smartphone en caisse, vous validez le code d'un geste et il en profite pour faire ses achats habituels.",
        emoji: "🛍️",
      },
    ],
  },
  {
    id: "quiz",
    name: "Quiz & Blind Tests",
    emoji: "🧠",
    badge: "Défis & Convivialité",
    dot: "bg-k-yellow",
    headline: "Testez leur culture ou vos spécialités pour récompenser les plus passionnés",
    subheadline: "Des questions amusantes sur votre histoire, vos produits ou un thème festif. Les clients jouent en solo ou en groupe et débloquent des privilèges exclusifs.",
    benefitStat: "+45 min passées sur place & bouche-à-oreille immédiat",
    fidelityHook: "Le jeu valorise le savoir-faire de votre maison tout en amusant les clients. Les meilleurs scores gagnent des accès VIP et des avantages en caisse.",
    recommendedOffer: "Le Grand Jeu",
    offerPrice: `${prixOffre("live")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "Au scan du QR",
        title: "Le quiz se lance instantanément",
        desc: "3 à 5 questions interactives à choix multiples avec chrono. Aucun téléchargement, les questions s'affichent avec vos couleurs.",
        emoji: "⚡",
      },
      {
        num: "02",
        badge: "Sur écran ou smartphone",
        title: "Buzzer en direct & classement des joueurs",
        desc: "Les bonnes réponses rapportent des points. En salle ou au comptoir, l'ambiance monte et les tables se prêtent au jeu.",
        emoji: "🎉",
      },
      {
        num: "03",
        badge: "Au comptoir",
        title: "Le score donne droit à une récompense",
        desc: "100% de bonnes réponses ? Le client débloque un ticket cadeau ou un tampon bonus dans son passeport fidélité.",
        emoji: "🎟️",
      },
    ],
  },
  {
    id: "chasse-qr",
    name: "Chasse aux QR & Trésors",
    emoji: "🗺️",
    badge: "Parcours Physique",
    dot: "bg-k-green",
    headline: "Faites explorer tous vos rayons ou partenaires pour débloquer le trésor final",
    subheadline: "Dissé鉱inez des QR codes énigmes dans les recoins de votre boutique, restaurant ou chez des commerçants amis pour guider les visiteurs jusqu'au coffre.",
    benefitStat: "+35 % de circulation dans les rayons délaissés",
    fidelityHook: "Le parcours ludique incite les passants à observer attentivement toute votre offre et à découvrir des produits qu'ils n'auraient jamais vus autrement.",
    recommendedOffer: "Le Club",
    offerPrice: `${prixOffre("engagement")} €/mois`,
    steps: [
      {
        num: "01",
        badge: "À l'entrée",
        title: "Le client scanne le 1er indice",
        desc: "Une énigme lui indique où se cache le QR code suivant (ex: « Je réchauffe vos hivers au fond du magasin »).",
        emoji: "🔍",
      },
      {
        num: "02",
        badge: "En rayon",
        title: "Il scanne les balises et progresse",
        desc: "Chaque balise validée fait monter sa jauge de progression sur son smartphone jusqu'à trouver l'ultime étape.",
        emoji: "🚶",
      },
      {
        num: "03",
        badge: "Au coffre",
        title: "Le trésor final s'ouvre en caisse",
        desc: "Une fois le parcours bouclé, le coffre s'ouvre sur un bon d'achat ou un cadeau mystère à échanger auprès de votre équipe.",
        emoji: "💎",
      },
    ],
  },
];

/* ───────────────────── Simulateurs Visuels Interactifs ───────────────────── */

function PronosticsSimulator() {
  const [scoreHome, setScoreHome] = useState(2);
  const [scoreAway, setScoreAway] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="rounded-3xl border-3 border-k-ink bg-white p-5 sm:p-6 shadow-[0_6px_0_var(--color-k-ink)]">
      {/* En-tête mobile */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-k-ink/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-k-green animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-k-ink">
            ⚽ Pronostics Hebdo · Semaine #42
          </span>
        </div>
        <span className="rounded-full bg-k-blue/20 border border-k-ink/30 px-2.5 py-0.5 text-[10px] font-black text-k-ink">
          En ligne 24/7
        </span>
      </div>

      {/* Carte du lot hebdomadaire mis en jeu */}
      <div className="mt-4 rounded-2xl border-2 border-k-ink bg-k-yellow/30 p-3.5 text-center">
        <span className="inline-block rounded-md bg-white border border-k-ink px-2 py-0.5 text-[10px] font-black uppercase text-k-orange-text">
          🎁 Lot de la semaine offert par le patron
        </span>
        <p className="mt-1.5 text-sm font-black text-k-ink" style={DISPLAY}>
          « 1 Burger Maison ou 1 Planche Apéro »
        </p>
        <p className="text-[11px] font-bold text-k-body">
          À consommer sur place par le vainqueur de la semaine !
        </p>
      </div>

      {/* Affiche du Match & Sélecteur de score */}
      <div className="mt-4 rounded-2xl border-2 border-k-ink/20 bg-k-bg/80 p-4">
        <div className="text-center text-[11px] font-black uppercase tracking-wide text-k-muted">
          Match star du dimanche 21h
        </div>
        <div className="mt-3 flex items-center justify-around gap-2">
          {/* Équipe Domicile */}
          <div className="flex flex-col items-center">
            <span className="text-2xl">🔵🔴</span>
            <span className="mt-1 text-xs font-black text-k-ink">Paris</span>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setScoreHome((s) => Math.max(0, s - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-k-ink bg-white text-sm font-black text-k-ink hover:bg-k-yellow"
              >
                -
              </button>
              <span className="w-6 text-center text-lg font-black text-k-ink font-mono">
                {scoreHome}
              </span>
              <button
                type="button"
                onClick={() => setScoreHome((s) => s + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-k-ink bg-white text-sm font-black text-k-ink hover:bg-k-yellow"
              >
                +
              </button>
            </div>
          </div>

          <span className="text-sm font-black text-k-muted" style={DISPLAY}>
            VS
          </span>

          {/* Équipe Extérieure */}
          <div className="flex flex-col items-center">
            <span className="text-2xl">⚪🔵</span>
            <span className="mt-1 text-xs font-black text-k-ink">Marseille</span>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setScoreAway((s) => Math.max(0, s - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-k-ink bg-white text-sm font-black text-k-ink hover:bg-k-yellow"
              >
                -
              </button>
              <span className="w-6 text-center text-lg font-black text-k-ink font-mono">
                {scoreAway}
              </span>
              <button
                type="button"
                onClick={() => setScoreAway((s) => s + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-k-ink bg-white text-sm font-black text-k-ink hover:bg-k-yellow"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Bouton de validation */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            className="k-btn w-full rounded-xl border-2 border-k-ink bg-k-orange py-2.5 text-xs font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)]"
          >
            {submitted ? "✓ Pronostic enregistré pour la semaine !" : "Valider mon prono (Jouer depuis chez moi) →"}
          </button>
        </div>
      </div>

      {/* Confirmation & Retrait en magasin */}
      {submitted && (
        <div className="mt-4 rounded-2xl border-2 border-k-green bg-k-green/15 p-3 text-center animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-center gap-1.5 text-xs font-black text-k-green">
            <span>🎉</span>
            <span>Vous êtes 1er au classement provisoire !</span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-k-ink">
            Gagnant(e) dimanche à 23h ? Votre bon de retrait sera valable 7 jours dans notre restaurant !
          </p>
        </div>
      )}

      {/* Mini Classement des habitués */}
      <div className="mt-4 pt-3 border-t border-k-ink/10">
        <div className="text-[10px] font-black uppercase text-k-muted">
          Classement des clients cette semaine :
        </div>
        <div className="mt-2 space-y-1 text-xs font-bold text-k-ink">
          <div className="flex items-center justify-between rounded-lg bg-k-yellow/30 px-2.5 py-1 border border-k-ink/20">
            <span>🥇 Lucas M. (Vous)</span>
            <span className="font-mono font-black text-k-orange-text">28 pts · Qualifié pour le lot</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 text-k-muted">
            <span>🥈 Sarah D.</span>
            <span className="font-mono">24 pts</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendrierSimulator() {
  const [openedDay, setOpenedDay] = useState<number | null>(5);

  const surprises: Record<number, { title: string; gift: string; code: string }> = {
    1: { title: "Jour 1", gift: "☕ 1 Café offert pour tout déjeuner", code: "CAL-01" },
    2: { title: "Jour 2", gift: "🥐 1 Viennoiserie offerte", code: "CAL-02" },
    3: { title: "Jour 3", gift: "🏷️ -15% sur toute l'addition", code: "CAL-03" },
    4: { title: "Jour 4", gift: "🍪 1 Cookie artisanal offert", code: "CAL-04" },
    5: { title: "Jour 5 (Aujourd'hui)", gift: "🍹 1 Cocktail découverte offert dès 15€", code: "CAL-05-VIP" },
    6: { title: "Jour 6", gift: "🍰 1 Dessert maison offert", code: "CAL-06" },
  };

  return (
    <div className="rounded-3xl border-3 border-k-ink bg-white p-5 sm:p-6 shadow-[0_6px_0_var(--color-k-ink)]">
      <div className="flex items-center justify-between border-b-2 border-dashed border-k-ink/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📅</span>
          <span className="text-xs font-black uppercase tracking-wider text-k-ink">
            Calendrier à Surprises de Décembre
          </span>
        </div>
        <span className="rounded-full bg-k-pink/30 border border-k-ink/30 px-2 py-0.5 text-[10px] font-black text-k-ink">
          Jour 5 en cours
        </span>
      </div>

      <p className="mt-3 text-center text-xs font-bold text-k-body">
        Cliquez sur une case pour découvrir la surprise du jour :
      </p>

      {/* Grille de cases */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((day) => {
          const isToday = day === 5;
          const isSelected = openedDay === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setOpenedDay(day)}
              className={`flex flex-col items-center justify-center rounded-2xl p-3 border-2 transition-all ${
                isToday
                  ? "border-k-ink bg-k-yellow shadow-[0_3px_0_var(--color-k-ink)] scale-105"
                  : isSelected
                  ? "border-k-ink bg-k-pink/30"
                  : "border-k-ink/20 bg-k-bg hover:border-k-ink hover:bg-white"
              }`}
            >
              <span className="text-lg">{isToday ? "✨" : "🎁"}</span>
              <span className="mt-1 text-xs font-black text-k-ink" style={DISPLAY}>
                Jour {day}
              </span>
              {isToday && (
                <span className="mt-0.5 rounded bg-k-orange px-1 py-0.2 text-[8px] font-black text-k-ink uppercase">
                  Aujourd&apos;hui
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Révélation de la case ouverte */}
      {openedDay && surprises[openedDay] && (
        <div className="mt-4 rounded-2xl border-2 border-k-ink bg-k-pink/20 p-4 text-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-k-orange-text">
            Surprise débloquée · {surprises[openedDay].title}
          </span>
          <p className="mt-1 text-sm font-black text-k-ink" style={DISPLAY}>
            {surprises[openedDay].gift}
          </p>
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-white border border-k-ink px-3 py-1 text-xs font-mono font-black text-k-ink">
            <span>Code caisse :</span>
            <span className="text-k-orange-text">{surprises[openedDay].code}</span>
          </div>
          <p className="mt-2 text-[10px] font-bold text-k-muted">
            Valable en boutique uniquement aujourd&apos;hui avant 20h !
          </p>
        </div>
      )}
    </div>
  );
}

function QuizSimulator() {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const correctOption = 1;

  return (
    <div className="rounded-3xl border-3 border-k-ink bg-white p-5 sm:p-6 shadow-[0_6px_0_var(--color-k-ink)]">
      <div className="flex items-center justify-between border-b-2 border-dashed border-k-ink/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <span className="text-xs font-black uppercase tracking-wider text-k-ink">
            Quiz du Commerçant · Question #1
          </span>
        </div>
        <span className="rounded-full bg-k-yellow border border-k-ink/30 px-2 py-0.5 text-[10px] font-black text-k-ink">
          Chrono : 15s
        </span>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-k-ink/20 bg-k-bg/80 p-4">
        <p className="text-sm font-black text-k-ink" style={DISPLAY}>
          « Quel ingrédient secret fait la renommée de notre sauce burger maison ? »
        </p>

        <div className="mt-3 space-y-2">
          {[
            { id: 0, text: "Du vinaigre blanc simple" },
            { id: 1, text: "Des oignons confits au miel d'acacia" },
            { id: 2, text: "De la mayonnaise industrielle" },
          ].map((opt) => {
            const isChosen = selectedOption === opt.id;
            const isCorrect = opt.id === correctOption;
            let style = "bg-white border-k-ink/20 text-k-body hover:border-k-ink";
            if (isChosen) {
              style = isCorrect
                ? "bg-k-green/20 border-k-green text-k-ink font-black"
                : "bg-k-pink/30 border-k-pink text-k-ink font-black";
            }

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOption(opt.id)}
                className={`w-full text-left rounded-xl border-2 p-3 text-xs font-bold transition-all ${style}`}
              >
                <div className="flex items-center justify-between">
                  <span>{opt.text}</span>
                  {isChosen && isCorrect && <span className="text-k-green font-black">✓ Correct !</span>}
                  {isChosen && !isCorrect && <span className="text-k-pink font-black">✗ Faux</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedOption === correctOption && (
        <div className="mt-4 rounded-2xl border-2 border-k-green bg-k-green/15 p-3 text-center">
          <div className="text-xs font-black text-k-green">
            🎉 Excellent ! Vous connaissez nos produits par cœur !
          </div>
          <p className="mt-1 text-[11px] font-bold text-k-ink">
            1 avantage débloqué : <strong>-10% sur votre commande</strong> à présenter au serveur !
          </p>
        </div>
      )}
    </div>
  );
}

function ChasseQrSimulator() {
  const [foundCount, setFoundCount] = useState(2);

  return (
    <div className="rounded-3xl border-3 border-k-ink bg-white p-5 sm:p-6 shadow-[0_6px_0_var(--color-k-ink)]">
      <div className="flex items-center justify-between border-b-2 border-dashed border-k-ink/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🗺️</span>
          <span className="text-xs font-black uppercase tracking-wider text-k-ink">
            Chasse aux Trésors en Rayon
          </span>
        </div>
        <span className="rounded-full bg-k-green text-k-bg px-2.5 py-0.5 text-[10px] font-black">
          {foundCount}/3 QR scannés
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between rounded-xl border-2 border-k-ink/20 bg-k-green/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🍷</span>
            <div>
              <div className="text-xs font-black text-k-ink">Indice 1 : Rayon Vins & Cave</div>
              <div className="text-[10px] text-k-muted">QR code scanné avec succès</div>
            </div>
          </div>
          <span className="text-xs font-black text-k-green">✓ Validé</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border-2 border-k-ink/20 bg-k-green/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧀</span>
            <div>
              <div className="text-xs font-black text-k-ink">Indice 2 : Rayon Terroir & Fromages</div>
              <div className="text-[10px] text-k-muted">QR code scanné avec succès</div>
            </div>
          </div>
          <span className="text-xs font-black text-k-green">✓ Validé</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border-2 border-k-ink bg-k-yellow/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗝️</span>
            <div>
              <div className="text-xs font-black text-k-ink">Indice 3 : Près du comptoir d&apos;accueil</div>
              <div className="text-[10px] text-k-orange-text font-bold">Dernier QR à trouver !</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFoundCount(3)}
            className="rounded-lg border-2 border-k-ink bg-k-orange px-2.5 py-1 text-[11px] font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)]"
          >
            {foundCount === 3 ? "✓ Trouvé !" : "Simuler le scan"}
          </button>
        </div>
      </div>

      {foundCount === 3 && (
        <div className="mt-4 rounded-2xl border-2 border-k-ink bg-k-yellow p-3 text-center">
          <span className="text-2xl">💎</span>
          <div className="text-xs font-black text-k-ink" style={DISPLAY}>
            Félicitations ! Coffre au trésor déverrouillé !
          </div>
          <p className="mt-1 text-[11px] font-bold text-k-ink">
            Présentez ce badge en caisse pour retirer votre cadeau surprise physique.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Composant Principal ───────────────────── */

export function EventAnimationsShowcase() {
  const [selectedId, setSelectedId] = useState<EventAnimationData["id"]>("pronostics");
  const current = EVENT_ANIMATIONS.find((a) => a.id === selectedId) ?? EVENT_ANIMATIONS[0];

  return (
    <div className="relative">
      {/* En-tête asymétrique et dé-zoomé */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-k-ink/10 pb-5">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.16em] text-k-ink/70">
            <span className="h-2 w-2 rounded-full bg-k-blue animate-pulse" />
            Animations Événementielles & Rétention Hebdo
          </span>
          <h3 className="mt-1.5 text-xl sm:text-[24px] font-black text-k-ink" style={DISPLAY}>
            Quatre animations stars pour créer des rendez-vous réguliers
          </h3>
          <p className="mt-1 max-w-xl text-xs sm:text-sm font-bold text-k-body leading-relaxed">
            Faites jouer vos clients depuis chez eux chaque semaine pour qu&apos;ils reviennent consommer leurs gains dans votre établissement.
          </p>
        </div>

        {/* 4 Onglets Pilules Modernes et Compacts alignés à droite sur desktop */}
        <div className="flex flex-wrap items-center gap-1.5 self-start md:self-end">
          {EVENT_ANIMATIONS.map((anim) => {
            const isActive = anim.id === selectedId;
            return (
              <button
                key={anim.id}
                type="button"
                onClick={() => setSelectedId(anim.id)}
                className={`k-pill flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black transition-all ${
                  isActive
                    ? "bg-k-yellow text-k-ink border-2 border-k-ink shadow-xs scale-105"
                    : "bg-white/85 border border-k-ink/15 text-k-body hover:border-k-ink/30 hover:bg-white"
                }`}
              >
                <span className="text-base">{anim.emoji}</span>
                <span>{anim.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bannière de promesse & bénéfice compacte */}
      <div className="mt-6 rounded-[20px] border border-k-ink/12 bg-gradient-to-r from-blue-50/70 via-white/80 to-blue-50/70 p-3.5 sm:p-4 text-center shadow-2xs">
        <p className="text-sm sm:text-[15px] font-black text-k-ink leading-snug" style={DISPLAY}>
          « {current.headline} »
        </p>
        <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 text-[11px] font-black text-k-ink">
          <span className="rounded-full bg-k-green text-k-bg px-2.5 py-0.5">
            ✓ {current.benefitStat}
          </span>
          <span className="rounded-full bg-white border border-k-ink/15 px-2.5 py-0.5 shadow-2xs">
            Formule {current.recommendedOffer} ({current.offerPrice})
          </span>
        </div>
      </div>

      {/* Cœur du showcase : Explications + Visu interactive côte à côte */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Colonne gauche : Parcours en 3 étapes & Clé de fidélisation */}
        <div className="lg:col-span-6 flex flex-col justify-between h-full">
          <div>
            <div className="rounded-xl border border-k-ink/12 bg-amber-50/40 p-3.5">
              <span className="text-[10px] font-black uppercase text-k-orange-text tracking-wider">
                💡 Secret de fidélisation :
              </span>
              <p className="mt-0.5 text-xs font-bold text-k-ink leading-relaxed">
                {current.fidelityHook}
              </p>
            </div>

            <h4 className="mt-5 text-[10px] font-black uppercase tracking-wider text-k-muted">
              Le parcours en 3 étapes simples :
            </h4>

            <div className="mt-3 space-y-2.5">
              {current.steps.map((step) => (
                <div
                  key={step.num}
                  className="k-card-pop rounded-[18px] p-3.5 sm:p-4 bg-white border border-k-ink/10 shadow-2xs flex items-start gap-3"
                >
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-k-yellow/60 border border-k-ink/20 text-lg shadow-2xs">
                    {step.emoji}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-black text-k-orange-text">
                        Étape {step.num}
                      </span>
                      <span className="rounded-full bg-k-bg px-2 py-0.5 text-[9px] font-black uppercase text-k-ink border border-k-ink/12">
                        {step.badge}
                      </span>
                    </div>
                    <h5 className="mt-0.5 text-xs sm:text-sm font-black text-k-ink" style={DISPLAY}>
                      {step.title}
                    </h5>
                    <p className="mt-0.5 text-[11px] sm:text-xs font-semibold text-k-body leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-dashed border-k-ink/15">
            <Link
              href="/tarifs"
              className="k-pill inline-flex items-center justify-center gap-2 rounded-full border-2 border-k-ink bg-k-orange px-6 py-2.5 text-xs sm:text-sm font-black text-k-ink shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all w-full sm:w-auto"
            >
              <span>Activer {current.name} sur mon commerce</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Colonne droite : La visu interactive en situation réelle */}
        <div className="lg:col-span-6">
          <div className="text-center mb-2.5">
            <span className="inline-block rounded-full bg-k-ink text-k-bg px-2.5 py-0.5 text-[10px] font-black font-mono">
              ★ VISU EN SITUATION RÉELLE ★
            </span>
          </div>

          <Tilt3D intensity={4}>
            {selectedId === "pronostics" && <PronosticsSimulator />}
            {selectedId === "calendrier" && <CalendrierSimulator />}
            {selectedId === "quiz" && <QuizSimulator />}
            {selectedId === "chasse-qr" && <ChasseQrSimulator />}
          </Tilt3D>
        </div>
      </div>
    </div>
  );
}
