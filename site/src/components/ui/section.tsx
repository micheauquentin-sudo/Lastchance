import { cn } from "@/lib/utils";
import { Container } from "./container";

/**
 * Section de page : respiration verticale homogène + en-tête optionnel
 * (surtitre, titre, sous-titre). Toutes les sections du site passent
 * par ici — la cohérence du rythme vertical est garantie par design.
 */
export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  className,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("section-pad", className)}>
      <Container>
        {(eyebrow || title || subtitle) && (
          <header className="mx-auto mb-14 max-w-2xl text-center">
            {eyebrow && (
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-600">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-4 text-lg text-ink-soft text-pretty">{subtitle}</p>
            )}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}
