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
import { EventStatusBadge } from "@/components/dashboard/event-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewEventForm } from "@/components/dashboard/new-event-form";
import { Pagination } from "@/components/dashboard/pagination";
import {
  couperPage,
  litFiltresModule,
  ModuleListAucunResultat,
  ModuleListFilters,
  paramsPagination,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import type { EventGame } from "@/types/database";

export const metadata: Metadata = { title: "Événements live" };

/** Le `check` de `event_games.status` : trois valeurs, pas de `paused`. */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "archived", etat: "cloturee" },
];

type GameRow = Pick<EventGame, "id" | "name" | "status" | "created_at"> & {
  questionCount: number;
  sessionCount: number;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3). La publication reste refusée
  // en base ; cet écran ne fait qu'éviter de proposer un bouton qui échouerait.
  const capacites = await capacitesDuModule("events");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();
  let requete = supabase
    .from("event_games")
    .select("id, name, status, created_at")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);
  const { data: games } = await requete;

  const { lignes: gameList, hasNext } = couperPage(
    (games ?? []) as Pick<
      EventGame,
      "id" | "name" | "status" | "created_at"
    >[],
  );

  // Comptes par jeu (questions + sessions) — org-scopés, honorés par la RLS.
  // Deux requêtes PAR JEU, et c'est la pagination qui les rend acceptables :
  // sans `.range()`, cette page ouvrait 2 × (nombre total de jeux) connexions
  // à chaque affichage. Le plafond est désormais 2 × MODULE_PAGE_SIZE.
  // Le compte lui-même est inchangé : il porte sur le jeu, pas sur la page.
  const rows: GameRow[] = await Promise.all(
    gameList.map(async (g) => {
      const [{ count: questionCount }, { count: sessionCount }] = await Promise.all([
        supabase
          .from("event_questions")
          .select("id", { count: "exact", head: true })
          .eq("game_id", g.id)
          .eq("organization_id", organization!.id),
        supabase
          .from("event_sessions")
          .select("id", { count: "exact", head: true })
          .eq("game_id", g.id)
          .eq("organization_id", organization!.id),
      ]);
      return {
        ...g,
        questionCount: questionCount ?? 0,
        sessionCount: sessionCount ?? 0,
      };
    }),
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Événements live"
        sousTitre={sousTitreTableauDeBord("events")}
        actions={capacites.canEditDraft ? <NewEventForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="events">
        Quiz, sondages et pronostics ; écran de salle plein écran ; télécommande
        organisateur ; lot à stock fini.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="event-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom du jeu…"
      />

      {!rows.length ? (
        <Card className="py-12 text-center">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="jeu" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucun jeu pour l&apos;instant. Créez le premier !
              </p>
              {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
                  cliquer laissait le seul bouton en haut d'écran, hors du
                  regard de celui qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewEventForm instanceId="-vide" />
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((g) => (
            <li key={g.id}>
              <Link
                href={`/dashboard/events/${g.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-orange-300"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      🎬
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {g.questionCount} question{g.questionCount > 1 ? "s" : ""} ·{" "}
                        {g.sessionCount} session{g.sessionCount > 1 ? "s" : ""} · créé
                        le {formatDate(g.created_at)}
                      </p>
                    </div>
                  </div>
                  <EventStatusBadge status={g.status} />
                </div>
              </Link>
            </li>
          ))}
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
