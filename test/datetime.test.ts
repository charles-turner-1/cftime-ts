import { describe, it, expect } from "vitest";
// Import from the package barrel so convert.ts loads and registers fromordinal
// (needed by changeCalendar / cross-calendar comparison).
import { CFDatetime, Datetime360Day, DatetimeNoLeap, Timedelta } from "../src/index.js";
import { reference, isError } from "./fixtures.js";

describe("properties (dayofwk/dayofyr/daysinmonth) vs Python", () => {
  for (const c of reference.data.properties) {
    if (isError(c.props)) continue;
    it(`${c.calendar} ${c.year}-${c.month}-${c.day}`, () => {
      const dt = new CFDatetime(c.year, c.month, c.day, 0, 0, 0, 0, {
        calendar: c.calendar as never,
      });
      const p = c.props as { dayofwk: number; dayofyr: number; daysinmonth: number };
      expect(dt.dayofwk).toBe(p.dayofwk);
      expect(dt.dayofyr).toBe(p.dayofyr);
      expect(dt.daysinmonth).toBe(p.daysinmonth);
    });
  }
});

describe("isoformat / strftime / str vs Python", () => {
  for (const c of reference.data.formatting) {
    if (isError(c.out)) continue;
    const [y, mo, d, H, M, S, us, cal] = c.args;
    it(`${cal} ${y}-${mo}-${d}`, () => {
      const dt = new CFDatetime(y, mo, d, H, M, S, us, { calendar: cal as never });
      const o = c.out as Record<string, string>;
      expect(dt.isoformat()).toBe(o["isoformat_default"]);
      expect(dt.isoformat(" ")).toBe(o["isoformat_space"]);
      expect(dt.isoformat(" ", "seconds")).toBe(o["isoformat_seconds"]);
      expect(dt.isoformat(" ", "days")).toBe(o["isoformat_days"]);
      expect(dt.isoformat("T", "hours")).toBe(o["isoformat_hours"]);
      expect(dt.isoformat("T", "minutes")).toBe(o["isoformat_minutes"]);
      expect(dt.isoformat("T", "milliseconds")).toBe(o["isoformat_milliseconds"]);
      expect(dt.toString()).toBe(o["str"]);
      expect(dt.strftime()).toBe(o["strftime_default"]);
      expect(dt.strftime("%Y-%m-%d")).toBe(o["strftime_ymd"]);
    });
  }
});

describe("add timedelta vs Python", () => {
  for (const c of reference.data.add_timedelta) {
    if (isError(c.out)) continue;
    it(`${c.calendar} + ${JSON.stringify(c.delta)}`, () => {
      const [y, mo, d, H, M, S, us] = c.base;
      const dt = new CFDatetime(y!, mo!, d!, H!, M!, S!, us!, { calendar: c.calendar as never });
      const res = dt.add(new Timedelta(c.delta));
      const o = c.out as {
        y: number;
        mo: number;
        d: number;
        H: number;
        M: number;
        S: number;
        us: number;
      };
      expect([
        res.year,
        res.month,
        res.day,
        res.hour,
        res.minute,
        res.second,
        res.microsecond,
      ]).toEqual([o.y, o.mo, o.d, o.H, o.M, o.S, o.us]);
    });
  }
});

describe("datetime - datetime => microseconds vs Python", () => {
  for (const c of reference.data.sub_datetime) {
    if (isError(c.micros)) continue;
    it(`${c.calendar}`, () => {
      const a = new CFDatetime(2000, 1, 2, 0, 0, 0, 5, { calendar: c.calendar as never });
      const b = new CFDatetime(2000, 1, 2, 0, 0, 0, 0, { calendar: c.calendar as never });
      expect(a.sub(b).totalMicroseconds()).toBe(c.micros);
    });
  }
});

describe("repr", () => {
  it("matches Python repr for the base class", () => {
    const dt = new CFDatetime(2000, 1, 1, 0, 0, 0, 0, { calendar: "standard" });
    expect(dt.repr()).toBe(
      "cftime.datetime(2000, 1, 1, 0, 0, 0, 0, calendar='standard', has_year_zero=False)",
    );
  });
});

describe("construction validation", () => {
  it("rejects invalid month/day/hour", () => {
    expect(() => new CFDatetime(2000, 13, 1)).toThrow(/month/);
    expect(() => new CFDatetime(2000, 2, 30)).toThrow(/day/);
    expect(() => new CFDatetime(2000, 1, 1, 24)).toThrow(/hour/);
  });
  it("360_day rejects day 31, allows day 30", () => {
    expect(() => new Datetime360Day(2000, 1, 31)).toThrow(/day/);
    expect(new Datetime360Day(2000, 2, 30).day).toBe(30);
  });
  it("noleap rejects Feb 29", () => {
    expect(() => new DatetimeNoLeap(2000, 2, 29)).toThrow();
  });
  it("1582 gap rejected in standard, allowed in julian", () => {
    expect(() => new CFDatetime(1582, 10, 5, 0, 0, 0, 0, { calendar: "standard" })).toThrow();
    expect(new CFDatetime(1582, 10, 5, 0, 0, 0, 0, { calendar: "julian" }).day).toBe(5);
  });
  it("TAI rejects pre-1958", () => {
    expect(() => new CFDatetime(1957, 1, 1, 0, 0, 0, 0, { calendar: "tai" })).toThrow();
  });
});

describe("comparison across calendars", () => {
  it("julian and proleptic_gregorian compare equal at the same instant", () => {
    // 1858-11-17 proleptic_gregorian == 1858-11-05 julian (12-day offset)
    const g = new CFDatetime(1858, 11, 17, 0, 0, 0, 0, { calendar: "proleptic_gregorian" });
    const j = g.changeCalendar("julian");
    expect(g.equals(j)).toBe(true);
  });
  it("throws comparing idealized calendars", () => {
    const a = new CFDatetime(2000, 1, 1, 0, 0, 0, 0, { calendar: "noleap" });
    const b = new CFDatetime(2000, 1, 1, 0, 0, 0, 0, { calendar: "all_leap" });
    expect(() => a.compareTo(b)).toThrow();
  });
});
