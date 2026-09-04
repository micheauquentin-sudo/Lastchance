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
import { ActiviteReglagesForm } from "@/components/reserver/activite-reglages-form";
import { CreneauxAgenda } from "@/components/reserver/creneaux-agenda";
import { AgendaVues } from "@/components/reserver/agenda-vues";
import { HorairesPanneau } from "@/components/reserver/horaires-panneau";
import { PlanSalleVue } from "@/components/reserver/plan-salle-vue";
import { SallePanneau } from "@/components/reserver/salle-panneau";
import { InvitationsPanneau } from "@/components/reserver/invitations-panneau";

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

  // Le droit de CET écran est `reserver`, sa propre clé depuis la migration
  // 20261020120000 — plus `vitrine`, qui ne couvre plus que la carte publique.
  const capacites = await capacitesDuModule("reserver");
  if (!capacites.canExplore) notFound();

  const agenda = await loadReserverDashboardContext();
  if (!agenda.ok) notFound();

  const activite = agenda.activities.find((a) => a.id === activityId);
  // Activité inconnue OU d'une autre organisation : même réponse.
  if (!activite) notFound();

  /**
   * LE RÔLE DÉCIDE DE CE QUI S'AFFICHE, PAS SEULEMENT DE CE QUI PASSE.
   *
   * `evict_waitlist_entry` refuse un caissier et un lecteur — le bouton
   * « Retirer » leur échouait donc SYSTÉMATIQUEMENT, et un geste qui ne peut
   * qu'échouer se lit comme une panne. Il ne descend maintenant que pour les
   * rôles qui peuvent l'aboutir. Ce n'est PAS la garde : la server action
   * revérifie, comme toujours — c'est l'écran qui cesse de mentir.
   *
   * `getUserAndOrg` est mémoïsé par `cache()` : la page n'ajoute pas de
   * requête, et le chargeur d'agenda ne rend pas le rôle.
   */
  const { role } = await getUserAndOrg();
  const peutRetirer = role === "owner" || role === "editor";
  // Le studio ÉCRIT : `enregistrerReglagesRendezVous` exige `owner|editor`.
  // Proposer la porte à un caissier l'aurait mené à un écran en lecture seule.
  const peutRegler = peutRetirer;

  // LES HORAIRES, chargés à part (voir reserver-horaires-context.ts) : la LISTE
  // des activités ne les affiche pas, elle n'a pas à les payer.
  const horaires = await loadHorairesActivite(activite.id);
  // Le fil du studio est DÉRIVÉ du mode : en Moment il compte quatre étapes, en
  // prise de rendez-vous huit. La carte le dit plutôt que d'annoncer des
  // réglages que ce mode-ci n'a pas (voir `studio/etapes.ts`).
  const estRendezVous = horaires.reglages.bookingMode === "rendez_vous";

  /**
   * LA JOURNÉE D'ANCRAGE, calculée AU SERVEUR dans le fuseau du commerce.
   *
   * La laisser au navigateur aurait donné deux résultats : le commerçant en
   * déplacement se serait ancré sur SA date locale, pas celle de son commerce,
   * et le premier rendu client aurait différé du rendu serveur — un écart
   * d'hydratation, pour une valeur qui n'a rien d'incertain.
   */
  const aujourdHui = new Intl.DateTimeFormat("en-CA", {
    timeZone: agenda.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  /**
   * L'OCCUPATION EST EN PERSONNES, pas en lignes (RES-5). Sur un Atelier Duo,
   * trois réservations valent six personnes — `vivantes` en face de la
   * capacité ferait croire à un atelier à moitié vide. C'est `personnes` que
   * `reserve_slot` compare à la capacité, c'est donc elle qu'on affiche.
   */
  /**
   * LES RÉSERVATIONS, APLATIES POUR LE PLAN DE SALLE.
   *
   * L'heure d'une réservation est celle de SON CRÉNEAU : `reservations` ne
   * porte pas d'instant propre, et en inventer un ici ferait diverger le plan
   * de l'agenda dès qu'un créneau serait déplacé.
   *
   * `prenom` est délibérément `null` : `email` n'est pas dans le grant de
   * colonnes du commerçant (voir `RESERVATION_COLUMNS`), et aucune autre
   * colonne ne porte de nom. Le service reconnaît ses clients au CODE.
   */
  const reservationsSalle = activite.slots.flatMap((slot) =>
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
  // « avez-vous des créneaux » mais « en avez-vous d'ouverts » — un brouillon
  // ne prend aucune réservation.
  const creneauxOuverts = activite.slots.filter(
    (slot) => slot.status === "open",
  ).length;

  const creneauxAgenda = activite.slots.map((slot) => ({
    id: slot.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    capacity: slot.capacity,
    occupees: slot.personnes,
    status: slot.status,
  }));

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

      <ModuleCapabilityNotice capacites={capacites} entitlement="reserver">
        Activités et créneaux à places limitées, réservation sans compte, et
        enregistrement des arrivées en caisse par code court.
      </ModuleCapabilityNotice>

      {/* L'ENTRÉE DU STUDIO, et seulement pour qui règle. Un caissier n'y
          trouverait qu'un écran en lecture seule.

          Le `<h2>` est écrit à la main, comme sur les neuf autres entrées de
          studio : sans lui la carte n'a AUCUN titre dans l'arbre
          d'accessibilité — un lecteur d'écran ne l'annonce pas, et les E2E qui
          cherchent `getByRole("heading")` ne la trouvent pas non plus.

          ELLE N'EST PAS MASQUÉE SOUS `lg`, contrairement à six autres modules,
          et ce n'est pas un oubli : ceux-là masquent l'entrée du studio parce
          qu'ils gardent un ATELIER `?etape=` pour le téléphone. Ce module n'en a
          jamais eu — aucun `hrefEtape`, aucun `AtelierEntree` — et c'est CETTE
          page qui tient le rôle de repli mobile. La masquer aurait retiré la
          seule porte du studio sans en laisser d'autre. */}
      {peutRegler ? (
        <Card className="mt-6">
          <h2 className="font-semibold mb-1">Mon studio</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-k-body">
              La page de vos clients au centre, les réglages autour. Le nom, ce
              qu&apos;on peut réserver
              {estRendezVous
                ? ", vos horaires, vos fermetures, votre salle et vos créneaux"
                : ""}
              , le QR et vos invitations — tout s&apos;y règle en voyant le
              résultat.
            </p>
            <Link
              href={`/studio/reservation/${activite.id}`}
              className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
            >
              Ouvrir le studio
            </Link>
          </div>
        </Card>
      ) : null}

      <ActiviteReglagesForm
        activite={activite}
        // Le Mode Attente active (RES-4) : les deux listes de l'organisation,
        // résolues côté serveur — un identifiant ne se saisit pas à la main.
        quiz={agenda.ok ? agenda.waitQuiz : []}
        campagnes={agenda.ok ? agenda.waitCampaigns : []}
      />

      {/* Le QR et le lien que le client scanne. L'adresse est STABLE — elle ne
          porte que l'identifiant de l'activité, jamais un jeton (ADR-109) —
          donc une affiche imprimée et collée en vitrine survit à la page qui l'a
          produite. */}
      <div className="mt-6">
        <PublicShare
          url={urlActiviteReserver(activite.id, APP_URL)}
          fileName={`reservation-${activite.id}`}
          qrLabel={activite.name}
          resource={{ kind: "reservation", id: activite.id }}
        />
      </div>

      {/* LES HORAIRES AVANT L'AGENDA : ils DÉCIDENT de ce que l'agenda contient.
          Les poser après aurait fait lire au commerçant le résultat avant sa
          cause. */}
      <HorairesPanneau
        activityId={activite.id}
        bookingMode={horaires.reglages.bookingMode}
        dureeMinutes={horaires.reglages.dureeMinutes}
        capacite={horaires.reglages.capacite}
        horizonJours={horaires.reglages.horizonJours}
        delaiMinutes={horaires.reglages.delaiMinutes}
        plages={horaires.plages}
        fermetures={horaires.fermetures}
      />

      {/* LA SALLE JUSTE APRÈS LES HORAIRES : les horaires décident de QUAND on
          ouvre, la salle de AVEC QUOI. L'ordre de lecture est celui dans lequel
          le commerçant prend ses décisions — horaires, salle, puis agenda. */}
      <SallePanneau
        activityId={activite.id}
        bookingMode={horaires.reglages.bookingMode}
        tables={horaires.tables}
        dureeServiceMinutes={horaires.reglages.dureeServiceMinutes}
        pasMinutes={horaires.reglages.dureeMinutes}
        nombreDePlages={horaires.plages.length}
        creneauxOuverts={creneauxOuverts}
      />

      {/* LE PLAN DE SALLE AVANT L'AGENDA, et seulement en prise de rendez-vous :
          un Moment n'a pas de tables, et `AgendaVues` reste pour tout le monde —
          il répond à « où reste-t-il de la place », que le plan ne répond pas. */}
      {horaires.reglages.bookingMode === "rendez_vous" && (
        <PlanSalleVue
          tables={horaires.tables}
          reservations={reservationsSalle}
          timeZone={agenda.timezone}
          aujourdHui={aujourdHui}
          dureeServiceMinutes={horaires.reglages.dureeServiceMinutes}
        />
      )}

      {/* L'AGENDA VISUEL AVANT LA LISTE : on cherche d'abord « où reste-t-il de
          la place », et seulement ensuite « qui vient à 14 h ». La liste
          détaillée garde les réservations, le retrait de file et l'annulation —
          l'agenda ne les remplace pas, il les précède. */}
      <AgendaVues
        creneaux={creneauxAgenda}
        timeZone={agenda.timezone}
        aujourdHui={aujourdHui}
      />

      <CreneauxAgenda
        activityId={activite.id}
        creneaux={activite.slots}
        timeZone={agenda.timezone}
        peutRetirer={peutRetirer}
      />

      {/* Les invitations sont AU NIVEAU DE L'ACTIVITÉ, sous l'agenda : l'une
          d'elles peut viser toute l'activité, et celles qui visent un créneau
          doivent rester lisibles une fois ce créneau passé. Aucune adresse ne
          descend en prop : le lien à partager est composé par la server action
          de création, qui est aussi la seule à voir le jeton en clair. */}
      <InvitationsPanneau
        activityId={activite.id}
        creneaux={activite.slots}
        invitations={activite.invitations}
        timeZone={agenda.timezone}
      />
    </div>
  );
}
