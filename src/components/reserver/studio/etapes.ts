import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";
import type { ModeReservation } from "@/components/reserver/studio/etat";

/**
 * LES ÉTAPES DU STUDIO DE RÉSERVATION — DÉRIVÉES DU MODE, jamais écrites en
 * dur (VIT-49).
 *
 * ── UNE PAGE, DEUX PRODUITS ──
 *
 * `reservation_activities.booking_mode` vaut `moment` ou `rendez_vous`, et ce
 * ne sont pas deux réglages de la même chose : ce sont deux produits.
 *
 *  - un MOMENT est une date précise — un atelier, une dégustation, une soirée.
 *    Le commerçant pose ses créneaux à la main, un par un, et compte des
 *    PLACES.
 *  - une PRISE DE RENDEZ-VOUS décrit une semaine type, engendre ses créneaux
 *    par une RPC, et compte des TABLES.
 *
 * ── CE QUI EST DÉRIVÉ, ET CE N'EST PAS QU'UNE ÉTAPE ──
 *
 * Le découpage proposé ne réservait au mode que « Votre salle et vos tables ».
 * La mesure dit autre chose, et elle est déjà écrite dans les deux panneaux du
 * tableau de bord :
 *
 *  - `SallePanneau` commence par `if (bookingMode !== "rendez_vous") return
 *    null` — la salle ENTIÈRE est absente d'un Moment ;
 *  - `HorairesPanneau` n'affiche `SemaineType`, `Fermetures` et `Generation`
 *    que `{bookingMode === "rendez_vous" && …}`.
 *
 * QUATRE étapes, donc, et non une : « Vos horaires », « Vos jours de
 * fermeture », « Votre salle et vos tables » et « Générer vos créneaux »
 * n'existent qu'en prise de rendez-vous. Les afficher sur un Moment aurait
 * ouvert quatre écrans vides annonçant des réglages sans colonne derrière —
 * mot pour mot ce qu'ADR-160 refuse, et ce que les salons ont déjà tranché en
 * retirant « Votre suggestion du jour » du Portrait de la Bande (ADR-163).
 *
 * Ce n'est pas non plus une invention de cet écran : le tableau de bord se
 * comporte DÉJÀ ainsi. Le studio ne fait que rendre visible dans son fil une
 * règle qui, là-bas, se manifeste par des panneaux qui disparaissent sans
 * prévenir.
 *
 * ── LA DIFFÉRENCE AVEC LES SALONS, ET ELLE EST STRUCTURANTE ──
 *
 * Le fil des salons dérive du SEGMENT D'URL : `/studio/salon/duo` et
 * `/studio/salon/bande` sont deux routes, et le jeu ne change jamais en cours
 * de réglage. Ici le mode est une DONNÉE que le commerçant modifie DEPUIS le
 * studio, à l'étape « Ce que le client peut réserver ». Le fil doit donc se
 * dériver de l'état VIVANT, pas de ce que le serveur a chargé — sans quoi
 * basculer en prise de rendez-vous laisserait le commerçant devant un fil à
 * quatre étapes qui ne mentionne ni ses horaires ni sa salle, et il devrait
 * recharger la page pour les voir apparaître.
 *
 * C'est aussi pourquoi `replierEtape` existe (voir plus bas) : un fil qui
 * RÉTRÉCIT peut retirer l'étape sous les pieds de celui qui la regarde.
 *
 * ── POURQUOI HUIT ÉTAPES ET NON NEUF : « JUSQU'À QUAND » N'EN EST PAS UNE ──
 *
 * Le découpage proposé séparait « Ce que le client peut réserver » (mode,
 * durée, capacité) de « Jusqu'à quand on peut réserver » (horizon, délai).
 * Elles sont FUSIONNÉES, et pas par économie d'écrans : les cinq réglages sont
 * un SEUL geste. `enregistrerReglagesRendezVous` les lit d'un seul `FormData`
 * et écrit `booking_mode`, `duration_minutes`, `slot_capacity`,
 * `booking_horizon_days` et `lead_time_minutes` en un seul `update`.
 *
 * Le critère d'ADR-157/ADR-160 est que des étapes soient DISJOINTES. Ces deux
 * moitiés ne le sont pas : elles partagent leur action, leur ligne et leur
 * enregistrement. Pire, le contrat du socle oblige de toute façon à rendre la
 * charge utile EN ENTIER à chaque rendu — les cinq champs seraient donc
 * présents sur les deux étapes, et la seconde n'aurait fait que masquer trois
 * contrôles dont les valeurs partaient quand même. Un découpage qui ne découpe
 * rien est une redite, pas une étape.
 */

/** Les étapes que les deux produits partagent, mot pour mot. */
const NOM = {
  cle: "nom",
  titre: "Le nom de votre activité",
  resume:
    "Comment votre activité s'appelle chez vos clients, ce qu'elle leur promet, et si elle accepte des réservations.",
} as const;

const MODE = {
  cle: "mode",
  titre: "Ce que le client peut réserver",
  resume:
    "Un Moment à date fixe, ou une prise de rendez-vous récurrente — puis la durée, le nombre de personnes, et jusqu'à quand on peut réserver.",
} as const;

const QR = {
  cle: "qr",
  titre: "Le QR à afficher",
  resume:
    "L'adresse à imprimer et à poser en vitrine ou sur vos tables : vos clients la scannent pour réserver.",
} as const;

const INVITATIONS = {
  cle: "invitations",
  titre: "Vos invitations",
  resume:
    "Des liens privés qui ouvrent une place à quelqu'un que vous choisissez, sans passer par la page publique.",
} as const;

/**
 * LE MOMENT — quatre étapes. Ses créneaux se posent à la main, depuis l'agenda
 * du tableau de bord : ce n'est pas un réglage, c'est du travail de service,
 * et il reste où il est (voir l'en-tête de `reservation-studio.tsx`).
 */
const ETAPES_MOMENT = [NOM, MODE, QR, INVITATIONS] as const;

/** LA PRISE DE RENDEZ-VOUS — huit étapes, dans l'ordre où l'on décide. */
const ETAPES_RENDEZ_VOUS = [
  NOM,
  MODE,
  {
    cle: "horaires",
    titre: "Vos horaires d'ouverture",
    resume:
      "Votre semaine type. Pour une coupure de midi, posez deux plages le même jour.",
  },
  {
    cle: "fermetures",
    titre: "Vos jours de fermeture",
    resume:
      "Vos congés et vos jours fériés : aucun créneau n'y sera proposé.",
  },
  {
    cle: "salle",
    titre: "Votre salle et vos tables",
    resume:
      "Vos tables, leurs couverts, et combien de temps une table reste prise. Propre à la prise de rendez-vous.",
  },
  {
    cle: "creneaux",
    titre: "Générer vos créneaux",
    resume:
      "Appliquer vos horaires sur les jours à venir. Un créneau déjà réservé n'est jamais retiré.",
  },
  QR,
  INVITATIONS,
] as const;

/** Toutes les clés existantes, les deux modes confondus. */
export type EtapeStudioReservation =
  | (typeof ETAPES_MOMENT)[number]["cle"]
  | (typeof ETAPES_RENDEZ_VOUS)[number]["cle"];

/**
 * LE FIL DU MODE DEMANDÉ. C'est la seule porte : rien dans ce studio ne lit
 * une liste d'étapes autrement, sans quoi le fil affiché et le fil parcouru
 * pourraient diverger — et « Votre salle et vos tables » réapparaîtrait sur un
 * Moment par le chemin qu'on n'a pas gardé.
 */
export function etapesStudioReservation(
  mode: ModeReservation,
): readonly DeclarationEtape<EtapeStudioReservation>[] {
  return mode === "rendez_vous" ? ETAPES_RENDEZ_VOUS : ETAPES_MOMENT;
}

/**
 * L'ÉTAPE COURANTE, REPLIÉE SUR LE FIL DU MODE.
 *
 * Ce que les salons n'ont pas eu à écrire, et que ce module ne peut pas éviter.
 * Là-bas le fil est fixé par l'URL ; ici le commerçant peut, depuis « Ce que le
 * client peut réserver », repasser une prise de rendez-vous en Moment — et le
 * fil perd alors QUATRE étapes d'un coup.
 *
 * Sans ce repli, l'étape affichée resterait `salle` ou `creneaux` : une clé que
 * le fil ne porte plus. La barre n'aurait aucun bouton `aria-current`, et la
 * colonne de gauche serait VIDE — tous les rendus d'étape étant gardés par la
 * clé. Un écran blanc, sans erreur, après un geste parfaitement légitime.
 *
 * Le repli renvoie sur `mode` et NON sur la première étape du fil. C'est
 * délibéré : `mode` est l'étape d'où part le geste. Renvoyer sur « Le nom de
 * votre activité » aurait déplacé le commerçant loin du contrôle qu'il vient
 * d'actionner, sans lui dire pourquoi — il aurait cru avoir perdu son réglage.
 * Ici, il reste sous sa main et voit le fil rétrécir à côté.
 */
export function replierEtape(
  mode: ModeReservation,
  courante: EtapeStudioReservation,
): EtapeStudioReservation {
  const fil = etapesStudioReservation(mode);
  return fil.some((e) => e.cle === courante) ? courante : MODE.cle;
}

/**
 * Les deux fonctions ci-dessous ne font que NOMMER la liste du mode : le
 * libellé accessible et le repli vivent au socle
 * (`@/components/studio/etapes`). Elles restent exportées d'ici parce que
 * c'est ce nom-là que les gardes cherchent — un libellé recopié dans un test
 * divergerait au premier renommage, et la garde chercherait un bouton qui
 * n'existe plus.
 *
 * Elles prennent LE MODE en premier argument, et ce n'est pas une commodité :
 * `libelleEtape` compose « Étape 3 sur 8 », un rang qui n'a de sens que dans un
 * fil donné. « Le QR à afficher » est la 3ᵉ de 4 sur un Moment et la 7ᵉ de 8
 * sur une prise de rendez-vous — une signature sans le mode aurait forcé à en
 * choisir un, donc à mentir sur l'autre.
 */
export function parseEtapeStudioReservation(
  mode: ModeReservation,
  brut: string | null | undefined,
): EtapeStudioReservation {
  return parseEtape(etapesStudioReservation(mode), brut);
}

export function libelleEtapeStudioReservation(
  mode: ModeReservation,
  cle: EtapeStudioReservation,
): string {
  return libelleEtape(etapesStudioReservation(mode), cle);
}

/** Les deux listes satisfont le contrat du socle — vérifié à la compilation. */
const _contrat: readonly (readonly DeclarationEtape<EtapeStudioReservation>[])[] =
  [ETAPES_MOMENT, ETAPES_RENDEZ_VOUS];
void _contrat;
