import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPlan, isPlanPurchasable } from "@/lib/stripe";
import {
  describeTier,
  formatMonthlyPrice,
  getPlanTier,
  PLAN_TIERS,
  upgradeTargetsFor,
} from "@/lib/plans";
import { getSupportEmail } from "@/lib/support";
import {
  billingActions,
  hasCompAccess,
  isTrialExpired,
  trialDaysLeft,
  trialLine,
} from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card, TITRE_CARTE } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BillingButtons } from "@/components/dashboard/billing-buttons";
import { PlanCatalog } from "@/components/dashboard/plan-catalog";
import { DataRetentionForm } from "@/components/dashboard/data-retention-form";
import { LogoForm } from "@/components/dashboard/logo-form";
import { SocialLinksForm } from "@/components/dashboard/social-links-form";
import { NotifyWinToggle } from "@/components/dashboard/notify-win-toggle";
import { WeeklyDigestToggle } from "@/components/dashboard/weekly-digest-toggle";
import { ReengageToggle } from "@/components/dashboard/reengage-toggle";
import { WebhookForm } from "@/components/dashboard/webhook-form";
import type { SubscriptionStatus } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { TimezoneForm } from "@/components/dashboard/timezone-form";

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
  searchParams: Promise<{ checkout?: string; sms_credits?: string }>;
}) {
  const { checkout, sms_credits: smsCredits } = await searchParams;
  const { user, organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard");
  const org = organization!;
  const admin = createAdminClient();
  const [{ data: webhookConfig }, { count: failedWebhooks }] = await Promise.all([
    admin
      .from("organizations")
      // `stripe_event_created_at` n'est pas dans le grant de colonnes accordé
      // à `authenticated` (00017) : elle ne se lit que par ce client
      // service_role, déjà présent pour le secret de webhook.
      // `weekly_digest` est lue ici et non via `getUserAndOrg` : cette page est
      // le seul écran qui s'en sert, et le client service_role est déjà en
      // main. Une colonne de plus dans le `select` du layout serait payée par
      // tout le dashboard pour un unique interrupteur. Même raison pour les
      // trois liens sociaux : cet écran est le seul à les éditer.
      .select(
        "webhook_secret, stripe_event_created_at, weekly_digest, google_review_url, instagram_url, tiktok_url",
      )
      .eq("id", org.id)
      .maybeSingle(),
    // Livraisons en dead-letter (tentatives épuisées) : rejouables.
    admin
      .from("webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .not("failed_at", "is", null)
      .is("delivered_at", null),
  ]);
  const plan = getPlan(org.plan);
  const compActive = hasCompAccess(org);
  // Accès offert : prime sur l'affichage du statut Stripe (badge et détail).
  const status = compActive
    ? { label: "Accès offert", className: "bg-emerald-100 text-emerald-700" }
    : STATUS_LABELS[org.subscription_status];
  // Un client Stripe existe dès l'OUVERTURE du Checkout, pas à l'encaissement :
  // le prédicat porte sur l'abonnement réellement annoncé par Stripe.
  const { hasLiveSubscription, canCheckout, canManage } = billingActions({
    stripeCustomerId: org.stripe_customer_id,
    subscriptionStatus: org.subscription_status,
    stripeEventCreatedAt: webhookConfig?.stripe_event_created_at ?? null,
    // Stripe renvoie ici AVANT que son webhook n'ait écrit
    // `stripe_event_created_at` : sans ce drapeau, le bandeau « votre
    // abonnement est en cours d'activation » cohabiterait avec un bouton
    // « Démarrer mon abonnement », et un commerçant pressé paierait deux fois.
    justPaid: checkout === "success",
  });
  const daysLeft = trialDaysLeft(org);
  // Même discriminant que le bandeau du layout : après le passage du cron
  // `expire-trials`, un essai jamais converti porte `canceled`. Ici la colonne
  // est déjà en main (elle a été lue pour `billingActions`), aucune requête de
  // plus n'est nécessaire.
  const trialExpired = isTrialExpired({
    ...org,
    ever_subscribed: webhookConfig?.stripe_event_created_at != null,
  });
  const ligneEssai = trialLine({
    status: org.subscription_status,
    trialExpired,
    daysLeft,
    trialDays: plan.trialDays,
  });
  const compUntil = org.comp_access_until
    ? new Date(org.comp_access_until)
    : null;
  // Catalogue d'offres : périmètre et limites viennent de @/lib/plans, la
  // souscriptibilité du price Stripe configuré sur cet environnement.
  const upgradeIds = new Set(upgradeTargetsFor(plan.id).map((tier) => tier.id));
  const planCatalog = PLAN_TIERS.map((tier) => ({
    ...describeTier(tier),
    current: tier.id === plan.id,
    upgrade: upgradeIds.has(tier.id),
    purchasable: isPlanPurchasable(tier.id),
  }));
  const supportEmail = getSupportEmail();

  return (
    <div>
      <PageHeader
        surtitre="Gestion"
        titre="Réglages"
        sousTitre="Votre établissement, vos notifications, vos automatisations et votre abonnement."
      />

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
      {/* Le retour de Stripe après un achat de crédits SMS atterrit ICI et non
          sur l'écran SMS : les deux URL de retour sont fixées dans
          `createSmsCreditCheckoutSession`. Le message pointe donc l'écran où
          le solde se lit, plutôt que d'annoncer un chiffre absent de cette
          page.

          CE BANDEAU NE PROMET PAS UN SOLDE DÉJÀ CRÉDITÉ, et ce n'est pas une
          précaution de style : depuis que le webhook traite
          `async_payment_succeeded`, un moyen de paiement différé (prélèvement,
          virement) n'est confirmé par Stripe que deux à cinq jours plus tard.
          Le commerçant revient ici AVANT l'encaissement. Annoncer « vos crédits
          sont ajoutés » le ferait cliquer sur un solde inchangé et conclure à
          une panne — puis repayer. */}
      {smsCredits === "success" && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Merci ! Vos crédits SMS seront ajoutés dès que Stripe confirme
          l&apos;encaissement : immédiatement par carte, deux à cinq jours par
          prélèvement ou virement. Vous n&apos;avez rien à refaire —{" "}
          <Link href="/dashboard/settings/sms" className="font-semibold underline">
            suivre mon solde
          </Link>
          .
        </div>
      )}
      {smsCredits === "cancel" && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Achat de crédits SMS annulé. Vous pouvez réessayer quand vous voulez.
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
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
          <div className="mt-5 border-t border-zinc-100 pt-5">
            <TimezoneForm timezone={org.timezone} />
            <p className="mt-2 text-xs text-k-muted">
              Utilisé pour les créneaux des roues et les limites quotidiennes.
            </p>
          </div>
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
          <h2 className="font-semibold mb-1">Notez-nous, suivez-nous</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Ces liens peuvent être proposés à vos clients juste avant leur
            partie — à activer jeu par jeu, dans « Avant de jouer » sur la page
            du jeu concerné.
          </p>
          <SocialLinksForm
            googleReviewUrl={webhookConfig?.google_review_url ?? ""}
            instagramUrl={webhookConfig?.instagram_url ?? ""}
            tiktokUrl={webhookConfig?.tiktok_url ?? ""}
          />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Notifications</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Soyez informé en temps réel de l&apos;activité de votre jeu.
          </p>
          <NotifyWinToggle enabled={org.notify_on_win} />

          {/* L'ANCRE DU LIEN DE DÉSABONNEMENT. Chaque rapport du lundi pointe
              vers `/dashboard/settings#weekly-digest` (voir `weekly-digest.ts`).
              Sans cet `id`, le lien mène à un écran sans interrupteur — et un
              hebdomadaire sans issue finit en signalement de spam, qui coûte la
              délivrabilité de tous les e-mails du domaine, codes de gain
              compris. `scroll-mt-6` pour que l'interrupteur ne se colle pas au
              bord haut après le saut.

              CE RÉGLAGE EST RÉSERVÉ AU PROPRIÉTAIRE, comme son action
              `updateWeeklyDigest`. La garde n'est pas ici mais en tête de page
              (`if (role !== "owner") redirect(…)`), qui couvre déjà tout
              l'écran : un éditeur ne voit donc jamais un interrupteur qui lui
              rendrait une erreur. Même principe que `peutGererAbonnement` dans
              le layout — on ne montre pas un contrôle à qui ne peut pas s'en
              servir. */}
          <div
            id="weekly-digest"
            className="mt-5 scroll-mt-6 border-t border-zinc-100 pt-5"
          >
            <WeeklyDigestToggle
              enabled={webhookConfig?.weekly_digest ?? true}
            />
          </div>
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
          <h2 className="font-semibold mb-1">Automatisations</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Emails automatiques envoyés à vos clients : rappel de gain non
            retiré, relance des inactifs, remerciement après retrait, vœux
            d&apos;anniversaire.
          </p>
          <Link
            href="/dashboard/settings/automations"
            className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Configurer les scénarios
          </Link>
        </Card>

        {/* Visible aussi pour un éditeur, contrairement à la carte SMS : la
            page des options l'accueille avec « demandez au propriétaire »
            plutôt qu'une redirection (cahier §3). Cacher la carte le laisserait
            conclure que le module n'existe pas, et le propriétaire ne serait
            jamais sollicité. */}
        <Card>
          <h2 className="font-semibold mb-1">Options</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Chasse au QR, Quiz express, Soirée en jeu… Chaque option
            s&apos;achète seule, sans abonnement, et n&apos;ouvre que son
            module.
          </p>
          <Link
            href="/dashboard/settings/modules"
            className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Voir les options
          </Link>
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">SMS</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Prévenez vos clients par SMS : expéditeur à votre nom, crédits, et
            liste des clients qui ont accepté d&apos;être contactés.
          </p>
          <Link
            href="/dashboard/settings/sms"
            className="inline-block border border-zinc-300 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Configurer les SMS
          </Link>
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Confidentialité des données</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Durée de conservation des participations et des abonnés
            désinscrits (minimisation RGPD). Purge appliquée chaque nuit.
          </p>
          <DataRetentionForm months={org.data_retention_months} />
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold mb-1">Webhooks sortants</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Branchez votre caisse, votre CRM ou Zapier/Make sur les
            événements de votre jeu (nouveau gain réclamé, nouvel abonné
            newsletter).
          </p>
          <WebhookForm
            webhookUrl={org.webhook_url}
            webhookSecret={webhookConfig?.webhook_secret ?? ""}
            failedDeliveries={failedWebhooks ?? 0}
          />
        </Card>

        <Card id="subscription" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className={TITRE_CARTE}>
              Abonnement
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          {compActive ? (
            <dl className="space-y-2 text-sm mb-6">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Accès</dt>
                <dd className="font-medium">Offert par LastChance 🎁</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Valable</dt>
                <dd className="font-medium">
                  {compUntil ? `jusqu'au ${formatDate(compUntil)}` : "sans limite"}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="space-y-2 text-sm mb-6">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Offre</dt>
                <dd className="font-medium">
                  {plan.name} — {formatMonthlyPrice(plan)}
                </dd>
              </div>
              {/* Ligne absente dès qu'un statut Stripe a existé : elle
                  promettait « 7 jours » d'essai — la valeur du catalogue — à un
                  commerçant `active` qui venait d'être débité, et au résilié.
                  La règle et son récit sont dans `trialLine`. */}
              {ligneEssai !== null && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Essai gratuit</dt>
                  <dd className="font-medium">{ligneEssai}</dd>
                </div>
              )}
            </dl>
          )}
          {compActive && (
            <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Vous profitez d&apos;un accès complet offert — aucun paiement
              requis. Vous pouvez tout de même vous abonner si vous le
              souhaitez.
            </p>
          )}
          <BillingButtons canCheckout={canCheckout} canManage={canManage} />
          <p className="mt-4 text-xs text-k-muted">
            Paiement sécurisé par Stripe. Sans engagement, annulable à tout
            moment depuis le portail.
          </p>

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="font-semibold text-sm mb-1">Offres</h3>
            <p className="text-xs text-zinc-500 mb-3">
              Chaque offre ouvre les modules listés ; les autres restent
              désactivés. {getPlanTier("engagement").name},{" "}
              {getPlanTier("place").name} et {getPlanTier("live").name} sont
              trois périmètres différents — fidéliser, se faire réserver,
              animer en direct — et {getPlanTier("full").name} les réunit.
            </p>
            <PlanCatalog
              tiers={planCatalog}
              hasLiveSubscription={hasLiveSubscription}
              supportEmail={supportEmail}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
