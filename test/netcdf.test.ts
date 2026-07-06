import { describe, it, expect } from "vitest";
import { time2index, date2index, CFDatetime } from "../src/index.js";
import type { NcTime, SelectMode } from "../src/index.js";
import { reference, isError } from "./fixtures.js";

describe("time2index vs Python", () => {
  for (const c of reference.data.time2index) {
    it(`${c.axis} ${c.select} t=${c.time}`, () => {
      const nctime: NcTime = { units: c.units, values: c.values, calendar: c.calendar as never };
      if (isError(c.out)) {
        expect(() => time2index(c.time, nctime, c.select as SelectMode)).toThrow();
      } else {
        expect(time2index(c.time, nctime, c.select as SelectMode)).toBe(c.out);
      }
    });
  }
});

describe("date2index vs Python", () => {
  for (const c of reference.data.date2index) {
    it(`${c.axis} ${c.select} ${c.date.join("-")}`, () => {
      const nctime: NcTime = { units: c.units, values: c.values, calendar: c.calendar as never };
      const [y, m, d] = c.date;
      const dt = new CFDatetime(y, m, d, 0, 0, 0, 0, { calendar: c.calendar as never });
      if (isError(c.out)) {
        expect(() =>
          date2index(dt, nctime, { calendar: c.calendar as never, select: c.select as SelectMode }),
        ).toThrow();
      } else {
        expect(
          date2index(dt, nctime, { calendar: c.calendar as never, select: c.select as SelectMode }),
        ).toBe(c.out);
      }
    });
  }
});

describe("time2index array input", () => {
  it("returns an array of indices", () => {
    const nctime: NcTime = { units: "days since 2000-01-01", values: [0, 1, 2, 3, 4, 5] };
    expect(time2index([1, 3], nctime, "exact")).toEqual([1, 3]);
  });
});
