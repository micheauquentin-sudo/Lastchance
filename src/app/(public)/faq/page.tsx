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
  title: "Foire aux questions (FAQ) · Lastchance",
  description:
    "Toutes les réponses à vos questions sur Lastchance : mise en place, 15 mécaniques de jeu, caisse universelle, RGPD, Google Avis et abonnements.",
};

const FAQ_ITEMS = [
  {
    category: "Démarrage & Matériel",
    q: "Combien de temps faut-il pour être opérationnel ?",
    a: "Moins de 10 minutes : créez votre compte, choisissez l'un des 10 modèles prêts à l'emploi (roue, carte à gratter, pronostics…), personnalisez vos lots et imprimez votre affiche A4 avec son QR code. Vos clients peuvent jouer immédiatement.",
  },
  {
    category: "Démarrage & Matériel",
    q: "Mes clients doivent-ils installer une application ?",
    a: "Non, jamais. Ils scannent simplement le QR code avec l'appareil photo de leur smartphone. Le jeu s'ouvre directement dans le navigateur mobile. Aucun compte obligatoire côté client.",
  },
  {
    category: "Démarrage & Matériel",
    q: "Faut-il du matériel spécifique en caisse ?",
    a: "Aucun matériel dédié. La Caisse universelle fonctionne depuis n'importe quel smartphone, tablette ou terminal de caisse connecté à Internet. Vous flashez le QR du gagnant ou saisissez le code associé à son gain pour le valider.",
  },
  {
    category: "Jeux & Lots",
    q: "Est-ce que je contrôle ce que je distribue ?",
    a: "Totalement. Vous définissez vous-même vos lots, leur stock et leurs probabilités (poids de tirage). Les poids, le tirage pondéré et le décrément de stock sont calculés et protégés sur nos serveurs : le lot attribué ne dépend jamais de ce que renvoie le téléphone du joueur, et un stock épuisé n'est plus jamais distribué.",
  },
  {
    category: "Jeux & Lots",
    q: "Quelles sont les 15 mécaniques de jeu incluses ?",
    a: "Le module Jeux instantanés comprend 9 jeux de hasard (Roue de la chance, Carte à gratter, Carte retournée, Bonneteau 3 verres, Machine à sous, Memory, Coffre mystère, Lancer de dé, Tirage d'une carte) et 6 jeux d'adresse où le client doit réussir l'épreuve pour débloquer le tirage (Pierre-feuille-ciseaux, Jeu de réflexe, Jauge à stopper, Puzzle, Mot mystère, Estimation de nombre).",
  },
  {
    category: "Légalité & Google",
    q: "Est-ce conforme au RGPD ?",
    a: "Le produit est conçu pour ça : consentement explicite obligatoire avant toute collecte, opt-in marketing séparé et jamais pré-coché, données hébergées en Europe, et export CSV disponible à tout moment. Vous pouvez aussi choisir de ne collecter aucune coordonnée.",
  },
  {
    category: "Légalité & Google",
    q: "Et les avis Google Business Profile ?",
    a: "Lastchance respecte scrupuleusement les règles de Google : le gain n'est jamais conditionné au dépôt d'un avis en ligne. Conditionner un avantage à un avis viole les conditions d'utilisation de Google et expose votre fiche à une suspension. Avec Lastchance, vos clients jouent en toute liberté, et s'ils laissent un avis, c'est spontané.",
  },
  {
    category: "Abonnement & Facturation",
    q: "Puis-je arrêter ou mettre en pause quand je veux ?",
    a: "Oui. L'ensemble des abonnements Lastchance est sans engagement de durée. Vous pouvez mettre en pause une campagne d'un simple clic ou résilier votre formule directement depuis votre espace commerçant, sans préavis.",
  },
  {
    category: "Abonnement & Facturation",
    q: "Est-ce rentable pour mon commerce ?",
    a: "Largement : un lot offert (un café, un dessert, -10%) coûte généralement moins de 2 à 3 € à fabriquer, alors qu'une visite supplémentaire ou un contact email qualifié génère plusieurs dizaines d'euros de marge dans l'année. Utilisez notre simulateur de rentabilité sur la page Tarifs pour estimer vos retours.",
  },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex min-h-screen flex-1 flex-col overflow-x-clip bg-[#FFFDF9] text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* HERO AVEC NUAGES ISOLES STRICTEMENT DANS LE HERO */}
        <section className="relative flex min-h-[46vh] sm:min-h-[50vh] flex-col justify-center overflow-hidden px-4 pb-12 pt-28 text-center sm:px-6 sm:pt-32">
          <HeroCloudBackdrop />

          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="rise-in inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-yellow px-4 py-1.5 text-xs font-black text-k-ink shadow-[0_3px_0_var(--color-k-ink)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-orange" />
              Questions fréquentes & réponses claires
            </div>

            <h1
              className="rise-in k-halo relative z-[2] mx-auto mt-5 max-w-3xl text-[clamp(2.4rem,5.5vw,4.2rem)] leading-[1.05]"
              style={{ ...DISPLAY, animationDelay: "80ms" }}
            >
              Tout ce que vous voulez{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-k-ink bg-k-orange px-4 pb-1 text-k-bg shadow-[0_5px_0_var(--color-k-ink)]">
                savoir
              </span>
            </h1>

            <p
              className="k-card rise-in mx-auto mt-4 max-w-xl rounded-2xl border-[2px] border-k-ink bg-white/95 p-3.5 text-sm font-bold text-k-body shadow-[0_3px_0_var(--color-k-ink)]"
              style={{ animationDelay: "140ms" }}
            >
              Mise en place en 10 minutes, conformité RGPD, règles Google, caisse universelle :
              toutes les réponses pour démarrer sereinement.
            </p>
          </div>
        </section>

        <StraightRibbonTicker />

        {/* SECTION FAQ : FOND UNI BLANC SOLAIRE #FFFDF9 */}
        <section className="relative z-10 bg-[#FFFDF9] py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="space-y-3.5">
              {FAQ_ITEMS.map((item, i) => (
                <Reveal key={item.q} delay={i * 30}>
                  <details
                    className={`k-card group rounded-[20px] border-[2px] border-k-ink bg-white shadow-[0_3px_0_var(--color-k-ink)] transition-all ${
                      i % 2 ? "rotate-[0.2deg]" : "-rotate-[0.2deg]"
                    }`}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[20px] px-5 py-4 text-[16px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink [&::-webkit-details-marker]:hidden">
                      <div>
                        <span className="inline-block rounded-full bg-k-yellow/30 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-k-ink">
                          {item.category}
                        </span>
                        <span className="mt-1 block text-base font-black leading-snug">{item.q}</span>
                      </div>
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow shadow-[0_2px_0_var(--color-k-ink)] transition-transform duration-300 group-open:rotate-45">
                        <svg aria-hidden width="12" height="12" viewBox="0 0 14 14" fill="none">
                          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </span>
                    </summary>
                    <p className="border-t border-k-ink/10 px-5 pb-5 pt-3 text-sm font-semibold leading-relaxed text-k-body">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <CheckerboardSeparator variant="amber-orange" />

        {/* SECTION FORMES (RAYURES KERMESSE) : ACCOMPAGNEMENT & CTA INSCRIPTION */}
        <section
          className="relative z-10 py-14 sm:py-16 text-k-ink"
          style={{
            backgroundColor: "#FFF8ED",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255, 107, 53, 0.07) 0px, rgba(255, 107, 53, 0.07) 32px, transparent 32px, transparent 64px)",
          }}
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <div className="rounded-3xl border-[3px] border-k-ink bg-white p-7 sm:p-10 shadow-[0_6px_0_var(--color-k-ink)]">
              <span className="inline-block rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-xs font-black">
                Support & Démo
              </span>
              <h2 className="mt-3 text-2xl sm:text-3xl font-black text-k-ink" style={DISPLAY}>
                Une question spécifique sur votre établissement ?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-bold text-k-body">
                Notre équipe vous aide à choisir les meilleures mécaniques pour votre activité :
                restaurant, bar, boutique, salon ou loisir.
              </p>

              <div className="mt-6 flex flex-wrap justify-center items-center gap-3">
                <Magnetic>
                  <Link
                    href="/signup"
                    className="k-btn-light inline-flex items-center gap-2 rounded-full border-[2.5px] border-k-ink bg-k-orange px-8 py-3 text-sm font-black text-white shadow-[0_4px_0_var(--color-k-ink)] hover:bg-[#e05622] transition-colors"
                  >
                    Créer mon compte en 2 min →
                  </Link>
                </Magnetic>
                <Link
                  href="/tarifs"
                  className="rounded-full border-[2px] border-k-ink bg-k-yellow/40 px-6 py-3 text-sm font-black text-k-ink shadow-[0_2px_0_var(--color-k-ink)] hover:bg-k-yellow"
                >
                  Voir les formules & tarifs
                </Link>
              </div>

              <p className="mt-4 text-[11px] font-bold text-k-muted">
                ✓ 0 € de frais de mise en service · 7 jours d&apos;essai offerts · Sans engagement
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
