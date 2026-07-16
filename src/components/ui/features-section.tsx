import { ReactNode } from "react";
import { FeatureCard } from "./feature-card";
import { ScrollReveal } from "./scroll-reveal";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}

interface FeaturesSectionProps {
  title: string;
  description?: string;
  features: Feature[];
  layout?: "grid" | "carousel";
  columns?: 2 | 3 | 4;
}

/**
 * Features section with smooth scroll reveal and elegant layout.
 * Tells the story of why LastChance is different.
 */
export function FeaturesSection({
  title,
  description,
  features,
  layout = "grid",
  columns = 3,
}: FeaturesSectionProps) {
  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <section className="relative py-32 px-6 bg-gradient-to-b from-white to-background-secondary">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <ScrollReveal>
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              {title}
            </h2>
            {description && (
              <p className="text-lg text-text-secondary leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </ScrollReveal>

        {/* Features Grid */}
        {layout === "grid" && (
          <div className={`grid grid-cols-1 ${gridCols[columns]} gap-6`}>
            {features.map((feature, index) => (
              <ScrollReveal key={index} delay={index * 100}>
                <FeatureCard
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  badge={feature.badge}
                  accent={index % 2 === 0 ? "primary" : "secondary"}
                />
              </ScrollReveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
