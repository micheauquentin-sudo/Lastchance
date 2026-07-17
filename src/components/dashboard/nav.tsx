"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types/database";

type IconKey =
  | "home"
  | "cash"
  | "campaign"
  | "list"
  | "qr"
  | "settings"
  | "users"
  | "mail"
  | "team";

interface DashboardLink {
  href: string;
  label: string;
  exact?: boolean;
  icon: IconKey;
}

const STAFF_LINKS: DashboardLink[] = [
  { href: "/dashboard", label: "Vue d'ensemble", exact: true, icon: "home" },
  { href: "/dashboard/redeem", label: "Caisse", icon: "cash" },
  { href: "/dashboard/campaigns", label: "Campagnes", icon: "campaign" },
  { href: "/dashboard/qr-codes", label: "QR codes", icon: "qr" },
];

const OWNER_LINKS: DashboardLink[] = [
  ...STAFF_LINKS,
  { href: "/dashboard/participations", label: "Participations", icon: "list" },
  { href: "/dashboard/customers", label: "Clients", icon: "users" },
  { href: "/dashboard/newsletter", label: "Newsletter", icon: "mail" },
  { href: "/dashboard/settings", label: "Réglages", icon: "settings" },
  { href: "/dashboard/team", label: "Équipe", icon: "team" },
];

const ICONS: Record<IconKey, React.ReactNode> = {
  home: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />,
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  campaign: <path d="M4 5a9 9 0 1 0 9 9M12 5v7l5-3" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  qr: <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h3v3h-3v-3Zm3 3h3v3h-3v-3Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 1 1 0 6M17.5 14c2.5.4 4.5 2.6 4.5 6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.5 20c0-3 2.5-5.5 5.5-5.5S13.5 17 13.5 20M14.5 15.3c2.4.3 4.5 2.2 4.5 4.7" />
    </>
  ),
};

export function DashboardNav({ role = null }: { role?: MemberRole | null }) {
  const pathname = usePathname();
  const links = role === "owner" ? OWNER_LINKS : STAFF_LINKS;

  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto">
      {links.map(({ href, label, exact, icon }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200",
              active
                ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm shadow-orange-500/25"
                : "text-zinc-600 hover:bg-orange-50 hover:text-zinc-900",
            )}
          >
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "shrink-0 transition-colors",
                active ? "text-white" : "text-zinc-400 group-hover:text-orange-500",
              )}
            >
              {ICONS[icon]}
            </svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
