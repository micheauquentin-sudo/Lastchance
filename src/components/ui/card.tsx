import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/* Carte « Kermesse simple » : blanc, bordure encre 2px, petite ombre
   dure décalée — pas d'inclinaison dans le panel. */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-k-ink bg-white p-6 shadow-[4px_4px_0_rgba(33,29,22,0.9)]",
        className,
      )}
      {...props}
    />
  );
}
