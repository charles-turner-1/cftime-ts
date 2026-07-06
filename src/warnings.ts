// Lightweight analogue of Python's warnings for CF-convention advisories.
// cftime emits UserWarning/CFWarning for dates outside CF (e.g. year <= 0 in the
// mixed calendar). These are advisory only. They can be muted globally or for the
// duration of a callback (used by fromordinal, which deliberately builds pre-year-1
// reference dates).

let suppressDepth = 0;

/** Called for each warning. Override to capture warnings in tests. */
export let onWarning: (message: string, category: string) => void = (message, category) => {
  // eslint-disable-next-line no-console
  console.warn(`${category}: ${message}`);
};

export function setWarningHandler(handler: (message: string, category: string) => void): void {
  onWarning = handler;
}

export function cfwarn(message: string, category = "CFWarning"): void {
  if (suppressDepth > 0) return;
  onWarning(message, category);
}

/** Run `fn` with warnings suppressed (mirrors warnings.catch_warnings + simplefilter("ignore")). */
export function suppressWarnings<T>(fn: () => T): T {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}
