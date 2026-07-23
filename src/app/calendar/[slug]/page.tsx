import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCalendarPublicContext } from "@/lib/calendar-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarTracker } from "@/components/calendar/calendar-tracker";
import { loadCalendarSpinBundles } from "@/lib/calendar-spin-bundle";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique SUIVABLE d'un calendrier / campagne quotidienne — DA
 * « Kermesse / carton », déclinée par saison (5 thèmes). Le client arrive en
 * scannant le QR du commerce et peut « ajouter à l'écran d'accueil » pour
 * revenir ouvrir sa case chaque jour (PWA installable, cf. metadata +
 * /calendar/[slug]/manifest.webmanifest — miroir du jackpot).
 *
 * Rendu dynamique : l'état dépend du cookie joueur et du jour. Aucune écriture
 * au chargement — l'ouverture d'une case se fait au POST du bouton.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((slug: string) => loadCalendarPublicContext(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx.ok) return { title: "Calendrier", robots: { index: false } };

  const name = ctx.publicState.calendar?.name ?? "Calendrier";
  return {
    title: name,
    description: `Ouvrez chaque jour une case du calendrier de ${ctx.organization.name}.`,
    // Page privée par commerce : suivable par lien, pas indexée.
    robots: { index: false },
    manifest: `/calendar/${encodeURIComponent(slug)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadContext(slug);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (calendrier inconnu, archivé, module coupé, abonnement inactif…).
  if (!ctx.ok || !ctx.publicState.calendar) notFound();

  const admin = createAdminClient();

  // dayIndex → id : l'état public masque l'id des cases (sécurité), mais
  // open_calendar_box l'exige. On le résout côté serveur (service role, scopé).
  const { data: dayRows } = await admin
    .from("calendar_days")
    .select("id, day_index")
    .eq("calendar_id", ctx.calendarId)
    .eq("organization_id", ctx.organization.id);
  const dayIds: Record<number, string> = {};
  for (const d of (dayRows ?? []) as { id: string; day_index: number }[]) {
    dayIds[d.day_index] = d.id;
  }

  // On ne précharge QUE les roues des cases DÉJÀ OUVERTES par ce joueur (l'état
  // public expose alors `targetWheelId`) : rien pour les cases verrouillées /
  // futures — sinon leurs lots fuiteraient dans le payload RSC. Le bundle d'une
  // case ouverte pendant la session arrive à la volée via openCalendarBox.
  const openedSpinWheelIds = ctx.publicState.days
    .filter((d) => d.status === "opened" && d.contentType === "spin" && d.targetWheelId)
    .map((d) => d.targetWheelId as string);
  const spinBundles = await loadCalendarSpinBundles(
    admin,
    openedSpinWheelIds,
    ctx.organization.id,
  );

  return (
    <Shell theme={ctx.publicState.calendar.theme}>
      <CalendarTracker
        calendarId={ctx.calendarId}
        publicSlug={ctx.publicSlug}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        theme={ctx.publicState.calendar.theme}
        merchantContent={ctx.publicState.calendar.merchantContent}
        initialState={ctx.publicState}
        dayIds={dayIds}
        spinBundles={spinBundles}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Calendrier proposé par {ctx.organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=calendar&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </Shell>
  );
}

function Shell({
  theme,
  children,
}: {
  theme: Parameters<typeof calendarThemeTokens>[0];
  children: React.ReactNode;
}) {
  const tokens = calendarThemeTokens(theme);
  return (
    <div className="min-h-dvh" style={tokens.pageStyle}>
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page (identité du parcours joueur). */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </div>
  );
}
