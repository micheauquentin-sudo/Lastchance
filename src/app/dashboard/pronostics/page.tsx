import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPronosticsAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import { NewContestForm } from "@/components/dashboard/new-contest-form";
import { getCompetition } from "@/lib/competitions";
import type { Contest } from "@/types/database";

export const metadata: Metadata = { title: "Pronostics" };

export default async function PronosticsPage() {
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  // Module en option : sans l'addon, la page présente l'offre au lieu
  // de la liste (aucune donnée à charger).
  if (!hasPronosticsAccess(organization!)) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Pronostics</h1>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🏆</div>
          <h2 className="text-lg font-bold text-k-ink mb-2">
            Faites vibrer votre commerce pendant les grandes compétitions
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-1">
            Coupe du monde, 6 Nations, Roland-Garros… Vos clients pronostiquent
            les matchs, le classement vit en direct, les meilleurs gagnent vos
            récompenses.
          </p>
          <p className="text-sm text-zinc-500">
            Module en option — contactez-nous pour l&apos;activer sur votre
            compte.
          </p>
        </Card>
      </div>
    );
  }

  const [{ data: contests }, { data: playerCounts }] = await Promise.all([
    supabase
      .from("contests")
      .select("*")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("contest_players")
      .select("contest_id")
      .eq("organization_id", organization!.id),
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
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pronostics</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Un championnat = une compétition, vos clients, votre classement.
          </p>
        </div>
        <NewContestForm />
      </div>

      {!contestList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun championnat pour l&apos;instant. Créez le premier !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {contestList.map((c) => {
            const competition = getCompetition(c.competition_key);
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
                        {competition?.icon ?? "🏆"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{c.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {competition?.label ?? c.competition_key} · créé le{" "}
                          {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-zinc-500">
                        <span className="font-semibold text-zinc-900">
                          {players}
                        </span>{" "}
                        joueur{players > 1 ? "s" : ""}
                      </span>
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
