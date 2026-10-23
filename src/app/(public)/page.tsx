import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
import { KermessePatternSection } from "@/components/marketing/kermesse-pattern-background";
import { KermesseWorldTransition } from "@/components/marketing/kermesse-world-transition";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { Magnetic } from "@/components/marketing/magnetic";
import { InteractiveGamesSimulator } from "@/components/marketing/interactive-games-simulator";
import { InteractiveModulesDeck } from "@/components/marketing/interactive-modules-deck";
import { VitrineBookingShowcase } from "@/components/marketing/vitrine-booking-showcase";
import { TradeRoiSimulator } from "@/components/marketing/trade-roi-simulator";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { PLAN_TIERS } from "@/lib/plans";
import { ScallopedDivider } from "@/components/marketing/scalloped-divider";
import { InteractiveScratchCard } from "@/components/marketing/interactive-scratch-card";
import { UseCasesByTrade } from "@/components/marketing/use-cases-by-trade";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";

/* ═══════════════════════════════════════════════════════════════
   TYPOGRAPHIE & STYLE NÉO-BRUTALISTE KERMESSE
   ═══════════════════════════════════════════════════════════════ */

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
  title: "Lastchance — Gamification & Fidélité au QR Code pour Commerces",
  description:
    "15 jeux instantanés, vitrine bilingue 0% commission, passeport fidélité Apple & Google Wallet et soirées pronostics live pour restaurants, bars et boutiques.",
};

/* ═══════════════════════════════════════════════════════════════
   DONNÉES STATIQUES DU SITE
   ═══════════════════════════════════════════════════════════════ */



const MERCHANT_POINTS = [
  "Campagnes et modules de jeu illimités",
  "Caisse universelle avec scanner 1 seconde",
  "Statistiques de passages et retours en temps réel",
  "Gestion totale des gains, stocks et probabilités",
  "Export des joueurs et emails qualifiés conforme RGPD",
  "10 modèles de campagne prêts à jouer en 1 clic",
];

const FAQ = [
  {
    question: "Combien de temps faut-il pour démarrer ?",
    answer:
      "Une dizaine de minutes : créez votre compte, choisissez l'un des 10 modèles prêts à jouer, imprimez l'affiche avec son QR code et posez-la en caisse. Vos clients peuvent jouer immédiatement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    answer:
      "Non. Le jeu s'ouvre directement dans le navigateur après le scan du QR code. Aucun téléchargement, aucun compte obligatoire. Le passeport fidélité s'enregistre en 1 clic dans Apple Wallet ou Google Wallet.",
  },
  {
    question: "Comment sont contrôlés les gains ?",
    answer:
      "C'est vous qui définissez les lots, leurs probabilités et leurs stocks. Le tirage est calculé et sécurisé sur nos serveurs et chaque gain génère un code unique que votre équipe valide avec le scanner de caisse.",
  },
  {
    question: "Est-ce conforme au RGPD et aux règles Google ?",
    answer:
      "Oui. Le consentement des joueurs est explicite, les données sont hébergées en Europe. Les gains ne sont JAMAIS conditionnés au dépôt d'un avis, ce qui protège votre fiche Google.",
  },
  {
    question: "Puis-je changer d'offre ou résilier quand je veux ?",
    answer:
      "Oui, absolument. Tous nos forfaits sont sans engagement de durée. Vous pouvez modifier votre formule ou résilier en un clic directement depuis votre espace commerçant, sans préavis.",
  },
];

/* ═══════════════════════════════════════════════════════════════
   BOUTONS NÉO-BRUTALISTES RÉUTILISABLES
   ═══════════════════════════════════════════════════════════════ */

function BtnPrimary({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  large?: boolean;
  className?: string;
}) {
  return (
    <Magnetic>
      <Link
        href={href}
        className={`inline-flex items-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FF6B35] px-7 py-3 text-sm font-black text-white shadow-[0_4px_0_#181512] transition-all hover:-translate-y-0.5 hover:bg-[#e05622] hover:shadow-[0_6px_0_#181512] active:translate-y-0.5 active:shadow-[0_2px_0_#181512] ${className}`}
      >
        {children}
      </Link>
    </Magnetic>
  );
}

function BtnOutline({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-full border-[2px] border-[#181512] bg-white px-6 py-3 text-sm font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:-translate-y-0.5 hover:bg-[#FFE600] hover:shadow-[0_4px_0_#181512] ${className}`}
    >
      {children}
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 1 — HERO PANORAMIQUE 4K (DÉCOR STRICTEMENT ISOLÉ AU HERO)
   ═══════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative flex min-h-[100dvh] flex-col justify-between overflow-hidden px-4 pt-20 text-center sm:px-6 sm:pt-24 bg-gradient-to-b from-[#FFFDF7] via-[#FFF9EE] to-[#FFF3E0]">
      <HeroCloudBackdrop />
      <HeroStickers />

      <div className="relative z-10 mx-auto max-w-4xl my-auto flex flex-col justify-center items-center py-6 sm:py-10">
        <div className="inline-flex items-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FFE600] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_3px_0_#181512]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B35] animate-ping" />
          🎪 La plateforme n°1 de gamification &amp; fidélité au QR code
        </div>

        <h1
          className="mt-4 text-[clamp(2.2rem,5vw,4.2rem)] font-black tracking-tight text-[#181512] leading-[1.04]"
          style={DISPLAY}
        >
          Faites jouer vos clients.{" "}
          <span className="inline-block -rotate-1 rounded-2xl border-[3.5px] border-[#181512] bg-[#fcca59] px-4 pb-1 text-[#181512] shadow-[0_6px_0_#181512]">
            Remplissez
          </span>{" "}
          votre commerce.
        </h1>

        <p className="mx-auto mt-3 max-w-2xl text-base sm:text-lg md:text-xl font-bold leading-relaxed text-[#181512]/85">
          Roue de la fortune en direct, passeport fidélité Apple &amp; Google Wallet et vitrine sans commission.
          Vos clients scannent et jouent en 30 secondes.
        </p>

        {/* Boutons d'action Kermesse physiques */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <BtnPrimary href="/signup" className="px-8 sm:px-10 py-4 text-base sm:text-lg">
            <span>Essayer gratuitement 7 jours</span>
            <span className="text-xl">→</span>
          </BtnPrimary>

          <BtnOutline href="#simulateur-jeux" className="px-7 py-4 text-base sm:text-lg">
            <span>🎲 Tester la Roue 3D</span>
          </BtnOutline>
        </div>

        {/* Pastilles de réassurance foraine */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs font-black text-[#181512]/75">
          <span className="flex items-center gap-1.5">
            <span className="text-[#10B981]">✓</span> 0 € de frais de mise en service
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[#10B981]">✓</span> Sans engagement &amp; sans appli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[#10B981]">✓</span> Validation caisse en 1 sec
          </span>
        </div>
      </div>

      {/* Bandeau d'informations clés foraines droit et net (sans déformation wavy) */}
      <div className="relative z-20 w-full mt-auto pb-0">
        <StraightRibbonTicker bgColor="bg-[#FFE600]" textColor="text-[#181512]" />
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════════
   BLOC 3 — LA GAMME LASTCHANCE (FOND COULEUR UNIE : JAUNE VANILLE SOLAIRE ÉCLATANT)
   ANIMÉ ET IMMERSIF AVEC DECK 3D ET CARTES EN LÉVITATION TILT
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   BLOC 4 — CONFIGURATEUR JEUX & PRONOSTICS (ASYMÉTRIQUE : TEXTE GAUCHE / SIMULATEUR DROITE)
   FOND MOTIF : ÉTOILES DORÉES KERMESSE SCINTILLANTES
   ═══════════════════════════════════════════════════════════════ */

function InteractiveGamesSection() {
  return (
    <KermessePatternSection
      variant="stars-yellow"
      id="simulateur-jeux"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      {/* Halo d'ambiance doré subtil et organique */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_55%_at_50%_45%,rgba(255,225,90,0.18),transparent_70%)]"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* MISE EN PAGE EN ZIGZAG : INTRO & CONTRÔLES À GAUCHE / SMARTPHONE & TEST À DROITE */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          {/* Côté GAUCHE (5 colonnes) : Titre asymétrique, pitch, arguments & CTA */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
              🎲 15 Jeux Instantanés &amp; Studio Live
            </div>

            <h2
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#181512] leading-[1.08]"
              style={DISPLAY}
            >
              Vos clients scannent.
              <br />
              <span className="inline-block -rotate-1 rounded-xl border-2 border-[#181512] bg-[#FF6B35] px-3 py-0.5 text-white shadow-[0_3px_0_#181512]">
                Ils jouent.
              </span>{" "}
              Ils reviennent.
            </h2>

            <p className="mt-3 text-sm sm:text-base font-bold text-[#181512]/80 leading-relaxed">
              Roue de la fortune, tickets à gratter, défi réflexe, machine à sous ou tournois de pronostics sportifs :
              le joueur tente sa chance immédiatement sur son smartphone sans télécharger d&apos;application ni créer de compte.
            </p>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-[#181512]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#181512] bg-[#10B981] text-white text-[10px]">✓</span>
                <span>Tirage serveur chiffré infalsifiable (aucun trucage possible)</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-[#181512]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#181512] bg-[#FFE600] text-[#181512] text-[10px]">✓</span>
                <span>98% des clients jouent en moins de 45 secondes</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-[#181512]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#181512] bg-[#FF5C93] text-white text-[10px]">✓</span>
                <span>1 scan en caisse = gain validé en 1 seconde chrono</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <BtnPrimary href="/signup">
                Essayer 7 jours offerts →
              </BtnPrimary>
              <BtnOutline href="/jeux-instantanes">
                Voir les 15 mécaniques
              </BtnOutline>
            </div>

            {/* Démo tactile immédiate : Le Ticket d'Or Forain */}
            <div className="mt-8 pt-6 border-t-2 border-dashed border-[#181512]/15">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#181512] bg-[#FFE600] text-xs font-black">★</span>
                <span className="text-xs font-black uppercase tracking-wider text-[#181512]" style={DISPLAY}>
                  Testez en direct le Ticket d&apos;Or :
                </span>
              </div>
              <InteractiveScratchCard />
            </div>
          </div>

          {/* Côté DROIT (7 colonnes) : Simulateur interactif directement intégré dans le décor */}
          <div className="lg:col-span-7">
            <InteractiveGamesSimulator />
          </div>
        </div>
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 5 — VITRINE & RÉSERVATION DIRECTE 0% (ASYMÉTRIQUE : DÉMO GAUCHE / TITRE DROITE)
   FOND COULEUR UNIE : MENTHE FRAÎCHE / LAGON KERMESSE POP
   ═══════════════════════════════════════════════════════════════ */

function VitrineReservationSection() {
  return (
    <KermessePatternSection
      variant="mint-lagoon"
      id="vitrine-reservation"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      {/* Halo d'ambiance menthe fraîche lagonaire douce */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_55%_at_50%_50%,rgba(16,185,129,0.13),transparent_70%)]"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* INVERSION DU ZIGZAG : DÉMO À GAUCHE / CONTENU & COMPARATIF À DROITE */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          {/* Côté GAUCHE (7 colonnes) : Démo interactive Vitrine & Réservation */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <VitrineBookingShowcase />
          </div>

          {/* Côté DROIT (5 colonnes) : Titre fort à droite, comparatif 0% et boutons */}
          <div className="lg:col-span-5 order-1 lg:order-2 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
              🍽️ Vitrine Vivante &amp; Réservation Directe 0%
            </div>

            <h2
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#181512] leading-[1.08]"
              style={DISPLAY}
            >
              En finir avec
              <br />
              <span className="inline-block -rotate-1 rounded-xl border-2 border-[#181512] bg-[#FF6B35] px-3 py-0.5 text-white shadow-[0_3px_0_#181512]">
                la taxe TheFork.
              </span>
            </h2>

            <p className="mt-3 text-sm sm:text-base font-bold text-[#181512]/80 leading-relaxed">
              Les centrales vous facturent 2 € à 3,50 € par couvert et gardent vos clients captifs.
              Avec LastChance, votre carte est consultable au QR code, les réservations arrivent en direct et 100% de votre marge reste chez vous.
            </p>

            {/* Boîte comparaison visuelle */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 text-left">
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 shadow-[0_2px_0_#ef4444]">
                <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">
                  ❌ Centrales tierces
                </span>
                <div className="mt-1 text-sm font-black text-red-900">
                  2,50 € / couvert
                </div>
                <p className="mt-0.5 text-[10px] font-bold text-red-700/80 leading-tight">
                  Commissions déduites de vos marges + clients captifs
                </p>
              </div>

              <div className="rounded-xl border-2 border-[#10B981] bg-white p-3 shadow-[0_3px_0_#10B981]">
                <span className="text-[10px] font-black text-[#065F46] uppercase tracking-wider">
                  ✅ LastChance Vitrine
                </span>
                <div className="mt-1 text-sm font-black text-[#047857]">
                  0 € de commission
                </div>
                <p className="mt-0.5 text-[10px] font-bold text-[#065F46]/90 leading-tight">
                  100% de marge conservée + clients dans votre fichier
                </p>
              </div>
            </div>

            {/* Piliers clés */}
            <div className="mt-5 space-y-2 border-t border-[#181512]/15 pt-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#181512]">
                <span className="text-[#10B981] font-black">✓</span>
                <span>Carte bilingue FR / EN modifiable en 30 secondes chrono</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#181512]">
                <span className="text-[#10B981] font-black">✓</span>
                <span>Réservations instantanées sans application à télécharger</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#181512]">
                <span className="text-[#10B981] font-black">✓</span>
                <span>Rappels automatiques e-mail / SMS pour diviser les no-shows</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <BtnPrimary href="/signup">
                Démarrer mon essai 7 jours →
              </BtnPrimary>
              <BtnOutline href="/vitrine-reservation">
                Découvrir la Vitrine
              </BtnOutline>
            </div>
          </div>
        </div>
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 5b — LES CAS D'USAGE PAR MÉTIER (EXPÉRIENCE GOURMANDE FESTONNÉE)
   FOND MOTIF : CRÈME SOLAIRE & POIS AMBRÉS KERMESSE
   ═══════════════════════════════════════════════════════════════ */

function TradesShowcaseSection() {
  return (
    <KermessePatternSection
      variant="confetti-multi"
      id="metiers"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
            🎯 Adapté à votre activité
          </div>
          <h2
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#181512]"
            style={DISPLAY}
          >
            Chaque commerce a sa mécanique gagnante.
          </h2>
          <p className="mt-2 text-sm sm:text-base font-bold text-[#181512]/75">
            Du café de quartier à la brasserie de 150 couverts, découvrez exactement comment vos confrères remplissent leur salle et fidélisent sans effort.
          </p>
        </div>

        <UseCasesByTrade />
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 6 — ESPACE COMMERÇANT & ESTIMATIF CHIFFRE D'AFFAIRES (ASYMÉTRIQUE : GAUCHE DASHBOARD / DROITE ROI)
   FOND MOTIF : CARREAUX VICHY / DAMIER KERMESSE LILAS
   ═══════════════════════════════════════════════════════════════ */

function MerchantSection() {
  return (
    <KermessePatternSection
      variant="gingham-purple"
      id="espace-commercant"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      {/* Halo d'ambiance lilas feutré du cockpit */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_55%_at_50%_50%,rgba(168,85,247,0.10),transparent_70%)]"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* INVERSION DU ZIGZAG : DASHBOARD PILOTAGE À GAUCHE / ESTIMATIF DU CA À DROITE */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          {/* Côté GAUCHE (5 colonnes) : Espace Commerçant & Pilotage */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
              📊 Espace Commerçant &amp; Pilotage
            </div>

            <h2
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#181512] leading-[1.08]"
              style={DISPLAY}
            >
              Tout piloter depuis
              <br />
              <span className="inline-block rotate-1 rounded-xl border-2 border-[#181512] bg-[#FFE600] px-3 py-0.5 text-[#181512] shadow-[0_3px_0_#181512]">
                un seul écran.
              </span>
            </h2>

            <p className="mt-3 text-sm sm:text-base font-bold text-[#181512]/80 leading-relaxed">
              Suivez qui revient, ce que chaque jeu vous rapporte, et ajustez vos campagnes en 1 clic.
              Vos données sont hébergées en Europe et exportables en un instant.
            </p>

            <div className="relative overflow-hidden rounded-2xl border-[2.5px] border-[#181512] bg-white shadow-[0_4px_0_#181512] my-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/dashboard-mockup.jpg"
                alt="Tableau de bord commerçant LastChance — analytics et retours en direct"
                className="w-full object-cover max-h-[200px]"
              />
            </div>

            <ul className="space-y-1.5">
              {MERCHANT_POINTS.slice(0, 4).map((point) => (
                <li key={point} className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#181512]">
                  <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-[#181512] bg-[#10B981] text-white text-[9px] font-black">✓</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <BtnPrimary href="/signup" className="w-full justify-center">
                Créer mon compte commerçant →
              </BtnPrimary>
            </div>
          </div>

          {/* Côté DROIT (7 colonnes) : Estimatif Chiffre d'Affaires & Simulateur */}
          <div className="lg:col-span-7">
            <TradeRoiSimulator />
          </div>
        </div>
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 7 — TARIFS (5 FORMULES DÉTAILLÉES)
   FOND COULEUR UNIE : PÊCHE / CRÈME DOUCEUR SOLAIRE
   ═══════════════════════════════════════════════════════════════ */

const PLAN_DETAILS_EXTENDED: Record<
  string,
  {
    includedNotice?: string;
    features: string[];
  }
> = {
  core: {
    features: [
      "15 jeux au QR code (Roue, grattage, machine à sous...)",
      "Affiches A4 et QR codes prêts à poser illimités",
      "Duo Miroir & Portrait de la Bande à table",
      "Scanner caisse universel (validation en 1 sec)",
      "Émission de Tickets d'Or personnalisés en caisse",
      "4 scénarios d'e-mails automatiques (retrait, relance)",
    ],
  },
  engagement: {
    includedNotice: "Tout Coup d'envoi inclus +",
    features: [
      "Passeport Fidélité Apple & Google Wallet",
      "Calendrier à surprises quotidiennes (7 à 24j)",
      "Module de Parrainage & Recommandation client",
      "Chasses aux trésors QR en rayon / boutique",
      "Quiz du Commerçant personnalisés",
      "Fichier clients qualifié et exportable CSV",
    ],
  },
  place: {
    includedNotice: "Tout Coup d'envoi inclus +",
    features: [
      "Vitrine interactive & Carte bilingue FR/EN",
      "Réservation directe de table (0€ commission)",
      "Prise de Rendez-vous en ligne avec agenda",
      "Photos HD, allergènes et suggestions du chef",
      "Porte Quiz intégrée directement à la carte",
      "Rappels automatiques par e-mail et SMS",
    ],
  },
  live: {
    includedNotice: "Tout Coup d'envoi inclus +",
    features: [
      "Championnats de pronostics sportifs (L1, C1...)",
      "Soirées Live & animation sur grand écran",
      "Télécommande organisateur en direct sur mobile",
      "Jusqu'à 250 joueurs simultanés en salle",
      "Jackpot collectif en temps réel",
      "100% de revisite physique en établissement",
    ],
  },
  full: {
    includedNotice: "Toute la plateforme LastChance",
    features: [
      "Le Club + Sur Place + Le Grand Jeu réunis",
      "14 modules métiers & 15 mécaniques illimités",
      "Passeport Fidélité Wallet + Carte Vitrine + Résa 0%",
      "Pronostics sportifs & Soirées live 250 pers.",
      "Accès immédiat à tout nouveau module inclus",
      "Support prioritaire dédié 7j/7",
    ],
  },
};

function Pricing() {
  return (
    <KermessePatternSection
      variant="stripes-orange"
      id="tarifs"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      {/* Halo d'ambiance pêche solaire chaleureuse */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_55%_at_50%_50%,rgba(255,107,53,0.10),transparent_70%)]"
      />
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        {/* En-tête asymétrique */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#fcca59] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
              5 formules claires
            </div>
            <h2
              className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-[#181512]"
              style={DISPLAY}
            >
              Toutes nos offres, sans engagement.
            </h2>
            <p className="mt-1 text-sm font-bold text-[#181512]/70">
              Choisissez la formule qui colle à vos priorités. Évoluez ou résiliez en 1 clic.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border-2 border-[#181512] bg-white px-4 py-2.5 shadow-[0_3px_0_#181512]">
            <span className="text-xl">🎁</span>
            <div className="text-xs font-black text-[#181512] leading-tight">
              <span>7 jours d&apos;essai offerts</span>
              <span className="block text-[10px] text-[#181512]/60 font-bold">Sans carte bancaire</span>
            </div>
          </div>
        </div>

        {/* 5 Formules sur UNE SEULE LIGNE en desktop */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 items-stretch">
          {PLAN_TIERS.map((tier) => {
            const isPopular = tier.id === "place";
            const details = PLAN_DETAILS_EXTENDED[tier.id] ?? { features: tier.highlights };

            return (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between rounded-3xl border-[3px] border-[#181512] p-4.5 sm:p-5 transition-all ${
                  isPopular
                    ? "bg-[#FFFBEB] shadow-[0_8px_0_#FF6B35] ring-2 ring-[#FF6B35]/40"
                    : "bg-white shadow-[0_5px_0_#181512] hover:-translate-y-1 hover:shadow-[0_8px_0_#181512]"
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#181512] bg-[#FF6B35] px-3 py-0.5 text-[11px] font-black text-white shadow-[0_2px_0_#181512]">
                    ★ Le plus populaire
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-black text-[#181512]" style={DISPLAY}>
                    {tier.name}
                  </h3>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[#181512]" style={DISPLAY}>
                      {tier.priceMonthly}€
                    </span>
                    <span className="text-xs font-bold text-[#181512]/60">/ mois</span>
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed font-bold text-[#181512]/70 min-h-[34px]">
                    {tier.tagline}
                  </p>

                  <div className="my-3 border-t-2 border-[#181512]/10" />

                  {details.includedNotice && (
                    <div className="mb-2 rounded-lg bg-[#fcca59]/30 border border-[#181512]/20 px-2 py-0.5 text-[10px] font-black text-[#181512]">
                      ⚡ {details.includedNotice}
                    </div>
                  )}

                  <ul className="space-y-1.5 text-left">
                    {details.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5 text-[11px] font-bold text-[#181512] leading-snug">
                        <span className="mt-0.5 text-xs font-black text-[#10B981] shrink-0">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-2">
                  <Link
                    href="/signup"
                    className={`block w-full rounded-full border-2 border-[#181512] py-2 text-center text-xs font-black transition-all ${
                      isPopular
                        ? "bg-[#FF6B35] text-white shadow-[0_3px_0_#181512] hover:bg-orange-600"
                        : "bg-white text-[#181512] shadow-[0_2px_0_#181512] hover:bg-[#fcca59]"
                    }`}
                  >
                    Tester 7j offerts
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/tarifs"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-5 py-2.5 text-xs sm:text-sm font-black text-[#181512] shadow-[0_3px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_0_#181512] hover:bg-[#FF6B35] hover:text-white"
          >
            <span>Consulter le comparatif détaillé des 5 offres</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 8 — FAQ (ASYMÉTRIQUE : GAUCHE TITRE / DROITE QUESTIONS)
   FOND MOTIF : PETITS NUAGES CARTOON BLEUS DESSINÉS
   ═══════════════════════════════════════════════════════════════ */

function Faq() {
  return (
    <KermessePatternSection
      variant="clouds-blue"
      id="faq"
      className="py-16 sm:py-24 text-[#181512] overflow-hidden"
    >
      {/* Halo d'ambiance ciel d'été azur douce */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_55%_at_50%_50%,rgba(14,165,233,0.10),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Côté GAUCHE (4 colonnes) : Titre & assistance */}
          <div className="lg:col-span-4 flex flex-col justify-start">
            <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
              Questions fréquentes
            </div>

            <h2
              className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#181512] leading-[1.1]"
              style={DISPLAY}
            >
              Tout ce que vous voulez savoir.
            </h2>

            <p className="mt-2 text-sm font-bold text-[#181512]/75">
              Mise en place en 10 minutes, conformité RGPD, règles Google, caisse universelle :
              toutes les réponses pour démarrer sereinement.
            </p>

            <div className="mt-6 rounded-2xl border-2 border-[#181512] bg-white p-4 shadow-[0_3px_0_#181512]">
              <p className="text-xs font-black text-[#181512]">Une question spécifique ?</p>
              <p className="mt-1 text-[11px] font-bold text-[#181512]/70">
                Notre équipe vous aide à choisir la meilleure mécanique pour votre établissement.
              </p>
              <Link
                href="/faq"
                className="mt-3 inline-block rounded-full border-2 border-[#181512] bg-[#FFE600] px-4 py-1.5 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] hover:bg-[#ffd700]"
              >
                Accéder à la FAQ complète →
              </Link>
            </div>
          </div>

          {/* Côté DROIT (8 colonnes) : Questions accordéons */}
          <div className="lg:col-span-8 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border-2 border-[#181512] bg-white shadow-[0_3px_0_#181512] transition-colors open:bg-[#FFFBEB]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-black text-[#181512] [&::-webkit-details-marker]:hidden">
                  <span className="leading-snug">{item.question}</span>
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[#181512] bg-[#FFE600] text-[#181512] font-black transition-transform duration-300 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 text-xs sm:text-sm leading-relaxed font-bold text-[#181512]/75 border-t border-[#181512]/10 pt-2.5">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </KermessePatternSection>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOC 9 — CTA FINAL ORANGE POP & FOOTER NOIR
   ═══════════════════════════════════════════════════════════════ */

function FinalCtaFooter() {
  return (
    <>
      <section className="relative z-10 bg-[#FF6B35] py-14 sm:py-20 text-white border-t-[3px] border-[#181512]">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2
            className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
            style={DISPLAY}
          >
            Votre commerce en jeu dès ce soir.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-white/95 font-bold">
            Créez votre compte en 2 minutes, activez vos mécaniques préférées, imprimez votre affiche.
            7 jours d&apos;essai offerts avec vos vrais clients.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Magnetic>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-[#181512] bg-white px-8 py-3.5 text-base font-black text-[#FF6B35] shadow-[0_5px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_7px_0_#181512] active:translate-y-0.5 active:shadow-[0_2px_0_#181512]"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
          </div>
          <p className="mt-3 text-[11px] font-bold text-white/80">
            ✓ 0 € de frais de mise en service · Sans carte bancaire requise · Annulation en 1 clic
          </p>
        </div>
      </section>

      <footer className="relative z-10 bg-[#181512] py-10 text-white/65">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
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
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE — Assemblage final avec alternance rigoureuse 1 sur 2
   (Formes / Nuages Hero ↔ Couleurs Unies Gourmandes)
   ═══════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex min-h-screen flex-1 flex-col overflow-x-clip bg-[#FFFDF9] text-[#181512]`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* 1. HERO DANS LES NUAGES */}
        <Hero />

        {/* Vague de nuages festonnés vers les modules */}
        <ScallopedDivider fillColor="#FFF8D6" height={48} variant="clouds" />

        {/* 2. LES 4 MODULES DE JEU — PLEINE LARGEUR PANORAMIQUE */}
        <InteractiveModulesDeck />

        {/* Transition fluide continue vers les 15 Jeux */}
        <ScallopedDivider fillColor="#FFF385" height={56} />

        {/* 3. SIMULATEUR JEUX & PRONOSTICS + TICKET D'OR INTERACTIF */}
        <InteractiveGamesSection />

        {/* Transition fluide continue vers la Vitrine */}
        <ScallopedDivider fillColor="#BFF0D4" height={56} />

        {/* 4. VITRINE & RÉSERVATION DIRECTE 0% */}
        <VitrineReservationSection />

        {/* Transition fluide continue vers les Métiers */}
        <ScallopedDivider fillColor="#FEF08A" height={56} />

        {/* 5. LES CAS D'USAGE PAR MÉTIER (RESTAURANT, BAR, BOUTIQUE, BOULANGERIE, BEAUTÉ) */}
        <TradesShowcaseSection />

        {/* Transition fluide continue vers le Cockpit */}
        <ScallopedDivider fillColor="#EBDCFF" height={56} />

        {/* 6. ESPACE COMMERÇANT & ESTIMATIF CHIFFRE D'AFFAIRES */}
        <MerchantSection />

        {/* Transition fluide continue vers la Billetterie */}
        <ScallopedDivider fillColor="#FED7AA" height={56} />

        {/* 7. TARIFS — 5 FORMULES SUR UNE SEULE LIGNE */}
        <Pricing />

        {/* Transition fluide continue vers la FAQ */}
        <ScallopedDivider fillColor="#BAE6FD" height={56} />

        {/* 8. FAQ */}
        <Faq />

        {/* Séparateur Damier Racing Kermesse avant le CTA Final */}
        <div className="relative z-20 w-full overflow-hidden my-2">
          <CheckerboardSeparator variant="orange" height={52} />
        </div>

        {/* 9. CTA FINAL APLAT ORANGE POP + FOOTER NOIR */}
        <FinalCtaFooter />
      </main>
    </div>
  );
}
