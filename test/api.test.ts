import { describe, it, expect } from "vitest";
import * as cftime from "../src/index.js";
import {
  CFDatetime,
  datetime,
  num2date,
  date2num,
  num2pydate,
  Timedelta,
  isLeapYear,
  DatetimeNoLeap,
  Datetime360Day,
} from "../src/index.js";

describe("public API surface", () => {
  it("exports the documented names", () => {
    for (const name of [
      "CFDatetime",
      "datetime",
      "num2date",
      "date2num",
      "num2pydate",
      "date2index",
      "time2index",
      "isLeapYear",
      "isLeap",
      "Timedelta",
      "strptime",
      "dateparse",
      "UNIT_CONVERSION_FACTORS",
      "DatetimeNoLeap",
      "Datetime360Day",
      "DatetimeGregorian",
    ]) {
      expect(cftime).toHaveProperty(name);
    }
  });

  it("datetime is an alias of CFDatetime", () => {
    expect(datetime).toBe(CFDatetime);
  });
});

describe("end-to-end usage", () => {
  it("num2date/date2num roundtrip", () => {
    const d = num2date(0, "days since 2000-01-01", { calendar: "noleap" });
    expect(d).toBeInstanceOf(CFDatetime);
    expect(d.isoformat(" ")).toBe("2000-01-01 00:00:00");
    expect(
      date2num(
        new CFDatetime(2000, 1, 2, 0, 0, 0, 0, { calendar: "noleap" }),
        "days since 2000-01-01",
        { calendar: "noleap" },
      ),
    ).toBe(1);
  });

  it("date2num infers calendar from the date when not given", () => {
    const d = new Datetime360Day(2001, 12, 30);
    expect(date2num(d, "days since 0000-01-01")).toBe(720719);
    expect(d.dayofyr).toBe(360);
  });

  it("arithmetic via Timedelta", () => {
    const d = new CFDatetime(2000, 1, 1, 0, 0, 0, 0, { calendar: "standard" });
    const later = d.add(new Timedelta({ days: 1, hours: 1 }));
    expect(later.isoformat(" ")).toBe("2000-01-02 01:00:00");
    expect(later.sub(d).totalSeconds()).toBe(25 * 3600);
  });

  it("num2pydate returns a native Date for compatible calendars", () => {
    const jsDate = num2pydate(0, "days since 2000-01-01", "proleptic_gregorian");
    expect(jsDate).toBeInstanceOf(Date);
    expect(jsDate.toISOString()).toBe("2000-01-01T00:00:00.000Z");
  });

  it("num2pydate throws for incompatible calendars", () => {
    expect(() => num2pydate(0, "days since 2000-01-01", "noleap")).toThrow();
  });

  it("is_leap_year", () => {
    expect(isLeapYear(2000, "standard")).toBe(true);
    expect(isLeapYear(1900, "standard")).toBe(false);
    expect(isLeapYear(1, "366_day")).toBe(true);
    expect(isLeapYear(1, "365_day")).toBe(false);
  });

  it("noleap rejects a leap day", () => {
    expect(() => new DatetimeNoLeap(2000, 2, 29)).toThrow();
  });
});
