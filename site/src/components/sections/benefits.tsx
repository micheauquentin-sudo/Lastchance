import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { BENEFITS } from "@/content/features";

export function Benefits() {
  return (
    <Section
      id="pourquoi"
      eyebrow="Pourquoi LastChance"
      title="Plus qu'un jeu : un moteur de fidélisation"
      subtitle="Chaque partie jouée travaille pour votre commerce."
      className="bg-surface-raised"
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <Card key={benefit.title} className="h-full">
            <h3 className="font-semibold">{benefit.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {benefit.description}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
