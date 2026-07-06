// Unit-string and ISO 8601 date parsing, ported from _cftime.pyx:
//   _datesplit (:72), _dateparse (:86), _parse_timezone (:744), _parse_date (:767).

import type { InputCalendar } from "./types.js";
import { yearZeroDefaults } from "./calendars.js";
import { monthUnits, units as baseUnits, yearUnits } from "./constants.js";
import { CFDatetime } from "./datetime.js";
import { Timedelta } from "./timedelta.js";

// Ported from ISO8601_REGEX / TIMEZONE_REGEX (:46,:52). Intentionally lenient:
// some malformed timezone specs are accepted for legacy compatibility.
const ISO8601_REGEX =
  /^(?<year>[+-]?[0-9]+)(-(?<month>[0-9]{1,2})(-(?<day>[0-9]{1,2})(((?<separator1>.)(?<hour>[0-9]{1,2}):(?<minute>[0-9]{1,2})(:(?<second>[0-9]{1,2})(\.(?<fraction>[0-9]+))?)?)?((?<separator2>.?)(?<timezone>Z|(([-+])([0-9]{2})((:([0-9]{2}))|([0-9]{2}))?)))?)?)?)?/;

const TIMEZONE_REGEX =
  /^(?<prefix>[+-])(?<hours>[0-9]{2})(?:(?::(?<minutes1>[0-9]{2}))|(?<minutes2>[0-9]{2}))?/;

/** The 8-tuple returned by parseDate: date fields plus UTC offset in minutes. */
export type ParsedDate = [
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  microsecond: number,
  utcOffsetMinutes: number,
];

/** Parse an ISO 8601 timezone spec into an offset in minutes. Mirrors _parse_timezone (:744). */
export function parseTimezone(tzstring: string | null | undefined): number {
  if (tzstring === "Z") return 0;
  if (tzstring === null || tzstring === undefined) return 0;
  const m = TIMEZONE_REGEX.exec(tzstring);
  if (!m || !m.groups) return 0;
  const { prefix, hours, minutes1, minutes2 } = m.groups;
  let h = parseInt(hours!, 10);
  let mins =
    minutes1 !== undefined
      ? parseInt(minutes1, 10)
      : minutes2 !== undefined
        ? parseInt(minutes2, 10)
        : 0;
  if (prefix === "-") {
    h = -h;
    mins = -mins;
  }
  return mins + h * 60;
}

/** Parse an ISO 8601 date string. Mirrors _parse_date (:767). */
export function parseDate(datestring: string): ParsedDate {
  const m = ISO8601_REGEX.exec(datestring.trim());
  if (!m || !m.groups) {
    throw new Error(`Unable to parse date string '${datestring}'`);
  }
  const g = m.groups;
  const tzoffset = parseTimezone(g["timezone"]);
  if (g["month"] === undefined || g["day"] === undefined) {
    // Matches Python, which raises when month/day are absent (int(None)).
    throw new Error(`Unable to parse date string '${datestring}'`);
  }
  const fraction =
    g["fraction"] === undefined ? 0 : Math.trunc(parseFloat(`0.${g["fraction"]}`) * 1e6);
  return [
    parseInt(g["year"]!, 10),
    parseInt(g["month"], 10),
    parseInt(g["day"], 10),
    g["hour"] === undefined ? 0 : parseInt(g["hour"], 10),
    g["minute"] === undefined ? 0 : parseInt(g["minute"], 10),
    g["second"] === undefined ? 0 : parseInt(g["second"], 10),
    fraction,
    tzoffset,
  ];
}

/** Split "<units> since <remainder>". Mirrors _datesplit (:72). */
export function datesplit(timestr: string): [string, string] {
  // Python's str.split(None, 2): split on runs of whitespace into at most 3 parts.
  const parts = timestr.trim().split(/\s+/);
  if (parts.length < 3) {
    throw new Error("Incorrectly formatted CF date-time unit_string");
  }
  const units = parts[0]!;
  const sincestring = parts[1]!;
  const remainder = parts.slice(2).join(" ");
  if (sincestring.toLowerCase() !== "since") {
    throw new Error("no 'since' in unit_string");
  }
  return [units.toLowerCase(), remainder];
}

/**
 * Parse "<time-units> since <reference date>" into a base CFDatetime.
 * Mirrors _dateparse (:86). `calendar` may include synonyms; case-insensitive.
 */
export function dateparse(
  timestr: string,
  calendar: InputCalendar,
  hasYearZero: boolean | null = null,
): CFDatetime {
  const cal = (calendar ? calendar.toLowerCase() : calendar) as InputCalendar;
  const hyz = hasYearZero === null ? yearZeroDefaults(cal) : hasYearZero;
  const [units, isostring] = datesplit(timestr);

  const isMonth = monthUnits.includes(units);
  const isYear = yearUnits.includes(units);
  const isNoleap = cal === "365_day" || cal === "noleap";
  const allowed =
    (isMonth && cal === "360_day") || (isYear && isNoleap) || baseUnits.includes(units);
  if (!allowed) {
    if (isMonth && cal !== "360_day") {
      throw new Error("'months since' units only allowed for '360_day' calendar");
    }
    if (isYear && !isNoleap) {
      throw new Error(`'${units}' units only allowed for '365_day' and 'noleap' calendars`);
    }
    throw new Error(
      "In general, units must be one of 'microseconds', 'milliseconds', " +
        "'seconds', 'minutes', 'hours', or 'days' (or select abbreviated " +
        "versions of these).  For the '360_day' calendar, " +
        "'months' can also be used, or for the 'noleap' calendar 'common_years' " +
        `can also be used. Got '${units}' instead, which are not recognized.`,
    );
  }

  const [year, month, day, hour, minute, second, microsecond, utcOffset] = parseDate(
    isostring.trim(),
  );

  if (cal === "tai" && (year < 1958 || utcOffset)) {
    throw new Error(
      "TAI calendar must have a reference date of 1958-01-01T00:00:00 or later (with no utc offset)",
    );
  }
  if (
    year === 0 &&
    !hyz &&
    (cal === "julian" || cal === "standard" || cal === "gregorian" || cal === "proleptic_gregorian")
  ) {
    throw new Error("zero not allowed as a reference year when has_year_zero=False");
  }
  if (isNoleap && month === 2 && day === 29) {
    throw new Error("cannot specify a leap day as the reference time with the noleap calendar");
  }
  if (cal === "360_day" && day > 30) {
    throw new Error("there are only 30 days in every month with the 360_day calendar");
  }

  let basedate = new CFDatetime(year, month, day, hour, minute, second, microsecond, {
    calendar: cal,
    hasYearZero: hyz,
  });
  if (utcOffset) {
    basedate = basedate.sub(new Timedelta({ days: utcOffset / 1440 }));
  }
  return basedate;
}
