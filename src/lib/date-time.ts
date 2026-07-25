const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseDateOnly(value: string): Pick<DateParts, "year" | "month" | "day"> {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error("Date invalide.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    throw new Error("Date invalide.");
  }
  return { year, month, day };
}

function parseLocalDateTime(value: string): DateParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw new Error("Date et heure invalides.");
  const parts: DateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
  const normalized = new Date(asUtc(parts));
  if (
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() !== parts.month - 1 ||
    normalized.getUTCDate() !== parts.day ||
    normalized.getUTCHours() !== parts.hour ||
    normalized.getUTCMinutes() !== parts.minute ||
    normalized.getUTCSeconds() !== parts.second
  ) {
    throw new Error("Date et heure invalides.");
  }
  return parts;
}

export function isValidDateOnly(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as unknown as DateParts;
}

function asUtc(parts: DateParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function isValidLocalDateTime(value: string): boolean {
  try {
    parseLocalDateTime(value);
    return true;
  } catch {
    return false;
  }
}

function sameParts(left: DateParts, right: DateParts): boolean {
  return asUtc(left) === asUtc(right);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Convertit une heure civile saisie dans un fuseau IANA en instant UTC.
 *
 * Un `datetime-local` ne porte aucun offset. On refuse donc explicitement
 * les heures inexistantes (passage à l'heure d'été) et ambiguës (retour à
 * l'heure d'hiver), au lieu de laisser JavaScript choisir silencieusement.
 */
export function zonedDateTimeToIso(value: string, timeZone: string): string {
  const desired = parseLocalDateTime(value);
  const naiveUtc = asUtc(desired);
  const offsets = new Set<number>();

  // Échantillonne les offsets autour de la date : une transition DST ou un
  // changement exceptionnel de ligne de date se trouve ainsi des deux côtés.
  for (let hours = -48; hours <= 48; hours += 1) {
    const instant = new Date(naiveUtc + hours * 3_600_000);
    const offset = asUtc(zonedParts(instant, timeZone)) - instant.getTime();
    offsets.add(offset);
  }

  const matches = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => sameParts(zonedParts(candidate, timeZone), desired))
    .map((candidate) => candidate.getTime());
  const uniqueMatches = [...new Set(matches)].sort((a, b) => a - b);

  if (uniqueMatches.length === 0) {
    throw new Error(
      `Cette heure n'existe pas dans le fuseau ${timeZone} à cause du changement d'heure.`,
    );
  }
  if (uniqueMatches.length > 1) {
    throw new Error(
      `Cette heure est ambiguë dans le fuseau ${timeZone} à cause du changement d'heure.`,
    );
  }
  return new Date(uniqueMatches[0]).toISOString();
}

/** Formate un instant ISO pour la valeur d'un `datetime-local` dans un fuseau. */
export function isoToZonedDateTimeInput(
  iso: string | null,
  timeZone: string,
): string {
  if (!iso) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Clé `YYYY-MM-DD` correspondant à la date civile d'un instant dans un fuseau. */
export function localDateKey(now: Date, timeZone: string): string {
  const parts = zonedParts(now, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Convertit une date de calendrier en fin de journée dans le fuseau IANA. */
export function endOfLocalDayToIso(value: string, timeZone: string): string {
  const selected = parseDateOnly(value);
  const nextUtcDate = new Date(
    Date.UTC(selected.year, selected.month - 1, selected.day + 1),
  );
  const desired: DateParts = {
    year: nextUtcDate.getUTCFullYear(),
    month: nextUtcDate.getUTCMonth() + 1,
    day: nextUtcDate.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };

  let candidate = asUtc(desired);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const delta = asUtc(desired) - asUtc(zonedParts(new Date(candidate), timeZone));
    candidate += delta;
    if (delta === 0) break;
  }

  const observed = zonedParts(new Date(candidate), timeZone);
  if (asUtc(observed) !== asUtc(desired)) {
    throw new Error("Cette date n'existe pas dans le fuseau sélectionné.");
  }
  return new Date(candidate - 1).toISOString();
}
