import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { SIGNUP_URL } from "@/content/site";

/** CTA final : dernier écran avant le footer, contraste maximal. */
export function FinalCta() {
  return (
    <section className="section-pad">
      <Container>
        <div className="relative overflow-hidden rounded-card bg-ink px-8 py-16 text-center text-white sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-130 -translate-x-1/2 rounded-full bg-brand-600/40 blur-3xl"
          />
          <h2 className="relative text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Votre première roue tourne dans 10 minutes.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-zinc-300 text-pretty">
            Créez votre campagne, imprimez votre affiche, et regardez vos
            clients revenir. Essai gratuit de 7 jours, sans carte bancaire.
          </p>
          <div className="relative mt-8">
            <ButtonLink href={SIGNUP_URL} external size="lg">
              Créer mon compte gratuitement
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
