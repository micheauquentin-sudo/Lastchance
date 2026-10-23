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
            <div className="rise-in inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-blue px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
              Objectif #4 · Animer en direct & Soirées live
            </div>

            <h1
              className="rise-in k-halo relative z-[2] mx-auto mt-5 max-w-4xl text-[clamp(2.4rem,5.5vw,4.4rem)] leading-[1.05]"
              style={{ ...DISPLAY, animationDelay: "80ms" }}
            >
              L&apos;ambiance d&apos;un plateau télé{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 text-k-ink shadow-[0_5px_0_var(--color-k-ink)]">
                dans votre salle
              </span>
            </h1>

            <p
              className="k-card rise-in mx-auto mt-4 max-w-2xl rounded-2xl border-[2px] border-k-ink bg-white/95 p-4 text-sm sm:text-base font-bold leading-relaxed text-k-body shadow-[0_3px_0_var(--color-k-ink)]"
              style={{ animationDelay: "140ms" }}
            >
              Faites vibrer vos clients : quiz live sur grand écran avec télécommande smartphone, championnats de pronostics sur 11 compétitions et cagnotte collective par commande.
            </p>

            <div
              className="rise-in mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "200ms" }}
            >
              <Magnetic>
                <Link
                  href="/signup"
                  className="k-btn-light inline-block rounded-full border-[2.5px] border-k-ink bg-k-blue px-8 py-3 text-base font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#85c9ff] transition-colors"
                >
                  Essayer gratuitement 7 jours →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Offre Le Grand Jeu ({liveTier.priceMonthly} €/mois)
              </Link>
            </div>
          </div>
        </section>

        <StraightRibbonTicker />

        {/* SECTION 1 : FOND UNI BLANC SOLAIRE #FFFDF9 - 4 MODULES LIVE */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Module 1 : Soirées Live */}
              <Reveal className="reveal-tilt-l">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-blue px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #1
                        </span>
                        <span className="text-2xl">📺</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Événements Live & Écran Géant
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Animez votre salle en direct : vos questions et classements s&apos;affichent sur votre TV ou vidéoprojecteur, vos clients votent depuis leur smartphone.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Mode grand écran TV et télécommande animateur
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Podium et scores mis à jour en temps réel
                        </li>
                      </ul>
                    </div>
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Grand Jeu ({liveTier.priceMonthly} €/mois) & La Totale, ou pass soirée dès {prixPassPremierPalier("events")} €
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 2 : Pronostics */}
              <Reveal className="reveal-tilt-r">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #2
                        </span>
                        <span className="rounded-full border border-k-ink bg-k-orange px-2.5 py-0.5 text-xs font-black text-white">
                          11 thèmes
                        </span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Championnat de Pronostics
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Faites vivre les grands rendez-vous de l&apos;année dans votre commerce. Vos clients pronostiquent chaque match ou épreuve, et le classement anime le bar pendant des semaines.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Grand Jeu & La Totale, ou pass saison {prixPass("pronostics")} €
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 3 : Jackpot collectif */}
              <Reveal className="reveal-tilt-l">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-orange px-3 py-0.5 text-xs font-black text-white">
                          Module #3
                        </span>
                        <span className="text-2xl">💰</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Jackpot Collectif
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Fédérez toute votre salle autour d&apos;une jauge commune. Chaque scan ou commande fait monter la cagnotte : quand la jauge est pleine, le grand tirage au sort se déclenche automatiquement !
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Grand Jeu & La Totale, ou pass {prixPass("jackpot")} €
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 4 : Quiz autonome */}
              <Reveal className="reveal-tilt-r">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-pink px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #4
                        </span>
                        <span className="text-2xl">❓</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Quiz Autonome & Thématique
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Composez un parcours de questions avec correction instantanée. Vos clients jouent à leur rythme à table ou au comptoir pour tester leurs connaissances et remporter une surprise.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> QCM, blind tests, anecdotes locales
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Barème de points et temps limité
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Disponible seul ou intégré à votre Vitrine
                        </li>
                      </ul>
                    </div>
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dès Le Club ({prixOffre("engagement")} €/mois), Le Grand Jeu, Sur Place & La Totale
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="blue-orange" />

        {/* SECTION 2 : FOND FORMES (RAYURES KERMESSE BLEU/LILAS) - LES 11 THÈMES DE PRONOSTICS */}
        <section
          className="relative z-10 py-12 sm:py-16"
          style={{
            backgroundColor: "#F0F7FF",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(74, 144, 226, 0.08) 0px, rgba(74, 144, 226, 0.08) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="rounded-3xl border-[3px] border-k-ink bg-[#181512] p-7 sm:p-10 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
              <h2 className="text-2xl sm:text-3xl font-black text-k-yellow text-center" style={DISPLAY}>
                11 compétitions et thèmes couverts
              </h2>
              <p className="mt-2 text-sm font-bold text-center text-white/80">
                Ne réinventez pas les règles : les calendriers et les résultats sont mis à jour pour vous.
              </p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {THEMES_PRONOS.map((t) => (
                  <div key={t.label} className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                    <p className="text-sm font-black text-white">{t.label}</p>
                    <p className="mt-1 text-xs font-bold text-white/75">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 : CTA FINAL APPLAT POP AVEC CONVERSION */}
        <section className="relative z-10 border-t-[3px] border-k-ink bg-k-orange py-14 sm:py-16 text-center text-white">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={DISPLAY}>
              Faites vibrer votre salle dès votre prochain événement
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base font-bold text-white/90">
              Activez votre premier tournoi ou soirée live avec 7 jours d&apos;essai offerts.
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
                href="/tarifs"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3.5 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Consulter la grille tarifaire complète →
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
