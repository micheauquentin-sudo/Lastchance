import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadReserverPublicContext } from "@/lib/reserver-context";
import { ReserverExperience } from "@/components/reserver/reserver-experience";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique de réservation d'une activité — DA « Kermesse », même famille
 * visuelle que le jackpot collectif et le passeport de fidélité. Le client
 * arrive en scannant le QR du commerce, choisit un créneau, et repart avec un
 * code court à donner au comptoir.
 *
 * Rendu dynamique : les places restantes bougent, et l'état dépend du cookie
 * joueur. Aucune écriture au chargement — la réservation se fait au POST du
 * bouton, seul endroit où le cookie d'identité est posé.
 *
 * ── PAS DE `loading.tsx` AU-DESSUS DE CETTE ROUTE (ADR-107) ──
 *
 * Un `loading.tsx` fait partir l'en-tête HTTP — donc le STATUT — avant la fin
 * du corps : une page dont le `notFound()` dépend d'une lecture répondrait
 * alors 200 sur une activité inexistante. `/jackpot/[id]` n'en a pas, pour
 * exactement cette raison ; celle-ci non plus. `src/lib/route-boundaries.test.ts`
 * lit le disque et jugera cette route sans qu'on l'y inscrive.
 *
 * ── PAS D'`error.tsx` LOCAL NON PLUS ──
 *
 * Le groupe `(player)` ne consomme aucun segment d'URL : sa garde d'erreur est
 * posée une fois et couvre les dix parcours. En ajouter une ici la
 * dupliquerait, et la ferait diverger au premier ajustement.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((activityId: string) =>
  loadReserverPublicContext(activityId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ activityId: string }>;
}): Promise<Metadata> {
  const { activityId } = await params;
  const ctx = await loadContext(activityId);

  // LE 404 SE DÉCIDE ICI AUSSI, ET PAS SEULEMENT DANS LE CORPS : le rendu du
  // groupe `(player)` peut être streamé, et le statut part alors avec l'en-tête,
  // avant le `notFound()` du corps. `loadContext` est mémoïsé par `cache()` :
  // les deux appels ne coûtent qu'une lecture.
  if (!ctx.ok) notFound();

  const nom = ctx.activity.name;
  return {
    title: nom,
    description: `Réservez votre place pour « ${nom} » chez ${ctx.organization.name}.`,
    // Page privée par commerce : atteignable par QR ou par lien, pas indexée.
    robots: { index: false },
    appleWebApp: { capable: true, title: nom, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function ReserverPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  const ctx = await loadContext(activityId);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (activité inconnue, coupée, module fermé, abonnement inactif…).
  if (!ctx.ok) notFound();

  return (
    <Shell>
      <ReserverExperience
        organizationId={ctx.organization.id}
        activityName={ctx.activity.name}
        description={ctx.activity.description}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        creneaux={ctx.slots}
        mesReservations={ctx.mesReservations}
        maFile={ctx.maFile}
        timeZone={ctx.timezone}
        // Le Mode Attente active (RES-4) : la session rattachée à la
        // réservation confirmée de ce navigateur, ou `null`.
        attente={ctx.attente}
        // LES EXPÉRIENCES SIGNATURE (RES-5). Le format décide de ce que la page
        // RACONTE — promesse, durée, étapes, préparation, unité de réservation —
        // jamais de ce qu'elle peut faire : la mécanique est la même pour les
        // trois, et `standard` rend exactement l'écran d'avant ce lot.
        kind={ctx.activity.kind}
        promise={ctx.activity.promise}
        durationMinutes={ctx.activity.durationMinutes}
        steps={ctx.activity.steps}
        preparation={ctx.activity.preparation}
        // L'ADRESSE EXIGÉE EN RENDEZ-VOUS (RDV-4). La règle vient du contexte,
        // donc de `booking_mode` : un Moment se prend sans rien laisser, un
        // rendez-vous nommé sans moyen de joindre le client est ingérable.
        emailObligatoire={ctx.emailObligatoire}
        // COMMENT ON RÉSERVE (RDV-8) — une place dans une jauge, ou une TABLE.
        //
        // Le mode vient du CONTEXTE, et non d'`emailObligatoire`. Les deux
        // valent aujourd'hui la même chose, et c'est précisément le piège :
        // l'adresse est exigée PARCE QUE le rendez-vous la demande, jamais
        // l'inverse. Le jour où un Moment l'exigerait à son tour, toute la
        // salle — sélecteur d'effectif, liste d'attente par tablée — se serait
        // affichée sur un atelier de poterie.
        bookingMode={ctx.bookingMode}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Réservation proposée par {ctx.organization.name} · propulsé par{" "}
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
