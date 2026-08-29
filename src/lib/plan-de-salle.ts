/**
 * LE PLAN DE SALLE, CÔTÉ APPLICATIF (RDV-6).
 *
 * Module PUR : ni `server-only`, ni base, ni DOM, ni horloge implicite.
 * L'instant de référence est toujours passé en argument.
 *
 * ── CE QU'IL CALCULE, ET CE QU'IL NE CALCULE PAS ──
 *
 * Il compose la VUE de service du commerçant : ses tables en lignes, les heures
 * en colonnes, et qui occupe quoi. Il ne décide RIEN — l'affectation est faite
 * par `reserve_table` en base, sous verrou, et ce module se contente de la
 * peindre. Un désaccord entre les deux serait un défaut ici, jamais là-bas.
 *
 * ── LA DURÉE D'OCCUPATION EST LA SEULE RÈGLE ──
 *
 * Une réservation de 20 h avec un service d'1 h 30 occupe sa table de 20 h à
 * 21 h 30. Tout ce fichier en découle : la barre qu'on dessine, les créneaux
 * qu'elle couvre, et le fait qu'une table « libre à 20 h 15 » n'existe pas si
 * quelqu'un s'y est assis à 20 h.
 */

export interface TableSalle {
  id: string;
  nom: string;
  couverts: number;
  active: boolean;
}

export interface ReservationSalle {
  id: string;
  tableId: string | null;
  /** Instant ABSOLU du début de service. */
  startsAt: string;
  /** Nombre de personnes. */
  effectif: number;
  code: string;
  statut: "confirmed" | "cancelled" | "checked_in";
  /** Prénom si le client l'a laissé, sinon `null`. */
  prenom: string | null;
}

/** Les états qui OCCUPENT réellement une table — miroir de `reserve_table`. */
export function occupeLaTable(statut: ReservationSalle["statut"]): boolean {
  // Une ARRIVÉE occupe la place qu'elle honore : le pointage ne libère rien.
  // C'est l'ensemble exact que compte la RPC, et les deux doivent rester
  // d'accord — sinon l'écran montre une table libre que la base refuse.
  return statut === "confirmed" || statut === "checked_in";
}

/** Minutes écoulées depuis minuit local, à partir de « HH:MM ». */
export function minutesDepuisHeure(heure: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || min > 59) return null;
  const total = h * 60 + min;
  return total >= 0 && total <= 1440 ? total : null;
}

/**
 * Deux occupations se chevauchent-elles ?
 *
 * MIROIR EXACT du `rs.starts_at < v_fin and v_debut < rs.starts_at + turn` de
 * `reserve_table`. Bornes MI-OUVERTES : un service qui finit à 21 h 30 et un
 * autre qui commence à 21 h 30 ne se chevauchent pas — la table se retourne.
 */
export function occupationsSeChevauchent(
  debutA: number,
  debutB: number,
  dureeMinutes: number,
): boolean {
  return debutA < debutB + dureeMinutes && debutB < debutA + dureeMinutes;
}

export interface ServiceTable {
  table: TableSalle;
  /** Réservations vivantes de cette table, dans l'ordre de l'horloge. */
  reservations: Array<ReservationSalle & { debutMinutes: number }>;
  /** Couverts servis sur la période — la somme des effectifs. */
  couvertsServis: number;
}

export interface VueService {
  tables: ServiceTable[];
  /** Réservations vivantes SANS table — un Moment, ou une donnée abîmée. */
  orphelines: ReservationSalle[];
  couvertsServis: number;
  /** Couverts offerts par les tables ACTIVES. */
  couvertsOfferts: number;
  reservationsVivantes: number;
}

/**
 * LA VUE DE SERVICE : chaque table, ce qu'elle porte, dans l'ordre de l'heure.
 *
 * `minutesDe` est injectée plutôt que calculée : la conversion d'un instant
 * absolu en heure locale demande le fuseau du commerce, qui vit dans
 * `agenda-vues.ts`. La passer garde ce module libre de toute dépendance à
 * `Intl`, donc testable sans fuseau réel.
 */
export function vueService(
  tables: readonly TableSalle[],
  reservations: readonly ReservationSalle[],
  minutesDe: (iso: string) => number | null,
): VueService {
  const parTable = new Map<string, ServiceTable>();
  for (const table of tables) {
    parTable.set(table.id, { table, reservations: [], couvertsServis: 0 });
  }

  const orphelines: ReservationSalle[] = [];
  let couvertsServis = 0;
  let vivantes = 0;

  for (const reservation of reservations) {
    if (!occupeLaTable(reservation.statut)) continue;
    vivantes += 1;
    couvertsServis += reservation.effectif;

    const ligne = reservation.tableId ? parTable.get(reservation.tableId) : undefined;
    if (!ligne) {
      // Table inconnue ou absente : on la MONTRE à part plutôt que de la
      // laisser tomber. Une réservation qui disparaît de l'écran du service
      // est un client qu'on n'attend pas.
      orphelines.push(reservation);
      continue;
    }

    const debutMinutes = minutesDe(reservation.startsAt);
    if (debutMinutes === null) {
      orphelines.push(reservation);
      continue;
    }
    ligne.reservations.push({ ...reservation, debutMinutes });
    ligne.couvertsServis += reservation.effectif;
  }

  for (const ligne of parTable.values()) {
    ligne.reservations.sort((a, b) => a.debutMinutes - b.debutMinutes);
  }

  return {
    // Les tables dans l'ordre du commerçant : sa position, puis son nom.
    tables: [...parTable.values()].sort(
      (a, b) => a.table.nom.localeCompare(b.table.nom, "fr"),
    ),
    orphelines,
    couvertsServis,
    couvertsOfferts: tables
      .filter((t) => t.active)
      .reduce((total, t) => total + t.couverts, 0),
    reservationsVivantes: vivantes,
  };
}

/**
 * Le plus grand effectif encore plaçable, à une heure donnée.
 *
 * MIROIR de `reservation_tables_state` : on rend le plus grand nombre de
 * couverts d'une table LIBRE, et non la somme des places restantes. Douze
 * couverts libres sur six tables de deux ne prennent pas un groupe de quatre,
 * et annoncer « 12 places » l'aurait laissé croire.
 */
export function effectifPlacable(
  tables: readonly TableSalle[],
  occupees: ReadonlySet<string>,
): number {
  let max = 0;
  for (const table of tables) {
    if (!table.active || occupees.has(table.id)) continue;
    if (table.couverts > max) max = table.couverts;
  }
  return max;
}

/**
 * Les tables occupées à un instant donné, d'après les réservations vivantes.
 *
 * `dureeMinutes` est la durée d'occupation de l'activité : c'est elle, et non
 * la longueur du créneau, qui décide de ce qui est pris.
 */
export function tablesOccupeesA(
  reservations: readonly (ReservationSalle & { debutMinutes: number })[],
  instantMinutes: number,
  dureeMinutes: number,
): Set<string> {
  const occupees = new Set<string>();
  for (const reservation of reservations) {
    if (!occupeLaTable(reservation.statut) || !reservation.tableId) continue;
    if (
      occupationsSeChevauchent(reservation.debutMinutes, instantMinutes, dureeMinutes)
    ) {
      occupees.add(reservation.tableId);
    }
  }
  return occupees;
}

/**
 * CE QUI MANQUE POUR OUVRIR LA SALLE — l'assistant par étapes le lit.
 *
 * Les quatre réglages sont ordonnés comme le commerçant les pose, et non comme
 * la base les stocke : on décrit d'abord QUAND on ouvre, puis AVEC QUOI, puis
 * COMBIEN DE TEMPS on garde la table. Chaque étape ne s'ouvre que si la
 * précédente est faite — un plan de salle sans horaires n'engendre rien.
 */
export type EtapeSalle = "horaires" | "tables" | "service" | "ouverture";

export interface EtatEtapeSalle {
  cle: EtapeSalle;
  titre: string;
  /** Ce qu'il reste à faire, ou `null` si l'étape est complète. */
  manque: string | null;
  faite: boolean;
}

export function etapesSalle(input: {
  nombreDePlages: number;
  tables: readonly TableSalle[];
  dureeServiceMinutes: number | null;
  pasMinutes: number | null;
  creneauxOuverts: number;
}): EtatEtapeSalle[] {
  const tablesActives = input.tables.filter((t) => t.active);

  const horairesFaites = input.nombreDePlages > 0;
  const tablesFaites = tablesActives.length > 0;
  const serviceFait =
    input.dureeServiceMinutes !== null &&
    input.dureeServiceMinutes > 0 &&
    input.pasMinutes !== null &&
    input.pasMinutes > 0;

  return [
    {
      cle: "horaires",
      titre: "Vos horaires d'ouverture",
      manque: horairesFaites
        ? null
        : "Ajoutez au moins une plage — par exemple le vendredi de 19 h à 22 h.",
      faite: horairesFaites,
    },
    {
      cle: "tables",
      titre: "Votre salle",
      manque: tablesFaites
        ? null
        : "Ajoutez vos tables et le nombre de couverts de chacune.",
      faite: tablesFaites,
    },
    {
      cle: "service",
      titre: "La durée d'un service",
      manque: serviceFait
        ? null
        : "Indiquez combien de temps une table reste occupée, et tous les combien vous proposez une heure.",
      faite: serviceFait,
    },
    {
      cle: "ouverture",
      titre: "Ouvrir aux réservations",
      manque:
        input.creneauxOuverts > 0
          ? null
          : horairesFaites && tablesFaites && serviceFait
            ? "Tout est prêt : générez vos créneaux pour ouvrir."
            : "Terminez les étapes précédentes.",
      faite: input.creneauxOuverts > 0,
    },
  ];
}

/** « 40 couverts sur 8 tables » — ce que le commerçant lit en tête d'écran. */
export function libelleSalle(tables: readonly TableSalle[]): string {
  const actives = tables.filter((t) => t.active);
  if (actives.length === 0) return "Aucune table";
  const couverts = actives.reduce((total, t) => total + t.couverts, 0);
  return `${couverts} couvert${couverts > 1 ? "s" : ""} sur ${actives.length} table${actives.length > 1 ? "s" : ""}`;
}

/** « 1 h 30 » — une durée de service lisible, jamais « 90 minutes ». */
export function dureeService(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/** Issues de `reserve_table`, telles que l'écran les reçoit. */
export type EtatReservationTable =
  | {
      state: "reserved";
      reservationId: string;
      code: string;
      effectif: number;
      table: string | null;
    }
  | { state: "full" }
  | { state: "invalid_party_size" }
  | { state: "invalid_email" }
  | { state: "unavailable" };

export function mapReserveTable(brut: unknown): EtatReservationTable {
  if (typeof brut !== "object" || brut === null) return { state: "unavailable" };
  const r = brut as Record<string, unknown>;

  if (
    r.state === "reserved" &&
    typeof r.reservation_id === "string" &&
    typeof r.code === "string"
  ) {
    return {
      state: "reserved",
      reservationId: r.reservation_id,
      code: r.code,
      effectif: typeof r.party_size === "number" ? r.party_size : 1,
      table: typeof r.table_name === "string" ? r.table_name : null,
    };
  }
  for (const etat of ["full", "invalid_party_size", "invalid_email"] as const) {
    if (r.state === etat) return { state: etat };
  }
  return { state: "unavailable" };
}

/**
 * La phrase que le CLIENT lit après un refus.
 *
 * `full` ne dit pas « complet » sèchement : c'est le moment où on lui propose
 * la liste d'attente, et la phrase doit l'y conduire. C'est la seule issue
 * utile quand aucune table n'est assez grande.
 */
export const PHRASES_RESERVATION: Record<EtatReservationTable["state"], string> = {
  reserved: "",
  full:
    "Plus aucune table de cette taille à cette heure-là. Laissez-nous votre email : vous serez prévenu en priorité si une place se libère.",
  invalid_party_size: "Indiquez combien vous serez, entre 1 et 30 personnes.",
  invalid_email: "Cette adresse email ne semble pas valide.",
  unavailable:
    "Ce créneau n'est plus disponible. Choisissez-en un autre dans la liste.",
};
