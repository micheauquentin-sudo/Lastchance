"use client";

import Link from "next/link";
import { HeroSection } from "@/components/ui/hero-section";
import { FeaturesSection } from "@/components/ui/features-section";
import { CTASection } from "@/components/ui/cta-section";
import { FlowArrow } from "@/components/ui/flow-arrow";
import { HeroWheel } from "@/components/ui/hero-wheel";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

// Feature icons (simple SVG inline)
const icons = {
  qr: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  ),
  wheel: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  lock: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  ),
  rocket: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  chart: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  smile: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col bg-background-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border-light bg-background-primary/80 blur-background">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2">
            <span className="text-2xl font-bold text-text-primary transition-colors group-hover:text-primary-base">
              Lastchance
              <span className="text-primary-base">.</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium text-text-secondary hover:text-primary-base px-4 py-2 transition-colors"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-white bg-primary-base px-5 py-2.5 rounded-lg hover:bg-primary-hover transition-all active:scale-95"
            >
              Essai gratuit
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <HeroSection
        badgeText="Gamification pour commerces"
        headline="Une roue de la fortune, des clients qui reviennent."
        subheadline="Vos clients scannent un QR code, tournent la roue et gagnent des récompenses que vous configurez. Simple, conforme RGPD, prêt en 10 minutes."
        cta1Text="Créer ma roue"
        cta1Href="/signup"
        cta2Text="Voir la démo"
        cta2Href="#features"
        visual={<HeroWheel />}
      />

      {/* Flow Arrow Guide */}
      <FlowArrow appearAfter={200} />

      {/* Features Section */}
      <FeaturesSection
        title="Pourquoi les commerçants adorent Lastchance"
        description="Une solution tout-en-un conçue pour fidéliser vos clients sans complexité."
        features={[
          {
            icon: icons.qr,
            title: "QR Code instantané",
            description:
              "Générez votre QR code en quelques clics. Imprimez-le, placez-le en caisse.",
            badge: "Rapide",
          },
          {
            icon: icons.wheel,
            title: "Roue personnalisée",
            description:
              "Configurez vos récompenses : réductions, cadeaux, points fidélité.",
            badge: "Flexible",
          },
          {
            icon: icons.lock,
            title: "Conforme RGPD",
            description:
              "Données sécurisées, consentement explicite, aucun tracking caché.",
            badge: "Sécurisé",
          },
          {
            icon: icons.chart,
            title: "Tableaux de bord",
            description:
              "Suivez vos campagnes en temps réel : participants, taux de conversion, ROI.",
            badge: "Analytics",
          },
          {
            icon: icons.rocket,
            title: "Prêt en 10 minutes",
            description:
              "Configuration simple, pas de code requis. Lancez votre première roue aujourd'hui.",
            badge: "Facile",
          },
          {
            icon: icons.smile,
            title: "Support premium",
            description:
              "Notre équipe française vous accompagne à chaque étape de votre projet.",
            badge: "Support",
          },
        ]}
        columns={3}
      />

      {/* Stats Section */}
      <section className="py-20 px-6 bg-white">
        <ScrollReveal>
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { number: "10 min", label: "pour lancer votre première roue" },
                { number: "0 €", label: "pour commencer, sans carte bancaire" },
                { number: "100 %", label: "conforme RGPD, données en Europe" },
              ].map((stat, i) => (
                <ScrollReveal key={i} delay={i * 150}>
                  <div className="text-center py-8">
                    <div className="text-5xl font-bold text-primary-base mb-2">
                      {stat.number}
                    </div>
                    <p className="text-lg text-text-secondary">{stat.label}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* CTA Final Section */}
      <CTASection
        headline="Prêt à booster vos ventes ?"
        description="Rejoignez des milliers de commerçants qui fidélisent leurs clients avec Lastchance. Aucune carte de crédit requise."
        primaryCTA={{
          text: "Commencer gratuitement",
          href: "/signup",
        }}
        secondaryCTA={{
          text: "Planifier une démo",
          href: "#contact",
        }}
        background="gradient"
      />

      {/* Footer */}
      <footer className="border-t border-border-light py-8 px-6 bg-white text-center text-sm text-text-secondary">
        <div className="mx-auto max-w-6xl space-y-4">
          <p>
            © {new Date().getFullYear()} Lastchance — Gamification pour
            commerces
          </p>
          <p className="text-xs">
            Les gains ne sont jamais conditionnés à un avis en ligne.
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Link href="/legal" className="hover:text-primary-base">
              Mentions légales
            </Link>
            <Link href="/privacy" className="hover:text-primary-base">
              Confidentialité
            </Link>
            <Link href="/contact" className="hover:text-primary-base">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
