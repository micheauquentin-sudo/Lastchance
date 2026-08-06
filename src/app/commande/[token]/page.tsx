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

export const metadata: Metadata = {
  title: "Votre commande",
  robots: { index: false },
};

export default async function CommandePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadOrderCodeContext(token);
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
        <TamponCommande
          token={token}
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
