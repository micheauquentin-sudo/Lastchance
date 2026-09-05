import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { Avatar } from "@/lib/avatars";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { Magnetic } from "@/components/marketing/magnetic";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollArrow } from "@/components/marketing/scroll-arrow";
import { ScrollPanoramaBackground } from "@/components/marketing/scroll-panorama-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { Tilt3D } from "@/components/ui/tilt-3d";

/* DA « La Kermesse » : Lilita One pour les titres (voix foraine, ronde),
   Nunito 600-900 pour le corps. `--font-heading` est aussi consommé par
   HeroShowcase (labels de la roue, écran du téléphone).

   ── Poids visuel : ce que cette page NE fait plus ──
   La page vit sur un décor scrollytelling : une illustration verticale unique
   translatée au scroll (`ScrollPanoramaBackground`, `public/panorama/`), des
   nuages bleus au corridor rose puis violet.
   Chaque section portait auparavant une carte à bordure d'encre 3 px, ombre
   dure diagonale et fond blanc à 82 % : empilé, cela formait une grille de
   boîtes qui enfermait le film au lieu de flotter dessus. Désormais :
     · les SECTIONS sont transparentes, sans séparateur pleine largeur ;
     · les CARTES sont du verre fin (`k-card`), l'encre pleine et l'ombre dure
       n'arrivent qu'au survol ou à l'état ouvert (`k-card-hover`) ;
     · les OMBRES dures sont verticales (`k-hard`), plus jamais diagonales ;
     · les BOUTONS et les STICKERS gardent la signature complète — c'est la
       marque, et elle doit rester reconnaissable quelque part. */
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

/** Conteneur commun : transparent, centré, le décor passe derrière. */
const SECTION = "relative z-10 mx-auto max-w-6xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20";

/* ─────────────────────────── Contenu ─────────────────────────── */

const HERO_CHIPS = [
  "Prêt en 10 min",
  "Sans compte client",
  "Conforme RGPD",
  "Sans engagement",
];

const STEPS = [
  {
    n: 1,
    dot: "bg-k-orange text-k-ink",
    tilt: "-rotate-[1.6deg]",
    title: "Posez votre QR code",
    description: "Sur le comptoir, le menu ou le ticket de caisse. Affiche A4 fournie.",
  },
  {
    n: 2,
    dot: "bg-k-yellow text-k-ink",
    tilt: "rotate-[1.3deg]",
    title: "Ils tentent leur chance",
    description: "Ils scannent, tournent la roue et découvrent leur gain immédiatement.",
  },
  {
    n: 3,
    dot: "bg-k-pink text-k-ink",
    tilt: "-rotate-[0.7deg]",
    title: "Vous encaissez les retours",
    description: "Ils repassent la porte pour leur gain. Vous le validez en caisse en une seconde.",
  },
];

const FEATURES = [
  { n: "01", dot: "bg-k-yellow text-k-ink", title: "QR codes & affiches prêtes", description: "Affiches A4 imprimables, quatre modèles au choix, QR personnalisés." },
  { n: "02", dot: "bg-k-blue text-k-ink", title: "Stats en temps réel", description: "Tours joués, taux de gagnants, scans — campagne par campagne." },
  { n: "03", dot: "bg-k-orange text-k-ink", title: "Roue 100 % personnalisable", description: "Couleurs, anneau, polices, pointeur : la roue ressemble à votre commerce." },
  { n: "04", dot: "bg-k-pink text-k-ink", title: "Validation en caisse", description: "Le staff saisit le code du gagnant et valide le gain en une seconde." },
  { n: "05", dot: "bg-k-green text-k-bg", title: "Conforme RGPD", description: "Consentement explicite, données en Europe, export CSV inclus." },
  { n: "06", dot: "bg-k-orange text-k-ink", title: "Emails de gain automatiques", description: "Chaque gagnant reçoit son code, au nom de votre établissement." },
];

const RISKS = [
  "Conditionner un avantage à un avis viole les règles de Google Business Profile",
  "Une fiche signalée peut être suspendue — invisible sur Maps et la recherche locale",
  "Les faux avis (même « incités ») ternissent la confiance des vrais clients",
];

const MERCHANT_POINTS = [
  "Campagnes illimitées",
  "Statistiques en temps réel",
  "Gestion des gains et des probabilités",
  "Export des joueurs et emails",
  "Compatible mobile",
];

const PRICING_FEATURES = [
  "Campagnes et roues illimitées",
  "QR codes et affiches A4 illimités",
  "Personnalisation complète (logo, couleurs, polices)",
  "Page caisse pour valider les gains",
  "Statistiques en temps réel + export CSV",
  "Emails de gain automatiques",
  "Conformité RGPD intégrée",
];

const PRONO_POINTS = [
  "Vos clients pronostiquent chaque match depuis leur téléphone",
  "Résultats et classement mis à jour quasi en temps réel",
  "Vos récompenses pour les meilleurs — ils reviennent les chercher",
  "Pseudo + avatar, zéro compte à créer côté client",
];

const PRONO_COMPETITIONS = [
  "⚽ Ligue 1",
  "🏆 Coupe du monde",
  "⭐ Euro",
  "🌍 CAN",
  "🏉 6 Nations",
  "🎾 Roland-Garros",
];

const FAQ = [
  {
    question: "Combien de temps faut-il pour démarrer ?",
    answer:
      "Une dizaine de minutes : créez votre compte, configurez vos lots, imprimez l'affiche avec son QR code et posez-la en caisse. Vos clients peuvent jouer immédiatement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    answer:
      "Non. Le jeu s'ouvre directement dans le navigateur du téléphone après le scan du QR code. Aucun téléchargement, aucun compte à créer côté client.",
  },
  {
    question: "Comment sont contrôlés les gains ?",
    answer:
      "C'est vous qui définissez les lots, leurs probabilités et leurs stocks. Le tirage se fait côté serveur — impossible à manipuler — et chaque gain génère un code unique que votre équipe valide en caisse.",
  },
  {
    question: "Est-ce conforme au RGPD ?",
    answer:
      "Oui. Le consentement des joueurs est explicite, les données sont hébergées en Europe et vous pouvez les exporter à tout moment. Les gains ne sont jamais conditionnés au dépôt d'un avis en ligne.",
  },
  {
    question: "Puis-je arrêter quand je veux ?",
    answer:
      "Oui. L'abonnement est sans engagement : vous pouvez le gérer ou le résilier à tout moment depuis votre espace, en quelques clics.",
  },
  {
    question: "Comment fonctionne l'option Pronostics ?",
    answer:
      "Vous créez un championnat (Ligue 1, Euro, Coupe du monde…), vos clients scannent un QR code, choisissent un pseudo et un avatar, puis pronostiquent chaque match. Les résultats et le classement se mettent à jour automatiquement, et les meilleurs remportent les récompenses que vous définissez. L'option coûte 9 €/mois avec l'abonnement Starter — ou 49 € en Pass Compétition unique, sans abonnement.",
  },
];

/* ─────────────────────── Éléments partagés ─────────────────────── */

/**
 * Sur-titre de section : pastille colorée + majuscules espacées, posé À NU
 * sur le décor. Remplace l'ancienne étiquette encadrée d'encre, qui ajoutait
 * une boîte par section.
 *
 * La couleur vit dans la PASTILLE, pas dans le texte : mesuré sur les images
 * réelles du décor, voile compris, l'orange texte tombe à 1,67:1 là où le halo
 * ne couvre pas, et plafonne à 4,66:1 là où il couvre — trop juste pour du
 * 12 px. En encre halotée, c'est 15,5:1 au mieux et 5,7:1 au pire, sur le bas
 * du décor où le corridor de nuages devient violet sombre.
 */
function KEyebrow({
  children,
  dot = "accent",
  tone = "ink",
}: {
  children: React.ReactNode;
  /* `accent` (défaut) suit la teinte du décor ; sinon une classe de fond de la
     charte, pour les rares endroits où la couleur doit rester fixe. */
  dot?: string;
  /* `cream` sert au seul panneau foncé : le halo crème y serait invisible, et
     le texte s'y pose sur une surface maîtrisée qui n'en a pas besoin. */
  tone?: "ink" | "cream";
}) {
  const accent = dot === "accent";
  return (
    <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] sm:text-sm">
      <span
        aria-hidden
        className={`h-2 w-2 flex-none rounded-full ${accent ? "" : dot}`}
        style={accent ? { backgroundColor: "var(--backdrop-accent)" } : undefined}
      />
      <span className={tone === "cream" ? "text-k-bg" : "k-halo text-k-ink"}>{children}</span>
    </div>
  );
}

/** CTA principal kermesse : pilule pleine sur socle encre qui s'écrase. */
function KPrimary({
  href,
  children,
  className = "bg-k-orange text-k-ink",
  large = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  large?: boolean;
}) {
  return (
    <Magnetic>
      <Link
        href={href}
        className={`k-border k-btn inline-block whitespace-nowrap rounded-full font-black focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink ${
          large ? "px-9 py-4 text-lg" : "px-7 py-3.5 text-base"
        } ${className}`}
      >
        {children}
      </Link>
    </Magnetic>
  );
}

function KOutline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="k-border k-btn inline-block whitespace-nowrap rounded-full bg-white/85 px-7 py-3.5 text-base font-black text-k-ink backdrop-blur-md focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
    >
      {children}
    </Link>
  );
}

/** Coche verte des listes (langage kermesse : cercle plein + bordure). */
function KCheck() {
  return (
    <span className="k-border-thin flex h-6 w-6 flex-none items-center justify-center rounded-full bg-k-green text-k-bg">
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function KCross() {
  return (
    <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-pink text-k-ink">
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Trèfle à quatre feuilles souriant — ancienne mascotte du hero (pur CSS).
 *
 *  RETRAIT TEMPORAIRE (demande du 2026-09-03) : sur le décor scrollytelling,
 *  la mascotte de 250 px écrasait le film et poussait le titre sous la ligne
 *  de flottaison. Le composant est CONSERVÉ tel quel pour être remis sans
 *  avoir à le réécrire — les stickers flottants du hero tiennent sa place
 *  d'ancre cartoon en attendant. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CloverMascot() {
  const leaf =
    "absolute w-[96px] h-[96px] bg-k-green k-border rounded-[50%_50%_16px_50%]";
  return (
    <div aria-hidden className="k-float relative z-[2] mx-auto h-[230px] w-[250px]">
      {/* tige */}
      <div className="k-border absolute left-1/2 top-[150px] h-[80px] w-[16px] -translate-x-1/2 rotate-[7deg] rounded-xl bg-k-green" />
      <div className="absolute left-1/2 top-0 h-[220px] w-[220px] -ml-[110px]">
        <div className="k-wobble absolute inset-0">
          <span className={`${leaf} left-[6px] top-[6px]`} />
          <span className={`${leaf} right-[6px] top-[6px] rotate-90`} />
          <span className={`${leaf} right-[6px] bottom-[6px] rotate-180`} />
          <span className={`${leaf} left-[6px] bottom-[6px] -rotate-90`} />
          {/* reflets */}
          <span className="absolute left-[30px] top-[26px] h-4 w-4 rounded-full bg-k-bg/85" />
          <span className="absolute right-[34px] top-[30px] h-[11px] w-[11px] rounded-full bg-k-bg/85" />
          <span className="absolute bottom-[34px] right-[28px] h-[13px] w-[13px] rounded-full bg-k-bg/85" />
          {/* visage */}
          <div className="k-border absolute left-1/2 top-1/2 z-[2] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-[5px] rounded-full bg-k-bg">
            <div className="mt-1.5 flex gap-4">
              <span className="h-3.5 w-2.5 rounded-full bg-k-ink" />
              <span className="h-3.5 w-2.5 rounded-full bg-k-ink" />
            </div>
            <div className="h-[15px] w-[30px] rounded-b-[30px] border-4 border-t-0 border-k-ink" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function Hero() {
  return (
    <section className="relative z-10 overflow-x-clip px-4 pb-16 pt-28 text-center sm:px-6 sm:pt-32">
      <HeroStickers />

      {/* Elle disait la même chose que le titre juste en dessous, sur deux
          lignes en mobile. Réduite au seul fait qu'elle apporte : la durée
          d'essai. */}
      <div className="rise-in relative z-[2] inline-flex items-center gap-2 rounded-full border-[3px] border-k-ink bg-k-yellow px-4 py-1.5 text-[12px] font-black tracking-[0.06em] text-k-ink shadow-[0_4px_0_var(--color-k-ink)] sm:text-[13px]">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-k-orange" />
        7 jours offerts
      </div>

      <h1
        className="rise-in k-halo relative z-[2] mx-auto mt-6 max-w-[860px] text-[clamp(2.9rem,8vw,5.4rem)] leading-[1.02]"
        style={{ ...DISPLAY, animationDelay: "80ms" }}
      >
        La chance fait{" "}
        <span className="inline-block -rotate-[1.56deg] rounded-[18px] border-[3px] border-k-ink bg-k-yellow px-4 pb-1.5 shadow-[0_5px_0_var(--color-k-ink)]">
          revenir
        </span>{" "}
        vos clients
      </h1>

      {/* Le chapô a été retiré : il redisait le titre en plus long, et les
          quatre pastilles ci-dessous portent déjà « prêt en 10 min » et
          « conforme RGPD ». Un titre, deux boutons, quatre preuves — le hero
          n'a rien à ajouter, et le décor respire d'autant. */}

      <div
        className="rise-in relative z-[2] mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        style={{ animationDelay: "160ms" }}
      >
        <KPrimary href="/signup" className="bg-k-orange text-k-ink">
          Créer ma roue →
        </KPrimary>
        <KOutline href="#demo-roue">Essayer la roue</KOutline>
      </div>

      <div
        className="rise-in relative z-[2] mt-8 flex flex-wrap justify-center gap-2.5"
        style={{ animationDelay: "240ms" }}
      >
        {HERO_CHIPS.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1.5 rounded-full border border-k-ink/20 bg-white/80 px-4 py-2 text-sm font-bold text-k-ink shadow-[0_2px_8px_rgba(33,29,22,0.10)] backdrop-blur-md"
          >
            <span aria-hidden className="font-black text-k-green">
              ✓
            </span>
            {chip}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Ruban marquee : pilule centrée, plus une barre pleine largeur bordée. */
function Marquee() {
  const line = "ILS SCANNENT ★ ILS TOURNENT ★ ILS GAGNENT ★ ILS REVIENNENT ★ ".repeat(3);
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
      <div
        aria-hidden
        className="ticker overflow-hidden rounded-full bg-k-ink/80 py-2.5 backdrop-blur-md"
      >
        {/* La cible nommée par la demande : le ruban porte la teinte du moment.
            Sûr à toutes les teintes — la clarté est constante (L 0,58), donc le
            contraste sur l'encre ne descend jamais sous ~4:1, et ce ruban est
            décoratif (`aria-hidden`), pas une information. */}
        <div
          className="ticker-track flex w-max whitespace-nowrap text-lg font-extrabold tracking-[0.08em]"
          style={{ ...DISPLAY, color: "var(--backdrop-accent)" }}
        >
          <span className="pr-10">{line.trim()}</span>
          <span className="pr-10">{line.trim()}</span>
        </div>
      </div>
    </div>
  );
}

/** Grand stand de démo : la vraie roue interactive dans son cadre forain. */
function WheelDemo() {
  return (
    <section id="demo-roue" className={SECTION}>
      <ScrollArrow />
      <div className="text-center">
        <Reveal>
          <KEyebrow>La démo, en vrai</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
            Essayez la roue, là, tout de suite.
          </h2>
        </Reveal>
      </div>
      {/* Plus de carte, plus de rayures, plus d'ombre : la roue et le téléphone
          flottent à même le décor. Il reste un halo crème SANS ARÊTE — assez
          pour que la roue se détache d'un ciel chargé de nuages, pas assez pour
          redevenir une boîte. */}
      <Reveal className="reveal-pop mx-auto mt-10 max-w-5xl" delay={120}>
        <Tilt3D intensity={15} scale={1.03}>
          <div className="relative px-3 py-8 sm:px-8 sm:py-10">
            <span
              aria-hidden
              className="k-stage-glow pointer-events-none absolute -inset-x-8 -inset-y-6"
            />
            <div className="relative">
              <HeroShowcase />
            </div>
          </div>
        </Tilt3D>
      </Reveal>
    </section>
  );
}

/** Flèche courbe pointillée entre les étapes (animée). */
function KArrow({ flip = false }: { flip?: boolean }) {
  return (
    <div className={`hidden items-center px-1.5 lg:flex ${flip ? "translate-y-2.5 -scale-y-100" : "-translate-y-5"}`}>
      <svg width="90" height="52" viewBox="0 0 90 52" aria-hidden>
        <path className="dash-flow" d="M6 40 C 30 8, 58 8, 80 26" fill="none" stroke="var(--color-k-ink)" strokeWidth="4" strokeLinecap="round" />
        <path d="M70 18 L 82 27 L 68 32" fill="none" stroke="var(--color-k-ink)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Visuels des 3 étapes, fidèles à la maquette (QR, mini-roue, barres). */
function StepVisual({ step }: { step: number }) {
  if (step === 1) {
    return (
      <div className="k-border-thin mb-4 mt-4 grid h-[86px] w-[86px] grid-cols-3 grid-rows-3 gap-[5px] rounded-[14px] bg-white/90 p-2.5">
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
        <span /><span className="rounded-[3px] bg-k-orange" /><span />
        <span className="rounded-[3px] bg-k-ink" /><span /><span className="rounded-[3px] bg-k-ink" />
      </div>
    );
  }
  if (step === 2) {
    return (
      <div
        className="k-border-thin k-spin mb-4 mt-4 h-[86px] w-[86px] rounded-full"
        style={{ background: "conic-gradient(var(--color-k-orange) 0 25%, var(--color-k-yellow) 0 50%, var(--color-k-pink) 0 75%, var(--color-k-blue) 0 100%)" }}
      />
    );
  }
  return (
    <div className="k-border-thin mb-4 mt-4 flex h-[86px] w-[86px] items-end gap-2 rounded-[14px] bg-white/90 p-3">
      <span className="k-border-thin h-[38%] flex-1 rounded-t-md bg-k-pink" />
      <span className="k-border-thin h-[64%] flex-1 rounded-t-md bg-k-yellow" />
      <span className="k-border-thin h-[88%] flex-1 rounded-t-md bg-k-green" />
    </div>
  );
}

function Steps() {
  return (
    <section id="comment-ca-marche" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>Comment ça marche</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
          Trois étapes. Zéro prise de tête.
        </h2>
      </Reveal>

      <div className="mt-12 flex flex-col items-center justify-center gap-10 lg:flex-row lg:items-stretch lg:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.n} className="contents">
            <Reveal
              delay={i * 120}
              className={["reveal-tilt-l", "reveal-pop", "reveal-tilt-r"][i]}
            >
              <div className={step.tilt}>
                <Tilt3D>
                  <div className="k-card k-card-hover relative w-full max-w-[340px] rounded-[22px] px-8 pb-8 pt-9">
                    <span
                      className={`k-border k-hard-sm absolute -top-6 left-6 flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${step.dot}`}
                      style={DISPLAY}
                    >
                      {step.n}
                    </span>
                    <StepVisual step={step.n} />
                    <h3 className="text-[22px]" style={DISPLAY}>{step.title}</h3>
                    <p className="mt-2.5 text-[15px] font-bold leading-normal text-k-body">{step.description}</p>
                  </div>
                </Tilt3D>
              </div>
            </Reveal>
            {i < STEPS.length - 1 && <KArrow flip={i === 1} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="fonctionnalites" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>La boîte à outils</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
          Tout ce qu&apos;il faut, rien de superflu.
        </h2>
      </Reveal>

      <div className="mt-11 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.n} delay={(i % 3) * 90} className={["reveal-tilt-l", "reveal-pop", "reveal-tilt-r"][i % 3]}>
            <div className={i % 2 ? "-rotate-[0.65deg]" : "rotate-[0.65deg]"}>
              <Tilt3D>
                <div className="k-card k-card-hover h-full rounded-[22px] p-6">
                  <span
                    className={`k-border k-hard-sm inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg ${f.dot}`}
                    style={DISPLAY}
                  >
                    {f.n}
                  </span>
                  <h3 className="mt-4 text-[21px]" style={DISPLAY}>{f.title}</h3>
                  <p className="mt-2 text-[14.5px] font-bold leading-normal text-k-body">{f.description}</p>
                </div>
              </Tilt3D>
            </div>
          </Reveal>
        ))}
      </div>

      <HonestGame />
    </section>
  );
}

/**
 * « Notre différence » : le jeu honnête.
 *
 * L'ancien panneau vert plein (`bg-k-green/90`, texte crème) ne passait PAS le
 * contraste : sur le décor clair du haut, le crème tombait à ~3,8:1. Passé un
 * temps en carte de verre claire comme les autres, il perdait alors ce pour
 * quoi il existe — être le point d'arrêt du milieu de page.
 *
 * Il garde donc sa surface foncée, dans le ton PROFOND de `.k-card-deep`. Ce
 * ton était vert ; il est passé à la prune avec le changement d'illustration du
 * décor — le vert n'avait plus aucun rappel dans un fond bleu → rose → magenta
 * → violet, et il était de surcroît le moins contrasté des candidats (5,2:1 en
 * crème contre 7,6:1 pour la prune, voile et translucidité compris). C'est la
 * seule surface sombre avant le pied de page : elle marque le seul argument que
 * le produit oppose frontalement à ses concurrents.
 */
function HonestGame() {
  return (
    <Reveal className="reveal-pop mt-14" delay={80}>
      <Tilt3D intensity={6}>
        <div className="k-card-deep grid gap-9 rounded-[26px] p-7 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <KEyebrow dot="bg-k-yellow" tone="cream">Notre différence</KEyebrow>
            <h3 className="mt-3 text-[clamp(1.7rem,3vw,2.1rem)] leading-tight text-k-bg" style={DISPLAY}>
              Un jeu honnête,<br />pas un piège à avis.
            </h3>
            <p className="mt-3.5 text-[15.5px] font-bold leading-[1.55] text-k-bg/90">
              Le gain n&apos;est jamais conditionné à un avis, un like ou un
              abonnement. Vos clients jouent, gagnent, reviennent — et si un
              avis arrive, il est spontané. Votre fiche Google ne prend aucun
              risque.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3.5">
            {RISKS.map((risk, i) => (
              <div
                key={risk}
                className={`flex items-center gap-3 rounded-2xl border-2 border-k-ink/15 bg-white/88 px-4 py-3 text-[13.5px] font-extrabold text-k-ink ${
                  i % 2 ? "rotate-[0.65deg]" : "-rotate-[0.65deg]"
                }`}
              >
                <KCross />
                {risk}
              </div>
            ))}
            <div className="k-border k-hard-sm rotate-[0.65deg] rounded-2xl bg-k-yellow px-4 py-3.5 text-[14.5px] font-extrabold text-k-ink">
              <div className="flex items-center gap-3">
                <span className="k-border-thin flex h-7 w-7 flex-none items-center justify-center rounded-full bg-k-bg">
                  <svg aria-hidden width="13" height="13" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                « Tournez, gagnez, un point c&apos;est tout » — fiche protégée
              </div>
            </div>
          </div>
        </div>
      </Tilt3D>
    </Reveal>
  );
}

/* ── Aperçu du dashboard (maquette décorative, données fictives) ── */

function DonutChart() {
  const data = [
    { label: "-20 %", value: 35, color: "var(--color-k-orange)" },
    { label: "Boisson offerte", value: 25, color: "var(--color-k-pink)" },
    { label: "-10 %", value: 20, color: "var(--color-k-yellow)" },
    { label: "Dessert offert", value: 10, color: "var(--color-k-blue)" },
    { label: "Autres", value: 10, color: "var(--color-k-green)" },
  ];
  const R = 32;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="chart-pop h-24 w-24 shrink-0 -rotate-90" aria-hidden>
        {data.map((d) => {
          const len = (d.value / 100) * CIRC;
          const seg = (
            <circle
              key={d.label}
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 font-bold text-k-body">
            <span className="k-border-thin h-3 w-3 rounded-full" style={{ background: d.color }} />
            <span className="flex-1">{d.label}</span>
            <span className="font-black text-k-ink">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineChart() {
  const pts = [8, 22, 15, 30, 24, 40, 33, 52, 44, 60];
  const w = 260;
  const h = 90;
  const step = w / (pts.length - 1);
  const max = 64;
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`).join(" ");
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  const markerX = 7 * step;
  const markerY = h - (52 / max) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5793b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f5793b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lc-area)" className="chart-pop" />
      <path d={path} fill="none" stroke="#f5793b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chart-line" pathLength={1} />
      <circle cx={markerX} cy={markerY} r="4.5" fill="#f5793b" stroke="#211d16" strokeWidth="2" className="chart-marker" />
      <g transform={`translate(${markerX - 15} ${markerY - 26})`} className="chart-marker">
        <rect width="30" height="17" rx="8.5" fill="#211d16" />
        <text x="15" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fdf6e3">128</text>
      </g>
    </svg>
  );
}

function DashboardMockup() {
  const navItems = ["Tableau de bord", "Campagnes", "Joueurs", "Gains", "Statistiques", "QR Codes", "Paramètres"];
  const stats = [
    { label: "Joueurs", value: "1 286", delta: "+18%" },
    { label: "Emails collectés", value: "342", delta: "+27%" },
    { label: "Taux de participation", value: "34%", delta: "+13%" },
    { label: "Gains distribués", value: "412", delta: "+15%" },
  ];
  return (
    /* Cette carte reste OPAQUE, et c'est délibéré : elle figure un écran de
       logiciel. Un dashboard translucide laissant passer le décor ne se lit
       plus comme une capture. Seule l'ombre passe en vertical et douce. */
    <div className="k-border k-soft overflow-hidden rounded-[22px] bg-white">
      <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr]">
        {/* Sidebar */}
        <aside className="border-r-[2.5px] border-k-ink bg-k-bg p-3">
          <p className="px-2 text-sm" style={DISPLAY}>
            LastChance<span className="text-k-orange">.</span>
          </p>
          <ul className="mt-4 space-y-0.5">
            {navItems.map((item, i) => (
              <li
                key={item}
                className={`truncate rounded-lg px-2 py-1.5 text-[11px] font-bold ${
                  i === 0 ? "k-border-thin bg-k-yellow text-k-ink" : "text-k-body"
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-k-ink">Tableau de bord</p>
            <span className="k-border-thin rounded-md px-2 py-1 text-[10px] font-bold text-k-body">1 – 31 mai 2026</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="k-border-thin rounded-lg bg-white p-2.5">
                <p className="truncate text-[10px] font-bold text-k-body">{s.label}</p>
                <p className="mt-0.5 text-base font-black text-k-ink">
                  {s.value} <span className="text-[10px] font-black text-k-green">↑ {s.delta}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="k-border-thin rounded-lg p-3">
              <p className="text-xs font-black text-k-ink">Évolution des participations</p>
              <div className="mt-2">
                <LineChart />
              </div>
            </div>
            <div className="k-border-thin rounded-lg p-3">
              <p className="text-xs font-black text-k-ink">Top gains</p>
              <div className="mt-3">
                <DonutChart />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MerchantSpace() {
  return (
    <section id="espace-commercant" className={SECTION}>
      <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal className="reveal-tilt-l">
          <KEyebrow>Votre espace</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight" style={DISPLAY}>
            Vous voyez qui revient, et ce que ça vous rapporte.
          </h2>
          <div className="k-card mt-8 rounded-[22px] p-6">
            <ul className="space-y-3.5">
              {MERCHANT_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-3 font-bold text-k-body">
                  <KCheck />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-9">
            <KPrimary href="/signup" className="bg-k-yellow text-k-ink">
              Voir mon tableau de bord →
            </KPrimary>
          </div>
        </Reveal>

        <Reveal delay={120} className="reveal-tilt-r">
          <div className="rotate-[0.6deg]">
            <Tilt3D intensity={8}>
              <DashboardMockup />
            </Tilt3D>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Mockup de classement pronostics — vrais avatars du produit. */
function PronoLeaderboardMockup() {
  return (
    <div className="k-card k-soft rounded-[22px] p-6">
      <p className="text-[15px] font-black text-k-ink">🏆 Classement — Coupe du monde</p>
      <p className="mt-0.5 text-xs font-bold text-k-body">Chez Momo · 27 joueurs</p>
      <ul className="mt-4 space-y-2">
        {[
          { avatar: "bresil", name: "Leïla", pts: "21 pts", rank: "🥇" },
          { avatar: "renard", name: "Le Sorcier", pts: "19 pts", rank: "🥈" },
          { avatar: "maroc", name: "Yassine", pts: "16 pts", rank: "🥉" },
          { avatar: "france", name: "Marco", pts: "14 pts", rank: "4" },
        ].map((r) => (
          <li
            key={r.name}
            className="flex items-center gap-3 rounded-xl border-2 border-k-ink/20 bg-white/85 px-3 py-2"
          >
            <span className="w-6 text-center text-sm font-black text-k-ink">{r.rank}</span>
            <Avatar id={r.avatar} className="h-8 w-8 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-k-ink">
              {r.name}
            </span>
            <span className="text-sm font-black tabular-nums text-k-ink">{r.pts}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border-2 border-dashed border-k-ink/40 bg-white/60 px-3 py-2 text-center text-xs font-extrabold text-k-body">
        France 2 – 1 Brésil · pronostic exact <span className="rounded-full bg-k-yellow px-2 py-0.5 font-black text-k-ink">+3 pts</span>
      </div>
    </div>
  );
}

function Pronostics() {
  return (
    <section id="pronostics" className={SECTION}>
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <Reveal className="reveal-tilt-l">
          <KEyebrow>Nouveau · en option</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] text-k-ink" style={DISPLAY}>
            Les grandes compétitions se jouent aussi chez vous.
          </h2>
          <p className="k-card mt-5 max-w-[540px] rounded-[18px] px-6 py-4 text-[17px] font-bold leading-[1.55] text-k-body">
            Avec l&apos;option <strong>Pronostics</strong>, votre commerce a son
            propre championnat : un QR code, vos clients pronostiquent les
            matchs, et le classement anime le comptoir pendant toute la
            compétition.
          </p>
          <ul className="k-card mt-5 flex max-w-[540px] flex-col gap-2.5 rounded-[18px] px-6 py-5 text-[15px] font-extrabold text-k-ink">
            {PRONO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <KCheck />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {PRONO_COMPETITIONS.map((c) => (
              <span
                key={c}
                className="rounded-full border border-k-ink/20 bg-white/80 px-3.5 py-1.5 text-[13px] font-black text-k-ink backdrop-blur-md"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <KPrimary href="#tarifs" className="bg-k-yellow text-k-ink">
              Voir l&apos;offre →
            </KPrimary>
            <span className="rounded-full border border-k-ink/20 bg-white/80 px-4 py-2 text-sm font-black text-k-ink backdrop-blur-md">
              +9 €/mois avec Starter · ou Pass Compétition 49 €
            </span>
          </div>
        </Reveal>

        <Reveal delay={120} className="reveal-tilt-r">
          <div className="rotate-[1deg]">
            <Tilt3D intensity={8}>
              <PronoLeaderboardMockup />
            </Tilt3D>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const PRONO_OFFER_FEATURES = [
  "Championnats illimités pendant la période",
  "Calendriers et résultats automatiques",
  "Classement public + récompenses par rang",
  "Pseudos et avatars pour vos clients",
];

function Pricing() {
  return (
    <section id="tarifs" className={SECTION}>
      <Reveal className="text-center">
        <KEyebrow>Tarifs</KEyebrow>
        <h2 className="k-halo mt-3 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05]" style={DISPLAY}>
          Un prix simple. Une option sport.
        </h2>
        <p className="k-card mx-auto mt-5 max-w-[560px] rounded-[18px] px-6 py-4 text-base font-bold leading-[1.55] text-k-body">
          Pas de paliers compliqués : un abonnement tout inclus, et le
          module Pronostics en option — avec ou sans abonnement. Sans
          engagement, résiliable à tout moment.
        </p>
      </Reveal>

      <div className="mx-auto mt-12 grid max-w-5xl items-start justify-center gap-10 md:grid-cols-2 md:gap-8">
        <Reveal delay={80} className="reveal-pop w-full max-w-[400px] justify-self-center md:justify-self-end">
          <div className="rotate-[0.65deg]">
            <Tilt3D>
              <div className="k-card k-card-hover relative rounded-[22px] p-8 sm:p-10">
                <span className="k-border k-hard-sm absolute -top-4 right-6 rotate-[3deg] rounded-full bg-k-yellow px-4 py-1.5 text-[13px] font-black text-k-ink">
                  7 jours offerts
                </span>
                <span aria-hidden data-avatar-slot="pricing" className="pointer-events-none absolute -left-6 top-8 h-0 w-0" />
                <div className="text-[22px]" style={DISPLAY}>Starter</div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-[56px] leading-none" style={DISPLAY}>29 €</span>
                  <span className="text-lg font-black text-k-muted">/ mois</span>
                </div>
                <div className="my-5 border-t-2 border-dashed border-k-ink/30" />
                <ul className="flex flex-col gap-2.5 text-[15px] font-extrabold">
                  {PRICING_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <KCheck />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="k-border k-btn mt-6 block rounded-full bg-k-orange py-3.5 text-center text-[17px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
                >
                  Démarrer mes 7 jours offerts
                </Link>
              </div>
            </Tilt3D>
          </div>
        </Reveal>

        <Reveal delay={160} className="reveal-pop w-full max-w-[400px] justify-self-center md:justify-self-start">
          <div className="-rotate-[0.65deg]">
            <Tilt3D>
              <div className="k-card k-card-hover relative rounded-[22px] p-8 sm:p-10">
                <span className="k-border k-hard-sm absolute -top-4 right-6 -rotate-[3deg] rounded-full bg-k-green px-4 py-1.5 text-[13px] font-black text-k-bg">
                  OPTION SPORT
                </span>
                <div className="text-[22px]" style={DISPLAY}>Pronostics</div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-[56px] leading-none" style={DISPLAY}>+9 €</span>
                  <span className="text-lg font-black text-k-muted">/ mois</span>
                </div>
                <p className="mt-1 text-sm font-extrabold text-k-body">
                  en option de l&apos;abonnement Starter
                </p>
                <div className="my-5 rounded-xl border-2 border-dashed border-k-ink/40 bg-white/60 px-4 py-3 text-center">
                  <p className="text-sm font-black text-k-ink">
                    Sans abonnement ? <span className="whitespace-nowrap">Pass Compétition — 49 €</span>
                  </p>
                  <p className="mt-1 text-xs font-bold text-k-body">
                    Paiement unique · toute la compétition (Euro, Coupe du
                    monde, CAN…) jusqu&apos;à une semaine après la finale.
                  </p>
                </div>
                <ul className="flex flex-col gap-2.5 text-[15px] font-extrabold">
                  {PRONO_OFFER_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <KCheck />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="k-border k-btn mt-6 block rounded-full bg-k-yellow py-3.5 text-center text-[17px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-ink"
                >
                  Lancer mon championnat
                </Link>
                <p className="mt-3 text-center text-[11.5px] font-bold text-k-body">
                  Activation depuis votre espace après inscription.
                </p>
              </div>
            </Tilt3D>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className={SECTION}>
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <KEyebrow>Questions fréquentes</KEyebrow>
          <h2 className="k-halo mt-3 text-[clamp(2rem,4.5vw,3rem)]" style={DISPLAY}>
            Tout ce que vous voulez savoir.
          </h2>
        </Reveal>

        <div className="mt-11 space-y-4">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={i * 60}>
              <details
                className={`k-card group rounded-[18px] ${i % 2 ? "rotate-[0.4deg]" : "-rotate-[0.4deg]"}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[18px] px-6 py-5 text-[16px] font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-k-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span className="k-border-thin flex h-8 w-8 flex-none items-center justify-center rounded-full bg-k-yellow transition-transform duration-300 group-open:rotate-45">
                    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="px-6 pb-6 font-bold leading-relaxed text-k-body">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * CTA final + pied de page.
 *
 * Reste le point d'arrivée le PLUS FORT de la page — c'est le seul endroit où
 * une grande surface sombre est justifiée — mais elle ne barre plus l'écran :
 * dalle arrondie, encre à 82 %, le décor continue de vivre derrière.
 * Les gris du pied de page ont été éclaircis : #8d8778 tombait à 3,2:1 sur
 * l'encre translucide (et à 4,1:1 sur l'encre pleine, déjà sous le seuil).
 */
function FinalCtaFooter() {
  return (
    <div className="relative z-10 mx-auto mt-10 max-w-6xl px-4 sm:px-6">
      <div className="rounded-t-[36px] border-2 border-b-0 border-k-bg/20 bg-k-ink/82 px-5 pt-16 text-center text-k-bg backdrop-blur-xl sm:px-10 sm:pt-20">
        <Reveal className="reveal-pop relative mx-auto max-w-4xl">
          {/* Emplacement réservé au futur avatar-guide (aucun visuel) */}
          <span aria-hidden data-avatar-slot="final-cta" className="pointer-events-none absolute -top-6 left-0 h-0 w-0" />
          <h2 className="text-[clamp(2.3rem,6vw,4.4rem)] leading-[1.05]" style={DISPLAY}>
            Votre roue peut tourner dès ce soir.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[17px] font-bold text-k-bg/85">
            Créez votre compte, composez vos lots, imprimez votre affiche.
            7 jours pour l&apos;essayer avec vos vrais clients.
          </p>
          <div className="mt-7 flex justify-center">
            <Magnetic>
              <Link
                href="/signup"
                className="k-btn-light inline-block whitespace-nowrap rounded-full border-[3px] border-k-bg bg-k-yellow px-9 py-4 text-lg font-black text-k-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-k-bg"
              >
                Créer ma roue →
              </Link>
            </Magnetic>
          </div>
        </Reveal>

        <footer className="mt-14 border-t border-k-bg/25 py-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-[13.5px] font-bold text-k-bg/70 sm:flex-row">
            <span className="text-lg text-k-bg" style={DISPLAY}>
              LastChance<span className="text-k-orange">.</span>
            </span>
            <nav aria-label="Pied de page" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <a href="#fonctionnalites" className="transition-colors hover:text-k-bg">Fonctionnalités</a>
              <a href="#pronostics" className="transition-colors hover:text-k-bg">Pronostics</a>
              <a href="#tarifs" className="transition-colors hover:text-k-bg">Tarifs</a>
              <a href="#faq" className="transition-colors hover:text-k-bg">FAQ</a>
              <Link href="/login" className="transition-colors hover:text-k-bg">Connexion</Link>
              <Link href="/signup" className="transition-colors hover:text-k-bg">Essai gratuit</Link>
            </nav>
            <span>© {new Date().getFullYear()} — Jamais de gain contre un avis.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-transparent text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <ScrollPanoramaBackground />

      <SkipLink />

      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        <Hero />
        <Marquee />
        <WheelDemo />
        <Steps />
        <Features />
        <Pronostics />
        <MerchantSpace />
        <Pricing />
        <Faq />
        <FinalCtaFooter />
      </main>
    </div>
  );
}
