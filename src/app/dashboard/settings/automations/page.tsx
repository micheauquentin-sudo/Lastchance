import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { getAutomationSettings } from "@/actions/automations";
import { AutomationScenarioCard } from "@/components/dashboard/automation-settings";

export const metadata: Metadata = { title: "Automatisations" };

/**
 * Réglages des emails automatiques : 4 scénarios activables (gain non
 * retiré, clients inactifs, après retrait, anniversaire), traités par
 * le cron quotidien. Accessible aux éditeurs (comme l'action serveur) —
 * les caissiers sont redirigés.
 */
export default async function AutomationsSettingsPage() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") redirect("/dashboard");

  const settings = await getAutomationSettings();

  return (
    <div>
      <Link
        href="/dashboard/settings"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Réglages
      </Link>

      <h1 className="text-2xl font-bold mt-3 mb-2">Automatisations</h1>
      <p className="text-sm text-zinc-500 mb-8 max-w-lg">
        Des emails envoyés automatiquement à vos clients selon les scénarios
        activés, une fois par jour au maximum par contact. Les messages
        marketing ne concernent que les contacts ayant accepté vos
        communications.
      </p>

      <div className="space-y-4 max-w-lg">
        {settings.map((setting) => (
          <AutomationScenarioCard
            key={setting.scenario}
            setting={setting}
            autoReengage={organization.auto_reengage}
          />
        ))}
      </div>
    </div>
  );
}
