import { describe, it, expect } from "vitest";
import {
  floorDiv,
  mod,
  isLeap,
  isLeapYear,
  checkCalendar,
  yearZeroDefaults,
} from "../src/calendars.js";
import { intJulianDayFromDate } from "../src/julianday.js";
import { Timedelta } from "../src/timedelta.js";
import { reference, isError } from "./fixtures.js";

describe("floorDiv / mod (Python floor semantics)", () => {
  it("floors toward negative infinity", () => {
    expect(floorDiv(7, 3)).toBe(2);
    expect(floorDiv(-7, 3)).toBe(-3);
    expect(floorDiv(-1, 4)).toBe(-1);
    expect(floorDiv(-4713, 4)).toBe(-1179);
  });
  it("mod is always non-negative for positive divisor", () => {
    expect(mod(-1, 4)).toBe(3);
    expect(mod(7, 3)).toBe(1);
    expect(mod(-7, 60)).toBe(53);
  });
});

describe("checkCalendar / yearZeroDefaults", () => {
  it("canonicalizes synonyms", () => {
    expect(checkCalendar("gregorian")).toBe("standard");
    expect(checkCalendar("noleap")).toBe("365_day");
    expect(checkCalendar("all_leap")).toBe("366_day");
    expect(checkCalendar("STANDARD")).toBe("standard");
  });
  it("rejects unsupported calendars", () => {
    expect(() => checkCalendar("bogus" as never)).toThrow(/unsupported calendar/);
  });
  it("year-zero defaults per CF 1.9", () => {
    expect(yearZeroDefaults("standard")).toBe(false);
    expect(yearZeroDefaults("julian")).toBe(false);
    expect(yearZeroDefaults("proleptic_gregorian")).toBe(true);
    expect(yearZeroDefaults("360_day")).toBe(true);
    expect(yearZeroDefaults("noleap")).toBe(true);
  });
});

describe("isLeap vs Python cftime reference", () => {
  for (const c of reference.data.is_leap_year) {
    it(`is_leap_year(${c.year}, ${c.calendar})`, () => {
      if (isError(c.leap)) {
        expect(() => isLeapYear(c.year, c.calendar as never)).toThrow();
      } else {
        expect(isLeap(c.year, c.calendar as never)).toBe(c.leap);
      }
    });
  }
});

describe("intJulianDayFromDate vs Python toordinal reference", () => {
  // The Python fixture uses the datetime *class*, which (a) auto-enables year zero
  // when year==0 and (b) validates dates (e.g. rejects Dec 31 in 360_day) before
  // computing the ordinal. This exercises the raw JD math for valid dates only;
  // year-zero and invalid-date handling are covered in the CFDatetime tests.
  for (const c of reference.data.toordinal) {
    if (isError(c.toordinal)) continue; // class-level validation, not JD math
    it(`toordinal(${c.year}-${c.month}-${c.day}, ${c.calendar})`, () => {
      // Mirror the class's has_year_zero resolution so year 0 matches.
      const hyz = c.year === 0 ? true : null;
      expect(intJulianDayFromDate(c.year, c.month, c.day, c.calendar, false, hyz)).toBe(
        c.toordinal,
      );
    });
  }
});

describe("1582 mixed-calendar gap", () => {
  for (const c of reference.data.gap) {
    it(`${c.year}-${c.month}-${c.day} ${c.calendar}`, () => {
      if (isError(c.out)) {
        expect(() => intJulianDayFromDate(c.year, c.month, c.day, c.calendar)).toThrow();
      } else {
        expect(intJulianDayFromDate(c.year, c.month, c.day, c.calendar)).toBe(c.out);
      }
    });
  }
});

describe("Timedelta normalization (matches Python timedelta invariant)", () => {
  it("normalizes carries", () => {
    const td = new Timedelta({ hours: 25 });
    expect(td.days).toBe(1);
    expect(td.seconds).toBe(3600);
    expect(td.microseconds).toBe(0);
  });
  it("handles negative durations like Python (days negative, sub-day non-negative)", () => {
    const td = new Timedelta({ seconds: -1 });
    expect(td.days).toBe(-1);
    expect(td.seconds).toBe(86399);
    expect(td.microseconds).toBe(0);
  });
  it("microsecond total", () => {
    expect(new Timedelta({ days: 1, seconds: 1, microseconds: 5 }).totalMicroseconds()).toBe(
      86400 * 1000000 + 1000000 + 5,
    );
  });
});
