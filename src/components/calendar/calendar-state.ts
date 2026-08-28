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
 * Une case OUVERTE qui ne donnait rien : type `content` sans texte.
 *
 * Miroir côté joueur de `caseVide` (src/lib/activation/calendar.ts), qui lit la
 * forme BASE (`content_type` / `content_text`) alors qu'ici on lit la forme
 * PUBLIQUE. Même règle, deux formes : une case `content` sans texte est LÉGALE
 * et signifie « pas de chance » — le commerçant n'a plus à garnir 24 cases pour
 * ouvrir son calendrier, et le joueur doit lire une vraie issue perdante plutôt
 * qu'un « Bonne journée ! » de remplissage qui laisse croire à un oubli.
 */
export function calendarDaySansGain(day: {
  contentType: string | null;
  contentText: string | null;
}): boolean {
  return day.contentType === "content" && !(day.contentText ?? "").trim();
}

/**
 * La consolation d'une case perdante : ce qui RESTE à ouvrir. Le seul gain
 * d'une case vide est l'assiduité — on la nomme, chiffres à l'appui.
 */
export function calendarConsolation(progress: CalendarProgress): string {
  if (progress.complete) {
    return "Vous avez ouvert toutes les cases — bravo pour votre assiduité !";
  }
  if (progress.remaining === 1) {
    return "Il reste 1 case à ouvrir : la dernière est peut-être la bonne !";
  }
  if (progress.remaining > 1) {
    return `Il reste ${progress.remaining} cases à ouvrir : la prochaine sera peut-être la bonne !`;
  }
  return "Revenez ouvrir la prochaine case !";
}

/**
 * LA PROCHAINE CASE À OUVRIR — ce qui transforme « revenez » en rendez-vous.
 *
 * Une consolation qui dit « revenez demain » demande au joueur de retenir
 * quelque chose ; une qui NOMME le jour ne demande rien. C'est la seule
 * différence entre les deux, et c'est toute la différence.
 *
 * On rend l'ISO BRUT et non un libellé : le formatage dépend du fuseau du
 * NAVIGATEUR (`formatCalendarUnlock` le dit), il ne peut donc pas se décider
 * dans une fonction pure partagée avec le serveur.
 *
 * La case retenue est la première NON OUVERTE dont l'heure n'est pas encore
 * passée. Une case déjà ouvrable n'en est pas une : le joueur peut l'ouvrir
 * MAINTENANT, l'annoncer pour plus tard serait faux. `null` quand il n'en
 * reste aucune — la grille est finie, ou tout est déjà déverrouillé.
 */
export function prochaineOuverture(
  days: ReadonlyArray<{ status: CalendarBoxState; unlockAt: string | null }>,
  now: Date = new Date(),
): string | null {
  let meilleure: { iso: string; at: number } | null = null;
  for (const day of days) {
    if (day.status === "opened" || !day.unlockAt) continue;
    const at = Date.parse(day.unlockAt);
    if (Number.isNaN(at) || at <= now.getTime()) continue;
    if (!meilleure || at < meilleure.at) meilleure = { iso: day.unlockAt, at };
  }
  return meilleure ? meilleure.iso : null;
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
