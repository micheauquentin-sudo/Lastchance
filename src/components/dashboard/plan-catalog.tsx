"use client";

import { useActionState } from "react";
import { createCheckoutSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import type { PlanTierView } from "@/lib/plans";

export interface PlanCatalogEntry extends PlanTierView {
  /** Offre actuelle de l'organisation. */
  current: boolean;
  /** Montée en gamme cohérente : plus chère ET strictement plus complète. */
  upgrade: boolean;
  /** Price Stripe configuré sur cet environnement. */
  purchasable: boolean;
}

/**
 * Grille d'offres des réglages : ce que contient chaque offre, ses limites
 * et l'action possible. Deux garde-fous volontaires :
 *  - une offre sans price Stripe configuré n'ouvre PAS de checkout — elle
 *    bascule sur une demande par email, jamais sur un bouton qui échoue ;
 *  - un changement d'offre pour un abonné passe par une demande, pas par un
 *    checkout : la bascule d'un abonnement EN COURS (prorata, périmètre
 *    perdu) se décide côté Stripe, pas ici.
 *
 * Le second garde-fou porte bien sur un abonnement VIVANT, jamais sur la
 * simple existence d'un client Stripe : celui-ci est créé dès l'ouverture de
 * la page de paiement, et le confondre avec un abonnement fermait tout le
 * catalogue au premier abandon. Un abonnement résilié rouvre le checkout.
 */
export function PlanCatalog({
  tiers,
  hasLiveSubscription,
  supportEmail,
}: {
  tiers: PlanCatalogEntry[];
  hasLiveSubscription: boolean;
  supportEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCheckoutSession,
    null,
  );

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
          `Offre ${tier.name} — LastChance`,
        )}`;
        return (
          <div
            key={tier.id}
            className={`rounded-xl border px-4 py-3 ${
              tier.current
                ? "border-k-ink bg-amber-50/60"
                : "border-zinc-200"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-k-ink">{tier.name}</span>
              <span className="text-sm font-semibold text-zinc-600">
                {tier.priceLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{tier.tagline}</p>
            <p className="mt-2 text-xs text-zinc-600">
              <span className="font-semibold">Inclus :</span>{" "}
              {tier.experiences.join(" · ")}
            </p>
            {tier.limits.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                <span className="font-semibold">Limites :</span>{" "}
                {tier.limits.join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-400">
              {tier.trialDays} jours d&apos;essai inclus
            </p>

            <div className="mt-3">
              {tier.current ? (
                <span className="inline-block rounded-full bg-k-ink px-3 py-1 text-xs font-semibold text-white">
                  Votre offre
                </span>
              ) : hasLiveSubscription || !tier.purchasable ? (
                tier.upgrade || !hasLiveSubscription ? (
                  <a
                    className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                    href={mailto}
                  >
                    Demander l&apos;offre {tier.name}
                  </a>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Périmètre différent de votre offre actuelle : nous
                    consulter avant tout changement.
                  </p>
                )
              ) : (
                <form action={formAction}>
                  <input type="hidden" name="plan" value={tier.id} />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    {pending ? "Redirection…" : `Choisir ${tier.name}`}
                  </Button>
                </form>
              )}
            </div>
          </div>
        );
      })}
      <FieldError
        message={state && !state.ok ? state.error : undefined}
      />
    </div>
  );
}
