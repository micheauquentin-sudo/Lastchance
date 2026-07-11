import { Poppins } from "next/font/google";
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

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
});

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organization } = await getUserAndOrg();
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
      className={`${poppins.variable} relative flex-1 flex flex-col lg:flex-row bg-[#fdf6f0] text-zinc-800`}
    >
      {/* Léger halo chaleureux en fond, cohérent avec le site */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(48% 38% at 100% 0%, rgba(244,114,182,0.10), transparent 60%), radial-gradient(45% 40% at 0% 100%, rgba(251,146,60,0.10), transparent 62%), linear-gradient(180deg,#fdf4ee,#fdf6f0)",
        }}
      />
      <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-orange-900/[0.07] bg-white/70 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen">
        <div className="flex flex-col gap-3 p-4 lg:h-full lg:gap-6 lg:p-5">
          {/* Ligne haute : logo (+ déconnexion sur mobile) */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/dashboard"
                className="text-lg font-extrabold tracking-tight text-zinc-900"
                style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
              >
                LastChance<span className="text-pink-500">.</span>
              </Link>
              <p className="mt-1.5 hidden items-center gap-1.5 truncate text-xs text-zinc-500 lg:flex">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {organization.name}
              </p>
            </div>
            <form action={logout} className="lg:hidden">
              <button
                type="submit"
                aria-label="Déconnexion"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-orange-50 hover:text-zinc-900"
              >
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
                </svg>
              </button>
            </form>
          </div>

          <DashboardNav />

          <form action={logout} className="mt-auto hidden lg:block">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-orange-50 hover:text-zinc-900"
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
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-800">
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
          <div className="border-b border-orange-200/70 bg-gradient-to-r from-orange-50 to-pink-50 px-6 py-3 text-sm text-orange-800">
            <span className="font-semibold">Essai gratuit</span> :{" "}
            {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant
            {daysLeft > 1 ? "s" : ""}.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline decoration-orange-300 underline-offset-2 hover:decoration-orange-500"
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
