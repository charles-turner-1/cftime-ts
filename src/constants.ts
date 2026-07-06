// Constants ported directly from cftime's _cftime.pyx (lines 20-41, 346-418).

import type { InputCalendar } from "./types.js";

// Unit-string aliases, grouped as in the Python source.
export const microsecUnits = ["microseconds", "microsecond", "microsec", "microsecs"];
export const millisecUnits = [
  "milliseconds",
  "millisecond",
  "millisec",
  "millisecs",
  "msec",
  "msecs",
  "ms",
];
export const secUnits = ["second", "seconds", "sec", "secs", "s"];
export const minUnits = ["minute", "minutes", "min", "mins"];
export const hrUnits = ["hour", "hours", "hr", "hrs", "h"];
export const dayUnits = ["day", "days", "d"];
export const monthUnits = ["month", "months"]; // only allowed for 360_day calendar
export const yearUnits = ["common_year", "common_years"]; // only allowed for 365_day/noleap

// Base recognised units (excludes the calendar-restricted month/year units).
export const units = [
  ...microsecUnits,
  ...millisecUnits,
  ...secUnits,
  ...minUnits,
  ...hrUnits,
  ...dayUnits,
];

// Supported calendars, including synonyms.
export const calendars: InputCalendar[] = [
  "standard",
  "gregorian",
  "proleptic_gregorian",
  "tai",
  "noleap",
  "julian",
  "all_leap",
  "365_day",
  "366_day",
  "360_day",
];

// Matches Python's _idealized_calendars exactly (includes both spellings), so
// membership tests work against a stored calendar ("noleap"/"all_leap") too.
export const idealizedCalendars: string[] = ["all_leap", "noleap", "366_day", "365_day", "360_day"];

/** True if a (possibly stored) calendar name is an idealized calendar. */
export function isIdealized(calendar: string | null): boolean {
  return calendar !== null && idealizedCalendars.includes(calendar);
}

// Days per month, and cumulative days of preceding months.
export const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const daysPerMonthLeap = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const cumDaysPerMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export const cumDaysPerMonthLeap = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];

// Every recognised unit expressed in microseconds.
export const UNIT_CONVERSION_FACTORS: Record<string, number> = {
  microseconds: 1,
  microsecond: 1,
  microsec: 1,
  microsecs: 1,
  milliseconds: 1000,
  millisecond: 1000,
  millisec: 1000,
  millisecs: 1000,
  msec: 1000,
  msecs: 1000,
  ms: 1000,
  seconds: 1000000,
  second: 1000000,
  sec: 1000000,
  secs: 1000000,
  s: 1000000,
  minutes: 60 * 1000000,
  minute: 60 * 1000000,
  min: 60 * 1000000,
  mins: 60 * 1000000,
  hours: 3600 * 1000000,
  hour: 3600 * 1000000,
  hr: 3600 * 1000000,
  hrs: 3600 * 1000000,
  h: 3600 * 1000000,
  day: 86400 * 1000000,
  days: 86400 * 1000000,
  d: 86400 * 1000000,
  month: 30 * 86400 * 1000000, // only allowed for 360_day calendar
  months: 30 * 86400 * 1000000,
  common_year: 365 * 86400 * 1000000, // only allowed for 365_day/noleap calendars
  common_years: 365 * 86400 * 1000000,
};

// 64-bit signed integer range (the ~292,471-year valid span).
export const MAX_INT64 = 9223372036854775807n;
export const MIN_INT64 = -9223372036854775808n;

// Julian-day transition constants for the mixed (standard/gregorian) calendar.
// jday 2299161 == 1582-10-15 (first Gregorian day). The 10 days
// [2299161, 2299171) do not exist in the mixed calendar.
export const JDAY_GREGORIAN_START = 2299161;
export const JDAY_INVALID_GAP_END = 2299171;
