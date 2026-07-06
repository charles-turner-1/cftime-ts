// Loads the reference fixture generated from the real Python cftime library
// (scripts/gen_reference.py). Shared across the differential test suites.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export interface Reference {
  cftime_version: string;
  data: {
    is_leap_year: { year: number; calendar: string; leap: boolean | ErrorMarker }[];
    toordinal: {
      year: number;
      month: number;
      day: number;
      calendar: string;
      toordinal: number | ErrorMarker;
      toordinal_fractional: number | ErrorMarker;
    }[];
    properties: {
      year: number;
      month: number;
      day: number;
      calendar: string;
      props: { dayofwk: number; dayofyr: number; daysinmonth: number } | ErrorMarker;
    }[];
    formatting: {
      args: [number, number, number, number, number, number, number, string];
      out: Record<string, string> | ErrorMarker;
    }[];
    convert: {
      units: string;
      calendar: string;
      value: number;
      out:
        | {
            iso: string;
            y: number;
            mo: number;
            d: number;
            H: number;
            M: number;
            S: number;
            us: number;
            date2num: number;
          }
        | ErrorMarker;
    }[];
    date2num: { args: number[]; units: string; calendar: string; out: number | ErrorMarker }[];
    add_timedelta: {
      calendar: string;
      base: number[];
      delta: Record<string, number>;
      out:
        | { y: number; mo: number; d: number; H: number; M: number; S: number; us: number }
        | ErrorMarker;
    }[];
    sub_datetime: { calendar: string; micros: number | ErrorMarker }[];
    gap: {
      year: number;
      month: number;
      day: number;
      calendar: string;
      out: number | ErrorMarker;
    }[];
    time2index: {
      axis: string;
      values: number[];
      units: string;
      calendar: string;
      select: string;
      time: number;
      out: number | ErrorMarker;
    }[];
    date2index: {
      axis: string;
      values: number[];
      units: string;
      calendar: string;
      select: string;
      date: [number, number, number];
      out: number | ErrorMarker;
    }[];
  };
}

export interface ErrorMarker {
  __error__: string;
}

export function isError(x: unknown): x is ErrorMarker {
  return typeof x === "object" && x !== null && "__error__" in x;
}

export const reference: Reference = JSON.parse(
  readFileSync(join(here, "fixtures", "reference.json"), "utf-8"),
);
