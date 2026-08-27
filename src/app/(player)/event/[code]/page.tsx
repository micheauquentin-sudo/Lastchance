import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEventPublicContext } from "@/lib/event-context";
import { eventRealtimeEnabled } from "@/lib/event-realtime";
import { EventPlayer } from "@/components/event/event-player";
import { SkipLink } from "@/components/ui/skip-link";
import { PageOpenBeacon } from "@/components/page-open-beacon";

/**
 * Page joueur (téléphone) du Mode événement en direct — parcours QR en boutique,
 * pensé petit écran d'abord. Saisie pseudo + avatar puis suivi des phases par
 * polling. Rendu dynamique (l'état évolue, dépend du cookie joueur) ; aucune
 * écriture au chargement (le join se fait au POST du bouton).
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((code: string) =>
  loadEventPublicContext(code, { allowDraftWaiting: true }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const ctx = await loadContext(code);

  // LE 404 SE DÉCIDE ICI, ET PAS SEULEMENT DANS LE CORPS — le rendu du groupe
  // `(player)` est streamé depuis qu'il porte un `loading.tsx`, et le statut
  // part avec l'en-tête, avant le `notFound()` du corps. Voir le commentaire
  // long dans `calendar/[slug]/page.tsx`. `loadContext` mémoïsé par `cache()`.
  if (!ctx.ok) notFound();
  return {
    title: `En direct — ${ctx.organization.name}`,
    description: `Participez à l'événement en direct de ${ctx.organization.name}.`,
    // Page privée par commerce : suivable par lien, pas indexée.
    robots: { index: false },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function EventPlayerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await loadContext(code);
  if (!ctx.ok) notFound();

  if (ctx.mode === "waiting") {
    return (
      <div className="min-h-dvh bg-k-bg">
        <SkipLink />
        <div
          aria-hidden
          className="h-3 w-full border-b-2 border-k-ink"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
          }}
        />
        <main id="contenu" tabIndex={-1} className="mx-auto max-w-md px-4 py-8 text-center outline-none">
          <p className="text-xs font-bold uppercase tracking-wide text-k-body">
            {ctx.organization.name}
          </p>
          <h1 className="mt-1 text-2xl font-black text-k-ink">
            Événement en direct
          </h1>
          <section
            role="status"
            className="mt-6 k-border rounded-2xl bg-white p-6 shadow-[6px_6px_0_var(--color-k-ink)]"
          >
            <p className="text-4xl" aria-hidden>⏳</p>
            <h2 className="mt-3 text-lg font-black text-k-ink">
              La salle d&apos;attente arrive bientôt
            </h2>
            <p className="mt-2 text-sm font-bold text-k-body">
              Gardez ce lien : l&apos;animateur ouvre la participation au début de la partie.
            </p>
            <Link
              href={`/event/${ctx.joinCode}`}
              className="mt-5 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
            >
              Actualiser
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      <PageOpenBeacon module="events" publicId={ctx.joinCode} />
      {/* Bandeau rayé kermesse (identité du parcours joueur). */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <EventPlayer
          sessionId={ctx.sessionId}
          joinCode={ctx.joinCode}
          organizationName={ctx.organization.name}
          organizationId={ctx.organization.id}
          logoUrl={ctx.organization.logo_url}
          title="Événement en direct"
          initial={ctx.publicState}
          hasIdentity={ctx.hasIdentity}
          realtimeEnabled={eventRealtimeEnabled()}
        />

        <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
          Événement proposé par {ctx.organization.name} · propulsé par{" "}
          <Link
            href="/?utm_source=event&utm_medium=footer"
            className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
          >
            Lastchance
          </Link>
        </footer>
      </main>
    </div>
  );
}
