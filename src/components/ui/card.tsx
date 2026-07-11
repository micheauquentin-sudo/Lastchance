import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-orange-900/[0.06] bg-white p-6 shadow-[0_10px_30px_-14px_rgba(120,40,20,0.15)]",
        className,
      )}
      {...props}
    />
  );
}
