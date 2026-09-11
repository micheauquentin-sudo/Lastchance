import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import {
  prixOffre,
  prixPass,
  prixPassPremierPalier,
} from "@/components/marketing/prix";
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
  title: "Animer en direct & Soirées live · Lastchance",
  description:
    "Soirées interactives sur grand écran et smartphones, championnats de pronostics sur 11 thèmes et jackpot collectif.",
};

const liveTier = PLAN_TIERS.find((t) => t.id === "live") ?? PLAN_TIERS[3];

const THEMES_PRONOS = [
  { label: "⚽ Football", desc: "Ligue 1, Champions League, Coupe du monde, Euro, CAN" },
  { label: "🏉 Rugby", desc: "Tournoi des 6 Nations, Top 14, Coupe du monde" },
  { label: "🎾 Tennis", desc: "Roland-Garros, Wimbledon, tournois du Grand Chelem" },
  { label: "🎤 Spectacle & Culture", desc: "Eurovision, cérémonies de cinéma, remises de prix" },
  { label: "🍳 Télé-réalité & Concours", desc: "Concours culinaires, finales d'émissions populaires" },
  { label: "🎮 E-sport & Entreprise", desc: "Tournois locaux, compétitions inter-entreprises, défis custom" },
];

export default function AnimerPage() {
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
          <div className="rise-in inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-blue px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
            Objectif #4 · Animer en direct
          </div>

          <h1
            className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,4.8rem)] leading-[1.04]"
            style={{ ...DISPLAY, animationDelay: "80ms" }}
          >
            L&apos;ambiance d&apos;un plateau télé{" "}
            <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 shadow-[0_5px_0_var(--color-k-ink)]">
              dans votre salle
            </span>
          </h1>

          <p
            className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-5 text-base font-bold leading-relaxed text-k-body shadow-sm"
            style={{ animationDelay: "140ms" }}
          >
            Faites vibrer vos clients lors de vos soirées : quiz en direct sur grand écran avec télécommande smartphone, championnats de pronostics sur 11 compétitions et cagnotte collective qui monte avec chaque commande.
          </p>

          <div
            className="rise-in mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "200ms" }}
          >
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn inline-block rounded-full bg-k-blue px-8 py-3.5 text-base font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
              >
                Essayer gratuitement 7 jours →
              </Link>
            </Magnetic>
            <Link
              href="/tarifs"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md"
            >
              Voir l&apos;offre Le Grand Jeu ({liveTier.priceMonthly} €/mois)
            </Link>
          </div>
        </section>

        {/* Grille des 4 modules de Live */}
        <section className={SECTION}>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Module 1 : Soirées Live */}
            <Reveal className="reveal-tilt-l">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-blue px-3 py-1 text-xs font-black text-k-ink">
                        Module #1
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Événements Live & Écran Géant
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Animez votre salle en direct : vos questions et classements s&apos;affichent sur votre TV ou vidéoprojecteur, vos clients votent depuis leur smartphone.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Mode grand écran TV et télécommande animateur
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Podium et scores mis à jour en temps réel
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Grand Jeu ({liveTier.priceMonthly} €/mois) & La Totale, ou pass soirée dès {prixPassPremierPalier("events")} €
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 2 : Pronostics */}
            <Reveal className="reveal-tilt-r">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-yellow px-3 py-1 text-xs font-black text-k-ink">
                        Module #2
                      </span>
                      <span className="rounded-full bg-k-orange px-2.5 py-0.5 text-xs font-black text-k-bg">
                        11 thèmes
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Championnat de Pronostics
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Faites vivre les grands rendez-vous de l&apos;année dans votre commerce. Vos clients pronostiquent chaque match ou épreuve, et le classement anime le bar pendant des semaines.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Calendriers et calcul des points automatiques
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Pseudos et avatars pour vos clients
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Récompenses configurables pour le top 3
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Grand Jeu & La Totale, ou pass saison {prixPass("pronostics")} €
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 3 : Jackpot collectif */}
            <Reveal className="reveal-tilt-l">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-orange px-3 py-1 text-xs font-black text-k-ink">
                        Module #3
                      </span>
                      <span className="text-2xl">💰</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Jackpot Collectif
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Fédérez toute votre salle autour d&apos;une jauge commune. Chaque scan ou commande fait monter la cagnotte : quand la jauge est pleine, le grand tirage au sort se déclenche automatiquement !
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Jauge visuelle animée projetable sur écran
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Émulation collective puissante
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Gros lot remis en main propre
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Grand Jeu & La Totale, ou pass {prixPass("jackpot")} €
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 4 : Quiz sur mesure */}
            <Reveal className="reveal-tilt-r">
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7 sm:p-9">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-pink px-3 py-1 text-xs font-black text-k-ink">
                        Module #4
                      </span>
                      <span className="text-2xl">❓</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
                      Quiz Autonome & Thématique
                    </h3>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Composez un parcours de questions avec correction instantanée. Vos clients jouent à leur rythme à table ou au comptoir pour tester leurs connaissances et remporter une surprise.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Questions à choix multiples, blind tests, anecdotes
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Barème de points et temps limité
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Disponible seul ou intégré à votre Vitrine
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dès Le Club ({prixOffre("engagement")} €/mois), Le Grand Jeu, Sur Place & La Totale
                  </div>
                </div>
              </Tilt3D>
            </Reveal>
          </div>
        </section>

        {/* Thèmes de pronostics détaillés */}
        <section className={SECTION}>
          <div className="k-card-deep rounded-3xl p-8 sm:p-12 text-k-bg">
            <h2 className="text-2xl font-black sm:text-3xl text-k-yellow" style={DISPLAY}>
              11 compétitions et thèmes couverts
            </h2>
            <p className="mt-2 text-sm font-bold text-k-bg/80">
              Ne réinventez pas les règles : les calendriers et les résultats sont mis à jour pour vous.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {THEMES_PRONOS.map((t) => (
                <div key={t.label} className="rounded-2xl border border-k-bg/20 bg-white/10 p-4">
                  <p className="text-sm font-black text-k-bg">{t.label}</p>
                  <p className="mt-1 text-xs font-bold text-k-bg/75">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={`${SECTION} text-center`}>
          <h2 className="k-halo text-3xl font-black sm:text-4xl" style={DISPLAY}>
            Faites vibrer votre salle dès votre prochain événement
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-k-body">
            Activez votre premier tournoi ou soirée live avec 7 jours d&apos;essai offerts.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-blue px-8 py-3.5 text-base font-black text-k-ink"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
            <Link
              href="/tarifs"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink"
            >
              Consulter la grille tarifaire complète →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
