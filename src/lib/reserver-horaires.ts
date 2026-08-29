/**
 * LES HORAIRES RÉCURRENTS, CÔTÉ APPLICATIF (RDV-1).
 *
 * Module PUR : ni `server-only`, ni accès base, ni DOM. Il est lu par l'écran
 * de réglage du commerçant comme par l'aperçu qui lui montre ce que sa grille
 * va donner — et il se teste sans horloge ni fuseau réel.
 *
 * ── CE QU'IL DOIT ÊTRE, ET CE QU'IL N'EST PAS ──
 *
 * Il RÉPLIQUE le découpage de `generate_reservation_slots` pour montrer au
 * commerçant, avant qu'il n'enregistre, combien de créneaux ses horaires vont
 * produire. Il n'est PAS l'autorité : la base engendre, seule, et c'est elle
 * qui applique les fermetures, l'horizon et le délai de prévenance. Un écart
 * entre l'aperçu et le résultat serait un défaut ici, jamais là-bas.
 *
 * La règle qui rend cette réplique tenable : le découpage d'UNE plage en
 * créneaux est arithmétique pure — début, fin, durée — et ne dépend ni du
 * fuseau ni de la date. C'est exactement ce que cette fonction calcule, et
 * rien de plus.
 */

/** Les bornes, miroir des `check` de la migration 20261106120000. */
export const MINUTES_JOUR = 1440;
export const HORAIRE_MINUTE_MIN = 0;
export const HORAIRE_MINUTE_MAX = MINUTES_JOUR;
export const HORIZON_MIN = 1;
export const HORIZON_MAX = 180;
export const HORIZON_DEFAUT = 30;
export const DELAI_PREVENANCE_MAX = 20160;
export const CAPACITE_CRENEAU_MIN = 1;
export const CAPACITE_CRENEAU_MAX = 1000;

/**
 * 0 = LUNDI, comme la colonne `weekday`. Le calendrier français commence le
 * lundi, et l'écran comme la génération lisent cet ordre : caler sur le
 * dimanche de `date_part('dow')` aurait imposé une conversion à chaque
 * lecture — donc une occasion de se tromper. La conversion vit à UN endroit,
 * dans le générateur SQL.
 */
export const JOURS_SEMAINE = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export type JourSemaine = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlageHoraire {
  /** 0 = lundi. */
  weekday: JourSemaine;
  /** Minutes depuis minuit, heure LOCALE du commerce. */
  debut: number;
  fin: number;
}

export interface PlageHoraireIdentifiee extends PlageHoraire {
  id: string;
}

export interface Fermeture {
  id: string;
  /** `YYYY-MM-DD`, jour local, borne INCLUSE. */
  debut: string;
  fin: string;
  motif: string | null;
}

/** `540` → `"09:00"`. `1440` → `"24:00"`, qui est minuit du lendemain. */
export function minutesVersHeure(minutes: number): string {
  const borne = Math.max(0, Math.min(MINUTES_JOUR, Math.round(minutes)));
  const h = Math.floor(borne / 60);
  const m = borne % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * `"09:00"` → `540`. Rend `null` sur tout ce qui n'est pas une heure — un
 * champ vidé, un texte, `"25:00"`. L'appelant décide quoi en dire ; cette
 * fonction ne devine jamais une valeur de repli.
 */
export function heureVersMinutes(valeur: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(heures) || !Number.isInteger(minutes)) return null;
  if (minutes > 59) return null;
  const total = heures * 60 + minutes;
  return total >= 0 && total <= MINUTES_JOUR ? total : null;
}

export function libelleJour(weekday: number): string {
  return JOURS_SEMAINE[weekday] ?? `Jour ${weekday}`;
}

/** « 09:00 → 12:30 ». */
export function libellePlage(plage: PlageHoraire): string {
  return `${minutesVersHeure(plage.debut)} → ${minutesVersHeure(plage.fin)}`;
}

/**
 * Combien de créneaux une plage produit, pour une durée donnée.
 *
 * MIROIR EXACT du `generate_series(debut, fin - duree, duree)` du générateur :
 * le dernier départ possible est celui dont la FIN tient encore dans la plage.
 * Une plage de 9 h à 11 h en 30 minutes rend 4 créneaux, pas 5 — celui de
 * 11 h 00 déborderait.
 */
export function creneauxDansPlage(plage: PlageHoraire, dureeMinutes: number): number {
  if (dureeMinutes <= 0) return 0;
  const largeur = plage.fin - plage.debut;
  if (largeur < dureeMinutes) return 0;
  return Math.floor(largeur / dureeMinutes);
}

/** Les heures de départ d'une plage, pour l'aperçu détaillé d'une journée. */
export function departsDansPlage(
  plage: PlageHoraire,
  dureeMinutes: number,
): number[] {
  const combien = creneauxDansPlage(plage, dureeMinutes);
  return Array.from({ length: combien }, (_, i) => plage.debut + i * dureeMinutes);
}

/**
 * Deux plages du même jour se chevauchent-elles ?
 *
 * Bornes MI-OUVERTES : « 9 h → 12 h » et « 12 h → 14 h » ne se chevauchent
 * pas, elles se touchent. Les traiter comme un conflit aurait interdit la
 * façon la plus naturelle d'écrire une journée continue en deux morceaux.
 */
export function plagesSeChevauchent(a: PlageHoraire, b: PlageHoraire): boolean {
  if (a.weekday !== b.weekday) return false;
  return a.debut < b.fin && b.debut < a.fin;
}

/**
 * Ce qui empêche une plage d'être enregistrée. `null` = elle est valide.
 *
 * Les messages sont ceux que le commerçant lit : ils disent quoi corriger, pas
 * quelle contrainte a été violée.
 */
export function refusPlage(
  plage: PlageHoraire,
  existantes: readonly PlageHoraire[],
): string | null {
  if (plage.debut < HORAIRE_MINUTE_MIN || plage.debut >= MINUTES_JOUR) {
    return "L'heure de début n'est pas valide.";
  }
  if (plage.fin <= HORAIRE_MINUTE_MIN || plage.fin > HORAIRE_MINUTE_MAX) {
    return "L'heure de fin n'est pas valide.";
  }
  if (plage.fin <= plage.debut) {
    return "La fin doit être après le début.";
  }
  if (existantes.some((autre) => plagesSeChevauchent(plage, autre))) {
    return `Cette plage en chevauche une autre le ${libelleJour(plage.weekday).toLowerCase()}.`;
  }
  return null;
}

/**
 * L'APERÇU : ce que la semaine type produit, avant tout enregistrement.
 *
 * On ne rend PAS une projection sur l'horizon réel — elle dépendrait des
 * fermetures, du délai de prévenance et de la date du jour, c'est-à-dire de
 * tout ce que la base sait mieux que nous. On rend la SEMAINE TYPE, qui est
 * exactement ce que le commerçant vient de saisir et la seule chose qu'il
 * puisse relire.
 */
export interface ApercuSemaine {
  /** Par jour, dans l'ordre lundi → dimanche. */
  jours: Array<{
    weekday: JourSemaine;
    libelle: string;
    plages: PlageHoraire[];
    creneaux: number;
    minutesOuvertes: number;
  }>;
  /** Créneaux d'une semaine type — jamais « sur l'horizon ». */
  creneauxParSemaine: number;
  minutesOuvertesParSemaine: number;
  /** Aucun horaire posé : l'écran doit le dire plutôt qu'afficher des zéros. */
  vide: boolean;
}

export function apercuSemaine(
  plages: readonly PlageHoraire[],
  dureeMinutes: number,
): ApercuSemaine {
  const jours = JOURS_SEMAINE.map((libelle, index) => {
    const weekday = index as JourSemaine;
    const duJour = plages
      .filter((p) => p.weekday === weekday)
      .sort((a, b) => a.debut - b.debut);
    return {
      weekday,
      libelle,
      plages: duJour,
      creneaux: duJour.reduce(
        (total, p) => total + creneauxDansPlage(p, dureeMinutes),
        0,
      ),
      minutesOuvertes: duJour.reduce((total, p) => total + (p.fin - p.debut), 0),
    };
  });

  return {
    jours,
    creneauxParSemaine: jours.reduce((total, j) => total + j.creneaux, 0),
    minutesOuvertesParSemaine: jours.reduce(
      (total, j) => total + j.minutesOuvertes,
      0,
    ),
    vide: plages.length === 0,
  };
}

/**
 * « 3 h 30 » — une durée d'ouverture lisible. Jamais « 210 minutes », qu'aucun
 * commerçant ne convertit de tête.
 */
export function dureeLisibleMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Ce qui manque pour qu'une activité puisse engendrer ses créneaux.
 *
 * MIROIR des refus de `generate_reservation_slots` — `not_rendez_vous`,
 * `incomplete` — mais rendu en phrases : l'écran doit dire quoi faire, pas
 * répéter le code d'état de la base.
 */
export interface EtatGeneration {
  /** Le bouton « Générer » est-il actionnable ? */
  possible: boolean;
  /** Ce qui bloque, s'il y a lieu. */
  raison: string | null;
}

export function etatGeneration(input: {
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  plages: readonly PlageHoraire[];
}): EtatGeneration {
  if (input.bookingMode !== "rendez_vous") {
    return {
      possible: false,
      raison:
        "Cette activité est un Moment : ses créneaux se posent un par un. Passez-la en prise de rendez-vous pour utiliser des horaires.",
    };
  }
  if (input.dureeMinutes === null || input.dureeMinutes <= 0) {
    return { possible: false, raison: "Indiquez la durée d'un rendez-vous." };
  }
  if (input.capacite === null || input.capacite < CAPACITE_CRENEAU_MIN) {
    return {
      possible: false,
      raison:
        "Indiquez combien de personnes tiennent sur un créneau (1 pour un rendez-vous individuel).",
    };
  }
  if (input.plages.length === 0) {
    return {
      possible: false,
      raison: "Ajoutez au moins une plage horaire.",
    };
  }
  if (
    input.plages.every((p) => creneauxDansPlage(p, input.dureeMinutes ?? 0) === 0)
  ) {
    return {
      possible: false,
      raison:
        "Aucune de vos plages n'est assez longue pour un rendez-vous : allongez-les, ou raccourcissez la durée.",
    };
  }
  return { possible: true, raison: null };
}

/** Issues de `generate_reservation_slots`, telles que l'écran les reçoit. */
export type EtatGenerationServeur =
  | { state: "ok"; crees: number; retires: number; horizonJusquau: string | null }
  | { state: "unavailable" }
  | { state: "not_authorized" }
  | { state: "not_rendez_vous" }
  | { state: "incomplete" };

export function mapGenerationSlots(brut: unknown): EtatGenerationServeur {
  if (typeof brut !== "object" || brut === null) return { state: "unavailable" };
  const r = brut as Record<string, unknown>;
  if (r.state === "ok") {
    return {
      state: "ok",
      crees: typeof r.created === "number" ? r.created : 0,
      retires: typeof r.removed === "number" ? r.removed : 0,
      horizonJusquau:
        typeof r.horizon_until === "string" ? r.horizon_until : null,
    };
  }
  for (const etat of ["not_authorized", "not_rendez_vous", "incomplete"] as const) {
    if (r.state === etat) return { state: etat };
  }
  return { state: "unavailable" };
}

/** La phrase que le commerçant lit après une génération. */
export function phraseGeneration(etat: EtatGenerationServeur): string {
  switch (etat.state) {
    case "ok": {
      if (etat.crees === 0 && etat.retires === 0) {
        return "Vos créneaux étaient déjà à jour : rien n'a changé.";
      }
      const morceaux: string[] = [];
      if (etat.crees > 0) {
        morceaux.push(`${etat.crees} créneau${etat.crees > 1 ? "x" : ""} ouvert${etat.crees > 1 ? "s" : ""}`);
      }
      if (etat.retires > 0) {
        morceaux.push(
          `${etat.retires} retiré${etat.retires > 1 ? "s" : ""} (aucun n'était réservé)`,
        );
      }
      return `${morceaux.join(", ")}.`;
    }
    case "not_rendez_vous":
      return "Cette activité n'est pas en prise de rendez-vous.";
    case "incomplete":
      return "Il manque la durée ou la capacité d'un rendez-vous.";
    case "not_authorized":
    case "unavailable":
      return "Génération impossible, réessayez.";
  }
}
