import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
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

export const metadata: Metadata = {
  title: "Créer du trafic & Déplacer vos clients · Lastchance",
  description:
    "Chasse au QR multi-lieux, ateliers et dégustations Moments, et réservation automatique pour faire circuler vos clients et remplir vos créneaux.",
};

const placeTier = PLAN_TIERS.find((t) => t.id === "place") ?? PLAN_TIERS[2];

export default function FaireVenirPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex min-h-screen flex-1 flex-col overflow-x-clip bg-[#FFFDF9] text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* HERO AVEC NUAGES ISOLES DANS LE HERO */}
        <section className="relative flex min-h-[50vh] sm:min-h-[54vh] flex-col justify-center overflow-hidden px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-32">
          <HeroCloudBackdrop />

          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="rise-in inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-yellow px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-orange" />
              Objectif #2 · Créer du trafic & Activer les créneaux
            </div>

            <h1
              className="rise-in k-halo relative z-[2] mx-auto mt-5 max-w-4xl text-[clamp(2.4rem,5.5vw,4.4rem)] leading-[1.05]"
              style={{ ...DISPLAY, animationDelay: "80ms" }}
            >
              Faites circuler vos clients et{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-orange px-4 pb-1 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
                remplissez vos créneaux
              </span>
            </h1>

            <p
              className="k-card rise-in mx-auto mt-4 max-w-2xl rounded-2xl border-[2px] border-k-ink bg-white/95 p-4 text-sm sm:text-base font-bold leading-relaxed text-k-body shadow-[0_3px_0_var(--color-k-ink)]"
              style={{ animationDelay: "140ms" }}
            >
              De la chasse au QR code dans vos rayons à la prise de rendez-vous fluide, guidez vos visiteurs là où vous voulez qu&apos;ils soient et dynamisez vos heures creuses.
            </p>

            <div
              className="rise-in mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "200ms" }}
            >
              <Magnetic>
                <Link
                  href="/signup"
                  className="k-btn-light inline-block rounded-full border-[2.5px] border-k-ink bg-k-yellow px-8 py-3 text-base font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#ffe359] transition-colors"
                >
                  Essayer gratuitement 7 jours →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Offre Sur Place ({placeTier.priceMonthly} €/mois)
              </Link>
            </div>
          </div>
        </section>

        <StraightRibbonTicker />

        {/* SECTION 1 : FOND UNI BLANC SOLAIRE #FFFDF9 - LES 3 MODULES DE TRAFIC */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Module 1: Chasse au QR */}
              <Reveal delay={0}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #1
                        </span>
                        <span className="text-2xl">🗺️</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Chasse au QR
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Parcours physique & multi-lieux
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Reliez plusieurs lieux ou rayons de votre établissement. Vos clients scannent et tamponnent chaque QR code pour compléter leur passeport et débloquer une récompense finale remise en caisse.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Club & La Totale, ou pass {prixPass("hunts")} €
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 2: Moments */}
              <Reveal delay={100}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-orange px-3 py-0.5 text-xs font-black text-white">
                          Module #2
                        </span>
                        <span className="text-2xl">🎟️</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Moments & Événements
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Ateliers, dégustations & files d&apos;accueil
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Créez l&apos;activité, ouvrez des jauges de places, vos clients s&apos;inscrivent sans créer de compte. Idéal pour proposer vos créneaux spécifiques ou animer des temps forts.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("reserver")} €/mois
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 3: Réservation */}
              <Reveal delay={200}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #3
                        </span>
                        <span className="text-2xl">📅</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Réservation & Agenda
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Prise de rendez-vous automatisée
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Configurez vos horaires une seule fois : vos créneaux se génèrent automatiquement et vos clients réservent directement depuis votre Vitrine au QR code.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("rendez_vous")} €/mois
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="amber-orange" />

        {/* SECTION 2 : FOND FORMES (RAYURES KERMESSE JAUNE/ORANGE) - TERRAIN & RENTABILITE */}
        <section
          className="relative z-10 py-12 sm:py-16"
          style={{
            backgroundColor: "#FFF9F0",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255, 178, 56, 0.08) 0px, rgba(255, 178, 56, 0.08) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="rounded-3xl border-[3px] border-k-ink bg-[#181512] p-7 sm:p-10 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
              <h2 className="text-2xl sm:text-3xl font-black text-white text-center" style={DISPLAY}>
                La fin des heures creuses et des créneaux vides
              </h2>
              <div className="mt-7 grid gap-5 sm:grid-cols-3">
                <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                  <span className="text-2xl">🚶‍♂️</span>
                  <h3 className="mt-2 text-base font-black text-k-yellow">Déplacement physique</h3>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-white/80">
                    La chasse au QR oriente les clients vers vos espaces les moins visités ou entre plusieurs comptoirs.
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                  <span className="text-2xl">⚡</span>
                  <h3 className="mt-2 text-base font-black text-k-yellow">Zéro no-show inutile</h3>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-white/80">
                    Rappels automatiques et expérience mobile fluide garantissent un taux de présence maximal.
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                  <span className="text-2xl">💡</span>
                  <h3 className="mt-2 text-base font-black text-k-yellow">Valorisation des créneaux</h3>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-white/80">
                    Proposez des offres spéciales sur vos heures creuses pour lisser l&apos;activité sur la semaine.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 : CTA FINAL APPLAT POP AVEC CONVERSION */}
        <section className="relative z-10 border-t-[3px] border-k-ink bg-k-orange py-14 sm:py-16 text-center text-white">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={DISPLAY}>
              Prêt à faire venir plus de monde ?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base font-bold text-white/90">
              Testez les modules de trafic gratuitement pendant 7 jours sur votre établissement.
            </p>
            <div className="mt-6 flex flex-wrap justify-center items-center gap-3">
              <Magnetic>
                <Link
                  href="/signup"
                  className="k-btn-light inline-block rounded-full border-[2.5px] border-k-ink bg-k-yellow px-8 py-3.5 text-base font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#ffe359] transition-colors"
                >
                  Démarrer mon essai gratuit →
                </Link>
              </Magnetic>
              <Link
                href="/fideliser"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3.5 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Découvrir l&apos;objectif Fidéliser →
              </Link>
            </div>
            <p className="mt-4 text-[11px] font-bold text-white/80">
              ✓ 0 € de frais de mise en service · Sans carte bancaire requise · Annulation en 1 clic
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
