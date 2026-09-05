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
  titleAs = "h2",
  subtitle,
  className,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  /**
   * Niveau du titre de section. `h2` par défaut (une page a en général déjà
   * son `h1` ailleurs — le Hero de l'accueil, par exemple). Les pages sans
   * autre titre (tarifs, FAQ, contact) passent `h1` à leur première Section
   * pour que la page porte un titre de plus haut niveau, comme l'accueil.
   */
  titleAs?: "h1" | "h2";
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const TitleTag = titleAs;
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
              <TitleTag className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
                {title}
              </TitleTag>
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
