import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  etatUiPriseStock,
  RESERVER_STOCK_PER_PLAYER_DEFAUT,
} from "@/lib/reserver";
import { loadStockOfferPublicContext } from "@/lib/reserver-context";
import { OffreStockExperience } from "@/components/reserver/offre-stock-experience";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * « RÉSERVE TON OFFRE » — la page publique d'une offre de stock (RES-5, L9).
 *
 * Le client scanne le QR posé sur l'étal, bloque une part, et repart avec un
 * code `RESA-` à présenter au comptoir dans la fenêtre annoncée. Un « Drop
 * anti-gaspi » est cette même page avec une fenêtre courte : rien à distinguer
 * ici.
 *
 * ── CE N'EST PAS `/reserver/[activityId]`, ET LA DISTINCTION EST LE MODULE ──
 *
 * Là-bas on retient une PLACE à une heure donnée ; ici on retient un OBJET
 * jusqu'à une heure donnée. Deux tables (migration 20261010120000), donc deux
 * routes. Le segment statique `stock` passe avant `[activityId]` dans le routage
 * Next, comme `file` et `invitation` : les identifiants d'activité sont des
 * UUID, aucun ne vaut littéralement « stock ». L'adresse est celle que produit
 * `cheminOffreStock` — c'est elle qui part sur le QR.
 *
 * ── RENDU DYNAMIQUE, ET LE RESTANT EST HONNÊTE À CET INSTANT-LÀ ──
 *
 * Le restant bouge et l'état dépend du cookie joueur : aucune mise en cache
 * n'est possible. Aucune écriture au chargement non plus — le blocage se fait au
 * POST du bouton, seul endroit où le cookie d'identité est posé.
 *
 * ── L'INSTANT DES VERDICTS EST CELUI DU SERVEUR ──
 *
 * `etat` et `accepteePrise` sont tranchés par le chargeur ; l'état de la prise
 * et l'ouverture du retrait le sont ici, au rendu. Les laisser au client aurait
 * mis un `Date.now()` de navigateur — donc une horloge mal réglée — en face d'un
 * restant serveur, et les deux se seraient contredits sur la même carte.
 *
 * ── PAS DE `loading.tsx` AU-DESSUS DE CETTE ROUTE (ADR-107) ──
 *
 * Un `loading.tsx` fait partir l'en-tête HTTP — donc le STATUT — avant la fin du
 * corps : cette page répondrait alors 200 sur une offre inexistante, alors que
 * son `notFound()` dépend d'une lecture. `src/lib/route-boundaries.test.ts` lit
 * le disque et jugera cette route sans qu'on l'y inscrive.
 *
 * ── PAS D'`error.tsx` LOCAL NON PLUS ──
 *
 * Le groupe `(player)` en porte un pour tous ses parcours. En ajouter un ici le
 * dupliquerait, et le ferait diverger au premier ajustement.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((offerId: string) =>
  loadStockOfferPublicContext(offerId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<Metadata> {
  const { offerId } = await params;
  const ctx = await loadContext(offerId);

  // LE 404 SE DÉCIDE ICI AUSSI : le rendu du groupe `(player)` peut être streamé,
  // et le statut part alors avec l'en-tête, avant le `notFound()` du corps.
  // `loadContext` est mémoïsé : les deux appels ne coûtent qu'une lecture.
  if (!ctx.ok) notFound();

  const titre = ctx.offre.title ?? "Offre à réserver";
  return {
    title: titre,
    description: `Réservez « ${titre} » chez ${ctx.organization.name} et retirez-la au comptoir.`,
    // Page privée par commerce : atteignable par QR ou par lien, pas indexée.
    robots: { index: false },
    appleWebApp: { capable: true, title: titre, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function OffreStockPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;
  const ctx = await loadContext(offerId);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (offre inconnue, en brouillon, module fermé, abonnement inactif…).
  // `stock_offer_public_state` rend `unavailable` pour les quatre sans les
  // distinguer, et cette page n'en sait pas plus.
  if (!ctx.ok) notFound();

  // UNE OFFRE SERVIE SANS FENÊTRE N'EN EST PAS UNE. Les deux bornes sont `not
  // null` en base et le mapper les rend `string | null` uniquement parce qu'il
  // doit pouvoir décrire un document `unavailable`. Le 404 est ici la seule
  // réponse honnête : afficher « à retirer du null au null » enverrait quelqu'un
  // au comptoir sans heure.
  const { windowStartsAt, windowEndsAt } = ctx.offre;
  if (!windowStartsAt || !windowEndsAt) notFound();

  // UN SEUL INSTANT POUR LES DEUX VERDICTS. Deux `new Date()` séparés
  // ouvriraient une fenêtre — infime, mais réelle — où la prise serait déjà
  // expirée et le retrait encore annoncé comme ouvert.
  const maintenant = new Date();

  return (
    <Shell>
      <OffreStockExperience
        organizationId={ctx.organization.id}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        offre={{
          id: ctx.offre.offerId ?? offerId,
          title: ctx.offre.title ?? "",
          description: ctx.offre.description,
          windowStartsAt,
          windowEndsAt,
          perPlayerLimit:
            ctx.offre.perPlayerLimit ?? RESERVER_STOCK_PER_PLAYER_DEFAUT,
          remaining: ctx.offre.remaining,
        }}
        etat={ctx.etat}
        accepteePrise={ctx.accepteePrise}
        maPrise={ctx.offre.myHold}
        etatPrise={
          ctx.offre.myHold
            ? etatUiPriseStock(ctx.offre.myHold, maintenant)
            : null
        }
        // LA BORNE BASSE DE LA FENÊTRE, tranchée ici parce qu'elle n'existe
        // dans aucun état : `redeem_stock_hold` refuse avant `window_starts_at`,
        // et ni `etatUiPriseStock` ni le registre n'ont de mot pour « trop tôt ».
        retraitOuvert={new Date(windowStartsAt).getTime() <= maintenant.getTime()}
        timeZone={ctx.timezone}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Offre proposée par {ctx.organization.name} · propulsé par{" "}
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
