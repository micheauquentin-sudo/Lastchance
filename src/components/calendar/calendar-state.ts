/**
 * Cœur « pur » de l'affichage du Calendrier côté joueur : état visuel d'une case
 * (verrouillée / ouvrable / ouverte), formatage de la date de déverrouillage, et
 * progression d'assiduité. Aucune dépendance réseau ni server-only — testable en
 * isolation (Vitest), miroir de jackpot-state.ts / loyalty-passport-state.ts.
 */

export type CalendarBoxState = "locked" | "available" | "opened";

/**
 * État VISUEL d'une case. Le serveur est autoritatif (`open_calendar_box` refuse
 * une case en avance), mais entre deux polls le client peut faire passer une case
 * `locked` à `available` dès que l'heure de déverrouillage est atteinte — retour
 * plus vif, sans jamais RÉVÉLER le contenu (qui reste absent tant que la case
 * n'est pas ouverte). Une case déjà `opened` le reste, une case `available` aussi.
 */
export function calendarBoxState(
  day: { status: CalendarBoxState; unlockAt: string | null },
  now: Date = new Date(),
): CalendarBoxState {
  if (day.status === "opened") return "opened";
  if (day.status === "available") return "available";
  // locked : l'heure de déverrouillage a-t-elle été franchie depuis le dernier
  // poll ? Le serveur tranchera l'ouverture réelle.
  if (day.unlockAt) {
    const at = Date.parse(day.unlockAt);
    if (!Number.isNaN(at) && now.getTime() >= at) return "available";
  }
  return "locked";
}

/** Progression d'assiduité : cases ouvertes vers le total. */
export interface CalendarProgress {
  openedCount: number;
  dayCount: number;
  /** Avancement borné [0, 1] (0 si total nul, jamais NaN). */
  ratio: number;
  /** Pourcentage entier [0, 100] pour aria-valuenow. */
  percent: number;
  /** Cases restant à ouvrir (0 si tout est ouvert). */
  remaining: number;
  /** Toutes les cases sont-elles ouvertes ? */
  complete: boolean;
}

export function calendarProgress(
  openedCount: number,
  dayCount: number,
): CalendarProgress {
  const total = Math.max(0, Math.trunc(dayCount));
  const opened = Math.max(0, Math.min(total, Math.trunc(openedCount)));
  const ratio = total > 0 ? opened / total : 0;
  return {
    openedCount: opened,
    dayCount: total,
    ratio,
    percent: Math.round(ratio * 100),
    remaining: Math.max(0, total - opened),
    complete: total > 0 && opened >= total,
  };
}

/**
 * Date de déverrouillage lisible en français, formatée à partir d'un ISO. Rendue
 * uniquement côté client (le fuseau du navigateur diffère de celui du serveur) :
 * `null` pour une entrée absente ou invalide, jamais d'exception.
 *
 * @param withTime inclure l'heure (« lundi 3 décembre à 08:00 ») ou non.
 */
export function formatCalendarUnlock(
  iso: string | null,
  withTime = false,
  locale = "fr-FR",
): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(time));
}
