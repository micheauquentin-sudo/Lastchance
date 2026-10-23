import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { MECANIQUES_DEFI, MECANIQUES_HASARD } from "@/components/dashboard/atelier-mecaniques";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
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

export const metadata: Metadata = {
  title: "Acquérir & Attirer vos clients · Lastchance",
  description:
    "15 mécaniques de jeu instantané, parrainage à paliers et Vitrine au QR pour attirer, convertir et capter des contacts qualifiés dans votre commerce.",
};

const coreTier = PLAN_TIERS.find((t) => t.id === "core") ?? PLAN_TIERS[0];

export default function AttirerPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex min-h-screen flex-1 flex-col overflow-x-clip bg-[#FFFDF9] text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* HERO AVEC NUAGES STRICTEMENT ISOLES */}
        <section className="relative flex min-h-[50vh] sm:min-h-[54vh] flex-col justify-center overflow-hidden px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-32">
          <HeroCloudBackdrop />

          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="rise-in inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-orange px-4 py-1.5 text-xs font-black text-white shadow-[0_3px_0_var(--color-k-ink)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
              Objectif #1 · Acquérir & Capter l&apos;attention
            </div>

            <h1
              className="rise-in k-halo relative z-[2] mx-auto mt-5 max-w-4xl text-[clamp(2.4rem,5.5vw,4.4rem)] leading-[1.05]"
              style={{ ...DISPLAY, animationDelay: "80ms" }}
            >
              Attirez de nouveaux clients avec{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 text-k-ink shadow-[0_5px_0_var(--color-k-ink)]">
                15 jeux instantanés
              </span>
            </h1>

            <p
              className="k-card rise-in mx-auto mt-4 max-w-2xl rounded-2xl border-[2px] border-k-ink bg-white/95 p-4 text-sm sm:text-base font-bold leading-relaxed text-k-body shadow-[0_3px_0_var(--color-k-ink)]"
              style={{ animationDelay: "140ms" }}
            >
              Roue de la fortune, carte à gratter, machine à sous, défis d&apos;adresse… Captez l&apos;attention des passants, collectez des emails conformes RGPD et transformez chaque visite en fidélité active.
            </p>

            <div
              className="rise-in mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "200ms" }}
            >
              <Magnetic>
                <Link
                  href="/signup"
                  className="k-btn-light inline-block rounded-full border-[2.5px] border-k-ink bg-k-orange px-8 py-3 text-base font-black text-white shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#e05622] transition-colors"
                >
                  Essayer gratuitement 7 jours →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Offre Coup d&apos;envoi ({coreTier.priceMonthly} €/mois)
              </Link>
            </div>
          </div>
        </section>

        <StraightRibbonTicker />

        {/* SECTION 1 : FOND UNI BLANC SOLAIRE #FFFDF9 - LES 15 MÉCANIQUES */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center">
              <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-k-ink">
                <span className="h-2 w-2 rounded-full bg-k-orange" />
                <span>Catalogue interactif</span>
              </div>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl text-k-ink" style={DISPLAY}>
                15 mécaniques prêtes à jouer
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm font-bold text-k-body">
                9 jeux de hasard et 6 jeux d&apos;adresse. Le joueur scanne le QR code, tente sa chance sans rien installer et découvre son lot instantanément.
              </p>
            </Reveal>

            {/* Grille 9 jeux de hasard */}
            <div className="mt-8">
              <h3 className="text-base sm:text-lg font-black text-k-ink" style={DISPLAY}>
                🎰 9 Jeux de hasard (révélation immédiate)
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MECANIQUES_HASARD.map((m) => (
                  <Tilt3D key={m.value} intensity={4}>
                    <div className="k-card rounded-2xl border-[2px] border-k-ink bg-white p-3.5 shadow-[0_3px_0_var(--color-k-ink)] transition-transform hover:-translate-y-0.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border-2 border-k-ink bg-k-yellow text-xl shadow-[0_2px_0_var(--color-k-ink)]">
                          {m.emoji}
                        </span>
                        <div>
                          <h4 className="text-sm font-black text-k-ink">{m.label}</h4>
                          <p className="text-xs font-bold text-k-muted">{m.hint}</p>
                        </div>
                      </div>
                    </div>
                  </Tilt3D>
                ))}
              </div>
            </div>

            {/* Grille 6 jeux de défi */}
            <div className="mt-8">
              <h3 className="text-base sm:text-lg font-black text-k-ink" style={DISPLAY}>
                ⚡ 6 Jeux d&apos;adresse (défi avant tirage)
              </h3>
              <p className="mt-1 text-xs font-bold text-k-muted">
                Le joueur doit réussir l&apos;épreuve pour débloquer son tirage : parfait pour engager et créer du suspense.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MECANIQUES_DEFI.map((m) => (
                  <Tilt3D key={m.value} intensity={4}>
                    <div className="k-card rounded-2xl border-[2px] border-k-ink bg-white p-3.5 shadow-[0_3px_0_var(--color-k-ink)] transition-transform hover:-translate-y-0.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border-2 border-k-ink bg-k-pink text-xl shadow-[0_2px_0_var(--color-k-ink)]">
                          {m.emoji}
                        </span>
                        <div>
                          <h4 className="text-sm font-black text-k-ink">{m.label}</h4>
                          <p className="text-xs font-bold text-k-muted">{m.hint}</p>
                        </div>
                      </div>
                    </div>
                  </Tilt3D>
                ))}
              </div>
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="amber-orange" />

        {/* SECTION 2 : FOND FORMES (RAYURES KERMESSE JAUNE/ORANGE) - PARRAINAGE & VITRINE */}
        <section
          className="relative z-10 py-12 sm:py-16"
          style={{
            backgroundColor: "#FFF9F0",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255, 178, 56, 0.08) 0px, rgba(255, 178, 56, 0.08) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Reveal className="reveal-tilt-l">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <span className="inline-block rounded-full border-2 border-k-ink bg-k-orange px-3 py-0.5 text-xs font-black text-white">
                        Module #2
                      </span>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Parrainage & Bouche-à-oreille
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Transformez vos clients réguliers en meilleurs ambassadeurs. Vos clients génèrent un lien personnel, le partagent à leurs proches par SMS et débloquent des récompenses par paliers dès que leurs filleuls viennent chez vous.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3">
                      <span className="text-xs font-bold text-k-muted">
                        Inclus dans Le Club & La Totale, ou option {prixOptionMensuelle("referral")} €/mois
                      </span>
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              <Reveal className="reveal-tilt-r">
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 sm:p-8 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black text-k-ink">
                        Module #3
                      </span>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Vitrine bilingue au QR
                      </h3>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Votre carte, vos suggestions et vos promotions consultables instantanément par vos visiteurs. Publiée en français et en anglais avec détection automatique de la langue du smartphone.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
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
                    <div className="mt-5 border-t border-k-ink/10 pt-3">
                      <span className="text-xs font-bold text-k-muted">
                        Inclus dans Sur Place & La Totale, ou option {prixOptionMensuelle("vitrine")} €/mois
                      </span>
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="amber-orange" />

        {/* SECTION 3 : FOND UNI BLANC SOLAIRE #FFFDF9 - CAISSE UNIVERSELLE */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <div className="rounded-3xl border-[3px] border-k-ink bg-[#181512] p-6 sm:p-10 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
                <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                  <div>
                    <span className="inline-block rounded-full border border-k-yellow/50 bg-k-yellow/10 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-k-yellow">
                      Geste de service
                    </span>
                    <h3 className="mt-3 text-2xl sm:text-3xl font-black text-white" style={DISPLAY}>
                      Une seule caisse universelle pour votre équipe
                    </h3>
                    <p className="mt-2 text-sm font-bold leading-relaxed text-white/80">
                      Votre staff n&apos;a pas à jongler entre dix applications : un seul scanner valide les gains des 11 familles de jeux.
                    </p>
                    <p className="mt-2 text-sm font-bold leading-relaxed text-white/80">
                      Besoin de faire plaisir à un client méritant au comptoir ? Le <strong>Ticket d&apos;Or</strong> vous permet d&apos;émettre un gain manuellement, comme geste commercial maîtrisé.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                      <p className="text-xs font-black text-k-yellow">Scanner universel sans contact</p>
                      <p className="mt-1 text-xs font-bold text-white/90">
                        Tapez ou flashez le code : lot affiché, stock décrémenté, tentative de double validation bloquée instantanément.
                      </p>
                    </div>
                    <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-4">
                      <p className="text-xs font-black text-k-yellow">Conformité RGPD absolue</p>
                      <p className="mt-1 text-xs font-bold text-white/90">
                        Opt-in explicite, hébergement en Europe, jamais de gain contre un avis Google imposé.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* SECTION 4 : CTA FINAL APPLAT POP AVEC CONVERSION */}
        <section className="relative z-10 border-t-[3px] border-k-ink bg-k-orange py-14 sm:py-16 text-center text-white">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white" style={DISPLAY}>
              Commencez à attirer vos clients dès ce soir
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base font-bold text-white/90">
              7 jours offerts pour configurer vos lots, poser votre QR code et mesurer l&apos;impact sur votre fréquentation.
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
                href="/faire-venir"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3.5 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Découvrir l&apos;objectif Créer du trafic →
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
