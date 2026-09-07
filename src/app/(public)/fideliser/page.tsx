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
const SECTION = "relative z-10 mx-auto max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20";

export const metadata: Metadata = {
  title: "Fidéliser & Faire revenir vos clients · Lastchance",
  description:
    "Passeport fidélité Apple/Google Wallet, Calendrier quotidien et salons de jeu Duo & Bande pour installer une habitude durable.",
};

const clubTier = PLAN_TIERS.find((t) => t.id === "engagement") ?? PLAN_TIERS[1];

/**
 * LES QUATRE SCÉNARIOS RÉELLEMENT LIVRÉS, ET LEURS DÉLAIS PAR DÉFAUT.
 *
 * La page annonçait quatre scénarios dont un — « message de bienvenue après
 * premier scan » — n'existe pas, et un délai de « 5 jours » que le produit ne
 * pratique pas. La liste et les délais sont désormais LUS dans les schémas de
 * `src/lib/validations/automations.ts` : ils ne peuvent plus vieillir en
 * silence. `birthday` n'a aucun réglage (schéma vide) et n'attache aucune
 * récompense — la page ne doit donc rien lui promettre de plus.
 */
const RAPPEL_GAIN_HEURES = wonNotRedeemedConfigSchema.parse({}).minAgeHours;
const PALIERS_INACTIFS = inactiveConfigSchema.parse({}).tiers;
const SUITE_CAISSE_HEURES = postRedemptionConfigSchema.parse({}).delayHours;

export default function FideliserPage() {
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
          <div className="rise-in inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-pink px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_4px_0_var(--color-k-ink)]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
            Objectif #3 · Fidéliser
          </div>

          <h1
            className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,4.8rem)] leading-[1.04]"
            style={{ ...DISPLAY, animationDelay: "80ms" }}
          >
            Installez l&apos;habitude et{" "}
            <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1 shadow-[0_5px_0_var(--color-k-ink)]">
              faites revenir
            </span>{" "}
            vos clients
          </h1>

          <p
            className="k-card rise-in mx-auto mt-6 max-w-2xl rounded-2xl p-5 text-base font-bold leading-relaxed text-k-body shadow-sm"
            style={{ animationDelay: "140ms" }}
          >
            Fini les cartes de fidélité en carton oubliées au fond d&apos;une poche. Proposez un passeport moderne directement dans Apple Wallet et Google Wallet, un rituel quotidien avec le calendrier à surprises, et des jeux complices à table.
          </p>

          <div
            className="rise-in mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "200ms" }}
          >
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn inline-block rounded-full bg-k-pink px-8 py-3.5 text-base font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
              >
                Essayer gratuitement 7 jours →
              </Link>
            </Magnetic>
            <Link
              href="/tarifs"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md"
            >
              Voir l&apos;offre Le Club ({clubTier.priceMonthly} €/mois)
            </Link>
          </div>
        </section>

        {/* Modules Fidélisation */}
        <section className={SECTION}>
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Module 1: Passeport fidélité Wallet */}
            <Reveal delay={0}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-pink px-3 py-1 text-xs font-black text-k-ink">
                        Module #1
                      </span>
                      <span className="text-2xl">💳</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Passeport Fidélité
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Apple Wallet & Google Wallet
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Un passeport dématérialisé que vos clients enregistrent en un clic dans leur smartphone. Cumul de visites, paliers de statut et notifications discrètes pour les inciter à revenir.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
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
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Club & La Totale, ou option {prixOptionMensuelle("loyalty")} €/mois
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 2: Calendrier à surprises */}
            <Reveal delay={100}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-yellow px-3 py-1 text-xs font-black text-k-ink">
                        Module #2
                      </span>
                      <span className="text-2xl">🎁</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Calendrier à surprises
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Rendez-vous quotidien & assiduité
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      Une case à ouvrir chaque jour pour créer un rendez-vous ludique avec vos clients. Idéal pour un calendrier de l&apos;Avent, le mois d&apos;anniversaire de votre lieu ou une opération estivale.
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Durée personnalisable (jusqu&apos;à 31 jours)
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Taux de gagnants et lots par case
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Récompense spéciale pour les plus fidèles
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-muted">
                    Inclus dans Le Club & La Totale, ou pass {prixPass("calendar")} €
                  </div>
                </div>
              </Tilt3D>
            </Reveal>

            {/* Module 3: Salons Duo & Bande */}
            <Reveal delay={200}>
              <Tilt3D intensity={6}>
                <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-3xl p-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="k-border-thin rounded-full bg-k-orange px-3 py-1 text-xs font-black text-k-ink">
                        Module #3
                      </span>
                      <span className="text-2xl">👥</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-k-ink" style={DISPLAY}>
                      Salons Duo & Bande
                    </h3>
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-k-orange-text">
                      Jeux complices à table (2 à 12 joueurs)
                    </p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-k-body">
                      <strong>Duo Miroir</strong> : deux joueurs répondent en secret, leurs réponses se révèlent ensemble.<br />
                      <strong>Portrait de la Bande</strong> : vote secret de 2 à 12 participants pour désigner qui fait quoi. Rires garantis à table !
                    </p>
                    <ul className="mt-5 space-y-2 text-xs font-extrabold text-k-ink">
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Aucun compte à créer
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Allonge le temps passé et les consommations
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-k-green">✓</span> Inclus dans les 5 offres dès le socle
                      </li>
                    </ul>
                  </div>
                  <div className="mt-6 border-t-2 border-dashed border-k-ink/15 pt-4 text-xs font-bold text-k-green">
                    Inclus dans toutes les offres (socle commun)
                  </div>
                </div>
              </Tilt3D>
            </Reveal>
          </div>
        </section>

        {/* Portefeuille client universel */}
        <section className={SECTION}>
          <div className="k-card-deep rounded-3xl p-8 sm:p-12 text-k-bg">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-k-yellow">
                  Expérience joueur transparente
                </span>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl" style={DISPLAY}>
                  Le Portefeuille « Mes Récompenses »
                </h2>
                <p className="mt-3 text-sm font-bold leading-relaxed text-k-bg/85">
                  Chaque client retrouve l&apos;ensemble de ses gains et codes non utilisés sur une seule page dédiée sur son téléphone, sans avoir besoin d&apos;un mot de passe ou d&apos;une application tierce.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-k-bg">
                    Zéro mot de passe
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-k-bg">
                    Rappel des gains non retirés
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-k-bg">
                    Inclus sur tous les jeux
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-k-bg/20 bg-white/10 p-6">
                <p className="text-xs font-black uppercase text-k-yellow">Scénarios d&apos;automatisation inclus</p>
                <ul className="mt-3 space-y-2.5 text-xs font-bold text-k-bg/90">
                  <li>• Relance automatique d&apos;un gain non retiré, {RAPPEL_GAIN_HEURES} h après le tirage</li>
                  <li>
                    • Réactivation des clients inactifs depuis plus de{" "}
                    {PALIERS_INACTIFS[0]} jours
                  </li>
                  <li>• Suite après passage en caisse, {SUITE_CAISSE_HEURES} h après le retrait</li>
                  <li>• Message d&apos;anniversaire</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={`${SECTION} text-center`}>
          <h2 className="k-halo text-3xl font-black sm:text-4xl" style={DISPLAY}>
            Prêt à fidéliser vos clients pour de bon ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-k-body">
            Activez votre passeport fidélité dès aujourd&apos;hui avec 7 jours d&apos;essai offerts.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Link
                href="/signup"
                className="k-border k-btn rounded-full bg-k-pink px-8 py-3.5 text-base font-black text-k-ink"
              >
                Démarrer mon essai gratuit →
              </Link>
            </Magnetic>
            <Link
              href="/animer"
              className="k-border k-btn rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink"
            >
              Découvrir l&apos;objectif Animer en direct →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
