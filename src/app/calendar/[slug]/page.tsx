import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCalendarPublicContext } from "@/lib/calendar-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CalendarTracker,
  type CalendarSpinBundle,
} from "@/components/calendar/calendar-tracker";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
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

interface PrizeRow {
  id: string;
  label: string;
  color: string;
  position: number;
  created_at: string;
  wheel_id: string;
}
interface WheelRow {
  id: string;
  campaign_id: string;
}
interface CampaignRow {
  id: string;
  collect_email: boolean;
  collect_phone: boolean;
  code_ttl_seconds: number | null;
}

/**
 * Précharge, pour les cases `spin` du calendrier, la roue cible (segments
 * publics ordonnés comme le tirage serveur + config de collecte de la campagne).
 * Indexé par wheelId : la table révélée ne relie AUCUN jour à une roue (invariant
 * #2 préservé — le joueur n'apprend le wheelId qu'en ouvrant sa case). Les
 * segments d'une roue sont de toute façon publics quand cette roue est jouée.
 */
async function loadSpinBundles(
  admin: ReturnType<typeof createAdminClient>,
  calendarId: string,
  organizationId: string,
): Promise<Record<string, CalendarSpinBundle>> {
  const { data: dayRows } = await admin
    .from("calendar_days")
    .select("target_wheel_id")
    .eq("calendar_id", calendarId)
    .eq("organization_id", organizationId)
    .eq("content_type", "spin")
    .not("target_wheel_id", "is", null);

  const wheelIds = [
    ...new Set(
      ((dayRows ?? []) as { target_wheel_id: string | null }[])
        .map((d) => d.target_wheel_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (wheelIds.length === 0) return {};

  const [{ data: prizeRows }, { data: wheelRows }] = await Promise.all([
    admin
      .from("prizes")
      .select("id, label, color, position, created_at, wheel_id")
      .in("wheel_id", wheelIds)
      .eq("is_active", true)
      .eq("organization_id", organizationId),
    admin
      .from("wheels")
      .select("id, campaign_id")
      .in("id", wheelIds)
      .eq("organization_id", organizationId),
  ]);

  const wheels = (wheelRows ?? []) as WheelRow[];
  const campaignIds = [...new Set(wheels.map((w) => w.campaign_id))];
  const { data: campaignRows } = campaignIds.length
    ? await admin
        .from("campaigns")
        .select("id, collect_email, collect_phone, code_ttl_seconds")
        .in("id", campaignIds)
        .eq("organization_id", organizationId)
    : { data: [] };

  const campaignById = new Map(
    ((campaignRows ?? []) as CampaignRow[]).map((c) => [c.id, c]),
  );
  const wheelById = new Map(wheels.map((w) => [w.id, w]));

  // Segments par roue : triés comme le tirage serveur (position, puis
  // created_at) — l'index doit coïncider avec le prizeIndex renvoyé.
  const prizeByWheel = new Map<string, PrizeRow[]>();
  for (const row of (prizeRows ?? []) as PrizeRow[]) {
    const list = prizeByWheel.get(row.wheel_id) ?? [];
    list.push(row);
    prizeByWheel.set(row.wheel_id, list);
  }

  const bundles: Record<string, CalendarSpinBundle> = {};
  for (const wheelId of wheelIds) {
    const list = (prizeByWheel.get(wheelId) ?? []).sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    );
    const segments: WheelSegment[] = list.map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
    }));
    const campaign = campaignById.get(wheelById.get(wheelId)?.campaign_id ?? "");
    bundles[wheelId] = {
      segments,
      claimConfig: {
        collectEmail: Boolean(campaign?.collect_email),
        collectPhone: Boolean(campaign?.collect_phone),
        codeTtlSeconds: campaign?.code_ttl_seconds ?? null,
      },
    };
  }
  return bundles;
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

  const spinBundles = await loadSpinBundles(
    admin,
    ctx.calendarId,
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
