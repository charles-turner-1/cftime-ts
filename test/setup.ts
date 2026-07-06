// Silence CF advisory warnings (year <= 0 dates, etc.) during tests — they are
// expected behavior, not failures.
import { setWarningHandler } from "../src/warnings.js";

setWarningHandler(() => {});
