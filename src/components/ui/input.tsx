import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 transition-shadow",
        "focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1",
        "disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-bold text-k-ink", className)}
      {...props}
    />
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm font-semibold text-red-600">{message}</p>;
}
