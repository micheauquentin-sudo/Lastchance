import { Card } from "@/components/ui/card";
import { formatCreneau } from "@/lib/reserver";
import type { ReserverSlotDashboardView } from "@/lib/reserver-context";
import { formatDate } from "@/lib/utils";
import {
  EditerCreneau,
  EtatCreneauForm,
  NouveauCreneauForm,
} from "@/components/reserver/creneau-form";
import {
  PastilleCreneau,
  PastilleReservation,
  Remplissage,
} from "@/components/reserver/pastilles";

/**
 * L'AGENDA D'UNE ACTIVITÉ — ses créneaux, et sous chacun, ses réservations.
 *
 * ── POURQUOI LES RÉSERVATIONS SONT SOUS UN PLI, ET NON SUR UNE PAGE À PART ──
 *
 * Un troisième niveau de navigation (activité → créneau → réservations) aurait
 * fait payer un chargement de page pour lire quatre lignes, et coupé le
 * commerçant de la seule vue qui l'intéresse quand il prépare son service : le
 * créneau ET qui vient. Le `<details>` lui donne la liste sans quitter
 * l'agenda, et la garde repliée tant qu'il ne la demande pas.
 *
 * ── CE QUI N'EST PAS AFFICHÉ ──
 *
 * Ni email, ni empreinte de cookie. Le premier n'est même pas lisible par le
 * commerçant — il est hors du grant de colonnes (migration 20261002120000,
 * section 5) et n'existe que pour l'envoi transactionnel côté serveur. Le
 * second est la clé d'accès du joueur. Ce que le comptoir a besoin de savoir
 * tient dans le code, le statut et les horodatages.
 */
export function CreneauxAgenda({
  activityId,
  creneaux,
  timeZone,
}: {
  activityId: string;
  creneaux: ReserverSlotDashboardView[];
  timeZone: string;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-k-ink">
          Créneaux{" "}
          <span className="text-sm font-bold text-k-body">
            ({creneaux.length})
          </span>
        </h2>
        <NouveauCreneauForm activityId={activityId} timeZone={timeZone} />
      </div>

      {creneaux.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm font-semibold text-k-body">
            Aucun créneau pour l&apos;instant. Ajoutez-en un : c&apos;est lui que
            vos clients réservent, pas l&apos;activité.
          </p>
          <div className="mt-4 flex justify-center">
            <NouveauCreneauForm activityId={activityId} timeZone={timeZone} />
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {creneaux.map((creneau) => (
            <li key={creneau.id}>
              <CreneauCarte
                creneau={creneau}
                activityId={activityId}
                timeZone={timeZone}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreneauCarte({
  creneau,
  activityId,
  timeZone,
}: {
  creneau: ReserverSlotDashboardView;
  activityId: string;
  timeZone: string;
}) {
  const annulees = creneau.reservations.filter(
    (r) => r.status === "cancelled",
  ).length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-black text-k-ink">
            {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
          </p>
          <p className="mt-1">
            <Remplissage
              restantes={creneau.remaining}
              capacity={creneau.capacity}
            />
          </p>
          {creneau.arrivees > 0 ? (
            <p className="mt-1 text-sm font-bold text-k-body">
              <span className="font-black tabular-nums text-k-ink">
                {creneau.arrivees}
              </span>{" "}
              arrivée{creneau.arrivees > 1 ? "s" : ""} enregistrée
              {creneau.arrivees > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PastilleCreneau creneau={creneau} />
          <EditerCreneau
            creneau={creneau}
            activityId={activityId}
            timeZone={timeZone}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-3">
        <EtatCreneauForm creneau={creneau} />
      </div>

      {creneau.reservations.length === 0 ? (
        <p className="mt-4 border-t border-zinc-100 pt-3 text-sm font-semibold text-k-body">
          Aucune réservation sur ce créneau.
        </p>
      ) : (
        <details className="mt-4 border-t border-zinc-100 pt-3">
          <summary className="cursor-pointer text-sm font-bold text-k-body hover:text-k-ink">
            {creneau.vivantes} réservation{creneau.vivantes > 1 ? "s" : ""} en
            cours
            {annulees > 0
              ? ` · ${annulees} annulée${annulees > 1 ? "s" : ""}`
              : ""}
          </summary>
          <ul className="mt-3 space-y-2">
            {creneau.reservations.map((reservation) => (
              <li
                key={reservation.reservationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-k-ink/15 bg-k-bg px-3 py-2"
              >
                <span className="font-mono text-sm font-black tracking-wider text-k-ink">
                  {reservation.code}
                </span>
                <span className="min-w-0 flex-1 text-xs font-semibold text-k-body">
                  Réservée le {formatDate(reservation.createdAt, timeZone)}
                  {reservation.checkedInAt
                    ? ` · arrivée le ${formatDate(reservation.checkedInAt, timeZone)}`
                    : ""}
                  {reservation.cancelledAt
                    ? ` · annulée le ${formatDate(reservation.cancelledAt, timeZone)}`
                    : ""}
                </span>
                <PastilleReservation status={reservation.status} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
