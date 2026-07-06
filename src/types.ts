// Calendar identifiers.
//
// `InputCalendar` is what users may pass (includes synonyms and the empty /
// not-calendar-aware form). `CanonicalCalendar` is the reduced set stored on a
// datetime after `checkCalendar` collapses synonyms
// (gregorian -> standard, noleap -> 365_day, all_leap -> 366_day).

export type CanonicalCalendar =
  "standard" | "proleptic_gregorian" | "tai" | "julian" | "365_day" | "366_day" | "360_day";

export type InputCalendar = CanonicalCalendar | "gregorian" | "noleap" | "all_leap" | "" | null;

/**
 * The calendar value actually stored on a CFDatetime. Unlike CanonicalCalendar,
 * the idealized calendars keep the `noleap`/`all_leap` spelling (matching the
 * Python cftime `datetime.calendar` attribute), and `""` marks a
 * not-calendar-aware instance.
 */
export type StoredCalendar =
  "standard" | "proleptic_gregorian" | "tai" | "julian" | "noleap" | "all_leap" | "360_day" | "";

/** Options accepted by the CFDatetime constructor and most top-level functions. */
export interface DatetimeOptions {
  calendar?: InputCalendar;
  /**
   * Whether astronomical year numbering (a year zero exists) is used. When
   * omitted, a calendar-specific default is applied (see yearZeroDefaults).
   */
  hasYearZero?: boolean | null;
}
