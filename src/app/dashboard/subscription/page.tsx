import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAddonLinePriceId, getPlan, isPlanPurchasable } from "@/lib/stripe";
import {
  ADDON_OFFERS,
  formatMonthlyPrice,
  getPlanTier,
  PLAN_TIERS,
  tierIncludes,
  upgradeTargetsFor,
  type AddonBilling,
} from "@/lib/plans";
import {
  billingActions,
  droitEffectifModule,
  hasCompAccess,
  hasSubscriptionAccess,
} from "@/lib/subscription";
import {
  chargerOctroisEnAttente,
  chargerOctroisVivants,
} from "@/lib/module-grants-loader";
import {
  addonAchetableEnLigne,
  paliersDisponibles,
} from "@/lib/octroi-checkout";
import { termesActivation } from "@/lib/octroi-termes";
import { getSupportEmail } from "@/lib/support";
import { formatDate } from "@/lib/utils";
import { Card, TITRE_CARTE } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import {
  SubscriptionComparisonTable,
  type ComparisonTierColumn,
} from "@/components/dashboard/subscription-comparison-table";
import {
  AchatAddon,
  DemarrerAddon,
  type RessourceAchat,
} from "@/components/dashboard/addon-purchase";
import { OptionAbonnement } from "@/components/dashboard/option-abonnement";
import type { SubscriptionStatus } from "@/types/database";

export const metadata: Metadata = { title: "Abonnement" };

const STATUS_LABELS: Record<
  SubscriptionStatus,
  { label: string; className: string }
> = {
  trialing: { label: "Actif", className: "bg-emerald-100 text-emerald-700" },
  active: { label: "Actif", className: "bg-emerald-100 text-emerald-700" },
  past_due: { label: "Paiement en retard", className: "bg-amber-100 text-amber-700" },
  canceled: { label: "Résilié", className: "bg-red-100 text-red-700" },
  inactive: { label: "Mode brouillon gratuit", className: "bg-zinc-100 text-zinc-700" },
};

const TIER_BADGES: Partial<Record<string, string>> = {
  engagement: "⭐ Plus populaire",
  full: "🚀 Tout-en-un",
};

export default async function SubscriptionPage() {
  const { organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard");
  const org = organization!;
  const now = new Date();
  const admin = createAdminClient();
  const supabase = await createClient();

  const [{ data: webhookConfig }, ouverts, enAttenteRaw, competitionsData] =
    await Promise.all([
      admin
        .from("organizations")
        .select("stripe_event_created_at")
        .eq("id", org.id)
        .maybeSingle(),
      chargerOctroisVivants(org.id, now),
      chargerOctroisEnAttente(org.id, now),
      supabase
        .from("contests")
        .select("id, name")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const competitions: RessourceAchat[] = (
    (competitionsData.data ?? []) as Array<{ id: string; name: string }>
  ).map((c) => ({ id: c.id, nom: c.name }));

  const hasActiveSub = hasSubscriptionAccess(org, now);
  const compActive = hasCompAccess(org);
  const currentPlan = getPlan(org.plan);
  const currentTier = getPlanTier(org.plan);
  const upgradeIds = new Set(upgradeTargetsFor(currentPlan.id).map((t) => t.id));

  const { hasLiveSubscription, canCheckout, canManage } = billingActions({
    stripeCustomerId: org.stripe_customer_id,
    subscriptionStatus: org.subscription_status,
    stripeEventCreatedAt: webhookConfig?.stripe_event_created_at ?? null,
    justPaid: false,
  });

  const status = compActive
    ? { label: "Accès offert", className: "bg-emerald-100 text-emerald-700" }
    : STATUS_LABELS[org.subscription_status];

  const columns: ComparisonTierColumn[] = PLAN_TIERS.map((tier) => {
    const isCurrent = hasActiveSub && tier.id === currentTier.id;
    const isAlreadyCovered =
      hasActiveSub &&
      tier.entitlements.every((e) => currentTier.entitlements.includes(e));
    return {
      id: tier.id,
      name: tier.name,
      tagline: tier.tagline,
      priceMonthly: tier.priceMonthly,
      isCurrent,
      isAlreadyCovered,
      isUpgrade: hasActiveSub && upgradeIds.has(tier.id),
      purchasable: isPlanPurchasable(tier.id),
      badge: TIER_BADGES[tier.id],
    };
  });

  const ownedEntitlements = new Set<string>(ouverts);
  if (hasActiveSub) {
    for (const ent of currentTier.entitlements) {
      ownedEntitlements.add(ent);
    }
    for (const offre of ADDON_OFFERS) {
      if (!offre.soldStandalone && droitEffectifModule(offre.entitlement, org, now)) {
        ownedEntitlements.add(offre.entitlement);
      }
    }
  }

  const enAttente = enAttenteRaw
    .map((octroi) => {
      const offre = ADDON_OFFERS.find((o) => o.entitlement === octroi.module);
      const termes = termesActivation(octroi.module, now);
      return offre && termes.ok
        ? {
            id: octroi.id,
            nom: offre.name,
            activateBy: octroi.activateBy,
            fin: formatDate(termes.termes.ends_at, org.timezone),
          }
        : null;
    })
    .filter((x) => x !== null);

  const supportEmail = getSupportEmail();

  return (
    <div className="space-y-8">
      <PageHeader
        surtitre="Gestion"
        titre="Abonnement"
        sousTitre="Comparez les formules, passez à un forfait supérieur ou ajoutez des options à la carte."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className={TITRE_CARTE}>
                {hasActiveSub
                  ? `${currentPlan.name} — ${formatMonthlyPrice(currentPlan)}`
                  : "Aucun abonnement actif"}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {hasActiveSub
                ? "Vos formules et options déjà incluses sont grisées ci-dessous. Les forfaits supérieurs et options disponibles restent en couleur."
                : ouverts.length > 0
                  ? "Vous utilisez actuellement des options à la carte. Vos options actives sont grisées ci-dessous ; les abonnements et autres options restent disponibles."
                  : "Votre compte est en mode brouillon gratuit. Choisissez une formule ou une option à la carte pour publier vos animations."}
            </p>
          </div>
          <BillingButtons canCheckout={canCheckout} canManage={canManage} />
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-k-ink">
            Comparatif des formules
          </h2>
          <p className="text-sm text-zinc-500">
            0 % commission, scans illimités et sans engagement sur toutes les formules.
          </p>
        </div>

        <SubscriptionComparisonTable
          tiers={columns}
          ownedEntitlements={[...ownedEntitlements]}
          hasLiveSubscription={hasLiveSubscription}
          supportEmail={supportEmail}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-k-ink">
            Options &amp; Pass à la carte
          </h2>
          <p className="text-sm text-zinc-500">
            Complétez votre formule ou activez un module seul sans abonnement. Les options déjà actives dans votre compte sont grisées.
          </p>
        </div>

        {enAttente.length > 0 && (
          <Card>
            <h3 className="mb-1 font-semibold">Pass payés prêts à démarrer</h3>
            <p className="mb-4 text-sm text-zinc-600">
              Activez votre pass au moment où vous êtes prêt à lancer votre animation.
            </p>
            <ul className="space-y-4">
              {enAttente.map((pass) => (
                <li key={pass.id}>
                  <DemarrerAddon
                    grantId={pass.id}
                    nom={pass.nom}
                    finSiDemarreMaintenant={pass.fin}
                  />
                  {pass.activateBy && (
                    <p className="mt-1 text-xs text-zinc-600">
                      À démarrer avant le {formatDate(pass.activateBy, org.timezone)}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ADDON_OFFERS.map((offre) => {
            const compris =
              hasActiveSub && tierIncludes(currentTier, offre.entitlement);
            const ouvert =
              (ouverts as readonly string[]).includes(offre.entitlement) ||
              (!offre.soldStandalone &&
                !compris &&
                droitEffectifModule(offre.entitlement, org, now));
            const optionLigneGerable =
              !compris &&
              !offre.soldStandalone &&
              Boolean(getAddonLinePriceId(offre.entitlement));
            const dejaActif = compris || ouvert;
            const achetable = addonAchetableEnLigne(offre.entitlement);
            const paliers =
              offre.billing.model === "capacity-pass"
                ? paliersDisponibles(offre.entitlement)
                : undefined;
            const ressources =
              offre.billing.model === "single-competition"
                ? competitions
                : undefined;

            return (
              <Card
                key={offre.entitlement}
                className={
                  dejaActif && !optionLigneGerable
                    ? "border-zinc-200 bg-zinc-50/80 opacity-60"
                    : "border-amber-300 bg-white shadow-sm"
                }
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className={TITRE_CARTE}>{offre.name}</h3>
                  {compris ? (
                    <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">
                      ✓ Inclus dans votre formule
                    </span>
                  ) : ouvert ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      ✓ Déjà actif
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                      {formulerTarifCourt(offre.billing)}
                    </span>
                  )}
                </div>

                {!dejaActif && (
                  <ul className="mb-4 space-y-1 text-xs text-zinc-600">
                    {offre.rules.map((regle) => (
                      <li key={regle}>• {regle}</li>
                    ))}
                  </ul>
                )}

                {compris ? (
                  <p className="rounded-xl bg-zinc-100 px-3.5 py-2.5 text-xs font-medium text-zinc-600">
                    Ce module est déjà inclus dans votre abonnement actuel.
                  </p>
                ) : !offre.soldStandalone ? (
                  getAddonLinePriceId(offre.entitlement) ? (
                    <OptionAbonnement
                      entitlement={offre.entitlement}
                      nom={offre.name}
                      prixMensuel={prixAffiche(offre.billing) ?? 0}
                      active={ouvert}
                    />
                  ) : (
                    <p className="rounded-xl bg-zinc-100 px-3.5 py-2.5 text-xs text-zinc-600">
                      Option disponible sur demande par email.
                    </p>
                  )
                ) : ouvert ? (
                  <p className="rounded-xl bg-zinc-100 px-3.5 py-2.5 text-xs font-medium text-zinc-600">
                    Vous disposez déjà de cette option sur votre compte.
                  </p>
                ) : achetable ? (
                  <AchatAddon
                    entitlement={offre.entitlement}
                    price={prixAffiche(offre.billing)}
                    paliers={paliers}
                    ressources={ressources}
                    libelleRessource="la compétition"
                  />
                ) : (
                  <p className="rounded-xl bg-zinc-100 px-3.5 py-2.5 text-xs text-zinc-600">
                    Option disponible sur demande par email.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formulerTarifCourt(billing: AddonBilling): string {
  switch (billing.model) {
    case "recurring-monthly":
      return `${billing.priceMonthly} € / mois`;
    case "one-off-window":
      return `${billing.price} € · ${billing.activeDays} jours`;
    case "single-competition":
      return `${billing.price} € / compétition`;
    case "capacity-pass":
      return billing.steps.map((s) => `${s.price} €`).join(" · ");
  }
}

function prixAffiche(billing: AddonBilling): number | undefined {
  switch (billing.model) {
    case "recurring-monthly":
      return billing.priceMonthly;
    case "one-off-window":
    case "single-competition":
      return billing.price;
    case "capacity-pass":
      return undefined;
  }
}
