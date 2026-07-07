import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { isTrialExpired, trialDaysLeft } from "@/lib/subscription";
import { logout } from "@/actions/auth";
import { DashboardNav } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const subscriptionInactive = ["canceled", "inactive", "past_due"].includes(
    organization.subscription_status,
  );
  const trialExpired = isTrialExpired(organization);
  const daysLeft = trialDaysLeft(organization);

  return (
    <div className="flex-1 flex flex-col lg:flex-row">
      <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-200 bg-white">
        <div className="p-4 lg:p-5 flex lg:flex-col gap-4 lg:gap-6 items-center lg:items-stretch justify-between lg:justify-start lg:h-full">
          <div>
            <Link href="/dashboard" className="font-bold tracking-tight">
              Lastchance<span className="text-violet-600">.</span>
            </Link>
            <p className="hidden lg:block text-xs text-zinc-500 mt-1 truncate">
              {organization.name}
            </p>
          </div>
          <DashboardNav />
          <form action={logout} className="lg:mt-auto">
            <button
              type="submit"
              className="text-sm text-zinc-500 hover:text-zinc-900"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {subscriptionInactive && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-800">
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
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-800">
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
          <div className="bg-sky-50 border-b border-sky-200 px-6 py-3 text-sm text-sky-800">
            Essai gratuit : {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant
            {daysLeft > 1 ? "s" : ""}.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline"
            >
              S&apos;abonner
            </Link>
          </div>
        )}
        <div className="p-6 lg:p-10 max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
