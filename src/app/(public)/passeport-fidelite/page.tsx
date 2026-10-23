import type { Metadata } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { CheckerboardSeparator } from "@/components/marketing/checkerboard-separator";
import { KermessePatternSection } from "@/components/marketing/kermesse-pattern-background";
import { Magnetic } from "@/components/marketing/magnetic";
import { HeroCloudBackdrop } from "@/components/marketing/hero-cloud-backdrop";
import { HeroStickers } from "@/components/marketing/hero-stickers";
import { SiteHeader } from "@/components/marketing/site-header";
import { SkipLink } from "@/components/ui/skip-link";
import { StraightRibbonTicker } from "@/components/marketing/straight-ribbon-ticker";
import { SimulatorLoyalty } from "@/components/marketing/simulator-loyalty";
import { TradeRoiSimulator } from "@/components/marketing/trade-roi-simulator";

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
  title: "Passeport Fidélité Apple & Google Wallet · Récompenses Gamifiées · Lastchance",
  description:
    "Fini les cartes tampons oubliées dans les poches. Offrez un passeport de fidélité digital intégré à Apple Wallet et Google Wallet avec jackpots et tickets d'or.",
};

const STEPS = [
  {
    n: 1,
    title: "Enregistrez le passeport dans Apple ou Google Wallet",
    description: "Un seul scan suffit. Le client ajoute son passeport fidélité dans son smartphone en 5 secondes, sans installer d'application dédiée.",
    icon: "📲",
    accent: "bg-[#FF5C93] text-white",
  },
  {
    n: 2,
    title: "Tamponnez chaque passage en 1 seconde en caisse",
    description: "Votre équipe scanne le passeport avec le lecteur caisse universel. Le tampon s'anime immédiatement sur l'écran du client avec confettis.",
    icon: "🎟️",
    accent: "bg-[#FFE600] text-[#181512]",
  },
  {
    n: 3,
    title: "Débloquez paliers, jackpots et revisites (+40%)",
    description: "À chaque palier complété, la roue des paliers se déclenche ou un Ticket d'Or tombe. Vos habitués reviennent 40% plus fréquemment.",
    icon: "💰",
    accent: "bg-[#10B981] text-white",
  },
];

const MERCHANT_POINTS = [
  "Installation dans Apple Wallet et Google Wallet sans friction",
  "Tamponnage caisse instantané via QR code en moins d'une seconde",
  "Statistiques de rétention : fréquence de revisite, panier moyen",
  "Notifications push automatiques de relance géolocalisée (selon OS)",
];

const LOYALTY_EXPERIENCES = [
  {
    emoji: "💳",
    badge: "Zéro Papier",
    title: "Passeport 10 Tampons Digital",
    desc: "Ne perdez plus vos clients avec des cartes en carton oubliées. La jauge progresse à chaque passage et s'affiche fièrement sur le mobile.",
  },
  {
    emoji: "🎡",
    badge: "Gamification",
    title: "Roue des Paliers Surprises",
    desc: "Au lieu d'un simple café au 10ème tampon, offrez une surprise à chaque palier intermédiaire (au 3ème, 6ème et 9ème tampon) pour maintenir l'engagement.",
  },
  {
    emoji: "🎫",
    badge: "Magie en Caisse",
    title: "Émission de Tickets d'Or",
    desc: "Surprenez vos meilleurs clients au moment de payer en leur remettant un Ticket d'Or digital à gratter pour remporter une expérience exclusive.",
  },
  {
    emoji: "💎",
    badge: "Effet Communauté",
    title: "Cagnotte & Jackpot Collectif",
    desc: "Chaque passage alimente une cagnotte globale de votre établissement. Dès qu'elle explose, tous les membres actifs reçoivent un cadeau surprise !",
  },
];

const LOYALTY_FAQ = [
  {
    question: "Comment le passeport s'installe-t-il dans Apple Wallet et Google Wallet ?",
    answer:
      "Le client scanne votre QR code comptoir avec son appareil photo. Une page sécurisée s'ouvre et lui propose le bouton officiel 'Ajouter à Apple Wallet' ou 'Enregistrer dans Google Wallet'. En un geste, sa carte est sauvegardée à côté de ses cartes bancaires.",
  },
  {
    question: "Dois-je acheter un terminal ou lecteur de cartes supplémentaire ?",
    answer:
      "Non, aucun équipement coûteux ! N'importe quel smartphone ou tablette de votre équipe sert de lecteur grâce au scanner caisse universel LastChance intégré dans votre espace commerçant.",
  },
  {
    question: "Puis-je personnaliser le nombre de tampons et les cadeaux ?",
    answer:
      "Totalement. Vous choisissez le nombre de tampons requis (6, 8, 10, 12...), les récompenses aux paliers intermédiaires et le cadeau final offert par votre maison.",
  },
  {
    question: "Que se passe-t-il si un client change de téléphone ?",
    answer:
      "Le passeport est lié à son compte Apple ou Google (iCloud / Google Cloud). Il retrouve son solde de tampons automatiquement sur son nouvel appareil.",
  },
];

export default function PasseportFidelitePage() {
  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 overflow-x-clip bg-[#FFFDF9] text-[#181512]`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <SkipLink />
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="relative z-10 outline-none">
        {/* ═══════════════════════════════════════════════════════════════
           BLOC 1 — HERO DANS LES NUAGES (ÉPURÉ AVEC VIGNETTES FLOTTANTES)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative z-10 flex h-screen min-h-[100dvh] flex-col justify-between overflow-hidden px-4 pt-20 text-center sm:px-6 sm:pt-24">
          {/* Décor nuages 4K exclusif */}
          <HeroCloudBackdrop />
          {/* Vignettes kermesse flottantes */}
          <HeroStickers />

          <div className="relative z-10 mx-auto max-w-4xl flex-1 flex flex-col justify-center items-center py-6 sm:py-10">
            <div className="inline-flex items-center gap-2 self-center rounded-full border-[2.5px] border-[#181512] bg-[#FF5C93] px-4 py-1.5 text-xs font-black text-white shadow-[0_3px_0_#181512]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#FFE600] animate-pulse" />
              Module Pilier #3 · Passeport Fidélité Apple &amp; Google Wallet
            </div>

            <h1
              className="relative z-[2] mx-auto mt-4 max-w-4xl text-[clamp(2.3rem,5.5vw,4.2rem)] font-black leading-[1.08] text-[#181512]"
              style={DISPLAY}
            >
              Le passeport de fidélité dans le mobile qui fait{" "}
              <span className="inline-block -rotate-[1.5deg] rounded-[18px] border-[3px] border-[#181512] bg-[#FFE600] px-4 pb-1 text-[#181512] shadow-[0_5px_0_#181512]">
                revenir +40%
              </span>{" "}
              plus souvent.
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg font-bold leading-relaxed text-[#181512]/80">
              Directement dans Apple Wallet &amp; Google Wallet avec paliers ludiques, jackpots et surprises en caisse.
            </p>

            <div className="mt-8 flex justify-center">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2.5 rounded-full border-[3px] border-[#181512] bg-[#FF6B35] px-9 py-4 text-base sm:text-lg font-black text-white shadow-[0_6px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_8px_0_#181512] active:translate-y-0.5"
                >
                  <span>Essayer gratuitement 7 jours</span>
                  <span className="text-xl">→</span>
                </Link>
              </Magnetic>
            </div>
          </div>

          {/* Bandeau qui défile tout en bas du Hero */}
          <div className="relative z-20 w-full mt-auto">
            <StraightRibbonTicker />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 2 — COMMENT ÇA MARCHE (FOND MOTIF KERMESSE : VICHY LILAS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="gingham-purple" className="py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Comment ça marche
              </div>
              <h2
                className="mt-3 text-[clamp(1.6rem,3.2vw,2.5rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                3 étapes pour créer une communauté d&apos;habitués
              </h2>
              <p className="mx-auto mt-1.5 max-w-lg text-sm sm:text-base font-bold text-[#181512]/70">
                De l&apos;ajout dans le Wallet jusqu&apos;à l&apos;explosion du jackpot de fidélité.
              </p>
            </div>

            <div className="mt-8 sm:mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step) => (
                <div
                  key={step.n}
                  className="group relative flex flex-col items-center rounded-2xl border-[3px] border-[#181512] bg-white p-5 sm:p-6 text-center shadow-[0_5px_0_#181512] transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_0_#181512]"
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#181512] text-2xl shadow-[0_3px_0_#181512] ${step.accent}`}
                  >
                    {step.icon}
                  </div>

                  <div
                    className="mt-2 text-4xl font-black text-[#181512]/15 transition-colors group-hover:text-[#A855F7]/30"
                    style={DISPLAY}
                  >
                    0{step.n}
                  </div>

                  <h3
                    className="-mt-1 text-lg font-black text-[#181512]"
                    style={DISPLAY}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[#181512]/70 font-bold">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-4 py-1.5 text-xs sm:text-sm font-black text-[#181512] shadow-[0_2.5px_0_#181512]">
                <span>🎟️</span> 100% de rétention : toujours dans le téléphone du client, jamais égaré.
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 2 : Damier Jaune Solaire */}
        <CheckerboardSeparator variant="amber" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 3 — GRAND BLOC DÉMO FIDÉLITÉ (FOND COULEUR UNIE : JAUNE VANILLE SOLAIRE)
           ═══════════════════════════════════════════════════════════════ */}
        <section id="simulateur" className="relative py-10 sm:py-14 bg-[#FFF8D6] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FF5C93] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-[0_2px_0_#181512]">
                🎟️ Simulateur Passeport Fidélité
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Testez le tamponnage digital et les paliers cadeaux
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Découvrez la vue joueur sur smartphone : tamponnez des cases, faites tourner la roue des paliers et testez le Ticket d&apos;Or.
              </p>
            </div>

            {/* Grille pleine largeur : Colonne Avantages/Comparatif + Simulateur de Fidélité */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Colonne Gauche : Comparatif & Piliers de la Fidélité */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#181512] bg-[#FFE600] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512]">
                    Fidélité garantie
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-black text-[#181512]" style={DISPLAY}>
                    En finir avec les cartes en carton oubliées.
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-bold text-[#181512]/75 leading-relaxed">
                    80% des cartes tampons papier sont perdues ou oubliées à la maison au moment de payer. Avec LastChance, le passeport vit directement dans Apple Wallet et Google Wallet.
                  </p>

                  {/* Boîte comparaison visuelle */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-2.5">
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">
                        ❌ Carte tampon papier
                      </span>
                      <div className="mt-1 text-xs font-black text-red-900">
                        80% d&apos;abandon
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-red-700/80 leading-tight">
                        Oubliée dans un jean, zéro relance possible et aucune donnée client.
                      </p>
                    </div>

                    <div className="rounded-xl border-2 border-[#10B981] bg-[#ECFDF5] p-2.5 shadow-[0_2px_0_#10B981]">
                      <span className="text-[10px] font-black text-[#065F46] uppercase tracking-wider">
                        ✅ Passeport Wallet
                      </span>
                      <div className="mt-1 text-xs font-black text-[#047857]">
                        0% d&apos;abandon
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-[#065F46]/90 leading-tight">
                        Toujours dans le smartphone, relances automatiques et boost de revisite.
                      </p>
                    </div>
                  </div>

                  {/* 4 Piliers clés */}
                  <div className="mt-4 space-y-2.5 border-t border-[#181512]/15 pt-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FF5C93] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        📲
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Apple &amp; Google Wallet natifs</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Zéro appli à installer : la carte s&apos;ajoute au Wallet du client en un seul scan de QR.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#10B981] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        🎟️
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Tamponnage caisse en 1 seconde</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Un scan rapide du passeport valide le passage et anime les confettis sur l&apos;écran du client.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#FFE600] border border-[#181512] text-xs font-black shadow-[0_1px_0_#181512]">
                        🎡
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">Paliers multi-niveaux &amp; Jackpots</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Roue des paliers, tickets d&apos;or et cagnottes collectives pour fidéliser à chaque passage.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#A855F7] border border-[#181512] text-white text-xs font-black shadow-[0_1px_0_#181512]">
                        📈
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-[#181512]">+40 % de fréquence de visite</h4>
                        <p className="text-[11px] font-bold text-[#181512]/70 leading-snug">
                          Vos clients réguliers reviennent plus souvent pour compléter leur jauge et débloquer leur lot.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Boutons d'action */}
                <div className="mt-5 space-y-2 border-t border-[#181512]/15 pt-4">
                  <Link
                    href="/signup"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FF6B35] py-2.5 text-xs font-black text-white shadow-[0_2px_0_#181512] transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-[0_4px_0_#181512]"
                  >
                    <span>Créer mon Passeport Wallet</span>
                    <span>→</span>
                  </Link>
                  <Link
                    href="/tarifs"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#181512] bg-white py-2 text-xs font-black text-[#181512] shadow-[0_2px_0_#181512] transition-all hover:bg-[#FFE600] hover:-translate-y-0.5"
                  >
                    <span>Consulter les tarifs (inclus dès la formule Le Club)</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Colonne Droite : Simulateur de Fidélité SimulatorLoyalty */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <SimulatorLoyalty />
              </div>
            </div>
          </div>
        </section>

        {/* Séparateur 3 : Damier Rose Pop */}
        <CheckerboardSeparator variant="pink" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 4 — ESPACE COMMERÇANT & ESTIMATIF CA CÔTE À CÔTE (FOND MOTIF KERMESSE : POIS ROSES)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="polka-dots-pink" className="py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                📊 Espace Commerçant &amp; Estimatif Chiffre d&apos;Affaires
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Pilotez votre fidélité &amp; estimez vos gains en direct.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Suivez les membres réguliers en temps réel depuis votre tableau de bord et simulez le chiffre d&apos;affaires additionnel généré par la hausse de fréquence.
              </p>
            </div>

            {/* Assemblage côte à côte Espace Commerçant + Estimatif Chiffre d'affaires */}
            <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 items-stretch">
              {/* Côté Gauche : Espace Commerçant & Pilotage */}
              <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 sm:p-6 shadow-[0_4px_0_#181512]">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#181512] bg-[#FFE600] px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#181512] shadow-[0_1.5px_0_#181512]">
                    Espace commerçant
                  </div>
                  <h3
                    className="mt-2.5 text-xl sm:text-2xl font-black leading-tight text-[#181512]"
                    style={DISPLAY}
                  >
                    Tout piloter depuis un seul écran.
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#181512]/75 font-bold">
                    Vous ajustez vos paliers cadeaux, activez vos notifications et visualisez le nombre de tampons délivrés chaque jour.
                  </p>

                  {/* Mockup Dashboard avec ombre franche */}
                  <div className="relative overflow-hidden rounded-xl border-2 border-[#181512] shadow-[0_3px_0_#181512] my-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/marketing/dashboard-mockup.jpg"
                      alt="Tableau de bord commerçant LastChance — analytics et retours en direct"
                      className="w-full object-cover max-h-[220px]"
                    />
                  </div>

                  {/* Checklist des fonctionnalités */}
                  <ul className="space-y-2">
                    {MERCHANT_POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-center gap-2.5 text-xs sm:text-[13px] font-black text-[#181512]"
                      >
                        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#181512] bg-[#10B981] text-white shadow-[0_1.5px_0_#181512]">
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6.2 5 8.5 9.5 3.5"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 pt-3 border-t border-[#181512]/15">
                  <Link
                    href="/signup"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-[#181512] bg-[#FF6B35] py-3 text-sm font-black text-white shadow-[0_4px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_#181512]"
                  >
                    Voir mon tableau de bord →
                  </Link>
                </div>
              </div>

              {/* Côté Droit : Estimatif Chiffre d'Affaires */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <TradeRoiSimulator />
              </div>
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 4 : Damier Menthe Émeraude */}
        <CheckerboardSeparator variant="teal" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 5 — LES 4 EXPÉRIENCES FIDÉLITÉ GAMIFIÉES (FOND COULEUR UNIE : LAGON MENTHE POP)
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative py-10 sm:py-14 bg-[#D8F8E8] text-[#181512]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-white px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_2px_0_#181512]">
                Expériences Exclusives
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                4 mécaniques de fidélisation pour créer l&apos;attachement
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm md:text-base font-bold text-[#181512]/75">
                Des formats stimulants qui donnent envie de revenir chaque semaine pour débloquer le palier suivant.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {LOYALTY_EXPERIENCES.map((feat) => (
                <div
                  key={feat.title}
                  className="flex flex-col justify-between rounded-2xl border-[2.5px] border-[#181512] bg-white p-5 shadow-[0_4px_0_#181512] transition-all hover:-translate-y-1 hover:shadow-[0_6px_0_#181512]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{feat.emoji}</span>
                      <span className="rounded-full border border-[#181512] bg-[#FDF2F8] px-2 py-0.5 text-[10px] font-black text-[#181512]">
                        {feat.badge}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-black text-[#181512]" style={DISPLAY}>
                      {feat.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#181512]/70 font-bold">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Séparateur 5 : Damier Bleu Ciel */}
        <CheckerboardSeparator variant="blue" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 6 — FAQ PASSEPORT FIDÉLITÉ (FOND MOTIF KERMESSE : NUAGES BLEUS DESSINÉS)
           ═══════════════════════════════════════════════════════════════ */}
        <KermessePatternSection variant="clouds-blue" className="py-10 sm:py-14">
          <div className="mx-auto max-w-5xl px-6 sm:px-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#181512] bg-[#FFE600] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#181512] shadow-[0_3px_0_#181512]">
                Questions Fréquentes
              </div>
              <h2
                className="mt-3 text-[clamp(1.7rem,3.2vw,2.7rem)] font-black tracking-tight text-[#181512]"
                style={DISPLAY}
              >
                Tout sur le Passeport Fidélité
              </h2>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {LOYALTY_FAQ.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border-2 border-[#181512] bg-white shadow-[0_4px_0_#181512] transition-colors open:bg-[#FFFBEB]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-black text-[#181512] [&::-webkit-details-marker]:hidden">
                    <span className="leading-snug">{item.question}</span>
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[#181512] bg-[#FFE600] text-[#181512] font-black transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-4 text-sm leading-relaxed font-bold text-[#181512]/75">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </KermessePatternSection>

        {/* Séparateur 6 : Damier Orange Pop */}
        <CheckerboardSeparator variant="orange" height={44} />

        {/* ═══════════════════════════════════════════════════════════════
           BLOC 7 — BANNIÈRE FINALE ORANGE & FOOTER NOIR
           ═══════════════════════════════════════════════════════════════ */}
        <section className="relative bg-[#FF6B35] py-16 sm:py-24 text-white border-t-[3px] border-[#181512]">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-[clamp(2rem,4vw,3rem)] font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
              style={DISPLAY}
            >
              Votre passeport fidélité dans le mobile dès ce soir.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base sm:text-lg leading-relaxed text-white/90 font-bold">
              Créez votre compte en 2 minutes, paramétrez vos récompenses et vos paliers. 7 jours d&apos;essai offerts avec vos vrais clients.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Magnetic>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-[#181512] bg-white px-9 py-4 text-base sm:text-lg font-black text-[#FF6B35] shadow-[0_6px_0_#181512] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_0_#181512] active:translate-y-1"
                >
                  Démarrer mon essai gratuit →
                </Link>
              </Magnetic>
              <Link
                href="/tarifs"
                className="inline-flex items-center justify-center gap-2 rounded-full border-[2.5px] border-[#181512] bg-[#FFE600] px-7 py-3.5 text-base font-black text-[#181512] shadow-[0_4px_0_#181512] hover:-translate-y-0.5"
              >
                Consulter les tarifs
              </Link>
            </div>
          </div>
        </section>

        {/* Footer professionnel noir */}
        <footer className="bg-[#181512] py-12 text-white/65">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row sm:px-10">
            <span className="text-2xl font-black text-white" style={DISPLAY}>
              LastChance<span className="text-[#FF6B35]">.</span>
            </span>
            <nav
              aria-label="Pied de page"
              className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold"
            >
              <Link href="/jeux-instantanes" className="transition-colors hover:text-white">
                Jeux
              </Link>
              <Link href="/vitrine-reservation" className="transition-colors hover:text-white">
                Vitrine
              </Link>
              <Link href="/passeport-fidelite" className="transition-colors hover:text-white">
                Fidélité
              </Link>
              <Link href="/championnats-evenements" className="transition-colors hover:text-white">
                Événements
              </Link>
              <Link href="/tarifs" className="transition-colors hover:text-white">
                Tarifs
              </Link>
              <Link href="/faq" className="transition-colors hover:text-white">
                FAQ
              </Link>
              <Link href="/login" className="transition-colors hover:text-white">
                Connexion
              </Link>
            </nav>
            <span className="text-xs font-semibold">© {new Date().getFullYear()} LastChance</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
