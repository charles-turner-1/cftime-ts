// A minimal analogue of Python's datetime.timedelta. JS has no standard
// duration type, and cftime's date arithmetic reads delta.days / delta.seconds /
// delta.microseconds with Python's normalization invariant:
//   0 <= microseconds < 1_000_000,  0 <= seconds < 86_400,  days is any integer.

import { floorDiv, mod } from "./calendars.js";

export interface TimedeltaParts {
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  microseconds?: number;
}

const US_PER_SECOND = 1000000;
const SECONDS_PER_DAY = 86400;

export class Timedelta {
  /** Normalized components matching Python's timedelta invariant. */
  readonly days: number;
  readonly seconds: number;
  readonly microseconds: number;

  constructor(parts: TimedeltaParts = {}) {
    const weeks = parts.weeks ?? 0;
    const daysIn = parts.days ?? 0;
    const hours = parts.hours ?? 0;
    const minutes = parts.minutes ?? 0;
    const secondsIn = parts.seconds ?? 0;
    const milliseconds = parts.milliseconds ?? 0;
    const microsecondsIn = parts.microseconds ?? 0;

    const allInt = [weeks, daysIn, hours, minutes, secondsIn, milliseconds, microsecondsIn].every(
      Number.isInteger,
    );

    let days: number;
    let seconds: number;
    let microseconds: number;

    if (allInt) {
      // Exact integer path — preserves precision for large day counts, mirroring
      // Python's arbitrary-precision integer normalization.
      days = daysIn + weeks * 7;
      seconds = secondsIn + minutes * 60 + hours * 3600;
      microseconds = microsecondsIn + milliseconds * 1000;
    } else {
      // Fractional inputs (e.g. days=-0.5 from a timezone offset): reduce to total
      // microseconds, round to the nearest microsecond, then normalize. Precision is
      // bounded by float64 (~microsecond accuracy beyond a few hundred years).
      const totalUs = Math.round(
        ((weeks * 7 + daysIn) * SECONDS_PER_DAY + hours * 3600 + minutes * 60 + secondsIn) *
          US_PER_SECOND +
          milliseconds * 1000 +
          microsecondsIn,
      );
      days = 0;
      seconds = 0;
      microseconds = totalUs;
    }

    // Normalize, propagating carries upward.
    seconds += floorDiv(microseconds, US_PER_SECOND);
    microseconds = mod(microseconds, US_PER_SECOND);
    days += floorDiv(seconds, SECONDS_PER_DAY);
    seconds = mod(seconds, SECONDS_PER_DAY);

    this.days = days;
    this.seconds = seconds;
    this.microseconds = microseconds;
  }

  /** Total duration in microseconds (may lose precision beyond ~2^53 us). */
  totalMicroseconds(): number {
    return (this.days * SECONDS_PER_DAY + this.seconds) * US_PER_SECOND + this.microseconds;
  }

  /** Total duration in seconds (float), like Python's total_seconds(). */
  totalSeconds(): number {
    return this.days * SECONDS_PER_DAY + this.seconds + this.microseconds / US_PER_SECOND;
  }

  static fromMicroseconds(us: number): Timedelta {
    return new Timedelta({ microseconds: us });
  }

  negate(): Timedelta {
    return new Timedelta({
      days: -this.days,
      seconds: -this.seconds,
      microseconds: -this.microseconds,
    });
  }

  equals(other: Timedelta): boolean {
    return (
      this.days === other.days &&
      this.seconds === other.seconds &&
      this.microseconds === other.microseconds
    );
  }

  toString(): string {
    // Mirror Python's repr-ish rendering loosely for debugging.
    return `Timedelta(days=${this.days}, seconds=${this.seconds}, microseconds=${this.microseconds})`;
  }
}
