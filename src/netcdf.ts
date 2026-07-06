// netCDF-style index lookup, ported from _cftime.pyx:
//   date2index (:651), _check_index (:803), _date2index (:864), time2index (:911).
//
// In place of a netCDF Variable, `nctime` is a plain object with a `units`
// string, a monotonically increasing `values` array, and an optional `calendar`.

import type { InputCalendar } from "./types.js";
import { yearZeroDefaults } from "./calendars.js";
import type { CFDatetime } from "./datetime.js";
import { date2num } from "./convert.js";

export interface NcTime {
  units: string;
  /** Numeric time values, assumed stored in increasing order. */
  values: number[];
  calendar?: InputCalendar;
}

export type SelectMode = "exact" | "before" | "after" | "nearest";

export interface IndexOptions {
  calendar?: InputCalendar;
  select?: SelectMode;
  hasYearZero?: boolean | null;
}

function clip(i: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, i));
}

/** numpy round-half-to-even (np.around). */
function rint(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Leftmost insertion point (Python bisect.bisect_left). */
function bisectLeft(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Rightmost insertion point (Python bisect.bisect_right). */
function bisectRight(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x < arr[mid]!) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Mirrors _check_index (:803): are these indices valid for the given select mode? */
function checkIndex(
  index: number[],
  nums: number[],
  values: number[],
  select: SelectMode,
): boolean {
  const N = values.length;
  if (index.some((i) => i < 0)) return false;
  if (index.some((i) => i >= N)) return false;
  const t = index.map((i) => values[i]!);
  if (select === "exact") {
    return t.every((tv, k) => tv === nums[k]);
  }
  if (select === "before") {
    const ta = index.map((i) => values[clip(i + 1, 0, N - 1)]!);
    return t.every((tv, k) => tv <= nums[k]!) && ta.every((tav, k) => tav > nums[k]!);
  }
  if (select === "after") {
    const tb = index.map((i) => values[clip(i - 1, 0, N - 1)]!);
    return t.every((tv, k) => tv >= nums[k]!) && tb.every((tbv, k) => tbv < nums[k]!);
  }
  // nearest
  const ta = index.map((i) => values[clip(i + 1, 0, N - 1)]!);
  const tb = index.map((i) => values[clip(i - 1, 0, N - 1)]!);
  return t.every((tv, k) => {
    const deltaAfter = ta[k]! - tv;
    const deltaBefore = tv - tb[k]!;
    const deltaCheck = Math.abs(nums[k]! - tv);
    return deltaCheck <= deltaAfter && deltaCheck <= deltaBefore;
  });
}

function indexCore(nums: number[], values: number[], select: SelectMode): number[] {
  const N = values.length;
  const t0 = values[0]!;
  const dt = N >= 2 ? values[1]! - t0 : 1;

  // Infer index from start time and stride (assumes uniform spacing).
  let index: number[];
  if (select === "exact" || select === "before") {
    index = nums.map((n) => Math.trunc((n - t0) / dt));
  } else if (select === "after") {
    index = nums.map((n) => Math.ceil((n - t0) / dt));
  } else {
    index = nums.map((n) => rint((n - t0) / dt));
  }

  if (checkIndex(index, nums, values, select)) return index;

  // Fall back to bisection (nctime assumed ordered).
  const before = nums.map((n) => bisectRight(values, n) === 0);
  index = nums.map((n) => bisectLeft(values, n));
  const after = index.map((i) => i === N);

  if ((select === "before" || select === "exact") && before.some(Boolean)) {
    throw new Error("Some of the times given are before the first time in nctime.");
  }
  if ((select === "after" || select === "exact") && after.some(Boolean)) {
    throw new Error("Some of the times given are after the last time in nctime.");
  }

  index = index.map((i, k) => (after[k] ? N - 1 : i));
  const ncnum = index.map((i) => values[i]!);
  const mismatch: number[] = [];
  ncnum.forEach((v, k) => {
    if (v !== nums[k]) mismatch.push(k);
  });

  if (select === "exact") {
    if (mismatch.length > 0) {
      throw new Error("Some of the times specified were not found in the nctime variable.");
    }
  } else if (select === "before") {
    index = index.map((i, k) => (after[k] ? N : i));
    for (const m of mismatch) index[m] = index[m]! - 1;
  } else if (select === "after") {
    // no adjustment
  } else {
    // nearest
    for (const m of mismatch) {
      const i = index[m]!;
      const nearestToLeft = nums[m]! < (values[i - 1]! + values[i]!) / 2;
      index[m] = i - (nearestToLeft ? 1 : 0);
    }
  }

  index = index.map((i, k) => (before[k] ? 0 : i));
  return index;
}

/**
 * Return indices of a numeric time axis corresponding to the given times.
 * Mirrors time2index (:911). Accepts a scalar or array; returns the same shape.
 */
export function time2index(times: number, nctime: NcTime, select?: SelectMode): number;
export function time2index(times: number[], nctime: NcTime, select?: SelectMode): number[];
export function time2index(
  times: number | number[],
  nctime: NcTime,
  select: SelectMode = "exact",
): number | number[] {
  if (nctime.units === undefined) {
    throw new Error("netcdf time variable is missing a 'units' attribute");
  }
  const scalar = !Array.isArray(times);
  const nums = scalar ? [times] : times;

  if (select !== "exact") {
    // If an exact match exists for every time, before/after/nearest are exact±1.
    try {
      const exactIdx = indexCore(nums, nctime.values, "exact");
      let shifted: number[];
      if (select === "nearest") shifted = exactIdx;
      else if (select === "before") shifted = exactIdx.map((i) => i - 1);
      else shifted = exactIdx.map((i) => i + 1);
      return scalar ? shifted[0]! : shifted;
    } catch {
      // fall through to the general path
    }
  }

  const index = indexCore(nums, nctime.values, select);
  return scalar ? index[0]! : index;
}

/**
 * Return indices of a time axis corresponding to the given dates.
 * Mirrors date2index (:651). Resolves calendar/has_year_zero from the first date
 * when not given, converts to numeric values, then defers to time2index.
 */
export function date2index(dates: CFDatetime, nctime: NcTime, options?: IndexOptions): number;
export function date2index(dates: CFDatetime[], nctime: NcTime, options?: IndexOptions): number[];
export function date2index(
  dates: CFDatetime | CFDatetime[],
  nctime: NcTime,
  options: IndexOptions = {},
): number | number[] {
  if (nctime.units === undefined) {
    throw new Error("netcdf time variable is missing a 'units' attribute");
  }
  const select = options.select ?? "exact";
  let calendar = options.calendar ?? null;
  let hasYearZero = options.hasYearZero ?? null;
  const first = Array.isArray(dates) ? dates[0]! : dates;

  if (hasYearZero === null) {
    hasYearZero = calendar === null ? first.hasYearZero : yearZeroDefaults(calendar);
  }
  if (!calendar) calendar = first.calendar;

  if (Array.isArray(dates)) {
    const times = date2num(dates, nctime.units, { calendar, hasYearZero });
    return time2index(times, nctime, select);
  }
  const time = date2num(dates, nctime.units, { calendar, hasYearZero });
  return time2index(time, nctime, select);
}
