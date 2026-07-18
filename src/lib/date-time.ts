const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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
