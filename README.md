# cftime-ts

> [!WARNING]
> This is a **work in progress**, and I've had Claude (Opus 4.8) scaffold it for me. Because of that, it might look good (IDK),
> but it is probably not complete and/or has not been drive-tested in any meaningful sense of the word. Claims about functionality
> in this README should be considered probable at best, and aspirational at worst.
> Use at your own caution (whilst this warning is still up. I'll get rid of it once I'm confident in the codebase).

A TypeScript implementation of CF-convention calendar datetimes — a faithful port of the
Python [`cftime`](https://github.com/Unidata/cftime) library. Zero runtime dependencies,
ESM, works in Node and the browser.

It provides the nine CF calendars — `standard`/`gregorian`, `proleptic_gregorian`, `julian`,
`tai`, `noleap`/`365_day`, `all_leap`/`366_day`, `360_day` — and the netCDF time-encoding
functions `num2date` / `date2num`, with the same calendar arithmetic, Julian-day handling,
1582 Gregorian-reform gap, and year-zero conventions as the Python original.

> Status: early development (0.1.0). API may change before 1.0.

## Install

```sh
npm install cftime-ts
```

## Usage

```ts
import { num2date, date2num, CFDatetime, Timedelta } from "cftime-ts";

// Decode numeric netCDF time values to dates
const d = num2date(0, "days since 2000-01-01", { calendar: "noleap" });
d.isoformat(" "); // "2000-01-01 00:00:00"

// Encode dates back to numbers
date2num(new CFDatetime(2000, 1, 2, 0, 0, 0, 0, { calendar: "noleap" }), "days since 2000-01-01");
// 1

// Calendar-aware arithmetic (JS has no operator overloading, so use methods)
const later = d.add(new Timedelta({ days: 400 }));
const gap = later.sub(d); // a Timedelta

// Comparison across calendars converts automatically
const g = new CFDatetime(1858, 11, 17, 0, 0, 0, 0, { calendar: "proleptic_gregorian" });
g.equals(g.changeCalendar("julian")); // true
```

Arrays are supported element-wise:

```ts
const dates = num2date([0, 1, 2], "days since 2000-01-01", { calendar: "standard" });
// CFDatetime[]  (NaN / Infinity decode to null)
```

## API

- `CFDatetime` (aliased `datetime`) — the calendar-aware datetime. Properties `year`…`microsecond`,
  `dayofwk` (0=Mon), `dayofyr`, `daysinmonth`; methods `isoformat`, `strftime`, `toordinal`,
  static `fromordinal`, `changeCalendar`, `replace`, `add`, `sub`, `equals`/`compareTo`/`isBefore`/`isAfter`,
  static `strptime`.
- Legacy subclasses `DatetimeNoLeap`, `DatetimeAllLeap`, `Datetime360Day`, `DatetimeJulian`,
  `DatetimeGregorian`, `DatetimeProlepticGregorian`, `DatetimeTAI`.
- `num2date`, `date2num`, `num2pydate` — netCDF ⇄ datetime conversion.
- `date2index`, `time2index` — locate indices in a monotonic time axis (`exact`/`before`/`after`/`nearest`).
- `isLeapYear`, `Timedelta`, `strptime`, `dateparse`, `parseDate`, `UNIT_CONVERSION_FACTORS`.

### Differences from Python cftime

- Numeric time values are JS `number` (float64), mirroring Python's "int when exact, float
  otherwise"; microsecond precision degrades beyond a few hundred years, as in Python without
  `longdouble`.
- Arithmetic and comparison are **methods** (`.add`, `.sub`, `.equals`, `.compareTo`) since JS
  has no operator overloading.
- Array inputs are plain JS arrays (per element); numpy masked/typed-array machinery is not
  reproduced. Non-finite values decode to `null`.

## Development

```sh
npm install
npm test            # vitest
npm run typecheck
npm run build       # tsc -> dist/
```

The test suite is differential: `scripts/gen_reference.py` generates
`test/fixtures/reference.json` from the real Python `cftime`, and the tests assert the port
reproduces those values exactly.

## License

MIT. Port of Python `cftime` (Copyright 2008 Jeffrey Whitaker). See [LICENSE](./LICENSE).
