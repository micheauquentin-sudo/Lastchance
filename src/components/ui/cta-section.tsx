import Link from "next/link";
import { ReactNode } from "react";
import { ScrollReveal } from "./scroll-reveal";

interface CTASectionProps {
  headline: string;
  description: string;
  primaryCTA: {
    text: string;
    href: string;
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
  visual?: ReactNode;
  background?: "gradient" | "solid";
}

/**
 * Call-to-action section with strong visual hierarchy.
 * Designed to convert without being pushy.
 */
export function CTASection({
  headline,
  description,
  primaryCTA,
  secondaryCTA,
  visual,
  background = "gradient",
}: CTASectionProps) {
  const bgClass =
    background === "gradient"
      ? "bg-gradient-to-br from-primary-base via-primary-light to-secondary-light"
      : "bg-primary-base";

  return (
    <section className={`relative py-24 px-6 overflow-hidden ${bgClass}`}>
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <ScrollReveal>
        <div className="relative mx-auto max-w-4xl">
          <div className="text-center space-y-8">
            {/* Headline */}
            <h2 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
              {headline}
            </h2>

            {/* Description */}
            <p className="text-lg text-white/90 leading-relaxed max-w-2xl mx-auto">
              {description}
            </p>

            {/* Visual (optional) */}
            {visual && (
              <div className="py-8 flex justify-center opacity-90">
                {visual}
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href={primaryCTA.href}
                className={`
                  group inline-flex items-center justify-center px-8 py-4
                  bg-white text-primary-base font-semibold rounded-lg
                  transition-all duration-200 hover:shadow-xl
                  hover:scale-105 active:scale-95
                `}
              >
                {primaryCTA.text}
                <span className="ml-2 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>

              {secondaryCTA && (
                <Link
                  href={secondaryCTA.href}
                  className={`
                    group inline-flex items-center justify-center px-8 py-4
                    border-2 border-white text-white font-semibold rounded-lg
                    transition-all duration-200 hover:bg-white/10
                    active:scale-95
                  `}
                >
                  {secondaryCTA.text}
                </Link>
              )}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
