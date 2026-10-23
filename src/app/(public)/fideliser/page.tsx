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
import {
  inactiveConfigSchema,
  postRedemptionConfigSchema,
  wonNotRedeemedConfigSchema,
} from "@/lib/validations/automations";

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
  title: "Fidéliser & Faire revenir vos clients · Lastchance",
  description:
    "Passeport fidélité dans Google Wallet, Calendrier quotidien et salons de jeu Duo & Bande pour installer une habitude durable.",
};

const clubTier = PLAN_TIERS.find((t) => t.id === "engagement") ?? PLAN_TIERS[1];

const RAPPEL_GAIN_HEURES = wonNotRedeemedConfigSchema.parse({}).minAgeHours;
const PALIERS_INACTIFS = inactiveConfigSchema.parse({}).tiers;
const SUITE_CAISSE_HEURES = postRedemptionConfigSchema.parse({}).delayHours;

export default function FideliserPage() {
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
            <div className="rise-in inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-pink px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
              Objectif #3 · Fidéliser & Créer l&apos;habitude
            </div>

            <h1
              className="rise-in k-halo relative z-[2] mx-auto mt-5 max-w-4xl text-[clamp(2.4rem,5.5vw,4.4rem)] leading-[1.05]"
              style={{ ...DISPLAY, animationDelay: "80ms" }}
            >
              Installez l&apos;habitude et{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 text-k-ink shadow-[0_5px_0_var(--color-k-ink)]">
                faites revenir
              </span>{" "}
              vos clients
            </h1>

            <p
              className="k-card rise-in mx-auto mt-4 max-w-2xl rounded-2xl border-[2px] border-k-ink bg-white/95 p-4 text-sm sm:text-base font-bold leading-relaxed text-k-body shadow-[0_3px_0_var(--color-k-ink)]"
              style={{ animationDelay: "140ms" }}
            >
              Fini les cartes en carton perdues. Passeport moderne directement dans le smartphone, rituel quotidien du calendrier à surprises, et salons de jeu Duo &amp; Bande à table.
            </p>

            <div
              className="rise-in mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "200ms" }}
            >
              <Magnetic>
                <Link
                  href="/signup"
                  className="k-btn-light inline-block rounded-full border-[2.5px] border-k-ink bg-k-pink px-8 py-3 text-base font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#ff94ba] transition-colors"
                >
                  Essayer gratuitement 7 jours →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Offre Le Club ({clubTier.priceMonthly} €/mois)
              </Link>
            </div>
          </div>
        </section>

        <StraightRibbonTicker />

        {/* SECTION 1 : FOND UNI BLANC SOLAIRE #FFFDF9 - LES 3 MODULES FIDÉLISATION */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Module 1: Passeport fidélité Wallet */}
              <Reveal delay={0}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-pink px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #1
                        </span>
                        <span className="text-2xl">💳</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Passeport Fidélité
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Passeport dans Google Wallet
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Un passeport dématérialisé que vos clients enregistrent en un clic dans leur smartphone. Cumul de visites, paliers de statut et notifications discrètes pour les inciter à revenir.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Zéro téléchargement sur les stores
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Validation ultra-rapide au scanner caisse
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Historique de visite clair pour le client
                        </li>
                      </ul>
                    </div>
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Club & La Totale, ou option {prixOptionMensuelle("loyalty")} €/mois
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 2: Calendrier à surprises */}
              <Reveal delay={100}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black text-k-ink">
                          Module #2
                        </span>
                        <span className="text-2xl">🎁</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Calendrier à surprises
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Rendez-vous quotidien & assiduité
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        Une case à ouvrir chaque jour pour créer un rendez-vous ludique avec vos clients. Idéal pour un calendrier de l&apos;Avent, le mois d&apos;anniversaire ou une opération de saison.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Durée personnalisable (jusqu&apos;à 31 jours)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Taux de gagnants et lots par case
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Récompense spéciale pour les plus assidus
                        </li>
                      </ul>
                    </div>
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-muted">
                      Inclus dans Le Club & La Totale, ou pass {prixPass("calendar")} €
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>

              {/* Module 3: Salons Duo & Bande */}
              <Reveal delay={200}>
                <Tilt3D intensity={5}>
                  <div className="k-card flex h-full flex-col justify-between rounded-3xl border-[2.5px] border-k-ink bg-white p-6 shadow-[0_4px_0_var(--color-k-ink)]">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full border-2 border-k-ink bg-k-orange px-3 py-0.5 text-xs font-black text-white">
                          Module #3
                        </span>
                        <span className="text-2xl">👥</span>
                      </div>
                      <h3 className="mt-3 text-2xl font-black text-k-ink" style={DISPLAY}>
                        Salons Duo & Bande
                      </h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-wider text-k-orange">
                        Jeux complices à table (2 à 12 joueurs)
                      </p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-k-body">
                        <strong>Duo Miroir</strong> : deux joueurs répondent en secret, leurs réponses se révèlent ensemble.<br />
                        <strong>Portrait de la Bande</strong> : vote secret de 2 à 12 convives pour désigner qui fait quoi.
                      </p>
                      <ul className="mt-4 space-y-1.5 text-xs font-extrabold text-k-ink">
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Aucun compte à créer pour les invités
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Prolonge le temps passé à table
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-k-green">✓</span> Inclus dans les 5 offres dès le socle
                        </li>
                      </ul>
                    </div>
                    <div className="mt-5 border-t border-k-ink/10 pt-3 text-xs font-bold text-k-green">
                      Inclus dans toutes les offres (socle commun)
                    </div>
                  </div>
                </Tilt3D>
              </Reveal>
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="pink-yellow" />

        {/* SECTION 2 : FOND FORMES (RAYURES KERMESSE ROSE/VIOLET) - PORTEFEUILLE CLIENT */}
        <section
          className="relative z-10 py-12 sm:py-16"
          style={{
            backgroundColor: "#FFF5F8",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255, 110, 160, 0.08) 0px, rgba(255, 110, 160, 0.08) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="rounded-3xl border-[3px] border-k-ink bg-[#181512] p-7 sm:p-10 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                <div>
                  <span className="inline-block rounded-full border border-k-yellow/50 bg-k-yellow/10 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-k-yellow">
                    Expérience joueur transparente
                  </span>
                  <h2 className="mt-3 text-2xl sm:text-3xl font-black text-white" style={DISPLAY}>
                    Le Portefeuille « Mes Récompenses »
                  </h2>
                  <p className="mt-2 text-sm font-bold leading-relaxed text-white/80">
                    Chaque client retrouve l&apos;ensemble de ses gains et codes non utilisés sur une seule page dédiée sur son téléphone, sans mot de passe ni app à installer.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                      Zéro mot de passe
                    </span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                      Rappel des gains non retirés
                    </span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                      Inclus sur tous les jeux
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border-2 border-white/15 bg-white/10 p-5">
                  <p className="text-xs font-black uppercase text-k-yellow">Scénarios automatiques inclus</p>
                  <ul className="mt-2.5 space-y-2 text-xs font-bold text-white/90">
                    <li>• Relance automatique d&apos;un gain non retiré, {RAPPEL_GAIN_HEURES} h après le tirage</li>
                    <li>
                      • Réactivation des clients inactifs depuis plus de{" "}
                      {PALIERS_INACTIFS[0]} jours
                    </li>
                    <li>• Suite après passage en caisse, {SUITE_CAISSE_HEURES} h après le retrait</li>
                    <li>• Message d&apos;anniversaire automatique</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 : CTA FINAL APPLAT POP AVEC CONVERSION */}
        <section className="relative z-10 border-t-[3px] border-k-ink bg-k-pink py-14 sm:py-16 text-center text-k-ink">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-3xl sm:text-4xl font-black text-k-ink" style={DISPLAY}>
              Prêt à fidéliser vos clients pour de bon ?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base font-bold text-k-ink/90">
              Activez votre passeport fidélité dès aujourd&apos;hui avec 7 jours d&apos;essai offerts.
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
                href="/animer"
                className="rounded-full border-[2px] border-k-ink bg-white px-7 py-3.5 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow/30 transition-colors"
              >
                Découvrir l&apos;objectif Animer en direct →
              </Link>
            </div>
            <p className="mt-4 text-[11px] font-bold text-k-ink/75">
              ✓ 0 € de frais de mise en service · Sans carte bancaire requise · Annulation en 1 clic
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
