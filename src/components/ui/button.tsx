import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

/* Boutons « Kermesse simple » : bordure encre 2px, socle dur qui
   s'écrase au clic (k-btn-sm), couleurs franches sans dégradé. */
const variants: Record<Variant, string> = {
  primary:
    "k-btn-sm border-2 border-k-ink bg-k-yellow text-k-ink disabled:pointer-events-none disabled:opacity-50",
  secondary:
    "border-2 border-k-ink bg-white text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:border-zinc-300 disabled:text-zinc-400",
  // red-600 et non red-500 : blanc sur #ef4444 donne ~3,8:1, sous le seuil
  // AA de 4,5:1 pour du texte normal. Sur #dc2626 le rapport monte à ~4,8:1.
  // Relevé par axe (7 nœuds serious) sur /dashboard/progression, première
  // page scannée à porter des boutons de suppression — le défaut existait
  // partout où cette variante est utilisée.
  danger:
    "k-btn-sm border-2 border-k-ink bg-red-600 text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50",
  ghost:
    "text-k-body hover:bg-k-yellow/40 hover:text-k-ink disabled:pointer-events-none disabled:text-zinc-300",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
