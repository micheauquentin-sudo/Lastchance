import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { ExperienceSelector } from "@/components/marketing/experience-selector";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { UseCasesByTrade } from "@/components/marketing/use-cases-by-trade";
import { VitrineSpotlight } from "@/components/marketing/vitrine-spotlight";
import {
  PRIX_ENTREE_EUROS,
  PRIX_ENTREE_MENSUEL,
} from "@/components/marketing/prix";
import { PLAN_TIERS } from "@/lib/plans";

/* DA « La Kermesse » : Lilita One pour les titres (voix foraine, ronde),
   Nunito 600-900 pour le corps.

   Architecture de page orientée conversion commerciale :
     1. Hero (promesse globale + compteur d'étendue)
     2. Marquee
     3. Votre commerce en situation réelle (par typologie métier : restaurant, bar, boutique, salon)
     4. Le catalogue des 14 modules détaillés (contenu, situation d'usage, avantage clé, démo)
     5. Gros plan : La Vitrine au QR Code (carte vivante bilingue, réservation sans commission)
     6. Comment ça marche (3 étapes : QR code, jeu, caisse)
     7. La boîte à outils & Caisse universelle (11 familles de codes, stats)
     8. Le jeu honnête (fiche Google protégée, zéro gain contre un avis)
     9. Espace commerçant (tableau de bord & statistiques)
     10. Tarifs par objectif (5 offres sans prix en dur)
     11. FAQ & Objections
     12. CTA final */

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
const SECTION = "relative z-10 mx-auto max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20";

/* ─────────────────────────── Données ─────────────────────────── */

const HERO_CHIPS = [
  "Prêt en 10 min",
  "Sans compte client",
  "Conforme RGPD",
  "Sans engagement",
];

const STEPS = [
  {
    n: 1,
    dot: "bg-k-orange text-k-ink",
    tilt: "-rotate-[1.6deg]",
    title: "Posez votre QR code",
    description: "Sur le comptoir, le menu ou l'addition. Affiches A4 personnalisées prêtes à imprimer.",
  },
  {
    n: 2,
    dot: "bg-k-yellow text-k-ink",
    tilt: "rotate-[1.3deg]",
    title: "Ils jouent en direct",
    description: "Vos clients scannent et jouent immédiatement à l'une de vos 15 mécaniques, sans compte obligatoire.",
  },
  {
    n: 3,
    dot: "bg-k-pink text-k-ink",
    tilt: "-rotate-[0.7deg]",
    title: "Vous encaissez les retours",
    description: "Ils reviennent pour retirer leur lot. Votre équipe le valide en caisse au scanner.",
  },
];

const FEATURES = [
  { n: "01", dot: "bg-k-yellow text-k-ink", title: "QR codes & affiches prêtes", description: "Affiches A4 imprimables, quatre modèles au choix, QR personnalisés." },
  { n: "02", dot: "bg-k-blue text-k-ink", title: "Stats en temps réel", description: "Parties jouées, taux de gagnants, scans et emails — par campagne." },
  { n: "03", dot: "bg-k-orange text-k-ink", title: "15 mécaniques de jeu", description: "Roue, grattage, machine à sous, défis… adaptées à vos couleurs et votre logo." },
  { n: "04", dot: "bg-k-pink text-k-ink", title: "Caisse universelle", description: "Un seul scanner pour valider les gains des onze familles de jeux." },
  { n: "05", dot: "bg-k-green text-k-bg", title: "Conforme RGPD", description: "Consentement explicite, données en Europe, export CSV à tout moment." },
  { n: "06", dot: "bg-k-orange text-k-ink", title: "Emails de gain automatiques", description: "Chaque gagnant reçoit son code au nom de votre établissement." },
];

const RISKS = [
  "Conditionner un avantage à un avis viole les règles de Google Business Profile",
  "Une fiche signalée peut être suspendue — invisible sur Maps et la recherche locale",
  "Les faux avis (même « incités ») ternissent la confiance des vrais clients",
];

const MERCHANT_POINTS = [
  "Campagnes et modules illimités",
  "Caisse universelle pour toutes les mécaniques",
  "Statistiques et retours en temps réel",
  "Gestion des gains, stocks et probabilités",
  "Export des joueurs et emails qualifiés",
  "10 modèles de campagne prêts à l'emploi",
];

const FAQ = [
  {
    question: "Combien de temps faut-il pour démarrer ?",
    answer:
      "Une dizaine de minutes : créez votre compte, choisissez l'un des 10 modèles prêts à jouer (roue, carte à gratter, vitrine, pronostics…), imprimez l'affiche avec son QR code et posez-la en caisse. Vos clients peuvent jouer immédiatement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    answer:
      "Non. Le jeu s'ouvre directement dans le navigateur du téléphone après le scan du QR code. Aucun téléchargement, aucun compte obligatoire côté client.",
  },
  {
    question: "Comment sont contrôlés les gains ?",
    answer:
      "C'est vous qui définissez les lots, leurs probabilités et leurs stocks. Les poids, le tirage pondéré et le décrément de stock sont calculés et protégés sur nos serveurs — le lot attribué ne dépend jamais de ce que renvoie le téléphone du joueur — et chaque gain génère un code unique que votre équipe valide en caisse universelle.",
  },
  {
    question: "Est-ce conforme au RGPD et aux règles Google ?",
    answer:
      "Oui. Le consentement des joueurs est explicite, les données sont hébergées en Europe et vous pouvez les exporter à tout moment. Les gains ne sont JAMAIS conditionnés au dépôt d'un avis en ligne, ce qui protège votre fiche Google.",
  },
  {
    question: "Puis-je arrêter quand je veux ?",
    answer:
      "Oui. L'abonnement est sans engagement : vous pouvez le gérer ou le résilier à tout moment depuis votre espace commerçant, en quelques clics.",
  },
  {
    question: "Quelles sont les 15 mécaniques de jeu disponibles ?",
    answer:
      "Le module Jeux instantanés comprend 9 jeux de hasard (Roue, Carte à gratter, Carte retournée, Bonneteau 3 verres, Machine à sous, Memory, Coffre, Lancer de dé, Pioche) et 6 jeux d'adresse où le joueur doit réussir l'épreuve pour ouvrir le tirage (Pierre-feuille-ciseaux, Réflexe, Jauge, Puzzle, Mot mystère, Estimation).",
  },
];

/* ─────────────────────── Éléments partagés ─────────────────────── */

function KEyebrow({
  children,
  dot = "accent",
  tone = "ink",
}: {
  children: React.ReactNode;
  dot?: string;
  tone?: "ink" | "cream";
}) {
  const accent = dot === "accent";
  return (
    <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] sm:text-sm">
      <span
        aria-hidden
        className={`h-2 w-2 flex-none rounded-full ${accent ? "" : dot}`}
        style={accent ? { backgroundColor: "var(--backdrop-accent)" } : undefined}
      />
      <span className={tone === "cream" ? "text-k-bg" : "k-halo text-k-ink"}>{children}</span>
    </div>
  );
}

function KPrimary({
  href,
  children,
  className = "bg-k-orange text-k-ink",
  large = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  large?: boolean;
}) {
  return (
    <Magnetic>
      <Link
        href={href}
        className={`k-border k-btn inline-block whitespace-nowrap rounded-full font-black focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink ${
          large ? "px-9 py-4 text-lg" : "px-7 py-3.5 text-base"
        } ${className}`}
      >
        {children}
      </Link>
    </Magnetic>
  );
}

function KOutline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="k-border k-btn inline-block whitespace-nowrap rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
    >
      {children}
    </Link>
  );
}

function KCheck() {
  return (
    <span className="k-border-thin flex h-6 w-6 flex-none items-center justify-center rounded-full bg-k-green text-k-bg">
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function KCross() {
  return (
    <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-pink text-k-ink">
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function Hero() {
  return (
    <section className="relative z-10 overflow-x-clip px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-32">
      <HeroStickers />

      <div className="rise-in relative z-[2] inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-yellow px-4 py-1.5 text-[12px] font-black tracking-[0.06em] text-k-ink shadow-[0_4px_0_var(--color-k-ink)] sm:text-[13px]">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-orange" />
        7 jours offerts · Sans engagement
      </div>

      <h1
        className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-[960px] text-[clamp(2.7rem,7vw,5.1rem)] leading-[1.03]"
        style={{ ...DISPLAY, animationDelay: "80ms" }}
      >
        Faites jouer vos clients.{" "}
        <span className="inline-block -rotate-[1.56deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1.5 shadow-[0_5px_0_var(--color-k-ink)]">
          Remplissez
        </span>{" "}
        votre commerce.
      </h1>

      <p
        className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-4 text-sm sm:text-base font-bold text-k-body leading-relaxed shadow-sm"
        style={{ animationDelay: "120ms" }}
      >
        La plateforme tout-en-un pour restaurants, bars et boutiques : carte au QR code, 15 mécaniques de jeu, fidélité smartphone et animations live. Dès {PRIX_ENTREE_MENSUEL}.
      </p>

      {/* Compteur d'étendue : 14 modules, 15 jeux, 1 caisse, prix d'entrée dérivé */}
      <div
        className="rise-in relative z-[2] mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-2.5 sm:gap-3"
        style={{ animationDelay: "180ms" }}
      >
        <span className="k-card inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-black text-k-ink shadow-sm">
          <span className="text-k-orange-text font-black">★</span> 14 modules métiers
        </span>
        <span className="k-card inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-black text-k-ink shadow-sm">
          <span className="text-k-yellow font-black">★</span> 15 mécaniques de jeu
        </span>
        <span className="k-card inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-black text-k-ink shadow-sm">
          <span className="text-k-pink font-black">★</span> 1 caisse universelle
        </span>
        <span className="k-card inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-black text-k-ink shadow-sm">
          <span className="text-k-green font-black">★</span> Dès {PRIX_ENTREE_MENSUEL}
        </span>
      </div>

      <div
        className="rise-in relative z-[2] mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
        style={{ animationDelay: "220ms" }}
      >
        <KPrimary href="/signup" className="bg-k-orange text-k-ink">
          Essayer gratuitement 7 jours →
        </KPrimary>
        <KOutline href="#metiers">Découvrir selon mon activité</KOutline>
      </div>

      <div
        className="rise-in relative z-[2] mt-8 flex flex-wrap justify-center gap-2.5"
        style={{ animationDelay: "260ms" }}
      >
        {HERO_CHIPS.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1.5 rounded-full border border-k-ink/20 bg-white/80 px-4 py-2 text-sm font-bold text-k-ink shadow-[0_2px_8px_rgba(33,29,22,0.10)] backdrop-blur-md"
          >
            <span aria-hidden className="font-black text-k-green">
              ✓
            </span>
            {chip}
          </span>
        ))}
      </div>
    </section>
  );
}

function Marquee() {
  const line = "ILS SCANNENT ★ ILS JOUENT ★ ILS GAGNENT ★ ILS REVIENNENT ★ ".repeat(3);
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
      <div
        aria-hidden
        className="ticker overflow-hidden rounded-full bg-k-ink/80 py-2.5 backdrop-blur-md"
      >
        <div
          className="ticker-track flex w-max whitespace-nowrap text-lg font-extrabold tracking-[0.08em]"
          style={{ ...DISPLAY, color: "var(--backdrop-accent-text)" }}
        >
          <span className="pr-10">{line.trim()}</span>
          <span className="pr-10">{line.trim()}</span>
        </div>
      </div>
    </div>
  );
}

/** Section Cas d'usage par métier (Restaurant, Bar, Boutique, Salon). */
function TradeUseCasesSection() {
  return (
    <section id="metiers" className={SECTION}>
      <Reveal>
        <UseCasesByTrade />
      </Reveal>
    </section>
  );
}

/** Grand stand catalogue des 14 modules détaillés. */
function ModulesShowcase() {
  return (
    <section id="modules" className={SECTION}>
      <Reveal>
        <ExperienceSelector />
      </Reveal>
    </section>
  );
}

/** Section Focus : La Vitrine au QR Code. */
function VitrineSection() {
  return (
    <section id="vitrine" className={SECTION}>
      <Reveal>
        <VitrineSpotlight />
      </Reveal>
    </section>
  );
}

function StepVisual({ step }: { step: number }) {
  if (step === 1) {
    return (
      <div className="k-border-thin mb-4 mt-4 grid h-[86px] w-[86px] grid-cols-3 grid-rows-3 gap-[5px] rounded-[14px] bg-white/90 p-2.5">
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
        <span /><span className="rounded-[3px] bg-k-orange" /><span />
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
      </div>
    );
  }
  if (step === 2) {
    return (
      <div
        className="k-border-thin k-spin mb-4 mt-4 h-[86px] w-[86px] rounded-full"
        style={{ background: "conic-gradient(var(--color-k-orange) 0 25%, var(--color-k-yellow) 0 50%, var(--color-k-pink) 0 75%, var(--color-k-blue) 0 100%)" }}
      />
    );
  }
  return (
    <div className="k-border-thin mb-4 mt-4 flex h-[86px] w-[86px] items-end gap-2 rounded-[14px] bg-white/90 p-3">
      <span className="k-border-thin h-[38%] flex-1 rounded-t-md bg-k-pink" />
      <span className="k-border-thin h-[64%] flex-1 rounded-t-md bg-k-yellow" />
      <span className="k-border-thin h-[88%] flex-1 rounded-t-md bg-k-green" />
    </div>
  );
}

function KArrow({ flip = false }: { flip?: boolean }) {
  return (
    <div className={`hidden items-center px-1.5 lg:flex ${flip ? "translate-y-2.5 -scale-y-100" : "-translate-y-5"}`}>
      <svg width="90" height="52" viewBox="0 0 90 52" aria-hidden>
        <path className="dash-flow" d="M6 40 C 30 8, 58 8, 80 26" fill="none" stroke="var(--color-k-ink)" strokeWidth="4" strokeLinecap="round" />
        <path d="M70 18 L 82 27 L 68 32" fill="none" stroke="var(--color-k-ink)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Steps() {
  return (
    <section id="comment-ca-marche" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>Comment ça marche</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
          Trois étapes. Zéro prise de tête.
        </h2>
      </Reveal>

      <div className="mt-12 flex flex-col items-center justify-center gap-10 lg:flex-row lg:items-stretch lg:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.n} className="contents">
            <Reveal
              delay={i * 120}
              className={["reveal-tilt-l", "reveal-pop", "reveal-tilt-r"][i]}
            >
              <div className={step.tilt}>
                <Tilt3D>
                  <div className="k-card k-card-hover relative w-full max-w-[340px] rounded-[22px] px-8 pb-8 pt-9">
                    <span
                      className={`k-border k-hard-sm absolute -top-6 left-6 flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${step.dot}`}
                      style={DISPLAY}
                    >
                      {step.n}
                    </span>
                    <StepVisual step={step.n} />
                    <h3 className="text-[22px]" style={DISPLAY}>{step.title}</h3>
                    <p className="mt-2.5 text-[15px] font-bold leading-normal text-k-body">{step.description}</p>
                  </div>
                </Tilt3D>
              </div>
            </Reveal>
            {i < STEPS.length - 1 && <KArrow flip={i === 1} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="fonctionnalites" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>La boîte à outils</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
          Tout ce qu&apos;il faut, rien de superflu.
        </h2>
      </Reveal>

      <div className="mt-11 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.n} delay={(i % 3) * 90} className={["reveal-tilt-l", "reveal-pop", "reveal-tilt-r"][i % 3]}>
            <div className={i % 2 ? "-rotate-[0.65deg]" : "rotate-[0.65deg]"}>
              <Tilt3D>
                <div className="k-card k-card-hover h-full rounded-[22px] p-6">
                  <span
                    className={`k-border k-hard-sm inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${f.dot}`}
                    style={DISPLAY}
                  >
                    {f.n}
                  </span>
                  <h3 className="mt-4 text-[21px]" style={DISPLAY}>{f.title}</h3>
                  <p className="mt-2 text-[14.5px] font-bold leading-normal text-k-body">{f.description}</p>
                </div>
              </Tilt3D>
            </div>
          </Reveal>
        ))}
      </div>

      <HonestGame />
    </section>
  );
}

/** Notre différence : le jeu honnête. */
function HonestGame() {
  return (
    <Reveal className="reveal-pop mt-14" delay={80}>
      <Tilt3D intensity={6}>
        <div className="k-card-deep grid gap-9 rounded-[26px] p-7 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <KEyebrow dot="bg-k-yellow" tone="cream">Notre différence</KEyebrow>
            <h3 className="mt-3 text-[clamp(1.7rem,3vw,2.1rem)] leading-tight text-k-bg" style={DISPLAY}>
              Un jeu honnête,<br />pas un piège à avis.
            </h3>
            <p className="mt-3.5 text-[15.5px] font-bold leading-[1.55] text-k-bg/90">
              Le gain n&apos;est jamais conditionné à un avis, un like ou un
              abonnement. Vos clients jouent, gagnent, reviennent — et si un
              avis arrive, il est spontané. Votre fiche Google ne prend aucun
              risque de suspension.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3.5">
            {RISKS.map((risk, i) => (
              <div
                key={risk}
                className={`flex items-center gap-3 rounded-2xl border-2 border-k-ink/15 bg-white/88 px-4 py-3 text-[13.5px] font-extrabold text-k-ink ${
                  i % 2 ? "rotate-[0.65deg]" : "-rotate-[0.65deg]"
                }`}
              >
                <KCross />
                {risk}
              </div>
            ))}
            <div className="k-border k-hard-sm rotate-[0.65deg] rounded-2xl bg-k-yellow px-4 py-3.5 text-[14.5px] font-extrabold text-k-ink">
              <div className="flex items-center gap-3">
                <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-bg">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                « Jouez, gagnez, un point c&apos;est tout » — fiche protégée
              </div>
            </div>
          </div>
        </div>
      </Tilt3D>
    </Reveal>
  );
}

function DonutChart() {
  const data = [
    { label: "-20 %", value: 35, color: "var(--color-k-orange)" },
    { label: "Boisson offerte", value: 25, color: "var(--color-k-pink)" },
    { label: "-10 %", value: 20, color: "var(--color-k-yellow)" },
    { label: "Dessert offert", value: 10, color: "var(--color-k-blue)" },
    { label: "Autres", value: 10, color: "var(--color-k-green)" },
  ];
  const R = 32;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="chart-pop h-24 w-24 shrink-0 -rotate-90" aria-hidden>
        {data.map((d) => {
          const len = (d.value / 100) * CIRC;
          const seg = (
            <circle
              key={d.label}
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 font-bold text-k-body">
            <span className="k-border-thin h-3 w-3 rounded-full" style={{ background: d.color }} />
            <span className="flex-1">{d.label}</span>
            <span className="font-black text-k-ink">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineChart() {
  const pts = [8, 22, 15, 30, 24, 40, 33, 52, 44, 60];
  const w = 260;
  const h = 90;
  const step = w / (pts.length - 1);
  const max = 64;
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`).join(" ");
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  const markerX = 7 * step;
  const markerY = h - (52 / max) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5793b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f5793b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lc-area)" className="chart-pop" />
      <path d={path} fill="none" stroke="#f5793b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chart-line" pathLength={1} />
      <circle cx={markerX} cy={markerY} r="4.5" fill="#f5793b" stroke="#211d16" strokeWidth="2" className="chart-marker" />
      <g transform={`translate(${markerX - 15} ${markerY - 26})`} className="chart-marker">
        <rect width="30" height="17" rx="8.5" fill="#211d16" />
        <text x="15" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fdf6e3">128</text>
      </g>
    </svg>
  );
}

function DashboardMockup() {
  const navItems = ["Tableau de bord", "Campagnes", "14 Modules", "Caisse universelle", "Statistiques", "QR Hub", "Paramètres"];
  const stats = [
    { label: "Joueurs", value: "1 286", delta: "+18%" },
    { label: "Emails collectés", value: "342", delta: "+27%" },
    { label: "Taux de participation", value: "34%", delta: "+13%" },
    { label: "Gains validés", value: "412", delta: "+15%" },
  ];
  return (
    <div className="k-border k-soft overflow-hidden rounded-[22px] bg-white">
      <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr]">
        <aside className="border-r-[2.5px] border-k-ink bg-k-bg p-3">
          <p className="px-2 text-sm" style={DISPLAY}>
            LastChance<span className="text-k-orange-text">.</span>
          </p>
          <ul className="mt-4 space-y-0.5">
            {navItems.map((item, i) => (
              <li
                key={item}
                className={`truncate rounded-lg px-2 py-1.5 text-[11px] font-bold ${
                  i === 0 ? "k-border-thin bg-k-yellow text-k-ink" : "text-k-body"
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-k-ink">Tableau de bord commerçant</p>
            <span className="k-border-thin rounded-md px-2 py-1 text-[10px] font-bold text-k-body">1 – 31 mai 2026</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="k-border-thin rounded-lg bg-white p-2.5">
                <p className="truncate text-[10px] font-bold text-k-body">{s.label}</p>
                <p className="mt-0.5 text-base font-black text-k-ink">
                  {s.value} <span className="text-[10px] font-black text-k-green">↑ {s.delta}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="k-border-thin rounded-lg p-3">
              <p className="text-xs font-black text-k-ink">Évolution des participations</p>
              <div className="mt-2">
                <LineChart />
              </div>
            </div>
            <div className="k-border-thin rounded-lg p-3">
              <p className="text-xs font-black text-k-ink">Top gains validés</p>
              <div className="mt-3">
                <DonutChart />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MerchantSpace() {
  return (
    <section id="espace-commercant" className={SECTION}>
      <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal className="reveal-tilt-l">
          <KEyebrow>Votre espace</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight" style={DISPLAY}>
            Vous voyez qui revient, et ce que ça vous rapporte.
          </h2>
          <div className="k-card mt-8 rounded-[22px] p-6">
            <ul className="space-y-3.5">
              {MERCHANT_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-3 font-bold text-k-body">
                  <KCheck />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-9">
            <KPrimary href="/signup" className="bg-k-yellow text-k-ink">
              Voir mon tableau de bord →
            </KPrimary>
          </div>
        </Reveal>

        <Reveal delay={120} className="reveal-tilt-r">
          <div className="rotate-[0.6deg]">
            <Tilt3D intensity={8}>
              <DashboardMockup />
            </Tilt3D>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Section Aperçu des 5 offres classées par objectif. */
function Pricing() {
  return (
    <section id="tarifs" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>Tarifs clairs</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05]" style={DISPLAY}>
          Cinq offres bâties pour vos objectifs.
        </h2>
        <p className="k-card mx-auto mt-5 max-w-[620px] rounded-[18px] px-6 py-4 text-base font-bold leading-[1.55] text-k-body">
          Pas de mauvaise surprise : chaque offre est conçue pour un besoin précis.
          Sans engagement, 7 jours d&apos;essai offerts, résiliable à tout moment.
        </p>
      </Reveal>

      {/* Cartes d'offres : 5 offres de PLAN_TIERS */}
      <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLAN_TIERS.map((tier, idx) => {
          const isPopular = tier.id === "engagement" || tier.id === "core";
          return (
            <Reveal key={tier.id} delay={idx * 70} className="h-full">
              <div className="h-full">
                <Tilt3D intensity={6}>
                  <div
                    className={`k-card k-card-hover relative flex h-full flex-col justify-between rounded-[24px] p-7 ${
                      isPopular ? "border-k-ink shadow-md" : ""
                    }`}
                  >
                    {isPopular && (
                      <span className="k-border k-hard-sm absolute -top-3.5 right-6 rounded-full bg-k-yellow px-3.5 py-1 text-xs font-black text-k-ink">
                        {tier.id === "core" ? `Entrée dès ${PRIX_ENTREE_EUROS}` : "Populaire"}
                      </span>
                    )}

                    <div>
                      <div className="text-[22px] font-black" style={DISPLAY}>
                        {tier.name}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-4xl font-black sm:text-5xl" style={DISPLAY}>
                          {tier.priceMonthly} €
                        </span>
                        <span className="text-sm font-black text-k-muted">/ mois</span>
                      </div>
                      <p className="mt-3 text-xs font-bold leading-relaxed text-k-body">
                        {tier.tagline}
                      </p>

                      <div className="my-5 border-t-2 border-dashed border-k-ink/20" />

                      <ul className="flex flex-col gap-2 text-xs font-extrabold text-k-ink">
                        {tier.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-2">
                            <span className="mt-0.5 text-k-green">✓</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 pt-4">
                      <Link
                        href="/signup"
                        className={`k-border k-btn block w-full rounded-full py-2.5 text-center text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-2 ${
                          tier.id === "core"
                            ? "bg-k-orange text-k-ink"
                            : "bg-k-yellow text-k-ink"
                        }`}
                      >
                        Tester 7 jours offerts
                      </Link>
                    </div>
                  </div>
                </Tilt3D>
              </div>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/tarifs"
          className="k-border k-btn inline-flex items-center gap-2 rounded-full bg-white/90 px-8 py-3.5 text-base font-black text-k-ink backdrop-blur-md hover:bg-k-yellow"
        >
          <span>Comparer les 5 offres, les 13 options & le simulateur de ROI</span>
          <span>→</span>
        </Link>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className={SECTION}>
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <KEyebrow>Questions fréquentes</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
            Tout ce que vous voulez savoir.
          </h2>
        </Reveal>

        <div className="mt-11 space-y-4">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details
                className={`k-card group rounded-[18px] ${i % 2 ? "rotate-[0.4deg]" : "-rotate-[0.4deg]"}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[18px] px-6 py-5 text-[16px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span className="k-border-thin flex h-8 w-8 flex-none items-center justify-center rounded-full bg-k-yellow transition-transform duration-300 group-open:rotate-45">
                    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="px-6 pb-6 font-bold leading-relaxed text-k-body">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 text-sm font-black text-k-ink hover:underline"
          >
            <span>Consulter la foire aux questions complète</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalCtaFooter() {
  return (
    <div className="relative z-10 mx-auto mt-10 max-w-6xl px-4 sm:px-6">
      <div className="rounded-t-[36px] border-2 border-b-0 border-k-bg/20 bg-k-ink/82 px-5 pt-16 text-center text-k-bg backdrop-blur-xl sm:px-10 sm:pt-20">
        <Reveal className="reveal-pop relative mx-auto max-w-4xl">
          <h2 className="text-[clamp(2.3rem,6vw,4.4rem)] leading-[1.05]" style={DISPLAY}>
            Votre commerce en jeu dès ce soir.
          </h2>
          <p className="mx-auto mt-4 max-w-[540px] text-[17px] font-bold text-k-bg/85">
            Créez votre compte en 2 minutes, activez vos modules préférés, imprimez votre affiche.
            7 jours pour essayer avec vos vrais clients.
          </p>
          <div className="mt-7 flex justify-center">
            <Magnetic>
              <Link
                href="/signup"
                className="k-btn-light inline-block whitespace-nowrap rounded-full border-[3px] border-k-bg bg-k-yellow px-9 py-4 text-lg font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-bg"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
          </div>
        </Reveal>

        <footer className="mt-14 border-t border-k-bg/25 py-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-[13.5px] font-bold text-k-bg/70 sm:flex-row">
            <span className="text-lg text-k-bg" style={DISPLAY}>
              LastChance<span className="text-k-orange">.</span>
            </span>
            <nav aria-label="Pied de page" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <Link href="/attirer" className="transition-colors hover:text-k-bg">Acquérir</Link>
              <Link href="/faire-venir" className="transition-colors hover:text-k-bg">Créer du trafic</Link>
              <Link href="/fideliser" className="transition-colors hover:text-k-bg">Fidéliser</Link>
              <Link href="/animer" className="transition-colors hover:text-k-bg">Animer</Link>
              <Link href="/tarifs" className="transition-colors hover:text-k-bg">Tarifs</Link>
              <Link href="/faq" className="transition-colors hover:text-k-bg">FAQ</Link>
              <Link href="/login" className="transition-colors hover:text-k-bg">Connexion</Link>
              <Link href="/signup" className="transition-colors hover:text-k-bg">Essai gratuit</Link>
            </nav>
            <span>© {new Date().getFullYear()} — Jamais de gain contre un avis.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-transparent text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <ScrollPanoramaBackground />

      <SkipLink />

      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        <Hero />
        <Marquee />
        <TradeUseCasesSection />
        <ModulesShowcase />
        <VitrineSection />
        <Steps />
        <Features />
        <MerchantSpace />
        <Pricing />
        <Faq />
        <FinalCtaFooter />
      </main>
    </div>
  );
}
