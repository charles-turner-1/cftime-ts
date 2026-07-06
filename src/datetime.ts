// CFDatetime — a calendar-aware datetime, ported from the `datetime` cdef class
// in _cftime.pyx (:1065-1668). Exported publicly as both `CFDatetime` and
// `datetime` (for API parity with Python cftime).

import type { DatetimeOptions, InputCalendar, StoredCalendar } from "./types.js";
import {
  cumDaysPerMonth,
  cumDaysPerMonthLeap,
  daysPerMonth,
  daysPerMonthLeap,
  isIdealized,
} from "./constants.js";
import { isLeap, yearZeroDefaults } from "./calendars.js";
import {
  addTimedelta,
  addTimedelta360Day,
  assertValidDate,
  intJulianDayFromDate,
  type DateFields,
} from "./julianday.js";
import { Timedelta } from "./timedelta.js";
import { strptime as parseStrptime } from "./strptime.js";
import { cfwarn } from "./warnings.js";

const CF_WARN_MSG = "this date/calendar/year zero convention is not supported by CF";

type Tuple7 = [number, number, number, number, number, number, number];

export interface ReplaceFields {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  microsecond?: number;
  hasYearZero?: boolean;
}

export class CFDatetime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly microsecond: number;
  readonly calendar: StoredCalendar;
  readonly hasYearZero: boolean;
  /** True when this instance can be converted to / compared with a native JS Date. */
  readonly datetimeCompatible: boolean;
  readonly tzinfo: null = null;

  #dayofwk = -1;
  #dayofyr = -1;

  constructor(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    microsecond = 0,
    options: DatetimeOptions = {},
  ) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.hour = hour;
    this.minute = minute;
    this.second = second;
    this.microsecond = microsecond;

    let calendar: InputCalendar = options.calendar === undefined ? "standard" : options.calendar;
    if (calendar) calendar = calendar.toLowerCase() as InputCalendar;
    let hasYearZero: boolean | null = options.hasYearZero ?? null;

    // Resolve calendar-specific has_year_zero default.
    if (hasYearZero === null) {
      if (year === 0) {
        // If the user sets year 0, assume the calendar includes year zero (issue #248).
        if (calendar !== null && !yearZeroDefaults(calendar)) {
          cfwarn(
            "year=0 was specified - this date/calendar/year zero convention is not supported by CF",
          );
        }
        hasYearZero = true;
      } else {
        hasYearZero = yearZeroDefaults(calendar);
      }
    }

    // Warn for dates not allowed by CF (no years < 1 in mixed Julian/Gregorian).
    if (
      (calendar === "julian" || calendar === "gregorian" || calendar === "standard") &&
      year <= 0
    ) {
      cfwarn(CF_WARN_MSG);
    }
    if (calendar === "tai") {
      if (year < 1958) throw new Error("dates before 1958-01-01 not allowed in TAI calendar");
      if (hasYearZero) throw new Error("year zero not allowed in TAI calendar");
    }
    if (year === 0 && hasYearZero === false) {
      throw new Error("year zero requested, but has_year_zero=False");
    }
    if (!hasYearZero && isIdealized(calendar)) {
      cfwarn("has_year_zero kwarg ignored for idealized calendars (always True)");
    }
    this.hasYearZero = hasYearZero;

    // Assign the stored calendar, datetime-compatibility, and validate.
    let stored: StoredCalendar;
    let compatible = false;
    if (calendar === "gregorian" || calendar === "standard") {
      stored = "standard";
      compatible = tupleGE(this.toTuple(), [1582, 10, 15, 0, 0, 0, 0]);
      assertValidDate(this, "standard", hasYearZero);
    } else if (calendar === "noleap" || calendar === "365_day") {
      stored = "noleap";
      assertValidDate(this, "noleap", true);
    } else if (calendar === "all_leap" || calendar === "366_day") {
      stored = "all_leap";
      assertValidDate(this, "all_leap", true);
    } else if (calendar === "360_day") {
      stored = "360_day";
      assertValidDate(this, "360_day", true);
    } else if (calendar === "julian") {
      stored = "julian";
      assertValidDate(this, "julian", hasYearZero);
    } else if (calendar === "proleptic_gregorian" || calendar === "tai") {
      stored = calendar;
      compatible = true;
      assertValidDate(this, "proleptic_gregorian", hasYearZero);
    } else if (calendar === "" || calendar === null) {
      stored = "";
    } else {
      throw new Error(`calendar must be one of the supported CF calendars, got '${calendar}'`);
    }
    this.calendar = stored;
    this.datetimeCompatible = compatible;
  }

  // --- properties -----------------------------------------------------------

  get format(): string {
    return "%Y-%m-%d %H:%M:%S";
  }

  /** Day of week, 0 = Monday ... 6 = Sunday (ISO / Python convention). */
  get dayofwk(): number {
    if (this.#dayofwk < 0 && this.calendar) {
      const jd = this.toordinal();
      let dow = mod7(jd + 1);
      dow -= 1;
      if (dow === -1) dow = 6;
      this.#dayofwk = dow;
      return dow;
    }
    return this.#dayofwk;
  }

  /** Day of year, 1-based. */
  get dayofyr(): number {
    if (this.#dayofyr < 0 && this.calendar) {
      let doy: number;
      if (this.calendar === "360_day") {
        doy = (this.month - 1) * 30 + this.day;
      } else if (isLeap(this.year, this.calendar, this.hasYearZero)) {
        doy = cumDaysPerMonthLeap[this.month - 1]! + this.day;
      } else {
        doy = cumDaysPerMonth[this.month - 1]! + this.day;
      }
      this.#dayofyr = doy;
      return doy;
    }
    return this.#dayofyr;
  }

  get daysinmonth(): number {
    if (this.calendar === "360_day") return 30;
    return isLeap(this.year, this.calendar, this.hasYearZero)
      ? daysPerMonthLeap[this.month - 1]!
      : daysPerMonth[this.month - 1]!;
  }

  // --- conversion / representation -----------------------------------------

  toTuple(): Tuple7 {
    return [this.year, this.month, this.day, this.hour, this.minute, this.second, this.microsecond];
  }

  fields(): DateFields {
    return {
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      second: this.second,
      microsecond: this.microsecond,
    };
  }

  isoformat(sep = "T", timespec = "auto"): string {
    const date =
      this.year < 0
        ? `-${String(-this.year).padStart(4, "0")}-${p2(this.month)}-${p2(this.day)}`
        : `${String(this.year).padStart(4, "0")}-${p2(this.month)}-${p2(this.day)}`;

    if (timespec === "days") return date;
    if (timespec === "hours") return `${date}${sep}${p2(this.hour)}`;
    if (timespec === "minutes") return `${date}${sep}${p2(this.hour)}:${p2(this.minute)}`;
    if (timespec === "seconds") {
      return `${date}${sep}${p2(this.hour)}:${p2(this.minute)}:${p2(this.second)}`;
    }
    if (timespec === "auto" || timespec === "microseconds" || timespec === "milliseconds") {
      let sec = p2(this.second);
      if (timespec === "milliseconds") {
        sec += `.${String(Math.round(this.microsecond / 1000)).padStart(3, "0")}`;
      } else if (timespec === "microseconds") {
        sec += `.${String(this.microsecond).padStart(6, "0")}`;
      } else if (this.microsecond > 0) {
        sec += `.${String(this.microsecond).padStart(6, "0")}`;
      }
      return `${date}${sep}${p2(this.hour)}:${p2(this.minute)}:${sec}`;
    }
    throw new Error("illegal timespec");
  }

  toString(): string {
    return this.isoformat(" ");
  }

  /** Python-style repr, e.g. cftime.datetime(2000, 1, 1, 0, 0, 0, 0, calendar='standard', has_year_zero=False). */
  repr(): string {
    return (
      `cftime.datetime(${this.year}, ${this.month}, ${this.day}, ${this.hour}, ` +
      `${this.minute}, ${this.second}, ${this.microsecond}, calendar='${this.calendar}', ` +
      `has_year_zero=${this.hasYearZero ? "True" : "False"})`
    );
  }

  strftime(format?: string): string {
    return strftimeImpl(this, format ?? this.format);
  }

  /**
   * Parse a date string per a format into a datetime. Mirrors datetime.strptime
   * (:1270). Supports directives d f H I m M p S y Y B b z %. If a %z timezone is
   * present, the result is normalized to UTC.
   */
  static strptime(
    datestring: string,
    format: string,
    calendar: InputCalendar = "standard",
    hasYearZero: boolean | null = null,
  ): CFDatetime {
    const r = parseStrptime(datestring, format);
    let dt = new CFDatetime(r.year, r.month, r.day, r.hour, r.minute, r.second, r.microsecond, {
      calendar,
      hasYearZero,
    });
    if (r.utcOffsetMinutes) {
      dt = dt.sub(new Timedelta({ minutes: r.utcOffsetMinutes }));
    }
    return dt;
  }

  // --- ordinal / calendar change -------------------------------------------

  toordinal(fractional = false): number {
    const ijd = intJulianDayFromDate(
      this.year,
      this.month,
      this.day,
      this.calendar,
      false,
      this.hasYearZero,
    );
    if (fractional) {
      const fracday =
        this.hour / 24 + this.minute / 1440 + (this.second + this.microsecond / 1e6) / 86400;
      return ijd - 0.5 + fracday;
    }
    return ijd;
  }

  /**
   * Create a datetime from a Julian day ordinal (inverse of toordinal).
   * Mirrors datetime.fromordinal (:1481).
   */
  static fromordinal(
    jday: number,
    calendar: InputCalendar = "standard",
    hasYearZero: boolean | null = null,
  ): CFDatetime {
    // Deferred import to avoid an eager module cycle with convert.ts.
    return fromordinalImpl(jday, calendar, hasYearZero);
  }

  /** Return a new instance in a different real-world calendar. Mirrors change_calendar (:1540). */
  changeCalendar(calendar: InputCalendar, hasYearZero: boolean | null = null): CFDatetime {
    if (isIdealized(calendar) || isIdealized(this.calendar)) {
      throw new Error("change_calendar only works for real-world calendars");
    }
    return CFDatetime.fromordinal(this.toordinal(true), calendar, hasYearZero);
  }

  replace(
    changes: ReplaceFields & { calendar?: never; dayofwk?: never; dayofyr?: never },
  ): CFDatetime {
    const c = changes as ReplaceFields;
    const args = {
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      second: this.second,
      microsecond: this.microsecond,
      hasYearZero: this.hasYearZero as boolean,
    };
    // If setting year to 0 without specifying has_year_zero, enable year zero.
    if (c.year === 0 && c.hasYearZero === undefined) {
      args.hasYearZero = true;
    }
    Object.assign(args, c);
    return new CFDatetime(
      args.year,
      args.month,
      args.day,
      args.hour,
      args.minute,
      args.second,
      args.microsecond,
      {
        calendar: this.calendar,
        hasYearZero: args.hasYearZero,
      },
    );
  }

  // --- arithmetic -----------------------------------------------------------

  /** datetime + timedelta. */
  add(delta: Timedelta): CFDatetime {
    return addToDate(this, delta);
  }

  /** datetime - timedelta -> datetime, or datetime - datetime -> Timedelta. */
  sub(other: Timedelta): CFDatetime;
  sub(other: CFDatetime): Timedelta;
  sub(other: Timedelta | CFDatetime): CFDatetime | Timedelta {
    if (other instanceof CFDatetime) {
      if (this.calendar !== other.calendar) {
        throw new Error(
          "cannot compute the time difference between dates with different calendars",
        );
      }
      if (this.calendar === "") {
        throw new Error(
          "cannot compute the time difference between dates that are not calendar-aware",
        );
      }
      if (this.hasYearZero !== other.hasYearZero) {
        throw new Error(
          "cannot compute the time difference between dates with different year zero conventions",
        );
      }
      const days = this.toordinal() - other.toordinal();
      const seconds =
        this.second +
        60 * this.minute +
        3600 * this.hour -
        (other.second + 60 * other.minute + 3600 * other.hour);
      const microseconds = this.microsecond - other.microsecond;
      return new Timedelta({ days, seconds, microseconds });
    }
    return addToDate(this, other.negate());
  }

  // --- comparison -----------------------------------------------------------

  /** Returns -1, 0, or 1. Throws for undefined cross-calendar comparisons. */
  compareTo(other: CFDatetime): number {
    if (this.calendar === other.calendar && this.hasYearZero === other.hasYearZero) {
      return compareTuple(this.toTuple(), other.toTuple());
    }
    if (isIdealized(this.calendar) || isIdealized(other.calendar)) {
      throw new Error(`cannot compare ${this.repr()} and ${other.repr()}`);
    }
    const other2 = other.changeCalendar(this.calendar, this.hasYearZero);
    return compareTuple(this.toTuple(), other2.toTuple());
  }

  equals(other: CFDatetime): boolean {
    return this.compareTo(other) === 0;
  }
  isBefore(other: CFDatetime): boolean {
    return this.compareTo(other) < 0;
  }
  isAfter(other: CFDatetime): boolean {
    return this.compareTo(other) > 0;
  }
  isBeforeOrEqual(other: CFDatetime): boolean {
    return this.compareTo(other) <= 0;
  }
  isAfterOrEqual(other: CFDatetime): boolean {
    return this.compareTo(other) >= 0;
  }
}

/** Public alias matching the Python module-level name. */
export { CFDatetime as datetime };

// --- legacy calendar-specific subclasses ------------------------------------
// Thin subclasses that pin the calendar. Retained for API parity with Python
// cftime (which marks these as possibly-removed in a future release).

function subclassRepr(name: string, dt: CFDatetime): string {
  return (
    `cftime.${name}(${dt.year}, ${dt.month}, ${dt.day}, ${dt.hour}, ` +
    `${dt.minute}, ${dt.second}, ${dt.microsecond}, has_year_zero=${dt.hasYearZero ? "True" : "False"})`
  );
}

function makeSubclass(className: string, calendar: InputCalendar) {
  return class extends CFDatetime {
    constructor(
      year: number,
      month: number,
      day: number,
      hour = 0,
      minute = 0,
      second = 0,
      microsecond = 0,
      options: DatetimeOptions = {},
    ) {
      super(year, month, day, hour, minute, second, microsecond, { ...options, calendar });
    }
    override repr(): string {
      return subclassRepr(className, this);
    }
  };
}

export const DatetimeNoLeap = makeSubclass("DatetimeNoLeap", "noleap");
export const DatetimeAllLeap = makeSubclass("DatetimeAllLeap", "all_leap");
export const Datetime360Day = makeSubclass("Datetime360Day", "360_day");
export const DatetimeJulian = makeSubclass("DatetimeJulian", "julian");
export const DatetimeGregorian = makeSubclass("DatetimeGregorian", "standard");
export const DatetimeProlepticGregorian = makeSubclass(
  "DatetimeProlepticGregorian",
  "proleptic_gregorian",
);
export const DatetimeTAI = makeSubclass("DatetimeTAI", "tai");

/** Maps a canonical/stored calendar to its legacy subclass constructor. */
export const DATE_TYPES: Record<string, typeof DatetimeNoLeap> = {
  proleptic_gregorian: DatetimeProlepticGregorian,
  tai: DatetimeTAI,
  standard: DatetimeGregorian,
  noleap: DatetimeNoLeap,
  "365_day": DatetimeNoLeap,
  all_leap: DatetimeAllLeap,
  "366_day": DatetimeAllLeap,
  julian: DatetimeJulian,
  "360_day": Datetime360Day,
  gregorian: DatetimeGregorian,
};

// --- internal helpers -------------------------------------------------------

function addToDate(dt: CFDatetime, delta: Timedelta): CFDatetime {
  const cal = dt.calendar;
  const hyz = dt.hasYearZero;
  let f: DateFields;
  if (cal === "360_day") {
    f = addTimedelta360Day(dt.fields(), delta);
  } else if (cal === "") {
    throw new Error("cannot add a timedelta to a date that is not calendar-aware");
  } else {
    // noleap/all_leap use has_year_zero=true; others use the instance's value.
    const useHyz = cal === "noleap" || cal === "all_leap" ? true : hyz;
    f = addTimedelta(dt.fields(), delta, cal, useHyz);
  }
  return new CFDatetime(f.year, f.month, f.day, f.hour, f.minute, f.second, f.microsecond, {
    calendar: cal,
    hasYearZero: hyz,
  });
}

let fromordinalImpl: (
  jday: number,
  calendar: InputCalendar,
  hasYearZero: boolean | null,
) => CFDatetime = () => {
  throw new Error("fromordinal implementation not registered (convert.ts not loaded)");
};

/** convert.ts registers the real implementation to break the module cycle. */
export function registerFromordinal(
  impl: (jday: number, calendar: InputCalendar, hasYearZero: boolean | null) => CFDatetime,
): void {
  fromordinalImpl = impl;
}

function tupleGE(a: Tuple7, b: Tuple7): boolean {
  return compareTuple(a, b) >= 0;
}

function compareTuple(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

function mod7(n: number): number {
  return ((n % 7) + 7) % 7;
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

// --- strftime (clean-room; formats directly from calendar-aware fields) ------

const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
// prettier-ignore
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ILLEGAL_S = /(^|[^%])(%%)*%s/;

function strftimeImpl(dt: CFDatetime, fmt: string): string {
  if (ILLEGAL_S.test(fmt)) {
    throw new Error("This strftime implementation does not handle %s");
  }
  let hasMicros = false;
  let fmt1 = fmt;
  if (fmt.includes("%f")) {
    if (!fmt.endsWith(".%f")) {
      throw new Error("If %f is used for microseconds it must be at the end as .%f");
    }
    hasMicros = true;
    fmt1 = fmt.slice(0, -3);
  }

  const yearStr =
    dt.year < 0 ? `-${String(-dt.year).padStart(4, "0")}` : String(dt.year).padStart(4, "0");
  const twoDigitYear =
    dt.year < 0
      ? `-${String(-dt.year).slice(-2).padStart(2, "0")}`
      : String(dt.year).slice(-2).padStart(2, "0");

  let out = "";
  for (let i = 0; i < fmt1.length; i++) {
    if (fmt1[i] !== "%") {
      out += fmt1[i];
      continue;
    }
    const d = fmt1[++i];
    switch (d) {
      case "Y":
        out += yearStr;
        break;
      case "y":
        out += twoDigitYear;
        break;
      case "m":
        out += p2(dt.month);
        break;
      case "d":
        out += p2(dt.day);
        break;
      case "H":
        out += p2(dt.hour);
        break;
      case "I": {
        const h12 = dt.hour % 12 === 0 ? 12 : dt.hour % 12;
        out += p2(h12);
        break;
      }
      case "p":
        out += dt.hour < 12 ? "AM" : "PM";
        break;
      case "M":
        out += p2(dt.minute);
        break;
      case "S":
        out += p2(dt.second);
        break;
      case "j":
        out += String(dt.dayofyr).padStart(3, "0");
        break;
      case "a":
        out += WEEKDAY_ABBR[dt.dayofwk];
        break;
      case "A":
        out += WEEKDAY_FULL[dt.dayofwk];
        break;
      case "b":
      case "h":
        out += MONTH_ABBR[dt.month - 1];
        break;
      case "B":
        out += MONTH_FULL[dt.month - 1];
        break;
      case "w":
        out += String((dt.dayofwk + 1) % 7); // 0 = Sunday
        break;
      case "%":
        out += "%";
        break;
      default:
        // Unsupported directive: emit verbatim (rare; keeps output predictable).
        out += "%" + (d ?? "");
    }
  }
  if (hasMicros) {
    out += `.${String(dt.microsecond).padStart(6, "0")}`;
  }
  return out;
}
