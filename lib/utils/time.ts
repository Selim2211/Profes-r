// Turkey has used a fixed UTC+3 offset since 2016 (no daylight saving), so "today" and "this month"
// for the user start at midnight +03:00.
const ISTANBUL_OFFSET_HOURS = 3;
const HOUR_MS = 3_600_000;

function istanbulParts(now: Date) {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_HOURS * HOUR_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

export function startOfDayIstanbul(now: Date = new Date()): Date {
  const { year, month, day } = istanbulParts(now);
  return new Date(Date.UTC(year, month, day) - ISTANBUL_OFFSET_HOURS * HOUR_MS);
}

export function startOfMonthIstanbul(now: Date = new Date()): Date {
  const { year, month } = istanbulParts(now);
  return new Date(Date.UTC(year, month, 1) - ISTANBUL_OFFSET_HOURS * HOUR_MS);
}
