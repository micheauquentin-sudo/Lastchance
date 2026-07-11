import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { FAQ_HOME_COUNT, FAQ_ITEMS } from "@/content/faq";
import { FaqAccordion } from "./faq-accordion";

export function FaqTeaser() {
  return (
    <Section
      id="faq"
      eyebrow="Questions fréquentes"
      title="Vos questions, nos réponses"
      className="bg-surface-raised"
    >
      <FaqAccordion items={FAQ_ITEMS.slice(0, FAQ_HOME_COUNT)} />
      <div className="mt-8 text-center">
        <ButtonLink href="/faq" variant="secondary">
          Toutes les questions
        </ButtonLink>
      </div>
    </Section>
  );
}
