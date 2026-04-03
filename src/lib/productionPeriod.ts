import { addDays } from "date-fns";

// ─── Easter (Meeus/Jones/Butcher algorithm) ───────────────────────────────────
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// ─── Czech public holidays ────────────────────────────────────────────────────
function getCzechHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  return [
    new Date(year, 0, 1),    // Nový rok
    addDays(easter, -2),      // Velký pátek
    addDays(easter, 1),       // Velikonoční pondělí
    new Date(year, 4, 1),    // Svátek práce
    new Date(year, 4, 8),    // Den vítězství
    new Date(year, 6, 5),    // Den Cyrila a Metoděje
    new Date(year, 6, 6),    // Den Jana Husa
    new Date(year, 8, 28),   // Den české státnosti
    new Date(year, 9, 28),   // Den vzniku Československa
    new Date(year, 10, 17),  // Den boje za svobodu a demokracii
    new Date(year, 11, 24),  // Štědrý den
    new Date(year, 11, 25),  // 1. svátek vánoční
    new Date(year, 11, 26),  // 2. svátek vánoční
  ];
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(
    (h) =>
      h.getFullYear() === date.getFullYear() &&
      h.getMonth() === date.getMonth() &&
      h.getDate() === date.getDate()
  );
}

function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // weekend
  // Check holidays for this year AND possibly next year (cross-year boundary)
  const holidays = getCzechHolidays(date.getFullYear());
  return !isHoliday(date, holidays);
}

/** Returns the next working day on or after `date`. */
function nextWorkingDay(date: Date): Date {
  let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  while (!isWorkingDay(d)) {
    d = addDays(d, 1);
  }
  return d;
}

// ─── Core period logic ────────────────────────────────────────────────────────

/**
 * Returns the nominal end date of the production period for a given month.
 * December ends on the first working day of January of the following year.
 * All other months end on the 27th, or the next working day if 27th is not a working day.
 *
 * @param year - full year (e.g. 2026)
 * @param month - 0-indexed month (0 = January, 11 = December)
 */
function periodEndForMonth(year: number, month: number): Date {
  if (month === 11) {
    // December special rule: first working day of January next year
    return nextWorkingDay(new Date(year + 1, 0, 1));
  }
  return nextWorkingDay(new Date(year, month, 27));
}

/**
 * Determines which period month (year + 0-indexed month) contains `date`.
 * A period for month M starts the day after month M-1's period ends
 * and closes on month M's period end.
 */
function getPeriodMonth(date: Date): { year: number; month: number } {
  const y = date.getFullYear();
  const m = date.getMonth();

  const currentEnd = periodEndForMonth(y, m);

  if (date <= currentEnd) {
    // Could be in this period or the previous one
    const prevMonth = m === 0 ? 11 : m - 1;
    const prevYear = m === 0 ? y - 1 : y;
    const prevEnd = periodEndForMonth(prevYear, prevMonth);

    if (date > prevEnd) {
      return { year: y, month: m };
    } else {
      // Shouldn't normally happen for "today", but handle gracefully
      return { year: prevYear, month: prevMonth };
    }
  } else {
    // Past this month's period end → already in next month's period
    const nextMonth = m === 11 ? 0 : m + 1;
    const nextYear = m === 11 ? y + 1 : y;
    return { year: nextYear, month: nextMonth };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the end date of the Partners production period containing `date`. */
export function getProductionPeriodEnd(date: Date = new Date()): Date {
  const { year, month } = getPeriodMonth(date);
  return periodEndForMonth(year, month);
}

/** Returns the start date of the Partners production period containing `date`. */
export function getProductionPeriodStart(date: Date = new Date()): Date {
  const { year, month } = getPeriodMonth(date);
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevEnd = periodEndForMonth(prevYear, prevMonth);
  return addDays(prevEnd, 1);
}

/** Convenience: returns { start, end } for the current production period. */
export function getCurrentProductionPeriod(date: Date = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: getProductionPeriodStart(date),
    end: getProductionPeriodEnd(date),
  };
}

/**
 * Returns the number of calendar days remaining in the current period
 * (not counting today — same logic as the original "daysRemaining").
 */
export function daysRemainingInPeriod(date: Date = new Date()): number {
  const end = getProductionPeriodEnd(date);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(
    0,
    Math.round((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );
}
