import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadReserverInvitationContext } from "@/lib/reserver-context";
import { InvitationExperience } from "@/components/reserver/invitation-experience";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique d'une INVITATION PRIVÉE (RES-2, lot L5) — même famille visuelle
 * que `/reserver/[activityId]`, dont elle est la variante « règle d'accès
 * distincte » : le créneau peut être fermé au public, l'invité entre quand même,
 * dans la limite des usages du jeton.
 *
 * ── LE SEGMENT `invitation` PASSE AVANT `[activityId]` ──
 *
 * Les deux routes sont sœurs sous `/reserver`. Un segment statique l'emporte
 * toujours sur un segment dynamique de même niveau : `/reserver/invitation/xyz`
 * arrive ici, et `/reserver/<uuid>` reste sur la page d'activité. Le mot
 * `invitation` n'est pas un identifiant d'activité valide, donc rien ne se
 * chevauche dans l'autre sens.
 *
 * ── LE JETON EST UN SECRET DE CHEMIN, ET IL Y RESTE ──
 *
 * Qui détient l'URL détient la place. Deux conséquences, et les deux sont
 * tenues ici :
 *
 *  1. Le préfixe `/reserver/invitation/` est dans la liste fermée de
 *     `src/lib/masquer-jeton-url.ts` — sans quoi le jeton partirait tel quel
 *     dans `$current_url` chez PostHog et dans les breadcrumbs Sentry.
 *  2. IL N'EST PAS PASSÉ EN PROP au composant client (revue de sécurité L5).
 *     Une prop qui franchit la frontière serveur → client est sérialisée dans
 *     le payload RSC, c'est-à-dire écrite EN CLAIR dans le HTML
 *     (`self.__next_f.push`) : le secret quittait alors l'adresse pour entrer
 *     dans le CORPS de la page. `InvitationExperience` le lit de
 *     `window.location.pathname` au moment de l'envoi.
 *
 * Le `token` reste utilisé ici, côté SERVEUR uniquement, pour résoudre le
 * contexte : cette valeur-là ne traverse rien.
 *
 * ── PAS DE `loading.tsx`, PAS D'`error.tsx` LOCAL (ADR-107) ──
 *
 * Mêmes raisons que la page d'activité : un `loading.tsx` ferait partir le
 * statut avant le corps, et un jeton inconnu répondrait 200. La garde d'erreur
 * du groupe `(player)` couvre déjà les onze parcours.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((token: string) =>
  loadReserverInvitationContext(token),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const ctx = await loadContext(token);

  // LE 404 SE DÉCIDE ICI AUSSI : le rendu du groupe `(player)` peut être streamé,
  // et le statut part alors avec l'en-tête, avant le `notFound()` du corps.
  if (!ctx.ok) notFound();

  return {
    title: ctx.activity.name,
    // AUCUNE description, et surtout aucun libellé d'invitation : les
    // métadonnées voyagent dans les aperçus de messagerie, où le destinataire
    // n'est pas forcément celui à qui le lien était destiné.
    robots: { index: false },
    appleWebApp: {
      capable: true,
      title: ctx.activity.name,
      statusBarStyle: "default",
    },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadContext(token);

  // RÉPONSE GÉNÉRIQUE UNIQUE. Jeton inconnu, révoqué, clos, expiré, épuisé, d'un
  // autre commerce, créneau en brouillon ou passé, activité coupée, droit
  // `vitrine` retiré : la même. Distinguer donnerait à qui tape des jetons au
  // hasard un oracle sur ce qui a existé.
  if (!ctx.ok) notFound();

  return (
    <Shell>
      {/* AUCUNE prop `token`, et c'est le correctif de la revue L5 : une prop
          passée à un composant CLIENT est sérialisée dans le payload RSC, donc
          recopiée en clair dans le HTML. Le composant lit l'adresse au moment
          de l'envoi — voir l'en-tête d'`invitation-experience.tsx`. */}
      <InvitationExperience
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        activityName={ctx.activity.name}
        activityDescription={ctx.activity.description}
        invitationLabel={ctx.invitation.label}
        creneaux={ctx.slots}
        mesReservations={ctx.mesReservations}
        timeZone={ctx.timezone}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Invitation proposée par {ctx.organization.name} · propulsé par{" "}
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
