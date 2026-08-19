import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { urlActiviteReserver } from "@/lib/reserver";
import { loadReserverDashboardContext } from "@/lib/reserver-context";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PublicShare } from "@/components/dashboard/public-share";
import { ActiviteReglagesForm } from "@/components/reserver/activite-reglages-form";
import { CreneauxAgenda } from "@/components/reserver/creneaux-agenda";

export const metadata: Metadata = { title: "Activité réservable" };

/**
 * UNE ACTIVITÉ : ses réglages, ses créneaux, et les réservations de chacun.
 *
 * ── POURQUOI LES RÉSERVATIONS NE SONT PAS UNE TROISIÈME PAGE ──
 *
 * Un niveau de plus (activité → créneau → réservations) ferait payer un
 * chargement de page pour lire quatre lignes, et couperait le commerçant de la
 * seule vue qui l'intéresse quand il prépare son service : le créneau ET qui
 * vient. Les réservations vivent donc sous un pli, dans la carte du créneau.
 *
 * ── L'ACTIVITÉ EST CHERCHÉE DANS L'AGENDA DÉJÀ CHARGÉ ──
 *
 * `loadReserverDashboardContext` rend les activités de l'organisation ACTIVE,
 * avec leurs créneaux et leurs réservations, en une lecture bornée. Une requête
 * dédiée par identifiant aurait ajouté un second chemin d'accès à ces tables —
 * donc un second endroit où oublier la borne de locataire. Ici l'activité
 * demandée est simplement introuvable dans la liste quand elle appartient à
 * quelqu'un d'autre, et la page rend 404 : même réponse que pour une activité
 * qui n'existe pas, aucun oracle.
 */
export default async function ActiviteReservablePage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;

  const capacites = await capacitesDuModule("vitrine");
  if (!capacites.canExplore) notFound();

  const agenda = await loadReserverDashboardContext();
  if (!agenda.ok) notFound();

  const activite = agenda.activities.find((a) => a.id === activityId);
  // Activité inconnue OU d'une autre organisation : même réponse.
  if (!activite) notFound();

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre={activite.name}
        sousTitre="Ajoutez vos créneaux, ouvrez-les à la réservation, et suivez qui vient."
        retour={{
          href: "/dashboard/reservations",
          label: "Retour aux réservations",
        }}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="vitrine">
        Activités et créneaux à places limitées, réservation sans compte, et
        enregistrement des arrivées en caisse par code court.
      </ModuleCapabilityNotice>

      <ActiviteReglagesForm activite={activite} />

      {/* Le QR et le lien que le client scanne. L'adresse est STABLE — elle ne
          porte que l'identifiant de l'activité, jamais un jeton (ADR-109) —
          donc une affiche imprimée et collée en vitrine survit à la page qui l'a
          produite. */}
      <div className="mt-6">
        <PublicShare
          url={urlActiviteReserver(activite.id, APP_URL)}
          fileName={`reservation-${activite.id}`}
          qrLabel={activite.name}
        />
      </div>

      <CreneauxAgenda
        activityId={activite.id}
        creneaux={activite.slots}
        timeZone={agenda.timezone}
      />
    </div>
  );
}
