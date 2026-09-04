import type { ChargeReservation } from "@/components/reserver/studio/etat";

/**
 * LA CHARGE UTILE DU STUDIO DE RÉSERVATION — rendue EN ENTIER, à chaque rendu,
 * sur TOUTES les étapes des DEUX modes (VIT-49).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE CES `name` ──
 *
 * Aucun contrôle visible de l'étape « Ce que le client peut réserver » n'en
 * porte : les boutons de mode, les curseurs de durée, de capacité, d'horizon et
 * de délai écrivent dans `EtatReservation`, et ce composant traduit cet état en
 * formulaire. La conséquence est celle qu'on cherche — **il n'existe aucun
 * chemin par lequel un champ pourrait manquer**, quelle que soit l'étape
 * ouverte, parce qu'aucun champ ne dépend d'une étape pour exister.
 *
 * ── ET LE PIÈGE EXISTE BEL ET BIEN ICI, SUR DEUX CHAMPS SILENCIEUX ──
 *
 * `enregistrerReglagesRendezVous` construit son `TablesUpdate` avec
 * `booking_mode`, `booking_horizon_days`, `lead_time_minutes` et
 * `slot_capacity` SANS CONDITION. Sur les étapes « Vos horaires », « Votre
 * salle et vos tables » ou « Le QR à afficher », aucun contrôle de réglage
 * n'est monté — c'est exactement là que l'oubli se produirait :
 *
 *  · `slot_capacity` absent → `null` dans le schéma → `null` ÉCRIT en base.
 *    La capacité d'une prise de rendez-vous disparaît, la base refuse alors
 *    l'activité au prochain contrôle, et rien n'a prévenu.
 *  · `duration_minutes` absent → `null`, et l'action ne l'écrit pas. Le champ
 *    survit, mais le `superRefine` refuse toute la charge : plus aucun réglage
 *    n'est enregistrable tant qu'on ne rouvre pas la bonne étape.
 *  · `booking_horizon_days` et `lead_time_minutes` sont des `entierRequis` :
 *    absents, TOUT l'enregistrement échoue, sur un message parlant d'un réglage
 *    que l'étape ouverte ne montre pas.
 *
 * Les cinq sont donc rendus sans condition, y compris — et surtout — sur les
 * étapes qui n'en montrent aucun.
 *
 * ── LA DURÉE ET LA CAPACITÉ SONT RENDUES MÊME NULLES, ET C'EST VOULU ──
 *
 * `""` est ce que `duration_minutes` et `slot_capacity` attendent pour dire
 * « pas de valeur » : leur schéma est
 * `z.union([z.literal("").transform(() => null), z.coerce.number().int()])`.
 * Omettre le champ produirait le MÊME `null` — mais par un chemin différent, et
 * seulement tant que le schéma garde son `.default(null)`. Rendre `""` dit la
 * chose explicitement, et ne dépend d'aucun défaut qu'on pourrait resserrer un
 * jour sans y penser.
 *
 * C'est un Moment qui les porte à `null` : il compte des PLACES par créneau,
 * pas des rendez-vous d'une durée fixe. Le `superRefine` ne les exige qu'en
 * prise de rendez-vous, et `basculerMode` les résout au moment de la bascule.
 */
export function ChampsCachesReservation({
  charge,
}: {
  charge: ChargeReservation;
}) {
  const { activityId, etat } = charge;
  return (
    <>
      {/* L'ACTIVITÉ RÉGLÉE. Pas un réglage : la cible. L'action commence par
          vérifier qu'elle appartient bien à l'organisation. */}
      <input type="hidden" name="activity_id" value={activityId} />

      {/* LE MODE — c'est aussi lui qui DÉRIVE le fil d'étapes (voir
          `etapes.ts`). Il part avec chaque enregistrement, depuis n'importe
          quelle étape. */}
      <input type="hidden" name="booking_mode" value={etat.booking_mode} />

      {/* TOUJOURS RENDUS, même vides : `""` vaut `null` pour ces deux-là. Les
          omettre sur une étape qui ne les montre pas effacerait la capacité
          d'une prise de rendez-vous, en silence. */}
      <input
        type="hidden"
        name="duration_minutes"
        value={etat.duration_minutes ?? ""}
      />
      <input
        type="hidden"
        name="slot_capacity"
        value={etat.slot_capacity ?? ""}
      />

      {/* REQUIS PAR LE SCHÉMA (`entierRequis`) : absents, c'est tout
          l'enregistrement qui échoue, y compris pour un réglage sans rapport. */}
      <input
        type="hidden"
        name="booking_horizon_days"
        value={etat.booking_horizon_days}
      />
      <input
        type="hidden"
        name="lead_time_minutes"
        value={etat.lead_time_minutes}
      />
    </>
  );
}
