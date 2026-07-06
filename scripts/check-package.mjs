// Guards the published public API surface. Run in CD after `npm run build` so it
// validates the emitted dist/index.d.ts; falls back to src/index.ts when unbuilt.
import { existsSync, readFileSync } from "node:fs";

const builtEntrypoint = new URL("../dist/index.d.ts", import.meta.url);
const built = existsSync(builtEntrypoint);
const entrypoint = built
  ? readFileSync(builtEntrypoint, "utf8")
  : readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

// The public names that must remain exported from the package root.
const requiredExports = [
  "CFDatetime",
  "datetime",
  "num2date",
  "date2num",
  "num2pydate",
  "date2index",
  "time2index",
  "isLeapYear",
  "Timedelta",
  "strptime",
  "UNIT_CONVERSION_FACTORS",
  "DatetimeNoLeap",
  "Datetime360Day",
  "DatetimeGregorian",
  "DatetimeProlepticGregorian",
  "DatetimeTAI",
];

const missing = requiredExports.filter((name) => !new RegExp(`\\b${name}\\b`).test(entrypoint));
if (missing.length > 0) {
  throw new Error(`Root entrypoint is missing required export(s): ${missing.join(", ")}`);
}

// The library must stay dependency-free at the type level (no bare-import leaks
// of third-party packages into the public .d.ts).
if (built && /from "(?!\.)/.test(entrypoint)) {
  throw new Error("Built entrypoint must not import types from external packages.");
}

console.log(built ? "Built package surface check passed." : "Source package surface check passed.");
