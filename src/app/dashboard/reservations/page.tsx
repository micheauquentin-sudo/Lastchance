import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { etatUiCreneau, RESERVER_FUSEAU_DEFAUT } from "@/lib/reserver";
import { loadReserverDashboardContext } from "@/lib/reserver-context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { ArriveesCheckin } from "@/components/reserver/arrivees-checkin";
import { NouvelleActiviteForm } from "@/components/reserver/nouvelle-activite-form";

export const metadata: Metadata = { title: "Réservations" };

/**
 * L'AGENDA DU COMMERÇANT — ses activités réservables, et son écran d'arrivées.
 *
 * ── LE MODULE S'APPELLE `vitrine`, PAS `reservations` ──
 *
 * Un seul droit couvre trois capacités serveur : publier la Vitrine, le CRM
 * léger, l'agenda Réserver (migration 20261001120000). `capacitesDuModule` prend
 * donc `"vitrine"`, et l'encart d'offre porte l'entitlement `vitrine` —
 * « Vitrine & Réserver ». Nommer ici un module qui n'existe pas ferait échouer
 * `tsc` sur `GrantableModule`, ce qui est le comportement souhaité.
 *
 * ── DEUX VERDICTS, ET ILS NE DISENT PAS LA MÊME CHOSE ──
 *
 * `capacitesDuModule` décide de ce que la page MONTRE : découvrir reste ouvert
 * à tous (cahier §3), c'est pourquoi un commerçant sans le droit voit quand même
 * l'écran et son encart d'offre. `loadReserverDashboardContext` décide de ce
 * qu'elle LIT : sans droit effectif il rend `no_access`, et la liste est vide —
 * la découverte ne donne pas accès aux données. Confondre les deux aurait soit
 * fermé la porte à qui veut comprendre ce qu'il achèterait, soit ouvert des
 * lignes à qui n'y a pas droit.
 *
 * ── PAS DE FILTRES NI DE PAGINATION, ET C'EST DÉLIBÉRÉ ──
 *
 * Les huit pages liste des animations portent `ModuleListFilters` et
 * `Pagination` parce qu'un commerçant y accumule des dizaines de campagnes
 * archivées. Une activité réservable est un objet de catalogue —
 * « Dégustation », « Atelier floral » — dont on tient trois ou quatre, et qui ne
 * s'archive pas : elle se coupe. Un filtre par statut sur deux valeurs et une
 * pagination sur quatre lignes ajouteraient deux contrôles à lire pour rien. Le
 * jour où un commerçant en tient trente, ces deux composants existent et
 * s'ajoutent sans rien changer d'autre.
 */
export default async function ReservationsPage() {
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("vitrine");
  if (!capacites.canExplore) notFound();

  const agenda = await loadReserverDashboardContext();
  const activites = agenda.ok ? agenda.activities : [];
  const timeZone = agenda.ok
    ? agenda.timezone
    : (organization?.timezone ?? RESERVER_FUSEAU_DEFAUT);

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Réservations"
        sousTitre="Vos clients réservent leur créneau depuis leur téléphone, et vous enregistrez leur arrivée au comptoir avec un code court."
        actions={capacites.canEditDraft ? <NouvelleActiviteForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="vitrine">
        Activités et créneaux à places limitées, réservation sans compte,
        confirmation par email au choix du client, et enregistrement des arrivées
        en caisse par code court.
      </ModuleCapabilityNotice>

      {activites.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm font-semibold text-k-body">
            Aucune activité pour l&apos;instant. Créez la première !
          </p>
          {/* LE BOUTON EST ICI AUSSI : « créez la première » sans rien à
              cliquer laisse le seul bouton en haut d'écran, hors du regard de
              celui qui vient de lire la phrase. */}
          {capacites.canEditDraft ? (
            <div className="mt-4 flex justify-center">
              <NouvelleActiviteForm instanceId="-vide" />
            </div>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-3">
          {activites.map((activite) => {
            // « Ouverts à venir » au sens du joueur : c'est `etatUiCreneau` qui
            // en décide, comme sur la page publique. Un compte calculé
            // autrement ici ferait dire au tableau de bord « 3 créneaux » là où
            // le client n'en voit qu'un.
            const ouverts = activite.slots.filter(
              (creneau) => etatUiCreneau(creneau) === "ouvert",
            ).length;
            return (
              <li key={activite.id}>
                <Link
                  href={`/dashboard/reservations/${activite.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-orange-300"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🕑
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{activite.name}</p>
                        <p className="mt-0.5 text-sm text-zinc-500">
                          {ouverts > 0
                            ? `${ouverts} créneau${ouverts > 1 ? "x" : ""} ouvert${ouverts > 1 ? "s" : ""} à venir`
                            : "Aucun créneau ouvert à venir"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black ${
                        activite.active
                          ? "bg-k-green/40 text-k-ink"
                          : "bg-zinc-200 text-k-ink"
                      }`}
                    >
                      {activite.active ? "Ouverte" : "Coupée"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* L'écran d'arrivées est SOUS la liste et HORS d'une activité : le code
          d'un client ne dit pas laquelle il a réservée, et demander au caissier
          de choisir d'abord l'activité lui ferait chercher l'information qu'il
          vient précisément d'obtenir. La RPC, elle, résout le code dans toute
          l'organisation. */}
      <ArriveesCheckin timeZone={timeZone} />
    </div>
  );
}
