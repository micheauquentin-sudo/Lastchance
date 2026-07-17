import { Lilita_One, Nunito } from "next/font/google";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  hasActiveAccess,
  isTrialExpired,
  pastDueGraceEndsAt,
  trialDaysLeft,
} from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { logout } from "@/actions/auth";
import { DashboardNav } from "@/components/dashboard/nav";
import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher";

/* DA « La Kermesse » (version sobre) : Lilita One pour le logo,
   Nunito pour les titres et le corps du panel. */
const lilita = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-heading",
});

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organization, role, memberships } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const accessActive = hasActiveAccess(organization);
  // Impayé en cours de relance Stripe : les roues restent actives
  // pendant le délai de grâce — bannière dédiée, pas « inactif ».
  const pastDueInGrace =
    organization.subscription_status === "past_due" && accessActive;
  const graceEndsAt = pastDueGraceEndsAt(organization);
  const subscriptionInactive =
    ["canceled", "inactive"].includes(organization.subscription_status) ||
    (organization.subscription_status === "past_due" && !accessActive);
  const trialExpired = isTrialExpired(organization);
  const daysLeft = trialDaysLeft(organization);

  return (
    <div
      className={`${lilita.variable} ${nunito.variable} relative flex-1 flex flex-col lg:flex-row bg-k-bg text-k-ink`}
      style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
    >
      <aside className="lg:w-64 shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 border-k-ink bg-k-bg lg:sticky lg:top-0 lg:h-screen">
        <div className="flex flex-col gap-3 p-4 lg:h-full lg:gap-6 lg:p-5">
          {/* Ligne haute : logo (+ déconnexion sur mobile) */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/dashboard"
                className="text-xl leading-none text-k-ink"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
              >
                LastChance<span className="text-k-orange">.</span>
              </Link>
              <p className="mt-1.5 hidden items-center gap-1.5 truncate text-xs font-bold text-k-body lg:flex">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {organization.name}
              </p>
            </div>
            <form action={logout} className="lg:hidden">
              <button
                type="submit"
                aria-label="Déconnexion"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-k-body transition-colors hover:bg-k-yellow/50 hover:text-k-ink"
              >
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
                </svg>
              </button>
            </form>
          </div>

          <OrganizationSwitcher
            activeId={organization.id}
            organizations={memberships.map((membership) => ({
              id: membership.organizationId,
              name: membership.organization.name,
            }))}
          />

          <DashboardNav role={role} />

          <form action={logout} className="mt-auto hidden lg:block">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-k-body transition-colors hover:bg-k-yellow/50 hover:text-k-ink"
            >
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
              </svg>
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {pastDueInGrace && (
          <div className="border-b-2 border-k-ink bg-red-100 px-6 py-3 text-sm font-bold text-k-ink">
            Votre dernier paiement a échoué. Vos roues restent actives
            {graceEndsAt ? ` jusqu'au ${formatDate(graceEndsAt)}` : " quelques jours"}
            {" "}— mettez à jour votre moyen de paiement d&apos;ici là.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline"
            >
              Mettre à jour le paiement
            </Link>
          </div>
        )}
        {subscriptionInactive && (
          <div className="border-b-2 border-k-ink bg-k-yellow px-6 py-3 text-sm font-bold text-k-ink">
            Votre abonnement est inactif : vos roues publiques sont
            désactivées.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline"
            >
              Gérer l&apos;abonnement
            </Link>
          </div>
        )}
        {trialExpired && (
          <div className="border-b-2 border-k-ink bg-k-yellow px-6 py-3 text-sm font-bold text-k-ink">
            Votre essai gratuit est terminé : vos roues publiques sont
            désactivées et vos campagnes ne peuvent plus être activées. Vous
            pouvez toujours préparer vos QR codes.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline"
            >
              S&apos;abonner
            </Link>
          </div>
        )}
        {!trialExpired && daysLeft > 0 && (
          <div className="border-b-2 border-k-ink bg-k-blue/40 px-6 py-3 text-sm font-bold text-k-ink">
            <span className="font-black">Essai gratuit</span> :{" "}
            {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant
            {daysLeft > 1 ? "s" : ""}.{" "}
            <Link
              href="/dashboard/settings"
              className="font-black underline underline-offset-2 hover:text-k-orange"
            >
              S&apos;abonner
            </Link>
          </div>
        )}
        <div className="p-6 lg:p-10 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
