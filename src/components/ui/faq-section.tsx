"use client";

import { useState } from "react";
import { ScrollReveal } from "./scroll-reveal";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  title: string;
  description?: string;
  items: FAQItem[];
}

/**
 * Accordion FAQ section with smooth open/close animations.
 * Clean, accessible, conversion-focused.
 */
export function FAQSection({ title, description, items }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-32 px-6 bg-background-primary">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              {title}
            </h2>
            {description && (
              <p className="text-lg text-text-secondary">{description}</p>
            )}
          </div>
        </ScrollReveal>

        {/* FAQ Items */}
        <div className="space-y-3">
          {items.map((item, index) => (
            <ScrollReveal key={index} delay={index * 50}>
              <div
                className="border border-border-light rounded-lg overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor:
                    openIndex === index
                      ? "rgba(225, 122, 95, 0.05)"
                      : "transparent",
                }}
              >
                <button
                  onClick={() =>
                    setOpenIndex(openIndex === index ? null : index)
                  }
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-background-secondary/50 transition-colors"
                >
                  <span className="text-left font-semibold text-text-primary">
                    {item.question}
                  </span>
                  <span
                    className="text-primary-base transition-transform duration-300 flex-shrink-0"
                    style={{
                      transform:
                        openIndex === index ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ↓
                  </span>
                </button>

                {openIndex === index && (
                  <div className="px-6 py-4 border-t border-border-light bg-background-secondary/30 text-text-secondary leading-relaxed">
                    {item.answer}
                  </div>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
