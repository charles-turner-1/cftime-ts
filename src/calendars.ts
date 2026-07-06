// Calendar helpers ported from _cftime.pyx: floor-division helpers,
// checkCalendar (:1986), yearZeroDefaults (:1046), isLeap/isLeapYear (:1944-1984).

import type { CanonicalCalendar, InputCalendar } from "./types.js";
import { calendars, daysPerMonth, daysPerMonthLeap } from "./constants.js";

// Python's `//` and `%` floor toward negative infinity; JS `/`+Math.trunc and `%`
// truncate toward zero. Every integer division in the calendar formulas relies on
// floor semantics (critical for negative / pre-epoch years), so we use these.
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Validate a calendar name and collapse synonyms to a canonical name:
 * gregorian -> standard, noleap -> 365_day, all_leap -> 366_day.
 * Mirrors _check_calendar (:1986). Throws on unsupported calendars.
 */
export function checkCalendar(calendar: string | null | undefined): CanonicalCalendar {
  if (calendar === null || calendar === undefined) {
    throw new Error("unsupported calendar");
  }
  const cal = calendar.toLowerCase() as InputCalendar;
  if (!calendars.includes(cal)) {
    throw new Error("unsupported calendar");
  }
  if (cal === "gregorian") return "standard";
  if (cal === "noleap") return "365_day";
  if (cal === "all_leap") return "366_day";
  return cal as CanonicalCalendar;
}

/**
 * Calendar-specific default for has_year_zero, per CF 1.9 conventions.
 * Mirrors _year_zero_defaults (:1046). Accepts synonyms and the empty form.
 */
export function yearZeroDefaults(calendar: InputCalendar): boolean {
  const cal = calendar ? calendar.toLowerCase() : calendar;
  if (cal === "standard" || cal === "gregorian" || cal === "julian") return false;
  if (cal === "proleptic_gregorian") return true; // ISO 8601: year zero = 1 BC
  if (
    cal === "noleap" ||
    cal === "all_leap" ||
    cal === "366_day" ||
    cal === "365_day" ||
    cal === "360_day"
  ) {
    return true;
  }
  return false;
}

/**
 * Public leap-year test. Mirrors is_leap_year (:1944).
 */
export function isLeapYear(
  year: number,
  calendar: InputCalendar,
  hasYearZero: boolean | null = null,
): boolean {
  return isLeap(year, calendar, hasYearZero);
}

/**
 * Internal leap-year logic. Mirrors _is_leap (:1953), including the
 * negative-year (tyear = year + 1) rule when there is no year zero.
 */
export function isLeap(
  year: number,
  calendar: InputCalendar,
  hasYearZero: boolean | null = null,
): boolean {
  const cal = checkCalendar(calendar);
  const hyz = hasYearZero === null ? yearZeroDefaults(cal) : hasYearZero;
  if (year === 0 && !hyz) {
    throw new Error(`year zero does not exist in the ${cal} calendar`);
  }
  // No year 0 in the Julian calendar => years -1, -5, -9, ... are leap years.
  const tyear = year < 0 && !hyz ? year + 1 : year;
  let leap: boolean;
  if (cal === "proleptic_gregorian" || cal === "tai" || (cal === "standard" && year > 1581)) {
    if (tyear % 4) leap = false;
    else if (tyear % 100) leap = true;
    else if (tyear % 400) leap = false;
    else leap = true;
  } else if (cal === "julian" || (cal === "standard" && year < 1582)) {
    leap = tyear % 4 === 0;
  } else if (cal === "366_day") {
    leap = true;
  } else {
    leap = false;
  }
  return leap;
}

/**
 * Return the appropriate 12-element month-length table for a year.
 * Mirrors month_lengths (:1771). Callers handle 360_day separately.
 */
export function monthLengths(
  year: number,
  calendar: InputCalendar,
  hasYearZero: boolean | null = null,
): number[] {
  return isLeap(year, calendar, hasYearZero) ? daysPerMonthLeap : daysPerMonth;
}
