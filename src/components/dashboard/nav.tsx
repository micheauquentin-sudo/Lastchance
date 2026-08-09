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
 * LA MÉTA-PROGRESSION EST UNE ANIMATION, PAS UN OUTIL — elle a donc quitté
 * « Outils » pour la fin du groupe « Vos animations » : le commerçant y cherche
 * ce qui fait jouer ses clients, et des missions qui paient en clés puis en
 * coffres en font partie. Le libellé le dit désormais en toutes lettres.
 *
 * Elle est ajoutée À LA MAIN à la fin du groupe, JAMAIS via `EXPERIENCE_CATALOG` :
 * ce dernier est filtré par `activeExperiences` et aucun `addon_progression`
 * n'existe en base — passer par le catalogue la ferait purement disparaître du
 * menu (même piège que « Découvrir », voir le commentaire du filtre plus bas).
 */
const PROGRESSION_LINK: DashboardLink = {
  href: "/dashboard/progression",
  label: "Missions & coffres",
  icon: "progression",
};

/**
 * Outils TRANSVERSES, servis après les expériences. Ils ne dépendent d'aucun
 * addon et ne sont donc pas filtrés par `activeExperiences`.
 */
const EDITOR_TOOL_LINKS: DashboardLink[] = [
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

/**
 * L'EMOJI DE CHAQUE ENTRÉE — il REMPLACE le pictogramme SVG, il ne s'ajoute
 * pas à lui : deux glyphes côte à côte sur dix-huit lignes font un menu plus
 * chargé, pas plus lisible. Le trait fin gris se lisait mal sur mobile et ne
 * distinguait guère « Chasse » de « Progression » ; l'emoji nomme la chose.
 *
 * Il est rendu dans un <span aria-hidden> SÉPARÉ du libellé : le nom
 * accessible du lien reste exactement le libellé, et aucun locator par nom
 * (E2E, lecteur d'écran) ne bouge.
 */
const EMOJIS: Record<IconKey, string> = {
  home: "🏠",
  cash: "💰",
  campaign: "🎡",
  trophy: "🏆",
  map: "🗺️",
  // 📔 et non 🎟️ : le ticket est déjà l'emoji de la carte à gratter côté
  // joueur (game-idle.ts), le passeport de fidélité est un carnet.
  loyalty: "📔",
  jackpot: "🎰",
  event: "🎤",
  calendar: "🗓️",
  quiz: "❓",
  // 🗝️ et non 📈 : la courbe disait « statistiques » alors que la page ouvre
  // des coffres avec des clés. Le libellé et le glyphe disent la même chose.
  progression: "🗝️",
  discover: "🧭",
  qr: "📱",
  list: "📋",
  users: "👥",
  mail: "✉️",
  settings: "⚙️",
  team: "🤝",
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
          {
            titre: "Vos animations",
            cle: "animations",
            links: [...experienceLinks, PROGRESSION_LINK],
          },
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
                      // `min-w-0` sur le lien + `truncate` sur le libellé :
                      // la colonne est figée à `lg:w-64` et le
                      // `whitespace-nowrap` faisait sortir du cadre tout
                      // libellé plus long que la largeur disponible. Les
                      // libellés actuels tiennent — rien ne change à
                      // l'écran —, mais le prochain sera coupé net au lieu
                      // de déborder.
                      "group flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-all duration-200",
                      active
                        ? "border-2 border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                        : "text-k-body hover:bg-k-yellow/40 hover:text-k-ink",
                    )}
                  >
                    <span
                      aria-hidden
                      className="w-5 shrink-0 text-center text-base leading-none"
                    >
                      {EMOJIS[icon]}
                    </span>
                    <span className="truncate">{label}</span>
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
