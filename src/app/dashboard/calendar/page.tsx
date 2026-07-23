import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasCalendarAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CalendarStatusBadge } from "@/components/dashboard/calendar-status";
import { NewCalendarForm } from "@/components/dashboard/new-calendar-form";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import type { Calendar } from "@/types/database";

export const metadata: Metadata = { title: "Calendrier" };

type CalendarRow = Pick<
  Calendar,
  | "id"
  | "name"
  | "status"
  | "theme"
  | "day_count"
  | "completion_reward_claimed_count"
  | "completion_reward_stock"
  | "created_at"
>;

export default async function CalendarListPage() {
  const { organization } = await getUserAndOrg();

  // Module en option : sans l'addon, la page présente l'offre au lieu de la
  // liste (miroir de la gate Jackpot / Fidélité).
  if (!hasCalendarAccess(organization!)) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Calendrier</h1>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-lg font-bold text-k-ink mb-2">
            Faites revenir vos clients, jour après jour
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-4">
            Un calendrier de l&apos;Avent (ou de la semaine des soldes, d&apos;un
            anniversaire…) : chaque jour, vos clients ouvrent une case et
            découvrent un message, un lot ou un tour de roue. Un rendez-vous
            quotidien avec votre commerce.
          </p>
          <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 mb-3">
            <p className="text-sm font-bold text-k-ink">
              Option à activer sur votre abonnement
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              5 thèmes saisonniers, cases message / lot / tour de roue, récompense
              d&apos;assiduité et page installable par vos clients.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Contactez-nous pour l&apos;activer sur votre compte.
          </p>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: calendars } = await supabase
    .from("calendars")
    .select(
      "id, name, status, theme, day_count, completion_reward_claimed_count, completion_reward_stock, created_at",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  const calendarList = (calendars ?? []) as CalendarRow[];

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendrier</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Des campagnes quotidiennes : une case à ouvrir chaque jour, un
            rendez-vous ludique avec vos clients.
          </p>
        </div>
        <NewCalendarForm />
      </div>

      {!calendarList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun calendrier pour l&apos;instant. Créez le premier !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {calendarList.map((c) => {
            const tokens = calendarThemeTokens(c.theme);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/calendar/${c.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        {tokens.faceEmoji}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{c.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {tokens.label} · {c.day_count} case
                          {c.day_count > 1 ? "s" : ""} · créé le{" "}
                          {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="hidden text-sm text-zinc-500 sm:inline">
                        <span className="font-semibold text-zinc-900 tabular-nums">
                          {c.completion_reward_claimed_count}/
                          {c.completion_reward_stock}
                        </span>{" "}
                        cadeau{c.completion_reward_stock > 1 ? "x" : ""}
                      </span>
                      <CalendarStatusBadge status={c.status} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
