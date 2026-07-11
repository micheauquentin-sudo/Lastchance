import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { HOW_IT_WORKS } from "@/content/features";

export function HowItWorks() {
  return (
    <Section
      id="fonctionnement"
      eyebrow="Fonctionnement"
      title="Trois gestes, zéro friction"
      subtitle="Le parcours complet de vos clients — de la table à votre tableau de bord."
    >
      <ol className="grid gap-5 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title}>
            <Card className="h-full">
              <div className="mb-4 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-xl"
                >
                  {step.icon}
                </span>
                <span className="text-sm font-bold text-brand-600">
                  Étape {i + 1}
                </span>
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {step.description}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}
