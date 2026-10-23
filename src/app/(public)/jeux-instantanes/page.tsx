import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";
import { Magnetic } from "@/components/marketing/magnetic";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { KermessePatternSection } from "@/components/marketing/kermesse-pattern-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
import { SimulatorGames } from "@/components/marketing/simulator-games";
import { TradeRoiSimulator } from "@/components/marketing/trade-roi-simulator";

const lilita = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-heading",
});

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export const metadata: Metadata = {
  title: "15 Jeux Instantanés au QR code · Roue 3D, Grattage, Machine à sous · Lastchance",
  description:
    "Découvrez nos 15 mécaniques de jeu captivantes au QR code sans téléchargement d'application pour convertir les passants en habitués et doper votre chiffre d'affaires.",
};

const STEPS = [
  {
    n: 1,
    title: "Le client scanne le QR code sur votre support",
    description: "Sur le comptoir, vos tables, l'addition ou la vitrine. Vos affiches A4 prêtes à imprimer sont générées en un clic avec vos couleurs.",
    icon: "📲",
    accent: "bg-[#FFE600] text-[#181512]",
  },
  {
    n: 2,
    title: "Il joue immédiatement en 30 secondes",
    description: "Roue de la fortune 3D, ticket à gratter, machine à sous ou défi réflexe. Zéro compte à créer, zéro application à télécharger sur les stores.",
    icon: "🎰",
    accent: "bg-[#FF6B35] text-white",
  },
  {
    n: 3,
    title: "Il retire son gain validé en caisse",
    description: "Le gagnant présente son bon sécurisé à usage unique. Votre équipe le valide d'un geste au scanner caisse en moins d'une seconde.",
    icon: "💰",
    accent: "bg-[#10B981] text-white",
  },
];

const MERCHANT_POINTS = [
  "Paramétrage libre des probabilités de gain et plafonds quotidiens",
  "Validation sécurisée en caisse via scanner QR en 1 seconde",
  "Statistiques complètes : taux de conversion, coût moyen par contact",
  "Collecte conforme RGPD des coordonnées pour vos campagnes de relance",
];

const ALL_15_GAMES = [
  {
    id: "roue",
    name: "Roue de la Fortune 3D",
    category: "Aléatoire instantané",
    desc: "La star incontestée des commerces. Vos clients font tourner les 8 segments personnalisés avec vos propres lots (café offert, réduction, surprise).",
    emoji: "🎡",
    badge: "N°1 Populaire",
  },
  {
    id: "grattage",
    name: "Ticket à Gratter Digital",
    category: "Aléatoire instantané",
    desc: "L'émotion tactile du jeu de grattage directement sur écran tactile. Le client gratte 3 zones pour tenter d'aligner 3 symboles identiques.",
    emoji: "🎫",
    badge: "Addictif",
  },
  {
    id: "bandit",
    name: "Bandit Manchot Casino",
    category: "Aléatoire instantané",
    desc: "Machine à sous 3 rouleaux avec effets sonores rétro. Trois 7 ou 3 cerises déclenchent le jackpot de votre établissement !",
    emoji: "🎰",
    badge: "Ambiance",
  },
  {
    id: "des",
    name: "Lancer de Dés Magiques",
    category: "Aléatoire instantané",
    desc: "Deux dés 3D lancés sur le comptoir virtuel. Un double 6 ou un score combiné débloque une offre exclusive immédiate.",
    emoji: "🎲",
    badge: "Rapide",
  },
  {
    id: "reflexe",
    name: "Défi Réflexe Chrono",
    category: "Réflexe & agilité",
    desc: "Un buzzer ou une cible apparaît à l'écran : le joueur doit appuyer en moins de 350 millisecondes pour remporter la victoire.",
    emoji: "⚡",
    badge: "Challenging",
  },
  {
    id: "juste-prix",
    name: "Le Juste Prix",
    category: "Réflexe & agilité",
    desc: "Devinez le prix exact d'un panier gourmand ou d'une création de la maison. Les habitués adorent tester leur connaissance de vos produits.",
    emoji: "🏷️",
    badge: "Produit",
  },
  {
    id: "coffres",
    name: "Les 3 Coffres Mystères",
    category: "Tirage & mystère",
    desc: "Trois coffres fermés à clé. Le joueur en choisit un seul pour révéler s'il abrite le trésor ou un lot de consolation.",
    emoji: "🗝️",
    badge: "Curiosité",
  },
  {
    id: "bonneteau",
    name: "Le Bonneteau Express",
    category: "Tirage & mystère",
    desc: "Trois gobelets qui s'échangent à vive allure. Suivez des yeux celui qui cache la bille d'or pour remporter la mise !",
    emoji: "🎩",
    badge: "Observation",
  },
  {
    id: "jackpot",
    name: "Jackpot Collectif",
    category: "Tirage & mystère",
    desc: "Une cagnotte collective qui monte à chaque scan client jusqu'à ce qu'un visiteur chanceux fasse tomber le super lot !",
    emoji: "💎",
    badge: "Fidélisation",
  },
  {
    id: "duo-miroir",
    name: "Duo Miroir & Blind Test",
    category: "Stratégie & cartes",
    desc: "Idéal pour les tables de deux : chacun répond à des questions sur l'autre ou devine un indice pour débloquer un digestif ou dessert offert.",
    emoji: "👥",
    badge: "Convivial",
  },
  {
    id: "bande",
    name: "Portrait de la Bande",
    category: "Stratégie & cartes",
    desc: "Conçu pour les groupes de 3 à 8 personnes au bar ou restaurant. Le jeu désigne un rôle ou un défi amusant à chaque convive.",
    emoji: "🍻",
    badge: "Groupe",
  },
  {
    id: "carte-or",
    name: "La Carte d'Or",
    category: "Stratégie & cartes",
    desc: "Une sélection de cartes face cachée. Retrouver l'as d'or octroie le statut de client VIP avec un avantage permanent pendant un mois.",
    emoji: "🃏",
    badge: "Prestige",
  },
  {
    id: "memory",
    name: "Memory des Saveurs",
    category: "Réflexe & agilité",
    desc: "Retrouvez les paires d'ingrédients ou de produits phares de votre carte dans le temps imparti. Ludique et valorisant pour votre terroir.",
    emoji: "🧠",
    badge: "Famille",
  },
  {
    id: "roulette-shots",
    name: "Roulette des Spécialités",
    category: "Ambiance bar & fête",
    desc: "Particulièrement plébiscité dans les bars, pubs et restaurants festifs pour animer les apéritifs et commander la tournée gagnante.",
    emoji: "🎯",
    badge: "Soirée",
  },
  {
    id: "bouteille",
    name: "La Bouteille Surprise",
    category: "Ambiance bar & fête",
    desc: "La bouteille tourne au centre de la table et désigne le convive qui doit relever le défi ou remporter le verre offert par la maison.",
    emoji: "🍾",
    badge: "Festif",
  },
];

const GAMES_FAQ = [
  {
    question: "Puis-je contrôler à 100% les lots offerts et le budget de mes jeux ?",
    answer:
      "Oui, absolument. Vous fixez dans votre tableau de bord le nombre exact de lots en jeu, leur valeur, ainsi que les probabilités de gain. Vous pouvez même plafonner le nombre de gains par jour pour maîtriser parfaitement votre budget.",
  },
  {
    question: "Les jeux sont-ils conformes à la réglementation française sur les jeux-concours ?",
    answer:
      "Oui. Nos mécaniques respectent la législation en vigueur pour les opérations promotionnelles de commerce de proximité (principe de gratuité de participation, règlement type fourni et archivage horodaté des participations).",
  },
  {
    question: "Comment éviter qu'un client ne joue 10 fois d'affilée pour vider les stocks ?",
    answer:
      "Notre système anti-fraude utilise l'empreinte de terminal sécurisée et la géolocalisation pour limiter les tirages à 1 participation par appareil et par jour (ou par addition).",
  },
  {
    question: "Faut-il une connexion Wi-Fi puissante pour faire tourner la 3D ?",
    answer:
      "Non, tous nos mini-jeux sont ultra-légers (moins de 200 Ko) et démarrent instantanément même sur une simple connexion 4G/3G de passage.",
  },
];

export default function JeuxInstantanesPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-[#FFFDF9] text-[#181512]`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* ═══════════════════════════════════════════════════════════════
           BLOC 1 — HERO DANS LES NUAGES (ÉPURÉ AVEC VIGNETTES FLOTTANTES)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative z-10 flex h-screen min-h-[100dvh] flex-col justify-between overflow-hidden px-4 pt-20 text-center sm:px-6 sm:pt-24">
          {/* Décor nuages 4K exclusif */}
          <HeroCloudBackdrop />
          {/* Vignettes kermesse flottantes */}
          <HeroStickers />

          <div className="relative z-10 mx-auto max-w-4xl flex-1 flex flex-col justify-center items-center py-6 sm:py-10">
            <div className="inline-flex items-center gap-2 self-center rounded-full border-[2.5px] border-[#181512] bg-[#FF6B35] px-4 py-1.5 text-xs font-black text-white shadow-[0_3px_0_#181512]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#FFE600] animate-pulse" />
              Module Pilier #1 · 15 Jeux Instantanés au QR Code
            </div>

            <h1
              className="relative z-[2] mx-auto mt-4 max-w-4xl text-[clamp(2.3rem,5.5vw,4.2rem)] font-black leading-[1.08] text-[#181512]"
              style={DISPLAY}
            >
              15 jeux instantanés au QR code pour faire{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-[#181512] bg-[#FFE600] px-4 pb-1 text-[#181512] shadow-[0_5px_0_#181512]">
                jouer en 30s
              </span>{" "}
              et remplir votre caisse.
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg font-bold leading-relaxed text-[#181512]/80">
              Roue 3D, grattage, machine à sous et coffres : vos clients scannent et jouent sans application.
            </p>

            <div className="mt-8 flex justify-center">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2.5 rounded-full border-[3px] border-[#181512] bg-[#FF6B35] px-9 py-4 text-base sm:text-lg font-black text-white shadow-[0_6px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_8px_0_#181512] active:translate-y-0.5"
                >
                  <span>Essayer gratuitement 7 jours</span>
                  <span className="text-xl">→</span>
                </Link>
              </Magnetic>
            </div>
          </div>

          {/* Bandeau qui défile tout en bas du Hero */}
          <div className="relative z-20 w-full mt-auto">
            <StraightRibbonTicker />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 2 — COMMENT ÇA MARCHE (FOND MOTIF : POLKA DOTS CONFETTIS ROSE)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection
          variant="polka-dots-pink"
          className="py-12 sm:py-16 text-[#181512]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Comment ça marche
              </div>
              <h2
                className="mt-3 text-[clamp(1.6rem,3.2vw,2.5rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                3 étapes pour transformer chaque visiteur en joueur
              </h2>
              <p className="mx-auto mt-1.5 max-w-lg text-sm sm:text-base font-bold text-[#181512]/70">
                Du scan du QR code jusqu&apos;à la remise du gain au comptoir.
              </p>
            </div>

            <div className="mt-8 sm:mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step) => (
                <div
                  key={step.n}
                  className="group relative flex flex-col items-center rounded-2xl border-[3px] border-[#181512] bg-white p-5 sm:p-6 text-center shadow-[0_5px_0_#181512] transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_0_#181512]"
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#181512] text-2xl shadow-[0_3px_0_#181512] ${step.accent}`}
                  >
                    {step.icon}
                  </div>

                  <div
                    className="mt-2 text-4xl font-black text-[#181512]/15 transition-colors group-hover:text-[#FF6B35]/30"
                    style={DISPLAY}
                  >
                    0{step.n}
                  </div>

                  <h3
                    className="-mt-1 text-lg font-black text-[#181512]"
                    style={DISPLAY}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[#181512]/70 font-bold">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-4 py-1.5 text-xs sm:text-sm font-black text-[#181512] shadow-[0_2.5px_0_#181512]">
                <span>⚡</span> 98% des clients jouent en moins d&apos;une minute sans aucune assistance.
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 2 : Damier Rouge & Blanc */}
        <CheckerboardSeparator color="#EF4444" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 3 — GRAND BLOC DÉMO JEUX INSTANTANÉS (FOND COULEUR UNIE : JAUNE VANILLE SOLAIRE #FFF8D6)
           ═══════════════════════════════════════════════════════════════ */}
        <section id="simulateur" className="relative z-10 py-12 sm:py-16 bg-[#FFF8D6] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FF6B35] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-[0_2px_0_#181512]">
                🎰 Simulateur de Jeux en Direct
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Testez la Roue 3D, le Grattage et les Machines à sous
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Essayez directement le parcours que vivront vos clients. Choisissez une mécanique, lancez la partie et visualisez la validation du gain.
              </p>
            </div>

            {/* Grille pleine largeur : Colonne Avantages/Comparatif + Simulateur de Jeux */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Colonne Gauche : Comparatif & Piliers des Jeux */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#181512] bg-[#FFE600] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512]">
                    Conversion x3 garantie
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-black text-[#181512]" style={DISPLAY}>
                    En finir avec les jeux concours papier jetables.
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-bold text-[#181512]/75 leading-relaxed">
                    Les urnes et bulletins papier finissent à la poubelle sans être lus et ne génèrent aucun recontact. Avec LastChance, chaque partie enrichit automatiquement votre base de clients fidèles.
                  </p>

                  {/* Boîte comparaison visuelle */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-2.5">
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">
                        ❌ Jeux papier jetables
                      </span>
                      <div className="mt-1 text-xs font-black text-red-900">
                        Zéro recontact
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-red-700/80 leading-tight">
                        Bulletins illisibles, coût d&apos;impression récurrent et zéro data.
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-[#10B981] bg-[#ECFDF5] p-2.5 shadow-[0_2px_0_#10B981]">
                      <span className="text-[10px] font-black text-[#065F46] uppercase tracking-wider">
                        ✅ LastChance Instantané
                      </span>
                      <div className="mt-1 text-xs font-black text-[#047857]">
                        100 % digital &amp; qualifié
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-[#065F46]/90 leading-tight">
                        Données RGPD propres, retour en caisse immédiat et relances automatiques.
                      </p>
                    </div>
                  </div>

                  {/* 4 Piliers clés */}
                  <div className="mt-4 space-y-2.5 border-t border-[#181512]/15 pt-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FFE600] border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512]">
                        📲
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Accessibilité instantanée sans appli</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Un scan de QR code ouvre le jeu en moins d&apos;une seconde dans Safari ou Chrome.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#10B981] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        ⚙️
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Taux de gain et stocks 100% maîtrisés</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Ajustez vos probabilités, plafonnez les lots par jour et évitez toute rupture.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FF6B35] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        ⚡
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Scanner caisse en 1 seconde</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Vos serveurs et vendeurs valident les gains d&apos;un coup d&apos;œil sans ralentir la file.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#A855F7] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        📈
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Fichier clients qualifié et exportable</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Chaque partie peut collecter un email ou numéro SMS pour relancer vos clients en basse saison.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Boutons d'action */}
                <div className="mt-5 space-y-2 border-t border-[#181512]/15 pt-4">
                  <Link
                    href="/signup"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FF6B35] py-2.5 text-xs font-black text-white shadow-[0_2px_0_#181512] transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-[0_4px_0_#181512]"
                  >
                    <span>Créer ma première Roue 3D</span>
                    <span>→</span>
                  </Link>
                  <Link
                    href="/tarifs"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-white py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:bg-[#FFE600] hover:-translate-y-0.5"
                  >
                    <span>Consulter les tarifs (inclus dès la formule Coup d&apos;envoi)</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Colonne Droite : Simulateur de Jeux SimulatorGames */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <SimulatorGames />
              </div>
            </div>
          </div>
        </section>

        {/* Séparateur 3 : Damier Orange & Blanc */}
        <CheckerboardSeparator color="#FF6B35" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 4 — ESPACE COMMERÇANT & ESTIMATIF CA (FOND MOTIF : CARREAUX VICHY LILAS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection
          variant="gingham-purple"
          className="py-12 sm:py-16 text-[#181512]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                📊 Espace Commerçant &amp; Estimatif Chiffre d&apos;Affaires
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Pilotez vos jeux &amp; estimez vos gains en direct.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Suivez chaque joueur en temps réel depuis votre tableau de bord et simulez le chiffre d&apos;affaires additionnel généré par votre établissement.
              </p>
            </div>

            {/* Assemblage côte à côte Espace Commerçant + Estimatif Chiffre d'affaires */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Côté Gauche : Espace Commerçant & Pilotage */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512] shadow-[0_1.5px_0_#181512]">
                    Espace commerçant
                  </div>
                  <h3
                    className="mt-2.5 text-xl sm:text-2xl font-black leading-tight text-[#181512]"
                    style={DISPLAY}
                  >
                    Tout piloter depuis un seul écran.
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#181512]/75 font-bold">
                    Vous ajustez vos gains, visualisez le nombre de parties jouées et scannez les bons de retrait instantanément.
                  </p>

                  {/* Mockup Dashboard avec ombre franche */}
                  <div className="relative overflow-hidden rounded-xl border-2 border-[#181512] shadow-[0_3px_0_#181512] my-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/marketing/dashboard-mockup.jpg"
                      alt="Tableau de bord commerçant LastChance — analytics et retours en direct"
                      className="w-full object-cover max-h-[220px]"
                    />
                  </div>

                  {/* Checklist des fonctionnalités */}
                  <ul className="space-y-2">
                    {MERCHANT_POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-center gap-2.5 text-xs sm:text-[13px] font-black text-[#181512]"
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#181512] bg-[#10B981] text-white shadow-[0_1.5px_0_#181512]">
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6.2 5 8.5 9.5 3.5"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-[#181512]/15">
                  <Link
                    href="/signup"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-[#181512] bg-[#FF6B35] py-3 text-sm font-black text-white shadow-[0_4px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_#181512]"
                  >
                    Voir mon tableau de bord →
                  </Link>
                </div>
              </div>

              {/* Côté Droit : Estimatif Chiffre d'Affaires */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <TradeRoiSimulator />
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 4 : Damier Cyan & Blanc */}
        <CheckerboardSeparator color="#00E5FF" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 5 — CATALOGUE DES 15 MÉCANIQUES DE JEU (FOND COULEUR UNIE : MENTHE FRAÎCHE #D8F8E8)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative z-10 py-12 sm:py-16 bg-[#D8F8E8] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Catalogue Exclusif
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                15 mécaniques pour séduire tous les profils de clients
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Du jeu rapide en 15 secondes pour les pressés au défi convivial à table entre collègues ou amis.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {ALL_15_GAMES.map((game) => (
                <div
                  key={game.id}
                  className="flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-4 shadow-[0_4px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_6px_0_#181512]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{game.emoji}</span>
                      <span className="rounded-full border border-[#181512] bg-[#FFFBEB] px-2 py-0.5 text-[9px] font-black text-[#181512]">
                        {game.badge}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-black text-[#181512]" style={DISPLAY}>
                      {game.name}
                    </h3>
                    <p className="mt-1 text-[11px] leading-snug text-[#181512]/70 font-bold">
                      {game.desc}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#181512]/10 text-[10px] font-black text-k-orange">
                    {game.category}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Séparateur 5 : Damier Jaune Solaire & Blanc */}
        <CheckerboardSeparator color="#FFE600" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 6 — FAQ JEUX INSTANTANÉS (FOND MOTIF : NUAGES CARTOON BLEUS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection
          variant="clouds-blue"
          className="py-12 sm:py-16 text-[#181512]"
        >
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_3px_0_#181512]">
                Questions Fréquentes
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Tout sur les Jeux Instantanés
              </h2>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {GAMES_FAQ.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border-2 border-[#181512] bg-white shadow-[0_4px_0_#181512] transition-colors open:bg-[#FFFBEB]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-black text-[#181512] [&::-webkit-details-marker]:hidden">
                    <span className="leading-snug">{item.question}</span>
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[#181512] bg-[#FFE600] text-[#181512] font-black transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-4 text-sm leading-relaxed font-bold text-[#181512]/75">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 6 : Damier Orange & Blanc */}
        <CheckerboardSeparator color="#FF6B35" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 7 — BANNIÈRE FINALE ORANGE & FOOTER NOIR
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative bg-[#FF6B35] py-16 sm:py-24 text-white border-t-[3px] border-[#181512]">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-[clamp(2rem,4vw,3rem)] font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
              style={DISPLAY}
            >
              Lancez vos premiers jeux au QR code dès ce soir.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base sm:text-lg leading-relaxed text-white/90 font-bold">
              Créez votre compte en 2 minutes, activez vos 3 jeux préférés, imprimez vos affiches. 7 jours d&apos;essai offerts avec vos vrais clients.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-[#181512] bg-white px-9 py-4 text-base sm:text-lg font-black text-[#FF6B35] shadow-[0_6px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_0_#181512] active:translate-y-1"
                >
                  Démarrer mon essai gratuit →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="inline-flex items-center justify-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FFE600] px-7 py-3.5 text-base font-black text-[#181512] shadow-[0_4px_0_#181512] hover:-translate-y-0.5"
              >
                Consulter les tarifs
              </Link>
            </div>
          </div>
        </section>

        {/* Footer professionnel noir */}
        <footer className="bg-[#181512] py-12 text-white/65">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row sm:px-10">
            <span className="text-2xl font-black text-white" style={DISPLAY}>
              LastChance<span className="text-[#FF6B35]">.</span>
            </span>
            <nav
              aria-label="Pied de page"
              className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold"
            >
              <Link href="/jeux-instantanes" className="transition-colors hover:text-white">
                Jeux
              </Link>
              <Link href="/vitrine-reservation" className="transition-colors hover:text-white">
                Vitrine
              </Link>
              <Link href="/passeport-fidelite" className="transition-colors hover:text-white">
                Fidélité
              </Link>
              <Link href="/championnats-evenements" className="transition-colors hover:text-white">
                Événements
              </Link>
              <Link href="/tarifs" className="transition-colors hover:text-white">
                Tarifs
              </Link>
              <Link href="/faq" className="transition-colors hover:text-white">
                FAQ
              </Link>
              <Link href="/login" className="transition-colors hover:text-white">
                Connexion
              </Link>
            </nav>
            <span className="text-xs font-semibold">© {new Date().getFullYear()} LastChance</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
