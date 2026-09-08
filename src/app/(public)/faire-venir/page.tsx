import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { prixOptionMensuelle, prixPass } from "@/components/marketing/prix";
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
  title: "Créer du trafic & Déplacer vos clients · Lastchance",
  description:
    "Chasse au QR multi-lieux, ateliers et dégustations Moments, et réservation automatique pour faire circuler vos clients et remplir vos créneaux.",
};

const placeTier = PLAN_TIERS.find((t) => t.id === "place") ?? PLAN_TIERS[2];

export default function FaireVenirPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-transparent text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <ScrollPanoramaBackground />
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* Hero */}
        <section className="relative z-10 overflow-x-clip px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-36">
          <div className="rise-in inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-yellow px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-orange" />
            Objectif #2 · Créer du trafic
          </div>

          <h1
            className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,4.8rem)] leading-[1.04]"
            style={{ ...DISPLAY, animationDelay: "80ms" }}
          >
            Faites circuler vos clients et{" "}
            <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-orange px-4 pb-1 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
              remplissez vos créneaux
            </span>
          </h1>

          <p
            className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-5 text-base font-bold leading-relaxed text-k-body shadow-sm"
            style={{ animationDelay: "140ms" }}
          >
            De la chasse au QR code dans vos rayons à la prise de rendez-vous fluide, guidez vos visiteurs là où vous voulez qu&apos;ils soient et animez vos heures creuses.
          </p>

          <div
            className="rise-in mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "200ms" }}
          >
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn inline-block rounded-full bg-k-yellow px-8 py-3.5 text-base font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
              >
                Essayer gratuitement 7 jours →
              </Link>
            </Magnetic>
            <Link
              href="/tarifs"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md"
            >
              Voir l&apos;offre Sur Place ({placeTier.priceMonthly} €/mois)
            </Link>
          </div>
        </section>

        {/* 3 Modules de Trafic */}
        <section className={SECTION}>
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Module 1: Chasse au QR */}
            <Reveal delay={0}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-yellow px-3 py-1 text-xs font-black text-k-ink">
                        Module #1
                      </span>
                      <span className="text-2xl">🗺️</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Chasse au QR
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Parcours physique & multi-lieux
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Reliez plusieurs lieux ou rayons de votre établissement. Vos clients scannent et tamponnent chaque QR code pour compléter leur passeport et débloquer une récompense finale remise en caisse.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> De 2 à 10 points de passage
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Idéal pour faire découvrir les zones calmes
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Tamponnage instantané sans application
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Club & La Totale, ou pass {prixPass("hunts")} €
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 2: Moments */}
            <Reveal delay={100}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-orange px-3 py-1 text-xs font-black text-k-ink">
                        Module #2
                      </span>
                      <span className="text-2xl">🎟️</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Moments & Événements
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Ateliers, dégustations & files d&apos;accueil
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Créez l&apos;activité, ouvrez des jauges de places, vos clients s&apos;inscrivent sans créer de compte. Idéal aussi pour proposer vos invendus de fin de journée ou gérer une file d&apos;accueil.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Inscription ultra-rapide sans friction
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Jauges de places en direct
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Valorisation des créneaux creux
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("reserver")} €/mois
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 3: Réservation */}
            <Reveal delay={200}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-yellow px-3 py-1 text-xs font-black text-k-ink">
                        Module #3
                      </span>
                      <span className="text-2xl">📅</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Réservation & Agenda
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Prise de rendez-vous automatisée
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Configurez vos horaires une seule fois : vos créneaux se génèrent automatiquement et vos clients réservent directement depuis votre Vitrine au QR code.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Vos tables, services ou créneaux sur mesure
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Confirmation et ajout automatique à l&apos;agenda client
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Synchronisé avec votre calendrier
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("rendez_vous")} €/mois
                  </div>
                </div>
              </Tilt3D>
            </Reveal>
          </div>
        </section>

        {/* Pourquoi ça marche sur le terrain */}
        <section className={SECTION}>
          <div className="k-card-deep rounded-3xl p-8 sm:p-12 text-k-bg">
            <h2 className="text-2xl font-black sm:text-3xl" style={DISPLAY}>
              La fin des heures creuses et des tables vides
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-5">
                <span className="text-3xl">🚶‍♂️</span>
                <h3 className="mt-3 text-base font-black text-k-yellow">Déplacement physique</h3>
                <p className="mt-2 text-xs font-bold leading-relaxed text-k-bg/85">
                  La chasse au QR fait marcher les clients vers vos espaces les moins visités ou entre plusieurs points de vente.
                </p>
              </div>
              <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-5">
                <span className="text-3xl">⚡</span>
                <h3 className="mt-3 text-base font-black text-k-yellow">Zéro no-show inutile</h3>
                <p className="mt-2 text-xs font-bold leading-relaxed text-k-bg/85">
                  Rappels automatiques et expérience mobile fluide garantissent un taux de présence maximal aux rendez-vous.
                </p>
              </div>
              <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-5">
                <span className="text-3xl">💡</span>
                <h3 className="mt-3 text-base font-black text-k-yellow">Valorisation des invendus</h3>
                <p className="mt-2 text-xs font-bold leading-relaxed text-k-bg/85">
                  Proposez vos offres de fin de journée aux habitués en 2 clics pour limiter le gaspillage et générer du revenu supplémentaire.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={`${SECTION} text-center`}>
          <h2 className="k-halo text-3xl font-black sm:text-4xl" style={DISPLAY}>
            Prêt à faire venir plus de monde ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-k-body">
            Testez les modules de trafic gratuitement pendant 7 jours sur votre établissement.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-yellow px-8 py-3.5 text-base font-black text-k-ink"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
            <Link
              href="/fideliser"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink"
            >
              Découvrir l&apos;objectif Fidéliser →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
