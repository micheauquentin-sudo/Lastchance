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
export function wheelMatchesNow(w: ScheduledWheel, now: Date): boolean {
  const days = w.schedule_days;
  if (days != null && days.length > 0 && !days.includes(now.getDay())) {
    return false;
  }

  const start = w.schedule_start_hour;
  const end = w.schedule_end_hour;
  if (start == null && end == null) return true;

  const h = now.getHours();
  const s = start ?? 0;
  const e = end ?? 24;
  // Créneau « de nuit » (ex. 22h→2h) : la borne de fin est le lendemain.
  return s <= e ? h >= s && h < e : h >= s || h < e;
}

/**
 * Choisit la roue à servir. Priorité :
 *  1. les roues dont le créneau couvre `now`, planifiées d'abord, puis
 *     par position croissante (ordre défini par le commerçant) ;
 *  2. à défaut, une roue toujours active (sans créneau), par position ;
 *  3. en dernier recours, la roue de plus petite position — /play ne
 *     doit jamais se retrouver sans roue.
 * Retourne null seulement si la liste est vide.
 */
export function selectActiveWheel<T extends ScheduledWheel>(
  wheels: T[],
  now: Date = new Date(),
): T | null {
  if (wheels.length === 0) return null;

  const byPriority = (a: T, b: T) =>
    Number(hasSchedule(b)) - Number(hasSchedule(a)) ||
    a.position - b.position ||
    a.created_at.localeCompare(b.created_at);

  const matching = wheels.filter((w) => wheelMatchesNow(w, now)).sort(byPriority);
  if (matching.length > 0) return matching[0];

  const alwaysOn = wheels
    .filter((w) => !hasSchedule(w))
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  if (alwaysOn.length > 0) return alwaysOn[0];

  return [...wheels].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  )[0];
}
