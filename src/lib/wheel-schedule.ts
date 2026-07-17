/**
 * Sélection de la roue active pour une campagne multi-roues (pur,
 * testable). Chaque roue peut porter un créneau optionnel (jours +
 * plage horaire) ; au moment du jeu, on sert la première roue dont le
 * créneau couvre l'instant courant, en donnant priorité aux roues
 * planifiées sur la roue « toujours active » (celle sans aucun créneau).
 */

export interface ScheduledWheel {
  id: string;
  position: number;
  created_at: string;
  schedule_start_hour: number | null;
  schedule_end_hour: number | null;
  schedule_days: number[] | null;
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Libellé humain d'un créneau (« Lun–Ven · 17h–19h »), pour l'UI. */
export function describeSchedule(w: ScheduledWheel): string {
  if (!hasSchedule(w)) return "Toujours active";

  const parts: string[] = [];
  const days = w.schedule_days;
  if (days && days.length > 0 && days.length < 7) {
    parts.push(
      [...days]
        .sort((a, b) => a - b)
        .map((d) => DAY_LABELS[d] ?? "?")
        .join(", "),
    );
  }

  const s = w.schedule_start_hour;
  const e = w.schedule_end_hour;
  if (s != null || e != null) {
    parts.push(`${s ?? 0}h–${e ?? 24}h`);
  }

  return parts.join(" · ") || "Toujours active";
}

/** La roue porte-t-elle une contrainte de créneau ? */
export function hasSchedule(w: ScheduledWheel): boolean {
  return (
    w.schedule_start_hour != null ||
    w.schedule_end_hour != null ||
    (w.schedule_days != null && w.schedule_days.length > 0)
  );
}

/** Le créneau de la roue couvre-t-il l'instant `now` (heure locale) ? */
function zonedDayAndHour(now: Date, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday ?? "",
  );
  return { day: day < 0 ? 0 : day, hour };
}

export function wheelMatchesNow(
  w: ScheduledWheel,
  now: Date,
  timeZone = "UTC",
): boolean {
  const { day, hour: h } = zonedDayAndHour(now, timeZone);
  const days = w.schedule_days;

  const start = w.schedule_start_hour;
  const end = w.schedule_end_hour;
  if (start == null && end == null) {
    return days == null || days.length === 0 || days.includes(day);
  }

  const s = start ?? 0;
  const e = end ?? 24;
  if (s <= e) {
    return (days == null || days.length === 0 || days.includes(day)) && h >= s && h < e;
  }
  // À 01h le samedi, un créneau vendredi 22h→02h dépend du vendredi.
  const scheduleDay = h < e ? (day + 6) % 7 : day;
  return (
    (days == null || days.length === 0 || days.includes(scheduleDay)) &&
    (h >= s || h < e)
  );
}

/**
 * Choisit la roue à servir. Priorité :
 *  1. les roues dont le créneau couvre `now`, planifiées d'abord, puis
 *     par position croissante (ordre défini par le commerçant) ;
 *  2. à défaut, une roue toujours active (sans créneau), par position ;
 * Si toutes les roues sont hors créneau, aucune n'est servie : un horaire
 * configuré ne peut jamais être contourné par une roue de repli.
 */
export function selectActiveWheel<T extends ScheduledWheel>(
  wheels: T[],
  now: Date = new Date(),
  timeZone = "UTC",
): T | null {
  if (wheels.length === 0) return null;

  const byPriority = (a: T, b: T) =>
    Number(hasSchedule(b)) - Number(hasSchedule(a)) ||
    a.position - b.position ||
    a.created_at.localeCompare(b.created_at);

  const matching = wheels
    .filter((w) => wheelMatchesNow(w, now, timeZone))
    .sort(byPriority);
  if (matching.length > 0) return matching[0];

  const alwaysOn = wheels
    .filter((w) => !hasSchedule(w))
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  if (alwaysOn.length > 0) return alwaysOn[0];

  // Toutes les roues sont planifiées et aucun créneau ne correspond : le jeu
  // doit être indisponible, jamais servir une roue hors horaires.
  return null;
}
