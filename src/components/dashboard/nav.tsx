"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
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
  | "team"
  | "trophy"
  | "map"
  | "loyalty"
  | "jackpot"
  | "event"
  | "calendar"
  | "quiz"
  | "progression"
  | "discover";

interface DashboardLink {
  href: string;
  label: string;
  exact?: boolean;
  icon: IconKey;
}

const EDITOR_BASE_LINKS: DashboardLink[] = [
  { href: "/dashboard", label: "Vue d'ensemble", exact: true, icon: "home" },
  { href: "/dashboard/redeem", label: "Caisse", icon: "cash" },
];

const EXPERIENCE_ICONS: Partial<Record<ExperienceKind, IconKey>> = {
  campaign: "campaign",
  pronostics: "trophy",
  hunt: "map",
  loyalty: "loyalty",
  jackpot: "jackpot",
  event: "event",
  calendar: "calendar",
  quiz: "quiz",
};

/**
 * Outils TRANSVERSES, servis après les expériences. La méta-progression n'est
 * pas une expérience du catalogue : elle est scopée par ORGANISATION et se nourrit
 * de toutes les expériences à la fois. Aucun `addon_progression` n'existe en base,
 * elle n'est donc pas filtrée par `activeExperiences` — comme « Découvrir ».
 */
const EDITOR_TOOL_LINKS: DashboardLink[] = [
  { href: "/dashboard/progression", label: "Progression", icon: "progression" },
  { href: "/dashboard/discover", label: "Découvrir", icon: "discover" },
  { href: "/dashboard/qr-codes", label: "QR codes", icon: "qr" },
];

const OWNER_ONLY_LINKS: DashboardLink[] = [
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
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  loyalty: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="8.5" cy="12" r="2" />
      <path d="M13 10.5h5M13 13.5h5" />
    </>
  ),
  jackpot: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  event: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M3 11h18M7 7l-1.5 4M12 7l-1.5 4M17 7l-1.5 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-1 .8-1 1.4v.4" />
      <path d="M12 17h.01" />
    </>
  ),
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
  progression: (
    <>
      <path d="M15.5 5.5a3.5 3.5 0 1 0-3.3 4.6L7 15.3V18h2.7l.9-.9v-1.6h1.6l1.1-1.1a3.5 3.5 0 0 0 4.6-3.3" />
      <path d="M16.2 6.8h.01" />
    </>
  ),
  discover: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </>
  ),
};

/**
 * LES QUATRE FAMILLES DU MENU — elles existaient déjà dans le code (quatre
 * tableaux concaténés), elles n'étaient simplement jamais dites à l'écran :
 * onze à dix-huit entrées de même taille, sans titre ni séparateur. Le
 * commerçant devait lire toutes les étiquettes pour trouver « où je crée mon
 * jeu », et rien ne lui disait que la Caisse est quotidienne et les Réglages
 * exceptionnels.
 *
 * Les titres sont NON CLIQUABLES et portés par `aria-labelledby` sur la liste
 * qu'ils nomment : un lecteur d'écran annonce « Vos animations, liste de 3
 * éléments » au lieu d'une liste de dix-huit liens sans structure.
 */
interface NavGroup {
  /** Titre de section, affiché en petites capitales. */
  titre: string;
  /** Fragment d'`id` : les deux rendus (mobile, desktop) doivent différer. */
  cle: string;
  links: DashboardLink[];
}

/** Repli du `<summary>` mobile quand la route n'est nulle part au menu. */
const REPLI_MOBILE = "Tableau de bord";

/**
 * L'entrée de menu qui décrit le mieux la route courante.
 *
 * PLUS LONG PRÉFIXE, et non « la première qui matche » : le menu ne contient
 * que treize des trente-trois routes du tableau de bord, et sur toutes les
 * autres — pages de détail, écrans comptoir, sous-réglages — le `<summary>`
 * mobile retombait sur « Navigation ». Le commerçant ne savait alors plus du
 * tout où il était, sur l'appareil même du comptoir.
 *
 * La limite de préfixe est le `/` : `/dashboard/campaigns` ne doit pas
 * s'allumer sur une hypothétique `/dashboard/campaigns-archive`.
 */
function lienCourant(
  links: DashboardLink[],
  pathname: string,
): DashboardLink | undefined {
  let meilleur: DashboardLink | undefined;
  for (const lien of links) {
    const correspond = lien.exact
      ? pathname === lien.href
      : pathname === lien.href || pathname.startsWith(`${lien.href}/`);
    if (!correspond) continue;
    if (!meilleur || lien.href.length > meilleur.href.length) meilleur = lien;
  }
  return meilleur;
}

export function DashboardNav({
  role = null,
  activeExperiences = ["campaign"],
}: {
  role?: MemberRole | null;
  activeExperiences?: ExperienceKind[];
}) {
  const pathname = usePathname();
  const experienceLinks: DashboardLink[] = EXPERIENCE_CATALOG.flatMap((entry) => {
    const icon = EXPERIENCE_ICONS[entry.kind];
    if (
      !icon ||
      !activeExperiences.includes(entry.kind) ||
      entry.kind === "referral"
    ) {
      return [];
    }
    return [{
      href: entry.dashboardHref,
      label: entry.label,
      icon,
    }];
  });

  const groups: NavGroup[] =
    role === "owner" || role === "editor"
      ? [
          { titre: "Au quotidien", cle: "quotidien", links: EDITOR_BASE_LINKS },
          { titre: "Vos animations", cle: "animations", links: experienceLinks },
          { titre: "Outils", cle: "outils", links: EDITOR_TOOL_LINKS },
          ...(role === "owner"
            ? [{ titre: "Gestion", cle: "gestion", links: OWNER_ONLY_LINKS }]
            : []),
        ]
      : [
          {
            titre: "Au quotidien",
            cle: "quotidien",
            links: [
              { href: "/dashboard/redeem", label: "Caisse", icon: "cash" },
            ],
          },
        ];

  const visibles = groups.filter((groupe) => groupe.links.length > 0);
  const current = lienCourant(
    visibles.flatMap((groupe) => groupe.links),
    pathname,
  );

  const rendreGroupes = (surface: "mobile" | "desktop") =>
    visibles.map((groupe) => {
      const titreId = `nav-${surface}-${groupe.cle}`;
      return (
        <div key={groupe.cle}>
          <p
            id={titreId}
            className="px-3 pb-1 pt-2 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-k-orange-text"
          >
            {groupe.titre}
          </p>
          <ul aria-labelledby={titreId} className="grid gap-1">
            {groupe.links.map(({ href, label, icon }) => {
              const active = current?.href === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-all duration-200",
                      active
                        ? "border-2 border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                        : "text-k-body hover:bg-k-yellow/40 hover:text-k-ink",
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
                        active ? "text-k-ink" : "text-zinc-400 group-hover:text-k-ink",
                      )}
                    >
                      {ICONS[icon]}
                    </svg>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      );
    });

  return (
    <>
      <details className="group lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border-2 border-k-ink bg-white px-3 py-2.5 text-sm font-black text-k-ink">
          {current?.label ?? REPLI_MOBILE}
          <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <nav
          aria-label="Navigation principale"
          className="mt-2 grid gap-1 rounded-xl border-2 border-k-ink bg-white p-2"
        >
          {rendreGroupes("mobile")}
        </nav>
      </details>
      <nav
        aria-label="Navigation principale"
        className="hidden flex-col gap-1 lg:flex"
      >
        {rendreGroupes("desktop")}
      </nav>
    </>
  );
}
