"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Vue d'ensemble", exact: true },
  { href: "/dashboard/campaigns", label: "Campagnes" },
  { href: "/dashboard/participations", label: "Participations" },
  { href: "/dashboard/qr-codes", label: "QR codes" },
  { href: "/dashboard/settings", label: "Réglages" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto">
      {links.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-violet-50 text-violet-700"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
