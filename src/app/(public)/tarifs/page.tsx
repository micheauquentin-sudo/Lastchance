import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { RoiSimulator } from "@/components/marketing/roi-simulator";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { PRIX_ENTREE_MENSUEL } from "@/components/marketing/prix";
import {
  ADDON_OFFERS,
  describeTier,
  PLAN_TIERS,
} from "@/lib/plans";

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

export const metadata: Metadata = {
  title: "Tarifs & Offres par objectif · Lastchance",
  description: `Des offres claires sans engagement dès ${PRIX_ENTREE_MENSUEL}. 5 formules par objectif commercial, 13 options à la carte et simulateur de rentabilité.`,
};

const INCLUDED_EVERYWHERE = [
  {
    title: "Caisse universelle (11 familles)",
    desc: "Un scanner unique pour valider les gains de tous les jeux, sans former votre équipe à dix outils.",
    icon: "⚡",
  },
  {
    title: "10 modèles de campagne prêts",
    desc: "Visuels, règles, lots et e-mails pré-configurés pour démarrer en moins de 10 minutes.",
    icon: "📦",
  },
  {
    title: "Ticket d'Or (Geste de service)",
    desc: "Émettez un gain manuellement depuis votre espace pour faire plaisir à un client méritant au comptoir.",
    icon: "🎟️",
  },
  {
    title: "Portefeuille joueur sans compte",
    desc: "Vos clients retrouvent tous leurs gains sur une seule page mobile sans mot de passe ni compte obligatoire.",
    icon: "📱",
  },
  {
    title: "Studio d'affiches & QR Hub",
    desc: "Générez vos affiches A4 imprimables en haute définition et vos QR codes prêts à poser.",
    icon: "🖨️",
  },
  {
    title: "4 Scénarios d'e-mails automatiques",
    desc: "Gain non retiré, anniversaire, réactivation des inactifs et après retrait d'un gain — automatisés.",
    icon: "✉️",
  },
  {
    title: "Le rapport du lundi",
    desc: "Votre bilan hebdomadaire envoyé chaque lundi matin pour suivre vos performances semaine après semaine.",
    icon: "📊",
  },
  {
    title: "Conformité RGPD & Export CSV",
    desc: "Consentement explicite, données hébergées en Europe et exportables à tout moment en CSV.",
    icon: "🔒",
  },
];

export default function TarifsPage() {
  const describedTiers = PLAN_TIERS.map((tier) => describeTier(tier));

  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-transparent text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <ScrollPanoramaBackground />
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* En-tête Tarifs */}
        <section className="relative z-10 overflow-x-clip px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-36">
          <div className="rise-in inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-yellow px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-green" />
            Tarifs transparents · 7 jours offerts
          </div>

          <h1
            className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,4.8rem)] leading-[1.04]"
            style={{ ...DISPLAY, animationDelay: "80ms" }}
          >
            Cinq offres conçues pour{" "}
            <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-orange px-4 pb-1 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
              vos objectifs
            </span>
          </h1>

          <p
            className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-5 text-base font-bold leading-relaxed text-k-body shadow-sm"
            style={{ animationDelay: "140ms" }}
          >
            Pas de grille linéaire trompeuse : choisissez l&apos;offre calibrée pour votre commerce. Chaque formule est sans engagement, annulable à tout moment depuis votre tableau de bord.
          </p>
        </section>

        {/* Grille des 5 offres */}
        <section className={SECTION}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {describedTiers.map((tier, idx) => {
              const isHighlight = tier.id === "full" || tier.id === "engagement";
              return (
                <Reveal key={tier.id} delay={idx * 60} className="h-full">
                  <div className="h-full">
                    <Tilt3D intensity={6}>
                      <div
                        className={`k-card k-card-hover relative flex h-full flex-col justify-between rounded-3xl p-7 ${
                          tier.id === "full"
                            ? "border-k-ink bg-k-yellow/30 shadow-lg"
                            : tier.id === "core"
                            ? "border-k-orange/50 shadow-md"
                            : ""
                        }`}
                      >
                        {isHighlight && (
                          <span className="k-border k-hard-sm absolute -top-3.5 right-6 rounded-full bg-k-yellow px-3.5 py-1 text-xs font-black text-k-ink">
                            {tier.id === "full" ? "Toute la plateforme" : "Le plus populaire"}
                          </span>
                        )}

                        <div>
                          <div className="text-2xl font-black text-k-ink" style={DISPLAY}>
                            {tier.name}
                          </div>

                          <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="text-4xl font-black sm:text-5xl text-k-ink" style={DISPLAY}>
                              {tier.priceMonthly} €
                            </span>
                            <span className="text-sm font-black text-k-muted">/ mois</span>
                          </div>

                          <p className="mt-3 text-xs font-bold leading-relaxed text-k-body">
                            {tier.tagline}
                          </p>

                          <div className="my-5 border-t-2 border-dashed border-k-ink/20" />

                          {/* Modules inclus */}
                          <p className="text-[11px] font-black uppercase tracking-wider text-k-muted">
                            Modules inclus ({tier.experiences.length}) :
                          </p>
                          <ul className="mt-2 space-y-1.5 text-xs font-extrabold text-k-ink">
                            {tier.experiences.map((exp) => (
                              <li key={exp} className="flex items-center gap-2">
                                <span className="text-k-green font-black">✓</span>
                                <span>{exp}</span>
                              </li>
                            ))}
                          </ul>

                          {tier.limits.length > 0 && (
                            <div className="mt-3 rounded-xl bg-k-blue/15 p-2.5 text-xs font-black text-k-ink">
                              {tier.limits.map((l) => (
                                <p key={l}>⚡ {l}</p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-8 pt-4">
                          <Magnetic>
                            <Link
                              href="/signup"
                              className={`k-border k-btn block w-full rounded-full py-3 text-center text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-2 ${
                                tier.id === "full"
                                  ? "bg-k-ink text-k-bg"
                                  : tier.id === "core"
                                  ? "bg-k-orange text-k-ink"
                                  : "bg-k-yellow text-k-ink"
                              }`}
                            >
                              Démarrer mes 7 jours offerts →
                            </Link>
                          </Magnetic>
                        </div>
                      </div>
                    </Tilt3D>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Simulateur de ROI */}
        <section className={SECTION}>
          <RoiSimulator />
        </section>

        {/* Briques incluses dans toutes les offres */}
        <section className={SECTION}>
          <Reveal className="text-center">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
              <span className="h-2 w-2 rounded-full bg-k-yellow" />
              Socle commun
            </span>
            <h2 className="k-halo mt-2 text-2xl font-black sm:text-3xl" style={DISPLAY}>
              Inclus dans toutes les offres, sans supplément
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs font-bold text-k-body sm:text-sm">
              Peu importe l&apos;offre choisie, votre commerce bénéficie de toute l&apos;infrastructure opérationnelle.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED_EVERYWHERE.map((item) => (
              <div key={item.title} className="k-card rounded-2xl p-5">
                <span className="text-2xl">{item.icon}</span>
                <h3 className="mt-2 text-sm font-black text-k-ink">{item.title}</h3>
                <p className="mt-1 text-xs font-bold leading-relaxed text-k-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 13 Options à la carte */}
        <section className={SECTION}>
          <Reveal className="text-center">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
              <span className="h-2 w-2 rounded-full bg-k-pink" />
              Sur mesure
            </span>
            <h2 className="k-halo mt-2 text-2xl font-black sm:text-3xl" style={DISPLAY}>
              13 options & pass à la carte
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs font-bold text-k-body sm:text-sm">
              Ajoutez un module spécifique à votre offre ou activez un pass pour une opération ponctuelle, sans engagement.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ADDON_OFFERS.map((addon) => {
              const priceLabel =
                addon.billing.model === "recurring-monthly"
                  ? `${addon.billing.priceMonthly} €/mois`
                  : addon.billing.model === "capacity-pass"
                  ? `Dès ${addon.billing.steps[0].price} € (pass soirée)`
                  : `${addon.billing.price} € (pass)`;

              return (
                <div key={addon.name} className="k-card rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-k-ink">{addon.name}</span>
                      <span className="rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-black text-k-ink">
                        {priceLabel}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs font-bold text-k-muted">
                      {addon.rules.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 pt-2 border-t border-k-ink/10 text-[11px] font-bold text-k-body">
                    {addon.soldStandalone ? "Achetable seul ou en option" : "Option d'un abonnement en cours"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA final */}
        <section className={`${SECTION} text-center`}>
          <h2 className="k-halo text-3xl font-black sm:text-4xl" style={DISPLAY}>
            Prêt à lancer vos premières animations ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-k-body">
            Rejoignez les commerçants qui animent et fidélisent leur clientèle. 7 jours pour tester sans engagement.
          </p>
          <div className="mt-6 flex justify-center">
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-orange px-9 py-4 text-base font-black text-k-ink"
              >
                Démarrer mon essai gratuit de 7 jours →
              </Link>
            </Magnetic>
          </div>
        </section>
      </main>
    </div>
  );
}
