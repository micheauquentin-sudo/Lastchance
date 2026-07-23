import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEventPublicContext } from "@/lib/event-context";
import { EventPlayer } from "@/components/event/event-player";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page joueur (téléphone) du Mode événement en direct — parcours QR en boutique,
 * pensé petit écran d'abord. Saisie pseudo + avatar puis suivi des phases par
 * polling. Rendu dynamique (l'état évolue, dépend du cookie joueur) ; aucune
 * écriture au chargement (le join se fait au POST du bouton).
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((code: string) => loadEventPublicContext(code));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const ctx = await loadContext(code);
  if (!ctx.ok) return { title: "Événement", robots: { index: false } };
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

  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
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
          logoUrl={ctx.organization.logo_url}
          title="Événement en direct"
          initial={ctx.publicState}
          hasIdentity={ctx.hasIdentity}
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
