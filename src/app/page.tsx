import Link from "next/link";
import { HeroWheel } from "@/components/marketing/hero-wheel";
import { Reveal } from "@/components/marketing/reveal";
import { SiteHeader } from "@/components/marketing/site-header";

/* ─────────────────────────── Contenu ─────────────────────────── */

const AUDIENCES = [
  "Restaurants",
  "Bars & cafés",
  "Boulangeries",
  "Boutiques",
  "Salons de coiffure",
  "Instituts de beauté",
  "Food trucks",
  "Cavistes",
];

const STEPS = [
  {
    title: "Créez votre roue",
    description:
      "Choisissez vos lots, vos couleurs et vos probabilités. Imprimez l'affiche A4 avec son QR code — tout est prêt en 10 minutes.",
  },
  {
    title: "Vos clients jouent",
    description:
      "Un scan, un tour de roue, un gain. Aucune application à installer : tout se passe dans le navigateur du téléphone.",
  },
  {
    title: "Ils reviennent le récupérer",
    description:
      "Le client présente son code en caisse, vous le validez en un geste. Chaque gain est une visite de plus dans votre commerce.",
  },
];

const FEATURES = [
  {
    title: "Roue 100 % personnalisable",
    description:
      "6 presets et un réglage fin de chaque détail : couleurs, anneau, ampoules, polices, pointeur. La roue ressemble à votre commerce, pas à un logiciel.",
    icon: (
      <path
        d="M12 3a9 9 0 1 0 9 9M12 3v9m0 0 6.4-6.4M12 12l4 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "QR codes & affiches prêtes",
    description:
      "Générez des QR codes personnalisés et des affiches A4 imprimables avec 4 modèles au choix. Posez-les sur le comptoir, c'est parti.",
    icon: (
      <path
        d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2.5v2.5H14V14Zm3.5 3.5H20V20h-2.5v-2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Validation en caisse",
    description:
      "Une page dédiée, pensée mobile : le staff saisit le code du client et valide le gain en une seconde, même en plein coup de feu.",
    icon: (
      <path
        d="M4 7h16M4 7v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7M4 7l2-3h12l2 3M9 12l2.2 2.2L15.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Statistiques en temps réel",
    description:
      "Tours joués, taux de gagnants, gains à valider, scans par QR code : vous savez exactement ce que la roue rapporte, campagne par campagne.",
    icon: (
      <path
        d="M4 20V10m5.5 10V4m5.5 16v-8m5 8V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: "Conforme RGPD",
    description:
      "Consentement explicite, données hébergées en Europe, export CSV maîtrisé. Et jamais de gain conditionné à un avis en ligne.",
    icon: (
      <path
        d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Zm-3 9 2.2 2.2L15.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Emails de gain automatiques",
    description:
      "Chaque gagnant reçoit son code par email avec le nom de votre établissement. Un rappel de plus de revenir vous voir.",
    icon: (
      <path
        d="M4 6h16v12H4V6Zm0 1 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    <Link
      href={href}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold text-white shadow-lg shadow-violet-950/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-900/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 active:translate-y-0 ${
        large ? "px-8 py-4 text-base" : "px-6 py-3 text-sm sm:text-base"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/20 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
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
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-400">
          {description}
        </p>
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
      className="mt-0.5 shrink-0 text-violet-400"
    >
      <circle cx="9" cy="9" r="8" fill="currentColor" opacity="0.15" />
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
    <section className="relative overflow-hidden pt-16">
      {/* Fond : grille discrète + halos violets */}
      <div
        aria-hidden
        className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 h-[560px] w-[880px] -translate-x-1/2 rounded-full bg-violet-700/20 blur-[130px]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
        <div className="text-center lg:text-left">
          <div className="rise-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Nouveau — éditeur d&apos;affiche A4 intégré
            </span>
          </div>

          <h1
            className="rise-in mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Transformez chaque passage en{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              client fidèle
            </span>
          </h1>

          <p
            className="rise-in mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-zinc-400 lg:mx-0"
            style={{ animationDelay: "160ms" }}
          >
            Vos clients scannent un QR code, tournent la roue et gagnent des
            récompenses que vous maîtrisez. Ils reviennent les chercher —
            simple, conforme RGPD, prêt en 10 minutes.
          </p>

          <div
            className="rise-in mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            style={{ animationDelay: "240ms" }}
          >
            <PrimaryCta href="/signup">Créer ma roue gratuitement</PrimaryCta>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 active:translate-y-0 sm:text-base"
            >
              Espace commerçant
            </Link>
          </div>

          <p
            className="rise-in mt-6 text-sm text-zinc-500"
            style={{ animationDelay: "320ms" }}
          >
            7 jours d&apos;essai gratuit · Sans engagement · Aucune application
            à installer
          </p>
        </div>

        <div className="rise-in" style={{ animationDelay: "200ms" }}>
          <HeroWheel />
        </div>
      </div>
    </section>
  );
}

function Audiences() {
  return (
    <section aria-label="Pour qui ?" className="border-y border-white/[0.06] bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <Reveal>
          <p className="text-center text-sm font-medium text-zinc-500">
            Pensé pour les commerces de proximité
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
            {AUDIENCES.map((audience) => (
              <li
                key={audience}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-sm text-zinc-300 transition-colors hover:border-violet-400/30 hover:text-white"
              >
                {audience}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="comment-ca-marche" className="scroll-mt-24 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Comment ça marche"
          title="Trois étapes, zéro friction"
          description="Ni matériel, ni application, ni formation. Une affiche sur le comptoir suffit."
        />

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* Ligne de liaison entre les étapes (desktop) */}
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-9 hidden h-px bg-gradient-to-r from-violet-500/40 via-fuchsia-500/40 to-violet-500/40 md:block"
          />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 100}>
              <div className="group relative h-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/25 hover:bg-white/[0.05]">
                <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-base font-bold text-white shadow-lg shadow-violet-950/50">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2.5 leading-relaxed text-zinc-400">{step.description}</p>
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
    <section
      id="fonctionnalites"
      className="scroll-mt-24 border-t border-white/[0.06] py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title="Tout ce qu'il faut, rien de superflu"
          description="Un outil complet pensé pour le quotidien d'un commerce, pas pour une équipe marketing."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 90}>
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/25 hover:bg-white/[0.05] hover:shadow-xl hover:shadow-violet-950/30">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300 transition-colors duration-300 group-hover:bg-violet-500/20">
                  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
                    {feature.icon}
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </div>
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
      className="relative select-none rounded-2xl border border-white/10 bg-zinc-900/70 p-2 shadow-2xl shadow-black/50 backdrop-blur"
    >
      <div className="rounded-xl bg-zinc-950/80 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </div>
          <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-500">
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
                  ? "border-violet-400/30 bg-violet-500/10"
                  : "border-white/[0.06] bg-white/[0.03]"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
              <p
                className={`mt-1 text-xl font-bold ${
                  stat.accent ? "text-violet-300" : "text-white"
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
                <p className="truncate text-sm font-medium text-zinc-200">
                  {row.prize}
                </p>
                <p className="font-mono text-[11px] text-zinc-500">
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
    <section className="border-t border-white/[0.06] py-24 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-400">
            Espace commerçant
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Pilotez tout depuis un tableau de bord limpide
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-zinc-400">
            Campagnes, lots, stocks, participations : tout est au même endroit.
            Vous voyez en un coup d&apos;œil ce que la roue rapporte et ce
            qu&apos;il reste à valider en caisse.
          </p>
          <ul className="mt-8 space-y-3.5">
            {[
              "Suivi des tours joués et du taux de gagnants par campagne",
              "File « Gains à valider » avec recherche par code, prénom ou email",
              "Stocks de lots décomptés automatiquement, export CSV en un clic",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-zinc-300">
                <CheckIcon />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-3xl bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,0.18),transparent_60%)] blur-xl"
            />
            <DashboardPreview />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section
      id="tarifs"
      className="scroll-mt-24 border-t border-white/[0.06] py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Tarifs"
          title="Un prix simple, tout inclus"
          description="Pas d'options cachées ni de paliers compliqués : une offre unique qui couvre tout."
        />

        <Reveal className="mx-auto mt-14 max-w-md" delay={100}>
          <div className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-8 shadow-2xl shadow-violet-950/40 sm:p-10">
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-violet-600/25 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Starter</h3>
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
                  7 jours offerts
                </span>
              </div>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight text-white">29 €</span>
                <span className="text-zinc-400">/ mois</span>
              </p>
              <p className="mt-2 text-sm text-zinc-500">Sans engagement, résiliable à tout moment.</p>

              <ul className="mt-8 space-y-3">
                {PRICING_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-zinc-300">
                    <CheckIcon />
                    <span className="leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-9">
                <PrimaryCta href="/signup" large>
                  Commencer l&apos;essai gratuit
                </PrimaryCta>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-white/[0.06] py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions fréquentes" />

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] transition-colors open:border-violet-400/25 open:bg-white/[0.05]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <svg
                    aria-hidden
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="shrink-0 text-zinc-500 transition-transform duration-300 group-open:rotate-45 group-open:text-violet-400"
                  >
                    <path
                      d="M9 3v12M3 9h12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <p className="px-6 pb-6 leading-relaxed text-zinc-400">{item.answer}</p>
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
    <section className="px-5 pb-24 pt-4 sm:px-6 sm:pb-28">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-950 via-zinc-950 to-fuchsia-950/60 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]"
          />
          <div
            aria-hidden
            className="absolute -top-28 left-1/2 h-64 w-[560px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[100px]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Votre roue peut tourner dès ce soir
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-zinc-400">
              Créez votre compte, configurez vos lots et imprimez votre
              affiche. 7 jours pour l&apos;essayer avec vos vrais clients.
            </p>
            <div className="mt-9 flex justify-center">
              <PrimaryCta href="/signup" large>
                Créer ma roue gratuitement
              </PrimaryCta>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <p className="text-lg font-bold tracking-tight text-white">
              Lastchance<span className="text-violet-400">.</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              La roue de la fortune par QR code qui fait revenir les clients
              des commerces de proximité.
            </p>
          </div>

          <nav aria-label="Pied de page" className="flex gap-16">
            <div>
              <p className="text-sm font-semibold text-white">Produit</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a href="#fonctionnalites" className="text-zinc-400 transition-colors hover:text-white">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a href="#comment-ca-marche" className="text-zinc-400 transition-colors hover:text-white">
                    Comment ça marche
                  </a>
                </li>
                <li>
                  <a href="#tarifs" className="text-zinc-400 transition-colors hover:text-white">
                    Tarifs
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-zinc-400 transition-colors hover:text-white">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Compte</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link href="/login" className="text-zinc-400 transition-colors hover:text-white">
                    Connexion
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="text-zinc-400 transition-colors hover:text-white">
                    Essai gratuit
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-6 text-sm text-zinc-600">
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
    <div className="flex-1 bg-zinc-950 text-zinc-100">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950"
      >
        Aller au contenu
      </a>

      <SiteHeader />

      <main id="contenu">
        <Hero />
        <Audiences />
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
