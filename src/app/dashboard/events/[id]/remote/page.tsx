import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventState } from "@/actions/events";
import { mapEventPublicState, type EventPublicState } from "@/lib/event";
import { loadEventRemoteContext } from "@/lib/event-context";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import { EventRemote } from "@/components/event/event-remote";

export const metadata: Metadata = { title: "Télécommande — Événement en direct" };

/**
 * L'AMORCE DU POLLING, ET RIEN DE PLUS.
 *
 * `EventRemote` sait déjà se passer de cet état : il retombe sur le statut et
 * la phase chargés côté serveur, puis bascule sur le polling dès que la session
 * démarre. C'est même le cas NORMAL d'une session en brouillon, où
 * `event_etat_partage` rend `unavailable`. Un échec de lecture doit donc
 * rendre exactement ce que rend une session pas encore ouverte — surtout pas
 * une page morte.
 */
async function etatInitialTolerant(sessionId: string): Promise<EventPublicState> {
  try {
    return await getEventState({ sessionId });
  } catch (error) {
    reportError("event.remote.etat-initial", error);
    return mapEventPublicState(null);
  }
}

/**
 * LE STATUT DU JEU, ET PAS SEULEMENT CELUI DE LA SESSION.
 *
 * « Démarrer la session » ouvre le salon au public : un jeu encore en brouillon
 * n'a rien à y ouvrir. Le refus existe côté serveur (action + RPC), mais un
 * bouton qui ne peut qu'échouer ne doit pas se présenter comme disponible —
 * l'écran dit la même chose, avant le clic.
 *
 * EN CAS D'ÉCHEC DE LECTURE, ON RÉPOND `true`, ET C'EST DÉLIBÉRÉ. Le
 * raisonnement ci-dessus vaut pour un refus CONNU ; ici on ne sait rien.
 * Répondre `false` afficherait « ouvrez le jeu aux joueurs » à quelqu'un dont
 * le jeu est peut-être déjà ouvert, et désactiverait son seul bouton : une
 * impasse, en soirée, sans recours. Répondre `true` laisse le serveur — qui
 * fait autorité — opposer son refus motivé si le jeu est réellement en
 * brouillon. Un message précis vaut mieux qu'un bouton mort.
 */
async function jeuOuvertTolerant(
  gameId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("event_games")
      .select("status")
      .eq("id", gameId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) {
      reportError("event.remote.statut-jeu", error);
      return true;
    }
    return data?.status === "active";
  } catch (error) {
    reportError("event.remote.statut-jeu", error);
    return true;
  }
}

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
  if (!ctx.ok) {
    if (ctx.reason === "technical") {
      return (
        <section
          role="alert"
          className="mx-auto max-w-lg rounded-2xl border-2 border-k-ink bg-white p-6 text-center shadow-[6px_6px_0_rgba(33,29,22,0.9)]"
        >
          <h1 className="text-xl font-black text-k-ink">
            La télécommande est momentanément indisponible
          </h1>
          <p className="mt-2 text-sm font-bold text-k-body">
            La session n&apos;a pas été modifiée. Réessayez ; si cela persiste, revenez à vos événements.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href={`/dashboard/events/${id}/remote`}
              className="rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
            >
              Réessayer
            </Link>
            <Link
              href="/dashboard/events"
              className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink"
            >
              Retour aux événements
            </Link>
          </div>
        </section>
      );
    }
    notFound();
  }

  const { session, questions, players } = ctx;

  // ── TROIS LECTURES, UNE SEULE INDISPENSABLE ──
  //
  // Cette page est la SEULE porte qui ouvre un salon, et on la pousse en
  // soirée, devant du public. Les deux lectures ci-dessous ne servent qu'à
  // affiner l'affichage : l'état d'amorce du polling, et le statut du jeu.
  // Elles étaient pourtant capables d'emporter tout l'écran — une exception
  // dans l'une ou l'autre remonte à `dashboard/error.tsx`, qui affiche
  // « Cette page n'a pas pu être chargée » et ne laisse AUCUN recours :
  // l'organisateur ne peut plus démarrer sa session.
  //
  // Elles dégradent désormais au lieu de casser, et chacune se signale sous
  // son propre nom dans le monitoring — un incident futur sera identifié, pas
  // générique.
  const initialPublicState = await etatInitialTolerant(session.id);
  const gameActive = await jeuOuvertTolerant(session.gameId, ctx.organizationId);

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
