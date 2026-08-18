import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { loadEventPublicContext } from "@/lib/event-context";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { EventScreen } from "@/components/event/event-screen";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((code: string) => loadEventPublicContext(code));

/**
 * LE 404 SE DÉCIDE ICI, ET PAS SEULEMENT DANS LE CORPS.
 *
 * Depuis que le groupe `(player)` porte un `loading.tsx`, le rendu est STREAMÉ :
 * Next envoie l'en-tête HTTP — donc le STATUT — dès que la coquille est prête,
 * et le `notFound()` du corps n'arrive que dans un chunk ultérieur. Un code
 * d'événement inconnu rendait alors **200** avec un digest 404 dans le flux.
 * `generateMetadata` s'exécute AVANT le premier octet ; c'est le dernier
 * endroit où le statut est encore négociable. Le `notFound()` du corps reste
 * en filet, et `loadContext` est mémoïsé par `cache()`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const ctx = await loadContext(code);
  if (!ctx.ok) notFound();
  return {
    title: "Écran de salle — Événement en direct",
    // Écran privé par commerce : suivable par lien, jamais indexé.
    robots: { index: false },
  };
}

/** La partie évolue en continu : jamais servie depuis un cache. */
export const dynamic = "force-dynamic";

/**
 * Écran de salle plein écran du Mode événement en direct (téléviseur / vidéo-
 * projecteur). Public suivable par lien : lobby (QR + joueurs), question + chrono,
 * révélation, classement, podium final. Le polling côté client fait tout
 * fonctionner (aucune dépendance Realtime).
 */
export default async function EventScreenPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await loadContext(code);
  if (!ctx.ok) notFound();

  const joinUrl = `${APP_URL}/event/${ctx.joinCode}`;

  return (
    <EventScreen
      sessionId={ctx.sessionId}
      joinCode={ctx.joinCode}
      joinUrl={joinUrl}
      organizationName={ctx.organization.name}
      logoUrl={ctx.organization.logo_url}
      title="Événement en direct"
      initial={ctx.publicState}
      realtimeEnabled={eventRealtimeEnabled()}
    />
  );
}
