import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { QueuePublicStateResult } from "@/lib/reserver";
import {
  loadReserverQueuePublicContext,
  type ReserverQueuePublicContext,
} from "@/lib/reserver-context";
import { FileAccueilExperience } from "@/components/reserver/file-accueil-experience";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * LA FILE D'ACCUEIL PUBLIQUE — on pousse la porte, on scanne, on attend son tour.
 *
 * ── CE N'EST PAS `/reserver/[activityId]`, ET LA DISTINCTION EST LE MODULE ──
 *
 * Là-bas on retient UN CRÉNEAU précis, à l'avance, depuis chez soi. Ici il n'y a
 * aucun créneau : on est DANS le magasin, maintenant, et la seule question est
 * « combien de personnes devant moi ». Deux objets, deux tables (migration
 * 20261005120000), donc deux routes — les fondre aurait demandé qu'une même URL
 * signifie tantôt l'un tantôt l'autre.
 *
 * Le segment statique `file` passe avant `[activityId]` dans le routage Next,
 * exactement comme `invitation` : une activité dont l'identifiant serait
 * littéralement « file » n'existe pas, les identifiants étant des UUID.
 *
 * ── PAS DE `loading.tsx` AU-DESSUS DE CETTE ROUTE (ADR-107) ──
 *
 * Un `loading.tsx` fait partir l'en-tête HTTP — donc le STATUT — avant la fin du
 * corps : cette page répondrait alors 200 sur une file inexistante, alors que
 * son `notFound()` dépend d'une lecture. Le groupe `(player)` n'en porte pas,
 * et `src/lib/route-boundaries.test.ts` lit le disque et jugera cette route sans
 * qu'on l'y inscrive.
 *
 * ── PAS D'`error.tsx` LOCAL NON PLUS ──
 *
 * Le groupe `(player)` en porte un pour ses dix parcours. En ajouter un ici le
 * dupliquerait, et le ferait diverger au premier ajustement.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((queueId: string) =>
  loadReserverQueuePublicContext(queueId),
);

/**
 * Le contexte de page, remis dans la forme que le SCRUTIN rendra.
 *
 * Le chargeur découpe l'état en `queue` / `waitingCount` / `maPlace` — c'est ce
 * qui convient à un rendu serveur. Le scrutin, lui, relit `queue_public_state`
 * et rend un `QueuePublicStateResult` d'un seul tenant. Sans cette remise en
 * forme, le composant porterait DEUX représentations du même état et devrait
 * les réconcilier à chaque tic : c'est exactement le genre d'écart qui finit
 * par afficher un rang d'une source et une taille de file de l'autre.
 *
 * Elle n'invente rien et ne recalcule rien — elle recopie, champ pour champ.
 */
function etatInitial(
  ctx: Extract<ReserverQueuePublicContext, { ok: true }>,
): QueuePublicStateResult {
  const place = ctx.maPlace;
  return {
    state: place ? "in_queue" : "not_in_queue",
    queueName: ctx.queue.name,
    queueStatus: ctx.queue.status,
    waitingCount: ctx.waitingCount,
    entryId: place?.entryId ?? null,
    entryStatus: place?.status ?? null,
    position: place?.position ?? null,
    joinedAt: place?.joinedAt ?? null,
    calledAt: place?.calledAt ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ queueId: string }>;
}): Promise<Metadata> {
  const { queueId } = await params;
  const ctx = await loadContext(queueId);

  // LE 404 SE DÉCIDE ICI AUSSI : le rendu du groupe `(player)` peut être
  // streamé, et le statut part alors avec l'en-tête, avant le `notFound()` du
  // corps. `loadContext` est mémoïsé : les deux appels ne coûtent qu'une lecture.
  if (!ctx.ok) notFound();

  const nom = ctx.queue.name;
  return {
    title: nom,
    description: `Prenez votre tour dans la file « ${nom} » chez ${ctx.organization.name}.`,
    // Page privée par commerce : atteignable par QR ou par lien, pas indexée.
    robots: { index: false },
    appleWebApp: { capable: true, title: nom, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function FileAccueilPage({
  params,
}: {
  params: Promise<{ queueId: string }>;
}) {
  const { queueId } = await params;
  const ctx = await loadContext(queueId);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (file inconnue, module fermé, abonnement inactif…).
  if (!ctx.ok) notFound();

  return (
    <Shell>
      <FileAccueilExperience
        queueId={ctx.queue.id}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        initial={etatInitial(ctx)}
        timeZone={ctx.timezone}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        File d&apos;accueil proposée par {ctx.organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=reserver&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page (identité du parcours joueur). */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </div>
  );
}
