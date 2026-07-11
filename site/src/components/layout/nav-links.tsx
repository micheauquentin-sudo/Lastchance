"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Liens de navigation avec état actif (client : dépend de l'URL). */
export function NavLinks({
  links,
  className,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-soft hover:bg-brand-50/60 hover:text-ink",
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
