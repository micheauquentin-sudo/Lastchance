import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
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
import type { Contest } from "@/types/database";

export const metadata: Metadata = { title: "Pronostics" };

export default async function PronosticsPage() {
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("pronostics");
  if (!capacites.canExplore) notFound();

  const [{ data: contests }, { data: playerCounts }] = await Promise.all([
    supabase
      .from("contests")
      .select("*")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    role === "owner"
      ? supabase
          .from("contest_players")
          .select("contest_id")
          .eq("organization_id", organization!.id)
      : Promise.resolve({ data: [] as Array<{ contest_id: string }> }),
  ]);

  const contestList = (contests ?? []) as Contest[];
  const countByContest = new Map<string, number>();
  for (const row of playerCounts ?? []) {
    countByContest.set(
      row.contest_id,
      (countByContest.get(row.contest_id) ?? 0) + 1,
    );
  }

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Pronostics"
        sousTitre="Un championnat = une compétition, vos clients, votre classement."
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

      {!contestList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun championnat pour l&apos;instant. Créez le premier !
          </p>
          {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
              cliquer laissait le seul bouton en haut d'écran, hors du regard
              de celui qui vient de lire la phrase. */}
          {capacites.canEditDraft ? (
            <div className="mt-4 flex justify-center">
              <NewContestForm
                timeZone={organization!.timezone}
                instanceId="-vide"
              />
            </div>
          ) : null}
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
    </div>
  );
}
