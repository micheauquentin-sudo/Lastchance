"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { createCheckoutSession } from "@/actions/billing";
import { AchatAddon, type RessourceAchat } from "@/components/dashboard/addon-purchase";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { buildPublishOffers } from "@/lib/publish-offers";
import type { Entitlement } from "@/platform/experiences/contract";

function PlanCheckoutButton({
  planId,
  label,
  variant = "primary",
}: {
  planId: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, action, pending] = useActionState(createCheckoutSession, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="plan" value={planId} />
      <Button type="submit" variant={variant} disabled={pending} className="w-full">
        {pending ? "Redirection vers Stripe…" : label}
      </Button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/**
 * Modale contextuelle ouverte lorsqu'un commerçant tente de publier ou
 * d'activer un module sans droit actif.
 *
 * Ne montre que 2 à 3 choix ciblés (l'add-on seul s'il existe, l'abonnement
 * le moins cher qui inclut le module, et La Totale) pour éviter toute
 * paralysie du choix.
 */
export function PublishPaywallModal({
  open,
  onClose,
  entitlement,
  peutAcheter,
  ressource,
}: {
  open: boolean;
  onClose: () => void;
  entitlement: Entitlement;
  peutAcheter: boolean;
  /** Pour les pass bornés à une ressource (ex: Saison de pronostics). */
  ressource?: RessourceAchat;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const offers = buildPublishOffers(entitlement);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-k-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-paywall-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border-2 border-k-ink bg-k-bg p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-block rounded-full border border-k-ink bg-k-yellow px-3 py-0.5 text-xs font-black uppercase tracking-wide text-k-ink">
              Publication payante
            </span>
            <h2
              id="publish-paywall-title"
              className="mt-2 text-xl font-black text-k-ink"
            >
              Publier « {offers.moduleLabel} »
            </h2>
            <p className="mt-1 text-sm font-semibold text-k-body">
              Votre brouillon est prêt et conservé gratuitement. Choisissez une
              formule pour le mettre en ligne et activer le scan client.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        {!peutAcheter && (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-k-ink/40 bg-white p-4 text-sm font-semibold text-k-ink">
            Seul le propriétaire du compte peut souscrire une offre. Demandez-lui
            d&apos;activer l&apos;une des formules ci-dessous depuis son espace.
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {offers.standaloneAddon && (
            <div className="flex flex-col justify-between rounded-2xl border-2 border-k-ink bg-white p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-k-orange-text">
                  À la carte
                </p>
                <h3 className="mt-1 text-base font-black text-k-ink">
                  {offers.standaloneAddon.offer.name}
                </h3>
                <p className="mt-1 text-sm font-extrabold text-k-ink">
                  {offers.standaloneAddon.priceLabel}
                </p>
                <p className="mt-2 text-xs font-semibold text-k-body">
                  {offers.standaloneAddon.offer.rules[0]}
                </p>
              </div>
              {peutAcheter && (
                <div className="mt-4">
                  <AchatAddon
                    entitlement={offers.standaloneAddon.offer.entitlement}
                    price={
                      "price" in offers.standaloneAddon.offer.billing
                        ? offers.standaloneAddon.offer.billing.price
                        : "priceMonthly" in offers.standaloneAddon.offer.billing
                          ? offers.standaloneAddon.offer.billing.priceMonthly
                          : undefined
                    }
                    paliers={
                      offers.standaloneAddon.offer.billing.model === "capacity-pass"
                        ? offers.standaloneAddon.offer.billing.steps
                        : undefined
                    }
                    ressources={ressource ? [ressource] : undefined}
                    libelleRessource={ressource ? "cette compétition" : undefined}
                  />
                </div>
              )}
            </div>
          )}

          {offers.cheapestTier && (
            <div className="flex flex-col justify-between rounded-2xl border-2 border-k-ink bg-white p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-k-orange-text">
                  Offre incluse
                </p>
                <h3 className="mt-1 text-base font-black text-k-ink">
                  {offers.cheapestTier.tier.name}
                </h3>
                <p className="mt-1 text-lg font-black text-k-ink">
                  {offers.cheapestTier.priceLabel}
                </p>
                <p className="mt-2 text-xs font-semibold text-k-body">
                  {offers.cheapestTier.tier.tagline}
                </p>
              </div>
              {peutAcheter && (
                <div className="mt-4">
                  <PlanCheckoutButton
                    planId={offers.cheapestTier.tier.id}
                    label={`Choisir ${offers.cheapestTier.tier.name}`}
                    variant={offers.standaloneAddon ? "secondary" : "primary"}
                  />
                </div>
              )}
            </div>
          )}

          {offers.fullTier && (
            <div className="flex flex-col justify-between rounded-2xl border-2 border-k-ink bg-k-yellow/25 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-k-ink">
                  Tout débloquer
                </p>
                <h3 className="mt-1 text-base font-black text-k-ink">
                  {offers.fullTier.tier.name}
                </h3>
                <p className="mt-1 text-lg font-black text-k-ink">
                  {offers.fullTier.priceLabel}
                </p>
                <p className="mt-2 text-xs font-semibold text-k-body">
                  {offers.fullTier.tier.tagline}
                </p>
              </div>
              {peutAcheter && (
                <div className="mt-4">
                  <PlanCheckoutButton
                    planId={offers.fullTier.tier.id}
                    label="Choisir La Totale"
                    variant="primary"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {offers.subscriptionLineAddon && (
          <p className="mt-4 rounded-xl bg-white/80 px-4 py-2.5 text-xs font-semibold text-k-body">
            Vous avez déjà un abonnement actif ? Vous pouvez aussi ajouter{" "}
            <strong>{offers.subscriptionLineAddon.offer.name}</strong> (
            {offers.subscriptionLineAddon.priceLabel}) en option depuis vos{" "}
            <Link href="/dashboard/settings#subscription" className="underline font-bold text-k-ink">
              réglages d&apos;abonnement
            </Link>
            .
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-k-ink/15 pt-4 text-xs font-semibold text-k-body">
          <span>Sans engagement, résiliable à tout moment depuis vos réglages.</span>
          <Link
            href="/dashboard/settings#subscription"
            className="font-black text-k-ink underline underline-offset-2"
          >
            Comparer toutes les offres
          </Link>
        </div>
      </div>
    </div>
  );
}
