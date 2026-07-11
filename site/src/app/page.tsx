import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Benefits } from "@/components/sections/benefits";
import { UseCases } from "@/components/sections/use-cases";
import { FaqTeaser } from "@/components/sections/faq-teaser";
import { FinalCta } from "@/components/sections/final-cta";

/**
 * Accueil — la page se lit comme le parcours du visiteur :
 * promesse → comment ça marche → pourquoi → pour qui → objections → CTA.
 *
 * Emplacements réservés (voir site/README.md) :
 * - démonstration interactive : après <Hero /> (components/demo/)
 * - simulateur ROI : après <Benefits /> (components/roi/ + lib/roi.ts)
 * - dashboard démo : après le simulateur (components/dashboard/)
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Benefits />
      <UseCases />
      <FaqTeaser />
      <FinalCta />
    </>
  );
}
