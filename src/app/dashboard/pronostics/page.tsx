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
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewContestForm } from "@/components/dashboard/new-contest-form";
import { getCompetition } from "@/lib/competitions";
import {
  eventKindLabel,
  FOOTBALL_EVENT_KIND,
  getEventKind,
} from "@/components/dashboard/contest-event-kinds";
import { Pagination } from "@/components/dashboard/pagination";
import {
  couperPage,
  litFiltresModule,
  ModuleListAucunResultat,
  ModuleListFilters,
  paramsPagination,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import { comptesParParent } from "@/components/dashboard/module-list-counts";
import type { Contest } from "@/types/database";

export const metadata: Metadata = { title: "Pronostics" };

/**
 * `contests.status` est LE MOUTON NOIR des sept : sa troisième valeur est
 * `finished`, pas `archived` — un championnat se termine, il ne s'archive pas.
 * Copier la liste d'un autre module ici aurait rendu un filtre muet.
 */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "finished", etat: "cloturee" },
];

export default async function PronosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("pronostics");
  if (!capacites.canExplore) notFound();

  let requete = supabase
    .from("contests")
    .select("*")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);

  const { data: contests } = await requete;

  const { lignes: contestList, hasNext } = couperPage(
    (contests ?? []) as Contest[],
  );

  /**
   * LES INSCRITS DE LA PAGE, COMPTÉS EN BASE.
   *
   * Cette requête ramenait UNE LIGNE PAR INSCRIT de toute l'organisation pour
   * n'en tirer qu'un nombre par championnat : un championnat à vingt mille
   * pronostiqueurs transférait vingt mille lignes à chaque affichage. Un `in`
   * sur la page ne suffirait pas (le volume est dans les joueurs, pas dans le
   * nombre de parents) : c'est le `count exact head` par championnat, motif de
   * la liste des événements, qui ne transfère rien. Vingt allers-retours au
   * plus, bornés par la taille de page. La garde `role === "owner"` est
   * inchangée, et les identifiants sont ceux d'APRÈS `couperPage`.
   */
  const countByContest = await comptesParParent(
    role === "owner" ? contestList.map((c) => c.id) : [],
    "contest_id",
    () =>
      supabase
        .from("contest_players")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization!.id),
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Pronostics"
        sousTitre={sousTitreTableauDeBord("pronostics")}
        actionsClassName="w-full basis-full"
        actions={
          capacites.canEditDraft ? (
            <NewContestForm timeZone={organization!.timezone} />
          ) : null
        }
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="pronostics">
        Championnats illimités, calendriers et résultats automatiques, classement
        public et récompenses par rang.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="contest-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom du championnat…"
      />

      {!contestList.length ? (
        <Card className="text-center py-12">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="championnat" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucun championnat pour l&apos;instant. Créez le premier !
              </p>
              {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
                  cliquer laissait le seul bouton en haut d'écran, hors du
                  regard de celui qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewContestForm
                    timeZone={organization!.timezone}
                    instanceId="-vide"
                  />
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {contestList.map((c) => {
            // Football : la compétition du catalogue reste l'identité de la
            // ligne (parcours d'origine). Tout autre modèle s'affiche par
            // son modèle d'événement, pas par sa compétition « custom ».
            const isFootball = c.event_kind === FOOTBALL_EVENT_KIND;
            const kind = getEventKind(c.event_kind);
            const competition = getCompetition(c.competition_key);
            const icon = isFootball
              ? (competition?.icon ?? "🏆")
              : (kind?.icon ?? "🏆");
            const subtitle = isFootball
              ? (competition?.label ?? c.competition_key)
              : eventKindLabel(c.event_kind);
            const players = countByContest.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/pronostics/${c.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        {icon}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{c.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {subtitle} · créé le{" "}
                          {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {role === "owner" && (
                        <span className="text-sm text-zinc-500">
                          <span className="font-semibold text-zinc-900">
                            {players}
                          </span>{" "}
                          joueur{players > 1 ? "s" : ""}
                        </span>
                      )}
                      <ContestStatusBadge status={c.status} />
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
