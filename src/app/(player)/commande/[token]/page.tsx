import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrderCodeContext } from "@/lib/loyalty-context";
import { TamponCommande } from "@/components/loyalty/tampon-commande";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique du QR DE COMMANDE UNIQUE (cahier §7) — DA « Kermesse », même
 * famille visuelle que la chasse au trésor et le passeport. Le client la
 * découvre en scannant la carte glissée dans son colis.
 *
 * Rendu dynamique : le contenu dépend de l'état du jeton (déjà servi ou non).
 * LE TAMPON N'EST PAS POSÉ AU CHARGEMENT — le jeton est à usage unique, un
 * préchargement de lien le brûlerait sans que le client n'ait rien demandé. Il
 * part au POST du bouton (voir `TamponCommande`).
 *
 * Réponse générique unique (404) sur tout jeton qui ne désigne rien : aucun
 * oracle sur le motif (jeton inventé, programme fermé, module coupé,
 * organisation d'un autre commerçant).
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((token: string) => loadOrderCodeContext(token));

/**
 * LE 404 SE DÉCIDE ICI, ET PAS SEULEMENT DANS LE CORPS.
 *
 * Depuis que le groupe `(player)` porte un `loading.tsx`, le rendu est STREAMÉ :
 * Next envoie l'en-tête HTTP — donc le STATUT — dès que la coquille est prête,
 * et le `notFound()` du corps n'arrive que dans un chunk ultérieur. Une
 * ressource inconnue rendait alors **200** avec un digest 404 dans le flux :
 * juste à l'œil, faux pour tout ce qui lit un statut — moteurs, sondes, tests.
 * `generateMetadata` s'exécute AVANT le premier octet ; c'est le dernier
 * endroit où le statut est encore négociable. Le `notFound()` du corps reste
 * en filet, et `loadContext` est mémoïsé par `cache()` : la page relit le même
 * résultat, la requête n'est pas doublée.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const ctx = await loadContext(token);
  if (!ctx) notFound();
  return { title: "Votre commande", robots: { index: false } };
}

export default async function CommandePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadContext(token);
  if (!ctx) notFound();

  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {/* Le jeton NE DESCEND PAS en prop : une prop passée d'un composant
            serveur à un composant client est sérialisée en clair dans le
            payload RSC, donc recopiée dans le HTML. `TamponCommande` le relit
            de `window.location.pathname` au moment du POST. */}
        <TamponCommande
          programId={ctx.programId}
          programName={ctx.programName}
          organizationName={ctx.organizationName}
          logoUrl={ctx.logoUrl}
          alreadyConsumed={ctx.alreadyConsumed}
        />

        <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
          Fidélité proposée par {ctx.organizationName} · propulsé par{" "}
          <Link
            href="/?utm_source=commande&utm_medium=footer"
            className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
          >
            Lastchance
          </Link>
        </footer>
      </main>
    </div>
  );
}
