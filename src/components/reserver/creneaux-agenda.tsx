import { Card } from "@/components/ui/card";
import { etatUiCreneau, formatCreneau } from "@/lib/reserver";
import type { ReserverSlotDashboardView } from "@/lib/reserver-context";
import { formatDate } from "@/lib/utils";
import { AnnulerReservationStaff } from "@/components/reserver/annuler-reservation";
import {
  EditerCreneau,
  EtatCreneauForm,
  NouveauCreneauForm,
} from "@/components/reserver/creneau-form";
import {
  PastilleCreneau,
  PastilleFileAttente,
  PastilleReservation,
  Remplissage,
} from "@/components/reserver/pastilles";
import { RetirerDeLaFile } from "@/components/reserver/retirer-file-attente";

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
  peutRetirer,
}: {
  activityId: string;
  creneaux: ReserverSlotDashboardView[];
  timeZone: string;
  /**
   * Le rôle peut-il retirer quelqu'un de la file ? Tranché côté serveur par la
   * page (`owner`/`editor`) : `evict_waitlist_entry` refuse un caissier et un
   * lecteur, et un bouton qui ne peut qu'échouer se lit comme une panne.
   */
  peutRetirer: boolean;
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
                peutRetirer={peutRetirer}
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
  peutRetirer,
}: {
  creneau: ReserverSlotDashboardView;
  activityId: string;
  timeZone: string;
  peutRetirer: boolean;
}) {
  const annulees = creneau.reservations.filter(
    (r) => r.status === "cancelled",
  ).length;

  // LE CRÉNEAU A-T-IL COMMENCÉ ? Au-delà, `cancel_reservation_staff` refuse
  // `too_late` — la place ne serait reprise par personne (`reserve_slot` exige
  // un créneau à venir) et l'absence resterait de toute façon dans les
  // statistiques. Question posée à `etatUiCreneau`, comme du côté joueur, et
  // avec les mêmes valeurs neutralisées : c'est SON heure qu'on demande, pas
  // son état d'ouverture — un créneau fermé mais encore à venir garde ses
  // annulations.
  const commence =
    etatUiCreneau({
      status: "open",
      startsAt: creneau.startsAt,
      remaining: 1,
    }) === "passe";

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
                {/* LE NOMBRE DE PERSONNES (RES-5), et seulement quand il n'est
                    pas 1. Un Atelier Duo tient DEUX places sous un seul code :
                    le comptoir doit le savoir avant d'ouvrir la porte, sans
                    quoi il attend une personne et en voit arriver deux. Sur une
                    réservation ordinaire, « 1 pers. » n'apprendrait rien et
                    ferait une colonne de bruit. */}
                {reservation.partySize > 1 ? (
                  <span className="shrink-0 rounded-full border-2 border-k-ink bg-sky-100 px-2 py-0.5 text-xs font-black text-k-ink">
                    {reservation.partySize} pers.
                  </span>
                ) : null}
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
                {/* Le bouton n'apparaît QUE là où il peut aboutir : une
                    réservation vivante, sur un créneau qui n'a pas commencé.
                    Ailleurs, la RPC refuserait — et proposer un geste qui
                    échoue est pire que de ne rien proposer. */}
                {reservation.status === "confirmed" && !commence ? (
                  <AnnulerReservationStaff
                    reservationId={reservation.reservationId}
                    code={reservation.code}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      <FileAttenteCreneau
        creneau={creneau}
        timeZone={timeZone}
        peutRetirer={peutRetirer}
      />
    </Card>
  );
}

/**
 * LA LISTE PRIORITAIRE D'UN CRÉNEAU, vue du commerçant (RES-2, lot L5).
 *
 * ── ELLE NE PORTE AUCUN GESTE D'ORDRE, ET C'EST DÉLIBÉRÉ ──
 *
 * Ni « proposer à », ni « faire passer devant ». L'ordre est celui de
 * l'inscription, et la place se propose toute seule dès qu'elle se libère
 * (`reservation_offer_next`, sous le même verrou que la réservation). Un bouton
 * de promotion manuelle aurait donné au commerçant un moyen de doubler sa propre
 * file — et à la base deux écritures concurrentes à départager. Ce panneau
 * CONSTATE.
 *
 * ── LE SEUL GESTE QU'IL PORTE : RETIRER (revue de sécurité L5, E-1b) ──
 *
 * Il n'est pas une exception à ce qui précède, il en est le complément exact :
 * il RETIRE, il ne réordonne pas, et la place repart au suivant du même
 * mouvement — retirer la tête ne fait donc qu'avancer celle d'après. Sans lui,
 * un doublon manifeste ou une inscription abusive n'avait que deux issues :
 * attendre l'échéance, ou fermer le créneau pour tout le monde.
 *
 * ── AUCUN EMAIL, ICI NON PLUS ──
 *
 * La colonne existe sur `reservation_waitlist_entries`, comme sur
 * `reservations`, et elle est hors du grant de colonnes pour la même raison :
 * elle n'a de finalité que l'envoi serveur. Ce que le comptoir a besoin de
 * savoir tient dans le rang, l'état et les horodatages.
 */
function FileAttenteCreneau({
  creneau,
  timeZone,
  peutRetirer,
}: {
  creneau: ReserverSlotDashboardView;
  timeZone: string;
  peutRetirer: boolean;
}) {
  if (creneau.waitlist.length === 0) {
    // Silence sur un créneau qui n'a jamais eu de liste : afficher « 0 personne
    // en attente » sur chaque carte d'un agenda de vingt créneaux noierait les
    // deux qui en ont une.
    return null;
  }

  // Les DEUX compteurs viennent du chargeur, tranchés côté serveur —
  // `offresTenues` en particulier : savoir si une offre tient encore dépend de
  // l'horloge de la base, jamais de celle du poste de caisse.
  const vivantes = creneau.enAttente;
  const proposees = creneau.offresTenues;

  return (
    <details className="mt-4 border-t border-zinc-100 pt-3">
      <summary className="cursor-pointer text-sm font-bold text-k-body hover:text-k-ink">
        File d&apos;attente ·{" "}
        <span className="font-black tabular-nums text-k-ink">{vivantes}</span>{" "}
        personne{vivantes > 1 ? "s" : ""} en attente
        {proposees > 0
          ? ` · ${proposees} place${proposees > 1 ? "s" : ""} proposée${proposees > 1 ? "s" : ""}`
          : ""}
      </summary>
      <ul className="mt-3 space-y-2">
        {creneau.waitlist.map((entree) => (
          <li
            key={entree.entryId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-k-ink/15 bg-k-bg px-3 py-2"
          >
            {/* `position` vaut 0 sur une entrée terminée : elle n'occupe plus
                de rang, et afficher « #0 » ferait croire à une tête de file. */}
            <span className="w-10 shrink-0 font-mono text-sm font-black tabular-nums text-k-ink">
              {entree.position > 0 ? `#${entree.position}` : "—"}
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold text-k-body">
              Inscrite le {formatDate(entree.createdAt, timeZone)}
              {entree.offeredAt
                ? ` · proposée le ${formatDate(entree.offeredAt, timeZone)}`
                : ""}
              {entree.offerExpiresAt
                ? entree.offerLive
                  ? ` · tenue jusqu'au ${formatDate(entree.offerExpiresAt, timeZone)}`
                  : ` · délai écoulé le ${formatDate(entree.offerExpiresAt, timeZone)}`
                : ""}
            </span>
            <PastilleFileAttente entree={entree} />
            {/* Le bouton n'apparaît QUE là où il peut aboutir : sur une entrée
                VIVANTE, et pour un rôle qui a le droit de retirer. Une entrée
                convertie, expirée ou déjà partie n'occupe plus de rang, et
                `evict_waitlist_entry` refuse caissier et lecteur — la RPC le
                dirait dans les deux cas, mais proposer un geste qui échoue est
                pire que de ne rien proposer. */}
            {peutRetirer &&
            (entree.status === "waiting" || entree.status === "offered") ? (
              <RetirerDeLaFile
                entryId={entree.entryId}
                position={entree.position}
                tientUnePlace={entree.offerLive}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-medium leading-relaxed text-k-body">
        L&apos;ordre est celui de l&apos;inscription et il ne se modifie pas :
        dès qu&apos;une place se libère, elle est tenue pour la personne en tête,
        une seule à la fois, pendant la durée réglée sur ce créneau. Passé ce
        délai, elle passe automatiquement à la suivante. «&nbsp;Retirer&nbsp;»
        sort quelqu&apos;un de la liste sans le prévenir — et rend aussitôt à la
        personne suivante la place qui lui était tenue.
      </p>
    </details>
  );
}
