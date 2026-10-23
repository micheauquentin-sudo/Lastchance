import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";
import { EventAnimationsShowcase } from "@/components/marketing/event-animations-showcase";
import { KermessePatternSection } from "@/components/marketing/kermesse-pattern-background";
import { Magnetic } from "@/components/marketing/magnetic";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
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
  title: "Championnats de Pronostics & Événements en Direct · Lastchance",
  description:
    "Faites jouer vos clients chaque semaine sur smartphone depuis chez eux ou en salle pour générer 100% de revisite en boutique et remplir votre établissement.",
};

const STEPS = [
  {
    n: 1,
    title: "Le client joue à distance ou en salle",
    description: "Depuis son canapé ou votre comptoir, il pronostique sur les matchs du week-end ou participe au défi du jour en 30 secondes sans appli.",
    icon: "📲",
    accent: "bg-[#00E5FF] text-[#181512]",
  },
  {
    n: 2,
    title: "Le classement s'actualise en direct",
    description: "Les points se calculent automatiquement. Vos clients suivent leur position et se challengent entre amis ou habitués pour décrocher le lot.",
    icon: "🏆",
    accent: "bg-[#FFE600] text-[#181512]",
  },
  {
    n: 3,
    title: "Le gagnant vient consommer en boutique",
    description: "Pour retirer son lot offert par votre maison (burger, planche, bon d'achat), il passe obligatoirement chez vous avec son bon QR sécurisé.",
    icon: "💰",
    accent: "bg-[#10B981] text-white",
  },
];

const MERCHANT_POINTS = [
  "Programmation automatique des matchs de Ligue 1, Top 14 et grands tournois",
  "Remise des lots sécurisée au scanner caisse (QR code unique anti-fraude)",
  "Diffusion en direct sur grand écran ou TV de votre établissement",
  "Collecte de numéros et e-mails qualifiés conforme RGPD à chaque participation",
];

const EVENT_FORMATS = [
  {
    emoji: "⚽",
    badge: "Rituel Hebdomadaire",
    title: "Championnat de Pronostics",
    desc: "Un rendez-vous régulier qui crée une communauté d'habitués. Vos clients jouent chaque semaine à distance et viennent consommer leur récompense en magasin le week-end.",
  },
  {
    emoji: "📅",
    badge: "Compte à Rebours 7-24j",
    title: "Calendrier à Surprises",
    desc: "Idéal pour Noël, Pâques ou l'anniversaire de votre établissement. Une case à ouvrir chaque matin pour débloquer une offre éclair valable sous 24 à 48 heures.",
  },
  {
    emoji: "🧠",
    badge: "Ambiance en Salle",
    title: "Quiz Commerçant & Blind Tests",
    desc: "Questions personnalisées sur vos spécialités, anecdotes locales ou thèmes festifs. Les clients jouent en solo ou par équipes pour des tables qui consomment plus longtemps.",
  },
  {
    emoji: "🗺️",
    badge: "Parcours Physique",
    title: "Chasse aux QR & Trésors",
    desc: "Dissé鉱inez des QR balises dans vos rayons ou chez des commerces partenaires. Les visiteurs résolvent les énigmes jusqu'au coffre final à déverrouiller en caisse.",
  },
];

const EVENT_FAQ = [
  {
    question: "Dois-je saisir manuellement les matchs et calculer les scores ?",
    answer:
      "Non, tout est 100 % automatisé ! La plateforme charge les calendriers officiels (Ligue 1, Ligue des Champions, Top 14...), met à jour les scores à la fin des rencontres et génère le classement des participants sans aucune intervention de votre part.",
  },
  {
    question: "Comment le vainqueur retire-t-il son lot ?",
    answer:
      "Le gagnant reçoit un bon numérique sécurisé sur son smartphone muni d'un QR code à usage unique. Il se présente dans votre établissement et votre équipe valide le bon en une seconde avec le scanner caisse LastChance.",
  },
  {
    question: "Puis-je afficher le classement sur la télévision de mon restaurant/bar ?",
    answer:
      "Oui ! Un mode 'Grand Écran' est intégré. Il vous suffit d'ouvrir l'URL grand écran sur une Smart TV ou un projecteur pour afficher les classements en temps réel et stimuler l'ambiance lors des soirées de match.",
  },
  {
    question: "Mes clients doivent-ils télécharger une application ?",
    answer:
      "Jamais. Tous les modules (pronostics, calendrier, quiz, chasse au trésor) s'exécutent directement dans le navigateur mobile en scannant le QR code ou en cliquant sur le lien partagé sur vos réseaux sociaux.",
  },
];

export default function ChampionnatsEvenementsPage() {
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
            <div className="inline-flex items-center gap-2 self-center rounded-full border-[2.5px] border-[#181512] bg-[#00E5FF] px-4 py-1.5 text-xs font-black text-[#181512] shadow-[0_3px_0_#181512]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#10B981] animate-pulse" />
              Module Pilier #4 · Championnats &amp; Événements en Direct
            </div>

            <h1
              className="relative z-[2] mx-auto mt-4 max-w-4xl text-[clamp(2.3rem,5.5vw,4.2rem)] font-black leading-[1.08] text-[#181512]"
              style={DISPLAY}
            >
              Faites jouer vos clients chaque semaine… pour les{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-[#181512] bg-[#FFE600] px-4 pb-1 text-[#181512] shadow-[0_5px_0_#181512]">
                faire revenir
              </span>{" "}
              chez vous.
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg font-bold leading-relaxed text-[#181512]/80">
              Pronostics, calendriers surprises et quiz en direct : générez 100% de revisite physique pour retirer les lots.
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
           BLOC 2 — COMMENT ÇA MARCHE (FOND MOTIF KERMESSE : ÉTOILES DORÉES)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="stars-yellow" className="py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Comment ça marche
              </div>
              <h2
                className="mt-3 text-[clamp(1.6rem,3.2vw,2.5rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                3 étapes pour transformer vos soirées et vos semaines
              </h2>
              <p className="mx-auto mt-1.5 max-w-lg text-sm sm:text-base font-bold text-[#181512]/70">
                Du pronostic sur canapé jusqu&apos;à l&apos;encaissement du lot au comptoir.
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
                    className="mt-2 text-4xl font-black text-[#181512]/15 transition-colors group-hover:text-[#3B82F6]/30"
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
                <span>🏆</span> 100% des vainqueurs reviennent consommer leur lot dans votre établissement.
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 2 : Damier Menthe Émeraude */}
        <CheckerboardSeparator variant="teal" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 3 — GRAND BLOC DÉMO & SIMULATEURS D'ÉVÉNEMENTS (FOND COULEUR UNIE : LAGON MENTHE POP)
           ═══════════════════════════════════════════════════════════════ */}
        <section id="simulateurs" className="relative py-10 sm:py-14 bg-[#D8F8E8] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#00E5FF] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                ⚡ Simulateurs Interactifs en Direct
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Choisissez votre animation et testez l&apos;expérience joueur
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Pronostiquez le score de votre équipe favorite, ouvrez une case du calendrier ou buzzes sur le quiz. Tout fonctionne en direct sans rien installer.
              </p>
            </div>

            {/* Grille pleine largeur : Colonne Comparatif/Piliers + Composant EventAnimationsShowcase */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Colonne Gauche : Comparatif & Piliers */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#181512] bg-[#FFE600] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512]">
                    Fidélisation récurrente
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-black text-[#181512]" style={DISPLAY}>
                    En finir avec les soirées vides et les affiches papier.
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-bold text-[#181512]/75 leading-relaxed">
                    Les affiches papier et concours Facebook classiques ne captent aucune donnée et n&apos;obligent personne à franchir votre porte. Avec nos championnats hebdomadaires, le retour en caisse est garanti à 100%.
                  </p>

                  {/* Boîte comparaison visuelle */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-2.5">
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">
                        ❌ Animation classique
                      </span>
                      <div className="mt-1 text-xs font-black text-red-900">
                        Zéro revisite garantie
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-red-700/80 leading-tight">
                        Concours ponctuels, zéro fichier client qualifié, retombées incertaines.
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-[#10B981] bg-[#ECFDF5] p-2.5 shadow-[0_2px_0_#10B981]">
                      <span className="text-[10px] font-black text-[#065F46] uppercase tracking-wider">
                        ✅ LastChance Événements
                      </span>
                      <div className="mt-1 text-xs font-black text-[#047857]">
                        100 % de revisite en caisse
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-[#065F46]/90 leading-tight">
                        Rituels hebdos, bons sécurisés à consommer sur place, fichier qualifié.
                      </p>
                    </div>
                  </div>

                  {/* 4 Piliers clés */}
                  <div className="mt-4 space-y-2.5 border-t border-[#181512]/15 pt-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#00E5FF] border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512]">
                        ⚽
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Championnats de Pronostics Ligue 1 &amp; Top 14</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Vos clients pronostiquent chaque semaine sur mobile. Décompte automatique des points.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FF5C93] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        📅
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Calendriers à Surprises Festifs (7 à 24j)</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Une case quotidienne à ouvrir en ligne avec un cadeau express à retirer sous 24 à 48h.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FFE600] border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512]">
                        🧠
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Quiz &amp; Blind Tests d&apos;Ambiance</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Animez vos tables et faites patienter vos clients avec le buzzer et vos anecdotes maison.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#10B981] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        🗺️
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Chasses aux QR Codes &amp; Coffres au Trésor</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Faites explorer tous vos rayons ou partenaires avec un jeu de piste palpitant.
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
                    <span>Lancer mon premier championnat</span>
                    <span>→</span>
                  </Link>
                  <Link
                    href="/tarifs"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-white py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:bg-[#FFE600] hover:-translate-y-0.5"
                  >
                    <span>Consulter les tarifs (inclus dès la formule Le Grand Jeu)</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Colonne Droite : Showcase interactif EventAnimationsShowcase */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <EventAnimationsShowcase />
              </div>
            </div>
          </div>
        </section>

        {/* Séparateur 3 : Damier Lilas */}
        <CheckerboardSeparator variant="lilas" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 4 — ESPACE COMMERÇANT & ESTIMATIF CA CÔTE À CÔTE (FOND MOTIF KERMESSE : VICHY LILAS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="gingham-purple" className="py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                📊 Espace Commerçant &amp; Estimatif Chiffre d&apos;Affaires
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Pilotez vos événements &amp; estimez vos gains en direct.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Suivez les participants en temps réel depuis votre tableau de bord et simulez le chiffre d&apos;affaires additionnel généré par les revisites en boutique.
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
                    Vous choisissez vos lots, activez vos matchs, visualisez les gagnants et validez les retraits au scanner caisse en 1 clic.
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

        {/* Séparateur 4 : Damier Jaune Solaire */}
        <CheckerboardSeparator variant="amber" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 5 — CATALOGUE DES 4 FORMATS D'ÉVÉNEMENTS (FOND COULEUR UNIE : JAUNE VANILLE SOLAIRE)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative py-10 sm:py-14 bg-[#FFF8D6] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Formats d&apos;Événements
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                4 formats puissants pour animer toute l&apos;année
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Des mécaniques éprouvées pour créer des rendez-vous incontournables et fidéliser votre clientèle.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {EVENT_FORMATS.map((feat) => (
                <div
                  key={feat.title}
                  className="flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 shadow-[0_4px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_6px_0_#181512]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{feat.emoji}</span>
                      <span className="rounded-full border border-[#181512] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-black text-[#181512]">
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
           BLOC 6 — FAQ ÉVÉNEMENTS (FOND MOTIF KERMESSE : NUAGES BLEUS DESSINÉS)
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
                Tout sur les Championnats &amp; Événements
              </h2>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {EVENT_FAQ.map((item) => (
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
              Lancez votre premier championnat dès ce week-end.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base sm:text-lg leading-relaxed text-white/90 font-bold">
              Créez votre compte en 2 minutes, activez les pronostics de la semaine ou votre calendrier surprise. 7 jours d&apos;essai offerts avec vos vrais clients.
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
