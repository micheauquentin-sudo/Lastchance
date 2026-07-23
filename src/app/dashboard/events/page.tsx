import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasEventsAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EventStatusBadge } from "@/components/dashboard/event-status";
import { NewEventForm } from "@/components/dashboard/new-event-form";
import type { EventGame } from "@/types/database";

export const metadata: Metadata = { title: "Événements" };

type GameRow = Pick<EventGame, "id" | "name" | "status" | "created_at"> & {
  questionCount: number;
  sessionCount: number;
};

export default async function EventsPage() {
  const { organization } = await getUserAndOrg();

  // Module en option : sans l'addon, la page présente l'offre (miroir Jackpot).
  if (!hasEventsAccess(organization!)) {
    return (
      <div>
        <h1 className="mb-8 text-2xl font-bold">Événements</h1>
        <Card className="py-12 text-center">
          <div className="mb-4 text-5xl">🎬</div>
          <h2 className="mb-2 text-lg font-bold text-k-ink">
            Animez votre salle en direct
          </h2>
          <p className="mx-auto mb-4 max-w-lg text-zinc-500">
            Un quiz interactif façon soirée blind-test : vos clients rejoignent
            avec leur téléphone en scannant un QR, répondent en temps réel, et le
            grand écran affiche les questions, le classement et le podium. Les
            gagnants récupèrent leur lot en caisse.
          </p>
          <div className="mx-auto mb-3 max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3">
            <p className="text-sm font-bold text-k-ink">
              Option à activer sur votre abonnement
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quiz, sondages et pronostics ; écran de salle plein écran ;
              télécommande organisateur ; lot à stock fini.
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
  const { data: games } = await supabase
    .from("event_games")
    .select("id, name, status, created_at")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  const gameList = (games ?? []) as Pick<
    EventGame,
    "id" | "name" | "status" | "created_at"
  >[];

  // Comptes par jeu (questions + sessions) — org-scopés, honorés par la RLS.
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
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Événements</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Des quiz en direct pour animer votre salle : vos clients jouent depuis
            leur téléphone, tout s&apos;affiche sur grand écran.
          </p>
        </div>
        <NewEventForm />
      </div>

      {!rows.length ? (
        <Card className="py-12 text-center">
          <p className="text-zinc-500">
            Aucun jeu pour l&apos;instant. Créez le premier !
          </p>
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
    </div>
  );
}
