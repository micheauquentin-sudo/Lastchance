import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { MECANIQUES_DEFI, MECANIQUES_HASARD } from "@/components/dashboard/atelier-mecaniques";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { prixOptionMensuelle } from "@/components/marketing/prix";
import { PLAN_TIERS } from "@/lib/plans";

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
  title: "Acquérir & Attirer vos clients · Lastchance",
  description:
    "15 mécaniques de jeu instantané, parrainage à paliers et Vitrine au QR pour attirer, convertir et capter des contacts qualifiés dans votre commerce.",
};

const coreTier = PLAN_TIERS.find((t) => t.id === "core") ?? PLAN_TIERS[0];

export default function AttirerPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-transparent text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <ScrollPanoramaBackground />
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* Hero de l'objectif Acquérir */}
        <section className="relative z-10 overflow-x-clip px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-36">
          <div className="rise-in inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-orange px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
            Objectif #1 · Acquérir
          </div>

          <h1
            className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,4.8rem)] leading-[1.04]"
            style={{ ...DISPLAY, animationDelay: "80ms" }}
          >
            Attirez de nouveaux clients avec{" "}
            <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 shadow-[0_5px_0_var(--color-k-ink)]">
              15 jeux instantanés
            </span>
          </h1>

          <p
            className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-5 text-base font-bold leading-relaxed text-k-body shadow-sm"
            style={{ animationDelay: "140ms" }}
          >
            Roue de la fortune, carte à gratter, machine à sous, défis d&apos;adresse… Captez l&apos;attention de vos passants, collectez des emails conformes RGPD et transformez vos clients en ambassadeurs dès leur première visite.
          </p>

          <div
            className="rise-in mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "200ms" }}
          >
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn inline-block rounded-full bg-k-orange px-8 py-3.5 text-base font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
              >
                Essayer gratuitement 7 jours →
              </Link>
            </Magnetic>
            <Link
              href="/tarifs"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md"
            >
              Voir l&apos;offre Coup d&apos;envoi ({coreTier.priceMonthly} €/mois)
            </Link>
          </div>
        </section>

        {/* Module 1 : Les 15 mécaniques de jeu */}
        <section className={SECTION}>
          <Reveal className="text-center">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em]">
              <span className="h-2 w-2 rounded-full bg-k-orange" />
              <span className="k-halo text-k-ink">Module phare</span>
            </div>
            <h2 className="k-halo mt-3 text-[clamp(2rem,4vw,2.8rem)]" style={DISPLAY}>
              15 mécaniques prêtes à jouer
            </h2>
            <p className="k-card mx-auto mt-3 max-w-2xl rounded-2xl p-4 text-sm font-bold text-k-body">
              9 jeux de hasard et 6 jeux d&apos;adresse (*skill-gated*). Le joueur scanne le QR code, tente sa chance immédiatement sur son smartphone sans rien installer, et découvre son lot.
            </p>
          </Reveal>

          {/* Grille des 9 jeux de hasard */}
          <div className="mt-10">
            <h3 className="text-lg font-black text-k-ink sm:text-xl" style={DISPLAY}>
              🎰 9 Jeux de hasard (révélation instantanée)
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MECANIQUES_HASARD.map((m) => (
                <Tilt3D key={m.value} intensity={5}>
                  <div className="k-card k-card-hover rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="k-border-thin flex h-11 w-11 items-center justify-center rounded-xl bg-k-yellow text-2xl">
                        {m.emoji}
                      </span>
                      <div>
                        <h4 className="text-base font-black text-k-ink">{m.label}</h4>
                        <p className="text-xs font-bold text-k-muted">{m.hint}</p>
                      </div>
                    </div>
                  </div>
                </Tilt3D>
              ))}
            </div>
          </div>

          {/* Grille des 6 jeux de défi */}
          <div className="mt-10">
            <h3 className="text-lg font-black text-k-ink sm:text-xl" style={DISPLAY}>
              ⚡ 6 Jeux d&apos;adresse (défi avant tirage)
            </h3>
            <p className="text-xs font-bold text-k-muted">
              Le joueur doit réussir l&apos;épreuve pour débloquer son tirage : parfait pour valoriser les compétences et créer un vrai suspense.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MECANIQUES_DEFI.map((m) => (
                <Tilt3D key={m.value} intensity={5}>
                  <div className="k-card k-card-hover rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="k-border-thin flex h-11 w-11 items-center justify-center rounded-xl bg-k-pink text-2xl">
                        {m.emoji}
                      </span>
                      <div>
                        <h4 className="text-base font-black text-k-ink">{m.label}</h4>
                        <p className="text-xs font-bold text-k-muted">{m.hint}</p>
                      </div>
                    </div>
                  </div>
                </Tilt3D>
              ))}
            </div>
          </div>
        </section>

        {/* Modules 2 & 3 : Parrainage & Vitrine */}
        <section className={SECTION}>
          <div className="grid gap-8 lg:grid-cols-2">
            <Reveal className="reveal-tilt-l">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <span className="k-border-thin rounded-full bg-k-orange px-3 py-1 text-xs font-black text-k-ink">
                      Module #2
                    </span>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Parrainage & Bouche-à-oreille
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Transformez vos clients réguliers en meilleurs ambassadeurs. Vos clients génèrent un lien personnel, le partagent à leurs proches par SMS ou messagerie, et débloquent des récompenses par paliers dès que leurs filleuls passent votre porte.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Paliers configurables (1, 3, 5 filleuls venus)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Lien unique prêt à partager
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Validation en caisse dès la visite du filleul
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 pt-4">
                    <span className="text-xs font-bold text-k-muted">Inclus dans Le Club & La Totale, ou option {prixOptionMensuelle("referral")} €/mois</span>
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            <Reveal className="reveal-tilt-r">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <span className="k-border-thin rounded-full bg-k-yellow px-3 py-1 text-xs font-black text-k-ink">
                      Module #3
                    </span>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Vitrine bilingue au QR
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Votre carte, vos suggestions et vos promotions consultables instantanément par vos visiteurs. Publiée en français et en anglais avec détection automatique de la langue du smartphone.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Bilingue français / anglais automatique
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Mise à jour immédiate sans réimprimer vos QR
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Liens directs vers vos réservations et vos jeux
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 pt-4">
                    <span className="text-xs font-bold text-k-muted">Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("vitrine")} €/mois</span>
                  </div>
                </div>
              </Tilt3D>
            </Reveal>
          </div>
        </section>

        {/* Caisse universelle & Geste commerçant */}
        <section className={SECTION}>
          <Reveal>
            <div className="k-card-deep rounded-3xl p-8 sm:p-12 text-k-bg">
              <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-k-yellow">
                    Geste de service
                  </span>
                  <h3 className="mt-2 text-2xl font-black text-k-bg sm:text-3xl" style={DISPLAY}>
                    Une seule caisse universelle pour votre équipe
                  </h3>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-k-bg/85">
                    Votre staff n&apos;a pas à jongler entre dix applications : un seul scanner valide les gains des 11 familles de jeux.
                  </p>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-k-bg/85">
                    Besoin de faire plaisir à un client méritant au comptoir ? Le <strong>Ticket d&apos;Or</strong> vous permet d&apos;émettre un gain manuellement, comme geste commercial maîtrisé.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-4">
                    <p className="text-xs font-black text-k-yellow">Scanner universel</p>
                    <p className="mt-1 text-xs font-bold text-k-bg/90">
                      Tapez ou flashez le code : lot affiché, stock décrémenté, tentative de double validation bloquée.
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-4">
                    <p className="text-xs font-black text-k-yellow">Conformité RGPD absolue</p>
                    <p className="mt-1 text-xs font-bold text-k-bg/90">
                      Opt-in explicite, hébergement en Europe, jamais de gain contre un avis Google imposé.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* CTA final */}
        <section className={`${SECTION} text-center`}>
          <h2 className="k-halo text-3xl font-black sm:text-4xl" style={DISPLAY}>
            Commencez à attirer vos clients dès ce soir
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-k-body">
            7 jours offerts pour configurer vos lots, poser votre QR code et tester les retours réels.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-orange px-8 py-3.5 text-base font-black text-k-ink"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
            <Link
              href="/faire-venir"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink"
            >
              Découvrir l&apos;objectif Créer du trafic →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
