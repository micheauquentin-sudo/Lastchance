/**
 * L'ÉTAT DU STUDIO DE RÉSERVATION — les CINQ champs que
 * `enregistrerReglagesRendezVous` écrit, plus rien (VIT-49).
 *
 * ── POURQUOI L'ÉTAT NE PORTE QUE CES CINQ-LÀ ──
 *
 * Ce studio a DEUX canaux d'écriture, et c'est le cas qu'ADR-156 a déjà
 * tranché : un studio peut en avoir deux, jamais deux états.
 *
 *  - LES RÉGLAGES — mode, durée, capacité, horizon, délai — partent par le
 *    formulaire de la coquille, depuis cet état, avec l'enregistrement
 *    automatique du socle. C'est le seul réglage de ce module qui s'écrive en
 *    BLOC, et donc le seul exposé au piège d'écrasement par absence.
 *  - TOUT LE RESTE — le nom de l'activité, les plages horaires, les
 *    fermetures, les tables, la durée de service, la génération, les
 *    invitations — part par les formulaires que les panneaux du tableau de
 *    bord portent DÉJÀ, chacun avec son bouton et son action, parce qu'ils
 *    écrivent d'AUTRES TABLES (`reservation_openings`,
 *    `reservation_closures`, `reservation_tables`, `reservation_invitations`).
 *
 * Les recopier dans cet état aurait créé un second écrivain sur les mêmes
 * lignes, et l'enregistrement automatique reposterait toute la salle à chaque
 * frappe. C'est le piège que les salons ont nommé, et il est ici plus dangereux
 * encore : ces tables se modifient par INSERT et DELETE, pas par update d'une
 * ligne unique.
 *
 * ── LE PIÈGE D'ÉCRASEMENT EST RÉEL, ET IL EST SILENCIEUX SUR DEUX CHAMPS ──
 *
 * `enregistrerReglagesRendezVous` fait un `.update()` de `booking_mode`,
 * `booking_horizon_days`, `lead_time_minutes` et `slot_capacity` — TOUJOURS,
 * sans condition — puis de `duration_minutes` s'il n'est pas nul. Et les cinq
 * champs ne se taisent pas de la même façon :
 *
 *  · `booking_horizon_days` et `lead_time_minutes` sont des `entierRequis` :
 *    absents, le schéma REFUSE et l'écran affiche une erreur. Bruyant, donc
 *    récupérable.
 *  · `slot_capacity` et `duration_minutes` retombent sur `null` en silence.
 *    `slot_capacity: null` est ÉCRIT tel quel — la capacité d'une activité
 *    disparaît, et rien ne le dit. C'est la panne exacte que le socle referme.
 *
 * D'où le contrat, tenu par `ChampsCachesReservation` : les cinq champs sont
 * rendus EN ENTIER, à chaque rendu, quelle que soit l'étape ouverte.
 */

/**
 * Les deux produits que sert cette page. La vue du tableau de bord type ce
 * champ en `string` nu (`ReserverActivityDashboardView.bookingMode`) ; le
 * studio le RESSERRE à l'entrée, parce que tout son fil d'étapes en dépend et
 * qu'une troisième valeur ferait silencieusement retomber sur le fil du Moment.
 */
export type ModeReservation = "moment" | "rendez_vous";

/** Le seul point où une chaîne venue de la base devient un mode. */
export function versModeReservation(brut: string | null | undefined): ModeReservation {
  return brut === "rendez_vous" ? "rendez_vous" : "moment";
}

/**
 * LES DÉFAUTS DE LA PRISE DE RENDEZ-VOUS — ceux de l'écran du tableau de bord,
 * repris à l'identique (`HorairesPanneau` : `dureeMinutes ? … : "30"` et
 * `capacite ?? 1`).
 */
export const DUREE_RENDEZ_VOUS_DEFAUT = 30;
export const CAPACITE_RENDEZ_VOUS_DEFAUT = 1;

export interface EtatReservation {
  booking_mode: ModeReservation;
  /** `null` tant que rien n'a été réglé — un Moment n'en a pas. */
  duration_minutes: number | null;
  /** `null` tant que rien n'a été réglé — un Moment compte des places. */
  slot_capacity: number | null;
  booking_horizon_days: number;
  lead_time_minutes: number;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici : une
 * activité en mode Moment n'a ni durée ni capacité, et les résoudre au montage
 * les aurait gravées au premier enregistrement automatique sur une activité à
 * laquelle personne n'a touché — le défaut que VIT-19 a passé un lot à défaire,
 * et que le socle rend d'autant plus facile à commettre qu'il poste tout seul.
 *
 * `booking_horizon_days` et `lead_time_minutes`, eux, arrivent déjà résolus :
 * `loadHorairesActivite` rend les défauts des COLONNES (30 jours, 0 minute)
 * quand la ligne est absente. Ce ne sont pas des défauts inventés ici, ce sont
 * ceux de la migration.
 */
export function etatInitialReservation(source: {
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  horizonJours: number;
  delaiMinutes: number;
}): EtatReservation {
  return {
    booking_mode: versModeReservation(source.bookingMode),
    duration_minutes: source.dureeMinutes,
    slot_capacity: source.capacite,
    booking_horizon_days: source.horizonJours,
    lead_time_minutes: source.delaiMinutes,
  };
}

/**
 * BASCULER DE MODE, EN RÉSOLVANT CE QUE LE NOUVEAU MODE EXIGE.
 *
 * C'est le geste de la cagnotte « le plancher est corrigé dans la CHARGE, pas
 * dans le `<select>` » (ADR-161), appliqué au cas symétrique.
 *
 * `reglagesRendezVousSchema` porte un `superRefine` qui REFUSE une prise de
 * rendez-vous sans durée ni capacité — il est le miroir de la contrainte
 * `reservation_activities_rendez_vous_complete_check` en base. Une activité en
 * mode Moment n'a ni l'une ni l'autre (`null`). Basculer en prise de
 * rendez-vous sans les résoudre aurait donc produit, une seconde plus tard,
 * « Indiquez la durée d'un rendez-vous. » — sur un écran où le commerçant vient
 * de cliquer sur un bouton de mode et n'a rien saisi d'autre. Il aurait lu un
 * reproche pour un champ qu'on ne lui avait pas encore demandé.
 *
 * La résolution n'est PAS une invention au sens de VIT-19 : elle ne se déclenche
 * que sur un geste explicite du commerçant, et les valeurs qu'elle pose sont
 * immédiatement VISIBLES et modifiables dans l'étape même d'où part le clic.
 * Rien n'est gravé dans son dos.
 *
 * Le retour au Moment, lui, ne remet rien à `null` : la durée et la capacité
 * déjà réglées sont conservées, pour qu'un aller-retour ne coûte pas une
 * ressaisie. La base les ignore hors de la prise de rendez-vous.
 */
export function basculerMode(
  etat: EtatReservation,
  mode: ModeReservation,
): EtatReservation {
  if (mode !== "rendez_vous") return { ...etat, booking_mode: mode };
  return {
    ...etat,
    booking_mode: mode,
    duration_minutes: etat.duration_minutes ?? DUREE_RENDEZ_VOUS_DEFAUT,
    slot_capacity: etat.slot_capacity ?? CAPACITE_RENDEZ_VOUS_DEFAUT,
  };
}

/**
 * Ce que la coquille poste. `activity_id` n'est pas dans l'état — il vient du
 * segment d'URL, en prop, et le mettre là aurait laissé croire qu'on peut le
 * changer, alors que l'enregistrement automatique reposte à chaque nouvelle
 * référence de l'état.
 */
export interface ChargeReservation {
  activityId: string;
  etat: EtatReservation;
}
