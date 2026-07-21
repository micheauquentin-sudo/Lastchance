import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { Avatar } from "@/lib/avatars";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollArrow } from "@/components/marketing/scroll-arrow";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";

/* DA « La Kermesse » : Lilita One pour les titres (voix foraine, ronde),
   Nunito 600-900 pour le corps. `--font-heading` est aussi consommé par
   HeroShowcase (labels de la roue, écran du téléphone). */
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

/* ─────────────────────────── Contenu ─────────────────────────── */

const HERO_CHIPS = [
  { label: "Prêt en 10 min", bg: "bg-k-blue", text: "text-k-ink" },
  { label: "Conforme RGPD", bg: "bg-k-green", text: "text-k-bg" },
  { label: "Sans engagement", bg: "bg-k-pink", text: "text-k-ink" },
  { label: "Vos clients adorent", bg: "bg-k-yellow", text: "text-k-ink" },
];

const STEPS = [
  {
    n: 1,
    dot: "bg-k-orange",
    tilt: "-rotate-[1.6deg]",
    title: "Posez votre QR code",
    description: "Sur le comptoir, le menu ou le ticket de caisse. Affiche A4 fournie.",
  },
  {
    n: 2,
    dot: "bg-k-yellow",
    tilt: "rotate-[1.3deg]",
    title: "Vos clients jouent",
    description: "Ils scannent, tournent la roue et découvrent leur gain immédiatement.",
  },
  {
    n: 3,
    dot: "bg-k-pink",
    tilt: "-rotate-[0.7deg]",
    title: "Vous encaissez les retours",
    description: "Gains validés en caisse, stats et emails collectés en temps réel.",
  },
];

const FEATURES = [
  { n: "01", dot: "bg-k-yellow", title: "QR codes & affiches prêtes", description: "Affiches A4 imprimables, quatre modèles au choix, QR personnalisés." },
  { n: "02", dot: "bg-k-blue", title: "Stats en temps réel", description: "Tours joués, taux de gagnants, scans — campagne par campagne." },
  { n: "03", dot: "bg-k-orange", title: "Roue 100 % personnalisable", description: "Couleurs, anneau, polices, pointeur : la roue ressemble à votre commerce." },
  { n: "04", dot: "bg-k-pink", title: "Validation en caisse", description: "Le staff saisit le code du gagnant et valide le gain en une seconde." },
  { n: "05", dot: "bg-k-green text-k-bg", title: "Conforme RGPD", description: "Consentement explicite, données en Europe, export CSV inclus." },
  { n: "06", dot: "bg-k-orange", title: "Emails de gain automatiques", description: "Chaque gagnant reçoit son code, au nom de votre établissement." },
];

const RISKS = [
  "Conditionner un avantage à un avis viole les règles de Google Business Profile",
  "Une fiche signalée peut être suspendue — invisible sur Maps et la recherche locale",
  "Les faux avis (même « incités ») ternissent la confiance des vrais clients",
];

const MERCHANT_POINTS = [
  "Campagnes illimitées",
  "Statistiques en temps réel",
  "Gestion des gains et des probabilités",
  "Export des joueurs et emails",
  "Compatible mobile",
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

const PRONO_POINTS = [
  "Vos clients pronostiquent chaque match depuis leur téléphone",
  "Résultats et classement mis à jour quasi en temps réel",
  "Vos récompenses pour les meilleurs — ils reviennent les chercher",
  "Pseudo + avatar, zéro compte à créer côté client",
];

const PRONO_COMPETITIONS = [
  "⚽ Ligue 1",
  "🏆 Coupe du monde",
  "⭐ Euro",
  "🌍 CAN",
  "🏉 6 Nations",
  "🎾 Roland-Garros",
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
  {
    question: "Comment fonctionne l'option Pronostics ?",
    answer:
      "Vous créez un championnat (Ligue 1, Euro, Coupe du monde…), vos clients scannent un QR code, choisissent un pseudo et un avatar, puis pronostiquent chaque match. Les résultats et le classement se mettent à jour automatiquement, et les meilleurs remportent les récompenses que vous définissez. L'option coûte 9 €/mois avec l'abonnement Starter — ou 49 € en Pass Compétition unique, sans abonnement.",
  },
];

/* ─────────────────────── Éléments partagés ─────────────────────── */

/** Pastille-titre de section (« COMMENT ÇA MARCHE », …). */
function KBadge({
  children,
  className = "bg-k-bg",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`k-border k-shadow-sm inline-block rounded-full px-5 py-1.5 text-sm font-black tracking-[0.1em] ${className}`}
    >
      {children}
    </span>
  );
}

/** CTA principal kermesse : pilule pleine sur socle encre qui s'écrase. */
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
      className="k-border inline-block whitespace-nowrap rounded-full bg-k-bg px-7 py-3.5 text-base font-black transition-colors hover:bg-k-ink/5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
    >
      {children}
    </Link>
  );
}

/** Coche verte des listes (langage kermesse : cercle plein + bordure). */
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

/** Trèfle à quatre feuilles souriant — mascotte du hero (pur CSS, fidèle
 *  à la maquette : 4 feuilles vertes, tige, visage, oscillation douce). */
function CloverMascot() {
  const leaf =
    "absolute w-[96px] h-[96px] bg-k-green k-border rounded-[50%_50%_16px_50%]";
  return (
    <div aria-hidden className="k-float relative z-[2] mx-auto h-[230px] w-[250px]">
      {/* tige */}
      <div className="k-border absolute left-1/2 top-[150px] h-[80px] w-[16px] -translate-x-1/2 rotate-[7deg] rounded-xl bg-k-green" />
      <div className="absolute left-1/2 top-0 h-[220px] w-[220px] -ml-[110px]">
        <div className="k-wobble absolute inset-0">
          <span className={`${leaf} left-[6px] top-[6px]`} />
          <span className={`${leaf} right-[6px] top-[6px] rotate-90`} />
          <span className={`${leaf} right-[6px] bottom-[6px] rotate-180`} />
          <span className={`${leaf} left-[6px] bottom-[6px] -rotate-90`} />
          {/* reflets */}
          <span className="absolute left-[30px] top-[26px] h-4 w-4 rounded-full bg-k-bg/85" />
          <span className="absolute right-[34px] top-[30px] h-[11px] w-[11px] rounded-full bg-k-bg/85" />
          <span className="absolute bottom-[34px] right-[28px] h-[13px] w-[13px] rounded-full bg-k-bg/85" />
          {/* visage */}
          <div className="k-border absolute left-1/2 top-1/2 z-[2] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-[5px] rounded-full bg-k-bg">
            <div className="mt-1.5 flex gap-4">
              <span className="h-3.5 w-2.5 rounded-full bg-k-ink" />
              <span className="h-3.5 w-2.5 rounded-full bg-k-ink" />
            </div>
            <div className="h-[15px] w-[30px] rounded-b-[30px] border-4 border-t-0 border-k-ink" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mini trèfle SVG (remplace l'emoji du sticker, même langage que la mascotte). */
function CloverGlyph({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 12c-2.6-.4-4.6-1-5.6-2.6a3.2 3.2 0 1 1 4.5-4.5C12.5 6 13 8 12.9 10.6 13.4 8 14 6 15.6 5a3.2 3.2 0 1 1 4.5 4.5c-1.6 1-3.6 1.4-6.2 1.4 2.6.4 4.6 1 5.6 2.6a3.2 3.2 0 1 1-4.5 4.5c-1-1.6-1.4-3.6-1.4-6.2-.4 2.6-1 4.6-2.6 5.6a3.2 3.2 0 1 1-4.5-4.5c1.6-1 3.6-1.5 6.1-1.5Z" />
      <path d="M12.5 13.5 11 21h2.4l-.9-7.5Z" />
    </svg>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-x-clip bg-k-bg px-5 pb-14 pt-12 text-center sm:px-8 sm:pt-14">
      {/* Stickers flottants (masqués sur mobile pour la lisibilité) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[3] hidden lg:block">
        {/* -20 % : losange jaune double */}
        <div className="k-float-b absolute left-[10%] top-[110px]">
          <div className="relative h-[120px] w-[120px]">
            <div className="k-border absolute inset-0 rotate-45 rounded-[22px] bg-k-yellow" />
            <div className="k-border absolute inset-0 rounded-[22px] bg-k-yellow" />
            <div className="absolute inset-0 flex -rotate-[8deg] items-center justify-center text-[28px]" style={DISPLAY}>
              -20%
            </div>
          </div>
        </div>
        <div className="k-float-c absolute right-[9%] top-[150px]">
          <span className="k-border k-shadow-sm inline-block rotate-[5deg] whitespace-nowrap rounded-full bg-k-pink px-6 py-3 text-2xl font-black">
            Café offert
          </span>
        </div>
        <div className="k-float-c absolute bottom-[130px] left-[6%]">
          <span className="k-border k-shadow-sm inline-block -rotate-[5deg] whitespace-nowrap rounded-full bg-k-blue px-6 py-3 text-xl font-black tracking-wide">
            SCAN & JOUE
          </span>
        </div>
        <div className="k-float-b absolute bottom-[120px] right-[7%]">
          <span className="k-border k-shadow-sm inline-flex rotate-[4deg] items-center gap-2 whitespace-nowrap rounded-full bg-k-green px-6 py-3 text-xl font-black text-k-bg">
            Toutes les chances
            <CloverGlyph className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="rise-in">
        <CloverMascot />
      </div>

      <h1
        className="rise-in mx-auto mt-6 max-w-[840px] text-[clamp(2.9rem,8vw,5.4rem)] leading-[1.02]"
        style={{ ...DISPLAY, animationDelay: "80ms" }}
      >
        La chance fait{" "}
        <span className="inline-block -rotate-[1.56deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1.5 shadow-[8px_8px_0_var(--color-k-ink)]">
          revenir
        </span>{" "}
        vos clients
      </h1>

      <p
        className="rise-in mx-auto mt-7 max-w-[520px] text-[19px] font-bold leading-[1.55] text-k-body"
        style={{ animationDelay: "160ms" }}
      >
        Un QR code sur le comptoir, une roue à vos couleurs, des gains que
        l&apos;on vient chercher. Prêt en 10 minutes, conforme RGPD.
      </p>

      <div
        className="rise-in mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
        style={{ animationDelay: "240ms" }}
      >
        <KPrimary href="/signup">Créer ma roue →</KPrimary>
        <KOutline href="#demo-roue">Voir la démo</KOutline>
      </div>

      <div
        className="rise-in mt-8 flex flex-wrap justify-center gap-2.5"
        style={{ animationDelay: "320ms" }}
      >
        {HERO_CHIPS.map((chip) => (
          <span
            key={chip.label}
            className={`k-border-thin rounded-full px-3.5 py-1.5 text-sm font-black ${chip.bg} ${chip.text}`}
          >
            {chip.label}
          </span>
        ))}
      </div>

      {/* Emplacement réservé au futur avatar-guide (aucun visuel) */}
      <div aria-hidden data-avatar-slot="hero" className="pointer-events-none absolute bottom-4 left-8 h-0 w-0" />
    </section>
  );
}

/** Ruban marquee jaune « SCANNEZ ★ TOURNEZ ★ GAGNEZ ★ REVENEZ ». */
function Marquee() {
  const line = "SCANNEZ ★ TOURNEZ ★ GAGNEZ ★ REVENEZ ★ ".repeat(3);
  return (
    <div aria-hidden className="ticker overflow-hidden border-y-[3px] border-k-ink bg-k-yellow py-3">
      <div className="ticker-track flex w-max whitespace-nowrap text-xl tracking-[0.06em]" style={DISPLAY}>
        <span className="pr-10">{line.trim()}</span>
        <span className="pr-10">{line.trim()}</span>
      </div>
    </div>
  );
}

/** Grand stand de démo : la vraie roue interactive dans son cadre forain. */
function WheelDemo() {
  return (
    <section id="demo-roue" className="relative scroll-mt-24 bg-k-blue px-5 py-16 sm:px-8 sm:py-20">
      <ScrollArrow />
      <div className="text-center">
        <Reveal>
          <KBadge>LA DÉMO, EN VRAI</KBadge>
          <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
            Essayez la roue, là, tout de suite.
          </h2>
        </Reveal>
      </div>
      <Reveal className="reveal-pop mx-auto mt-10 max-w-5xl" delay={120}>
        <Tilt3D intensity={15} scale={1.03}>
          <div className="k-border k-shadow-lg -rotate-[0.6deg] rounded-[22px] bg-k-bg p-3 sm:p-4">
            <div className="k-border k-stripes rounded-[14px] px-3 py-8 sm:px-8 sm:py-10">
              <HeroShowcase />
            </div>
          </div>
        </Tilt3D>
      </Reveal>
    </section>
  );
}

/** Flèche courbe pointillée entre les étapes (animée). */
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

/** Visuels des 3 étapes, fidèles à la maquette (QR, mini-roue, barres). */
function StepVisual({ step }: { step: number }) {
  if (step === 1) {
    return (
      <div className="k-border mb-4 mt-4 grid h-[86px] w-[86px] grid-cols-3 grid-rows-3 gap-[5px] rounded-[14px] bg-white p-2.5">
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
        <span /><span className="rounded-[3px] bg-k-orange" /><span />
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
      </div>
    );
  }
  if (step === 2) {
    return (
      <div
        className="k-border k-spin mb-4 mt-4 h-[86px] w-[86px] rounded-full"
        style={{ background: "conic-gradient(var(--color-k-orange) 0 25%, var(--color-k-yellow) 0 50%, var(--color-k-pink) 0 75%, var(--color-k-blue) 0 100%)" }}
      />
    );
  }
  return (
    <div className="k-border mb-4 mt-4 flex h-[86px] w-[86px] items-end gap-2 rounded-[14px] bg-white p-3">
      <span className="k-border-thin h-[38%] flex-1 rounded-t-md bg-k-pink" />
      <span className="k-border-thin h-[64%] flex-1 rounded-t-md bg-k-yellow" />
      <span className="k-border-thin h-[88%] flex-1 rounded-t-md bg-k-green" />
    </div>
  );
}

function Steps() {
  return (
    <section id="comment-ca-marche" className="scroll-mt-24 border-y-[3px] border-k-ink bg-k-yellow px-5 py-16 sm:px-8 sm:py-20">
      <Reveal className="text-center">
        <KBadge>COMMENT ÇA MARCHE</KBadge>
        <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
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
                  <div className="k-border k-shadow-lg relative w-full max-w-[340px] rounded-[22px] bg-k-bg px-8 pb-8 pt-9">
                    <span
                      className={`k-border absolute -top-6 left-6 flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${step.dot}`}
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
    <section id="fonctionnalites" className="scroll-mt-24 bg-k-bg px-5 py-16 sm:px-8 sm:py-20">
      <Reveal className="text-center">
        <KBadge className="rotate-[1.3deg] bg-k-yellow">LA BOÎTE À OUTILS</KBadge>
        <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
          Tout ce qu&apos;il faut, rien de superflu.
        </h2>
      </Reveal>

      <div className="mx-auto mt-11 grid max-w-[1200px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.n} delay={(i % 3) * 90} className={["reveal-tilt-l", "reveal-pop", "reveal-tilt-r"][i % 3]}>
            <div className={i % 2 ? "-rotate-[0.65deg]" : "rotate-[0.65deg]"}>
              <Tilt3D>
                <div
                  className="k-border k-shadow-md h-full rounded-[22px] bg-white p-6 transition-transform duration-300 hover:-translate-y-1.5"
                >
                  <span
                    className={`k-border inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${f.dot}`}
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

/** Grande carte verte « Notre différence » : le jeu honnête. */
function HonestGame() {
  return (
    <Reveal className="reveal-pop mx-auto mt-14 max-w-[1200px]" delay={80}>
      <Tilt3D intensity={6}>
        <div className="k-border k-shadow-lg grid gap-9 rounded-[22px] bg-k-green p-7 text-k-bg sm:p-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <KBadge>NOTRE DIFFÉRENCE</KBadge>
            <h3 className="mt-4 text-[clamp(1.7rem,3vw,2.1rem)] leading-tight" style={DISPLAY}>
              Un jeu honnête,<br />pas un piège à avis.
            </h3>
            {/* text-k-bg (4.59:1 sur k-green) : #dcefe4 et les alphas /85
                passaient sous 4.5:1 — axe color-contrast (serious). */}
            <p className="mt-3.5 text-[15.5px] font-bold leading-[1.55] text-k-bg">
              Le gain n&apos;est jamais conditionné à un avis, un like ou un
              abonnement. Vos clients jouent, gagnent, reviennent — et si un
              avis arrive, il est spontané. Votre fiche Google ne prend aucun
              risque.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3.5">
            {RISKS.map((risk, i) => (
              <div
                key={risk}
                className={`k-border flex items-center gap-3 rounded-2xl bg-k-bg px-4 py-3 text-[13.5px] font-extrabold text-k-ink ${
                  i % 2 ? "rotate-[0.65deg]" : "-rotate-[0.65deg]"
                }`}
              >
                <KCross />
                {risk}
              </div>
            ))}
            <div className="k-border rotate-[0.65deg] rounded-2xl bg-k-yellow px-4 py-3.5 text-[14.5px] font-extrabold text-k-ink">
              <div className="flex items-center gap-3">
                <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-bg">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                « Tournez, gagnez, un point c&apos;est tout » — fiche protégée
              </div>
            </div>
          </div>
        </div>
      </Tilt3D>
    </Reveal>
  );
}

/* ── Aperçu du dashboard (maquette décorative, données fictives) ── */

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
  const navItems = ["Tableau de bord", "Campagnes", "Joueurs", "Gains", "Statistiques", "QR Codes", "Paramètres"];
  const stats = [
    { label: "Joueurs", value: "1 286", delta: "+18%" },
    { label: "Emails collectés", value: "342", delta: "+27%" },
    { label: "Taux de participation", value: "34%", delta: "+13%" },
    { label: "Gains distribués", value: "412", delta: "+15%" },
  ];
  return (
    <div className="k-border k-shadow-lg overflow-hidden rounded-[22px] bg-white">
      <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr]">
        {/* Sidebar */}
        <aside className="border-r-[2.5px] border-k-ink bg-k-bg p-3">
          <p className="px-2 text-sm" style={DISPLAY}>
            LastChance<span className="text-k-orange">.</span>
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

        {/* Main */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-k-ink">Tableau de bord</p>
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
              <p className="text-xs font-black text-k-ink">Top gains</p>
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
    <section id="espace-commercant" className="scroll-mt-24 border-t-[3px] border-k-ink bg-k-bg px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal className="reveal-tilt-l">
          <KBadge className="bg-k-blue">VOTRE ESPACE</KBadge>
          <h2 className="mt-5 text-[clamp(2rem,4vw,2.8rem)] leading-tight" style={DISPLAY}>
            Tout est centralisé, vous gardez le contrôle.
          </h2>
          <ul className="mt-8 space-y-3.5">
            {MERCHANT_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 font-bold text-k-body">
                <KCheck />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <KPrimary href="/signup" className="bg-k-yellow text-k-ink">
              Découvrir le dashboard →
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

/** Mockup de classement pronostics — vrais avatars du produit. */
function PronoLeaderboardMockup() {
  const rows = [
    { avatar: "bresil", name: "Leïla", pts: "21 pts", rank: "🥇" },
    { avatar: "renard", name: "Le Sorcier", pts: "19 pts", rank: "🥈" },
    { avatar: "maroc", name: "Yassine", pts: "16 pts", rank: "🥉" },
    { avatar: "france", name: "Marco", pts: "14 pts", rank: "4" },
  ];
  return (
    <div className="k-border k-shadow-lg rounded-[22px] bg-k-bg p-6">
      <p className="text-[15px] font-black text-k-ink">🏆 Classement — Coupe du monde</p>
      <p className="mt-0.5 text-xs font-bold text-k-body">Chez Momo · 27 joueurs</p>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li
            key={r.name}
            className="flex items-center gap-3 rounded-xl border-2 border-k-ink bg-white px-3 py-2"
          >
            <span className="w-6 text-center text-sm font-black text-k-ink">{r.rank}</span>
            <Avatar id={r.avatar} className="h-8 w-8 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-k-ink">
              {r.name}
            </span>
            <span className="text-sm font-black tabular-nums text-k-ink">{r.pts}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border-2 border-dashed border-k-ink/50 px-3 py-2 text-center text-xs font-extrabold text-k-body">
        France 2 – 1 Brésil · pronostic exact <span className="rounded-full bg-k-yellow px-2 py-0.5 font-black text-k-ink">+3 pts</span>
      </div>
    </div>
  );
}

function Pronostics() {
  return (
    <section id="pronostics" className="scroll-mt-24 border-t-[3px] border-k-ink bg-k-green px-5 py-16 text-k-bg sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <Reveal className="reveal-tilt-l">
          <KBadge className="-rotate-[1.2deg] bg-k-yellow text-k-ink">NOUVEAU · EN OPTION</KBadge>
          <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05]" style={DISPLAY}>
            Les grandes compétitions se jouent aussi chez vous.
          </h2>
          {/* text-k-bg plein : /85 sur k-green tombait à 3.78:1 (axe serious). */}
          <p className="mt-4 max-w-[520px] text-[17px] font-bold leading-[1.55] text-k-bg">
            Avec l&apos;option <strong>Pronostics</strong>, votre commerce a son
            propre championnat : un QR code, vos clients pronostiquent les
            matchs, et le classement anime le comptoir pendant toute la
            compétition.
          </p>
          <ul className="mt-6 flex flex-col gap-2.5 text-[15px] font-extrabold">
            {PRONO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <KCheck />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {PRONO_COMPETITIONS.map((c) => (
              <span
                key={c}
                className="k-border-thin rounded-full bg-k-bg px-3 py-1 text-[13px] font-black text-k-ink"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <KPrimary href="#tarifs" className="bg-k-yellow text-k-ink">
              Voir l&apos;offre →
            </KPrimary>
            {/* text-k-bg plein : /80 sur k-green tombait à 3.54:1 (axe serious). */}
            <span className="text-sm font-black text-k-bg">
              +9 €/mois avec Starter · ou Pass Compétition 49 €
            </span>
          </div>
        </Reveal>

        <Reveal delay={120} className="reveal-tilt-r">
          <div className="k-float-c">
            <div className="rotate-[1deg]">
              <Tilt3D intensity={8}>
                <PronoLeaderboardMockup />
              </Tilt3D>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const PRONO_OFFER_FEATURES = [
  "Championnats illimités pendant la période",
  "Calendriers et résultats automatiques",
  "Classement public + récompenses par rang",
  "Pseudos et avatars pour vos clients",
];

function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-24 border-t-[3px] border-k-ink bg-k-pink px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <Reveal className="text-center">
          <KBadge>TARIFS</KBadge>
          <h2 className="mt-4 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05]" style={DISPLAY}>
            Un prix simple. Une option sport.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-base font-bold leading-[1.55] text-[#4d3a44]">
            Pas de paliers compliqués : un abonnement tout inclus, et le
            module Pronostics en option — avec ou sans abonnement. Sans
            engagement, résiliable à tout moment.
          </p>
        </Reveal>

        <div className="mt-12 grid items-start justify-center gap-10 md:grid-cols-2 md:gap-8">
          <Reveal delay={80} className="reveal-pop w-full max-w-[400px] justify-self-center md:justify-self-end">
            <div className="k-float-c">
              <div className="rotate-[0.65deg]">
                <Tilt3D>
                  <div className="k-border k-shadow-lg relative rounded-[22px] bg-k-bg p-8 sm:p-10">
                    <span className="k-border k-shadow-sm absolute -top-4 right-6 rotate-[3deg] rounded-full bg-k-yellow px-4 py-1.5 text-[13px] font-black">
                      7 jours offerts
                    </span>
                    {/* Emplacement réservé au futur avatar-guide (aucun visuel) */}
                    <span aria-hidden data-avatar-slot="pricing" className="pointer-events-none absolute -left-6 top-8 h-0 w-0" />
                    <div className="text-[22px]" style={DISPLAY}>Starter</div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-[56px] leading-none" style={DISPLAY}>29 €</span>
                      <span className="text-lg font-black text-[#6d675c]">/ mois</span>
                    </div>
                    <div className="my-5 border-t-[3px] border-dashed border-k-ink" />
                    <ul className="flex flex-col gap-2.5 text-[15px] font-extrabold">
                      {PRICING_FEATURES.map((f) => (
                        <li key={f} className="flex items-center gap-2.5">
                          <KCheck />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/signup"
                      className="k-border k-btn mt-6 block rounded-full bg-k-orange py-3.5 text-center text-[17px] font-black focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
                    >
                      Commencer l&apos;essai gratuit
                    </Link>
                  </div>
                </Tilt3D>
              </div>
            </div>
          </Reveal>

          <Reveal delay={160} className="reveal-pop w-full max-w-[400px] justify-self-center md:justify-self-start">
            <div className="-rotate-[0.65deg]">
              <Tilt3D>
                <div className="k-border k-shadow-lg relative rounded-[22px] bg-k-bg p-8 sm:p-10">
                  <span className="k-border k-shadow-sm absolute -top-4 right-6 -rotate-[3deg] rounded-full bg-k-green px-4 py-1.5 text-[13px] font-black text-k-bg">
                    OPTION SPORT
                  </span>
                  <div className="text-[22px]" style={DISPLAY}>Pronostics</div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="text-[56px] leading-none" style={DISPLAY}>+9 €</span>
                    <span className="text-lg font-black text-[#6d675c]">/ mois</span>
                  </div>
                  <p className="mt-1 text-sm font-extrabold text-k-body">
                    en option de l&apos;abonnement Starter
                  </p>
                  <div className="my-5 rounded-xl border-2 border-dashed border-k-ink px-4 py-3 text-center">
                    <p className="text-sm font-black text-k-ink">
                      Sans abonnement ? <span className="whitespace-nowrap">Pass Compétition — 49 €</span>
                    </p>
                    <p className="mt-1 text-xs font-bold text-k-body">
                      Paiement unique · toute la compétition (Euro, Coupe du
                      monde, CAN…) jusqu&apos;à une semaine après la finale.
                    </p>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-[15px] font-extrabold">
                    {PRONO_OFFER_FEATURES.map((f) => (
                      <li key={f} className="flex items-center gap-2.5">
                        <KCheck />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className="k-border k-btn mt-6 block rounded-full bg-k-green py-3.5 text-center text-[17px] font-black text-k-bg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
                  >
                    Lancer mon championnat
                  </Link>
                  <p className="mt-3 text-center text-[11.5px] font-bold text-k-body">
                    Activation depuis votre espace après inscription.
                  </p>
                </div>
              </Tilt3D>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t-[3px] border-k-ink bg-k-bg px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <KBadge className="-rotate-[1deg] bg-k-blue">FAQ</KBadge>
          <h2 className="mt-5 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
            Questions fréquentes
          </h2>
        </Reveal>

        <div className="mt-11 space-y-4">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details
                className={`k-border k-shadow-sm group rounded-[18px] bg-white transition-transform open:translate-y-0.5 ${
                  i % 2 ? "rotate-[0.4deg]" : "-rotate-[0.4deg]"
                }`}
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
      </div>
    </section>
  );
}

function FinalCtaFooter() {
  return (
    <div className="border-t-[3px] border-k-ink bg-k-ink px-5 pt-16 text-center text-k-bg sm:px-8 sm:pt-20">
      <Reveal className="reveal-pop relative mx-auto max-w-4xl">
        {/* Emplacement réservé au futur avatar-guide (aucun visuel) */}
        <span aria-hidden data-avatar-slot="final-cta" className="pointer-events-none absolute -top-6 left-0 h-0 w-0" />
        <h2 className="text-[clamp(2.3rem,6vw,4.4rem)] leading-[1.05]" style={DISPLAY}>
          Votre roue peut tourner dès ce soir.
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-[17px] font-bold text-[#b8b2a4]">
          Créez votre compte, composez vos lots, imprimez votre affiche.
          7 jours pour l&apos;essayer avec vos vrais clients.
        </p>
        <div className="mt-7 flex justify-center">
          <Magnetic>
            <Link
              href="/signup"
              className="k-btn-light inline-block whitespace-nowrap rounded-full border-[3px] border-k-bg bg-k-yellow px-9 py-4 text-lg font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-bg"
            >
              Créer ma roue →
            </Link>
          </Magnetic>
        </div>
      </Reveal>

      <footer className="mt-14 border-t-2 border-[#b8b2a4]/35 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-[13.5px] font-bold text-[#8d8778] sm:flex-row">
          <span className="text-lg text-k-bg" style={DISPLAY}>
            LastChance<span className="text-k-orange">.</span>
          </span>
          <nav aria-label="Pied de page" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <a href="#fonctionnalites" className="transition-colors hover:text-k-bg">Fonctionnalités</a>
            <a href="#pronostics" className="transition-colors hover:text-k-bg">Pronostics</a>
            <a href="#tarifs" className="transition-colors hover:text-k-bg">Tarifs</a>
            <a href="#faq" className="transition-colors hover:text-k-bg">FAQ</a>
            <Link href="/login" className="transition-colors hover:text-k-bg">Connexion</Link>
            <Link href="/signup" className="transition-colors hover:text-k-bg">Essai gratuit</Link>
          </nav>
          <span>© {new Date().getFullYear()} — Jamais de gain contre un avis.</span>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-hidden bg-k-bg text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />

      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="outline-none">
        <Hero />
        <Marquee />
        <WheelDemo />
        <Steps />
        <Features />
        <Pronostics />
        <MerchantSpace />
        <Pricing />
        <Faq />
        <FinalCtaFooter />
      </main>

      {/* Mascotte Lumoz désactivée pour le moment. Pour la réactiver :
          importer LumozGuide (components/marketing/lumoz-guide) et
          monter <LumozGuide /> ici. */}
    </div>
  );
}
