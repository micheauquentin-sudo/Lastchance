import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import { getAutomationSettings } from "@/actions/automations";
import { AutomationScenarioCard } from "@/components/dashboard/automation-settings";
import { PageHeader } from "@/components/ui/page-header";

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
  // IMPASSE RÉPARÉE. Cette page est ouverte à l'éditeur — mais son unique
  // lien de retour pointait sur « Réglages », qui renvoie tout
  // non-propriétaire sur « Vue d'ensemble » sans un mot. Le collègue à qui on
  // a donné les droits « campagnes et caisse » atterrissait ailleurs, sans
  // explication, et concluait à une panne. On lui rend le retour qu'il peut
  // réellement suivre.
  const retourReglages = lienSelonRole("/dashboard/settings", role);

  return (
    <div>
      <PageHeader
        surtitre="Gestion"
        titre="Automatisations"
        sousTitre="Des emails envoyés automatiquement à vos clients selon les scénarios activés, une fois par jour au maximum par contact. Les messages marketing ne concernent que les contacts ayant accepté vos communications."
        retour={
          retourReglages
            ? { href: retourReglages, label: "Réglages" }
            : { href: "/dashboard", label: "Vue d'ensemble" }
        }
      />

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
