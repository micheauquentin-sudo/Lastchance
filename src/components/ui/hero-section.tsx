import Link from "next/link";
import { ReactNode } from "react";

interface HeroSectionProps {
  badgeText?: string;
  headline: string;
  subheadline: string;
  cta1Text: string;
  cta1Href: string;
  cta2Text: string;
  cta2Href: string;
  visual?: ReactNode;
  children?: ReactNode;
}

/**
 * Premium Hero Section with new artistic direction.
 * Clean, spacious, focus on product demonstration.
 */
export function HeroSection({
  badgeText,
  headline,
  subheadline,
  cta1Text,
  cta1Href,
  cta2Text,
  cta2Href,
  visual,
  children,
}: HeroSectionProps) {
  return (
    <section className="relative min-h-screen pt-20 pb-32 overflow-hidden bg-background-primary">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: '#A8E6DC' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: '#F5A98A' }} />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Content */}
          <div className="space-y-8 fade-in-up">
            {/* Badge */}
            {badgeText && (
              <div className="inline-flex">
                <span className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-base bg-primary-light rounded-full">
                  ✨ {badgeText}
                </span>
              </div>
            )}

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl font-bold leading-tight text-text-primary">
              {headline}
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-text-secondary leading-relaxed max-w-xl">
              {subheadline}
            </p>

            {/* Custom children if provided */}
            {children && <div className="space-y-4">{children}</div>}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link
                href={cta1Href}
                className={`
                  group inline-flex items-center justify-center px-6 py-3.5
                  bg-primary-base text-white font-semibold rounded-lg
                  transition-all duration-200 hover:shadow-lg
                  hover:bg-primary-hover
                  active:scale-95
                `}
              >
                {cta1Text}
                <span className="ml-2 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>

              <Link
                href={cta2Href}
                className={`
                  group inline-flex items-center justify-center px-6 py-3.5
                  border-2 border-border-medium text-text-primary font-semibold rounded-lg
                  transition-all duration-200 hover:border-primary-base hover:bg-primary-light/10
                  active:scale-95
                `}
              >
                {cta2Text}
              </Link>
            </div>
          </div>

          {/* Right: Visual/Wheel */}
          {visual && (
            <div className="relative h-full min-h-96 fade-in-down animation-delay-200">
              {visual}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
