import { getPlanTier } from "@/lib/plans";
import { formatDate } from "@/lib/utils";
import type { MerchantDetail, MerchantRow } from "@/lib/admin/data";
import { Badge, Panel } from "@/components/admin/ui";

const ENTITLEMENT_LABELS = {
  core: "Socle LastChance",
  vitrine: "Vitrine",
  reserver: "Réserver",
  duo: "Duo Miroir",
  bande: "Portrait de la Bande",
} as const;

function formatAmount(cents: number | null, currency: string | null): string {
  if (cents == null || !currency) return "Montant non synchronisé";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function sourceLabel(source: "stripe" | "grant" | "legacy"): string {
  switch (source) {
    case "stripe":
      return "Stripe";
    case "grant":
      return "Octroi daté";
    case "legacy":
      return "Accès historique";
  }
}

/** Résumé compact utilisable dans les listes sans exposer d'identifiants Stripe. */
export function MerchantBillingSummary({
  billing,
}: {
  billing: NonNullable<MerchantRow["billing"]>;
}) {
  if (billing.mrrMonthlyCents == null) {
    return <span className="text-xs text-amber-300">Facturation à resynchroniser</span>;
  }

  const parts: string[] = [];
  if (billing.activeSubscriptionCount > 0) {
    parts.push(`${billing.activeSubscriptionCount} abonnement${billing.activeSubscriptionCount > 1 ? "s" : ""}`);
  }
  if (billing.recurringItemCount > 0) {
    parts.push(`${billing.recurringItemCount} ligne${billing.recurringItemCount > 1 ? "s" : ""} récurrente${billing.recurringItemCount > 1 ? "s" : ""}`);
  }

  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-zinc-200">
        {formatAmount(billing.mrrMonthlyCents, "EUR")} / mois
      </p>
      {parts.length > 0 && <p className="text-zinc-500">{parts.join(" · ")}</p>}
      {billing.cancelAtPeriodEnd && <p className="text-amber-300">Fin programmée</p>}
    </div>
  );
}

/**
 * Projection strictement informative : l'autorité des lignes est Stripe.
 * Aucune action ou bascule n'est proposée ici, en particulier pour Vitrine,
 * Réserver, Duo Miroir et Portrait de la Bande.
 */
export function MerchantBillingAndRights({
  org,
  subscriptions,
  entitlements,
  moduleGrants,
}: Pick<MerchantDetail, "org" | "subscriptions" | "entitlements" | "moduleGrants">) {
  const plan = getPlanTier(org.plan);
  const liveGrants = moduleGrants.filter((grant) => !grant.revoked_at);

  return (
    <Panel className="mt-6 p-5">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white">Abonnement et droits</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Lecture seule. Stripe fait foi pour la facturation ; les octrois restent tracés séparément.
        </p>
      </div>

      <section aria-labelledby="plan-inclusions">
        <h3 id="plan-inclusions" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Inclusions du plan · {plan.name}
        </h3>
        <p className="mt-2 text-sm text-zinc-200">{plan.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.entitlements.map((entitlement) => (
            <Badge key={entitlement} tone="violet">
              {ENTITLEMENT_LABELS[entitlement as keyof typeof ENTITLEMENT_LABELS] ?? entitlement}
            </Badge>
          ))}
        </div>
      </section>

      <section aria-labelledby="stripe-items" className="mt-6 border-t border-white/10 pt-5">
        <h3 id="stripe-items" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Lignes Stripe
        </h3>
        {subscriptions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Aucun abonnement Stripe synchronisé.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {subscriptions.map((subscription) => (
              <div key={subscription.subscription_id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">Abonnement {subscription.stripe_status}</p>
                  {subscription.cancel_at_period_end && <Badge tone="amber">Fin programmée</Badge>}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Prochaine échéance : {subscription.next_billing_at ? formatDate(subscription.next_billing_at) : "non disponible"}
                </p>
                <ul className="mt-3 divide-y divide-white/5 border-t border-white/5 text-sm">
                  {subscription.items.map((item) => (
                    <li key={item.item_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-zinc-200">{item.price_nickname ?? "Ligne Stripe sans libellé"}</span>
                      <span className="text-zinc-400">
                        {formatAmount(item.monthly_amount_cents ?? item.unit_amount_cents, item.currency)}
                        {item.recurring_interval && ` / ${item.recurring_interval === "month" ? "mois" : item.recurring_interval}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="effective-rights" className="mt-6 border-t border-white/10 pt-5">
        <h3 id="effective-rights" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Droits Vitrine et salons
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          {entitlements.map((entitlement) => (
            <li key={entitlement.entitlement} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-200">{ENTITLEMENT_LABELS[entitlement.entitlement]}</span>
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge tone={entitlement.active ? "emerald" : "default"}>{entitlement.active ? "Actif" : "Inactif"}</Badge>
                {entitlement.sources.map((source) => <Badge key={source}>{sourceLabel(source)}</Badge>)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="grants" className="mt-6 border-t border-white/10 pt-5">
        <h3 id="grants" className="text-xs font-medium uppercase tracking-wide text-zinc-500">Octrois datés</h3>
        {liveGrants.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Aucun octroi actif.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {liveGrants.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{grant.module}</span>
                <span className="text-xs text-zinc-500">
                  {grant.ends_at ? `Jusqu’au ${formatDate(grant.ends_at)}` : "Sans échéance"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {org.comp_access && (
          <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            Accès offert {org.comp_access_until ? `jusqu’au ${formatDate(org.comp_access_until)}` : "sans échéance"}.
          </p>
        )}
      </section>
    </Panel>
  );
}
