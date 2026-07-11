import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { USE_CASES } from "@/content/features";

export function UseCases() {
  return (
    <Section
      id="cas-usage"
      eyebrow="Cas d'usage"
      title="Pensé pour tous les commerces qui accueillent du public"
      subtitle="Restaurants, salons, boutiques, salles de sport : la mécanique s'adapte à votre métier."
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {USE_CASES.map((useCase) => (
          <Card key={useCase.title} className="h-full text-center">
            <div aria-hidden className="mb-3 text-3xl">
              {useCase.icon}
            </div>
            <h3 className="font-semibold">{useCase.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {useCase.example}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
