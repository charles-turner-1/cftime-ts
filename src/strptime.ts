// strptime — parse a date string per a format, ported from _strptime.py and the
// datetime.strptime staticmethod (:1270). JS has no strptime, so this single
// directive-driven parser covers both cftime's fast path and its _strptime
// fallback, and additionally understands %z (timezone). Supported directives:
//   d f H I m M p S y Y B b z %

const MONTH_FULL = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_ABBR = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function seqToRE(values: string[], directive: string): string {
  const sorted = [...values].sort((a, b) => b.length - a.length);
  return `(?<${directive}>${sorted.map(escapeRe).join("|")})`;
}

function escapeRe(s: string): string {
  return s.replace(/[\\.^$*+?(){}[\]|]/g, "\\$&");
}

const DIRECTIVES: Record<string, string> = {
  d: "(?<d>3[0-1]|[1-2]\\d|0[1-9]|[1-9]| [1-9])",
  f: "(?<f>[0-9]{1,6})",
  H: "(?<H>2[0-3]|[0-1]\\d|\\d)",
  I: "(?<I>1[0-2]|0[1-9]|[1-9])",
  m: "(?<m>1[0-2]|0[1-9]|[1-9])",
  M: "(?<M>[0-5]\\d|\\d)",
  p: "(?<p>[AaPp][Mm])",
  S: "(?<S>6[0-1]|[0-5]\\d|\\d)",
  y: "(?<y>\\d\\d)",
  Y: "(?<Y>[+-]?\\d\\d\\d\\d)",
  z: "(?<z>Z|[+-]\\d{2}:?\\d{2}(?::?\\d{2}(?:\\.\\d{1,6})?)?)",
  B: seqToRE(MONTH_FULL, "B"),
  b: seqToRE(MONTH_ABBR, "b"),
  "%": "%",
};

const UNSUPPORTED = new Set(["a", "A", "w", "j", "u", "U", "V", "W", "G", "c", "x", "X", "Z"]);

export interface StrptimeResult {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
  /** UTC offset in minutes if %z was present, else null. */
  utcOffsetMinutes: number | null;
}

function buildPattern(format: string): string {
  let out = "";
  let i = 0;
  while (i < format.length) {
    const ch = format[i]!;
    if (ch === "%") {
      const directive = format[i + 1];
      if (directive === undefined) {
        throw new Error(`stray % in format '${format}'`);
      }
      if (UNSUPPORTED.has(directive)) {
        throw new Error(
          `'${directive}' directive not supported for dates not valid in the proleptic_gregorian calendar`,
        );
      }
      const re = DIRECTIVES[directive];
      if (re === undefined) {
        throw new Error(`'${directive}' is a bad directive in format '${format}'`);
      }
      out += re;
      i += 2;
    } else if (/\s/.test(ch)) {
      // Collapse any run of whitespace into \s+ (mirrors _strptime.pattern).
      out += "\\s+";
      while (i < format.length && /\s/.test(format[i]!)) i++;
    } else {
      out += escapeRe(ch);
      i += 1;
    }
  }
  return `^${out}`;
}

function parseTz(z: string): number {
  if (z === "Z") return 0;
  const sign = z[0] === "-" ? -1 : 1;
  const body = z.slice(1).replace(/:/g, "");
  const hours = parseInt(body.slice(0, 2), 10);
  const minutes = body.length >= 4 ? parseInt(body.slice(2, 4), 10) : 0;
  return sign * (hours * 60 + minutes);
}

/** Parse `dataString` according to `format`. Mirrors _strptime (:92) plus %z. */
export function strptime(dataString: string, format: string): StrptimeResult {
  const regex = new RegExp(buildPattern(format), "i");
  const m = regex.exec(dataString);
  if (!m) {
    throw new Error(`time data '${dataString}' does not match format '${format}'`);
  }
  if (m[0].length !== dataString.length) {
    throw new Error(`unconverted data remains: ${dataString.slice(m[0].length)}`);
  }
  const g = m.groups ?? {};

  let year: number | undefined;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let microsecond = 0;
  let utcOffsetMinutes: number | null = null;
  let pmPending = false;

  for (const [key, value] of Object.entries(g)) {
    if (value === undefined) continue;
    switch (key) {
      case "y": {
        const yy = parseInt(value, 10);
        year = yy <= 68 ? yy + 2000 : yy + 1900;
        break;
      }
      case "Y":
        year = parseInt(value, 10);
        break;
      case "m":
        month = parseInt(value, 10);
        break;
      case "B":
        month = MONTH_FULL.indexOf(value.toLowerCase()) + 1;
        break;
      case "b":
        month = MONTH_ABBR.indexOf(value.toLowerCase()) + 1;
        break;
      case "d":
        day = parseInt(value.trim(), 10);
        break;
      case "H":
        hour = parseInt(value, 10);
        break;
      case "I":
        hour = parseInt(value, 10) % 12;
        break;
      case "p":
        pmPending = value.toLowerCase() === "pm";
        break;
      case "M":
        minute = parseInt(value, 10);
        break;
      case "S":
        second = parseInt(value, 10);
        break;
      case "f":
        microsecond = parseInt(value + "0".repeat(6 - value.length), 10);
        break;
      case "z":
        utcOffsetMinutes = parseTz(value);
        break;
    }
  }

  if (pmPending) hour = (hour % 12) + 12;
  if (year === undefined) {
    throw new Error(`time data '${dataString}' does not provide a year for format '${format}'`);
  }

  return { year, month, day, hour, minute, second, microsecond, utcOffsetMinutes };
}
