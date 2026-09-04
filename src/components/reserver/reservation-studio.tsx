"use client";

import { useRef, useState } from "react";

import { enregistrerReglagesRendezVous } from "@/actions/reserver";
import { useActionForm } from "@/lib/use-action-form";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { PublicShare } from "@/components/dashboard/public-share";
import { ActiviteReglagesForm } from "@/components/reserver/activite-reglages-form";
import {
  Fermetures,
  Generation,
  SemaineType,
} from "@/components/reserver/horaires-panneau";
import { InvitationsPanneau } from "@/components/reserver/invitations-panneau";
import { SallePanneau } from "@/components/reserver/salle-panneau";
import { ApercuReservation } from "@/components/reserver/studio/apercu";
import { ChampsCachesReservation } from "@/components/reserver/studio/champs-caches";
import {
  basculerMode,
  etatInitialReservation,
  type EtatReservation,
  type ModeReservation,
} from "@/components/reserver/studio/etat";
import {
  etapesStudioReservation,
  parseEtapeStudioReservation,
  replierEtape,
  type EtapeStudioReservation,
} from "@/components/reserver/studio/etapes";
import { EtapeMode } from "@/components/reserver/studio/pages";
import type {
  ReserverActivityView,
  ReserverInvitationDashboardView,
  ReserverSlotDashboardView,
} from "@/lib/reserver-context";
import type { TableSalle } from "@/lib/plan-de-salle";
import type {
  Fermeture,
  PlageHoraireIdentifiee,
} from "@/lib/reserver-horaires";

/**
 * LE STUDIO DE RÉSERVATION (VIT-49) — UN ÉCRAN, DEUX PRODUITS.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des cinq réglages de rendez-vous, la charge utile du
 * formulaire, et l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * l'aperçu vit dans `studio/apercu.tsx`, et le FIL est dérivé du MODE par
 * `etapesStudioReservation` — jamais écrit ici.
 *
 * ── DEUX CANAUX D'ÉCRITURE, UN SEUL ÉTAT (ADR-156) ──
 *
 * LES RÉGLAGES — mode, durée, capacité, horizon, délai — partent par le
 * formulaire de la coquille, depuis `EtatReservation`, avec l'enregistrement
 * automatique. C'est le SEUL bloc de ce module qui s'écrive en une fois, par
 * un `update` de cinq colonnes, et donc le seul exposé à l'écrasement par
 * absence.
 *
 * TOUT LE RESTE part par les formulaires que les panneaux du tableau de bord
 * portent DÉJÀ, chacun avec son bouton et son action : le nom
 * (`ActiviteReglagesForm`), les plages (`SemaineType`), les fermetures
 * (`Fermetures`), la salle (`SallePanneau`), la génération (`Generation`) et
 * les invitations (`InvitationsPanneau`). Ils écrivent d'AUTRES TABLES, par
 * INSERT et DELETE. Leurs `<form>` sont valides parce que celui de la coquille
 * est leur VOISIN, jamais leur ancêtre (VIT-16).
 *
 * Ce qui n'est PAS fait, et c'est le piège de ce module : monter
 * `HorairesPanneau` en entier. Il contient `ReglagesRendezVous`, qui poste
 * `enregistrerReglagesRendezVous` — l'action même de la coquille. Il y aurait
 * alors DEUX écrivains sur les cinq mêmes colonnes, l'un piloté par l'état et
 * l'autre figé sur les valeurs du serveur, et le dernier à poster gagnerait.
 * Seuls ses trois sous-panneaux inoffensifs sont réutilisés.
 *
 * ── CE QUI RESTE AU TABLEAU DE BORD, ET POURQUOI ──
 *
 * `CreneauxAgenda` (les réservations, le retrait de file, l'annulation),
 * `AgendaVues`, `PlanSalleVue` et `ArriveesCheckin` ne montent pas ici. Ce sont
 * des gestes d'EXPLOITATION : on les fait pendant le service, avec un client
 * devant soi, et ils changent sans que personne n'ait rien réglé. Ni
 * l'enregistrement automatique ni l'aperçu n'ont de sens sur eux, et
 * `evict_waitlist_entry` porte même sa propre garde de rôle (`peutRetirer`).
 * C'est l'arbitrage déjà retenu pour l'écran de comptoir de la fidélité, celui
 * du jackpot, et le bloc d'émission du ticket d'or. Rien n'a été RETIRÉ du
 * tableau de bord.
 *
 * ── ET LE FIL SUIT L'ÉTAT, PAS LE SERVEUR ──
 *
 * `booking_mode` est modifiable DEPUIS ce studio. Le fil se dérive donc de
 * `etat.booking_mode`, et `replierEtape` ramène sur « Ce que le client peut
 * réserver » quand l'étape ouverte vient de disparaître du fil. Sans ce repli,
 * repasser une prise de rendez-vous en Moment depuis l'étape « Votre salle »
 * laisserait la colonne de gauche VIDE, sans erreur, après un geste
 * parfaitement légitime.
 */
const ID_FORMULAIRE = "studio-reservation-reglages";

export function ReservationStudio({
  activite,
  activityId,
  plages,
  fermetures,
  tables,
  dureeServiceMinutes,
  creneauxOuverts,
  creneauxApercu,
  invitations,
  creneaux,
  organizationName,
  logoUrl,
  timeZone,
  url,
  quiz,
  campagnes,
  peutEditer,
  bookingMode,
  dureeMinutes,
  capacite,
  horizonJours,
  delaiMinutes,
}: {
  /** L'activité, telle que le tableau de bord la charge — voir la page. */
  activite: ReserverActivityView;
  activityId: string;
  plages: PlageHoraireIdentifiee[];
  fermetures: Fermeture[];
  tables: TableSalle[];
  dureeServiceMinutes: number;
  creneauxOuverts: number;
  /** Les créneaux OUVERTS ET À VENIR — ce que la page publique montre. */
  creneauxApercu: ReserverSlotDashboardView[];
  invitations: ReserverInvitationDashboardView[];
  /** TOUS les créneaux : une invitation peut viser un créneau fermé. */
  creneaux: ReserverSlotDashboardView[];
  organizationName: string;
  logoUrl: string | null;
  timeZone: string;
  /** L'adresse publique ABSOLUE, résolue par la page. */
  url: string;
  quiz: { id: string; name: string }[];
  campagnes: { id: string; name: string }[];
  peutEditer: boolean;
  /**
   * LES CINQ RÉGLAGES, tels que `loadHorairesActivite` les rend. Ils arrivent
   * à plat plutôt qu'en objet parce que c'est ainsi que la page du tableau de
   * bord les passe déjà à `HorairesPanneau` : deux formes pour la même donnée
   * auraient été une conversion de plus à tenir d'accord.
   *
   * `bookingMode` est une CHAÎNE ici, comme sur toute la surface du module
   * (`ReserverActivityDashboardView`, `HorairesPanneau`, `SallePanneau`) ;
   * `etatInitialReservation` est le seul point où elle devient un mode.
   */
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  horizonJours: number;
  delaiMinutes: number;
}) {
  const [etat, setEtat] = useState<EtatReservation>(() =>
    etatInitialReservation({
      bookingMode,
      dureeMinutes,
      capacite,
      horizonJours,
      delaiMinutes,
    }),
  );
  const [etapeBrute, setEtape] = useState<EtapeStudioReservation>(() =>
    parseEtapeStudioReservation(etat.booking_mode, null),
  );

  const etapes = etapesStudioReservation(etat.booking_mode);
  const etape = replierEtape(etat.booking_mode, etapeBrute);

  const formulaire = useRef<HTMLFormElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(
    enregistrerReglagesRendezVous,
    { networkError: "Enregistrement impossible, réessayez." },
  );

  useEnregistrementDepuisEtat({ valeur: etat, formulaire, actif: peutEditer });

  const majEtat = (patch: Partial<EtatReservation>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const majMode = (mode: ModeReservation) =>
    setEtat((e) => basculerMode(e, mode));

  return (
    <CoquilleStudio
      titre={`Mon studio — ${activite.name}`}
      hrefRetour={`/dashboard/reservations/${activityId}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={
        <ChampsCachesReservation charge={{ activityId, etat }} />
      }
      etapes={etapes}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        reussi: state?.ok === true,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      apercu={
        <ApercuReservation
          etat={etat}
          organizationId={activite.id}
          activityName={activite.name}
          description={activite.description}
          organizationName={organizationName}
          logoUrl={logoUrl}
          creneaux={creneauxApercu}
          timeZone={timeZone}
          kind={activite.kind}
          promise={activite.promise}
          steps={activite.steps}
          preparation={activite.preparation}
        />
      }
    >
      {etape === "nom" ? (
        <ActiviteReglagesForm
          activite={activite}
          quiz={quiz}
          campagnes={campagnes}
        />
      ) : null}

      {etape === "mode" ? (
        <EtapeMode
          etat={etat}
          onMode={majMode}
          onEtat={majEtat}
          peutEditer={peutEditer}
        />
      ) : null}

      {/* LES QUATRE ÉTAPES DE LA PRISE DE RENDEZ-VOUS. Ces branches sont
          INATTEIGNABLES en Moment, dont le fil ne porte pas les clés — et le
          fil est la seule porte. */}
      {etape === "horaires" ? (
        <SemaineType
          activityId={activityId}
          plages={plages}
          dureeMinutes={etat.duration_minutes}
        />
      ) : null}

      {etape === "fermetures" ? (
        <Fermetures activityId={activityId} fermetures={fermetures} />
      ) : null}

      {etape === "salle" ? (
        <SallePanneau
          activityId={activityId}
          bookingMode={etat.booking_mode}
          tables={tables}
          dureeServiceMinutes={dureeServiceMinutes}
          // LE PAS DE LA GRILLE VIENT DE L'ÉTAT, pas de la base : le fil de la
          // salle compare la durée de service au pas, et le commerçant vient
          // peut-être de changer ce dernier à l'étape précédente. Lui montrer
          // l'ancien ferait juger sa salle sur un réglage qu'il a abandonné.
          pasMinutes={etat.duration_minutes}
          nombreDePlages={plages.length}
          creneauxOuverts={creneauxOuverts}
        />
      ) : null}

      {etape === "creneaux" ? (
        <Generation
          activityId={activityId}
          bookingMode={etat.booking_mode}
          dureeMinutes={etat.duration_minutes}
          capacite={etat.slot_capacity}
          plages={plages}
          horizonJours={etat.booking_horizon_days}
        />
      ) : null}

      {etape === "qr" ? (
        <PublicShare
          url={url}
          fileName={`reservation-${activityId}`}
          qrLabel={activite.name}
          resource={{ kind: "reservation", id: activityId }}
        />
      ) : null}

      {etape === "invitations" ? (
        <InvitationsPanneau
          activityId={activityId}
          creneaux={creneaux}
          invitations={invitations}
          timeZone={timeZone}
        />
      ) : null}
    </CoquilleStudio>
  );
}
