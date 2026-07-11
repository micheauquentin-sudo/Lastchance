import type { FaqItem } from "@/content/faq";

/**
 * Accordéon FAQ en HTML natif (<details>/<summary>) : accessible,
 * indexable, zéro JavaScript. Réutilisé sur l'accueil (teaser) et /faq.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="mx-auto max-w-2xl divide-y divide-line rounded-card border border-line bg-surface-raised shadow-card">
      {items.map((item) => (
        <details key={item.question} className="group px-6 py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
            {item.question}
            <span
              aria-hidden
              className="shrink-0 text-ink-faint transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
