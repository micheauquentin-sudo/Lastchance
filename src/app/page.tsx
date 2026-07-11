import { Fraunces, Poppins } from "next/font/google";
import Link from "next/link";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { SiteHeader } from "@/components/marketing/site-header";

/* Poppins pour les titres (voix ronde et amicale), Fraunces italique
   pour l'accent du hero. Le corps reste en Geist. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500", "600"],
  variable: "--font-display",
});

/* ─────────────────────────── Contenu ─────────────────────────── */

const TRUST = [
  {
    title: "Prêt en 10 minutes",
    subtitle: "Aucune installation",
    icon: (
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    ),
  },
  {
    title: "Conforme RGPD",
    subtitle: "Données sécurisées",
    icon: (
      <path
        d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Zm-3 9 2.2 2.2L15.5 10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "+ de clients fidèles",
    subtitle: "Ils reviennent plus souvent",
    icon: (
      <path
        d="M4 19V5m0 14 4-5 4 3 8-9m0 0h-5m5 0v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Expérience fun",
    subtitle: "Vos clients adorent jouer",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
];

const PRICING_FEATURES = [
  "Campagnes et roues illimitées",
  "QR codes et affiches A4 illimités",
  "Personnalisation complète (logo, couleurs, polices)",
  "Page caisse pour valider les gains",
  "Statistiques en temps réel + export CSV",
  "Emails de gain automatiques",
  "Conformité RGPD intégrée",
];

const FAQ = [
  {
    question: "Combien de temps faut-il pour démarrer ?",
    answer:
      "Une dizaine de minutes : créez votre compte, configurez vos lots, imprimez l'affiche avec son QR code et posez-la en caisse. Vos clients peuvent jouer immédiatement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    answer:
      "Non. Le jeu s'ouvre directement dans le navigateur du téléphone après le scan du QR code. Aucun téléchargement, aucun compte à créer côté client.",
  },
  {
    question: "Comment sont contrôlés les gains ?",
    answer:
      "C'est vous qui définissez les lots, leurs probabilités et leurs stocks. Le tirage se fait côté serveur — impossible à manipuler — et chaque gain génère un code unique que votre équipe valide en caisse.",
  },
  {
    question: "Est-ce conforme au RGPD ?",
    answer:
      "Oui. Le consentement des joueurs est explicite, les données sont hébergées en Europe et vous pouvez les exporter à tout moment. Les gains ne sont jamais conditionnés au dépôt d'un avis en ligne.",
  },
  {
    question: "Puis-je arrêter quand je veux ?",
    answer:
      "Oui. L'abonnement est sans engagement : vous pouvez le gérer ou le résilier à tout moment depuis votre espace, en quelques clics.",
  },
];

/* ─────────────────────────── Éléments partagés ─────────────────────────── */

function PrimaryCta({
  href,
  children,
  large = false,
}: {
  href: string;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <Magnetic>
      <Link
        href={href}
        className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-orange-500 to-pink-500 font-semibold text-white shadow-lg shadow-orange-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-pink-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 active:translate-y-0 ${
          large ? "px-8 py-4 text-base" : "px-6 py-3 text-sm sm:text-base"
        }`}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/30 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
          style={{ transform: "skewX(-18deg)" }}
        />
        {children}
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-200 group-hover:translate-x-0.5">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </Magnetic>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white/70 px-6 py-3 text-sm font-semibold text-zinc-800 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 active:translate-y-0 sm:text-base"
    >
      {children}
    </Link>
  );
}

function Heading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`text-balance text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl ${className}`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      {children}
    </h2>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-500">{children}</p>
  );
}

function CheckIcon() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-white">
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-8 pt-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-6 lg:pb-16 lg:pt-20">
        <div className="text-center lg:text-left">
          <div className="rise-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-900/10 bg-white/70 px-4 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pink-500" />
              Le jeu qui fait revenir les clients
            </span>
          </div>

          <h1
            className="rise-in mt-6 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight text-zinc-900 sm:text-6xl lg:text-7xl"
            style={{ fontFamily: "var(--font-heading), system-ui, sans-serif", animationDelay: "80ms" }}
          >
            Faites tourner
            <br />
            <em
              className="bg-gradient-to-r from-orange-500 via-pink-500 to-fuchsia-500 bg-clip-text pr-2 font-medium not-italic text-transparent [font-style:italic]"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              l&apos;envie de revenir
            </em>
          </h1>

          <p
            className="rise-in mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-zinc-600 lg:mx-0"
            style={{ animationDelay: "160ms" }}
          >
            Un QR code sur votre comptoir, une roue à vos couleurs, des gains
            que l&apos;on vient chercher. Prêt en 10 minutes, conforme RGPD.
          </p>

          <div className="rise-in mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start" style={{ animationDelay: "240ms" }}>
            <PrimaryCta href="/signup">Créer ma roue</PrimaryCta>
            <SecondaryCta href="/login">Voir la démo</SecondaryCta>
          </div>
        </div>

        <div className="rise-in" style={{ animationDelay: "180ms" }}>
          <HeroShowcase />
        </div>
      </div>

      <TrustBar />
    </section>
  );
}

function TrustBar() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-6 sm:px-6">
      <Reveal>
        <div className="grid grid-cols-1 gap-2 rounded-[1.75rem] border border-white/70 bg-white/85 p-3 shadow-[0_28px_60px_-18px_rgba(120,40,20,0.28)] ring-1 ring-orange-900/[0.04] backdrop-blur-xl sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          {TRUST.map((item) => (
            <div
              key={item.title}
              className="group flex items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:shadow-orange-500/10"
            >
              {/* Tuile d'icône en relief 3D */}
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-[0_10px_18px_-6px_rgba(249,115,22,0.6),inset_0_1px_0_rgba(255,255,255,0.55)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]">
                <span aria-hidden className="pointer-events-none absolute inset-x-1.5 top-1 h-1/3 rounded-full bg-white/35 blur-[2px]" />
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
                  {item.icon}
                </svg>
              </span>
              <div>
                <p className="font-semibold text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
                  {item.title}
                </p>
                <p className="text-sm text-zinc-500">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

function DashArrow() {
  return (
    <svg aria-hidden width="90" height="24" viewBox="0 0 90 24" fill="none" className="hidden text-orange-400 lg:block">
      <path className="dash-flow" d="M2 12h78" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M74 5l8 7-8 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Petit présentoir de comptoir avec QR (étape 1). */
function StandCard() {
  return (
    <div className="mx-auto w-44 rotate-[-4deg]">
      <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 p-4 shadow-xl shadow-orange-500/25">
        <p className="text-center text-xs font-semibold text-white/90" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic" }}>
          Scannez et jouez !
        </p>
        <div className="mx-auto mt-2 w-24 rounded-lg bg-white p-1.5">
          <QrMini />
        </div>
        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-white/90">LastChance.</p>
      </div>
      <div className="mx-auto h-3 w-20 rounded-b-lg bg-zinc-800/80" />
    </div>
  );
}

function QrMini() {
  return (
    <svg viewBox="0 0 100 100" className="h-auto w-full" aria-hidden shapeRendering="crispEdges">
      <rect width="100" height="100" fill="#fff" />
      {[
        [8, 8],
        [64, 8],
        [8, 64],
      ].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="28" height="28" fill="#18181b" />
          <rect x={x + 6} y={y + 6} width="16" height="16" fill="#fff" />
          <rect x={x + 10} y={y + 10} width="8" height="8" fill="#18181b" />
        </g>
      ))}
      {Array.from({ length: 40 }, (_, i) => {
        const gx = 44 + (i % 5) * 10;
        const gy = 44 + Math.floor(i / 5) * 7;
        return (i * 7) % 3 === 0 ? <rect key={i} x={gx} y={gy} width="6" height="6" fill="#18181b" /> : null;
      })}
    </svg>
  );
}

/** Mini stat card (étape 3). */
function StatMiniCard() {
  return (
    <div className="mx-auto w-64 rotate-[3deg] rounded-2xl border border-orange-900/[0.06] bg-white p-4 text-left shadow-xl shadow-orange-950/[0.06]">
      <p className="text-xs font-semibold text-zinc-500">Dernières participations</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-xs font-bold text-white">M</span>
        <div>
          <p className="text-sm font-semibold text-zinc-800">Marie D.</p>
          <p className="text-xs text-zinc-500">-20 % sur l&apos;addition</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-zinc-500">Visites</p>
          <p className="text-lg font-bold text-zinc-900">128 <span className="text-xs font-semibold text-emerald-500">+27%</span></p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Emails collectés</p>
          <p className="text-lg font-bold text-zinc-900">342 <span className="text-xs font-semibold text-emerald-500">+31%</span></p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-xs text-zinc-500">Taux de participation</p>
        <p className="text-lg font-bold text-zinc-900">34% <span className="text-xs font-semibold text-emerald-500">+12%</span></p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      visual: <StandCard />,
      title: "Exposez votre QR code",
      description: "Sur votre comptoir, menu ou ticket de caisse.",
    },
    {
      n: 2,
      visual: (
        <div className="mx-auto flex h-52 w-40 items-center justify-center rounded-[1.6rem] border-[6px] border-zinc-900 bg-gradient-to-b from-rose-50 to-orange-50 shadow-xl">
          <div className="relative">
            <div className="spin-slow h-24 w-24 rounded-full bg-[conic-gradient(#f6836f_0_25%,#fbeee0_0_50%,#f6a623_0_75%,#ee5a6f_0_100%)]" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-bold text-white">Last.</span>
            <span className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-xs font-bold text-white shadow-lg">-20%</span>
          </div>
        </div>
      ),
      title: "Vos clients jouent",
      description: "Ils tournent la roue et découvrent immédiatement leur gain.",
    },
    {
      n: 3,
      visual: <StatMiniCard />,
      title: "Vous suivez les résultats",
      description: "Tous les joueurs, gains et statistiques en temps réel dans votre espace.",
    },
  ];

  return (
    <section id="comment-ca-marche" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal className="text-center">
          <Eyebrow>Comment ça marche</Eyebrow>
          <Heading className="mt-3">Trois étapes. Zéro prise de tête.</Heading>
        </Reveal>

        <div className="mt-16 flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-2">
          {steps.map((step, i) => (
            <div key={step.n} className="contents">
              <Reveal delay={i * 110} className="w-full max-w-xs">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6 flex h-64 items-center justify-center">
                    <span className="absolute -top-2 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-sm font-bold text-white shadow-lg">
                      {step.n}
                    </span>
                    {step.visual}
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-[16rem] leading-relaxed text-zinc-600">{step.description}</p>
                </div>
              </Reveal>
              {i < steps.length - 1 && (
                <div className="flex items-center pt-24">
                  <DashArrow />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { title: "Roue 100 % personnalisable", description: "Couleurs, anneau, polices, pointeur : la roue ressemble à votre commerce, pas à un logiciel." },
    { title: "QR codes & affiches prêtes", description: "QR codes personnalisés et affiches A4 imprimables, quatre modèles au choix." },
    { title: "Validation en caisse", description: "Une page pensée mobile : le staff saisit le code et valide le gain en une seconde." },
    { title: "Statistiques en temps réel", description: "Tours joués, taux de gagnants, gains à valider, scans — campagne par campagne." },
    { title: "Conforme RGPD", description: "Consentement explicite, données en Europe, export CSV. Jamais de gain contre un avis." },
    { title: "Emails de gain automatiques", description: "Chaque gagnant reçoit son code par email, au nom de votre établissement." },
  ];
  return (
    <section id="fonctionnalites" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Fonctionnalités</Eyebrow>
          <Heading className="mt-3">Tout ce qu&apos;il faut, rien de superflu</Heading>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-600">
            Un outil complet pensé pour le quotidien d&apos;un commerce.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="h-full rounded-2xl border border-orange-900/[0.06] bg-white/80 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-950/[0.08]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-pink-100 text-lg font-bold text-orange-500" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-bold tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Aperçu du dashboard (maquette décorative, données fictives) ── */

function DonutChart() {
  const data = [
    { label: "-20 %", value: 35, color: "#f97316" },
    { label: "Boisson offerte", value: 25, color: "#fb7185" },
    { label: "-10 %", value: 20, color: "#f59e0b" },
    { label: "Dessert offert", value: 10, color: "#ec4899" },
    { label: "Autres", value: 10, color: "#fcd34d" },
  ];
  const R = 32;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden>
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
          <li key={d.label} className="flex items-center gap-2 text-zinc-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="flex-1">{d.label}</span>
            <span className="font-semibold text-zinc-800">{d.value}%</span>
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
          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lc-area)" />
      <path d={path} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={markerX} cy={markerY} r="4" fill="#f43f5e" stroke="#fff" strokeWidth="2" />
      <g transform={`translate(${markerX - 15} ${markerY - 24})`}>
        <rect width="30" height="16" rx="8" fill="#f43f5e" />
        <text x="15" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">128</text>
      </g>
    </svg>
  );
}

function DashboardMockup() {
  const navItems = ["Tableau de bord", "Campagnes", "Joueurs", "Gains", "Statistiques", "QR Codes", "Paramètres"];
  const stats = [
    { label: "Joueurs", value: "1 286", delta: "+18%" },
    { label: "Emails collectés", value: "342", delta: "+27%" },
    { label: "Taux de participation", value: "34%", delta: "+13%" },
    { label: "Gains distribués", value: "412", delta: "+15%" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-orange-900/[0.06] bg-white shadow-2xl shadow-orange-950/10">
      <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-zinc-100 bg-zinc-50/70 p-3">
          <p className="px-2 text-sm font-extrabold text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
            LastChance<span className="text-pink-500">.</span>
          </p>
          <ul className="mt-4 space-y-0.5">
            {navItems.map((item, i) => (
              <li
                key={item}
                className={`truncate rounded-lg px-2 py-1.5 text-[11px] ${
                  i === 0 ? "bg-orange-100/70 font-semibold text-orange-700" : "text-zinc-500"
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
              Tableau de bord
            </p>
            <span className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] text-zinc-500">1 – 31 mai 2024</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-zinc-100 bg-white p-2.5">
                <p className="truncate text-[10px] text-zinc-500">{s.label}</p>
                <p className="mt-0.5 text-base font-bold text-zinc-900">
                  {s.value} <span className="text-[10px] font-semibold text-emerald-500">↑ {s.delta}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-100 p-3">
              <p className="text-xs font-semibold text-zinc-700">Évolution des participations</p>
              <div className="mt-2">
                <LineChart />
              </div>
            </div>
            <div className="rounded-lg border border-zinc-100 p-3">
              <p className="text-xs font-semibold text-zinc-700">Top gains</p>
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
  const points = [
    "Campagnes illimitées",
    "Statistiques en temps réel",
    "Gestion des gains et des probabilités",
    "Export des joueurs et emails",
    "Compatible mobile",
  ];
  return (
    <section id="espace-commercant" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal>
          <Eyebrow>Votre espace commerçant</Eyebrow>
          <Heading className="mt-3">Tout est centralisé, vous gardez le contrôle.</Heading>
          <ul className="mt-8 space-y-3.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-zinc-700">
                <CheckIcon />
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 active:translate-y-0"
            >
              Découvrir le dashboard
              <svg aria-hidden width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <DashboardMockup />
        </Reveal>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Tarifs</Eyebrow>
          <Heading className="mt-3">Un prix simple, tout inclus</Heading>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-600">
            Pas d&apos;options cachées ni de paliers compliqués : une offre unique qui couvre tout.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-12 max-w-md" delay={100}>
          <div className="overflow-hidden rounded-3xl border border-orange-900/[0.08] bg-white p-8 shadow-2xl shadow-orange-950/[0.08] sm:p-10">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
                Starter
              </h3>
              <span className="rounded-full bg-gradient-to-r from-orange-100 to-pink-100 px-3 py-1 text-xs font-semibold text-orange-600">7 jours offerts</span>
            </div>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>29 €</span>
              <span className="text-zinc-500">/ mois</span>
            </p>
            <p className="mt-2 text-sm text-zinc-500">Sans engagement, résiliable à tout moment.</p>
            <ul className="mt-8 space-y-3">
              {PRICING_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-zinc-700">
                  <CheckIcon />
                  <span className="leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <PrimaryCta href="/signup" large>Commencer l&apos;essai gratuit</PrimaryCta>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <Reveal className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <Heading className="mt-3">Questions fréquentes</Heading>
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details className="group rounded-2xl border border-orange-900/[0.08] bg-white/80 transition-colors open:border-orange-300 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 font-semibold text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-orange-400 transition-transform duration-300 group-open:rotate-45">
                    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="px-6 pb-6 leading-relaxed text-zinc-600">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-20 pt-4 sm:px-6 sm:pb-28">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-pink-500 to-fuchsia-500 px-6 py-16 text-center shadow-2xl shadow-pink-500/25 sm:px-12 sm:py-20">
          <div aria-hidden className="absolute -top-16 left-1/2 h-52 w-[520px] -translate-x-1/2 rounded-full bg-white/20 blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
              Votre roue peut tourner dès ce soir
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-white/90">
              Créez votre compte, composez vos lots, imprimez votre affiche. 7 jours pour l&apos;essayer avec vos vrais clients.
            </p>
            <div className="mt-9 flex justify-center">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-zinc-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0"
                >
                  Créer ma roue
                  <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-orange-900/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <p className="text-lg font-extrabold tracking-tight text-zinc-900" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
              LastChance<span className="text-pink-500">.</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              La roue de la fortune par QR code qui fait revenir les clients des commerces de proximité.
            </p>
          </div>
          <nav aria-label="Pied de page" className="flex gap-16">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Produit</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><a href="#fonctionnalites" className="text-zinc-500 transition-colors hover:text-zinc-900">Fonctionnalités</a></li>
                <li><a href="#comment-ca-marche" className="text-zinc-500 transition-colors hover:text-zinc-900">Comment ça marche</a></li>
                <li><a href="#tarifs" className="text-zinc-500 transition-colors hover:text-zinc-900">Tarifs</a></li>
                <li><a href="#faq" className="text-zinc-500 transition-colors hover:text-zinc-900">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">Compte</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/login" className="text-zinc-500 transition-colors hover:text-zinc-900">Connexion</Link></li>
                <li><Link href="/signup" className="text-zinc-500 transition-colors hover:text-zinc-900">Essai gratuit</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="mt-12 border-t border-orange-900/[0.06] pt-6 text-sm text-zinc-400">
          © {new Date().getFullYear()} LastChance — Les gains ne sont jamais conditionnés à un avis en ligne.
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div className={`${poppins.variable} ${fraunces.variable} relative flex-1 overflow-hidden text-zinc-800`}>
      {/* Fond chaleureux dégradé (rose/magenta sur les bords, pêche/crème au centre) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(52% 42% at 6% 0%, rgba(244,114,182,0.50), transparent 62%), radial-gradient(48% 40% at 100% 4%, rgba(217,70,239,0.38), transparent 60%), radial-gradient(50% 44% at 92% 26%, rgba(251,191,36,0.38), transparent 64%), radial-gradient(60% 50% at 20% 62%, rgba(251,146,60,0.30), transparent 66%), radial-gradient(75% 55% at 55% 112%, rgba(249,115,22,0.42), transparent 70%), linear-gradient(180deg, #fff0ea 0%, #fef3e6 45%, #fff6e8 100%)",
        }}
      />

      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Aller au contenu
      </a>

      <SiteHeader />

      <main id="contenu">
        <Hero />
        <HowItWorks />
        <Features />
        <MerchantSpace />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
