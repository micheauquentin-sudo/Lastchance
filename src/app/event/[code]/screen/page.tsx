import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { loadEventPublicContext } from "@/lib/event-context";
import { EventScreen } from "@/components/event/event-screen";

export const metadata: Metadata = {
  title: "Écran de salle — Événement en direct",
  // Écran privé par commerce : suivable par lien, jamais indexé.
  robots: { index: false },
};

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
  const ctx = await loadEventPublicContext(code);
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
    />
  );
}
