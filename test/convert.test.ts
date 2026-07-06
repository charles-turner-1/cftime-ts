import { describe, it, expect } from "vitest";
import { num2date, date2num } from "../src/convert.js";
import { CFDatetime } from "../src/datetime.js";
import { reference, isError } from "./fixtures.js";

describe("num2date + date2num roundtrip vs Python", () => {
  for (const c of reference.data.convert) {
    if (isError(c.out)) continue;
    it(`num2date(${c.value}, "${c.units}", ${c.calendar})`, () => {
      const dt = num2date(c.value, c.units, { calendar: c.calendar as never });
      const o = c.out as {
        iso: string;
        y: number;
        mo: number;
        d: number;
        H: number;
        M: number;
        S: number;
        us: number;
        date2num: number;
      };
      expect([dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.microsecond]).toEqual([
        o.y,
        o.mo,
        o.d,
        o.H,
        o.M,
        o.S,
        o.us,
      ]);
      expect(dt.isoformat(" ")).toBe(o.iso);
      expect(date2num(dt, c.units, { calendar: c.calendar as never })).toBe(o.date2num);
    });
  }
});

describe("date2num from explicit dates vs Python", () => {
  for (const c of reference.data.date2num) {
    if (isError(c.out)) continue;
    const [y, mo, d, H, M, S, us] = c.args;
    it(`date2num(${c.args}, "${c.units}", ${c.calendar})`, () => {
      const dt = new CFDatetime(y!, mo!, d!, H!, M!, S!, us!, { calendar: c.calendar as never });
      expect(date2num(dt, c.units, { calendar: c.calendar as never })).toBe(c.out);
    });
  }
});

describe("num2date array + non-finite handling", () => {
  it("maps arrays and returns null for NaN/Infinity", () => {
    const out = num2date([0, 1, NaN, Infinity], "days since 2000-01-01", { calendar: "standard" });
    expect(out[0]).toBeInstanceOf(CFDatetime);
    expect((out[0] as CFDatetime).isoformat(" ")).toBe("2000-01-01 00:00:00");
    expect((out[1] as CFDatetime).isoformat(" ")).toBe("2000-01-02 00:00:00");
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
  });
  it("empty array returns empty", () => {
    expect(date2num([], "days since 2000-01-01")).toEqual([]);
  });
});

describe("unit-string errors", () => {
  it("months only for 360_day", () => {
    expect(() => num2date(1, "months since 0001-01-01", { calendar: "standard" })).toThrow(
      /months since/,
    );
  });
  it("common_years only for noleap", () => {
    expect(() => num2date(1, "common_years since 0001-01-01", { calendar: "standard" })).toThrow(
      /common_years/,
    );
  });
  it("malformed unit strings", () => {
    expect(() => num2date(1, "days since2017-05-01", { calendar: "standard" })).toThrow();
    expect(() => num2date(1, "dayssince 2017-05-01", { calendar: "standard" })).toThrow();
  });
});
