import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasCalendarAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
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
  "id, organization_id, name, theme, status, start_date, timezone, day_count, public_slug, merchant_content, completion_reward_label, completion_reward_details, completion_reward_stock, completion_reward_claimed_count, created_at, updated_at";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await getUserAndOrg();
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
  const publicPath = `/calendar/${c.public_slug ?? c.id}`;

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

      <CalendarStatusControls calendar={c} />

      {c.status === "active" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold mb-1">Page publique</h2>
            <p className="truncate text-sm text-zinc-500">
              À mettre dans le QR code du commerce.{" "}
              <span className="font-mono text-k-ink">{publicPath}</span>
            </p>
          </div>
          <Link
            href={publicPath}
            target="_blank"
            className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Ouvrir la page →
          </Link>
        </Card>
      )}

      <CalendarSettings calendar={c} />

      <CalendarDaysEditor days={days} wheels={wheels} />
    </div>
  );
}
