import { ScrollReveal } from "./scroll-reveal";

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  avatar?: string; // Placeholder for future avatar integration
  rating?: number; // 1-5 stars
}

interface TestimonialsSectionProps {
  title: string;
  description?: string;
  testimonials: Testimonial[];
  layout?: "row" | "grid";
}

/**
 * Testimonials section with premium styling.
 * Builds trust and social proof through real customer voices.
 * Avatar placeholders for future guide integration.
 */
export function TestimonialsSection({
  title,
  description,
  testimonials,
  layout = "grid",
}: TestimonialsSectionProps) {
  return (
    <section className="py-32 px-6 bg-white">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              {title}
            </h2>
            {description && (
              <p className="text-lg text-text-secondary">{description}</p>
            )}
          </div>
        </ScrollReveal>

        {/* Testimonials */}
        <div
          className={`grid gap-8 ${
            layout === "grid"
              ? "sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1"
          }`}
        >
          {testimonials.map((testimonial, index) => (
            <ScrollReveal key={index} delay={index * 100}>
              <div className="group card-hover p-6 rounded-lg bg-background-secondary border border-border-light h-full flex flex-col">
                {/* Stars */}
                {testimonial.rating && (
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={i < testimonial.rating! ? "text-primary-base" : "text-border-light"}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                )}

                {/* Quote */}
                <p className="text-base text-text-primary leading-relaxed mb-6 flex-1">
                  «&nbsp;{testimonial.quote}&nbsp;»
                </p>

                {/* Author */}
                <div className="flex items-center gap-4 pt-4 border-t border-border-light">
                  {/* Avatar Placeholder */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-base to-secondary-base flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {testimonial.author.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <p className="font-semibold text-text-primary text-sm">
                      {testimonial.author}
                    </p>
                    <p className="text-xs text-text-secondary">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
