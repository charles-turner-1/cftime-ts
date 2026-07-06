// num2date / date2num / num2pydate, ported from _cftime.pyx (:139, :335, :522).
//
// Scope (per project decisions): scalars and plain JS arrays only — no numpy
// masked/typed-array machinery. Numeric values are JS `number`. To preserve
// precision beyond float64's 2^53 exact-integer range, conversions decompose via
// a whole-day term plus a sub-day remainder rather than routing large values
// through raw microseconds.

import type { InputCalendar } from "./types.js";
import { microsecUnits, millisecUnits, UNIT_CONVERSION_FACTORS } from "./constants.js";
import { yearZeroDefaults } from "./calendars.js";
import { CFDatetime, registerFromordinal } from "./datetime.js";
import { Timedelta } from "./timedelta.js";
import { dateparse, datesplit } from "./parse.js";
import { suppressWarnings } from "./warnings.js";

const US_PER_DAY = 86400 * 1000000;

export interface Num2DateOptions {
  calendar?: InputCalendar;
  hasYearZero?: boolean | null;
  /** If true, return native JS Date objects where possible (num2pydate behavior). */
  onlyUsePythonDatetimes?: boolean;
}

export interface Date2NumOptions {
  calendar?: InputCalendar;
  hasYearZero?: boolean | null;
}

/** numpy-style round-half-to-even, to match cftime's cast_to_int (np.rint). */
function rint(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Convert a Timedelta into a count of `unitMicros`-sized units (date2num core).
 * A single division of the total microseconds, matching Python's `td / unit_timedelta`
 * (exact for integer quotients within float64's safe-integer range).
 */
function tdToUnit(td: Timedelta, unitMicros: number): number {
  return (td.days * US_PER_DAY + td.seconds * 1000000 + td.microseconds) / unitMicros;
}

/** Mirrors cftime's cast_to_int microsecond snapping for a sub-day remainder. */
function snapRemainder(remUnits: number, unitMicros: number, unit: string): number {
  const raw = remUnits * unitMicros;
  let rem = rint(raw);
  if (!microsecUnits.includes(unit) && !millisecUnits.includes(unit)) {
    const r = ((rem % 1000000) + 1000000) % 1000000;
    if (r === 1) rem = Math.floor(raw);
    else if (r === 999999) rem = Math.ceil(raw);
  }
  return rem;
}

/** Decode a single numeric time value to a CFDatetime (num2date core). */
function decodeScalar(
  value: number,
  unitMicros: number,
  unit: string,
  basedate: CFDatetime,
): CFDatetime {
  const unitsPerDay = US_PER_DAY / unitMicros;
  let td: Timedelta;
  if (Number.isInteger(unitsPerDay)) {
    const wholeDays = Math.floor(value / unitsPerDay);
    const remUnits = value - wholeDays * unitsPerDay;
    const remMicros = snapRemainder(remUnits, unitMicros, unit);
    td = new Timedelta({ days: wholeDays, microseconds: remMicros });
  } else {
    const totalMicros = snapRemainder(value, unitMicros, unit);
    td = Timedelta.fromMicroseconds(totalMicros);
  }
  return basedate.add(td);
}

function resolveUnit(units: string, calendar: InputCalendar): [string, number] {
  const [unit] = datesplit(units);
  const factor = UNIT_CONVERSION_FACTORS[unit];
  if (factor === undefined) {
    throw new Error(`Unsupported time units provided, '${unit}'.`);
  }
  if ((unit === "months" || unit === "month") && calendar !== "360_day") {
    throw new Error("Units of months only valid for 360_day calendar.");
  }
  return [unit, factor];
}

/**
 * Return datetime objects given numeric time values. Mirrors num2date (:522).
 * Accepts a scalar or a plain array; returns the same shape. Non-finite inputs
 * (NaN / ±Infinity) decode to `null`.
 */
export function num2date(times: number, units: string, options?: Num2DateOptions): CFDatetime;
export function num2date(
  times: number[],
  units: string,
  options?: Num2DateOptions,
): (CFDatetime | null)[];
export function num2date(
  times: number | number[],
  units: string,
  options: Num2DateOptions = {},
): CFDatetime | (CFDatetime | null)[] {
  const calendar = (options.calendar ?? "standard").toString().toLowerCase() as InputCalendar;
  const hasYearZero = options.hasYearZero ?? yearZeroDefaults(calendar);
  const basedate = dateparse(units, calendar, hasYearZero);

  if (
    (calendar === "julian" ||
      calendar === "standard" ||
      calendar === "gregorian" ||
      calendar === "proleptic_gregorian") &&
    !hasYearZero &&
    basedate.year === 0
  ) {
    throw new Error("zero not allowed as a reference year unless has_year_zero=True");
  }

  const [unit, factor] = resolveUnit(units, calendar);

  const decodeOne = (v: number): CFDatetime | null => {
    if (!Number.isFinite(v)) return null;
    return decodeScalar(v, factor, unit, basedate);
  };

  if (Array.isArray(times)) {
    return times.map(decodeOne);
  }
  const result = decodeOne(times);
  if (result === null) {
    throw new Error("cannot decode a non-finite time value to a date");
  }
  return result;
}

/**
 * Always return native JS Date objects (UTC), raising if not representable.
 * Mirrors num2pydate (:335). Only works for proleptic_gregorian / post-1582
 * standard dates that are within the JS Date range.
 */
export function num2pydate(times: number, units: string, calendar?: InputCalendar): Date;
export function num2pydate(
  times: number[],
  units: string,
  calendar?: InputCalendar,
): (Date | null)[];
export function num2pydate(
  times: number | number[],
  units: string,
  calendar: InputCalendar = "standard",
): Date | (Date | null)[] {
  const toDate = (dt: CFDatetime | null): Date | null => {
    if (dt === null) return null;
    if (!dt.datetimeCompatible) {
      throw new Error("illegal calendar or reference date for python datetime");
    }
    return new Date(
      Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second, dt.microsecond / 1000),
    );
  };
  if (Array.isArray(times)) {
    return (num2date(times, units, { calendar }) as (CFDatetime | null)[]).map(toDate);
  }
  return toDate(num2date(times, units, { calendar }) as CFDatetime)!;
}

/**
 * Return numeric time values given datetime objects. Mirrors date2num (:139).
 * Accepts a scalar CFDatetime or a plain array; returns the same shape.
 */
export function date2num(dates: CFDatetime, units: string, options?: Date2NumOptions): number;
export function date2num(dates: CFDatetime[], units: string, options?: Date2NumOptions): number[];
export function date2num(
  dates: CFDatetime | CFDatetime[],
  units: string,
  options: Date2NumOptions = {},
): number | number[] {
  const isArray = Array.isArray(dates);
  const list = isArray ? dates : [dates];
  if (list.length === 0) return [];

  let calendar = options.calendar ?? null;
  let hasYearZero = options.hasYearZero ?? null;

  const first = list[0]!;
  // Resolve has_year_zero using the original calendar argument (as Python does).
  if (hasYearZero === null) {
    hasYearZero = calendar === null ? first.hasYearZero : yearZeroDefaults(calendar);
  }
  if (!calendar) {
    calendar = first.calendar;
  }
  calendar = calendar.toString().toLowerCase() as InputCalendar;

  const basedate = dateparse(units, calendar, hasYearZero);
  if (
    (calendar === "julian" ||
      calendar === "standard" ||
      calendar === "gregorian" ||
      calendar === "proleptic_gregorian") &&
    !hasYearZero &&
    basedate.year === 0
  ) {
    throw new Error(
      "zero not allowed as a reference year, does not exist in Julian or Gregorian calendars",
    );
  }
  const [, factor] = resolveUnit(units, calendar);

  const out = list.map((date) => {
    // Reinterpret the date's fields in the target calendar (matches Python).
    const d = new CFDatetime(
      date.year,
      date.month,
      date.day,
      date.hour,
      date.minute,
      date.second,
      date.microsecond,
      { calendar: calendar as InputCalendar, hasYearZero },
    );
    const td = d.sub(basedate);
    return tdToUnit(td, factor);
  });

  return isArray ? out : out[0]!;
}

// --- register fromordinal to break the datetime <-> convert module cycle ------

registerFromordinal((jday, calendar, hasYearZero) => {
  const cal = (calendar ? calendar.toString().toLowerCase() : calendar) as InputCalendar;
  const hyz = hasYearZero === null ? yearZeroDefaults(cal) : hasYearZero;
  let unitsRef: string;
  if (cal === "standard" || cal === "julian" || cal === "gregorian") {
    unitsRef = hyz ? "days since -4712-1-1-12" : "days since -4713-1-1-12";
  } else if (cal === "proleptic_gregorian" || cal === "tai") {
    unitsRef = hyz ? "days since -4713-11-24-12" : "days since -4714-11-24-12";
  } else {
    unitsRef = "days since 0-1-1-12";
  }
  return suppressWarnings(() => num2date(jday, unitsRef, { calendar: cal, hasYearZero: hyz }));
});
