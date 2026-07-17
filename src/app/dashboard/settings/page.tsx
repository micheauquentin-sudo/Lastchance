import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPlan } from "@/lib/stripe";
import { isTrialExpired, trialDaysLeft } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import { DataRetentionForm } from "@/components/dashboard/data-retention-form";
import { LogoForm } from "@/components/dashboard/logo-form";
import { NotifyWinToggle } from "@/components/dashboard/notify-win-toggle";
import { ReengageToggle } from "@/components/dashboard/reengage-toggle";
import { WebhookForm } from "@/components/dashboard/webhook-form";
import type { SubscriptionStatus } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Réglages" };

const STATUS_LABELS: Record<SubscriptionStatus, { label: string; className: string }> = {
  trialing: { label: "Période d'essai", className: "bg-sky-100 text-sky-700" },
  active: { label: "Actif", className: "bg-emerald-100 text-emerald-700" },
  past_due: { label: "Paiement en retard", className: "bg-amber-100 text-amber-700" },
  canceled: { label: "Annulé", className: "bg-red-100 text-red-700" },
  inactive: { label: "Inactif", className: "bg-zinc-100 text-zinc-600" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const { user, organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard");
  const org = organization!;
  const admin = createAdminClient();
  const { data: webhookConfig } = await admin
    .from("organizations")
    .select("webhook_secret")
    .eq("id", org.id)
    .maybeSingle();
  const plan = getPlan(org.plan);
  const status = STATUS_LABELS[org.subscription_status];
  const hasSubscription = !!org.stripe_customer_id;
  const daysLeft = trialDaysLeft(org);
  const trialExpired = isTrialExpired(org);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Réglages</h1>

      {checkout === "success" && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Merci ! Votre abonnement est en cours d&apos;activation — le statut
          se met à jour automatiquement d&apos;ici quelques secondes.
        </div>
      )}
      {checkout === "cancel" && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Paiement annulé. Vous pouvez réessayer quand vous voulez.
        </div>
      )}

      <div className="space-y-4 max-w-lg">
        <Card>
          <h2 className="font-semibold mb-4">Établissement</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Nom</dt>
              <dd className="font-medium">{org.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Compte</dt>
              <dd className="font-medium">{user!.email}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Logo</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Affiché à vos clients au-dessus de la roue après le scan du QR
            code.
          </p>
          <LogoForm logoUrl={org.logo_url} />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Notifications</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Soyez informé en temps réel de l&apos;activité de votre jeu.
          </p>
          <NotifyWinToggle enabled={org.notify_on_win} />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Relance automatique</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Réengagez vos clients qui ne sont pas revenus jouer depuis un
            moment, sans y penser.
          </p>
          <ReengageToggle enabled={org.auto_reengage} />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Confidentialité des données</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Durée de conservation des participations et des abonnés
            désinscrits (minimisation RGPD). Purge appliquée chaque nuit.
          </p>
          <DataRetentionForm months={org.data_retention_months} />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Webhooks sortants</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Branchez votre caisse, votre CRM ou Zapier/Make sur les
            événements de votre jeu (nouveau gain réclamé, nouvel abonné
            newsletter).
          </p>
          <WebhookForm
            webhookUrl={org.webhook_url}
            webhookSecret={webhookConfig?.webhook_secret ?? ""}
          />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Abonnement</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <dl className="space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Offre</dt>
              <dd className="font-medium">
                {plan.name} — {plan.priceMonthly}€/mois
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Essai gratuit</dt>
              <dd className="font-medium">
                {org.subscription_status === "trialing"
                  ? trialExpired
                    ? "Terminé"
                    : `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`
                  : `${plan.trialDays} jours`}
              </dd>
            </div>
          </dl>
          <BillingButtons hasSubscription={hasSubscription} />
          <p className="mt-4 text-xs text-zinc-400">
            Paiement sécurisé par Stripe. Sans engagement, annulable à tout
            moment depuis le portail.
          </p>
        </Card>
      </div>
    </div>
  );
}
