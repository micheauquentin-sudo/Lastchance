import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { hasCalendarAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import { PublicShare } from "@/components/dashboard/public-share";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import { construireEtapesAventure } from "@/lib/experience-lifecycle";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import {
  CalendarDaysEditor,
  CalendarSettings,
  CalendarStatusControls,
  type CalendarWheelOption,
} from "@/components/dashboard/calendar-editor";
import { CalendarStatusBadge } from "@/components/dashboard/calendar-status";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import type { Calendar, CalendarDay } from "@/types/database";

export const metadata: Metadata = { title: "Calendrier" };

const CALENDAR_COLUMNS =
  "id, organization_id, name, theme, status, start_date, timezone, day_count, public_slug, merchant_content, completion_reward_label, completion_reward_details, completion_reward_stock, completion_reward_claimed_count, created_at, updated_at, code_ttl_days";

interface WheelRow {
  id: string;
  name: string;
}
interface PrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/**
 * Roues + état de leurs lots, tel que l'éditeur de cases en a besoin. Miroir du
 * filtre de tirage d'un tour offert (`is_active and weight > 0 and (is_losing or
 * stock > 0)`) : un lot non perdant « vide = illimité » est hors tirage — c'est
 * ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): CalendarWheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }
  return wheels.map((w) => {
    const drawn = (byWheel.get(w.id) ?? []).filter((p) => p.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((p) => !p.is_losing && p.stock === null)
        .map((p) => p.label),
      hasDrawablePrize: drawn.some((p) => p.is_losing || (p.stock ?? 0) > 0),
    };
  });
}

export default async function CalendarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[] }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError } = await searchParams;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasCalendarAccess(organization)) notFound();
  const supabase = await createClient();

  const [
    { data: calendar },
    { data: dayRows },
    { data: wheelRows },
    { data: prizeRows },
  ] = await Promise.all([
    supabase
      .from("calendars")
      .select(CALENDAR_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("calendar_days")
      .select("*")
      .eq("calendar_id", id)
      .eq("organization_id", organization.id)
      .order("day_index", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  if (!calendar) notFound();
  const c = calendar as unknown as Calendar;
  const days = (dayRows ?? []) as CalendarDay[];
  const wheels = toWheelOptions((wheelRows ?? []) as WheelRow[], (prizeRows ?? []) as PrizeRow[]);
  const tokens = calendarThemeTokens(c.theme);
  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Même source que
  // le quiz et les pronostics (APP_URL), pour que le QR imprimé reste valable.
  // `public_slug` est NON NULL ici (posé par trigger, cf. types/database) —
  // contrairement au jackpot, pas de repli sur l'id.
  const publicUrl = `${APP_URL}/calendar/${c.public_slug}`;
  const openCount = await readModulePageOpenCount(
    supabase,
    "calendar",
    c.id,
  );

  // Carte de l'Aventure et relance. Un calendrier n'a pas d'`ends_at` : sa fin
  // se déduit de `start_date` et `day_count`, tous deux dans `CALENDAR_COLUMNS`.
  const marqueurs = {
    status: c.status,
    start_date: c.start_date,
    day_count: c.day_count,
  };
  const capacites = await capacitesDuModule("calendar");
  const pagePath = `/dashboard/calendar/${c.id}`;
  const etapes = construireEtapesAventure({
    marqueurs: { kind: "calendar", ...marqueurs },
    capacites,
    liens: {
      editeur: pagePath,
      apercu: c.status === "active" ? publicUrl : null,
      suivi: pagePath,
    },
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/calendar"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Calendrier
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {tokens.faceEmoji}
          </span>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <CalendarStatusBadge status={c.status} />
        </div>
      </div>

      <GuidedJourney steps={etapes} title="Carte de l'Aventure" />

      <CalendarStatusControls calendar={c} />

      {/* §4 du cahier : le QR ne rend pas jouable un brouillon. On n'affiche
          donc le QR et le lien QUE si le calendrier est publié — un QR imprimé
          et collé en vitrine survit à la page qui l'a produit, alors qu'un
          bandeau d'avertissement, non. */}
      <Card>
        <h2 className="font-semibold mb-1">QR code et lien du calendrier</h2>
        {c.status === "active" ? (
          <>
            <p className="text-sm text-zinc-500 mb-3">
              Affichez le QR code en boutique ou partagez le lien : vos clients
              ouvrent leur case du jour depuis leur téléphone.
            </p>
            <PublicShare
              url={publicUrl}
              fileName={`calendrier-${c.public_slug}`}
              qrLabel={c.name}
              openCount={openCount}
            />
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Publiez le calendrier pour obtenir son QR code et son lien : tant
            qu&apos;il n&apos;est pas actif, la page publique reste fermée aux
            joueurs.
          </p>
        )}
      </Card>

      <CalendarSettings calendar={c} />

      <CalendarDaysEditor days={days} wheels={wheels} />

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && (
        <RelaunchFormulaCard
          sourceName={c.name}
          occasionLabel="la prochaine saison"
          sourceState={etatSourceRelance("calendar", marqueurs)}
          canCreateDraft={peutCreerBrouillon}
          isSupported
          action={<RelaunchFormulaAction kind="calendar" sourceId={c.id} />}
        />
      )}
    </div>
  );
}
