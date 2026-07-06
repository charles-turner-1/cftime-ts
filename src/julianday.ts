// Julian-day conversion and calendar date arithmetic, ported from _cftime.pyx:
//   intJulianDayFromDate (:2008), addTimedelta (:1827),
//   addTimedelta360Day (:1907), assertValidDate (:1777).
//
// All integer divisions use floorDiv/mod (Python floor semantics) — essential
// for correct results with negative / pre-epoch years.

import type { InputCalendar } from "./types.js";
import {
  checkCalendar,
  floorDiv,
  isLeap,
  mod,
  monthLengths,
  yearZeroDefaults,
} from "./calendars.js";
import {
  cumDaysPerMonth,
  cumDaysPerMonthLeap,
  JDAY_GREGORIAN_START,
  JDAY_INVALID_GAP_END,
} from "./constants.js";
import type { Timedelta } from "./timedelta.js";

/** The seven numeric date fields shared by CFDatetime and the arithmetic here. */
export interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
}

/** Result of date arithmetic: normalized fields (dayofwk/dayofyr are recomputed lazily). */
export type DateTuple = DateFields;

/**
 * Validate that the given fields form a real date in the calendar.
 * Mirrors assert_valid_date (:1777). `calendar` must be canonical; `hasYearZero`
 * is the already-resolved value from the constructor.
 */
export function assertValidDate(
  dt: DateFields,
  calendar: InputCalendar,
  hasYearZero: boolean,
): void {
  const is360Day = calendar === "360_day";
  const julianGregorianMixed = calendar === "standard";

  if (!hasYearZero && dt.year === 0) {
    throw new Error(`invalid year provided in ${reprFields(dt, calendar)}`);
  }
  const monthLength = is360Day
    ? new Array(12).fill(30)
    : monthLengths(dt.year, calendar, hasYearZero);

  if (dt.month < 1 || dt.month > 12) {
    throw new Error(`invalid month provided in ${reprFields(dt, calendar)}`);
  }
  if (dt.day < 1 || dt.day > monthLength[dt.month - 1]!) {
    throw new Error(`invalid day number provided in ${reprFields(dt, calendar)}`);
  }
  if (julianGregorianMixed && dt.year === 1582 && dt.month === 10 && dt.day > 4 && dt.day < 15) {
    throw new Error(
      `${reprFields(dt, calendar)} is not present in the mixed Julian/Gregorian calendar`,
    );
  }
  if (dt.hour < 0 || dt.hour > 23) {
    throw new Error(`invalid hour provided in ${reprFields(dt, calendar)}`);
  }
  if (dt.minute < 0 || dt.minute > 59) {
    throw new Error(`invalid minute provided in ${reprFields(dt, calendar)}`);
  }
  if (dt.second < 0 || dt.second > 59) {
    throw new Error(`invalid second provided in ${reprFields(dt, calendar)}`);
  }
  if (dt.microsecond < 0 || dt.microsecond > 999999) {
    throw new Error(`invalid microsecond provided in ${reprFields(dt, calendar)}`);
  }
}

function reprFields(dt: DateFields, calendar: InputCalendar): string {
  return `${calendar} ${dt.year}-${dt.month}-${dt.day} ${dt.hour}:${dt.minute}:${dt.second}.${dt.microsecond}`;
}

/**
 * Add a Timedelta to a date in a real-world or idealized-with-months calendar.
 * Mirrors add_timedelta (:1827). Uses integer arithmetic for microsecond accuracy.
 */
export function addTimedelta(
  dt: DateFields,
  delta: Timedelta,
  calendar: InputCalendar,
  hasYearZero: boolean,
): DateTuple {
  const julianGregorianMixed = calendar === "standard";

  let microsecond = dt.microsecond + delta.microseconds;
  let second = dt.second + delta.seconds;
  let minute = dt.minute;
  let hour = dt.hour;
  let day = dt.day;
  let month = dt.month;
  let year = dt.year;

  let monthLength = monthLengths(year, calendar, hasYearZero);
  const nInvalidDates = julianGregorianMixed ? 10 : 0;

  // Normalize microseconds, seconds, minutes, hours.
  second += floorDiv(microsecond, 1000000);
  microsecond = mod(microsecond, 1000000);
  minute += floorDiv(second, 60);
  second = mod(second, 60);
  hour += floorDiv(minute, 60);
  minute = mod(minute, 60);
  let extraDays = floorDiv(hour, 24);
  hour = mod(hour, 24);

  let deltaDays = delta.days + extraDays;

  while (deltaDays < 0) {
    if (year === 1582 && month === 10 && day > 14 && day + deltaDays < 15) {
      deltaDays -= nInvalidDates; // skip over invalid dates
    }
    if (day + deltaDays < 1) {
      deltaDays += day;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
        if (year === 0 && !hasYearZero) year = -1;
        monthLength = monthLengths(year, calendar, hasYearZero);
      }
      day = monthLength[month - 1]!;
    } else {
      day += deltaDays;
      deltaDays = 0;
    }
  }

  while (deltaDays > 0) {
    if (year === 1582 && month === 10 && day < 5 && day + deltaDays > 4) {
      deltaDays += nInvalidDates; // skip over invalid dates
    }
    if (day + deltaDays > monthLength[month - 1]!) {
      deltaDays -= monthLength[month - 1]! - (day - 1);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
        if (year === 0 && !hasYearZero) year = 1;
        monthLength = monthLengths(year, calendar, hasYearZero);
      }
      day = 1;
    } else {
      day += deltaDays;
      deltaDays = 0;
    }
  }

  return { year, month, day, hour, minute, second, microsecond };
}

/**
 * Add a Timedelta to a date in the 360_day calendar.
 * Mirrors add_timedelta_360_day (:1907). All months are 30 days; year zero exists.
 */
export function addTimedelta360Day(dt: DateFields, delta: Timedelta): DateTuple {
  let microsecond = dt.microsecond + delta.microseconds;
  let second = dt.second + delta.seconds;
  let minute = dt.minute;
  let hour = dt.hour;
  let day = dt.day + delta.days;
  let month = dt.month;
  let year = dt.year;

  second += floorDiv(microsecond, 1000000);
  microsecond = mod(microsecond, 1000000);
  minute += floorDiv(second, 60);
  second = mod(second, 60);
  hour += floorDiv(minute, 60);
  minute = mod(minute, 60);
  day += floorDiv(hour, 24);
  hour = mod(hour, 24);
  // day and month counted from 1; all months have 30 days.
  month += floorDiv(day - 1, 30);
  day = mod(day - 1, 30) + 1;
  year += floorDiv(month - 1, 12);
  month = mod(month - 1, 12) + 1;

  return { year, month, day, hour, minute, second, microsecond };
}

/**
 * Compute the integer Julian Day from year/month/day in a calendar.
 * Mirrors _IntJulianDayFromDate (:2008). Based on Dershowitz & Rheingold,
 * "Calendrical Calculations" 3rd ed.
 */
export function intJulianDayFromDate(
  year: number,
  month: number,
  day: number,
  calendar: string,
  skipTransition = false,
  hasYearZero: boolean | null = null,
): number {
  const cal = checkCalendar(calendar as InputCalendar);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`date ${year}-${month}-${day} does not exist in the ${cal} calendar`);
  }
  const hyz = hasYearZero === null ? yearZeroDefaults(cal) : hasYearZero;

  if (cal === "360_day") {
    return year * 360 + (month - 1) * 30 + day - 1;
  } else if (cal === "365_day") {
    if (month === 2 && day === 29) {
      throw new Error("no leap days in 365_day calendar");
    }
    return year * 365 + cumDaysPerMonth[month - 1]! + day - 1;
  } else if (cal === "366_day") {
    return year * 366 + cumDaysPerMonthLeap[month - 1]! + day - 1;
  }

  // standard, julian, tai, proleptic_gregorian
  if (year === 0 && !hyz) {
    throw new Error(`year zero does not exist in the ${cal} calendar`);
  }
  const leap = isLeap(year, cal, hyz);
  if (!leap && month === 2 && day === 29) {
    throw new Error(`${year} is not a leap year`);
  }

  let jday = leap ? day + cumDaysPerMonthLeap[month - 1]! : day + cumDaysPerMonth[month - 1]!;
  let y = year;
  if (y < 0 && !hyz) y += 1;
  y += 4800; // offset so -4800 is year 0

  // jday_jul: days in the last year + days in preceding non-leap years + leap days
  let jdayJul = jday + 365 * (y - 1) + floorDiv(y - 1, 4);
  jdayJul -= 31777; // remove offset for 87 years before -4713 (incl. leap days)
  let jdayGreg =
    jday + 365 * (y - 1) + floorDiv(y - 1, 4) - floorDiv(y - 1, 100) + floorDiv(y - 1, 400);
  jdayGreg -= 31739; // -4713/1/1 is jday=38 in the gregorian calendar

  if (cal === "julian") {
    return jdayJul;
  } else if (cal === "proleptic_gregorian" || cal === "tai") {
    return jdayGreg;
  } else {
    // standard (mixed): 10 missing days at the 1582 transition
    if (jdayJul >= JDAY_GREGORIAN_START && jdayJul < JDAY_INVALID_GAP_END) {
      throw new Error("invalid date in mixed calendar");
    }
    if (jdayJul < JDAY_GREGORIAN_START) {
      return jdayJul;
    }
    return skipTransition ? jdayGreg + 10 : jdayGreg;
  }
}
