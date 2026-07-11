import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-pop hover:bg-brand-500 focus-visible:outline-brand-600",
  secondary:
    "border border-line bg-surface-raised text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:outline-brand-600",
  ghost: "text-ink-soft hover:text-ink focus-visible:outline-brand-600",
};

const SIZES: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Bouton-lien : tout CTA du site mène quelque part (page interne ou
 * application). `external` ouvre l'app dans le même onglet — le
 * visiteur part s'inscrire, c'est le but.
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  external = false,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);
  if (external) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
