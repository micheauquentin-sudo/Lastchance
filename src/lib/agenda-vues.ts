/**
 * L'AGENDA DU COMMERÇANT — les quatre vues (RDV-3).
 *
 * Module PUR : ni `server-only`, ni base, ni DOM, ni `Date.now()` implicite.
 * L'instant de référence est TOUJOURS passé en argument — un module d'agenda
 * qui lit l'horloge lui-même ne se teste qu'à l'heure où on le lance.
 *
 * ── LE FUSEAU EST CELUI DU COMMERCE, ET IL DÉCIDE SEUL ──
 *
 * `reservation_slots.starts_at` est un INSTANT ABSOLU. « Le mardi 9 h » n'est
 * pas une donnée, c'est un RENDU — et le rendu se fait dans le fuseau de
 * l'organisation, jamais dans celui du navigateur. Un commerçant à Paris qui
 * ouvre son agenda depuis un train en Espagne doit voir SES heures.
 *
 * Tout le fichier repose donc sur une seule primitive, `partsDansFuseau`, qui
 * décompose un instant en (année, mois, jour, heure, minute) LOCAUX via
 * `Intl.DateTimeFormat`. C'est la seule façon correcte en JavaScript : les
 * méthodes `getFullYear()` d'un `Date` rendent le fuseau du NAVIGATEUR, et un
 * décalage fixe se trompe deux fois par an.
 */

export type EchelleAgenda = "jour" | "semaine" | "mois" | "annee";

/**
 * Les en-têtes de colonnes, LUNDI D'ABORD — même ordre que `jourSemaineDeCle`
 * et que `reservation_openings.weekday`. Un seul ordre dans tout le module :
 * deux conventions auraient fini par se croiser sur une grille décalée d'un
 * jour, le défaut le plus difficile à voir dans un calendrier.
 */
export const JOURS_COURTS = [
  "Lun",
  "Mar",
  "Mer",
  "Jeu",
  "Ven",
  "Sam",
  "Dim",
] as const;

export const ECHELLES: ReadonlyArray<{ cle: EchelleAgenda; label: string }> = [
  { cle: "jour", label: "Jour" },
  { cle: "semaine", label: "Semaine" },
  { cle: "mois", label: "Mois" },
  { cle: "annee", label: "Année" },
];

/** Un créneau, réduit à ce que l'agenda a besoin de savoir. */
export interface CreneauAgenda {
  id: string;
  /** Instant ABSOLU, tel que la base le porte. */
  startsAt: string;
  endsAt: string;
  capacity: number;
  /** Réservations VIVANTES — `confirmed` ET `checked_in`. */
  occupees: number;
  status: "draft" | "open" | "closed";
}

/** Les composantes LOCALES d'un instant, dans un fuseau donné. */
export interface PartsLocales {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
}

/**
 * Décompose un instant ISO en composantes locales d'un fuseau.
 *
 * `Intl.DateTimeFormat` avec `timeZone` est la SEULE primitive de la plateforme
 * qui applique correctement les règles d'un fuseau, changements d'heure
 * compris. On lit ses parties plutôt que de formater une chaîne à reparser.
 */
export function partsDansFuseau(iso: string, timeZone: string): PartsLocales | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;

  try {
    const parties = new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(instant);

    const lire = (type: string): number => {
      const partie = parties.find((p) => p.type === type);
      return partie ? Number(partie.value) : Number.NaN;
    };

    const parts = {
      annee: lire("year"),
      mois: lire("month"),
      jour: lire("day"),
      // `hour12: false` peut rendre 24 pour minuit selon la plateforme : on le
      // ramène à 0, sans quoi une heure de plus apparaîtrait dans la journée.
      heure: lire("hour") % 24,
      minute: lire("minute"),
    };
    return Object.values(parts).every(Number.isFinite) ? parts : null;
  } catch {
    // Fuseau inconnu : l'appelant retombera sur son défaut plutôt que de
    // planter un écran entier pour une chaîne mal saisie.
    return null;
  }
}

/** `2026-09-08` — la clé de journée, dans le fuseau du commerce. */
export function cleJour(parts: PartsLocales): string {
  return `${parts.annee}-${String(parts.mois).padStart(2, "0")}-${String(parts.jour).padStart(2, "0")}`;
}

/** `09:30` — l'heure locale d'un créneau. */
export function heureLocale(parts: PartsLocales): string {
  return `${String(parts.heure).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Le jour de la semaine d'une clé `YYYY-MM-DD`, 0 = LUNDI.
 *
 * On construit un `Date` en UTC à MIDI, et non à minuit : minuit d'un jour
 * local peut tomber la veille en UTC selon le fuseau, et le jour de semaine
 * se décalerait d'un cran. Midi laisse douze heures de marge de chaque côté,
 * ce qu'aucun fuseau habité ne dépasse.
 */
export function jourSemaineDeCle(cle: string): number {
  const [a, m, j] = cle.split("-").map(Number);
  const date = new Date(Date.UTC(a, m - 1, j, 12));
  return (date.getUTCDay() + 6) % 7;
}

/** Ajoute des jours à une clé `YYYY-MM-DD`, sans jamais quitter le calendrier. */
export function decalerCle(cle: string, jours: number): string {
  const [a, m, j] = cle.split("-").map(Number);
  const date = new Date(Date.UTC(a, m - 1, j, 12));
  date.setUTCDate(date.getUTCDate() + jours);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Le lundi de la semaine d'une clé. */
export function lundiDeLaSemaine(cle: string): string {
  return decalerCle(cle, -jourSemaineDeCle(cle));
}

/** Le premier jour du mois d'une clé. */
export function premierDuMois(cle: string): string {
  const [a, m] = cle.split("-");
  return `${a}-${m}-01`;
}

/** Nombre de jours du mois d'une clé. */
export function joursDansLeMois(cle: string): number {
  const [a, m] = cle.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0, 12)).getUTCDate();
}

/**
 * LA FENÊTRE d'une échelle, autour d'une clé d'ancrage — bornes INCLUSES.
 *
 * C'est cette fenêtre qui décide ce que l'écran demande à la base : une vue
 * « année » ne charge pas douze mois de créneaux un par un, elle demande une
 * fois du 1er janvier au 31 décembre.
 */
export function fenetre(
  echelle: EchelleAgenda,
  ancre: string,
): { debut: string; fin: string } {
  switch (echelle) {
    case "jour":
      return { debut: ancre, fin: ancre };
    case "semaine": {
      const lundi = lundiDeLaSemaine(ancre);
      return { debut: lundi, fin: decalerCle(lundi, 6) };
    }
    case "mois": {
      const premier = premierDuMois(ancre);
      return { debut: premier, fin: decalerCle(premier, joursDansLeMois(ancre) - 1) };
    }
    case "annee": {
      const [a] = ancre.split("-");
      return { debut: `${a}-01-01`, fin: `${a}-12-31` };
    }
  }
}

/** Le pas de navigation « précédent / suivant » d'une échelle. */
export function decaler(echelle: EchelleAgenda, ancre: string, sens: -1 | 1): string {
  switch (echelle) {
    case "jour":
      return decalerCle(ancre, sens);
    case "semaine":
      return decalerCle(ancre, 7 * sens);
    case "mois": {
      const [a, m] = ancre.split("-").map(Number);
      // On vise le 1er du mois voisin AVANT de replacer le quantième : le 31
      // mars + 1 mois n'est pas le 31 avril. L'ancre d'un mois n'a de toute
      // façon besoin que de désigner le bon mois.
      const date = new Date(Date.UTC(a, m - 1 + sens, 1, 12));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
    }
    case "annee": {
      const [a, reste] = [ancre.slice(0, 4), ancre.slice(4)];
      return `${Number(a) + sens}${reste}`;
    }
  }
}

// ────────────────────────────────────────────────────────────
// Le regroupement
// ────────────────────────────────────────────────────────────

export interface JourAgenda {
  /** `YYYY-MM-DD`, dans le fuseau du commerce. */
  cle: string;
  /** 0 = lundi. */
  jourSemaine: number;
  creneaux: Array<CreneauAgenda & { heure: string }>;
  /** Places offertes par les créneaux OUVERTS de la journée. */
  capacite: number;
  /** Places prises, tous statuts de créneau confondus. */
  occupees: number;
}

/**
 * Répartit des créneaux par journée LOCALE, dans l'ordre de l'horloge.
 *
 * Un créneau dont l'instant ne se décompose pas (date illisible, fuseau
 * inconnu) est ÉCARTÉ plutôt que rangé au hasard : le poser dans une journée
 * arbitraire ferait compter une place là où il n'y en a pas.
 */
export function grouperParJour(
  creneaux: readonly CreneauAgenda[],
  timeZone: string,
): Map<string, JourAgenda> {
  const jours = new Map<string, JourAgenda>();

  for (const creneau of creneaux) {
    const parts = partsDansFuseau(creneau.startsAt, timeZone);
    if (!parts) continue;
    const cle = cleJour(parts);

    const jour = jours.get(cle) ?? {
      cle,
      jourSemaine: jourSemaineDeCle(cle),
      creneaux: [],
      capacite: 0,
      occupees: 0,
    };
    jour.creneaux.push({ ...creneau, heure: heureLocale(parts) });
    // La capacité ne compte QUE les créneaux ouverts : un brouillon ou un
    // créneau fermé n'offre aucune place, et l'inclure ferait lire un taux de
    // remplissage faussement bas.
    if (creneau.status === "open") jour.capacite += creneau.capacity;
    jour.occupees += creneau.occupees;
    jours.set(cle, jour);
  }

  for (const jour of jours.values()) {
    jour.creneaux.sort((a, b) => a.heure.localeCompare(b.heure));
  }
  return jours;
}

/** Les journées d'une fenêtre, VIDES COMPRISES — un agenda montre les trous. */
export function joursDeLaFenetre(
  bornes: { debut: string; fin: string },
  jours: Map<string, JourAgenda>,
): JourAgenda[] {
  const sortie: JourAgenda[] = [];
  let cle = bornes.debut;
  // Borne de sécurité : 366 journées couvrent l'année bissextile, et empêchent
  // une fenêtre mal formée de boucler sans fin.
  for (let i = 0; i <= 366 && cle <= bornes.fin; i++) {
    sortie.push(
      jours.get(cle) ?? {
        cle,
        jourSemaine: jourSemaineDeCle(cle),
        creneaux: [],
        capacite: 0,
        occupees: 0,
      },
    );
    cle = decalerCle(cle, 1);
  }
  return sortie;
}

export interface MoisAgenda {
  /** `YYYY-MM`. */
  cle: string;
  mois: number;
  annee: number;
  creneaux: number;
  capacite: number;
  occupees: number;
  /** Journées AYANT au moins un créneau — la « densité » du mois. */
  joursOuverts: number;
}

/** L'échelle ANNÉE ne montre pas 365 journées : elle montre douze mois. */
export function grouperParMois(jours: Iterable<JourAgenda>): MoisAgenda[] {
  const mois = new Map<string, MoisAgenda>();
  for (const jour of jours) {
    const cle = jour.cle.slice(0, 7);
    const ligne = mois.get(cle) ?? {
      cle,
      annee: Number(cle.slice(0, 4)),
      mois: Number(cle.slice(5, 7)),
      creneaux: 0,
      capacite: 0,
      occupees: 0,
      joursOuverts: 0,
    };
    ligne.creneaux += jour.creneaux.length;
    ligne.capacite += jour.capacite;
    ligne.occupees += jour.occupees;
    if (jour.creneaux.length > 0) ligne.joursOuverts += 1;
    mois.set(cle, ligne);
  }
  return [...mois.values()].sort((a, b) => a.cle.localeCompare(b.cle));
}

// ────────────────────────────────────────────────────────────
// Libellés
// ────────────────────────────────────────────────────────────

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function libelleMois(mois: number): string {
  return MOIS_FR[mois - 1] ?? String(mois);
}

/** Le titre de la période affichée — ce que le commerçant lit en tête d'écran. */
export function libelleFenetre(echelle: EchelleAgenda, ancre: string): string {
  const [a, m, j] = ancre.split("-").map(Number);
  switch (echelle) {
    case "jour":
      return `${j} ${libelleMois(m)} ${a}`;
    case "semaine": {
      const bornes = fenetre("semaine", ancre);
      const [, mDebut, jDebut] = bornes.debut.split("-").map(Number);
      const [aFin, mFin, jFin] = bornes.fin.split("-").map(Number);
      return mDebut === mFin
        ? `${jDebut} – ${jFin} ${libelleMois(mFin)} ${aFin}`
        : `${jDebut} ${libelleMois(mDebut)} – ${jFin} ${libelleMois(mFin)} ${aFin}`;
    }
    case "mois":
      return `${libelleMois(m)} ${a}`;
    case "annee":
      return String(a);
  }
}

/**
 * Le taux de remplissage d'une journée ou d'un mois, en pourcentage entier.
 *
 * `null` quand rien n'est ouvert — et NON zéro : « 0 % rempli » se lit comme un
 * échec commercial, alors que la journée est simplement fermée.
 */
export function remplissage(capacite: number, occupees: number): number | null {
  if (capacite <= 0) return null;
  return Math.min(100, Math.round((occupees / capacite) * 100));
}

/** La classe de densité d'une case de calendrier — quatre paliers lisibles. */
export type Densite = "vide" | "calme" | "actif" | "complet";

export function densite(capacite: number, occupees: number): Densite {
  if (capacite <= 0) return "vide";
  const taux = occupees / capacite;
  if (taux >= 1) return "complet";
  if (taux >= 0.5) return "actif";
  return "calme";
}
