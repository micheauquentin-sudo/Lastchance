import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("font-bold tracking-tight text-ink", className)}
      aria-label="LastChance — accueil"
    >
      Lastchance<span className="text-brand-600">.</span>
    </Link>
  );
}
