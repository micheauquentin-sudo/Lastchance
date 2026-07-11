import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm shadow-orange-500/25 hover:-translate-y-px hover:shadow-md hover:shadow-orange-500/30 active:translate-y-0 disabled:from-orange-300 disabled:to-pink-300 disabled:shadow-none disabled:translate-y-0",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-orange-50 hover:border-orange-200 disabled:text-zinc-400",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
  ghost: "text-zinc-600 hover:bg-orange-50 hover:text-zinc-900 disabled:text-zinc-300",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
