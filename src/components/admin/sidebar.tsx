"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/admin/rbac";

type IconKey =
  | "grid"
  | "store"
  | "life"
  | "card"
  | "chart"
  | "scroll"
  | "pulse"
  | "gear";

const NAV: {
  href: string;
  label: string;
  perm: Permission;
  exact?: boolean;
  icon: IconKey;
}[] = [
  { href: "/admin", label: "Dashboard", perm: "dashboard.view", exact: true, icon: "grid" },
  { href: "/admin/merchants", label: "Commerçants", perm: "merchants.view", icon: "store" },
  { href: "/admin/support", label: "Support", perm: "support.view", icon: "life" },
  { href: "/admin/stripe", label: "Stripe", perm: "stripe.view", icon: "card" },
  { href: "/admin/analytics", label: "Analytics", perm: "analytics.view", icon: "chart" },
  { href: "/admin/audit", label: "Audit Logs", perm: "audit.view", icon: "scroll" },
  { href: "/admin/monitoring", label: "Monitoring", perm: "monitoring.view", icon: "pulse" },
  { href: "/admin/settings", label: "Paramètres", perm: "settings.view", icon: "gear" },
];

const ICONS: Record<IconKey, React.ReactNode> = {
  grid: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />,
  store: <path d="M4 9V6l2-2h12l2 2v3M4 9l1 11h14l1-11M4 9h16M10 20v-6h4v6" />,
  life: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M9.5 9.5 6.5 6.5M14.5 9.5l3-3M9.5 14.5l-3 3M14.5 14.5l3 3" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  chart: <path d="M4 20V10m5.5 10V4m5.5 16v-8m5 8V7" />,
  scroll: <path d="M8 6h9M8 12h9M8 18h5M4 6h.01M4 12h.01M4 18h.01" />,
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
};

export function Sidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => permissions.includes(n.perm));

  const list = (
    <ul className="flex flex-col gap-0.5">
      {items.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn("shrink-0", active ? "text-violet-400" : "text-zinc-500 group-hover:text-zinc-300")}
              >
                {ICONS[n.icon]}
              </svg>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Barre mobile */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-semibold text-white">
          <Logo />
          <span>LastChance</span>
          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            Admin
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/5"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {open && <nav className="border-b border-white/10 p-3 lg:hidden">{list}</nav>}

      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-white/10 lg:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Link href="/admin" className="mb-6 flex items-center gap-2 px-1 font-semibold text-white">
            <Logo />
            <span>LastChance</span>
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              Admin
            </span>
          </Link>
          <nav aria-label="Navigation back-office">{list}</nav>
        </div>
      </aside>
    </>
  );
}

function Logo() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[13px] font-bold text-white">
      L
    </span>
  );
}
