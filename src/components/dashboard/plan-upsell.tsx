import Link from "next/link";
import { cheapestTierFor, formatMonthlyPrice } from "@/lib/plans";
import { getSupportEmail } from "@/lib/support";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * Encart d'offre affiché à la place d'un module non activé. Le nom et le
 * prix de l'offre viennent du catalogue (`@/lib/plans`) : les sept pages
 * qui l'utilisent ne recopient plus de tarif, et un changement de packaging
 * se répercute partout d'un coup.
 *
 * Composant serveur (aucune interaction) : la souscription elle-même se
 * fait dans les réglages, seule surface où le propriétaire gère l'argent.
 */
export function PlanUpsell({
  entitlement,
  canManageBilling,
  children,
}: {
  entitlement: Entitlement;
  canManageBilling: boolean;
  children: React.ReactNode;
}) {
  const tier = cheapestTierFor(entitlement);
  const supportEmail = getSupportEmail();

  return (
    <>
      <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 mb-3">
        <p className="text-sm font-bold text-k-ink">
          {tier
            ? `Inclus dans l'offre ${tier.name} — ${formatMonthlyPrice(tier)}`
            : "Option à activer sur votre abonnement"}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">{children}</p>
      </div>
      {canManageBilling ? (
        <Link
          href="/dashboard/settings#subscription"
          className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          Voir les offres
        </Link>
      ) : (
        <p className="text-sm text-zinc-500">
          Demandez au propriétaire du compte d&apos;activer cette offre, ou
          écrivez-nous à{" "}
          <a className="underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      )}
    </>
  );
}
