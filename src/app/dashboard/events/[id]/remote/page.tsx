import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventState } from "@/actions/events";
import { loadEventRemoteContext } from "@/lib/event-context";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { createClient } from "@/lib/supabase/server";
import { EventRemote } from "@/components/event/event-remote";

export const metadata: Metadata = { title: "Télécommande — Événement en direct" };

/** L'état de la partie évolue en continu : jamais servi depuis un cache. */
export const dynamic = "force-dynamic";

/**
 * Télécommande organisateur d'une SESSION du Mode événement en direct. Le
 * segment [id] désigne la SESSION (loadEventRemoteContext(sessionId)). Réservé
 * aux owner/editor ; 404 générique sinon.
 */
export default async function EventRemotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadEventRemoteContext(id);
  if (!ctx.ok) notFound();

  const { session, questions, players } = ctx;
  // État public initial pour amorcer le polling (indisponible tant que la
  // session est en brouillon : le composant retombe alors sur session.status).
  const initialPublicState = await getEventState({ sessionId: session.id });

  // LE STATUT DU JEU, ET PAS SEULEMENT CELUI DE LA SESSION.
  //
  // « Démarrer la session » ouvre le salon au public : un jeu encore en
  // brouillon n'a rien à y ouvrir. Le refus existe désormais côté serveur
  // (action + RPC), mais un bouton qui ne peut qu'échouer ne doit pas se
  // présenter comme disponible — l'écran dit la même chose, avant le clic.
  const supabase = await createClient();
  const { data: game } = await supabase
    .from("event_games")
    .select("status")
    .eq("id", session.gameId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const gameActive = game?.status === "active";

  const screenUrl = `/event/${session.joinCode}/screen`;
  const playUrl = `/event/${session.joinCode}`;

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/events/${session.gameId}`}
        className="text-sm text-zinc-600 hover:text-k-ink"
      >
        ← Retour au jeu
      </Link>

      <EventRemote
        sessionId={session.id}
        joinCode={session.joinCode}
        screenUrl={screenUrl}
        playUrl={playUrl}
        sessionTitle={session.label || "Session en direct"}
        gameActive={gameActive}
        initialStatus={session.status}
        initialPhase={session.phase}
        questions={questions}
        players={players}
        maxParticipants={session.maxParticipants}
        initialPublicState={initialPublicState}
        realtimeEnabled={eventRealtimeEnabled()}
      />
    </div>
  );
}
