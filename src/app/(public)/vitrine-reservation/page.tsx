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
import { VitrineBookingShowcase } from "@/components/marketing/vitrine-booking-showcase";
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
  title: "Vitrine bilingue & Réservation de table sans commission · Lastchance",
  description:
    "Votre carte vivante au QR code en français et anglais automatique, et votre module de réservation sans intermédiaire ni commission par couvert.",
};

const STEPS = [
  {
    n: 1,
    title: "Posez votre QR code sur vos tables ou en vitrine",
    description: "Vos convives scannent instantanément avec leur smartphone sans rien installer. Votre affiche A4 personnalisée est générée en 1 clic.",
    icon: "📲",
    accent: "bg-[#FFE600] text-[#181512]",
  },
  {
    n: 2,
    title: "Ils consultent la carte et réservent en 30s",
    description: "Photos HD alléchantes, allergènes clairs, traduction automatique français / anglais et réservation de table directe sans intermédiaire.",
    icon: "🍽️",
    accent: "bg-[#FF6B35] text-white",
  },
  {
    n: 3,
    title: "Vous encaissez 100% de votre marge",
    description: "Zéro euro de commission par couvert prélevé par une centrale. Le client réserve en direct et ses coordonnées enrichissent votre fichier.",
    icon: "💰",
    accent: "bg-[#10B981] text-white",
  },
];

const MERCHANT_POINTS = [
  "Fichier clients qualifié (emails, téléphones) conforme RGPD",
  "Statistiques en direct : scans de la carte, réservations, revisites",
  "Gestion des créneaux (midi / soir) et des disponibilités en 1 clic",
  "Alertes automatiques : rappels anti-no-show par SMS et e-mail",
];

const VITRINE_FEATURES = [
  {
    emoji: "🇫🇷",
    badge: "Bilingue automatique",
    title: "Français & Anglais en un clic",
    desc: "Accueillez touristes et clientèle internationale sans friction. La carte bascule instantanément en anglais avec traductions adaptées. Zéro réimpression de cartes.",
  },
  {
    emoji: "💰",
    badge: "100% de marge conservée",
    title: "0 € de commission par couvert",
    desc: "Ne laissez plus 2 € à 3,50 € s'envoler chez TheFork ou d'autres centrales. Vos convives réservent directement depuis vos tables, vitrines ou réseaux sociaux.",
  },
  {
    emoji: "🎡",
    badge: "Waitlist intelligente",
    title: "Roue d'attente & liste mobile",
    desc: "Votre salle est complète ? Vos clients s'inscrivent sur la file d'attente mobile et tournent la roue pour tenter de gagner un café ou l'apéritif pendant qu'une table se libère.",
  },
  {
    emoji: "📲",
    badge: "Temps réel",
    title: "Modifications directes sans réimprimer",
    desc: "Un plat du jour épuisé ? Un arrivage du matin ? Masquez ou ajoutez un plat en 30 secondes depuis votre smartphone. Vos QR codes sur table restent toujours à jour.",
  },
];

const VITRINE_FAQ = [
  {
    question: "Combien d'économies puis-je espérer par rapport à TheFork ou ZenChef ?",
    answer:
      "Sur une base de 400 couverts réservés par mois, une centrale tierce prélevant 2,50 € par couvert vous coûte 1 000 € HT chaque mois. Avec LastChance, vous conservez 100 % de votre marge pour un abonnement fixe sans aucun surcoût au couvert.",
  },
  {
    question: "Comment lutter efficacement contre les no-shows ?",
    answer:
      "Chaque réservation déclenche automatiquement une confirmation par email et un SMS de rappel quelques heures avant le service avec un lien de confirmation ou d'annulation en un clic. Nos établissements constatent une division par 4 des tables non honorées.",
  },
  {
    question: "Dois-je traduire moi-même l'intégralité de mes menus en anglais ?",
    answer:
      "Non, notre intelligence culinaire traduit automatiquement vos intitulés, descriptions et allergènes dans un anglais naturel et soigné adapté à la restauration.",
  },
  {
    question: "Mes clients peuvent-ils jouer aux jeux pendant qu'ils attendent leur commande ?",
    answer:
      "Absolument ! La carte vitrine intègre un accès optionnel au Porte Quiz et aux mini-jeux pour divertir les convives à table pendant la préparation des plats.",
  },
];

export default function VitrineReservationPage() {
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
            <div className="inline-flex items-center gap-2 self-center rounded-full border-[2.5px] border-[#181512] bg-[#fcca59] px-4 py-1.5 text-xs font-black text-[#181512] shadow-[0_3px_0_#181512]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#FF6B35] animate-pulse" />
              Module Pilier #2 · Vitrine Vivante &amp; Réservation 0%
            </div>

            <h1
              className="relative z-[2] mx-auto mt-4 max-w-4xl text-[clamp(2.3rem,5.5vw,4.2rem)] font-black leading-[1.08] text-[#181512]"
              style={DISPLAY}
            >
              Votre carte vivante au QR code et vos{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-[#181512] bg-[#FFE600] px-4 pb-1 text-[#181512] shadow-[0_5px_0_#181512]">
                réservations
              </span>{" "}
              sans commission.
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg font-bold leading-relaxed text-[#181512]/80">
              Carte digitale bilingue instantanée, zéro commission par couvert et encaissement direct.
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
                3 étapes simples pour reprendre la main sur vos réservations
              </h2>
              <p className="mx-auto mt-1.5 max-w-lg text-sm sm:text-base font-bold text-[#181512]/70">
                De la consultation de la carte jusqu&apos;à l&apos;encaissement à table.
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
                <span>💰</span> 0 € de commission : 100% de marge nette préservée sur chaque couvert.
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 2 : Damier Ambre & Blanc */}
        <CheckerboardSeparator color="#F59E0B" height={48} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 3 — GRAND BLOC DÉMO VITRINE & RÉSERVATION (FOND COULEUR UNIE : MENTHE FRAÎCHE #D8F8E8)
           ═══════════════════════════════════════════════════════════════ */}
        <section id="simulateur" className="relative z-10 py-12 sm:py-16 bg-[#D8F8E8] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#fcca59] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                🍽️ Vitrine Vivante &amp; Réservation Directe 0%
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Votre carte digitale bilingue &amp; réservations sans intermédiaire.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Présentez vos spécialités en photo haute définition, informez sur les allergènes, et encaissez 100% de votre marge : 0€ de commission par couvert, 0 abonnement caché.
              </p>
            </div>

            {/* Grille pleine largeur : Colonne Avantages/Comparatif + Colonne Démo Interactive */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Côté Gauche : Comparatif & Piliers de la Vitrine */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#181512] bg-[#FFE600] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512]">
                    Alternative 100% rentable
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-black text-[#181512]" style={DISPLAY}>
                    En finir avec la taxe TheFork.
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-bold text-[#181512]/75 leading-relaxed">
                    Les centrales de réservation vous facturent entre 2 € et 3,50 € par couvert et gardent votre fichier client. Avec LastChance, chaque client vous appartient.
                  </p>

                  {/* Boîte comparaison visuelle */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-2.5">
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">
                        ❌ Plateformes tierces
                      </span>
                      <div className="mt-1 text-xs font-black text-red-900">
                        2,50 € / couvert
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-red-700/80 leading-tight">
                        Commissions déduites de vos marges + clients captifs
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-[#10B981] bg-[#ECFDF5] p-2.5 shadow-[0_2px_0_#10B981]">
                      <span className="text-[10px] font-black text-[#065F46] uppercase tracking-wider">
                        ✅ LastChance Vitrine
                      </span>
                      <div className="mt-1 text-xs font-black text-[#047857]">
                        0 € de commission
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-[#065F46]/90 leading-tight">
                        100% de votre marge conservée + clients dans votre fichier
                      </p>
                    </div>
                  </div>

                  {/* 4 Piliers clés */}
                  <div className="mt-4 space-y-2.5 border-t border-[#181512]/15 pt-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FFE600] border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512]">
                        📖
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Carte bilingue FR / EN modifiable en 30s</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Photos alléchantes, allergènes clairs et suggestions du chef sans réimprimer vos menus.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#10B981] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        ⚡
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Réservation directe instantanée</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Vos convives choisissent date, heure et couverts en 3 clics, sans installer d&apos;application.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FF6B35] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        📲
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Rappels automatiques anti-no-show</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          SMS et e-mails de confirmation envoyés automatiquement pour diviser par 4 les tables vides.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#A855F7] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        🎲
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Porte Quiz &amp; Jeux intégrés à table</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Vos convives patientent avec le sourire grâce aux quiz personnalisés sur votre établissement.
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
                    <span>Activer ma Vitrine &amp; Réservation</span>
                    <span>→</span>
                  </Link>
                  <Link
                    href="/tarifs"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-white py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:bg-[#FFE600] hover:-translate-y-0.5"
                  >
                    <span>Consulter les tarifs (inclus dès la formule Sur Place)</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Côté Droit : Démo interactive Vitrine & Réservation */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <VitrineBookingShowcase />
              </div>
            </div>
          </div>
        </section>

        {/* Séparateur 3 : Damier Jaune Solaire */}
        <CheckerboardSeparator variant="amber" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 4 — ESPACE COMMERÇANT & ESTIMATIF CA (FOND MOTIF KERMESSE : ÉTOILES DORÉES)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="stars-yellow" className="py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                📊 Espace Commerçant &amp; Estimatif Chiffre d&apos;Affaires
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Pilotez votre commerce &amp; estimez vos gains en direct.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Suivez les réservations en temps réel depuis votre tableau de bord et simulez le chiffre d&apos;affaires additionnel généré par votre établissement.
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
                    Vous gérez vos services, validez les réservations, visualisez vos données clients et ajustez votre carte en 1 clic.
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

        {/* Séparateur 4 : Damier Orange Pop */}
        <CheckerboardSeparator variant="orange" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 5 — LES 4 ATOUTS MAJEURS DE LA CARTE DIGITALE (FOND COULEUR UNIE : JAUNE VANILLE SOLAIRE)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative py-10 sm:py-14 bg-[#FFF8D6] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Fonctionnalités Clés
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Une solution pensée pour le quotidien de votre salle
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Des outils simples, robustes et sans intermédiaire pour maximiser le remplissage de vos tables et la fidélisation.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {VITRINE_FEATURES.map((feat) => (
                <div
                  key={feat.title}
                  className="flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 shadow-[0_4px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_6px_0_#181512]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{feat.emoji}</span>
                      <span className="rounded-full border border-[#181512] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-black text-[#181512]">
                        {feat.badge}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-black text-[#181512]" style={DISPLAY}>
                      {feat.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#181512]/70 font-bold">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Séparateur 5 : Damier Bleu Ciel */}
        <CheckerboardSeparator variant="blue" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 6 — FAQ VITRINE & RÉSERVATION (FOND MOTIF KERMESSE : NUAGES BLEUS DESSINÉS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="clouds-blue" className="py-10 sm:py-14">
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_3px_0_#181512]">
                Questions Fréquentes
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Tout sur la Vitrine &amp; Réservation 0%
              </h2>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {VITRINE_FAQ.map((item) => (
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

        {/* Séparateur 6 : Damier Rose Pop */}
        <CheckerboardSeparator variant="pink" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 7 — BANNIÈRE FINALE ORANGE & FOOTER NOIR
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative bg-[#FF6B35] py-16 sm:py-24 text-white border-t-[3px] border-[#181512]">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-[clamp(2rem,4vw,3rem)] font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
              style={DISPLAY}
            >
              Votre carte et vos réservations en direct dès ce soir.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base sm:text-lg leading-relaxed text-white/90 font-bold">
              Créez votre compte en 2 minutes, téléchargez vos photos de plats, activez vos créneaux. 7 jours d&apos;essai offerts avec vos vrais clients.
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
