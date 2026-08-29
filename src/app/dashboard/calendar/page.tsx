import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { sousTitreTableauDeBord } from "@/platform/experiences/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarStatusBadge } from "@/components/dashboard/calendar-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewCalendarForm } from "@/components/dashboard/new-calendar-form";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import { Pagination } from "@/components/dashboard/pagination";
import {
  couperPage,
  litFiltresModule,
  ModuleListAucunResultat,
  ModuleListFilters,
  paramsPagination,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import type { Calendar } from "@/types/database";

export const metadata: Metadata = { title: "Calendrier" };

/** Le `check` de `calendars.status` : trois valeurs, pas de `paused`. */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "archived", etat: "cloturee" },
];

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

export default async function CalendarListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3) : la page ne se referme plus
  // derrière une carte d'offre, elle s'ouvre en lecture et en brouillon. Seule
  // la publication reste payante, et c'est la base qui la refuse.
  const capacites = await capacitesDuModule("calendar");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();
  let requete = supabase
    .from("calendars")
    .select(
      "id, name, status, theme, day_count, completion_reward_claimed_count, completion_reward_stock, created_at",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);
  const { data: calendars } = await requete;

  const { lignes: calendarList, hasNext } = couperPage(
    (calendars ?? []) as CalendarRow[],
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Calendrier"
        sousTitre={sousTitreTableauDeBord("calendar")}
        actions={capacites.canEditDraft ? <NewCalendarForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="calendar">
        5 thèmes saisonniers, cases message / lot / tour de roue, récompense
        d&apos;assiduité et page installable par vos clients.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="calendar-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom du calendrier…"
      />

      {!calendarList.length ? (
        <Card className="text-center py-12">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="calendrier" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucun calendrier pour l&apos;instant. Créez le premier !
              </p>
              {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
                  cliquer laissait le seul bouton en haut d'écran, hors du
                  regard de celui qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewCalendarForm instanceId="-vide" />
                </div>
              ) : null}
            </>
          )}
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
      <Pagination
        page={filtres.page}
        hasNext={hasNext}
        params={paramsPagination(filtres)}
      />
    </div>
  );
}
