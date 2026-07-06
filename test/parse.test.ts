import { describe, it, expect } from "vitest";
import { parseDate, parseTimezone, datesplit, CFDatetime, num2date } from "../src/index.js";

describe("parseDate (ISO 8601)", () => {
  it("parses full date-times and timezones", () => {
    expect(parseDate("2000-01-01")).toEqual([2000, 1, 1, 0, 0, 0, 0, 0]);
    expect(parseDate("2018-01-23 09:31:42.94")).toEqual([2018, 1, 23, 9, 31, 42, 940000, 0]);
    expect(parseDate("2000-01-01 00:00:00 -06:00")).toEqual([2000, 1, 1, 0, 0, 0, 0, -360]);
    // The "-12" noon trick used by fromordinal parses as a -720 minute offset.
    expect(parseDate("-4713-1-1-12")).toEqual([-4713, 1, 1, 0, 0, 0, 0, -720]);
    expect(parseDate("2000-1-1T00:00:00Z")).toEqual([2000, 1, 1, 0, 0, 0, 0, 0]);
  });
});

describe("parseTimezone", () => {
  it("handles the accepted offset formats", () => {
    expect(parseTimezone("Z")).toBe(0);
    expect(parseTimezone("+04:00")).toBe(240);
    expect(parseTimezone("-0700")).toBe(-420);
    expect(parseTimezone("+04")).toBe(240);
  });
});

describe("equivalent timezone offsets normalize to the same instant (issue 685)", () => {
  it("all encode to the same value", () => {
    const results = [
      "hours since 2000-01-01 22:30+04:00",
      "hours since 2000-01-01 11:30-07:00",
      "hours since 2000-01-01 15:00-03:30",
      "hours since 2000-01-01 18:30Z",
    ].map((u) => num2date(0, u, { calendar: "standard" }).isoformat(" "));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("2000-01-01 18:30:00");
  });
});

describe("datesplit", () => {
  it("splits units and reference, requiring 'since'", () => {
    expect(datesplit("days since 2000-01-01")).toEqual(["days", "2000-01-01"]);
    expect(() => datesplit("days snce 2000-01-01")).toThrow(/since/);
    expect(() => datesplit("days_since_2000-01-01")).toThrow();
  });
});

describe("strptime", () => {
  it("parses with %z and normalizes to UTC (julian)", () => {
    const dt = CFDatetime.strptime(
      "24/Aug/2004:17:57:26 +0200",
      "%d/%b/%Y:%H:%M:%S %z",
      "julian",
      true,
    );
    expect([dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second]).toEqual([
      2004, 8, 24, 15, 57, 26,
    ]);
    expect(dt.calendar).toBe("julian");
  });
  it("parses non-separated dates in 360_day", () => {
    const dt = CFDatetime.strptime("20200230", "%Y%m%d", "360_day");
    expect([dt.year, dt.month, dt.day]).toEqual([2020, 2, 30]);
  });
  it("parses negative years", () => {
    const dt = CFDatetime.strptime("-4712", "%Y", "julian", true);
    expect([dt.year, dt.month, dt.day]).toEqual([-4712, 1, 1]);
  });
});
