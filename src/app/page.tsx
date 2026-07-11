import { Fraunces } from "next/font/google";
import Link from "next/link";
import { HeroWheel } from "@/components/marketing/hero-wheel";
import { Magnetic } from "@/components/marketing/magnetic";
import { Manifesto } from "@/components/marketing/manifesto";
import { Reveal } from "@/components/marketing/reveal";
import { SiteHeader } from "@/components/marketing/site-header";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { TiltCard } from "@/components/marketing/tilt-card";

/* Police d'affichage éditoriale (titres) — la voix « fête foraine chic »
   de la page ; le corps de texte reste en Geist. */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

/* ─────────────────────────── Contenu ─────────────────────────── */

const TICKER_PRIZES = [
  "Café offert",
  "-10 % sur l'addition",
  "Dessert offert",
  "Retentez votre chance",
  "Apéro offert",
  "-20 % sur le panier",
  "Surprise du chef",
  "Boisson offerte",
];

const STEPS = [
  {
    title: "Composez votre roue",
    description:
      "Vos lots, vos couleurs, vos probabilités, vos stocks. Imprimez l'affiche A4 avec son QR code : dix minutes, montre en main.",
  },
  {
    title: "Vos clients la font tourner",
    description:
      "Un scan à table ou en caisse, la roue tourne, le gain tombe. Aucune application, aucun compte : le navigateur du téléphone suffit.",
  },
  {
    title: "Ils reviennent chercher leur gain",
    description:
      "Le code du gagnant se valide en un geste sur la page caisse. Chaque lot distribué est une visite de plus — et elle se voit dans vos stats.",
  },
];

const FEATURES = [
  {
    title: "Une roue à votre image",
    description:
      "Six ambiances et chaque détail réglable : anneau, ampoules, polices, couleurs. La roue porte les couleurs de votre maison, pas celles d'un logiciel.",
  },
  {
    title: "QR codes & affiches prêtes",
    description:
      "QR codes personnalisés, affiches A4 imprimables, quatre modèles. Posez, scannez, jouez.",
  },
  {
    title: "Validation en un geste",
    description:
      "Une page caisse pensée mobile : le staff saisit le code, le gain est validé. Même en plein coup de feu.",
  },
  {
    title: "Des chiffres qui parlent",
    description:
      "Tours joués, taux de gagnants, gains à retirer, scans par QR code — campagne par campagne, en temps réel.",
  },
  {
    title: "RGPD sans effort",
    description:
      "Consentement explicite, données hébergées en Europe, export maîtrisé. Et jamais de gain contre un avis en ligne.",
  },
  {
    title: "Le gain revient tout seul",
    description:
      "Chaque gagnant reçoit son code par email, au nom de votre établissement. Un rappel élégant de repasser vous voir.",
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
        className={`group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-b from-amber-300 to-amber-500 font-semibold text-stone-950 shadow-[0_8px_32px_rgba(202,138,4,0.35)] transition-all duration-200 hover:shadow-[0_12px_44px_rgba(202,138,4,0.5)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 ${
          large ? "px-9 py-4 text-base" : "px-7 py-3.5 text-sm sm:text-base"
        }`}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/40 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
          style={{ transform: "skewX(-18deg)" }}
        />
        {children}
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </Magnetic>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/90">
      <span aria-hidden className="h-px w-10 bg-gradient-to-r from-transparent to-amber-300/50" />
      {children}
      <span aria-hidden className="h-px w-10 bg-gradient-to-l from-transparent to-amber-300/50" />
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-balance font-[family-name:var(--font-display)] text-4xl font-medium tracking-tight text-stone-50 sm:text-5xl">
        {title}
      </h2>
      {description && (
        <p className="mt-5 text-pretty text-lg leading-relaxed text-stone-400">{description}</p>
      )}
    </Reveal>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="mt-0.5 shrink-0 text-amber-300"
    >
      <circle cx="9" cy="9" r="8" fill="currentColor" opacity="0.14" />
      <path
        d="M5.5 9.2 8 11.7l4.5-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden pt-16">
      {/* Voûte lumineuse au-dessus de la roue */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(202,138,4,0.14),transparent_70%)]"
      />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-5 pb-8 pt-14 text-center sm:px-6">
        <div className="rise-in">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-4 py-1.5 text-xs font-medium tracking-wide text-amber-100/90">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Le jeu qui fait revenir les clients
          </span>
        </div>

        <h1
          className="rise-in mt-7 text-balance font-[family-name:var(--font-display)] text-5xl font-medium leading-[1.04] tracking-tight text-stone-50 sm:text-6xl lg:text-7xl"
          style={{ animationDelay: "90ms" }}
        >
          Faites tourner
          <br />
          <em className="bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text pr-1 not-italic text-transparent [font-style:italic]">
            l&apos;envie de revenir
          </em>
        </h1>

        <p
          className="rise-in mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-stone-400"
          style={{ animationDelay: "180ms" }}
        >
          Un QR code sur votre comptoir, une roue à vos couleurs, des gains
          que l&apos;on revient chercher. Prêt en 10 minutes, conforme RGPD.
        </p>

        <div
          className="rise-in mt-9 flex flex-col items-center gap-4 sm:flex-row"
          style={{ animationDelay: "270ms" }}
        >
          <PrimaryCta href="/signup">Créer ma roue</PrimaryCta>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-white/12 px-7 py-3.5 text-sm font-semibold text-stone-200 transition-all duration-200 hover:border-amber-300/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 sm:text-base"
          >
            Espace commerçant
          </Link>
        </div>

        <p className="rise-in mt-7 text-sm text-stone-500" style={{ animationDelay: "360ms" }}>
          7 jours d&apos;essai gratuit · Sans engagement · Aucune application à installer
        </p>
      </div>

      {/* La roue-horizon : coupée par le bas du hero, elle tourne au scroll. */}
      <div className="relative -mb-[44vw] sm:-mb-[340px]">
        <HeroWheel />
      </div>

      {/* Fondu vers le noir pour asseoir la roue dans la page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-stone-950 to-transparent"
      />
    </section>
  );
}

function Ticker() {
  const strip = [...TICKER_PRIZES, ...TICKER_PRIZES];
  return (
    <section
      aria-label="Exemples de lots"
      className="ticker relative overflow-hidden border-y border-amber-300/15 bg-stone-950 py-4"
    >
      <div className="ticker-track flex w-max items-center">
        {strip.map((prize, i) => (
          <span
            key={i}
            aria-hidden={i >= TICKER_PRIZES.length}
            className="flex items-center gap-6 pr-6 font-[family-name:var(--font-display)] text-sm uppercase tracking-[0.22em] text-stone-400"
          >
            {prize}
            <span aria-hidden className="text-amber-400/70">
              ✦
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

function ManifestoSection() {
  return (
    <section className="px-5 py-28 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-3xl text-center font-[family-name:var(--font-display)] text-3xl font-medium leading-snug tracking-tight text-stone-100 sm:text-[2.6rem] sm:leading-[1.3]">
        <Manifesto text="Un scan. Un tour de roue. Un gain à venir chercher. Vos clients ne font plus que passer — ils reviennent." />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="comment-ca-marche" className="scroll-mt-24 border-t border-white/[0.05] py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Comment ça marche"
          title="Trois temps, comme au manège"
          description="Ni matériel, ni application, ni formation. Une affiche sur le comptoir suffit."
        />

        <div className="mt-20 space-y-0">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 80}>
              <div className="group grid items-baseline gap-4 border-t border-white/[0.06] py-10 transition-colors duration-300 last:border-b hover:bg-white/[0.02] sm:grid-cols-[140px_1fr] sm:gap-10 sm:px-6">
                <span
                  aria-hidden
                  className="text-outline font-[family-name:var(--font-display)] text-6xl font-semibold transition-all duration-300 group-hover:[-webkit-text-stroke-color:rgba(252,211,77,0.75)] sm:text-7xl"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-medium text-stone-50">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-2xl leading-relaxed text-stone-400">
                    {step.description}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="fonctionnalites" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title="Tout ce qu'il faut, rien de superflu"
          description="Un outil complet pensé pour le quotidien d'un commerce, pas pour une équipe marketing."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 90}>
              <TiltCard className="h-full">
                <div className="flex h-full flex-col rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-7 transition-colors duration-300 hover:border-amber-300/25">
                  <span
                    aria-hidden
                    className="font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-amber-300/70"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 font-[family-name:var(--font-display)] text-xl font-medium text-stone-50">
                    {feature.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-stone-400">
                    {feature.description}
                  </p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Aperçu stylisé de l'espace commerçant (maquette décorative, données fictives). */
function DashboardPreview() {
  return (
    <div
      aria-hidden
      className="relative select-none rounded-2xl border border-white/10 bg-stone-900/70 p-2 shadow-2xl shadow-black/50 backdrop-blur"
    >
      <div className="rounded-xl bg-stone-950/85 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
          </div>
          <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-stone-500">
            lastchance.app/dashboard
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Tours joués", value: "1 284" },
            { label: "Taux de gagnants", value: "42 %" },
            { label: "Gains à valider", value: "12", accent: true },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg border p-3 ${
                stat.accent
                  ? "border-amber-300/30 bg-amber-300/[0.07]"
                  : "border-white/[0.06] bg-white/[0.03]"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-stone-500">{stat.label}</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  stat.accent ? "text-amber-200" : "text-stone-50"
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {[
            { name: "Léa M.", prize: "Café offert", code: "GAIN-7F3K", done: true },
            { name: "Karim B.", prize: "-10 % sur l'addition", code: "GAIN-2XQ8", done: false },
            { name: "Sophie D.", prize: "Dessert offert", code: "GAIN-9MC4", done: false },
          ].map((row) => (
            <div
              key={row.code}
              className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-200">{row.prize}</p>
                <p className="font-mono text-[11px] text-stone-500">
                  {row.code} · {row.name}
                </p>
              </div>
              <span
                className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  row.done
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {row.done ? "Récupéré" : "À valider"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductShowcase() {
  return (
    <section className="border-t border-white/[0.05] py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/90">
            <span aria-hidden className="h-px w-10 bg-amber-300/50" />
            Espace commerçant
          </p>
          <h2 className="mt-5 text-balance font-[family-name:var(--font-display)] text-4xl font-medium tracking-tight text-stone-50 sm:text-5xl">
            Les coulisses, aussi soignées que la scène
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-stone-400">
            Campagnes, lots, stocks, participations : tout est au même
            endroit. Vous voyez en un coup d&apos;œil ce que la roue rapporte
            et ce qu&apos;il reste à valider en caisse.
          </p>
          <ul className="mt-8 space-y-3.5">
            {[
              "Suivi des tours joués et du taux de gagnants par campagne",
              "File « Gains à valider » avec recherche par code, prénom ou email",
              "Stocks de lots décomptés automatiquement, export CSV en un clic",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-stone-300">
                <CheckIcon />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <TiltCard maxDeg={3}>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-3xl bg-[radial-gradient(circle_at_30%_20%,rgba(202,138,4,0.14),transparent_60%)] blur-xl"
              />
              <DashboardPreview />
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-24 border-t border-white/[0.05] py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Tarifs"
          title="Un prix simple, tout inclus"
          description="Pas d'options cachées ni de paliers compliqués : une offre unique qui couvre tout."
        />

        <Reveal className="mx-auto mt-14 max-w-md" delay={100}>
          <SpotlightCard className="group relative overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-8 shadow-2xl shadow-black/40 sm:p-10">
            {/* Halo doré qui suit le curseur */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(420px circle at var(--mx, 50%) var(--my, 40%), rgba(202,138,4,0.13), transparent 65%)",
              }}
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-medium text-stone-50">
                  Starter
                </h3>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  7 jours offerts
                </span>
              </div>
              <p className="mt-7 flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-display)] text-6xl font-medium tracking-tight text-stone-50">
                  29 €
                </span>
                <span className="text-stone-400">/ mois</span>
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Sans engagement, résiliable à tout moment.
              </p>

              <ul className="mt-8 space-y-3">
                {PRICING_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-stone-300">
                    <CheckIcon />
                    <span className="leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10">
                <PrimaryCta href="/signup" large>
                  Commencer l&apos;essai gratuit
                </PrimaryCta>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-white/[0.05] py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions fréquentes" />

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] transition-colors open:border-amber-300/25 open:bg-white/[0.045]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 font-medium text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <svg
                    aria-hidden
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="shrink-0 text-stone-500 transition-transform duration-300 group-open:rotate-45 group-open:text-amber-300"
                  >
                    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="px-6 pb-6 leading-relaxed text-stone-400">{item.answer}</p>
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
    <section className="relative overflow-hidden border-t border-white/[0.05] px-5 py-28 text-center sm:px-6 sm:py-36">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_60%_70%_at_50%_110%,rgba(202,138,4,0.16),transparent_70%)]"
      />
      <Reveal className="relative mx-auto max-w-2xl">
        <Eyebrow>À vous de jouer</Eyebrow>
        <h2 className="mt-5 text-balance font-[family-name:var(--font-display)] text-4xl font-medium tracking-tight text-stone-50 sm:text-6xl">
          Votre roue peut tourner
          <br />
          dès ce soir
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-stone-400">
          Créez votre compte, composez vos lots, imprimez votre affiche.
          7 jours pour l&apos;essayer avec vos vrais clients.
        </p>
        <div className="mt-10 flex justify-center">
          <PrimaryCta href="/signup" large>
            Créer ma roue
          </PrimaryCta>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.05]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-stone-50">
              Lastchance<span className="text-amber-300">.</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-500">
              La roue de la fortune par QR code qui fait revenir les clients
              des commerces de proximité.
            </p>
          </div>

          <nav aria-label="Pied de page" className="flex gap-16">
            <div>
              <p className="text-sm font-semibold text-stone-100">Produit</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a href="#fonctionnalites" className="text-stone-400 transition-colors hover:text-white">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a href="#comment-ca-marche" className="text-stone-400 transition-colors hover:text-white">
                    Comment ça marche
                  </a>
                </li>
                <li>
                  <a href="#tarifs" className="text-stone-400 transition-colors hover:text-white">
                    Tarifs
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-stone-400 transition-colors hover:text-white">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-100">Compte</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link href="/login" className="text-stone-400 transition-colors hover:text-white">
                    Connexion
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-stone-400 transition-colors hover:text-white">
                    Essai gratuit
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 border-t border-white/[0.05] pt-6 text-sm text-stone-600">
          © {new Date().getFullYear()} Lastchance — Les gains ne sont jamais
          conditionnés à un avis en ligne.
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div className={`${fraunces.variable} grain flex-1 bg-stone-950 text-stone-100`}>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-stone-950"
      >
        Aller au contenu
      </a>

      <SiteHeader />

      <main id="contenu">
        <Hero />
        <Ticker />
        <ManifestoSection />
        <HowItWorks />
        <Features />
        <ProductShowcase />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
