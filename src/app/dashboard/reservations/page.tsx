import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { urlActiviteReserver } from "@/lib/reserver";
import { loadReserverDashboardContext } from "@/lib/reserver-context";
import { loadHorairesActivite } from "@/lib/reserver-horaires-context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PublicShare } from "@/components/dashboard/public-share";
import { ArriveesCheckin } from "@/components/reserver/arrivees-checkin";
import { CreneauxAgenda } from "@/components/reserver/creneaux-agenda";
import { HorairesPanneau } from "@/components/reserver/horaires-panneau";
import { NouvelleActiviteForm } from "@/components/reserver/nouvelle-activite-form";
import { PlanSalleVue } from "@/components/reserver/plan-salle-vue";
import { SallePanneau } from "@/components/reserver/salle-panneau";

export const metadata: Metadata = { title: "Réservation" };

/**
 * RÉSERVATION — CET ÉCRAN *EST* LA SALLE (RDV-13).
 *
 * ── CE QU'IL A REMPLACÉ, ET POURQUOI ──
 *
 * Cette route rendait le meuble des Moments : une carte « Vos activités » qui
 * listait des lignes cliquables, et l'écran d'arrivées dessous. Les horaires, le
 * plan de salle, les tables et le calendrier vivaient une page plus loin, sur
 * `/dashboard/reservations/[activityId]`, qu'il fallait DEVINER en cliquant une
 * ligne. Le retour du propriétaire était sans appel : « je n'ai toujours pas
 * accès à la salle, au calendrier ».
 *
 * Le défaut n'était pas la profondeur, c'était la question posée. Une liste
 * demande « laquelle ? » ; un restaurateur n'a pas de catalogue de salles, il en
 * a UNE. Poser une question dont la réponse est toujours la même coûte un clic à
 * chaque visite et cache derrière lui tout ce qui compte. Le mot « activité » a
 * donc disparu de cet écran : ce qu'il montre n'est pas un objet parmi d'autres,
 * c'est le commerce lui-même, un jour donné.
 *
 * ── UNE SALLE SE CRÉE UNE FOIS, PAS À CHAQUE VISITE ──
 *
 * Aucun « + Nouvelle activité » ici. Tant qu'aucune salle n'existe, l'écran ne
 * porte qu'un seul appel à l'action ; dès qu'elle existe, le bouton disparaît —
 * un bouton de création permanent sur un objet unique n'invite qu'à créer des
 * doublons, et un doublon de salle coupe l'agenda en deux.
 *
 * ── L'ÉCRAN DE DÉTAIL RESTE, ET IL N'EST PAS DE TROP ──
 *
 * `/dashboard/reservations/[activityId]` continue de servir : c'est là que la
 * liste des MOMENTS renvoie, et il porte des blocs qui n'ont pas de sens ici
 * (réglages d'activité, invitations). Les deux écrans montent les mêmes
 * composants — ils ne dupliquent aucune logique, seulement un assemblage.
 *
 * ── PAS DE TUILES DE CHECKLIST SUR CET ÉCRAN ──
 *
 * `TUILES_RESERVER` décrit les Moments (activités, arrivées, files, offres) et
 * reste rendue sur `/dashboard/moments`. Ici, le fil des quatre étapes de
 * `SallePanneau` joue ce rôle, et mieux : il ne dit pas seulement ce qui manque,
 * il porte le geste qui le comble.
 */
export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ salle?: string }>;
}) {
  const { salle: salleDemandee } = await searchParams;

  // Découvrir / préparer / publier (cahier §3). Le droit de CET écran est
  // `rendez_vous`, son propre add-on depuis RDV-5 — `reserver` ne couvre plus
  // que les Moments.
  const capacites = await capacitesDuModule("rendez_vous");
  if (!capacites.canExplore) notFound();

  const agenda = await loadReserverDashboardContext();

  // `booking_mode` est exclusif : une salle n'apparaît jamais dans les Moments,
  // et réciproquement.
  const salles = agenda.ok
    ? agenda.activities.filter((a) => a.bookingMode === "rendez_vous")
    : [];

  const notice = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="rendez_vous">
      Vos horaires posés une fois, les créneaux qui se génèrent, votre plan de
      salle et le calendrier de vos services — vos clients réservent depuis votre
      Vitrine, sans compte.
    </ModuleCapabilityNotice>
  );

  /**
   * L'ÉTAT SANS SALLE : UNE SEULE CARTE, ET RIEN D'AUTRE.
   *
   * Ni arrivées, ni agenda vide, ni plan sans table. Chacun de ces blocs
   * fonctionne parfaitement une fois la salle née et ne montre rigoureusement
   * rien avant — les empiler ferait traverser au commerçant cinq cadres vides
   * pour trouver le seul bouton qui le fait avancer. La phrase annonce les
   * quatre étapes qu'il va rencontrer : ce qui l'attend est court, et le dire
   * évite qu'il renonce au premier écran de réglages.
   */
  if (salles.length === 0) {
    return (
      <div>
        <PageHeader
          surtitre="Vos animations"
          titre="Réservation"
          sousTitre="Votre salle, vos horaires, votre calendrier : ce que vos clients voient quand ils réservent une table."
        />

        {notice}

        <div className="mt-8 flex justify-center">
          <Card className="w-full max-w-xl text-center">
            <h2>Vous n&apos;avez pas encore de salle.</h2>
            <p className="mt-3 text-sm font-semibold text-k-body">
              Quatre étapes, dans cet ordre : vos horaires d&apos;ouverture, vos
              tables, la durée d&apos;un service — puis vous ouvrez vos créneaux.
              Vos clients réservent ensuite depuis votre Vitrine.
            </p>
            {capacites.canEditDraft ? (
              <div className="mt-6 flex justify-center">
                <NouvelleActiviteForm
                  instanceId="-salle"
                  bookingMode="rendez_vous"
                  libelle="+ Créer ma salle"
                />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    );
  }

  /**
   * PLUSIEURS SALLES : CAS HISTORIQUE, PAS UN CAS SOUTENU.
   *
   * Rien n'empêchait, avant ce lot, de créer deux activités en `rendez_vous`
   * depuis l'ancienne liste. Ces données existent et ne doivent PAS disparaître
   * de l'écran — d'où le sélecteur. Mais il reste discret et sans bouton
   * d'ajout : on donne accès à ce qui a été créé, on n'encourage pas à en créer
   * davantage.
   */
  const salle = salles.find((a) => a.id === salleDemandee) ?? salles[0];

  const { role } = await getUserAndOrg();

  /**
   * LE RÔLE DÉCIDE DE CE QUI S'AFFICHE, PAS SEULEMENT DE CE QUI PASSE.
   *
   * `evict_waitlist_entry` refuse un caissier et un lecteur — le bouton
   * « Retirer » leur échouait donc SYSTÉMATIQUEMENT, et un geste qui ne peut
   * qu'échouer se lit comme une panne. Ce n'est PAS la garde : la server action
   * revérifie, comme toujours — c'est l'écran qui cesse de mentir.
   */
  const peutRetirer = role === "owner" || role === "editor";

  // Les horaires, les tables et la durée de service sont chargés à part : la
  // lecture d'agenda ne les porte pas (voir `reserver-horaires-context.ts`).
  const horaires = await loadHorairesActivite(salle.id);

  const timeZone = agenda.ok ? agenda.timezone : "UTC";

  /**
   * LA JOURNÉE D'ANCRAGE, CALCULÉE AU SERVEUR DANS LE FUSEAU DU COMMERCE.
   *
   * La laisser au navigateur donnerait deux résultats : le commerçant en
   * déplacement s'ancrerait sur SA date locale, pas celle de son commerce, et le
   * premier rendu client différerait du rendu serveur — un écart d'hydratation,
   * pour une valeur qui n'a rien d'incertain.
   */
  const aujourdHui = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  /**
   * LES RÉSERVATIONS, APLATIES POUR LE PLAN DE SALLE.
   *
   * L'heure d'une réservation est celle de SON CRÉNEAU : `reservations` ne porte
   * pas d'instant propre, et en inventer un ici ferait diverger le plan de
   * l'agenda dès qu'un créneau serait déplacé.
   *
   * `prenom` est délibérément `null` : `email` n'est pas dans le grant de
   * colonnes du commerçant (voir `RESERVATION_COLUMNS`), et aucune autre colonne
   * ne porte de nom. Le service reconnaît ses clients au CODE.
   */
  const reservationsSalle = salle.slots.flatMap((slot) =>
    slot.reservations.map((reservation) => ({
      id: reservation.reservationId,
      tableId: reservation.tableId,
      startsAt: slot.startsAt,
      effectif: reservation.partySize,
      code: reservation.code,
      statut: reservation.status,
      prenom: null,
    })),
  );

  // Les créneaux OUVERTS : la quatrième étape du fil de la salle ne demande pas
  // « avez-vous des créneaux » mais « en avez-vous d'ouverts » — un brouillon ne
  // prend aucune réservation.
  const creneauxOuverts = salle.slots.filter(
    (slot) => slot.status === "open",
  ).length;

  return (
    <div>
      {/* PAS DE FIL D'ARIANE « RETOUR AUX RÉSERVATIONS » : on Y EST. Le titre
          est le nom de la salle parce que c'est le seul repère qui distingue
          deux salles chez ceux qui en ont hérité plusieurs. */}
      <PageHeader
        surtitre="Vos animations"
        titre={salle.name}
        sousTitre="Vos horaires, vos tables, votre calendrier — et le QR que vos clients scannent pour réserver."
      />

      {notice}

      {/* LE SÉLECTEUR N'APPARAÎT QUE S'IL Y A UN CHOIX À FAIRE. Sur une salle
          unique — le cas de tout le monde — il n'ajoute rien à lire. */}
      {salles.length > 1 ? (
        <nav
          aria-label="Vos salles"
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          {salles.map((autre) => (
            <Link
              key={autre.id}
              href={
                autre.id === salles[0].id
                  ? "/dashboard/reservations"
                  : `/dashboard/reservations?salle=${autre.id}`
              }
              aria-current={autre.id === salle.id ? "page" : undefined}
              className={`rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black ${
                autre.id === salle.id ? "bg-k-yellow/40" : "bg-white"
              }`}
            >
              {autre.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* LE FIL DES QUATRE ÉTAPES EN TÊTE D'ÉCRAN, ET C'EST LE CŒUR DE CE LOT.
          C'est le paramétrage par étape que le propriétaire cherchait : il doit
          être la première chose lue, avant les panneaux qu'il commande. Posé en
          bas, il serait devenu le récapitulatif de ce qu'on venait de faire au
          hasard — l'inverse de son emploi. */}
      <SallePanneau
        activityId={salle.id}
        bookingMode={horaires.reglages.bookingMode}
        tables={horaires.tables}
        dureeServiceMinutes={horaires.reglages.dureeServiceMinutes}
        pasMinutes={horaires.reglages.dureeMinutes}
        nombreDePlages={horaires.plages.length}
        creneauxOuverts={creneauxOuverts}
      />

      {/* LES HORAIRES AVANT LE CALENDRIER : ils DÉCIDENT de ce qu'il contient.
          Les poser après ferait lire le résultat avant sa cause. */}
      <HorairesPanneau
        activityId={salle.id}
        bookingMode={horaires.reglages.bookingMode}
        dureeMinutes={horaires.reglages.dureeMinutes}
        capacite={horaires.reglages.capacite}
        horizonJours={horaires.reglages.horizonJours}
        delaiMinutes={horaires.reglages.delaiMinutes}
        plages={horaires.plages}
        fermetures={horaires.fermetures}
      />

      {/* LE CALENDRIER JOUR / SEMAINE / MOIS — ce que le propriétaire disait ne
          pas trouver. Il répond à « où reste-t-il de la place », question à
          laquelle la liste des créneaux ci-dessous ne répond pas. */}
      <PlanSalleVue
        tables={horaires.tables}
        reservations={reservationsSalle}
        timeZone={timeZone}
        aujourdHui={aujourdHui}
        dureeServiceMinutes={horaires.reglages.dureeServiceMinutes}
      />

      {/* LA LISTE APRÈS LE CALENDRIER : on cherche d'abord une place, et
          seulement ensuite « qui vient à 14 h ». Elle garde les réservations, le
          retrait de file et l'annulation — le calendrier ne les remplace pas. */}
      <CreneauxAgenda
        activityId={salle.id}
        creneaux={salle.slots}
        timeZone={timeZone}
        peutRetirer={peutRetirer}
      />

      {/* UN RESTAURANT POINTE SES ARRIVÉES : le bloc reste, et il est hors de
          tout créneau — le code d'un client ne dit pas quelle heure il a prise,
          et la RPC le résout dans toute l'organisation. */}
      <div className="mt-8">
        <ArriveesCheckin timeZone={timeZone} />
      </div>

      {/* LE QR ET LE LIEN QUE LES CLIENTS SCANNENT. L'adresse est STABLE — elle
          ne porte que l'identifiant de la salle, jamais un jeton (ADR-109) —
          donc une affiche imprimée et collée en vitrine survit à la page qui l'a
          produite. */}
      <div className="mt-8">
        <PublicShare
          url={urlActiviteReserver(salle.id, APP_URL)}
          fileName={`reservation-${salle.id}`}
          qrLabel={salle.name}
        />
      </div>
    </div>
  );
}
