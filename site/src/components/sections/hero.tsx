import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { SIGNUP_URL } from "@/content/site";

/**
 * Hero : promesse en une phrase, double CTA, roue stylisée en CSS pur
 * (aucune image à charger — LCP = le titre).
 * La démonstration interactive viendra remplacer la roue statique
 * (voir components/demo/).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Halo de fond très léger, purement décoratif */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-130 w-full max-w-4xl rounded-full bg-gradient-to-b from-brand-100 via-accent-400/10 to-transparent blur-3xl"
      />

      <Container className="relative grid items-center gap-14 pt-20 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pt-28 lg:pb-32">
        <div className="rise-in text-center lg:text-left">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3.5 py-1.5 text-xs font-semibold text-ink-soft">
            <span aria-hidden>🎡</span> Gamification pour commerces — prêt en 10
            minutes
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Une roue de la fortune,
            <br />
            des clients qui{" "}
            <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
              reviennent
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft text-pretty lg:mx-0">
            Vos clients scannent un QR code, tournent la roue et gagnent des
            récompenses que vous configurez. Vous récupérez des visites, des
            emails qualifiés et des statistiques en temps réel.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
            <ButtonLink href={SIGNUP_URL} external size="lg">
              Essayer gratuitement
            </ButtonLink>
            <ButtonLink href="/tarifs" variant="secondary" size="lg">
              Voir les tarifs
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-ink-faint">
            7 jours d&apos;essai · sans carte bancaire · sans engagement
          </p>
        </div>

        <div className="rise-in-late mx-auto w-full max-w-sm" aria-hidden>
          <HeroWheel />
        </div>
      </Container>
    </section>
  );
}

/** Roue décorative en CSS (conic-gradient) — remplacée à terme par la démo jouable. */
function HeroWheel() {
  return (
    <div className="relative mx-auto aspect-square w-72 sm:w-80">
      <div className="absolute inset-0 rounded-full shadow-pop" />
      <div
        className="absolute inset-0 rounded-full border-8 border-surface-raised"
        style={{
          background:
            "conic-gradient(#7c3aed 0 45deg, #d946ef 45deg 90deg, #3f3f46 90deg 135deg, #f59e0b 135deg 180deg, #7c3aed 180deg 225deg, #d946ef 225deg 270deg, #3f3f46 270deg 315deg, #f59e0b 315deg 360deg)",
        }}
      />
      {/* Moyeu */}
      <div className="absolute inset-0 m-auto h-14 w-14 rounded-full border-4 border-surface-raised bg-ink" />
      {/* Pointeur */}
      <div
        className="absolute left-1/2 -top-2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: "24px solid #18181b",
        }}
      />
      {/* Étiquette gain */}
      <div className="absolute -right-4 -bottom-3 rounded-2xl border border-line bg-surface-raised px-4 py-3 shadow-card">
        <p className="text-xs text-ink-faint">Votre client vient de gagner</p>
        <p className="text-sm font-bold">🎁 Café offert</p>
      </div>
    </div>
  );
}
